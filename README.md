# Sushi Madi — restaurant ordering website

The ordering website for **Sushi Madi**, a single restaurant with several branches: customer website (Uzbek by default, Russian),
server-validated checkout, phone OTP accounts, reservations, loyalty, promo codes,
payments (Click, Payme, local mock), and a role-based admin panel at `/admin`.

The menu is on the home page (`/`); old `/r/<brand>` links redirect there. The logo is in
`public/brand/`. Branches, people and contacts in the seed data are fictional. The seeded menu is
the real menu board: 13 rolls, the FAMILY SET and the sides, with photos cropped from the board in
`public/menu/` (low resolution — replace them with the originals from **Admin → Menu** (upload) or
by overwriting the files). Other artwork is still generated SVG placeholders in `public/seed/`.

---

## Stack

| Layer | Choice |
|---|---|
| Web | Next.js 16 (App Router, TypeScript), React 19, Tailwind CSS v4, Radix primitives (dialogs, menus) |
| Data | PostgreSQL 17 — Supabase-compatible migrations with row level security (`supabase/migrations`) |
| Auth | Phone OTP for customers, email + password (scrypt) for staff; signed session cookies backed by a `sessions` table |
| Storage | Supabase Storage (REST) when configured, `public/uploads` in development |
| Tests | Vitest (unit + integration against real PostgreSQL), puppeteer-core browser E2E |

### How security is layered

1. **Server code** validates every input with zod and checks the staff role (`src/lib/admin/guard.ts`).
2. **Database RLS**: every customer/staff request runs inside `asActor()` (`src/lib/db.ts`), which does
   `SET LOCAL ROLE authenticated` with Supabase-style JWT claims (`sub`, `kind`). The policies in
   `supabase/migrations/20260922000002_security.sql` then decide which rows are visible/writable —
   a branch manager cannot reach another branch's orders even with a hand-crafted request.
3. **Database triggers** enforce the order state machine, kitchen restrictions, loyalty earn/refund,
   promo release on cancellation and "never below zero" balances, whatever code path writes.

Money is always integer UZS (`integer`/`bigint` columns, integer arithmetic in `src/lib/money.ts`).

---

## Quick start (local development)

Requirements: Node.js 20+ (tested on 24), npm. No Docker needed.

```bash
npm install
# npm 12 blocks install scripts by default; these two are required:
npm install-scripts approve @embedded-postgres/windows-x64   # or the package for your OS
npm install-scripts approve esbuild
npm rebuild

cp .env.example .env.local        # then set SESSION_SECRET (see below)

npm run db:start                  # terminal 1: real PostgreSQL 17 on 127.0.0.1:54329 (data in .data/pg)
npm run db:reset                  # terminal 2: migrations + seed data
npm run dev                       # http://localhost:3000
```

`npm run db:start` uses the `embedded-postgres` package (real PostgreSQL binaries). It also applies a
tiny **local-only Supabase shim** (`supabase/local/00_supabase_shim.sql`: `anon`/`authenticated`
roles and `auth.uid()`/`auth.jwt()`), so the same migrations and RLS run locally and on Supabase.

### Demo accounts (development)

| Who | Login |
|---|---|
| Super admin | `admin@sushi.local` / `Admin12345!` |
| Branch manager (Chilonzor) | `manager.chilonzor@sushi.local` / `Admin12345!` |
| Branch manager (Yunusobod) | `manager.yunusobod@sushi.local` / `Admin12345!` |
| Kitchen / operator (Chilonzor) | `kitchen.chilonzor@sushi.local` / `Admin12345!` |
| Customer | any Uzbek number, e.g. `+998 90 123 45 67` (has 50 000 UZS loyalty). In development the OTP code is shown on screen. |

Set `SEED_STAFF_PASSWORD` before seeding to use a different staff password.

Seeded promo codes: `WELCOME10` (10 %, max 30 000, from 80 000, once per customer),
`MADI20K` (from 150 000, 100 uses), `SUMMER15` (expired), `ONEUSE` (1 use total).

---

## Environment variables

See `.env.example`. Only `NEXT_PUBLIC_*` values reach the browser.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string (Supabase: Project Settings → Database → connection string, role `postgres`) |
| `DATABASE_SSL` | Supabase: `true` | TLS for hosted databases |
| `DATABASE_POOL_MAX` | no | pool size (default 10) |
| `SESSION_SECRET` | yes | ≥ 32 random chars; signs session cookies, OTP hashes and mock callbacks. Placeholder value is rejected in production |
| `NEXT_PUBLIC_SITE_URL` | yes | public base URL (payment return URLs) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | production uploads | image storage (bucket must exist and be public). Server-side only |
| `SMS_PROVIDER` | yes | `console` (development only, refused in production) or `eskiz` (adapter not implemented yet — see checklist) |
| `ESKIZ_*` | when implemented | SMS provider credentials |
| `PAYMENT_METHODS` | yes | enabled methods: `cash,card_on_delivery,click,payme,mock` (`mock` is always off in production) |
| `CLICK_SERVICE_ID`, `CLICK_MERCHANT_ID`, `CLICK_MERCHANT_USER_ID`, `CLICK_SECRET_KEY` | for Click | Click SHOP API |
| `PAYME_MERCHANT_ID`, `PAYME_KEY`, `PAYME_CHECKOUT_URL` | for Payme | Payme Merchant API (sandbox URL by default) |
| `GEOCODER_PROVIDER`, `YANDEX_GEOCODER_KEY` | no | `local` gazetteer (default); `yandex` not implemented |
| `COURIER_PROVIDER` | no | `in_house` (own couriers) |
| `SEED_STAFF_PASSWORD`, `SEED_ALLOW_REMOTE` | seeding | seed password; seeding a non-local DB requires `SEED_ALLOW_REMOTE=true` |

Payment method visibility is automatic: Click/Payme only appear at checkout when their credentials are set.

---

## Deploying for free: Neon (database) + Render (website + bot)

`render.yaml` is a Render Blueprint for one **free** web service. It also runs the Telegram bot, in
webhook mode (`TELEGRAM_MODE=webhook`), because Render's free plan has no background workers.

1. **Neon**: create a project (region **AWS Europe Central 1 / Frankfurt**, same as Render's `frankfurt`).
   Copy the connection string with **Connection pooling turned off** (the direct host, without `-pooler`):
   realtime updates and the bot use `LISTEN/NOTIFY`, which the pooler does not support.
2. **Schema + data** (from this computer, PowerShell):
   ```powershell
   $env:DATABASE_URL = "postgresql://...neon.tech/neondb?sslmode=require"; $env:DATABASE_SSL = "true"
   npx tsx scripts/migrate.ts
   $env:SEED_ALLOW_REMOTE = "true"; $env:SEED_STAFF_PASSWORD = "<a strong password>"; npx tsx scripts/seed.ts
   ```
   Seeding is for a fresh database only (it truncates data tables). Later migrations run automatically on
   every Render start (`npm run start:render`).
3. **GitHub**: push this folder to a (private) repository.
4. **Render**: New → **Blueprint** → pick the repository. Enter the values it asks for:
   `DATABASE_URL` (from step 1), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_IDS`. `SESSION_SECRET` is generated.
   The site URL defaults to `https://<service>.onrender.com` (`RENDER_EXTERNAL_URL`); set
   `NEXT_PUBLIC_SITE_URL` only for a custom domain, then redeploy (it is baked in at build time).
5. On start the server registers the bot's webhook (`/api/telegram/webhook`, protected by a secret header
   derived from `SESSION_SECRET`) and its menu button. Check **Admin → Settings** for integration status.

How production differs from development:
- **Customer login codes go through the Telegram bot** (`SMS_PROVIDER=telegram`). A customer shares
  their number with the bot once; the login page explains this and links to the bot. Inside the
  Telegram Mini App, login is automatic.
- **Uploaded images are stored in PostgreSQL** (`media_files`, served from `/media/...`), because Render's
  disk is wiped on every restart/deploy. Configure Supabase Storage instead if you prefer.
- **Payments**: cash and card-on-delivery. Click/Payme appear once their credentials are added; mock is off.

Free-tier limits to know:
- Render free sleeps after 15 minutes without traffic; the next visit (or a Telegram message to the
  bot) wakes it in about a minute. Orders placed on the site are announced to Telegram right away.
- Neon free: 0.5 GB storage and 100 compute-hours per month; the database sleeps after 5 idle minutes.
- With the webhook set, `npm run bot` on your computer refuses to start (it would disconnect the live
  bot). Use a separate test bot token for local development.

## Deploying to Supabase

1. Create a project. In the SQL editor (or with `psql`), run the migrations **in order**:
   `supabase/migrations/20260922000001_schema.sql`, then `…002_security.sql`
   (or set `DATABASE_URL` to the Supabase connection string and run `npm run db:migrate` —
   it detects the existing `auth` schema and skips the local shim).
2. The server connects as `postgres` and switches to `authenticated` per request. Supabase grants this
   by default; if you see `permission denied to set role`, run `grant anon, authenticated to postgres;`.
3. Create a **public** Storage bucket named `media` (or set `SUPABASE_STORAGE_BUCKET`).
4. Seed or enter real data. For a demo: `SEED_ALLOW_REMOTE=true npm run db:seed` (it truncates data tables).
5. Set production env vars (`NODE_ENV=production` is set by `next start`), then `npm run build && npm start`.
6. Configure provider callbacks:
   - Click: Prepare `https://<site>/api/payments/click/prepare`, Complete `https://<site>/api/payments/click/complete`
   - Payme: endpoint `https://<site>/api/payments/payme`, account field **`order_id`** (holds our payment id)

The platform does not use Supabase Auth's phone login: Uzbek SMS gateways are not built into it, so
OTP is implemented server-side with a pluggable SMS adapter; RLS still uses Supabase's `auth.uid()`/`auth.jwt()`.

---

## Project map

```
supabase/migrations/        schema + RLS/triggers (source of truth for data rules)
supabase/local/             local-only Supabase shim
scripts/                    local-db, migrate, seed (+ SVG placeholders), E2E + screenshot scripts
src/lib/                    pricing, promo, schedule, money, time (Asia/Tashkent), geo, settings, i18n
src/lib/services/           catalog, checkout (quote + transactional order), orders, reservations, stats
src/lib/payments/           core (idempotent state), click, payme, mock
src/lib/integrations/       sms, storage, geocoder adapters
src/app/(site)/             customer site          src/app/admin/   admin panel + server actions
src/app/api/                route handlers (quote, orders, auth, payments callbacks, …)
tests/                      unit, integration (real PostgreSQL), production guards
```

## Checks

```bash
npm run typecheck
npm test            # needs `npm run db:start`; creates and resets a separate `sushi_test` database
npm run build
npm run e2e         # needs `npm run dev`: browser flow customer → payment → admin → customer
npm run shots       # desktop + 400px mobile screenshots into ./screenshots
```

### What was verified (2026-09-22, local PostgreSQL 17, headless Chrome)

- **50 automated tests pass:** 28 unit, 17 integration against real PostgreSQL + RLS, 5 production-guard.
  They cover delivery/pickup totals, zone fees and surcharges, branch price overrides, and snapshots.
  They prove 5 concurrent submissions with one idempotency key create exactly one order.
  They check price-change confirmation, stop-list blocking, and promo rules (per customer, total limit under concurrency, expired, wrong brand, unknown).
  They check loyalty limits, refund on cancel, earn on completion, and audited, non-negative adjustments.
  They check the order state machine, kitchen restrictions, and cross-branch denial (service layer and direct SQL).
  They check that customers cannot read each other's data or raise their own balance.
  They check that mock, Click and Payme callbacks are signature/amount checked and safe to repeat.
  They check reservation hours, capacity and party size.
  They check that production disables mock payments and console OTP.
- **Browser E2E passes:**
  - OTP login → address → menu → product with variant + extra → cart → checkout → mock provider → signed callback → order shows *paid*.
  - A branch manager moves the order to *delivered*, and the customer then sees *Yetkazildi* and the cashback.
  - Another branch's manager gets 404; kitchen staff are kept out of menu admin.
  - A branch price change shows up on the storefront.
- `next build` succeeds. At a 400 px width, the home page, drawer, menu, cart bar, cart sheet and checkout have no horizontal overflow.

---

## Feature checklist

### Implemented and verified locally
- Customer site:
  - sticky header: drawer, logo, brand switcher, live search, address picker, language switch, cart, account menu
  - homepage: cuisine filters, brand cards, bestsellers, promotions
  - restaurant menu: 260 / fluid / 360 px desktop layout with an expandable category sidebar; mobile category scroller, sticky cart bar and cart sheet
  - product modal: description, ingredients, allergens, weight, variants, extras, quantity
- Cart: one branch per cart with confirmation on conflict; persisted in localStorage; packaging and cutlery as visible configurable items.
- Checkout, all recalculated on the server:
  - zones, fees, surcharges, minimum order, free-delivery threshold
  - ASAP or scheduled (Asia/Tashkent hours, holidays, lead time)
  - promo codes, loyalty spending
  - leave-at-door (prepaid only), order for someone else
  - price-change confirmation, idempotent submission
- Orders:
  - timeline with live refresh; separate pickup path
  - cancellation with reasons; payment status separate from fulfillment
  - pay again (restarts payment for an unpaid online order); reorder
- Accounts: phone OTP with rate limits, profile, saved addresses, order history, loyalty ledger, reservations.
- Reservations: pending → confirmed / rejected / seated / no-show, hours and capacity validation.
- Admin (role-based: super admin, branch manager, kitchen/operator):
  - dashboard with metric definitions and refund handling; live order queue, order detail, printable kitchen ticket
  - stop-list and branch prices
  - menu: categories and subcategories, products, translations, images, variants, extras, allergens, badges
  - restaurants and branches: hours, holiday closures, delivery zones and fees
  - reservations (day calendar and list); customers with an audited loyalty ledger
  - promo codes and homepage promotions; content (draft/publish); settings with integration status; staff and branch assignment; audit log; feedback
- Payments: local **mock** provider (development only) using the same signed-callback path as real providers.

### Implemented, needs credentials + sandbox verification before going live
- **Click SHOP API** (`src/lib/payments/click.ts`) — sign formula and error codes from Click's official `click-integration-php`; test in Click's environment with real `CLICK_*` values.
- **Payme Merchant API** (`src/lib/payments/payme.ts`) — methods, states, 12 h timeout and errors per developer.help.paycom.uz; run Payme's sandbox test suite with `PAYME_*`.
- **Supabase Storage uploads** (`src/lib/integrations/storage.ts`) — needs `SUPABASE_URL` + service key and a public bucket.

### Not implemented yet (adapters stubbed and clearly refused)
- **Real SMS provider** (e.g. Eskiz): `SMS_PROVIDER=eskiz` fails loudly; implement against the provider's current docs. **Production login cannot work until this is done.**
- Map geocoding (Yandex/Google) and map pin selection — the local Tashkent gazetteer is used instead.
- External courier dispatch APIs — `in_house` only.
- Outbound notifications (email/Telegram) — settings are stored; nothing is sent.
- Refunds through provider APIs — refunds are recorded manually in admin after being made in the provider cabinet (Payme `CancelTransaction` callbacks are handled automatically).
- Realtime push (order status uses 8–15 s polling).

## Telegram bot

`npm run bot` runs the bot worker (long polling, so no public URL is needed; run exactly one instance).

1. Create a bot with @BotFather and set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` in `.env.local`.
2. `npm run db:migrate` (adds `supabase/migrations/20260925000003_telegram.sql`), then `npm run bot`.
3. Staff: go to **Admin → Telegram bot → Connect Telegram** and press Start in the chat. Their role comes from their staff account.
4. Customers: open the bot and share their phone number. It links to their site account by phone.

| Role | Receives | Can do in the bot |
|---|---|---|
| super_admin | everything, all branches: new orders, every status change, payments, cancellations, reservations, feedback, new customers | move/cancel orders, mark cash paid, confirm/reject reservations, 📊 today's stats |
| branch_manager | own branches: new orders, cancellations, payments, reservations, feedback | same as super admin, scoped to own branches |
| kitchen | own branches: new orders | move orders forward (cannot cancel or touch payments) |
| customer | status of their own orders and reservations | menu link, my orders, bonus balance, branches, contacts, uz/ru |

Admin-only chats (for example the owner or a group) can get the full feed read-only through `TELEGRAM_ADMIN_CHAT_IDS`
or **Settings → Notifications → Telegram chat id**. Send `/id` to the bot to see a chat id.

How it works: DB triggers write every event into `telegram_outbox` and `NOTIFY`. The worker `LISTEN`s and sends right away,
with a 5s sweep as a fallback. Because the triggers are in the database, events are captured from every source: storefront,
admin panel, payment callbacks, and the bot itself. Button presses go through the same services as the admin panel, so RLS
and the order state machine still apply. Each order card is edited in place as its status changes.

### Telegram Mini App (Web App)

The storefront and the admin panel both open inside Telegram. The bot sets the chat ☰ menu button to the storefront
(staff chats get the admin panel instead), and "🍣 Menyu", "🖥 Admin panel", "📦 Open order" and "🖥 Open in panel" open as Mini Apps.

- Needs `NEXT_PUBLIC_SITE_URL` to be a public **https** URL. For local dev, use a tunnel such as `cloudflared tunnel --url http://localhost:3000`.
  Optionally register it in @BotFather (`/newapp` or Bot Settings → Menu Button).
- Login is automatic (`POST /api/auth/telegram`), using Telegram-signed `initData` checked with the bot token:
  - customers: matched by their linked chat. A new user is asked once to share their Telegram phone (no SMS code).
  - staff: logged in under `/admin` if their Telegram is linked at `/admin/telegram`.
- `telegram-web-app.js` loads only when the page is opened from Telegram (`?tg=1` / launch hash), not for normal visitors.
- `X-Frame-Options` was replaced with `Content-Security-Policy: frame-ancestors 'self' https://*.telegram.org`, and sessions
  created in the Mini App use `SameSite=None; Secure; Partitioned` cookies, so it also works on web.telegram.org (iframe).

## Realtime (no refresh needed)

Customer order pages, the floating "order in progress" tracker, the orders list, reservations, the home menu (stop-list,
prices, banners) and every admin screen (dashboard, orders board, order detail, reservations, feedback, stop-list,
sidebar badges and the new-order chime) update by themselves within about a second of a change.

- DB triggers (`supabase/migrations/20260925000004_realtime.sql`) publish tiny events on the `realtime` NOTIFY channel.
- `src/lib/realtime.ts` holds one LISTEN connection per server process and fans events out through `GET /api/realtime`,
  filtered per viewer: customers get only their own orders and reservations; staff get their branches (super admin
  gets everything, kitchen gets orders only); everyone gets catalog changes. Events carry ids only, and pages re-read
  data through RLS.
- The browser (`src/lib/realtime-client.ts`) uses Server-Sent Events. If a proxy buffers the stream (Cloudflare quick
  tunnels do), it switches to long-polling after 4 s. The request is held until an event happens, so the delay
  stays under a second. Slow timers remain as a safety net.
- Check it with `npm run e2e:realtime [-- <baseUrl>]` (needs `npm run dev`).
- Behind nginx, `X-Accel-Buffering: no` is already sent, so SSE streams directly.
