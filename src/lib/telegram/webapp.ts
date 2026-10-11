// Telegram Mini App (Web App) support: validation of the signed launch data
// (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
// and account resolution for automatic login inside Telegram.
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "../db";
import { botToken } from "./api";

export interface WebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

/**
 * Verifies a Telegram-signed query string (Mini App initData, or the signed
 * `response` of WebApp.requestContact) and returns its fields, or null.
 * data_check_string = every field except `hash`, sorted, joined as "k=v\n";
 * secret = HMAC_SHA256(key "WebAppData", bot token); hash = hex HMAC(secret, dcs).
 */
export function verifySigned(raw: string, maxAgeSec = 86400, now = Date.now()): Record<string, string> | null {
  const token = botToken();
  if (!token || !raw || raw.length > 8192) return null;
  const params = new URLSearchParams(raw);
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  const fields: Record<string, string> = {};
  for (const [k, v] of params) if (k !== "hash") fields[k] = v;
  const dcs = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const expected = createHmac("sha256", secret).update(dcs).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, "hex"))) return null;
  const authDate = Number(fields.auth_date);
  if (!Number.isFinite(authDate) || now / 1000 - authDate > maxAgeSec || authDate - now / 1000 > 300) return null;
  return fields;
}

export function parseInitData(raw: string, now = Date.now()): { user: WebAppUser; fields: Record<string, string> } | null {
  const fields = verifySigned(raw, 86400, now);
  if (!fields?.user) return null;
  try {
    const user = JSON.parse(fields.user) as WebAppUser;
    return Number.isSafeInteger(user.id) && user.id > 0 ? { user, fields } : null;
  } catch {
    return null;
  }
}

/** Contact shared via WebApp.requestContact, only if signed and belonging to `userId`. */
export function parseContact(raw: string | undefined, userId: number, now = Date.now()): string | null {
  if (!raw) return null;
  const fields = verifySigned(raw, 600, now);
  if (!fields?.contact) return null;
  try {
    const c = JSON.parse(fields.contact) as { user_id?: number; phone_number?: string };
    return c.user_id === userId && c.phone_number ? c.phone_number : null;
  } catch {
    return null;
  }
}

/** In a private chat the chat id equals the user id, so bot links and Mini App logins share one row. */
export async function touchChat(user: WebAppUser) {
  await db.query(
    `insert into public.telegram_chats (chat_id, username, first_name, lang) values ($1, $2, $3, $4)
     on conflict (chat_id) do update set username = excluded.username, first_name = excluded.first_name, updated_at = now()`,
    [user.id, user.username ?? null, user.first_name?.slice(0, 80) ?? null, user.language_code === "ru" ? "ru" : "uz"],
  );
}

export async function linkCustomerPhone(user: WebAppUser, phone: string): Promise<string | null> {
  const name = (user.first_name || "").trim().slice(0, 80) || null;
  await db.query("insert into public.customers (phone, name, preferred_lang) values ($1, $2, $3) on conflict (phone) do nothing", [
    phone,
    name,
    user.language_code === "ru" ? "ru" : "uz",
  ]);
  const cu = await db.one<{ id: string }>("select id from public.customers where phone = $1", [phone]);
  if (!cu) return null;
  await db.query("update public.telegram_chats set customer_id = $2, updated_at = now() where chat_id = $1", [user.id, cu.id]);
  return cu.id;
}

export async function linkedAccount(userId: number) {
  return db.one<{ customer_id: string | null; customer_blocked: boolean | null; staff_id: string | null }>(
    `select c.customer_id, cu.is_blocked as customer_blocked, s.id as staff_id
       from public.telegram_chats c
       left join public.customers cu on cu.id = c.customer_id
       left join public.staff s on s.id = c.staff_id and s.is_active
      where c.chat_id = $1`,
    [userId],
  );
}
