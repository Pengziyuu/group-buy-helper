-- The resident list wrote every campaign's price as "$X 起", though most sell every item at one
-- price. It now also returns the dearest item's price, so the list says 起 only when prices differ.
-- Adding a column changes the result type, so the function is dropped and created again.
drop function public.list_resident_campaigns();
create function public.list_resident_campaigns()
returns table (
  slug text, title text, unit_price numeric, threshold integer, status text, opened_at timestamptz,
  total_quantity bigint, threshold_kind text, amount_threshold numeric, quantity_unit text,
  total_amount numeric, allow_custom_items boolean, images jsonb,
  arrival_label text, auto_close_at timestamptz, threshold_auto_close boolean,
  my_quantity bigint, my_custom_quantity bigint, order_household_count bigint, closed_at timestamptz,
  max_unit_price numeric
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
    coalesce(sum(order_totals.quantity + order_totals.custom_quantity), 0)::bigint, campaign.threshold_kind, campaign.amount_threshold,
    campaign.quantity_unit, coalesce(sum(order_totals.amount), 0)::numeric,
    campaign.allow_custom_items, campaign.images, campaign.arrival_label, campaign.auto_close_at,
    campaign.threshold_auto_close,
    coalesce(sum(order_totals.quantity) filter (where order_totals.customer_id in (select id from me)), 0)::bigint,
    coalesce(sum(order_totals.custom_quantity) filter (where order_totals.customer_id in (select id from me)), 0)::bigint,
    count(*) filter (where order_totals.has_content)::bigint,
    campaign.closed_at,
    -- The dearest item for sale, discounted as unit_price is (unit_price is the cheapest).
    round(coalesce((select max(item.unit_price) from public.campaign_item item
                    where item.campaign_id = campaign.id and item.active), campaign.unit_price)
          * campaign.base_discount_rate, 0)
  from public.community_member member
  join public.campaign campaign on campaign.community_id = member.community_id
  left join order_totals on order_totals.campaign_id = campaign.id
  where member.user_id = auth.uid() and campaign.opened_at is not null
  group by campaign.id
  order by campaign.opened_at desc;
$$;
revoke all on function public.list_resident_campaigns() from public, anon;
grant execute on function public.list_resident_campaigns() to authenticated, service_role;
