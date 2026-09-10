-- Add a campaign-level display unit for ordered quantities. Existing rows keep the
-- database default 個; no existing quantities or thresholds are rewritten.

alter table public.campaign
  add column quantity_unit text not null default '個'
  check (quantity_unit in ('個', '盒', '包', '袋', '瓶', '罐', '組', '份', '條', '顆', '箱'));

alter table public.campaign_draft
  add column quantity_unit text not null default '個'
  check (quantity_unit in ('個', '盒', '包', '袋', '瓶', '罐', '組', '份', '條', '顆', '箱'));

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
  v_current_quantity bigint;
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

  select coalesce(sum(order_item.qty), 0)::bigint
  into v_current_quantity
  from public.order_item order_item
  where order_item.campaign_id = p_campaign_id;

  if v_draft.threshold_kind = 'quantity' and v_current_quantity > v_draft.threshold then
    raise exception '目前已有 % %，數量門檻不能低於目前訂購數量', v_current_quantity, v_draft.quantity_unit
      using errcode = '23514';
  end if;

  update public.campaign
  set title = v_draft.title,
      unit_price = v_min_price,
      threshold = v_draft.threshold,
      threshold_kind = v_draft.threshold_kind,
      amount_threshold = v_draft.amount_threshold,
      quantity_unit = v_draft.quantity_unit,
      announcement = v_draft.announcement,
      images = v_draft.images,
      items = v_draft.items,
      opened_at = coalesce(opened_at, now()),
      status = case
        when status = 'open'
          and v_draft.threshold_kind = 'quantity'
          and v_current_quantity = v_draft.threshold
        then 'closed'
        else status
      end
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
  v_desired_quantity integer;
  v_other_quantity bigint;
  v_max_order_quantity bigint;
  v_campaign public.campaign;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select customer.id into v_customer_id from public.customer where auth_user_id = auth.uid();
  if v_customer_id is null then raise exception '戶號尚未綁定' using errcode = '42501'; end if;
  if not public.has_campaign_access(p_campaign_id) then raise exception '尚未取得這一團的存取權' using errcode = '42501'; end if;

  select * into v_campaign
  from public.campaign
  where id = p_campaign_id
  for update;
  if v_campaign.id is null then raise exception '找不到團購活動' using errcode = 'P0002'; end if;
  if not public.campaign_is_editable(p_campaign_id) then raise exception '本團已結單，不能修改訂單' using errcode = '23514'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'object' then raise exception '訂單品項格式錯誤' using errcode = '22023'; end if;

  select customer_order.id into v_order_id
  from public.orders customer_order
  where customer_order.campaign_id = p_campaign_id and customer_order.customer_id = v_customer_id;

  for v_entry in select key, value from jsonb_each(p_items) loop
    if v_entry.key !~ '^[A-Z0-9]{1,64}$' then
      raise exception '品項代號格式錯誤：%', v_entry.key using errcode = '22023';
    end if;
    if jsonb_typeof(v_entry.value) <> 'number' or (v_entry.value #>> '{}') !~ '^\d+$' then
      raise exception '% 數量必須是 0 到 20 的整數', v_entry.key using errcode = '22023';
    end if;
    v_qty := (v_entry.value #>> '{}')::integer;
    if v_qty < 0 or v_qty > 20 then raise exception '% 數量必須是 0 到 20 的整數', v_entry.key using errcode = '22023'; end if;
    if not exists (select 1 from public.campaign_item item where item.campaign_id = p_campaign_id and item.code = v_entry.key) then
      raise exception '不存在的品項：%', v_entry.key using errcode = '23503';
    end if;
    if exists (select 1 from public.campaign_item item where item.campaign_id = p_campaign_id and item.code = v_entry.key and not item.active) then
      select coalesce(order_item.qty, 0) into v_existing_qty
      from public.campaign_item item left join public.order_item order_item
        on order_item.campaign_item_id = item.id and order_item.order_id = v_order_id
      where item.campaign_id = p_campaign_id and item.code = v_entry.key;
      if v_qty > coalesce(v_existing_qty, 0) then
        raise exception '已停用品項不能新增或增加：%', v_entry.key using errcode = '23514';
      end if;
    end if;
  end loop;

  select coalesce(jsonb_object_agg(item.code, order_item.qty), '{}'::jsonb)
  into v_current_items
  from public.order_item order_item join public.campaign_item item on item.id = order_item.campaign_item_id
  where order_item.order_id = v_order_id;

  select coalesce(jsonb_object_agg(desired.code, desired.qty), '{}'::jsonb)
  into v_desired_items
  from (
    select item.code,
      case when p_items ? item.code then (p_items ->> item.code)::integer else order_item.qty end as qty
    from public.order_item order_item join public.campaign_item item on item.id = order_item.campaign_item_id
    where order_item.order_id = v_order_id and not item.active
      and case when p_items ? item.code then (p_items ->> item.code)::integer else order_item.qty end > 0
    union all
    select item.code, (p_items ->> item.code)::integer
    from public.campaign_item item
    where item.campaign_id = p_campaign_id and item.active and p_items ? item.code
      and (p_items ->> item.code)::integer > 0
  ) desired;

  if v_desired_items = '{}'::jsonb then
    raise exception '訂單至少需要一個品項' using errcode = '23514';
  end if;

  if v_order_id is not null and v_current_items = v_desired_items then
    return jsonb_build_object('id', v_order_id, 'campaign_id', p_campaign_id,
      'customer_id', v_customer_id, 'items', v_desired_items, 'campaign_status', v_campaign.status);
  end if;

  select coalesce(sum((entry.value #>> '{}')::integer), 0)::integer
  into v_desired_quantity
  from jsonb_each(v_desired_items) entry;

  if v_campaign.threshold_kind = 'quantity' then
    select coalesce(sum(order_item.qty), 0)::bigint
    into v_other_quantity
    from public.order_item order_item
    join public.orders customer_order on customer_order.id = order_item.order_id
    where order_item.campaign_id = p_campaign_id
      and (v_order_id is null or customer_order.id <> v_order_id);

    v_max_order_quantity := greatest(v_campaign.threshold - v_other_quantity, 0);
    if v_other_quantity + v_desired_quantity > v_campaign.threshold then
      raise exception '此訂單最多可保留 % %，請減少 % %',
        v_max_order_quantity, v_campaign.quantity_unit,
        v_desired_quantity - v_max_order_quantity, v_campaign.quantity_unit
        using errcode = '23514';
    end if;
  end if;

  insert into public.orders (campaign_id, customer_id) values (p_campaign_id, v_customer_id)
  on conflict (campaign_id, customer_id) do update set updated_at = now()
  returning id into v_order_id;

  delete from public.order_item order_item using public.campaign_item item
  where order_item.order_id = v_order_id and order_item.campaign_item_id = item.id and item.active;

  delete from public.order_item order_item using public.campaign_item item
  where order_item.order_id = v_order_id and order_item.campaign_item_id = item.id and not item.active
    and coalesce((p_items ->> item.code)::integer, order_item.qty) = 0;

  update public.order_item order_item set qty = (p_items ->> item.code)::integer
  from public.campaign_item item
  where order_item.order_id = v_order_id and order_item.campaign_item_id = item.id and not item.active
    and p_items ? item.code and (p_items ->> item.code)::integer > 0;

  insert into public.order_item (order_id, campaign_id, campaign_item_id, qty)
  select v_order_id, p_campaign_id, item.id, (entry.value #>> '{}')::integer
  from jsonb_each(p_items) entry join public.campaign_item item
    on item.campaign_id = p_campaign_id and item.code = entry.key
  where item.active and (entry.value #>> '{}')::integer > 0;

  if v_campaign.threshold_kind = 'quantity'
     and v_other_quantity + v_desired_quantity = v_campaign.threshold then
    update public.campaign
    set status = 'closed'
    where id = p_campaign_id and status = 'open';
    v_campaign.status := 'closed';
  end if;

  return jsonb_build_object('id', v_order_id, 'campaign_id', p_campaign_id,
    'customer_id', v_customer_id, 'items', v_desired_items, 'campaign_status', v_campaign.status);
end;
$$;

create or replace function public.set_campaign_status(
  p_campaign_id uuid,
  p_status text
)
returns public.campaign
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign public.campaign;
  v_current_quantity bigint;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin permission required' using errcode = '42501';
  end if;
  if p_status not in ('open', 'closed', 'arrived') then
    raise exception 'invalid campaign status' using errcode = '22023';
  end if;

  select * into v_campaign
  from public.campaign
  where id = p_campaign_id
  for update;

  if v_campaign.id is null then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;

  if p_status = 'open' and v_campaign.threshold_kind = 'quantity' then
    select coalesce(sum(order_item.qty), 0)::bigint
    into v_current_quantity
    from public.order_item order_item
    where order_item.campaign_id = p_campaign_id;

    if v_current_quantity >= v_campaign.threshold then
      raise exception '目前訂購量已達成團門檻（% %），不能重新開團', v_current_quantity, v_campaign.quantity_unit using errcode = '23514';
    end if;
  end if;

  update public.campaign
  set status = p_status
  where id = p_campaign_id
  returning * into v_campaign;

  return v_campaign;
end;
$$;

create or replace view public.campaign_public with (security_invoker = true) as
select id, slug, title, unit_price, threshold, status, deadline, announcement,
       images, items, opened_at, created_at, updated_at, threshold_kind, amount_threshold, quantity_unit
from public.campaign;

drop function public.list_resident_campaigns();
create function public.list_resident_campaigns()
returns table (
  slug text,
  title text,
  unit_price numeric,
  threshold integer,
  status text,
  opened_at timestamptz,
  total_quantity bigint,
  threshold_kind text,
  amount_threshold numeric,
  quantity_unit text,
  total_amount numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select campaign.slug, campaign.title, campaign.unit_price, campaign.threshold,
         campaign.status, campaign.opened_at,
         coalesce(sum(order_item.qty), 0)::bigint as total_quantity,
         campaign.threshold_kind, campaign.amount_threshold, campaign.quantity_unit,
         coalesce(sum(order_item.qty * campaign_item.unit_price), 0)::numeric as total_amount
  from public.community_member member
  join public.campaign campaign on campaign.community_id = member.community_id
  left join public.order_item order_item on order_item.campaign_id = campaign.id
  left join public.campaign_item campaign_item on campaign_item.id = order_item.campaign_item_id
  where member.user_id = auth.uid()
    and campaign.opened_at is not null
  group by campaign.id, campaign.slug, campaign.title, campaign.unit_price,
           campaign.threshold, campaign.status, campaign.opened_at,
           campaign.threshold_kind, campaign.amount_threshold, campaign.quantity_unit
  order by campaign.opened_at desc;
$$;

revoke all on function public.publish_campaign_draft(uuid) from public, anon;
grant execute on function public.publish_campaign_draft(uuid) to authenticated, service_role;
revoke all on function public.submit_customer_order(uuid, jsonb) from public, anon;
grant execute on function public.submit_customer_order(uuid, jsonb) to authenticated, service_role;
revoke all on function public.set_campaign_status(uuid, text) from public, anon;
grant execute on function public.set_campaign_status(uuid, text) to authenticated, service_role;
revoke all on function public.list_resident_campaigns() from public, anon;
grant execute on function public.list_resident_campaigns() to authenticated, service_role;
revoke all on table public.campaign_public from anon, authenticated;
grant select on table public.campaign_public to authenticated;
