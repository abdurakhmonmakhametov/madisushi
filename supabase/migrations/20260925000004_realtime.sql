-- Realtime: every change that a screen shows is published on the `realtime`
-- NOTIFY channel as a tiny JSON event. The web server LISTENs once and fans the
-- events out over Server-Sent Events (src/app/api/realtime/route.ts), filtering
-- them per viewer. Payloads carry ids only — pages re-read data through RLS.
-- NOTIFY is delivered on commit, and identical payloads in one transaction are
-- merged, so bulk edits produce a single event.

create or replace function app.rt_orders() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status or new.payment_status is distinct from old.payment_status then
    perform pg_notify('realtime', json_build_object(
      't', 'order', 'id', new.id, 'n', new.number, 'c', new.customer_id, 'b', new.branch_id,
      's', new.status, 'p', new.payment_status, 'new', tg_op = 'INSERT')::text);
  end if;
  return new;
end $$;
create trigger t_orders_realtime after insert or update on public.orders
  for each row execute function app.rt_orders();

create or replace function app.rt_reservations() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform pg_notify('realtime', json_build_object(
      't', 'reservation', 'id', new.id, 'c', new.customer_id, 'b', new.branch_id, 's', new.status, 'new', tg_op = 'INSERT')::text);
  end if;
  return new;
end $$;
create trigger t_reservations_realtime after insert or update on public.reservations
  for each row execute function app.rt_reservations();

create or replace function app.rt_feedback() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_notify('realtime', json_build_object('t', 'feedback', 'id', new.id, 'b', new.branch_id)::text);
  return new;
end $$;
create trigger t_feedback_realtime after insert on public.feedback
  for each row execute function app.rt_feedback();

-- Menu, stop-list, prices, branches, banners and promotions: one event per statement.
create or replace function app.rt_catalog() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_notify('realtime', '{"t":"catalog"}');
  return null;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['products', 'categories', 'branch_products', 'product_option_groups', 'product_options',
                           'branches', 'branch_hours', 'branch_closures', 'content_items', 'promotions', 'brands', 'settings']
  loop
    execute format('create trigger t_%s_realtime after insert or update or delete on public.%I
                    for each statement execute function app.rt_catalog()', t, t);
  end loop;
end $$;
