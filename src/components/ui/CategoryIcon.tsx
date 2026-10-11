// Menu categories store an emoji chosen in the admin panel. The UI shows the
// matching light icon instead, so every icon on the site has the same style.
import {
  IconFoodDessert,
  IconFoodDrink,
  IconFoodDumpling,
  IconFoodGeneric,
  IconFoodHot,
  IconFoodKids,
  IconFoodPizza,
  IconFoodRice,
  IconFoodRoll,
  IconFoodSalad,
  IconFoodSet,
  IconFoodSoup,
  IconFoodWok,
} from "./icons";

type IconC = (p: { size?: number; className?: string }) => React.ReactElement;

const BY_EMOJI: Record<string, IconC> = {
  "🍣": IconFoodRoll,
  "🍙": IconFoodRoll,
  "🍱": IconFoodSet,
  "🥗": IconFoodSalad,
  "🥬": IconFoodSalad,
  "🍜": IconFoodSoup,
  "🍲": IconFoodSoup,
  "🍛": IconFoodHot,
  "🌶": IconFoodHot,
  "🥡": IconFoodWok,
  "🍕": IconFoodPizza,
  "🍡": IconFoodDessert,
  "🍰": IconFoodDessert,
  "🍩": IconFoodDessert,
  "🍨": IconFoodDessert,
  "🥟": IconFoodDumpling,
  "🍚": IconFoodRice,
  "🧒": IconFoodKids,
  "👶": IconFoodKids,
  "🧋": IconFoodDrink,
  "🥤": IconFoodDrink,
  "🍵": IconFoodDrink,
  "☕": IconFoodDrink,
  "🍹": IconFoodDrink,
};

export function CategoryIcon({ emoji, size = 20, className }: { emoji: string | null | undefined; size?: number; className?: string }) {
  if (!emoji) return null;
  const Icon = BY_EMOJI[emoji.replace(/️/g, "").trim()] ?? IconFoodGeneric;
  return <Icon size={size} className={className} />;
}

/** Choices for the admin category form; the stored value stays an emoji. */
export const CATEGORY_ICON_CHOICES: { value: string; uz: string; ru: string }[] = [
  { value: "🍣", uz: "Rollar / sushi", ru: "Роллы / суши" },
  { value: "🍱", uz: "Setlar", ru: "Сеты" },
  { value: "🥗", uz: "Salatlar", ru: "Салаты" },
  { value: "🍜", uz: "Sho'rva / ramen", ru: "Супы / рамен" },
  { value: "🍛", uz: "Issiq taomlar", ru: "Горячее" },
  { value: "🥡", uz: "WOK", ru: "WOK" },
  { value: "🍕", uz: "Pitsa", ru: "Пицца" },
  { value: "🍡", uz: "Desertlar", ru: "Десерты" },
  { value: "🥟", uz: "Dim-sum / gyoza", ru: "Дим-сам / гёдза" },
  { value: "🍚", uz: "Guruchli taomlar", ru: "Блюда с рисом" },
  { value: "🧒", uz: "Bolalar uchun", ru: "Детское" },
  { value: "🥤", uz: "Ichimliklar", ru: "Напитки" },
];

export function categoryIconOptions(current: string | null | undefined, lang: "uz" | "ru") {
  const opts = [{ value: "", label: lang === "ru" ? "Без иконки" : "Belgisiz" }, ...CATEGORY_ICON_CHOICES.map((c) => ({ value: c.value, label: lang === "ru" ? c.ru : c.uz }))];
  if (current && !opts.some((o) => o.value === current)) {
    const same = BY_EMOJI[current.replace(/\uFE0F/g, "").trim()];
    const match = CATEGORY_ICON_CHOICES.find((c) => BY_EMOJI[c.value] === same);
    opts.push({ value: current, label: match ? (lang === "ru" ? match.ru : match.uz) : current });
  }
  return opts;
}
