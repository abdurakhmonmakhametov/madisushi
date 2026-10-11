import Link from "next/link";
import { requireStaff } from "@/lib/admin/guard";
import { getL } from "@/lib/admin/l";
import { tr } from "@/lib/i18n/dict";
import { asActor } from "@/lib/db";
import { PageHeader, Panel, Pill } from "@/components/admin/server-ui";
import { ActionForm, ConfirmAction, FileInput, I18nInput, Input, Select, SubmitButton } from "@/components/admin/ui";
import { deleteBannerAction, saveBannerAction } from "../../actions/marketing";
import { IconArrowUpRight, IconImage, IconPlus } from "@/components/ui/icons";

type I = { uz: string; ru?: string };
type Banner = { id: string; title: I; image_url: string | null; link_url: string | null; status: string; sort: number };

export default async function BannersAdmin() {
  const staff = await requireStaff("content");
  const { L, lang } = await getL();
  const banners = await asActor({ kind: "staff", id: staff.id }, (d) =>
    d.query<Banner>("select id, title, image_url, link_url, status, sort from public.content_items where kind = 'banner' order by sort, created_at"),
  );
  // Only published banners with a picture show on the site.
  const live = banners.filter((b) => b.status === "published" && b.image_url).length;

  const form = (b?: Banner) => (
    <ActionForm action={saveBannerAction} className="space-y-3" resetOnSuccess={!b}>
      {b && <input type="hidden" name="id" value={b.id} />}
      <FileInput
        name="image"
        label={L("Banner rasmi", "Изображение баннера")}
        current={b?.image_url}
        hint={L("Butun banner shu rasmdan iborat — matn va tugmalarni rasmning o'ziga joylang. Eng yaxshi o'lcham 1920×640 (3:1). 2 MB gacha.", "Весь баннер — это картинка: текст и кнопки размещайте прямо на ней. Лучший размер 1920×640 (3:1). До 2 МБ.")}
      />
      <I18nInput label={L("Nomi (saytda ko'rinmaydi, rasm tavsifi)", "Название (на сайте не видно, описание картинки)")} name="title" value={b?.title} required />
      <Input
        label={L("Bosilganda qayerga o'tadi (ixtiyoriy)", "Куда ведёт при нажатии (необязательно)")}
        help={L("Saytdagi sahifa: /promotions yoki menyu uchun #menu. Boshqa sayt: https://... Bo'sh qolsa, banner bosilmaydi.", "Страница сайта: /promotions или #menu для меню. Другой сайт: https://... Если пусто — баннер не кликабельный.")}
        placeholder="/promotions"
        name="linkUrl"
        defaultValue={b?.link_url ?? ""}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          label={L("Holat", "Статус")}
          name="status"
          defaultValue={b?.status ?? "published"}
          options={[
            { value: "published", label: L("Saytda ko'rinadi", "Показывается на сайте") },
            { value: "draft", label: L("Yashirin (qoralama)", "Скрыт (черновик)") },
          ]}
        />
        <Input label={L("Tartib raqami", "Порядок")} help={L("Karuseldagi o'rni. Kichik raqam oldinroq chiqadi: 1 — birinchi, 2 — ikkinchi.", "Место в карусели. Меньшее число — раньше: 1 — первый, 2 — второй.")} name="sort" type="number" defaultValue={b?.sort ?? banners.length + 1} />
      </div>
      <SubmitButton variant={b ? "soft" : "primary"}>{b ? L("Saqlash", "Сохранить") : L("Banner qo'shish", "Добавить баннер")}</SubmitButton>
    </ActionForm>
  );

  return (
    <>
      <PageHeader
        icon={<IconImage size={24} />}
        title={L("Bosh sahifa bannerlari", "Баннеры на главной")}
        description={L("Sayt tepasidagi aylanuvchi katta reklama bloki (karusel).", "Большой листающийся рекламный блок вверху сайта (карусель).")}
        guide={{
          steps: [
            L("«Yangi banner» ni bosing, rasm tanlang va nom yozing.", "Нажмите «Новый баннер», выберите картинку и напишите название."),
            L("Banner bosilganda biror sahifaga o'tishi kerak bo'lsa — havolani yozing (masalan /promotions).", "Если баннер должен вести на страницу — укажите ссылку (например /promotions)."),
            L("Bannerni o'zgartirish yoki o'chirish uchun uning qatorini bosing.", "Чтобы изменить или удалить баннер, нажмите на его строку."),
          ],
          tip: L("Bannerlar har 6 soniyada o'zi almashadi. Mijoz barmoq bilan ham suradi.", "Баннеры сменяются каждые 6 секунд. Гость может листать и пальцем."),
        }}
      >
        <Link href="/" target="_blank" className="btn-soft h-10 text-sm">
          {L("Saytda ko'rish", "Открыть на сайте")} <IconArrowUpRight size={16} />
        </Link>
      </PageHeader>

      <Panel title={`${L("Bannerlar", "Баннеры")} · ${L("saytda", "на сайте")}: ${live}`}>
        {live === 0 && <p className="mb-3 rounded-xl bg-brand-50 p-3 text-sm text-brand">{L("Saytda banner yo'q — karusel ko'rsatilmaydi. Rasmli banner qo'shing.", "На сайте нет баннеров — карусель скрыта. Добавьте баннер с картинкой.")}</p>}
        <div className="space-y-3">
          {banners.map((b) => (
            <details key={b.id} className="rounded-xl border border-line bg-white p-3 transition-[border-color,box-shadow] open:border-brand/30 open:shadow-[var(--shadow-card)] hover:border-[#d6d6d4]">
              <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                <span className="grid h-12 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-night">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {b.image_url ? <img src={b.image_url} alt="" className="size-full object-contain" /> : <IconImage size={20} className="text-white/40" />}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate">{tr(b.title, lang)}</b>
                  <span className="block truncate text-xs text-muted">
                    #{b.sort}
                    {b.link_url && ` · ${b.link_url}`}
                  </span>
                </span>
                <Pill tone={b.status === "published" ? "ok" : "neutral"}>{b.status === "published" ? L("saytda", "на сайте") : L("yashirin", "скрыт")}</Pill>
              </summary>
              <div className="mt-3 border-t border-line pt-3">
                {form(b)}
                <div className="mt-2">
                  <ConfirmAction action={deleteBannerAction} label={L("O'chirish", "Удалить")} title={L("Bannerni o'chirish", "Удалить баннер")} hidden={{ id: b.id }} />
                </div>
              </div>
            </details>
          ))}
        </div>
        <details className="mt-4 rounded-xl border-2 border-dashed border-line p-3 transition-colors open:border-solid open:bg-field/60 hover:border-brand/30" open={banners.length === 0}>
          <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-brand">
            <IconPlus size={18} className="inline-block align-[-0.25em]" /> {L("Yangi banner", "Новый баннер")}
          </summary>
          <div className="mt-3">{form()}</div>
        </details>
      </Panel>
    </>
  );
}
