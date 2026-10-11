"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { Field, Spinner } from "@/components/ui/primitives";
import { IconPin } from "@/components/ui/icons";
import { AddressPicker } from "@/components/site/AddressPicker";
import { useAddress } from "@/components/site/address-store";

export function ProfileForm({ name: initialName, email: initialEmail, phone }: { name: string; email: string; phone: string }) {
  const { t, lang } = useT();
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [state, setState] = useState<"idle" | "busy" | "saved" | "error">("idle");
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("busy");
    const r = await fetch("/api/account/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, email, preferredLang: lang }) });
    setState(r.ok ? "saved" : "error");
    if (r.ok) router.refresh();
  };
  return (
    <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
      <Field label={t("account.name")} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
      <Field label={t("account.phone")} value={phone} readOnly />
      <Field label={t("account.email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary h-14 px-8" disabled={state === "busy"}>
          {state === "busy" && <Spinner />} {t("account.save")}
        </button>
        {state === "saved" && <span className="text-sm text-ok">{t("account.saved")}</span>}
        {state === "error" && <span className="text-sm text-brand">{t("err.validation")}</span>}
      </div>
    </form>
  );
}

export function AddressList({ addresses }: { addresses: { id: string; label: string | null; address_text: string; house: string | null; apartment: string | null; is_default: boolean }[] }) {
  const { t } = useT();
  const router = useRouter();
  const current = useAddress();
  const [picker, setPicker] = useState(false);
  const [house, setHouse] = useState("");
  const [apartment, setApartment] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const remove = async (id: string) => {
    await fetch(`/api/account/addresses?id=${id}`, { method: "DELETE" });
    router.refresh();
  };
  const add = async () => {
    if (!current) return setPicker(true);
    setBusy(true);
    await fetch("/api/account/addresses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: current.text, lat: current.lat, lng: current.lng, house: house || null, apartment: apartment || null, label: label || null }),
    });
    setBusy(false);
    setHouse("");
    setApartment("");
    setLabel("");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {addresses.length === 0 ? (
        <p className="text-muted">—</p>
      ) : (
        <ul className="divide-y divide-line">
          {addresses.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-3">
              <IconPin size={18} className="shrink-0 text-brand" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {a.label || a.address_text} {a.is_default && <span className="ml-2 rounded-full bg-field px-2 py-0.5 text-xs text-muted">{t("account.default")}</span>}
                </p>
                <p className="text-sm text-muted">
                  {a.address_text}
                  {a.house ? `, ${a.house}` : ""}
                  {a.apartment ? `, ${a.apartment}` : ""}
                </p>
              </div>
              <button type="button" className="btn-ghost h-10 text-sm text-brand" onClick={() => remove(a.id)}>
                {t("account.delete")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="rounded-[16px] bg-field p-4">
        <p className="mb-3 font-medium">{t("account.addAddress")}</p>
        <button type="button" onClick={() => setPicker(true)} className="mb-3 flex items-center gap-2 text-left hover:text-brand">
          <IconPin size={18} /> {current ? current.text : t("nav.chooseAddress")}
        </button>
        <div className="grid grid-cols-3 gap-2">
          <input className="field h-12 bg-white" placeholder={t("checkout.house")} value={house} onChange={(e) => setHouse(e.target.value)} maxLength={20} aria-label={t("checkout.house")} />
          <input className="field h-12 bg-white" placeholder={t("checkout.apartment")} value={apartment} onChange={(e) => setApartment(e.target.value)} maxLength={20} aria-label={t("checkout.apartment")} />
          <input className="field h-12 bg-white" placeholder="Uy / Ish" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} aria-label="Label" />
        </div>
        <button type="button" onClick={add} className="btn-primary mt-3 h-12" disabled={busy || !current}>
          {busy && <Spinner />} {t("account.save")}
        </button>
      </div>
      <AddressPicker open={picker} onOpenChange={setPicker} saved={[]} />
    </div>
  );
}
