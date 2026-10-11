import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/admin/guard";
import { getL } from "@/lib/admin/l";
import { tr } from "@/lib/i18n/dict";
import { asActor } from "@/lib/db";
import { formatUZS } from "@/lib/money";
import { minutesToHHMM } from "@/lib/time";
import { PageHeader, Panel, Pill } from "@/components/admin/server-ui";
import { ActionForm, Check, ConfirmAction, I18nInput, Input, SubmitButton } from "@/components/admin/ui";
import { BranchForm, type BranchValues } from "@/components/admin/BranchForm";
import { addClosureAction, deleteClosureAction, deleteZoneAction, saveHoursAction, saveZoneAction } from "../../../actions/restaurants";
import { IconArrowLeft, IconPlus } from "@/components/ui/icons";

type I = { uz: string; ru?: string };
const DAYS: [number, string, string][] = [
  [1, "Dushanba", "Понедельник"],
  [2, "Seshanba", "Вторник"],
  [3, "Chorshanba", "Среда"],
  [4, "Payshanba", "Четверг"],
  [5, "Juma", "Пятница"],
  [6, "Shanba", "Суббота"],
  [7, "Yakshanba", "Воскресенье"],
];

export default async function BranchAdmin({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("branches");
  const { L, lang } = await getL();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await asActor({ kind: "staff", id: staff.id }, async (d) => {
    const branch = await d.one<BranchValues & { brand: string; brand_id: string }>(
      "select br.*, b.name as brand from public.branches br join public.brands b on b.id = br.brand_id where br.id = $1 and app.can_access_branch(br.id)",
      [id],
    );
    if (!branch) return null;
    const hours = await d.query<{ weekday: number; open_minute: number; close_minute: number }>("select * from public.branch_hours where branch_id = $1", [id]);
    const closures = await d.query<{ id: string; date: string; reason: I }>("select id, date, reason from public.branch_closures where branch_id = $1 and date >= current_date - 7 order by date", [id]);
    const zones = await d.query<{ id: string; name: I; fee: number; min_order: number; free_delivery_from: number | null; surcharge: number; surcharge_note: I | null; extra_minutes: number; priority: number; is_active: boolean; polygon: [number, number][] }>(
      "select * from public.delivery_zones where branch_id = $1 order by priority desc",
      [id],
    );
    const canManage = (await d.one<{ ok: boolean }>("select app.can_manage_branch($1) as ok", [id]))?.ok ?? false;
    return { branch, hours, closures, zones, canManage };
  });
  if (!data) notFound();
  const { branch, hours, closures, zones, canManage } = data;

  return (
    <>
      <PageHeader title={`${branch.brand} · ${tr(branch.name, lang)}`} guide={{ steps: [L("Chapda — filial nomi, manzili va xizmatlari. O'zgartirib, «Saqlash» ni bosing.", "Слева — название, адрес и услуги. Измените и нажмите «Сохранить»."), L("Ish vaqti — har bir kun uchun ochilish va yopilish soati.", "Часы работы — время открытия и закрытия для каждого дня."), L("Yopiq kunlar — filial ishlamaydigan sanalar (bayram, ta'mir).", "Закрытые дни — даты, когда филиал не работает (праздник, ремонт).")] }}>
        <Link href="/admin/branches" className="btn-soft h-10 text-sm">
          <IconArrowLeft size={18} /> {L("Filiallar", "Филиалы")}
        </Link>
      </PageHeader>
      {!canManage && <p className="mb-4 flex items-center gap-2 rounded-xl bg-warn-50 p-3 text-sm font-medium text-warn">👁 {L("Faqat ko'rish rejimi", "Только просмотр")}</p>}
      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
        <Panel title={L("Filial sozlamalari", "Настройки филиала")}>
          <BranchForm branch={branch} />
        </Panel>

        <div className="space-y-6">
          <Panel title={L("Ish vaqti (Toshkent vaqti)", "Часы работы (время Ташкента)")}>
            <ActionForm action={saveHoursAction} className="space-y-2">
              <input type="hidden" name="branchId" value={branch.id} />
              {DAYS.map(([wd, uz, ru]) => {
                const h = hours.find((x) => x.weekday === wd);
                return (
                  <div key={wd} className="grid grid-cols-[minmax(72px,110px)_1fr_1fr_auto] items-center gap-2 rounded-xl px-1 py-0.5 transition-colors hover:bg-page">
                    <span className="text-sm font-medium">{L(uz, ru)}</span>
                    <input type="time" name={`open_${wd}`} defaultValue={h ? minutesToHHMM(h.open_minute) : "10:00"} className="admin-field !h-10 !px-2 tabular-nums" aria-label={`${L(uz, ru)} open`} />
                    <input type="time" name={`close_${wd}`} defaultValue={h ? minutesToHHMM(h.close_minute) : "22:00"} className="admin-field !h-10 !px-2 tabular-nums" aria-label={`${L(uz, ru)} close`} />
                    <Check label={L("yopiq", "выходной")} name={`closed_${wd}`} defaultChecked={!h} />
                  </div>
                );
              })}
              <p className="text-xs text-muted">{L("Yopilish vaqti ochilishdan oldin bo'lsa, u keyingi kunga o'tadi (masalan 10:00–02:00).", "Если закрытие раньше открытия — это следующий день (например 10:00–02:00).")}</p>
              <SubmitButton>{L("Saqlash", "Сохранить")}</SubmitButton>
            </ActionForm>
          </Panel>

          <Panel title={L("Bayram va dam olish kunlari", "Праздничные и нерабочие дни")}>
            <ul className="mb-3 space-y-2">
              {closures.length === 0 && <li className="text-sm text-muted">—</li>}
              {closures.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    <b>{c.date}</b> — {tr(c.reason, lang)}
                  </span>
                  <ConfirmAction action={deleteClosureAction} label="×" title={L("O'chirish", "Удалить")} hidden={{ id: c.id, branchId: branch.id }} className="!h-8" />
                </li>
              ))}
            </ul>
            <ActionForm action={addClosureAction} className="space-y-2" resetOnSuccess>
              <input type="hidden" name="branchId" value={branch.id} />
              <Input label={L("Sana", "Дата")} name="date" type="date" required />
              <I18nInput label={L("Sabab", "Причина")} name="reason" />
              <SubmitButton variant="soft"><IconPlus size={18} className="inline-block align-[-0.25em]" /> {L("Qo'shish", "Добавить")}</SubmitButton>
            </ActionForm>
          </Panel>
        </div>

        <Panel title={L("Yetkazib berish hududlari", "Зоны доставки")} className="2xl:col-span-2">
          <p className="mb-4 text-sm text-muted">
            {L(
              "Manzil bir nechta hududga tushsa, ustuvorligi yuqori hudud, keyin eng yaqin filial tanlanadi. Narx, minimal buyurtma va bepul yetkazish chegarasi har bir hudud uchun alohida.",
              "Если адрес попадает в несколько зон, выбирается зона с большим приоритетом, затем ближайший филиал. Цена, минимальный заказ и порог бесплатной доставки задаются для каждой зоны.",
            )}
          </p>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {zones.map((z) => (
              <div key={z.id} className="rounded-xl border border-line p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <b>{tr(z.name, lang)}</b>
                  {z.is_active ? <Pill tone="ok">{L("faol", "активна")}</Pill> : <Pill>{L("o'chiq", "выкл")}</Pill>}
                  <span className="text-sm text-muted">
                    {formatUZS(z.fee)}
                    {z.surcharge > 0 && ` + ${formatUZS(z.surcharge)}`} · min {formatUZS(z.min_order)} · {z.polygon.length} {L("nuqta", "точек")}
                  </span>
                </div>
                <ZoneForm zone={z} branchId={branch.id} L={L} />
                <div className="mt-2">
                  <ConfirmAction action={deleteZoneAction} label={L("Hududni o'chirish", "Удалить зону")} title={L("Hududni o'chirish", "Удалить зону")} hidden={{ id: z.id, branchId: branch.id }} />
                </div>
              </div>
            ))}
            <div className="rounded-xl border border-dashed border-line p-4">
              <p className="mb-3 font-semibold"><IconPlus size={18} className="inline-block align-[-0.25em]" /> {L("Yangi hudud", "Новая зона")}</p>
              <ZoneForm branchId={branch.id} L={L} center={[branch.lat, branch.lng]} />
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}

function ZoneForm({
  zone,
  branchId,
  L,
  center,
}: {
  zone?: { id: string; name: I; fee: number; min_order: number; free_delivery_from: number | null; surcharge: number; surcharge_note: I | null; extra_minutes: number; priority: number; is_active: boolean; polygon: [number, number][] };
  branchId: string;
  L: (a: string, b: string) => string;
  center?: [number, number];
}) {
  return (
    <ActionForm action={saveZoneAction} className="space-y-3" resetOnSuccess={!zone}>
      {zone && <input type="hidden" name="id" value={zone.id} />}
      <input type="hidden" name="branchId" value={branchId} />
      <I18nInput label={L("Nomi", "Название")} name="name" value={zone?.name} required />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Input label={L("Narx", "Стоимость")} name="fee" type="number" min={0} defaultValue={zone?.fee ?? 15000} required />
        <Input label={L("Min. buyurtma", "Мин. заказ")} name="minOrder" type="number" min={0} defaultValue={zone?.min_order ?? 0} />
        <Input label={L("Bepul …dan", "Бесплатно от")} name="freeFrom" type="number" min={0} defaultValue={zone?.free_delivery_from ?? ""} />
        <Input label={L("Ustama", "Надбавка")} name="surcharge" type="number" min={0} defaultValue={zone?.surcharge ?? 0} />
        <Input label={L("Qo'shimcha daq", "Доп. минут")} name="extraMinutes" type="number" min={0} defaultValue={zone?.extra_minutes ?? 0} />
        <Input label={L("Ustuvorlik", "Приоритет")} name="priority" type="number" defaultValue={zone?.priority ?? 0} />
      </div>
      <I18nInput label={L("Ustama izohi (mijozga ko'rinadi)", "Пояснение к надбавке (видно клиенту)")} name="note" value={zone?.surcharge_note} />
      <fieldset className="rounded-lg bg-field p-3">
        <legend className="px-1 text-sm font-medium">{L("Hudud chegarasi", "Граница зоны")}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Input label={L("Markaz lat", "Центр lat")} name="centerLat" type="number" step="0.000001" defaultValue={center?.[0] ?? ""} />
          <Input label={L("Markaz lng", "Центр lng")} name="centerLng" type="number" step="0.000001" defaultValue={center?.[1] ?? ""} />
          <Input label={L("Radius, m", "Радиус, м")} name="radius" type="number" min={100} placeholder={zone ? L("o'zgartirmaslik", "не менять") : "5000"} />
        </div>
        <label className="mt-2 block text-sm">
          <span className="mb-1 block">{L("yoki poligon JSON [[lat,lng],...]", "или полигон JSON [[lat,lng],...]")}</span>
          <textarea name="polygon" rows={2} className="admin-field !h-auto p-2 font-mono text-xs" placeholder="[[41.3,69.2],[41.31,69.25],[41.28,69.26]]" />
        </label>
      </fieldset>
      <Check label={L("Faol", "Активна")} name="isActive" defaultChecked={zone?.is_active ?? true} />
      <SubmitButton variant={zone ? "soft" : "primary"}>{L("Saqlash", "Сохранить")}</SubmitButton>
    </ActionForm>
  );
}
