-- Module 7: Supabase Storage bucket for review photos
-- Requirement: authenticated upload, public read.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'review_images',
  'review_images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read access for review images
drop policy if exists "review_images_public_read" on storage.objects;
create policy "review_images_public_read"
  on storage.objects
  for select
  using (bucket_id = 'review_images');

-- Authenticated users can upload
drop policy if exists "review_images_auth_upload" on storage.objects;
create policy "review_images_auth_upload"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'review_images');

-- Optional but recommended: owners can update/delete their own uploads
drop policy if exists "review_images_auth_update_own" on storage.objects;
create policy "review_images_auth_update_own"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'review_images' and owner = auth.uid())
  with check (bucket_id = 'review_images' and owner = auth.uid());

drop policy if exists "review_images_auth_delete_own" on storage.objects;
create policy "review_images_auth_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'review_images' and owner = auth.uid());
