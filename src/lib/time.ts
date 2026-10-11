// Asia/Tashkent business time helpers. Uzbekistan has no DST (UTC+5), but the
// offset is derived via Intl so a rule change would not silently break.

export const TIMEZONE = "Asia/Tashkent";

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export interface LocalParts {
  date: string; // YYYY-MM-DD
  weekday: number; // ISO 1..7
  minutes: number; // minutes since local midnight
}

function parts(at: Date): Record<string, string> {
  const p: Record<string, string> = {};
  for (const x of partsFmt.formatToParts(at)) p[x.type] = x.value;
  return p;
}

export function localParts(at: Date): LocalParts {
  const p = parts(at);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    weekday: WEEKDAYS[p.weekday],
    minutes: Number(p.hour) * 60 + Number(p.minute),
  };
}

/** Offset of Tashkent from UTC at the given instant, in minutes. */
export function offsetMinutes(at: Date): number {
  const p = parts(at);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** Converts a local Tashkent date + minutes-from-midnight to a UTC instant. */
export function localToUtc(date: string, minutes: number): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 0, minutes));
  return new Date(guess.getTime() - offsetMinutes(guess) * 60000);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}

export function minutesToHHMM(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function hhmmToMinutes(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

export function formatDateTime(at: Date | string, lang: "uz" | "ru"): string {
  return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "uz-UZ", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(at));
}

export function formatTime(at: Date | string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(at),
  );
}

export function formatDay(at: Date | string, lang: "uz" | "ru"): string {
  return formatDateKey(localParts(new Date(at)).date, lang);
}

// Browsers ship incomplete Uzbek date data ("M09 25, Fri"), so day labels are
// spelled out by hand for both languages.
const DAY_NAMES = { uz: ["Yak", "Du", "Se", "Chor", "Pay", "Ju", "Shan"], ru: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"] };
const MONTH_NAMES = {
  uz: ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"],
  ru: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
};

/** "2026-09-25" -> "Ju, 25-sentabr" / "Пт, 25 сентября". */
export function formatDateKey(date: string, lang: "uz" | "ru"): string {
  const [y, m, d] = date.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return lang === "ru" ? `${DAY_NAMES.ru[wd]}, ${d} ${MONTH_NAMES.ru[m - 1]}` : `${DAY_NAMES.uz[wd]}, ${d}-${MONTH_NAMES.uz[m - 1]}`;
}

export function todayLocal(now = new Date()): string {
  return localParts(now).date;
}
