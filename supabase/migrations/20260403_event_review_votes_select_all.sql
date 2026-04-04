-- Module 7 patch: allow reading event helpful-vote rows for accurate helpful counts.
-- Keeps write operations owner-only.

alter table if exists public.event_review_helpful_votes enable row level security;

drop policy if exists "event_review_helpful_votes_select_own" on public.event_review_helpful_votes;
drop policy if exists "event_review_helpful_votes_select_all" on public.event_review_helpful_votes;

create policy "event_review_helpful_votes_select_all"
  on public.event_review_helpful_votes
  for select
  using (true);
