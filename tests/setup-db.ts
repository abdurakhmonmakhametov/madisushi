// Prepares a fresh `sushi_test` database on the local cluster (npm run db:start)
// with migrations + seed, and points the app code at it.
import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { migrate } from "../scripts/migrate";

const BASE = process.env.TEST_DATABASE_BASE ?? "postgres://postgres:postgres@127.0.0.1:54329";
export const TEST_URL = `${BASE}/sushi_test`;

export async function prepareTestDb() {
  process.env.DATABASE_URL = TEST_URL;
  process.env.SESSION_SECRET ??= "integration-test-secret-integration-test-secret";
  process.env.PAYMENT_METHODS = "cash,card_on_delivery,click,payme,mock";
  process.env.CLICK_SERVICE_ID = "777";
  process.env.CLICK_MERCHANT_ID = "888";
  process.env.CLICK_SECRET_KEY = "click-test-secret";
  process.env.PAYME_MERCHANT_ID = "test-merchant";
  process.env.PAYME_KEY = "payme-test-key";

  const admin = new Client({ connectionString: `${BASE}/postgres` });
  await admin.connect();
  const exists = await admin.query("select 1 from pg_database where datname = 'sushi_test'");
  if (!exists.rowCount) await admin.query("create database sushi_test encoding 'UTF8' lc_collate 'C' lc_ctype 'C' template template0");
  await admin.end();

  await migrate(TEST_URL, { reset: true, log: () => {} });
  execFileSync(process.execPath, ["--import", "tsx", "scripts/seed.ts"], {
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: "pipe",
  });
}
