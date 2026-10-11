// Click SHOP API (Prepare / Complete callbacks).
// Signature and error codes follow Click's official integration library
// (github.com/click-llc/click-integration-php) and docs.click.uz:
//   sign_string = md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id
//                     + [merchant_prepare_id, complete only] + amount + action + sign_time)
// merchant_trans_id is our payment id; merchant_prepare_id is payments.seq.
// Must be verified end-to-end in Click's test environment before going live.
import { createHash, timingSafeEqual } from "node:crypto";
import { tx } from "../db";
import { claimEvent, decimalToTiyin, eventKey, lockPayment, markPaymentFailed, markPaymentPaid, saveEventResponse } from "./core";

export type ClickParams = Record<string, string>;

export const CLICK_ERRORS = {
  SUCCESS: [0, "Success"],
  SIGN_FAILED: [-1, "SIGN CHECK FAILED!"],
  BAD_AMOUNT: [-2, "Incorrect parameter amount"],
  ACTION_NOT_FOUND: [-3, "Action not found"],
  ALREADY_PAID: [-4, "Already paid"],
  ORDER_NOT_FOUND: [-5, "User does not exist"],
  TXN_NOT_FOUND: [-6, "Transaction does not exist"],
  BAD_REQUEST: [-8, "Error in request from click"],
  CANCELLED: [-9, "Transaction cancelled"],
} as const;

const REQUIRED = ["click_trans_id", "service_id", "click_paydoc_id", "merchant_trans_id", "amount", "action", "error", "error_note", "sign_time", "sign_string"];

export function clickSign(p: ClickParams, secret: string): string {
  const prepareId = p.action === "1" ? (p.merchant_prepare_id ?? "") : "";
  return createHash("md5")
    .update(`${p.click_trans_id}${p.service_id}${secret}${p.merchant_trans_id}${prepareId}${p.amount}${p.action}${p.sign_time}`)
    .digest("hex");
}

function safeEq(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function handleClick(stage: "prepare" | "complete", p: ClickParams): Promise<Record<string, unknown>> {
  const secret = process.env.CLICK_SECRET_KEY;
  const reply = (e: readonly [number, string], extra: Record<string, unknown> = {}) => ({
    click_trans_id: p.click_trans_id,
    merchant_trans_id: p.merchant_trans_id,
    ...extra,
    error: e[0],
    error_note: e[1],
  });
  if (!secret) return reply(CLICK_ERRORS.BAD_REQUEST);
  if (REQUIRED.some((k) => p[k] === undefined) || (stage === "complete" && !p.merchant_prepare_id)) {
    return reply(CLICK_ERRORS.BAD_REQUEST);
  }
  if (!safeEq(clickSign(p, secret), String(p.sign_string).toLowerCase())) return reply(CLICK_ERRORS.SIGN_FAILED);
  if (p.service_id !== process.env.CLICK_SERVICE_ID) return reply(CLICK_ERRORS.BAD_REQUEST);
  const expectedAction = stage === "prepare" ? "0" : "1";
  if (p.action !== expectedAction) return reply(CLICK_ERRORS.ACTION_NOT_FOUND);

  return tx(async (d) => {
    const ev = await claimEvent(d, "click", `${stage}:${p.click_trans_id}:${eventKey([p])}`, p);
    if (ev?.response) return ev.response as Record<string, unknown>;

    const finish = async (r: Record<string, unknown>, paymentId: string | null) => {
      if (ev) await saveEventResponse(d, ev.id, paymentId, r);
      return r;
    };

    const pay = await lockPayment(d, p.merchant_trans_id);
    if (!pay || pay.provider !== "click") return finish(reply(CLICK_ERRORS.ORDER_NOT_FOUND), null);
    if (stage === "complete" && String(pay.seq) !== String(p.merchant_prepare_id)) {
      return finish(reply(CLICK_ERRORS.TXN_NOT_FOUND), pay.id);
    }
    const ids = { merchant_prepare_id: pay.seq, merchant_confirm_id: pay.seq };
    if (pay.status === "paid") return finish(reply(CLICK_ERRORS.ALREADY_PAID, ids), pay.id);
    if (decimalToTiyin(p.amount) !== pay.amount * 100) return finish(reply(CLICK_ERRORS.BAD_AMOUNT, ids), pay.id);
    const order = await d.one<{ status: string }>("select status from public.orders where id = $1", [pay.order_id]);
    if (pay.status === "cancelled" || pay.status === "failed" || order?.status === "cancelled") {
      return finish(reply(CLICK_ERRORS.CANCELLED, ids), pay.id);
    }

    if (stage === "prepare") {
      await d.query("update public.payments set status = 'pending', provider_txn_id = $2, provider_state = $3 where id = $1", [
        pay.id,
        p.click_trans_id,
        JSON.stringify({ click_paydoc_id: p.click_paydoc_id, prepared_at: new Date().toISOString() }),
      ]);
      return finish(reply(CLICK_ERRORS.SUCCESS, { merchant_prepare_id: pay.seq }), pay.id);
    }

    // complete: Click reports its own failure via a negative `error`
    if (Number(p.error) < 0) {
      await markPaymentFailed(d, pay, "cancelled");
      return finish(reply(CLICK_ERRORS.CANCELLED, ids), pay.id);
    }
    if (pay.provider_txn_id && pay.provider_txn_id !== p.click_trans_id) {
      return finish(reply(CLICK_ERRORS.TXN_NOT_FOUND, ids), pay.id);
    }
    await markPaymentPaid(d, pay, p.click_trans_id);
    return finish(reply(CLICK_ERRORS.SUCCESS, { merchant_confirm_id: pay.seq }), pay.id);
  });
}
