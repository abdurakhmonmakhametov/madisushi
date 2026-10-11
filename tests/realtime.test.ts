// Realtime endpoint against a real PostgreSQL: DB triggers -> NOTIFY -> hub ->
// per-viewer filtering. Uses the long-poll mode (plain JSON) so it can run here.
// Requires `npm run db:start`.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prepareTestDb } from "./setup-db";

// next/headers stand-in: each simulated request gets its own cookie jar
// (AsyncLocalStorage), since several viewers poll concurrently.
const store = vi.hoisted(() => {
  const { AsyncLocalStorage } = require("node:async_hooks") as typeof import("node:async_hooks");
  return new AsyncLocalStorage<Map<string, string>>();
});
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => {
      const jar = store.getStore();
      return jar?.has(k) ? { name: k, value: jar.get(k)! } : undefined;
    },
    set: () => {},
    delete: () => {},
  }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));

let dbm: typeof import("@/lib/db");
let GET: (req: Request) => Promise<Response>;
let sign: (kind: "customer" | "staff", id: string) => Promise<[string, string]>;
const ids: Record<string, string> = {};
const q = <T = Record<string, any>>(sql: string, p: unknown[] = []) => dbm.db.query<T>(sql, p);

type Poll = { boot: string; seq: number; events: { t: string; id?: string; c?: string }[] };
async function poll(who: [string, string] | null, scope: "customer" | "staff", cursor?: Poll, abortAfterMs = 3000): Promise<Poll> {
  const jar = new Map(who ? [who] : []);
  const qs = cursor ? `&boot=${cursor.boot}&after=${cursor.seq}` : "";
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), abortAfterMs);
  try {
    const res = await store.run(jar, () => GET(new NextRequest(`http://localhost:3000/api/realtime?scope=${scope}&poll=1${qs}`, { signal: ctrl.signal })));
    return (await res.json()) as Poll;
  } finally {
    clearTimeout(t);
  }
}

beforeAll(async () => {
  await prepareTestDb();
  dbm = await import("@/lib/db");
  GET = (await import("@/app/api/realtime/route")).GET;
  const { SignJWT } = await import("jose");
  const { sessionSecret } = await import("@/lib/env");
  sign = async (kind, id) => {
    const row = (await q<{ id: string }>("insert into sessions (subject_kind, subject_id, expires_at) values ($1, $2, now() + interval '1 hour') returning id", [kind, id]))[0];
    const token = await new SignJWT({ kind, sid: row.id }).setProtectedHeader({ alg: "HS256" }).setSubject(id).setIssuedAt().setExpirationTime("1h").sign(sessionSecret());
    return [kind === "customer" ? "sushi_session" : "sushi_admin", token];
  };
  const one = async (sql: string, p: unknown[] = []) => (await q<{ id: string }>(sql, p))[0].id;
  ids.a = await one("insert into customers (phone, name) values ('+998901000001', 'A') returning id");
  ids.b = await one("insert into customers (phone, name) values ('+998901000002', 'B') returning id");
  ids.brand = await one("select id from brands limit 1");
  ids.chilonzor = await one("select id from branches where slug = 'chilonzor'");
  ids.kitchen = await one("select id from staff where email = 'kitchen.chilonzor@sushi.local'");
  ids.mgrYun = await one("select id from staff where email = 'manager.yunusobod@sushi.local'");
  ids.super = await one("select id from staff where role = 'super_admin' limit 1");
}, 120000);

afterAll(async () => {
  await dbm?.pool().end();
});

async function insertOrder(customerId: string) {
  return (
    await q<{ id: string }>(
      `insert into orders (customer_id, brand_id, branch_id, fulfillment, payment_method, customer_name, customer_phone, promised_at, subtotal, total, idempotency_key, request_hash)
       values ($1, $2, $3, 'pickup', 'cash', 'X', '+998901000001', now() + interval '1 hour', 1000, 1000, $4, 'h') returning id`,
      [customerId, ids.brand, ids.chilonzor, `rt-${Math.random().toString(36).slice(2)}`],
    )
  )[0].id;
}

describe("realtime", () => {
  it("delivers an order change only to its customer and to staff of that branch", async () => {
    const [a, b, kitchen, mgrYun, sup] = await Promise.all([sign("customer", ids.a), sign("customer", ids.b), sign("staff", ids.kitchen), sign("staff", ids.mgrYun), sign("staff", ids.super)]);
    await poll(null, "customer"); // starts the LISTEN connection
    await new Promise((r) => setTimeout(r, 300));
    const orderId = await insertOrder(ids.a);
    const cursor = await poll(a, "customer");
    const waits = {
      a: poll(a, "customer", cursor),
      b: poll(b, "customer", cursor),
      kitchen: poll(kitchen, "staff", cursor),
      mgrYun: poll(mgrYun, "staff", cursor),
      sup: poll(sup, "staff", cursor),
    };
    await new Promise((r) => setTimeout(r, 200));
    const t0 = Date.now();
    const aAt = waits.a.then(() => Date.now() - t0);
    await q("update orders set status = 'confirmed' where id = $1", [orderId]);
    const got = Object.fromEntries(await Promise.all(Object.entries(waits).map(async ([k, p]) => [k, (await p).events] as const)));
    expect(got.a).toEqual([expect.objectContaining({ t: "order", id: orderId, s: "confirmed" })]);
    expect(await aAt).toBeLessThan(1000); // answered on the event, not on the 3s timeout
    expect(got.b).toEqual([]);
    expect(got.kitchen).toEqual([expect.objectContaining({ t: "order", id: orderId })]);
    expect(got.mgrYun).toEqual([]); // another branch
    expect(got.sup).toEqual([expect.objectContaining({ t: "order", id: orderId })]);
  });

  it("kitchen does not get reservations; everyone gets catalog changes; stale cursors resync", async () => {
    const kitchen = await sign("staff", ids.kitchen);
    const cursor = await poll(kitchen, "staff");
    const kWait = poll(kitchen, "staff", cursor);
    const anonWait = poll(null, "customer", cursor);
    await new Promise((r) => setTimeout(r, 200));
    await q("insert into reservations (brand_id, branch_id, name, phone, starts_at, ends_at, party_size) values ($1, $2, 'R', '+998901000003', now() + interval '1 day', now() + interval '1 day 2 hours', 2)", [ids.brand, ids.chilonzor]);
    await q("update products set updated_at = now() where id = (select id from products limit 1)");
    expect((await kWait).events.map((e) => e.t)).toEqual(["catalog"]);
    expect((await anonWait).events.map((e) => e.t)).toEqual(["catalog"]);
    expect((await poll(kitchen, "staff", { ...cursor, boot: "other-process" })).events).toEqual([{ t: "resync" }]);
  });
});
