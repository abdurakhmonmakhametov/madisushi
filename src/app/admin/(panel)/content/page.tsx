import Link from "next/link";
import { requireStaff } from "@/lib/admin/guard";
import { getL } from "@/lib/admin/l";
import { tr } from "@/lib/i18n/dict";
import { asActor } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { PageHeader, Panel, Pill, Table } from "@/components/admin/server-ui";
import { Dropdown, FilterBar, FilterField } from "@/components/admin/ui";
import { KIND_LABELS } from "@/components/admin/labels";
import { IconFile, IconPlus } from "@/components/ui/icons";


export default async function ContentAdmin({ searchParams }: { searchParams: Promise<{ kind?: string; status?: string }> }) {
  const staff = await requireStaff("content");
  const { L, lang } = await getL();
  const sp = await searchParams;
  const kind = sp.kind && KIND_LABELS[sp.kind] ? sp.kind : null;
  const status = sp.status === "draft" || sp.status === "published" ? sp.status : null;
  const rows = await asActor({ kind: "staff", id: staff.id }, (d) =>
    d.query<{ id: string; kind: string; slug: string; title: { uz: string; ru?: string }; status: string; updated_at: string }>(
      "select id, kind, slug, title, status, updated_at from public.content_items where ($1::text is null or kind = $1) and ($2::text is null or status = $2) order by kind, sort, updated_at desc",
      [kind, status],
    ),
  );
  return (
    <>
      <PageHeader
        icon={<IconFile size={24} />}
        title={L("Sayt sahifalari", "Страницы сайта")}
        description={L("Yangiliklar, bannerlar, vakansiyalar, savol-javoblar va boshqa matnlar.", "Новости, баннеры, вакансии, FAQ и другие тексты.")}
        guide={{
          steps: [
            L("Yangi yozuv qo'shish uchun qizil «Yangi» tugmasini bosing va turini tanlang (yangilik, banner...).", "Чтобы добавить запись, нажмите красную «Создать» и выберите тип (новость, баннер...)."),
            L("«Qoralama» — faqat siz ko'rasiz. «E'lon qilingan» — hamma saytda ko'radi.", "«Черновик» — видите только вы. «Опубликовано» — видят все на сайте."),
            L("Mavjud yozuvni tahrirlash uchun sarlavhasini bosing.", "Чтобы изменить запись, нажмите на её заголовок."),
          ],
        }}
      >
        <Link href="/admin/content/new" className="btn-primary h-10 text-sm">
          <IconPlus size={18} className="inline-block align-[-0.25em]" /> {L("Yangi", "Создать")}
        </Link>
      </PageHeader>
      <Panel>
        <FilterBar>
          <FilterField label={L("Turi", "Тип")}>
            <Dropdown name="kind" defaultValue={kind ?? ""} options={[{ value: "", label: L("Barcha turlar", "Все типы") }, ...Object.entries(KIND_LABELS).map(([k, v]) => ({ value: k, label: L(...v) }))]} />
          </FilterField>
          <FilterField label={L("Holat", "Статус")}>
            <Dropdown
              name="status"
              defaultValue={status ?? ""}
              options={[
                { value: "", label: L("Hammasi", "Все") },
                { value: "draft", label: L("Qoralama", "Черновик"), hint: L("Saytda ko'rinmaydi", "Не видно на сайте") },
                { value: "published", label: L("E'lon qilingan", "Опубликовано"), hint: L("Hamma ko'radi", "Видят все") },
              ]}
            />
          </FilterField>
        </FilterBar>
        <div className="mt-4">
          <Table head={[L("Sarlavha", "Заголовок"), L("Turi", "Тип"), L("Havola", "Ссылка"), L("Holat", "Статус"), L("Yangilangan", "Обновлено")]} empty={rows.length === 0 && L("Kontent yo'q", "Нет контента")}>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2.5">
                  <Link href={r.kind === "banner" ? "/admin/banners" : `/admin/content/${r.id}`} className="font-medium text-brand hover:underline">
                    {tr(r.title, lang)}
                  </Link>
                </td>
                <td className="px-3 py-2.5">{L(...(KIND_LABELS[r.kind] ?? [r.kind, r.kind]))}</td>
                <td className="px-3 py-2.5 font-mono text-xs">{r.slug}</td>
                <td className="px-3 py-2.5">{r.status === "published" ? <Pill tone="ok">{L("E'lon qilingan", "Опубликовано")}</Pill> : <Pill>{L("Qoralama", "Черновик")}</Pill>}</td>
                <td className="px-3 py-2.5">{formatDateTime(r.updated_at, lang)}</td>
              </tr>
            ))}
          </Table>
        </div>
      </Panel>
    </>
  );
}
