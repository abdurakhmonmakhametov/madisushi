import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { getCustomer } from "@/lib/auth/session";
import { asActor } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatUZS } from "@/lib/money";
import { formatDateTime } from "@/lib/time";

export const metadata = { title: "Loyalty" };

const KIND: Record<string, { uz: string; ru: string }> = {
  earn: { uz: "Keshbek", ru: "Кешбэк" },
  spend: { uz: "To'lovga ishlatildi", ru: "Оплата баллами" },
  refund: { uz: "Qaytarildi (bekor qilingan buyurtma)", ru: "Возврат (отмена заказа)" },
  adjust: { uz: "Tuzatish", ru: "Корректировка" },
  reverse_earn: { uz: "Keshbek bekor qilindi", ru: "Отмена кешбэка" },
};

export default async function LoyaltyPage() {
  const customer = await getCustomer();
  if (!customer) redirect("/login?next=/account/loyalty");
  const [{ t, lang }, settings] = await Promise.all([getT(), getSettings()]);
  const rows = await asActor({ kind: "customer", id: customer.id }, (d) =>
    d.query<{ id: number; kind: string; amount: number; balance_after: number; note: string | null; created_at: string; order_number: number | null }>(
      `select l.id, l.kind, l.amount, l.balance_after, l.note, l.created_at, o.number as order_number
         from public.loyalty_transactions l left join public.orders o on o.id = l.order_id
        order by l.created_at desc, l.id desc limit 200`,
    ),
  );
  const L = settings.loyalty;
  return (
    <div className="space-y-5">
      <section className="card p-6">
        <h1 className="text-2xl font-bold">{t("account.loyalty")}</h1>
        <p className="mt-4 text-sm text-muted">{t("account.balance")}</p>
        <p className="text-4xl font-bold text-ok tabular-nums">{formatUZS(customer.loyalty_balance)}</p>
        {L.enabled && (
          <p className="mt-4 text-sm text-muted">
            {t("account.loyaltyRules", { percent: L.earn_bps / 100, max: formatUZS(L.max_spend_amount), share: L.max_spend_bps / 100 })}
          </p>
        )}
      </section>
      <section className="card p-6">
        {rows.length === 0 ? (
          <p className="text-muted">{t("account.noTransactions")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="font-medium">
                    {KIND[r.kind]?.[lang] ?? r.kind}
                    {r.order_number ? ` · №${r.order_number}` : ""}
                  </p>
                  <p className="text-sm text-muted">
                    {formatDateTime(r.created_at, lang)}
                    {r.kind === "adjust" && r.note ? ` · ${r.note}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className={r.amount > 0 ? "font-semibold text-ok" : "font-semibold text-brand"}>
                    {r.amount > 0 ? "+" : ""}
                    {formatUZS(r.amount)}
                  </p>
                  <p className="text-xs text-muted">{formatUZS(r.balance_after)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
