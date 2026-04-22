-- Roadmap core alignment (v0 compatibility + current app safety)
-- 1) events: created_by, moderation status, region
-- 2) trips: notes + optimized_route
-- 3) trip_items: canonical table for trip timeline entries

create extension if not exists pgcrypto;

-- ------------------------------
-- 1) EVENTS ALIGNMENT
-- ------------------------------
alter table public.events
  add column if not exists created_by uuid references auth.users (id) on delete cascade,
  add column if not exists region text,
  add column if not exists approval_status text;

-- Keep creator columns aligned for existing rows.
update public.events
set created_by = coalesce(created_by, creator_id)
where created_by is null;

update public.events
set creator_id = coalesce(creator_id, created_by)
where creator_id is null
  and created_by is not null;

-- Temporarily disable approval/notify triggers while backfilling moderation columns.
do $$
begin
  if exists (
    select 1
    from pg_trigger
    where tgname = 'trg_enforce_event_approval_status_admin'
      and tgrelid = 'public.events'::regclass
      and not tgisinternal
  ) then
    execute 'alter table public.events disable trigger trg_enforce_event_approval_status_admin';
  end if;

  if exists (
    select 1
    from pg_trigger
    where tgname = 'trg_notify_event_approval_status_approved'
      and tgrelid = 'public.events'::regclass
      and not tgisinternal
  ) then
    execute 'alter table public.events disable trigger trg_notify_event_approval_status_approved';
  end if;

  if exists (
    select 1
    from pg_trigger
    where tgname = 'trg_notify_event_status_approved'
      and tgrelid = 'public.events'::regclass
      and not tgisinternal
  ) then
    execute 'alter table public.events disable trigger trg_notify_event_status_approved';
  end if;
end
$$;

-- Replace legacy lifecycle status constraint with moderation status constraint.
alter table public.events
  drop constraint if exists events_status_check;

-- Backfill moderation status from existing approval_status/status semantics.
update public.events
set status = case
  when lower(coalesce(status, '')) in ('pending', 'approved', 'rejected')
    then lower(status)
  when lower(coalesce(approval_status, '')) in ('pending', 'approved', 'rejected')
    then lower(approval_status)
  when lower(coalesce(status, '')) in ('incoming', 'ongoing', 'completed')
    then 'approved'
  else 'pending'
end;

update public.events
set approval_status = case
  when lower(coalesce(approval_status, '')) in ('pending', 'approved', 'rejected')
    then lower(approval_status)
  when lower(coalesce(status, '')) in ('pending', 'approved', 'rejected')
    then lower(status)
  else 'pending'
end;

-- Keep both moderation fields in sync after backfill.
update public.events
set approval_status = lower(status)
where approval_status is distinct from lower(status);

update public.events
set status = lower(approval_status)
where status is distinct from lower(approval_status);

alter table public.events
  alter column status set default 'pending';

update public.events
set status = 'pending'
where status is null
  or btrim(status) = '';

alter table public.events
  alter column status set not null;

alter table public.events
  add constraint events_status_check
  check (lower(status) in ('pending', 'approved', 'rejected'));

alter table public.events
  alter column approval_status set default 'pending';

update public.events
set approval_status = 'pending'
where approval_status is null
  or btrim(approval_status) = '';

alter table public.events
  alter column approval_status set not null;

alter table public.events
  drop constraint if exists events_approval_status_check;

alter table public.events
  add constraint events_approval_status_check
  check (lower(approval_status) in ('pending', 'approved', 'rejected'));

create index if not exists events_created_by_idx
  on public.events (created_by);

create index if not exists events_region_idx
  on public.events (region);

create or replace function public.sync_event_moderation_and_creator_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  status_changed boolean;
  approval_changed boolean;
begin
  if new.creator_id is null and new.created_by is not null then
    new.creator_id := new.created_by;
  elsif new.created_by is null and new.creator_id is not null then
    new.created_by := new.creator_id;
  end if;

  if tg_op = 'INSERT' then
    new.status := lower(coalesce(nullif(btrim(new.status), ''), nullif(btrim(new.approval_status), ''), 'pending'));
    new.approval_status := lower(coalesce(nullif(btrim(new.approval_status), ''), new.status, 'pending'));

    if new.status is distinct from new.approval_status then
      new.approval_status := new.status;
    end if;

    return new;
  end if;

  status_changed := new.status is distinct from old.status;
  approval_changed := new.approval_status is distinct from old.approval_status;

  if status_changed and not approval_changed then
    new.status := lower(coalesce(nullif(btrim(new.status), ''), 'pending'));
    new.approval_status := new.status;
  elsif approval_changed and not status_changed then
    new.approval_status := lower(coalesce(nullif(btrim(new.approval_status), ''), 'pending'));
    new.status := new.approval_status;
  elsif status_changed and approval_changed then
    new.status := lower(coalesce(nullif(btrim(new.status), ''), 'pending'));
    new.approval_status := new.status;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_event_moderation_and_creator_columns on public.events;
create trigger trg_sync_event_moderation_and_creator_columns
before insert or update of status, approval_status, creator_id, created_by on public.events
for each row
execute function public.sync_event_moderation_and_creator_columns();

-- Re-enable previously disabled triggers.
do $$
begin
  if exists (
    select 1
    from pg_trigger
    where tgname = 'trg_enforce_event_approval_status_admin'
      and tgrelid = 'public.events'::regclass
      and not tgisinternal
  ) then
    execute 'alter table public.events enable trigger trg_enforce_event_approval_status_admin';
  end if;

  if exists (
    select 1
    from pg_trigger
    where tgname = 'trg_notify_event_approval_status_approved'
      and tgrelid = 'public.events'::regclass
      and not tgisinternal
  ) then
    execute 'alter table public.events enable trigger trg_notify_event_approval_status_approved';
  end if;

  if exists (
    select 1
    from pg_trigger
    where tgname = 'trg_notify_event_status_approved'
      and tgrelid = 'public.events'::regclass
      and not tgisinternal
  ) then
    execute 'alter table public.events enable trigger trg_notify_event_status_approved';
  end if;
end
$$;

-- ------------------------------
-- 2) TRIPS ALIGNMENT
-- ------------------------------
alter table public.trips
  add column if not exists notes text,
  add column if not exists optimized_route jsonb;

update public.trips
set optimized_route = '[]'::jsonb
where optimized_route is null;

alter table public.trips
  alter column optimized_route set default '[]'::jsonb,
  alter column optimized_route set not null;

alter table public.trips
  drop constraint if exists trips_date_range_check;

alter table public.trips
  add constraint trips_date_range_check
  check (start_date is null or end_date is null or end_date >= start_date);

-- ------------------------------
-- 3) TRIP_ITEMS (canonical)
-- ------------------------------
create table if not exists public.trip_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  itinerary_id uuid null references public.itineraries (id) on delete cascade,
  destination_id text null,
  event_id uuid null references public.events (id) on delete set null,
  day int not null check (day >= 1),
  day_number int not null default 1 check (day_number >= 1),
  sort_order int null,
  name text not null,
  description text null,
  image_url text null,
  start_time time null,
  end_time time null,
  time_slot text null,
  latitude double precision null,
  longitude double precision null,
  created_at timestamptz not null default now()
);

create index if not exists trip_items_trip_day_idx
  on public.trip_items (trip_id, day);

create index if not exists trip_items_user_id_idx
  on public.trip_items (user_id);

create index if not exists trip_items_event_id_idx
  on public.trip_items (event_id);

create index if not exists trip_items_destination_id_idx
  on public.trip_items (destination_id);

-- Backfill from legacy itinerary_items if it exists.
do $$
begin
  if to_regclass('public.itinerary_items') is not null then
    insert into public.trip_items (
      id,
      user_id,
      trip_id,
      day,
      day_number,
      name,
      description,
      image_url,
      start_time,
      end_time,
      latitude,
      longitude,
      created_at
    )
    select
      ii.id,
      ii.user_id,
      ii.trip_id,
      coalesce(ii.day, 1),
      coalesce(ii.day, 1),
      ii.name,
      ii.description,
      ii.image_url,
      ii.start_time,
      ii.end_time,
      ii.latitude,
      ii.longitude,
      coalesce(ii.created_at, now())
    from public.itinerary_items ii
    on conflict (id) do nothing;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'itinerary_items'
        and column_name = 'destination_id'
    ) then
      execute $dest_sql$
        update public.trip_items ti
        set destination_id = nullif(btrim((ii.destination_id)::text), '')
        from public.itinerary_items ii
        where ii.id = ti.id
          and ti.destination_id is null
      $dest_sql$;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'itinerary_items'
        and column_name = 'event_id'
    ) then
      execute $event_sql$
        update public.trip_items ti
        set event_id = ii.event_id
        from public.itinerary_items ii
        where ii.id = ti.id
          and ti.event_id is null
      $event_sql$;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'itinerary_items'
        and column_name = 'itinerary_id'
    ) then
      execute $itinerary_sql$
        update public.trip_items ti
        set itinerary_id = ii.itinerary_id
        from public.itinerary_items ii
        where ii.id = ti.id
          and ti.itinerary_id is null
      $itinerary_sql$;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'itinerary_items'
        and column_name = 'time_slot'
    ) then
      execute $time_slot_sql$
        update public.trip_items ti
        set time_slot = ii.time_slot
        from public.itinerary_items ii
        where ii.id = ti.id
          and ti.time_slot is null
      $time_slot_sql$;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'itinerary_items'
        and column_name = 'day_number'
    ) then
      execute $day_sql$
        update public.trip_items ti
        set day_number = coalesce(ii.day_number, ti.day_number, 1)
        from public.itinerary_items ii
        where ii.id = ti.id
      $day_sql$;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'itinerary_items'
        and column_name = 'sort_order'
    ) then
      execute $sort_sql$
        update public.trip_items ti
        set sort_order = ii.sort_order
        from public.itinerary_items ii
        where ii.id = ti.id
      $sort_sql$;
    end if;
  end if;
end
$$;

alter table public.trip_items enable row level security;

drop policy if exists "trip_items_select_own" on public.trip_items;
create policy "trip_items_select_own"
  on public.trip_items
  for select
  using (auth.uid() = user_id);

drop policy if exists "trip_items_insert_own" on public.trip_items;
create policy "trip_items_insert_own"
  on public.trip_items
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "trip_items_update_own" on public.trip_items;
create policy "trip_items_update_own"
  on public.trip_items
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "trip_items_delete_own" on public.trip_items;
create policy "trip_items_delete_own"
  on public.trip_items
  for delete
  using (auth.uid() = user_id);
