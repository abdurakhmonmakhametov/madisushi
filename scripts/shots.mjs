// Visual smoke test: captures desktop and mobile screenshots with the system
// Chrome (puppeteer-core, no browser download). Usage:
//   node scripts/shots.mjs [baseUrl] [outDir] [path...]
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const base = process.argv[2] || "http://localhost:3000";
const out = process.argv[3] || "screenshots";
const paths = process.argv.slice(4);
const targets = paths.length ? paths : ["/", "/search", "/checkout", "/login"];
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";

fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--hide-scrollbars"] });
try {
  for (const [label, vp] of [
    ["desktop", { width: 1920, height: 1080 }],
    ["mobile", { width: 400, height: 860, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]) {
    const page = await browser.newPage();
    await page.setViewport(vp);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    for (const p of targets) {
      await page.goto(base + p, { waitUntil: "networkidle0", timeout: 60000 });
      await new Promise((r) => setTimeout(r, 400));
      const name = `${label}${p.replace(/[^a-z0-9]+/gi, "_") || "_home"}.png`;
      await page.screenshot({ path: `${out}/${name}` });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      console.log(`${label} ${p}: ${name}${overflow > 0 ? `  HORIZONTAL OVERFLOW ${overflow}px` : ""}`);
    }
    if (errors.length) console.log(`${label} console errors:\n  ${[...new Set(errors)].join("\n  ")}`);
    await page.close();
  }
} finally {
  await browser.close();
}
