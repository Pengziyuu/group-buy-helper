-- Dynamic campaign items and LINE-notebook-style timestamps.

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
      or not (item ? 'code') or not (item ? 'name') or not (item ? 'active')
      or jsonb_typeof(item -> 'code') <> 'string'
      or jsonb_typeof(item -> 'name') <> 'string'
      or jsonb_typeof(item -> 'active') <> 'boolean'
      or (item ->> 'code') !~ '^[A-Z0-9]{1,64}$'
      or length(item ->> 'name') > 200
      or length(btrim(item ->> 'name')) < 1
  ) then return false; end if;
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

alter table public.campaign add column if not exists opened_at timestamptz;
alter table public.campaign add column if not exists items jsonb not null default '[]'::jsonb;
alter table public.campaign_draft add column if not exists items jsonb;
alter table public.campaign_item add column if not exists active boolean not null default true;
alter table public.campaign_item
  add constraint campaign_item_name_actual_length check (length(name) <= 200);
-- `orders.updated_at` is the resident's last order edit time. Fulfillment
-- updates must not make the public wall claim that the resident edited.
drop trigger if exists orders_set_updated_at on public.orders;

update public.campaign c
set items = coalesce((
  select jsonb_agg(jsonb_build_object('code', ci.code, 'name', ci.name, 'active', ci.active)
                   order by ci.sort_order, ci.code)
  from public.campaign_item ci where ci.campaign_id = c.id
), '[]'::jsonb);

update public.campaign_draft d
set items = coalesce((
  select jsonb_agg(jsonb_build_object('code', ci.code, 'name', ci.name, 'active', ci.active)
                   order by ci.sort_order, ci.code)
  from public.campaign_item ci where ci.campaign_id = d.campaign_id
), '[]'::jsonb)
where d.items is null;

alter table public.campaign
  drop constraint if exists campaign_items_valid;
alter table public.campaign
  add constraint campaign_items_valid check (public.valid_campaign_items(items));
alter table public.campaign_draft
  alter column items set not null,
  alter column items set default '[]'::jsonb;
alter table public.campaign_draft
  drop constraint if exists campaign_draft_items_valid;
alter table public.campaign_draft
  add constraint campaign_draft_items_valid check (public.valid_campaign_items(items));

create or replace function public.publish_campaign_draft(p_campaign_id uuid)
returns public.campaign
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign public.campaign;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin permission required' using errcode = '42501';
  end if;

  update public.campaign c
  set title = d.title,
      unit_price = d.unit_price,
      threshold = d.threshold,
      announcement = d.announcement,
      images = d.images,
      items = d.items,
      opened_at = coalesce(c.opened_at, now())
  from public.campaign_draft d
  where c.id = p_campaign_id and d.campaign_id = c.id
  returning c.* into v_campaign;

  if v_campaign.id is null then
    raise exception 'campaign draft not found' using errcode = 'P0002';
  end if;

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

  -- Build the public snapshot from the canonical rows after safe deletion and
  -- retirement, so omitted ordered items retain their historical names.
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

create or replace function public.submit_customer_order(p_campaign_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_entry record;
  v_qty integer;
  v_existing_qty integer;
  v_current_items jsonb;
  v_desired_items jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select c.id into v_customer_id from public.customer c where c.auth_user_id = auth.uid();
  if v_customer_id is null then raise exception '戶號尚未綁定' using errcode = '42501'; end if;
  if not public.has_campaign_access(p_campaign_id) then raise exception '尚未取得這一團的存取權' using errcode = '42501'; end if;
  -- Serialize submissions with draft publication. publish_campaign_draft locks
  -- this same campaign row through UPDATE before changing campaign_item rows.
  perform 1 from public.campaign where id = p_campaign_id for update;
  if not public.campaign_is_editable(p_campaign_id) then raise exception '本團已結單，不能修改訂單' using errcode = '23514'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'object' then raise exception '訂單品項格式錯誤' using errcode = '22023'; end if;

  select o.id into v_order_id from public.orders o
  where o.campaign_id = p_campaign_id and o.customer_id = v_customer_id;

  for v_entry in select key, value from jsonb_each(p_items) loop
    if v_entry.key !~ '^[A-Z0-9]{1,64}$' then
      raise exception '品項代號格式錯誤：%', v_entry.key using errcode = '22023';
    end if;
    if jsonb_typeof(v_entry.value) <> 'number' or (v_entry.value #>> '{}') !~ '^\d+$' then
      raise exception '% 數量必須是 0 到 20 的整數', v_entry.key using errcode = '22023';
    end if;
    v_qty := (v_entry.value #>> '{}')::integer;
    if v_qty < 0 or v_qty > 20 then raise exception '% 數量必須是 0 到 20 的整數', v_entry.key using errcode = '22023'; end if;
    if not exists (select 1 from public.campaign_item ci where ci.campaign_id = p_campaign_id and ci.code = v_entry.key) then
      raise exception '不存在的品項：%', v_entry.key using errcode = '23503';
    end if;
    if exists (select 1 from public.campaign_item ci where ci.campaign_id = p_campaign_id and ci.code = v_entry.key and not ci.active) then
      select coalesce(oi.qty, 0) into v_existing_qty
      from public.campaign_item ci left join public.order_item oi
        on oi.campaign_item_id = ci.id and oi.order_id = v_order_id
      where ci.campaign_id = p_campaign_id and ci.code = v_entry.key;
      if v_qty > coalesce(v_existing_qty, 0) then
        raise exception '已停用品項不能新增或增加：%', v_entry.key using errcode = '23514';
      end if;
    end if;
  end loop;

  select coalesce(jsonb_object_agg(ci.code, oi.qty), '{}'::jsonb)
  into v_current_items
  from public.order_item oi join public.campaign_item ci on ci.id = oi.campaign_item_id
  where oi.order_id = v_order_id;

  select coalesce(jsonb_object_agg(desired.code, desired.qty), '{}'::jsonb)
  into v_desired_items
  from (
    select ci.code,
      case when p_items ? ci.code then (p_items ->> ci.code)::integer else oi.qty end as qty
    from public.order_item oi join public.campaign_item ci on ci.id = oi.campaign_item_id
    where oi.order_id = v_order_id and not ci.active
      and case when p_items ? ci.code then (p_items ->> ci.code)::integer else oi.qty end > 0
    union all
    select ci.code, (p_items ->> ci.code)::integer
    from public.campaign_item ci
    where ci.campaign_id = p_campaign_id and ci.active and p_items ? ci.code
      and (p_items ->> ci.code)::integer > 0
  ) desired;

  if v_desired_items = '{}'::jsonb then
    raise exception '訂單至少需要一個品項' using errcode = '23514';
  end if;

  if v_order_id is not null and v_current_items = v_desired_items then
    return jsonb_build_object('id', v_order_id, 'campaign_id', p_campaign_id,
      'customer_id', v_customer_id, 'items', v_desired_items);
  end if;

  insert into public.orders (campaign_id, customer_id) values (p_campaign_id, v_customer_id)
  on conflict (campaign_id, customer_id) do update set updated_at = now()
  returning id into v_order_id;

  delete from public.order_item oi using public.campaign_item ci
  where oi.order_id = v_order_id and oi.campaign_item_id = ci.id and ci.active;

  delete from public.order_item oi using public.campaign_item ci
  where oi.order_id = v_order_id and oi.campaign_item_id = ci.id and not ci.active
    and coalesce((p_items ->> ci.code)::integer, oi.qty) = 0;

  update public.order_item oi set qty = (p_items ->> ci.code)::integer
  from public.campaign_item ci
  where oi.order_id = v_order_id and oi.campaign_item_id = ci.id and not ci.active
    and p_items ? ci.code and (p_items ->> ci.code)::integer > 0;

  insert into public.order_item (order_id, campaign_id, campaign_item_id, qty)
  select v_order_id, p_campaign_id, ci.id, (e.value #>> '{}')::integer
  from jsonb_each(p_items) e join public.campaign_item ci
    on ci.campaign_id = p_campaign_id and ci.code = e.key
  where ci.active and (e.value #>> '{}')::integer > 0;

  return jsonb_build_object('id', v_order_id, 'campaign_id', p_campaign_id,
    'customer_id', v_customer_id, 'items', v_desired_items);
end;
$$;

drop function public.join_campaign_by_slug(text);
create function public.join_campaign_by_slug(p_slug text)
returns table (id uuid, slug text, title text, unit_price numeric, threshold integer,
  status text, deadline timestamptz, announcement text, images jsonb, items jsonb,
  opened_at timestamptz, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  insert into public.campaign_access (campaign_id, user_id)
  select c.id, auth.uid() from public.campaign c where c.slug = p_slug on conflict do nothing;
  return query select c.id, c.slug, c.title, c.unit_price, c.threshold, c.status,
    c.deadline, c.announcement, c.images, c.items, c.opened_at, c.created_at, c.updated_at
  from public.campaign c where c.slug = p_slug;
end;
$$;

drop view public.campaign_public;
create view public.campaign_public with (security_invoker = true) as
select id, slug, title, unit_price, threshold, status, deadline, announcement,
       images, items, opened_at, created_at, updated_at
from public.campaign;

drop view public.order_wall;
create view public.order_wall with (security_invoker = true) as
select c.slug as campaign_slug, o.campaign_id, o.id as order_id, o.customer_id,
  cu.name as customer_name, cu.period, cu.unit, o.note,
  o.created_at as ordered_at, o.updated_at as order_updated_at,
  ci.id as campaign_item_id, ci.code as item_code, ci.name as item_name,
  ci.sort_order, ci.active as item_active, oi.qty, oi.updated_at as item_updated_at
from public.orders o join public.campaign c on c.id = o.campaign_id
join public.customer cu on cu.id = o.customer_id
left join public.order_item oi on oi.order_id = o.id
left join public.campaign_item ci on ci.id = oi.campaign_item_id;

create function public.get_customer_self()
returns table (id uuid, name text, period integer, unit text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select cu.id, cu.name, cu.period, cu.unit
  from public.customer cu
  where cu.auth_user_id = auth.uid();
$$;

revoke all on function public.valid_campaign_items(jsonb) from public, anon;
grant execute on function public.valid_campaign_items(jsonb) to authenticated;
grant execute on function public.valid_campaign_items(jsonb) to service_role;
revoke all on function public.publish_campaign_draft(uuid) from public, anon;
grant execute on function public.publish_campaign_draft(uuid) to authenticated;
grant execute on function public.publish_campaign_draft(uuid) to service_role;
revoke all on function public.submit_customer_order(uuid, jsonb) from public, anon;
grant execute on function public.submit_customer_order(uuid, jsonb) to authenticated;
grant execute on function public.submit_customer_order(uuid, jsonb) to service_role;
revoke all on function public.join_campaign_by_slug(text) from public, anon;
grant execute on function public.join_campaign_by_slug(text) to authenticated;
grant execute on function public.join_campaign_by_slug(text) to service_role;
revoke all on function public.get_customer_self() from public, anon;
grant execute on function public.get_customer_self() to authenticated, service_role;
revoke all on table public.campaign_public, public.order_wall from anon, authenticated;
grant select on table public.campaign_public, public.order_wall to authenticated;

revoke insert, update, delete on table public.campaign_item, public.campaign from authenticated;
revoke insert, update, delete on table public.orders, public.order_item from authenticated;
