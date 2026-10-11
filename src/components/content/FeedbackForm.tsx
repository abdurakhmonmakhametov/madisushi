"use client";

import { useState } from "react";
import clsx from "clsx";
import { Dropdown } from "@/components/ui/Dropdown";
import { useT } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict";
import { Field, Spinner } from "@/components/ui/primitives";
import { IconStar } from "@/components/ui/icons";

export function FeedbackForm({ customer, branches }: { customer: { name: string; phone: string } | null; branches: { id: string; label: string }[] }) {
  const { t } = useT();
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [branchId, setBranchId] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, phone: phone || null, branchId: branchId || null, rating, message }),
    });
    setBusy(false);
    if (r.ok) setDone(true);
    else setErr(t(`err.${(await r.json().catch(() => ({ error: "validation" }))).error}` as DictKey));
  };

  if (done) return <p className="card p-8 text-center text-ok">{t("feedback.thanks")}</p>;
  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("account.name")} value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
        <Field label={t("account.phone")} value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />
      </div>
      <div className="block">
        <span className="mb-1.5 block text-sm font-medium">{t("menu.branch")}</span>
        <Dropdown variant="field" size="lg" aria-label={t("menu.branch")} value={branchId} onValueChange={setBranchId} options={[{ value: "", label: "—" }, ...branches.map((b) => ({ value: b.id, label: b.label }))]} />
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t("feedback.rating")}</legend>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-pressed={rating === n} onClick={() => setRating(n)} className={clsx("grid size-11 place-items-center rounded-full transition-[background-color,color,transform] duration-200 hover:scale-110 active:scale-90", rating !== null && n <= rating ? "bg-warn-50 text-warn" : "bg-field text-subtle hover:text-warn")} aria-label={`${n}/5`}>
              <IconStar size={22} fill={rating !== null && n <= rating ? "currentColor" : "none"} />
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="sr-only">{t("feedback.message")}</span>
        <textarea required minLength={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("feedback.message")} className="field min-h-32 py-4" />
      </label>
      {err && <p className="text-sm text-brand">{err}</p>}
      <button className="btn-primary h-14 w-full" disabled={busy}>
        {busy && <Spinner />} {t("feedback.send")}
      </button>
    </form>
  );
}
