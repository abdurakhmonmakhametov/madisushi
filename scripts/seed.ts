// Seeds data for the Sushi Madi restaurant: 3 branches, zones, hours, the menu
// board (rolls, FAMILY SET, sides), promos, content, staff and a demo customer.
// Phones and addresses are invented. Menu photos are cropped from the menu board
// and live in public/menu/; other images are generated SVG placeholders written
// to public/seed/; the logo lives in public/brand/.
//
// Usage: npm run db:seed   (refuses to run against non-local databases
//                           unless SEED_ALLOW_REMOTE=true)
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { loadEnv } from "./env";
import { foodSvg, type FoodKind } from "./placeholders";
import { circlePolygon } from "../src/lib/geo";
import { hashPassword } from "../src/lib/auth/password";

loadEnv();

type T = { uz: string; ru: string };
const t = (uz: string, ru: string): T => ({ uz, ru });

interface ProductSeed {
  slug: string;
  cat: string;
  image?: string; // real photo under public/; falls back to a generated SVG
  name: T;
  price: number;
  kind: FoodKind;
  desc?: T;
  ingr?: T;
  allergens?: string[];
  weight?: number;
  badges?: string[];
  pack?: number;
  variants?: { name: T; options: { name: T; delta: number; def?: boolean }[] };
  extras?: { name: T; max: number; options: { name: T; delta: number }[] };
}

interface BrandSeed {
  slug: string;
  name: string;
  logo: string; // public URL of the logo image
  accent: string;
  tagline: T;
  description: T;
  cuisines: string[];
  hours: { open: string; close: string; friSat?: string };
  branches: { slug: string; name: T; address: T; lat: number; lng: number; phone: string; prep: number; delivery: number; capacity: number }[];
  categories: { slug: string; name: T; icon: string; children?: { slug: string; name: T }[] }[];
  products: ProductSeed[];
}

// Sauces and sides sold alongside the rolls, at the menu board prices.
const SAUCE_EXTRAS = {
  name: t("Qo'shimchalar", "Дополнения"),
  max: 3,
  options: [
    { name: t("Soya sousi", "Соевый соус"), delta: 5000 },
    { name: t("Zanjabil", "Имбирь"), delta: 5000 },
    { name: t("Vasabi", "Васаби"), delta: 5000 },
  ],
};

const BRANDS: BrandSeed[] = [
  {
    slug: "sushi-madi",
    name: "Sushi Madi",
    logo: "/brand/sushi-madi-emblem.png",
    accent: "#D7282F",
    tagline: t("Yangi • Mazali • Siz uchun tayyorlangan", "Свежо • Вкусно • Приготовлено для вас"),
    description: t("Sushi Madi — yapon oshxonasi restorani. Har kuni yangi baliq va qo'lda tayyorlangan rollar.", "Sushi Madi — ресторан японской кухни. Свежая рыба и роллы ручной работы каждый день."),
    cuisines: ["rollar", "sushi"],
    hours: { open: "10:00", close: "02:00" },
    branches: [
      { slug: "chilonzor", name: t("Chilonzor", "Чиланзар"), address: t("Chilonzor tumani, Bunyodkor shoh ko'chasi, 12", "Чиланзарский район, проспект Бунёдкор, 12"), lat: 41.2756, lng: 69.2034, phone: "+998710000101", prep: 25, delivery: 35, capacity: 40 },
      { slug: "yunusobod", name: t("Yunusobod", "Юнусабад"), address: t("Yunusobod tumani, Amir Temur ko'chasi, 108", "Юнусабадский район, улица Амира Темура, 108"), lat: 41.3646, lng: 69.2864, phone: "+998710000102", prep: 25, delivery: 35, capacity: 60 },
      { slug: "sergeli", name: t("Sergeli", "Сергели"), address: t("Sergeli tumani, Yangi Sergeli ko'chasi, 5", "Сергелийский район, улица Янги Сергели, 5"), lat: 41.2229, lng: 69.2206, phone: "+998710000103", prep: 30, delivery: 40, capacity: 30 },
    ],
    categories: [
      { slug: "rollar", name: t("Rollar", "Роллы"), icon: "🍣", children: [{ slug: "klassik-rollar", name: t("Klassik rollar", "Классические роллы") }, { slug: "pishirilgan-rollar", name: t("Pishirilgan rollar", "Запечённые роллы") }] },
      { slug: "setlar", name: t("Setlar", "Сеты"), icon: "🍱" },
      { slug: "qoshimchalar", name: t("Qo'shimchalar", "Дополнения"), icon: "🥢" },
    ],
    products: [
      { slug: "karamel-ugor", cat: "klassik-rollar", name: t("Karamel ugor", "Карамельный угорь"), price: 100000, kind: "roll", image: "/menu/karamel-ugor.png", desc: t("8 dona. Karamel sousidagi dudlangan ugor.", "8 шт. Копчёный угорь в карамельном соусе."), allergens: ["fish", "soy", "sesame"], badges: ["bestseller"], extras: SAUCE_EXTRAS },
      { slug: "filadelfiya", cat: "klassik-rollar", name: t("Filadelfiya klassika", "Филадельфия классика"), price: 88000, kind: "roll", image: "/menu/filadelfiya.png", desc: t("8 dona. Yangi losos va krem-pishloq.", "8 шт. Свежий лосось и сливочный сыр."), allergens: ["fish", "milk"], badges: ["bestseller"], extras: SAUCE_EXTRAS },
      { slug: "tempura-tovuq", cat: "klassik-rollar", name: t("Tempura tovuq bilan", "Темпура с курицей"), price: 85000, kind: "roll", image: "/menu/tempura-tovuq.png", desc: t("8 dona. Qarsildoq tempura qobigʻidagi tovuqli roll.", "8 шт. Ролл с курицей в хрустящей темпуре."), allergens: ["gluten", "egg", "milk"], extras: SAUCE_EXTRAS },
      { slug: "tempura-losos", cat: "klassik-rollar", name: t("Tempura losos bilan", "Темпура с лососем"), price: 90000, kind: "roll", image: "/menu/tempura-losos.png", desc: t("8 dona. Qarsildoq tempura qobigʻidagi losos.", "8 шт. Лосось в хрустящей темпуре."), allergens: ["fish", "gluten", "egg", "milk"], extras: SAUCE_EXTRAS },
      { slug: "chiz-roll", cat: "klassik-rollar", name: t("Chiz roll", "Чиз ролл"), price: 75000, kind: "roll", image: "/menu/chiz-roll.png", desc: t("8 dona. Krem-pishloqli yumshoq roll.", "8 шт. Нежный ролл со сливочным сыром."), allergens: ["milk", "sesame"], extras: SAUCE_EXTRAS },
      { slug: "dabl-chiz", cat: "klassik-rollar", name: t("Dabl chiz", "Дабл чиз"), price: 85000, kind: "roll", image: "/menu/dabl-chiz.png", desc: t("8 dona. Ikki xil pishloqli roll.", "8 шт. Ролл с двойным сыром."), allergens: ["milk", "sesame"], extras: SAUCE_EXTRAS },
      { slug: "chiz-sezar", cat: "klassik-rollar", name: t("Chiz Sezar", "Чиз Цезарь"), price: 70000, kind: "roll", image: "/menu/chiz-sezar.png", desc: t("8 dona. Tovuq, pishloq va Sezar sousi.", "8 шт. Курица, сыр и соус Цезарь."), allergens: ["milk", "egg", "gluten"], extras: SAUCE_EXTRAS },
      { slug: "chiz-sezar-2x2", cat: "klassik-rollar", name: t("Chiz Sezar 2×2", "Чиз Цезарь 2×2"), price: 80000, kind: "roll", image: "/menu/chiz-sezar-2x2.png", desc: t("8 dona. Sezar rolining toʻldirilgan varianti.", "8 шт. Усиленная версия ролла Цезарь."), allergens: ["milk", "egg", "gluten"], extras: SAUCE_EXTRAS },
      { slug: "kaliforniya-kunjut", cat: "klassik-rollar", name: t("Kaliforniya kunjut bilan", "Калифорния с кунжутом"), price: 70000, kind: "roll", image: "/menu/kaliforniya-kunjut.png", desc: t("8 dona. Kunjutli Kaliforniya roli.", "8 шт. Калифорния в кунжуте."), allergens: ["shellfish", "sesame", "egg"], extras: SAUCE_EXTRAS },
      { slug: "kaliforniya", cat: "klassik-rollar", name: t("Kaliforniya", "Калифорния"), price: 75000, kind: "roll", image: "/menu/kaliforniya.png", desc: t("8 dona. Tobiko ikrasidagi klassik Kaliforniya.", "8 шт. Классическая Калифорния в икре тобико."), allergens: ["shellfish", "fish", "egg"], badges: ["bestseller"], extras: SAUCE_EXTRAS },
      { slug: "pishirilgan-tovuq", cat: "pishirilgan-rollar", name: t("Tovuqli pishirilgan roll", "Запечённый с курицей"), price: 68000, kind: "roll", image: "/menu/pishirilgan-tovuq.png", desc: t("10 dona. Pishloqli qobiq ostida pishirilgan tovuq.", "10 шт. Курица, запечённая под сырной шапкой."), allergens: ["milk", "egg", "gluten"], extras: SAUCE_EXTRAS },
      { slug: "krab-pishirilgan", cat: "pishirilgan-rollar", name: t("Krabli pishirilgan roll", "Крабовый запечённый"), price: 72000, kind: "roll", image: "/menu/krab-pishirilgan.png", desc: t("10 dona. Krab goʻshti va pishloqli qobiq.", "10 шт. Крабовое мясо под сырной шапкой."), allergens: ["shellfish", "milk", "egg"], extras: SAUCE_EXTRAS },
      { slug: "pishirilgan-losos", cat: "pishirilgan-rollar", name: t("Losos bilan pishirilgan roll", "Запечённый с лососем"), price: 75000, kind: "roll", image: "/menu/pishirilgan-losos.png", desc: t("10 dona. Pishloqli qobiq ostida pishirilgan losos.", "10 шт. Лосось, запечённый под сырной шапкой."), allergens: ["fish", "milk", "egg"], badges: ["bestseller"], extras: SAUCE_EXTRAS },
      { slug: "family-set", cat: "setlar", name: t("FAMILY SET", "FAMILY SET"), price: 260000, kind: "set", image: "/menu/family-set.png", desc: t("Jami 44 dona. Sovgʻa: sarimsoqli non va Coca-Cola 2 l.", "Всего 44 шт. Бонус: чесночный хлеб и Coca-Cola 2 л."), ingr: t("Tovuqli pishirilgan roll — 10 dona, krabli pishirilgan roll — 10 dona, Filadelfiya klassika — 8 dona, Kaliforniya — 8 dona, tempura — 8 dona", "Запечённый с курицей — 10 шт, крабовый запечённый — 10 шт, Филадельфия классика — 8 шт, Калифорния — 8 шт, темпура — 8 шт"), allergens: ["fish", "shellfish", "milk", "egg", "gluten", "sesame"], badges: ["bestseller"], extras: SAUCE_EXTRAS },
      { slug: "sarimsoqli-non", cat: "qoshimchalar", name: t("Sarimsoqli non", "Чесночный хлеб"), price: 20000, kind: "bao", image: "/menu/sarimsoqli-non.png", desc: t("6 dona. Sarimsoq va koʻkat bilan.", "6 шт. С чесноком и зеленью."), allergens: ["gluten", "milk"] },
      { slug: "soya-sous", cat: "qoshimchalar", name: t("Soya sousi", "Соевый соус"), price: 5000, kind: "drink", image: "/menu/soya-sous.png", desc: t("1 dona.", "1 шт."), allergens: ["soy"] },
      { slug: "zanjabil", cat: "qoshimchalar", name: t("Zanjabil", "Имбирь"), price: 5000, kind: "salad", image: "/menu/zanjabil.png", desc: t("1 dona. Marinadlangan zanjabil.", "1 шт. Маринованный имбирь."), allergens: [] },
      { slug: "vasabi", cat: "qoshimchalar", name: t("Vasabi", "Васаби"), price: 5000, kind: "salad", image: "/menu/vasabi.png", desc: t("1 dona.", "1 шт."), allergens: [], badges: ["spicy"] },
    ],
  },
];

const CUISINES: [string, T][] = [
  ["rollar", t("Rollar", "Роллы")],
  ["salatlar", t("Salatlar", "Салаты")],
  ["shirinliklar", t("Shirinliklar", "Десерты")],
  ["bolalarga", t("Bolalarga", "Детям")],
  ["kocha-taomlari", t("Ko'cha taomlari", "Стрит-фуд")],
  ["sushi", t("Sushi", "Суши")],
  ["pitsa", t("Pitsa", "Пицца")],
  ["wok", t("WOK", "WOK")],
  ["ramen", t("Ramen", "Рамен")],
  ["sho-rvalar", t("Sho'rvalar", "Супы")],
];

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost"].includes(host) && process.env.SEED_ALLOW_REMOTE !== "true") {
    throw new Error("Refusing to seed a non-local database (set SEED_ALLOW_REMOTE=true to override)");
  }
  const c = new Client({ connectionString: url, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });
  await c.connect();
  const q = async <R = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await c.query(sql, params)).rows as R[];
  const one = async <R = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await q<R>(sql, params))[0];

  const outDir = path.resolve("public/seed");
  fs.mkdirSync(outDir, { recursive: true });
  const write = (name: string, svg: string) => {
    fs.writeFileSync(path.join(outDir, name), svg);
    return `/seed/${name}`;
  };

  await q("begin");
  await q(`truncate public.audit_logs, public.feedback, public.content_items, public.reservations, public.loyalty_transactions,
           public.promo_redemptions, public.payment_events, public.payments, public.order_status_history, public.order_items,
           public.orders, public.promotions, public.promo_code_brands, public.promo_codes, public.rate_limits, public.otp_codes,
           public.sessions, public.staff_branches, public.staff_credentials, public.staff, public.customer_addresses,
           public.customers, public.branch_products, public.product_options, public.product_option_groups, public.products,
           public.categories, public.delivery_zones, public.branch_closures, public.branch_hours, public.branches,
           public.brand_cuisines, public.brands, public.cuisines, public.settings cascade`);

  // settings
  const settings: [string, unknown, boolean][] = [
    ["branding", { platformName: "Sushi Madi", logoUrl: "/brand/sushi-madi-emblem.png", primaryColor: "#D7282F", footerText: t("Yangi • Mazali • Siz uchun tayyorlangan. Rollar va setlar — eshigingizgacha.", "Свежо • Вкусно • Для вас. Роллы и сеты — до вашей двери.") }, true],
    ["contacts", { phone: "+998 71 000 00 00", email: "hello@sushimadi.example", address: t("Toshkent shahri, Amir Temur ko'chasi, 1", "г. Ташкент, улица Амира Темура, 1"), hours: t("Har kuni 10:00 dan 02:00 gacha", "Каждый день с 10:00 до 02:00"), telegram: "@sushimadi", instagram: "@sushi.madi" }, true],
    ["languages", { default: "uz", enabled: ["uz", "ru"] }, true],
    ["loyalty", { enabled: true, earn_bps: 500, max_spend_amount: 20000, max_spend_bps: 3000 }, true],
    ["scheduling", { slot_minutes: 15, max_days_ahead: 3 }, true],
    ["checkout", { leave_at_door_enabled: true, order_for_other_enabled: true, delivery_info_note: t("Agar yetkazib berish manzili TXAY tashqarisida joylashgan bo'lsa, hudud ustamasi qo'shiladi.", "Если адрес доставки находится за КАД, добавляется надбавка за зону.") }, true],
    ["notifications", { new_order_email: "", telegram_chat_id: "", notify_on_new_order: true, notify_on_reservation: true }, false],
    ["home", { show_promotions: true, show_bestsellers: true, bestsellers_limit: 10, show_welcome_slide: true }, true],
  ];
  for (const [k, v, pub] of settings) await q("insert into public.settings (key, value, is_public) values ($1, $2, $3)", [k, JSON.stringify(v), pub]);

  const cuisineIds = new Map<string, string>();
  for (const [i, [slug, name]] of CUISINES.entries()) {
    const r = await one<{ id: string }>("insert into public.cuisines (slug, name, sort) values ($1, $2, $3) returning id", [slug, name, i]);
    cuisineIds.set(slug, r.id);
  }

  const branchIds = new Map<string, string>();
  const productIds = new Map<string, string>();
  const brandIds = new Map<string, string>();
  let img = 0;
  for (const [bi, b] of BRANDS.entries()) {
    const logo = b.logo;
    const brand = await one<{ id: string }>(
      "insert into public.brands (slug, name, tagline, description, logo_url, accent_color, phone, sort) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id",
      [b.slug, b.name, b.tagline, b.description, logo, b.accent, b.branches[0].phone, bi],
    );
    brandIds.set(b.slug, brand.id);
    for (const cs of b.cuisines) await q("insert into public.brand_cuisines values ($1, $2)", [brand.id, cuisineIds.get(cs)]);

    for (const [ri, br] of b.branches.entries()) {
      const row = await one<{ id: string }>(
        `insert into public.branches (brand_id, slug, name, address, lat, lng, phone, prep_minutes, delivery_minutes, reservation_capacity, sort)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
        [brand.id, br.slug, br.name, br.address, br.lat, br.lng, br.phone, br.prep, br.delivery, br.capacity, ri],
      );
      branchIds.set(`${b.slug}/${br.slug}`, row.id);
      for (let wd = 1; wd <= 7; wd++) {
        const open = minutes(b.hours.open);
        let close = minutes(b.hours.close === "00:00" ? "24:00" : b.hours.close);
        if (b.hours.friSat && (wd === 5 || wd === 6)) close = 1440 + minutes(b.hours.friSat);
        if (close <= open) close += 1440;
        await q("insert into public.branch_hours values ($1, $2, $3, $4)", [row.id, wd, open, close]);
      }
      const center: [number, number] = [br.lat, br.lng];
      await q(
        "insert into public.delivery_zones (branch_id, name, polygon, fee, min_order, free_delivery_from, priority) values ($1,$2,$3,$4,$5,$6,$7)",
        [row.id, t("Yaqin hudud", "Ближняя зона"), JSON.stringify(circlePolygon(center, 4500)), 12000, 50000, 250000, 10],
      );
      await q(
        "insert into public.delivery_zones (branch_id, name, polygon, fee, min_order, free_delivery_from, priority, extra_minutes) values ($1,$2,$3,$4,$5,$6,$7,$8)",
        [row.id, t("Shahar hududi", "Городская зона"), JSON.stringify(circlePolygon(center, 11000)), 18000, 80000, 400000, 5, 15],
      );
      if (ri === 0) {
        await q(
          `insert into public.delivery_zones (branch_id, name, polygon, fee, min_order, surcharge, surcharge_note, priority, extra_minutes)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            row.id,
            t("TXAY tashqarisi", "За КАД"),
            JSON.stringify(circlePolygon([41.3111, 69.2797], 26000, 24)),
            18000,
            120000,
            25000,
            t("Yetkazib berish manzili TXAY tashqarisida: kuryerga qo'shimcha 25 000 so'm ustama qo'shildi.", "Адрес доставки за КАД: добавлена надбавка 25 000 сум."),
            0,
            30,
          ],
        );
      }
    }

    const catIds = new Map<string, string>();
    for (const [ci, cat] of b.categories.entries()) {
      const r = await one<{ id: string }>("insert into public.categories (brand_id, slug, name, icon, sort) values ($1,$2,$3,$4,$5) returning id", [brand.id, cat.slug, cat.name, cat.icon, ci]);
      catIds.set(cat.slug, r.id);
      for (const [si, sub] of (cat.children ?? []).entries()) {
        const s = await one<{ id: string }>("insert into public.categories (brand_id, parent_id, slug, name, sort) values ($1,$2,$3,$4,$5) returning id", [brand.id, r.id, sub.slug, sub.name, si]);
        catIds.set(sub.slug, s.id);
      }
    }

    for (const [pi, p] of b.products.entries()) {
      const image = p.image ?? write(`${b.slug}-${p.slug}.svg`, foodSvg(p.kind, img++, p.name.uz, b.accent));
      const r = await one<{ id: string }>(
        `insert into public.products (brand_id, category_id, slug, name, description, ingredients, allergens, weight_grams, base_price, packaging_fee, image_url, badges, sort)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
        [brand.id, catIds.get(p.cat), p.slug, p.name, p.desc ?? t("", ""), p.ingr ?? p.desc ?? t("", ""), p.allergens ?? [], p.weight ?? null, p.price, p.pack ?? 0, image, p.badges ?? [], pi],
      );
      productIds.set(`${b.slug}/${p.slug}`, r.id);
      if (p.variants) {
        const g = await one<{ id: string }>("insert into public.product_option_groups (product_id, kind, name, min_select, max_select, sort) values ($1,'variant',$2,1,1,0) returning id", [r.id, p.variants.name]);
        for (const [oi, o] of p.variants.options.entries()) {
          await q("insert into public.product_options (group_id, name, price_delta, is_default, sort) values ($1,$2,$3,$4,$5)", [g.id, o.name, o.delta, !!o.def, oi]);
        }
      }
      if (p.extras) {
        const g = await one<{ id: string }>("insert into public.product_option_groups (product_id, kind, name, min_select, max_select, sort) values ($1,'extra',$2,0,$3,1) returning id", [r.id, p.extras.name, p.extras.max]);
        for (const [oi, o] of p.extras.options.entries()) {
          await q("insert into public.product_options (group_id, name, price_delta, sort) values ($1,$2,$3,$4)", [g.id, o.name, o.delta, oi]);
        }
      }
    }

    // service items offered in every cart
    const bag = write(`${b.slug}-bag.svg`, foodSvg("bag", 2, "Bag", b.accent));
    await q(
      `insert into public.products (brand_id, kind, slug, name, description, base_price, image_url, default_in_cart, sort) values
       ($1,'cutlery','chop',$2,$3,5000,$4,false,900), ($1,'packaging','paket',$5,$6,2000,$7,true,901)`,
      [brand.id, t("Chop (tayoqchalar)", "Чоп (палочки)"), t("Bir martalik tayoqchalar, 1 dona", "Одноразовые палочки, 1 шт."), "/menu/chop.png", t("Paket", "Пакет"), t("Brendli qog'oz paket", "Фирменный бумажный пакет"), bag],
    );
  }

  // branch-specific overrides: price and a stop-list item
  await q("insert into public.branch_products (branch_id, product_id, price_override) values ($1, $2, 92000)", [branchIds.get("sushi-madi/yunusobod"), productIds.get("sushi-madi/filadelfiya")]);
  await q("insert into public.branch_products (branch_id, product_id, is_available) values ($1, $2, false)", [branchIds.get("sushi-madi/sergeli"), productIds.get("sushi-madi/karamel-ugor")]);
  // a holiday closure a week ahead for one branch
  await q("insert into public.branch_closures (branch_id, date, reason) values ($1, (now() at time zone 'Asia/Tashkent')::date + 7, $2)", [branchIds.get("sushi-madi/sergeli"), t("Sanitariya kuni", "Санитарный день")]);

  // promo codes
  const promo = async (code: string, kind: string, value: number, extra: Record<string, unknown> = {}) =>
    one<{ id: string }>(
      `insert into public.promo_codes (code, description, kind, value, max_discount, min_subtotal, starts_at, ends_at, usage_limit_total, usage_limit_per_customer)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [code, extra.description ?? t("", ""), kind, value, extra.max ?? null, extra.min ?? 0, extra.starts ?? null, extra.ends ?? null, extra.total ?? null, extra.perCustomer ?? null],
    );
  const welcome = await promo("WELCOME10", "percent", 10, { description: t("Birinchi buyurtmaga 10% chegirma", "Скидка 10% на первый заказ"), max: 30000, min: 80000, perCustomer: 1 });
  const sushi20 = await promo("MADI20K", "fixed", 20000, { description: t("150 000 so'mdan buyurtmaga 20 000 so'm chegirma", "Скидка 20 000 сум на заказ от 150 000 сум"), min: 150000, total: 100 });
  await promo("SUMMER15", "percent", 15, { description: t("Yozgi aksiya (tugagan)", "Летняя акция (завершена)"), starts: "2026-06-01T00:00:00+05:00", ends: "2026-09-01T00:00:00+05:00" });
  await promo("ONEUSE", "fixed", 10000, { description: t("Bir martalik kod", "Одноразовый код"), total: 1 });

  const promoImg1 = "/menu/filadelfiya.png";
  const promoImg2 = "/menu/karamel-ugor.png";
  const promoImg3 = "/menu/family-set.png";
  await q(
    `insert into public.promotions (title, body, image_url, brand_id, promo_code_id, status, sort) values
     ($1,$2,$3,null,$4,'published',0), ($5,$6,$7,$8,$9,'published',1), ($10,$11,$12,$13,null,'published',2), ($14,$15,$16,null,null,'draft',3)`,
    [
      t("Birinchi buyurtmaga −10%", "−10% на первый заказ"), t("WELCOME10 promokodi bilan 80 000 so'mdan buyurtmalarga.", "С промокодом WELCOME10 на заказы от 80 000 сум."), promoImg1, welcome.id,
      t("20 000 so'm sovg'a", "20 000 сум в подарок"), t("MADI20K kodi 150 000 so'mdan buyurtmalar uchun.", "Код MADI20K для заказов от 150 000 сум."), promoImg2, brandIds.get("sushi-madi"), sushi20.id,
      t("Setlar kuni", "День сетов"), t("Har payshanba — katta setlarga maxsus narxlar.", "Каждый четверг — особые цены на большие сеты."), promoImg3, brandIds.get("sushi-madi"),
      t("Qoralama aksiya", "Черновик акции"), t("Bu aksiya hali e'lon qilinmagan.", "Эта акция ещё не опубликована."), promoImg1,
    ],
  );

  // content
  const page = async (kind: string, slug: string, title: T, body: T, extra: { excerpt?: T; image?: string; status?: string; sort?: number } = {}) =>
    q(
      `insert into public.content_items (kind, slug, title, excerpt, body, image_url, status, published_at, sort)
       values ($1,$2,$3,$4,$5,$6,$7, case when $7 = 'published' then now() end, $8)`,
      [kind, slug, title, extra.excerpt ?? t("", ""), body, extra.image ?? null, extra.status ?? "published", extra.sort ?? 0],
    );
  // home carousel banners: title = heading, excerpt = subtitle, body = button text, link_url = button link
  const banner = (slug: string, title: T, excerpt: T, button: T, image: string, link: string, sort: number) =>
    q(
      `insert into public.content_items (kind, slug, title, excerpt, body, image_url, link_url, status, published_at, sort)
       values ('banner',$1,$2,$3,$4,$5,$6,'published',now(),$7)`,
      [slug, title, excerpt, button, image, link, sort],
    );
  await banner("banner-family-set", t("Katta oila uchun katta set", "Большой сет для большой семьи"), t("Family set — 4 kishilik rollar to'plami, butun oila uchun yetarli.", "Family set — набор роллов на 4 персоны, хватит на всю семью."), t("Setlarni ko'rish", "Смотреть сеты"), promoImg3, "/promotions", 1);
  await banner("banner-welcome10", t("Birinchi buyurtmaga −10%", "−10% на первый заказ"), t("WELCOME10 promokodini savatda yozing.", "Введите промокод WELCOME10 в корзине."), t("Aksiyalar", "Акции"), promoImg1, "/promotions", 2);
  await page("page", "about", t("Biz haqimizda", "О нас"), t("Sushi Madi — Toshkentdagi yapon oshxonasi restorani.\n\nHar kuni yangi baliq, qo'lda tayyorlangan rollar va tez yetkazib berish. Bizning shiorimiz: yangi, mazali va siz uchun tayyorlangan.", "Sushi Madi — ресторан японской кухни в Ташкенте.\n\nСвежая рыба каждый день, роллы ручной работы и быстрая доставка. Наш девиз: свежо, вкусно и приготовлено для вас."));
  await page("page", "contacts", t("Kontaktlar", "Контакты"), t("Qo'llab-quvvatlash: +998 71 000 00 00\nEmail: hello@sushimadi.example\nHar kuni 10:00 dan 02:00 gacha.", "Поддержка: +998 71 000 00 00\nEmail: hello@sushimadi.example\nЕжедневно с 10:00 до 02:00."));
  await page("page", "delivery-payment", t("Yetkazish va to'lov", "Доставка и оплата"), t("Yetkazib berish narxi va minimal buyurtma summasi manzilingiz joylashgan hududga bog'liq va buyurtma berishda ko'rsatiladi.\n\nTo'lov: naqd pul, kuryerga karta orqali yoki onlayn (Click, Payme).\n\nTXAY tashqarisidagi manzillar uchun hudud ustamasi qo'llaniladi.", "Стоимость доставки и минимальная сумма зависят от зоны вашего адреса и показываются при оформлении.\n\nОплата: наличными, картой курьеру или онлайн (Click, Payme).\n\nДля адресов за КАД применяется надбавка за зону."));
  const legal: [string, T][] = [
    ["terms", t("Kelishuv qoidalari", "Пользовательское соглашение")],
    ["offer", t("Ommaviy taklif", "Публичная оферта")],
    ["loyalty-offer", t("Loyallik dasturi ommaviy taklifi", "Публичная оферта программы лояльности")],
    ["legal-info", t("Yuridik ma'lumotlar", "Юридическая информация")],
    ["returns", t("Mahsulotlarni qaytarish va to'lov qaytarish qoidalari", "Правила возврата товаров и денежных средств")],
    ["delivery-terms", t("Yetkazib berish va to'lov shartlari", "Условия доставки и оплаты")],
  ];
  for (const [i, [slug, title]] of legal.entries()) {
    await page("legal", slug, title, t("Bu namunaviy matn. Haqiqiy yuridik hujjat bilan almashtiring (Admin → Kontent).", "Это образец текста. Замените настоящим юридическим документом (Админка → Контент)."), { sort: i });
  }
  await page("news", "yangi-filial-sergeli", t("Sergelida yangi filial ochildi", "Открылся новый филиал в Сергели"), t("Sushi Madi endi Sergeli tumanida ham. Yaqin hududga yetkazib berish — 12 000 so'm.", "Sushi Madi теперь и в Сергели. Доставка в ближней зоне — 12 000 сум."), { excerpt: t("Sushi Madi Sergelida", "Sushi Madi в Сергели"), image: write("news-1.svg", foodSvg("set", 21, "News")) });
  await page("news", "setlar-kuni", t("Payshanba — setlar kuni", "Четверг — день сетов"), t("Har payshanba katta setlarga maxsus narxlar.", "Каждый четверг особые цены на большие сеты."), { excerpt: t("Har payshanba", "Каждый четверг"), image: write("news-2.svg", foodSvg("set", 22, "News")) });
  await page("recipe", "uyda-miso-shorva", t("Uyda miso sho'rva", "Мисо-суп дома"), t("1. 800 ml suvni qaynating.\n2. Dashi qo'shing.\n3. Olovni o'chirib, 3 osh qoshiq miso pastasini eriting.\n4. Tofu va vakame qo'shing.", "1. Доведите 800 мл воды до кипения.\n2. Добавьте даси.\n3. Снимите с огня и растворите 3 ст. л. мисо-пасты.\n4. Добавьте тофу и вакамэ."), { excerpt: t("15 daqiqada", "За 15 минут"), image: write("recipe-1.svg", foodSvg("soup", 23, "Recipe")) });
  await page("recipe", "teriyaki-sousi", t("Teriyaki sousi", "Соус терияки"), t("Soya sousi, mirin va shakarni teng miqdorda aralashtirib, quyuqlashguncha qaynating.", "Смешайте соевый соус, мирин и сахар в равных частях и уварите до густоты."), { excerpt: t("3 ta ingredient", "3 ингредиента"), image: write("recipe-2.svg", foodSvg("chicken", 24, "Recipe")) });
  await page("vacancy", "oshpaz-sushi", t("Sushi oshpazi", "Сушист"), t("Tajriba: 1 yildan. Jadval: 2/2. Aloqa: hr@sushimadi.example", "Опыт от 1 года. График 2/2. Контакт: hr@sushimadi.example"), { excerpt: t("Chilonzor, Yunusobod", "Чиланзар, Юнусабад") });
  await page("vacancy", "kuryer", t("Kuryer", "Курьер"), t("Shaxsiy transport bilan. Kunlik to'lov.", "С личным транспортом. Ежедневные выплаты."), { excerpt: t("Barcha filiallar", "Все филиалы") });
  const faqs: [T, T][] = [
    [t("Yetkazib berish qancha turadi?", "Сколько стоит доставка?"), t("Narx manzilingiz hududiga bog'liq va savatda ko'rsatiladi.", "Цена зависит от зоны вашего адреса и видна в корзине.")],
    [t("Buyurtmani bekor qilsa bo'ladimi?", "Можно ли отменить заказ?"), t("Restoran tasdiqlagunga qadar — ha, buyurtma sahifasidan.", "Да, пока ресторан не подтвердил заказ — на странице заказа.")],
    [t("Keshbek qanday ishlaydi?", "Как работает кешбэк?"), t("Har bir yakunlangan va to'langan buyurtmadan 5% balansga qaytadi.", "5% с каждого завершённого и оплаченного заказа возвращается на баланс.")],
  ];
  for (const [i, [title, body]] of faqs.entries()) await page("faq", `faq-${i + 1}`, title, body, { sort: i });
  const galleryKinds: FoodKind[] = ["set", "roll", "nigiri", "soup", "noodles", "mochi"];
  for (const [i, k] of galleryKinds.entries()) await page("gallery", `gallery-${i + 1}`, t(`Galereya ${i + 1}`, `Галерея ${i + 1}`), t("", ""), { image: write(`gallery-${i + 1}.svg`, foodSvg(k, 30 + i, "Gallery")), sort: i });

  // staff
  const password = process.env.SEED_STAFF_PASSWORD || "Admin12345!";
  const hash = await hashPassword(password);
  const staff = async (email: string, name: string, role: string, branches: string[]) => {
    const s = await one<{ id: string }>("insert into public.staff (email, name, role) values ($1,$2,$3) returning id", [email, name, role]);
    await q("insert into public.staff_credentials (staff_id, password_hash) values ($1, $2)", [s.id, hash]);
    for (const b of branches) await q("insert into public.staff_branches values ($1, $2)", [s.id, branchIds.get(b)]);
    return s.id;
  };
  const superId = await staff("admin@sushi.local", "Super Admin", "super_admin", []);
  await staff("manager.chilonzor@sushi.local", "Chilonzor menejeri", "branch_manager", ["sushi-madi/chilonzor"]);
  await staff("manager.yunusobod@sushi.local", "Yunusobod menejeri", "branch_manager", ["sushi-madi/yunusobod"]);
  await staff("kitchen.chilonzor@sushi.local", "Chilonzor oshxonasi", "kitchen", ["sushi-madi/chilonzor"]);

  // demo customer with a welcome loyalty bonus (audited adjustment)
  const cust = await one<{ id: string }>("insert into public.customers (phone, name) values ('+998901234567', 'Demo mijoz') returning id");
  await q("select app.loyalty_post($1, null, 'adjust', 50000, 'Xush kelibsiz bonusi (demo)', $2)", [cust.id, superId]);
  await q(
    "insert into public.customer_addresses (customer_id, label, address_text, lat, lng, house, apartment, is_default) values ($1, 'Uy', 'Sergeli-IIIa massivi', 41.2229, 69.2206, '26', '14', true)",
    [cust.id],
  );
  await q("insert into public.audit_logs (actor_kind, actor_id, action, entity, entity_id, data) values ('system', null, 'seed', 'database', null, '{}')");

  await q("commit");
  const counts = await one<Record<string, number>>(
    `select (select count(*)::int from public.brands) brands, (select count(*)::int from public.branches) branches,
            (select count(*)::int from public.categories where parent_id is null) top_categories,
            (select count(*)::int from public.categories) all_categories,
            (select count(*)::int from public.products where kind = 'dish') dishes`,
  );
  console.log("[seed] done", counts);
  console.log(`[seed] staff logins (password: ${password}): admin@sushi.local, manager.chilonzor@sushi.local, manager.yunusobod@sushi.local, kitchen.chilonzor@sushi.local`);
  console.log("[seed] demo customer phone: +998 90 123 45 67 (OTP code is shown on screen in development)");
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
