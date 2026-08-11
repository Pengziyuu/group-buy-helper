-- The application tracks paid/unpaid only. Payment arrangements happen in person
-- and must not be inferred or stored by the system.

revoke all on function public.set_order_fulfillment(uuid, boolean, text, text)
  from public, anon, authenticated, service_role;
drop function public.set_order_fulfillment(uuid, boolean, text, text);

drop view public.organizer_order_status;
alter table public.payment drop column method;

create or replace function public.set_order_fulfillment(
  p_order_id uuid,
  p_paid boolean,
  p_pickup_status text
)
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
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin permission required' using errcode = '42501';
  end if;
  if p_pickup_status not in ('pending', 'ready', 'picked_up') then
    raise exception 'invalid pickup status' using errcode = '22023';
  end if;

  select o.campaign_id,
         coalesce(sum(oi.qty), 0) * c.unit_price
  into v_campaign_id, v_amount
  from public.orders o
  join public.campaign c on c.id = o.campaign_id
  left join public.order_item oi on oi.order_id = o.id
  where o.id = p_order_id
  group by o.campaign_id, c.unit_price;

  if v_campaign_id is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  select paid_at into v_paid_at
  from public.payment
  where order_id = p_order_id;

  if p_paid and v_paid_at is null then
    v_paid_at := now();
  elsif not p_paid then
    v_paid_at := null;
  end if;

  insert into public.payment (order_id, amount, paid, paid_at)
  values (p_order_id, v_amount, p_paid, v_paid_at)
  on conflict (order_id) do update
    set amount = excluded.amount,
        paid = excluded.paid,
        paid_at = excluded.paid_at;

  update public.orders
  set pickup_status = p_pickup_status
  where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'campaign_id', v_campaign_id,
    'amount', v_amount,
    'paid', p_paid,
    'paid_at', v_paid_at,
    'pickup_status', p_pickup_status
  );
end;
$$;

create view public.organizer_order_status
with (security_invoker = true)
as
select
  o.id as order_id,
  o.campaign_id,
  o.pickup_status,
  coalesce(p.paid, false) as paid,
  p.paid_at,
  p.amount
from public.orders o
left join public.payment p on p.order_id = o.id
where public.is_admin();

revoke all on table public.organizer_order_status from anon, authenticated;
grant select on table public.organizer_order_status to authenticated;

revoke all on function public.set_order_fulfillment(uuid, boolean, text)
  from public, anon;
grant execute on function public.set_order_fulfillment(uuid, boolean, text)
  to authenticated, service_role;
