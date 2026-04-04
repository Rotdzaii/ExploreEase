-- Event management schema for ExploreEase
-- Includes events table, validation constraints, indexes, and owner/public access policies.

create extension if not exists pgcrypto;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) > 0),
  category text not null check (char_length(trim(category)) > 0),
  location text not null check (char_length(trim(location)) > 0),
  start_time timestamptz not null,
  end_time timestamptz not null,
  price numeric(12,2) not null default 0 check (price >= 0),
  image_url text null,
  status text not null default 'incoming' check (status in ('incoming', 'ongoing', 'completed')),
  creator_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint events_end_after_start check (end_time > start_time)
);

create index if not exists events_creator_id_idx on public.events (creator_id);
create index if not exists events_status_idx on public.events (status);
create index if not exists events_category_idx on public.events (category);
create index if not exists events_start_time_idx on public.events (start_time);
create index if not exists events_price_idx on public.events (price);

alter table public.events enable row level security;

-- Public read for discovery (home/explore).
drop policy if exists "events_select_all" on public.events;
create policy "events_select_all"
  on public.events
  for select
  using (true);

-- Creator owns writes.
drop policy if exists "events_insert_own" on public.events;
create policy "events_insert_own"
  on public.events
  for insert
  with check (auth.uid() = creator_id);

drop policy if exists "events_update_own" on public.events;
create policy "events_update_own"
  on public.events
  for update
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);

drop policy if exists "events_delete_own" on public.events;
create policy "events_delete_own"
  on public.events
  for delete
  using (auth.uid() = creator_id);
