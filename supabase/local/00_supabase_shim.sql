-- LOCAL DEVELOPMENT ONLY.
-- Recreates the small part of Supabase's environment that our migrations rely
-- on (the anon/authenticated/service_role roles and auth.uid()/auth.jwt()),
-- so the exact same migrations and RLS policies run on a plain PostgreSQL.
-- scripts/migrate.ts applies this file only when the database has no `auth`
-- schema, i.e. never on a real Supabase project.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    begin
      create role service_role nologin noinherit bypassrls;
    exception when insufficient_privilege then
      -- Hosted Postgres (e.g. Neon) owners may not grant BYPASSRLS. The app never
      -- connects as service_role; it only has to exist for the grants.
      create role service_role nologin noinherit;
    end;
  end if;
end $$;

-- The connecting (owner) role must be able to SET ROLE to these.
grant anon, authenticated, service_role to current_user;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create or replace function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(
    coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), auth.jwt() ->> 'sub'),
    ''
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), auth.jwt() ->> 'role')
$$;
