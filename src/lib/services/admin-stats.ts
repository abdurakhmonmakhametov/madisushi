// Dashboard metrics. Runs under RLS as the staff member, so a branch manager
// only ever aggregates their own branches.
//
// Definitions (orders created in the selected local-date range):
//   Orders          : orders not cancelled.
//   Paid revenue    : Σ(total − refunded_amount) for orders whose payment
//                     status is `paid` or `partially_refunded`. Orders that are
//                     refunded or awaiting a refund contribute nothing.
//   Avg order value : paid revenue ÷ number of such paid orders.
//   Refunds         : Σ refunded_amount, plus the count still awaiting refund.
//   Popular items   : dish quantities on non-cancelled orders.
import { asActor } from "../db";
import type { StaffActor } from "./orders";

export interface DashboardFilters {
  from: string;
  to: string;
  branchId?: string;
}

export async function dashboard(staff: StaffActor, f: DashboardFilters) {
  const params: unknown[] = [f.from, f.to];
  let branchSql = "";
  if (f.branchId) branchSql = ` and o.branch_id = $${params.push(f.branchId)}`;
  const range = `o.created_at >= ($1::date)::timestamp at time zone 'Asia/Tashkent' and o.created_at < ($2::date + 1)::timestamp at time zone 'Asia/Tashkent'${branchSql}`;
  return asActor({ kind: "staff", id: staff.id }, async (d) => {
    const totals = await d.one<{ orders: number; cancelled: number; paid_orders: number; revenue: number; refunded: number; refund_pending: number; delivery: number; pickup: number }>(
      `select count(*) filter (where o.status <> 'cancelled')::int as orders,
              count(*) filter (where o.status = 'cancelled')::int as cancelled,
              count(*) filter (where o.payment_status in ('paid','partially_refunded'))::int as paid_orders,
              coalesce(sum(o.total - o.refunded_amount) filter (where o.payment_status in ('paid','partially_refunded')), 0)::bigint as revenue,
              coalesce(sum(o.refunded_amount), 0)::bigint as refunded,
              count(*) filter (where o.payment_status = 'refund_pending')::int as refund_pending,
              count(*) filter (where o.fulfillment = 'delivery' and o.status <> 'cancelled')::int as delivery,
              count(*) filter (where o.fulfillment = 'pickup' and o.status <> 'cancelled')::int as pickup
         from public.orders o where ${range}`,
      params,
    );
    const byDay = await d.query<{ day: string; orders: number; revenue: number }>(
      `select to_char((o.created_at at time zone 'Asia/Tashkent')::date, 'YYYY-MM-DD') as day,
              count(*) filter (where o.status <> 'cancelled')::int as orders,
              coalesce(sum(o.total - o.refunded_amount) filter (where o.payment_status in ('paid','partially_refunded')), 0)::bigint as revenue
         from public.orders o where ${range} group by 1 order by 1`,
      params,
    );
    const popular = await d.query<{ name: { uz: string; ru?: string }; qty: number; amount: number }>(
      `select (array_agg(i.name_snapshot))[1] as name, sum(i.quantity)::int as qty, sum(i.line_total)::bigint as amount
         from public.order_items i join public.orders o on o.id = i.order_id
        where i.kind = 'dish' and o.status <> 'cancelled' and ${range}
        group by coalesce(i.product_id::text, i.name_snapshot->>'uz') order by qty desc limit 10`,
      params,
    );
    const byStatus = await d.query<{ status: string; n: number }>(`select o.status, count(*)::int n from public.orders o where ${range} group by 1 order by 2 desc`, params);
    const byBranch = await d.query<{ branch: string; orders: number; revenue: number }>(
      `select (br.name->>'uz') as branch,
              count(*) filter (where o.status <> 'cancelled')::int as orders,
              coalesce(sum(o.total - o.refunded_amount) filter (where o.payment_status in ('paid','partially_refunded')), 0)::bigint as revenue
         from public.orders o join public.branches br on br.id = o.branch_id join public.brands b on b.id = o.brand_id
        where ${range} group by 1 order by 2 desc`,
      params,
    );
    const t = totals!;
    return { ...t, aov: t.paid_orders ? Math.floor(t.revenue / t.paid_orders) : 0, byDay, popular, byStatus, byBranch };
  });
}

/** Branches visible to a staff member (for filters). */
export async function staffBranches(staff: StaffActor) {
  return asActor({ kind: "staff", id: staff.id }, (d) =>
    d.query<{ id: string; label: string; brand_id: string }>(
      `select br.id, (br.name->>'uz') as label, br.brand_id from public.branches br join public.brands b on b.id = br.brand_id
        where app.can_access_branch(br.id) order by b.sort, br.sort`,
    ),
  );
}

/** Orders that need someone to act on them right now, regardless of date filters. */
export async function attentionNow(staff: StaffActor, branchId?: string) {
  return asActor({ kind: "staff", id: staff.id }, async (d) => {
    const params: unknown[] = [];
    const where = branchId ? ` and o.branch_id = $${params.push(branchId)}` : "";
    const r = await d.one<{ waiting: number; in_progress: number }>(
      `select count(*) filter (where o.status = 'new')::int as waiting,
              count(*) filter (where o.status in ('confirmed','preparing','ready','out_for_delivery'))::int as in_progress
         from public.orders o where o.status not in ('delivered','picked_up','cancelled')${where}`,
      params,
    );
    const stopped = await d.one<{ n: number }>(
      `select count(*)::int as n from public.branch_products bp where bp.is_available = false${branchId ? " and bp.branch_id = $1" : ""}`,
      branchId ? [branchId] : [],
    );
    return { waiting: r?.waiting ?? 0, inProgress: r?.in_progress ?? 0, stopped: stopped?.n ?? 0 };
  });
}
