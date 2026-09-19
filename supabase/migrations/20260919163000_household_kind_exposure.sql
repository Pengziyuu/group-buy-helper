-- Expose household_kind to the frontend: the order wall and the organizer
-- resident list both need it so the UI can tell a resident from someone
-- outside the community without guessing from a null period.
--
-- order_wall: household_kind is appended as the LAST column, after
-- oi.updated_at as item_updated_at, rather than next to cu.period, cu.unit
-- where it conceptually belongs. `create or replace view` allows appending
-- columns but refuses to reorder or rename existing ones ("cannot change
-- name of view column"), and only `create or replace` preserves the view's
-- existing grants and its `with (security_invoker = true)` setting
-- automatically. Losing security_invoker would let residents bypass RLS and
-- read each other's orders, so this migration never drops the view.
create or replace view public.order_wall with (security_invoker = true) as
select c.slug as campaign_slug, customer_order.campaign_id, customer_order.id as order_id, customer_order.customer_id,
  cu.name as customer_name, cu.picture_url, cu.period, cu.unit, customer_order.note, customer_order.custom_items,
  customer_order.created_at as ordered_at, customer_order.updated_at as order_updated_at,
  ci.id as campaign_item_id, ci.code as item_code, ci.name as item_name, ci.sort_order, ci.active as item_active,
  oi.qty, oi.list_unit_price, oi.discount_rate, oi.final_unit_price, oi.discount_type, oi.promotion_name,
  oi.updated_at as item_updated_at, cu.household_kind
from public.orders customer_order
join public.campaign c on c.id = customer_order.campaign_id
join public.customer cu on cu.id = customer_order.customer_id
left join public.order_item oi on oi.order_id = customer_order.id
left join public.campaign_item ci on ci.id = oi.campaign_item_id;

revoke all on table public.order_wall from anon, authenticated;
grant select on table public.order_wall to authenticated;

-- admin_list_residents() gains a column in the middle of its result row
-- (household_kind, next to period/unit), not at the end, so CREATE OR
-- REPLACE FUNCTION refuses it: "cannot change return type of existing
-- function" — the same rule 20260919161000_household_kind_binding.sql ran
-- into with bind_customer_self. Nothing else in the schema selects from
-- this function, so dropping and recreating it is safe as long as its
-- grants are reapplied below, which they are.
drop function public.admin_list_residents();

create function public.admin_list_residents()
returns table (
  member_code text,
  display_name text,
  picture_url text,
  period integer,
  unit text,
  household_kind text,
  joined_at timestamptz,
  blocked boolean,
  blocked_at timestamptz
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
  select
    m.member_code,
    i.display_name,
    i.picture_url,
    c.period,
    c.unit,
    c.household_kind,
    m.joined_at,
    false,
    null::timestamptz
  from public.community_member m
  join public.line_resident_identity i on i.auth_user_id = m.user_id
  left join public.customer c on c.auth_user_id = m.user_id
  where m.community_id = '00000000-0000-4000-8000-000000000001'

  union all

  select
    b.member_code,
    i.display_name,
    i.picture_url,
    c.period,
    c.unit,
    c.household_kind,
    b.joined_at,
    true,
    b.blocked_at
  from public.community_resident_block b
  join public.line_resident_identity i on i.line_user_id = b.line_user_id
  left join public.customer c on c.auth_user_id = b.user_id
  where b.community_id = '00000000-0000-4000-8000-000000000001'

  order by 8, 7 desc;
end;
$$;

revoke all on function public.admin_list_residents() from public, anon;
grant execute on function public.admin_list_residents() to authenticated;
