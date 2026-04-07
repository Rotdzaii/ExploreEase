-- Module 11 + 5.2 + 7.3
-- Admin roles, event approval workflow, and review moderation support.
-- Safe to run repeatedly where possible.

-- 1) Ensure profiles.role exists and is constrained to user/admin.
alter table public.profiles
  add column if not exists role text;

update public.profiles
set role = 'user'
where role is null
  or btrim(role) = ''
  or lower(btrim(role)) not in ('user', 'admin');

alter table public.profiles
  alter column role set default 'user',
  alter column role set not null;

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (lower(role) in ('user', 'admin'));

-- 2) Ensure events.approval_status exists and defaults to pending.
alter table public.events
  add column if not exists approval_status text;

-- Backfill existing rows:
-- - Legacy lifecycle statuses were public before moderation => mark as approved.
-- - Otherwise, keep pending for moderation.
update public.events
set approval_status = case
  when lower(coalesce(approval_status, '')) in ('pending', 'approved', 'rejected')
    then lower(approval_status)
  when lower(coalesce(status, '')) in ('incoming', 'ongoing', 'completed')
    then 'approved'
  else 'pending'
end;

alter table public.events
  alter column approval_status set default 'pending',
  alter column approval_status set not null;

alter table public.events
  drop constraint if exists events_approval_status_check;

alter table public.events
  add constraint events_approval_status_check
  check (lower(approval_status) in ('pending', 'approved', 'rejected'));

create index if not exists events_approval_status_idx
  on public.events (approval_status);

-- 3) RLS: only approved events are public; creators/admins can still read their own scope.
drop policy if exists "events_select_all" on public.events;
drop policy if exists "events_select_visible" on public.events;
create policy "events_select_visible"
  on public.events
  for select
  using (
    lower(coalesce(approval_status, 'pending')) = 'approved'
    or auth.uid() = creator_id
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'admin'
    )
  );

-- Admins can update events (approval actions).
drop policy if exists "events_update_admin" on public.events;
create policy "events_update_admin"
  on public.events
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'admin'
    )
  );

-- Guard approval_status mutation so non-admin users cannot self-approve.
create or replace function public.enforce_event_approval_status_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.approval_status is distinct from old.approval_status then
    if not exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'admin'
    ) then
      raise exception 'Only admins can change approval_status';
    end if;
  end if;

  new.approval_status = lower(coalesce(new.approval_status, 'pending'));
  return new;
end;
$$;

drop trigger if exists trg_enforce_event_approval_status_admin on public.events;
create trigger trg_enforce_event_approval_status_admin
before update of approval_status on public.events
for each row
execute function public.enforce_event_approval_status_admin();

-- 4) Admin moderation policies for destination reviews.
drop policy if exists "reviews_select_admin" on public.reviews;
create policy "reviews_select_admin"
  on public.reviews
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'admin'
    )
  );

drop policy if exists "reviews_delete_admin" on public.reviews;
create policy "reviews_delete_admin"
  on public.reviews
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'admin'
    )
  );

-- Optional: admins can also inspect/update review_reports statuses.
drop policy if exists "review_reports_select_admin" on public.review_reports;
create policy "review_reports_select_admin"
  on public.review_reports
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'admin'
    )
  );

drop policy if exists "review_reports_update_admin" on public.review_reports;
create policy "review_reports_update_admin"
  on public.review_reports
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) = 'admin'
    )
  );

-- 5) Keep approval notifications working with approval_status.
create or replace function public.notify_on_event_approval_status_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.creator_id is null then
    return new;
  end if;

  if lower(coalesce(new.approval_status, 'pending')) = 'approved'
     and lower(coalesce(old.approval_status, 'pending')) is distinct from 'approved' then
    -- Skip if creator updates their own row.
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
        'old_approval_status', old.approval_status,
        'new_approval_status', new.approval_status,
        'actor_id', auth.uid()
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_event_status_approved on public.events;
drop trigger if exists trg_notify_event_approval_status_approved on public.events;
create trigger trg_notify_event_approval_status_approved
after update of approval_status on public.events
for each row
execute function public.notify_on_event_approval_status_approved();
