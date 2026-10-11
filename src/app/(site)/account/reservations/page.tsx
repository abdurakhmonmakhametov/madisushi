import Link from "next/link";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { tr, type DictKey } from "@/lib/i18n/dict";
import { getCustomer } from "@/lib/auth/session";
import { listCustomerReservations } from "@/lib/services/reservations";
import { formatDateTime } from "@/lib/time";
import { StatusBadge } from "@/components/orders/StatusBadge";
import { LiveRefresh } from "@/components/live/LiveRefresh";

export const metadata = { title: "Reservations" };

export default async function MyReservationsPage() {
  const customer = await getCustomer();
  if (!customer) redirect("/login?next=/account/reservations");
  const [{ t, lang }, rows] = await Promise.all([getT(), listCustomerReservations(customer.id)]);
  return (
    <section className="card p-6">
      <LiveRefresh scope="customer" kinds={["reservation"]} />
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t("account.reservations")}</h1>
        <Link href="/reserve" className="btn-primary h-11">
          {t("nav.reserve")}
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="mt-6 text-muted">—</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  №{r.number} · {r.brand_name} · {tr(r.branch_name, lang)}
                </p>
                <p className="text-sm text-muted">
                  {formatDateTime(r.starts_at, lang)} · {r.party_size} {t("reserve.party").toLowerCase()}
                </p>
                {r.status === "pending" && <p className="text-sm text-warn">{t("reserve.pending")}</p>}
                {r.staff_note && <p className="text-sm text-muted">{r.staff_note}</p>}
              </div>
              <StatusBadge status={r.status} label={t(`reserve.status.${r.status}` as DictKey)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
