// Order reads and lifecycle operations. Customer and staff reads run under
// RLS (asActor), so a customer only ever sees their own orders and staff only
// the branches they are assigned to — even if the code asks for more.
import { asActor, pgErrorCode, tx } from "../db";
import type { I18n } from "../pricing";
import type { OrderStatus, PaymentStatus, StaffRole } from "../order-status";
import { CANCEL_REASONS, customerCanCancel, nextStatuses, staffCanSet } from "../order-status";
import { loadCatalog } from "./catalog";
import { priceLine } from "../pricing";

export interface OrderRow {
  id: string;
  number: number;
  customer_id: string;
  brand_id: string;
  branch_id: string;
  brand_name: string;
  brand_slug: string;
  branch_name: I18n;
  branch_address: I18n;
  branch_phone: string | null;
  fulfillment: "delivery" | "pickup";
  status: OrderStatus;
  payment_method: string;
  payment_status: PaymentStatus;
  customer_name: string;
  customer_phone: string;
  is_for_other: boolean;
  recipient_name: string | null;
  recipient_phone: string | null;
  address: { text: string; house?: string | null; apartment?: string | null; floor?: string | null; entrance?: string | null; instructions?: string | null } | null;
  leave_at_door: boolean;
  asap: boolean;
  scheduled_for: string | null;
  promised_at: string;
  comment: string | null;
  subtotal: number;
  packaging_total: number;
  delivery_fee: number;
  zone_surcharge: number;
  discount_total: number;
  loyalty_spent: number;
  total: number;
  refunded_amount: number;
  loyalty_earned: number;
  promo_code: string | null;
  cancel_reason: string | null;
  cancelled_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItemRow {
  id: string;
  product_id: string | null;
  kind: string;
  name_snapshot: I18n;
  options_snapshot: { group: I18n; name: I18n; priceDelta: number; optionId?: string }[];
  image_url: string | null;
  unit_price: number;
  packaging_fee_unit: number;
  quantity: number;
  line_total: number;
}

export interface HistoryRow {
  from_status: string | null;
  to_status: OrderStatus;
  actor_kind: string;
  note: string | null;
  created_at: string;
}

const ORDER_SELECT = `
  select o.*, b.name as brand_name, b.slug as brand_slug, br.name as branch_name, br.address as branch_address, br.phone as branch_phone
    from public.orders o
    join public.brands b on b.id = o.brand_id
    join public.branches br on br.id = o.branch_id`;

export async function listCustomerOrders(customerId: string, limit = 50): Promise<OrderRow[]> {
  return asActor({ kind: "customer", id: customerId }, (d) =>
    d.query<OrderRow>(`${ORDER_SELECT} order by o.created_at desc limit $1`, [limit]),
  );
}

/** A customer's orders that are still in progress (for the "your order" tracker). */
export async function activeCustomerOrders(customerId: string) {
  return asActor({ kind: "customer", id: customerId }, (d) =>
    d.query<{ id: string; number: number; status: OrderStatus; fulfillment: "delivery" | "pickup"; promised_at: string }>(
      "select id, number, status, fulfillment, promised_at from public.orders where status not in ('delivered','picked_up','cancelled') order by created_at desc limit 3",
    ),
  );
}

async function orderDetail(d: import("../db").Db, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const order = await d.one<OrderRow>(`${ORDER_SELECT} where o.id = $1`, [id]);
  if (!order) return null;
  const items = await d.query<OrderItemRow>("select * from public.order_items where order_id = $1 order by sort", [id]);
  const history = await d.query<HistoryRow>(
    "select from_status, to_status, actor_kind, note, created_at from public.order_status_history where order_id = $1 order by created_at, id",
    [id],
  );
  const payments = await d.query<{ id: string; provider: string; amount: number; status: string; created_at: string; paid_at: string | null }>(
    "select id, provider, amount, status, created_at, paid_at from public.payments where order_id = $1 order by created_at",
    [id],
  );
  return { order, items, history, payments };
}

export type OrderDetail = NonNullable<Awaited<ReturnType<typeof orderDetail>>>;

export async function getCustomerOrder(customerId: string, id: string): Promise<OrderDetail | null> {
  return asActor({ kind: "customer", id: customerId }, (d) => orderDetail(d, id));
}

export async function cancelOrderByCustomer(customerId: string, id: string, reason: string): Promise<"ok" | "not_found" | "cannot_cancel"> {
  const r = CANCEL_REASONS.includes(reason as (typeof CANCEL_REASONS)[number]) ? reason : "customer_request";
  return tx(
    async (d) => {
      const o = await d.one<{ status: OrderStatus }>("select status from public.orders where id = $1 and customer_id = $2 for update", [id, customerId]);
      if (!o) return "not_found";
      if (!customerCanCancel(o.status)) return "cannot_cancel";
      await d.query("update public.orders set status = 'cancelled', cancel_reason = $2, cancelled_by = 'customer' where id = $1", [id, r]);
      return "ok";
    },
    { actor: { kind: "customer", id: customerId } },
  );
}

/** Items of a past order that can be ordered again now, at current prices. */
export async function reorderLines(customerId: string, id: string) {
  const detail = await getCustomerOrder(customerId, id);
  if (!detail) return null;
  const { order, items } = detail;
  const catalog = await loadCatalog((await import("../db")).db, order.branch_id, items.map((i) => i.product_id ?? "").filter(Boolean));
  const lines: { productId: string; optionIds: string[]; quantity: number; name: I18n; imageUrl: string | null; unitPrice: number; kind: string; options: I18n[] }[] = [];
  let missing = 0;
  for (const it of items) {
    const p = it.product_id ? catalog.get(it.product_id) : undefined;
    const optionIds = it.options_snapshot.map((o) => o.optionId).filter((x): x is string => Boolean(x));
    const priced = p ? priceLine(p, optionIds) : null;
    if (!p || !p.available || !priced?.ok) {
      if (it.kind === "dish") missing++;
      continue;
    }
    lines.push({ productId: p.id, optionIds, quantity: it.quantity, name: p.name, imageUrl: p.imageUrl, unitPrice: priced.unitPrice, kind: p.kind, options: priced.options.map((o) => o.name) });
  }
  return { brandId: order.brand_id, brandSlug: order.brand_slug, branchId: order.branch_id, branchName: order.branch_name, fulfillment: order.fulfillment, lines, missing };
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export interface StaffActor {
  id: string;
  role: StaffRole;
  branchIds: string[];
}

export interface StaffOrderFilters {
  status?: string;
  branchId?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  active?: boolean;
}

export async function listStaffOrders(staff: StaffActor, f: StaffOrderFilters) {
  const pageSize = Math.min(f.pageSize ?? 25, 100);
  const page = Math.max(1, f.page ?? 1);
  const where: string[] = ["true"];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replaceAll("?", `$${params.length}`));
  };
  if (f.status) add("o.status = ?", f.status);
  if (f.active) where.push("o.status not in ('delivered','picked_up','cancelled')");
  if (f.branchId && /^[0-9a-f-]{36}$/i.test(f.branchId)) add("o.branch_id = ?", f.branchId);
  if (f.from) add("o.created_at >= ?::date::timestamp at time zone 'Asia/Tashkent'", f.from);
  if (f.to) add("o.created_at < (?::date + 1)::timestamp at time zone 'Asia/Tashkent'", f.to);
  if (f.q) {
    const q = f.q.trim().slice(0, 40);
    if (/^\+?\d{3,}$/.test(q)) add("(o.number::text = ? or o.customer_phone like '%' || ?)", q.replace("+", ""));
    else add("o.customer_name ilike ?", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
  }
  return asActor({ kind: "staff", id: staff.id }, async (d) => {
    const total = await d.one<{ n: number }>(`select count(*)::int as n from public.orders o where ${where.join(" and ")}`, params);
    const rows = await d.query<OrderRow>(
      `${ORDER_SELECT} where ${where.join(" and ")} order by o.created_at desc limit ${pageSize} offset ${(page - 1) * pageSize}`,
      params,
    );
    return { rows, total: total?.n ?? 0, page, pageSize };
  });
}

export type BoardOrder = OrderRow & { items: { q: number; n: I18n; o: I18n[] | null }[]; status_at: string };

/** Every in-progress order with a short item list, for the live kitchen/dispatch board. */
export async function listBoardOrders(staff: StaffActor, branchId?: string): Promise<BoardOrder[]> {
  const params: unknown[] = [];
  let where = "o.status not in ('delivered','picked_up','cancelled')";
  if (branchId && /^[0-9a-f-]{36}$/i.test(branchId)) {
    params.push(branchId);
    where += " and o.branch_id = $1";
  }
  return asActor({ kind: "staff", id: staff.id }, (d) =>
    d.query<BoardOrder>(
      `select * from (${ORDER_SELECT.replace("select o.*,", `select o.*,
         coalesce((select json_agg(json_build_object('q', i.quantity, 'n', i.name_snapshot,
                    'o', (select json_agg(x->'name') from jsonb_array_elements(i.options_snapshot) x)) order by i.sort)
                   from public.order_items i where i.order_id = o.id), '[]'::json) as items,
         coalesce((select max(h.created_at) from public.order_status_history h where h.order_id = o.id), o.created_at) as status_at,`)}
        where ${where}) q order by q.asap desc, q.promised_at, q.created_at limit 200`,
      params,
    ),
  );
}

/** Tiny summary polled by every admin page: how many orders/bookings wait for someone. */
export async function staffPulse(staff: StaffActor, withReservations: boolean) {
  return asActor({ kind: "staff", id: staff.id }, async (d) => {
    const o = await d.one<{ fresh: number; active: number; latest: string | null }>(
      `select count(*) filter (where status = 'new')::int as fresh,
              count(*)::int as active,
              max(created_at) filter (where status = 'new') as latest
         from public.orders where status not in ('delivered','picked_up','cancelled')`,
    );
    const r = withReservations ? await d.one<{ n: number }>("select count(*)::int as n from public.reservations where status = 'pending' and starts_at > now()") : null;
    return { newOrders: o?.fresh ?? 0, activeOrders: o?.active ?? 0, latestNew: o?.latest ?? null, pendingReservations: r?.n ?? 0 };
  });
}

export async function getStaffOrder(staff: StaffActor, id: string): Promise<(OrderDetail & { customerOrders: number }) | null> {
  return asActor({ kind: "staff", id: staff.id }, async (d) => {
    const detail = await orderDetail(d, id);
    if (!detail) return null;
    const c = await d.one<{ n: number }>("select count(*)::int as n from public.orders where customer_id = $1", [detail.order.customer_id]);
    return { ...detail, customerOrders: c?.n ?? 0 };
  });
}

export type TransitionResult = "ok" | "not_found" | "invalid" | "forbidden" | "reason_required";

export async function transitionOrder(staff: StaffActor, id: string, to: OrderStatus, opts: { reason?: string; note?: string } = {}): Promise<TransitionResult> {
  if (!staffCanSet(staff.role, to)) return "forbidden";
  if (to === "cancelled" && !opts.reason) return "reason_required";
  try {
    return await asActor(
      { kind: "staff", id: staff.id },
      async (d) => {
        const o = await d.one<{ status: OrderStatus; fulfillment: "delivery" | "pickup"; branch_id: string }>(
          "select status, fulfillment, branch_id from public.orders where id = $1 for update",
          [id],
        );
        if (!o) return "not_found";
        if (!nextStatuses(o.fulfillment, o.status).includes(to)) return "invalid";
        const updated = await d.query(
          "update public.orders set status = $2, cancel_reason = case when $2 = 'cancelled' then $3 else cancel_reason end, cancelled_by = case when $2 = 'cancelled' then 'staff' else cancelled_by end where id = $1 returning id",
          [id, to, opts.reason ?? null],
        );
        if (updated.length === 0) return "not_found";
        await d.query(
          "insert into public.audit_logs (actor_kind, actor_id, action, entity, entity_id, branch_id, data) values ('staff', $1, 'order.status', 'order', $2, $3, $4)",
          [staff.id, id, o.branch_id, JSON.stringify({ from: o.status, to, reason: opts.reason ?? null })],
        );
        return "ok";
      },
      { note: opts.note },
    );
  } catch (e) {
    if (pgErrorCode(e) === "42501") return "forbidden";
    if (pgErrorCode(e) === "22023") return "invalid";
    throw e;
  }
}

/** Manager/admin payment actions: record a manual refund, or confirm cash/card collected. */
export async function setPaymentStatus(staff: StaffActor, id: string, to: "paid" | "refunded"): Promise<TransitionResult> {
  if (staff.role === "kitchen") return "forbidden";
  try {
    return await asActor({ kind: "staff", id: staff.id }, async (d) => {
      const o = await d.one<{ payment_status: PaymentStatus; payment_method: string; branch_id: string; total: number }>(
        "select payment_status, payment_method, branch_id, total from public.orders where id = $1 for update",
        [id],
      );
      if (!o) return "not_found";
      if (to === "paid" && !(["cash", "card_on_delivery"].includes(o.payment_method) && o.payment_status === "unpaid")) return "invalid";
      if (to === "refunded" && !["paid", "refund_pending", "partially_refunded"].includes(o.payment_status)) return "invalid";
      await d.query("update public.orders set payment_status = $2 where id = $1", [id, to]);
      if (to === "paid") {
        await d.query("insert into public.payments (order_id, provider, amount, status, paid_at) values ($1, $2, $3, 'paid', now())", [id, o.payment_method, o.total]);
      } else {
        await d.query("update public.payments set status = 'refunded' where order_id = $1 and status = 'paid'", [id]);
      }
      await d.query(
        "insert into public.audit_logs (actor_kind, actor_id, action, entity, entity_id, branch_id, data) values ('staff', $1, $2, 'order', $3, $4, $5)",
        [staff.id, `payment.${to}`, id, o.branch_id, JSON.stringify({ from: o.payment_status, amount: o.total })],
      );
      return "ok";
    });
  } catch (e) {
    if (pgErrorCode(e) === "42501") return "forbidden";
    throw e;
  }
}
