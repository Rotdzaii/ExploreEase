-- Travel planning schema for ExploreEase
-- Includes: trips, itineraries (day_plans JSONB), itinerary_items, reminders (pending/sent)
-- Run this in Supabase SQL editor.

-- Extensions
create extension if not exists pgcrypto;

-- Trips
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  cover text null,
  start_date date null,
  end_date date null,
  destination text null,
  created_at timestamptz not null default now()
);

create index if not exists trips_user_id_idx on public.trips (user_id);

-- Itineraries (notes stored in day_plans)
create table if not exists public.itineraries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  -- Example shape:
  -- {
  --   "1": { "notes": ["...", "..."] },
  --   "2": { "notes": ["..."] }
  -- }
  day_plans jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists itineraries_trip_id_idx on public.itineraries (trip_id);
create index if not exists itineraries_user_id_idx on public.itineraries (user_id);

-- Itinerary items (timeline locations)
create table if not exists public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  day int not null check (day >= 1),
  -- Deterministic ordering within a day (used for optimization / manual ordering)
  sort_order int null,
  name text not null,
  description text null,
  image_url text null,
  start_time time null,
  end_time time null,
  latitude double precision null,
  longitude double precision null,
  created_at timestamptz not null default now()
);

create index if not exists itinerary_items_trip_day_idx on public.itinerary_items (trip_id, day);
create index if not exists itinerary_items_user_id_idx on public.itinerary_items (user_id);

-- Backward-compatible: add sort_order if table already existed
alter table public.itinerary_items add column if not exists sort_order int;

-- Reminders
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  message text not null,
  remind_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent')),
  created_at timestamptz not null default now()
);

create index if not exists reminders_user_id_idx on public.reminders (user_id);
create index if not exists reminders_user_status_at_idx on public.reminders (user_id, status, remind_at);

-- Auto-update updated_at on itineraries
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_itineraries_updated_at on public.itineraries;
create trigger trg_itineraries_updated_at
before update on public.itineraries
for each row execute function public.set_updated_at();

-- RLS
alter table public.trips enable row level security;
alter table public.itineraries enable row level security;
alter table public.itinerary_items enable row level security;
alter table public.reminders enable row level security;

-- Policies (owner-only)
-- trips
drop policy if exists "trips_select_own" on public.trips;
create policy "trips_select_own" on public.trips for select using (auth.uid() = user_id);

drop policy if exists "trips_insert_own" on public.trips;
create policy "trips_insert_own" on public.trips for insert with check (auth.uid() = user_id);

drop policy if exists "trips_update_own" on public.trips;
create policy "trips_update_own" on public.trips for update using (auth.uid() = user_id);

drop policy if exists "trips_delete_own" on public.trips;
create policy "trips_delete_own" on public.trips for delete using (auth.uid() = user_id);

-- itineraries
drop policy if exists "itineraries_select_own" on public.itineraries;
create policy "itineraries_select_own" on public.itineraries for select using (auth.uid() = user_id);

drop policy if exists "itineraries_insert_own" on public.itineraries;
create policy "itineraries_insert_own" on public.itineraries for insert with check (auth.uid() = user_id);

drop policy if exists "itineraries_update_own" on public.itineraries;
create policy "itineraries_update_own" on public.itineraries for update using (auth.uid() = user_id);

drop policy if exists "itineraries_delete_own" on public.itineraries;
create policy "itineraries_delete_own" on public.itineraries for delete using (auth.uid() = user_id);

-- itinerary_items
drop policy if exists "itinerary_items_select_own" on public.itinerary_items;
create policy "itinerary_items_select_own" on public.itinerary_items for select using (auth.uid() = user_id);

drop policy if exists "itinerary_items_insert_own" on public.itinerary_items;
create policy "itinerary_items_insert_own" on public.itinerary_items for insert with check (auth.uid() = user_id);

drop policy if exists "itinerary_items_update_own" on public.itinerary_items;
create policy "itinerary_items_update_own" on public.itinerary_items for update using (auth.uid() = user_id);

drop policy if exists "itinerary_items_delete_own" on public.itinerary_items;
create policy "itinerary_items_delete_own" on public.itinerary_items for delete using (auth.uid() = user_id);

-- reminders
drop policy if exists "reminders_select_own" on public.reminders;
create policy "reminders_select_own" on public.reminders for select using (auth.uid() = user_id);

drop policy if exists "reminders_insert_own" on public.reminders;
create policy "reminders_insert_own" on public.reminders for insert with check (auth.uid() = user_id);

drop policy if exists "reminders_update_own" on public.reminders;
create policy "reminders_update_own" on public.reminders for update using (auth.uid() = user_id);

drop policy if exists "reminders_delete_own" on public.reminders;
create policy "reminders_delete_own" on public.reminders for delete using (auth.uid() = user_id);

-- Realtime publication (optional): enable INSERT events for reminders
-- If this errors, add the table via Supabase Dashboard (Database -> Replication).
-- alter publication supabase_realtime add table public.reminders;
