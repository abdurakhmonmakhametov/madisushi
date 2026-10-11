// Webhook mode (TELEGRAM_MODE=webhook): the bot runs inside the web server
// instead of the `npm run bot` worker, for hosts without background workers
// (e.g. Render's free plan). Telegram POSTs updates to /api/telegram/webhook
// (which also wakes a sleeping free instance); this module registers that URL
// and delivers outbox notifications (LISTEN for instant pickup + a sweep).
import { createHmac } from "node:crypto";
import pg from "pg";
import { pool } from "../db";
import { sessionSecret, siteUrl } from "../env";
import { botToken, tg } from "./api";
import { BOT_COMMANDS, drainOutbox, setDefaultMenuButton } from "./bot";

const SWEEP_MS = 15000;
// Same key as the polling worker: whoever holds it is the only sender.
const LOCK_KEY = "hashtext('sushi-telegram-bot')";

export function webhookMode(): boolean {
  return process.env.TELEGRAM_MODE === "webhook";
}

/** Checked against Telegram's X-Telegram-Bot-Api-Secret-Token header (allowed chars: A-Z a-z 0-9 _ -). */
export function webhookSecret(): string {
  return process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || createHmac("sha256", sessionSecret()).update("telegram-webhook").digest("hex");
}

let draining = false;
let again = false;

/** Sends pending outbox events. Skips when another process (an older instance, a worker) holds the lock. */
export function kickOutbox() {
  if (draining) {
    again = true;
    return;
  }
  draining = true;
  void (async () => {
    try {
      do {
        again = false;
        const c = await pool().connect();
        try {
          if (!(await c.query(`select pg_try_advisory_lock(${LOCK_KEY}) as ok`)).rows[0].ok) break;
          try {
            while ((await drainOutbox()) > 0);
          } finally {
            await c.query(`select pg_advisory_unlock(${LOCK_KEY})`);
          }
        } finally {
          c.release();
        }
      } while (again);
    } catch (e) {
      console.error("[telegram] drain", (e as Error).message);
    } finally {
      draining = false;
    }
  })();
}

function listen() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  let failed = false;
  const retry = (e: Error) => {
    if (failed) return;
    failed = true;
    console.warn("[telegram] outbox listener", e.message, "— retrying (the sweep keeps delivering)");
    client.removeAllListeners();
    client.end().catch(() => {});
    setTimeout(listen, 5000).unref();
  };
  client.on("error", retry);
  client
    .connect()
    .then(() => client.query("listen telegram_outbox"))
    .then(() => client.on("notification", kickOutbox))
    .catch(retry);
}

/** Called once per server process from src/instrumentation.ts. */
export async function startWebhookMode() {
  const g = globalThis as unknown as { __sushiTgWebhook?: boolean };
  if (g.__sushiTgWebhook) return;
  g.__sushiTgWebhook = true;
  if (!botToken()) return console.warn("[telegram] webhook mode: TELEGRAM_BOT_TOKEN is not set, bot disabled");
  const url = `${siteUrl()}/api/telegram/webhook`;
  if (!url.startsWith("https://")) return console.warn(`[telegram] webhook mode needs a public https site URL (got ${url}), bot disabled`);

  listen();
  setInterval(kickOutbox, SWEEP_MS).unref();
  kickOutbox();
  try {
    await tg("setWebhook", { url, secret_token: webhookSecret(), allowed_updates: ["message", "callback_query"], max_connections: 10 });
    await tg("setMyCommands", { commands: BOT_COMMANDS });
    await setDefaultMenuButton();
    console.log(`[telegram] webhook mode: ${url}`);
  } catch (e) {
    console.error("[telegram] webhook registration failed:", (e as Error).message);
  }
}
