"use client";

import Link from "next/link";
import clsx from "clsx";
import { useT } from "@/lib/i18n/client";
import { formatUZS } from "@/lib/money";
import { QtyControl, Segmented } from "@/components/ui/primitives";
import { IconCart } from "@/components/ui/icons";
import { HelpTip } from "@/components/ui/HelpTip";
import { cart, cartTotal, dishCount, useCart } from "./cart-store";
import { menuHref } from "@/lib/menu-href";

export function CartPanel({ onNavigate, className }: { onNavigate?: () => void; className?: string }) {
  const { t, tr } = useT();
  const s = useCart();
  const empty = dishCount(s) === 0;
  const total = cartTotal(s);
  return (
    <div className={clsx("flex min-h-0 flex-1 flex-col", className)}>
      <div className={clsx("flex items-baseline justify-between gap-3", onNavigate && "pr-12")}>
        <h2 className="flex items-center gap-2 text-[22px] font-semibold">
          {t("cart.title")}
          {!empty && <HelpTip text={t("cart.qtyHint")} />}
        </h2>
        {s.brandName && !empty && (
          <Link href={menuHref({ branch: s.branchId })} onClick={onNavigate} className="truncate text-sm text-muted hover:text-ink">
            {s.brandName} · {tr(s.branchName)}
          </Link>
        )}
      </div>
      <Segmented
        className="mt-4"
        label={t("checkout.conditions")}
        value={s.fulfillment}
        onChange={(v) => cart.setFulfillment(v)}
        options={[
          { value: "delivery", label: t("cart.delivery") },
          { value: "pickup", label: t("cart.pickup") },
        ]}
      />
      {empty ? (
        <div className="grid flex-1 place-items-center py-12 text-center">
          <div className="anim-pop">
            <div className="relative mx-auto mb-4 grid size-20 place-items-center rounded-full bg-field text-muted">
              <span className="absolute inset-0 animate-ping rounded-full bg-field opacity-60 [animation-duration:2.4s]" />
              <IconCart size={32} className="relative" />
            </div>
            <p className="text-[17px] font-semibold">{t("cart.empty")}</p>
            <p className="mt-1 text-sm text-muted">{t("cart.emptyHint")}</p>
            <Link href="/#hits" onClick={onNavigate} className="btn-soft mt-5 h-11 text-sm">
              {t("cart.emptyCta")}
            </Link>
          </div>
        </div>
      ) : (
        <ul className="mt-4 min-h-0 flex-1 divide-y divide-line overflow-y-auto overscroll-contain">
          {s.lines.map((l) => (
            <li key={l.key} className="anim-rise flex items-center gap-3 py-3.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {l.imageUrl ? <img src={l.imageUrl} alt="" className="size-14 shrink-0 rounded-xl object-cover" /> : <span className="size-14 shrink-0 rounded-xl bg-field" />}
              <div className="min-w-0 flex-1">
                <p className="text-[15px] leading-snug">{tr(l.name)}</p>
                {l.optionNames.length > 0 && <p className="truncate text-xs text-muted">{l.optionNames.map((o) => tr(o)).join(", ")}</p>}
                <p className="mt-0.5 text-[15px] tabular-nums">{formatUZS(l.unitPrice * l.qty)}</p>
              </div>
              <QtyControl size="sm" className="w-[104px] shrink-0" value={l.qty} min={0} onChange={(v) => cart.setQty(l.key, v)} labels={{ dec: `${t("cart.decrease")}: ${tr(l.name)}`, inc: `${t("cart.increase")}: ${tr(l.name)}` }} />
            </li>
          ))}
        </ul>
      )}
      <Link
        href={empty ? "#" : "/checkout"}
        onClick={(e) => {
          if (empty) e.preventDefault();
          else onNavigate?.();
        }}
        aria-disabled={empty}
        className={clsx("btn-primary mt-4 h-[60px] w-full justify-between rounded-[16px] px-6 text-[17px]", empty && "pointer-events-none opacity-50")}
      >
        <span>{t("cart.checkout")}</span>
        <span key={total} className="anim-pop font-bold tabular-nums">{formatUZS(total)}</span>
      </Link>
      {!empty && <p className="mt-2 text-center text-xs text-muted">{t("cart.nextHint")}</p>}
    </div>
  );
}
