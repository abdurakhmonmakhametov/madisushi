-- Access control: role helpers, grants, row level security policies and the
-- order lifecycle triggers that keep fulfillment, payment, promo and loyalty
-- state consistent no matter which code path changes an order.
--
-- JWT claims used (set by the app server per transaction, or by Supabase):
--   sub  : customer id or staff id
--   kind : 'customer' | 'staff'
--   role : 'authenticated'

-- ---------------------------------------------------------------------------
-- Identity helpers
-- ---------------------------------------------------------------------------

create or replace function app.current_customer_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select case when auth.jwt() ->> 'kind' = 'customer' then auth.uid() end
$$;

create or replace function app.current_staff_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select s.id from public.staff s
  where auth.jwt() ->> 'kind' = 'staff' and s.id = auth.uid() and s.is_active
$$;

create or replace function app.staff_role() returns text
language sql stable security definer set search_path = ''
as $$
  select s.role from public.staff s where s.id = app.current_staff_id()
$$;

create or replace function app.is_super_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(app.staff_role() = 'super_admin', false)
$$;

create or replace function app.can_access_branch(b uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.is_super_admin() or exists (
    select 1 from public.staff_branches sb
    where sb.staff_id = app.current_staff_id() and sb.branch_id = b
  )
$$;

create or replace function app.can_manage_branch(b uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.is_super_admin()
      or (app.staff_role() = 'branch_manager' and app.can_access_branch(b))
$$;

create or replace function app.staff_can_see_customer(c uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.is_super_admin()
      or (app.staff_role() = 'branch_manager' and exists (
            select 1 from public.orders o
            where o.customer_id = c and app.can_access_branch(o.branch_id))
          )
      or (app.staff_role() = 'branch_manager' and exists (
            select 1 from public.reservations r
            where r.customer_id = c and app.can_access_branch(r.branch_id))
          )
$$;

create or replace function app.can_see_order(o uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.orders x
    where x.id = o
      and (x.customer_id = app.current_customer_id() or app.can_access_branch(x.branch_id))
  )
$$;

grant usage on schema app to anon, authenticated, service_role;
grant execute on all functions in schema app to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Grants. Start from nothing, then grant what each role may attempt; RLS
-- policies below decide which rows.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;

-- public catalog & content
grant select on public.settings, public.cuisines, public.brands, public.brand_cuisines,
  public.branches, public.branch_hours, public.branch_closures, public.delivery_zones,
  public.categories, public.products, public.product_option_groups, public.product_options,
  public.branch_products, public.promotions, public.content_items
  to anon, authenticated;

-- staff-managed tables (policies restrict to the right staff)
grant insert, update, delete on public.settings, public.cuisines, public.brands, public.brand_cuisines,
  public.branches, public.branch_hours, public.branch_closures, public.delivery_zones,
  public.categories, public.products, public.product_option_groups, public.product_options,
  public.branch_products, public.promotions, public.content_items,
  public.promo_codes, public.promo_code_brands, public.staff, public.staff_branches
  to authenticated;
grant select on public.promo_codes, public.promo_code_brands, public.promo_redemptions,
  public.staff, public.staff_branches, public.audit_logs, public.feedback
  to authenticated;
grant insert on public.audit_logs to authenticated;
grant update (status) on public.feedback to authenticated;

-- customers: only their editable profile columns
grant select on public.customers to authenticated;
grant update (name, email, preferred_lang) on public.customers to authenticated;
grant select, insert, update, delete on public.customer_addresses to authenticated;

-- orders: staff may change operational columns only; money columns are immutable
grant select on public.orders, public.order_items, public.order_status_history,
  public.payments, public.loyalty_transactions, public.reservations to authenticated;
grant update (status, payment_status, cancel_reason, cancelled_by, refunded_amount) on public.orders to authenticated;
grant insert on public.payments to authenticated;
grant update (status, paid_at, cancelled_at) on public.payments to authenticated;
grant update (status, staff_note, decided_by, decided_at) on public.reservations to authenticated;

grant usage on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.settings              enable row level security;
alter table public.cuisines              enable row level security;
alter table public.brands                enable row level security;
alter table public.brand_cuisines        enable row level security;
alter table public.branches              enable row level security;
alter table public.branch_hours          enable row level security;
alter table public.branch_closures       enable row level security;
alter table public.delivery_zones        enable row level security;
alter table public.categories            enable row level security;
alter table public.products              enable row level security;
alter table public.product_option_groups enable row level security;
alter table public.product_options       enable row level security;
alter table public.branch_products       enable row level security;
alter table public.customers             enable row level security;
alter table public.customer_addresses    enable row level security;
alter table public.staff                 enable row level security;
alter table public.staff_credentials     enable row level security;
alter table public.staff_branches        enable row level security;
alter table public.sessions              enable row level security;
alter table public.otp_codes             enable row level security;
alter table public.rate_limits           enable row level security;
alter table public.promo_codes           enable row level security;
alter table public.promo_code_brands     enable row level security;
alter table public.promotions            enable row level security;
alter table public.orders                enable row level security;
alter table public.order_items           enable row level security;
alter table public.order_status_history  enable row level security;
alter table public.payments              enable row level security;
alter table public.payment_events        enable row level security;
alter table public.promo_redemptions     enable row level security;
alter table public.loyalty_transactions  enable row level security;
alter table public.reservations          enable row level security;
alter table public.content_items         enable row level security;
alter table public.feedback              enable row level security;
alter table public.audit_logs            enable row level security;

-- settings
create policy settings_read on public.settings for select using (is_public or app.is_super_admin());
create policy settings_admin on public.settings for all to authenticated
  using (app.is_super_admin()) with check (app.is_super_admin());

-- catalog: public sees active rows, any staff sees everything
create policy cuisines_read on public.cuisines for select using (true);
create policy cuisines_admin on public.cuisines for all to authenticated using (app.is_super_admin()) with check (app.is_super_admin());

create policy brands_read on public.brands for select using (is_active or app.current_staff_id() is not null);
create policy brands_admin on public.brands for all to authenticated using (app.is_super_admin()) with check (app.is_super_admin());

create policy brand_cuisines_read on public.brand_cuisines for select using (true);
create policy brand_cuisines_admin on public.brand_cuisines for all to authenticated using (app.is_super_admin()) with check (app.is_super_admin());

create policy branches_read on public.branches for select using (is_active or app.current_staff_id() is not null);
create policy branches_insert on public.branches for insert to authenticated with check (app.is_super_admin());
create policy branches_delete on public.branches for delete to authenticated using (app.is_super_admin());
create policy branches_update on public.branches for update to authenticated
  using (app.can_manage_branch(id)) with check (app.can_manage_branch(id));

create policy branch_hours_read on public.branch_hours for select using (true);
create policy branch_hours_write on public.branch_hours for all to authenticated
  using (app.can_manage_branch(branch_id)) with check (app.can_manage_branch(branch_id));

create policy branch_closures_read on public.branch_closures for select using (true);
create policy branch_closures_write on public.branch_closures for all to authenticated
  using (app.can_manage_branch(branch_id)) with check (app.can_manage_branch(branch_id));

create policy zones_read on public.delivery_zones for select using (is_active or app.current_staff_id() is not null);
create policy zones_write on public.delivery_zones for all to authenticated
  using (app.can_manage_branch(branch_id)) with check (app.can_manage_branch(branch_id));

create policy categories_read on public.categories for select using (is_active or app.current_staff_id() is not null);
create policy categories_admin on public.categories for all to authenticated using (app.is_super_admin()) with check (app.is_super_admin());

create policy products_read on public.products for select using (is_active or app.current_staff_id() is not null);
create policy products_admin on public.products for all to authenticated using (app.is_super_admin()) with check (app.is_super_admin());

create policy option_groups_read on public.product_option_groups for select using (true);
create policy option_groups_admin on public.product_option_groups for all to authenticated using (app.is_super_admin()) with check (app.is_super_admin());

create policy options_read on public.product_options for select using (is_active or app.current_staff_id() is not null);
create policy options_admin on public.product_options for all to authenticated using (app.is_super_admin()) with check (app.is_super_admin());

-- branch overrides: managers set prices; kitchen may toggle stop-list (enforced by trigger below)
create policy branch_products_read on public.branch_products for select using (true);
create policy branch_products_write on public.branch_products for all to authenticated
  using (app.can_access_branch(branch_id)) with check (app.can_access_branch(branch_id));

-- customers
create policy customers_self_read on public.customers for select to authenticated
  using (id = app.current_customer_id() or app.staff_can_see_customer(id));
create policy customers_self_update on public.customers for update to authenticated
  using (id = app.current_customer_id()) with check (id = app.current_customer_id());

create policy addresses_own on public.customer_addresses for all to authenticated
  using (customer_id = app.current_customer_id()) with check (customer_id = app.current_customer_id());

-- staff directory
create policy staff_read on public.staff for select to authenticated
  using (id = app.current_staff_id() or app.is_super_admin());
create policy staff_admin on public.staff for all to authenticated using (app.is_super_admin()) with check (app.is_super_admin());
create policy staff_branches_read on public.staff_branches for select to authenticated
  using (staff_id = app.current_staff_id() or app.is_super_admin());
create policy staff_branches_admin on public.staff_branches for all to authenticated using (app.is_super_admin()) with check (app.is_super_admin());

-- staff_credentials, sessions, otp_codes, rate_limits, payment_events:
-- RLS enabled with no policies and no grants => server-only.

-- promos
create policy promo_codes_admin on public.promo_codes for all to authenticated using (app.is_super_admin()) with check (app.is_super_admin());
create policy promo_code_brands_admin on public.promo_code_brands for all to authenticated using (app.is_super_admin()) with check (app.is_super_admin());
create policy promo_redemptions_read on public.promo_redemptions for select to authenticated
  using (customer_id = app.current_customer_id() or app.is_super_admin());

create policy promotions_read on public.promotions for select
  using ((status = 'published' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
         or app.is_super_admin());
create policy promotions_admin on public.promotions for all to authenticated using (app.is_super_admin()) with check (app.is_super_admin());

-- orders
create policy orders_read on public.orders for select to authenticated
  using (customer_id = app.current_customer_id() or app.can_access_branch(branch_id));
create policy orders_staff_update on public.orders for update to authenticated
  using (app.can_access_branch(branch_id)) with check (app.can_access_branch(branch_id));

create policy order_items_read on public.order_items for select to authenticated using (app.can_see_order(order_id));
create policy order_history_read on public.order_status_history for select to authenticated using (app.can_see_order(order_id));

create policy payments_read on public.payments for select to authenticated using (app.can_see_order(order_id));
create policy payments_staff_write on public.payments for insert to authenticated
  with check (exists (select 1 from public.orders o where o.id = order_id and app.can_manage_branch(o.branch_id)));
create policy payments_staff_update on public.payments for update to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and app.can_manage_branch(o.branch_id)));

create policy loyalty_read on public.loyalty_transactions for select to authenticated
  using (customer_id = app.current_customer_id() or app.staff_can_see_customer(customer_id));

-- reservations
create policy reservations_read on public.reservations for select to authenticated
  using (customer_id = app.current_customer_id() or app.can_access_branch(branch_id));
create policy reservations_staff_update on public.reservations for update to authenticated
  using (app.can_manage_branch(branch_id)) with check (app.can_manage_branch(branch_id));

-- content
create policy content_read on public.content_items for select
  using (status = 'published' or app.is_super_admin());
create policy content_admin on public.content_items for all to authenticated using (app.is_super_admin()) with check (app.is_super_admin());

-- feedback
create policy feedback_read on public.feedback for select to authenticated
  using (app.is_super_admin() or (branch_id is not null and app.can_manage_branch(branch_id)));
create policy feedback_update on public.feedback for update to authenticated
  using (app.is_super_admin() or (branch_id is not null and app.can_manage_branch(branch_id)));

-- audit
create policy audit_read on public.audit_logs for select to authenticated
  using (app.is_super_admin() or (branch_id is not null and app.can_manage_branch(branch_id)));
create policy audit_insert on public.audit_logs for insert to authenticated
  with check (actor_kind = 'staff' and actor_id = app.current_staff_id());

-- ---------------------------------------------------------------------------
-- Kitchen staff may only toggle availability, never prices.
-- ---------------------------------------------------------------------------

create or replace function app.guard_branch_products() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if app.staff_role() = 'kitchen' then
    if tg_op = 'DELETE' then
      raise exception 'kitchen staff cannot remove branch overrides' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' and new.price_override is not null then
      raise exception 'kitchen staff cannot set prices' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.price_override is distinct from old.price_override then
      raise exception 'kitchen staff cannot set prices' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger t_branch_products_guard before insert or update or delete on public.branch_products
  for each row execute function app.guard_branch_products();

-- ---------------------------------------------------------------------------
-- Order lifecycle
-- ---------------------------------------------------------------------------

create or replace function app.order_transition_allowed(fulfillment text, from_s text, to_s text) returns boolean
language sql immutable
as $$
  select case from_s
    when 'new'              then to_s in ('confirmed', 'cancelled')
    when 'confirmed'        then to_s in ('preparing', 'cancelled')
    when 'preparing'        then to_s in ('ready', 'cancelled')
    when 'ready'            then (fulfillment = 'delivery' and to_s = 'out_for_delivery')
                              or (fulfillment = 'pickup' and to_s = 'picked_up')
                              or to_s = 'cancelled'
    when 'out_for_delivery' then to_s in ('delivered', 'cancelled')
    else false
  end
$$;

create or replace function app.loyalty_config() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce((select value from public.settings where key = 'loyalty'),
                  '{"enabled": false, "earn_bps": 0}'::jsonb)
$$;

-- Adds a ledger row and moves the cached balance atomically.
create or replace function app.loyalty_post(
  p_customer uuid, p_order uuid, p_kind text, p_amount integer, p_note text, p_staff uuid
) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  new_balance integer;
begin
  if p_amount = 0 then
    return (select loyalty_balance from public.customers where id = p_customer);
  end if;
  update public.customers
     set loyalty_balance = loyalty_balance + p_amount
   where id = p_customer
  returning loyalty_balance into new_balance;
  if new_balance is null then
    raise exception 'customer not found';
  end if;
  insert into public.loyalty_transactions (customer_id, order_id, kind, amount, balance_after, note, staff_id)
  values (p_customer, p_order, p_kind, p_amount, new_balance, p_note, p_staff);
  return new_balance;
end $$;
revoke execute on function app.loyalty_post(uuid, uuid, text, integer, text, uuid) from public, anon, authenticated;

create or replace function app.orders_before_update() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  actor_role text := app.staff_role();
begin
  if new.payment_status is distinct from old.payment_status and actor_role = 'kitchen' then
    raise exception 'kitchen staff cannot change payment status' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if not app.order_transition_allowed(old.fulfillment, old.status, new.status) then
      raise exception 'invalid order transition % -> %', old.status, new.status using errcode = '22023';
    end if;
    if actor_role = 'kitchen' and new.status = 'cancelled' then
      raise exception 'kitchen staff cannot cancel orders' using errcode = '42501';
    end if;
    if new.status = 'cancelled' and coalesce(new.cancel_reason, '') = '' then
      raise exception 'cancel reason required' using errcode = '23514';
    end if;
    -- cash/card-on-delivery is collected on hand-over
    if new.status in ('delivered', 'picked_up')
       and new.payment_method in ('cash', 'card_on_delivery')
       and new.payment_status = 'unpaid' then
      new.payment_status := 'paid';
    end if;
    -- money already taken must be returned
    if new.status = 'cancelled' and old.payment_status = 'paid' and new.payment_status = 'paid' then
      new.payment_status := 'refund_pending';
    end if;
    -- online orders awaiting payment can simply be cancelled
    if new.status = 'cancelled' and new.payment_status = 'pending' then
      new.payment_status := 'failed';
    end if;
  end if;

  if new.payment_status = 'refunded' then
    new.refunded_amount := new.total;
  end if;
  return new;
end $$;

create or replace function app.orders_after_update() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  cfg jsonb;
  earn integer;
  actor_kind text := coalesce(nullif(current_setting('app.actor_kind', true), ''), auth.jwt() ->> 'kind', 'system');
  actor_id uuid := coalesce(nullif(current_setting('app.actor_id', true), '')::uuid, auth.uid());
  bal integer;
begin
  if new.status is distinct from old.status then
    insert into public.order_status_history (order_id, from_status, to_status, actor_kind, actor_id, note)
    values (new.id, old.status, new.status,
            case when actor_kind in ('customer', 'staff') then actor_kind else 'system' end,
            actor_id, nullif(current_setting('app.status_note', true), ''));

    if new.status = 'cancelled' then
      -- release the promo code use
      with v as (
        update public.promo_redemptions set status = 'void'
         where order_id = new.id and status = 'active'
        returning promo_code_id
      )
      update public.promo_codes p set used_count = greatest(p.used_count - 1, 0)
        from v where p.id = v.promo_code_id;
      -- give back spent loyalty credit
      if new.loyalty_spent > 0 and not exists (
        select 1 from public.loyalty_transactions where order_id = new.id and kind = 'refund'
      ) then
        perform app.loyalty_post(new.customer_id, new.id, 'refund', new.loyalty_spent, 'Order cancelled', null);
      end if;
    end if;
  end if;

  -- earn once the order is completed and paid
  if new.status in ('delivered', 'picked_up') and new.payment_status = 'paid'
     and new.loyalty_earned = 0
     and not exists (select 1 from public.loyalty_transactions where order_id = new.id and kind = 'earn') then
    cfg := app.loyalty_config();
    if coalesce((cfg ->> 'enabled')::boolean, false) then
      earn := floor(greatest(new.subtotal - new.discount_total - new.loyalty_spent, 0)
                    * coalesce((cfg ->> 'earn_bps')::integer, 0) / 10000.0);
      if earn > 0 then
        perform app.loyalty_post(new.customer_id, new.id, 'earn', earn, 'Order completed', null);
        update public.orders set loyalty_earned = earn where id = new.id;
      end if;
    end if;
  end if;

  -- a refunded completed order takes back what it earned (never below zero)
  if new.payment_status = 'refunded' and old.payment_status is distinct from 'refunded'
     and new.loyalty_earned > 0
     and not exists (select 1 from public.loyalty_transactions where order_id = new.id and kind = 'reverse_earn') then
    select loyalty_balance into bal from public.customers where id = new.customer_id for update;
    if least(bal, new.loyalty_earned) > 0 then
      perform app.loyalty_post(new.customer_id, new.id, 'reverse_earn', -least(bal, new.loyalty_earned), 'Order refunded', null);
    end if;
  end if;
  return null;
end $$;

create trigger t_orders_before_update before update on public.orders
  for each row execute function app.orders_before_update();
create trigger t_orders_after_update after update on public.orders
  for each row execute function app.orders_after_update();

-- Initial history row on insert.
create or replace function app.orders_after_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.order_status_history (order_id, from_status, to_status, actor_kind, actor_id)
  values (new.id, null, new.status, 'customer', new.customer_id);
  return null;
end $$;
create trigger t_orders_after_insert after insert on public.orders
  for each row execute function app.orders_after_insert();

-- ---------------------------------------------------------------------------
-- Audited loyalty adjustment, callable by staff through RLS-bound sessions.
-- ---------------------------------------------------------------------------

create or replace function app.staff_adjust_loyalty(p_customer uuid, p_amount integer, p_note text)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  sid uuid := app.current_staff_id();
  bal integer;
begin
  if sid is null or app.staff_role() not in ('super_admin', 'branch_manager')
     or not app.staff_can_see_customer(p_customer) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_amount = 0 or abs(p_amount) > 10000000 then
    raise exception 'invalid amount' using errcode = '22023';
  end if;
  if coalesce(length(trim(p_note)), 0) < 3 then
    raise exception 'a reason is required' using errcode = '23514';
  end if;
  select loyalty_balance into bal from public.customers where id = p_customer for update;
  if bal + p_amount < 0 then
    raise exception 'balance cannot go below zero' using errcode = '23514';
  end if;
  bal := app.loyalty_post(p_customer, null, 'adjust', p_amount, trim(p_note), sid);
  insert into public.audit_logs (actor_kind, actor_id, action, entity, entity_id, data)
  values ('staff', sid, 'loyalty.adjust', 'customer', p_customer::text,
          jsonb_build_object('amount', p_amount, 'note', trim(p_note), 'balance_after', bal));
  return bal;
end $$;

create or replace function app.staff_set_customer_blocked(p_customer uuid, p_blocked boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  sid uuid := app.current_staff_id();
begin
  if not app.is_super_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.customers set is_blocked = p_blocked where id = p_customer;
  insert into public.audit_logs (actor_kind, actor_id, action, entity, entity_id, data)
  values ('staff', sid, case when p_blocked then 'customer.block' else 'customer.unblock' end,
          'customer', p_customer::text, '{}'::jsonb);
end $$;

grant execute on function app.staff_adjust_loyalty(uuid, integer, text) to authenticated;
grant execute on function app.staff_set_customer_blocked(uuid, boolean) to authenticated;
