// Cookie sessions. The cookie holds a signed JWT naming a row in
// public.sessions; logout and revocation take effect immediately because
// every request re-checks that row.
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import { db } from "../db";
import { isProduction, sessionSecret, siteUrl } from "../env";
import type { StaffRole } from "../order-status";

export const CUSTOMER_COOKIE = "sushi_session";
export const STAFF_COOKIE = "sushi_admin";
const CUSTOMER_TTL_DAYS = 60;
const STAFF_TTL_HOURS = 12;

type Kind = "customer" | "staff";

export interface Customer {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  loyalty_balance: number;
  is_blocked: boolean;
  preferred_lang: "uz" | "ru";
}

export interface Staff {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  branchIds: string[];
  sessionId: string;
}

async function clientMeta() {
  const h = await headers();
  return {
    ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "local",
    userAgent: (h.get("user-agent") ?? "").slice(0, 300),
  };
}

export async function clientIp(): Promise<string> {
  return (await clientMeta()).ip;
}

/**
 * `embedded`: the session is created inside a Telegram Mini App. On Telegram Web
 * the app runs in a cross-site iframe, where only SameSite=None; Secure;
 * Partitioned cookies work — so those attributes are used whenever the site is https.
 */
export async function createSession(kind: Kind, subjectId: string, opts: { embedded?: boolean } = {}): Promise<void> {
  const meta = await clientMeta();
  const ttlMs = kind === "customer" ? CUSTOMER_TTL_DAYS * 86400000 : STAFF_TTL_HOURS * 3600000;
  const expires = new Date(Date.now() + ttlMs);
  const row = await db.one<{ id: string }>(
    "insert into public.sessions (subject_kind, subject_id, expires_at, ip, user_agent) values ($1, $2, $3, $4, $5) returning id",
    [kind, subjectId, expires, meta.ip, meta.userAgent],
  );
  const token = await new SignJWT({ kind, sid: row!.id })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subjectId)
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(sessionSecret());
  const cross = opts.embedded && (isProduction || siteUrl().startsWith("https://"));
  (await cookies()).set(kind === "customer" ? CUSTOMER_COOKIE : STAFF_COOKIE, token, {
    httpOnly: true,
    secure: isProduction || Boolean(cross),
    sameSite: cross ? "none" : "lax",
    partitioned: cross || undefined,
    path: "/",
    expires,
  });
}

async function readSession(kind: Kind): Promise<{ sid: string; sub: string } | null> {
  const token = (await cookies()).get(kind === "customer" ? CUSTOMER_COOKIE : STAFF_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    if (payload.kind !== kind || typeof payload.sid !== "string" || typeof payload.sub !== "string") return null;
    const live = await db.one(
      "select 1 from public.sessions where id = $1 and subject_kind = $2 and subject_id = $3 and revoked_at is null and expires_at > now()",
      [payload.sid, kind, payload.sub],
    );
    return live ? { sid: payload.sid, sub: payload.sub } : null;
  } catch {
    return null;
  }
}

export const getCustomer = cache(async (): Promise<Customer | null> => {
  const s = await readSession("customer");
  if (!s) return null;
  return db.one<Customer>(
    "select id, phone, name, email, loyalty_balance, is_blocked, preferred_lang from public.customers where id = $1",
    [s.sub],
  );
});

export const getStaff = cache(async (): Promise<Staff | null> => {
  const s = await readSession("staff");
  if (!s) return null;
  const row = await db.one<Omit<Staff, "sessionId">>(
    `select s.id, s.email, s.name, s.role,
            coalesce(array_agg(sb.branch_id) filter (where sb.branch_id is not null), '{}') as "branchIds"
       from public.staff s left join public.staff_branches sb on sb.staff_id = s.id
      where s.id = $1 and s.is_active
      group by s.id`,
    [s.sub],
  );
  return row ? { ...row, sessionId: s.sid } : null;
});

export async function destroySession(kind: Kind): Promise<void> {
  const s = await readSession(kind);
  if (s) await db.query("update public.sessions set revoked_at = now() where id = $1", [s.sid]);
  (await cookies()).delete(kind === "customer" ? CUSTOMER_COOKIE : STAFF_COOKIE);
}
