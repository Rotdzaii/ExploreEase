-- Notifications schema + triggers for review replies and event approvals.
-- Safe to run multiple times where possible.

create extension if not exists pgcrypto;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  message text not null check (char_length(trim(message)) > 0),
  type text not null default 'system' check (type in ('system', 'review', 'event')),
  is_read boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Backward-compatible migration for environments that already have notifications table.
alter table public.notifications add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.notifications add column if not exists title text;
alter table public.notifications add column if not exists message text;
alter table public.notifications add column if not exists type text;
alter table public.notifications add column if not exists is_read boolean;
alter table public.notifications add column if not exists metadata jsonb;
alter table public.notifications add column if not exists created_at timestamptz;
alter table public.notifications add column if not exists body text;

update public.notifications
set title = 'Thong bao moi'
where title is null or char_length(trim(title)) = 0;

update public.notifications
set message = coalesce(nullif(trim(message), ''), nullif(trim(body), ''), 'Ban co thong bao moi')
where message is null or char_length(trim(message)) = 0;

update public.notifications
set type = lower(coalesce(type, 'system'));

update public.notifications
set type = 'system'
where type not in ('system', 'review', 'event');

update public.notifications
set is_read = false
where is_read is null;

update public.notifications
set metadata = '{}'::jsonb
where metadata is null;

update public.notifications
set created_at = now()
where created_at is null;

delete from public.notifications
where user_id is null;

alter table public.notifications alter column title set default 'Thong bao moi';
alter table public.notifications alter column message set default 'Ban co thong bao moi';
alter table public.notifications alter column type set default 'system';
alter table public.notifications alter column is_read set default false;
alter table public.notifications alter column metadata set default '{}'::jsonb;
alter table public.notifications alter column created_at set default now();

alter table public.notifications alter column user_id set not null;
alter table public.notifications alter column title set not null;
alter table public.notifications alter column message set not null;
alter table public.notifications alter column type set not null;
alter table public.notifications alter column is_read set not null;
alter table public.notifications alter column metadata set not null;
alter table public.notifications alter column created_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notifications_type_check'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_type_check
      check (type in ('system', 'review', 'event'));
  end if;
end
$$;

create index if not exists notifications_user_read_created_idx
  on public.notifications (user_id, is_read, created_at desc);

create index if not exists notifications_user_type_created_idx
  on public.notifications (user_id, type, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "notifications_insert_own" on public.notifications;
create policy "notifications_insert_own"
  on public.notifications
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own"
  on public.notifications
  for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.notify_on_destination_review_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  destination_name text;
begin
  if new.reply_text is null or char_length(trim(new.reply_text)) = 0 then
    return new;
  end if;

  if old.reply_text is not null and char_length(trim(old.reply_text)) > 0 then
    return new;
  end if;

  if new.user_id is null then
    return new;
  end if;

  if new.replied_by is not null and new.replied_by = new.user_id then
    return new;
  end if;

  select d.name
    into destination_name
  from public.destinations d
  where d.id::text = new.destination_id::text
  limit 1;

  insert into public.notifications (user_id, title, message, type, metadata)
  values (
    new.user_id,
    'Phan hoi danh gia moi',
    coalesce(
      case
        when destination_name is not null and char_length(trim(destination_name)) > 0
          then format('Danh gia cua ban tai "%s" da duoc phan hoi.', destination_name)
      end,
      'Danh gia cua ban da duoc phan hoi.'
    ),
    'review',
    jsonb_build_object(
      'source', 'reviews',
      'review_id', new.id,
      'destination_id', new.destination_id,
      'replied_by', new.replied_by
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_destination_review_reply on public.reviews;
create trigger trg_notify_destination_review_reply
after update of reply_text on public.reviews
for each row
execute function public.notify_on_destination_review_reply();

create or replace function public.notify_on_event_review_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_title text;
begin
  if new.reply_text is null or char_length(trim(new.reply_text)) = 0 then
    return new;
  end if;

  if old.reply_text is not null and char_length(trim(old.reply_text)) > 0 then
    return new;
  end if;

  if new.user_id is null then
    return new;
  end if;

  if new.replied_by is not null and new.replied_by = new.user_id then
    return new;
  end if;

  select e.title
    into event_title
  from public.events e
  where e.id = new.event_id
  limit 1;

  insert into public.notifications (user_id, title, message, type, metadata)
  values (
    new.user_id,
    'Phan hoi danh gia su kien',
    coalesce(
      case
        when event_title is not null and char_length(trim(event_title)) > 0
          then format('Danh gia cua ban cho su kien "%s" da duoc phan hoi.', event_title)
      end,
      'Danh gia su kien cua ban da duoc phan hoi.'
    ),
    'review',
    jsonb_build_object(
      'source', 'event_reviews',
      'review_id', new.id,
      'event_id', new.event_id,
      'replied_by', new.replied_by
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_event_review_reply on public.event_reviews;
create trigger trg_notify_event_review_reply
after update of reply_text on public.event_reviews
for each row
execute function public.notify_on_event_review_reply();

create or replace function public.notify_on_event_status_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.creator_id is null then
    return new;
  end if;

  if new.status = 'incoming' and old.status is distinct from new.status then
    -- Skip if the creator updates their own event status.
    if auth.uid() is not null and auth.uid() = new.creator_id then
      return new;
    end if;

    insert into public.notifications (user_id, title, message, type, metadata)
    values (
      new.creator_id,
      'Su kien da duoc duyet',
      format('Su kien "%s" cua ban da duoc duyet va dang hien thi.', coalesce(new.title, 'Untitled event')),
      'event',
      jsonb_build_object(
        'source', 'events',
        'event_id', new.id,
        'old_status', old.status,
        'new_status', new.status,
        'actor_id', auth.uid()
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_event_status_approved on public.events;
create trigger trg_notify_event_status_approved
after update of status on public.events
for each row
execute function public.notify_on_event_status_approved();

-- Realtime publication for in-app notification center updates.
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then
    null;
  when undefined_object then
    null;
end
$$;
