// Telegram bot: role-aware chat handler + outbox notifier.
//
// Roles (resolved per chat on every update, from the database):
//   customer       — linked by sharing their Telegram phone contact. Menu link,
//                    own orders, bonus balance, branches; gets status updates
//                    for their own orders and reservations.
//   kitchen        — staff linked via a one-time link from /admin/telegram. Gets
//                    order cards for their branches and can move orders forward.
//   branch_manager — kitchen + cancel/mark paid, reservations, feedback, stats.
//   super_admin    — everything, for every branch, plus a line for every event
//                    (status changes, payments, new customers...). Chats listed
//                    in TELEGRAM_ADMIN_CHAT_IDS get the same feed (read-only).
//
// All writes go through the same services as the admin panel (transitionOrder,
// setPaymentStatus, setReservationStatus), so RLS and DB triggers still apply.
import { randomBytes } from "node:crypto";
import { db } from "../db";
import { siteUrl } from "../env";
import { translate, type DictKey } from "../i18n/dict";
import { formatUZS } from "../money";
import { CANCEL_REASONS, nextStatuses, staffCanSet, type OrderStatus, type StaffRole } from "../order-status";
import { setPaymentStatus, transitionOrder, type StaffActor } from "../services/orders";
import { setReservationStatus } from "../services/reservations";
import { formatDateTime } from "../time";
import { esc, tg, TelegramError, type InlineButton, type InlineKeyboard, type TgMessage, type TgUpdate, type TgUser } from "./api";

type Lang = "uz" | "ru";
type I18n = { uz?: string; ru?: string } | null;
type ChatRow = { chat_id: number; customer_id: string | null; staff_id: string | null; lang: Lang; muted: boolean };
type Staff = StaffActor & { name: string };
/** A notification recipient. `staff` is null for read-only env admin chats. */
type Recipient = { chatId: number; lang: Lang; role: StaffRole; staff: Staff | null };

const L = (lang: Lang, uz: string, ru: string) => (lang === "ru" ? ru : uz);
const pick = (j: I18n, lang: Lang) => (j?.[lang] || j?.uz || "").trim();
const statusLabel = (s: string, lang: Lang) => translate(lang, `status.${s}` as DictKey);
const payLabel = (s: string, lang: Lang) => translate(lang, `pay.status.${s}` as DictKey);
const reasonLabel = (s: string, lang: Lang) => translate(lang, `reason.${s}` as DictKey);
const METHODS: Record<string, [string, string]> = {
  cash: ["Naqd pul", "Наличные"],
  card_on_delivery: ["Karta (kuryerga)", "Карта курьеру"],
  click: ["Click", "Click"],
  payme: ["Payme", "Payme"],
  mock: ["Test to'lovi", "Тестовая оплата"],
};
const methodLabel = (m: string, lang: Lang) => (METHODS[m] ? L(lang, ...METHODS[m]) : m);
const ROLE_LABEL: Record<StaffRole, [string, string]> = {
  super_admin: ["Bosh administrator", "Главный администратор"],
  branch_manager: ["Filial menejeri", "Менеджер филиала"],
  kitchen: ["Oshxona / operator", "Кухня / оператор"],
};
const STATUS_ICON: Record<string, string> = {
  new: "🆕", confirmed: "✅", preparing: "👨‍🍳", ready: "📦", out_for_delivery: "🛵", delivered: "🎉", picked_up: "🎉", cancelled: "❌",
};
const RES_STATUS: Record<string, [string, string]> = {
  pending: ["Kutilmoqda", "Ожидает"],
  confirmed: ["Tasdiqlandi", "Подтверждена"],
  rejected: ["Rad etildi", "Отклонена"],
  cancelled: ["Bekor qilindi", "Отменена"],
  seated: ["Mehmon keldi", "Гость пришёл"],
  no_show: ["Kelmadi", "Не пришёл"],
};
const resLabel = (s: string, lang: Lang) => (RES_STATUS[s] ? L(lang, ...RES_STATUS[s]) : s);

/** Telegram refuses http/localhost URLs in buttons, so links are only attached for a public https site. */
function publicUrl(path = ""): string | null {
  const base = siteUrl();
  return base.startsWith("https://") ? base + path : null;
}

/** Mini App launch URL: `?tg=1` tells the page it runs inside Telegram. */
export function webAppUrl(path = "/"): string | null {
  return publicUrl(`${path}${path.includes("?") ? "&" : "?"}tg=1`);
}

/**
 * Button that opens `path` as a Mini App in private chats. web_app buttons are
 * rejected in groups, so read-only feed chats (no linked staff) get a plain link.
 */
function openButton(text: string, path: string, privateChat: boolean): InlineButton | null {
  const url = webAppUrl(path);
  if (!url) return null;
  return privateChat ? { text, web_app: { url } } : { text, url: publicUrl(path)! };
}

/** Read-only admin feed chats: TELEGRAM_ADMIN_CHAT_IDS plus Settings → Notifications → "Telegram chat id". */
async function adminFeedChats(): Promise<number[]> {
  const row = await db.one<{ v: string | null }>("select value->>'telegram_chat_id' as v from public.settings where key = 'notifications'");
  return `${process.env.TELEGRAM_ADMIN_CHAT_IDS ?? ""},${row?.v ?? ""}`
    .split(/[,\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isSafeInteger(n) && n !== 0);
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
  try {
    return await tg<T>(method, body);
  } catch (e) {
    if (e instanceof TelegramError && e.code === 429 && e.retryAfter) {
      await sleep(e.retryAfter * 1000);
      return tg<T>(method, body);
    }
    throw e;
  }
}

async function onError(chatId: number, e: unknown) {
  if (e instanceof TelegramError) {
    if (/message is not modified/i.test(e.description)) return;
    if (e.chatGone) {
      await db.query("update public.telegram_chats set blocked = true, updated_at = now() where chat_id = $1", [chatId]);
      return;
    }
  }
  console.warn("[telegram]", chatId, e instanceof Error ? e.message : e);
}

type SendExtra = { keyboard?: InlineKeyboard; reply?: unknown; silent?: boolean; replyTo?: number };

async function send(chatId: number, text: string, x: SendExtra = {}): Promise<number | null> {
  try {
    const m = await call<TgMessage>("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      disable_notification: x.silent || undefined,
      reply_markup: x.keyboard ? { inline_keyboard: x.keyboard } : x.reply,
      reply_parameters: x.replyTo ? { message_id: x.replyTo, allow_sending_without_reply: true } : undefined,
    });
    return m.message_id;
  } catch (e) {
    await onError(chatId, e);
    return null;
  }
}

async function edit(chatId: number, messageId: number, text: string, keyboard?: InlineKeyboard) {
  try {
    await call("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: keyboard ?? [] },
    });
  } catch (e) {
    await onError(chatId, e);
  }
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function loadStaff(id: string | null): Promise<Staff | null> {
  if (!id) return null;
  return db.one<Staff>(
    `select s.id, s.name, s.role,
            coalesce((select array_agg(sb.branch_id::text) from public.staff_branches sb where sb.staff_id = s.id), '{}'::text[]) as "branchIds"
       from public.staff s where s.id = $1 and s.is_active`,
    [id],
  );
}

/** Staff chats that should hear about `branchId` (super admins hear everything), plus env admin chats. */
async function staffRecipients(branchId: string | null, roles: StaffRole[]): Promise<Recipient[]> {
  const rows = await db.query<{ chat_id: number; lang: Lang; staff_id: string }>(
    `select c.chat_id, c.lang, s.id as staff_id
       from public.telegram_chats c join public.staff s on s.id = c.staff_id
      where s.is_active and not c.blocked and not c.muted and s.role = any($2::text[])
        and (s.role = 'super_admin' or ($1::uuid is not null and exists (
              select 1 from public.staff_branches sb where sb.staff_id = s.id and sb.branch_id = $1)))`,
    [branchId, roles],
  );
  const out: Recipient[] = [];
  for (const r of rows) {
    const staff = await loadStaff(r.staff_id);
    if (staff) out.push({ chatId: Number(r.chat_id), lang: r.lang, role: staff.role, staff });
  }
  if (roles.includes("super_admin")) {
    for (const chatId of await adminFeedChats()) {
      if (!out.some((r) => r.chatId === chatId)) out.push({ chatId, lang: "uz", role: "super_admin", staff: null });
    }
  }
  return out;
}

async function customerChats(customerId: string | null, phone?: string | null): Promise<{ chatId: number; lang: Lang }[]> {
  if (!customerId && !phone) return [];
  const rows = await db.query<{ chat_id: number; lang: Lang }>(
    `select c.chat_id, c.lang from public.telegram_chats c join public.customers cu on cu.id = c.customer_id
      where not c.blocked and not c.muted and (cu.id = $1 or cu.phone = $2)`,
    [customerId, phone ?? null],
  );
  return rows.map((r) => ({ chatId: Number(r.chat_id), lang: r.lang }));
}

type OrderCard = {
  id: string;
  number: number;
  status: OrderStatus;
  fulfillment: "delivery" | "pickup";
  payment_method: string;
  payment_status: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  recipient_name: string | null;
  recipient_phone: string | null;
  address: { text?: string; house?: string; apartment?: string; floor?: string; entrance?: string; instructions?: string } | null;
  asap: boolean;
  scheduled_for: string | null;
  promised_at: string;
  comment: string | null;
  total: number;
  delivery_fee: number;
  discount_total: number;
  cancel_reason: string | null;
  branch_id: string;
  branch_name: I18n;
  branch_phone: string | null;
  created_at: string;
  items: { name: I18n; qty: number; total: number; kind: string }[];
};

async function loadOrder(id: string): Promise<OrderCard | null> {
  return db.one<OrderCard>(
    `select o.id, o.number, o.status, o.fulfillment, o.payment_method, o.payment_status, o.customer_id, o.customer_name, o.customer_phone,
            o.recipient_name, o.recipient_phone, o.address, o.asap, o.scheduled_for, o.promised_at, o.comment, o.total, o.delivery_fee,
            o.discount_total, o.cancel_reason, o.branch_id, br.name as branch_name, br.phone as branch_phone, o.created_at,
            coalesce((select json_agg(json_build_object('name', i.name_snapshot, 'qty', i.quantity, 'total', i.line_total, 'kind', i.kind) order by i.sort)
                        from public.order_items i where i.order_id = o.id), '[]') as items
       from public.orders o join public.branches br on br.id = o.branch_id where o.id = $1`,
    [id],
  );
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function orderText(o: OrderCard, lang: Lang): string {
  const lines = [
    `${STATUS_ICON[o.status] ?? "•"} <b>${L(lang, "Buyurtma", "Заказ")} #${o.number}</b> · ${esc(statusLabel(o.status, lang))}`,
    `🏪 ${esc(pick(o.branch_name, lang))} · ${o.fulfillment === "delivery" ? L(lang, "🚚 Yetkazish", "🚚 Доставка") : L(lang, "🛍 Olib ketish", "🛍 Самовывоз")}`,
    `👤 ${esc(o.customer_name)} · ${esc(o.customer_phone)}`,
  ];
  if (o.recipient_name) lines.push(`🎁 ${L(lang, "Oluvchi", "Получатель")}: ${esc(o.recipient_name)} · ${esc(o.recipient_phone)}`);
  if (o.address?.text) {
    const a = o.address;
    const extra = [a.house && `${L(lang, "uy", "дом")} ${a.house}`, a.apartment && `${L(lang, "xonadon", "кв.")} ${a.apartment}`, a.entrance && `${L(lang, "podyezd", "подъезд")} ${a.entrance}`, a.floor && `${L(lang, "qavat", "этаж")} ${a.floor}`]
      .filter(Boolean)
      .join(", ");
    lines.push(`📍 ${esc(a.text)}${extra ? `, ${esc(extra)}` : ""}`);
    if (a.instructions) lines.push(`   ↳ ${esc(a.instructions)}`);
  }
  lines.push(`🕒 ${o.asap ? L(lang, "Tezroq", "Как можно скорее") : L(lang, "Belgilangan vaqt", "Ко времени")}: ${esc(formatDateTime(o.scheduled_for ?? o.promised_at, lang))}`);
  lines.push("");
  for (const i of o.items.filter((i) => i.kind === "dish")) lines.push(`${i.qty} × ${esc(pick(i.name, lang))} — ${formatUZS(i.total)}`);
  const extras = o.items.filter((i) => i.kind !== "dish" && i.total > 0);
  for (const i of extras) lines.push(`<i>${i.qty} × ${esc(pick(i.name, lang))} — ${formatUZS(i.total)}</i>`);
  if (o.delivery_fee) lines.push(`<i>${L(lang, "Yetkazish", "Доставка")} — ${formatUZS(o.delivery_fee)}</i>`);
  if (o.discount_total) lines.push(`<i>${L(lang, "Chegirma", "Скидка")} — −${formatUZS(o.discount_total)}</i>`);
  lines.push(`💰 <b>${formatUZS(o.total)}</b> · ${esc(methodLabel(o.payment_method, lang))} · ${esc(payLabel(o.payment_status, lang))}`);
  if (o.comment) lines.push(`💬 ${esc(o.comment)}`);
  if (o.status === "cancelled" && o.cancel_reason) lines.push(`❌ ${esc(reasonLabel(o.cancel_reason, lang))}`);
  return lines.join("\n");
}

function orderButtons(o: OrderCard, r: { lang: Lang; role: StaffRole; staff: Staff | null }): InlineKeyboard {
  const kb: InlineKeyboard = [];
  if (r.staff) {
    const forward = nextStatuses(o.fulfillment, o.status).filter((s) => s !== "cancelled" && staffCanSet(r.role, s));
    if (forward.length) kb.push(forward.map((s) => ({ text: `▶️ ${statusLabel(s, r.lang)}`, callback_data: `o:${o.id}:${s}` })));
    const row = [];
    if (r.role !== "kitchen" && ["cash", "card_on_delivery"].includes(o.payment_method) && o.payment_status === "unpaid" && o.status !== "cancelled")
      row.push({ text: L(r.lang, "💵 To'landi", "💵 Оплачено"), callback_data: `op:${o.id}` });
    if (r.role !== "kitchen" && nextStatuses(o.fulfillment, o.status).includes("cancelled"))
      row.push({ text: L(r.lang, "❌ Bekor qilish", "❌ Отменить"), callback_data: `oc:${o.id}` });
    if (row.length) kb.push(row);
  }
  const open = openButton(L(r.lang, "🖥 Panelda ochish", "🖥 Открыть в панели"), `/admin/orders/${o.id}`, Boolean(r.staff));
  if (open) kb.push([open]);
  return kb;
}

function cancelButtons(o: OrderCard, lang: Lang): InlineKeyboard {
  const kb: InlineKeyboard = CANCEL_REASONS.map((reason, i) => [{ text: reasonLabel(reason, lang), callback_data: `ox:${o.id}:${i}` }]);
  kb.push([{ text: L(lang, "↩️ Orqaga", "↩️ Назад"), callback_data: `ob:${o.id}` }]);
  return kb;
}

async function postOrderCard(o: OrderCard, r: Recipient, silent = false) {
  const mid = await send(r.chatId, orderText(o, r.lang), { keyboard: orderButtons(o, r), silent });
  if (mid)
    await db.query(
      "insert into public.telegram_order_messages (order_id, chat_id, message_id) values ($1, $2, $3) on conflict (order_id, chat_id) do update set message_id = excluded.message_id",
      [o.id, r.chatId, mid],
    );
}

/** Re-renders every card already posted for this order. Returns message ids by chat. */
async function refreshOrderCards(o: OrderCard): Promise<Map<number, number>> {
  const rows = await db.query<{ chat_id: number; message_id: number; lang: Lang; staff_id: string | null }>(
    `select m.chat_id, m.message_id, coalesce(c.lang, 'uz') as lang, c.staff_id from public.telegram_order_messages m
       left join public.telegram_chats c on c.chat_id = m.chat_id where m.order_id = $1 and not coalesce(c.blocked, false)`,
    [o.id],
  );
  const out = new Map<number, number>();
  for (const row of rows) {
    const staff = await loadStaff(row.staff_id);
    const chatId = Number(row.chat_id);
    const r = { lang: row.lang, role: staff?.role ?? ("super_admin" as StaffRole), staff };
    await edit(chatId, Number(row.message_id), orderText(o, r.lang), orderButtons(o, r));
    out.set(chatId, Number(row.message_id));
  }
  return out;
}

const CUSTOMER_STATUS: Record<string, [string, string]> = {
  confirmed: ["Buyurtmangiz tasdiqlandi ✅", "Ваш заказ подтверждён ✅"],
  preparing: ["Oshpazlar tayyorlashni boshladi 👨‍🍳", "Повара начали готовить 👨‍🍳"],
  ready_delivery: ["Buyurtmangiz tayyor, tez orada kuryerga beriladi 📦", "Заказ готов и скоро будет передан курьеру 📦"],
  ready_pickup: ["Buyurtmangiz tayyor — olib ketishingiz mumkin 🛍", "Заказ готов — можно забирать 🛍"],
  out_for_delivery: ["Kuryer yo'lda 🛵", "Курьер в пути 🛵"],
  delivered: ["Yetkazildi. Yoqimli ishtaha! 🍣", "Доставлено. Приятного аппетита! 🍣"],
  picked_up: ["Buyurtma topshirildi. Yoqimli ishtaha! 🍣", "Заказ выдан. Приятного аппетита! 🍣"],
  cancelled: ["Buyurtmangiz bekor qilindi ❌", "Ваш заказ отменён ❌"],
};

function customerOrderButtons(o: OrderCard, lang: Lang): InlineKeyboard | undefined {
  const open = openButton(L(lang, "📦 Buyurtmani ko'rish", "📦 Открыть заказ"), `/orders/${o.id}`, true);
  return open ? [[open]] : undefined;
}

// ---------------------------------------------------------------------------
// Outbox events
// ---------------------------------------------------------------------------

type OutboxRow = { id: number; event: string; entity_id: string | null; data: Record<string, unknown>; created_at: string };
type Actor = { kind?: string; id?: string | null };

async function actorName(a: Actor | undefined, lang: Lang): Promise<string> {
  if (!a?.kind || a.kind === "system") return L(lang, "tizim", "система");
  if (a.kind === "customer") return L(lang, "mijoz", "клиент");
  const s = a.id ? await db.one<{ name: string }>("select name from public.staff where id = $1", [a.id]) : null;
  return s?.name ?? L(lang, "xodim", "сотрудник");
}

async function onOrderCreated(id: string) {
  const o = await loadOrder(id);
  if (!o) return;
  for (const r of await staffRecipients(o.branch_id, ["super_admin", "branch_manager", "kitchen"])) await postOrderCard(o, r);
  for (const c of await customerChats(o.customer_id)) {
    await send(
      c.chatId,
      `🧾 <b>${L(c.lang, "Buyurtmangiz qabul qilindi", "Ваш заказ принят")} #${o.number}</b>\n${L(c.lang, "Jami", "Итого")}: ${formatUZS(o.total)}\n${L(c.lang, "Holatini shu yerda xabar qilamiz.", "Будем сообщать статус здесь.")}`,
      { keyboard: customerOrderButtons(o, c.lang) },
    );
  }
}

async function onOrderStatus(id: string, data: { from?: string; to?: string; actor?: Actor }) {
  const o = await loadOrder(id);
  if (!o) return;
  const cards = await refreshOrderCards(o);
  const to = String(data.to ?? o.status);
  // Admins hear every step; managers only cancellations. Replies are threaded under the card.
  const recipients = await staffRecipients(o.branch_id, ["super_admin", "branch_manager"]);
  for (const r of recipients) {
    if (r.role !== "super_admin" && to !== "cancelled") continue;
    const who = await actorName(data.actor, r.lang);
    const text = `${STATUS_ICON[to] ?? "•"} #${o.number}: ${esc(statusLabel(String(data.from ?? ""), r.lang))} → <b>${esc(statusLabel(to, r.lang))}</b> · ${esc(who)}${to === "cancelled" && o.cancel_reason ? `\n❌ ${esc(reasonLabel(o.cancel_reason, r.lang))}` : ""}`;
    await send(r.chatId, text, { replyTo: cards.get(r.chatId), silent: to !== "cancelled" });
  }
  for (const c of await customerChats(o.customer_id)) {
    const key = to === "ready" ? `ready_${o.fulfillment}` : to;
    const line = CUSTOMER_STATUS[key];
    if (!line) continue;
    let text = `${STATUS_ICON[to] ?? "•"} <b>#${o.number}</b> — ${L(c.lang, ...line)}`;
    if (to === "cancelled" && o.cancel_reason) text += `\n${L(c.lang, "Sabab", "Причина")}: ${esc(reasonLabel(o.cancel_reason, c.lang))}`;
    if (to === "cancelled" && o.branch_phone) text += `\n☎️ ${esc(o.branch_phone)}`;
    await send(c.chatId, text, { keyboard: customerOrderButtons(o, c.lang) });
  }
}

async function onOrderPayment(id: string, data: { from?: string; to?: string }) {
  const o = await loadOrder(id);
  if (!o) return;
  const cards = await refreshOrderCards(o);
  const to = String(data.to ?? "");
  if (!["paid", "failed", "refund_pending", "refunded"].includes(to)) return;
  const icon = to === "paid" ? "💰" : to === "failed" ? "⚠️" : "↩️";
  for (const r of await staffRecipients(o.branch_id, ["super_admin", "branch_manager"])) {
    await send(r.chatId, `${icon} #${o.number}: ${esc(payLabel(to, r.lang))} · ${formatUZS(o.total)} · ${esc(methodLabel(o.payment_method, r.lang))}`, {
      replyTo: cards.get(r.chatId),
      silent: to === "paid",
    });
  }
  if (to === "paid" || to === "refunded") {
    for (const c of await customerChats(o.customer_id)) {
      await send(c.chatId, `${icon} #${o.number}: ${esc(payLabel(to, c.lang))} · ${formatUZS(o.total)}`);
    }
  }
}

type ResRow = { id: string; number: number; status: string; name: string; phone: string; starts_at: string; party_size: number; notes: string | null; staff_note: string | null; branch_id: string; branch_name: I18n; customer_id: string | null };

async function loadReservation(id: string) {
  return db.one<ResRow>(
    `select r.id, r.number, r.status, r.name, r.phone, r.starts_at, r.party_size, r.notes, r.staff_note, r.branch_id, br.name as branch_name, r.customer_id
       from public.reservations r join public.branches br on br.id = r.branch_id where r.id = $1`,
    [id],
  );
}

function reservationText(r: ResRow, lang: Lang) {
  return [
    `📅 <b>${L(lang, "Stol broni", "Бронь стола")} #${r.number}</b> · ${esc(resLabel(r.status, lang))}`,
    `🏪 ${esc(pick(r.branch_name, lang))}`,
    `🕒 ${esc(formatDateTime(r.starts_at, lang))} · 👥 ${r.party_size}`,
    `👤 ${esc(r.name)} · ${esc(r.phone)}`,
    r.notes ? `💬 ${esc(r.notes)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function reservationButtons(r: ResRow, rc: { lang: Lang; staff: Staff | null; role: StaffRole }): InlineKeyboard {
  if (!rc.staff || rc.role === "kitchen") return [];
  if (r.status === "pending")
    return [[
      { text: L(rc.lang, "✅ Tasdiqlash", "✅ Подтвердить"), callback_data: `r:${r.id}:confirmed` },
      { text: L(rc.lang, "✖️ Rad etish", "✖️ Отклонить"), callback_data: `r:${r.id}:rejected` },
    ]];
  if (r.status === "confirmed")
    return [[
      { text: L(rc.lang, "🪑 Keldi", "🪑 Пришёл"), callback_data: `r:${r.id}:seated` },
      { text: L(rc.lang, "🚫 Kelmadi", "🚫 Не пришёл"), callback_data: `r:${r.id}:no_show` },
    ]];
  return [];
}

async function onReservationCreated(id: string) {
  const r = await loadReservation(id);
  if (!r) return;
  for (const rc of await staffRecipients(r.branch_id, ["super_admin", "branch_manager"]))
    await send(rc.chatId, reservationText(r, rc.lang), { keyboard: reservationButtons(r, rc) });
  for (const c of await customerChats(r.customer_id, r.phone))
    await send(c.chatId, `📅 ${L(c.lang, "Bron so'rovingiz qabul qilindi", "Заявка на бронь принята")} #${r.number}\n${esc(formatDateTime(r.starts_at, c.lang))} · 👥 ${r.party_size}\n${L(c.lang, "Tasdiqlanganda xabar beramiz.", "Сообщим, когда подтвердим.")}`);
}

async function onReservationStatus(id: string, data: { to?: string; actor?: Actor }) {
  const r = await loadReservation(id);
  if (!r) return;
  const to = String(data.to ?? r.status);
  for (const rc of await staffRecipients(r.branch_id, ["super_admin"])) {
    const who = await actorName(data.actor, rc.lang);
    await send(rc.chatId, `📅 ${L(rc.lang, "Bron", "Бронь")} #${r.number}: <b>${esc(resLabel(to, rc.lang))}</b> · ${esc(who)}`, { silent: true });
  }
  if (["confirmed", "rejected", "cancelled"].includes(to)) {
    for (const c of await customerChats(r.customer_id, r.phone)) {
      let text = `📅 ${L(c.lang, "Bron", "Бронь")} #${r.number} (${esc(formatDateTime(r.starts_at, c.lang))}): <b>${esc(resLabel(to, c.lang))}</b>`;
      if (r.staff_note) text += `\n💬 ${esc(r.staff_note)}`;
      await send(c.chatId, text);
    }
  }
}

async function onFeedback(id: string) {
  const f = await db.one<{ name: string; phone: string | null; rating: number | null; message: string; branch_id: string | null; branch_name: I18n }>(
    "select f.name, f.phone, f.rating, f.message, f.branch_id, br.name as branch_name from public.feedback f left join public.branches br on br.id = f.branch_id where f.id = $1",
    [id],
  );
  if (!f) return;
  for (const rc of await staffRecipients(f.branch_id, ["super_admin", "branch_manager"])) {
    const lines = [
      `💬 <b>${L(rc.lang, "Yangi fikr", "Новый отзыв")}</b>${f.rating ? ` · ${"⭐".repeat(f.rating)}` : ""}`,
      f.branch_name ? `🏪 ${esc(pick(f.branch_name, rc.lang))}` : "",
      `👤 ${esc(f.name)}${f.phone ? ` · ${esc(f.phone)}` : ""}`,
      "",
      esc(f.message),
    ];
    const open = openButton(L(rc.lang, "🖥 Panelda ochish", "🖥 Открыть в панели"), "/admin/feedback", Boolean(rc.staff));
    await send(rc.chatId, lines.filter((l, i) => l || i === 3).join("\n"), { keyboard: open ? [[open]] : undefined });
  }
}

async function onCustomer(id: string) {
  const c = await db.one<{ phone: string; name: string | null }>("select phone, name from public.customers where id = $1", [id]);
  if (!c) return;
  for (const rc of await staffRecipients(null, ["super_admin"]))
    await send(rc.chatId, `👋 ${L(rc.lang, "Yangi mijoz", "Новый клиент")}: ${esc(c.name ?? "—")} · ${esc(c.phone)}`, { silent: true });
}

async function handleEvent(row: OutboxRow) {
  const id = row.entity_id;
  if (!id) return;
  const data = (row.data ?? {}) as Record<string, never>;
  switch (row.event) {
    case "order.created": return onOrderCreated(id);
    case "order.status": return onOrderStatus(id, data);
    case "order.payment": return onOrderPayment(id, data);
    case "reservation.created": return onReservationCreated(id);
    case "reservation.status": return onReservationStatus(id, data);
    case "feedback.created": return onFeedback(id);
    case "customer.created": return onCustomer(id);
  }
}

const MAX_EVENT_AGE_MS = 6 * 3600_000;

/** Sends pending outbox events in order. Returns how many were processed. */
export async function drainOutbox(limit = 50): Promise<number> {
  const rows = await db.query<OutboxRow>(
    "select id, event, entity_id, data, created_at from public.telegram_outbox where sent_at is null and attempts < 5 order by id limit $1",
    [limit],
  );
  for (const row of rows) {
    try {
      // After long downtime, don't flood chats with stale events.
      if (Date.now() - new Date(row.created_at).getTime() < MAX_EVENT_AGE_MS) await handleEvent(row);
      await db.query("update public.telegram_outbox set sent_at = now(), attempts = attempts + 1 where id = $1", [row.id]);
    } catch (e) {
      console.error("[telegram] event", row.id, row.event, e);
      await db.query("update public.telegram_outbox set attempts = attempts + 1, last_error = $2 where id = $1", [row.id, String(e).slice(0, 500)]);
    }
  }
  return rows.length;
}

// ---------------------------------------------------------------------------
// Chat handler
// ---------------------------------------------------------------------------

const BTN = {
  menu: ["🍣 Menyu", "🍣 Меню"],
  myOrders: ["📦 Buyurtmalarim", "📦 Мои заказы"],
  bonus: ["🎁 Bonuslarim", "🎁 Мои бонусы"],
  branches: ["📍 Filiallar", "📍 Филиалы"],
  contact: ["☎️ Aloqa", "☎️ Контакты"],
  lang: ["🌐 Русский", "🌐 O'zbekcha"],
  share: ["📱 Telefon raqamni yuborish", "📱 Отправить номер"],
  active: ["🔥 Faol buyurtmalar", "🔥 Активные заказы"],
  today: ["📊 Bugun", "📊 Сегодня"],
  reservations: ["📅 Bronlar", "📅 Брони"],
  mute: ["🔕 Ovozsiz", "🔕 Без звука"],
  unmute: ["🔔 Bildirishnomalar yoqish", "🔔 Включить уведомления"],
  me: ["👤 Men", "👤 Я"],
  panel: ["🖥 Admin panel", "🖥 Админ-панель"],
} as const;
type BtnKey = keyof typeof BTN;
type KeyButton = { text: string; request_contact?: boolean; web_app?: { url: string } };
const b = (k: BtnKey, lang: Lang, webAppPath?: string): KeyButton => {
  const url = webAppPath ? webAppUrl(webAppPath) : null;
  return url ? { text: L(lang, BTN[k][0], BTN[k][1]), web_app: { url } } : { text: L(lang, BTN[k][0], BTN[k][1]) };
};
const matchBtn = (text: string): BtnKey | null => (Object.keys(BTN) as BtnKey[]).find((k) => (BTN[k] as readonly string[]).includes(text)) ?? null;

function mainKeyboard(chat: ChatRow, staff: Staff | null) {
  const lang = chat.lang;
  const rows: KeyButton[][] = [];
  if (staff) {
    if (webAppUrl()) rows.push([b("panel", lang, staff.role === "kitchen" ? "/admin/orders" : "/admin")]);
    rows.push([b("active", lang), ...(staff.role !== "kitchen" ? [b("today", lang)] : [])]);
    if (staff.role !== "kitchen") rows.push([b("reservations", lang), b(chat.muted ? "unmute" : "mute", lang)]);
    else rows.push([b(chat.muted ? "unmute" : "mute", lang)]);
  }
  if (!chat.customer_id && !staff) rows.push([{ ...b("share", lang), request_contact: true }]);
  rows.push([b("menu", lang, "/"), b("myOrders", lang)]);
  rows.push([b("bonus", lang), b("branches", lang)]);
  rows.push([b("contact", lang), b("lang", lang), ...(staff ? [b("me", lang)] : [])]);
  return { keyboard: rows, resize_keyboard: true, is_persistent: true };
}

async function upsertChat(chatId: number, from: TgUser | undefined): Promise<ChatRow> {
  const lang: Lang = from?.language_code === "ru" ? "ru" : "uz";
  return (await db.one<ChatRow>(
    `insert into public.telegram_chats (chat_id, username, first_name, lang) values ($1, $2, $3, $4)
     on conflict (chat_id) do update set username = excluded.username, first_name = excluded.first_name, blocked = false, updated_at = now()
     returning chat_id, customer_id, staff_id, lang, muted`,
    [chatId, from?.username ?? null, from?.first_name ?? null, lang],
  ))!;
}

async function greet(chat: ChatRow, staff: Staff | null) {
  const lang = chat.lang;
  let text: string;
  if (staff) text = `👋 ${esc(staff.name)}\n${L(lang, "Rol", "Роль")}: <b>${esc(L(lang, ...ROLE_LABEL[staff.role]))}</b>\n\n${L(lang, "Yangi buyurtmalar va o'zgarishlar shu yerga keladi. Kartadagi tugmalar orqali buyurtmani keyingi bosqichga o'tkazing.", "Новые заказы и изменения будут приходить сюда. Двигайте заказ дальше кнопками на карточке.")}`;
  else if (chat.customer_id) text = L(lang, "🍣 Sushi Madi botiga xush kelibsiz!\nBuyurtmalaringiz holati haqida shu yerda xabar beramiz.", "🍣 Добро пожаловать в бот Sushi Madi!\nЗдесь мы будем сообщать статус ваших заказов.");
  else text = L(lang, "🍣 Sushi Madi botiga xush kelibsiz!\n\nBuyurtmalaringiz holatini shu yerda olish uchun pastdagi tugma orqali telefon raqamingizni yuboring (saytda kiritgan raqam).", "🍣 Добро пожаловать в бот Sushi Madi!\n\nЧтобы получать статус заказов здесь, отправьте номер телефона кнопкой ниже (тот же, что на сайте).");
  await send(chat.chat_id, text, { reply: mainKeyboard(chat, staff) });
  // A message can carry either the reply keyboard or inline buttons, so the
  // big "open the menu" Mini App button comes as a second message.
  const menu = openButton(L(lang, "🍣 Menyuni ochish", "🍣 Открыть меню"), "/", true);
  if (!menu) return;
  const kb: InlineKeyboard = [[menu]];
  const panel = staff && openButton(L(lang, "🖥 Admin panel", "🖥 Админ-панель"), staff.role === "kitchen" ? "/admin/orders" : "/admin", true);
  if (panel) kb.push([panel]);
  await send(chat.chat_id, L(lang, "👇 Menyuni oching, taom tanlang va shu yerning o'zida buyurtma bering:", "👇 Откройте меню, выберите блюда и закажите прямо здесь:"), { keyboard: kb });
}

/** The chat's menu button opens the admin panel for staff (the default one opens the storefront). */
async function setStaffMenuButton(chatId: number, staff: Staff, lang: Lang) {
  const url = webAppUrl(staff.role === "kitchen" ? "/admin/orders" : "/admin");
  if (!url) return;
  await call("setChatMenuButton", { chat_id: chatId, menu_button: { type: "web_app", text: L(lang, "Panel", "Панель"), web_app: { url } } }).catch((e) => onError(chatId, e));
}

/** Default menu button for every chat: the storefront Mini App. Called by the worker on start. */
export async function setDefaultMenuButton() {
  const url = webAppUrl("/");
  if (!url) return false;
  await call("setChatMenuButton", { menu_button: { type: "web_app", text: "🍣 Menyu", web_app: { url } } });
  return true;
}

async function linkStaff(chat: ChatRow, token: string, from: TgUser | undefined) {
  const row = await db.one<{ staff_id: string }>(
    `update public.telegram_link_tokens set used_at = now()
      where token = $1 and used_at is null and expires_at > now() returning staff_id`,
    [token],
  );
  const staff = row ? await loadStaff(row.staff_id) : null;
  if (!staff) return send(chat.chat_id, L(chat.lang, "⚠️ Havola eskirgan yoki ishlatilgan. Admin paneldagi «Telegram» sahifasidan yangisini oling.", "⚠️ Ссылка устарела или уже использована. Получите новую на странице «Telegram» в админ-панели."));
  // One chat per staff member: re-linking moves notifications to this chat.
  await db.query("update public.telegram_chats set staff_id = null where staff_id = $1 and chat_id <> $2", [staff.id, chat.chat_id]);
  await db.query("update public.telegram_chats set staff_id = $2, muted = false, updated_at = now() where chat_id = $1", [chat.chat_id, staff.id]);
  await db.query(
    "insert into public.audit_logs (actor_kind, actor_id, action, entity, entity_id, data) values ('staff', $1::uuid, 'telegram.link', 'staff', $1::text, $2)",
    [staff.id, JSON.stringify({ chat_id: chat.chat_id, username: from?.username ?? null })],
  );
  chat.staff_id = staff.id;
  chat.muted = false;
  await setStaffMenuButton(chat.chat_id, staff, chat.lang);
  await greet(chat, staff);
}

async function linkCustomer(chat: ChatRow, msg: TgMessage) {
  const contact = msg.contact!;
  const lang = chat.lang;
  if (contact.user_id !== msg.from?.id) return send(chat.chat_id, L(lang, "Iltimos, o'zingizning raqamingizni tugma orqali yuboring.", "Пожалуйста, отправьте свой номер кнопкой."));
  const { normalizePhone } = await import("../auth/otp");
  const phone = normalizePhone(contact.phone_number);
  if (!phone) return send(chat.chat_id, L(lang, "Faqat O'zbekiston raqamlari (+998) qabul qilinadi.", "Принимаются только номера Узбекистана (+998)."));
  const name = (contact.first_name || msg.from?.first_name || "").trim().slice(0, 80) || null;
  await db.query("insert into public.customers (phone, name, preferred_lang) values ($1, $2, $3) on conflict (phone) do nothing", [phone, name, lang]);
  const cu = await db.one<{ id: string; is_blocked: boolean }>("select id, is_blocked from public.customers where phone = $1", [phone]);
  if (!cu || cu.is_blocked) return send(chat.chat_id, L(lang, "Bu raqam bilan xizmat ko'rsatib bo'lmaydi. Filialga qo'ng'iroq qiling.", "Обслуживание по этому номеру недоступно. Позвоните в филиал."));
  await db.query("update public.telegram_chats set customer_id = $2, updated_at = now() where chat_id = $1", [chat.chat_id, cu.id]);
  chat.customer_id = cu.id;
  await send(chat.chat_id, `✅ ${L(lang, "Raqamingiz ulandi", "Номер подключён")}: ${esc(phone)}\n${L(lang, "Endi buyurtmalaringiz holati va saytga kirish kodlari shu yerga keladi.", "Теперь статус заказов и коды для входа на сайт будут приходить сюда.")}`, {
    reply: mainKeyboard(chat, await loadStaff(chat.staff_id)),
  });
}

async function sendMenuLink(chat: ChatRow) {
  const url = webAppUrl("/");
  const lang = chat.lang;
  if (url) await send(chat.chat_id, L(lang, "🍣 Menyuni ochib, buyurtma bering:", "🍣 Откройте меню и оформите заказ:"), { keyboard: [[{ text: L(lang, "🍣 Menyuni ochish", "🍣 Открыть меню"), web_app: { url } }]] });
  else await send(chat.chat_id, `🍣 ${L(lang, "Menyu", "Меню")}: ${esc(siteUrl())}`);
}

async function sendMyOrders(chat: ChatRow) {
  const lang = chat.lang;
  if (!chat.customer_id) return send(chat.chat_id, L(lang, "Avval telefon raqamingizni yuboring 👇", "Сначала отправьте номер телефона 👇"));
  const rows = await db.query<{ id: string; number: number; status: string; total: number; created_at: string }>(
    "select id, number, status, total, created_at from public.orders where customer_id = $1 order by created_at desc limit 5",
    [chat.customer_id],
  );
  if (!rows.length) return send(chat.chat_id, L(lang, "Hali buyurtmalar yo'q. 🍣 Menyu tugmasini bosing!", "Заказов пока нет. Нажмите 🍣 Меню!"));
  const text = [`📦 <b>${L(lang, "So'nggi buyurtmalar", "Последние заказы")}</b>`, ...rows.map((o) => `${STATUS_ICON[o.status] ?? "•"} #${o.number} · ${esc(statusLabel(o.status, lang))} · ${formatUZS(o.total)} · ${esc(formatDateTime(o.created_at, lang))}`)].join("\n");
  const kb: InlineKeyboard = rows.flatMap((o) => {
    const btn = openButton(`#${o.number}`, `/orders/${o.id}`, true);
    return btn ? [[btn]] : [];
  });
  await send(chat.chat_id, text, { keyboard: kb.length ? kb : undefined });
}

async function sendBonus(chat: ChatRow) {
  const lang = chat.lang;
  if (!chat.customer_id) return send(chat.chat_id, L(lang, "Avval telefon raqamingizni yuboring 👇", "Сначала отправьте номер телефона 👇"));
  const c = await db.one<{ loyalty_balance: number }>("select loyalty_balance from public.customers where id = $1", [chat.customer_id]);
  await send(chat.chat_id, `🎁 ${L(lang, "Bonus balansingiz", "Ваш бонусный баланс")}: <b>${formatUZS(c?.loyalty_balance ?? 0)}</b>`);
}

async function sendBranches(chat: ChatRow, contactsOnly = false) {
  const lang = chat.lang;
  const rows = await db.query<{ name: I18n; address: I18n; phone: string | null; lat: number; lng: number }>(
    "select name, address, phone, lat, lng from public.branches where is_active order by sort",
  );
  const text = rows
    .map((r) => (contactsOnly ? `🏪 ${esc(pick(r.name, lang))}: ${esc(r.phone ?? "—")}` : `🏪 <b>${esc(pick(r.name, lang))}</b>\n📍 ${esc(pick(r.address, lang))}${r.phone ? `\n☎️ ${esc(r.phone)}` : ""}\n🗺 <a href="https://maps.google.com/?q=${r.lat},${r.lng}">${L(lang, "Xaritada", "На карте")}</a>`))
    .join("\n\n");
  await send(chat.chat_id, (contactsOnly ? `☎️ <b>${L(lang, "Aloqa", "Контакты")}</b>\n` : "") + (text || "—") + (contactsOnly ? `\n🌐 ${esc(siteUrl())}` : ""));
}

async function sendActiveOrders(chat: ChatRow, staff: Staff) {
  const rows = await db.query<{ id: string }>(
    `select id from public.orders where status not in ('delivered','picked_up','cancelled')
        and ($1 or branch_id = any($2::uuid[])) order by created_at limit 15`,
    [staff.role === "super_admin", staff.branchIds],
  );
  if (!rows.length) return send(chat.chat_id, L(chat.lang, "✨ Faol buyurtmalar yo'q.", "✨ Активных заказов нет."));
  for (const r of rows) {
    const o = await loadOrder(r.id);
    if (o) await postOrderCard(o, { chatId: chat.chat_id, lang: chat.lang, role: staff.role, staff }, true);
  }
}

async function sendToday(chat: ChatRow, staff: Staff) {
  const lang = chat.lang;
  const s = await db.one<{ orders: number; active: number; fresh: number; done: number; cancelled: number; revenue: number; customers: number; reservations: number }>(
    `with day as (select (date_trunc('day', now() at time zone 'Asia/Tashkent') at time zone 'Asia/Tashkent') as start),
          o as (select * from public.orders, day where created_at >= day.start and ($1 or branch_id = any($2::uuid[])))
     select (select count(*) from o)::int as orders,
            (select count(*) from o where status not in ('delivered','picked_up','cancelled'))::int as active,
            (select count(*) from o where status = 'new')::int as fresh,
            (select count(*) from o where status in ('delivered','picked_up'))::int as done,
            (select count(*) from o where status = 'cancelled')::int as cancelled,
            (select coalesce(sum(total), 0) from o where status <> 'cancelled')::bigint as revenue,
            (select count(*) from public.customers, day where created_at >= day.start)::int as customers,
            (select count(*) from public.reservations where status = 'pending' and ($1 or branch_id = any($2::uuid[])))::int as reservations`,
    [staff.role === "super_admin", staff.branchIds],
  );
  if (!s) return;
  const avg = s.orders - s.cancelled > 0 ? Math.round(s.revenue / (s.orders - s.cancelled)) : 0;
  const lines = [
    `📊 <b>${L(lang, "Bugun", "Сегодня")}</b>`,
    `🧾 ${L(lang, "Buyurtmalar", "Заказы")}: <b>${s.orders}</b> (🆕 ${s.fresh} · 🔥 ${s.active} · 🎉 ${s.done} · ❌ ${s.cancelled})`,
    `💰 ${L(lang, "Tushum", "Выручка")}: <b>${formatUZS(s.revenue)}</b>`,
    `🧮 ${L(lang, "O'rtacha chek", "Средний чек")}: ${formatUZS(avg)}`,
    `📅 ${L(lang, "Kutilayotgan bronlar", "Ожидающие брони")}: ${s.reservations}`,
  ];
  if (staff.role === "super_admin") lines.push(`👋 ${L(lang, "Yangi mijozlar", "Новые клиенты")}: ${s.customers}`);
  await send(chat.chat_id, lines.join("\n"));
}

async function sendReservations(chat: ChatRow, staff: Staff) {
  const rows = await db.query<{ id: string }>(
    `select id from public.reservations where status in ('pending','confirmed') and starts_at > now() - interval '3 hours'
        and ($1 or branch_id = any($2::uuid[])) order by starts_at limit 10`,
    [staff.role === "super_admin", staff.branchIds],
  );
  if (!rows.length) return send(chat.chat_id, L(chat.lang, "📅 Yaqin bronlar yo'q.", "📅 Ближайших броней нет."));
  for (const row of rows) {
    const r = await loadReservation(row.id);
    if (r) await send(chat.chat_id, reservationText(r, chat.lang), { keyboard: reservationButtons(r, { lang: chat.lang, staff, role: staff.role }), silent: true });
  }
}

async function onMessage(msg: TgMessage) {
  if (msg.chat.type !== "private") return;
  const chat = await upsertChat(msg.chat.id, msg.from);
  const staff = await loadStaff(chat.staff_id);
  const lang = chat.lang;
  if (msg.contact) return linkCustomer(chat, msg);
  const text = (msg.text ?? "").trim();
  const [cmd, arg] = text.split(/\s+/, 2);

  if (cmd === "/start") {
    if (arg?.startsWith("link_")) return linkStaff(chat, arg.slice(5), msg.from);
    return greet(chat, staff);
  }
  if (cmd === "/id") return send(chat.chat_id, `Chat ID: <code>${chat.chat_id}</code>`);
  if (cmd === "/help") return greet(chat, staff);
  if (cmd === "/unlink") {
    await db.query("update public.telegram_chats set staff_id = null, customer_id = null where chat_id = $1", [chat.chat_id]);
    chat.staff_id = chat.customer_id = null;
    await call("setChatMenuButton", { chat_id: chat.chat_id }).catch(() => {});
    return send(chat.chat_id, L(lang, "Bot bu chatdan uzildi.", "Бот отвязан от этого чата."), { reply: mainKeyboard(chat, null) });
  }

  const key = matchBtn(text) ?? ({ "/menu": "menu", "/orders": "myOrders", "/active": "active", "/today": "today", "/stats": "today", "/reservations": "reservations" } as Record<string, BtnKey>)[cmd];
  switch (key) {
    case "menu": return sendMenuLink(chat);
    case "myOrders": return sendMyOrders(chat);
    case "bonus": return sendBonus(chat);
    case "branches": return sendBranches(chat);
    case "contact": return sendBranches(chat, true);
    case "share": return;
    case "lang": {
      const next: Lang = lang === "ru" ? "uz" : "ru";
      await db.query("update public.telegram_chats set lang = $2 where chat_id = $1", [chat.chat_id, next]);
      chat.lang = next;
      return send(chat.chat_id, L(next, "✅ Til: O'zbekcha", "✅ Язык: Русский"), { reply: mainKeyboard(chat, staff) });
    }
  }
  if (staff) {
    switch (key) {
      case "active": return sendActiveOrders(chat, staff);
      case "today":
        if (staff.role !== "kitchen") return sendToday(chat, staff);
        break;
      case "reservations":
        if (staff.role !== "kitchen") return sendReservations(chat, staff);
        break;
      case "mute":
      case "unmute": {
        chat.muted = key === "mute";
        await db.query("update public.telegram_chats set muted = $2 where chat_id = $1", [chat.chat_id, chat.muted]);
        return send(chat.chat_id, chat.muted ? L(lang, "🔕 Bildirishnomalar o'chirildi.", "🔕 Уведомления выключены.") : L(lang, "🔔 Bildirishnomalar yoqildi.", "🔔 Уведомления включены."), { reply: mainKeyboard(chat, staff) });
      }
      case "me": return greet(chat, staff);
    }
  }
  return send(chat.chat_id, L(lang, "Pastdagi tugmalardan foydalaning 👇", "Воспользуйтесь кнопками ниже 👇"), { reply: mainKeyboard(chat, staff) });
}

type CallbackQuery = NonNullable<TgUpdate["callback_query"]>;

async function onCallback(q: CallbackQuery) {
  const answer = (text?: string, alert = false) => call("answerCallbackQuery", { callback_query_id: q.id, text, show_alert: alert || undefined }).catch(() => {});
  const msg = q.message;
  if (!msg || !q.data) return answer();
  const chat = await upsertChat(msg.chat.id, q.from);
  const lang = chat.lang;
  const staff = await loadStaff(chat.staff_id);
  if (!staff) return answer(L(lang, "Ruxsat yo'q", "Нет доступа"), true);
  const [kind, id, arg] = q.data.split(":");
  if (!/^[0-9a-f-]{36}$/i.test(id ?? "")) return answer();
  const rc = { chatId: chat.chat_id, lang, role: staff.role, staff };
  const errText: Record<string, string> = {
    not_found: L(lang, "Buyurtma topilmadi yoki ruxsat yo'q", "Заказ не найден или нет доступа"),
    invalid: L(lang, "Bu holatga o'tib bo'lmaydi — buyurtma allaqachon o'zgargan", "Переход невозможен — заказ уже изменился"),
    forbidden: L(lang, "Sizning rolingiz bu amalni bajara olmaydi", "Ваша роль не может это сделать"),
    reason_required: L(lang, "Sabab kerak", "Нужна причина"),
  };

  if (kind === "o" || kind === "ox" || kind === "op" || kind === "oc" || kind === "ob") {
    let result = "ok";
    if (kind === "o") result = await transitionOrder(staff, id, arg as OrderStatus);
    if (kind === "ox") {
      const reason = CANCEL_REASONS[Number(arg)];
      result = reason ? await transitionOrder(staff, id, "cancelled", { reason }) : "invalid";
    }
    if (kind === "op") result = await setPaymentStatus(staff, id, "paid");
    const o = await loadOrder(id);
    if (!o) return answer(errText.not_found, true);
    if (kind === "oc") {
      await edit(chat.chat_id, msg.message_id, `${orderText(o, lang)}\n\n<b>${L(lang, "Bekor qilish sababini tanlang:", "Выберите причину отмены:")}</b>`, cancelButtons(o, lang));
      return answer();
    }
    await edit(chat.chat_id, msg.message_id, orderText(o, lang), orderButtons(o, rc));
    if (result !== "ok") return answer(errText[result] ?? result, true);
    return answer(kind === "ob" ? undefined : `✅ #${o.number}: ${kind === "op" ? payLabel("paid", lang) : statusLabel(o.status, lang)}`);
  }

  if (kind === "r") {
    const result = await setReservationStatus(staff, id, arg);
    const r = await loadReservation(id);
    if (r) await edit(chat.chat_id, msg.message_id, reservationText(r, lang), reservationButtons(r, rc));
    if (result !== "ok") return answer(result === "invalid" ? errText.invalid : errText.forbidden, true);
    return answer(`✅ ${resLabel(arg, lang)}`);
  }
  return answer();
}

export async function handleUpdate(u: TgUpdate) {
  try {
    if (u.message) await onMessage(u.message);
    else if (u.callback_query) await onCallback(u.callback_query);
  } catch (e) {
    console.error("[telegram] update", u.update_id, e);
  }
}

// ---------------------------------------------------------------------------
// Admin panel helpers
// ---------------------------------------------------------------------------

/** One-time deep link (valid 15 min) that binds a Telegram chat to a staff member. */
export async function createStaffLink(staffId: string): Promise<string | null> {
  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "").trim();
  if (!username) return null;
  const token = randomBytes(18).toString("base64url");
  await db.query("insert into public.telegram_link_tokens (token, staff_id, expires_at) values ($1, $2, now() + interval '15 minutes')", [token, staffId]);
  return `https://t.me/${username}?start=link_${token}`;
}

export const BOT_COMMANDS = [
  { command: "start", description: "Bosh menyu / Главное меню" },
  { command: "orders", description: "Buyurtmalarim / Мои заказы" },
  { command: "menu", description: "Menyu / Меню" },
  { command: "active", description: "Faol buyurtmalar (xodim) / Активные заказы" },
  { command: "today", description: "Bugungi statistika (admin) / Статистика" },
  { command: "id", description: "Chat ID" },
];
