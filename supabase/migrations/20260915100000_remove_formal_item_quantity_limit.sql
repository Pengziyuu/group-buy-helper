begin;

alter table public.order_item drop constraint order_item_qty_check;
alter table public.order_item
  add constraint order_item_qty_check check (qty >= 0);

-- Formal catalog items no longer have the former product-level quantity cap of 20.
-- Quantity-threshold campaigns remain bounded atomically by the campaign threshold;
-- the integer ceiling below is only a storage/type safety boundary.
create or replace function public.submit_customer_order(
  p_campaign_id uuid,
  p_items jsonb,
  p_custom_items jsonb default null
)
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
  v_current_custom_items jsonb := '[]'::jsonb;
  v_requested_custom_items jsonb;
  v_custom_items jsonb := '[]'::jsonb;
  v_desired_items jsonb;
  v_desired_quantity bigint;
  v_other_quantity bigint;
  v_max_order_quantity bigint;
  v_mix_match_quantity bigint := 0;
  v_campaign public.campaign;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select customer.id into v_customer_id from public.customer where auth_user_id = auth.uid();
  if v_customer_id is null then raise exception '戶號尚未綁定' using errcode = '42501'; end if;
  if not public.has_campaign_access(p_campaign_id) then raise exception '尚未取得這一團的存取權' using errcode = '42501'; end if;
  select * into v_campaign from public.campaign where id = p_campaign_id for update;
  if v_campaign.id is null then raise exception '找不到團購活動' using errcode = 'P0002'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'object' then raise exception '訂單品項格式錯誤' using errcode = '22023'; end if;

  select customer_order.id, customer_order.custom_items into v_order_id, v_current_custom_items
  from public.orders customer_order where customer_order.campaign_id = p_campaign_id and customer_order.customer_id = v_customer_id;
  v_requested_custom_items := coalesce(p_custom_items, v_current_custom_items, '[]'::jsonb);
  if not coalesce(public.valid_custom_order_items(v_requested_custom_items), false) then raise exception '額外品項格式錯誤' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', entry.value ->> 'id', 'name', btrim(entry.value ->> 'name'),
    'quantity', (entry.value ->> 'quantity')::integer) order by entry.ordinality), '[]'::jsonb)
  into v_custom_items from jsonb_array_elements(v_requested_custom_items) with ordinality as entry(value, ordinality);
  if not v_campaign.allow_custom_items and v_custom_items is distinct from coalesce(v_current_custom_items, '[]'::jsonb) then
    raise exception '本團未開放住戶新增或修改額外品項' using errcode = '23514';
  end if;

  for v_entry in select key, value from jsonb_each(p_items) loop
    if v_entry.key !~ '^[A-Z0-9]{1,64}$' then raise exception '品項代號格式錯誤：%', v_entry.key using errcode = '22023'; end if;
    if jsonb_typeof(v_entry.value) <> 'number' or (v_entry.value #>> '{}') !~ '^\d+$' then
      raise exception '% 數量必須是非負整數', v_entry.key using errcode = '22023';
    end if;
    if (v_entry.value #>> '{}')::numeric > 32767 then
      raise exception '% 數量超過系統可處理範圍', v_entry.key using errcode = '22003';
    end if;
    v_qty := (v_entry.value #>> '{}')::integer;
    if not exists (select 1 from public.campaign_item item where item.campaign_id = p_campaign_id and item.code = v_entry.key) then raise exception '不存在的品項：%', v_entry.key using errcode = '23503'; end if;
    if exists (select 1 from public.campaign_item item where item.campaign_id = p_campaign_id and item.code = v_entry.key and not item.active) then
      select coalesce(order_item.qty, 0) into v_existing_qty from public.campaign_item item
      left join public.order_item order_item on order_item.campaign_item_id = item.id and order_item.order_id = v_order_id
      where item.campaign_id = p_campaign_id and item.code = v_entry.key;
      if v_qty > coalesce(v_existing_qty, 0) then raise exception '已停用品項不能新增或增加：%', v_entry.key using errcode = '23514'; end if;
    end if;
  end loop;

  select coalesce(jsonb_object_agg(item.code, order_item.qty), '{}'::jsonb) into v_current_items
  from public.order_item order_item join public.campaign_item item on item.id = order_item.campaign_item_id
  where order_item.order_id = v_order_id;
  select coalesce(jsonb_object_agg(desired.code, desired.qty), '{}'::jsonb) into v_desired_items from (
    select item.code, case when p_items ? item.code then (p_items ->> item.code)::integer else order_item.qty end as qty
    from public.order_item order_item join public.campaign_item item on item.id = order_item.campaign_item_id
    where order_item.order_id = v_order_id and not item.active
      and case when p_items ? item.code then (p_items ->> item.code)::integer else order_item.qty end > 0
    union all
    select item.code, (p_items ->> item.code)::integer from public.campaign_item item
    where item.campaign_id = p_campaign_id and item.active and p_items ? item.code and (p_items ->> item.code)::integer > 0
  ) desired;
  if v_desired_items = '{}'::jsonb and jsonb_array_length(v_custom_items) = 0 then raise exception '訂單至少需要一個品項' using errcode = '23514'; end if;
  if v_order_id is not null and v_current_items = v_desired_items and v_current_custom_items = v_custom_items then
    return jsonb_build_object('id', v_order_id, 'campaign_id', p_campaign_id, 'customer_id', v_customer_id,
      'items', v_desired_items, 'custom_items', v_custom_items, 'campaign_status', v_campaign.status);
  end if;
  if not public.campaign_is_editable(p_campaign_id) then raise exception '本團已結單，不能修改訂單' using errcode = '23514'; end if;
  if v_order_id is not null and exists (
    select 1 from public.payment payment where payment.order_id = v_order_id and payment.paid
  ) then
    raise exception '訂單已付款，不能修改' using errcode = '23514';
  end if;

  select coalesce(sum((entry.value #>> '{}')::bigint), 0)::bigint into v_desired_quantity from jsonb_each(v_desired_items) entry;
  if v_campaign.threshold_kind = 'quantity' then
    select coalesce(sum(order_item.qty), 0)::bigint into v_other_quantity from public.order_item order_item
    join public.orders customer_order on customer_order.id = order_item.order_id
    where order_item.campaign_id = p_campaign_id and (v_order_id is null or customer_order.id <> v_order_id);
    v_max_order_quantity := greatest(v_campaign.threshold - v_other_quantity, 0);
    if v_other_quantity + v_desired_quantity > v_campaign.threshold then
      raise exception '目前其他住戶已訂 % %，成團上限為 % %，本次最多可訂 % %。',
        v_other_quantity, v_campaign.quantity_unit,
        v_campaign.threshold, v_campaign.quantity_unit,
        v_max_order_quantity, v_campaign.quantity_unit using errcode = '23514';
    end if;
  end if;

  select coalesce(sum((entry.value #>> '{}')::bigint), 0)::bigint into v_mix_match_quantity
  from jsonb_each(v_desired_items) entry join public.campaign_item item
    on item.campaign_id = p_campaign_id and item.code = entry.key
  where item.discount_eligible;

  insert into public.orders (campaign_id, customer_id, custom_items) values (p_campaign_id, v_customer_id, v_custom_items)
  on conflict (campaign_id, customer_id) do update set custom_items = excluded.custom_items, updated_at = now()
  returning id into v_order_id;
  delete from public.order_item where order_id = v_order_id;

  insert into public.order_item (
    order_id, campaign_id, campaign_item_id, qty, list_unit_price,
    discount_rate, final_unit_price, discount_type, promotion_name
  )
  select v_order_id, p_campaign_id, item.id, (entry.value #>> '{}')::integer, item.unit_price,
    applied.rate, round(item.unit_price * applied.rate, 0),
    case when applied.mix_applied then 'mix_match' when applied.rate < 1 then 'base' else 'none' end,
    case when applied.mix_applied then v_campaign.mix_match_name else null end
  from jsonb_each(v_desired_items) entry
  join public.campaign_item item on item.campaign_id = p_campaign_id and item.code = entry.key
  cross join lateral (
    select case when item.discount_eligible and v_campaign.mix_match_name is not null
      and v_mix_match_quantity >= v_campaign.mix_match_min_quantity
      then v_campaign.mix_match_discount_rate else v_campaign.base_discount_rate end as rate,
      (item.discount_eligible and v_campaign.mix_match_name is not null
        and v_mix_match_quantity >= v_campaign.mix_match_min_quantity) as mix_applied
  ) applied;

  if v_campaign.threshold_kind = 'quantity' and v_other_quantity + v_desired_quantity = v_campaign.threshold then
    update public.campaign set status = 'closed' where id = p_campaign_id and status = 'open';
    v_campaign.status := 'closed';
  end if;
  return jsonb_build_object('id', v_order_id, 'campaign_id', p_campaign_id, 'customer_id', v_customer_id,
    'items', v_desired_items, 'custom_items', v_custom_items, 'campaign_status', v_campaign.status);
end;
$$;

revoke all on function public.submit_customer_order(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.submit_customer_order(uuid, jsonb, jsonb) to authenticated, service_role;

commit;
