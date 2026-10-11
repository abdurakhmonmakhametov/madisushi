"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, createSession, destroySession } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { hit } from "@/lib/auth/ratelimit";
import { getLang } from "@/lib/i18n/server";
import { makeL } from "@/lib/admin/l";
import type { ActionState } from "@/components/admin/ui";

// A valid hash for a random password, so unknown emails cost the same time.
const DUMMY = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$ZmFrZWZha2VmYWtlZmFrZWZha2VmYWtlZmFrZWZha2U=";

export async function staffLogin(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const L = makeL(await getLang());
  const parsed = z.object({ email: z.string().email().max(120), password: z.string().min(1).max(200) }).safeParse({
    email: String(fd.get("email") ?? "").trim().toLowerCase(),
    password: String(fd.get("password") ?? ""),
  });
  if (!parsed.success) return { error: L("Email yoki parol noto'g'ri", "Неверный email или пароль") };
  const ip = await clientIp();
  if (!(await hit(`staff-login:ip:${ip}`, 20, 900)) || !(await hit(`staff-login:email:${parsed.data.email}`, 8, 900))) {
    return { error: L("Juda ko'p urinish. 15 daqiqadan so'ng qayta urinib ko'ring.", "Слишком много попыток. Повторите через 15 минут.") };
  }
  const row = await db.one<{ id: string; password_hash: string; is_active: boolean }>(
    "select s.id, c.password_hash, s.is_active from public.staff s join public.staff_credentials c on c.staff_id = s.id where lower(s.email) = $1",
    [parsed.data.email],
  );
  const ok = await verifyPassword(parsed.data.password, row?.password_hash ?? DUMMY);
  if (!row || !ok || !row.is_active) return { error: L("Email yoki parol noto'g'ri", "Неверный email или пароль") };
  await createSession("staff", row.id);
  await db.query("insert into public.audit_logs (actor_kind, actor_id, action, entity, entity_id, data) values ('staff', $1::uuid, 'staff.login', 'staff', $1::text, $2)", [
    row.id,
    JSON.stringify({ ip }),
  ]);
  redirect("/admin");
}

export async function staffLogout() {
  await destroySession("staff");
  redirect("/admin/login");
}
