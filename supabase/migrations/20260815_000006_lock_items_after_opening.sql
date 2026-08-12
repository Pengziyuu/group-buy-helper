-- Simplify organizer item configuration: once first opened, price and item
-- numbering are immutable. Announcements, images, and threshold remain editable.

create or replace function public.publish_campaign_draft(p_campaign_id uuid)
returns public.campaign
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign public.campaign;
  v_draft public.campaign_draft;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin permission required' using errcode = '42501';
  end if;

  select * into v_campaign
  from public.campaign
  where id = p_campaign_id
  for update;

  select * into v_draft
  from public.campaign_draft
  where campaign_id = p_campaign_id;

  if v_campaign.id is null or v_draft.campaign_id is null then
    raise exception 'campaign draft not found' using errcode = 'P0002';
  end if;

  if v_campaign.opened_at is not null and (
    v_draft.unit_price is distinct from v_campaign.unit_price
    or v_draft.items is distinct from v_campaign.items
  ) then
    raise exception '正式開團後不能修改單價或品項編號' using errcode = '23514';
  end if;

  update public.campaign
  set title = v_draft.title,
      unit_price = v_draft.unit_price,
      threshold = v_draft.threshold,
      announcement = v_draft.announcement,
      images = v_draft.images,
      items = v_draft.items,
      opened_at = coalesce(opened_at, now())
  where id = p_campaign_id
  returning * into v_campaign;

  insert into public.campaign_item (campaign_id, code, name, sort_order, active)
  select p_campaign_id, item ->> 'code', item ->> 'name', ordinality - 1,
         (item ->> 'active')::boolean
  from jsonb_array_elements(v_campaign.items) with ordinality as draft(item, ordinality)
  on conflict (campaign_id, code) do update
    set name = excluded.name, sort_order = excluded.sort_order, active = excluded.active;

  update public.campaign_item ci
  set active = false
  where ci.campaign_id = p_campaign_id
    and exists (select 1 from public.order_item oi where oi.campaign_item_id = ci.id)
    and not exists (
      select 1 from jsonb_array_elements(v_campaign.items) item
      where item ->> 'code' = ci.code and (item ->> 'active')::boolean
    );

  delete from public.campaign_item ci
  where ci.campaign_id = p_campaign_id
    and not exists (select 1 from public.order_item oi where oi.campaign_item_id = ci.id)
    and not exists (
      select 1 from jsonb_array_elements(v_campaign.items) item
      where item ->> 'code' = ci.code and (item ->> 'active')::boolean
    );

  update public.campaign c
  set items = coalesce((
    select jsonb_agg(jsonb_build_object('code', ci.code, 'name', ci.name, 'active', ci.active)
                     order by ci.sort_order, ci.code)
    from public.campaign_item ci where ci.campaign_id = p_campaign_id
  ), '[]'::jsonb)
  where c.id = p_campaign_id
  returning c.* into v_campaign;

  update public.campaign_draft
  set items = v_campaign.items
  where campaign_id = p_campaign_id;

  return v_campaign;
end;
$$;
