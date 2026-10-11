"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { useT } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict";
import { formatUZS } from "@/lib/money";
import type { MenuProduct } from "@/lib/services/catalog";
import { priceLine } from "@/lib/pricing";
import { IconFlame, IconPlus, IconStar } from "@/components/ui/icons";
import { Badge, Modal, QtyControl } from "@/components/ui/primitives";

export function ProductCard({
  p,
  qty,
  onOpen,
  onAdd,
  onQty,
}: {
  p: MenuProduct;
  qty: number;
  onOpen: () => void;
  onAdd: () => void;
  onQty: (v: number) => void;
}) {
  const { t, tr } = useT();
  const hasOptions = p.groups.length > 0;
  const name = tr(p.name);
  return (
    <article className={clsx("card lift group flex h-full flex-col p-2.5 md:p-4", !p.available && "opacity-70", qty > 0 && "ring-2 ring-brand/15")}>
      <button type="button" onClick={onOpen} className="relative block overflow-hidden rounded-[var(--radius-tile)] text-left" aria-label={name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.imageUrl ?? ""} alt="" loading="lazy" className={clsx("aspect-square w-full bg-field object-cover transition-transform duration-500 [transition-timing-function:var(--ease-out)] group-hover:scale-[1.06]", !p.available && "grayscale")} />
        {p.badges.includes("spicy") && (
          <span className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-brand text-white shadow" title={t("menu.spicy")}>
            <IconFlame size={16} />
            <span className="sr-only">{t("menu.spicy")}</span>
          </span>
        )}
        <span className="absolute left-2 top-2 flex flex-wrap gap-1">
          {p.badges.includes("bestseller") && <Badge tone="warn"><IconStar size={12} fill="currentColor" /> {t("menu.bestseller")}</Badge>}
          {p.badges.includes("new") && <Badge tone="ok">{t("menu.new")}</Badge>}
          {!p.available && <Badge tone="neutral">{t("menu.unavailable")}</Badge>}
        </span>
      </button>
      <h3 className="mt-2.5 line-clamp-2 text-[14px] font-medium leading-snug md:text-base">
        <button type="button" onClick={onOpen} className="text-left hover:underline">
          {name}
        </button>
      </h3>
      {p.weightGrams ? <p className="mt-0.5 text-xs text-muted">{t("product.grams", { g: p.weightGrams })}</p> : null}
      <div className="mt-auto pt-2.5">
        {!p.available ? (
          <button type="button" disabled className="btn-soft h-10 w-full text-sm text-muted md:h-11">
            {t("menu.unavailable")}
          </button>
        ) : qty > 0 && !hasOptions ? (
          <div className="flex flex-col gap-2">
            <p className="text-[15px] font-bold tabular-nums md:text-lg">{formatUZS(p.price)}</p>
            <QtyControl className="h-10 bg-brand-50 text-brand md:h-11" value={qty} onChange={onQty} labels={{ dec: `${t("cart.decrease")}: ${name}`, inc: `${t("cart.increase")}: ${name}` }} />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-[15px] font-bold tabular-nums md:text-lg">{formatUZS(p.price)}</p>
            <button type="button" onClick={hasOptions ? onOpen : onAdd} className="btn-soft h-10 w-full text-[14px] hover:bg-brand hover:text-white hover:shadow-[0_6px_16px_rgb(215_40_47/0.25)] md:h-11 md:text-[15px]" aria-label={`${t("menu.add")}: ${name}`}>
              <IconPlus size={18} /> {t("menu.add")}
              {qty > 0 && <span key={qty} className="anim-pop rounded-full bg-brand px-2 text-xs font-semibold text-white">{qty}</span>}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export function ProductModal({
  p,
  open,
  onOpenChange,
  onAdd,
}: {
  p: MenuProduct | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (optionIds: string[], qty: number) => void;
}) {
  const { t, tr } = useT();
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={p ? tr(p.name) : ""} hideTitle className="sm:w-[min(920px,calc(100vw-32px))]">
      {p && <ProductDetails key={p.id} p={p} onAdd={onAdd} t={t} tr={tr} />}
    </Modal>
  );
}

function ProductDetails({ p, onAdd, t, tr }: { p: MenuProduct; onAdd: (optionIds: string[], qty: number) => void; t: (k: DictKey, v?: Record<string, string | number>) => string; tr: (v: { uz: string; ru?: string } | null | undefined) => string }) {
  const [selected, setSelected] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      p.groups.map((g) => {
        const active = g.options.filter((o) => o.isActive);
        const def = active.find((o) => o.isDefault) ?? active[0];
        return [g.id, g.kind === "variant" && def ? [def.id] : []];
      }),
    ),
  );
  const [qty, setQty] = useState(1);
  const optionIds = useMemo(() => Object.values(selected).flat(), [selected]);
  const priced = priceLine(p, optionIds);
  const unit = priced.ok ? priced.unitPrice : p.price;

  const toggle = (groupId: string, optionId: string, kind: "variant" | "extra", max: number) => {
    setSelected((s) => {
      const cur = s[groupId] ?? [];
      if (kind === "variant") return { ...s, [groupId]: [optionId] };
      if (cur.includes(optionId)) return { ...s, [groupId]: cur.filter((x) => x !== optionId) };
      if (cur.length >= max) return s;
      return { ...s, [groupId]: [...cur, optionId] };
    });
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.imageUrl ?? ""} alt="" className="anim-pop aspect-[4/3] w-full rounded-[20px] bg-field object-cover sm:aspect-square" />
      <div className="flex min-w-0 flex-col">
        <h2 className="pr-10 text-2xl font-semibold">{tr(p.name)}</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {p.weightGrams && <Badge>{t("product.weight")}: {t("product.grams", { g: p.weightGrams })}</Badge>}
          {p.badges.includes("spicy") && <Badge tone="brand"><IconFlame size={13} /> {t("menu.spicy")}</Badge>}
          {p.badges.includes("vegetarian") && <Badge tone="ok">{t("menu.vegetarian")}</Badge>}
          {p.badges.includes("bestseller") && <Badge tone="warn"><IconStar size={12} fill="currentColor" /> {t("menu.bestseller")}</Badge>}
        </div>
        {tr(p.description) && <p className="mt-4 text-[15px] leading-relaxed text-ink/80">{tr(p.description)}</p>}
        {tr(p.ingredients) && tr(p.ingredients) !== tr(p.description) && (
          <p className="mt-3 text-sm">
            <span className="font-semibold">{t("product.ingredients")}: </span>
            <span className="text-muted">{tr(p.ingredients)}</span>
          </p>
        )}
        {p.allergens.length > 0 && (
          <div className="mt-3 text-sm">
            <span className="font-semibold">{t("product.allergens")}: </span>
            <span className="text-muted">{p.allergens.map((a) => t(`allergen.${a}` as DictKey)).join(", ")}</span>
          </div>
        )}

        {p.groups.map((g) => {
          const opts = g.options.filter((o) => o.isActive);
          return (
            <fieldset key={g.id} className="mt-5">
              <legend className="mb-2 text-sm font-semibold">
                {tr(g.name)}{" "}
                <span className="font-normal text-muted">({g.kind === "variant" ? t("product.required") : t("product.upTo", { n: g.maxSelect })})</span>
              </legend>
              <div className={clsx(g.kind === "variant" ? "flex flex-wrap gap-2" : "space-y-1")}>
                {opts.map((o) => {
                  const on = (selected[g.id] ?? []).includes(o.id);
                  return g.kind === "variant" ? (
                    <label key={o.id} className={clsx("cursor-pointer rounded-[14px] border-2 px-4 py-2.5 text-[15px] transition-[background-color,border-color,transform] active:scale-95", on ? "border-brand bg-brand-50 font-medium" : "border-transparent bg-field hover:bg-line")}>
                      <input type="radio" className="sr-only" name={g.id} checked={on} onChange={() => toggle(g.id, o.id, "variant", 1)} />
                      {tr(o.name)} {o.priceDelta !== 0 && <span className="text-muted">+{formatUZS(o.priceDelta)}</span>}
                    </label>
                  ) : (
                    <label key={o.id} className={clsx("flex cursor-pointer items-center justify-between gap-3 rounded-[14px] px-3 py-2.5 transition-colors", on ? "bg-brand-50/60" : "hover:bg-field")}>
                      <span className="flex items-center gap-3">
                        <input type="checkbox" checked={on} onChange={() => toggle(g.id, o.id, "extra", g.maxSelect)} disabled={!on && (selected[g.id]?.length ?? 0) >= g.maxSelect} />
                        {tr(o.name)}
                      </span>
                      <span className="text-sm text-muted">+{formatUZS(o.priceDelta)}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        <div className="sticky -bottom-5 -mx-5 mt-auto border-t border-line bg-white px-5 pb-5 pt-3 sm:static sm:mx-0 sm:border-0 sm:p-0 sm:pt-6">
          {!p.available ? (
            <p className="rounded-[14px] bg-field p-4 text-center text-muted">{t("product.notAvailable")}</p>
          ) : (
            <div className="flex gap-3">
              <QtyControl size="lg" className="w-[120px] shrink-0 sm:w-[140px]" value={qty} min={1} onChange={setQty} labels={{ dec: t("cart.decrease"), inc: t("cart.increase") }} />
              <button type="button" disabled={!priced.ok} onClick={() => onAdd(optionIds, qty)} className="btn-primary h-[52px] min-w-0 flex-1 justify-between gap-3 whitespace-nowrap px-5 text-[16px]">
                <IconPlus size={20} className="shrink-0 min-[460px]:hidden" />
                <span className="hidden truncate min-[460px]:inline">{t("product.addToCart")}</span>
                <span className="font-bold tabular-nums">{formatUZS(unit * qty)}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
