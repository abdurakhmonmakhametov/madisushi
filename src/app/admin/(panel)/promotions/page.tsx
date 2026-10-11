import { requireStaff } from "@/lib/admin/guard";
import { getL } from "@/lib/admin/l";
import { tr } from "@/lib/i18n/dict";
import { asActor } from "@/lib/db";
import { formatUZS } from "@/lib/money";
import { TIMEZONE } from "@/lib/time";
import { PageHeader, Panel, Pill, Table } from "@/components/admin/server-ui";
import { ActionForm, Check, ConfirmAction, FileInput, I18nInput, Input, Select, SubmitButton, Switch } from "@/components/admin/ui";
import { deletePromotionAction, savePromoCodeAction, savePromotionAction } from "../../actions/marketing";
import { IconPlus, IconTag } from "@/components/ui/icons";

type I = { uz: string; ru?: string };
type Promo = { id: string; code: string; description: I; kind: "percent" | "fixed"; value: number; max_discount: number | null; min_subtotal: number; starts_at: string | null; ends_at: string | null; usage_limit_total: number | null; usage_limit_per_customer: number | null; used_count: number; is_active: boolean; brand_ids: string[] };
type Promotion = { id: string; title: I; body: I; image_url: string | null; brand_id: string | null; promo_code_id: string | null; starts_at: string | null; ends_at: string | null; status: string; sort: number };

/** Date -> value for <input type="datetime-local"> in Tashkent time. */
function dtLocal(v: string | null): string {
  if (!v) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(v)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export default async function PromotionsAdmin() {
  const staff = await requireStaff("promotions");
  const { L, lang } = await getL();
  const { codes, promos, brands } = await asActor({ kind: "staff", id: staff.id }, async (d) => ({
    codes: await d.query<Promo>("select p.*, coalesce((select array_agg(brand_id) from public.promo_code_brands where promo_code_id = p.id), '{}') as brand_ids from public.promo_codes p order by p.created_at desc"),
    promos: await d.query<Promotion>("select * from public.promotions order by sort, created_at desc"),
    brands: await d.query<{ id: string; name: string }>("select id, name from public.brands order by sort"),
  }));
  const now = Date.now();

  const codeForm = (p?: Promo) => (
    <ActionForm action={savePromoCodeAction} className="space-y-3" resetOnSuccess={!p}>
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Input label={L("Kod", "Код")} help={L("Mijoz yozadigan so'z, masalan SUSHI10. Faqat lotin harflari va raqamlar.", "Слово, которое вводит гость, например SUSHI10. Только латиница и цифры.")} placeholder="SUSHI10" name="code" defaultValue={p?.code} required pattern="[A-Za-z0-9_-]{3,32}" />
        <Select label={L("Turi", "Тип")} name="kind" defaultValue={p?.kind ?? "percent"} options={[{ value: "percent", label: L("Foiz (%)", "Процент (%)"), hint: L("Masalan 10% chegirma", "Например скидка 10%") }, { value: "fixed", label: L("Summa (so'm)", "Сумма (сум)"), hint: L("Masalan 20 000 so'm chegirma", "Например скидка 20 000 сум") }]} />
        <Input label={L("Chegirma miqdori", "Размер скидки")} help={L("Foiz bo'lsa — masalan 10. Summa bo'lsa — masalan 20000.", "Если процент — например 10. Если сумма — например 20000.")} name="value" type="number" min={1} defaultValue={p?.value} required />
        <Input label={L("Maks. chegirma", "Макс. скидка")} help={L("Foizli chegirma bu summadan oshmaydi. Bo'sh = cheklovsiz.", "Процентная скидка не превысит эту сумму. Пусто = без ограничений.")} name="maxDiscount" type="number" min={1} defaultValue={p?.max_discount ?? ""} />
        <Input label={L("Min. buyurtma summasi", "Мин. сумма заказа")} help={L("Buyurtma shu summadan kam bo'lsa, promokod ishlamaydi.", "Если заказ меньше этой суммы, промокод не сработает.")} name="minSubtotal" type="number" min={0} defaultValue={p?.min_subtotal ?? 0} />
        <Input label={L("Boshlanish", "Начало")} name="startsAt" type="datetime-local" defaultValue={dtLocal(p?.starts_at ?? null)} />
        <Input label={L("Tugash", "Окончание")} name="endsAt" type="datetime-local" defaultValue={dtLocal(p?.ends_at ?? null)} />
        <Input label={L("Umumiy limit", "Общий лимит")} help={L("Promokod jami necha marta ishlatilishi mumkin. Bo'sh = cheksiz.", "Сколько раз всего можно использовать. Пусто = без ограничений.")} name="limitTotal" type="number" min={1} defaultValue={p?.usage_limit_total ?? ""} />
        <Input label={L("Har mijozga limit", "Лимит на клиента")} help={L("Bitta mijoz necha marta ishlata oladi.", "Сколько раз может использовать один гость.")} name="limitCustomer" type="number" min={1} defaultValue={p?.usage_limit_per_customer ?? ""} />
      </div>
      <I18nInput label={L("Tavsif", "Описание")} name="description" value={p?.description} />
      <fieldset>
        <legend className="mb-1 text-sm font-medium">{L("Faqat restoranlar uchun (bo'sh = hammasi)", "Только для ресторанов (пусто = все)")}</legend>
        <div className="flex flex-wrap gap-4">
          {brands.map((b) => (
            <Check key={b.id} name="brands" value={b.id} label={b.name} defaultChecked={p?.brand_ids.includes(b.id)} />
          ))}
        </div>
      </fieldset>
      <Switch label={L("Promokod yoqilgan", "Промокод включён")} hint={L("O'chirilsa, mijozlar uni ishlata olmaydi", "Если выключить, гости не смогут его использовать")} name="isActive" defaultChecked={p?.is_active ?? true} />
      <SubmitButton variant={p ? "soft" : "primary"}>{p ? L("Saqlash", "Сохранить") : L("Promokod yaratish", "Создать промокод")}</SubmitButton>
    </ActionForm>
  );

  const promoForm = (p?: Promotion) => (
    <ActionForm action={savePromotionAction} className="space-y-3" resetOnSuccess={!p}>
      {p && <input type="hidden" name="id" value={p.id} />}
      <I18nInput label={L("Sarlavha", "Заголовок")} name="title" value={p?.title} required />
      <I18nInput label={L("Matn", "Текст")} name="body" value={p?.body} multiline />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Select label={L("Restoran", "Ресторан")} name="brandId" defaultValue={p?.brand_id ?? ""} options={[{ value: "", label: "—" }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} />
        <Select label={L("Promokod", "Промокод")} name="promoCodeId" defaultValue={p?.promo_code_id ?? ""} options={[{ value: "", label: "—" }, ...codes.map((c) => ({ value: c.id, label: c.code }))]} />
        <Select
          label={L("Holat", "Статус")}
          name="status"
          defaultValue={p?.status ?? "draft"}
          options={[
            { value: "draft", label: L("Qoralama", "Черновик") },
            { value: "published", label: L("E'lon qilingan", "Опубликовано") },
          ]}
        />
        <Input label={L("Boshlanish", "Начало")} name="startsAt" type="datetime-local" defaultValue={dtLocal(p?.starts_at ?? null)} />
        <Input label={L("Tugash", "Окончание")} name="endsAt" type="datetime-local" defaultValue={dtLocal(p?.ends_at ?? null)} />
        <Input label={L("Tartib raqami", "Порядок")} help={L("Ro'yxatdagi o'rni. Kichik raqam yuqorida turadi: 1 — birinchi, 2 — ikkinchi.", "Место в списке. Меньшее число — выше: 1 — первый, 2 — второй.")} name="sort" type="number" defaultValue={p?.sort ?? 0} />
      </div>
      <FileInput name="image" label={L("Aksiya rasmi", "Изображение акции")} current={p?.image_url} />
      <SubmitButton variant={p ? "soft" : "primary"}>{p ? L("Saqlash", "Сохранить") : L("Aksiya qo'shish", "Добавить акцию")}</SubmitButton>
    </ActionForm>
  );

  return (
    <>
      <PageHeader
        icon={<IconTag size={24} />}
        title={L("Aksiyalar va promokodlar", "Акции и промокоды")}
        description={L("Chegirmalar yarating va bosh sahifadagi reklama kartalarini boshqaring.", "Создавайте скидки и управляйте рекламными карточками на главной.")}
        guide={{
          steps: [
            L("Promokod — mijoz buyurtmada yozadigan so'z. «Yangi promokod» ni bosing, kod va chegirmani yozing.", "Промокод — слово, которое гость вводит при заказе. Нажмите «Новый промокод», укажите код и скидку."),
            L("Aksiya — bosh sahifadagi rasmli karta. Rasm, sarlavha qo'shing va holatni «E'lon qilingan» qiling.", "Акция — карточка с картинкой на главной. Добавьте фото, заголовок и выберите «Опубликовано»."),
            L("Mavjud promokodni o'zgartirish uchun uning qatorini bosing.", "Чтобы изменить промокод, нажмите на его строку."),
          ],
        }}
      />
      <Panel title={L("Promokodlar", "Промокоды")}>
        <Table head={[L("Kod", "Код"), L("Chegirma", "Скидка"), L("Shartlar", "Условия"), L("Ishlatilgan", "Использовано"), L("Holat", "Статус")]}>
          {codes.map((c) => {
            const expired = c.ends_at && new Date(c.ends_at).getTime() <= now;
            return (
              <tr key={c.id} className="align-top">
                <td className="px-3 py-2" colSpan={5}>
                  <details>
                    <summary className="grid cursor-pointer grid-cols-[repeat(5,minmax(0,1fr))_18px] items-center gap-3 rounded-lg py-1 transition-colors hover:text-brand">
                      <span className="font-mono font-semibold">{c.code}</span>
                      <span>{c.kind === "percent" ? `${c.value}%${c.max_discount ? ` (≤ ${formatUZS(c.max_discount)})` : ""}` : formatUZS(c.value)}</span>
                      <span className="text-xs text-muted">
                        {c.min_subtotal > 0 && `≥ ${formatUZS(c.min_subtotal)} `}
                        {c.brand_ids.length > 0 && brands.filter((b) => c.brand_ids.includes(b.id)).map((b) => b.name).join(", ")}
                      </span>
                      <span>
                        {c.used_count}
                        {c.usage_limit_total ? ` / ${c.usage_limit_total}` : ""}
                        {c.usage_limit_per_customer ? ` · ${c.usage_limit_per_customer}/${L("mijoz", "клиент")}` : ""}
                      </span>
                      <span>{!c.is_active ? <Pill>{L("o'chiq", "выкл")}</Pill> : expired ? <Pill tone="brand">{L("muddati o'tgan", "истёк")}</Pill> : <Pill tone="ok">{L("faol", "активен")}</Pill>}</span>
                    </summary>
                    <div className="mt-3 border-t border-line pt-3">{codeForm(c)}</div>
                  </details>
                </td>
              </tr>
            );
          })}
        </Table>
        <details className="mt-4 rounded-xl border-2 border-dashed border-line p-3 transition-colors open:border-solid open:bg-field/60 hover:border-brand/30">
          <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-brand"><IconPlus size={18} className="inline-block align-[-0.25em]" /> {L("Yangi promokod", "Новый промокод")}</summary>
          <div className="mt-3">{codeForm()}</div>
        </details>
      </Panel>

      <Panel title={L("Bosh sahifadagi aksiyalar", "Акции на главной")} className="mt-6">
        <div className="space-y-3">
          {promos.map((p) => (
            <details key={p.id} className="rounded-xl border border-line bg-white p-3 transition-[border-color,box-shadow] open:border-brand/30 open:shadow-[var(--shadow-card)] hover:border-[#d6d6d4]">
              <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.image_url && <img src={p.image_url} alt="" className="h-10 w-20 rounded object-cover" />}
                <b>{tr(p.title, lang)}</b>
                <Pill tone={p.status === "published" ? "ok" : "neutral"}>{p.status === "published" ? L("e'lon qilingan", "опубликовано") : L("qoralama", "черновик")}</Pill>
              </summary>
              <div className="mt-3 border-t border-line pt-3">
                {promoForm(p)}
                <div className="mt-2">
                  <ConfirmAction action={deletePromotionAction} label={L("O'chirish", "Удалить")} title={L("Aksiyani o'chirish", "Удалить акцию")} hidden={{ id: p.id }} />
                </div>
              </div>
            </details>
          ))}
        </div>
        <details className="mt-4 rounded-xl border-2 border-dashed border-line p-3 transition-colors open:border-solid open:bg-field/60 hover:border-brand/30">
          <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-brand"><IconPlus size={18} className="inline-block align-[-0.25em]" /> {L("Yangi aksiya", "Новая акция")}</summary>
          <div className="mt-3">{promoForm()}</div>
        </details>
      </Panel>
    </>
  );
}
