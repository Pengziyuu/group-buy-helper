-- Campaign-level base discounts and one non-overlapping mix-and-match group.
-- Existing campaigns and order items retain their current prices through safe defaults/backfills.

alter table public.campaign
  add column base_discount_rate numeric(5,4) not null default 1
    check (base_discount_rate > 0 and base_discount_rate <= 1),
  add column mix_match_name text
    check (mix_match_name is null or length(btrim(mix_match_name)) between 1 and 100),
  add column mix_match_min_quantity integer
    check (mix_match_min_quantity is null or mix_match_min_quantity between 2 and 100),
  add column mix_match_discount_rate numeric(5,4)
    check (mix_match_discount_rate is null or (mix_match_discount_rate > 0 and mix_match_discount_rate <= 1)),
  add constraint campaign_mix_match_complete check (
    (mix_match_name is null and mix_match_min_quantity is null and mix_match_discount_rate is null)
    or
    (mix_match_name is not null and mix_match_min_quantity is not null and mix_match_discount_rate is not null
      and mix_match_discount_rate <= base_discount_rate)
  );

alter table public.campaign_draft
  add column base_discount_rate numeric(5,4) not null default 1
    check (base_discount_rate > 0 and base_discount_rate <= 1),
  add column mix_match_name text
    check (mix_match_name is null or length(btrim(mix_match_name)) between 1 and 100),
  add column mix_match_min_quantity integer
    check (mix_match_min_quantity is null or mix_match_min_quantity between 2 and 100),
  add column mix_match_discount_rate numeric(5,4)
    check (mix_match_discount_rate is null or (mix_match_discount_rate > 0 and mix_match_discount_rate <= 1)),
  add constraint campaign_draft_mix_match_complete check (
    (mix_match_name is null and mix_match_min_quantity is null and mix_match_discount_rate is null)
    or
    (mix_match_name is not null and mix_match_min_quantity is not null and mix_match_discount_rate is not null
      and mix_match_discount_rate <= base_discount_rate)
  );

alter table public.campaign_item
  add column discount_eligible boolean not null default false;

-- Canonicalize legacy JSON before enabling published-vs-draft item comparisons.
update public.campaign campaign
set items = (
  select coalesce(jsonb_agg(item.value || jsonb_build_object('discountEligible', false) order by item.ordinality), '[]'::jsonb)
  from jsonb_array_elements(campaign.items) with ordinality as item(value, ordinality)
)
where jsonb_typeof(campaign.items) = 'array';

update public.campaign_draft draft
set items = (
  select coalesce(jsonb_agg(item.value || jsonb_build_object('discountEligible', false) order by item.ordinality), '[]'::jsonb)
  from jsonb_array_elements(draft.items) with ordinality as item(value, ordinality)
)
where jsonb_typeof(draft.items) = 'array';

alter table public.order_item
  add column list_unit_price numeric(12,2),
  add column discount_rate numeric(5,4),
  add column final_unit_price numeric(12,2),
  add column discount_type text,
  add column promotion_name text;

update public.order_item order_item
set list_unit_price = campaign_item.unit_price,
    discount_rate = 1,
    final_unit_price = campaign_item.unit_price,
    discount_type = 'none',
    promotion_name = null
from public.campaign_item campaign_item
where campaign_item.id = order_item.campaign_item_id;

alter table public.order_item
  alter column list_unit_price set not null,
  alter column discount_rate set not null,
  alter column final_unit_price set not null,
  alter column discount_type set not null,
  add constraint order_item_list_unit_price_valid check (list_unit_price >= 0),
  add constraint order_item_discount_rate_valid check (discount_rate > 0 and discount_rate <= 1),
  add constraint order_item_final_unit_price_valid check (final_unit_price >= 0),
  add constraint order_item_discount_type_valid check (discount_type in ('none', 'base', 'mix_match')),
  add constraint order_item_promotion_name_valid check (
    (discount_type = 'mix_match' and promotion_name is not null and length(btrim(promotion_name)) between 1 and 100)
    or (discount_type <> 'mix_match' and promotion_name is null)
  );

create or replace function public.fill_order_item_price_snapshot()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.list_unit_price is null
    or new.discount_type is null
    or new.discount_rate is null
    or new.final_unit_price is null then
    select item.unit_price into new.list_unit_price
    from public.campaign_item item
    where item.id = new.campaign_item_id and item.campaign_id = new.campaign_id;
    if new.list_unit_price is null then raise exception '找不到品項價格'; end if;
    new.discount_type := 'none';
    new.discount_rate := 1;
    new.final_unit_price := new.list_unit_price;
    new.promotion_name := null;
  end if;
  return new;
end;
$$;

drop trigger if exists fill_order_item_price_snapshot on public.order_item;
create trigger fill_order_item_price_snapshot
before insert on public.order_item
for each row execute function public.fill_order_item_price_snapshot();

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
      or (item ? 'discountEligible' and jsonb_typeof(item -> 'discountEligible') <> 'boolean')
      or (item ->> 'code') !~ '^[A-Z0-9]{1,64}$'
      or length(item ->> 'name') > 200
      or length(btrim(item ->> 'name')) < 1
      or (item ->> 'unitPrice')::numeric not between 0 and 9999999.99
      or (item ->> 'unitPrice')::numeric <> round((item ->> 'unitPrice')::numeric, 2)
  ) then return false; end if;
  if (select count(*) from jsonb_array_elements(p_items)) <>
     (select count(distinct item ->> 'code') from jsonb_array_elements(p_items) item) then
    return false;
  end if;
  return exists (select 1 from jsonb_array_elements(p_items) item where (item ->> 'active')::boolean);
end;
$$;

create function public.lock_published_campaign_discounts()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.opened_at is not null and (
    new.base_discount_rate is distinct from old.base_discount_rate
    or new.mix_match_name is distinct from old.mix_match_name
    or new.mix_match_min_quantity is distinct from old.mix_match_min_quantity
    or new.mix_match_discount_rate is distinct from old.mix_match_discount_rate
  ) then
    raise exception '正式開團後不能修改折扣設定' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger lock_published_campaign_discounts
before update of base_discount_rate, mix_match_name, mix_match_min_quantity, mix_match_discount_rate
on public.campaign for each row execute function public.lock_published_campaign_discounts();

create function public.lock_published_draft_discounts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.campaign campaign
    where campaign.id = new.campaign_id and campaign.opened_at is not null
      and (new.base_discount_rate is distinct from campaign.base_discount_rate
        or new.mix_match_name is distinct from campaign.mix_match_name
        or new.mix_match_min_quantity is distinct from campaign.mix_match_min_quantity
        or new.mix_match_discount_rate is distinct from campaign.mix_match_discount_rate)
  ) then
    raise exception '正式開團後不能修改折扣設定' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger lock_published_draft_discounts
before insert or update of base_discount_rate, mix_match_name, mix_match_min_quantity, mix_match_discount_rate, campaign_id
on public.campaign_draft for each row execute function public.lock_published_draft_discounts();

create function public.lock_published_campaign_items()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if exists (
      select 1 from public.campaign
      where id in (old.campaign_id, new.campaign_id) and opened_at is not null
    ) then
      raise exception '正式開團後不能修改品項快照' using errcode = '23514';
    end if;
  elsif tg_op = 'INSERT' then
    if exists (select 1 from public.campaign where id = new.campaign_id and opened_at is not null) then
      raise exception '正式開團後不能修改品項快照' using errcode = '23514';
    end if;
  else
    if exists (select 1 from public.campaign where id = old.campaign_id and opened_at is not null) then
      raise exception '正式開團後不能修改品項快照' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger lock_published_campaign_items
before insert or update or delete on public.campaign_item
for each row execute function public.lock_published_campaign_items();

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
  v_eligible_count integer;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin permission required' using errcode = '42501'; end if;
  select * into v_campaign from public.campaign where id = p_campaign_id for update;
  select * into v_draft from public.campaign_draft where campaign_id = p_campaign_id for update;
  if v_campaign.id is null or v_draft.campaign_id is null then raise exception 'campaign draft not found' using errcode = 'P0002'; end if;
  if v_campaign.opened_at is not null and v_draft.allow_custom_items is distinct from v_campaign.allow_custom_items then
    raise exception '正式開團後不能修改住戶額外品項設定' using errcode = '23514';
  end if;
  if v_campaign.opened_at is not null and v_draft.items is distinct from v_campaign.items then
    raise exception '正式開團後不能修改品項代碼、名稱、單價或折扣資格' using errcode = '23514';
  end if;
  if v_campaign.opened_at is not null and (
    v_draft.base_discount_rate is distinct from v_campaign.base_discount_rate
    or v_draft.mix_match_name is distinct from v_campaign.mix_match_name
    or v_draft.mix_match_min_quantity is distinct from v_campaign.mix_match_min_quantity
    or v_draft.mix_match_discount_rate is distinct from v_campaign.mix_match_discount_rate
  ) then raise exception '正式開團後不能修改折扣設定' using errcode = '23514'; end if;

  select min((item ->> 'unitPrice')::numeric),
         count(*) filter (where coalesce((item ->> 'discountEligible')::boolean, false) and (item ->> 'active')::boolean)
  into v_min_price, v_eligible_count
  from jsonb_array_elements(v_draft.items) item
  where (item ->> 'active')::boolean;
  if v_min_price is null then raise exception '至少需要一個啟用品項' using errcode = '23514'; end if;
  if v_draft.mix_match_name is not null and v_eligible_count = 0 then
    raise exception '任選優惠至少需要一個適用品項' using errcode = '23514';
  end if;

  select coalesce(sum(order_item.qty), 0)::bigint into v_current_quantity
  from public.order_item order_item where order_item.campaign_id = p_campaign_id;
  if v_draft.threshold_kind = 'quantity' and v_current_quantity > v_draft.threshold then
    raise exception '目前已有 % %，數量門檻不能低於目前訂購數量', v_current_quantity, v_draft.quantity_unit using errcode = '23514';
  end if;

  update public.campaign set
    title = v_draft.title, unit_price = v_min_price, threshold = v_draft.threshold,
    threshold_kind = v_draft.threshold_kind, amount_threshold = v_draft.amount_threshold,
    quantity_unit = v_draft.quantity_unit, allow_custom_items = v_draft.allow_custom_items,
    base_discount_rate = v_draft.base_discount_rate, mix_match_name = v_draft.mix_match_name,
    mix_match_min_quantity = v_draft.mix_match_min_quantity,
    mix_match_discount_rate = v_draft.mix_match_discount_rate,
    announcement = v_draft.announcement, images = v_draft.images, items = v_draft.items
  where id = p_campaign_id returning * into v_campaign;

  if v_campaign.opened_at is null then
  insert into public.campaign_item (campaign_id, code, name, unit_price, sort_order, active, discount_eligible)
  select p_campaign_id, item ->> 'code', item ->> 'name', (item ->> 'unitPrice')::numeric,
         ordinality - 1, (item ->> 'active')::boolean,
         coalesce((item ->> 'discountEligible')::boolean, false)
  from jsonb_array_elements(v_draft.items) with ordinality as draft(item, ordinality)
  on conflict (campaign_id, code) do update set
    name = excluded.name, unit_price = excluded.unit_price, sort_order = excluded.sort_order,
    active = excluded.active, discount_eligible = excluded.discount_eligible;

  update public.campaign_item item set active = false
  where item.campaign_id = p_campaign_id
    and exists (select 1 from public.order_item order_item where order_item.campaign_item_id = item.id)
    and not exists (select 1 from jsonb_array_elements(v_draft.items) draft_item
      where draft_item ->> 'code' = item.code and (draft_item ->> 'active')::boolean);
  delete from public.campaign_item item where item.campaign_id = p_campaign_id
    and not exists (select 1 from public.order_item order_item where order_item.campaign_item_id = item.id)
    and not exists (select 1 from jsonb_array_elements(v_draft.items) draft_item
      where draft_item ->> 'code' = item.code and (draft_item ->> 'active')::boolean);
  end if;

  update public.campaign campaign set items = coalesce((
    select jsonb_agg(jsonb_build_object(
      'code', item.code, 'name', item.name, 'unitPrice', item.unit_price,
      'active', item.active, 'discountEligible', item.discount_eligible
    ) order by item.sort_order, item.code)
    from public.campaign_item item where item.campaign_id = p_campaign_id
  ), '[]'::jsonb),
    opened_at = coalesce(campaign.opened_at, now()),
    status = case when campaign.status = 'open' and v_draft.threshold_kind = 'quantity' and v_current_quantity = v_draft.threshold then 'closed' else campaign.status end
  where campaign.id = p_campaign_id returning campaign.* into v_campaign;

  update public.campaign_draft set unit_price = v_min_price, items = v_campaign.items
  where campaign_id = p_campaign_id;
  return v_campaign;
end;
$$;

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
  v_desired_quantity integer;
  v_other_quantity bigint;
  v_max_order_quantity bigint;
  v_mix_match_quantity integer := 0;
  v_campaign public.campaign;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select customer.id into v_customer_id from public.customer where auth_user_id = auth.uid();
  if v_customer_id is null then raise exception '戶號尚未綁定' using errcode = '42501'; end if;
  if not public.has_campaign_access(p_campaign_id) then raise exception '尚未取得這一團的存取權' using errcode = '42501'; end if;
  select * into v_campaign from public.campaign where id = p_campaign_id for update;
  if v_campaign.id is null then raise exception '找不到團購活動' using errcode = 'P0002'; end if;
  if not public.campaign_is_editable(p_campaign_id) then raise exception '本團已結單，不能修改訂單' using errcode = '23514'; end if;
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
    if jsonb_typeof(v_entry.value) <> 'number' or (v_entry.value #>> '{}') !~ '^\d+$' then raise exception '% 數量必須是 0 到 20 的整數', v_entry.key using errcode = '22023'; end if;
    v_qty := (v_entry.value #>> '{}')::integer;
    if v_qty < 0 or v_qty > 20 then raise exception '% 數量必須是 0 到 20 的整數', v_entry.key using errcode = '22023'; end if;
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
  if v_order_id is not null and exists (
    select 1 from public.payment payment where payment.order_id = v_order_id and payment.paid
  ) then
    raise exception '訂單已付款，不能修改' using errcode = '23514';
  end if;

  select coalesce(sum((entry.value #>> '{}')::integer), 0)::integer into v_desired_quantity from jsonb_each(v_desired_items) entry;
  if v_campaign.threshold_kind = 'quantity' then
    select coalesce(sum(order_item.qty), 0)::bigint into v_other_quantity from public.order_item order_item
    join public.orders customer_order on customer_order.id = order_item.order_id
    where order_item.campaign_id = p_campaign_id and (v_order_id is null or customer_order.id <> v_order_id);
    v_max_order_quantity := greatest(v_campaign.threshold - v_other_quantity, 0);
    if v_other_quantity + v_desired_quantity > v_campaign.threshold then
      raise exception '此訂單最多可保留 % %，請減少 % %', v_max_order_quantity, v_campaign.quantity_unit,
        v_desired_quantity - v_max_order_quantity, v_campaign.quantity_unit using errcode = '23514';
    end if;
  end if;

  select coalesce(sum((entry.value #>> '{}')::integer), 0)::integer into v_mix_match_quantity
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

create or replace function public.set_order_paid(p_order_id uuid, p_paid boolean)
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
  if auth.uid() is null or not public.is_admin() then raise exception 'admin permission required' using errcode = '42501'; end if;
  select campaign.id into v_campaign_id from public.campaign campaign
  join public.orders customer_order on customer_order.campaign_id = campaign.id
  where customer_order.id = p_order_id for update of campaign;
  if v_campaign_id is null then raise exception 'order not found' using errcode = 'P0002'; end if;
  perform 1 from public.orders customer_order where customer_order.id = p_order_id and customer_order.campaign_id = v_campaign_id for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  select coalesce(sum(order_item.qty * order_item.final_unit_price), 0) into v_amount
  from public.order_item order_item where order_item.order_id = p_order_id;
  select paid_at into v_paid_at from public.payment where order_id = p_order_id;
  if p_paid and v_paid_at is null then v_paid_at := now(); elsif not p_paid then v_paid_at := null; end if;
  insert into public.payment (order_id, amount, paid, paid_at) values (p_order_id, v_amount, p_paid, v_paid_at)
  on conflict (order_id) do update set amount = excluded.amount, paid = excluded.paid, paid_at = excluded.paid_at;
  return jsonb_build_object('order_id', p_order_id, 'campaign_id', v_campaign_id, 'amount', v_amount, 'paid', p_paid, 'paid_at', v_paid_at);
end;
$$;

create or replace view public.campaign_public with (security_invoker = true) as
select id, slug, title, unit_price, threshold, status, deadline, announcement, images, items,
  opened_at, created_at, updated_at, threshold_kind, amount_threshold, quantity_unit, allow_custom_items,
  base_discount_rate, mix_match_name, mix_match_min_quantity, mix_match_discount_rate
from public.campaign;

create or replace function public.list_resident_campaigns()
returns table (
  slug text, title text, unit_price numeric, threshold integer, status text, opened_at timestamptz,
  total_quantity bigint, threshold_kind text, amount_threshold numeric, quantity_unit text,
  total_amount numeric, allow_custom_items boolean, images jsonb
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select campaign.slug, campaign.title, round(campaign.unit_price * campaign.base_discount_rate, 0), campaign.threshold, campaign.status, campaign.opened_at,
    coalesce(sum(order_item.qty), 0)::bigint, campaign.threshold_kind, campaign.amount_threshold, campaign.quantity_unit,
    coalesce(sum(order_item.qty * order_item.final_unit_price), 0)::numeric, campaign.allow_custom_items, campaign.images
  from public.community_member member join public.campaign campaign on campaign.community_id = member.community_id
  left join public.order_item order_item on order_item.campaign_id = campaign.id
  where member.user_id = auth.uid() and campaign.opened_at is not null
  group by campaign.id, campaign.slug, campaign.title, campaign.unit_price, campaign.threshold, campaign.status,
    campaign.opened_at, campaign.threshold_kind, campaign.amount_threshold, campaign.quantity_unit, campaign.allow_custom_items, campaign.images
  order by campaign.opened_at desc;
$$;

drop view public.order_wall;
create view public.order_wall with (security_invoker = true) as
select c.slug as campaign_slug, customer_order.campaign_id, customer_order.id as order_id, customer_order.customer_id,
  cu.name as customer_name, cu.picture_url, cu.period, cu.unit, customer_order.note, customer_order.custom_items,
  customer_order.created_at as ordered_at, customer_order.updated_at as order_updated_at,
  ci.id as campaign_item_id, ci.code as item_code, ci.name as item_name, ci.sort_order, ci.active as item_active,
  oi.qty, oi.list_unit_price, oi.discount_rate, oi.final_unit_price, oi.discount_type, oi.promotion_name,
  oi.updated_at as item_updated_at
from public.orders customer_order
join public.campaign c on c.id = customer_order.campaign_id
join public.customer cu on cu.id = customer_order.customer_id
left join public.order_item oi on oi.order_id = customer_order.id
left join public.campaign_item ci on ci.id = oi.campaign_item_id;

revoke all on table public.campaign_public from anon, authenticated;
grant select on table public.campaign_public to authenticated;
revoke insert, update, delete on table public.orders from authenticated;
revoke insert, update, delete on table public.order_item from authenticated;
revoke all on table public.order_wall from anon, authenticated;
grant select on table public.order_wall to authenticated;
revoke all on function public.publish_campaign_draft(uuid) from public, anon;
grant execute on function public.publish_campaign_draft(uuid) to authenticated, service_role;
revoke all on function public.submit_customer_order(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.submit_customer_order(uuid, jsonb, jsonb) to authenticated, service_role;
revoke all on function public.set_order_paid(uuid, boolean) from public, anon, service_role;
grant execute on function public.set_order_paid(uuid, boolean) to authenticated;
revoke all on function public.list_resident_campaigns() from public, anon;
grant execute on function public.list_resident_campaigns() to authenticated, service_role;
