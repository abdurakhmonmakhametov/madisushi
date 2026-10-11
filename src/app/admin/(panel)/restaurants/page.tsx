import Link from "next/link";
import { requireStaff } from "@/lib/admin/guard";
import { getL } from "@/lib/admin/l";
import { tr } from "@/lib/i18n/dict";
import { asActor } from "@/lib/db";
import { PageHeader, Panel } from "@/components/admin/server-ui";
import { ActionForm, FileInput, I18nInput, Input, SubmitButton } from "@/components/admin/ui";
import { saveBrandAction } from "../../actions/restaurants";
import { IconArrowRight, IconStore } from "@/components/ui/icons";

type I = { uz: string; ru?: string };
type Brand = { id: string; slug: string; name: string; tagline: I; description: I; logo_url: string | null; accent_color: string; phone: string | null; is_active: boolean; sort: number; cuisines: string[]; branches: number };

export default async function RestaurantsAdmin() {
  const staff = await requireStaff("brands");
  const { L, lang } = await getL();
  const { brands, cuisines } = await asActor({ kind: "staff", id: staff.id }, async (d) => ({
    brands: await d.query<Brand>(
      `select b.*, coalesce((select array_agg(cuisine_id) from public.brand_cuisines where brand_id = b.id), '{}') as cuisines,
              (select count(*)::int from public.branches where brand_id = b.id) as branches
         from public.brands b order by b.sort, b.name`,
    ),
    cuisines: await d.query<{ id: string; name: I }>("select id, name from public.cuisines order by sort"),
  }));

  const form = (b?: Brand) => (
    <ActionForm action={saveBrandAction} className="space-y-3" resetOnSuccess={!b}>
      {b && <input type="hidden" name="id" value={b.id} />}
      <input type="hidden" name="slug" value={b?.slug ?? "restaurant"} />
      <input type="hidden" name="sort" value={b?.sort ?? 0} />
      <input type="hidden" name="isActive" value="on" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label={L("Nomi", "Название")} name="name" defaultValue={b?.name} required maxLength={60} />
        <Input label={L("Telefon", "Телефон")} name="phone" defaultValue={b?.phone ?? ""} />
        <Input label={L("Asosiy rang", "Основной цвет")} help={L("Saytdagi tugmalar va belgilar rangi. Rangli kvadratni bosib tanlang.", "Цвет кнопок и акцентов на сайте. Нажмите на квадрат, чтобы выбрать.")} name="accent" type="color" className="[&_input]:cursor-pointer [&_input]:p-1" defaultValue={b?.accent_color ?? "#D7282F"} />
        <div className="sm:col-span-2">
          <FileInput name="logo" label={L("Logotip", "Логотип")} current={b?.logo_url} />
        </div>
      </div>
      <I18nInput label={L("Shior (logotip ostidagi qisqa matn)", "Слоган (короткий текст под логотипом)")} name="tagline" value={b?.tagline} />
      <I18nInput label={L("Tavsif", "Описание")} name="description" value={b?.description} multiline />
      <SubmitButton>{b ? L("Saqlash", "Сохранить") : L("Restoran qo'shish", "Добавить ресторан")}</SubmitButton>
    </ActionForm>
  );

  const b = brands[0];
  return (
    <>
      <PageHeader icon={<IconStore size={24} />} title={L("Restoran ma'lumotlari", "Данные ресторана")} description={L("Saytda ko'rinadigan nom, logotip, shior va tavsif.", "Название, логотип, слоган и описание, которые видны на сайте.")} guide={{ steps: [L("Kerakli maydonni o'zgartiring (masalan telefon yoki shior).", "Измените нужное поле (например телефон или слоган)."), L("Logotipni almashtirish uchun rasmli maydonni bosing.", "Чтобы сменить логотип, нажмите на поле с картинкой."), L("Pastdagi «Saqlash» ni bosing — o'zgarish saytda darhol ko'rinadi.", "Нажмите «Сохранить» — изменения сразу появятся на сайте.")] }}>
        {b && (
          <Link href="/admin/branches" className="btn-soft h-10 text-sm">
            {L("Filiallar", "Филиалы")}: {b.branches} <IconArrowRight size={16} />
          </Link>
        )}
      </PageHeader>
      <Panel>
        {b && (
          <div className="mb-5 flex items-center gap-4 border-b border-line pb-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {b.logo_url && <img src={b.logo_url} alt="" className="size-16 rounded-full bg-night object-cover" />}
            <div>
              <p className="text-lg font-semibold">{b.name}</p>
              <p className="text-sm text-muted">{tr(b.tagline, lang)}</p>
            </div>
          </div>
        )}
        {form(b)}
      </Panel>
    </>
  );
}
