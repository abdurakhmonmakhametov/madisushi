import Link from "next/link";
import { requireStaff, allowedBranch } from "@/lib/admin/guard";
import { getL } from "@/lib/admin/l";
import { tr } from "@/lib/i18n/dict";
import { listBoardOrders, listStaffOrders } from "@/lib/services/orders";
import { staffBranches } from "@/lib/services/admin-stats";
import { formatUZS } from "@/lib/money";
import { formatDateTime, formatTime } from "@/lib/time";
import { PageHeader, Panel, Pill, Table } from "@/components/admin/server-ui";
import { AutoRefresh, Dropdown, FilterBar, FilterField, LiveBadge, Pagination, SearchInput } from "@/components/admin/ui";
import { OrderBoard } from "@/components/admin/OrderBoard";
import { methodLabel, statusLabel, statusTone, paymentLabel } from "@/components/admin/labels";
import { IconClock, IconList, IconReceipt } from "@/components/ui/icons";

type SP = { status?: string; branch?: string; q?: string; from?: string; to?: string; page?: string; view?: string };

export default async function AdminOrders({ searchParams }: { searchParams: Promise<SP> }) {
  const staff = await requireStaff("orders");
  const { L, lang } = await getL();
  const sp = await searchParams;
  const live = sp.view !== "all";
  const branchId = allowedBranch(staff, sp.branch);
  const [list, branches, board] = await Promise.all([
    live
      ? null
      : listStaffOrders(staff, {
          status: sp.status || undefined,
          branchId,
          q: sp.q,
          from: sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : undefined,
          to: sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : undefined,
          page: Number(sp.page) || 1,
        }),
    staffBranches(staff),
    live ? listBoardOrders(staff, branchId) : null,
  ]);
  const tabs = (
    <div className="flex rounded-xl bg-white p-1 shadow-[var(--shadow-card)]">
      <Link href="/admin/orders" className={live ? "btn-primary h-9 px-4 text-sm" : "btn h-9 px-4 text-sm text-muted hover:text-ink"}>
        <IconReceipt size={16} /> {L("Jonli doska", "Живая доска")}
      </Link>
      <Link href="/admin/orders?view=all" className={!live ? "btn-primary h-9 px-4 text-sm" : "btn h-9 px-4 text-sm text-muted hover:text-ink"}>
        <IconList size={16} /> {L("Tarix va qidiruv", "История и поиск")}
      </Link>
    </div>
  );

  if (board) {
    return (
      <>
        <AutoRefresh ms={30000} kinds={["order"]} />
        <PageHeader
          icon={<IconReceipt size={24} />}
          title={L("Buyurtmalar", "Заказы")}
          description={L("Har bir ustun — bitta bosqich. Kartadagi katta tugmani bosing, buyurtma keyingi ustunga o'tadi.", "Каждая колонка — этап. Нажмите большую кнопку на карточке — заказ перейдёт дальше.")}
          guide={{
            steps: [
              L("Yangi buyurtma chapdagi «Yangi» ustunida paydo bo'ladi va ovozli signal chalinadi (yuqoridagi «Ovoz» tugmasi bilan yoqing).", "Новый заказ появляется в колонке «Новый», звучит сигнал (включите кнопкой «Звук» вверху)."),
              L("Kartadagi katta tugmani bosing — buyurtma keyingi bosqichga o'tadi. Mijoz buni telefonida darhol ko'radi.", "Нажмите большую кнопку на карточке — заказ перейдёт дальше. Гость сразу видит это в телефоне."),
              L("Qizil vaqt — buyurtma kutib qolgan. Buyurtma raqamini bossangiz, to'liq ma'lumot va bekor qilish ochiladi.", "Красное время — заказ ждёт слишком долго. Нажмите на номер — откроются детали и отмена."),
            ],
            tip: L("Oxirgi qadam («Yetkazildi») xato bosilmasligi uchun ikki marta bosishni so'raydi.", "Последний шаг («Доставлен») просит нажать дважды, чтобы не ошибиться."),
          }}
        >
          <LiveBadge seconds={10} />
          {tabs}
        </PageHeader>
        {branches.length > 1 && (
          <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
            {[{ id: "", label: L("Barcha filiallar", "Все филиалы") }, ...branches.map((b) => ({ id: b.id, label: b.label }))].map((b) => {
              const on = (branchId ?? "") === b.id;
              return (
                <Link key={b.id || "all"} href={b.id ? `/admin/orders?branch=${b.id}` : "/admin/orders"} className={on ? "btn h-9 shrink-0 bg-ink px-4 text-sm text-white" : "btn h-9 shrink-0 bg-white px-4 text-sm text-ink shadow-[var(--shadow-card)] hover:bg-field"}>
                  {b.label}
                </Link>
              );
            })}
          </div>
        )}
        <OrderBoard orders={board} role={staff.role} serverNow={Date.now()} />
      </>
    );
  }
  if (!list) return null;

  return (
    <>
      <PageHeader
        icon={<IconReceipt size={24} />}
        title={L("Buyurtmalar tarixi", "История заказов")}
        description={L("Barcha buyurtmalar: eski va yakunlanganlar ham. Raqam, telefon yoki ism bo'yicha qidiring.", "Все заказы, включая завершённые. Ищите по номеру, телефону или имени.")}
      >
        {tabs}
      </PageHeader>
      <Panel>
        <FilterBar>
          <input type="hidden" name="view" value="all" />
          <FilterField label={L("Qidiruv", "Поиск")}>
            <SearchInput defaultValue={sp.q} placeholder={L("№, telefon yoki ism", "№, телефон или имя")} />
          </FilterField>
          <FilterField label={L("Holat", "Статус")}>
            <Dropdown
              name="status"
              defaultValue={sp.status ?? ""}
              options={[{ value: "", label: L("Hammasi", "Все") }, ...["new", "confirmed", "preparing", "ready", "out_for_delivery", "delivered", "picked_up", "cancelled"].map((s) => ({ value: s, label: statusLabel(s, lang) }))]}
            />
          </FilterField>
          {branches.length > 1 && (
            <FilterField label={L("Filial", "Филиал")}>
              <Dropdown name="branch" defaultValue={branchId ?? ""} options={[{ value: "", label: L("Hammasi", "Все") }, ...branches.map((b) => ({ value: b.id, label: b.label }))]} />
            </FilterField>
          )}
          <FilterField label={L("Qaysi kundan", "С даты")} className="sm:!min-w-0">
            <input type="date" name="from" defaultValue={sp.from} className="admin-field" />
          </FilterField>
          <FilterField label={L("Qaysi kungacha", "По дату")} className="sm:!min-w-0">
            <input type="date" name="to" defaultValue={sp.to} className="admin-field" />
          </FilterField>
        </FilterBar>
        <ul className="stagger mt-4 space-y-2 md:hidden">
          {list.rows.length === 0 && (
            <li className="rounded-2xl border-2 border-dashed border-line py-10 text-center text-sm text-muted">{L("Buyurtmalar topilmadi", "Заказы не найдены")}</li>
          )}
          {list.rows.map((o) => (
            <li key={o.id}>
              <Link href={`/admin/orders/${o.id}`} className={`block rounded-2xl border p-3.5 transition-[background-color,transform] active:scale-[0.99] active:bg-field ${o.status === "new" ? "border-info/40 bg-info-50/40" : "border-line"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[17px] font-bold text-brand">№ {o.number}</span>
                  <Pill tone={statusTone(o.status)}>{statusLabel(o.status, lang)}</Pill>
                </div>
                <div className="mt-2 flex items-end justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{o.customer_name}</p>
                    <p className="truncate text-xs text-muted">
                      {o.fulfillment === "delivery" ? L("Yetkazish", "Доставка") : L("Olib ketish", "Самовывоз")} · {o.brand_name} · {tr(o.branch_name, lang)}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDateTime(o.created_at, lang)}
                      {!o.asap && <span className="ml-1 text-warn">· <IconClock size={13} className="inline-block shrink-0 align-[-0.15em]" /> {formatTime(o.promised_at)}</span>}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold tabular-nums">{formatUZS(o.total)}</p>
                    <p className="text-xs text-muted">{paymentLabel(o.payment_status, lang)}</p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-4 hidden md:block">
          <Table
            head={["№", L("Vaqt", "Время"), L("Filial", "Филиал"), L("Mijoz", "Клиент"), L("Turi", "Тип"), L("Holat", "Статус"), L("To'lov", "Оплата"), L("Summa", "Сумма")]}
            empty={list.rows.length === 0 && L("Buyurtmalar topilmadi", "Заказы не найдены")}
          >
            {list.rows.map((o) => (
              <tr key={o.id} className={o.status === "new" ? "bg-info-50/40" : undefined}>
                <td className="px-3 py-2.5 font-semibold">
                  <Link href={`/admin/orders/${o.id}`} className="text-brand hover:underline">
                    {o.number}
                  </Link>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {formatDateTime(o.created_at, lang)}
                  {!o.asap && <div className="flex items-center gap-1 text-xs text-warn"><IconClock size={13} /> {formatTime(o.promised_at)}</div>}
                </td>
                <td className="px-3 py-2.5">
                  {o.brand_name} · {tr(o.branch_name, lang)}
                </td>
                <td className="px-3 py-2.5">
                  {o.customer_name}
                  <div className="text-xs text-muted">{o.customer_phone}</div>
                </td>
                <td className="px-3 py-2.5">{o.fulfillment === "delivery" ? L("Yetkazish", "Доставка") : L("Olib ketish", "Самовывоз")}</td>
                <td className="px-3 py-2.5">
                  <Pill tone={statusTone(o.status)}>{statusLabel(o.status, lang)}</Pill>
                </td>
                <td className="px-3 py-2.5 text-xs">
                  {methodLabel(o.payment_method, lang)} · {paymentLabel(o.payment_status, lang)}
                </td>
                <td className="px-3 py-2.5 font-medium tabular-nums">{formatUZS(o.total)}</td>
              </tr>
            ))}
          </Table>
        </div>
        <Pagination page={list.page} pageSize={list.pageSize} total={list.total} />
      </Panel>
    </>
  );
}
