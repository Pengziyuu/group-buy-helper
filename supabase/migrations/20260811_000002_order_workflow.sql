-- Organizer-controlled campaign lifecycle and order fulfillment.
-- All mutations are atomic RPCs that recheck admin membership server-side.

alter table public.orders
  add column if not exists pickup_status text not null default 'pending';

alter table public.orders
  drop constraint if exists orders_pickup_status_check;
alter table public.orders
  add constraint orders_pickup_status_check
  check (pickup_status in ('pending', 'ready', 'picked_up'));

alter table public.payment
  drop constraint if exists payment_method_check;
alter table public.payment
  add constraint payment_method_check
  check (method is null or method in ('cash', 'transfer', 'LINE Pay'));

alter table public.payment
  drop constraint if exists payment_method_paid_consistency;
alter table public.payment
  add constraint payment_method_paid_consistency
  check ((paid and method is not null) or (not paid and method is null));

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
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin permission required' using errcode = '42501';
  end if;
  if p_status not in ('open', 'closed', 'arrived') then
    raise exception 'invalid campaign status' using errcode = '22023';
  end if;

  update public.campaign
  set status = p_status
  where id = p_campaign_id
  returning * into v_campaign;

  if v_campaign.id is null then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;
  return v_campaign;
end;
$$;

create or replace function public.set_order_fulfillment(
  p_order_id uuid,
  p_paid boolean,
  p_payment_method text,
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
  if p_paid and p_payment_method not in ('cash', 'transfer', 'LINE Pay') then
    raise exception 'paid order requires a valid payment method' using errcode = '22023';
  end if;
  if not p_paid and p_payment_method is not null then
    raise exception 'unpaid order cannot have a payment method' using errcode = '22023';
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

  insert into public.payment (order_id, amount, paid, paid_at, method)
  values (p_order_id, v_amount, p_paid, v_paid_at, p_payment_method)
  on conflict (order_id) do update
    set amount = excluded.amount,
        paid = excluded.paid,
        paid_at = excluded.paid_at,
        method = excluded.method;

  update public.orders
  set pickup_status = p_pickup_status
  where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'campaign_id', v_campaign_id,
    'amount', v_amount,
    'paid', p_paid,
    'paid_at', v_paid_at,
    'payment_method', p_payment_method,
    'pickup_status', p_pickup_status
  );
end;
$$;

create or replace view public.organizer_order_status
with (security_invoker = true)
as
select
  o.id as order_id,
  o.campaign_id,
  o.pickup_status,
  coalesce(p.paid, false) as paid,
  p.paid_at,
  p.method as payment_method,
  p.amount
from public.orders o
left join public.payment p on p.order_id = o.id
where public.is_admin();

revoke all on table public.organizer_order_status from anon, authenticated;
grant select on table public.organizer_order_status to authenticated;

-- Clients may read payment status through owner RLS, but all writes now go through
-- the organizer-only RPC so payment and pickup stay consistent.
revoke insert, update, delete on table public.payment from authenticated;

revoke all on function public.set_campaign_status(uuid, text) from public, anon;
revoke all on function public.set_order_fulfillment(uuid, boolean, text, text) from public, anon;
grant execute on function public.set_campaign_status(uuid, text) to authenticated;
grant execute on function public.set_order_fulfillment(uuid, boolean, text, text) to authenticated;
grant execute on function public.set_campaign_status(uuid, text) to service_role;
grant execute on function public.set_order_fulfillment(uuid, boolean, text, text) to service_role;
