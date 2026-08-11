-- Public campaign images with organizer-only mutation.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'campaign-images',
  'campaign-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- The public object endpoint reads from public buckets. Database listing and all
-- mutations remain restricted to authenticated organizer accounts.
drop policy if exists campaign_images_admin_select on storage.objects;
create policy campaign_images_admin_select
on storage.objects for select to authenticated
using (bucket_id = 'campaign-images' and public.is_admin());

drop policy if exists campaign_images_admin_insert on storage.objects;
create policy campaign_images_admin_insert
on storage.objects for insert to authenticated
with check (bucket_id = 'campaign-images' and public.is_admin());

drop policy if exists campaign_images_admin_update on storage.objects;
create policy campaign_images_admin_update
on storage.objects for update to authenticated
using (bucket_id = 'campaign-images' and public.is_admin())
with check (bucket_id = 'campaign-images' and public.is_admin());

drop policy if exists campaign_images_admin_delete on storage.objects;
create policy campaign_images_admin_delete
on storage.objects for delete to authenticated
using (bucket_id = 'campaign-images' and public.is_admin());
