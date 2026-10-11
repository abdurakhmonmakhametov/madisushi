"use server";

import { revalidatePath } from "next/cache";
import { assertStaff, ForbiddenError } from "@/lib/admin/guard";
import { makeL } from "@/lib/admin/l";
import { getLang } from "@/lib/i18n/server";
import { CANCEL_REASONS, type OrderStatus } from "@/lib/order-status";
import { setPaymentStatus, transitionOrder } from "@/lib/services/orders";
import type { ActionState } from "@/components/admin/ui";

const STATUSES: OrderStatus[] = ["confirmed", "preparing", "ready", "out_for_delivery", "delivered", "picked_up", "cancelled"];

export async function orderStatusAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const L = makeL(await getLang());
  try {
    const staff = await assertStaff("orders");
    const id = String(fd.get("orderId") ?? "");
    const to = String(fd.get("to") ?? "") as OrderStatus;
    const reason = String(fd.get("reason") ?? "");
    const note = String(fd.get("note") ?? "").slice(0, 300) || undefined;
    if (!STATUSES.includes(to)) return { error: L("Noto'g'ri holat", "Неверный статус") };
    if (to === "cancelled" && !CANCEL_REASONS.includes(reason as (typeof CANCEL_REASONS)[number])) return { error: L("Bekor qilish sababini tanlang", "Выберите причину отмены") };
    const r = await transitionOrder(staff, id, to, { reason: to === "cancelled" ? reason : undefined, note });
    if (r !== "ok") {
      return {
        error: {
          not_found: L("Buyurtma topilmadi yoki sizga ruxsat yo'q", "Заказ не найден или нет доступа"),
          invalid: L("Bu holatga o'tib bo'lmaydi (buyurtma allaqachon o'zgargan bo'lishi mumkin)", "Переход невозможен (заказ мог уже измениться)"),
          forbidden: L("Sizning rolingiz bu amalni bajara olmaydi", "Ваша роль не может это сделать"),
          reason_required: L("Sabab kerak", "Нужна причина"),
        }[r],
      };
    }
    revalidatePath("/admin/orders");
    return { ok: true };
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: L("Ruxsat yo'q", "Нет доступа") };
    throw e;
  }
}

export async function orderPaymentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const L = makeL(await getLang());
  try {
    const staff = await assertStaff("orders");
    const to = String(fd.get("to") ?? "");
    if (to !== "paid" && to !== "refunded") return { error: "invalid" };
    const r = await setPaymentStatus(staff, String(fd.get("orderId") ?? ""), to);
    if (r !== "ok") return { error: r === "forbidden" ? L("Ruxsat yo'q", "Нет доступа") : L("Bu amal hozir mumkin emas", "Действие сейчас невозможно") };
    revalidatePath("/admin/orders");
    return { ok: true };
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: L("Ruxsat yo'q", "Нет доступа") };
    throw e;
  }
}
