// Telegram bot worker: `npm run bot`.
// - long-polls Telegram for messages/button presses (no public URL needed)
// - LISTENs on the `telegram_outbox` channel and drains notifications instantly
//   (with a 5s safety sweep in case a NOTIFY is missed)
// Run exactly one instance; an advisory lock refuses a second one.
import pg from "pg";
import { loadEnv } from "./env";

loadEnv();

const { tg, botToken } = await import("../src/lib/telegram/api");
const { handleUpdate, drainOutbox, BOT_COMMANDS, setDefaultMenuButton } = await import("../src/lib/telegram/bot");
const { pool } = await import("../src/lib/db");

if (!botToken()) {
  console.error("TELEGRAM_BOT_TOKEN is not set (see .env.example). Create a bot with @BotFather.");
  process.exit(1);
}

const lockClient = await pool().connect();
const locked = (await lockClient.query("select pg_try_advisory_lock(hashtext('sushi-telegram-bot')) as ok")).rows[0].ok;
if (!locked) {
  console.error("Another bot worker is already running.");
  process.exit(1);
}

const me = await tg<{ username: string }>("getMe");
// Polling and webhooks are mutually exclusive on Telegram's side. A webhook
// means the deployed site (TELEGRAM_MODE=webhook) runs this bot: don't steal it.
const hook = await tg<{ url: string }>("getWebhookInfo");
if (hook.url && process.env.BOT_FORCE_POLLING !== "true") {
  console.error(`[bot] @${me.username} is served by a webhook (${hook.url}), i.e. the deployed site.`);
  console.error("[bot] Starting this worker would disconnect it. Use a separate test bot token for local development,");
  console.error("[bot] or set BOT_FORCE_POLLING=true to take the bot over (the site re-registers its webhook on its next start).");
  process.exit(1);
}
await tg("deleteWebhook", { drop_pending_updates: false });
await tg("setMyCommands", { commands: BOT_COMMANDS });
if (!(await setDefaultMenuButton()))
  console.warn("[bot] Mini App disabled: NEXT_PUBLIC_SITE_URL must be a public https URL (e.g. a tunnel in dev)");
console.log(`[bot] @${me.username} running`);
if (process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") !== me.username)
  console.warn(`[bot] set TELEGRAM_BOT_USERNAME=${me.username} in .env.local so /admin/telegram can make link buttons`);

let stopping = false;
let draining: Promise<void> | null = null;
let again = false;

function drain() {
  if (draining) {
    again = true;
    return;
  }
  draining = (async () => {
    do {
      again = false;
      try {
        while ((await drainOutbox()) > 0 && !stopping);
      } catch (e) {
        console.error("[bot] drain", (e as Error).message);
      }
    } while (again && !stopping);
    draining = null;
  })();
}

const listener = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });
await listener.connect();
await listener.query("listen telegram_outbox");
listener.on("notification", drain);
listener.on("error", (e) => {
  console.error("[bot] listener", e.message, "— relying on the periodic sweep");
});
const sweep = setInterval(drain, 5000);
drain();

let offset = 0;
const abort = new AbortController();

async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log("[bot] stopping");
  clearInterval(sweep);
  abort.abort();
  await draining;
  await listener.end().catch(() => {});
  lockClient.release();
  await pool().end();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

while (!stopping) {
  try {
    const updates = await tg<import("../src/lib/telegram/api").TgUpdate[]>(
      "getUpdates",
      { offset, timeout: 25, allowed_updates: ["message", "callback_query"] },
      abort.signal,
    );
    for (const u of updates) {
      offset = u.update_id + 1;
      // Handle each update without blocking the poll loop on slow ones.
      void handleUpdate(u);
    }
  } catch (e) {
    if (stopping) break;
    console.error("[bot] poll", (e as Error).message);
    await new Promise((r) => setTimeout(r, 3000));
  }
}
