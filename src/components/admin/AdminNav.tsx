"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import clsx from "clsx";
import type { Permission } from "@/lib/admin/guard";
import { useLang } from "@/lib/i18n/client";
import { HelpButton } from "./guide";
import { CountBadge, SoundToggle, usePulse } from "./pulse";
import {
  IconImage,
  IconArrowUpRight,
  IconChevronRight,
  IconBan,
  IconBell,
  IconBook,
  IconCalendar,
  IconDots,
  IconFile,
  IconGrid,
  IconLogout,
  IconMessage,
  IconPin,
  IconReceipt,
  IconSearch,
  IconSettings,
  IconShield,
  IconStore,
  IconTag,
  IconUsers,
  IconUser,
} from "@/components/ui/icons";
import { Modal, Sheet } from "@/components/ui/primitives";
import { useL } from "./ui";

type Item = { href: string; perm: Permission; uz: string; ru: string; hintUz: string; hintRu: string; Icon: (p: { size?: number }) => React.ReactElement };
type Group = { uz: string; ru: string; items: Item[] };

// Grouped by what the person wants to do, each with a one-line explanation
// so a new staff member knows what every section is for.
const GROUPS: Group[] = [
  {
    uz: "Kundalik ish",
    ru: "Ежедневная работа",
    items: [
      { href: "/admin", perm: "dashboard", uz: "Bosh sahifa", ru: "Главная", hintUz: "Bugungi natijalar qisqacha", hintRu: "Краткие итоги", Icon: IconGrid },
      { href: "/admin/orders", perm: "orders", uz: "Buyurtmalar", ru: "Заказы", hintUz: "Yangi buyurtmalarni qabul qilish", hintRu: "Принимать новые заказы", Icon: IconReceipt },
      { href: "/admin/availability", perm: "availability", uz: "Tugagan taomlar", ru: "Стоп-лист", hintUz: "Tugagan taomni vaqtincha yashirish", hintRu: "Временно скрыть закончившееся", Icon: IconBan },
      { href: "/admin/reservations", perm: "reservations", uz: "Stol bronlari", ru: "Брони столов", hintUz: "Mijozlar band qilgan stollar", hintRu: "Столы, забронированные гостями", Icon: IconCalendar },
    ],
  },
  {
    uz: "Menyu va filiallar",
    ru: "Меню и филиалы",
    items: [
      { href: "/admin/menu", perm: "menu", uz: "Menyu", ru: "Меню", hintUz: "Taomlar, narxlar va rasmlar", hintRu: "Блюда, цены и фото", Icon: IconBook },
      { href: "/admin/restaurants", perm: "brands", uz: "Restoran", ru: "Ресторан", hintUz: "Nomi, logotip va shior", hintRu: "Название, логотип и слоган", Icon: IconStore },
      { href: "/admin/branches", perm: "branches", uz: "Filiallar", ru: "Филиалы", hintUz: "Manzil, ish vaqti, yetkazish hududi", hintRu: "Адрес, часы, зона доставки", Icon: IconPin },
    ],
  },
  {
    uz: "Mijozlar va reklama",
    ru: "Клиенты и реклама",
    items: [
      { href: "/admin/customers", perm: "customers", uz: "Mijozlar", ru: "Клиенты", hintUz: "Mijozlar ro'yxati va tarixi", hintRu: "Список клиентов и история", Icon: IconUsers },
      { href: "/admin/promotions", perm: "promotions", uz: "Aksiya va promokodlar", ru: "Акции и промокоды", hintUz: "Chegirmalar yaratish", hintRu: "Создание скидок", Icon: IconTag },
      { href: "/admin/banners", perm: "content", uz: "Bosh sahifa bannerlari", ru: "Баннеры на главной", hintUz: "Yuqoridagi aylanuvchi reklama", hintRu: "Карусель вверху главной", Icon: IconImage },
      { href: "/admin/feedback", perm: "feedback", uz: "Mijoz fikrlari", ru: "Отзывы", hintUz: "Shikoyat va takliflar", hintRu: "Жалобы и предложения", Icon: IconMessage },
      { href: "/admin/content", perm: "content", uz: "Sayt sahifalari", ru: "Страницы сайта", hintUz: "Yangiliklar, bannerlar, matnlar", hintRu: "Новости, баннеры, тексты", Icon: IconFile },
    ],
  },
  {
    uz: "Tizim",
    ru: "Система",
    items: [
      { href: "/admin/staff", perm: "staff", uz: "Xodimlar", ru: "Сотрудники", hintUz: "Kim tizimga kira oladi", hintRu: "Кто имеет доступ", Icon: IconUser },
      { href: "/admin/audit", perm: "audit", uz: "O'zgarishlar tarixi", ru: "История изменений", hintUz: "Kim nimani o'zgartirgan", hintRu: "Кто что изменил", Icon: IconShield },
      { href: "/admin/telegram", perm: "orders", uz: "Telegram bot", ru: "Telegram-бот", hintUz: "Buyurtmalarni Telegramda olish", hintRu: "Получать заказы в Telegram", Icon: IconBell },
      { href: "/admin/settings", perm: "settings", uz: "Sozlamalar", ru: "Настройки", hintUz: "To'lov, SMS, sayt sozlamalari", hintRu: "Оплата, SMS, сайт", Icon: IconSettings },
    ],
  },
];

const isActive = (href: string, pathname: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

function visibleGroups(permissions: Permission[]) {
  return GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => permissions.includes(i.perm)) })).filter((g) => g.items.length > 0);
}

/** Number shown next to a menu item: orders waiting to be accepted, bookings waiting for an answer. */
function useBadges() {
  const { pulse } = usePulse();
  return (href: string) => (href === "/admin/orders" ? (pulse?.newOrders ?? 0) : href === "/admin/reservations" ? (pulse?.pendingReservations ?? 0) : 0);
}

/** Uzbek / Russian switch; stores the choice in the same cookie as the site. */
export function LangSwitch() {
  const lang = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (l: "uz" | "ru") => {
    if (l === lang) return;
    document.cookie = `lang=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    start(() => router.refresh());
  };
  return (
    <div role="radiogroup" aria-label="Til / Язык" className={clsx("relative flex h-10 shrink-0 rounded-xl bg-field p-1 transition-opacity", pending && "opacity-60")}>
      <span className={clsx("absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-sm transition-transform duration-300 [transition-timing-function:var(--ease-out)]", lang === "ru" && "translate-x-full")} />
      {(["uz", "ru"] as const).map((l) => (
        <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => set(l)} className={clsx("relative z-[1] w-11 rounded-lg text-xs font-bold transition-colors", lang === l ? "text-ink" : "text-muted hover:text-ink")}>
          {l === "uz" ? "O'Z" : "РУ"}
        </button>
      ))}
    </div>
  );
}

/** Desktop top bar: where you are, what this section is for, language and help. */
export function AdminTopBar({ permissions }: { permissions: Permission[] }) {
  const L = useL();
  const pathname = usePathname();
  const all = GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: L(g.uz, g.ru) })));
  const item = [...all].sort((a, b) => b.href.length - a.href.length).find((i) => isActive(i.href, pathname));
  const visible = item && permissions.includes(item.perm);
  return (
    <div className="no-print sticky top-0 z-30 hidden h-16 items-center gap-4 border-b border-line bg-page/85 px-8 backdrop-blur-md lg:flex">
      <div className="min-w-0 flex-1">
        {visible && (
          <p key={item.href} className="anim-rise flex min-w-0 items-center gap-2 text-sm">
            <span className="whitespace-nowrap text-muted">{item.group}</span>
            <IconChevronRight size={14} className="shrink-0 text-subtle" />
            <span className="whitespace-nowrap font-semibold">{L(item.uz, item.ru)}</span>
            <span className="hidden truncate text-muted 2xl:inline">— {L(item.hintUz, item.hintRu)}</span>
          </p>
        )}
      </div>
      <QuickJump permissions={permissions} />
      {permissions.includes("orders") && <SoundToggle />}
      <LangSwitch />
      <HelpButton />
      <Link href="/" target="_blank" className="btn-soft h-10 px-3.5 text-sm">
        {L("Saytni ochish", "Открыть сайт")} <IconArrowUpRight size={16} />
      </Link>
    </div>
  );
}

/** Desktop sidebar navigation. */
export function AdminNav({ permissions }: { permissions: Permission[] }) {
  const L = useL();
  const pathname = usePathname();
  const badge = useBadges();
  return (
    <nav aria-label="Admin" className="no-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
      {visibleGroups(permissions).map((g) => (
        <div key={g.uz}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">{L(g.uz, g.ru)}</p>
          <ul className="space-y-0.5">
            {g.items.map((i) => {
              const active = isActive(i.href, pathname);
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    aria-current={active ? "page" : undefined}
                    title={L(i.hintUz, i.hintRu)}
                    className={clsx(
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition-[background-color,color,box-shadow] duration-200",
                      active ? "bg-brand font-medium text-white shadow-[0_4px_14px_rgb(215_40_47/0.28)]" : "text-ink/75 hover:bg-field hover:text-ink",
                    )}
                  >
                    <span className={clsx("transition-transform duration-200", !active && "group-hover:scale-110")}>
                      <i.Icon size={18} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{L(i.uz, i.ru)}</span>
                    {badge(i.href) > 0 ? <CountBadge n={badge(i.href)} inverted={active} /> : !active && <IconChevronRight size={14} className="-translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-50" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Phone navigation: bottom tab bar with the most used sections plus a "More" sheet. */
export function AdminMobileNav({ permissions, staffName, roleLabel, logout }: { permissions: Permission[]; staffName: string; roleLabel: string; logout: () => Promise<void> }) {
  const L = useL();
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const badge = useBadges();
  useEffect(() => setMore(false), [pathname]);
  const all = visibleGroups(permissions).flatMap((g) => g.items);
  const priority = ["/admin", "/admin/orders", "/admin/availability", "/admin/menu", "/admin/reservations", "/admin/branches"];
  const tabs = priority.map((h) => all.find((i) => i.href === h)).filter(Boolean).slice(0, 4) as Item[];
  const moreActive = !tabs.some((i) => isActive(i.href, pathname));

  return (
    <>
      <nav aria-label="Admin" className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <div className="flex h-16">
          {tabs.map((i) => {
            const active = isActive(i.href, pathname);
            return (
              <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} className={clsx("relative flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors active:scale-95", active ? "text-brand" : "text-muted")}>
                <span className={clsx("absolute top-0 h-[3px] rounded-b-full bg-brand transition-all duration-300", active ? "w-8 opacity-100" : "w-0 opacity-0")} />
                <span className={clsx("relative grid h-7 w-12 place-items-center rounded-full transition-colors duration-200", active && "bg-brand-50")}>
                  <i.Icon size={22} />
                  <CountBadge n={badge(i.href)} className="absolute -right-0.5 -top-1.5 ring-2 ring-white" />
                </span>
                <span className="max-w-full truncate px-1">{L(i.uz, i.ru)}</span>
              </Link>
            );
          })}
          <button type="button" onClick={() => setMore(true)} className={clsx("relative flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors active:scale-95", moreActive ? "text-brand" : "text-muted")}>
            <span className={clsx("absolute top-0 h-[3px] rounded-b-full bg-brand transition-all duration-300", moreActive ? "w-8 opacity-100" : "w-0 opacity-0")} />
            <span className={clsx("grid h-7 w-12 place-items-center rounded-full transition-colors", moreActive && "bg-brand-50")}>
              <IconDots size={22} />
            </span>
            {L("Yana", "Ещё")}
          </button>
        </div>
      </nav>
      <Sheet open={more} onOpenChange={setMore} side="bottom" title={L("Barcha bo'limlar", "Все разделы")}>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3">
          <div className="mb-3 flex gap-2">
            <LangSwitch />
            {permissions.includes("orders") && <SoundToggle compact />}
            <HelpButton className="flex-1" />
          </div>
          <div className="mb-4 flex items-center gap-3 rounded-2xl bg-field p-3">
            <span className="grid size-10 place-items-center rounded-full bg-white font-bold">{staffName.slice(0, 1)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{staffName}</p>
              <p className="text-sm text-muted">{roleLabel}</p>
            </div>
            <form action={logout}>
              <button className="btn h-10 bg-white px-3 text-sm">
                <IconLogout size={16} /> {L("Chiqish", "Выйти")}
              </button>
            </form>
          </div>
          {visibleGroups(permissions).map((g) => (
            <div key={g.uz} className="mb-4">
              <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">{L(g.uz, g.ru)}</p>
              <ul className="grid grid-cols-2 gap-2">
                {g.items.map((i) => {
                  const active = isActive(i.href, pathname);
                  return (
                    <li key={i.href}>
                      <Link href={i.href} className={clsx("flex h-full flex-col gap-1.5 rounded-2xl border p-3 transition-[border-color,transform] active:scale-[0.97]", active ? "border-brand bg-brand-50" : "border-line bg-white hover:border-brand/30")}>
                        <span className={clsx("grid size-9 place-items-center rounded-xl", active ? "bg-brand text-white" : "bg-field text-ink")}>
                          <i.Icon size={18} />
                        </span>
                        <span className="text-[14px] font-semibold leading-tight">{L(i.uz, i.ru)}</span>
                        <span className="text-xs leading-snug text-muted">{L(i.hintUz, i.hintRu)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Sheet>
    </>
  );
}

/** Ctrl+K (or "/") quick jump: type a section name, an order number or a phone number. */
export function QuickJump({ permissions, compact }: { permissions: Permission[]; compact?: boolean }) {
  const L = useL();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (compact) return; // the desktop instance owns the shortcut
    const on = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if ((e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [compact]);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
    }
  }, [open]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const out: { key: string; href: string; title: string; hint: string; Icon: Item["Icon"] }[] = [];
    const digits = s.replace(/[\s+()-]/g, "");
    if (/^\d+$/.test(digits) && permissions.includes("orders")) {
      if (digits.length <= 7) out.push({ key: "order", href: `/admin/orders?view=all&q=${digits}`, title: L(`Buyurtma № ${digits}`, `Заказ № ${digits}`), hint: L("Raqam bo'yicha buyurtmani topish", "Найти заказ по номеру"), Icon: IconReceipt });
      if (digits.length >= 4) {
        out.push({ key: "order-phone", href: `/admin/orders?view=all&q=${digits}`, title: L(`Telefon …${digits} buyurtmalari`, `Заказы телефона …${digits}`), hint: L("Shu raqamdan kelgan buyurtmalar", "Заказы с этого номера"), Icon: IconReceipt });
        if (permissions.includes("customers")) out.push({ key: "cust-phone", href: `/admin/customers?q=${digits}`, title: L(`Mijoz …${digits}`, `Клиент …${digits}`), hint: L("Mijozlar ro'yxatidan qidirish", "Искать среди клиентов"), Icon: IconUsers });
      }
    } else if (s.length >= 2 && permissions.includes("customers")) {
      out.push({ key: "cust-name", href: `/admin/customers?q=${encodeURIComponent(q.trim())}`, title: L(`«${q.trim()}» ismli mijoz`, `Клиент «${q.trim()}»`), hint: L("Mijozni ism bo'yicha qidirish", "Найти клиента по имени"), Icon: IconUsers });
    }
    const sections = visibleGroups(permissions)
      .flatMap((g) => g.items)
      .filter((i) => !s || [i.uz, i.ru, i.hintUz, i.hintRu].some((x) => x.toLowerCase().includes(s)))
      .map((i) => ({ key: i.href, href: i.href, title: L(i.uz, i.ru), hint: L(i.hintUz, i.hintRu), Icon: i.Icon }));
    // Sections first when the text matches a section name; searches first for numbers.
    return /^\d/.test(digits) ? [...out, ...sections] : [...sections, ...out];
  }, [q, permissions, L]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      {compact ? (
        <button type="button" onClick={() => setOpen(true)} className="grid size-9 place-items-center rounded-xl bg-field text-ink transition-colors hover:bg-line" aria-label={L("Tez qidiruv", "Быстрый поиск")}>
          <IconSearch size={18} />
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="flex h-10 w-48 shrink-0 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm text-muted transition-colors hover:border-brand/30 hover:text-ink xl:w-60" title={L("Bo'lim, buyurtma raqami yoki telefon bo'yicha tez o'tish", "Быстрый переход: раздел, номер заказа или телефон")}>
          <IconSearch size={16} />
          <span className="flex-1 truncate text-left">{L("Tez qidiruv…", "Быстрый поиск…")}</span>
          <kbd className="rounded-md border border-line bg-field px-1.5 py-0.5 font-sans text-[11px] font-semibold text-subtle">Ctrl K</kbd>
        </button>
      )}
      <Modal open={open} onOpenChange={setOpen} title={L("Tez qidiruv", "Быстрый поиск")} hideTitle className="sm:!top-[15vh] sm:!translate-y-0 sm:!p-3">
        <div className="flex items-center gap-2 rounded-2xl bg-field px-3">
          <IconSearch size={20} className="shrink-0 text-muted" />
          <input
            ref={input}
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((v) => Math.min(results.length - 1, v + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((v) => Math.max(0, v - 1));
              } else if (e.key === "Enter" && results[sel]) {
                e.preventDefault();
                go(results[sel].href);
              }
            }}
            placeholder={L("Bo'lim nomi, buyurtma № yoki telefon…", "Раздел, № заказа или телефон…")}
            className="h-12 min-w-0 flex-1 bg-transparent text-[16px] outline-none"
          />
        </div>
        <ul className="mt-2 max-h-[55dvh] overflow-y-auto" role="listbox">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">{L("Hech narsa topilmadi", "Ничего не найдено")}</li>}
          {results.map((r, i) => (
            <li key={r.key} role="option" aria-selected={i === sel}>
              <button type="button" onMouseEnter={() => setSel(i)} onClick={() => go(r.href)} className={clsx("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors", i === sel ? "bg-brand-50" : "hover:bg-field")}>
                <span className={clsx("grid size-9 shrink-0 place-items-center rounded-lg", i === sel ? "bg-brand text-white" : "bg-field")}>
                  <r.Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{r.title}</span>
                  <span className="block truncate text-xs text-muted">{r.hint}</span>
                </span>
                {i === sel && <kbd className="hidden rounded-md border border-line bg-white px-1.5 py-0.5 font-sans text-[11px] text-subtle sm:block">Enter</kbd>}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 hidden gap-3 border-t border-line px-2 pt-2 text-xs text-muted sm:flex">
          <span>↑ ↓ {L("tanlash", "выбор")}</span>
          <span>Enter {L("ochish", "открыть")}</span>
          <span>Esc {L("yopish", "закрыть")}</span>
        </p>
      </Modal>
    </>
  );
}
