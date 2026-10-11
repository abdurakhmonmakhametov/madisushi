// Opening hours and order scheduling rules (pure; no I/O).
// Hours are per ISO weekday in minutes from local (Tashkent) midnight;
// close_minute may exceed 1440 for windows that run past midnight.
import { addDays, localParts, localToUtc, weekdayOf } from "./time";

export interface HoursRow {
  weekday: number;
  open_minute: number;
  close_minute: number;
}

export interface ScheduleRules {
  /** Grid for offered slots, minutes. */
  slotMinutes: number;
  /** How many days ahead a customer may schedule (0 = today only). */
  maxDaysAhead: number;
}

export interface Window {
  start: Date;
  end: Date;
}

/** Opening windows that start on local dates [fromDate - 1, fromDate + days]. */
export function openWindows(hours: HoursRow[], closedDates: string[], fromDate: string, days: number): Window[] {
  const closed = new Set(closedDates);
  const out: Window[] = [];
  for (let i = -1; i <= days; i++) {
    const date = addDays(fromDate, i);
    if (closed.has(date)) continue;
    const h = hours.find((x) => x.weekday === weekdayOf(date));
    if (!h) continue;
    out.push({ start: localToUtc(date, h.open_minute), end: localToUtc(date, h.close_minute) });
  }
  return out;
}

export function windowAt(hours: HoursRow[], closedDates: string[], at: Date): Window | null {
  const today = localParts(at).date;
  return openWindows(hours, closedDates, today, 0).find((w) => w.start <= at && at < w.end) ?? null;
}

export function isOpenAt(hours: HoursRow[], closedDates: string[], at: Date): boolean {
  return windowAt(hours, closedDates, at) !== null;
}

export type ScheduleError = "closed_now" | "too_soon" | "too_far" | "outside_hours";

export interface ScheduleCheck {
  ok: boolean;
  error?: ScheduleError;
  promisedAt?: Date;
}

/**
 * Validates an ASAP or scheduled order.
 * leadMinutes = preparation (+ delivery) time. For a scheduled time T we
 * require T >= now + lead, T within maxDaysAhead, and the kitchen to be open
 * for the whole [T - lead, T] interval.
 */
export function checkSchedule(input: {
  hours: HoursRow[];
  closedDates: string[];
  now: Date;
  leadMinutes: number;
  rules: ScheduleRules;
  asap: boolean;
  scheduledFor?: Date | null;
}): ScheduleCheck {
  const { hours, closedDates, now, leadMinutes, rules } = input;
  const lead = leadMinutes * 60000;
  if (input.asap) {
    const w = windowAt(hours, closedDates, now);
    const promisedAt = new Date(now.getTime() + lead);
    if (!w || promisedAt > w.end) return { ok: false, error: "closed_now" };
    return { ok: true, promisedAt };
  }
  const t = input.scheduledFor;
  if (!t || Number.isNaN(t.getTime())) return { ok: false, error: "outside_hours" };
  if (t.getTime() < now.getTime() + lead) return { ok: false, error: "too_soon" };
  const lastDate = addDays(localParts(now).date, rules.maxDaysAhead);
  if (localParts(t).date > lastDate) return { ok: false, error: "too_far" };
  const windows = openWindows(hours, closedDates, localParts(t).date, 0);
  const fits = windows.some((w) => w.start.getTime() <= t.getTime() - lead && t <= w.end);
  if (!fits) return { ok: false, error: "outside_hours" };
  return { ok: true, promisedAt: t };
}

/** Slots a customer can pick, in ascending order. */
export function availableSlots(input: {
  hours: HoursRow[];
  closedDates: string[];
  now: Date;
  leadMinutes: number;
  rules: ScheduleRules;
}): Date[] {
  const { hours, closedDates, now, leadMinutes, rules } = input;
  const step = rules.slotMinutes * 60000;
  const today = localParts(now).date;
  const out: Date[] = [];
  const seen = new Set<number>();
  for (const w of openWindows(hours, closedDates, today, rules.maxDaysAhead)) {
    const first = Math.ceil((w.start.getTime() + leadMinutes * 60000) / step) * step;
    for (let t = first; t <= w.end.getTime(); t += step) {
      const d = new Date(t);
      if (seen.has(t)) continue;
      if (checkSchedule({ ...input, asap: false, scheduledFor: d }).ok) {
        seen.add(t);
        out.push(d);
      }
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

/** Today's hours label data for display. */
export function hoursForDate(hours: HoursRow[], closedDates: string[], date: string): HoursRow | null {
  if (closedDates.includes(date)) return null;
  return hours.find((h) => h.weekday === weekdayOf(date)) ?? null;
}
