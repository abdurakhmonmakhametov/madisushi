"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n/dict";
import { CANCEL_REASONS } from "@/lib/order-status";
import { Modal, Spinner } from "@/components/ui/primitives";
import { cart, type ServiceItem } from "@/components/cart/cart-store";
import type { I18n } from "@/lib/pricing";
import { menuHref } from "@/lib/menu-href";

export function CancelOrder({ orderId }: { orderId: string }) {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("customer_request");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/orders/${orderId}/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }) });
    setBusy(false);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setErr(t(`err.${d.error ?? "cannot_cancel"}` as DictKey));
      return;
    }
    setOpen(false);
    router.refresh();
  };
  return (
    <>
      <button type="button" className="btn-soft h-12 text-brand" onClick={() => setOpen(true)}>
        {t("order.cancel")}
      </button>
      <Modal open={open} onOpenChange={setOpen} title={t("order.cancel")}>
        <fieldset>
          <legend className="mb-3 text-sm font-semibold">{t("order.cancelReason")}</legend>
          <div className="space-y-1">
            {CANCEL_REASONS.filter((r) => r !== "payment_failed" && r !== "out_of_stock" && r !== "cannot_deliver").map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-field">
                <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="size-5 accent-[var(--color-brand)]" />
                {t(`reason.${r}` as DictKey)}
              </label>
            ))}
          </div>
        </fieldset>
        {err && <p className="mt-3 text-sm text-brand">{err}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="btn-soft h-12" onClick={() => setOpen(false)}>
            {t("common.back")}
          </button>
          <button type="button" className="btn-primary h-12" onClick={submit} disabled={busy}>
            {busy && <Spinner />} {t("order.cancel")}
          </button>
        </div>
      </Modal>
    </>
  );
}

interface ReorderData {
  brandId: string;
  brandSlug: string;
  brandName: string;
  branchId: string;
  branchName: I18n;
  fulfillment: "delivery" | "pickup";
  missing: number;
  lines: { productId: string; optionIds: string[]; quantity: number; name: I18n; imageUrl: string | null; unitPrice: number; kind: "dish" | "packaging" | "cutlery"; options: I18n[] }[];
  services: ServiceItem[];
}

export function ReorderButton({ orderId }: { orderId: string }) {
  const { t } = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    const r = await fetch(`/api/orders/${orderId}/reorder`, { method: "POST" });
    setBusy(false);
    if (!r.ok) return setNote(t("common.error"));
    const d = (await r.json()) as ReorderData;
    const ctx = { brandId: d.brandId, brandSlug: d.brandSlug, brandName: d.brandName, branchId: d.branchId, branchName: d.branchName };
    cart.replaceLines(
      ctx,
      d.lines.map((l) => ({ productId: l.productId, optionIds: l.optionIds, qty: l.quantity, name: l.name, imageUrl: l.imageUrl, unitPrice: l.unitPrice, kind: l.kind, optionNames: l.options })),
      d.lines.some((l) => l.kind !== "dish") ? [] : d.services,
      d.fulfillment,
    );
    if (d.missing > 0) setNote(t("order.reorderPartial"));
    if (d.lines.some((l) => l.kind === "dish")) router.push(d.missing > 0 ? menuHref({ branch: d.branchId }) : "/checkout");
  };
  return (
    <>
      <button type="button" className="btn-primary h-12" onClick={go} disabled={busy}>
        {busy && <Spinner />} {t("order.reorder")}
      </button>
      {note && <p className="text-sm text-warn">{note}</p>}
    </>
  );
}
