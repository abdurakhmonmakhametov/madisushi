import Link from "next/link";
import { requireStaff } from "@/lib/admin/guard";
import { getL } from "@/lib/admin/l";
import { tr } from "@/lib/i18n/dict";
import { asActor } from "@/lib/db";
import { formatUZS } from "@/lib/money";
import { PageHeader, Panel, Pill, Table } from "@/components/admin/server-ui";
import { ActionForm, ConfirmAction, Dropdown, FilterBar, I18nInput, Input, Pagination, SearchInput, Select, SubmitButton, Switch } from "@/components/admin/ui";
import { deleteCategoryAction, saveCategoryAction } from "../../actions/menu";
import { CategoryIcon, categoryIconOptions } from "@/components/ui/CategoryIcon";
import { IconBook, IconPlus } from "@/components/ui/icons";

type SP = { brand?: string; q?: string; category?: string; page?: string };
type Cat = { id: string; parent_id: string | null; slug: string; name: { uz: string; ru?: string }; icon: string | null; sort: number; is_active: boolean; products: number };

export default async function MenuAdmin({ searchParams }: { searchParams: Promise<SP> }) {
  const staff = await requireStaff("menu");
  const { L, lang } = await getL();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = 20;
  const data = await asActor({ kind: "staff", id: staff.id }, async (d) => {
    const brands = await d.query<{ id: string; slug: string; name: string }>("select id, slug, name from public.brands order by sort, name");
    const brand = brands.find((b) => b.slug === sp.brand) ?? brands[0];
    if (!brand) return null;
    const cats = await d.query<Cat>(
      `select c.*, (select count(*)::int from public.products p where p.category_id = c.id) as products
         from public.categories c where c.brand_id = $1 order by c.parent_id nulls first, c.sort, c.slug`,
      [brand.id],
    );
    const params: unknown[] = [brand.id];
    const where = ["p.brand_id = $1"];
    if (sp.q) where.push(`(p.name->>'uz' ilike $${params.push(`%${sp.q.replace(/[\\%_]/g, "")}%`)} or p.name->>'ru' ilike $${params.length} or p.slug ilike $${params.length})`);
    if (sp.category && /^[0-9a-f-]{36}$/i.test(sp.category)) where.push(`p.category_id = $${params.push(sp.category)}`);
    const total = await d.one<{ n: number }>(`select count(*)::int n from public.products p where ${where.join(" and ")}`, params);
    const products = await d.query<{ id: string; slug: string; kind: string; name: { uz: string; ru?: string }; base_price: number; is_active: boolean; badges: string[]; image_url: string | null; category: { uz: string; ru?: string } | null; groups: number }>(
      `select p.id, p.slug, p.kind, p.name, p.base_price, p.is_active, p.badges, p.image_url, c.name as category,
              (select count(*)::int from public.product_option_groups g where g.product_id = p.id) as groups
         from public.products p left join public.categories c on c.id = p.category_id
        where ${where.join(" and ")} order by p.kind, c.sort nulls last, p.sort, p.slug limit ${pageSize} offset ${(page - 1) * pageSize}`,
      params,
    );
    return { brands, brand, cats, products, total: total?.n ?? 0 };
  });
  if (!data) return <p>{L("Avval restoran yarating", "Сначала создайте ресторан")}</p>;
  const { brands, brand, cats, products, total } = data;
  const roots = cats.filter((c) => !c.parent_id);
  const parentOptions = [{ value: "", label: L("— asosiy bo'lim —", "— корневой раздел —") }, ...roots.map((c) => ({ value: c.id, label: tr(c.name, lang) }))];

  return (
    <>
      <PageHeader
        icon={<IconBook size={24} />}
        title={L("Menyu", "Меню")}
        description={L("Bo'limlar va taomlar: nomi, narxi, rasmi. Taomni bosib tahrirlang.", "Разделы и блюда: название, цена, фото. Нажмите на блюдо, чтобы изменить.")}
        guide={{
          steps: [
            L("Chapda — bo'limlar (masalan «Rollar», «Ichimliklar»). Bo'limni bosib nomini o'zgartirasiz.", "Слева — разделы (например «Роллы», «Напитки»). Нажмите на раздел, чтобы изменить."),
            L("O'ngda — taomlar. Taom nomini bosing: narx, rasm va tavsifni o'zgartirish mumkin.", "Справа — блюда. Нажмите на название: можно изменить цену, фото и описание."),
            L("Yangi taom qo'shish uchun qizil «Yangi mahsulot» tugmasini bosing.", "Чтобы добавить блюдо, нажмите красную «Новый товар»."),
          ],
          tip: L("Taom vaqtincha tugagan bo'lsa, uni o'chirmang — «Tugagan taomlar» bo'limidan foydalaning.", "Если блюдо временно закончилось, не удаляйте его — используйте «Стоп-лист»."),
        }}
      >
        {brands.length > 1 && brands.map((b) => (
          <Link key={b.id} href={`/admin/menu?brand=${b.slug}`} className={b.id === brand.id ? "btn-primary h-10 text-sm" : "btn-soft h-10 text-sm"}>
            {b.name}
          </Link>
        ))}
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[420px_1fr]">
        <Panel title={L("Bo'limlar", "Разделы")}>
          <ul className="space-y-2">
            {roots.map((c) => (
              <li key={c.id}>
                <CategoryRow c={c} brandId={brand.id} parentOptions={parentOptions} L={L} lang={lang} />
                <ul className="ml-6 mt-2 space-y-2 border-l border-line pl-3">
                  {cats
                    .filter((x) => x.parent_id === c.id)
                    .map((ch) => (
                      <li key={ch.id}>
                        <CategoryRow c={ch} brandId={brand.id} parentOptions={parentOptions} L={L} lang={lang} />
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ul>
          <details className="mt-4 rounded-xl border-2 border-dashed border-line p-3 transition-colors open:border-solid open:bg-field/60 hover:border-brand/30">
            <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-brand"><IconPlus size={18} className="inline-block align-[-0.25em]" /> {L("Bo'lim qo'shish", "Добавить раздел")}</summary>
            <ActionForm action={saveCategoryAction} className="mt-3 space-y-3" resetOnSuccess>
              <input type="hidden" name="brandId" value={brand.id} />
              <I18nInput label={L("Nomi", "Название")} name="name" required />
              <div className="grid grid-cols-3 gap-2">
                <Input label={L("Havola nomi (slug)", "Имя ссылки (slug)")} help={L("Sahifa manzilida ishlatiladigan lotincha nom. Faqat kichik harf, raqam va chiziqcha (-). Masalan: filadelfiya-roll", "Латинское имя для адреса страницы. Только строчные буквы, цифры и дефис (-). Например: filadelfiya-roll")} placeholder="masalan-nom" name="slug" required pattern="[a-z0-9-]{2,80}" />
                <Select label={L("Belgi", "Иконка")} name="icon" options={categoryIconOptions(null, lang)} />
                <Input label={L("Tartib raqami", "Порядок")} help={L("Ro'yxatdagi o'rni. Kichik raqam yuqorida turadi: 1 — birinchi, 2 — ikkinchi.", "Место в списке. Меньшее число — выше: 1 — первый, 2 — второй.")} name="sort" type="number" defaultValue={0} />
              </div>
              <Select label={L("Ota bo'lim", "Родительский раздел")} name="parentId" options={parentOptions} />
              <Switch label={L("Saytda ko'rsatish", "Показывать на сайте")} hint={L("O'chirilsa, bo'lim mijozlarga ko'rinmaydi", "Если выключить, гости не увидят раздел")} name="isActive" defaultChecked />
              <SubmitButton>{L("Qo'shish", "Добавить")}</SubmitButton>
            </ActionForm>
          </details>
        </Panel>

        <Panel
          title={L("Mahsulotlar", "Товары")}
          actions={
            <Link href={`/admin/menu/products/new?brand=${brand.slug}`} className="btn-primary h-10 text-sm">
              <IconPlus size={18} className="inline-block align-[-0.25em]" /> {L("Yangi mahsulot", "Новый товар")}
            </Link>
          }
        >
          <FilterBar>
            <input type="hidden" name="brand" value={brand.slug} />
            <SearchInput defaultValue={sp.q} placeholder={L("Taom nomini yozing", "Название блюда")} />
            <div className="min-w-0 sm:w-52">
              <Dropdown name="category" defaultValue={sp.category ?? ""} aria-label={L("Bo'lim", "Раздел")} options={[{ value: "", label: L("Barcha bo'limlar", "Все разделы") }, ...cats.map((c) => ({ value: c.id, label: `${c.parent_id ? "— " : ""}${tr(c.name, lang)}` }))]} />
            </div>
          </FilterBar>
          <div className="mt-4">
            <Table head={["", L("Nomi", "Название"), L("Bo'lim", "Раздел"), L("Narx", "Цена"), L("Belgilar", "Бейджи"), L("Holat", "Статус")]} empty={products.length === 0 && L("Mahsulot yo'q", "Нет товаров")}>
              {products.map((p) => (
                <tr key={p.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <td className="px-3 py-2">{p.image_url ? <img src={p.image_url} alt="" className="size-11 rounded-xl object-cover shadow-sm transition-transform duration-300 hover:scale-150" /> : <span className="block size-11 rounded-xl bg-field" />}</td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/menu/products/${p.id}`} className="font-medium text-brand hover:underline">
                      {tr(p.name, lang)}
                    </Link>
                    <div className="text-xs text-muted">
                      {p.slug}
                      {p.kind !== "dish" && ` · ${p.kind}`}
                      {p.groups > 0 && ` · ${p.groups} ${L("guruh opsiya", "групп опций")}`}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted">{tr(p.category, lang)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatUZS(p.base_price)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {p.badges.map((b) => (
                        <Pill key={b} tone="warn">
                          {b}
                        </Pill>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">{p.is_active ? <Pill tone="ok">{L("Faol", "Активен")}</Pill> : <Pill>{L("Yashirin", "Скрыт")}</Pill>}</td>
                </tr>
              ))}
            </Table>
            <Pagination page={page} pageSize={pageSize} total={total} />
          </div>
        </Panel>
      </div>
    </>
  );
}

function CategoryRow({ c, brandId, parentOptions, L, lang }: { c: Cat; brandId: string; parentOptions: { value: string; label: string }[]; L: (a: string, b: string) => string; lang: "uz" | "ru" }) {
  return (
    <details className="rounded-xl border border-line bg-white transition-[border-color,box-shadow] open:border-brand/30 open:shadow-[var(--shadow-card)] hover:border-[#d6d6d4]">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5">
        <span>
          <CategoryIcon emoji={c.icon} size={18} className="inline-block align-[-0.2em] text-muted" /> {tr(c.name, lang)} <span className="text-xs text-muted">({c.products})</span>
        </span>
        {!c.is_active && <Pill>{L("Yashirin", "Скрыт")}</Pill>}
      </summary>
      <div className="border-t border-line p-3">
        <ActionForm action={saveCategoryAction} className="space-y-3">
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="brandId" value={brandId} />
          <I18nInput label={L("Nomi", "Название")} name="name" value={c.name} required />
          <div className="grid grid-cols-3 gap-2">
            <Input label={L("Havola nomi (slug)", "Имя ссылки (slug)")} help={L("Sahifa manzilida ishlatiladigan lotincha nom. Faqat kichik harf, raqam va chiziqcha (-). Masalan: filadelfiya-roll", "Латинское имя для адреса страницы. Только строчные буквы, цифры и дефис (-). Например: filadelfiya-roll")} placeholder="masalan-nom" name="slug" defaultValue={c.slug} required />
            <Select label={L("Belgi", "Иконка")} name="icon" defaultValue={c.icon ?? ""} options={categoryIconOptions(c.icon, lang)} />
            <Input label={L("Tartib raqami", "Порядок")} help={L("Ro'yxatdagi o'rni. Kichik raqam yuqorida turadi: 1 — birinchi, 2 — ikkinchi.", "Место в списке. Меньшее число — выше: 1 — первый, 2 — второй.")} name="sort" type="number" defaultValue={c.sort} />
          </div>
          <Select label={L("Ota bo'lim", "Родительский раздел")} name="parentId" defaultValue={c.parent_id ?? ""} options={parentOptions.filter((o) => o.value !== c.id)} />
          <Switch label={L("Saytda ko'rsatish", "Показывать на сайте")} name="isActive" defaultChecked={c.is_active} />
          <div className="flex gap-2">
            <SubmitButton>{L("Saqlash", "Сохранить")}</SubmitButton>
          </div>
        </ActionForm>
        <div className="mt-2">
          <ConfirmAction action={deleteCategoryAction} label={L("O'chirish", "Удалить")} title={L("Bo'limni o'chirish", "Удалить раздел")} body={L("Faqat mahsulotsiz bo'limni o'chirish mumkin. Ichki bo'limlar ham o'chadi.", "Можно удалить только раздел без товаров. Подразделы тоже удалятся.")} hidden={{ id: c.id }} />
        </div>
      </div>
    </details>
  );
}
