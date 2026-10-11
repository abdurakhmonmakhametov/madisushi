import { getLang } from "../i18n/server";
import type { Lang } from "../i18n/dict";

/** Inline bilingual label helper for the admin UI: L("Buyurtmalar", "Заказы"). */
export type LFn = (uz: string, ru: string) => string;

export function makeL(lang: Lang): LFn {
  return (uz, ru) => (lang === "ru" ? ru : uz);
}

export async function getL(): Promise<{ L: LFn; lang: Lang }> {
  const lang = await getLang();
  return { L: makeL(lang), lang };
}
