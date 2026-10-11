// Mobile (400px) walkthrough: drawer, menu with a filled cart, bottom cart
// sheet and checkout; reports any horizontal overflow.
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const base = process.argv[2] || "http://localhost:3000";
const out = "screenshots/mobile";
fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 400, height: 860, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const shot = async (name) => {
  await new Promise((r) => setTimeout(r, 400));
  // widest element edge beyond the viewport (catches clipped content too)
  const overflow = await page.evaluate(() => {
    let max = document.documentElement.scrollWidth;
    for (const el of document.querySelectorAll("header *, main *")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && !el.closest(".overflow-x-auto, .no-scrollbar, [role=dialog]")) max = Math.max(max, Math.ceil(r.right));
    }
    return max - window.innerWidth;
  });
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(`${name}${overflow > 0 ? `  HORIZONTAL OVERFLOW ${overflow}px` : "  (no horizontal overflow)"}`);
};
try {
  await page.goto(`${base}/`, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("sushi_cart_v1"));
  await shot("01-home");
  await page.click('button[aria-label="Menyu"]');
  await page.waitForSelector('[role="dialog"]');
  await shot("02-drawer");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));

  await page.goto(`${base}/`, { waitUntil: "networkidle0" });
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.click('button[aria-label="Qo\'shish: Sarimsoqli non"]');
  await page.click('button[aria-label="Qo\'shish: Vasabi"]');
  await shot("03-menu-with-cart-bar");
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Savatni ochish")).click());
  await page.waitForSelector('[role="dialog"]');
  await shot("04-cart-sheet");
  await page.goto(`${base}/checkout`, { waitUntil: "networkidle0" });
  await shot("05-checkout-top");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot("06-checkout-bottom");
} finally {
  await browser.close();
}
