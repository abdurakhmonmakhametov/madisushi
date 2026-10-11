// Pluggable delivery for OTP codes.
//
//  - "console":  development only. Logs the message on the server and lets the
//    login screen display the code. Refused in production.
//  - "telegram": sends the code through our Telegram bot to the chat linked to
//    that phone number (the customer shares their contact with the bot once).
//    Free, and works in production.
//  - "eskiz":    Eskiz.uz. NOT IMPLEMENTED: its API must be integrated against
//    Eskiz's current documentation with real credentials before use. Until
//    then selecting it fails loudly instead of silently not sending codes.
import { db } from "../db";
import { isProduction } from "../env";
import { botToken, esc, tg, TelegramError } from "../telegram/api";

export interface SmsProvider {
  id: string;
  /** Where the customer should look for the code. */
  channel: "sms" | "telegram";
  /** True when codes are not really delivered and may be shown on screen. */
  exposesCodes: boolean;
  /** Throws OtpNotDeliverableError when this phone cannot receive a code at all. */
  precheck?(phone: string): Promise<void>;
  send(phone: string, text: string): Promise<void>;
}

const consoleProvider: SmsProvider = {
  id: "console",
  channel: "sms",
  exposesCodes: true,
  async send(phone, text) {
    console.log(`[sms:console] to ${phone}: ${text}`);
  },
};

export class SmsNotConfiguredError extends Error {}

/** The phone has no delivery route yet (Telegram: not linked to the bot). */
export class OtpNotDeliverableError extends Error {}

async function linkedChats(phone: string): Promise<number[]> {
  const rows = await db.query<{ chat_id: number }>(
    `select t.chat_id from public.telegram_chats t
       join public.customers c on c.id = t.customer_id
      where c.phone = $1 and not t.blocked and not c.is_blocked`,
    [phone],
  );
  return rows.map((r) => Number(r.chat_id));
}

const telegramProvider: SmsProvider = {
  id: "telegram",
  channel: "telegram",
  exposesCodes: false,
  async precheck(phone) {
    if (!(await linkedChats(phone)).length) throw new OtpNotDeliverableError("telegram_not_linked");
  },
  async send(phone, text) {
    const chats = await linkedChats(phone);
    let delivered = 0;
    let failure: Error | null = null;
    for (const chatId of chats) {
      try {
        // the 6-digit code becomes tap-to-copy
        await tg("sendMessage", { chat_id: chatId, text: `🔐 ${esc(text).replace(/\b(\d{6})\b/, "<code>$1</code>")}`, parse_mode: "HTML" });
        delivered++;
      } catch (e) {
        if (e instanceof TelegramError && e.chatGone) await db.query("update public.telegram_chats set blocked = true where chat_id = $1", [chatId]);
        else failure = e as Error;
      }
    }
    if (delivered) return;
    // Telegram down / bad token is our problem, not the customer's: don't ask them to re-link.
    if (failure) throw new SmsNotConfiguredError(`Telegram delivery failed: ${failure.message}`);
    throw new OtpNotDeliverableError("telegram_not_linked");
  },
};

/** t.me link that opens the bot so a customer can share their number. */
export function botLoginLink(): string | null {
  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "").trim();
  return username ? `https://t.me/${username}?start=login` : null;
}

export function smsProvider(): SmsProvider {
  const id = process.env.SMS_PROVIDER || "console";
  if (id === "console") {
    if (isProduction) throw new SmsNotConfiguredError("The console SMS provider is disabled in production. Configure a real SMS provider.");
    return consoleProvider;
  }
  if (id === "telegram") {
    if (!botToken()) throw new SmsNotConfiguredError("SMS_PROVIDER=telegram needs TELEGRAM_BOT_TOKEN.");
    return telegramProvider;
  }
  if (id === "eskiz") {
    throw new SmsNotConfiguredError(
      "SMS_PROVIDER=eskiz is not implemented yet. Implement src/lib/integrations/sms.ts against Eskiz's current docs.",
    );
  }
  throw new SmsNotConfiguredError(`Unknown SMS_PROVIDER "${id}"`);
}

export function smsStatus(): { provider: string; ready: boolean; note: string } {
  const id = process.env.SMS_PROVIDER || "console";
  if (id === "console") {
    return isProduction
      ? { provider: id, ready: false, note: "Console provider is refused in production" }
      : { provider: id, ready: true, note: "Development: codes are printed and shown on screen" };
  }
  if (id === "telegram") {
    return botToken()
      ? { provider: id, ready: true, note: "Codes are sent by the Telegram bot to the customer's linked chat" }
      : { provider: id, ready: false, note: "TELEGRAM_BOT_TOKEN is not set" };
  }
  return { provider: id, ready: false, note: "Provider adapter not implemented" };
}
