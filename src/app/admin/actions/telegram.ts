"use server";

import { revalidatePath } from "next/cache";
import { assertStaff, ForbiddenError } from "@/lib/admin/guard";
import { makeL } from "@/lib/admin/l";
import { db } from "@/lib/db";
import { getLang } from "@/lib/i18n/server";
import { createStaffLink } from "@/lib/telegram/bot";

export type TelegramLinkState = { url?: string; error?: string } | null;

/** Every staff role can connect their own Telegram chat ("orders" is common to all roles). */
export async function telegramLinkAction(): Promise<TelegramLinkState> {
  const L = makeL(await getLang());
  try {
    const staff = await assertStaff("orders");
    const url = await createStaffLink(staff.id);
    if (!url) return { error: L("Bot sozlanmagan: .env faylida TELEGRAM_BOT_USERNAME yo'q", "Бот не настроен: нет TELEGRAM_BOT_USERNAME в .env") };
    return { url };
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: L("Ruxsat yo'q", "Нет доступа") };
    throw e;
  }
}

export async function telegramUnlinkAction(): Promise<TelegramLinkState> {
  const staff = await assertStaff("orders");
  await db.query("update public.telegram_chats set staff_id = null where staff_id = $1", [staff.id]);
  revalidatePath("/admin/telegram");
  return null;
}
