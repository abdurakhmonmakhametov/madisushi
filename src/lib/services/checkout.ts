// Checkout: server-side quotes and transactional order placement.
//
// Every quote and every order recomputes prices, availability, delivery
// eligibility, promo and loyalty limits and scheduling from the database.
// Order creation runs in one transaction that locks the customer row (loyalty),
// the promo row (usage limits) and an advisory lock on the idempotency key, so
// retries and double clicks return the same order instead of creating another.
import { createHash } from "node:crypto";
import { z } from "zod";
import { db, pgErrorCode, tx, type Db } from "../db";
import { quote, type PromoRule, type Quote, type Zone } from "../pricing";
import { checkPromo, normalizeCode, type PromoError, type PromoRow } from "../promo";
import { availableSlots, checkSchedule, type ScheduleError } from "../schedule";
import { loadSettings, loyaltyRules, type Settings } from "../settings";
import { bestZone, loadBranches, loadCatalog, loadZones, type BranchInfo, type ZoneRow } from "./catalog";
import { enabledMethods, isOnline, startPayment, type PaymentMethod } from "../payments/core";
import { normalizePhone } from "../auth/otp";
import type { I18n } from "../pricing";

const uuid = z.string().uuid();
const shortText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

export const addressSchema = z.object({
  text: z.string().trim().min(2).max(300),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  house: shortText(20),
  apartment: shortText(20),
  floor: shortText(10),
  entrance: shortText(10),
  instructions: shortText(300),
});

export const quoteInputSchema = z.object({
  brandId: uuid,
  branchId: uuid,
  fulfillment: z.enum(["delivery", "pickup"]),
  address: addressSchema.nullable().optional(),
  items: z
    .array(z.object({ productId: uuid, optionIds: z.array(uuid).max(20).default([]), quantity: z.number().int().min(1).max(99) }))
    .max(50),
  promoCode: z.string().trim().max(32).optional().nullable(),
  loyalty: z.number().int().min(0).max(100_000_000).default(0),
  asap: z.boolean().default(true),
  scheduledFor: z.string().datetime({ offset: true }).optional().nullable(),
});

export const placeInputSchema = quoteInputSchema.extend({
  customerName: z.string().trim().min(1).max(80),
  paymentMethod: z.enum(["cash", "card_on_delivery", "click", "payme", "mock"]),
  leaveAtDoor: z.boolean().default(false),
  isForOther: z.boolean().default(false),
  recipientName: shortText(80),
  recipientPhone: shortText(20),
  comment: shortText(500),
  saveAddress: z.boolean().default(false),
  idempotencyKey: z.string().min(8).max(80).regex(/^[A-Za-z0-9_-]+$/),
  expectedTotal: z.number().int().min(0),
});

export type QuoteInput = z.infer<typeof quoteInputSchema>;
export type PlaceInput = z.infer<typeof placeInputSchema>;

export interface Issue {
  code: string;
  params?: Record<string, string | number>;
}

export interface CheckoutQuote {
  quote: Quote;
  issues: Issue[];
  branch: { id: string; name: I18n; address: I18n; acceptsDelivery: boolean; acceptsPickup: boolean } | null;
  delivery: { zoneId: string; zoneName: I18n; surchargeNote: I18n | null; estimateMinutes: number } | null;
  suggestedBranchId: string | null;
  schedule: { asapAvailable: boolean; leadMinutes: number; slots: string[]; promisedAt: string | null };
  promo: { code: string; error: PromoError | null; discount: number } | null;
  paymentMethods: PaymentMethod[];
  loyaltyBalance: number;
}

interface Ctx {
  branch: BranchInfo;
  zones: ZoneRow[];
  settings: Settings;
}

async function loadCtx(d: Db, input: QuoteInput): Promise<Ctx | null> {
  const [branch] = await loadBranches(d, { branchId: input.branchId, activeOnly: false });
  if (!branch || branch.brand_id !== input.brandId) return null;
  const brand = await d.one<{ is_active: boolean }>("select is_active from public.brands where id = $1", [input.brandId]);
  if (!brand) return null;
  if (!brand.is_active) branch.is_active = false;
  const [zones, settings] = await Promise.all([loadZones(d, input.brandId), loadSettings(d)]);
  return { branch, zones, settings };
}

async function loadPromo(d: Db, code: string, lock: boolean): Promise<PromoRow | null> {
  return d.one<PromoRow>(
    `select p.*, coalesce((select array_agg(brand_id) from public.promo_code_brands where promo_code_id = p.id), '{}') as brand_ids
       from public.promo_codes p where p.code = $1 ${lock ? "for update of p" : ""}`,
    [code],
  );
}

async function customerPromoUses(d: Db, promoId: string, customerId: string | null): Promise<number | null> {
  if (!customerId) return null;
  const r = await d.one<{ n: number }>(
    "select count(*)::int as n from public.promo_redemptions where promo_code_id = $1 and customer_id = $2 and status = 'active'",
    [promoId, customerId],
  );
  return r?.n ?? 0;
}

async function compute(
  d: Db,
  input: QuoteInput,
  customer: { id: string; loyalty_balance: number } | null,
  now: Date,
  opts: { lockPromo: boolean; paymentMethod?: PaymentMethod },
): Promise<{ result: CheckoutQuote; promoRow: PromoRow | null; zone: ZoneRow | null; ctx: Ctx | null; scheduleError: ScheduleError | null }> {
  const issues: Issue[] = [];
  const ctx = await loadCtx(d, input);
  const methods = enabledMethods();
  const emptyQuote = quote({
    brandId: input.brandId,
    lines: [],
    catalog: new Map(),
    fulfillment: input.fulfillment,
    zone: null,
    pickupMinOrder: 0,
    promo: null,
    loyaltyRequested: 0,
    loyaltyBalance: 0,
    loyaltyRules: { enabled: false, earnBps: 0, maxSpendAmount: 0, maxSpendBps: 0 },
  });
  if (!ctx) {
    return {
      result: {
        quote: emptyQuote,
        issues: [{ code: "not_found" }],
        branch: null,
        delivery: null,
        suggestedBranchId: null,
        schedule: { asapAvailable: false, leadMinutes: 0, slots: [], promisedAt: null },
        promo: null,
        paymentMethods: methods,
        loyaltyBalance: customer?.loyalty_balance ?? 0,
      },
      promoRow: null,
      zone: null,
      ctx: null,
      scheduleError: null,
    };
  }
  const { branch, zones, settings } = ctx;
  if (!branch.is_active) issues.push({ code: "branch_closed" });

  // delivery eligibility
  let zone: ZoneRow | null = null;
  let suggestedBranchId: string | null = null;
  if (input.fulfillment === "delivery") {
    if (!branch.accepts_delivery) issues.push({ code: "delivery_unavailable" });
    else if (!input.address) issues.push({ code: "address_required" });
    else {
      const point: [number, number] = [input.address.lat, input.address.lng];
      zone = bestZone(zones, point, branch.id);
      if (!zone) {
        const other = bestZone(zones, point);
        if (other) {
          suggestedBranchId = other.branch_id;
          issues.push({ code: "branch_mismatch" });
        } else issues.push({ code: "delivery_unavailable" });
      }
    }
  } else if (!branch.accepts_pickup) {
    issues.push({ code: "pickup_unavailable" });
  }

  // catalog + pricing
  const catalog = await loadCatalog(d, branch.id, input.items.map((i) => i.productId));
  let promoRow: PromoRow | null = null;
  let promoError: PromoError | null = null;
  let promoRule: PromoRule | null = null;
  const code = input.promoCode ? normalizeCode(input.promoCode) : "";
  if (code) {
    promoRow = /^[A-Z0-9_-]{3,32}$/.test(code) ? await loadPromo(d, code, opts.lockPromo) : null;
    promoError = checkPromo(promoRow, { now, brandId: input.brandId, customerUses: promoRow ? await customerPromoUses(d, promoRow.id, customer?.id ?? null) : null });
    if (!promoError && promoRow) {
      promoRule = { id: promoRow.id, code: promoRow.code, kind: promoRow.kind, value: promoRow.value, maxDiscount: promoRow.max_discount, minSubtotal: promoRow.min_subtotal };
    } else issues.push({ code: `promo.${promoError}` });
  }

  const zoneForPricing: Zone | null = zone
    ? { id: zone.id, fee: zone.fee, minOrder: zone.min_order, freeDeliveryFrom: zone.free_delivery_from, surcharge: zone.surcharge, extraMinutes: zone.extra_minutes }
    : null;
  const q = quote({
    brandId: input.brandId,
    lines: input.items,
    catalog,
    fulfillment: input.fulfillment,
    zone: zoneForPricing,
    pickupMinOrder: branch.pickup_min_order,
    promo: promoRule,
    loyaltyRequested: customer ? input.loyalty : 0,
    loyaltyBalance: customer?.loyalty_balance ?? 0,
    loyaltyRules: loyaltyRules(settings),
  });
  for (const i of q.issues) {
    const { code: c, ...params } = i as { code: string } & Record<string, string | number>;
    if (c === "promo_min_subtotal" || c === "below_minimum" || c === "loyalty_exceeds_limit") {
      issues.push({ code: c, params });
    } else if (!issues.some((x) => x.code === c && x.params?.productId === params.productId)) {
      issues.push(Object.keys(params).length ? { code: c, params } : { code: c });
    }
  }
  if (!customer && input.loyalty > 0) issues.push({ code: "unauthorized" });

  // scheduling
  const leadMinutes = branch.prep_minutes + (input.fulfillment === "delivery" ? branch.delivery_minutes + (zone?.extra_minutes ?? 0) : 0);
  const rules = { slotMinutes: settings.scheduling.slot_minutes, maxDaysAhead: settings.scheduling.max_days_ahead };
  const asapCheck = checkSchedule({ hours: branch.hours, closedDates: branch.closed_dates, now, leadMinutes, rules, asap: true });
  const chosen = input.asap
    ? asapCheck
    : checkSchedule({ hours: branch.hours, closedDates: branch.closed_dates, now, leadMinutes, rules, asap: false, scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null });
  const scheduleError = chosen.ok ? null : chosen.error!;
  if (scheduleError) issues.push({ code: `schedule.${scheduleError}` });
  const slots = availableSlots({ hours: branch.hours, closedDates: branch.closed_dates, now, leadMinutes, rules }).slice(0, 400);

  if (opts.paymentMethod && !methods.includes(opts.paymentMethod)) issues.push({ code: "payment_method" });

  return {
    result: {
      quote: q,
      issues,
      branch: { id: branch.id, name: branch.name, address: branch.address, acceptsDelivery: branch.accepts_delivery, acceptsPickup: branch.accepts_pickup },
      delivery: zone ? { zoneId: zone.id, zoneName: zone.name, surchargeNote: zone.surcharge_note, estimateMinutes: leadMinutes } : null,
      suggestedBranchId,
      schedule: {
        asapAvailable: asapCheck.ok,
        leadMinutes,
        slots: slots.map((s) => s.toISOString()),
        promisedAt: chosen.promisedAt ? chosen.promisedAt.toISOString() : null,
      },
      promo: code ? { code, error: promoError, discount: q.discountTotal } : null,
      paymentMethods: methods,
      loyaltyBalance: customer?.loyalty_balance ?? 0,
    },
    promoRow,
    zone,
    ctx,
    scheduleError,
  };
}

export async function getQuote(input: QuoteInput, customer: { id: string; loyalty_balance: number } | null, now = new Date()): Promise<CheckoutQuote> {
  return (await compute(db, input, customer, now, { lockPromo: false })).result;
}

export type PlaceResult =
  | { ok: true; orderId: string; number: number; paymentUrl: string | null; duplicate: boolean }
  | { ok: false; code: "validation"; issues: Issue[]; quote: CheckoutQuote }
  | { ok: false; code: "price_changed"; quote: CheckoutQuote; expectedTotal: number }
  | { ok: false; code: "idempotency_conflict" | "blocked" | "unauthorized" };

export function requestHash(input: PlaceInput): string {
  const { idempotencyKey: _k, expectedTotal: _e, saveAddress: _s, ...rest } = input;
  void _k;
  void _e;
  void _s;
  return createHash("sha256").update(JSON.stringify(rest)).digest("hex");
}

export async function placeOrder(customerId: string, input: PlaceInput, now = new Date()): Promise<PlaceResult> {
  const hash = requestHash(input);
  const attempt = () =>
    tx<PlaceResult>(
      async (d) => {
        // Serialize concurrent submissions of the same checkout.
        await d.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`order:${customerId}:${input.idempotencyKey}`]);
        const existing = await d.one<{ id: string; number: number; request_hash: string; payment_method: PaymentMethod; payment_status: string; total: number }>(
          "select id, number, request_hash, payment_method, payment_status, total from public.orders where customer_id = $1 and idempotency_key = $2",
          [customerId, input.idempotencyKey],
        );
        if (existing) {
          if (existing.request_hash !== hash) return { ok: false, code: "idempotency_conflict" };
          const pay = await d.one<{ id: string }>(
            "select id from public.payments where order_id = $1 and status in ('created','pending') order by created_at desc limit 1",
            [existing.id],
          );
          return { ok: true, orderId: existing.id, number: existing.number, paymentUrl: pay ? `/orders/${existing.id}/pay` : null, duplicate: true };
        }

        const customer = await d.one<{ id: string; loyalty_balance: number; is_blocked: boolean; name: string | null; phone: string }>(
          "select id, loyalty_balance, is_blocked, name, phone from public.customers where id = $1 for update",
          [customerId],
        );
        if (!customer) return { ok: false, code: "unauthorized" };
        if (customer.is_blocked) return { ok: false, code: "blocked" };

        const { result, promoRow, zone, ctx } = await compute(d, input, customer, now, { lockPromo: true, paymentMethod: input.paymentMethod });
        const issues = [...result.issues];
        if (input.leaveAtDoor && (input.fulfillment !== "delivery" || !isOnline(input.paymentMethod) || !ctx?.settings.checkout.leave_at_door_enabled)) {
          issues.push({ code: "leave_at_door" });
        }
        let recipientPhone: string | null = null;
        if (input.isForOther) {
          recipientPhone = input.recipientPhone ? normalizePhone(input.recipientPhone) : null;
          if (!input.recipientName || !recipientPhone || !ctx?.settings.checkout.order_for_other_enabled) issues.push({ code: "validation" });
        }
        if (issues.length > 0 || !ctx) return { ok: false, code: "validation", issues, quote: result };

        const q = result.quote;
        if (q.total !== input.expectedTotal) return { ok: false, code: "price_changed", quote: result, expectedTotal: input.expectedTotal };

        const addr = input.fulfillment === "delivery" && input.address ? input.address : null;
        const order = await d.one<{ id: string; number: number }>(
          `insert into public.orders (
             customer_id, brand_id, branch_id, fulfillment, payment_method, payment_status,
             customer_name, customer_phone, is_for_other, recipient_name, recipient_phone,
             address, delivery_zone_id, leave_at_door, asap, scheduled_for, promised_at, comment,
             subtotal, packaging_total, delivery_fee, zone_surcharge, discount_total, loyalty_spent, total,
             promo_code_id, promo_code, idempotency_key, request_hash)
           values ($1,$2,$3,$4,$5,'unpaid',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
           returning id, number`,
          [
            customerId,
            input.brandId,
            input.branchId,
            input.fulfillment,
            input.paymentMethod,
            input.customerName,
            customer.phone,
            input.isForOther,
            input.isForOther ? input.recipientName : null,
            input.isForOther ? recipientPhone : null,
            addr ? JSON.stringify(addr) : null,
            zone?.id ?? null,
            input.leaveAtDoor,
            input.asap,
            input.asap ? null : input.scheduledFor,
            result.schedule.promisedAt,
            input.comment,
            q.subtotal,
            q.packagingTotal,
            q.deliveryFee,
            q.zoneSurcharge,
            q.discountTotal,
            q.loyaltySpent,
            q.total,
            promoRow && q.discountTotal > 0 ? promoRow.id : null,
            promoRow && q.discountTotal > 0 ? promoRow.code : null,
            input.idempotencyKey,
            hash,
          ],
        );

        let sort = 0;
        const rank = (k: string) => (k === "dish" ? 0 : k === "cutlery" ? 1 : 2);
        for (const l of [...q.lines].sort((a, b) => rank(a.kind) - rank(b.kind))) {
          await d.query(
            `insert into public.order_items (order_id, product_id, kind, name_snapshot, options_snapshot, image_url, unit_price, packaging_fee_unit, quantity, line_total, sort)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
              order!.id,
              l.productId,
              l.kind,
              JSON.stringify(l.name),
              JSON.stringify(l.options.map((o) => ({ group: o.group, name: o.name, priceDelta: o.priceDelta, optionId: o.optionId }))),
              l.imageUrl,
              l.unitPrice,
              l.kind === "dish" ? l.packagingFeeUnit : 0,
              l.quantity,
              l.lineTotal,
              sort++,
            ],
          );
        }

        if (promoRow && q.discountTotal > 0) {
          await d.query("update public.promo_codes set used_count = used_count + 1 where id = $1", [promoRow.id]);
          await d.query(
            "insert into public.promo_redemptions (promo_code_id, order_id, customer_id, amount) values ($1, $2, $3, $4)",
            [promoRow.id, order!.id, customerId, q.discountTotal],
          );
        }
        if (q.loyaltySpent > 0) {
          await d.query("select app.loyalty_post($1, $2, 'spend', $3, 'Order payment', null)", [customerId, order!.id, -q.loyaltySpent]);
        }
        if (!customer.name) await d.query("update public.customers set name = $2 where id = $1", [customerId, input.customerName]);
        if (input.saveAddress && addr) {
          const dup = await d.one(
            "select 1 from public.customer_addresses where customer_id = $1 and address_text = $2 and coalesce(house,'') = coalesce($3,'') and coalesce(apartment,'') = coalesce($4,'')",
            [customerId, addr.text, addr.house, addr.apartment],
          );
          if (!dup) {
            await d.query(
              `insert into public.customer_addresses (customer_id, address_text, lat, lng, house, apartment, floor, entrance, instructions, is_default)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9, not exists (select 1 from public.customer_addresses where customer_id = $1))`,
              [customerId, addr.text, addr.lat, addr.lng, addr.house, addr.apartment, addr.floor, addr.entrance, addr.instructions],
            );
          }
        }

        let paymentUrl: string | null = null;
        if (isOnline(input.paymentMethod) && q.total > 0) {
          paymentUrl = (await startPayment(d, { id: order!.id, total: q.total }, input.paymentMethod)).url;
        } else if (isOnline(input.paymentMethod) && q.total === 0) {
          await d.query("update public.orders set payment_status = 'paid' where id = $1", [order!.id]);
        }
        return { ok: true, orderId: order!.id, number: order!.number, paymentUrl, duplicate: false };
      },
      { actor: { kind: "customer", id: customerId } },
    );

  try {
    return await attempt();
  } catch (e) {
    // A racing request with the same key won; return its order.
    if (pgErrorCode(e) === "23505") return attempt();
    throw e;
  }
}
