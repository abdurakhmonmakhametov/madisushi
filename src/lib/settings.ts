// Typed, admin-editable settings stored in public.settings (key -> jsonb).
// Every value has a schema and a default so a missing row never breaks pages.
import { z } from "zod";
import { cache } from "react";
import { db, type Db } from "./db";
import type { LoyaltyRules } from "./pricing";

const i18n = z.object({ uz: z.string(), ru: z.string().optional() });

export const settingSchemas = {
  branding: z.object({
    platformName: z.string().min(1).max(40),
    logoUrl: z.string().nullable(),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    footerText: i18n,
  }),
  contacts: z.object({
    phone: z.string().max(30),
    email: z.string().max(120),
    address: i18n,
    hours: i18n,
    telegram: z.string().max(120),
    instagram: z.string().max(120),
  }),
  languages: z.object({ default: z.enum(["uz", "ru"]), enabled: z.array(z.enum(["uz", "ru"])).min(1) }),
  loyalty: z.object({
    enabled: z.boolean(),
    earn_bps: z.number().int().min(0).max(5000),
    max_spend_amount: z.number().int().min(0),
    max_spend_bps: z.number().int().min(0).max(10000),
  }),
  scheduling: z.object({
    slot_minutes: z.number().int().min(5).max(120),
    max_days_ahead: z.number().int().min(0).max(30),
  }),
  checkout: z.object({
    leave_at_door_enabled: z.boolean(),
    order_for_other_enabled: z.boolean(),
    delivery_info_note: i18n,
  }),
  notifications: z.object({
    new_order_email: z.string().max(200),
    telegram_chat_id: z.string().max(60),
    notify_on_new_order: z.boolean(),
    notify_on_reservation: z.boolean(),
  }),
  home: z.object({
    show_promotions: z.boolean(),
    show_bestsellers: z.boolean(),
    bestsellers_limit: z.number().int().min(0).max(40),
    // First slide of the home banner carousel (brand intro + "how to order").
    show_welcome_slide: z.boolean().default(true),
  }),
};

export type SettingKey = keyof typeof settingSchemas;
export type Settings = { [K in SettingKey]: z.infer<(typeof settingSchemas)[K]> };

export const PUBLIC_KEYS: SettingKey[] = ["branding", "contacts", "languages", "loyalty", "scheduling", "checkout", "home"];

export const DEFAULT_SETTINGS: Settings = {
  branding: {
    platformName: "Sushi Madi",
    logoUrl: "/brand/sushi-madi-emblem.png",
    primaryColor: "#D7282F",
    footerText: { uz: "Sevimli taomlaringizni tez va qulay buyurtma qiling.", ru: "Заказывайте любимую еду быстро и удобно." },
  },
  contacts: {
    phone: "+998 71 000 00 00",
    email: "hello@sushimadi.example",
    address: { uz: "Toshkent shahri", ru: "г. Ташкент" },
    hours: { uz: "Har kuni 10:00 dan 02:00 gacha", ru: "Каждый день с 10:00 до 02:00" },
    telegram: "",
    instagram: "",
  },
  languages: { default: "uz", enabled: ["uz", "ru"] },
  loyalty: { enabled: true, earn_bps: 500, max_spend_amount: 20000, max_spend_bps: 3000 },
  scheduling: { slot_minutes: 15, max_days_ahead: 3 },
  checkout: {
    leave_at_door_enabled: true,
    order_for_other_enabled: true,
    delivery_info_note: { uz: "", ru: "" },
  },
  notifications: { new_order_email: "", telegram_chat_id: "", notify_on_new_order: true, notify_on_reservation: true },
  home: { show_promotions: true, show_bestsellers: true, bestsellers_limit: 10, show_welcome_slide: true },
};

export async function loadSettings(d: Db = db): Promise<Settings> {
  const rows = await d.query<{ key: string; value: unknown }>("select key, value from public.settings");
  const out = structuredClone(DEFAULT_SETTINGS) as Record<string, unknown>;
  for (const r of rows) {
    const schema = settingSchemas[r.key as SettingKey];
    if (!schema) continue;
    const parsed = schema.safeParse(r.value);
    if (parsed.success) out[r.key] = parsed.data;
  }
  return out as Settings;
}

export const getSettings = cache(() => loadSettings());

export function loyaltyRules(s: Settings): LoyaltyRules {
  return {
    enabled: s.loyalty.enabled,
    earnBps: s.loyalty.earn_bps,
    maxSpendAmount: s.loyalty.max_spend_amount,
    maxSpendBps: s.loyalty.max_spend_bps,
  };
}
