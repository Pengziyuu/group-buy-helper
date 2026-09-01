-- Per-item names and prices. Existing campaigns remain compatible by inheriting
-- their previous campaign-level price into every item before validation tightens.

alter table public.campaign_item
  add column unit_price numeric(12,2);

update public.campaign_item item
set unit_price = campaign.unit_price
from public.campaign campaign
where campaign.id = item.campaign_id;

alter table public.campaign_item
  alter column unit_price set not null;

alter table public.campaign_item
  add constraint campaign_item_unit_price_valid
  check (unit_price between 0 and 9999999.99 and unit_price = round(unit_price, 2));

update public.campaign campaign
set items = coalesce((
  select jsonb_agg(
    item || jsonb_build_object(
      'unitPrice', campaign.unit_price
    ) order by ordinality
  )
  from jsonb_array_elements(campaign.items) with ordinality as source(item, ordinality)
), '[]'::jsonb);

update public.campaign_draft draft
set items = coalesce((
  select jsonb_agg(
    item || jsonb_build_object(
      'unitPrice', draft.unit_price
    ) order by ordinality
  )
  from jsonb_array_elements(draft.items) with ordinality as source(item, ordinality)
), '[]'::jsonb);

create or replace function public.valid_campaign_items(p_items jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 100 then
    return false;
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) item
    where jsonb_typeof(item) <> 'object'
      or not (item ? 'code')
      or not (item ? 'name')
      or not (item ? 'unitPrice')
      or not (item ? 'active')
      or jsonb_typeof(item -> 'code') <> 'string'
      or jsonb_typeof(item -> 'name') <> 'string'
      or jsonb_typeof(item -> 'unitPrice') <> 'number'
      or jsonb_typeof(item -> 'active') <> 'boolean'
      or (item ->> 'code') !~ '^[A-Z0-9]{1,64}$'
      or length(item ->> 'name') > 200
      or length(btrim(item ->> 'name')) < 1
      or (item ->> 'unitPrice')::numeric not between 0 and 9999999.99
      or (item ->> 'unitPrice')::numeric <> round((item ->> 'unitPrice')::numeric, 2)
  ) then
    return false;
  end if;
  if (select count(*) from jsonb_array_elements(p_items)) <>
     (select count(distinct item ->> 'code') from jsonb_array_elements(p_items) item) then
    return false;
  end if;
  return exists (
    select 1 from jsonb_array_elements(p_items) item
    where (item ->> 'active')::boolean
  );
end;
$$;

alter table public.campaign
  drop constraint if exists campaign_items_valid;
alter table public.campaign
  add constraint campaign_items_valid check (public.valid_campaign_items(items));
alter table public.campaign_draft
  drop constraint if exists campaign_draft_items_valid;
alter table public.campaign_draft
  add constraint campaign_draft_items_valid check (public.valid_campaign_items(items));

create or replace function public.create_campaign_draft(p_title text default '未命名團購')
returns public.campaign
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_items jsonb := jsonb_build_array(
    jsonb_build_object('code', 'ITEM1', 'name', 'A', 'unitPrice', 0, 'active', true)
  );
  v_campaign public.campaign;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin permission required' using errcode = '42501';
  end if;
  if length(v_title) not between 1 and 200 then
    raise exception 'campaign title must be between 1 and 200 characters' using errcode = '22023';
  end if;

  insert into public.campaign (
    title, unit_price, threshold, status, deadline, announcement, images, items
  ) values (
    v_title, 0, 1, 'open', now() + interval '30 days', '', '[]'::jsonb, v_items
  ) returning * into v_campaign;

  insert into public.campaign_draft (
    campaign_id, title, unit_price, threshold, announcement, images, items, updated_by
  ) values (
    v_campaign.id, v_title, 0, 1, '', '[]'::jsonb, v_items, auth.uid()
  );

  return v_campaign;
end;
$$;

revoke all on function public.create_campaign_draft(text) from public, anon;
grant execute on function public.create_campaign_draft(text) to authenticated, service_role;

create or replace function public.publish_campaign_draft(p_campaign_id uuid)
returns public.campaign
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign public.campaign;
  v_draft public.campaign_draft;
  v_min_price numeric(12,2);
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
  where campaign_id = p_campaign_id
  for update;

  if v_campaign.id is null or v_draft.campaign_id is null then
    raise exception 'campaign draft not found' using errcode = 'P0002';
  end if;

  if v_campaign.opened_at is not null
     and v_draft.items is distinct from v_campaign.items then
    raise exception '正式開團後不能修改品項代碼、名稱或單價' using errcode = '23514';
  end if;

  select min((item ->> 'unitPrice')::numeric)
  into v_min_price
  from jsonb_array_elements(v_draft.items) item
  where (item ->> 'active')::boolean;

  if v_min_price is null then
    raise exception '至少需要一個啟用品項' using errcode = '23514';
  end if;

  update public.campaign
  set title = v_draft.title,
      unit_price = v_min_price,
      threshold = v_draft.threshold,
      announcement = v_draft.announcement,
      images = v_draft.images,
      items = v_draft.items,
      opened_at = coalesce(opened_at, now())
  where id = p_campaign_id
  returning * into v_campaign;

  insert into public.campaign_item (
    campaign_id, code, name, unit_price, sort_order, active
  )
  select p_campaign_id,
         item ->> 'code',
         item ->> 'name',
         (item ->> 'unitPrice')::numeric,
         ordinality - 1,
         (item ->> 'active')::boolean
  from jsonb_array_elements(v_draft.items) with ordinality as draft(item, ordinality)
  on conflict (campaign_id, code) do update
    set name = excluded.name,
        unit_price = excluded.unit_price,
        sort_order = excluded.sort_order,
        active = excluded.active;

  update public.campaign_item item
  set active = false
  where item.campaign_id = p_campaign_id
    and exists (select 1 from public.order_item order_item where order_item.campaign_item_id = item.id)
    and not exists (
      select 1 from jsonb_array_elements(v_draft.items) draft_item
      where draft_item ->> 'code' = item.code and (draft_item ->> 'active')::boolean
    );

  delete from public.campaign_item item
  where item.campaign_id = p_campaign_id
    and not exists (select 1 from public.order_item order_item where order_item.campaign_item_id = item.id)
    and not exists (
      select 1 from jsonb_array_elements(v_draft.items) draft_item
      where draft_item ->> 'code' = item.code and (draft_item ->> 'active')::boolean
    );

  update public.campaign campaign
  set items = coalesce((
    select jsonb_agg(jsonb_build_object(
      'code', item.code,
      'name', item.name,
      'unitPrice', item.unit_price,
      'active', item.active
    ) order by item.sort_order, item.code)
    from public.campaign_item item
    where item.campaign_id = p_campaign_id
  ), '[]'::jsonb)
  where campaign.id = p_campaign_id
  returning campaign.* into v_campaign;

  update public.campaign_draft
  set unit_price = v_min_price,
      items = v_campaign.items
  where campaign_id = p_campaign_id;

  return v_campaign;
end;
$$;

revoke all on function public.publish_campaign_draft(uuid) from public, anon;
grant execute on function public.publish_campaign_draft(uuid) to authenticated, service_role;

create or replace function public.set_order_fulfillment(
  p_order_id uuid,
  p_paid boolean,
  p_pickup_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign_id uuid;
  v_amount numeric(14,2);
  v_paid_at timestamptz;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin permission required' using errcode = '42501';
  end if;
  if p_pickup_status not in ('pending', 'ready', 'picked_up') then
    raise exception 'invalid pickup status' using errcode = '22023';
  end if;

  select campaign_id into v_campaign_id
  from public.orders
  where id = p_order_id
  for update;

  if v_campaign_id is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  select coalesce(sum(order_item.qty * campaign_item.unit_price), 0)
  into v_amount
  from public.order_item order_item
  join public.campaign_item campaign_item on campaign_item.id = order_item.campaign_item_id
  where order_item.order_id = p_order_id;

  select paid_at into v_paid_at
  from public.payment
  where order_id = p_order_id;

  if p_paid and v_paid_at is null then
    v_paid_at := now();
  elsif not p_paid then
    v_paid_at := null;
  end if;

  insert into public.payment (order_id, amount, paid, paid_at)
  values (p_order_id, v_amount, p_paid, v_paid_at)
  on conflict (order_id) do update
    set amount = excluded.amount,
        paid = excluded.paid,
        paid_at = excluded.paid_at;

  update public.orders
  set pickup_status = p_pickup_status
  where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'campaign_id', v_campaign_id,
    'amount', v_amount,
    'paid', p_paid,
    'paid_at', v_paid_at,
    'pickup_status', p_pickup_status
  );
end;
$$;

revoke all on function public.set_order_fulfillment(uuid, boolean, text)
  from public, anon;
grant execute on function public.set_order_fulfillment(uuid, boolean, text)
  to authenticated, service_role;
