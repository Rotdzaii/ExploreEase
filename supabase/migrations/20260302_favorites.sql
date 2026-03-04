-- Favorites / bookmarking schema for ExploreEase
-- Module 4.3 & 5.1: Save destination to user's favorites

create extension if not exists pgcrypto;

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Stored as text to support both numeric and UUID destination IDs.
  destination_id text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists favorites_user_destination_uidx on public.favorites (user_id, destination_id);
create index if not exists favorites_user_id_idx on public.favorites (user_id);

alter table public.favorites enable row level security;

-- Policies (owner-only)
drop policy if exists "favorites_select_own" on public.favorites;
create policy "favorites_select_own" on public.favorites for select using (auth.uid() = user_id);

drop policy if exists "favorites_insert_own" on public.favorites;
create policy "favorites_insert_own" on public.favorites for insert with check (auth.uid() = user_id);

drop policy if exists "favorites_delete_own" on public.favorites;
create policy "favorites_delete_own" on public.favorites for delete using (auth.uid() = user_id);
