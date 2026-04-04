-- Module 12.1: Itinerary Builder alignment
-- This migration upgrades the existing travel-planning schema in place.
-- It is backward-compatible with current trip/day based flows.

-- 1) Enrich itineraries with explicit metadata used by the new UI/API.
alter table public.itineraries
  add column if not exists title text,
  add column if not exists start_date date,
  add column if not exists end_date date;

-- Backfill itinerary metadata from linked trip when available.
update public.itineraries i
set
  title = coalesce(i.title, t.name),
  start_date = coalesce(i.start_date, t.start_date),
  end_date = coalesce(i.end_date, t.end_date)
from public.trips t
where i.trip_id = t.id
  and (i.title is null or i.start_date is null or i.end_date is null);

-- Ensure title is always populated for client-side list rendering.
update public.itineraries
set title = 'My Trip'
where title is null or btrim(title) = '';

alter table public.itineraries
  alter column title set default 'My Trip',
  alter column title set not null;

alter table public.itineraries
  drop constraint if exists itineraries_date_range_check;

alter table public.itineraries
  add constraint itineraries_date_range_check
  check (start_date is null or end_date is null or end_date >= start_date);

create index if not exists itineraries_user_start_date_idx
  on public.itineraries (user_id, start_date desc);

-- 2) Add new relation/fields for itinerary_items required by Module 12.1.
alter table public.itinerary_items
  add column if not exists itinerary_id uuid references public.itineraries (id) on delete cascade,
  add column if not exists day_number int,
  add column if not exists event_id uuid references public.events (id) on delete set null,
  add column if not exists time_slot text;

-- Backfill day_number from legacy day column.
update public.itinerary_items
set day_number = coalesce(day_number, day, 1)
where day_number is null;

alter table public.itinerary_items
  alter column day_number set default 1,
  alter column day_number set not null;

alter table public.itinerary_items
  drop constraint if exists itinerary_items_day_number_check;

alter table public.itinerary_items
  add constraint itinerary_items_day_number_check
  check (day_number >= 1);

-- Backfill itinerary_id by matching legacy trip_id ownership.
update public.itinerary_items ii
set itinerary_id = sub.id
from (
  select distinct on (i.user_id, i.trip_id)
    i.user_id,
    i.trip_id,
    i.id
  from public.itineraries i
  order by i.user_id, i.trip_id, i.created_at asc
) as sub
where ii.itinerary_id is null
  and ii.user_id = sub.user_id
  and ii.trip_id = sub.trip_id;

create index if not exists itinerary_items_itinerary_day_idx
  on public.itinerary_items (itinerary_id, day_number);

create index if not exists itinerary_items_event_id_idx
  on public.itinerary_items (event_id);
