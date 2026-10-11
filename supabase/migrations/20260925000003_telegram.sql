-- Telegram bot: linked chats, one-time staff link tokens, and an outbox that
-- database triggers fill for every business event (orders, payments,
-- reservations, feedback, new customers). The bot worker (scripts/bot.ts)
-- drains the outbox, so events are captured no matter which code path —
-- storefront, admin panel, payment callback or the bot itself — caused them.
-- None of these tables are reachable by anon/authenticated.

create table public.telegram_chats (
  chat_id      bigint primary key,
  username     text,
  first_name   text,
  customer_id  uuid references public.customers(id) on delete set null,
  staff_id     uuid references public.staff(id) on delete set null,
  lang         text not null default 'uz' check (lang in ('uz', 'ru')),
  muted        boolean not null default false,
  blocked      boolean not null default false,  -- user blocked the bot
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.telegram_chats (customer_id);
create index on public.telegram_chats (staff_id);

create table public.telegram_link_tokens (
  token       text primary key,
  staff_id    uuid not null references public.staff(id) on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create table public.telegram_outbox (
  id          bigint generated always as identity primary key,
  event       text not null,
  entity_id   uuid,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  attempts    integer not null default 0,
  last_error  text
);
create index telegram_outbox_pending on public.telegram_outbox (id) where sent_at is null;

-- Order cards already posted to staff chats, so they can be edited in place.
-- chat_id has no FK: admin feed chats (TELEGRAM_ADMIN_CHAT_IDS) may never have
-- written to the bot and so have no telegram_chats row.
create table public.telegram_order_messages (
  order_id    uuid not null references public.orders(id) on delete cascade,
  chat_id     bigint not null,
  message_id  bigint not null,
  primary key (order_id, chat_id)
);

alter table public.telegram_chats enable row level security;
alter table public.telegram_link_tokens enable row level security;
alter table public.telegram_outbox enable row level security;
alter table public.telegram_order_messages enable row level security;
revoke all on public.telegram_chats, public.telegram_link_tokens, public.telegram_outbox, public.telegram_order_messages
  from anon, authenticated;

create or replace function app.tg_emit(p_event text, p_entity uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.telegram_outbox (event, entity_id, data) values (p_event, p_entity, coalesce(p_data, '{}'::jsonb));
  perform pg_notify('telegram_outbox', '');
end $$;
revoke execute on function app.tg_emit(text, uuid, jsonb) from public, anon, authenticated;

create or replace function app.tg_actor() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'kind', coalesce(nullif(current_setting('app.actor_kind', true), ''), auth.jwt() ->> 'kind', 'system'),
    'id', coalesce(nullif(current_setting('app.actor_id', true), ''), auth.jwt() ->> 'sub'))
$$;

create or replace function app.tg_orders() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform app.tg_emit('order.created', new.id, '{}'::jsonb);
    return new;
  end if;
  if new.status is distinct from old.status then
    perform app.tg_emit('order.status', new.id,
      jsonb_build_object('from', old.status, 'to', new.status, 'actor', app.tg_actor()));
  end if;
  if new.payment_status is distinct from old.payment_status then
    perform app.tg_emit('order.payment', new.id,
      jsonb_build_object('from', old.payment_status, 'to', new.payment_status));
  end if;
  return new;
end $$;
create trigger t_orders_telegram after insert or update on public.orders
  for each row execute function app.tg_orders();

create or replace function app.tg_reservations() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform app.tg_emit('reservation.created', new.id, '{}'::jsonb);
  elsif new.status is distinct from old.status then
    perform app.tg_emit('reservation.status', new.id,
      jsonb_build_object('from', old.status, 'to', new.status, 'actor', app.tg_actor()));
  end if;
  return new;
end $$;
create trigger t_reservations_telegram after insert or update on public.reservations
  for each row execute function app.tg_reservations();

create or replace function app.tg_feedback() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.tg_emit('feedback.created', new.id, '{}'::jsonb);
  return new;
end $$;
create trigger t_feedback_telegram after insert on public.feedback
  for each row execute function app.tg_feedback();

create or replace function app.tg_customers() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.tg_emit('customer.created', new.id, '{}'::jsonb);
  return new;
end $$;
create trigger t_customers_telegram after insert on public.customers
  for each row execute function app.tg_customers();
