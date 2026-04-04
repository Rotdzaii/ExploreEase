-- Add description field for events so Create Event form can persist detail text.

alter table public.events
add column if not exists description text null;
