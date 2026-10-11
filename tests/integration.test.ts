// End-to-end service tests against a real PostgreSQL with the production
// migrations, RLS policies and triggers. Requires `npm run db:start`.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prepareTestDb } from "./setup-db";
import type { PlaceInput, QuoteInput } from "@/lib/services/checkout";

let checkout: typeof import("@/lib/services/checkout");
let orders: typeof import("@/lib/services/orders");
let dbm: typeof import("@/lib/db");
let mock: typeof import("@/lib/payments/mock");
let click: typeof import("@/lib/payments/click");
let payme: typeof import("@/lib/payments/payme");
let catalog: typeof import("@/lib/services/catalog");
let reservations: typeof import("@/lib/services/reservations");

const ids: Record<string, string> = {};
// Tomorrow 13:00 in Tashkent: every seeded branch is open.
const NOW = (() => {
  const d = new Date(Date.now() + 86400000);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(d);
  return new Date(`${date}T13:00:00+05:00`);
})();
const CHILONZOR_ADDR = { text: "Chilonzor-9 mavzesi, 5-uy", lat: 41.2756, lng: 69.2034, house: "5", apartment: "12", floor: "3", entrance: "2", instructions: null };
const QIBRAY_ADDR = { text: "Qibray", lat: 41.39, lng: 69.46, house: "1", apartment: null, floor: null, entrance: null, instructions: null };

async function q<T = Record<string, unknown>>(sql: string, p: unknown[] = []) {
  return dbm.db.query<T>(sql, p);
}

beforeAll(async () => {
  await prepareTestDb();
  dbm = await import("@/lib/db");
  checkout = await import("@/lib/services/checkout");
  orders = await import("@/lib/services/orders");
  mock = await import("@/lib/payments/mock");
  click = await import("@/lib/payments/click");
  payme = await import("@/lib/payments/payme");
  catalog = await import("@/lib/services/catalog");
  reservations = await import("@/lib/services/reservations");
  const one = async (sql: string, p: unknown[] = []) => ((await q<{ id: string }>(sql, p))[0]?.id as string);
  ids.brand = await one("select id from brands where slug = 'sushi-madi'");
  ids.chilonzor = await one("select id from branches where slug = 'chilonzor'");
  ids.yunusobod = await one("select id from branches where slug = 'yunusobod'");
  ids.fila = await one("select id from products where slug = 'filadelfiya'");
  ids.chiz = await one("select id from products where slug = 'chiz-roll'");
  ids.bag = await one("select id from products where slug = 'paket' and brand_id = $1", [ids.brand]);
  ids.sticks = await one("select id from products where slug = 'chop' and brand_id = $1", [ids.brand]);
  ids.sauce = await one("select o.id from product_options o join product_option_groups g on g.id = o.group_id where g.product_id = $1 and g.kind = 'extra' order by o.sort limit 1", [ids.fila]);
  ids.demo = await one("select id from customers where phone = '+998901234567'");
  ids.alice = await one("insert into customers (phone, name) values ('+998901111111', 'Alice') returning id");
  ids.bob = await one("insert into customers (phone, name) values ('+998902222222', 'Bob') returning id");
  ids.carol = await one("insert into customers (phone, name) values ('+998903333333', 'Carol') returning id");
  ids.super = await one("select id from staff where role = 'super_admin'");
  ids.mgrChil = await one("select id from staff where email = 'manager.chilonzor@sushi.local'");
  ids.mgrYun = await one("select id from staff where email = 'manager.yunusobod@sushi.local'");
  ids.kitchen = await one("select id from staff where email = 'kitchen.chilonzor@sushi.local'");
}, 120000);

afterAll(async () => {
  await dbm?.pool().end();
});

function baseQuote(over: Partial<QuoteInput> = {}): QuoteInput {
  return {
    brandId: ids.brand,
    branchId: ids.chilonzor,
    fulfillment: "delivery",
    address: CHILONZOR_ADDR,
    items: [
      { productId: ids.fila, optionIds: [ids.sauce], quantity: 1 },
      { productId: ids.chiz, optionIds: [], quantity: 2 },
      { productId: ids.bag, optionIds: [], quantity: 1 },
      { productId: ids.sticks, optionIds: [], quantity: 2 },
    ],
    promoCode: null,
    loyalty: 0,
    asap: true,
    scheduledFor: null,
    ...over,
  };
}

async function placeInput(customerId: string, over: Partial<PlaceInput> = {}): Promise<PlaceInput> {
  const qi = baseQuote(over);
  const bal = (await q<{ loyalty_balance: number }>("select loyalty_balance from customers where id = $1", [customerId]))[0].loyalty_balance;
  const quote = await checkout.getQuote(qi, { id: customerId, loyalty_balance: bal }, NOW);
  return {
    ...qi,
    customerName: "Test",
    paymentMethod: "cash",
    leaveAtDoor: false,
    isForOther: false,
    recipientName: null,
    recipientPhone: null,
    comment: null,
    saveAddress: false,
    idempotencyKey: `key-${Math.random().toString(36).slice(2)}`,
    expectedTotal: quote.quote.total,
    ...over,
  } as PlaceInput;
}

const staff = (id: string, role: "super_admin" | "branch_manager" | "kitchen") => ({ id, role, branchIds: [] });

describe("checkout", () => {
  it("quotes delivery with extras, packaging, cutlery and zone fee", async () => {
    const r = await checkout.getQuote(baseQuote(), null, NOW);
    expect(r.issues).toEqual([]);
    // Filadelfiya 88000 + 5000 soy sauce; Chiz roll 2 x 75000; chopsticks 2 x 5000
    expect(r.quote.subtotal).toBe(93000 + 150000 + 10000);
    // bag 2000; the menu-board prices already include the container
    expect(r.quote.packagingTotal).toBe(2000);
    // 253 000 is above the near zone's free-delivery threshold (250 000)
    expect(r.quote.deliveryFee).toBe(0);
    expect(r.quote.freeDeliveryFrom).toBe(250000);
    expect(r.quote.zoneSurcharge).toBe(0);
    expect(r.quote.total).toBe(253000 + 2000);
    expect(r.schedule.asapAvailable).toBe(true);
    const small = await checkout.getQuote(baseQuote({ items: [{ productId: ids.chiz, optionIds: [], quantity: 2 }] }), null, NOW);
    expect(small.quote.deliveryFee).toBe(12000);
    expect(small.quote.total).toBe(150000 + 12000);
  });

  it("pickup has no delivery charges; outer zone adds the surcharge", async () => {
    const pickup = await checkout.getQuote(baseQuote({ fulfillment: "pickup", address: null }), null, NOW);
    expect(pickup.quote.deliveryFee + pickup.quote.zoneSurcharge).toBe(0);
    expect(pickup.quote.total).toBe(255000);
    const outer = await checkout.getQuote(baseQuote({ address: QIBRAY_ADDR }), null, NOW);
    expect(outer.issues).toEqual([]);
    expect(outer.quote.deliveryFee).toBe(18000); // outer zone has no free-delivery threshold
    expect(outer.quote.zoneSurcharge).toBe(25000);
    expect(outer.delivery?.surchargeNote?.uz).toContain("TXAY");
  });

  it("detects an address served by another branch", async () => {
    const r = await checkout.getQuote(baseQuote({ branchId: ids.yunusobod, address: CHILONZOR_ADDR }), null, NOW);
    expect(r.issues.map((i) => i.code)).toContain("branch_mismatch");
    expect(r.suggestedBranchId).toBe(ids.chilonzor);
  });

  it("uses the branch price override", async () => {
    const chil = await checkout.getQuote(baseQuote({ items: [{ productId: ids.fila, optionIds: [], quantity: 1 }], fulfillment: "pickup", address: null }), null, NOW);
    const yun = await checkout.getQuote(baseQuote({ branchId: ids.yunusobod, items: [{ productId: ids.fila, optionIds: [], quantity: 1 }], fulfillment: "pickup", address: null }), null, NOW);
    expect(chil.quote.subtotal).toBe(88000);
    expect(yun.quote.subtotal).toBe(92000);
  });

  it("places an order with snapshots, and duplicate submissions return the same order", async () => {
    const input = await placeInput(ids.alice);
    const results = await Promise.all(Array.from({ length: 5 }, () => checkout.placeOrder(ids.alice, input, NOW)));
    const okIds = new Set(results.map((r) => (r.ok ? r.orderId : "fail")));
    expect(okIds.size).toBe(1);
    expect([...okIds][0]).not.toBe("fail");
    const count = await q<{ n: number }>("select count(*)::int n from orders where customer_id = $1 and idempotency_key = $2", [ids.alice, input.idempotencyKey]);
    expect(count[0].n).toBe(1);
    const orderId = [...okIds][0];
    const items = await q<{ name_snapshot: { uz: string }; unit_price: number; options_snapshot: unknown[] }>("select * from order_items where order_id = $1 order by sort", [orderId]);
    expect(items[0].unit_price).toBe(93000);
    expect(items[0].options_snapshot).toHaveLength(1);
    // Same key, different payload -> conflict
    const conflict = await checkout.placeOrder(ids.alice, { ...input, comment: "changed" }, NOW);
    expect(conflict).toEqual({ ok: false, code: "idempotency_conflict" });
  });

  it("asks for confirmation when the price changed, and reflects admin price/availability edits", async () => {
    const input = await placeInput(ids.bob, { fulfillment: "pickup", address: null });
    await dbm.asActor({ kind: "staff", id: ids.super }, (d) => d.query("update products set base_price = 85000 where id = $1", [ids.chiz]));
    const r = await checkout.placeOrder(ids.bob, input, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "price_changed") expect(r.quote.quote.total).toBe(input.expectedTotal + 20000);
    else throw new Error(`expected price_changed, got ${JSON.stringify(r)}`);
    const menu = await catalog.loadMenu(dbm.db, ids.brand, ids.chilonzor);
    expect(menu.products.find((p) => p.id === ids.chiz)?.price).toBe(85000);

    // Branch manager puts Chiz roll on the stop-list at Chilonzor
    await dbm.asActor({ kind: "staff", id: ids.mgrChil }, (d) =>
      d.query("insert into branch_products (branch_id, product_id, is_available) values ($1, $2, false)", [ids.chilonzor, ids.chiz]),
    );
    const blocked = await checkout.placeOrder(ids.bob, { ...input, expectedTotal: input.expectedTotal + 20000 }, NOW);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok && blocked.code === "validation") expect(blocked.issues.map((i) => i.code)).toContain("unavailable");
    const menu2 = await catalog.loadMenu(dbm.db, ids.brand, ids.chilonzor);
    expect(menu2.products.find((p) => p.id === ids.chiz)?.available).toBe(false);
    // restore
    await dbm.asActor({ kind: "staff", id: ids.super }, async (d) => {
      await d.query("delete from branch_products where branch_id = $1 and product_id = $2", [ids.chilonzor, ids.chiz]);
      await d.query("update products set base_price = 75000 where id = $1", [ids.chiz]);
    });
  });

  it("rejects leave-at-door for cash and unknown payment methods", async () => {
    const input = await placeInput(ids.bob, { leaveAtDoor: true });
    const r = await checkout.placeOrder(ids.bob, input, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "validation") expect(r.issues.map((i) => i.code)).toContain("leave_at_door");
  });
});

describe("promo codes", () => {
  it("applies once per customer and rejects invalid use", async () => {
    const first = await checkout.placeOrder(ids.carol, await placeInput(ids.carol, { promoCode: "welcome10" }), NOW);
    expect(first.ok).toBe(true);
    const saved = await q<{ discount_total: number; promo_code: string }>("select discount_total, promo_code from orders where id = $1", [first.ok ? first.orderId : ""]);
    expect(saved[0]).toEqual({ discount_total: 25300, promo_code: "WELCOME10" });
    const again = await checkout.getQuote(baseQuote({ promoCode: "WELCOME10" }), { id: ids.carol, loyalty_balance: 0 }, NOW);
    expect(again.promo?.error).toBe("customer_limit");
    const expired = await checkout.getQuote(baseQuote({ promoCode: "SUMMER15" }), null, NOW);
    expect(expired.promo?.error).toBe("expired");
    const unknown = await checkout.getQuote(baseQuote({ promoCode: "NOPE" }), null, NOW);
    expect(unknown.promo?.error).toBe("not_found");
  });

  it("enforces a total usage limit under concurrency", async () => {
    const [a, b] = await Promise.all([
      placeInput(ids.alice, { promoCode: "ONEUSE" }).then((i) => checkout.placeOrder(ids.alice, i, NOW)),
      placeInput(ids.bob, { promoCode: "ONEUSE" }).then((i) => checkout.placeOrder(ids.bob, i, NOW)),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const used = await q<{ used_count: number }>("select used_count from promo_codes where code = 'ONEUSE'");
    expect(used[0].used_count).toBe(1);
  });
});

describe("loyalty", () => {
  it("rejects spending over the limit, spends within it, refunds on cancel and earns on completion", async () => {
    const over = await checkout.placeOrder(ids.demo, await placeInput(ids.demo, { loyalty: 20001 }), NOW);
    expect(over.ok).toBe(false);
    const input = await placeInput(ids.demo, { loyalty: 20000 });
    const ok = await checkout.placeOrder(ids.demo, input, NOW);
    expect(ok.ok).toBe(true);
    const orderId = ok.ok ? ok.orderId : "";
    let bal = (await q<{ loyalty_balance: number }>("select loyalty_balance from customers where id = $1", [ids.demo]))[0].loyalty_balance;
    expect(bal).toBe(30000);

    expect(await orders.cancelOrderByCustomer(ids.demo, orderId, "customer_request")).toBe("ok");
    bal = (await q<{ loyalty_balance: number }>("select loyalty_balance from customers where id = $1", [ids.demo]))[0].loyalty_balance;
    expect(bal).toBe(50000);
    expect(await orders.cancelOrderByCustomer(ids.demo, orderId, "customer_request")).toBe("cannot_cancel");

    // complete a cash order: paid on delivery, earns 5% of goods
    const done = await checkout.placeOrder(ids.demo, await placeInput(ids.demo), NOW);
    const id = done.ok ? done.orderId : "";
    for (const s of ["confirmed", "preparing", "ready", "out_for_delivery", "delivered"] as const) {
      expect(await orders.transitionOrder(staff(ids.mgrChil, "branch_manager"), id, s)).toBe("ok");
    }
    const o = (await q<{ payment_status: string; loyalty_earned: number; subtotal: number }>("select payment_status, loyalty_earned, subtotal from orders where id = $1", [id]))[0];
    expect(o.payment_status).toBe("paid");
    expect(o.loyalty_earned).toBe(Math.floor((o.subtotal * 500) / 10000));
    const ledger = await q<{ kind: string }>("select kind from loyalty_transactions where customer_id = $1 order by id", [ids.demo]);
    expect(ledger.map((l) => l.kind)).toEqual(["adjust", "spend", "refund", "earn"]);
  });

  it("staff loyalty adjustments are audited and cannot overdraw", async () => {
    const bal = await dbm.asActor({ kind: "staff", id: ids.super }, (d) => d.one<{ b: number }>("select app.staff_adjust_loyalty($1, 1000, 'Goodwill credit') as b", [ids.bob]));
    expect(bal?.b).toBe(1000);
    await expect(dbm.asActor({ kind: "staff", id: ids.super }, (d) => d.query("select app.staff_adjust_loyalty($1, -5000, 'Too much')", [ids.bob]))).rejects.toThrow(/below zero/);
    await expect(dbm.asActor({ kind: "staff", id: ids.kitchen }, (d) => d.query("select app.staff_adjust_loyalty($1, 1000, 'Nope nope')", [ids.bob]))).rejects.toThrow(/not allowed/);
    const audit = await q("select * from audit_logs where action = 'loyalty.adjust' and entity_id = $1", [ids.bob]);
    expect(audit).toHaveLength(1);
  });
});

describe("fulfillment and permissions", () => {
  it("staff move orders through the lifecycle; the customer sees it; other branches cannot touch it", async () => {
    const r = await checkout.placeOrder(ids.alice, await placeInput(ids.alice, { fulfillment: "pickup", address: null }), NOW);
    const id = r.ok ? r.orderId : "";
    const kitchen = staff(ids.kitchen, "kitchen");
    expect(await orders.transitionOrder(kitchen, id, "confirmed")).toBe("ok");
    expect(await orders.transitionOrder(kitchen, id, "ready")).toBe("invalid"); // skipping preparing
    expect(await orders.transitionOrder(kitchen, id, "cancelled", { reason: "other" })).toBe("forbidden");
    expect(await orders.setPaymentStatus(kitchen, id, "paid")).toBe("forbidden");
    // manager of another branch: invisible
    expect(await orders.transitionOrder(staff(ids.mgrYun, "branch_manager"), id, "preparing")).toBe("not_found");
    expect(await orders.getStaffOrder(staff(ids.mgrYun, "branch_manager"), id)).toBeNull();
    const list = await orders.listStaffOrders(staff(ids.mgrYun, "branch_manager"), {});
    expect(list.rows.every((o) => o.branch_id === ids.yunusobod)).toBe(true);
    // bypassing the service layer is also blocked by RLS/triggers
    const direct = await dbm.asActor({ kind: "staff", id: ids.mgrYun }, (d) => d.query("update orders set status = 'preparing' where id = $1 returning id", [id]));
    expect(direct).toHaveLength(0);
    await expect(dbm.asActor({ kind: "staff", id: ids.kitchen }, (d) => d.query("update orders set status = 'cancelled', cancel_reason = 'x' where id = $1", [id]))).rejects.toThrow(/cannot cancel/);
    await expect(dbm.asActor({ kind: "staff", id: ids.mgrChil }, (d) => d.query("update orders set status = 'picked_up' where id = $1", [id]))).rejects.toThrow(/invalid order transition/);
    await expect(dbm.asActor({ kind: "staff", id: ids.mgrChil }, (d) => d.query("update orders set total = 1 where id = $1", [id]))).rejects.toThrow(/permission denied/);

    expect(await orders.transitionOrder(kitchen, id, "preparing")).toBe("ok");
    expect(await orders.transitionOrder(kitchen, id, "ready")).toBe("ok");
    expect(await orders.transitionOrder(kitchen, id, "out_for_delivery")).toBe("invalid"); // pickup path
    expect(await orders.transitionOrder(kitchen, id, "picked_up")).toBe("ok");

    const seen = await orders.getCustomerOrder(ids.alice, id);
    expect(seen?.order.status).toBe("picked_up");
    expect(seen?.history.map((h) => h.to_status)).toEqual(["new", "confirmed", "preparing", "ready", "picked_up"]);
    expect(await orders.getCustomerOrder(ids.bob, id)).toBeNull();
  });

  it("customers only reach their own private rows", async () => {
    const own = await orders.listCustomerOrders(ids.bob);
    expect(own.every((o) => o.customer_id === ids.bob)).toBe(true);
    const customers = await dbm.asActor({ kind: "customer", id: ids.bob }, (d) => d.query<{ id: string }>("select id from customers"));
    expect(customers.map((c) => c.id)).toEqual([ids.bob]);
    await expect(dbm.asActor({ kind: "customer", id: ids.bob }, (d) => d.query("update customers set loyalty_balance = 999999 where id = $1", [ids.bob]))).rejects.toThrow(/permission denied/);
    await expect(dbm.asActor({ kind: "customer", id: ids.bob }, (d) => d.query("select * from staff_credentials"))).rejects.toThrow(/permission denied/);
    await expect(dbm.asActor({ kind: "anon" }, (d) => d.query("select * from orders"))).rejects.toThrow(/permission denied/);
    const hidden = await dbm.asActor({ kind: "anon" }, (d) => d.query("select * from promotions where status = 'draft'"));
    expect(hidden).toHaveLength(0);
    // a customer claim cannot impersonate staff
    const fake = await dbm.asActor({ kind: "customer", id: ids.super }, (d) => d.query("select * from orders"));
    expect(fake).toHaveLength(0);
  });
});

describe("payments", () => {
  async function onlineOrder(method: "mock" | "click" | "payme") {
    const r = await checkout.placeOrder(ids.alice, await placeInput(ids.alice, { paymentMethod: method, leaveAtDoor: true }), NOW);
    if (!r.ok) throw new Error(JSON.stringify(r));
    const p = (await q<{ id: string; seq: number; amount: number }>("select id, seq, amount from payments where order_id = $1", [r.orderId]))[0];
    return { orderId: r.orderId, payment: p, url: r.paymentUrl };
  }
  const payStatus = async (orderId: string) => (await q<{ payment_status: string }>("select payment_status from orders where id = $1", [orderId]))[0].payment_status;

  it("mock: signed callbacks mark paid once; duplicates and forgeries are harmless", async () => {
    const { orderId, payment, url } = await onlineOrder("mock");
    expect(url).toBe(`/pay/mock/${payment.id}`);
    expect(await payStatus(orderId)).toBe("pending");
    const cb = mock.buildMockCallback(payment.id, payment.amount, "paid");
    expect(await mock.handleMockCallback({ ...cb, signature: "0".repeat(64) })).toEqual({ ok: false, code: "bad_signature" });
    expect(await mock.handleMockCallback({ ...cb, amount: 1, signature: mock.signMock({ ...cb, amount: 1 }) })).toEqual({ ok: false, code: "bad_amount" });
    const [a, b] = await Promise.all([mock.handleMockCallback(cb), mock.handleMockCallback(cb)]);
    expect([a.code, b.code]).toEqual(["paid", "paid"]);
    expect(await payStatus(orderId)).toBe("paid");
    const events = await q("select * from payment_events where provider = 'mock' and event_key like $1 and response->>'code' = 'paid'", [`${cb.eventId}:%`]);
    expect(events).toHaveLength(1);
    const second = mock.buildMockCallback(payment.id, payment.amount, "paid");
    expect((await mock.handleMockCallback(second)).code).toBe("already_paid");
    expect((await q("select * from payments where order_id = $1 and status = 'paid'", [orderId])).length).toBe(1);
  });

  it("click: verifies signature and amount, completes once", async () => {
    const { orderId, payment } = await onlineOrder("click");
    const base = { click_trans_id: "555001", service_id: "777", click_paydoc_id: "9001", merchant_trans_id: payment.id, amount: `${payment.amount}.00`, error: "0", error_note: "Success", sign_time: "2026-09-22 12:00:00" };
    const sign = (p: Record<string, string>) => ({ ...p, sign_string: click.clickSign(p, "click-test-secret") });
    const bad = await click.handleClick("prepare", { ...sign({ ...base, action: "0" }), sign_string: "x".repeat(32) });
    expect(bad.error).toBe(-1);
    const wrongAmount = await click.handleClick("prepare", sign({ ...base, action: "0", amount: "1.00" }));
    expect(wrongAmount.error).toBe(-2);
    const prep = await click.handleClick("prepare", sign({ ...base, action: "0" }));
    expect(prep).toMatchObject({ error: 0, merchant_prepare_id: payment.seq });
    const completeParams = sign({ ...base, action: "1", merchant_prepare_id: String(payment.seq) });
    const [c1, c2] = await Promise.all([click.handleClick("complete", completeParams), click.handleClick("complete", completeParams)]);
    expect(c1.error).toBe(0);
    expect(c2).toEqual(c1); // duplicate delivery returns the stored response
    expect(await payStatus(orderId)).toBe("paid");
    const again = await click.handleClick("complete", sign({ ...base, action: "1", merchant_prepare_id: String(payment.seq), click_trans_id: "555002" }));
    expect(again.error).toBe(-4);
  });

  it("payme: auth, amount check, create/perform idempotency, cancel after perform", async () => {
    const { orderId, payment } = await onlineOrder("payme");
    const auth = `Basic ${Buffer.from("Paycom:payme-test-key").toString("base64")}`;
    const call = (method: string, params: unknown, a = auth) => payme.handlePayme(a, JSON.stringify({ id: 1, method, params }));
    expect(((await call("CheckPerformTransaction", {}, "Basic bad")) as { error: { code: number } }).error.code).toBe(-32504);
    expect(((await call("CheckPerformTransaction", { amount: 100, account: { order_id: payment.id } })) as { error: { code: number } }).error.code).toBe(-31001);
    expect((await call("CheckPerformTransaction", { amount: payment.amount * 100, account: { order_id: payment.id } })).result).toEqual({ allow: true });
    const create = { id: "payme-txn-1", time: Date.now(), amount: payment.amount * 100, account: { order_id: payment.id } };
    const c1 = (await call("CreateTransaction", create)).result as { state: number; transaction: string };
    const c2 = (await call("CreateTransaction", create)).result as { state: number; transaction: string };
    expect(c1.state).toBe(1);
    expect(c2.transaction).toBe(c1.transaction);
    const other = await call("CreateTransaction", { ...create, id: "payme-txn-2" });
    expect((other as { error: { code: number } }).error.code).toBe(-31099);
    const p1 = (await call("PerformTransaction", { id: "payme-txn-1" })).result as { state: number; perform_time: number };
    const p2 = (await call("PerformTransaction", { id: "payme-txn-1" })).result as { state: number; perform_time: number };
    expect(p1.state).toBe(2);
    expect(p2.perform_time).toBe(p1.perform_time);
    expect(await payStatus(orderId)).toBe("paid");
    const check = (await call("CheckTransaction", { id: "payme-txn-1" })).result as { state: number };
    expect(check.state).toBe(2);
    const cancel = (await call("CancelTransaction", { id: "payme-txn-1", reason: 5 })).result as { state: number };
    expect(cancel.state).toBe(-2);
    expect(await payStatus(orderId)).toBe("refunded");
    expect(((await call("PerformTransaction", { id: "missing" })) as { error: { code: number } }).error.code).toBe(-31003);
  });
});

describe("reservations", () => {
  const day = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date(Date.now() + 2 * 86400000));
  it("creates pending requests, validates hours and capacity, and lets only the branch staff decide", async () => {
    // Chilonzor capacity is 40 seats; 2 hour slots
    const base = { branchId: ids.chilonzor, date: day(), time: "19:00", name: "Guest", phone: "+998901111111", notes: null };
    const a = await reservations.createReservation({ ...base, partySize: 12 }, ids.alice);
    expect(a.ok).toBe(true);
    const status = (await q<{ status: string }>("select status from reservations where id = $1", [a.ok ? a.id : ""]))[0].status;
    expect(status).toBe("pending");
    expect(await reservations.createReservation({ ...base, partySize: 13 }, null)).toEqual({ ok: false, code: "party_size" });
    expect(await reservations.createReservation({ ...base, time: "09:00", partySize: 2 }, null)).toEqual({ ok: false, code: "schedule.outside_hours" });
    // fill up: 12 + 12 + 12 = 36, then 6 more does not fit (40)
    expect((await reservations.createReservation({ ...base, partySize: 12 }, null)).ok).toBe(true);
    expect((await reservations.createReservation({ ...base, time: "20:00", partySize: 12 }, null)).ok).toBe(true);
    expect(await reservations.createReservation({ ...base, time: "19:30", partySize: 6 }, null)).toEqual({ ok: false, code: "capacity" });
    // a slot after the others end is free again
    expect((await reservations.createReservation({ ...base, time: "22:00", partySize: 6 }, null)).ok).toBe(true);

    const id = a.ok ? a.id : "";
    expect(await reservations.setReservationStatus(staff(ids.mgrYun, "branch_manager"), id, "confirmed")).toBe("not_found");
    expect(await reservations.setReservationStatus(staff(ids.kitchen, "kitchen"), id, "confirmed")).toBe("forbidden");
    expect(await reservations.setReservationStatus(staff(ids.mgrChil, "branch_manager"), id, "seated")).toBe("invalid");
    expect(await reservations.setReservationStatus(staff(ids.mgrChil, "branch_manager"), id, "confirmed")).toBe("ok");
    const mine = await reservations.listCustomerReservations(ids.alice);
    expect(mine.find((r) => r.id === id)?.status).toBe("confirmed");
    expect((await reservations.listCustomerReservations(ids.bob)).some((r) => r.id === id)).toBe(false);
  });
});
