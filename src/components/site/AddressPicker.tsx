"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { IconLocate, IconPin } from "@/components/ui/icons";
import { Modal, Spinner } from "@/components/ui/primitives";
import { setAddress, useAddress, type CurrentAddress } from "./address-store";
import type { HeaderProps } from "./Header";

interface Place {
  id: string;
  name: { uz: string; ru: string };
  district: { uz: string; ru: string };
  lat: number;
  lng: number;
}

export function AddressPicker({ open, onOpenChange, saved }: { open: boolean; onOpenChange: (v: boolean) => void; saved: HeaderProps["savedAddresses"] }) {
  const { t, lang } = useT();
  const router = useRouter();
  const current = useAddress();
  const [q, setQ] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    const h = setTimeout(async () => {
      try {
        const r = await fetch(`/api/address/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        if (r.ok) setPlaces((await r.json()).places);
      } catch {
        /* aborted */
      }
    }, 150);
    return () => {
      clearTimeout(h);
      ctl.abort();
    };
  }, [q, open]);

  const choose = (a: CurrentAddress) => {
    setAddress(a);
    onOpenChange(false);
    router.refresh();
  };

  const locate = () => {
    setErr(null);
    if (!navigator.geolocation) return setErr(t("address.notFound"));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await fetch(`/api/address/nearest?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`);
          const { place } = (await r.json()) as { place: Place };
          choose({ text: place.name[lang], lat: pos.coords.latitude, lng: pos.coords.longitude });
        } catch {
          setErr(t("common.error"));
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        setErr(t("address.notFound"));
      },
      { timeout: 10000 },
    );
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t("nav.address")}>
      <div className="space-y-4">
        <label className="pill h-14 w-full px-4 focus-within:ring-2 focus-within:ring-brand/40">
          <IconPin size={20} className="text-muted" />
          <span className="sr-only">{t("address.search")}</span>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("address.search")} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-subtle" />
        </label>
        <button type="button" onClick={locate} className="btn-soft h-12 w-full" disabled={locating}>
          {locating ? <Spinner /> : <IconLocate size={18} />} {t("address.useLocation")}
        </button>
        {err && <p className="text-sm text-brand">{err}</p>}

        {saved.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-muted">{t("address.saved")}</h3>
            <ul className="space-y-1">
              {saved.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => choose({ text: a.address_text, lat: a.lat, lng: a.lng, house: a.house, apartment: a.apartment, floor: a.floor, entrance: a.entrance, instructions: a.instructions, savedId: a.id })}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-field aria-[current=true]:bg-field"
                    aria-current={current?.savedId === a.id}
                  >
                    <IconPin size={18} className="shrink-0 text-brand" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{a.label || a.address_text}</span>
                      <span className="block truncate text-sm text-muted">
                        {a.address_text}
                        {a.house ? `, ${a.house}` : ""}
                        {a.apartment ? `, ${a.apartment}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-sm font-semibold text-muted">{t("address.suggestions")}</h3>
          {places.length === 0 ? (
            <p className="px-3 py-2 text-muted">{t("address.notFound")}</p>
          ) : (
            <ul className="max-h-[40dvh] space-y-1 overflow-y-auto">
              {places.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => choose({ text: p.name[lang], lat: p.lat, lng: p.lng })} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-field">
                    <IconPin size={18} className="shrink-0 text-muted" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.name[lang]}</span>
                      <span className="block truncate text-sm text-muted">{p.district[lang]}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}
