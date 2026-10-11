-- SUSHI platform core schema.
-- Conventions:
--   * Money is stored as integer UZS (so'm) in `bigint`/`integer` columns. Never floats.
--   * Translatable text is `jsonb` of the form {"uz": "...", "ru": "..."}; "uz" is required.
--   * Times are timestamptz; business-local interpretation is Asia/Tashkent (UTC+5, no DST).
--   * Opening hours are minutes from local midnight; close > 1440 means "after midnight".

create extension if not exists pgcrypto;

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function app.is_i18n(v jsonb) returns boolean
language sql immutable
as $$
  select v is not null and jsonb_typeof(v) = 'object' and coalesce(length(v ->> 'uz'), 0) > 0
$$;

create or replace function app.touch_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Settings & taxonomy
-- ---------------------------------------------------------------------------

create table public.settings (
  key         text primary key,
  value       jsonb not null,
  is_public   boolean not null default false,
  updated_at  timestamptz not null default now()
);

create table public.cuisines (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        jsonb not null check (app.is_i18n(name)),
  sort        integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Brands, branches, hours, zones
-- ---------------------------------------------------------------------------

create table public.brands (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name          text not null,
  tagline       jsonb not null default '{"uz":""}'::jsonb,
  description   jsonb not null default '{"uz":""}'::jsonb,
  logo_url      text,
  cover_url     text,
  accent_color  text not null default '#F52D36',
  phone         text,
  is_active     boolean not null default true,
  sort          integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.brand_cuisines (
  brand_id    uuid not null references public.brands(id) on delete cascade,
  cuisine_id  uuid not null references public.cuisines(id) on delete cascade,
  primary key (brand_id, cuisine_id)
);

create table public.branches (
  id                        uuid primary key default gen_random_uuid(),
  brand_id                  uuid not null references public.brands(id) on delete cascade,
  slug                      text not null check (slug ~ '^[a-z0-9-]{2,60}$'),
  name                      jsonb not null check (app.is_i18n(name)),
  address                   jsonb not null check (app.is_i18n(address)),
  lat                       double precision not null,
  lng                       double precision not null,
  phone                     text,
  is_active                 boolean not null default true,
  accepts_delivery          boolean not null default true,
  accepts_pickup            boolean not null default true,
  prep_minutes              integer not null default 25 check (prep_minutes between 0 and 600),
  delivery_minutes          integer not null default 35 check (delivery_minutes between 0 and 600),
  pickup_min_order          integer not null default 0 check (pickup_min_order >= 0),
  reservations_enabled      boolean not null default true,
  reservation_capacity      integer not null default 40 check (reservation_capacity >= 0),
  reservation_slot_minutes  integer not null default 30 check (reservation_slot_minutes between 15 and 240),
  reservation_duration_minutes integer not null default 120 check (reservation_duration_minutes between 30 and 480),
  reservation_max_party     integer not null default 12 check (reservation_max_party between 1 and 200),
  sort                      integer not null default 0,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (brand_id, slug)
);
create index on public.branches (brand_id);

create table public.branch_hours (
  branch_id    uuid not null references public.branches(id) on delete cascade,
  weekday      smallint not null check (weekday between 1 and 7), -- ISO: 1 = Monday
  open_minute  integer not null check (open_minute between 0 and 1439),
  close_minute integer not null check (close_minute between 1 and 2879),
  primary key (branch_id, weekday),
  check (close_minute > open_minute)
);

create table public.branch_closures (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid not null references public.branches(id) on delete cascade,
  date       date not null,
  reason     jsonb not null default '{"uz":""}'::jsonb,
  unique (branch_id, date)
);

create table public.delivery_zones (
  id                  uuid primary key default gen_random_uuid(),
  branch_id           uuid not null references public.branches(id) on delete cascade,
  name                jsonb not null check (app.is_i18n(name)),
  -- Polygon as [[lat, lng], ...] (closed implicitly).
  polygon             jsonb not null check (jsonb_typeof(polygon) = 'array' and jsonb_array_length(polygon) >= 3),
  fee                 integer not null default 0 check (fee >= 0),
  min_order           integer not null default 0 check (min_order >= 0),
  free_delivery_from  integer check (free_delivery_from is null or free_delivery_from >= 0),
  surcharge           integer not null default 0 check (surcharge >= 0),
  surcharge_note      jsonb,
  extra_minutes       integer not null default 0 check (extra_minutes between 0 and 600),
  priority            integer not null default 0,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);
create index on public.delivery_zones (branch_id);

-- ---------------------------------------------------------------------------
-- Menu
-- ---------------------------------------------------------------------------

create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  brand_id   uuid not null references public.brands(id) on delete cascade,
  parent_id  uuid references public.categories(id) on delete cascade,
  slug       text not null check (slug ~ '^[a-z0-9-]{2,80}$'),
  name       jsonb not null check (app.is_i18n(name)),
  icon       text,
  sort       integer not null default 0,
  is_active  boolean not null default true,
  unique (brand_id, slug)
);
create index on public.categories (brand_id, parent_id);

create table public.products (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid not null references public.brands(id) on delete cascade,
  category_id    uuid references public.categories(id) on delete set null,
  kind           text not null default 'dish' check (kind in ('dish', 'packaging', 'cutlery')),
  slug           text not null check (slug ~ '^[a-z0-9-]{2,80}$'),
  name           jsonb not null check (app.is_i18n(name)),
  description    jsonb not null default '{"uz":""}'::jsonb,
  ingredients    jsonb not null default '{"uz":""}'::jsonb,
  allergens      text[] not null default '{}',
  weight_grams   integer check (weight_grams is null or weight_grams > 0),
  portion        jsonb,
  base_price     integer not null check (base_price >= 0),
  packaging_fee  integer not null default 0 check (packaging_fee >= 0),
  image_url      text,
  badges         text[] not null default '{}',
  is_active      boolean not null default true,
  -- service items (packaging bag, cutlery) that the cart offers by default
  default_in_cart boolean not null default false,
  sort           integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (brand_id, slug),
  check (badges <@ array['bestseller','spicy','new','vegetarian']::text[])
);
create index on public.products (brand_id, category_id);
create index products_search_idx on public.products using gin (
  to_tsvector('simple', coalesce(name ->> 'uz', '') || ' ' || coalesce(name ->> 'ru', ''))
);

create table public.product_option_groups (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  kind        text not null check (kind in ('variant', 'extra')),
  name        jsonb not null check (app.is_i18n(name)),
  min_select  integer not null default 0 check (min_select >= 0),
  max_select  integer not null default 1 check (max_select >= 1),
  sort        integer not null default 0,
  check (max_select >= min_select),
  -- a variant group is "pick exactly one"
  check (kind <> 'variant' or (min_select = 1 and max_select = 1))
);
create index on public.product_option_groups (product_id);

create table public.product_options (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.product_option_groups(id) on delete cascade,
  name         jsonb not null check (app.is_i18n(name)),
  price_delta  integer not null default 0,
  is_default   boolean not null default false,
  is_active    boolean not null default true,
  sort         integer not null default 0
);
create index on public.product_options (group_id);

-- Branch-specific price and availability. No row = available at base price.
create table public.branch_products (
  branch_id       uuid not null references public.branches(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete cascade,
  price_override  integer check (price_override is null or price_override >= 0),
  is_available    boolean not null default true,
  updated_at      timestamptz not null default now(),
  primary key (branch_id, product_id)
);

-- ---------------------------------------------------------------------------
-- People: customers, staff, sessions
-- ---------------------------------------------------------------------------

create table public.customers (
  id               uuid primary key default gen_random_uuid(),
  phone            text not null unique check (phone ~ '^\+998[0-9]{9}$'),
  name             text check (name is null or length(name) between 1 and 80),
  email            text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  preferred_lang   text not null default 'uz' check (preferred_lang in ('uz', 'ru')),
  loyalty_balance  integer not null default 0 check (loyalty_balance >= 0),
  is_blocked       boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.customer_addresses (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.customers(id) on delete cascade,
  label         text,
  address_text  text not null check (length(address_text) between 2 and 300),
  lat           double precision not null,
  lng           double precision not null,
  house         text,
  apartment     text,
  floor         text,
  entrance      text,
  instructions  text,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now()
);
create index on public.customer_addresses (customer_id);

create table public.staff (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  name        text not null,
  role        text not null check (role in ('super_admin', 'branch_manager', 'kitchen')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Kept apart from `staff` so no policy can ever expose password hashes.
create table public.staff_credentials (
  staff_id       uuid primary key references public.staff(id) on delete cascade,
  password_hash  text not null,
  updated_at     timestamptz not null default now()
);

create table public.staff_branches (
  staff_id   uuid not null references public.staff(id) on delete cascade,
  branch_id  uuid not null references public.branches(id) on delete cascade,
  primary key (staff_id, branch_id)
);

create table public.sessions (
  id            uuid primary key default gen_random_uuid(),
  subject_kind  text not null check (subject_kind in ('customer', 'staff')),
  subject_id    uuid not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  ip            text,
  user_agent    text
);
create index on public.sessions (subject_kind, subject_id);

create table public.otp_codes (
  id           uuid primary key default gen_random_uuid(),
  phone        text not null,
  code_hash    text not null,
  expires_at   timestamptz not null,
  attempts     integer not null default 0,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index on public.otp_codes (phone, created_at desc);

create table public.rate_limits (
  key           text not null,
  window_start  timestamptz not null,
  count         integer not null default 0,
  primary key (key, window_start)
);

-- ---------------------------------------------------------------------------
-- Promotions
-- ---------------------------------------------------------------------------

create table public.promo_codes (
  id                     uuid primary key default gen_random_uuid(),
  code                   text not null unique check (code ~ '^[A-Z0-9_-]{3,32}$'),
  description            jsonb not null default '{"uz":""}'::jsonb,
  kind                   text not null check (kind in ('percent', 'fixed')),
  value                  integer not null check (value > 0),
  max_discount           integer check (max_discount is null or max_discount > 0),
  min_subtotal           integer not null default 0 check (min_subtotal >= 0),
  starts_at              timestamptz,
  ends_at                timestamptz,
  usage_limit_total      integer check (usage_limit_total is null or usage_limit_total > 0),
  usage_limit_per_customer integer check (usage_limit_per_customer is null or usage_limit_per_customer > 0),
  used_count             integer not null default 0 check (used_count >= 0),
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  check (kind <> 'percent' or value <= 100),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (usage_limit_total is null or used_count <= usage_limit_total)
);

-- Empty = valid for all brands.
create table public.promo_code_brands (
  promo_code_id  uuid not null references public.promo_codes(id) on delete cascade,
  brand_id       uuid not null references public.brands(id) on delete cascade,
  primary key (promo_code_id, brand_id)
);

-- Homepage promotions (marketing content, optionally tied to a promo code).
create table public.promotions (
  id             uuid primary key default gen_random_uuid(),
  title          jsonb not null check (app.is_i18n(title)),
  body           jsonb not null default '{"uz":""}'::jsonb,
  image_url      text,
  brand_id       uuid references public.brands(id) on delete set null,
  promo_code_id  uuid references public.promo_codes(id) on delete set null,
  starts_at      timestamptz,
  ends_at        timestamptz,
  status         text not null default 'draft' check (status in ('draft', 'published')),
  sort           integer not null default 0,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Orders & payments
-- ---------------------------------------------------------------------------

create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  number            bigint generated always as identity (start with 10001) unique,
  customer_id       uuid not null references public.customers(id),
  brand_id          uuid not null references public.brands(id),
  branch_id         uuid not null references public.branches(id),
  fulfillment       text not null check (fulfillment in ('delivery', 'pickup')),
  status            text not null default 'new' check (status in
                      ('new','confirmed','preparing','ready','out_for_delivery','delivered','picked_up','cancelled')),
  payment_method    text not null check (payment_method in ('cash','card_on_delivery','click','payme','mock')),
  payment_status    text not null default 'unpaid' check (payment_status in
                      ('unpaid','pending','paid','failed','refund_pending','refunded','partially_refunded')),
  customer_name     text not null,
  customer_phone    text not null,
  is_for_other      boolean not null default false,
  recipient_name    text,
  recipient_phone   text,
  address           jsonb,           -- snapshot for delivery orders
  delivery_zone_id  uuid references public.delivery_zones(id) on delete set null,
  leave_at_door     boolean not null default false,
  asap              boolean not null default true,
  scheduled_for     timestamptz,
  promised_at       timestamptz not null,
  comment           text,
  subtotal          integer not null check (subtotal >= 0),
  packaging_total   integer not null default 0 check (packaging_total >= 0),
  delivery_fee      integer not null default 0 check (delivery_fee >= 0),
  zone_surcharge    integer not null default 0 check (zone_surcharge >= 0),
  discount_total    integer not null default 0 check (discount_total >= 0),
  loyalty_spent     integer not null default 0 check (loyalty_spent >= 0),
  total             integer not null check (total >= 0),
  refunded_amount   integer not null default 0 check (refunded_amount >= 0 and refunded_amount <= total),
  loyalty_earned    integer not null default 0 check (loyalty_earned >= 0),
  promo_code_id     uuid references public.promo_codes(id) on delete set null,
  promo_code        text,
  idempotency_key   text not null check (length(idempotency_key) between 8 and 80),
  request_hash      text not null,
  cancel_reason     text,
  cancelled_by      text check (cancelled_by is null or cancelled_by in ('customer','staff','system')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (customer_id, idempotency_key),
  check (total = subtotal + packaging_total + delivery_fee + zone_surcharge - discount_total - loyalty_spent),
  check (fulfillment = 'delivery' or (address is null and delivery_fee = 0 and zone_surcharge = 0 and not leave_at_door)),
  check (not leave_at_door or payment_method in ('click','payme','mock')),
  check (status <> 'cancelled' or cancel_reason is not null),
  check (not is_for_other or (recipient_name is not null and recipient_phone is not null))
);
create index on public.orders (customer_id, created_at desc);
create index on public.orders (branch_id, created_at desc);
create index on public.orders (status);

create table public.order_items (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  product_id          uuid references public.products(id) on delete set null,
  kind                text not null default 'dish' check (kind in ('dish','packaging','cutlery')),
  name_snapshot       jsonb not null,
  options_snapshot    jsonb not null default '[]'::jsonb,
  image_url           text,
  unit_price          integer not null check (unit_price >= 0),
  packaging_fee_unit  integer not null default 0 check (packaging_fee_unit >= 0),
  quantity            integer not null check (quantity between 1 and 99),
  line_total          integer not null check (line_total = unit_price * quantity),
  sort                integer not null default 0
);
create index on public.order_items (order_id);

create table public.order_status_history (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.orders(id) on delete cascade,
  from_status  text,
  to_status    text not null,
  actor_kind   text not null check (actor_kind in ('customer','staff','system')),
  actor_id     uuid,
  note         text,
  created_at   timestamptz not null default now()
);
create index on public.order_status_history (order_id, created_at);

create table public.payments (
  id                uuid primary key default gen_random_uuid(),
  -- integer reference required by providers that only accept numeric ids (Click merchant_prepare_id)
  seq               bigint generated always as identity (start with 100001) unique,
  order_id          uuid not null references public.orders(id) on delete cascade,
  provider          text not null check (provider in ('click','payme','mock','cash','card_on_delivery')),
  amount            integer not null check (amount >= 0),
  status            text not null default 'created' check (status in ('created','pending','paid','failed','cancelled','refunded')),
  provider_txn_id   text,
  provider_state    jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  paid_at           timestamptz,
  cancelled_at      timestamptz,
  unique (provider, provider_txn_id)
);
create index on public.payments (order_id);
-- At most one successful payment per order.
create unique index payments_one_paid_per_order on public.payments (order_id) where status = 'paid';

-- Every provider callback, recorded before processing. The unique key makes
-- duplicate deliveries of the same callback a no-op.
create table public.payment_events (
  id          bigint generated always as identity primary key,
  provider    text not null,
  event_key   text not null,
  payment_id  uuid references public.payments(id) on delete set null,
  payload     jsonb not null,
  response    jsonb,
  created_at  timestamptz not null default now(),
  unique (provider, event_key)
);

create table public.promo_redemptions (
  id             uuid primary key default gen_random_uuid(),
  promo_code_id  uuid not null references public.promo_codes(id) on delete cascade,
  order_id       uuid not null unique references public.orders(id) on delete cascade,
  customer_id    uuid not null references public.customers(id),
  amount         integer not null check (amount >= 0),
  status         text not null default 'active' check (status in ('active', 'void')),
  created_at     timestamptz not null default now()
);
create index on public.promo_redemptions (promo_code_id, customer_id);

create table public.loyalty_transactions (
  id             bigint generated always as identity primary key,
  customer_id    uuid not null references public.customers(id) on delete cascade,
  order_id       uuid references public.orders(id) on delete set null,
  kind           text not null check (kind in ('earn','spend','refund','adjust','reverse_earn')),
  amount         integer not null check (amount <> 0),
  balance_after  integer not null check (balance_after >= 0),
  note           text,
  staff_id       uuid references public.staff(id) on delete set null,
  created_at     timestamptz not null default now(),
  check (kind <> 'adjust' or (staff_id is not null and note is not null))
);
create index on public.loyalty_transactions (customer_id, created_at desc);
-- Each order earns, spends, refunds and reverses at most once.
create unique index loyalty_once_per_order on public.loyalty_transactions (order_id, kind)
  where order_id is not null and kind in ('earn','spend','refund','reverse_earn');

-- ---------------------------------------------------------------------------
-- Reservations
-- ---------------------------------------------------------------------------

create table public.reservations (
  id            uuid primary key default gen_random_uuid(),
  number        bigint generated always as identity (start with 5001) unique,
  brand_id      uuid not null references public.brands(id),
  branch_id     uuid not null references public.branches(id),
  customer_id   uuid references public.customers(id) on delete set null,
  name          text not null check (length(name) between 1 and 80),
  phone         text not null check (phone ~ '^\+998[0-9]{9}$'),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  party_size    integer not null check (party_size between 1 and 200),
  notes         text,
  status        text not null default 'pending' check (status in ('pending','confirmed','rejected','cancelled','seated','no_show')),
  staff_note    text,
  decided_by    uuid references public.staff(id) on delete set null,
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on public.reservations (branch_id, starts_at);
create index on public.reservations (customer_id);

-- ---------------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------------

create table public.content_items (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('page','news','recipe','vacancy','faq','gallery','banner','legal')),
  slug          text not null check (slug ~ '^[a-z0-9-]{2,80}$'),
  title         jsonb not null check (app.is_i18n(title)),
  excerpt       jsonb not null default '{"uz":""}'::jsonb,
  body          jsonb not null default '{"uz":""}'::jsonb,
  image_url     text,
  link_url      text,
  status        text not null default 'draft' check (status in ('draft','published')),
  published_at  timestamptz,
  sort          integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (kind, slug)
);

create table public.feedback (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid references public.customers(id) on delete set null,
  branch_id    uuid references public.branches(id) on delete set null,
  name         text not null,
  phone        text,
  rating       integer check (rating is null or rating between 1 and 5),
  message      text not null check (length(message) between 3 and 2000),
  status       text not null default 'new' check (status in ('new','read','archived')),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_kind  text not null check (actor_kind in ('staff','customer','system')),
  actor_id    uuid,
  action      text not null,
  entity      text not null,
  entity_id   text,
  branch_id   uuid references public.branches(id) on delete set null,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index on public.audit_logs (created_at desc);
create index on public.audit_logs (entity, entity_id);

-- updated_at triggers
create trigger t_brands_touch before update on public.brands for each row execute function app.touch_updated_at();
create trigger t_branches_touch before update on public.branches for each row execute function app.touch_updated_at();
create trigger t_products_touch before update on public.products for each row execute function app.touch_updated_at();
create trigger t_customers_touch before update on public.customers for each row execute function app.touch_updated_at();
create trigger t_orders_touch before update on public.orders for each row execute function app.touch_updated_at();
create trigger t_content_touch before update on public.content_items for each row execute function app.touch_updated_at();
