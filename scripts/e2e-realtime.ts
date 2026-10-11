// Realtime E2E: pages update by themselves, without reload.
//   npm run e2e:realtime [-- <baseUrl>]      (default http://localhost:3000; needs npm run dev)
// Places real orders for the demo customer and moves one through its statuses.
// NOTE: if the Telegram bot worker is running, these orders are announced in Telegram too.
import puppeteer from "puppeteer-core";
import { SignJWT } from "jose";
import { loadEnv } from "./env";

loadEnv();
const base = process.argv[2] ?? "http://localhost:3000";
const { db, pool } = await import("../src/lib/db");
const checkout = await import("../src/lib/services/checkout");
const orders = await import("../src/lib/services/orders");

async function cookieFor(kind: "customer" | "staff", id: string) {
  const expires = new Date(Date.now() + 3600_000);
  const row = await db.one<{ id: string }>("insert into sessions (subject_kind, subject_id, expires_at, ip) values ($1,$2,$3,'e2e') returning id", [kind, id, expires]);
  const token = await new SignJWT({ kind, sid: row!.id }).setProtectedHeader({ alg: "HS256" }).setSubject(id).setIssuedAt().setExpirationTime(expires).sign(new TextEncoder().encode(process.env.SESSION_SECRET!));
  return { name: kind === "customer" ? "sushi_session" : "sushi_admin", value: token, domain: new URL(base).hostname, path: "/" };
}

async function newOrder(customerId: string) {
  const brand = (await db.one<{ id: string }>("select id from brands limit 1"))!.id;
  const branch = (await db.one<{ id: string }>("select id from branches where slug = 'chilonzor'"))!.id;
  const product = (await db.one<{ id: string }>("select id from products where slug = 'chiz-roll'"))!.id;
  const input = { brandId: brand, branchId: branch, fulfillment: "pickup", address: null, items: [{ productId: product, optionIds: [], quantity: 1 }], promoCode: null, loyalty: 0, asap: true, scheduledFor: null } as const;
  const q = await checkout.getQuote(input as never, { id: customerId, loyalty_balance: 0 });
  if (q.issues.length) throw new Error("quote issues: " + JSON.stringify(q.issues.map((i) => i.code)));
  const r = await checkout.placeOrder(customerId, { ...input, customerName: "RT test", paymentMethod: "cash", leaveAtDoor: false, isForOther: false, recipientName: null, recipientPhone: null, comment: "realtime e2e", saveAddress: false, idempotencyKey: `rt-${Date.now()}`, expectedTotal: q.quote.total } as never);
  if (!r.ok) throw new Error("place failed " + JSON.stringify(r));
  return { id: r.orderId, number: r.number };
}

const customer = (await db.one<{ id: string }>("select id from customers where phone = '+998901234567'"))!;
const admin = (await db.one<{ id: string; role: string }>("select id, role from staff where role = 'super_admin' limit 1"))!;
const staffActor = { id: admin.id, role: "super_admin" as const, branchIds: [] as string[] };

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
try {
  // ---- customer order page
  const order = await newOrder(customer.id);
  const page = await browser.newPage();
  await browser.setCookie(await cookieFor("customer", customer.id), await cookieFor("staff", admin.id));
  const mode: string[] = [];
  page.on("request", (r) => {
    const u = r.url();
    if (u.includes("/api/realtime")) mode.push(u.includes("poll=1") ? "poll" : "sse");
  });
  await page.goto(`${base}/orders/${order.id}`, { waitUntil: "networkidle2", timeout: 120000 });
  await new Promise((r) => setTimeout(r, 6000)); // let the transport settle (SSE or poll fallback)
  const text = () => page.evaluate(() => document.querySelector("main")?.innerText ?? "");
  for (const to of ["confirmed", "preparing", "ready", "picked_up"] as const) {
    const before = await text();
    const t0 = Date.now();
    const r = await orders.transitionOrder(staffActor, order.id, to);
    if (r !== "ok") throw new Error(`transition ${to}: ${r}`);
    await page.waitForFunction((b) => (document.querySelector("main")?.innerText ?? "") !== b, { timeout: 20000 }, before);
    console.log(`customer page saw ${to.padEnd(10)} in ${Date.now() - t0} ms`);
  }
  console.log("customer transport:", [...new Set(mode)].join(" -> "));

  // ---- admin board: a brand new order appears without reload
  const adminPage = await browser.newPage();
  await adminPage.goto(`${base}/admin/orders`, { waitUntil: "networkidle2", timeout: 120000 });
  await new Promise((r) => setTimeout(r, 6000));
  const t0 = Date.now();
  const o2 = await newOrder(customer.id);
  await adminPage.waitForFunction((n) => document.body.innerText.includes(String(n)), { timeout: 20000 }, o2.number);
  console.log(`admin board saw new order #${o2.number} in ${Date.now() - t0} ms`);
  await orders.transitionOrder(staffActor, o2.id, "cancelled", { reason: "duplicate" });
} finally {
  await browser.close();
  await db.query("delete from sessions where ip = 'e2e'");
  await pool().end();
}
