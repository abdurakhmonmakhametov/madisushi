// Phone OTP sign-in. Codes are stored as HMACs, expire after 5 minutes and
// allow 5 attempts. Requests and verifications are rate limited per phone
// and per IP.
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { db, tx } from "../db";
import { sessionSecret } from "../env";
import { smsProvider } from "../integrations/sms";
import { enforce } from "./ratelimit";

const TTL_SECONDS = 300;
const MAX_ATTEMPTS = 5;

/** Normalizes Uzbek phone numbers to +998XXXXXXXXX, or null if invalid. */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  // tolerate a pasted full number after the prefilled "+998 " prefix
  if (digits.length === 15 && digits.startsWith("998998")) digits = digits.slice(3);
  const nine = digits.length === 12 && digits.startsWith("998") ? digits.slice(3) : digits.length === 9 ? digits : null;
  if (!nine || !/^(33|50|55|77|88|90|91|93|94|95|97|98|99|20|71)\d{7}$/.test(nine)) return null;
  return `+998${nine}`;
}

function codeHash(phone: string, code: string): string {
  return createHmac("sha256", sessionSecret()).update(`${phone}:${code}`).digest("hex");
}

export async function requestOtp(phone: string, ip: string): Promise<{ devCode?: string; channel: "sms" | "telegram" }> {
  await enforce([[`otp:ip:${ip}:1h`, 20, 3600]]);
  const provider = smsProvider();
  // Before the per-phone limits, so "link your Telegram first, then retry" isn't rate limited.
  await provider.precheck?.(phone);
  await enforce([
    [`otp:phone:${phone}:1m`, 1, 60],
    [`otp:phone:${phone}:1h`, 5, 3600],
  ]);
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  await db.query(
    "insert into public.otp_codes (phone, code_hash, expires_at) values ($1, $2, now() + make_interval(secs => $3))",
    [phone, codeHash(phone, code), TTL_SECONDS],
  );
  await provider.send(phone, `SUSHI: tasdiqlash kodi ${code}. Hech kimga bermang.`);
  return provider.exposesCodes ? { devCode: code, channel: provider.channel } : { channel: provider.channel };
}

/** Returns the customer id on success, null on a wrong/expired code. */
export async function verifyOtp(phone: string, code: string, ip: string): Promise<string | null> {
  await enforce([
    [`otp-verify:ip:${ip}:1h`, 30, 3600],
    [`otp-verify:phone:${phone}:1h`, 15, 3600],
  ]);
  if (!/^\d{6}$/.test(code)) return null;
  return tx(async (d) => {
    const row = await d.one<{ id: string; code_hash: string; attempts: number }>(
      `select id, code_hash, attempts from public.otp_codes
        where phone = $1 and consumed_at is null and expires_at > now()
        order by created_at desc limit 1 for update`,
      [phone],
    );
    if (!row || row.attempts >= MAX_ATTEMPTS) return null;
    const a = Buffer.from(row.code_hash, "hex");
    const b = Buffer.from(codeHash(phone, code), "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      await d.query("update public.otp_codes set attempts = attempts + 1 where id = $1", [row.id]);
      return null;
    }
    await d.query("update public.otp_codes set consumed_at = now() where id = $1", [row.id]);
    const customer = await d.one<{ id: string }>(
      `insert into public.customers (phone) values ($1)
       on conflict (phone) do update set phone = excluded.phone
       returning id`,
      [phone],
    );
    return customer!.id;
  });
}
