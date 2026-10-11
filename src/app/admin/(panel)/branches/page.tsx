import Link from "next/link";
import { requireStaff } from "@/lib/admin/guard";
import { getL } from "@/lib/admin/l";
import { tr } from "@/lib/i18n/dict";
import { asActor } from "@/lib/db";
import { PageHeader, Panel, Pill, Table } from "@/components/admin/server-ui";
import { BranchForm } from "@/components/admin/BranchForm";
import { IconPin } from "@/components/ui/icons";

export default async function BranchesAdmin({ searchParams }: { searchParams: Promise<{ brand?: string }> }) {
  const staff = await requireStaff("branches");
  const { L, lang } = await getL();
  const sp = await searchParams;
  const { rows, brands } = await asActor({ kind: "staff", id: staff.id }, async (d) => ({
    rows: await d.query<{ id: string; brand_id: string; brand: string; name: { uz: string; ru?: string }; address: { uz: string; ru?: string }; is_active: boolean; accepts_delivery: boolean; accepts_pickup: boolean; zones: number; prep_minutes: number }>(
      `select br.*, b.name as brand, (select count(*)::int from public.delivery_zones z where z.branch_id = br.id) as zones
         from public.branches br join public.brands b on b.id = br.brand_id
        where app.can_access_branch(br.id) and ($1::uuid is null or br.brand_id = $1)
        order by b.sort, br.sort`,
      [sp.brand && /^[0-9a-f-]{36}$/i.test(sp.brand) ? sp.brand : null],
    ),
    brands: await d.query<{ id: string; name: string }>("select id, name from public.brands order by sort"),
  }));
  return (
    <>
      <PageHeader
        icon={<IconPin size={24} />}
        title={L("Filiallar", "Филиалы")}
        description={L("Restoranning har bir manzili: ish vaqti, yetkazish hududi va xizmatlari.", "Каждая точка ресторана: часы работы, зона доставки и услуги.")}
        guide={{
          steps: [
            L("Filial nomini bosing — ish vaqti, dam olish kunlari va yetkazish hududini o'zgartirasiz.", "Нажмите на филиал — можно изменить часы, выходные и зону доставки."),
            L("Bayram yoki ta'mir kuni filial yopiq bo'lsa, filial ichida «Yopiq kunlar» ga sanani qo'shing.", "Если филиал закрыт в праздник или на ремонт, добавьте дату в «Закрытые дни»."),
          ],
        }}
      />
      <Panel>
        <Table head={[L("Restoran", "Ресторан"), L("Filial", "Филиал"), L("Manzil", "Адрес"), L("Xizmatlar", "Услуги"), L("Hududlar", "Зоны"), L("Holat", "Статус")]} empty={rows.length === 0 && L("Filiallar yo'q", "Нет филиалов")}>
          {rows.map((b) => (
            <tr key={b.id}>
              <td className="px-3 py-2.5">{b.brand}</td>
              <td className="px-3 py-2.5">
                <Link href={`/admin/branches/${b.id}`} className="font-medium text-brand hover:underline">
                  {tr(b.name, lang)}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-muted">{tr(b.address, lang)}</td>
              <td className="px-3 py-2.5 text-xs">
                {b.accepts_delivery && L("yetkazish", "доставка")} {b.accepts_pickup && `· ${L("olib ketish", "самовывоз")}`} · {b.prep_minutes} {L("daq", "мин")}
              </td>
              <td className="px-3 py-2.5">{b.zones}</td>
              <td className="px-3 py-2.5">{b.is_active ? <Pill tone="ok">{L("Faol", "Активен")}</Pill> : <Pill>{L("O'chirilgan", "Выключен")}</Pill>}</td>
            </tr>
          ))}
        </Table>
      </Panel>
      {staff.role === "super_admin" && (
        <Panel title={L("Yangi filial", "Новый филиал")} className="mt-6">
          <BranchForm brands={brands} />
        </Panel>
      )}
    </>
  );
}
