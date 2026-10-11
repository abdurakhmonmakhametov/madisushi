import { requireStaff } from "@/lib/admin/guard";
import { getL } from "@/lib/admin/l";
import { db } from "@/lib/db";
import { PageHeader, Panel, Pill, Table } from "@/components/admin/server-ui";
import { TelegramLink } from "@/components/admin/TelegramLink";
import { IconBell } from "@/components/ui/icons";

export default async function TelegramAdmin() {
  const me = await requireStaff("orders");
  const { L } = await getL();
  const mine = await db.one<{ username: string | null; first_name: string | null; muted: boolean; blocked: boolean }>(
    "select username, first_name, muted, blocked from public.telegram_chats where staff_id = $1",
    [me.id],
  );
  const isAdmin = me.role === "super_admin";
  const overview = isAdmin
    ? {
        staff: await db.query<{ name: string; role: string; username: string | null; muted: boolean; blocked: boolean }>(
          "select s.name, s.role, c.username, c.muted, c.blocked from public.telegram_chats c join public.staff s on s.id = c.staff_id order by s.role, s.name",
        ),
        stats: (await db.one<{ customers: number; pending: number; failed: number }>(
          `select (select count(*) from public.telegram_chats where customer_id is not null and not blocked)::int as customers,
                  (select count(*) from public.telegram_outbox where sent_at is null and attempts < 5)::int as pending,
                  (select count(*) from public.telegram_outbox where sent_at is null and attempts >= 5)::int as failed`,
        ))!,
      }
    : null;
  const tokenSet = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME);
  const receives: Record<string, string> = {
    super_admin: L(
      "Hamma narsa: har bir yangi buyurtma, har bir holat o'zgarishi, to'lovlar, bekor qilishlar, stol bronlari, mijoz fikrlari va yangi mijozlar — barcha filiallar bo'yicha.",
      "Всё: каждый новый заказ, каждая смена статуса, оплаты, отмены, брони, отзывы и новые клиенты — по всем филиалам.",
    ),
    branch_manager: L(
      "O'z filiallaringiz: yangi buyurtmalar (tugmalar bilan), bekor qilishlar, to'lovlar, stol bronlari va mijoz fikrlari.",
      "Ваши филиалы: новые заказы (с кнопками), отмены, оплаты, брони и отзывы.",
    ),
    kitchen: L("O'z filiallaringizdagi yangi buyurtmalar — tugma bilan keyingi bosqichga o'tkazasiz.", "Новые заказы ваших филиалов — двигаете их дальше кнопкой."),
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={L("Telegram bot", "Telegram-бот")}
        description={L("Buyurtmalarni Telegramda oling va bitta tugma bilan boshqaring.", "Получайте заказы в Telegram и управляйте ими одной кнопкой.")}
        icon={<IconBell size={24} />}
        guide={{
          steps: [
            L("«Telegramni ulash» tugmasini bosing.", "Нажмите «Подключить Telegram»."),
            L("Chiqqan tugma Telegramni ochadi — u yerda «Start» bosing.", "Кнопка откроет Telegram — нажмите там «Start»."),
            L("Tayyor: yangi buyurtmalar shu chatga keladi.", "Готово: новые заказы будут приходить в этот чат."),
          ],
          tip: L("Mijozlar ham botga telefon raqamini yuborib, buyurtma holatini olishlari mumkin.", "Клиенты тоже могут отправить боту номер и получать статус заказа."),
        }}
      />
      {!tokenSet && (
        <Panel title={L("Bot hali sozlanmagan", "Бот ещё не настроен")}>
          <p className="text-sm text-muted">
            {L(
              "@BotFather orqali bot yarating, .env.local ga TELEGRAM_BOT_TOKEN va TELEGRAM_BOT_USERNAME yozing, so'ng serverda «npm run bot» ni ishga tushiring.",
              "Создайте бота через @BotFather, укажите TELEGRAM_BOT_TOKEN и TELEGRAM_BOT_USERNAME в .env.local и запустите «npm run bot» на сервере.",
            )}
          </p>
        </Panel>
      )}
      <Panel title={L("Mening Telegramim", "Мой Telegram")} description={receives[me.role]}>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          {mine ? (
            <>
              <Pill tone="ok">{L("Ulangan", "Подключён")}</Pill>
              <span>{mine.username ? `@${mine.username}` : mine.first_name}</span>
              {mine.muted && <Pill tone="warn">{L("Ovozsiz", "Без звука")}</Pill>}
              {mine.blocked && <Pill tone="brand">{L("Bot bloklangan", "Бот заблокирован")}</Pill>}
            </>
          ) : (
            <Pill>{L("Ulanmagan", "Не подключён")}</Pill>
          )}
        </div>
        {tokenSet && <TelegramLink linked={Boolean(mine)} />}
      </Panel>
      {overview && (
        <Panel title={L("Kim ulangan", "Кто подключён")} description={L(`Botdan foydalanayotgan mijozlar: ${overview.stats.customers}. Navbatdagi xabarlar: ${overview.stats.pending}${overview.stats.failed ? `, yuborilmagan: ${overview.stats.failed}` : ""}.`, `Клиентов в боте: ${overview.stats.customers}. В очереди: ${overview.stats.pending}${overview.stats.failed ? `, не отправлено: ${overview.stats.failed}` : ""}.`)}>
          <Table head={[L("Xodim", "Сотрудник"), L("Rol", "Роль"), "Telegram", L("Holat", "Статус")]} empty={L("Hali hech kim ulanmagan", "Пока никто не подключён")}>
            {overview.staff.map((s, i) => (
              <tr key={i}>
                <td>{s.name}</td>
                <td>{s.role}</td>
                <td>{s.username ? `@${s.username}` : "—"}</td>
                <td>{s.blocked ? <Pill tone="brand">{L("Bloklagan", "Заблокировал")}</Pill> : s.muted ? <Pill tone="warn">{L("Ovozsiz", "Без звука")}</Pill> : <Pill tone="ok">OK</Pill>}</td>
              </tr>
            ))}
          </Table>
        </Panel>
      )}
    </div>
  );
}
