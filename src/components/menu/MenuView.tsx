"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { useT } from "@/lib/i18n/client";
import type { I18n } from "@/lib/pricing";
import { priceLine } from "@/lib/pricing";
import type { CategoryNode, MenuProduct } from "@/lib/services/catalog";
import { formatUZS } from "@/lib/money";
import { IconCalendar, IconChevronDown, IconChevronRight, IconClock, IconInfo, IconPin, IconSun, IconTruck } from "@/components/ui/icons";
import { Modal, Sheet } from "@/components/ui/primitives";
import { Dropdown } from "@/components/ui/Dropdown";
import { HelpTip } from "@/components/ui/HelpTip";
import { toast } from "@/components/ui/toast";
import { CartPanel } from "@/components/cart/CartPanel";
import { cart, cartTotal, dishCount, lineKey, useCart, type CartContext, type CartLine, type ServiceItem } from "@/components/cart/cart-store";
import { ProductCard, ProductModal } from "./Product";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { menuHref } from "@/lib/menu-href";

export interface MenuViewProps {
  brand: { id: string; slug: string; name: string; logoUrl: string | null; tagline: string; reservations: boolean };
  branch: { id: string; slug: string; name: I18n; address: I18n; phone: string | null; acceptsDelivery: boolean; acceptsPickup: boolean };
  branches: { id: string; slug: string; name: I18n }[];
  categories: CategoryNode[];
  products: MenuProduct[];
  serviceItems: ServiceItem[];
  status: { open: boolean; hoursToday: { open: string; close: string } | null; nextOpen: string | null };
  delivery:
    | { state: "no_address" }
    | { state: "outside" }
    | { state: "ok"; fee: number; surcharge: number; minOrder: number; freeFrom: number | null; minutes: number };
  addressBranchId: string | null;
  explicitBranch: boolean;
  initialProductSlug: string | null;
  /** Rendered under the home-page hero, which already shows the name and logo. */
  embedded?: boolean;
}

type Pending = { line: Omit<CartLine, "key">; kind: "brand" | "branch" } | null;

export function MenuView(props: MenuViewProps) {
  const { t, tr } = useT();
  const router = useRouter();
  const s = useCart();
  const ctx: CartContext = { brandId: props.brand.id, brandSlug: props.brand.slug, brandName: props.brand.name, branchId: props.branch.id, branchName: props.branch.name };
  const [modalProduct, setModalProduct] = useState<MenuProduct | null>(() => props.products.find((p) => p.slug === props.initialProductSlug) ?? null);
  const [modalOpen, setModalOpen] = useState(Boolean(modalProduct));
  const [pending, setPending] = useState<Pending>(null);
  const [branchConflict, setBranchConflict] = useState<{ missing: string[] } | null>(null);
  const [sheet, setSheet] = useState(false);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const mobileNavRef = useRef<HTMLDivElement>(null);

  const bestsellers = props.products.filter((p) => p.badges.includes("bestseller"));
  const byCategory = useMemo(() => {
    const m = new Map<string, MenuProduct[]>();
    for (const p of props.products) {
      if (!p.categoryId) continue;
      m.set(p.categoryId, [...(m.get(p.categoryId) ?? []), p]);
    }
    return m;
  }, [props.products]);

  // Sections: hits, then every category with products (parents first, then children).
  const sections = useMemo(() => {
    const out: { id: string; title: string; products: MenuProduct[]; parent?: string }[] = [];
    if (bestsellers.length) out.push({ id: "hits", title: t("menu.hits"), products: bestsellers });
    for (const c of props.categories) {
      const own = byCategory.get(c.id) ?? [];
      if (own.length) out.push({ id: `cat-${c.slug}`, title: tr(c.name), products: own });
      for (const ch of c.children) {
        const list = byCategory.get(ch.id) ?? [];
        if (list.length) out.push({ id: `cat-${ch.slug}`, title: tr(ch.name), products: list, parent: c.slug });
      }
    }
    return out;
  }, [bestsellers, byCategory, props.categories, t, tr]);

  // A cart left over from a restaurant that no longer exists is discarded.
  useEffect(() => {
    if (s.brandId && s.brandId !== props.brand.id) cart.clear();
  }, [s.brandId, props.brand.id]);

  // Keep the page on the cart's branch, or reconcile a branch switch.
  useEffect(() => {
    if (s.brandId !== props.brand.id || !s.branchId || s.branchId === props.branch.id || dishCount(s) === 0) return;
    if (!props.explicitBranch) {
      router.replace(menuHref({ branch: s.branchId }), { scroll: false });
      return;
    }
    const byId = new Map(props.products.map((p) => [p.id, p]));
    const missing = s.lines.filter((l) => l.kind === "dish" && !byId.get(l.productId)?.available).map((l) => tr(l.name));
    if (missing.length === 0) {
      const services = new Map(props.serviceItems.map((x) => [x.id, x.price]));
      cart.moveToBranch(ctx, (l) => {
        const p = byId.get(l.productId);
        const priced = p ? priceLine(p, l.optionIds) : null;
        return priced?.ok ? priced.unitPrice : (services.get(l.productId) ?? l.unitPrice);
      });
    } else setBranchConflict({ missing });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.branch.id, s.branchId]);

  // Scroll spy
  useEffect(() => {
    const els = sections.map((x) => document.getElementById(x.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveCat(visible[0].target.id);
      },
      { rootMargin: "-140px 0px -60% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections]);

  useEffect(() => {
    if (!activeCat) return;
    const el = mobileNavRef.current?.querySelector<HTMLElement>(`[data-target="${activeCat}"]`);
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeCat]);

  const qtyOf = (p: MenuProduct) => s.brandId === props.brand.id && s.branchId === props.branch.id ? s.lines.filter((l) => l.productId === p.id).reduce((n, l) => n + l.qty, 0) : 0;

  const add = (p: MenuProduct, optionIds: string[], qty: number) => {
    const priced = priceLine(p, optionIds);
    if (!priced.ok || !p.available) return;
    const line: Omit<CartLine, "key"> = { productId: p.id, optionIds, qty, name: p.name, imageUrl: p.imageUrl, unitPrice: priced.unitPrice, kind: "dish", optionNames: priced.options.map((o) => o.name) };
    const r = cart.add(ctx, line, props.serviceItems);
    if (!r.ok) setPending({ line, kind: r.conflict });
    else toast(t("cart.added", { name: tr(p.name) }), "ok", p.imageUrl);
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveCat(id);
  };

  const d = props.delivery;
  const addressBranch = props.branches.find((b) => b.id === props.addressBranchId);

  const statusText = props.status.hoursToday ? t("menu.hoursToday", props.status.hoursToday) : t("menu.closedToday");
  const infoBlock = (
    <div className="space-y-3">
      <div className={clsx("flex items-center gap-3", props.embedded && "hidden")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {props.brand.logoUrl && <img src={props.brand.logoUrl} alt="" className="size-16 shrink-0 rounded-2xl border border-line bg-white object-contain p-1.5 lg:hidden" />}
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight">{props.brand.name}</h1>
          <p className="line-clamp-2 text-sm text-muted">{props.brand.tagline}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[13px]">
        <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold", props.status.open ? "bg-ok-50 text-ok" : "bg-brand-50 text-brand")}>
          <span className={clsx("size-1.5 rounded-full", props.status.open ? "bg-ok" : "bg-brand")} />
          {props.status.open ? t("menu.open") : t("menu.closed")}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-field px-2.5 py-1">
          <IconClock size={14} className="text-muted" />
          {statusText}
          {!props.status.open && props.status.nextOpen ? ` · ${t("menu.opensAt", { time: props.status.nextOpen })}` : ""}
        </span>
        {d.state === "ok" && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-field px-2.5 py-1">
            <IconTruck size={14} className="text-muted" /> {t("menu.deliveryTime", { min: d.minutes })} · {formatUZS(d.fee + d.surcharge)}
          </span>
        )}
      </div>
      {props.branches.length > 1 ? (
        <Dropdown
          variant="field"
          value={props.branch.id}
          onValueChange={(v) => router.push(menuHref({ branch: v }), { scroll: false })}
          aria-label={t("menu.branch")}
          prefix={`${t("menu.branch")}:`}
          className="text-[14px] font-medium"
          options={props.branches.map((b) => ({ value: b.id, label: tr(b.name) }))}
        />
      ) : null}
      <p className="flex items-start gap-2 text-[13px] text-muted">
        <IconPin size={15} className="mt-0.5 shrink-0" /> {tr(props.branch.address)}
      </p>
      {d.state === "ok" ? (
        <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
          <span>{t("menu.minOrder", { amount: formatUZS(d.minOrder) })}</span>
          {d.freeFrom !== null && <span className="text-ok">· {t("checkout.freeDeliveryFrom", { amount: formatUZS(d.freeFrom) })}</span>}
          <HelpTip text={t("menu.deliveryFee")} size={16} />
        </p>
      ) : (
        <p className="rounded-[14px] bg-warn-50 p-3 text-[13px] text-warn">{d.state === "outside" ? t("menu.notInZone") : t("menu.noAddress")}</p>
      )}
      {addressBranch && (
        <div className="rounded-[14px] bg-info-50 p-3 text-sm text-info">
          {t("err.branch_mismatch")}: <b>{tr(addressBranch.name)}</b>.{" "}
          <Link className="font-semibold underline" href={menuHref({ branch: addressBranch.id })}>
            {t("common.confirm")}
          </Link>
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-[1600px] px-4 md:px-6 lg:px-10">
      <div className="grid grid-cols-1 gap-4 pt-4 lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[minmax(220px,260px)_minmax(0,1fr)_minmax(320px,360px)] lg:pt-8">
        {/* Sidebar (desktop) */}
        <aside className="hidden lg:block" aria-label={t("menu.categories")}>
          <div className="no-scrollbar sticky top-[104px] max-h-[calc(100dvh-120px)] overflow-y-auto pb-6">
            {infoBlock}
            {props.brand.reservations && (
              <section className="mt-8">
                <h2 className="text-lg font-semibold">{t("menu.reservation")}</h2>
                <Link href={`/reserve?brand=${props.brand.slug}&branch=${props.branch.id}`} className="btn-soft mt-3 h-12 w-full">
                  <IconCalendar size={18} />
                  {t("menu.reserveTable")}
                </Link>
              </section>
            )}
            <nav className="mt-8">
              <h2 className="text-lg font-semibold">{t("menu.menu")}</h2>
              <ul className="mt-4 space-y-1">
                {bestsellers.length > 0 && (
                  <li>
                    <button type="button" onClick={() => scrollTo("hits")} className={clsx("flex h-14 w-full items-center gap-3 rounded-[14px] px-4 text-left text-[17px] transition-colors duration-200", activeCat === "hits" ? "bg-white shadow-sm" : "hover:bg-white/60")} aria-current={activeCat === "hits"}>
                      <IconSun size={20} /> {t("menu.hits")}
                    </button>
                  </li>
                )}
                {props.categories.map((c) => {
                  const hasKids = c.children.some((ch) => byCategory.get(ch.id)?.length);
                  const inside = activeCat === `cat-${c.slug}` || c.children.some((ch) => activeCat === `cat-${ch.slug}`);
                  const isOpen = expanded[c.id] ?? inside;
                  if (!hasKids && !byCategory.get(c.id)?.length) return null;
                  return (
                    <li key={c.id} className={clsx("rounded-[14px]", isOpen && hasKids && "bg-white shadow-sm")}>
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => scrollTo(byCategory.get(c.id)?.length ? `cat-${c.slug}` : `cat-${c.children.find((ch) => byCategory.get(ch.id)?.length)!.slug}`)}
                          className={clsx("flex h-14 flex-1 items-center gap-3 rounded-[14px] px-4 text-left text-[17px] transition-colors duration-200", inside && !hasKids ? "bg-white shadow-sm" : !isOpen && "hover:bg-white/60")}
                          aria-current={inside}
                        >
                          <CategoryIcon emoji={c.icon} size={20} className="shrink-0 text-muted" />
                          {tr(c.name)}
                        </button>
                        {hasKids && (
                          <button type="button" onClick={() => setExpanded((e) => ({ ...e, [c.id]: !isOpen }))} className="grid size-11 place-items-center rounded-full hover:bg-field" aria-expanded={isOpen} aria-label={tr(c.name)}>
                            {isOpen ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
                          </button>
                        )}
                      </div>
                      {hasKids && isOpen && (
                        <ul className="anim-rise pb-2">
                          {c.children
                            .filter((ch) => byCategory.get(ch.id)?.length)
                            .map((ch) => (
                              <li key={ch.id}>
                                <button type="button" onClick={() => scrollTo(`cat-${ch.slug}`)} className={clsx("w-full px-9 py-2.5 text-left text-[16px] hover:text-brand", activeCat === `cat-${ch.slug}` && "font-semibold text-brand")} aria-current={activeCat === `cat-${ch.slug}`}>
                                  {tr(ch.name)}
                                </button>
                              </li>
                            ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        </aside>

        {/* Main column */}
        <div className="min-w-0">
          <div className="card mb-3 p-4 lg:hidden">
            {infoBlock}
            {props.brand.reservations && (
              <Link href={`/reserve?brand=${props.brand.slug}&branch=${props.branch.id}`} className="btn-soft mt-3 h-11 w-full text-[15px]">
                <IconCalendar size={18} /> {t("menu.reserveTable")}
              </Link>
            )}
          </div>
          {/* Mobile categories */}
          <div ref={mobileNavRef} className="no-scrollbar sticky top-[60px] z-30 -mx-4 mb-2 flex gap-2 overflow-x-auto border-b border-line/60 bg-page/95 px-4 py-2.5 backdrop-blur-md md:-mx-6 md:top-20 md:px-6 lg:hidden" role="navigation" aria-label={t("menu.categories")}>
            {sections.map((sec) => (
              <button
                key={sec.id}
                type="button"
                data-target={sec.id}
                onClick={() => scrollTo(sec.id)}
                className={clsx("h-9 shrink-0 rounded-full px-4 text-[14px] font-medium transition-[background-color,color,transform] duration-200 active:scale-95", activeCat === sec.id ? "bg-ink text-white" : "bg-white text-ink/80 shadow-sm")}
                aria-current={activeCat === sec.id}
              >
                {sec.title}
              </button>
            ))}
          </div>

          {sections.length === 0 && <p className="card p-8 text-center text-muted">{t("menu.empty")}</p>}
          {sections.length > 0 && (
            <p className="mb-4 flex items-center gap-2 text-[13px] text-muted">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-info-50 text-info">
                <IconInfo size={14} />
              </span>
              {t("menu.tapHint")}
            </p>
          )}
          {sections.map((sec) => (
            <section key={sec.id} id={sec.id} className="mb-8 scroll-mt-[124px] md:scroll-mt-[144px] lg:scroll-mt-[110px]" aria-labelledby={`${sec.id}-h`}>
              <h2 id={`${sec.id}-h`} className="mb-3 flex items-center gap-2 text-[20px] font-bold lg:mb-4 lg:text-[26px]">
                {sec.title} {sec.id === "hits" && <IconSun size={24} />}
              </h2>
              <ul className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-3 2xl:grid-cols-4">
                {sec.products.map((p) => (
                  <li key={`${sec.id}-${p.id}`}>
                    <ProductCard
                      p={p}
                      qty={qtyOf(p)}
                      onOpen={() => {
                        setModalProduct(p);
                        setModalOpen(true);
                      }}
                      onAdd={() => add(p, [], 1)}
                      onQty={(v) => cart.setQty(lineKey(p.id, []), v)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {/* Cart (wide desktop) */}
        <aside className="hidden xl:block" aria-label={t("cart.title")}>
          <div className="card sticky top-[104px] flex h-[calc(100dvh-128px)] max-h-[900px] flex-col p-5">
            <CartPanel />
          </div>
        </aside>
      </div>

      {/* Mobile / tablet cart bar */}
      {dishCount(s) > 0 && (
        <div className="no-print fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-30 px-3 md:bottom-0 md:bg-gradient-to-t md:from-page md:via-page/95 md:to-transparent md:p-4 md:pt-6 xl:hidden">
          <button type="button" onClick={() => setSheet(true)} className="btn-primary anim-pop mx-auto h-14 w-full max-w-xl justify-between rounded-[18px] px-4 text-[15px] shadow-[0_10px_30px_rgb(215_40_47/0.35)]">
            <span className="flex items-center gap-2">
              <span key={dishCount(s)} className="anim-pop grid min-w-7 place-items-center rounded-full bg-white px-1.5 text-sm font-bold text-brand">{dishCount(s)}</span>
              {t("cart.openCart")}
            </span>
            <span className="font-bold tabular-nums">{formatUZS(cartTotal(s))}</span>
          </button>
        </div>
      )}
      <Sheet open={sheet} onOpenChange={setSheet} side="bottom" title={t("cart.title")} labelledTitle={false}>
        <div className="flex max-h-[84dvh] min-h-[50dvh] flex-col p-4 pt-6">
          <CartPanel onNavigate={() => setSheet(false)} />
        </div>
      </Sheet>

      <ProductModal
        p={modalProduct}
        open={modalOpen}
        onOpenChange={(v) => {
          setModalOpen(v);
          if (!v && props.initialProductSlug) router.replace(menuHref({ branch: props.branch.id }), { scroll: false });
        }}
        onAdd={(optionIds, qty) => {
          if (modalProduct) add(modalProduct, optionIds, qty);
          setModalOpen(false);
        }}
      />

      <Modal open={pending !== null} onOpenChange={(v) => !v && setPending(null)} title={t("cart.conflictTitle")}>
        <p className="text-[15px] text-ink/80">
          {pending?.kind === "brand"
            ? t("cart.conflictBrand", { brand: s.brandName ?? "" })
            : t("cart.conflictBranch", { branch: tr(props.branch.name), items: s.lines.filter((l) => l.kind === "dish").map((l) => tr(l.name)).join(", ") })}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="btn-soft h-12" onClick={() => setPending(null)}>
            {t("cart.keep")}
          </button>
          <button
            type="button"
            className="btn-primary h-12"
            onClick={() => {
              cart.clear();
              if (pending) cart.add(ctx, pending.line, props.serviceItems);
              setPending(null);
            }}
          >
            {t("cart.clearAndContinue")}
          </button>
        </div>
      </Modal>

      <Modal open={branchConflict !== null} onOpenChange={(v) => !v && setBranchConflict(null)} title={t("cart.conflictTitle")}>
        <p className="text-[15px] text-ink/80">{t("cart.conflictBranch", { branch: tr(props.branch.name), items: branchConflict?.missing.join(", ") ?? "" })}</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="btn-soft h-12"
            onClick={() => {
              setBranchConflict(null);
              router.replace(menuHref({ branch: s.branchId }), { scroll: false });
            }}
          >
            {t("cart.keep")}
          </button>
          <button
            type="button"
            className="btn-primary h-12"
            onClick={() => {
              cart.clear();
              setBranchConflict(null);
            }}
          >
            {t("cart.clearAndContinue")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
