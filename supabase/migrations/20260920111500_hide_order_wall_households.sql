-- Keep household information out of the resident-facing order wall.
-- The signed-in resident still receives their own period/unit through
-- get_customer_self(); order_wall is only the shared, visible order feed.
create or replace view public.order_wall with (security_invoker = true) as
select c.slug as campaign_slug,
  customer_order.campaign_id,
  customer_order.id as order_id,
  customer_order.customer_id,
  cu.name as customer_name,
  cu.picture_url,
  null::integer as period,
  null::text as unit,
  customer_order.note,
  customer_order.custom_items,
  customer_order.created_at as ordered_at,
  customer_order.updated_at as order_updated_at,
  ci.id as campaign_item_id,
  ci.code as item_code,
  ci.name as item_name,
  ci.sort_order,
  ci.active as item_active,
  oi.qty,
  oi.list_unit_price,
  oi.discount_rate,
  oi.final_unit_price,
  oi.discount_type,
  oi.promotion_name,
  oi.updated_at as item_updated_at,
  cu.household_kind
from public.orders customer_order
join public.campaign c on c.id = customer_order.campaign_id
join public.customer cu on cu.id = customer_order.customer_id
left join public.order_item oi on oi.order_id = customer_order.id
left join public.campaign_item ci on ci.id = oi.campaign_item_id;

revoke all on table public.order_wall from public, anon, authenticated;
grant select on table public.order_wall to authenticated;
