-- Configurable progress-only versus automatic threshold closure. Keep the existing
-- campaign-row mutex, discounts, publication snapshot and notification outbox.
begin;
alter table public.campaign add column threshold_auto_close boolean not null default true;
alter table public.campaign_draft add column threshold_auto_close boolean not null default true;
-- Existing amount campaigns were display-only; preserve that choice on both snapshots.
update public.campaign set threshold_auto_close = false where threshold_kind = 'amount';
update public.campaign_draft set threshold_auto_close = false where threshold_kind = 'amount';
alter table public.campaign_auto_close_notification drop constraint campaign_auto_close_notification_close_reason_check;
alter table public.campaign_auto_close_notification add constraint campaign_auto_close_notification_close_reason_check
  check (close_reason in ('scheduled', 'quantity', 'amount'));

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
  v_current_amount numeric;
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
  if v_draft.threshold_auto_close and v_draft.threshold_kind = 'quantity' and v_current_quantity > v_draft.threshold then
    raise exception '目前已有 % %，數量門檻不能低於目前訂購數量', v_current_quantity, v_draft.quantity_unit using errcode = '23514';
  end if;

  update public.campaign set
    title = v_draft.title, unit_price = v_min_price, threshold = v_draft.threshold,
    threshold_kind = v_draft.threshold_kind, amount_threshold = v_draft.amount_threshold,
    threshold_auto_close = v_draft.threshold_auto_close,
    quantity_unit = v_draft.quantity_unit, allow_custom_items = v_draft.allow_custom_items,
    base_discount_rate = v_draft.base_discount_rate, mix_match_name = v_draft.mix_match_name,
    mix_match_min_quantity = v_draft.mix_match_min_quantity,
    mix_match_discount_rate = v_draft.mix_match_discount_rate,
    arrival_label = v_draft.arrival_label, auto_close_at = v_draft.auto_close_at,
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

  -- Aggregate persisted discounted prices; unpriced custom lines never contribute.
  select coalesce(sum(oi.qty::numeric * oi.final_unit_price), 0) into v_current_amount
  from public.order_item oi where oi.campaign_id = p_campaign_id;

  perform set_config('app.threshold_auto_close_reason',
    case when v_draft.threshold_auto_close and v_draft.threshold_kind = 'amount'
      and v_current_amount >= v_draft.amount_threshold then 'amount' else '' end, true);
  update public.campaign campaign set items = coalesce((
    select jsonb_agg(jsonb_build_object(
      'code', item.code, 'name', item.name, 'unitPrice', item.unit_price,
      'active', item.active, 'discountEligible', item.discount_eligible
    ) order by item.sort_order, item.code)
    from public.campaign_item item where item.campaign_id = p_campaign_id
  ), '[]'::jsonb),
    opened_at = coalesce(campaign.opened_at, now()),
    status = case when campaign.status = 'open' and (
      (v_draft.threshold_auto_close and v_draft.threshold_kind = 'quantity' and v_current_quantity = v_draft.threshold)
      or (v_draft.threshold_auto_close and v_draft.threshold_kind = 'amount' and v_current_amount >= v_draft.amount_threshold)
      or (v_draft.auto_close_at is not null and v_draft.auto_close_at <= now())
    ) then 'closed' else campaign.status end
  where campaign.id = p_campaign_id returning campaign.* into v_campaign;

  perform set_config('app.threshold_auto_close_reason', '', true);
  update public.campaign_draft set unit_price = v_min_price, items = v_campaign.items
  where campaign_id = p_campaign_id;
  return v_campaign;
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
  v_current_amount numeric;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin permission required' using errcode = '42501';
  end if;
  if p_status not in ('open', 'closed', 'arrived') then
    raise exception 'invalid campaign status' using errcode = '22023';
  end if;

  select * into v_campaign from public.campaign where id = p_campaign_id for update;
  if v_campaign.id is null then raise exception 'campaign not found' using errcode = 'P0002'; end if;

  if p_status = 'open' and v_campaign.auto_close_at is not null and v_campaign.auto_close_at <= now() then
    raise exception '自動結單時間已到，請先更新結單日期' using errcode = '23514';
  end if;

  if p_status = 'open' and v_campaign.threshold_auto_close and v_campaign.threshold_kind = 'quantity' then
    select coalesce(sum(order_item.qty), 0)::bigint into v_current_quantity
    from public.order_item order_item where order_item.campaign_id = p_campaign_id;
    if v_current_quantity >= v_campaign.threshold then
      raise exception '目前訂購量已達成團門檻（% %），不能重新開團', v_current_quantity, v_campaign.quantity_unit using errcode = '23514';
    end if;
  end if;

  if p_status = 'open' and v_campaign.threshold_auto_close and v_campaign.threshold_kind = 'amount' then
    select coalesce(sum(oi.qty::numeric * oi.final_unit_price), 0) into v_current_amount
    from public.order_item oi where oi.campaign_id = p_campaign_id;
    if v_current_amount >= v_campaign.amount_threshold then
      raise exception '折扣後訂購總額已達成團門檻，不能重新開團' using errcode = '23514';
    end if;
  end if;
  update public.campaign set status = p_status where id = p_campaign_id returning * into v_campaign;
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
  v_desired_quantity bigint;
  v_other_quantity bigint;
  v_current_amount numeric;
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
  if v_campaign.threshold_auto_close and v_campaign.threshold_kind = 'quantity' then
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

  if v_campaign.threshold_auto_close and v_campaign.threshold_kind = 'quantity' and v_other_quantity + v_desired_quantity = v_campaign.threshold then
    update public.campaign set status = 'closed' where id = p_campaign_id and status = 'open';
    v_campaign.status := 'closed';
  end if;
  if v_campaign.threshold_auto_close and v_campaign.threshold_kind = 'amount' then
    select coalesce(sum(oi.qty::numeric * oi.final_unit_price), 0) into v_current_amount
    from public.order_item oi where oi.campaign_id = p_campaign_id;
    if v_current_amount >= v_campaign.amount_threshold then
      perform set_config('app.threshold_auto_close_reason', 'amount', true);
      update public.campaign set status = 'closed' where id = p_campaign_id and status = 'open';
      perform set_config('app.threshold_auto_close_reason', '', true);
      v_campaign.status := 'closed';
    end if;
  end if;
  return jsonb_build_object('id', v_order_id, 'campaign_id', p_campaign_id, 'customer_id', v_customer_id,
    'items', v_desired_items, 'custom_items', v_custom_items, 'campaign_status', v_campaign.status);
end;
$$;

create or replace function public.queue_campaign_auto_close_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_close_reason text;
  v_organizer_auth_user_id uuid;
  v_line_user_id text;
  v_failure_code text;
  v_status text;
  v_reason_label text;
begin
  if old.status <> 'open' or new.status <> 'closed' then
    return new;
  end if;

  if new.opened_at is not null
     and new.auto_close_at is not null
     and new.auto_close_at <= clock_timestamp() then
    v_close_reason := 'scheduled';
    v_reason_label := '已到設定的結單時間';
  elsif new.opened_at is not null
     and new.threshold_auto_close and new.threshold_kind = 'quantity'
     and (
       select coalesce(sum(order_item.qty), 0)
       from public.order_item order_item
       where order_item.campaign_id = new.id
     ) >= new.threshold then
    v_close_reason := 'quantity';
    v_reason_label := '已達成團數量';
  elsif new.opened_at is not null
     and new.threshold_auto_close and new.threshold_kind = 'amount'
     and current_setting('app.threshold_auto_close_reason', true) = 'amount'
     and (select coalesce(sum(oi.qty::numeric * oi.final_unit_price), 0)
          from public.order_item oi where oi.campaign_id = new.id) >= new.amount_threshold then
    v_close_reason := 'amount';
    v_reason_label := '已達成團金額';
  end if;

  if v_close_reason is null then
    return new;
  end if;

  select setting.organizer_auth_user_id
  into v_organizer_auth_user_id
  from public.auto_close_notification_setting setting
  where setting.singleton;

  if v_organizer_auth_user_id is null then
    v_failure_code := 'missing_recipient_setting';
  else
    select identity.line_user_id
    into v_line_user_id
    from public.line_organizer_identity identity
    join public.admin_users admin_user on admin_user.user_id = identity.auth_user_id
    where identity.auth_user_id = v_organizer_auth_user_id;
    if v_line_user_id is null or v_line_user_id !~ '^U[0-9a-fA-F]{32}$' then
      v_failure_code := 'missing_line_identity';
      v_line_user_id := null;
    end if;
  end if;

  v_status := case when v_line_user_id is null then 'skipped' else 'ready' end;

  insert into public.campaign_auto_close_notification (
    campaign_id, close_reason, recipient_line_user_id, message_text,
    delivery_status, failure_code
  ) values (
    new.id,
    v_close_reason,
    v_line_user_id,
    '「' || new.title || '」已自動結單。' || E'\n'
      || '結單原因：' || v_reason_label || E'\n'
      || '請前往團主後台查看訂單。',
    v_status,
    v_failure_code
  );

  return new;
end;
$$;

create or replace view public.campaign_public with (security_invoker = true) as
select id, slug, title, unit_price, threshold, status, deadline, announcement, images, items,
  opened_at, created_at, updated_at, threshold_kind, amount_threshold, quantity_unit, allow_custom_items,
  base_discount_rate, mix_match_name, mix_match_min_quantity, mix_match_discount_rate,
  arrival_label, auto_close_at, threshold_auto_close
from public.campaign;
revoke all on table public.campaign_public from public, anon, authenticated;
grant select on table public.campaign_public to authenticated;
create or replace view public.admin_campaign_list with (security_invoker = true) as
select campaign.id, campaign.slug, coalesce(draft.title, campaign.title) as title,
  campaign.status, campaign.opened_at, campaign.created_at,
  greatest(campaign.updated_at, coalesce(draft.updated_at, campaign.updated_at)) as updated_at,
  case when campaign.opened_at is null then coalesce(draft.arrival_label, campaign.arrival_label) else campaign.arrival_label end as arrival_label,
  case when campaign.opened_at is null then draft.auto_close_at else campaign.auto_close_at end as auto_close_at,
  case when campaign.opened_at is null then coalesce(draft.threshold_auto_close, campaign.threshold_auto_close) else campaign.threshold_auto_close end as threshold_auto_close
from public.campaign campaign
left join public.campaign_draft draft on draft.campaign_id = campaign.id
where public.is_admin();
revoke all on table public.admin_campaign_list from public, anon;
grant select on table public.admin_campaign_list to authenticated, service_role;

drop function public.join_campaign_by_slug(text);
create function public.join_campaign_by_slug(p_slug text)
returns table (
  id uuid, slug text, title text, unit_price numeric, threshold integer,
  status text, deadline timestamptz, announcement text, images jsonb, items jsonb,
  opened_at timestamptz, created_at timestamptz, updated_at timestamptz,
  arrival_label text, auto_close_at timestamptz, threshold_auto_close boolean
)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  insert into public.campaign_access (campaign_id, user_id)
  select campaign.id, auth.uid()
  from public.campaign campaign
  join public.community_member member
    on member.community_id = campaign.community_id and member.user_id = auth.uid()
  where campaign.slug = p_slug and campaign.opened_at is not null
  on conflict do nothing;

  return query
  select campaign.id, campaign.slug, campaign.title, campaign.unit_price, campaign.threshold,
    campaign.status, campaign.deadline, campaign.announcement, campaign.images, campaign.items,
    campaign.opened_at, campaign.created_at, campaign.updated_at,
    campaign.arrival_label, campaign.auto_close_at, campaign.threshold_auto_close
  from public.campaign campaign
  join public.campaign_access access
    on access.campaign_id = campaign.id and access.user_id = auth.uid()
  join public.community_member member
    on member.community_id = campaign.community_id and member.user_id = auth.uid()
  where campaign.slug = p_slug and campaign.opened_at is not null;
end;
$$;
revoke all on function public.join_campaign_by_slug(text) from public, anon;
grant execute on function public.join_campaign_by_slug(text) to authenticated, service_role;

drop function public.list_resident_campaigns();
create function public.list_resident_campaigns()
returns table (
  slug text, title text, unit_price numeric, threshold integer, status text, opened_at timestamptz,
  total_quantity bigint, threshold_kind text, amount_threshold numeric, quantity_unit text,
  total_amount numeric, allow_custom_items boolean, images jsonb,
  arrival_label text, auto_close_at timestamptz, threshold_auto_close boolean
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select campaign.slug, campaign.title, round(campaign.unit_price * campaign.base_discount_rate, 0),
    campaign.threshold, campaign.status, campaign.opened_at,
    coalesce(sum(order_item.qty), 0)::bigint, campaign.threshold_kind, campaign.amount_threshold,
    campaign.quantity_unit, coalesce(sum(order_item.qty * order_item.final_unit_price), 0)::numeric,
    campaign.allow_custom_items, campaign.images, campaign.arrival_label, campaign.auto_close_at,
    campaign.threshold_auto_close
  from public.community_member member
  join public.campaign campaign on campaign.community_id = member.community_id
  left join public.order_item order_item on order_item.campaign_id = campaign.id
  where member.user_id = auth.uid() and campaign.opened_at is not null
  group by campaign.id, campaign.slug, campaign.title, campaign.unit_price, campaign.threshold,
    campaign.status, campaign.opened_at, campaign.threshold_kind, campaign.amount_threshold,
    campaign.quantity_unit, campaign.allow_custom_items, campaign.images,
    campaign.arrival_label, campaign.auto_close_at
  order by campaign.opened_at desc;
$$;
revoke all on function public.list_resident_campaigns() from public, anon;
grant execute on function public.list_resident_campaigns() to authenticated, service_role;

drop function public.list_admin_campaign_cards();
create function public.list_admin_campaign_cards()
returns table (
  id uuid, slug text, title text, status text, opened_at timestamptz,
  created_at timestamptz, updated_at timestamptz, images jsonb, quantity_unit text,
  order_count bigint, total_quantity bigint, total_amount numeric, paid_order_count bigint,
  threshold_kind text, threshold integer, amount_threshold numeric,
  arrival_label text, auto_close_at timestamptz, threshold_auto_close boolean
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'admin required' using errcode = '42501'; end if;
  return query
  select campaign.id, campaign.slug, coalesce(draft.title, campaign.title), campaign.status,
    campaign.opened_at, campaign.created_at,
    greatest(campaign.updated_at, coalesce(draft.updated_at, campaign.updated_at)),
    case when campaign.opened_at is null then coalesce(draft.images, campaign.images) else campaign.images end,
    case when campaign.opened_at is null then coalesce(draft.quantity_unit, campaign.quantity_unit, '個') else coalesce(campaign.quantity_unit, '個') end,
    order_summary.order_count, item_summary.total_quantity, item_summary.total_amount,
    order_summary.paid_order_count,
    case when campaign.opened_at is null then coalesce(draft.threshold_kind, campaign.threshold_kind) else campaign.threshold_kind end,
    case when campaign.opened_at is null then coalesce(draft.threshold, campaign.threshold) else campaign.threshold end,
    case when campaign.opened_at is null then draft.amount_threshold else campaign.amount_threshold end,
    case when campaign.opened_at is null then coalesce(draft.arrival_label, campaign.arrival_label) else campaign.arrival_label end,
    case when campaign.opened_at is null then draft.auto_close_at else campaign.auto_close_at end,
    case when campaign.opened_at is null then coalesce(draft.threshold_auto_close, campaign.threshold_auto_close) else campaign.threshold_auto_close end
  from public.campaign campaign
  left join public.campaign_draft draft on draft.campaign_id = campaign.id
  cross join lateral (
    select count(*)::bigint as order_count,
      count(*) filter (where coalesce(payment.paid, false))::bigint as paid_order_count
    from public.orders orders left join public.payment payment on payment.order_id = orders.id
    where orders.campaign_id = campaign.id
  ) order_summary
  cross join lateral (
    select coalesce(sum(order_item.qty), 0)::bigint as total_quantity,
      coalesce(sum(order_item.qty * order_item.final_unit_price), 0)::numeric as total_amount
    from public.order_item order_item where order_item.campaign_id = campaign.id
  ) item_summary
  order by greatest(campaign.updated_at, coalesce(draft.updated_at, campaign.updated_at)) desc;
end;
$$;
revoke all on function public.list_admin_campaign_cards() from public, anon;
grant execute on function public.list_admin_campaign_cards() to authenticated, service_role;

revoke all on function public.publish_campaign_draft(uuid), public.set_campaign_status(uuid, text),
  public.submit_customer_order(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.publish_campaign_draft(uuid), public.set_campaign_status(uuid, text),
  public.submit_customer_order(uuid, jsonb, jsonb) to authenticated, service_role;
revoke all on function public.queue_campaign_auto_close_notification() from public, anon, authenticated;
commit;
