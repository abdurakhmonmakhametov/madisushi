"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { useT } from "@/lib/i18n/client";
import type { DictKey, I18nText } from "@/lib/i18n/dict";
import { formatUZS } from "@/lib/money";
import { formatDay, formatTime, localParts } from "@/lib/time";
import type { CheckoutQuote, Issue } from "@/lib/services/checkout";
import { cart, dishCount, useCart } from "@/components/cart/cart-store";
import { setAddress, useAddress } from "@/components/site/address-store";
import { AddressPicker } from "@/components/site/AddressPicker";
import { OtpLogin } from "@/components/auth/OtpLogin";
import { Field, Modal, QtyControl, Segmented, Spinner, Toggle } from "@/components/ui/primitives";
import { IconCheck, IconChevronDown, IconClock, IconInfo, IconPin } from "@/components/ui/icons";
import { HelpTip } from "@/components/ui/HelpTip";
import { menuHref } from "@/lib/menu-href";

export interface SavedAddress {
  id: string;
  label: string | null;
  address_text: string;
  lat: number;
  lng: number;
  house: string | null;
  apartment: string | null;
  floor: string | null;
  entrance: string | null;
  instructions: string | null;
}

interface Props {
  customer: { name: string | null; phone: string; loyaltyBalance: number } | null;
  saved: SavedAddress[];
  options: { leaveAtDoor: boolean; forOther: boolean; deliveryNote: I18nText; loyaltyEnabled: boolean };
}

const ONLINE = ["click", "payme", "mock"];
const IDEM_KEY = "sushi_checkout_key";

function newKey() {
  return (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, "");
}

export function CheckoutForm({ customer, saved, options }: Props) {
  const { t, tr, lang } = useT();
  const router = useRouter();
  const s = useCart();
  const address = useAddress();
  const [hydrated, setHydrated] = useState(false);
  const [name, setName] = useState(customer?.name ?? "");
  const [details, setDetails] = useState({ house: "", apartment: "", floor: "", entrance: "", instructions: "" });
  const [leaveAtDoor, setLeaveAtDoor] = useState(false);
  const [forOther, setForOther] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("+998 ");
  const [schedule, setSchedule] = useState<string>("asap");
  const [payment, setPayment] = useState<string>("");
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<string | null>(null);
  const [loyaltyInput, setLoyaltyInput] = useState("");
  const [loyalty, setLoyalty] = useState(0);
  const [saveAddress, setSaveAddress] = useState(true);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [submitIssues, setSubmitIssues] = useState<Issue[] | null>(null);
  const [priceChange, setPriceChange] = useState<{ old: number; next: number } | null>(null);
  const [addrOpen, setAddrOpen] = useState(false);
  const [laterDay, setLaterDay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<string>("");

  useEffect(() => {
    setHydrated(true);
    try {
      keyRef.current = sessionStorage.getItem(IDEM_KEY) || newKey();
      sessionStorage.setItem(IDEM_KEY, keyRef.current);
    } catch {
      keyRef.current = newKey();
    }
  }, []);

  // Prefill apartment details from the chosen address.
  useEffect(() => {
    if (!address) return;
    setDetails({
      house: address.house ?? "",
      apartment: address.apartment ?? "",
      floor: address.floor ?? "",
      entrance: address.entrance ?? "",
      instructions: address.instructions ?? "",
    });
  }, [address?.text, address?.lat, address?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => s.lines.map((l) => ({ productId: l.productId, optionIds: l.optionIds, quantity: l.qty })), [s.lines]);
  const isDelivery = s.fulfillment === "delivery";

  const quoteInput = useMemo(() => {
    if (!s.brandId || !s.branchId) return null;
    return {
      brandId: s.brandId,
      branchId: s.branchId,
      fulfillment: s.fulfillment,
      address: isDelivery && address ? { text: address.text, lat: address.lat, lng: address.lng, ...details } : null,
      items,
      promoCode: promo,
      loyalty,
      asap: schedule === "asap",
      scheduledFor: schedule === "asap" ? null : schedule,
    };
  }, [s.brandId, s.branchId, s.fulfillment, isDelivery, address, details, items, promo, loyalty, schedule]);

  const fetchQuote = useCallback(async (input: NonNullable<typeof quoteInput>, signal?: AbortSignal) => {
    const r = await fetch("/api/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), signal });
    if (!r.ok) throw new Error("quote");
    return (await r.json()) as CheckoutQuote;
  }, []);

  useEffect(() => {
    if (!quoteInput || items.length === 0) return;
    const ctl = new AbortController();
    setLoading(true);
    const h = setTimeout(async () => {
      try {
        const q = await fetchQuote(quoteInput, ctl.signal);
        setQuote(q);
        setSubmitIssues(null);
        setError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(t("common.error"));
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(h);
      ctl.abort();
    };
  }, [quoteInput, items.length, fetchQuote, t]);

  // Default payment method, and keep schedule valid.
  useEffect(() => {
    if (!quote) return;
    if (!payment || !quote.paymentMethods.includes(payment as never)) setPayment(quote.paymentMethods[0] ?? "");
    if (schedule === "asap" && !quote.schedule.asapAvailable && quote.schedule.slots[0]) setSchedule(quote.schedule.slots[0]);
  }, [quote]); // eslint-disable-line react-hooks/exhaustive-deps

  const online = ONLINE.includes(payment);
  useEffect(() => {
    if (!online || !isDelivery) setLeaveAtDoor(false);
  }, [online, isDelivery]);

  const issueText = (i: Issue) => {
    const params = Object.fromEntries(Object.entries(i.params ?? {}).map(([k, v]) => [k, typeof v === "number" ? formatUZS(v) : v]));
    if (i.code === "address_required") return t("checkout.addressRequired");
    return t(`err.${i.code}` as DictKey, params);
  };

  if (!hydrated) {
    return (
      <div className="mt-8 grid place-items-center py-20 text-muted">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (dishCount(s) === 0) {
    return (
      <div className="card mt-8 p-10 text-center">
        <p className="text-lg font-medium">{t("checkout.emptyCart")}</p>
        <Link href="/" className="btn-primary mt-6 h-12">
          {t("checkout.backToMenu")}
        </Link>
      </div>
    );
  }

  const q = quote?.quote;
  const issues = submitIssues ?? quote?.issues ?? [];
  const promoIssue = quote?.promo?.error ? t(`err.promo.${quote.promo.error}` as DictKey) : null;
  const loyaltyIssue = issues.find((i) => i.code === "loyalty_exceeds_limit");
  const promoMin = issues.find((i) => i.code === "promo_min_subtotal");
  const blocking = issues.filter((i) => !i.code.startsWith("promo") && i.code !== "loyalty_exceeds_limit");
  const canPlaceBase = Boolean(customer && q && blocking.length === 0 && !promoIssue && !promoMin && !loyaltyIssue && payment && name.trim() && !loading && (!forOther || (recipientName.trim() && recipientPhone.replace(/\D/g, "").length >= 12)));
  const canPlace = canPlaceBase;
  const recipientOk = !forOther || (recipientName.trim() && recipientPhone.replace(/\D/g, "").length >= 12);
  const missing: string[] = [];
  if (!customer) missing.push(t("checkout.missing.login"));
  else if (!name.trim()) missing.push(t("checkout.missing.name"));
  if (isDelivery && !address) missing.push(t("checkout.missing.address"));
  if (!payment) missing.push(t("checkout.missing.payment"));
  if (!recipientOk) missing.push(t("checkout.missing.recipient"));
  for (const i of blocking) if (i.code !== "address_required") missing.push(issueText(i));
  if (promoIssue || promoMin || loyaltyIssue) missing.push(t("checkout.missing.fix"));
  const done = {
    personal: Boolean(customer && name.trim()),
    conditions: (!isDelivery || Boolean(address)) && Boolean(recipientOk),
    time: true,
    items: true,
    payment: Boolean(payment),
  };

  const place = async (expectedTotal: number) => {
    if (!quoteInput) return;
    setPlacing(true);
    setError(null);
    try {
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...quoteInput,
          customerName: name.trim(),
          paymentMethod: payment,
          leaveAtDoor,
          isForOther: forOther,
          recipientName: forOther ? recipientName : null,
          recipientPhone: forOther ? recipientPhone : null,
          comment: s.comment || null,
          saveAddress: isDelivery && saveAddress && !address?.savedId,
          idempotencyKey: keyRef.current,
          expectedTotal,
        }),
      });
      const data = await r.json();
      if (r.ok) {
        try {
          sessionStorage.removeItem(IDEM_KEY);
        } catch {}
        cart.clear();
        if (data.paymentUrl) window.location.assign(data.paymentUrl);
        else router.push(`/orders/${data.orderId}?placed=1`);
        return;
      }
      if (data.error === "price_changed") {
        setQuote(data.quote);
        setPriceChange({ old: data.expectedTotal, next: data.quote.quote.total });
      } else if (data.error === "validation" && data.issues) {
        if (data.quote) setQuote(data.quote);
        setSubmitIssues(data.issues);
      } else if (data.error === "unauthorized") {
        router.refresh();
      } else {
        setError(t(`err.${data.error}` as DictKey));
      }
    } catch {
      setError(t("common.error"));
    } finally {
      setPlacing(false);
    }
  };

  // Group slots by local day for the time picker.
  const slotGroups = new Map<string, string[]>();
  for (const iso of quote?.schedule.slots ?? []) {
    const day = localParts(new Date(iso)).date;
    slotGroups.set(day, [...(slotGroups.get(day) ?? []), iso]);
  }
  const today = localParts(new Date()).date;
  const dayLabel = (day: string) => {
    const first = slotGroups.get(day)![0];
    if (day === today) return t("common.today");
    const tomorrow = localParts(new Date(Date.now() + 86400000)).date;
    return day === tomorrow ? t("common.tomorrow") : formatDay(first, lang);
  };

  const days = [...slotGroups.keys()];
  const activeDay = schedule !== "asap" ? localParts(new Date(schedule)).date : (laterDay ?? days[0] ?? null);
  const card = "card p-5 sm:p-6";
  const mismatch = issues.find((i) => i.code === "branch_mismatch");

  return (
    <div className="mt-7 grid grid-cols-1 items-start gap-5 lg:grid-cols-2 lg:gap-8">
      {/* LEFT */}
      <div className="space-y-5">
        <section className={card} aria-labelledby="personal-h">
          <StepTitle id="personal-h" n={1} done={done.personal}>
            {t("checkout.personal")}
          </StepTitle>
          {customer ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("checkout.name")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} required />
              <Field label={t("checkout.phone")} value={customer.phone} readOnly />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted">{t("checkout.loginRequired")}</p>
              <OtpLogin compact />
            </div>
          )}
        </section>

        <section className={card} aria-labelledby="cond-h">
          <StepTitle id="cond-h" n={2} done={done.conditions}>
            {t("checkout.conditions")}
          </StepTitle>
          <Segmented
            className="inline-flex"
            label={t("checkout.conditions")}
            value={s.fulfillment}
            onChange={(v) => cart.setFulfillment(v)}
            options={[
              { value: "delivery", label: t("cart.delivery"), disabled: quote?.branch ? !quote.branch.acceptsDelivery : false },
              { value: "pickup", label: t("cart.pickup"), disabled: quote?.branch ? !quote.branch.acceptsPickup : false },
            ]}
          />
          {isDelivery ? (
            <div className="mt-5 space-y-4">
              <button type="button" onClick={() => setAddrOpen(true)} className={clsx("flex max-w-full items-center gap-3 rounded-[16px] px-4 py-3 text-left text-[17px] font-medium transition-colors", address ? "bg-field hover:bg-line" : "animate-pulse bg-brand-50 text-brand ring-2 ring-brand/30 hover:animate-none")}>
                <IconPin size={22} className="shrink-0" />
                <span className="truncate">{address ? address.text : t("nav.chooseAddress")}</span>
                <IconChevronDown size={18} className="shrink-0" />
              </button>
              {saved.length > 0 && (
                <div className="flex flex-wrap gap-2" aria-label={t("checkout.savedAddresses")}>
                  {saved.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setAddress({ text: a.address_text, lat: a.lat, lng: a.lng, house: a.house, apartment: a.apartment, floor: a.floor, entrance: a.entrance, instructions: a.instructions, savedId: a.id })}
                      className={clsx("rounded-full px-3 py-1.5 text-sm transition-[background-color,color,transform] active:scale-95", address?.savedId === a.id ? "bg-ink text-white" : "bg-field hover:bg-line")}
                    >
                      {a.label || a.address_text}
                    </button>
                  ))}
                </div>
              )}
              <p className="flex items-start gap-2 text-[13px] text-muted">
                <IconInfo size={16} className="mt-px shrink-0 text-info" /> {t("checkout.addressHelp")}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(["house", "apartment", "floor", "entrance"] as const).map((k) => (
                  <label key={k} className="block">
                    <span className="sr-only">{t(`checkout.${k}`)}</span>
                    <input value={details[k]} maxLength={k === "house" || k === "apartment" ? 20 : 10} onChange={(e) => setDetails((d) => ({ ...d, [k]: e.target.value }))} placeholder={t(`checkout.${k}`)} className="field h-[66px]" />
                  </label>
                ))}
              </div>
              <label className="block">
                <span className="sr-only">{t("checkout.courierComment")}</span>
                <input value={details.instructions} maxLength={300} onChange={(e) => setDetails((d) => ({ ...d, instructions: e.target.value }))} placeholder={t("checkout.courierComment")} className="field h-[66px]" />
              </label>
              {customer && !address?.savedId && address && (
                <label className="flex cursor-pointer items-center gap-3 text-sm">
                  <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />
                  {t("checkout.saveAddress")}
                </label>
              )}
              <div className="space-y-5 pt-2">
                {options.leaveAtDoor && <Toggle label={t("checkout.leaveAtDoor")} hint={t("checkout.leaveAtDoorHint")} checked={leaveAtDoor} onChange={setLeaveAtDoor} disabled={!online} />}
                {options.forOther && <Toggle label={t("checkout.forOther")} hint={t("checkout.forOtherHint")} checked={forOther} onChange={setForOther} />}
                {forOther && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={t("checkout.recipientName")} value={recipientName} onChange={(e) => setRecipientName(e.target.value)} maxLength={80} />
                    <Field label={t("checkout.recipientPhone")} type="tel" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-[16px] bg-field p-4">
              <p className="text-sm text-muted">{t("checkout.pickupFrom")}</p>
              <p className="mt-1 font-medium">
                {s.brandName} · {tr(quote?.branch?.name ?? s.branchName)}
              </p>
              <p className="text-sm text-muted">{tr(quote?.branch?.address)}</p>
              {options.forOther && (
                <div className="mt-4 space-y-4">
                  <Toggle label={t("checkout.forOther")} hint={t("checkout.forOtherHint")} checked={forOther} onChange={setForOther} />
                  {forOther && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label={t("checkout.recipientName")} value={recipientName} onChange={(e) => setRecipientName(e.target.value)} maxLength={80} />
                      <Field label={t("checkout.recipientPhone")} type="tel" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {mismatch && quote?.suggestedBranchId && (
            <p className="mt-4 rounded-[14px] bg-info-50 p-3 text-sm text-info">
              {t("err.branch_mismatch")}.{" "}
              <Link className="font-semibold underline" href={menuHref({ branch: quote.suggestedBranchId })}>
                {t("common.confirm")}
              </Link>
            </p>
          )}
        </section>

        <section className={card} aria-labelledby="time-h">
          <StepTitle id="time-h" n={3} done={done.time}>
            {t("checkout.schedule")}
          </StepTitle>
          <Segmented
            className="w-full sm:w-auto sm:inline-grid"
            label={t("checkout.schedule")}
            value={schedule === "asap" ? "asap" : "later"}
            onChange={(v) => {
              if (v === "asap") setSchedule("asap");
              else {
                const day = laterDay ?? days[0];
                const first = day ? slotGroups.get(day)?.[0] : undefined;
                if (first) setSchedule(first);
              }
            }}
            options={[
              { value: "asap", label: t("checkout.whenAsap"), disabled: quote?.schedule.asapAvailable === false },
              { value: "later", label: t("checkout.whenLater"), disabled: days.length === 0 },
            ]}
          />
          {schedule === "asap" ? (
            <p key="asap" className="anim-rise mt-4 flex items-center gap-3 rounded-[16px] bg-ok-50 p-4 text-[15px] text-ok">
              <IconClock size={22} className="shrink-0" />
              <span>
                <b>{t("checkout.whenAsap")}</b> · {t("checkout.asapHint", { min: quote?.schedule.leadMinutes ?? "…" })}
              </span>
            </p>
          ) : (
            <div key="later" className="anim-rise mt-4 space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium text-muted">{t("checkout.pickDay")}</p>
                <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {days.map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        setLaterDay(day);
                        const first = slotGroups.get(day)?.[0];
                        if (first) setSchedule(first);
                      }}
                      className={clsx("h-11 shrink-0 rounded-full px-5 text-[15px] font-medium transition-[background-color,color,transform] active:scale-95", day === activeDay ? "bg-ink text-white" : "bg-field hover:bg-line")}
                    >
                      {dayLabel(day)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-muted">{t("checkout.pickTime")}</p>
                <div role="radiogroup" aria-label={t("checkout.pickTime")} className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-5">
                  {(activeDay ? slotGroups.get(activeDay) ?? [] : []).map((iso) => (
                    <button
                      key={iso}
                      type="button"
                      role="radio"
                      aria-checked={schedule === iso}
                      onClick={() => setSchedule(iso)}
                      className={clsx("h-11 rounded-[12px] text-[15px] font-medium tabular-nums transition-[background-color,color,transform,box-shadow] active:scale-95", schedule === iso ? "bg-brand text-white shadow-[0_4px_12px_rgb(215_40_47/0.3)]" : "bg-field hover:bg-line")}
                    >
                      {formatTime(iso)}
                    </button>
                  ))}
                </div>
              </div>
              <p className="flex items-center gap-2 text-sm font-medium text-ink/80">
                <IconCheck size={16} className="text-ok" /> {t("checkout.chosenTime", { time: `${activeDay ? dayLabel(activeDay) : ""}, ${formatTime(schedule)}` })}
              </p>
            </div>
          )}
          {quote && !quote.schedule.asapAvailable && <p className="mt-2 text-sm text-warn">{t("checkout.asapClosed")}</p>}
        </section>

        <section className={card} aria-labelledby="items-h">
          <StepTitle id="items-h" n={4} done={done.items}>
            {t("checkout.items")}
          </StepTitle>
          <ul className="divide-y divide-line">
            {s.lines.map((l) => {
              const unavailable = issues.some((i) => i.code === "unavailable" && i.params?.productId === l.productId);
              return (
                <li key={l.key} className="flex items-center gap-4 py-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {l.imageUrl ? <img src={l.imageUrl} alt="" className="size-20 shrink-0 rounded-[16px] object-cover" /> : <span className="size-20 shrink-0 rounded-[16px] bg-field" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px]">{tr(l.name)}</p>
                    {l.optionNames.length > 0 && <p className="text-xs text-muted">{l.optionNames.map((o) => tr(o)).join(", ")}</p>}
                    <p className="mt-1 text-[17px] tabular-nums">{formatUZS(l.unitPrice * l.qty)}</p>
                    {unavailable && <p className="text-sm text-brand">{t("menu.unavailable")}</p>}
                  </div>
                  <QtyControl size="lg" className="w-[134px] shrink-0" value={l.qty} min={0} onChange={(v) => cart.setQty(l.key, v)} labels={{ dec: `${t("cart.decrease")}: ${tr(l.name)}`, inc: `${t("cart.increase")}: ${tr(l.name)}` }} />
                </li>
              );
            })}
          </ul>
          <label className="mt-3 block">
            <span className="sr-only">{t("checkout.orderComment")}</span>
            <textarea value={s.comment} onChange={(e) => cart.setComment(e.target.value)} maxLength={500} rows={2} placeholder={t("checkout.orderComment")} className="field min-h-[66px] resize-y py-5" />
          </label>
        </section>
      </div>

      {/* RIGHT */}
      <aside className="card p-5 sm:p-7 lg:sticky lg:top-[132px]" aria-labelledby="pay-h">
        <StepTitle id="pay-h" n={5} done={done.payment}>
          {t("checkout.payment")}
        </StepTitle>
        <div role="radiogroup" aria-label={t("checkout.payment")} className="mt-4 space-y-2">
          {(quote?.paymentMethods ?? []).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={payment === m}
              onClick={() => setPayment(m)}
              className={clsx("flex w-full items-center gap-4 rounded-[16px] border-2 p-2 pr-4 text-left transition-[background-color,border-color,transform] active:scale-[0.99]", payment === m ? "border-brand/60 bg-brand-50/50" : "border-transparent hover:bg-field")}
            >
              <span className="grid size-[54px] shrink-0 place-items-center rounded-[14px] bg-field text-2xl" aria-hidden>
                {{ cash: "💵", card_on_delivery: "💳", click: "🔵", payme: "🟢", mock: "🧪" }[m] ?? "💳"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] leading-tight">{t(`pay.${m}` as DictKey)}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted">{t(`pay.hint.${m}` as DictKey)}</span>
              </span>
              <span className={clsx("grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors", payment === m ? "border-brand bg-brand text-white" : "border-line")}>
                {payment === m && <IconCheck size={14} className="anim-pop" />}
              </span>
              {m === "mock" && <span className="rounded bg-warn-50 px-2 py-0.5 text-xs font-semibold text-warn">DEV</span>}
            </button>
          ))}
        </div>

        <h3 className="mt-6 flex items-center gap-2 text-[20px] font-medium">{t("checkout.promo")} <HelpTip text={t("checkout.promoHelp")} /></h3>
        <form
          className="mt-3 flex gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setPromo(promoInput.trim() ? promoInput.trim().toUpperCase() : null);
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">{t("checkout.promo")}</span>
            <input value={promoInput} onChange={(e) => setPromoInput(e.target.value)} maxLength={32} placeholder={t("checkout.promoPlaceholder")} className="h-[66px] w-full min-w-0 rounded-[16px] border border-line px-5 outline-none transition-[border-color,box-shadow] hover:border-[#d6d6d4] focus:border-brand/50 focus:ring-4 focus:ring-brand/10" />
          </label>
          {promo ? (
            <button
              type="button"
              className="btn-soft h-[66px]"
              onClick={() => {
                setPromo(null);
                setPromoInput("");
              }}
            >
              {t("checkout.remove")}
            </button>
          ) : (
            <button type="submit" className="btn-soft h-[66px] text-muted" disabled={!promoInput.trim()}>
              {t("checkout.apply")}
            </button>
          )}
        </form>
        {promo && (promoIssue || issues.find((i) => i.code === "promo_min_subtotal")) && <p className="mt-2 text-sm text-brand">{promoIssue ?? issueText(issues.find((i) => i.code === "promo_min_subtotal")!)}</p>}
        {promo && !promoIssue && q && q.discountTotal > 0 && <p className="anim-pop mt-2 flex items-center gap-1.5 text-sm font-medium text-ok"><IconCheck size={16} /> −{formatUZS(q.discountTotal)}</p>}

        {options.loyaltyEnabled && (
          <>
            <div className="mt-6 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[20px] font-medium">
                {t("checkout.loyalty")}
                <HelpTip text={`${t("checkout.loyaltyHelp")} ${t("checkout.loyaltyInfo")}`} />
              </h3>
              <span className="text-[20px] text-ok tabular-nums">{formatUZS(customer?.loyaltyBalance ?? 0)}</span>
            </div>
            {customer ? (
              <form
                className="mt-3 flex gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = Number(loyaltyInput.replace(/\D/g, "")) || 0;
                  setLoyalty(v);
                }}
              >
                <label className="min-w-0 flex-1">
                  <span className="sr-only">{t("checkout.loyalty")}</span>
                  <input value={loyaltyInput} onChange={(e) => setLoyaltyInput(e.target.value.replace(/[^\d\s]/g, ""))} inputMode="numeric" placeholder={t("checkout.loyaltyMax", { amount: formatUZS(q?.loyaltyMax ?? 0) })} className="h-[66px] w-full min-w-0 rounded-[16px] border border-line px-5 outline-none transition-[border-color,box-shadow] hover:border-[#d6d6d4] focus:border-brand/50 focus:ring-4 focus:ring-brand/10" />
                </label>
                {loyalty > 0 ? (
                  <button
                    type="button"
                    className="btn-soft h-[66px]"
                    onClick={() => {
                      setLoyalty(0);
                      setLoyaltyInput("");
                    }}
                  >
                    {t("checkout.remove")}
                  </button>
                ) : (
                  <button type="submit" className="btn-soft h-[66px] text-muted" disabled={!loyaltyInput.trim()}>
                    {t("checkout.apply")}
                  </button>
                )}
              </form>
            ) : (
              <p className="mt-2 text-sm text-muted">{t("checkout.loyaltyLogin")}</p>
            )}
            {loyaltyIssue && <p className="mt-2 text-sm text-brand">{issueText(loyaltyIssue)}</p>}
          </>
        )}

        <h3 className="mt-8 text-[22px] font-semibold">{t("checkout.priceBreakdown")}</h3>
        <dl className={clsx("mt-3 space-y-3 text-[18px] transition-opacity", loading && "opacity-60")}>
          <Row label={t("checkout.subtotal")} value={q?.subtotal} />
          <Row label={t("checkout.packaging")} value={q?.packagingTotal} />
          {isDelivery && <Row label={t("checkout.deliveryFee")} value={q?.deliveryFee} hint={q?.freeDeliveryFrom ? t("checkout.freeDeliveryFrom", { amount: formatUZS(q.freeDeliveryFrom) }) : undefined} />}
          {isDelivery && q && q.zoneSurcharge > 0 && <Row label={t("checkout.zoneSurcharge")} value={q.zoneSurcharge} />}
          {q && q.discountTotal > 0 && <Row label={t("checkout.discount")} value={-q.discountTotal} tone="ok" />}
          {q && q.loyaltySpent > 0 && <Row label={t("checkout.loyaltySpent")} value={-q.loyaltySpent} tone="ok" />}
        </dl>
        {isDelivery && (quote?.delivery?.surchargeNote || tr(options.deliveryNote)) && (
          <div className="mt-4 flex gap-3 rounded-[16px] bg-info-50 p-4 text-[15px] text-info">
            <IconInfo size={20} className="mt-0.5 shrink-0" />
            <p>{quote?.delivery?.surchargeNote ? tr(quote.delivery.surchargeNote) : tr(options.deliveryNote)}</p>
          </div>
        )}

        {blocking.length > 0 && (
          <ul className="mt-4 space-y-1 rounded-[16px] bg-brand-50 p-4 text-[15px] text-brand" role="alert">
            {blocking.map((i, n) => (
              <li key={n}>{issueText(i)}</li>
            ))}
          </ul>
        )}
        {error && (
          <p className="mt-4 text-sm text-brand" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex items-center justify-between">
          <span className="text-[22px]">{t("checkout.total")}</span>
          <span key={q?.total ?? 0} className="anim-pop text-[28px] font-semibold tabular-nums">{q ? formatUZS(q.total) : "—"}</span>
        </div>
        <button type="button" disabled={!canPlace || placing} onClick={() => q && place(q.total)} className="btn-primary mt-3 h-[70px] w-full rounded-[16px] text-[22px] font-semibold">
          {placing ? (
            <>
              <Spinner /> {t("checkout.placing")}
            </>
          ) : (
            t("checkout.place")
          )}
        </button>
        {!placing && (missing.length > 0 ? (
          <div className="anim-rise mt-4 rounded-[16px] bg-field p-4 text-sm">
            <p className="font-semibold">{t("checkout.missingTitle")}</p>
            <ul className="mt-2 space-y-1.5">
              {missing.map((m) => (
                <li key={m} className="flex items-start gap-2 text-ink/80">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" /> {m}
                </li>
              ))}
            </ul>
          </div>
        ) : canPlace ? (
          <p className="anim-pop mt-3 flex items-center justify-center gap-1.5 text-sm font-medium text-ok">
            <IconCheck size={16} /> {t("checkout.allSet")}
          </p>
        ) : null)}
      </aside>

      <AddressPicker open={addrOpen} onOpenChange={setAddrOpen} saved={saved} />

      <Modal open={priceChange !== null} onOpenChange={(v) => !v && setPriceChange(null)} title={t("checkout.priceChangedTitle")}>
        <p className="text-[15px]">{priceChange && t("checkout.priceChanged", { old: formatUZS(priceChange.old), new: formatUZS(priceChange.next) })}</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="btn-soft h-12" onClick={() => setPriceChange(null)}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="btn-primary h-12"
            onClick={() => {
              const next = priceChange!.next;
              setPriceChange(null);
              place(next);
            }}
          >
            {t("checkout.confirmNew")}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value, hint, tone }: { label: string; value: number | undefined; hint?: string; tone?: "ok" }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="flex items-center gap-2">
        {label}
        {hint && <HelpTip text={hint} />}
      </dt>
      <dd className={clsx("font-medium tabular-nums", tone === "ok" && "text-ok")}>{value === undefined ? "—" : formatUZS(value)}</dd>
    </div>
  );
}

function StepTitle({ id, n, done, children }: { id: string; n: number; done: boolean; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-4 flex items-center gap-3 text-[22px] font-semibold">
      <span className={clsx("grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold transition-colors duration-300", done ? "bg-ok text-white" : "bg-brand-50 text-brand")}>
        {done ? <IconCheck size={16} className="anim-pop" /> : n}
      </span>
      {children}
    </h2>
  );
}
