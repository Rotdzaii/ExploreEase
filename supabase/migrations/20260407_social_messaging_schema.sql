-- Sprint 1: Social & Messaging schema (Modules 14 & 15)
-- Includes: follows, activities, conversations, conversation_participants, messages
-- Includes: activity triggers (review + bookmark), strict RLS policies

create extension if not exists pgcrypto;

-- =========================================================
-- 1) Follow system
-- =========================================================
create table if not exists public.follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint follows_no_self_follow check (follower_id <> following_id),
  constraint follows_pk primary key (follower_id, following_id)
);

create index if not exists follows_following_id_idx
  on public.follows (following_id);

create index if not exists follows_follower_created_at_idx
  on public.follows (follower_id, created_at desc);

alter table public.follows enable row level security;

drop policy if exists "follows_select_authenticated" on public.follows;
create policy "follows_select_authenticated"
  on public.follows
  for select
  to authenticated
  using (true);

drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own"
  on public.follows
  for insert
  to authenticated
  with check (auth.uid() = follower_id);

drop policy if exists "follows_delete_own" on public.follows;
create policy "follows_delete_own"
  on public.follows
  for delete
  to authenticated
  using (auth.uid() = follower_id);

-- =========================================================
-- 2) Activity feed
-- =========================================================
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  action_type text not null check (action_type in ('review', 'bookmark', 'attend_event', 'follow', 'message')),
  target_id text not null,
  target_type text not null check (target_type in ('destination', 'event', 'review', 'event_review', 'user', 'conversation', 'message')),
  created_at timestamptz not null default now()
);

create index if not exists activities_user_id_created_at_idx
  on public.activities (user_id, created_at desc);

create index if not exists activities_created_at_idx
  on public.activities (created_at desc);

create index if not exists activities_action_type_idx
  on public.activities (action_type);

alter table public.activities enable row level security;

drop policy if exists "activities_select_feed" on public.activities;
create policy "activities_select_feed"
  on public.activities
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.follows f
      where f.follower_id = auth.uid()
        and f.following_id = user_id
    )
  );

drop policy if exists "activities_insert_own" on public.activities;
create policy "activities_insert_own"
  on public.activities
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "activities_delete_own" on public.activities;
create policy "activities_delete_own"
  on public.activities
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Trigger function: create activity on destination review insert
create or replace function public.log_activity_from_destination_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activities (user_id, action_type, target_id, target_type, created_at)
  values (new.user_id, 'review', new.id::text, 'review', now());

  return new;
end;
$$;

-- Trigger function: create activity on event review insert (if table exists)
create or replace function public.log_activity_from_event_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activities (user_id, action_type, target_id, target_type, created_at)
  values (new.user_id, 'review', new.id::text, 'event_review', now());

  return new;
end;
$$;

-- Trigger function: create activity on bookmark/favorite insert
create or replace function public.log_activity_from_favorite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activities (user_id, action_type, target_id, target_type, created_at)
  values (new.user_id, 'bookmark', new.destination_id::text, 'destination', now());

  return new;
end;
$$;

-- Attach triggers safely (only when source tables exist)
do $$
begin
  if to_regclass('public.reviews') is not null then
    execute 'drop trigger if exists trg_activities_from_destination_review on public.reviews';
    execute 'create trigger trg_activities_from_destination_review
      after insert on public.reviews
      for each row
      execute function public.log_activity_from_destination_review()';
  end if;

  if to_regclass('public.event_reviews') is not null then
    execute 'drop trigger if exists trg_activities_from_event_review on public.event_reviews';
    execute 'create trigger trg_activities_from_event_review
      after insert on public.event_reviews
      for each row
      execute function public.log_activity_from_event_review()';
  end if;

  if to_regclass('public.favorites') is not null then
    execute 'drop trigger if exists trg_activities_from_favorite on public.favorites';
    execute 'create trigger trg_activities_from_favorite
      after insert on public.favorites
      for each row
      execute function public.log_activity_from_favorite()';
  end if;
end
$$;

-- =========================================================
-- 3) Messaging
-- =========================================================
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct', 'group')),
  event_id uuid null references public.events (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists conversations_type_idx
  on public.conversations (type);

create index if not exists conversations_event_id_idx
  on public.conversations (event_id);

create index if not exists conversations_created_at_idx
  on public.conversations (created_at desc);

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),

  constraint conversation_participants_pk primary key (conversation_id, user_id)
);

create index if not exists conversation_participants_user_id_idx
  on public.conversation_participants (user_id, joined_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  content_type text not null check (content_type in ('text', 'image', 'location')),
  content_text text,
  media_url text,
  created_at timestamptz not null default now(),

  constraint messages_payload_check check (
    (content_type = 'text' and nullif(btrim(coalesce(content_text, '')), '') is not null)
    or (content_type = 'image' and nullif(btrim(coalesce(media_url, '')), '') is not null)
    or (
      content_type = 'location'
      and (
        nullif(btrim(coalesce(content_text, '')), '') is not null
        or nullif(btrim(coalesce(media_url, '')), '') is not null
      )
    )
  )
);

create index if not exists messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at asc);

create index if not exists messages_sender_id_created_at_idx
  on public.messages (sender_id, created_at desc);

-- Helper to evaluate membership safely in RLS expressions.
create or replace function public.is_conversation_participant(
  p_conversation_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.user_id = p_user_id
  );
$$;

revoke all on function public.is_conversation_participant(uuid, uuid) from public;
grant execute on function public.is_conversation_participant(uuid, uuid) to authenticated;

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

-- conversations RLS

drop policy if exists "conversations_select_participants_only" on public.conversations;
create policy "conversations_select_participants_only"
  on public.conversations
  for select
  to authenticated
  using (public.is_conversation_participant(id, auth.uid()));

drop policy if exists "conversations_insert_authenticated" on public.conversations;
create policy "conversations_insert_authenticated"
  on public.conversations
  for insert
  to authenticated
  with check (auth.uid() is not null);

drop policy if exists "conversations_update_participants_only" on public.conversations;
create policy "conversations_update_participants_only"
  on public.conversations
  for update
  to authenticated
  using (public.is_conversation_participant(id, auth.uid()))
  with check (public.is_conversation_participant(id, auth.uid()));

drop policy if exists "conversations_delete_participants_only" on public.conversations;
create policy "conversations_delete_participants_only"
  on public.conversations
  for delete
  to authenticated
  using (public.is_conversation_participant(id, auth.uid()));

-- conversation_participants RLS

drop policy if exists "conversation_participants_select_participants_only" on public.conversation_participants;
create policy "conversation_participants_select_participants_only"
  on public.conversation_participants
  for select
  to authenticated
  using (public.is_conversation_participant(conversation_id, auth.uid()));

drop policy if exists "conversation_participants_insert_self_or_existing_participant" on public.conversation_participants;
create policy "conversation_participants_insert_self_or_existing_participant"
  on public.conversation_participants
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    or public.is_conversation_participant(conversation_id, auth.uid())
  );

drop policy if exists "conversation_participants_delete_self_or_existing_participant" on public.conversation_participants;
create policy "conversation_participants_delete_self_or_existing_participant"
  on public.conversation_participants
  for delete
  to authenticated
  using (
    auth.uid() = user_id
    or public.is_conversation_participant(conversation_id, auth.uid())
  );

-- messages RLS

drop policy if exists "messages_select_participants_only" on public.messages;
create policy "messages_select_participants_only"
  on public.messages
  for select
  to authenticated
  using (public.is_conversation_participant(conversation_id, auth.uid()));

drop policy if exists "messages_insert_participant_sender_only" on public.messages;
create policy "messages_insert_participant_sender_only"
  on public.messages
  for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and public.is_conversation_participant(conversation_id, auth.uid())
  );

drop policy if exists "messages_update_sender_only" on public.messages;
create policy "messages_update_sender_only"
  on public.messages
  for update
  to authenticated
  using (
    auth.uid() = sender_id
    and public.is_conversation_participant(conversation_id, auth.uid())
  )
  with check (
    auth.uid() = sender_id
    and public.is_conversation_participant(conversation_id, auth.uid())
  );

drop policy if exists "messages_delete_sender_only" on public.messages;
create policy "messages_delete_sender_only"
  on public.messages
  for delete
  to authenticated
  using (
    auth.uid() = sender_id
    and public.is_conversation_participant(conversation_id, auth.uid())
  );
