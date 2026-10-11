"use client";

// Live order board: one column per stage, each card with a single big
// "next step" button, so staff move orders along without opening them.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import clsx from "clsx";
import { useLang } from "@/lib/i18n/client";
import { tr } from "@/lib/i18n/dict";
import { formatUZS } from "@/lib/money";
import { formatTime } from "@/lib/time";
import { nextStatuses, type OrderStatus, type StaffRole, staffCanSet } from "@/lib/order-status";
import type { BoardOrder } from "@/lib/services/orders";
import { Spinner } from "@/components/ui/primitives";
import { IconAlarm, IconArrowRight, IconBag, IconComment, IconPhone, IconPin, IconPrinter, IconTruck } from "@/components/ui/icons";
import { methodLabel, paymentLabel, statusLabel } from "./labels";
import { orderStatusAction } from "@/app/admin/actions/orders";
import { toast, useL } from "./ui";

const COLUMNS: { status: OrderStatus; tone: string; dot: string }[] = [
  { status: "new", tone: "bg-info-50 text-info", dot: "bg-info" },
  { status: "confirmed", tone: "bg-[#eef2ff] text-[#4f46e5]", dot: "bg-[#4f46e5]" },
  { status: "preparing", tone: "bg-warn-50 text-warn", dot: "bg-warn" },
  { status: "ready", tone: "bg-ok-50 text-ok", dot: "bg-ok" },
  { status: "out_for_delivery", tone: "bg-field text-ink", dot: "bg-ink" },
];

/** Button text: what the person actually did, in their words. */
const ACTION: Record<string, [string, string]> = {
  confirmed: ["Qabul qilish", "Принять"],
  preparing: ["Tayyorlashni boshlash", "Начать готовить"],
  ready: ["Tayyor bo'ldi", "Готово"],
  out_for_delivery: ["Kuryerga berildi", "Передан курьеру"],
  delivered: ["Yetkazildi", "Доставлен"],
  picked_up: ["Mijoz olib ketdi", "Гость забрал"],
};

/** Current time, starting from the server's clock so the first render matches (no hydration mismatch). */
function useNow(initial: number, ms = 20000) {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    setNow(Date.now());
    const h = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(h);
  }, [ms]);
  return now;
}

export function OrderBoard({ orders, role, serverNow }: { orders: BoardOrder[]; role: StaffRole; serverNow: number }) {
  const L = useL();
  const lang = useLang();
  const now = useNow(serverNow);
  const byStatus = (s: OrderStatus) => orders.filter((o) => o.status === s);
  // Phones show one column at a time; start on the first one that has work.
  const [tab, setTab] = useState<OrderStatus>(() => COLUMNS.find((c) => orders.some((o) => o.status === c.status))?.status ?? "new");

  return (
    <div>
      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden" role="tablist">
        {COLUMNS.map((c) => {
          const n = byStatus(c.status).length;
          const on = tab === c.status;
          return (
            <button key={c.status} type="button" role="tab" aria-selected={on} onClick={() => setTab(c.status)} className={clsx("flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors", on ? "bg-ink text-white" : "bg-white text-ink shadow-[var(--shadow-card)]")}>
              <span className={clsx("size-2 rounded-full", c.dot)} />
              {statusLabel(c.status, lang)}
              <span className={clsx("grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] tabular-nums", on ? "bg-white/20" : n && c.status === "new" ? "bg-brand text-white" : "bg-field")}>{n}</span>
            </button>
          );
        })}
      </div>
      <div className="lg:no-scrollbar lg:-mx-2 lg:overflow-x-auto lg:px-2 lg:pb-2">
        <div className="lg:grid lg:min-w-[1100px] lg:grid-cols-5 lg:gap-3">
          {COLUMNS.map((c) => {
            const list = byStatus(c.status);
            return (
              <section key={c.status} className={clsx("min-w-0 flex-col rounded-2xl lg:flex lg:bg-black/[0.025] lg:p-2", tab === c.status ? "flex" : "hidden")} aria-label={statusLabel(c.status, lang)}>
                <header className="mb-2 hidden items-center justify-between gap-2 px-1.5 pt-1 lg:flex">
                  <span className={clsx("inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[13px] font-semibold", c.tone)}>
                    <span className={clsx("size-2 rounded-full", c.dot)} />
                    {statusLabel(c.status, lang)}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-muted">{list.length}</span>
                </header>
                <ul className="space-y-2.5 lg:max-h-[calc(100dvh-260px)] lg:overflow-y-auto lg:pr-0.5">
                  {list.length === 0 && (
                    <li className="rounded-2xl border-2 border-dashed border-line px-3 py-8 text-center text-sm text-muted">
                      {c.status === "new" ? L("Yangi buyurtma yo'q. Kelganda shu yerda paydo bo'ladi.", "Новых заказов нет. Появятся здесь.") : L("Bo'sh", "Пусто")}
                    </li>
                  )}
                  {list.map((o) => (
                    <li key={o.id}>
                      <OrderCard o={o} role={role} now={now} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function minutesSince(iso: string, now: number) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

function OrderCard({ o, role, now }: { o: BoardOrder; role: StaffRole; now: number }) {
  const L = useL();
  const lang = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [armed, setArmed] = useState(false);
  const next = nextStatuses(o.fulfillment, o.status).find((s) => s !== "cancelled" && staffCanSet(role, s));
  const final = next === "delivered" || next === "picked_up";
  const age = minutesSince(o.created_at, now);
  const inStage = minutesSince(o.status_at, now);
  const lateBy = Math.floor((now - new Date(o.promised_at).getTime()) / 60000);
  const scheduledLater = !o.asap && new Date(o.promised_at).getTime() - now > 60 * 60000;
  // New orders should be answered within minutes; later stages are late once past the promised time.
  const urgency = o.status === "new" ? (age >= 10 ? "late" : age >= 5 ? "warn" : "ok") : lateBy > 0 && !scheduledLater ? "late" : lateBy > -10 && !scheduledLater ? "warn" : "ok";

  useEffect(() => {
    if (!armed) return;
    const h = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(h);
  }, [armed]);

  const advance = () => {
    if (!next) return;
    if (final && !armed) return setArmed(true);
    setArmed(false);
    start(async () => {
      const fd = new FormData();
      fd.set("orderId", o.id);
      fd.set("to", next);
      const r = await orderStatusAction(null, fd);
      if (r?.error) toast(r.error, "error");
      else toast(`№${o.number} → ${statusLabel(next, lang)}`);
      router.refresh();
    });
  };

  const addr = o.address ? [o.address.text, o.address.house && `${L("uy", "дом")} ${o.address.house}`, o.address.apartment && `${L("xon.", "кв.")} ${o.address.apartment}`].filter(Boolean).join(", ") : "";

  return (
    <article className={clsx("anim-rise rounded-2xl border bg-white p-3 shadow-[var(--shadow-card)] transition-opacity", pending && "opacity-60", o.status === "new" ? "border-info/40" : "border-transparent", urgency === "late" && "!border-brand/60 ring-2 ring-brand/10")}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/admin/orders/${o.id}`} className="group min-w-0 whitespace-nowrap text-[18px] font-bold leading-tight text-ink hover:text-brand">
          № {o.number}
        </Link>
        <span
          className={clsx("shrink-0 rounded-lg px-2 py-0.5 text-xs font-semibold tabular-nums", urgency === "late" ? "bg-brand text-white" : urgency === "warn" ? "bg-warn-50 text-warn" : "bg-field text-muted")}
          title={L(`Buyurtma berilganiga ${age} daqiqa, shu bosqichda ${inStage} daqiqa`, `С момента заказа ${age} мин, на этом этапе ${inStage} мин`)}
        >
          {age < 60 ? `${age} ${L("daq", "мин")}` : `${Math.floor(age / 60)} ${L("soat", "ч")} ${age % 60} ${L("daq", "мин")}`}
        </span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 text-xs font-medium text-muted">
          {o.fulfillment === "delivery" ? <IconTruck size={14} /> : <IconBag size={14} />}
          <span className="truncate">{o.fulfillment === "delivery" ? L("Yetkazish", "Доставка") : L("Olib ketish", "Самовывоз")}</span>
        </span>
        <Link href={`/admin/orders/${o.id}/ticket`} target="_blank" className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted transition-colors hover:bg-field hover:text-ink" title={L("Oshxona chekini chop etish", "Печать кухонного чека")}>
          <IconPrinter size={14} /> {L("Chek", "Чек")}
        </Link>
      </div>

      {!o.asap && (
        <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-warn-50 px-2 py-1 text-xs font-semibold text-warn">
          <IconAlarm size={14} /> {L("Vaqtga", "Ко времени")}: {formatTime(o.promised_at)}
        </p>
      )}
      {o.asap && o.status !== "new" && lateBy > 0 && (
        <p className="mt-2 rounded-lg bg-brand-50 px-2 py-1 text-xs font-semibold text-brand">
          {L(`Va'da qilingan vaqtdan ${lateBy} daq kechikmoqda`, `Опаздывает на ${lateBy} мин`)}
        </p>
      )}

      <ul className="mt-2 space-y-0.5 text-[13px] leading-snug">
        {o.items.slice(0, 6).map((it, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="shrink-0 font-bold tabular-nums">{it.q}×</span>
            <span className="min-w-0">
              {tr(it.n, lang)}
              {it.o && it.o.length > 0 && <span className="text-muted"> ({it.o.map((x) => tr(x, lang)).join(", ")})</span>}
            </span>
          </li>
        ))}
        {o.items.length > 6 && <li className="text-xs text-muted">+ {o.items.length - 6} {L("ta yana", "ещё")}</li>}
      </ul>
      {o.comment && (
        <p className="mt-2 flex gap-1.5 rounded-lg bg-warn-50 px-2 py-1.5 text-xs">
          <IconComment size={14} className="mt-px shrink-0 text-warn" /> <span className="min-w-0 [overflow-wrap:anywhere]">{o.comment}</span>
        </p>
      )}

      <div className="mt-2 space-y-1 border-t border-line pt-2 text-xs text-muted">
        <p className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-medium text-ink">{o.customer_name}</span>
          <a href={`tel:${o.customer_phone}`} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-field px-1.5 py-0.5 font-medium text-ink hover:bg-line" onClick={(e) => e.stopPropagation()}>
            <IconPhone size={13} /> {L("Qo'ng'iroq", "Звонок")}
          </a>
        </p>
        {o.fulfillment === "delivery" && addr && (
          <p className="flex gap-1">
            <IconPin size={13} className="mt-px shrink-0" /> <span className="line-clamp-2">{addr}</span>
          </p>
        )}
        <p>
          {methodLabel(o.payment_method, lang)} · <span className={o.payment_status === "paid" ? "font-medium text-ok" : undefined}>{paymentLabel(o.payment_status, lang)}</span>
        </p>
        <p className="flex items-center justify-between gap-2">
          <span className="truncate">{tr(o.branch_name, lang)}</span>
          <span className="shrink-0 text-[14px] font-bold tabular-nums text-ink">{formatUZS(o.total)}</span>
        </p>
      </div>

      {next && (
        <button
          type="button"
          onClick={advance}
          disabled={pending}
          className={clsx("btn mt-2.5 h-12 w-full px-3 text-[14px] font-semibold leading-tight transition-colors", armed ? "bg-ok text-white" : o.status === "new" ? "bg-brand text-white hover:bg-brand-600" : "bg-ink text-white hover:bg-ink/85")}
        >
          {pending && <Spinner />}
          <span className="min-w-0 text-balance">{armed ? L("Aniqmi? Yana bosing", "Точно? Нажмите ещё раз") : L(...ACTION[next])}</span>
          {!pending && !armed && <IconArrowRight size={16} className="shrink-0" />}
        </button>
      )}
    </article>
  );
}
