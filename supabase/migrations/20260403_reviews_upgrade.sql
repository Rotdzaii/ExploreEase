-- Module 7: Reviews backend upgrade
-- Adds helpful count + organizer reply fields and moderation/reporting tables.

create extension if not exists pgcrypto;

-- 1) Upgrade existing reviews table
alter table public.reviews
  add column if not exists helpful_count integer not null default 0;

-- Choosing reply_text strategy (instead of reply_to_id) for organizer/admin replies.
alter table public.reviews
  add column if not exists reply_text text;

alter table public.reviews
  add column if not exists replied_at timestamptz;

alter table public.reviews
  add column if not exists replied_by uuid references auth.users (id) on delete set null;

-- 2) Helpful votes table (supports user-level toggle without duplicate voting)
create table if not exists public.review_helpful_votes (
  id uuid primary key default gen_random_uuid(),
  review_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint review_helpful_votes_unique unique (review_id, user_id)
);

create index if not exists review_helpful_votes_review_id_idx
  on public.review_helpful_votes (review_id);

create index if not exists review_helpful_votes_user_id_idx
  on public.review_helpful_votes (user_id);

alter table public.review_helpful_votes enable row level security;

drop policy if exists "review_helpful_votes_select_own" on public.review_helpful_votes;
create policy "review_helpful_votes_select_own"
  on public.review_helpful_votes
  for select
  using (auth.uid() = user_id);

drop policy if exists "review_helpful_votes_insert_own" on public.review_helpful_votes;
create policy "review_helpful_votes_insert_own"
  on public.review_helpful_votes
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "review_helpful_votes_delete_own" on public.review_helpful_votes;
create policy "review_helpful_votes_delete_own"
  on public.review_helpful_votes
  for delete
  using (auth.uid() = user_id);

-- 3) Review reports table (flagged / moderated content)
create table if not exists public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id text not null,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (char_length(trim(reason)) > 0),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed', 'resolved')),
  created_at timestamptz not null default now(),
  constraint review_reports_unique unique (review_id, reporter_id)
);

create index if not exists review_reports_review_id_idx
  on public.review_reports (review_id);

create index if not exists review_reports_reporter_id_idx
  on public.review_reports (reporter_id);

create index if not exists review_reports_status_idx
  on public.review_reports (status);

alter table public.review_reports enable row level security;

drop policy if exists "review_reports_select_own" on public.review_reports;
create policy "review_reports_select_own"
  on public.review_reports
  for select
  using (auth.uid() = reporter_id);

drop policy if exists "review_reports_insert_own" on public.review_reports;
create policy "review_reports_insert_own"
  on public.review_reports
  for insert
  with check (auth.uid() = reporter_id);

-- Note:
-- If you later add profiles.role = 'admin', add an UPDATE policy on review_reports
-- for moderators/admins to change status from pending to reviewed/dismissed/resolved.
