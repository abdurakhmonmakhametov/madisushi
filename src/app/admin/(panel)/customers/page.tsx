import Link from "next/link";
import { requireStaff } from "@/lib/admin/guard";
import { getL } from "@/lib/admin/l";
import { asActor } from "@/lib/db";
import { formatUZS } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { PageHeader, Panel, Pill, Table } from "@/components/admin/server-ui";
import { IconUsers } from "@/components/ui/icons";
import { FilterBar, FilterField, Pagination, SearchInput } from "@/components/admin/ui";

export default async function CustomersAdmin({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const staff = await requireStaff("customers");
  const { L, lang } = await getL();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = 25;
  const q = (sp.q ?? "").trim().slice(0, 40).replace(/[\\%_]/g, "");
  // RLS: branch managers only see customers who ordered or booked at their branches.
  const { rows, total } = await asActor({ kind: "staff", id: staff.id }, async (d) => {
    const where = "($1 = '' or c.phone like '%' || $1 || '%' or c.name ilike '%' || $1 || '%')";
    const total = await d.one<{ n: number }>(`select count(*)::int n from public.customers c where ${where}`, [q]);
    const rows = await d.query<{ id: string; phone: string; name: string | null; loyalty_balance: number; is_blocked: boolean; created_at: string; orders: number; spent: number }>(
      `select c.id, c.phone, c.name, c.loyalty_balance, c.is_blocked, c.created_at,
              (select count(*)::int from public.orders o where o.customer_id = c.id) as orders,
              (select coalesce(sum(o.total - o.refunded_amount), 0)::bigint from public.orders o where o.customer_id = c.id and o.payment_status in ('paid','partially_refunded')) as spent
         from public.customers c where ${where} order by c.created_at desc limit ${pageSize} offset ${(page - 1) * pageSize}`,
      [q],
    );
    return { rows, total: total?.n ?? 0 };
  });
  return (
    <>
      <PageHeader
        icon={<IconUsers size={24} />}
        title={L("Mijozlar", "Клиенты")}
        description={L("Saytda ro'yxatdan o'tgan mijozlar, ularning buyurtmalari va bonus balansi.", "Зарегистрированные гости, их заказы и бонусный баланс.")}
        guide={{
          steps: [
            L("Mijozni topish uchun telefon raqami yoki ismini yozing va «Ko'rsatish» ni bosing.", "Чтобы найти гостя, введите телефон или имя и нажмите «Показать»."),
            L("Ismni bosing — mijozning barcha buyurtmalari va bonuslari ochiladi.", "Нажмите на имя — откроются все заказы и бонусы гостя."),
          ],
        }}
      />
      <Panel>
        <FilterBar>
          <FilterField label={L("Qidiruv", "Поиск")}>
            <SearchInput defaultValue={sp.q} placeholder={L("Telefon yoki ism", "Телефон или имя")} />
          </FilterField>
        </FilterBar>
        <div className="mt-4">
          <Table head={[L("Mijoz", "Клиент"), L("Telefon", "Телефон"), L("Buyurtmalar", "Заказы"), L("To'lagan", "Оплачено"), L("Balans", "Баланс"), L("Ro'yxatdan o'tgan", "Регистрация")]} empty={rows.length === 0 && L("Mijozlar topilmadi", "Клиенты не найдены")}>
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2.5">
                  <Link href={`/admin/customers/${c.id}`} className="group inline-flex items-center gap-2.5 font-medium">
                    <span className="grid size-8 place-items-center rounded-full bg-field text-xs font-bold text-ink/70 transition-colors group-hover:bg-brand group-hover:text-white">{(c.name || c.phone).replace("+998", "").trim().slice(0, 1)}</span>
                    <span className="text-brand group-hover:underline">{c.name || L("Ismsiz", "Без имени")}</span>
                  </Link>
                  {c.is_blocked && (
                    <span className="ml-2">
                      <Pill tone="brand">{L("bloklangan", "заблокирован")}</Pill>
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5">{c.phone}</td>
                <td className="px-3 py-2.5">{c.orders}</td>
                <td className="px-3 py-2.5 tabular-nums">{formatUZS(c.spent)}</td>
                <td className="px-3 py-2.5 tabular-nums">{formatUZS(c.loyalty_balance)}</td>
                <td className="px-3 py-2.5">{formatDateTime(c.created_at, lang)}</td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} pageSize={pageSize} total={total} />
        </div>
      </Panel>
    </>
  );
}
