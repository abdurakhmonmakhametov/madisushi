-- Uploaded images stored in the database, for hosts whose disk is wiped on
-- restart (e.g. Render's free plan) when Supabase Storage isn't configured.
-- Served by src/app/media/[...path]/route.ts. Uploads are capped at 2 MB.
create table public.media_files (
  path        text primary key,          -- "<folder>/<uuid>.<ext>"
  mime        text not null check (mime in ('image/png', 'image/jpeg', 'image/webp')),
  data        bytea not null,
  size        integer not null,
  created_at  timestamptz not null default now()
);

-- RLS enabled with no policies and no grants => server-only.
alter table public.media_files enable row level security;
