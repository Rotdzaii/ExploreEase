-- Module 7: Event reviews (1-5 stars), helpful votes, moderation reports
-- Safe to run multiple times where applicable.
--chạy cái đoạn này trước:
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';
--Sau đó mới tiếp tục:
create extension if not exists pgcrypto;

create table if not exists public.event_reviews (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  review_image_urls text[] not null default '{}',
  reply_text text,
  replied_at timestamptz,
  replied_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_reviews_one_per_user unique (event_id, user_id)
);

create index if not exists event_reviews_event_id_idx
  on public.event_reviews (event_id);

create index if not exists event_reviews_user_id_idx
  on public.event_reviews (user_id);

create index if not exists event_reviews_created_at_idx
  on public.event_reviews (created_at desc);

create table if not exists public.event_review_helpful_votes (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.event_reviews (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint event_review_helpful_votes_unique unique (review_id, user_id)
);

create index if not exists event_review_helpful_votes_review_id_idx
  on public.event_review_helpful_votes (review_id);

create index if not exists event_review_helpful_votes_user_id_idx
  on public.event_review_helpful_votes (user_id);

create table if not exists public.event_review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.event_reviews (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (char_length(trim(reason)) > 0),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed', 'resolved')),
  created_at timestamptz not null default now(),

  constraint event_review_reports_unique unique (review_id, reporter_id)
);

create index if not exists event_review_reports_review_id_idx
  on public.event_review_reports (review_id);

create index if not exists event_review_reports_reporter_id_idx
  on public.event_review_reports (reporter_id);

create index if not exists event_review_reports_status_idx
  on public.event_review_reports (status);

alter table public.event_reviews enable row level security;
alter table public.event_review_helpful_votes enable row level security;
alter table public.event_review_reports enable row level security;

-- Public read for listing event reviews.
drop policy if exists "event_reviews_select_all" on public.event_reviews;
create policy "event_reviews_select_all"
  on public.event_reviews
  for select
  using (true);

-- Authenticated users can create their own review rows.
drop policy if exists "event_reviews_insert_own" on public.event_reviews;
create policy "event_reviews_insert_own"
  on public.event_reviews
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Owners or moderators (admin/event creator) can update review rows.
drop policy if exists "event_reviews_update_owner_or_moderator" on public.event_reviews;
create policy "event_reviews_update_owner_or_moderator"
  on public.event_reviews
  for update
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and lower(coalesce(p.role, '')) = 'admin'
    )
    or exists (
      select 1
      from public.events e
      where e.id = event_reviews.event_id
        and e.creator_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and lower(coalesce(p.role, '')) = 'admin'
    )
    or exists (
      select 1
      from public.events e
      where e.id = event_reviews.event_id
        and e.creator_id = auth.uid()
    )
  );

-- Review owners can delete their own review rows.
drop policy if exists "event_reviews_delete_own" on public.event_reviews;
create policy "event_reviews_delete_own"
  on public.event_reviews
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Helpful votes policies.
drop policy if exists "event_review_helpful_votes_select_own" on public.event_review_helpful_votes;
create policy "event_review_helpful_votes_select_own"
  on public.event_review_helpful_votes
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "event_review_helpful_votes_insert_own" on public.event_review_helpful_votes;
create policy "event_review_helpful_votes_insert_own"
  on public.event_review_helpful_votes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "event_review_helpful_votes_delete_own" on public.event_review_helpful_votes;
create policy "event_review_helpful_votes_delete_own"
  on public.event_review_helpful_votes
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Reports policies.
drop policy if exists "event_review_reports_select_own" on public.event_review_reports;
create policy "event_review_reports_select_own"
  on public.event_review_reports
  for select
  to authenticated
  using (auth.uid() = reporter_id);

drop policy if exists "event_review_reports_insert_own" on public.event_review_reports;
create policy "event_review_reports_insert_own"
  on public.event_review_reports
  for insert
  to authenticated
  with check (auth.uid() = reporter_id);
