import { translate, type DictKey, type Lang } from "@/lib/i18n/dict";

export function statusLabel(s: string, lang: Lang) {
  return translate(lang, `status.${s}` as DictKey);
}

export function paymentLabel(s: string, lang: Lang) {
  return translate(lang, `pay.status.${s}` as DictKey);
}

export function reasonLabel(s: string | null, lang: Lang) {
  return s ? translate(lang, `reason.${s}` as DictKey) : "";
}

export function statusTone(s: string): "neutral" | "ok" | "warn" | "brand" | "info" {
  if (s === "new" || s === "confirmed" || s === "pending") return "info";
  if (s === "cancelled" || s === "rejected") return "brand";
  if (s === "delivered" || s === "picked_up" || s === "seated") return "ok";
  if (s === "no_show") return "neutral";
  return "warn";
}

export const KIND_LABELS: Record<string, [string, string]> = {
  page: ["Sahifa", "Страница"],
  legal: ["Huquqiy", "Юридическое"],
  news: ["Yangilik", "Новость"],
  recipe: ["Retsept", "Рецепт"],
  vacancy: ["Vakansiya", "Вакансия"],
  faq: ["Savol-javob", "FAQ"],
  gallery: ["Galereya", "Галерея"],
  banner: ["Banner", "Баннер"],
};

const METHODS: Record<string, [string, string]> = {
  cash: ["Naqd pul", "Наличные"],
  card_on_delivery: ["Karta (kuryerga)", "Карта курьеру"],
  click: ["Click", "Click"],
  payme: ["Payme", "Payme"],
  mock: ["Test to'lovi", "Тестовая оплата"],
};

export function methodLabel(m: string, lang: Lang) {
  const v = METHODS[m];
  return v ? (lang === "ru" ? v[1] : v[0]) : m;
}

export function actorLabel(kind: string, lang: Lang) {
  const v = ({ customer: ["Mijoz", "Гость"], staff: ["Xodim", "Сотрудник"], system: ["Tizim", "Система"] } as Record<string, [string, string]>)[kind];
  return v ? (lang === "ru" ? v[1] : v[0]) : kind;
}
