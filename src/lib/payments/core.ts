// Payment state shared by all providers. An order becomes paid only from a
// verified provider callback processed here, never from a browser redirect.
import { createHash } from "node:crypto";
import { type Db } from "../db";
import { devToolsAllowed, siteUrl } from "../env";

export type PaymentMethod = "cash" | "card_on_delivery" | "click" | "payme" | "mock";
export const ONLINE_METHODS: PaymentMethod[] = ["click", "payme", "mock"];
const ALL: PaymentMethod[] = ["cash", "card_on_delivery", "click", "payme", "mock"];

export function isOnline(m: PaymentMethod): boolean {
  return ONLINE_METHODS.includes(m);
}

export function clickConfigured(): boolean {
  return Boolean(process.env.CLICK_SERVICE_ID && process.env.CLICK_MERCHANT_ID && process.env.CLICK_SECRET_KEY);
}

export function paymeConfigured(): boolean {
  return Boolean(process.env.PAYME_MERCHANT_ID && process.env.PAYME_KEY);
}

export function methodStatus(): { method: PaymentMethod; listed: boolean; ready: boolean; note: string }[] {
  const listed = new Set((process.env.PAYMENT_METHODS || "cash,card_on_delivery,mock").split(",").map((s) => s.trim()));
  return ALL.map((method) => {
    const isListed = listed.has(method);
    if (method === "click") {
      return { method, listed: isListed, ready: isListed && clickConfigured(), note: clickConfigured() ? "Credentials set; verify in Click sandbox" : "Needs CLICK_* credentials" };
    }
    if (method === "payme") {
      return { method, listed: isListed, ready: isListed && paymeConfigured(), note: paymeConfigured() ? "Credentials set; verify in Payme sandbox" : "Needs PAYME_* credentials" };
    }
    if (method === "mock") {
      return { method, listed: isListed, ready: isListed && devToolsAllowed(), note: devToolsAllowed() ? "Local simulator (development only)" : "Disabled in production" };
    }
    return { method, listed: isListed, ready: isListed, note: "Collected by courier / at pickup" };
  });
}

export function enabledMethods(): PaymentMethod[] {
  return methodStatus().filter((m) => m.ready).map((m) => m.method);
}

export interface PaymentRow {
  id: string;
  seq: number;
  order_id: string;
  provider: PaymentMethod;
  amount: number;
  status: "created" | "pending" | "paid" | "failed" | "cancelled" | "refunded";
  provider_txn_id: string | null;
  provider_state: Record<string, unknown>;
}

/** Creates a payment attempt for an online order and returns where to send the customer. */
export async function startPayment(d: Db, order: { id: string; total: number }, method: PaymentMethod): Promise<{ paymentId: string; url: string }> {
  const p = await d.one<PaymentRow>(
    "insert into public.payments (order_id, provider, amount, status) values ($1, $2, $3, 'created') returning *",
    [order.id, method, order.total],
  );
  await d.query("update public.orders set payment_status = 'pending' where id = $1 and payment_status in ('unpaid','failed')", [order.id]);
  return { paymentId: p!.id, url: checkoutUrl(p!) };
}

export function checkoutUrl(p: PaymentRow): string {
  const returnUrl = `${siteUrl()}/orders/${p.order_id}?payment=${p.id}`;
  if (p.provider === "mock") return `/pay/mock/${p.id}`;
  if (p.provider === "click") {
    // https://docs.click.uz — payment page redirect
    const q = new URLSearchParams({
      service_id: process.env.CLICK_SERVICE_ID ?? "",
      merchant_id: process.env.CLICK_MERCHANT_ID ?? "",
      amount: String(p.amount),
      transaction_param: p.id,
      return_url: returnUrl,
    });
    return `https://my.click.uz/services/pay?${q}`;
  }
  if (p.provider === "payme") {
    // https://developer.help.paycom.uz — GET checkout: base64("m=..;ac.order_id=..;a=<tiyin>;c=<return>")
    const params = `m=${process.env.PAYME_MERCHANT_ID};ac.order_id=${p.id};a=${p.amount * 100};c=${returnUrl}`;
    const base = (process.env.PAYME_CHECKOUT_URL || "https://checkout.test.paycom.uz").replace(/\/$/, "");
    return `${base}/${Buffer.from(params).toString("base64")}`;
  }
  throw new Error(`no checkout for ${p.provider}`);
}

/**
 * Records a provider callback. Returns the stored response if this exact
 * callback was already processed (duplicate delivery), else null.
 */
export async function claimEvent(d: Db, provider: string, eventKey: string, payload: unknown): Promise<{ id: number; response: unknown } | null> {
  const inserted = await d.one<{ id: number }>(
    `insert into public.payment_events (provider, event_key, payload) values ($1, $2, $3)
     on conflict (provider, event_key) do nothing returning id`,
    [provider, eventKey, JSON.stringify(payload)],
  );
  if (inserted) return { id: inserted.id, response: null };
  const prior = await d.one<{ id: number; response: unknown }>(
    "select id, response from public.payment_events where provider = $1 and event_key = $2 for update",
    [provider, eventKey],
  );
  return prior;
}

export async function saveEventResponse(d: Db, id: number, paymentId: string | null, response: unknown) {
  await d.query("update public.payment_events set response = $2, payment_id = $3 where id = $1", [id, JSON.stringify(response), paymentId]);
}

export function eventKey(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 40);
}

/**
 * Marks a payment paid (idempotent). Caller must hold the payment row lock
 * and must have verified the provider signature and the amount.
 */
export async function markPaymentPaid(d: Db, p: PaymentRow, providerTxnId: string | null): Promise<void> {
  if (p.status === "paid") return;
  const other = await d.one("select 1 from public.payments where order_id = $1 and status = 'paid' and id <> $2", [p.order_id, p.id]);
  if (other) {
    // The provider took money twice for one order: never double-count it,
    // flag it for a manual refund instead.
    await d.query(
      "update public.payments set status = 'cancelled', cancelled_at = now(), provider_txn_id = coalesce($2, provider_txn_id), provider_state = provider_state || '{\"duplicate_charge\": true}' where id = $1",
      [p.id, providerTxnId],
    );
    await d.query(
      "insert into public.audit_logs (actor_kind, action, entity, entity_id, data) values ('system', 'payment.duplicate_charge', 'order', $1, $2)",
      [p.order_id, JSON.stringify({ paymentId: p.id, provider: p.provider, amount: p.amount, note: "Refund manually in the provider cabinet" })],
    );
    return;
  }
  await d.query(
    "update public.payments set status = 'paid', paid_at = now(), provider_txn_id = coalesce($2, provider_txn_id) where id = $1",
    [p.id, providerTxnId],
  );
  const order = await d.one<{ status: string }>("select status from public.orders where id = $1 for update", [p.order_id]);
  await d.query("update public.orders set payment_status = $2 where id = $1", [
    p.order_id,
    order?.status === "cancelled" ? "refund_pending" : "paid",
  ]);
  await d.query(
    "insert into public.audit_logs (actor_kind, action, entity, entity_id, data) values ('system', 'payment.paid', 'order', $1, $2)",
    [p.order_id, JSON.stringify({ paymentId: p.id, provider: p.provider, amount: p.amount })],
  );
}

export async function markPaymentFailed(d: Db, p: PaymentRow, status: "failed" | "cancelled" = "failed"): Promise<void> {
  if (p.status === "paid" || p.status === "refunded") return;
  await d.query("update public.payments set status = $2, cancelled_at = now() where id = $1", [p.id, status]);
  // only flag the order if no other attempt succeeded
  await d.query(
    `update public.orders set payment_status = 'failed'
      where id = $1 and payment_status = 'pending'
        and not exists (select 1 from public.payments where order_id = $1 and status in ('paid','pending','created') and id <> $2)`,
    [p.order_id, p.id],
  );
}

export async function lockPayment(d: Db, id: string): Promise<PaymentRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return d.one<PaymentRow>("select * from public.payments where id = $1 for update", [id]);
}

/** Integer tiyin from a decimal string such as "125600.00" (no float math). */
export function decimalToTiyin(s: string): number | null {
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(String(s).trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
}
