// Telegram bot against a real PostgreSQL (triggers -> outbox -> bot) with the
// Telegram HTTP API replaced by an in-memory fake. Requires `npm run db:start`.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareTestDb } from "./setup-db";
import type { PlaceInput } from "@/lib/services/checkout";
import type { TgUpdate } from "@/lib/telegram/api";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";

// Cookie jar standing in for next/headers, so the Mini App login route can run here.
const jar = new Map<string, { value: string; opts: Record<string, unknown> }>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)!.value } : undefined),
    set: (k: string, value: string, opts: Record<string, unknown>) => jar.set(k, { value, opts }),
    delete: (k: string) => jar.delete(k),
  }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));

let bot: typeof import("@/lib/telegram/bot");
let dbm: typeof import("@/lib/db");
let checkout: typeof import("@/lib/services/checkout");

type Call = { method: string; body: Record<string, any> };
let calls: Call[] = [];
let nextMessageId = 1000;
const ids: Record<string, string> = {};
const CHAT = { admin: 1, mgrChil: 2, kitchen: 3, mgrYun: 4, alice: 10, feed: 999 };
const NOW = (() => {
  const d = new Date(Date.now() + 86400000);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(d);
  return new Date(`${date}T13:00:00+05:00`);
})();

const q = <T = Record<string, any>>(sql: string, p: unknown[] = []) => dbm.db.query<T>(sql, p);
const sent = (chatId: number) => calls.filter((c) => c.method === "sendMessage" && c.body.chat_id === chatId);
const callbacks = (c: Call) => (c.body.reply_markup?.inline_keyboard ?? []).flat().map((b: any) => b.callback_data).filter(Boolean) as string[];
let updateId = 1;
const from = (id: number) => ({ id, first_name: `U${id}`, username: `u${id}` });
const text = (chatId: number, t: string): TgUpdate => ({ update_id: updateId++, message: { message_id: updateId, chat: { id: chatId, type: "private" }, from: from(chatId), text: t } });
const press = (chatId: number, messageId: number, data: string): TgUpdate => ({
  update_id: updateId++,
  callback_query: { id: `cb${updateId}`, from: from(chatId), data, message: { message_id: messageId, chat: { id: chatId, type: "private" } } },
});

beforeAll(async () => {
  await prepareTestDb();
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  // hermetic: ignore whatever public URL .env.local points at
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  process.env.TELEGRAM_BOT_USERNAME = "sushi_test_bot";
  process.env.TELEGRAM_ADMIN_CHAT_IDS = String(CHAT.feed);
  vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
    const method = String(url).split("/").pop()!;
    const body = JSON.parse(init.body);
    calls.push({ method, body });
    const result = method === "sendMessage" ? { message_id: nextMessageId++, chat: { id: body.chat_id, type: "private" } } : true;
    return new Response(JSON.stringify({ ok: true, result }), { headers: { "content-type": "application/json" } });
  });
  dbm = await import("@/lib/db");
  bot = await import("@/lib/telegram/bot");
  checkout = await import("@/lib/services/checkout");
  const one = async (sql: string, p: unknown[] = []) => (await q<{ id: string }>(sql, p))[0]?.id as string;
  ids.brand = await one("select id from brands where slug = 'sushi-madi'");
  ids.chilonzor = await one("select id from branches where slug = 'chilonzor'");
  ids.chiz = await one("select id from products where slug = 'chiz-roll'");
  ids.super = await one("select id from staff where role = 'super_admin'");
  ids.mgrChil = await one("select id from staff where email = 'manager.chilonzor@sushi.local'");
  ids.mgrYun = await one("select id from staff where email = 'manager.yunusobod@sushi.local'");
  ids.kitchen = await one("select id from staff where email = 'kitchen.chilonzor@sushi.local'");
  // seed data already produced events; start from a clean outbox
  await q("update telegram_outbox set sent_at = now()");
}, 120000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await dbm?.pool().end();
});

beforeEach(() => {
  calls = [];
});

async function placeOrder(customerId: string) {
  const input = {
    brandId: ids.brand,
    branchId: ids.chilonzor,
    fulfillment: "pickup",
    address: null,
    items: [{ productId: ids.chiz, optionIds: [], quantity: 2 }],
    promoCode: null,
    loyalty: 0,
    asap: true,
    scheduledFor: null,
  } as const;
  const quote = await checkout.getQuote(input as never, { id: customerId, loyalty_balance: 0 }, NOW);
  const r = await checkout.placeOrder(
    customerId,
    { ...input, customerName: "Alice", paymentMethod: "cash", leaveAtDoor: false, isForOther: false, recipientName: null, recipientPhone: null, comment: "No wasabi", saveAddress: false, idempotencyKey: `tg-${Math.random().toString(36).slice(2)}`, expectedTotal: quote.quote.total } as unknown as PlaceInput,
    NOW,
  );
  if (!r.ok) throw new Error(`place failed: ${JSON.stringify(r)}`);
  return { id: r.orderId, number: r.number };
}

async function cardOf(orderId: string, chatId: number) {
  return Number((await q<{ message_id: number }>("select message_id from telegram_order_messages where order_id = $1 and chat_id = $2", [orderId, chatId]))[0]?.message_id);
}

describe("telegram bot", () => {
  let order: { id: string; number: number };

  it("links staff through one-time deep links", async () => {
    for (const [chat, staffId] of [[CHAT.admin, ids.super], [CHAT.mgrChil, ids.mgrChil], [CHAT.kitchen, ids.kitchen], [CHAT.mgrYun, ids.mgrYun]] as const) {
      const url = await bot.createStaffLink(staffId);
      expect(url).toMatch(/^https:\/\/t\.me\/sushi_test_bot\?start=link_/);
      await bot.handleUpdate(text(chat, `/start ${url!.split("start=")[1]}`));
    }
    const rows = await q<{ chat_id: number; staff_id: string }>("select chat_id, staff_id from telegram_chats where staff_id is not null order by chat_id");
    expect(rows.map((r) => Number(r.chat_id))).toEqual([CHAT.admin, CHAT.mgrChil, CHAT.kitchen, CHAT.mgrYun]);
    expect(sent(CHAT.kitchen).at(-1)!.body.text).toContain("Oshxona");
    // a used token cannot be replayed
    const temp = (await q<{ id: string }>("insert into staff (email, name, role) values ('temp@sushi.local', 'Temp', 'kitchen') returning id"))[0].id;
    const url = await bot.createStaffLink(temp);
    const token = url!.split("start=")[1];
    await bot.handleUpdate(text(77, `/start ${token}`));
    await bot.handleUpdate(text(78, `/start ${token}`));
    expect(sent(78).at(-1)!.body.text).toContain("eskirgan");
    await q("update telegram_chats set staff_id = null where chat_id = 77");
  });

  it("links a customer only by their own shared contact", async () => {
    const aliceId = (await q<{ id: string }>("insert into customers (phone, name) values ('+998901111111', 'Alice') returning id"))[0].id;
    ids.alice = aliceId;
    await bot.handleUpdate({ update_id: updateId++, message: { message_id: 1, chat: { id: CHAT.alice, type: "private" }, from: from(CHAT.alice), contact: { phone_number: "998901111111", user_id: 555, first_name: "X" } } });
    expect((await q("select customer_id from telegram_chats where chat_id = $1", [CHAT.alice]))[0].customer_id).toBeNull();
    await bot.handleUpdate({ update_id: updateId++, message: { message_id: 2, chat: { id: CHAT.alice, type: "private" }, from: from(CHAT.alice), contact: { phone_number: "998901111111", user_id: CHAT.alice, first_name: "Alice" } } });
    expect((await q("select customer_id from telegram_chats where chat_id = $1", [CHAT.alice]))[0].customer_id).toBe(aliceId);
  });

  it("fans a new order out by role and branch", async () => {
    await bot.drainOutbox();
    calls = [];
    order = await placeOrder(ids.alice);
    await bot.drainOutbox();
    for (const chat of [CHAT.admin, CHAT.mgrChil, CHAT.kitchen, CHAT.feed]) expect(sent(chat).some((c) => c.body.text.includes(`#${order.number}`))).toBe(true);
    expect(sent(CHAT.mgrYun)).toHaveLength(0);
    expect(sent(CHAT.alice).at(-1)!.body.text).toContain(`#${order.number}`);
    const kitchenCard = sent(CHAT.kitchen)[0];
    expect(kitchenCard.body.text).toContain("No wasabi");
    expect(callbacks(kitchenCard)).toEqual([`o:${order.id}:confirmed`]);
    expect(callbacks(sent(CHAT.mgrChil)[0])).toEqual(expect.arrayContaining([`o:${order.id}:confirmed`, `oc:${order.id}`, `op:${order.id}`]));
    expect(callbacks(sent(CHAT.feed)[0])).toEqual([]);
  });

  it("kitchen moves the order forward; everyone's card updates, admin and customer are told", async () => {
    await bot.handleUpdate(press(CHAT.kitchen, await cardOf(order.id, CHAT.kitchen), `o:${order.id}:confirmed`));
    expect((await q("select status from orders where id = $1", [order.id]))[0].status).toBe("confirmed");
    expect(calls.find((c) => c.method === "answerCallbackQuery")!.body.show_alert).toBeUndefined();
    calls = [];
    await bot.drainOutbox();
    const edited = calls.filter((c) => c.method === "editMessageText").map((c) => c.body.chat_id);
    expect(edited).toEqual(expect.arrayContaining([CHAT.admin, CHAT.mgrChil, CHAT.kitchen, CHAT.feed]));
    expect(sent(CHAT.admin).at(-1)!.body.text).toMatch(/→ <b>Tasdiqlandi<\/b>/);
    expect(sent(CHAT.admin).at(-1)!.body.reply_parameters.message_id).toBe(await cardOf(order.id, CHAT.admin));
    expect(sent(CHAT.mgrChil)).toHaveLength(0); // managers only hear about cancellations
    expect(sent(CHAT.alice).at(-1)!.body.text).toContain("tasdiqlandi");
  });

  it("kitchen cannot cancel; manager cancels with a reason", async () => {
    await bot.handleUpdate(press(CHAT.kitchen, 1, `ox:${order.id}:0`));
    expect(calls.find((c) => c.method === "answerCallbackQuery")!.body.show_alert).toBe(true);
    expect((await q("select status from orders where id = $1", [order.id]))[0].status).toBe("confirmed");
    // another branch's manager cannot touch it
    await bot.handleUpdate(press(CHAT.mgrYun, 1, `ox:${order.id}:0`));
    expect((await q("select status from orders where id = $1", [order.id]))[0].status).toBe("confirmed");
    await bot.handleUpdate(press(CHAT.mgrChil, await cardOf(order.id, CHAT.mgrChil), `ox:${order.id}:1`));
    const o = (await q("select status, cancel_reason, cancelled_by from orders where id = $1", [order.id]))[0];
    expect(o).toMatchObject({ status: "cancelled", cancel_reason: "out_of_stock", cancelled_by: "staff" });
    calls = [];
    await bot.drainOutbox();
    expect(sent(CHAT.mgrChil).at(-1)!.body.text).toContain("Mahsulot tugagan");
    expect(sent(CHAT.alice).at(-1)!.body.text).toContain("bekor qilindi");
  });

  it("reservations, feedback, new customers and stats", async () => {
    const r = (await q<{ id: string }>(
      "insert into reservations (brand_id, branch_id, customer_id, name, phone, starts_at, ends_at, party_size) values ($1, $2, $3, 'Alice', '+998901111111', $4, $5, 4) returning id",
      [ids.brand, ids.chilonzor, ids.alice, NOW, new Date(NOW.getTime() + 7200000)],
    ))[0];
    await bot.drainOutbox();
    const card = sent(CHAT.mgrChil).at(-1)!;
    expect(callbacks(card)).toEqual([`r:${r.id}:confirmed`, `r:${r.id}:rejected`]);
    expect(sent(CHAT.kitchen)).toHaveLength(0);
    expect(sent(CHAT.alice).at(-1)!.body.text).toContain("Bron");
    await bot.handleUpdate(press(CHAT.mgrChil, card.body.message_id ?? 1, `r:${r.id}:confirmed`));
    expect((await q("select status from reservations where id = $1", [r.id]))[0].status).toBe("confirmed");
    calls = [];
    await bot.drainOutbox();
    expect(sent(CHAT.alice).at(-1)!.body.text).toContain("Tasdiqlandi");

    calls = [];
    await q("insert into feedback (branch_id, name, rating, message) values ($1, 'Bob', 5, 'Juda mazali!')", [ids.chilonzor]);
    await q("insert into customers (phone, name) values ('+998907777777', 'Newbie')");
    await bot.drainOutbox();
    expect(sent(CHAT.mgrChil).some((c) => c.body.text.includes("Juda mazali"))).toBe(true);
    expect(sent(CHAT.admin).some((c) => c.body.text.includes("Newbie"))).toBe(true);
    expect(sent(CHAT.mgrChil).some((c) => c.body.text.includes("Newbie"))).toBe(false);

    calls = [];
    await bot.handleUpdate(text(CHAT.admin, "📊 Bugun"));
    expect(sent(CHAT.admin)[0].body.text).toContain("Tushum");
    calls = [];
    await bot.handleUpdate(text(CHAT.kitchen, "/today"));
    expect(sent(CHAT.kitchen)[0].body.text).not.toContain("Tushum");
    calls = [];
    await bot.handleUpdate(text(CHAT.alice, "📦 Buyurtmalarim"));
    expect(sent(CHAT.alice)[0].body.text).toContain(`#${order.number}`);
  });

  it("marks chats that blocked the bot and stops sending to them", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" })));
    await placeOrder(ids.alice);
    await bot.drainOutbox();
    expect((await q("select blocked from telegram_chats where chat_id = $1", [CHAT.alice]))[0].blocked).toBe(true);
    expect((await q("select count(*)::int as n from telegram_outbox where sent_at is null"))[0].n).toBe(0);
  });
});

function sign(fields: Record<string, string>, token = "test-token") {
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  return new URLSearchParams({ ...fields, hash: createHmac("sha256", secret).update(dcs).digest("hex") }).toString();
}
const initData = (userId: number, authDate = Math.floor(Date.now() / 1000)) =>
  sign({ auth_date: String(authDate), query_id: "AAH", user: JSON.stringify({ id: userId, first_name: "Mini", language_code: "uz" }), signature: "sig" });

describe("telegram mini app", () => {
  let webapp: typeof import("@/lib/telegram/webapp");
  let POST: (req: NextRequest) => Promise<Response>;
  const call = async (body: unknown) => {
    const res = await POST(new NextRequest("http://localhost:3000/api/auth/telegram", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", origin: "http://localhost:3000", host: "localhost:3000" } }));
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  beforeAll(async () => {
    webapp = await import("@/lib/telegram/webapp");
    POST = (await import("@/app/api/auth/telegram/route")).POST as never;
  });
  beforeEach(() => jar.clear());

  it("accepts only correctly signed, fresh launch data", () => {
    expect(webapp.parseInitData(initData(42))?.user.id).toBe(42);
    expect(webapp.parseInitData(initData(42).replace("Mini", "Evil"))).toBeNull();
    expect(webapp.parseInitData(sign({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 42 }) }, "other-token"))).toBeNull();
    expect(webapp.parseInitData(initData(42, Math.floor(Date.now() / 1000) - 2 * 86400))).toBeNull();
    const contact = sign({ auth_date: String(Math.floor(Date.now() / 1000)), contact: JSON.stringify({ user_id: 42, phone_number: "998905555555" }) });
    expect(webapp.parseContact(contact, 42)).toBe("998905555555");
    expect(webapp.parseContact(contact, 43)).toBeNull();
  });

  it("logs a linked customer in, asks an unknown one for their contact, then links it", async () => {
    // Alice's chat was linked through the bot earlier in this file (chat id = Telegram user id)
    await q("update telegram_chats set blocked = false where chat_id = $1", [CHAT.alice]);
    const ok = await call({ initData: initData(CHAT.alice) });
    expect(ok).toMatchObject({ status: 200, body: { ok: true } });
    expect(jar.get("sushi_session")?.value).toBeTruthy();
    expect((await q("select subject_id from sessions order by created_at desc limit 1"))[0].subject_id).toBe(ids.alice);

    jar.clear();
    expect((await call({ initData: initData(4242) })).body.error).toBe("need_contact");
    expect((await call({ initData: "user=%7B%22id%22%3A1%7D&auth_date=1&hash=" + "0".repeat(64) })).status).toBe(401);
    // someone else's contact is ignored
    const foreign = sign({ auth_date: String(Math.floor(Date.now() / 1000)), contact: JSON.stringify({ user_id: 1, phone_number: "998905555555" }) });
    expect((await call({ initData: initData(4242), contact: foreign })).body.error).toBe("need_contact");
    const own = sign({ auth_date: String(Math.floor(Date.now() / 1000)), contact: JSON.stringify({ user_id: 4242, phone_number: "998905555555" }) });
    expect((await call({ initData: initData(4242), contact: own })).status).toBe(200);
    const cu = (await q("select c.id from customers c join telegram_chats t on t.customer_id = c.id where t.chat_id = 4242"))[0];
    expect(cu).toBeTruthy();
    expect((await q("select phone from customers where id = $1", [cu.id]))[0].phone).toBe("+998905555555");
  });

  it("logs linked staff into the admin panel only", async () => {
    expect((await call({ initData: initData(CHAT.kitchen), as: "staff" })).status).toBe(200);
    expect(jar.get("sushi_admin")?.value).toBeTruthy();
    jar.clear();
    expect((await call({ initData: initData(CHAT.alice), as: "staff" })).body.error).toBe("not_linked");
    expect(jar.has("sushi_admin")).toBe(false);
  });

  it("uses Mini App buttons once the site is public https", async () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://sushi.example";
    vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
      calls.push({ method: String(url).split("/").pop()!, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ ok: true, result: { message_id: nextMessageId++ } }));
    });
    try {
      await q("update telegram_chats set blocked = false");
      await bot.handleUpdate(text(CHAT.kitchen, "/start"));
      const [greeting, openCard] = sent(CHAT.kitchen).slice(-2);
      const kb = greeting.body.reply_markup.keyboard.flat();
      expect(kb.find((k: any) => k.web_app)?.web_app.url).toBe("https://sushi.example/admin/orders?tg=1");
      // /start also offers a big "open the menu" Mini App button (+ the panel for staff)
      expect(openCard.body.reply_markup.inline_keyboard.flat().map((b: any) => b.web_app.url)).toEqual(["https://sushi.example/?tg=1", "https://sushi.example/admin/orders?tg=1"]);
      await bot.drainOutbox(); // earlier events (e.g. the Mini App's new customer)
      calls = [];
      await placeOrder(ids.alice);
      await bot.drainOutbox();
      const panel = (c: Call) => (c.body.reply_markup?.inline_keyboard ?? []).flat().find((b: any) => b.web_app || b.url);
      expect(panel(sent(CHAT.kitchen)[0]).web_app.url).toMatch(/^https:\/\/sushi\.example\/admin\/orders\/.+\?tg=1$/);
      expect(panel(sent(CHAT.feed)[0]).url).toMatch(/^https:\/\/sushi\.example\/admin\/orders\//); // groups can't use web_app
      expect(panel(sent(CHAT.alice)[0]).web_app.url).toMatch(/\/orders\/.+\?tg=1$/);
    } finally {
      process.env.NEXT_PUBLIC_SITE_URL = prev;
    }
  });
});

describe("deployment: login codes via Telegram, webhook mode", () => {
  const env = (patch: Record<string, string | undefined>) => {
    const prev = Object.fromEntries(Object.keys(patch).map((k) => [k, process.env[k]]));
    Object.assign(process.env, patch);
    for (const [k, v] of Object.entries(patch)) if (v === undefined) delete process.env[k];
    return () => {
      for (const [k, v] of Object.entries(prev)) if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    };
  };

  it("sends the code to the linked Telegram chat; unlinked phones are told to link first", async () => {
    const restore = env({ SMS_PROVIDER: "telegram" });
    try {
      const otp = await import("@/lib/auth/otp");
      const { OtpNotDeliverableError } = await import("@/lib/integrations/sms");
      // not linked: refused before the per-phone limit, so retrying right after linking works
      for (let i = 0; i < 3; i++) await expect(otp.requestOtp("+998907777777", "10.0.0.7")).rejects.toBeInstanceOf(OtpNotDeliverableError);
      await q("update telegram_chats set blocked = false where chat_id = $1", [CHAT.alice]);
      calls = [];
      const r = await otp.requestOtp("+998901111111", "10.0.0.7");
      expect(r).toEqual({ channel: "telegram" }); // never exposed on screen
      const msg = sent(CHAT.alice).at(-1)!.body;
      const code = /<code>(\d{6})<\/code>/.exec(msg.text)?.[1];
      expect(code).toBeTruthy();
      expect(await otp.verifyOtp("+998901111111", code!, "10.0.0.7")).toBe(ids.alice);
    } finally {
      restore();
    }
  });

  it("stores uploads in the database when the disk is ephemeral and serves them from /media", async () => {
    const restore = env({ STORAGE_PROVIDER: "db" });
    try {
      const { saveImage } = await import("@/lib/integrations/storage");
      const { GET } = await import("@/app/media/[...path]/route");
      const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 7)]);
      const url = await saveImage(new File([png], "x.png"), "banners");
      expect(url).toMatch(/^\/media\/banners\/[0-9a-f-]{36}\.png$/);
      const get = (path: string) => GET(new NextRequest(`http://localhost${path}`), { params: Promise.resolve({ path: path.split("/").slice(2) }) });
      const res = await get(url);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      expect(Buffer.from(await res.arrayBuffer()).equals(png)).toBe(true);
      expect((await get("/media/banners/../../etc/passwd")).status).toBe(404);
    } finally {
      restore();
    }
  });

  it("webhook accepts only Telegram's secret header and only in webhook mode", async () => {
    const { POST } = await import("@/app/api/telegram/webhook/route");
    const { webhookSecret } = await import("@/lib/telegram/webhook");
    const req = (secret: string | null, body: unknown) =>
      new NextRequest("http://localhost/api/telegram/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}) },
        body: JSON.stringify(body),
      });
    const update = text(CHAT.kitchen, "/id");
    expect((await POST(req(webhookSecret(), update))).status).toBe(404); // polling mode: route is off
    const restore = env({ TELEGRAM_MODE: "webhook" });
    try {
      expect((await POST(req(null, update))).status).toBe(401);
      expect((await POST(req("wrong", update))).status).toBe(401);
      expect((await POST(req(webhookSecret(), { nope: 1 }))).status).toBe(400);
      calls = [];
      expect((await POST(req(webhookSecret(), update))).status).toBe(200);
      expect(sent(CHAT.kitchen).at(-1)!.body.text).toContain(`Chat ID: <code>${CHAT.kitchen}</code>`);
      expect(webhookSecret()).toMatch(/^[A-Za-z0-9_-]{1,256}$/);
      await new Promise((r) => setTimeout(r, 300)); // let the outbox kick finish before the pool closes
    } finally {
      restore();
    }
  });
});
