-- Residents see their own orders across campaigns, how many households ordered, and when a
-- campaign actually closed. Additive for the previous frontend: it ignores the new columns and
-- never calls list_my_orders().

-- 1. When each campaign actually closed.
alter table public.campaign add column closed_at timestamptz;

-- Backfill only times that can be trusted; a campaign closed by hand before this column existed
-- stays empty and keeps its old wording. Triggers are off so the backfill neither bumps
-- updated_at (which orders the organizer list) nor reruns publication checks on old rows.
alter table public.campaign disable trigger user;
update public.campaign campaign
set closed_at = coalesce(
  (select max(notification.created_at)
   from public.campaign_auto_close_notification notification
   where notification.campaign_id = campaign.id),
  case when campaign.auto_close_at <= now() then campaign.auto_close_at end
)
where campaign.status <> 'open' and campaign.opened_at is not null;
alter table public.campaign enable trigger user;

-- Every way a campaign closes (by hand, on schedule, at the threshold) changes its status, so the
-- time is recorded here rather than in each of those paths. Reopening clears it.
create function public.record_campaign_closed_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'open' then
    new.closed_at := null;
  elsif tg_op = 'UPDATE' and old.status = 'open' then
    new.closed_at := now();
  elsif tg_op = 'UPDATE' then
    new.closed_at := old.closed_at;
  else
    new.closed_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.record_campaign_closed_at() from public, anon, authenticated;

create trigger record_campaign_closed_at
before insert or update on public.campaign
for each row execute function public.record_campaign_closed_at();

-- Residents read campaign pages through this view; closed_at is appended at the end.
create or replace view public.campaign_public with (security_invoker = true) as
select id, slug, title, unit_price, threshold, status, deadline, announcement, images, items,
  opened_at, created_at, updated_at, threshold_kind, amount_threshold, quantity_unit, allow_custom_items,
  base_discount_rate, mix_match_name, mix_match_min_quantity, mix_match_discount_rate,
  arrival_label, auto_close_at, threshold_auto_close, closed_at
from public.campaign;
revoke all on table public.campaign_public from public, anon, authenticated;
grant select on table public.campaign_public to authenticated;

-- 2. The resident list adds the signed-in household's own formal and custom quantities (kept apart,
-- as custom items never count toward the threshold), how many households ordered, and the closing
-- time. An order counts once it holds a formal item or a custom item; an emptied order does not.
drop function public.list_resident_campaigns();
create function public.list_resident_campaigns()
returns table (
  slug text, title text, unit_price numeric, threshold integer, status text, opened_at timestamptz,
  total_quantity bigint, threshold_kind text, amount_threshold numeric, quantity_unit text,
  total_amount numeric, allow_custom_items boolean, images jsonb,
  arrival_label text, auto_close_at timestamptz, threshold_auto_close boolean,
  my_quantity bigint, my_custom_quantity bigint, order_household_count bigint, closed_at timestamptz
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with me as (
    select customer.id from public.customer customer where customer.auth_user_id = auth.uid()
  ),
  order_totals as (
    select orders.campaign_id, orders.customer_id,
      coalesce(sum(order_item.qty), 0)::bigint as quantity,
      coalesce(sum(order_item.qty * order_item.final_unit_price), 0)::numeric as amount,
      (select coalesce(sum((entry ->> 'quantity')::integer), 0)
       from jsonb_array_elements(orders.custom_items) entry)::bigint as custom_quantity,
      coalesce(sum(order_item.qty), 0) > 0 or jsonb_array_length(orders.custom_items) > 0 as has_content
    from public.orders orders
    left join public.order_item order_item on order_item.order_id = orders.id
    group by orders.id, orders.campaign_id, orders.customer_id, orders.custom_items
  )
  select campaign.slug, campaign.title, round(campaign.unit_price * campaign.base_discount_rate, 0),
    campaign.threshold, campaign.status, campaign.opened_at,
    coalesce(sum(order_totals.quantity), 0)::bigint, campaign.threshold_kind, campaign.amount_threshold,
    campaign.quantity_unit, coalesce(sum(order_totals.amount), 0)::numeric,
    campaign.allow_custom_items, campaign.images, campaign.arrival_label, campaign.auto_close_at,
    campaign.threshold_auto_close,
    coalesce(sum(order_totals.quantity) filter (where order_totals.customer_id in (select id from me)), 0)::bigint,
    coalesce(sum(order_totals.custom_quantity) filter (where order_totals.customer_id in (select id from me)), 0)::bigint,
    count(*) filter (where order_totals.has_content)::bigint,
    campaign.closed_at
  from public.community_member member
  join public.campaign campaign on campaign.community_id = member.community_id
  left join order_totals on order_totals.campaign_id = campaign.id
  where member.user_id = auth.uid() and campaign.opened_at is not null
  group by campaign.id
  order by campaign.opened_at desc;
$$;
revoke all on function public.list_resident_campaigns() from public, anon;
grant execute on function public.list_resident_campaigns() to authenticated, service_role;

-- 3. The signed-in household's own orders, one row per campaign, open campaigns first and then the
-- newest order first. Only campaigns the resident's community can see, and only orders with
-- something in them.
create function public.list_my_orders()
returns table (
  campaign_slug text, title text, status text, opened_at timestamptz, images jsonb,
  quantity_unit text, arrival_label text, auto_close_at timestamptz, threshold_kind text,
  threshold_auto_close boolean, closed_at timestamptz, ordered_at timestamptz, items jsonb, custom_items jsonb
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select campaign.slug, campaign.title, campaign.status, campaign.opened_at, campaign.images,
    campaign.quantity_unit, campaign.arrival_label, campaign.auto_close_at, campaign.threshold_kind,
    campaign.threshold_auto_close, campaign.closed_at, orders.created_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
          'name', campaign_item.name,
          'quantity', order_item.qty,
          'unitPrice', order_item.final_unit_price
        ) order by campaign_item.sort_order, campaign_item.code)
      from public.order_item order_item
      join public.campaign_item campaign_item on campaign_item.id = order_item.campaign_item_id
      where order_item.order_id = orders.id and order_item.qty > 0
    ), '[]'::jsonb),
    orders.custom_items
  from public.customer customer
  join public.orders orders on orders.customer_id = customer.id
  join public.campaign campaign on campaign.id = orders.campaign_id
  join public.community_member member
    on member.community_id = campaign.community_id and member.user_id = auth.uid()
  where customer.auth_user_id = auth.uid()
    and campaign.opened_at is not null
    and (jsonb_array_length(orders.custom_items) > 0
      or exists (select 1 from public.order_item order_item where order_item.order_id = orders.id and order_item.qty > 0))
  order by campaign.status = 'open' desc, orders.created_at desc;
$$;
revoke all on function public.list_my_orders() from public, anon;
grant execute on function public.list_my_orders() to authenticated, service_role;

-- 4. The organizer list shows the closing date of closed campaigns.
drop function public.list_admin_campaign_cards();
create function public.list_admin_campaign_cards()
returns table (
  id uuid, slug text, title text, status text, opened_at timestamptz,
  created_at timestamptz, updated_at timestamptz, images jsonb, quantity_unit text,
  order_count bigint, total_quantity bigint, total_amount numeric, paid_order_count bigint,
  threshold_kind text, threshold integer, amount_threshold numeric,
  arrival_label text, auto_close_at timestamptz, threshold_auto_close boolean, closed_at timestamptz
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
    case when campaign.opened_at is null then coalesce(draft.threshold_auto_close, campaign.threshold_auto_close) else campaign.threshold_auto_close end,
    campaign.closed_at
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
