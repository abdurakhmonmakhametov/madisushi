"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Dropdown } from "@/components/ui/Dropdown";
import { formatDateKey } from "@/lib/time";
import { useT } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict";
import { addDays, todayLocal } from "@/lib/time";
import { Field, QtyControl, Spinner } from "@/components/ui/primitives";
import { IconCheck } from "@/components/ui/icons";

interface Props {
  brands: { id: string; slug: string; name: string }[];
  branches: { id: string; brandId: string; name: string; address: string; maxParty: number }[];
  initialBrandId: string | null;
  initialBranchId: string | null;
  customer: { name: string; phone: string } | null;
}

export function ReserveForm({ brands, branches, initialBrandId, initialBranchId, customer }: Props) {
  const { t, lang } = useT();
  const [brandId, setBrandId] = useState(initialBrandId ?? brands[0]?.id ?? "");
  const brandBranches = branches.filter((b) => b.brandId === brandId);
  const [branchId, setBranchId] = useState(initialBranchId && brandBranches.some((b) => b.id === initialBranchId) ? initialBranchId : brandBranches[0]?.id ?? "");
  const [date, setDate] = useState(todayLocal());
  const [party, setParty] = useState(2);
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<{ time: string; available: boolean }[] | null>(null);
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "+998 ");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: number } | null>(null);
  const branch = branches.find((b) => b.id === branchId);
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(todayLocal(), i)), []);

  useEffect(() => {
    if (!branchId) return;
    const ctl = new AbortController();
    setSlots(null);
    fetch(`/api/reservations?branchId=${branchId}&date=${date}&party=${party}`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((d) => {
        setSlots(d.slots ?? []);
        setTime((cur) => (d.slots ?? []).some((s: { time: string; available: boolean }) => s.time === cur && s.available) ? cur : "");
      })
      .catch(() => {});
    return () => ctl.abort();
  }, [branchId, date, party]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/reservations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ branchId, date, time, partySize: party, name, phone, notes: notes || null }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(d.error === "validation" ? t("err.validation") : t(`err.${d.error}` as DictKey));
    setDone({ number: d.number });
  };

  if (done) {
    return (
      <div className="card mt-6 p-8 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-warn-50 text-warn">
          <IconCheck size={28} />
        </div>
        <h2 className="mt-4 text-xl font-semibold">
          {t("reserve.pendingTitle")} · №{done.number}
        </h2>
        <p className="mt-2 text-muted">{t("reserve.pending")}</p>
        <p className="mt-2 inline-block rounded-full bg-warn-50 px-3 py-1 text-sm font-medium text-warn">{t("reserve.status.pending")}</p>
        {customer && (
          <div>
            <Link href="/account/reservations" className="btn-soft mt-6 h-12">
              {t("account.reservations")}
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card anim-rise mt-6 space-y-5 p-5 sm:p-7">
      <div className={clsx("grid gap-4", brands.length > 1 && "sm:grid-cols-2")}>
        <div className={clsx("block", brands.length <= 1 && "hidden")}>
          <span className="mb-1.5 block text-sm font-medium">{t("reserve.brand")}</span>
          <Dropdown
            variant="field"
            size="lg"
            aria-label={t("reserve.brand")}
            value={brandId}
            onValueChange={(v) => {
              setBrandId(v);
              setBranchId(branches.find((b) => b.brandId === v)?.id ?? "");
            }}
            options={brands.map((b) => ({ value: b.id, label: b.name }))}
          />
        </div>
        <div className="block">
          <span className="mb-1.5 block text-sm font-medium">{t("reserve.branch")}</span>
          <Dropdown variant="field" size="lg" aria-label={t("reserve.branch")} value={branchId} onValueChange={setBranchId} options={brandBranches.map((b) => ({ value: b.id, label: b.name }))} />
        </div>
      </div>
      {branch && <p className="-mt-2 text-sm text-muted">{branch.address}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="block min-w-0">
          <span className="mb-1.5 block text-sm font-medium">{t("reserve.date")}</span>
          <Dropdown
            variant="field"
            size="lg"
            aria-label={t("reserve.date")}
            value={date}
            onValueChange={setDate}
            options={days.map((d) => ({ value: d, label: formatDateKey(d, lang) }))}
          />
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-medium">{t("reserve.party")}</span>
          <QtyControl size="lg" className="h-14" value={party} min={1} max={branch?.maxParty ?? 12} onChange={setParty} labels={{ dec: t("cart.decrease"), inc: t("cart.increase") }} />
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t("reserve.time")}</legend>
        {slots === null ? (
          <Spinner />
        ) : slots.length === 0 ? (
          <p className="text-sm text-muted">{t("reserve.noSlots")}</p>
        ) : (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {slots.map((s) => (
              <label key={s.time} className={clsx("rounded-[12px] py-2.5 text-center text-sm font-medium transition-[background-color,color,transform,box-shadow] active:scale-95 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand", !s.available ? "cursor-not-allowed bg-field text-subtle line-through" : time === s.time ? "cursor-pointer bg-brand text-white shadow-[0_4px_12px_rgb(215_40_47/0.3)]" : "cursor-pointer bg-field hover:bg-line")}>
                <input type="radio" name="time" className="sr-only" value={s.time} disabled={!s.available} checked={time === s.time} onChange={() => setTime(s.time)} />
                {s.time}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("account.name")} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
        <Field label={t("account.phone")} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </div>
      <label className="block">
        <span className="sr-only">{t("reserve.notes")}</span>
        <textarea className="field min-h-24 py-4" placeholder={t("reserve.notes")} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <p className="rounded-[14px] bg-info-50 p-3 text-sm text-info">{t("reserve.pending")}</p>
      {err && (
        <p className="text-sm text-brand" role="alert">
          {err}
        </p>
      )}
      <button type="submit" className="btn-primary h-14 w-full text-[17px]" disabled={busy || !time || !name.trim()}>
        {busy && <Spinner />} {t("reserve.submit")}
      </button>
    </form>
  );
}
