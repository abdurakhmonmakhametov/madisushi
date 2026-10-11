import Link from "next/link";
import clsx from "clsx";
import { requireStaff, allowedBranch, permissionsOf } from "@/lib/admin/guard";
import { getL } from "@/lib/admin/l";
import { tr } from "@/lib/i18n/dict";
import { attentionNow, dashboard, staffBranches } from "@/lib/services/admin-stats";
import { formatUZS } from "@/lib/money";
import { addDays, todayLocal } from "@/lib/time";
import { Panel, Stat } from "@/components/admin/server-ui";
import { PageGuide } from "@/components/admin/guide";
import { Dropdown } from "@/components/admin/ui";
import { statusLabel, statusTone } from "@/components/admin/labels";
import { IconBan, IconBook, IconCalendar, IconChart, IconChevronRight, IconClock, IconReceipt, IconRefund, IconTag, IconWallet } from "@/components/ui/icons";
import { LiveRefresh } from "@/components/live/LiveRefresh";

type SP = { from?: string; to?: string; branch?: string };

const TONE_BG = { neutral: "bg-subtle", ok: "bg-ok", warn: "bg-warn", brand: "bg-brand", info: "bg-info" } as const;

export default async function Dashboard({ searchParams }: { searchParams: Promise<SP> }) {
  const staff = await requireStaff("dashboard");
  const { L, lang } = await getL();
  const sp = await searchParams;
  const valid = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
  const today = todayLocal();
  const to = valid(sp.to) ?? today;
  const from = valid(sp.from) ?? addDays(to, -6);
  const branchId = allowedBranch(staff, sp.branch);
  const [m, branches, now] = await Promise.all([dashboard(staff, { from, to, branchId }), staffBranches(staff), attentionNow(staff, branchId)]);
  const maxDay = Math.max(1, ...m.byDay.map((d) => d.revenue));
  const maxQty = Math.max(1, ...m.popular.map((p) => p.qty));

  const presets = [
    { label: L("Bugun", "Сегодня"), from: today, to: today },
    { label: L("7 kun", "7 дней"), from: addDays(today, -6), to: today },
    { label: L("30 kun", "30 дней"), from: addDays(today, -29), to: today },
  ];
  const qs = (f: string, t: string) => `/admin?${new URLSearchParams({ from: f, to: t, ...(branchId ? { branch: branchId } : {}) })}`;
  const presetActive = presets.find((p) => p.from === from && p.to === to);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Tashkent" }).format(new Date()));
  const hello = hour < 12 ? L("Xayrli tong", "Доброе утро") : hour < 18 ? L("Xayrli kun", "Добрый день") : L("Xayrli kech", "Добрый вечер");

  return (
    <div className="space-y-5 lg:space-y-6">
      <LiveRefresh scope="staff" kinds={["order", "reservation", "feedback"]} />
      {/* Greeting */}
      <div>
        <h1 className="text-[22px] font-bold leading-tight lg:text-[26px]">
          {hello}, {staff.name.split(" ")[0]}!
        </h1>
        <p className="mt-1 text-sm text-muted">{L("Bu yerda restoran qanday ishlayotganini bir qarashda ko'rasiz.", "Здесь видно, как работает ресторан, с одного взгляда.")}</p>
      </div>

      <PageGuide
        title={L("Panelga xush kelibsiz! Qayerdan boshlash kerak?", "Добро пожаловать! С чего начать?")}
        steps={[
          L("Yuqoridagi uchta kartani kuzating: qizil bo'lsa — darhol e'tibor bering.", "Следите за тремя карточками сверху: если красная — нужно внимание."),
          L("Yangi buyurtma bo'lsa, «Yangi buyurtmalar» kartasini bosing va uni qabul qiling.", "Есть новый заказ — нажмите «Новые заказы» и примите его."),
          L("Pastdagi raqamlar — tanlangan kunlardagi savdo natijalari. Davrni «Bugun / 7 kun / 30 kun» tugmalari bilan almashtiring.", "Цифры ниже — итоги продаж за период. Меняйте период кнопками «Сегодня / 7 дней / 30 дней»."),
        ]}
        tip={L("Biror narsa tushunarsiz bo'lsa, yuqoridagi «Yordam» tugmasini bosing.", "Если что-то непонятно, нажмите «Помощь» вверху.")}
      />

      {/* What needs attention right now */}
      <section aria-label={L("Hozir e'tibor bering", "Требует внимания")} className="stagger grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ActionCard
          href="/admin/orders?status=new&view=all"
          tone={now.waiting > 0 ? "brand" : "neutral"}
          icon={<IconReceipt size={20} />}
          value={now.waiting}
          title={L("Yangi buyurtmalar", "Новые заказы")}
          hint={now.waiting > 0 ? L("Tasdiqlashni kutmoqda — oching", "Ждут подтверждения — откройте") : L("Hammasi qabul qilingan", "Все приняты")}
          pulse={now.waiting > 0}
        />
        <ActionCard
          href="/admin/orders"
          tone="info"
          icon={<IconClock size={20} />}
          value={now.inProgress}
          title={L("Jarayondagi buyurtmalar", "Заказы в работе")}
          hint={L("Tayyorlanmoqda yoki yo'lda", "Готовятся или в пути")}
        />
        <ActionCard
          href="/admin/availability"
          tone={now.stopped > 0 ? "warn" : "neutral"}
          icon={<IconBan size={20} />}
          value={now.stopped}
          title={L("Tugagan taomlar", "Нет в наличии")}
          hint={L("Mijozlar bu taomlarni ko'rmaydi", "Гости не видят эти блюда")}
        />
      </section>

      {/* Quick actions */}
      <section aria-label={L("Tezkor amallar", "Быстрые действия")}>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">{L("Nima qilmoqchisiz?", "Что хотите сделать?")}</p>
        <div className="stagger grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            { href: "/admin/orders", perm: "orders", icon: <IconReceipt size={20} />, t: L("Buyurtmalarni ko'rish", "Посмотреть заказы") },
            { href: "/admin/availability", perm: "availability", icon: <IconBan size={20} />, t: L("Taomni «tugadi» qilish", "Отметить «нет в наличии»") },
            { href: "/admin/reservations", perm: "reservations", icon: <IconCalendar size={20} />, t: L("Bugungi bronlar", "Брони на сегодня") },
            { href: "/admin/menu", perm: "menu", icon: <IconBook size={20} />, t: L("Menyuni o'zgartirish", "Изменить меню") },
            { href: "/admin/promotions", perm: "promotions", icon: <IconTag size={20} />, t: L("Chegirma yaratish", "Создать скидку") },
          ]
            .filter((a) => permissionsOf(staff.role).includes(a.perm as never))
            .slice(0, 4)
            .map((a) => (
              <Link key={a.href} href={a.href} className="lift group flex items-center gap-3 rounded-2xl bg-white p-3 text-sm font-medium shadow-[var(--shadow-card)]">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-field text-ink/80 transition-colors group-hover:bg-brand group-hover:text-white">{a.icon}</span>
                <span className="min-w-0 leading-tight">{a.t}</span>
              </Link>
            ))}
        </div>
      </section>

      {/* Period + branch */}
      <div className="flex flex-col gap-3 rounded-2xl bg-white p-3 shadow-[var(--shadow-card)] md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <span className="hidden text-sm text-muted sm:inline">{L("Davr:", "Период:")}</span>
          <div className="flex flex-1 rounded-xl bg-field p-1">
            {presets.map((p) => (
              <Link
                key={p.label}
                href={qs(p.from, p.to)}
                className={clsx("flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-center text-sm font-medium transition-all duration-200", presetActive === p ? "bg-white shadow-sm" : "text-muted hover:text-ink")}
              >
                {p.label}
              </Link>
            ))}
          </div>
        </div>
        {branches.length > 1 && (
          <form method="get" action="/admin" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="from" value={from} />
            <input type="hidden" name="to" value={to} />
            <div className="min-w-0 flex-1 md:w-56 md:flex-none">
              <Dropdown name="branch" defaultValue={branchId ?? ""} aria-label={L("Filial", "Филиал")} size="sm" className="!h-10" options={[{ value: "", label: L("Barcha filiallar", "Все филиалы") }, ...branches.map((b) => ({ value: b.id, label: b.label }))]} />
            </div>
            <button className="btn-soft h-10 px-4 text-sm">{L("Ko'rsatish", "Показать")}</button>
          </form>
        )}
      </div>
      <details className="-mt-2 text-sm" open={!presetActive}>
        <summary className="inline-flex cursor-pointer items-center text-muted hover:text-ink">{L("Boshqa sanani tanlash", "Выбрать другие даты")}</summary>
        <form method="get" action="/admin" className="mt-2 flex flex-wrap items-center gap-2">
          <input type="date" name="from" defaultValue={from} aria-label={L("Dan", "С")} className="admin-field !h-10 !w-auto" />
          <span className="text-muted">—</span>
          <input type="date" name="to" defaultValue={to} aria-label={L("Gacha", "По")} className="admin-field !h-10 !w-auto" />
          {branchId && <input type="hidden" name="branch" value={branchId} />}
          <button className="btn-primary h-10 px-4 text-sm">{L("Ko'rsatish", "Показать")}</button>
        </form>
      </details>

      {/* Key numbers */}
      <section className="stagger grid grid-cols-2 gap-3 xl:grid-cols-4 lg:gap-4">
        <Stat icon={<IconReceipt size={18} />} tone="info" label={L("Buyurtmalar soni", "Количество заказов")} value={String(m.orders)} hint={`${L("Yetkazish", "Доставка")}: ${m.delivery} · ${L("Olib ketish", "Самовывоз")}: ${m.pickup}`} />
        <Stat icon={<IconWallet size={18} />} tone="ok" label={L("Tushgan pul", "Получено денег")} value={formatUZS(m.revenue)} hint={L("Faqat to'langan buyurtmalar", "Только оплаченные заказы")} />
        <Stat icon={<IconChart size={18} />} tone="warn" label={L("O'rtacha buyurtma", "Средний заказ")} value={formatUZS(m.aov)} hint={L("Bitta buyurtma o'rtacha summasi", "Средняя сумма одного заказа")} />
        <Stat
          icon={<IconRefund size={18} />}
          tone="brand"
          label={L("Qaytarilgan pul", "Возвраты")}
          value={formatUZS(m.refunded)}
          hint={`${L("Bekor qilingan", "Отменено")}: ${m.cancelled}${m.refund_pending ? ` · ${L("Kutilmoqda", "Ожидает")}: ${m.refund_pending}` : ""}`}
        />
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 lg:gap-6">
        <Panel title={L("Har kunlik tushum", "Выручка по дням")} description={L("Har bir ustun — bir kun", "Каждый столбец — один день")}>
          {m.byDay.length === 0 ? (
            <Empty text={L("Bu davrda buyurtmalar bo'lmagan", "За этот период заказов не было")} />
          ) : (
            <ul className="flex h-48 items-end gap-1.5 overflow-x-auto pt-6" aria-label={L("Kunlik tushum", "Выручка по дням")}>
              {m.byDay.map((d) => (
                <li key={d.day} className="group flex h-full min-w-8 flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="text-[10px] font-semibold tabular-nums text-muted opacity-0 transition-opacity group-hover:opacity-100">{d.orders}</span>
                  <span
                    className="w-full max-w-12 origin-bottom rounded-t-lg bg-gradient-to-t from-brand-600 to-brand/80 transition-all duration-200 group-hover:from-brand group-hover:to-brand [animation:grow-y_700ms_var(--ease-out)_both]"
                    style={{ height: `${Math.max(3, Math.round((d.revenue / maxDay) * 100))}%` }}
                    title={`${d.day}: ${formatUZS(d.revenue)} · ${d.orders} ${L("ta buyurtma", "заказов")}`}
                  />
                  <span className="text-[10px] tabular-nums text-muted">{d.day.slice(8)}.{d.day.slice(5, 7)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={L("Eng ko'p sotilgan taomlar", "Самые продаваемые блюда")} description={L("Qaysi taomlarni ko'proq buyurtma qilishadi", "Что заказывают чаще всего")}>
          {m.popular.length === 0 ? (
            <Empty text={L("Hozircha ma'lumot yo'q", "Пока нет данных")} />
          ) : (
            <ol className="space-y-3">
              {m.popular.slice(0, 6).map((p, i) => (
                <li key={i} className="text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">
                      <span className="mr-2 text-muted">{i + 1}.</span>
                      {tr(p.name, lang)}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted">
                      <b className="text-ink">{p.qty}</b> {L("ta", "шт")} · {formatUZS(p.amount)}
                    </span>
                  </div>
                  <span className="mt-1.5 block h-1.5 rounded-full bg-field">
                    <span className="block h-1.5 origin-left rounded-full bg-gradient-to-r from-ok/70 to-ok [animation:grow-x_800ms_var(--ease-out)_both]" style={{ width: `${Math.round((p.qty / maxQty) * 100)}%` }} />
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title={L("Buyurtmalar holati", "Статусы заказов")} description={L("Tanlangan davrdagi buyurtmalar qayerda turibdi", "На каком этапе заказы за период")}>
          {m.byStatus.length === 0 ? (
            <Empty text={L("Buyurtmalar yo'q", "Заказов нет")} />
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {m.byStatus.map((s) => (
                <li key={s.status}>
                  <Link href={`/admin/orders?view=all&status=${s.status}`} className="flex items-center gap-2 rounded-xl bg-field px-3 py-2.5 text-sm transition-colors hover:bg-line">
                    <span className={clsx("size-2 shrink-0 rounded-full", TONE_BG[statusTone(s.status)])} />
                    <span className="min-w-0 flex-1 truncate">{statusLabel(s.status, lang)}</span>
                    <b className="tabular-nums">{s.n}</b>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {m.byBranch.length > 0 && (
          <Panel title={L("Filiallar bo'yicha", "По филиалам")} description={L("Qaysi filial qancha ishladi", "Сколько заработал каждый филиал")}>
            <ul className="divide-y divide-line">
              {m.byBranch.map((b) => (
                <li key={b.branch} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate">{b.branch}</span>
                  <span className="shrink-0 text-right tabular-nums">
                    <b>{formatUZS(b.revenue)}</b>
                    <span className="block text-xs text-muted">
                      {b.orders} {L("ta buyurtma", "заказов")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>

      <details className="rounded-2xl bg-white p-4 text-sm shadow-[var(--shadow-card)]">
        <summary className="flex cursor-pointer items-center font-medium">{L("Bu raqamlar qanday hisoblanadi?", "Как считаются эти цифры?")}</summary>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-muted">
          <li>{L("Tushgan pul — faqat to'langan buyurtmalar summasi, qaytarilgan pul ayirib tashlanadi.", "Получено — сумма только оплаченных заказов за вычетом возвратов.")}</li>
          <li>{L("Buyurtmalar soni — bekor qilinganlarsiz.", "Количество заказов — без отменённых.")}</li>
          <li>{L("Sana — buyurtma berilgan kun (Toshkent vaqti).", "Дата — день оформления заказа (время Ташкента).")}</li>
        </ul>
      </details>
    </div>
  );
}

function ActionCard({ href, icon, value, title, hint, tone, pulse }: { href: string; icon: React.ReactNode; value: number; title: string; hint: string; tone: "neutral" | "brand" | "info" | "warn"; pulse?: boolean }) {
  const tones = { neutral: "bg-field text-ink", brand: "bg-brand text-white", info: "bg-info-50 text-info", warn: "bg-warn-50 text-warn" };
  return (
    <Link href={href} className="lift group flex items-center gap-3 rounded-2xl bg-white p-4 shadow-[var(--shadow-card)]">
      <span className={clsx("relative grid size-12 shrink-0 place-items-center rounded-2xl", tones[tone])}>
        {icon}
        {pulse && <span className="absolute -right-0.5 -top-0.5 size-3 animate-ping rounded-full bg-brand" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums">{value}</span>
          <span className="truncate text-sm font-semibold">{title}</span>
        </span>
        <span className="block truncate text-xs text-muted">{hint}</span>
      </span>
      <IconChevronRight size={18} className="shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl bg-field py-8 text-center text-sm text-muted">{text}</p>;
}
