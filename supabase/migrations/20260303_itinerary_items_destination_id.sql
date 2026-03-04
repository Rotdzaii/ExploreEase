-- Add destination_id to itinerary_items for Module 12.1
-- Supports linking itinerary items back to the destination detail.

alter table public.itinerary_items
  add column if not exists destination_id text null;

create index if not exists itinerary_items_destination_id_idx on public.itinerary_items (destination_id);
