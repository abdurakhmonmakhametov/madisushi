// Payme (Paycom) Merchant API — JSON-RPC endpoint called by Payme.
// Based on developer.help.paycom.uz: Basic authorization with the cashbox
// key, amounts in tiyin, account field `order_id` (= our payment id),
// transaction states 1 / 2 / -1 / -2 and the 12 hour (43 200 000 ms) timeout.
// Must be verified with Payme's sandbox before going live.
import { timingSafeEqual } from "node:crypto";
import { tx, type Db } from "../db";
import { lockPayment, markPaymentFailed, markPaymentPaid, type PaymentRow } from "./core";

export const PAYME_TIMEOUT_MS = 43_200_000;

type Msg = { ru: string; uz: string; en: string };
const msg = (en: string, ru: string, uz: string): Msg => ({ en, ru, uz });

export class PaymeError extends Error {
  constructor(
    public code: number,
    public msgs: Msg,
    public data?: string,
  ) {
    super(msgs.en);
  }
}

const E = {
  auth: () => new PaymeError(-32504, msg("Insufficient privileges", "Недостаточно привилегий", "Ruxsat yetarli emas")),
  method: () => new PaymeError(-32601, msg("Method not found", "Метод не найден", "Metod topilmadi")),
  parse: () => new PaymeError(-32700, msg("Parse error", "Ошибка разбора JSON", "JSON xatosi")),
  request: () => new PaymeError(-32600, msg("Invalid request", "Неверный запрос", "Noto'g'ri so'rov")),
  amount: () => new PaymeError(-31001, msg("Invalid amount", "Неверная сумма", "Noto'g'ri summa")),
  txnNotFound: () => new PaymeError(-31003, msg("Transaction not found", "Транзакция не найдена", "Tranzaksiya topilmadi")),
  cannotCancel: () => new PaymeError(-31007, msg("Order completed, cannot cancel", "Заказ выполнен. Невозможно отменить", "Buyurtma bajarilgan, bekor qilib bo'lmaydi")),
  cannotPerform: () => new PaymeError(-31008, msg("Cannot perform operation", "Невозможно выполнить операцию", "Amalni bajarib bo'lmaydi")),
  orderNotFound: () => new PaymeError(-31050, msg("Order not found", "Заказ не найден", "Buyurtma topilmadi"), "order_id"),
  orderUnavailable: () => new PaymeError(-31051, msg("Order is not payable", "Заказ недоступен для оплаты", "Buyurtmani to'lab bo'lmaydi"), "order_id"),
  orderBusy: () => new PaymeError(-31099, msg("Another transaction is in progress for this order", "По заказу уже есть ожидающая транзакция", "Buyurtma bo'yicha boshqa tranzaksiya kutilmoqda"), "order_id"),
};

interface PaymeState {
  state?: number;
  create_time?: number;
  perform_time?: number;
  cancel_time?: number;
  reason?: number | null;
  payme_time?: number;
}

export function checkPaymeAuth(header: string | null): boolean {
  const key = process.env.PAYME_KEY;
  if (!key || !header?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString();
  const idx = decoded.indexOf(":");
  if (idx < 0) return false;
  const a = Buffer.from(decoded.slice(idx + 1));
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function findByTxn(d: Db, id: string): Promise<PaymentRow | null> {
  return d.one<PaymentRow>("select * from public.payments where provider = 'payme' and provider_txn_id = $1 for update", [String(id)]);
}

function st(p: PaymentRow): PaymeState {
  return (p.provider_state ?? {}) as PaymeState;
}

async function saveState(d: Db, p: PaymentRow, s: PaymeState) {
  await d.query("update public.payments set provider_state = $2 where id = $1", [p.id, JSON.stringify(s)]);
}

async function checkOrderPayable(d: Db, account: Record<string, unknown> | undefined, amount: unknown): Promise<PaymentRow> {
  const id = String(account?.order_id ?? "");
  const p = await lockPayment(d, id);
  if (!p || p.provider !== "payme") throw E.orderNotFound();
  if (!Number.isInteger(amount) || amount !== p.amount * 100) throw E.amount();
  const order = await d.one<{ status: string; payment_status: string }>("select status, payment_status from public.orders where id = $1", [p.order_id]);
  if (!order || order.status === "cancelled" || order.payment_status === "paid" || p.status === "paid" || p.status === "cancelled" || p.status === "failed") {
    throw E.orderUnavailable();
  }
  return p;
}

async function cancelTimedOut(d: Db, p: PaymentRow, s: PaymeState, now: number) {
  const next = { ...s, state: -1, cancel_time: now, reason: 4 };
  await saveState(d, p, next);
  await markPaymentFailed(d, p, "cancelled");
}

export async function paymeDispatch(method: string, params: Record<string, unknown>, now = Date.now()): Promise<unknown> {
  return tx(async (d) => {
    switch (method) {
      case "CheckPerformTransaction": {
        await checkOrderPayable(d, params.account as Record<string, unknown>, params.amount);
        return { allow: true };
      }
      case "CreateTransaction": {
        const existing = await findByTxn(d, String(params.id));
        if (existing) {
          const s = st(existing);
          if (s.state !== 1) throw E.cannotPerform();
          if (now - (s.create_time ?? now) > PAYME_TIMEOUT_MS) {
            await cancelTimedOut(d, existing, s, now);
            throw E.cannotPerform();
          }
          return { create_time: s.create_time, transaction: String(existing.seq), state: 1 };
        }
        const p = await checkOrderPayable(d, params.account as Record<string, unknown>, params.amount);
        if (p.provider_txn_id && st(p).state === 1) throw E.orderBusy();
        const s: PaymeState = { state: 1, create_time: now, perform_time: 0, cancel_time: 0, reason: null, payme_time: Number(params.time) || now };
        await d.query("update public.payments set provider_txn_id = $2, status = 'pending', provider_state = $3 where id = $1", [
          p.id,
          String(params.id),
          JSON.stringify(s),
        ]);
        return { create_time: now, transaction: String(p.seq), state: 1 };
      }
      case "PerformTransaction": {
        const p = await findByTxn(d, String(params.id));
        if (!p) throw E.txnNotFound();
        const s = st(p);
        if (s.state === 2) return { transaction: String(p.seq), perform_time: s.perform_time, state: 2 };
        if (s.state !== 1) throw E.cannotPerform();
        if (now - (s.create_time ?? now) > PAYME_TIMEOUT_MS) {
          await cancelTimedOut(d, p, s, now);
          throw E.cannotPerform();
        }
        await markPaymentPaid(d, p, String(params.id));
        await saveState(d, p, { ...s, state: 2, perform_time: now });
        return { transaction: String(p.seq), perform_time: now, state: 2 };
      }
      case "CancelTransaction": {
        const p = await findByTxn(d, String(params.id));
        if (!p) throw E.txnNotFound();
        const s = st(p);
        const reason = Number(params.reason) || null;
        if (s.state === -1 || s.state === -2) return { transaction: String(p.seq), cancel_time: s.cancel_time, state: s.state };
        if (s.state === 1) {
          await saveState(d, p, { ...s, state: -1, cancel_time: now, reason });
          await markPaymentFailed(d, p, "cancelled");
          return { transaction: String(p.seq), cancel_time: now, state: -1 };
        }
        if (s.state === 2) {
          const order = await d.one<{ status: string }>("select status from public.orders where id = $1 for update", [p.order_id]);
          if (order && ["delivered", "picked_up"].includes(order.status)) throw E.cannotCancel();
          await saveState(d, p, { ...s, state: -2, cancel_time: now, reason });
          await d.query("update public.payments set status = 'refunded', cancelled_at = now() where id = $1", [p.id]);
          await d.query("update public.orders set payment_status = 'refunded' where id = $1", [p.order_id]);
          return { transaction: String(p.seq), cancel_time: now, state: -2 };
        }
        throw E.cannotPerform();
      }
      case "CheckTransaction": {
        const p = await findByTxn(d, String(params.id));
        if (!p) throw E.txnNotFound();
        const s = st(p);
        return {
          create_time: s.create_time ?? 0,
          perform_time: s.perform_time ?? 0,
          cancel_time: s.cancel_time ?? 0,
          transaction: String(p.seq),
          state: s.state,
          reason: s.reason ?? null,
        };
      }
      case "GetStatement": {
        const from = Number(params.from);
        const to = Number(params.to);
        if (!Number.isFinite(from) || !Number.isFinite(to)) throw E.request();
        const rows = await d.query<PaymentRow>(
          `select * from public.payments where provider = 'payme' and provider_txn_id is not null
             and (provider_state ->> 'create_time')::bigint between $1 and $2 order by seq`,
          [from, to],
        );
        return {
          transactions: rows.map((p) => {
            const s = st(p);
            return {
              id: p.provider_txn_id,
              time: s.payme_time ?? s.create_time,
              amount: p.amount * 100,
              account: { order_id: p.id },
              create_time: s.create_time ?? 0,
              perform_time: s.perform_time ?? 0,
              cancel_time: s.cancel_time ?? 0,
              transaction: String(p.seq),
              state: s.state,
              reason: s.reason ?? null,
            };
          }),
        };
      }
      default:
        throw E.method();
    }
  });
}

export async function handlePayme(authHeader: string | null, rawBody: string): Promise<Record<string, unknown>> {
  let body: { id?: unknown; method?: unknown; params?: unknown };
  try {
    body = JSON.parse(rawBody);
  } catch {
    const e = E.parse();
    return { error: { code: e.code, message: e.msgs }, id: null };
  }
  const id = body?.id ?? null;
  try {
    if (!checkPaymeAuth(authHeader)) throw E.auth();
    if (typeof body.method !== "string" || typeof body.params !== "object" || body.params === null) throw E.request();
    const result = await paymeDispatch(body.method, body.params as Record<string, unknown>);
    return { result, id };
  } catch (e) {
    if (e instanceof PaymeError) return { error: { code: e.code, message: e.msgs, data: e.data }, id };
    console.error("[payme] internal error", e);
    return { error: { code: -32400, message: msg("System error", "Системная ошибка", "Tizim xatosi") }, id };
  }
}
