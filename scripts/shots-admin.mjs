// Visual smoke test for the admin panel: logs in as the super admin and
// captures desktop + mobile screenshots. Usage:
//   node scripts/shots-admin.mjs [baseUrl] [outDir] [path...]
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const base = process.argv[2] || "http://localhost:3000";
const out = process.argv[3] || "screenshots/admin";
const paths = process.argv.slice(4);
const targets = paths.length ? paths : ["/admin", "/admin/orders", "/admin/menu", "/admin/settings"];
const password = process.env.SEED_STAFF_PASSWORD || "Admin12345!";
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";

fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--hide-scrollbars"] });
try {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${base}/admin/login`, { waitUntil: "networkidle0", timeout: 60000 });
  await page.screenshot({ path: `${out}/desktop_login.png` });
  await page.type('input[name="email"]', "admin@sushi.local");
  await page.type('input[name="password"]', password);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click('button[type="submit"]')]);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [label, vp] of [
    ["desktop", { width: 1440, height: 900 }],
    ["mobile", { width: 400, height: 860, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]) {
    await page.setViewport(vp);
    for (const p of targets) {
      await page.goto(base + p, { waitUntil: "networkidle0", timeout: 60000 });
      await new Promise((r) => setTimeout(r, 300));
      const name = `${label}${p.replace(/[^a-z0-9]+/gi, "_")}.png`;
      await page.screenshot({ path: `${out}/${name}`, fullPage: label === "desktop" });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      console.log(`${label} ${p}: ${name}${overflow > 0 ? `  HORIZONTAL OVERFLOW ${overflow}px` : ""}`);
    }
  }
  if (errors.length) console.log(`console errors:\n  ${[...new Set(errors)].join("\n  ")}`);
} finally {
  await browser.close();
}
