-- Provide organizer campaign cards with one authoritative, admin-only summary query.
-- Order amounts use the persisted final_unit_price snapshot; resident-facing APIs are unchanged.

create or replace function public.list_admin_campaign_cards()
returns table (
  id uuid,
  slug text,
  title text,
  status text,
  opened_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  images jsonb,
  quantity_unit text,
  order_count bigint,
  total_quantity bigint,
  total_amount numeric,
  paid_order_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'admin required' using errcode = '42501';
  end if;

  return query
  select campaign.id,
         campaign.slug,
         coalesce(draft.title, campaign.title) as title,
         campaign.status,
         campaign.opened_at,
         campaign.created_at,
         greatest(campaign.updated_at, coalesce(draft.updated_at, campaign.updated_at)) as updated_at,
         case when campaign.opened_at is null
           then coalesce(draft.images, campaign.images)
           else campaign.images
         end as images,
         case when campaign.opened_at is null
           then coalesce(draft.quantity_unit, campaign.quantity_unit, '個')
           else coalesce(campaign.quantity_unit, '個')
         end as quantity_unit,
         order_summary.order_count,
         item_summary.total_quantity,
         item_summary.total_amount,
         order_summary.paid_order_count
  from public.campaign campaign
  left join public.campaign_draft draft on draft.campaign_id = campaign.id
  cross join lateral (
    select count(*)::bigint as order_count,
           count(*) filter (where coalesce(payment.paid, false))::bigint as paid_order_count
    from public.orders orders
    left join public.payment payment on payment.order_id = orders.id
    where orders.campaign_id = campaign.id
  ) order_summary
  cross join lateral (
    select coalesce(sum(order_item.qty), 0)::bigint as total_quantity,
           coalesce(sum(order_item.qty * order_item.final_unit_price), 0)::numeric as total_amount
    from public.order_item order_item
    where order_item.campaign_id = campaign.id
  ) item_summary
  order by greatest(campaign.updated_at, coalesce(draft.updated_at, campaign.updated_at)) desc;
end;
$$;

revoke all on function public.list_admin_campaign_cards() from public, anon;
grant execute on function public.list_admin_campaign_cards() to authenticated, service_role;
