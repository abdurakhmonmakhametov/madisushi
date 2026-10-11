// Fixed-window rate limiting stored in PostgreSQL, so limits hold across
// server instances.
import { db, type Db } from "../db";

export async function hit(key: string, limit: number, windowSeconds: number, d: Db = db): Promise<boolean> {
  const row = await d.one<{ count: number }>(
    `insert into public.rate_limits (key, window_start, count)
     values ($1, to_timestamp(floor(extract(epoch from now()) / $2) * $2), 1)
     on conflict (key, window_start) do update set count = public.rate_limits.count + 1
     returning count`,
    [key, windowSeconds],
  );
  if (Math.random() < 0.01) {
    await d.query("delete from public.rate_limits where window_start < now() - interval '1 day'");
  }
  return (row?.count ?? 0) <= limit;
}

export class RateLimitError extends Error {
  code = "rate_limited" as const;
}

export async function enforce(checks: [key: string, limit: number, windowSeconds: number][]): Promise<void> {
  for (const [key, limit, win] of checks) {
    if (!(await hit(key, limit, win))) throw new RateLimitError(key);
  }
}
