-- Social schema upgrade
-- Adds canonical tables: relationships, activity_logs
-- Keeps compatibility with existing follows / activities tables

create extension if not exists pgcrypto;

create table if not exists public.relationships (
  follower_id uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint relationships_no_self_follow check (follower_id <> following_id),
  constraint relationships_pk primary key (follower_id, following_id)
);

create index if not exists relationships_following_id_idx
  on public.relationships (following_id);

create index if not exists relationships_follower_created_at_idx
  on public.relationships (follower_id, created_at desc);

alter table public.relationships enable row level security;

drop policy if exists "relationships_select_authenticated" on public.relationships;
create policy "relationships_select_authenticated"
  on public.relationships
  for select
  to authenticated
  using (true);

drop policy if exists "relationships_insert_own" on public.relationships;
create policy "relationships_insert_own"
  on public.relationships
  for insert
  to authenticated
  with check (auth.uid() = follower_id);

drop policy if exists "relationships_delete_own" on public.relationships;
create policy "relationships_delete_own"
  on public.relationships
  for delete
  to authenticated
  using (auth.uid() = follower_id);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  action_type text not null check (action_type in ('review', 'bookmark', 'attend_event', 'follow', 'message', 'trip_save')),
  target_id text not null,
  target_type text not null check (target_type in ('destination', 'event', 'review', 'event_review', 'user', 'conversation', 'message', 'trip')),
  metadata jsonb not null default '{}'::jsonb,
  source_legacy_activity_id uuid unique,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_user_id_created_at_idx
  on public.activity_logs (user_id, created_at desc);

create index if not exists activity_logs_created_at_idx
  on public.activity_logs (created_at desc);

create index if not exists activity_logs_action_type_idx
  on public.activity_logs (action_type);

alter table public.activity_logs enable row level security;

drop policy if exists "activity_logs_select_feed" on public.activity_logs;
create policy "activity_logs_select_feed"
  on public.activity_logs
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.relationships r
      where r.follower_id = auth.uid()
        and r.following_id = user_id
    )
  );

drop policy if exists "activity_logs_insert_own" on public.activity_logs;
create policy "activity_logs_insert_own"
  on public.activity_logs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "activity_logs_delete_own" on public.activity_logs;
create policy "activity_logs_delete_own"
  on public.activity_logs
  for delete
  to authenticated
  using (auth.uid() = user_id);

insert into public.relationships (follower_id, following_id, created_at)
select f.follower_id, f.following_id, f.created_at
from public.follows f
on conflict (follower_id, following_id) do nothing;

insert into public.activity_logs (
  user_id,
  action_type,
  target_id,
  target_type,
  metadata,
  source_legacy_activity_id,
  created_at
)
select
  a.user_id,
  case
    when a.action_type in ('review', 'bookmark', 'attend_event', 'follow', 'message') then a.action_type
    else 'bookmark'
  end,
  a.target_id,
  case
    when a.target_type in ('destination', 'event', 'review', 'event_review', 'user', 'conversation', 'message') then a.target_type
    else 'destination'
  end,
  '{}'::jsonb,
  a.id,
  a.created_at
from public.activities a
where not exists (
  select 1
  from public.activity_logs l
  where l.source_legacy_activity_id = a.id
);

create or replace function public.sync_legacy_activity_to_activity_logs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_logs (
    user_id,
    action_type,
    target_id,
    target_type,
    metadata,
    source_legacy_activity_id,
    created_at
  )
  values (
    new.user_id,
    case
      when new.action_type in ('review', 'bookmark', 'attend_event', 'follow', 'message') then new.action_type
      else 'bookmark'
    end,
    new.target_id,
    case
      when new.target_type in ('destination', 'event', 'review', 'event_review', 'user', 'conversation', 'message') then new.target_type
      else 'destination'
    end,
    '{}'::jsonb,
    new.id,
    new.created_at
  )
  on conflict (source_legacy_activity_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_sync_legacy_activity_to_activity_logs on public.activities;
create trigger trg_sync_legacy_activity_to_activity_logs
  after insert on public.activities
  for each row
  execute function public.sync_legacy_activity_to_activity_logs();
