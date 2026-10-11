import Link from "next/link";
import { requireStaff, allowedBranch } from "@/lib/admin/guard";
import { getL } from "@/lib/admin/l";
import { tr } from "@/lib/i18n/dict";
import { asActor } from "@/lib/db";
import { listStaffReservations, type ReservationRow } from "@/lib/services/reservations";
import { staffBranches } from "@/lib/services/admin-stats";
import { addDays, formatTime, todayLocal } from "@/lib/time";
import { EmptyState, PageHeader, Panel, Pill, Table } from "@/components/admin/server-ui";
import { ActionForm, AutoRefresh, Dropdown, FilterBar, FilterField, LiveBadge, SubmitButton } from "@/components/admin/ui";
import { statusTone } from "@/components/admin/labels";
import { reservationStatusAction } from "../../actions/ops";
import { IconArrowLeft, IconArrowRight, IconCalendar, IconComment } from "@/components/ui/icons";

const STATUS: Record<string, [string, string]> = {
  pending: ["Kutilmoqda", "Ожидает"],
  confirmed: ["Tasdiqlangan", "Подтверждена"],
  rejected: ["Rad etilgan", "Отклонена"],
  cancelled: ["Bekor qilingan", "Отменена"],
  seated: ["Keldi", "Пришли"],
  no_show: ["Kelmadi", "Не пришли"],
};

export default async function ReservationsAdmin({ searchParams }: { searchParams: Promise<{ date?: string; branch?: string; view?: string; status?: string }> }) {
  const staff = await requireStaff("reservations");
  const { L, lang } = await getL();
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayLocal();
  const view = sp.view === "list" ? "list" : "day";
  const branches = await staffBranches(staff);
  const branchId = allowedBranch(staff, sp.branch) ?? (view === "day" ? branches[0]?.id : undefined);
  const rows = await listStaffReservations(staff, view === "day" ? { branchId, from: date, to: date } : { branchId, from: date, to: addDays(date, 30), status: sp.status || undefined });
  const branch = branchId
    ? await asActor({ kind: "staff", id: staff.id }, (d) => d.one<{ reservation_capacity: number }>("select reservation_capacity from public.branches where id = $1", [branchId]))
    : null;
  const S = (s: string) => L(...(STATUS[s] ?? [s, s]));
  const qs = (o: Record<string, string | undefined>) => new URLSearchParams(Object.entries({ date, branch: branchId, view, ...o }).filter(([, v]) => v) as [string, string][]).toString();

  // Day view: group by hour
  const byHour = new Map<string, ReservationRow[]>();
  for (const r of rows) {
    const h = formatTime(r.starts_at).slice(0, 2) + ":00";
    byHour.set(h, [...(byHour.get(h) ?? []), r]);
  }
  const active = rows.filter((r) => ["pending", "confirmed", "seated"].includes(r.status));

  const actions = (r: ReservationRow) => {
    const next = r.status === "pending" ? (["confirmed", "rejected"] as const) : r.status === "confirmed" ? (["seated", "no_show", "cancelled"] as const) : [];
    return (
      <div className="flex flex-wrap gap-1">
        {next.map((to) => (
          <ActionForm key={to} action={reservationStatusAction}>
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="to" value={to} />
            <SubmitButton variant={to === "confirmed" || to === "seated" ? "primary" : "soft"} className="!h-9 !px-3.5 text-sm">
              {S(to)}
            </SubmitButton>
          </ActionForm>
        ))}
      </div>
    );
  };

  return (
    <>
      <AutoRefresh ms={30000} kinds={["reservation"]} />
      <PageHeader
        icon={<IconCalendar size={24} />}
        title={L("Stol bronlari", "Брони столов")}
        description={L("Mijozlar saytda band qilgan stollar. Sahifa o'zi yangilanadi.", "Столы, забронированные гостями на сайте. Страница обновляется сама.")}
        guide={{
          steps: [
            L("Yangi bron «Kutilmoqda» holatida keladi. Joy bo'lsa «Tasdiqlangan» ni, bo'lmasa «Rad etilgan» ni bosing.", "Новая бронь приходит со статусом «Ожидает». Есть места — «Подтверждена», нет — «Отклонена»."),
            L("Mehmon kelganda «Keldi» ni bosing. Kelmasa — «Kelmadi».", "Когда гость пришёл — «Пришли». Не пришёл — «Не пришли»."),
            L("Boshqa kunni ko'rish uchun «Oldingi kun / Keyingi kun» tugmalarini bosing.", "Чтобы посмотреть другой день, нажмите «Пред. день / След. день»."),
          ],
          tip: L("Mehmonga qo'ng'iroq qilish uchun uning telefon raqamini bosing.", "Чтобы позвонить гостю, нажмите на его номер."),
        }}
      >
        <LiveBadge seconds={20} />
        <div className="flex rounded-xl bg-white p-1 shadow-[var(--shadow-card)]">
          <Link href={`?${qs({ view: "day" })}`} className={view === "day" ? "btn-primary h-9 px-4 text-sm" : "btn h-9 px-4 text-sm text-muted hover:text-ink"}>
            {L("Bir kun", "Один день")}
          </Link>
          <Link href={`?${qs({ view: "list" })}`} className={view === "list" ? "btn-primary h-9 px-4 text-sm" : "btn h-9 px-4 text-sm text-muted hover:text-ink"}>
            {L("30 kunlik ro'yxat", "Список на 30 дней")}
          </Link>
        </div>
      </PageHeader>
      <Panel>
        <FilterBar>
          <input type="hidden" name="view" value={view} />
          <FilterField label={L("Sana", "Дата")} className="sm:!min-w-0">
            <input type="date" name="date" defaultValue={date} className="admin-field" />
          </FilterField>
          <FilterField label={L("Filial", "Филиал")}>
            <Dropdown name="branch" defaultValue={branchId ?? ""} options={[...(view === "list" ? [{ value: "", label: L("Hammasi", "Все") }] : []), ...branches.map((b) => ({ value: b.id, label: b.label }))]} />
          </FilterField>
          {view === "list" && (
            <FilterField label={L("Holat", "Статус")}>
              <Dropdown name="status" defaultValue={sp.status ?? ""} options={[{ value: "", label: L("Hammasi", "Все") }, ...Object.keys(STATUS).map((s) => ({ value: s, label: S(s) }))]} />
            </FilterField>
          )}
        </FilterBar>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4 text-sm">
          <Link className="btn-soft h-9 text-sm" href={`?${qs({ date: addDays(date, -1) })}`}>
            <IconArrowLeft size={18} /> {L("Oldingi kun", "Пред. день")}
          </Link>
          <Link className="btn-soft h-9 text-sm" href={`?${qs({ date: todayLocal() })}`}>
            {L("Bugun", "Сегодня")}
          </Link>
          <Link className="btn-soft h-9 text-sm" href={`?${qs({ date: addDays(date, 1) })}`}>
            {L("Keyingi kun", "След. день")} <IconArrowRight size={18} />
          </Link>
        </div>
      </Panel>

      {view === "day" ? (
        <Panel className="mt-6" title={`${date} · ${active.reduce((n, r) => n + r.party_size, 0)} ${L("mehmon", "гостей")}${branch ? ` / ${L("sig'im", "вместимость")} ${branch.reservation_capacity}` : ""}`}>
          {rows.length === 0 ? (
            <EmptyState text={L("Bu kunga bronlar yo'q", "Нет броней на этот день")} hint={L("Yangi bron kelsa, shu yerda o'zi paydo bo'ladi.", "Новая бронь появится здесь сама.")} />
          ) : (
            <ol className="space-y-4">
              {[...byHour.entries()].map(([hour, list]) => (
                <li key={hour} className="grid grid-cols-1 gap-3 sm:grid-cols-[70px_1fr]">
                  <span className="flex h-fit items-center gap-2 text-lg font-bold text-ink/60"><span className="size-2 rounded-full bg-brand" />{hour}</span>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {list.map((r) => (
                      <div key={r.id} className={`lift rounded-2xl border p-3.5 ${r.status === "pending" ? "border-info/40 bg-info-50/40" : "border-line bg-white"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <b>
                            {formatTime(r.starts_at)}–{formatTime(r.ends_at)} · {r.party_size} {L("kishi", "чел.")}
                          </b>
                          <Pill tone={statusTone(r.status)}>{S(r.status)}</Pill>
                        </div>
                        <p className="mt-1 text-sm">
                          №{r.number} · {r.name} ·{" "}
                          <a className="font-medium text-brand hover:underline" href={`tel:${r.phone}`}>
                            {r.phone}
                          </a>
                        </p>
                        {r.notes && <p className="mt-1 flex gap-1.5 text-sm text-muted"><IconComment size={16} className="mt-0.5 shrink-0" /> {r.notes}</p>}
                        <div className="mt-2">{actions(r)}</div>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      ) : (
        <Panel className="mt-6">
          <Table head={["№", L("Vaqt", "Время"), L("Filial", "Филиал"), L("Mijoz", "Гость"), L("Kishi", "Гостей"), L("Holat", "Статус"), ""]} empty={rows.length === 0 && L("Bronlar yo'q", "Нет броней")}>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">{r.number}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit" }).format(new Date(r.starts_at))} {formatTime(r.starts_at)}
                </td>
                <td className="px-3 py-2">
                  {r.brand_name} · {tr(r.branch_name, lang)}
                </td>
                <td className="px-3 py-2">
                  {r.name}
                  <div className="text-xs text-muted">{r.phone}</div>
                </td>
                <td className="px-3 py-2">{r.party_size}</td>
                <td className="px-3 py-2">
                  <Pill tone={statusTone(r.status)}>{S(r.status)}</Pill>
                </td>
                <td className="px-3 py-2">{actions(r)}</td>
              </tr>
            ))}
          </Table>
        </Panel>
      )}
    </>
  );
}
