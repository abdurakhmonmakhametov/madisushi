import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/admin/guard";
import { getL } from "@/lib/admin/l";
import { tr } from "@/lib/i18n/dict";
import { asActor } from "@/lib/db";
import { PageHeader, Panel } from "@/components/admin/server-ui";
import { ActionForm, ConfirmAction, FileInput, I18nInput, Input, Select, SubmitButton } from "@/components/admin/ui";
import { deleteContentAction, saveContentAction } from "../../../actions/marketing";
import { KIND_LABELS } from "@/components/admin/labels";
import { IconArrowLeft, IconArrowUpRight } from "@/components/ui/icons";

type I = { uz: string; ru?: string };

const PUBLIC_PATH: Record<string, (slug: string) => string> = {
  page: (s) => `/info/${s}`,
  legal: (s) => `/info/${s}`,
  news: (s) => `/news/${s}`,
  recipe: (s) => `/recipes/${s}`,
  vacancy: () => "/vacancies",
  faq: () => "/faq",
  gallery: () => "/gallery",
  banner: () => "/",
};

export default async function ContentEdit({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("content");
  const { L, lang } = await getL();
  const { id } = await params;
  const isNew = id === "new";
  if (!isNew && !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const item = isNew
    ? null
    : await asActor({ kind: "staff", id: staff.id }, (d) =>
        d.one<{ id: string; kind: string; slug: string; title: I; excerpt: I; body: I; image_url: string | null; link_url: string | null; status: string; sort: number }>("select * from public.content_items where id = $1", [id]),
      );
  if (!isNew && !item) notFound();
  return (
    <>
      <PageHeader title={item ? tr(item.title, lang) : L("Yangi yozuv", "Новая запись")} guide={{ steps: [L("Turini tanlang va sarlavhani ikki tilda yozing.", "Выберите тип и напишите заголовок на двух языках."), L("Tayyor bo'lmasa «Qoralama» qoldiring — saytda ko'rinmaydi.", "Если не готово — оставьте «Черновик», на сайте не видно."), L("Pastdagi «Saqlash» tugmasini bosing.", "Нажмите «Сохранить» внизу.")] }}>
        {item?.status === "published" && (
          <Link href={PUBLIC_PATH[item.kind]?.(item.slug) ?? "/"} target="_blank" className="btn-soft h-10 text-sm">
            {L("Saytda ko'rish", "Открыть на сайте")} <IconArrowUpRight size={16} />
          </Link>
        )}
        <Link href="/admin/content" className="btn-soft h-10 text-sm">
          <IconArrowLeft size={18} /> {L("Kontent", "Контент")}
        </Link>
        {item && <ConfirmAction action={deleteContentAction} label={L("O'chirish", "Удалить")} title={L("Kontentni o'chirish", "Удалить контент")} hidden={{ id: item.id }} />}
      </PageHeader>
      <Panel>
        <ActionForm action={saveContentAction} className="space-y-4">
          {item && <input type="hidden" name="id" value={item.id} />}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Select label={L("Turi", "Тип")} name="kind" defaultValue={item?.kind ?? "news"} options={Object.entries(KIND_LABELS).map(([k, v]) => ({ value: k, label: L(...v) }))} help={L("Bu yozuv saytning qaysi joyida chiqishini tanlang.", "Выберите, в каком разделе сайта появится запись.")} />
            <Input label={L("Havola nomi (slug)", "Имя ссылки (slug)")} help={L("Sahifa manzilida ishlatiladigan lotincha nom. Faqat kichik harf, raqam va chiziqcha (-). Masalan: filadelfiya-roll", "Латинское имя для адреса страницы. Только строчные буквы, цифры и дефис (-). Например: filadelfiya-roll")} placeholder="masalan-nom" name="slug" defaultValue={item?.slug} required pattern="[a-z0-9-]{2,80}" />
            <Select
              label={L("Holat", "Статус")}
              name="status"
              defaultValue={item?.status ?? "draft"}
              options={[
                { value: "draft", label: L("Qoralama (saytda ko'rinmaydi)", "Черновик (не виден на сайте)") },
                { value: "published", label: L("E'lon qilingan", "Опубликовано") },
              ]}
            />
            <Input label={L("Tartib raqami", "Порядок")} help={L("Ro'yxatdagi o'rni. Kichik raqam yuqorida turadi: 1 — birinchi, 2 — ikkinchi.", "Место в списке. Меньшее число — выше: 1 — первый, 2 — второй.")} name="sort" type="number" defaultValue={item?.sort ?? 0} />
          </div>
          <I18nInput label={L("Sarlavha", "Заголовок")} name="title" value={item?.title} required />
          <I18nInput label={L("Qisqa matn", "Краткий текст")} name="excerpt" value={item?.excerpt} />
          <I18nInput label={L("Matn (bo'sh qator — yangi paragraf)", "Текст (пустая строка — новый абзац)")} name="body" value={item?.body} multiline />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label={L("Havola (ixtiyoriy, / yoki https://)", "Ссылка (необязательно, / или https://)")} name="linkUrl" defaultValue={item?.link_url ?? ""} />
            <FileInput name="image" label={L("Rasm", "Изображение")} current={item?.image_url} />
          </div>
          <SubmitButton>{L("Saqlash", "Сохранить")}</SubmitButton>
        </ActionForm>
      </Panel>
    </>
  );
}
