"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asActor, pgErrorCode } from "@/lib/db";
import { assertStaff, ForbiddenError } from "@/lib/admin/guard";
import { makeL } from "@/lib/admin/l";
import { getLang } from "@/lib/i18n/server";
import { setReservationStatus } from "@/lib/services/reservations";
import type { ActionState } from "@/components/admin/ui";

async function handle(fn: (L: ReturnType<typeof makeL>) => Promise<ActionState>): Promise<ActionState> {
  const L = makeL(await getLang());
  try {
    return await fn(L);
  } catch (e) {
    if (e instanceof ForbiddenError || pgErrorCode(e) === "42501") return { error: L("Ruxsat yo'q", "Нет доступа") };
    if (e instanceof z.ZodError) return { error: L("Maydonlarni tekshiring", "Проверьте поля") };
    const msg = e instanceof Error ? e.message : "";
    if (/below zero/.test(msg)) return { error: L("Balans manfiy bo'lib qolmasligi kerak", "Баланс не может стать отрицательным") };
    if (/reason is required/.test(msg)) return { error: L("Sabab kiriting (kamida 3 belgi)", "Укажите причину (минимум 3 символа)") };
    if (/invalid amount/.test(msg)) return { error: L("Noto'g'ri summa", "Неверная сумма") };
    if (/not allowed/.test(msg)) return { error: L("Ruxsat yo'q", "Нет доступа") };
    console.error("[admin/ops]", e);
    return { error: L("Xatolik yuz berdi", "Произошла ошибка") };
  }
}

export async function reservationStatusAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async (L) => {
    const staff = await assertStaff("reservations");
    const id = z.string().uuid().parse(fd.get("id"));
    const to = z.enum(["confirmed", "rejected", "cancelled", "seated", "no_show"]).parse(fd.get("to"));
    const note = String(fd.get("note") ?? "").trim().slice(0, 300) || null;
    const r = await setReservationStatus(staff, id, to, note);
    if (r !== "ok") return { error: r === "invalid" ? L("Bu holatga o'tib bo'lmaydi", "Переход невозможен") : L("Ruxsat yo'q", "Нет доступа") };
    revalidatePath("/admin/reservations");
    return { ok: true };
  });
}

export async function loyaltyAdjustAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async (L) => {
    const staff = await assertStaff("customers");
    const customerId = z.string().uuid().parse(fd.get("customerId"));
    const amount = z.coerce.number().int().min(-10_000_000).max(10_000_000).refine((v) => v !== 0).parse(String(fd.get("amount") ?? "").replace(/\s/g, ""));
    const note = String(fd.get("note") ?? "").trim().slice(0, 300);
    // app.staff_adjust_loyalty checks the role, customer visibility, reason and balance, and writes the audit log.
    await asActor({ kind: "staff", id: staff.id }, (d) => d.query("select app.staff_adjust_loyalty($1, $2, $3)", [customerId, amount, note]));
    revalidatePath(`/admin/customers/${customerId}`);
    return { ok: true, message: L("Balans yangilandi", "Баланс обновлён") };
  });
}

export async function customerBlockAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async (L) => {
    const staff = await assertStaff("customers");
    const customerId = z.string().uuid().parse(fd.get("customerId"));
    const blocked = fd.get("blocked") === "true";
    await asActor({ kind: "staff", id: staff.id }, (d) => d.query("select app.staff_set_customer_blocked($1, $2)", [customerId, blocked]));
    revalidatePath(`/admin/customers/${customerId}`);
    return { ok: true, message: blocked ? L("Bloklandi", "Заблокирован") : L("Blokdan chiqarildi", "Разблокирован") };
  });
}

export async function feedbackStatusAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const staff = await assertStaff("feedback");
    const id = z.string().uuid().parse(fd.get("id"));
    const status = z.enum(["new", "read", "archived"]).parse(fd.get("status"));
    await asActor({ kind: "staff", id: staff.id }, (d) => d.query("update public.feedback set status = $2 where id = $1", [id, status]));
    revalidatePath("/admin/feedback");
    return { ok: true };
  });
}
