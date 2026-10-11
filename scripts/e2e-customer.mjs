// Browser E2E for the customer ordering flow (system Chrome via puppeteer-core).
//   node scripts/e2e-customer.mjs [baseUrl] [phone]
// Requires a development server (uses the on-screen dev OTP code and the mock payment provider).
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const base = process.argv[2] || "http://localhost:3000";
// a fresh number per run: OTP requests are rate limited per phone
const phone = process.argv[3] || `+998 90 ${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
const out = "screenshots/e2e";
fs.mkdirSync(out, { recursive: true });
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const step = async (name) => {
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log("✓", name, page.url());
};
const clickText = async (selector, text) => {
  const handles = await page.$$(selector);
  for (const h of handles) {
    const t = await h.evaluate((el) => el.textContent?.trim() ?? "");
    if (t.includes(text)) {
      await h.click();
      return;
    }
  }
  throw new Error(`no ${selector} containing "${text}"`);
};

try {
  // 1. Login with phone OTP (development shows the code on screen)
  await page.goto(`${base}/login`, { waitUntil: "networkidle2" });
  const input = await page.waitForSelector('input[type="tel"]');
  await input.click();
  await input.evaluate((el) => el.select());
  await page.keyboard.press("Backspace");
  await input.type(phone);
  await clickText("button", "Kod yuborish");
  await page.waitForSelector('[role="status"]');
  const devText = await page.$eval('[role="status"]', (el) => el.textContent);
  const code = devText.match(/(\d{6})/)[1];
  await page.type('input[autocomplete="one-time-code"]', code);
  await clickText("button", "Tasdiqlash");
  await page.waitForNavigation({ waitUntil: "networkidle2" });
  await step("01-logged-in");

  // 2. Choose an address (Chilonzor) — stored in a cookie read by the server
  await page.evaluate(() => {
    document.cookie = `sushi_addr=${encodeURIComponent(JSON.stringify({ text: "Chilonzor-9 mavzesi", lat: 41.2756, lng: 69.2034 }))}; path=/`;
    localStorage.removeItem("sushi_cart_v1");
  });

  // 3. Restaurant menu: add a simple product, then one with an extra
  await page.goto(`${base}/`, { waitUntil: "networkidle2" });
  await step("02-menu");
  await page.click('button[aria-label="Qo\'shish: Sarimsoqli non"]');
  await page.click('button[aria-label="Ko\'paytirish: Sarimsoqli non"]');
  await page.click('button[aria-label="Qo\'shish: Filadelfiya klassika"]');
  await page.waitForSelector('[role="dialog"]');
  await clickText('[role="dialog"] label', "Soya sousi");
  await step("03-product-modal");
  await clickText('[role="dialog"] button', "Savatga qo'shish");
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  await step("04-cart-filled");

  // 4. Checkout with the DEV mock provider
  await page.goto(`${base}/checkout`, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => /To'lov uchun[\s\S]*\d/.test(document.body.innerText) && !document.body.innerText.includes("—"), { timeout: 20000 }).catch(() => {});
  const nameInput = await page.$('input[autocomplete="name"]');
  if (nameInput && !(await nameInput.evaluate((el) => el.value))) await nameInput.type("E2E Mijoz");
  await page.type('input[placeholder="Uy"]', "12");
  await page.type('input[placeholder="Xonadon"]', "34");
  await clickText('[role="radio"]', "Test to'lov");
  await new Promise((r) => setTimeout(r, 1200));
  await step("05-checkout");
  const total = await page.evaluate(() => {
    const m = document.body.innerText.match(/To'lov uchun\s*([\d\s\u00a0]+)UZS/);
    return m ? m[1].replace(/\D/g, "") : null;
  });
  console.log("  checkout total:", total);
  const placed = await page
    .waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Buyurtma berish" && !b.disabled), { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  if (!placed) {
    const why = await page.evaluate(() => document.querySelector('[role="alert"]')?.textContent ?? "(no alert)");
    throw new Error(`place button never enabled: ${why}`);
  }
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2" }),
    page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Buyurtma berish" && !b.disabled).click()),
  ]);
  await step("06-mock-payment");

  // 5. The provider sends a signed callback; only then is the order paid
  await clickText("button", "Simulate successful payment");
  await page.waitForNavigation({ waitUntil: "networkidle2" });
  await step("07-order-paid");
  const body = await page.evaluate(() => document.body.innerText);
  if (!body.includes("To'langan")) throw new Error("order page does not show paid status");
  const orderUrl = page.url();
  console.log("ORDER_URL", orderUrl);
  fs.writeFileSync(`${out}/last-order.txt`, orderUrl);
  fs.writeFileSync(`${out}/last-phone.txt`, phone);
  // reused by e2e-admin.mjs (a second OTP within 60 s would be rate limited)
  fs.writeFileSync(`${out}/last-cookies.json`, JSON.stringify(await page.cookies()));
} catch (e) {
  await page.screenshot({ path: `${out}/failure.png` });
  console.error("E2E FAILED:", e.message);
  process.exitCode = 1;
} finally {
  if (errors.length) console.log("page errors:", [...new Set(errors)]);
  await browser.close();
}
