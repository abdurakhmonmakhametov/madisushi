// Applies SQL migrations in supabase/migrations in order, once each.
// On a plain PostgreSQL (no `auth` schema) it first applies the local
// Supabase shim. `--reset` drops everything first and is refused for
// non-local databases.
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { loadEnv } from "./env";

loadEnv();

export async function migrate(url: string, opts: { reset?: boolean; log?: (m: string) => void } = {}) {
  const log = opts.log ?? console.log;
  const client = new Client({ connectionString: url, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  try {
    const host = new URL(url).hostname;
    if (opts.reset) {
      if (!["127.0.0.1", "localhost"].includes(host)) throw new Error("--reset is only allowed on a local database");
      log("[migrate] resetting database");
      await client.query("drop schema if exists public cascade; drop schema if exists app cascade; create schema public; grant usage on schema public to public;");
    }
    const hasAuth = (await client.query("select 1 from pg_namespace where nspname = 'auth'")).rowCount;
    if (!hasAuth) {
      log("[migrate] applying local Supabase shim");
      await client.query(fs.readFileSync(path.resolve("supabase/local/00_supabase_shim.sql"), "utf8"));
    }
    await client.query("create schema if not exists app; create table if not exists app.migrations (name text primary key, applied_at timestamptz not null default now())");
    const done = new Set((await client.query("select name from app.migrations")).rows.map((r) => r.name));
    const dir = path.resolve("supabase/migrations");
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      if (done.has(file)) continue;
      log(`[migrate] applying ${file}`);
      await client.query("begin");
      try {
        await client.query(fs.readFileSync(path.join(dir, file), "utf8"));
        await client.query("insert into app.migrations (name) values ($1)", [file]);
        await client.query("commit");
      } catch (e) {
        await client.query("rollback");
        throw new Error(`${file}: ${(e as Error).message}`);
      }
    }
    log("[migrate] up to date");
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.includes("migrate")) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  migrate(url, { reset: process.argv.includes("--reset") }).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
