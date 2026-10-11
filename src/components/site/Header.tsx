"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DropdownMenu } from "radix-ui";
import clsx from "clsx";
import { useActiveOrders } from "@/components/orders/ActiveOrders";
import { useT } from "@/lib/i18n/client";
import type { Lang } from "@/lib/i18n/dict";
import { formatUZS } from "@/lib/money";
import { IconArrowRight, IconBag, IconCalendar, IconCart, IconChevronDown, IconChevronRight, IconHeart, IconHome, IconLogout, IconMenu, IconPin, IconSearch, IconUser } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/primitives";
import { useCart, dishCount } from "@/components/cart/cart-store";
import { CartPanel } from "@/components/cart/CartPanel";
import { useAddress } from "./address-store";
import { AddressPicker } from "./AddressPicker";
import { NavDrawer } from "./NavDrawer";
import { menuHref } from "@/lib/menu-href";

export interface HeaderProps {
  platformName: string;
  logoUrl: string | null;
  customer: { name: string | null; phone: string } | null;
  savedAddresses: { id: string; address_text: string; lat: number; lng: number; house: string | null; apartment: string | null; floor: string | null; entrance: string | null; instructions: string | null; label: string | null }[];
}

/** Brand mark: round emblem plus a two-line wordmark ("SUSHI" over a script "Madi"). */
export function Logo({ name, url, compact, dark }: { name: string; url: string | null; compact?: boolean; dark?: boolean }) {
  const [first, ...rest] = name.split(" ");
  return (
    <span className="flex items-center gap-2.5">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className={clsx("shrink-0 rounded-full bg-night", compact ? "size-10" : "size-11")} />
      ) : (
        <span className="grid size-11 place-items-center rounded-full bg-brand text-lg font-black text-white" aria-hidden>
          {name.slice(0, 1)}
        </span>
      )}
      <span className={clsx("leading-none", compact && "hidden sm:block")}>
        {rest.length ? (
          <>
            <span className={clsx("block text-[10px] font-semibold tracking-[0.42em]", dark ? "text-white/80" : "text-ink/70")}>{first.toUpperCase()}</span>
            <span className="font-script -mt-0.5 block text-[26px] leading-[1.05] text-brand">{rest.join(" ")}</span>
          </>
        ) : (
          <span className="text-xl font-black">{name}</span>
        )}
      </span>
    </span>
  );
}

export function Header(props: HeaderProps) {
  const { t, lang } = useT();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [addrOpen, setAddrOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const cartState = useCart();
  const count = dishCount(cartState);
  const address = useAddress();

  const hideTabs = pathname.startsWith("/checkout") || pathname.startsWith("/pay/");

  return (
    <>
      <header className="no-print sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur-md">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">
          {t("nav.skip")}
        </a>
        <div className="mx-auto flex h-[60px] max-w-[1600px] items-center gap-2 px-3 sm:gap-3 md:h-20 md:px-6 lg:px-10">
          <button type="button" onClick={() => setDrawer(true)} className="grid size-11 shrink-0 place-items-center rounded-full transition-[background-color,transform] hover:bg-field active:scale-90" aria-label={t("nav.menu")} aria-expanded={drawer}>
            <IconMenu size={22} />
          </button>
          <Link href="/" className="shrink-0" aria-label={props.platformName}>
            <Logo name={props.platformName} url={props.logoUrl} compact />
          </Link>

          <div className="hidden min-w-0 flex-1 md:flex">
            <SearchBox className="w-full max-w-[420px]" />
          </div>

          {/* Delivery address: the first thing to choose, visible on every screen size */}
          <button
            type="button"
            onClick={() => setAddrOpen(true)}
            className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-field py-1 pl-1.5 pr-3 text-left transition-colors hover:bg-[#ebebe9] md:h-12 md:max-w-[300px]"
            aria-label={t("nav.address")}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-white">
              <IconPin size={16} />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-[11px] text-muted">{t("nav.address")}</span>
              <span className="block truncate text-[14px] font-semibold">{address ? address.text : t("nav.chooseAddress")}</span>
            </span>
            <IconChevronDown size={16} className="shrink-0 text-muted" />
          </button>

          <div className="flex shrink-0 items-center gap-2">
            <LangSwitcher lang={lang} />
            <button type="button" onClick={() => setCartOpen(true)} className="btn-primary hidden h-12 rounded-full px-5 text-[15px] md:inline-flex" aria-label={`${t("nav.cart")}: ${count}`}>
              <IconCart size={20} />
              <span>{t("nav.cart")}</span>
              {count > 0 && <span key={count} className="anim-pop grid min-w-6 place-items-center rounded-full bg-white px-1.5 text-sm font-bold text-brand">{count}</span>}
            </button>
            <div className="hidden md:block">
              <AccountButton customer={props.customer} />
            </div>
          </div>
        </div>

        <NavDrawer open={drawer} onOpenChange={setDrawer} platformName={props.platformName} logoUrl={props.logoUrl} />
        <AddressPicker open={addrOpen} onOpenChange={setAddrOpen} saved={props.savedAddresses} />
        <Sheet open={cartOpen} onOpenChange={setCartOpen} title={t("cart.title")} side={isPhone() ? "bottom" : "right"} labelledTitle={false}>
          <div className="flex max-h-[84dvh] min-h-[50dvh] flex-1 flex-col p-4 pt-6 md:max-h-none">
            <CartPanel onNavigate={() => setCartOpen(false)} />
          </div>
        </Sheet>
      </header>
      {!hideTabs && <TabBar pathname={pathname} count={count} loggedIn={Boolean(props.customer)} onCart={() => setCartOpen(true)} />}
    </>
  );
}

function isPhone() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
}

/** Phone-only bottom navigation, like a native app. */
function TabBar({ pathname, count, loggedIn, onCart }: { pathname: string; count: number; loggedIn: boolean; onCart: () => void }) {
  const { t } = useT();
  const activeOrders = useActiveOrders(loggedIn).length;
  const item = (on: boolean) => clsx("relative flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors active:scale-95", on ? "text-brand" : "text-muted");
  const tab = (href: string, on: boolean, icon: React.ReactNode, label: string, dot?: number) => (
    <Link href={href} className={item(on)} aria-current={on ? "page" : undefined}>
      <span className={clsx("absolute top-0 h-[3px] rounded-b-full bg-brand transition-all duration-300", on ? "w-8 opacity-100" : "w-0 opacity-0")} />
      <span className={clsx("relative grid h-7 w-12 place-items-center rounded-full transition-colors duration-200", on && "bg-brand-50")}>
        {icon}
        {dot ? (
          <span className="absolute right-1.5 top-0 flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-brand ring-2 ring-white" />
          </span>
        ) : null}
      </span>
      {label}
    </Link>
  );
  return (
    <nav aria-label={t("nav.menu")} className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
      <div className="flex h-16">
        {tab("/", pathname === "/", <IconHome size={22} />, t("nav.home"))}
        {tab("/search", pathname.startsWith("/search"), <IconSearch size={22} />, t("nav.search"))}
        <button type="button" onClick={onCart} className={item(false)} aria-label={`${t("nav.cart")}: ${count}`}>
          <span className="relative -mt-6 grid size-14 place-items-center rounded-full bg-brand text-white shadow-[0_6px_20px_rgb(215_40_47/0.35)] ring-4 ring-white transition-transform active:scale-90">
            <IconCart size={24} />
            {count > 0 && <span key={count} className="anim-pop absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-ink px-1 text-[11px] font-bold text-white">{count}</span>}
          </span>
          <span className="text-ink">{t("nav.cart")}</span>
        </button>
        {tab("/orders", pathname.startsWith("/orders"), <IconBag size={22} />, t("nav.orders"), activeOrders)}
        {tab(loggedIn ? "/account" : "/login", pathname.startsWith("/account") || pathname === "/login", <IconUser size={22} />, t("account.profile"))}
      </div>
    </nav>
  );
}

function LangSwitcher({ lang }: { lang: Lang }) {
  const router = useRouter();
  const { t } = useT();
  const change = async (l: Lang) => {
    document.cookie = `lang=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  };
  const flag = (l: Lang) =>
    l === "uz" ? (
      <span className="block size-6 overflow-hidden rounded-full" aria-hidden>
        <span className="block h-2 bg-[#1eb5e9]" />
        <span className="block h-2 bg-white" />
        <span className="block h-2 bg-[#1eb53a]" />
      </span>
    ) : (
      <span className="block size-6 overflow-hidden rounded-full" aria-hidden>
        <span className="block h-2 bg-white" />
        <span className="block h-2 bg-[#0039a6]" />
        <span className="block h-2 bg-[#d52b1e]" />
      </span>
    );
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="pill h-11 px-3 font-semibold md:h-12 md:px-4 md:text-[15px]" aria-label={t("nav.language")}>
        {flag(lang)}
        <span className="hidden md:inline">{lang === "uz" ? "O'z" : "Рус"}</span>
        <IconChevronDown size={16} className="hidden md:block" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="anim-dropdown z-50 min-w-40 rounded-2xl border border-line bg-white p-2 shadow-[var(--shadow-pop)]">
          {(["uz", "ru"] as Lang[]).map((l) => (
            <DropdownMenu.Item key={l} onSelect={() => change(l)} className={clsx("flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 outline-none transition-colors data-[highlighted]:bg-field", l === lang && "font-semibold")}>
              {flag(l)} {l === "uz" ? "O'zbekcha" : "Русский"}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function AccountButton({ customer }: { customer: HeaderProps["customer"] }) {
  const { t } = useT();
  const router = useRouter();
  const cls = "grid size-12 place-items-center rounded-full bg-field hover:bg-line";
  if (!customer) {
    return (
      <Link href="/login" className={cls} aria-label={t("account.login")}>
        <IconUser size={22} />
      </Link>
    );
  }
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  };
  const item = "flex items-center gap-3 rounded-xl px-3 py-3 outline-none data-[highlighted]:bg-field";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={cls} aria-label={t("nav.account")}>
        <IconUser size={22} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={10} className="anim-dropdown z-50 w-[300px] rounded-2xl border border-line bg-white p-1.5 shadow-[var(--shadow-pop)]">
          <DropdownMenu.Item asChild>
            <Link href="/account" className={clsx(item, "justify-between border-b border-line font-semibold")}>
              <span className="truncate">{customer.name || customer.phone}</span>
              <IconChevronRight size={18} />
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/orders" className={item}>
              <IconBag size={20} className="text-muted" /> {t("account.orders")}
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/account/loyalty" className={item}>
              <IconHeart size={20} className="text-muted" /> {t("account.loyalty")}
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/account/reservations" className={item}>
              <IconCalendar size={20} className="text-muted" /> {t("account.reservations")}
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={logout} className={item}>
            <IconLogout size={20} className="text-muted" /> {t("account.logout")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

interface SearchResult {
  brands: { slug: string; name: string; logo_url: string | null }[];
  products: { id: string; slug: string; name: { uz: string; ru?: string }; image_url: string | null; price: number; brand_slug: string; brand_name: string }[];
}

function SearchBox({ className, compact }: { className?: string; compact?: boolean }) {
  const { t, tr } = useT();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<SearchResult | null>(null);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = compact ? "search-list-m" : "search-list";

  useEffect(() => {
    if (q.trim().length < 2) {
      setRes(null);
      return;
    }
    const ctl = new AbortController();
    const h = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal });
        if (r.ok) setRes(await r.json());
      } catch {
        /* aborted */
      }
    }, 200);
    return () => {
      clearTimeout(h);
      ctl.abort();
    };
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const items = [
    ...(res?.products ?? []).slice(0, 8).map((p) => ({ key: `p-${p.id}`, href: menuHref({ p: p.slug }), label: tr(p.name), sub: t("search.dishes"), img: p.image_url, price: p.price as number | null })),
  ];

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <div ref={boxRef} className={clsx("relative", className)}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (active >= 0 && items[active]) go(items[active].href);
          else if (q.trim().length >= 2) go(`/search?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <label className={clsx("pill w-full text-muted focus-within:ring-2 focus-within:ring-brand/40", compact ? "h-11 px-3" : "h-12 px-4")}>
          <IconSearch size={compact ? 18 : 20} />
          <span className="sr-only">{t("nav.search")}</span>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(-1, a - 1));
              } else if (e.key === "Escape") setOpen(false);
            }}
            placeholder={compact ? t("nav.search") : t("nav.searchFood")}
            className={clsx("min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-subtle", compact ? "text-sm" : "text-[15px]")}
            role="combobox"
            aria-expanded={open && items.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          />
        </label>
      </form>
      {open && q.trim().length >= 2 && res && (
        <div className="anim-pop absolute left-0 top-full z-50 mt-2 w-[min(420px,calc(100vw-32px))] rounded-2xl border border-line bg-white p-2 shadow-[var(--shadow-pop)]">
          {items.length === 0 ? (
            <p className="px-3 py-4 text-muted">{t("search.none")}</p>
          ) : (
            <ul id={listId} role="listbox">
              {items.map((it, i) => (
                <li key={it.key} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                  <button type="button" onClick={() => go(it.href)} className={clsx("flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-field", i === active && "bg-field")}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {it.img ? <img src={it.img} alt="" className="size-11 rounded-lg object-cover" /> : <span className="size-11 rounded-lg bg-field" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{it.label}</span>
                      <span className="block truncate text-sm text-muted">{it.sub}</span>
                    </span>
                    {it.price !== null && <span className="shrink-0 text-sm font-semibold text-brand">{formatUZS(it.price)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link href={`/search?q=${encodeURIComponent(q.trim())}`} onClick={() => setOpen(false)} className="mt-1 block rounded-xl px-3 py-2 text-sm font-medium text-brand hover:bg-field">
            {t("search.title")} <IconArrowRight size={16} className="inline-block align-[-0.2em]" />
          </Link>
        </div>
      )}
    </div>
  );
}
