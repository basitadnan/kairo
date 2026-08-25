-- MEGA Schedule · initial schema
-- Run this in the SQL editor of your (free) Supabase project.
-- Document-style sync table: one row per entity, JSONB payload, per-user RLS.

create table if not exists public.sync_docs (
  table_name text not null,
  id uuid not null,
  user_id uuid not null default auth.uid(),
  data jsonb not null,
  updated_at bigint not null,
  deleted smallint not null default 0,
  primary key (table_name, id)
);

alter table public.sync_docs enable row level security;

drop policy if exists "Users manage their own docs" on public.sync_docs;
create policy "Users manage their own docs"
  on public.sync_docs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists sync_docs_user_updated_idx
  on public.sync_docs (user_id, updated_at);
