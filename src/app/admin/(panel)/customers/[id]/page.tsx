import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/admin/guard";
import { getL } from "@/lib/admin/l";
import { tr } from "@/lib/i18n/dict";
import { asActor } from "@/lib/db";
import { formatUZS } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { PageHeader, Panel, Pill, Table } from "@/components/admin/server-ui";
import { ActionForm, ConfirmAction, Input, SubmitButton } from "@/components/admin/ui";
import { paymentLabel, statusLabel, statusTone } from "@/components/admin/labels";
import { customerBlockAction, loyaltyAdjustAction } from "../../../actions/ops";
import { IconArrowLeft } from "@/components/ui/icons";

export default async function CustomerAdmin({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("customers");
  const { L, lang } = await getL();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await asActor({ kind: "staff", id: staff.id }, async (d) => {
    const c = await d.one<{ id: string; phone: string; name: string | null; email: string | null; loyalty_balance: number; is_blocked: boolean; created_at: string }>("select * from public.customers where id = $1", [id]);
    if (!c) return null;
    const orders = await d.query<{ id: string; number: number; status: string; payment_status: string; total: number; created_at: string; brand: string; branch: { uz: string; ru?: string } }>(
      `select o.id, o.number, o.status, o.payment_status, o.total, o.created_at, b.name as brand, br.name as branch
         from public.orders o join public.brands b on b.id = o.brand_id join public.branches br on br.id = o.branch_id
        where o.customer_id = $1 order by o.created_at desc limit 100`,
      [id],
    );
    const ledger = await d.query<{ id: number; kind: string; amount: number; balance_after: number; note: string | null; created_at: string; order_number: number | null; staff_name: string | null }>(
      `select l.id, l.kind, l.amount, l.balance_after, l.note, l.created_at, o.number as order_number, s.name as staff_name
         from public.loyalty_transactions l left join public.orders o on o.id = l.order_id left join public.staff s on s.id = l.staff_id
        where l.customer_id = $1 order by l.created_at desc, l.id desc limit 200`,
      [id],
    );
    return { c, orders, ledger };
  });
  if (!data) notFound();
  const { c, orders, ledger } = data;

  return (
    <>
      <PageHeader title={c.name || c.phone} description={c.phone}>
        {c.is_blocked && <Pill tone="brand">{L("Bloklangan", "Заблокирован")}</Pill>}
        <Link href="/admin/customers" className="btn-soft h-10 text-sm">
          <IconArrowLeft size={18} /> {L("Mijozlar", "Клиенты")}
        </Link>
      </PageHeader>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <Panel title={L("Profil", "Профиль")}>
            <dl className="space-y-1 text-sm">
              <div>
                <dt className="text-muted">{L("Telefon", "Телефон")}</dt>
                <dd>{c.phone}</dd>
              </div>
              <div>
                <dt className="text-muted">Email</dt>
                <dd>{c.email || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">{L("Ro'yxatdan o'tgan", "Регистрация")}</dt>
                <dd>{formatDateTime(c.created_at, lang)}</dd>
              </div>
            </dl>
            {staff.role === "super_admin" && (
              <div className="mt-4">
                <ConfirmAction
                  action={customerBlockAction}
                  label={c.is_blocked ? L("Blokdan chiqarish", "Разблокировать") : L("Bloklash", "Заблокировать")}
                  title={c.is_blocked ? L("Blokdan chiqarish", "Разблокировать") : L("Mijozni bloklash", "Заблокировать клиента")}
                  body={L("Bloklangan mijoz yangi buyurtma bera olmaydi.", "Заблокированный клиент не сможет оформлять заказы.")}
                  hidden={{ customerId: c.id, blocked: String(!c.is_blocked) }}
                  variant={c.is_blocked ? "soft" : "danger"}
                />
              </div>
            )}
          </Panel>
          <Panel title={L("Loyallik balansi", "Баланс лояльности")}>
            <p className="text-3xl font-bold text-ok tabular-nums">{formatUZS(c.loyalty_balance)}</p>
            <ActionForm action={loyaltyAdjustAction} className="mt-4 space-y-3" resetOnSuccess>
              <input type="hidden" name="customerId" value={c.id} />
              <Input label={L("Summa (+ qo'shish / − yechish)", "Сумма (+ начислить / − списать)")} name="amount" inputMode="numeric" pattern="-?[0-9 ]+" required />
              <Input label={L("Sabab (majburiy, auditga yoziladi)", "Причина (обязательно, пишется в аудит)")} name="note" minLength={3} maxLength={300} required />
              <SubmitButton>{L("Tuzatish kiritish", "Провести корректировку")}</SubmitButton>
            </ActionForm>
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title={`${L("Buyurtmalar", "Заказы")} (${orders.length})`}>
            <Table head={["№", L("Sana", "Дата"), L("Restoran", "Ресторан"), L("Holat", "Статус"), L("To'lov", "Оплата"), L("Summa", "Сумма")]} empty={orders.length === 0 && L("Buyurtmalar yo'q", "Заказов нет")}>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-3 py-2">
                    <Link className="text-brand hover:underline" href={`/admin/orders/${o.id}`}>
                      {o.number}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{formatDateTime(o.created_at, lang)}</td>
                  <td className="px-3 py-2">
                    {o.brand} · {tr(o.branch, lang)}
                  </td>
                  <td className="px-3 py-2">
                    <Pill tone={statusTone(o.status)}>{statusLabel(o.status, lang)}</Pill>
                  </td>
                  <td className="px-3 py-2 text-xs">{paymentLabel(o.payment_status, lang)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatUZS(o.total)}</td>
                </tr>
              ))}
            </Table>
          </Panel>
          <Panel title={L("Loyallik jurnali", "Журнал лояльности")}>
            <Table head={[L("Sana", "Дата"), L("Turi", "Тип"), L("Summa", "Сумма"), L("Qoldiq", "Остаток"), L("Izoh", "Комментарий")]} empty={ledger.length === 0 && L("Operatsiyalar yo'q", "Операций нет")}>
              {ledger.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2">{formatDateTime(l.created_at, lang)}</td>
                  <td className="px-3 py-2">
                    {l.kind}
                    {l.order_number && ` · №${l.order_number}`}
                  </td>
                  <td className={`px-3 py-2 tabular-nums ${l.amount > 0 ? "text-ok" : "text-brand"}`}>
                    {l.amount > 0 ? "+" : ""}
                    {formatUZS(l.amount)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{formatUZS(l.balance_after)}</td>
                  <td className="px-3 py-2 text-muted">
                    {l.note}
                    {l.staff_name && ` · ${l.staff_name}`}
                  </td>
                </tr>
              ))}
            </Table>
          </Panel>
        </div>
      </div>
    </>
  );
}
