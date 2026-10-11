// PostgreSQL access. The server connects as the database owner; every request
// that acts on behalf of a customer or staff member runs inside `asActor`,
// which switches to the `authenticated` role with Supabase-style JWT claims so
// the row level security policies in supabase/migrations apply to it.
import pg from "pg";

const { Pool, types } = pg;

// int8 -> number (all money values are far below 2^53)
types.setTypeParser(20, (v: string) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new Error(`int8 out of range: ${v}`);
  return n;
});
// date stays a 'YYYY-MM-DD' string
types.setTypeParser(1082, (v: string) => v);

export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T | null>;
}

export type Actor = { kind: "customer" | "staff"; id: string } | { kind: "anon" };

const globalForPool = globalThis as unknown as { __sushiPool?: pg.Pool };

export function pool(): pg.Pool {
  if (!globalForPool.__sushiPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    globalForPool.__sushiPool = new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX || 10),
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    });
  }
  return globalForPool.__sushiPool;
}

function wrap(c: pg.Pool | pg.PoolClient): Db {
  return {
    async query<T>(text: string, params?: unknown[]) {
      const r = await c.query(text, params as unknown[]);
      return r.rows as T[];
    },
    async one<T>(text: string, params?: unknown[]) {
      const r = await c.query(text, params as unknown[]);
      return (r.rows[0] as T) ?? null;
    },
  };
}

/** Owner-level access for public catalog reads and trusted server-side services. */
export const db: Db = {
  query: (t, p) => wrap(pool()).query(t, p),
  one: (t, p) => wrap(pool()).one(t, p),
};

/** Runs `fn` in a transaction as the database owner (trusted server code only). */
export async function tx<T>(
  fn: (d: Db) => Promise<T>,
  opts: { actor?: { kind: "customer" | "staff" | "system"; id?: string }; note?: string } = {},
): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    if (opts.actor) {
      await client.query("select set_config('app.actor_kind', $1, true), set_config('app.actor_id', $2, true)", [
        opts.actor.kind,
        opts.actor.id ?? "",
      ]);
    }
    if (opts.note) await client.query("select set_config('app.status_note', $1, true)", [opts.note]);
    const out = await fn(wrap(client));
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Runs `fn` in a transaction under row level security as the given actor.
 * Policies see auth.uid() = actor.id and auth.jwt()->>'kind' = actor.kind.
 */
export async function asActor<T>(actor: Actor, fn: (d: Db) => Promise<T>, opts: { note?: string } = {}): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    const claims = actor.kind === "anon" ? { role: "anon" } : { sub: actor.id, kind: actor.kind, role: "authenticated" };
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    if (opts.note) await client.query("select set_config('app.status_note', $1, true)", [opts.note]);
    await client.query(actor.kind === "anon" ? "set local role anon" : "set local role authenticated");
    const out = await fn(wrap(client));
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export function pgErrorCode(e: unknown): string | undefined {
  return typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : undefined;
}
