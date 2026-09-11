-- Expose the first-party published image gallery to the resident campaign list.
-- The client renders only the first image as the card cover.

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
  total_amount numeric,
  allow_custom_items boolean,
  images jsonb
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
         coalesce(sum(order_item.qty * campaign_item.unit_price), 0)::numeric as total_amount,
         campaign.allow_custom_items, campaign.images
  from public.community_member member
  join public.campaign campaign on campaign.community_id = member.community_id
  left join public.order_item order_item on order_item.campaign_id = campaign.id
  left join public.campaign_item campaign_item on campaign_item.id = order_item.campaign_item_id
  where member.user_id = auth.uid()
    and campaign.opened_at is not null
  group by campaign.id, campaign.slug, campaign.title, campaign.unit_price,
           campaign.threshold, campaign.status, campaign.opened_at,
           campaign.threshold_kind, campaign.amount_threshold, campaign.quantity_unit,
           campaign.allow_custom_items, campaign.images
  order by campaign.opened_at desc;
$$;

revoke all on function public.list_resident_campaigns() from public, anon;
grant execute on function public.list_resident_campaigns() to authenticated, service_role;
