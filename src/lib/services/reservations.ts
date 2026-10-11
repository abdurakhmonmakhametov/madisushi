// Table reservations: requests start as `pending` and are confirmed or
// rejected by branch staff. Hours and seat capacity are validated on the
// server, under a per-branch lock so concurrent requests cannot overbook.
import { z } from "zod";
import { asActor, tx, type Db } from "../db";
import { normalizePhone } from "../auth/otp";
import { loadBranches, type BranchInfo } from "./catalog";
import { openWindows } from "../schedule";
import { localToUtc, todayLocal } from "../time";
import type { StaffActor } from "./orders";

export const reservationInput = z.object({
  branchId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  partySize: z.number().int().min(1).max(200),
  name: z.string().trim().min(1).max(80),
  phone: z.string().max(30),
  notes: z.string().trim().max(500).optional().nullable(),
});

const MAX_DAYS_AHEAD = 30;
const MIN_LEAD_MINUTES = 60;

async function bookedSeats(d: Db, branchId: string, start: Date, end: Date): Promise<number> {
  const r = await d.one<{ n: number }>(
    `select coalesce(sum(party_size), 0)::int as n from public.reservations
      where branch_id = $1 and status in ('pending','confirmed','seated') and starts_at < $3 and ends_at > $2`,
    [branchId, start, end],
  );
  return r?.n ?? 0;
}

/** Candidate start times for a date with remaining capacity for the party. */
export async function reservationSlots(d: Db, branch: BranchInfo, date: string, party: number, now = new Date()) {
  const out: { time: string; iso: string; available: boolean }[] = [];
  if (!branch.reservations_enabled || date < todayLocal(now)) return out;
  const step = branch.reservation_slot_minutes * 60000;
  const dur = branch.reservation_duration_minutes * 60000;
  // windows starting the day before (after-midnight hours) and on the date itself
  for (const w of openWindows(branch.hours, branch.closed_dates, date, 0)) {
    for (let t = w.start.getTime(); t + dur <= w.end.getTime(); t += step) {
      const start = new Date(t);
      if (start.getTime() < now.getTime() + MIN_LEAD_MINUTES * 60000) continue;
      if (todayLocal(start) !== date) continue;
      const seats = await bookedSeats(d, branch.id, start, new Date(t + dur));
      const hh = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(start);
      out.push({ time: hh, iso: start.toISOString(), available: seats + party <= branch.reservation_capacity });
    }
  }
  return out;
}

export type ReservationResult = { ok: true; id: string; number: number } | { ok: false; code: string };

export async function createReservation(input: z.infer<typeof reservationInput>, customerId: string | null, now = new Date()): Promise<ReservationResult> {
  const phone = normalizePhone(input.phone);
  if (!phone) return { ok: false, code: "validation" };
  return tx(
    async (d) => {
      await d.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`reservation:${input.branchId}`]);
      const [branch] = await loadBranches(d, { branchId: input.branchId });
      if (!branch || !branch.reservations_enabled) return { ok: false, code: "reservations_disabled" };
      if (input.partySize > branch.reservation_max_party) return { ok: false, code: "party_size" };
      const [hh, mm] = input.time.split(":").map(Number);
      const start = localToUtc(input.date, hh * 60 + mm);
      const end = new Date(start.getTime() + branch.reservation_duration_minutes * 60000);
      if (start.getTime() < now.getTime() + MIN_LEAD_MINUTES * 60000) return { ok: false, code: "schedule.too_soon" };
      if (start.getTime() > now.getTime() + MAX_DAYS_AHEAD * 86400000) return { ok: false, code: "schedule.too_far" };
      const fits = openWindows(branch.hours, branch.closed_dates, input.date, 0).some((w) => w.start <= start && end <= w.end);
      if (!fits) return { ok: false, code: "schedule.outside_hours" };
      if ((await bookedSeats(d, branch.id, start, end)) + input.partySize > branch.reservation_capacity) return { ok: false, code: "capacity" };
      const r = await d.one<{ id: string; number: number }>(
        `insert into public.reservations (brand_id, branch_id, customer_id, name, phone, starts_at, ends_at, party_size, notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id, number`,
        [branch.brand_id, branch.id, customerId, input.name, phone, start, end, input.partySize, input.notes ?? null],
      );
      return { ok: true, id: r!.id, number: r!.number };
    },
    { actor: customerId ? { kind: "customer", id: customerId } : { kind: "system" } },
  );
}

export interface ReservationRow {
  id: string;
  number: number;
  brand_id: string;
  branch_id: string;
  brand_name: string;
  branch_name: { uz: string; ru?: string };
  name: string;
  phone: string;
  starts_at: string;
  ends_at: string;
  party_size: number;
  notes: string | null;
  status: "pending" | "confirmed" | "rejected" | "cancelled" | "seated" | "no_show";
  staff_note: string | null;
  created_at: string;
}

const SELECT = `
  select r.*, b.name as brand_name, br.name as branch_name
    from public.reservations r join public.brands b on b.id = r.brand_id join public.branches br on br.id = r.branch_id`;

export async function listCustomerReservations(customerId: string) {
  return asActor({ kind: "customer", id: customerId }, (d) => d.query<ReservationRow>(`${SELECT} order by r.starts_at desc limit 50`));
}

export async function listStaffReservations(staff: StaffActor, f: { branchId?: string; from?: string; to?: string; status?: string }) {
  const params: unknown[] = [];
  const where = ["true"];
  if (f.branchId && /^[0-9a-f-]{36}$/i.test(f.branchId)) where.push(`r.branch_id = $${params.push(f.branchId)}`);
  if (f.status) where.push(`r.status = $${params.push(f.status)}`);
  if (f.from) where.push(`r.starts_at >= ($${params.push(f.from)}::date)::timestamp at time zone 'Asia/Tashkent'`);
  if (f.to) where.push(`r.starts_at < ($${params.push(f.to)}::date + 1)::timestamp at time zone 'Asia/Tashkent'`);
  return asActor({ kind: "staff", id: staff.id }, (d) => d.query<ReservationRow>(`${SELECT} where ${where.join(" and ")} order by r.starts_at limit 500`, params));
}

const ALLOWED: Record<string, string[]> = {
  pending: ["confirmed", "rejected", "cancelled"],
  confirmed: ["seated", "no_show", "cancelled"],
};

export async function setReservationStatus(staff: StaffActor, id: string, to: string, note?: string | null): Promise<"ok" | "not_found" | "invalid" | "forbidden"> {
  if (staff.role === "kitchen") return "forbidden";
  return asActor({ kind: "staff", id: staff.id }, async (d) => {
    const r = await d.one<{ status: string; branch_id: string }>("select status, branch_id from public.reservations where id = $1 for update", [id]);
    if (!r) return "not_found";
    if (!(ALLOWED[r.status] ?? []).includes(to)) return "invalid";
    const upd = await d.query(
      "update public.reservations set status = $2, staff_note = coalesce($3, staff_note), decided_by = $4, decided_at = now() where id = $1 returning id",
      [id, to, note ?? null, staff.id],
    );
    if (upd.length === 0) return "forbidden";
    await d.query(
      "insert into public.audit_logs (actor_kind, actor_id, action, entity, entity_id, branch_id, data) values ('staff', $1, 'reservation.status', 'reservation', $2, $3, $4)",
      [staff.id, id, r.branch_id, JSON.stringify({ from: r.status, to, note })],
    );
    return "ok";
  });
}
