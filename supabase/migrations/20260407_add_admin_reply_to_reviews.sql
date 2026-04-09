-- Add admin reply support for destination reviews (Sprint 4 - Module 7.2)

alter table if exists public.reviews
  add column if not exists admin_reply text;

comment on column public.reviews.admin_reply is
  'Optional administrator response shown below a user review.';
