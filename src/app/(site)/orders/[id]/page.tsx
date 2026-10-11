import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import clsx from "clsx";
import { getT } from "@/lib/i18n/server";
import { tr, type DictKey } from "@/lib/i18n/dict";
import { getCustomer } from "@/lib/auth/session";
import { getCustomerOrder } from "@/lib/services/orders";
import { customerCanCancel, TERMINAL, timeline } from "@/lib/order-status";
import { formatUZS } from "@/lib/money";
import { formatDateTime, formatTime } from "@/lib/time";
import { enabledMethods, type PaymentMethod } from "@/lib/payments/core";
import { IconCheck, IconPhone } from "@/components/ui/icons";
import { getSettings } from "@/lib/settings";
import { StatusBadge } from "@/components/orders/StatusBadge";
import { CancelOrder, ReorderButton } from "@/components/orders/OrderActions";
import { LiveRefresh } from "@/components/live/LiveRefresh";

export const metadata = { title: "Order" };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ placed?: string; payment?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const customer = await getCustomer();
  if (!customer) redirect(`/login?next=/orders/${id}`);
  const detail = await getCustomerOrder(customer.id, id);
  if (!detail) notFound();
  const [{ t, lang }, settings] = await Promise.all([getT(), getSettings()]);
  const { order: o, items, history } = detail;
  const steps = timeline(o.fulfillment);
  const reached = new Set(history.map((h) => h.to_status));
  const current = steps.indexOf(o.status);
  const online = ["click", "payme", "mock"].includes(o.payment_method);
  const canPay = online && o.status !== "cancelled" && ["pending", "failed"].includes(o.payment_status) && enabledMethods().includes(o.payment_method as PaymentMethod);
  const live = !TERMINAL.includes(o.status) || o.payment_status === "pending";
  const phone = (o.branch_phone || settings.contacts.phone || "").replace(/[^\d+]/g, "");
  // Minutes until the promised time (the page re-renders on every live update and every 30s).
  const minsLeft = Math.round((new Date(o.promised_at).getTime() - Date.now()) / 60000);
  const eta = TERMINAL.includes(o.status) ? null : !o.asap && minsLeft > 90 ? null : minsLeft > 3 ? t("order.eta", { min: minsLeft }) : minsLeft >= -5 ? t("order.etaSoon") : t("order.etaLate");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <LiveRefresh scope="customer" kinds={["order"]} id={o.id} fallbackMs={live ? 30000 : undefined} />
      {sp.placed && (
        <div className="card anim-pop mb-5 flex items-center gap-3 bg-ok-50 p-5 text-ok" role="status">
          <IconCheck size={24} /> <span className="font-semibold">{t("order.thanks")}</span>
        </div>
      )}
      {sp.payment && o.payment_status === "pending" && (
        <div className="card mb-5 bg-warn-50 p-5 text-warn" role="status">
          {t("pay.status.pending")}…
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[28px] font-bold">{t("order.title", { number: o.number })}</h1>
        <StatusBadge status={o.status} label={t(`status.${o.status}` as DictKey)} />
      </div>
      <p className="mt-1 text-muted">
        {o.brand_name} · {tr(o.branch_name, lang)} · {formatDateTime(o.created_at, lang)}
      </p>

      <section className={clsx("anim-rise mt-6 flex items-center gap-4 overflow-hidden rounded-[24px] p-5 sm:p-6", o.status === "cancelled" ? "bg-brand-50" : TERMINAL.includes(o.status) ? "bg-ok-50" : "bg-night text-white")} aria-live="polite">
        <span className={clsx("relative grid size-16 shrink-0 place-items-center rounded-2xl text-3xl", TERMINAL.includes(o.status) ? "bg-white" : "bg-white/10")} aria-hidden>
          {!TERMINAL.includes(o.status) && <span className="absolute inset-0 animate-ping rounded-2xl bg-brand/30 [animation-duration:2s]" />}
          <span className="relative">{{ new: "📨", confirmed: "👍", preparing: "👨‍🍳", ready: "📦", out_for_delivery: "🛵", delivered: "🎉", picked_up: "🎉", cancelled: "✖️" }[o.status] ?? "🍣"}</span>
        </span>
        <div className="min-w-0">
          <p className={clsx("text-xs font-semibold uppercase tracking-wider", TERMINAL.includes(o.status) ? "text-muted" : "text-white/60")}>{t("order.nowTitle")}</p>
          <p className="mt-1 text-lg font-semibold leading-snug sm:text-xl">{t(`order.now.${o.status}` as DictKey)}</p>
          {eta && <p className="mt-1.5 inline-flex rounded-full bg-white/10 px-3 py-1 text-sm font-semibold">⏱ {eta}</p>}
          {live && <p className={clsx("mt-1 text-sm", TERMINAL.includes(o.status) ? "text-muted" : "text-white/60")}>{t("order.autoUpdate")}</p>}
        </div>
        {phone && !TERMINAL.includes(o.status) && (
          <a href={`tel:${phone}`} className="ml-auto hidden shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-white/90 sm:flex">
            <IconPhone size={18} /> {t("order.callRestaurant")}
          </a>
        )}
      </section>
      {phone && !TERMINAL.includes(o.status) && (
        <a href={`tel:${phone}`} className="btn-soft mt-3 h-12 w-full sm:hidden">
          <IconPhone size={18} /> {t("order.callRestaurant")}
        </a>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <section className="card p-6" aria-labelledby="tl">
            <h2 id="tl" className="sr-only">
              Timeline
            </h2>
            {o.status === "cancelled" ? (
              <p className="rounded-[14px] bg-brand-50 p-4 text-brand">{t("order.cancelled", { reason: t(`reason.${o.cancel_reason}` as DictKey) })}</p>
            ) : (
              <ol className="flex flex-col gap-4 sm:grid sm:gap-0" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
                {steps.map((st, i) => {
                  const done = i <= current;
                  const at = history.find((h) => h.to_status === st)?.created_at;
                  return (
                    <li key={st} className="flex min-w-0 items-center gap-3 sm:flex-col sm:items-start sm:gap-2" aria-current={i === current ? "step" : undefined}>
                      <div className="flex items-center sm:w-full">
                        <span className={clsx("relative grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold transition-colors duration-500", i < current || (done && TERMINAL.includes(o.status)) ? "bg-ok text-white" : done ? "bg-brand text-white shadow-[0_0_0_6px_rgb(215_40_47/0.12)]" : "bg-field text-muted")}>
                          {i === current && !TERMINAL.includes(o.status) && <span className="absolute inset-0 animate-ping rounded-full bg-brand/30" />}
                          <span className="relative">{done ? <IconCheck size={18} /> : i + 1}</span>
                        </span>
                        {i < steps.length - 1 && <span className="mx-2 hidden h-1 flex-1 overflow-hidden rounded bg-field sm:block"><span className={clsx("block h-full origin-left rounded bg-ok transition-transform duration-700", i < current ? "scale-x-100" : "scale-x-0")} /></span>}
                      </div>
                      <div className="min-w-0 sm:pr-2">
                        <p className={clsx("text-sm font-medium leading-tight [overflow-wrap:anywhere]", !done && "text-muted")}>{t(`status.${st}` as DictKey)}</p>
                        {at && reached.has(st) && <p className="text-xs text-muted">{formatTime(at)}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {o.status !== "cancelled" && !TERMINAL.includes(o.status) && (
              <p className="mt-5 text-sm">
                {o.asap ? t("order.promised", { time: formatTime(o.promised_at) }) : t("order.scheduled", { time: formatDateTime(o.promised_at, lang) })}
                <span className="ml-2 text-muted">· {t("order.live")}</span>
              </p>
            )}
          </section>

          <section className="card p-6">
            <h2 className="mb-3 text-xl font-semibold">{t("checkout.items")}</h2>
            <ul className="divide-y divide-line">
              {items.map((it) => (
                <li key={it.id} className="flex items-center gap-4 py-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {it.image_url ? <img src={it.image_url} alt="" className="size-14 rounded-xl object-cover" /> : <span className="size-14 rounded-xl bg-field" />}
                  <div className="min-w-0 flex-1">
                    <p>{tr(it.name_snapshot, lang)}</p>
                    {it.options_snapshot.length > 0 && <p className="text-xs text-muted">{it.options_snapshot.map((x) => tr(x.name, lang)).join(", ")}</p>}
                    <p className="text-sm text-muted">
                      {it.quantity} × {formatUZS(it.unit_price)}
                    </p>
                  </div>
                  <span className="tabular-nums">{formatUZS(it.line_total)}</span>
                </li>
              ))}
            </ul>
            {o.comment && <p className="mt-3 rounded-[14px] bg-field p-3 text-sm">{o.comment}</p>}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="card space-y-2 p-6 text-[15px]">
            <Line label={t("checkout.subtotal")} v={o.subtotal} />
            <Line label={t("checkout.packaging")} v={o.packaging_total} />
            {o.fulfillment === "delivery" && <Line label={t("checkout.deliveryFee")} v={o.delivery_fee} />}
            {o.zone_surcharge > 0 && <Line label={t("checkout.zoneSurcharge")} v={o.zone_surcharge} />}
            {o.discount_total > 0 && <Line label={`${t("checkout.discount")}${o.promo_code ? ` (${o.promo_code})` : ""}`} v={-o.discount_total} />}
            {o.loyalty_spent > 0 && <Line label={t("checkout.loyaltySpent")} v={-o.loyalty_spent} />}
            <div className="flex justify-between border-t border-line pt-3 text-lg font-semibold">
              <span>{t("checkout.total")}</span>
              <span className="tabular-nums">{formatUZS(o.total)}</span>
            </div>
            {o.loyalty_earned > 0 && <p className="text-sm text-ok">+{formatUZS(o.loyalty_earned)} · {t("account.loyalty")}</p>}
          </section>

          <section className="card space-y-3 p-6 text-[15px]">
            <div>
              <p className="text-sm text-muted">{t("order.payment")}</p>
              <p className="font-medium">
                {t(`pay.${o.payment_method}` as DictKey)} · {t(`pay.status.${o.payment_status}` as DictKey)}
              </p>
            </div>
            {canPay && (
              <a href={`/orders/${o.id}/pay`} className="btn-primary h-12 w-full">
                {t("pay.payNow")} · {formatUZS(o.total)}
              </a>
            )}
            <div>
              <p className="text-sm text-muted">{o.fulfillment === "delivery" ? t("order.address") : t("order.pickupAt")}</p>
              {o.fulfillment === "delivery" && o.address ? (
                <p>
                  {o.address.text}
                  {o.address.house ? `, ${t("checkout.house")} ${o.address.house}` : ""}
                  {o.address.apartment ? `, ${t("checkout.apartment")} ${o.address.apartment}` : ""}
                  {o.address.entrance ? `, ${t("checkout.entrance")} ${o.address.entrance}` : ""}
                  {o.address.floor ? `, ${t("checkout.floor")} ${o.address.floor}` : ""}
                </p>
              ) : (
                <p>{tr(o.branch_address, lang)}</p>
              )}
              {o.leave_at_door && <p className="text-sm text-muted">{t("checkout.leaveAtDoor")}</p>}
              {o.is_for_other && (
                <p className="text-sm text-muted">
                  {t("checkout.recipientName")}: {o.recipient_name}, {o.recipient_phone}
                </p>
              )}
            </div>
          </section>

          <div className="flex flex-col gap-3">
            {customerCanCancel(o.status) && <CancelOrder orderId={o.id} />}
            {TERMINAL.includes(o.status) && <ReorderButton orderId={o.id} />}
            <Link href="/orders" className="btn-soft h-12">
              {t("account.orders")}
            </Link>
            {phone && (
              <p className="text-center text-sm text-muted">
                {t("order.help")}{" "}
                <a href={`tel:${phone}`} className="font-semibold text-ink hover:text-brand">
                  {o.branch_phone || settings.contacts.phone}
                </a>
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Line({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex justify-between gap-4">
      <span>{label}</span>
      <span className="tabular-nums">{formatUZS(v)}</span>
    </div>
  );
}
