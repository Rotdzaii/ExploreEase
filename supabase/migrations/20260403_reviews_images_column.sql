-- Module 7: Persist multiple review image URLs directly on reviews rows.
-- Safe to run multiple times.

alter table public.reviews
  add column if not exists review_image_urls text[] not null default '{}';
