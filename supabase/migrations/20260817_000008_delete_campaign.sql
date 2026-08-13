-- Allow organizers to permanently delete a campaign and all campaign-scoped history.
-- Customer profiles are deliberately retained because one customer may participate
-- in multiple campaigns. Storage objects are cleaned by the authenticated client
-- only after this transaction succeeds.

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

revoke all on function public.delete_campaign_permanently(uuid) from public, anon;
grant execute on function public.delete_campaign_permanently(uuid) to authenticated, service_role;
