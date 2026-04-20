-- Admin moderation access for event review reports.
-- Enables admin dashboard to view and process user-reported event comments.

drop policy if exists "event_review_reports_select_admin" on public.event_review_reports;
create policy "event_review_reports_select_admin"
  on public.event_review_reports
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

drop policy if exists "event_review_reports_update_admin" on public.event_review_reports;
create policy "event_review_reports_update_admin"
  on public.event_review_reports
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

drop policy if exists "event_reviews_delete_admin" on public.event_reviews;
create policy "event_reviews_delete_admin"
  on public.event_reviews
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
