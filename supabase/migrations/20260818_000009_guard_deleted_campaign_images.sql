-- Prevent stale organizer tabs from uploading new objects after a campaign has
-- been permanently deleted. Deletion remains allowed so orphan cleanup can run
-- after the database transaction removes the campaign row.

create or replace function public.campaign_image_path_is_live(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin()
    and exists (
    select 1
    from public.campaign c
    where c.id = case
      when split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then split_part(p_name, '/', 1)::uuid
      else null
    end
  );
$$;

revoke all on function public.campaign_image_path_is_live(text)
from public, anon;
grant execute on function public.campaign_image_path_is_live(text)
to authenticated, service_role;

drop policy if exists campaign_images_admin_insert on storage.objects;
create policy campaign_images_admin_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'campaign-images'
  and public.is_admin()
  and public.campaign_image_path_is_live(name)
);

drop policy if exists campaign_images_admin_update on storage.objects;
create policy campaign_images_admin_update
on storage.objects for update to authenticated
using (
  bucket_id = 'campaign-images'
  and public.is_admin()
  and public.campaign_image_path_is_live(name)
)
with check (
  bucket_id = 'campaign-images'
  and public.is_admin()
  and public.campaign_image_path_is_live(name)
);
