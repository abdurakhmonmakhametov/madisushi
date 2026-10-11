import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/admin/guard";
import { getL } from "@/lib/admin/l";
import { tr } from "@/lib/i18n/dict";
import { asActor } from "@/lib/db";
import { formatUZS } from "@/lib/money";
import { PageHeader, Panel, Pill, Table } from "@/components/admin/server-ui";
import { ActionForm, Check, ConfirmAction, FileInput, I18nInput, Input, Select, SubmitButton, Switch } from "@/components/admin/ui";
import { HelpTip } from "@/components/admin/guide";
import { deleteGroupAction, deleteOptionAction, deleteProductAction, saveGroupAction, saveOptionAction, saveProductAction, setAvailabilityAction } from "../../../../actions/menu";
import { IconArrowLeft, IconPlus } from "@/components/ui/icons";

type I = { uz: string; ru?: string };
const ALLERGENS = ["gluten", "fish", "shellfish", "soy", "sesame", "egg", "milk", "nuts", "peanuts", "mustard"];
const BADGES = ["bestseller", "spicy", "new", "vegetarian"];

export default async function ProductEdit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ brand?: string }> }) {
  const staff = await requireStaff("menu");
  const { L, lang } = await getL();
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === "new";
  if (!isNew && !/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const data = await asActor({ kind: "staff", id: staff.id }, async (d) => {
    const p = isNew
      ? null
      : await d.one<{ id: string; brand_id: string; category_id: string | null; kind: string; slug: string; name: I; description: I; ingredients: I; allergens: string[]; badges: string[]; weight_grams: number | null; base_price: number; packaging_fee: number; image_url: string | null; is_active: boolean; default_in_cart: boolean; sort: number }>(
          "select * from public.products where id = $1",
          [id],
        );
    if (!isNew && !p) return null;
    const brand = p
      ? await d.one<{ id: string; slug: string; name: string }>("select id, slug, name from public.brands where id = $1", [p.brand_id])
      : await d.one<{ id: string; slug: string; name: string }>("select id, slug, name from public.brands where slug = $1 or $1 is null order by sort limit 1", [sp.brand ?? null]);
    if (!brand) return null;
    const cats = await d.query<{ id: string; name: I; parent_id: string | null }>("select id, name, parent_id from public.categories where brand_id = $1 order by parent_id nulls first, sort", [brand.id]);
    const groups = p
      ? await d.query<{ id: string; kind: "variant" | "extra"; name: I; max_select: number; sort: number; options: { id: string; name: I; price_delta: number; is_default: boolean; is_active: boolean; sort: number }[] }>(
          `select g.*, coalesce((select json_agg(o order by o.sort, o.price_delta) from public.product_options o where o.group_id = g.id), '[]') as options
             from public.product_option_groups g where g.product_id = $1 order by g.sort`,
          [p.id],
        )
      : [];
    const branches = p
      ? await d.query<{ id: string; label: string; price_override: number | null; is_available: boolean | null }>(
          `select br.id, br.name->>'uz' as label, bp.price_override, bp.is_available
             from public.branches br left join public.branch_products bp on bp.branch_id = br.id and bp.product_id = $1
            where br.brand_id = $2 order by br.sort`,
          [p.id, brand.id],
        )
      : [];
    return { p, brand, cats, groups, branches };
  });
  if (!data) notFound();
  const { p, brand, cats, groups, branches } = data;

  return (
    <>
      <PageHeader
        title={p ? tr(p.name, lang) : L("Yangi mahsulot", "Новый товар")}
        guide={{
          steps: [
            L("Rasm tanlang, so'ng taom nomini o'zbek va rus tillarida yozing.", "Выберите фото и напишите название на узбекском и русском."),
            L("Narxni faqat raqam bilan yozing, bo'sh joy va «so'm»siz. Masalan: 45000", "Цену пишите только цифрами, без пробелов и «сум». Например: 45000"),
            L("Oxirida pastdagi qizil «Saqlash» tugmasini bosing. Saqlanganda pastda yashil xabar chiqadi.", "В конце нажмите красную «Сохранить». После сохранения появится зелёное сообщение."),
          ],
          tip: p ? L("Variantlar — masalan «8 dona / 16 dona». Qo'shimchalar — masalan «qo'shimcha sous».", "Варианты — например «8 шт / 16 шт». Добавки — например «доп. соус».") : undefined,
        }}
      >
        <Link href={`/admin/menu?brand=${brand.slug}`} className="btn-soft h-10 text-sm">
          <IconArrowLeft size={18} /> {brand.name}
        </Link>
        {p && (
          <ConfirmAction
            action={deleteProductAction}
            label={L("O'chirish", "Удалить")}
            title={L("Mahsulotni o'chirish", "Удалить товар")}
            body={L("Eski buyurtmalar o'z nusxalarini saqlab qoladi. Vaqtincha yashirish uchun 'Faol'ni o'chiring.", "Старые заказы сохранят свои снимки. Чтобы временно скрыть, снимите «Активен».")}
            hidden={{ id: p.id, brandSlug: brand.slug }}
          />
        )}
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[1fr_460px]">
        <Panel title={L("Asosiy ma'lumotlar", "Основное")}>
          <ActionForm action={saveProductAction} className="space-y-4">
            {p && <input type="hidden" name="id" value={p.id} />}
            <input type="hidden" name="brandId" value={brand.id} />
            <FileInput name="image" label={L("Taom rasmi", "Фото блюда")} current={p?.image_url} />
            <I18nInput label={L("Nomi", "Название")} name="name" value={p?.name} required />
            <I18nInput label={L("Tavsif", "Описание")} name="description" value={p?.description} multiline />
            <I18nInput label={L("Tarkibi", "Состав")} name="ingredients" value={p?.ingredients} multiline />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input label={L("Havola nomi (slug)", "Имя ссылки (slug)")} help={L("Sahifa manzilida ishlatiladigan lotincha nom. Faqat kichik harf, raqam va chiziqcha (-). Masalan: filadelfiya-roll", "Латинское имя для адреса страницы. Только строчные буквы, цифры и дефис (-). Например: filadelfiya-roll")} placeholder="masalan-nom" name="slug" defaultValue={p?.slug} required pattern="[a-z0-9-]{2,80}" />
              <Select
                label={L("Bo'lim", "Раздел")}
                name="categoryId"
                defaultValue={p?.category_id ?? ""}
                options={[{ value: "", label: "—" }, ...cats.map((c) => ({ value: c.id, label: `${c.parent_id ? "— " : ""}${tr(c.name, lang)}` }))]}
              />
              <Select
                label={L("Turi", "Тип")}
                name="kind"
                defaultValue={p?.kind ?? "dish"}
                options={[
                  { value: "dish", label: L("Taom", "Блюдо") },
                  { value: "packaging", label: L("Qadoq (paket)", "Упаковка (пакет)") },
                  { value: "cutlery", label: L("Anjomlar", "Приборы") },
                ]}
              />
              <Input label={L("Narxi (so'm)", "Цена (сум)")} help={L("Faqat raqam, masalan 45000. Filialda boshqa narx kerak bo'lsa, uni o'ngdagi «Filiallar» qismida qo'ying.", "Только цифры, например 45000. Другую цену для филиала задайте справа в «Филиалах».")} placeholder="45000" name="basePrice" type="number" min={0} step={1} defaultValue={p?.base_price ?? ""} required />
              <Input label={L("Qadoq to'lovi (dona uchun)", "Упаковка (за шт.)")} help={L("Har bir dona uchun qo'shiladigan qadoq puli. Kerak bo'lmasa 0 qoldiring.", "Доплата за упаковку за штуку. Если не нужно — оставьте 0.")} name="packagingFee" type="number" min={0} step={1} defaultValue={p?.packaging_fee ?? 0} />
              <Input label={L("Og'irligi, g", "Вес, г")} name="weight" type="number" min={1} defaultValue={p?.weight_grams ?? ""} />
              <Input label={L("Tartib raqami", "Порядок")} help={L("Ro'yxatdagi o'rni. Kichik raqam yuqorida turadi: 1 — birinchi, 2 — ikkinchi.", "Место в списке. Меньшее число — выше: 1 — первый, 2 — второй.")} name="sort" type="number" defaultValue={p?.sort ?? 0} />
            </div>
            <fieldset>
              <legend className="mb-2 flex items-center gap-1.5 text-sm font-medium">{L("Allergenlar", "Аллергены")} <HelpTip text={L("Taom tarkibida bo'lgan allergenlarni belgilang. Mijozlar saytda ko'radi.", "Отметьте аллергены в составе. Гости увидят их на сайте.")} /></legend>
              <div className="flex flex-wrap gap-2">
                {ALLERGENS.map((a) => (
                  <Check key={a} label={a} name="allergens" value={a} defaultChecked={p?.allergens.includes(a)} />
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 flex items-center gap-1.5 text-sm font-medium">{L("Belgilar", "Бейджи")} <HelpTip text={L("Taom rasmida chiqadigan kichik yorliqlar: «Xit», «Achchiq», «Yangi».", "Небольшие ярлыки на фото блюда: «Хит», «Острое», «Новинка».")} /></legend>
              <div className="flex flex-wrap gap-2">
                {BADGES.map((b) => (
                  <Check key={b} label={b} name="badges" value={b} defaultChecked={p?.badges.includes(b)} />
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <Switch label={L("Saytda ko'rsatish", "Показывать на сайте")} hint={L("O'chirilsa, taom menyudan yashiriladi", "Если выключить, блюдо скроется из меню")} name="isActive" defaultChecked={p?.is_active ?? true} />
              <Switch label={L("Savatga avtomatik qo'shish", "Автоматически в корзину")} hint={L("Faqat paket va anjomlar uchun", "Только для пакетов и приборов")} name="defaultInCart" defaultChecked={p?.default_in_cart} />
            </div>
            <div className="sticky bottom-20 z-10 -mx-4 border-t border-line bg-white/90 px-4 py-3 backdrop-blur lg:bottom-0 lg:-mx-5 lg:px-5">
              <SubmitButton className="w-full sm:w-auto sm:!px-10">{L("Saqlash", "Сохранить")}</SubmitButton>
            </div>
          </ActionForm>
        </Panel>

        {p && (
          <div className="space-y-6">
            <Panel title={L("Filiallar: narx va mavjudlik", "Филиалы: цена и наличие")} description={L("Har bir filial uchun: taom bormi va narxi boshqachami. Narx bo'sh = asosiy narx.", "Для каждого филиала: есть ли блюдо и другая ли цена. Пусто = базовая.")}>
              <ul className="space-y-3">
                {branches.map((b) => (
                  <li key={b.id}>
                    <ActionForm action={setAvailabilityAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="branchId" value={b.id} />
                      <input type="hidden" name="productId" value={p.id} />
                      <span className="w-28 text-sm font-medium">{b.label}</span>
                      <select name="available" defaultValue={String(b.is_available ?? true)} className="admin-field !h-9 !w-auto text-sm" aria-label={L("Mavjudlik", "Наличие")}>
                        <option value="true">✓ {L("Bor", "Есть")}</option>
                        <option value="false">✕ {L("Tugadi", "Нет")}</option>
                      </select>
                      <input name="price" inputMode="numeric" defaultValue={b.price_override ?? ""} placeholder={String(p.base_price)} className="admin-field !h-9 !w-28 text-sm" aria-label={L("Filial narxi", "Цена филиала")} />
                      <SubmitButton variant="soft" className="!h-9 text-sm">
                        OK
                      </SubmitButton>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title={L("Variantlar va qo'shimchalar", "Варианты и добавки")} description={L("Masalan: «8 dona / 16 dona» yoki «qo'shimcha sous». Δ — asosiy narxga qo'shiladigan summa.", "Например: «8 шт / 16 шт» или «доп. соус». Δ — доплата к базовой цене.")}>
              <div className="space-y-4">
                {groups.map((g) => (
                  <div key={g.id} className="rounded-xl border border-line p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="font-semibold">
                        {tr(g.name, lang)} <Pill tone={g.kind === "variant" ? "info" : "neutral"}>{g.kind === "variant" ? L("variant (1 ta majburiy)", "вариант (1 обязательно)") : `${L("qo'shimcha, maks.", "добавка, макс.")} ${g.max_select}`}</Pill>
                      </p>
                      <ConfirmAction action={deleteGroupAction} label="×" title={L("Guruhni o'chirish", "Удалить группу")} hidden={{ id: g.id, productId: p.id }} className="!h-8 !px-3" />
                    </div>
                    <Table head={[L("Nomi", "Название"), "Δ", ""]}>
                      {g.options.map((o) => (
                        <tr key={o.id}>
                          <td colSpan={3} className="py-2">
                            <ActionForm action={saveOptionAction} className="flex flex-wrap items-end gap-2">
                              <input type="hidden" name="id" value={o.id} />
                              <input type="hidden" name="groupId" value={g.id} />
                              <input type="hidden" name="productId" value={p.id} />
                              <input name="name_uz" defaultValue={o.name.uz} required className="admin-field !h-9 !w-32 text-sm" aria-label="uz" />
                              <input name="name_ru" defaultValue={o.name.ru ?? ""} className="admin-field !h-9 !w-32 text-sm" aria-label="ru" />
                              <input name="priceDelta" type="number" defaultValue={o.price_delta} className="admin-field !h-9 !w-24 text-sm" aria-label="Δ" />
                              <input type="hidden" name="sort" value={o.sort} />
                              <Check label={L("asosiy", "по умолч.")} name="isDefault" defaultChecked={o.is_default} />
                              <Check label={L("faol", "активна")} name="isActive" defaultChecked={o.is_active} />
                              <SubmitButton variant="soft" className="!h-9 text-sm">
                                OK
                              </SubmitButton>
                            </ActionForm>
                            <p className="text-xs text-muted">{formatUZS(p.base_price + o.price_delta)}</p>
                          </td>
                        </tr>
                      ))}
                    </Table>
                    <ActionForm action={saveOptionAction} className="mt-2 flex flex-wrap items-end gap-2" resetOnSuccess>
                      <input type="hidden" name="groupId" value={g.id} />
                      <input type="hidden" name="productId" value={p.id} />
                      <input name="name_uz" placeholder={L("Yangi opsiya (uz)", "Новая опция (uz)")} required className="admin-field !h-9 !w-32 text-sm" aria-label="uz" />
                      <input name="name_ru" placeholder="ru" className="admin-field !h-9 !w-32 text-sm" aria-label="ru" />
                      <input name="priceDelta" type="number" defaultValue={0} className="admin-field !h-9 !w-24 text-sm" aria-label="Δ" />
                      <input type="hidden" name="isActive" value="on" />
                      <SubmitButton variant="soft" className="!h-9 text-sm">
                        <IconPlus size={18} className="inline-block align-[-0.25em]" /> {L("Qo'shish", "Добавить")}
                      </SubmitButton>
                    </ActionForm>
                  </div>
                ))}
              </div>
              <details className="mt-4 rounded-xl border-2 border-dashed border-line p-3 transition-colors open:border-solid open:bg-field/60 hover:border-brand/30">
                <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-brand"><IconPlus size={18} className="inline-block align-[-0.25em]" /> {L("Guruh qo'shish", "Добавить группу")}</summary>
                <ActionForm action={saveGroupAction} className="mt-3 space-y-3" resetOnSuccess>
                  <input type="hidden" name="productId" value={p.id} />
                  <I18nInput label={L("Nomi", "Название")} name="name" required />
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      label={L("Turi", "Тип")}
                      name="kind"
                      options={[
                        { value: "variant", label: L("Variant (bitta tanlanadi)", "Вариант (выбор одного)") },
                        { value: "extra", label: L("Qo'shimcha (bir nechta)", "Добавка (несколько)") },
                      ]}
                    />
                    <Input label={L("Maks. tanlov", "Макс. выбор")} name="maxSelect" type="number" min={1} max={20} defaultValue={3} />
                  </div>
                  <SubmitButton>{L("Qo'shish", "Добавить")}</SubmitButton>
                </ActionForm>
              </details>
            </Panel>
          </div>
        )}
      </div>
    </>
  );
}
