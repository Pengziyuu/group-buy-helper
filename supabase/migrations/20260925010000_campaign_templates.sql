-- Organizer-only campaign templates: a JSON snapshot of reusable campaign content,
-- with images copied under templates/<template id>/ in the campaign-images bucket.

create or replace function public.valid_campaign_template_content(p_content jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    return false;
  end if;
  if coalesce(jsonb_typeof(p_content -> 'title'), '') <> 'string'
     or length(btrim(p_content ->> 'title')) not between 1 and 200 then
    return false;
  end if;
  if coalesce(jsonb_typeof(p_content -> 'announcement'), '') <> 'string'
     or length(p_content ->> 'announcement') > 20000 then
    return false;
  end if;
  return public.valid_campaign_images(p_content -> 'images')
    and public.valid_campaign_items(p_content -> 'items');
end;
$$;

revoke all on function public.valid_campaign_template_content(jsonb) from public, anon;
grant execute on function public.valid_campaign_template_content(jsonb) to authenticated, service_role;

create table if not exists public.campaign_template (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  content jsonb not null check (public.valid_campaign_template_content(content)),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists campaign_template_name_key
on public.campaign_template (lower(btrim(name)));

drop trigger if exists campaign_template_set_updated_at on public.campaign_template;
create trigger campaign_template_set_updated_at
before update on public.campaign_template
for each row execute function public.set_updated_at();

alter table public.campaign_template enable row level security;

drop policy if exists campaign_template_admin_all on public.campaign_template;
create policy campaign_template_admin_all on public.campaign_template
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on table public.campaign_template from anon, authenticated;
grant select, insert, update, delete on table public.campaign_template to authenticated;
grant all on table public.campaign_template to service_role;

-- Template images may only be written while the template row exists, mirroring campaign_image_path_is_live.
create or replace function public.template_image_path_is_live(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin()
    and split_part(p_name, '/', 1) = 'templates'
    and exists (
      select 1
      from public.campaign_template t
      where t.id = case
        when split_part(p_name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then split_part(p_name, '/', 2)::uuid
        else null
      end
    );
$$;

revoke all on function public.template_image_path_is_live(text) from public, anon;
grant execute on function public.template_image_path_is_live(text) to authenticated, service_role;

drop policy if exists campaign_template_images_admin_insert on storage.objects;
create policy campaign_template_images_admin_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'campaign-images'
  and public.template_image_path_is_live(name)
);

drop policy if exists campaign_template_images_admin_update on storage.objects;
create policy campaign_template_images_admin_update
on storage.objects for update to authenticated
using (
  bucket_id = 'campaign-images'
  and public.template_image_path_is_live(name)
)
with check (
  bucket_id = 'campaign-images'
  and public.template_image_path_is_live(name)
);
