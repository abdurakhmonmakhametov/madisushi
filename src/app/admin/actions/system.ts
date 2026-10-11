"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asActor, pgErrorCode, tx } from "@/lib/db";
import { assertStaff, ForbiddenError } from "@/lib/admin/guard";
import { makeL } from "@/lib/admin/l";
import { getLang } from "@/lib/i18n/server";
import { hashPassword } from "@/lib/auth/password";
import { PUBLIC_KEYS, settingSchemas, type SettingKey } from "@/lib/settings";
import { saveImage, UploadError } from "@/lib/integrations/storage";
import type { ActionState } from "@/components/admin/ui";

async function handle(fn: (L: ReturnType<typeof makeL>) => Promise<ActionState>): Promise<ActionState> {
  const L = makeL(await getLang());
  try {
    return await fn(L);
  } catch (e) {
    if (e instanceof ForbiddenError || pgErrorCode(e) === "42501") return { error: L("Ruxsat yo'q", "Нет доступа") };
    if (e instanceof z.ZodError) return { error: `${L("Maydonlarni tekshiring", "Проверьте поля")}: ${e.issues.map((i) => i.path.join(".")).join(", ")}` };
    if (e instanceof UploadError) return { error: `${L("Rasm yuklanmadi", "Изображение не загружено")}: ${e.message}` };
    if (pgErrorCode(e) === "23505") return { error: L("Bunday email allaqachon mavjud", "Такой email уже существует") };
    console.error("[admin/system]", e);
    return { error: L("Xatolik yuz berdi", "Произошла ошибка") };
  }
}

const i18n = (fd: FormData, k: string) => ({ uz: String(fd.get(`${k}_uz`) ?? "").trim(), ru: String(fd.get(`${k}_ru`) ?? "").trim() });
const on = (fd: FormData, k: string) => fd.get(k) === "on";
const num = (fd: FormData, k: string) => Number(String(fd.get(k) ?? "").replace(/\s/g, ""));

/** Builds a setting value from the form for the given key and validates it with its schema. */
async function valueFor(key: SettingKey, fd: FormData): Promise<unknown> {
  switch (key) {
    case "branding": {
      const file = fd.get("logo");
      const logoUrl = file instanceof File && file.size > 0 ? await saveImage(file, "branding") : fd.get("removeLogo") === "on" ? null : String(fd.get("currentLogo") ?? "") || null;
      return { platformName: String(fd.get("platformName") ?? "").trim(), logoUrl, primaryColor: String(fd.get("primaryColor") ?? ""), footerText: i18n(fd, "footerText") };
    }
    case "contacts":
      return { phone: String(fd.get("phone") ?? ""), email: String(fd.get("email") ?? ""), address: i18n(fd, "address"), hours: i18n(fd, "hours"), telegram: String(fd.get("telegram") ?? ""), instagram: String(fd.get("instagram") ?? "") };
    case "languages":
      return { default: String(fd.get("default") ?? "uz"), enabled: fd.getAll("enabled").map(String) };
    case "loyalty":
      return { enabled: on(fd, "enabled"), earn_bps: Math.round(num(fd, "earnPercent") * 100), max_spend_amount: num(fd, "maxSpendAmount"), max_spend_bps: Math.round(num(fd, "maxSpendPercent") * 100) };
    case "scheduling":
      return { slot_minutes: num(fd, "slotMinutes"), max_days_ahead: num(fd, "maxDaysAhead") };
    case "checkout":
      return { leave_at_door_enabled: on(fd, "leaveAtDoor"), order_for_other_enabled: on(fd, "forOther"), delivery_info_note: i18n(fd, "deliveryNote") };
    case "notifications":
      return { new_order_email: String(fd.get("email") ?? ""), telegram_chat_id: String(fd.get("telegram") ?? ""), notify_on_new_order: on(fd, "onOrder"), notify_on_reservation: on(fd, "onReservation") };
    case "home":
      return { show_promotions: on(fd, "showPromotions"), show_bestsellers: on(fd, "showBestsellers"), bestsellers_limit: num(fd, "bestsellersLimit") };
  }
}

export async function saveSettingAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async (L) => {
    const staff = await assertStaff("settings");
    const key = z.enum(Object.keys(settingSchemas) as [SettingKey, ...SettingKey[]]).parse(fd.get("key"));
    const value = settingSchemas[key].parse(await valueFor(key, fd));
    await asActor({ kind: "staff", id: staff.id }, async (d) => {
      await d.query(
        "insert into public.settings (key, value, is_public, updated_at) values ($1, $2, $3, now()) on conflict (key) do update set value = excluded.value, updated_at = now()",
        [key, JSON.stringify(value), PUBLIC_KEYS.includes(key)],
      );
      await d.query("insert into public.audit_logs (actor_kind, actor_id, action, entity, entity_id, data) values ('staff', $1, 'settings.update', 'settings', $2, $3)", [staff.id, key, JSON.stringify(value)]);
    });
    revalidatePath("/", "layout");
    return { ok: true, message: L("Saqlandi", "Сохранено") };
  });
}

export async function saveStaffAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async (L) => {
    const admin = await assertStaff("staff");
    const id = fd.get("id") ? z.string().uuid().parse(fd.get("id")) : null;
    const v = {
      email: z.string().trim().toLowerCase().email().max(120).parse(fd.get("email")),
      name: z.string().trim().min(1).max(80).parse(fd.get("name")),
      role: z.enum(["super_admin", "branch_manager", "kitchen"]).parse(fd.get("role")),
      active: on(fd, "isActive"),
      branches: fd.getAll("branches").map(String).filter((b) => /^[0-9a-f-]{36}$/i.test(b)),
    };
    const password = String(fd.get("password") ?? "");
    if ((!id || password) && password.length < 10) return { error: L("Parol kamida 10 belgidan iborat bo'lsin", "Пароль должен быть не короче 10 символов") };
    if (id === admin.id && (!v.active || v.role !== "super_admin")) return { error: L("O'zingizni o'chira yoki rolingizni pasaytira olmaysiz", "Нельзя отключить себя или понизить свою роль") };
    const hash = password ? await hashPassword(password) : null;
    const staffId = await asActor({ kind: "staff", id: admin.id }, async (d) => {
      let sid = id;
      if (id) {
        await d.query("update public.staff set email=$2, name=$3, role=$4, is_active=$5 where id=$1", [id, v.email, v.name, v.role, v.active]);
      } else {
        sid = (await d.one<{ id: string }>("insert into public.staff (email, name, role, is_active) values ($1,$2,$3,$4) returning id", [v.email, v.name, v.role, v.active]))!.id;
      }
      await d.query("delete from public.staff_branches where staff_id = $1", [sid]);
      if (v.role !== "super_admin") for (const b of v.branches) await d.query("insert into public.staff_branches values ($1, $2)", [sid, b]);
      await d.query("insert into public.audit_logs (actor_kind, actor_id, action, entity, entity_id, data) values ('staff', $1, $2, 'staff', $3, $4)", [
        admin.id,
        id ? "staff.update" : "staff.create",
        sid,
        JSON.stringify({ ...v, passwordChanged: Boolean(hash) }),
      ]);
      return sid!;
    });
    // Credentials and sessions are server-only tables (no RLS policies): write
    // them after the RLS-checked transaction above has committed.
    if (hash) {
      await tx((o) => o.query("insert into public.staff_credentials (staff_id, password_hash) values ($1, $2) on conflict (staff_id) do update set password_hash = excluded.password_hash, updated_at = now()", [staffId, hash]));
    }
    if (!v.active || hash) {
      await tx((o) => o.query("update public.sessions set revoked_at = now() where subject_kind = 'staff' and subject_id = $1 and revoked_at is null", [staffId]));
    }
    revalidatePath("/admin/staff");
    return { ok: true, message: L("Saqlandi", "Сохранено") };
  });
}
