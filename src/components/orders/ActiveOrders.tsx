"use client";

// "Your order is on its way" tracker: a banner at the top of the site and a dot
// on the Orders tab while the signed-in customer has an order in progress.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import clsx from "clsx";
import { useT } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict";
import type { OrderStatus } from "@/lib/order-status";
import { IconArrowRight } from "@/components/ui/icons";
import { useRealtime } from "@/lib/realtime-client";

type Active = { id: string; number: number; status: OrderStatus; fulfillment: "delivery" | "pickup"; promised_at: string };

// One shared poller for every component that shows the tracker.
let orders: Active[] = [];
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let inflight = false;

async function load() {
  if (inflight) return;
  inflight = true;
  try {
    const r = await fetch("/api/orders/active", { cache: "no-store" });
    if (r.ok) {
      orders = ((await r.json()) as { orders: Active[] }).orders;
      listeners.forEach((l) => l());
    }
  } catch {
    /* offline */
  } finally {
    inflight = false;
  }
  clearTimeout(timer);
  // Live events drive updates (see useActiveOrders); this is only a safety net.
  if (listeners.size) timer = setTimeout(load, orders.length ? 45000 : 120000);
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (listeners.size === 1) void load();
  return () => {
    listeners.delete(l);
    if (!listeners.size) clearTimeout(timer);
  };
}

const EMPTY: Active[] = [];
export function useActiveOrders(enabled: boolean) {
  const pathname = usePathname();
  const list = useSyncExternalStore(enabled ? subscribe : () => () => {}, () => (enabled ? orders : EMPTY), () => EMPTY);
  useRealtime(
    "customer",
    (e) => {
      if (e.t === "order" || e.t === "resync") void load();
    },
    enabled,
  );
  // Re-check after navigation (e.g. right after placing or cancelling an order).
  useEffect(() => {
    if (enabled) void load();
  }, [enabled, pathname]);
  return list;
}

const EMOJI: Record<string, string> = { new: "📨", confirmed: "👍", preparing: "👨‍🍳", ready: "📦", out_for_delivery: "🛵" };
const STEPS = ["new", "confirmed", "preparing", "ready", "out_for_delivery"];

export function ActiveOrderBanner({ enabled }: { enabled: boolean }) {
  const { t } = useT();
  const pathname = usePathname();
  const list = useActiveOrders(enabled);
  const hidden = ["/orders", "/checkout", "/login", "/pay"].some((p) => pathname.startsWith(p));
  if (!enabled || hidden || list.length === 0) return null;
  const o = list[0];
  const step = Math.max(0, STEPS.indexOf(o.status));
  const total = o.fulfillment === "delivery" ? 5 : 4;
  return (
    <div className="no-print mx-auto max-w-[1600px] px-4 pt-3 md:px-6 lg:px-10">
      <Link href={`/orders/${o.id}`} className="anim-rise group flex items-center gap-3 overflow-hidden rounded-[20px] bg-night p-3 pr-4 text-white shadow-[var(--shadow-card)] transition-transform active:scale-[0.99]">
        <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-xl" aria-hidden>
          <span className="absolute inset-0 animate-ping rounded-2xl bg-brand/30 [animation-duration:2.2s]" />
          <span className="relative">{EMOJI[o.status] ?? "🍣"}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-[15px] font-semibold">{t("track.title", { number: o.number })}</span>
            {list.length > 1 && <span className="hidden shrink-0 text-xs text-white/50 sm:inline">· {t("track.more", { n: list.length - 1 })}</span>}
          </span>
          <span className="block truncate text-sm text-white/70">{t(`status.${o.status}` as DictKey)}</span>
          <span className="mt-1.5 flex gap-1" aria-hidden>
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={clsx("h-1 flex-1 rounded-full", i <= step ? "bg-brand" : "bg-white/15")} />
            ))}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-3 py-2 text-sm font-semibold transition-colors group-hover:bg-white/20">
          {t("track.open")} <IconArrowRight size={16} />
        </span>
      </Link>
    </div>
  );
}
