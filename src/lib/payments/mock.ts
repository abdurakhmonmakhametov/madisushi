// LOCAL MOCK PAYMENT PROVIDER — development only, refused in production.
// It imitates a real provider: the "provider" signs a callback with a shared
// secret and the callback handler verifies it before touching the order,
// exactly like the Click/Payme flows.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { tx } from "../db";
import { devToolsAllowed, sessionSecret } from "../env";
import { claimEvent, eventKey, lockPayment, markPaymentFailed, markPaymentPaid, saveEventResponse } from "./core";

export interface MockCallback {
  eventId: string;
  paymentId: string;
  amount: number;
  outcome: "paid" | "failed";
}

function key(): Buffer {
  return createHmac("sha256", sessionSecret()).update("mock-payment-provider").digest();
}

export function signMock(cb: MockCallback): string {
  return createHmac("sha256", key()).update(`${cb.eventId}|${cb.paymentId}|${cb.amount}|${cb.outcome}`).digest("hex");
}

export function buildMockCallback(paymentId: string, amount: number, outcome: MockCallback["outcome"]) {
  const cb: MockCallback = { eventId: randomUUID(), paymentId, amount, outcome };
  return { ...cb, signature: signMock(cb) };
}

export async function handleMockCallback(body: MockCallback & { signature: string }): Promise<{ ok: boolean; code: string }> {
  if (!devToolsAllowed()) return { ok: false, code: "disabled" };
  const expected = Buffer.from(signMock(body));
  const got = Buffer.from(String(body.signature ?? ""));
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return { ok: false, code: "bad_signature" };
  return tx(async (d) => {
    const ev = await claimEvent(d, "mock", `${body.eventId}:${eventKey([body])}`, body);
    if (ev?.response) return ev.response as { ok: boolean; code: string };
    const done = async (r: { ok: boolean; code: string }, pid: string | null) => {
      if (ev) await saveEventResponse(d, ev.id, pid, r);
      return r;
    };
    const p = await lockPayment(d, body.paymentId);
    if (!p || p.provider !== "mock") return done({ ok: false, code: "not_found" }, null);
    if (p.amount !== body.amount) return done({ ok: false, code: "bad_amount" }, p.id);
    if (p.status === "paid") return done({ ok: true, code: "already_paid" }, p.id);
    if (body.outcome === "failed") {
      await markPaymentFailed(d, p);
      return done({ ok: true, code: "failed" }, p.id);
    }
    await markPaymentPaid(d, p, `mock-${body.eventId}`);
    return done({ ok: true, code: "paid" }, p.id);
  });
}
