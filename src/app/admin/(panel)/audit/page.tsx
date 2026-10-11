import { requireStaff } from "@/lib/admin/guard";
import { getL } from "@/lib/admin/l";
import { asActor } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { PageHeader, Panel, Table } from "@/components/admin/server-ui";
import { FilterBar, FilterField, Pagination, SearchInput } from "@/components/admin/ui";
import { actorLabel } from "@/components/admin/labels";
import { IconShield } from "@/components/ui/icons";

export default async function AuditAdmin({ searchParams }: { searchParams: Promise<{ action?: string; page?: string }> }) {
  const staff = await requireStaff("audit");
  const { L, lang } = await getL();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = 50;
  const action = (sp.action ?? "").trim().slice(0, 60).replace(/[\\%_]/g, "");
  // RLS: super admin sees all; branch managers see entries tied to their branches.
  const { rows, total } = await asActor({ kind: "staff", id: staff.id }, async (d) => {
    const total = await d.one<{ n: number }>("select count(*)::int n from public.audit_logs where ($1 = '' or action ilike $1 || '%')", [action]);
    const rows = await d.query<{ id: number; created_at: string; actor_kind: string; actor_name: string | null; action: string; entity: string; entity_id: string | null; data: unknown }>(
      `select a.id, a.created_at, a.actor_kind, s.name as actor_name, a.action, a.entity, a.entity_id, a.data
         from public.audit_logs a left join public.staff s on s.id = a.actor_id
        where ($1 = '' or a.action ilike $1 || '%') order by a.created_at desc, a.id desc limit ${pageSize} offset ${(page - 1) * pageSize}`,
      [action],
    );
    return { rows, total: total?.n ?? 0 };
  });
  return (
    <>
      <PageHeader icon={<IconShield size={24} />} title={L("O'zgarishlar tarixi", "История изменений")} description={L("Kim, qachon va nimani o'zgartirgani avtomatik yoziladi. Bu yerda hech narsani o'zgartirib bo'lmaydi — faqat ko'rish uchun.", "Кто, когда и что изменил — записывается автоматически. Здесь только просмотр.")} />
      <Panel>
        <FilterBar>
          <FilterField label={L("Amal turi", "Тип действия")}>
            <SearchInput name="action" defaultValue={sp.action} placeholder="order. / product. / loyalty." />
          </FilterField>
        </FilterBar>
        <div className="mt-4">
          <Table head={[L("Vaqt", "Время"), L("Kim", "Кто"), L("Amal", "Действие"), L("Obyekt", "Объект"), L("Ma'lumot", "Данные")]} empty={rows.length === 0 && L("Yozuvlar yo'q", "Записей нет")}>
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(r.created_at, lang)}</td>
                <td className="px-3 py-2">{r.actor_name ?? actorLabel(r.actor_kind, lang)}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
                <td className="px-3 py-2 text-xs">
                  {r.entity}
                  <div className="font-mono text-muted">{r.entity_id?.slice(0, 13)}</div>
                </td>
                <td className="max-w-md px-3 py-2">
                  <code className="block truncate text-xs text-muted" title={JSON.stringify(r.data)}>
                    {JSON.stringify(r.data)}
                  </code>
                </td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} pageSize={pageSize} total={total} />
        </div>
      </Panel>
    </>
  );
}
