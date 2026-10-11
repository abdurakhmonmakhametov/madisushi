import Link from "next/link";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { tr, type DictKey } from "@/lib/i18n/dict";
import { getCustomer } from "@/lib/auth/session";
import { listCustomerOrders } from "@/lib/services/orders";
import { formatUZS } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { StatusBadge } from "@/components/orders/StatusBadge";
import { ReorderButton } from "@/components/orders/OrderActions";
import { TERMINAL } from "@/lib/order-status";
import { IconArrowRight } from "@/components/ui/icons";
import { LiveRefresh } from "@/components/live/LiveRefresh";

export const metadata = { title: "Orders" };

export default async function OrdersPage() {
  const customer = await getCustomer();
  if (!customer) redirect("/login?next=/orders");
  const [{ t, lang }, orders] = await Promise.all([getT(), listCustomerOrders(customer.id)]);
  const active = orders.filter((o) => !TERMINAL.includes(o.status));
  const past = orders.filter((o) => TERMINAL.includes(o.status));
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <LiveRefresh scope="customer" kinds={["order"]} />
      <h1 className="text-[28px] font-bold">{t("account.orders")}</h1>
      {orders.length === 0 ? (
        <div className="card mt-6 p-10 text-center text-muted">
          {t("account.noOrders")}
          <div>
            <Link href="/" className="btn-primary mt-5 h-12">
              {t("checkout.backToMenu")}
            </Link>
          </div>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-brand" />
                </span>
                {t("order.activeSection")}
              </h2>
              <ul className="space-y-3">
                {active.map((o) => (
                  <li key={o.id}>
                    <Link href={`/orders/${o.id}`} className="card flex items-center gap-4 bg-night p-5 text-white transition-transform active:scale-[0.99]">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{t("order.title", { number: o.number })}</p>
                        <p className="text-sm text-white/60">
                          {tr(o.branch_name, lang)} · {formatDateTime(o.created_at, lang)}
                        </p>
                        <p className="mt-2 text-[15px] font-medium">{t(`status.${o.status}` as DictKey)}</p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-3 py-2 text-sm font-semibold">
                        {t("track.open")} <IconArrowRight size={16} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {past.length > 0 && (
            <section className="mt-8">
              {active.length > 0 && <h2 className="mb-3 text-lg font-semibold">{t("order.historySection")}</h2>}
              <ul className="space-y-3">
                {past.map((o) => (
                  <li key={o.id} className="card flex flex-wrap items-center gap-x-4 gap-y-3 p-4 sm:p-5">
                    <Link href={`/orders/${o.id}`} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="font-semibold hover:underline">{t("order.title", { number: o.number })}</p>
                        <p className="text-sm text-muted">
                          {tr(o.branch_name, lang)} · {formatDateTime(o.created_at, lang)}
                        </p>
                      </div>
                      <StatusBadge status={o.status} label={t(`status.${o.status}` as DictKey)} />
                      <span className="font-semibold tabular-nums">{formatUZS(o.total)}</span>
                    </Link>
                    <div className="flex w-full flex-col gap-1 sm:w-auto [&_.btn-primary]:h-11 [&_.btn-primary]:w-full [&_.btn-primary]:text-sm">
                      <ReorderButton orderId={o.id} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
