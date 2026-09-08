-- Replace per-order pickup tracking with organizer-only notes.
-- Campaign arrival and LINE pickup notifications remain unchanged.

drop view public.organizer_order_status;

revoke all on function public.set_order_fulfillment(uuid, boolean, text)
  from public, anon, authenticated, service_role;
drop function public.set_order_fulfillment(uuid, boolean, text);

alter table public.orders
  drop column pickup_status;

create table public.organizer_order_note (
  order_id uuid primary key references public.orders(id) on delete cascade,
  note text not null default '' check (length(note) <= 500),
  updated_at timestamptz not null default now()
);

create trigger organizer_order_note_set_updated_at
before update on public.organizer_order_note
for each row execute function public.set_updated_at();

alter table public.organizer_order_note enable row level security;

create policy organizer_order_note_admin_select
on public.organizer_order_note
for select
to authenticated
using (public.is_admin());

create policy organizer_order_note_admin_insert
on public.organizer_order_note
for insert
to authenticated
with check (public.is_admin());

create policy organizer_order_note_admin_update
on public.organizer_order_note
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on table public.organizer_order_note from public, anon, authenticated;
grant select on table public.organizer_order_note to authenticated;
grant all on table public.organizer_order_note to service_role;

create function public.set_order_paid(
  p_order_id uuid,
  p_paid boolean
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

  -- Resident order mutations lock campaign before order. Match that order so a
  -- payment snapshot cannot deadlock with, or race ahead of, item replacement.
  select campaign.id into v_campaign_id
  from public.campaign campaign
  join public.orders customer_order on customer_order.campaign_id = campaign.id
  where customer_order.id = p_order_id
  for update of campaign;

  if v_campaign_id is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  perform 1
  from public.orders customer_order
  where customer_order.id = p_order_id
    and customer_order.campaign_id = v_campaign_id
  for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  select coalesce(sum(order_item.qty * campaign_item.unit_price), 0)
  into v_amount
  from public.order_item order_item
  join public.campaign_item campaign_item on campaign_item.id = order_item.campaign_item_id
  where order_item.order_id = p_order_id;

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

  return jsonb_build_object(
    'order_id', p_order_id,
    'campaign_id', v_campaign_id,
    'amount', v_amount,
    'paid', p_paid,
    'paid_at', v_paid_at
  );
end;
$$;

revoke all on function public.set_order_paid(uuid, boolean)
  from public, anon, service_role;
grant execute on function public.set_order_paid(uuid, boolean)
  to authenticated;

create function public.set_order_organizer_note(
  p_order_id uuid,
  p_organizer_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_organizer_note text := coalesce(p_organizer_note, '');
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin permission required' using errcode = '42501';
  end if;
  if length(coalesce(p_organizer_note, '')) > 500 then
    raise exception 'organizer note exceeds 500 characters' using errcode = '22023';
  end if;

  perform 1
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  insert into public.organizer_order_note (order_id, note)
  values (p_order_id, v_organizer_note)
  on conflict (order_id) do update
    set note = excluded.note;

  return jsonb_build_object(
    'order_id', p_order_id,
    'organizer_note', v_organizer_note
  );
end;
$$;

revoke all on function public.set_order_organizer_note(uuid, text)
  from public, anon, service_role;
grant execute on function public.set_order_organizer_note(uuid, text)
  to authenticated;

create view public.organizer_order_status
with (security_invoker = true)
as
select
  o.id as order_id,
  o.campaign_id,
  coalesce(p.paid, false) as paid,
  p.paid_at,
  p.amount,
  coalesce(n.note, '') as organizer_note
from public.orders o
left join public.payment p on p.order_id = o.id
left join public.organizer_order_note n on n.order_id = o.id
where public.is_admin();

revoke all on table public.organizer_order_status from anon, authenticated;
grant select on table public.organizer_order_status to authenticated;
