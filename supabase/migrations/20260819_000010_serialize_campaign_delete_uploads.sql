-- Serialize campaign deletion with Storage INSERT/UPDATE policy checks.
-- Both code paths take the same transaction-scoped advisory lock derived from
-- the campaign UUID. This closes the race where an upload validates a live
-- campaign before deletion but commits its object after deletion.

create or replace function public.campaign_image_path_is_live(p_name text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign_id uuid;
begin
  if not public.is_admin() then
    return false;
  end if;
  if split_part(p_name, '/', 1)
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;

  v_campaign_id := split_part(p_name, '/', 1)::uuid;
  perform pg_advisory_xact_lock(hashtextextended(v_campaign_id::text, 0));

  return exists (
    select 1
    from public.campaign c
    where c.id = v_campaign_id
  );
end;
$$;

create or replace function public.delete_campaign_permanently(p_campaign_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'admin required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_campaign_id::text, 0));

  select c.id
  into v_campaign_id
  from public.campaign c
  where c.id = p_campaign_id
  for update;

  if v_campaign_id is null then
    raise exception 'campaign not found' using errcode = 'PT404';
  end if;

  delete from public.orders
  where campaign_id = v_campaign_id;

  delete from public.campaign
  where id = v_campaign_id;

  return true;
end;
$$;

revoke all on function public.campaign_image_path_is_live(text)
from public, anon;
grant execute on function public.campaign_image_path_is_live(text)
to authenticated, service_role;

revoke all on function public.delete_campaign_permanently(uuid)
from public, anon;
grant execute on function public.delete_campaign_permanently(uuid)
to authenticated, service_role;
