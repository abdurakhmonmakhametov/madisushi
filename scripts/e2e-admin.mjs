// Browser E2E for staff workflows (run after e2e-customer.mjs):
//  - branch manager moves the customer's order through the lifecycle
//  - the customer sees the status update
//  - another branch's manager cannot open the order (404)
//  - kitchen staff cannot open menu admin
//  - super admin changes a branch price and the storefront reflects it
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const base = process.argv[2] || "http://localhost:3000";
const password = process.env.SEED_STAFF_PASSWORD || "Admin12345!";
const out = "screenshots/e2e";
const orderUrl = fs.readFileSync(`${out}/last-order.txt`, "utf8").trim();
const orderId = new URL(orderUrl).pathname.split("/").pop();
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });

async function context() {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  return page;
}
async function staffLogin(email) {
  const page = await context();
  await page.goto(`${base}/admin/login`, { waitUntil: "networkidle2" });
  await page.type('input[name="email"]', email);
  await page.type('input[name="password"]', password);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click('button[type="submit"]')]);
  return page;
}
const text = (page) => page.evaluate(() => document.body.innerText.replace(/ /g, " "));
const check = (cond, msg) => {
  if (!cond) throw new Error(msg);
  console.log("✓", msg);
};

try {
  // Branch manager (Chilonzor) processes the order
  const mgr = await staffLogin("manager.chilonzor@sushi.local");
  await mgr.goto(`${base}/admin/orders`, { waitUntil: "networkidle2" });
  await mgr.screenshot({ path: `${out}/10-admin-queue.png` });
  check((await text(mgr)).includes("E2E Mijoz"), "manager sees the new order in the live queue");
  await mgr.goto(`${base}/admin/orders/${orderId}`, { waitUntil: "networkidle2" });
  for (const label of ["Tasdiqlandi", "Tayyorlanmoqda", "Tayyor", "Yo'lda", "Yetkazildi"]) {
    await mgr.evaluate((l) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === l).click(), label);
    await mgr.waitForFunction((l) => ![...document.querySelectorAll("button")].some((b) => b.textContent.trim() === l), { timeout: 15000 }, label);
  }
  await mgr.screenshot({ path: `${out}/11-admin-order-delivered.png` });
  check((await text(mgr)).includes("Buyurtma yakunlangan"), "order reached the final status");

  // Customer sees the update
  const cust = await context();
  await cust.setCookie(...JSON.parse(fs.readFileSync(`${out}/last-cookies.json`, "utf8")));
  await cust.goto(orderUrl.split("?")[0], { waitUntil: "networkidle2" });
  await cust.screenshot({ path: `${out}/12-customer-sees-delivered.png` });
  const ct = await text(cust);
  check(ct.includes("Yetkazildi") && ct.includes("Qayta buyurtma"), "customer sees 'Yetkazildi' and can reorder");
  check(/\+\d[\d\s\u00a0]*UZS · Loyallik/.test(ct), "loyalty cashback was credited on completion");

  // Another branch's manager cannot see it
  const other = await staffLogin("manager.yunusobod@sushi.local");
  const res = await other.goto(`${base}/admin/orders/${orderId}`, { waitUntil: "networkidle2" });
  check(res.status() === 404, "Yunusobod manager gets 404 for a Chilonzor order");
  await other.goto(`${base}/admin/orders?view=all`, { waitUntil: "networkidle2" });
  check(!(await text(other)).includes("E2E Mijoz"), "Yunusobod manager's order list excludes it");

  // Kitchen cannot reach menu admin
  const kitchen = await staffLogin("kitchen.chilonzor@sushi.local");
  await kitchen.goto(`${base}/admin/menu`, { waitUntil: "networkidle2" });
  check(new URL(kitchen.url()).pathname === "/admin/orders", "kitchen is redirected away from menu admin");

  // Super admin changes the Chilonzor price of Chiz roll; storefront reflects it
  const admin = await staffLogin("admin@sushi.local");
  await admin.goto(`${base}/admin/availability?q=Chiz`, { waitUntil: "networkidle2" });
  await admin.evaluate(() => {
    const row = [...document.querySelectorAll("li")].find((r) => r.textContent.includes("Chiz roll"));
    const price = row.querySelector('input[name="price"]');
    price.value = "51000";
    price.dispatchEvent(new Event("input", { bubbles: true }));
    price.form.querySelector('button[type="submit"]').click();
  });
  await admin.waitForFunction(() => document.body.innerText.includes("Saqlandi"), { timeout: 15000 });
  const shop = await context();
  await shop.goto(`${base}/?branch=chilonzor`, { waitUntil: "networkidle2" });
  check((await text(shop)).includes("51 000 UZS"), "storefront shows the new branch price (51 000 UZS)");
  // restore
  await admin.evaluate(() => {
    const row = [...document.querySelectorAll("li")].find((r) => r.textContent.includes("Chiz roll"));
    const price = row.querySelector('input[name="price"]');
    price.value = "";
    price.form.querySelector('button[type="submit"]').click();
  });
  await new Promise((r) => setTimeout(r, 1500));
  await admin.goto(`${base}/admin`, { waitUntil: "networkidle2" });
  await admin.screenshot({ path: `${out}/13-admin-dashboard.png` });
  console.log("ADMIN E2E PASSED");
} catch (e) {
  console.error("ADMIN E2E FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
