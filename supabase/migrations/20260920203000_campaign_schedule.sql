begin;

alter table public.campaign
  add column arrival_label text not null default '貨到通知',
  add column auto_close_at timestamptz;

alter table public.campaign_draft
  add column arrival_label text not null default '貨到通知',
  add column auto_close_at timestamptz;

alter table public.campaign
  add constraint campaign_arrival_label_valid check (
    arrival_label = btrim(arrival_label)
    and length(arrival_label) between 1 and 100
  ),
  add constraint campaign_auto_close_taipei_noon check (
    auto_close_at is null
    or (auto_close_at at time zone 'Asia/Taipei')::time = time '12:00:00'
  );

alter table public.campaign_draft
  add constraint campaign_draft_arrival_label_valid check (
    arrival_label = btrim(arrival_label)
    and length(arrival_label) between 1 and 100
  ),
  add constraint campaign_draft_auto_close_taipei_noon check (
    auto_close_at is null
    or (auto_close_at at time zone 'Asia/Taipei')::time = time '12:00:00'
  );

create index campaign_open_auto_close_idx
  on public.campaign (auto_close_at)
  where status = 'open' and opened_at is not null and auto_close_at is not null;

-- The old deadline remains only for return-shape compatibility. Historical
-- 30-day defaults are intentionally not copied into the new optional setting.
create or replace function public.campaign_is_editable(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.campaign campaign
    where campaign.id = p_campaign_id
      and campaign.status = 'open'
      and (campaign.auto_close_at is null or campaign.auto_close_at > now())
  );
$$;

create or replace function public.can_edit_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.orders customer_order
    join public.customer customer on customer.id = customer_order.customer_id
    join public.campaign campaign on campaign.id = customer_order.campaign_id
    join public.community_member member
      on member.community_id = campaign.community_id
      and member.user_id = auth.uid()
    where customer_order.id = p_order_id
      and customer.auth_user_id = auth.uid()
      and public.campaign_is_editable(customer_order.campaign_id)
  );
$$;

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

  update public.campaign campaign set items = coalesce((
    select jsonb_agg(jsonb_build_object(
      'code', item.code, 'name', item.name, 'unitPrice', item.unit_price,
      'active', item.active, 'discountEligible', item.discount_eligible
    ) order by item.sort_order, item.code)
    from public.campaign_item item where item.campaign_id = p_campaign_id
  ), '[]'::jsonb),
    opened_at = coalesce(campaign.opened_at, now()),
    status = case when campaign.status = 'open' and (
      (v_draft.threshold_kind = 'quantity' and v_current_quantity = v_draft.threshold)
      or (v_draft.auto_close_at is not null and v_draft.auto_close_at <= now())
    ) then 'closed' else campaign.status end
  where campaign.id = p_campaign_id returning campaign.* into v_campaign;

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

  if p_status = 'open' and v_campaign.threshold_kind = 'quantity' then
    select coalesce(sum(order_item.qty), 0)::bigint into v_current_quantity
    from public.order_item order_item where order_item.campaign_id = p_campaign_id;
    if v_current_quantity >= v_campaign.threshold then
      raise exception '目前訂購量已達成團門檻（% %），不能重新開團', v_current_quantity, v_campaign.quantity_unit using errcode = '23514';
    end if;
  end if;

  update public.campaign set status = p_status where id = p_campaign_id returning * into v_campaign;
  return v_campaign;
end;
$$;

create or replace view public.campaign_public with (security_invoker = true) as
select id, slug, title, unit_price, threshold, status, deadline, announcement, images, items,
  opened_at, created_at, updated_at, threshold_kind, amount_threshold, quantity_unit, allow_custom_items,
  base_discount_rate, mix_match_name, mix_match_min_quantity, mix_match_discount_rate,
  arrival_label, auto_close_at
from public.campaign;

revoke all on table public.campaign_public from public, anon, authenticated;
grant select on table public.campaign_public to authenticated;

drop function public.join_campaign_by_slug(text);
create function public.join_campaign_by_slug(p_slug text)
returns table (
  id uuid, slug text, title text, unit_price numeric, threshold integer,
  status text, deadline timestamptz, announcement text, images jsonb, items jsonb,
  opened_at timestamptz, created_at timestamptz, updated_at timestamptz,
  arrival_label text, auto_close_at timestamptz
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
    campaign.arrival_label, campaign.auto_close_at
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
  arrival_label text, auto_close_at timestamptz
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select campaign.slug, campaign.title, round(campaign.unit_price * campaign.base_discount_rate, 0),
    campaign.threshold, campaign.status, campaign.opened_at,
    coalesce(sum(order_item.qty), 0)::bigint, campaign.threshold_kind, campaign.amount_threshold,
    campaign.quantity_unit, coalesce(sum(order_item.qty * order_item.final_unit_price), 0)::numeric,
    campaign.allow_custom_items, campaign.images, campaign.arrival_label, campaign.auto_close_at
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
  arrival_label text, auto_close_at timestamptz
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
    case when campaign.opened_at is null then draft.auto_close_at else campaign.auto_close_at end
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

create or replace view public.admin_campaign_list with (security_invoker = true) as
select campaign.id, campaign.slug, coalesce(draft.title, campaign.title) as title,
  campaign.status, campaign.opened_at, campaign.created_at,
  greatest(campaign.updated_at, coalesce(draft.updated_at, campaign.updated_at)) as updated_at,
  case when campaign.opened_at is null then coalesce(draft.arrival_label, campaign.arrival_label) else campaign.arrival_label end as arrival_label,
  case when campaign.opened_at is null then draft.auto_close_at else campaign.auto_close_at end as auto_close_at
from public.campaign campaign
left join public.campaign_draft draft on draft.campaign_id = campaign.id
where public.is_admin();

revoke all on table public.admin_campaign_list from public, anon;
grant select on table public.admin_campaign_list to authenticated, service_role;

create or replace function public.close_due_campaigns()
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_closed bigint;
begin
  update public.campaign
  set status = 'closed'
  where status = 'open'
    and opened_at is not null
    and auto_close_at is not null
    and auto_close_at <= clock_timestamp();
  get diagnostics v_closed = row_count;
  return v_closed;
end;
$$;

revoke all on function public.close_due_campaigns() from public, anon, authenticated;
grant execute on function public.close_due_campaigns() to service_role;

revoke all on function public.publish_campaign_draft(uuid) from public, anon;
grant execute on function public.publish_campaign_draft(uuid) to authenticated, service_role;
revoke all on function public.set_campaign_status(uuid, text) from public, anon;
grant execute on function public.set_campaign_status(uuid, text) to authenticated, service_role;

select cron.schedule(
  'auto-close-due-campaigns',
  '* * * * *',
  $cron$select public.close_due_campaigns();$cron$
);

commit;
