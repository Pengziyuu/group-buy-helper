-- Organizers can cancel a resident order outright while the campaign is still open.
-- Residents gain no delete authority here: they still cannot submit an empty order and
-- public.orders stays revoked from them, so cancelling is only reachable through this RPC.
-- order_item, payment and organizer_order_status all reference public.orders with
-- "on delete cascade", so deleting the order row removes the whole order in one statement.

create or replace function public.cancel_customer_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'admin permission required' using errcode = '42501'; end if;
  select campaign.id into v_campaign_id from public.campaign campaign
  join public.orders customer_order on customer_order.campaign_id = campaign.id
  where customer_order.id = p_order_id for update of campaign;
  if v_campaign_id is null then raise exception 'order not found' using errcode = 'P0002'; end if;
  perform 1 from public.orders customer_order
  where customer_order.id = p_order_id and customer_order.campaign_id = v_campaign_id for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  if not public.campaign_is_editable(v_campaign_id) then raise exception '本團已結單，不能取消訂單' using errcode = '23514'; end if;

  delete from public.orders where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'campaign_id', v_campaign_id);
end;
$$;

revoke all on function public.cancel_customer_order(uuid)
  from public, anon, service_role;
grant execute on function public.cancel_customer_order(uuid)
  to authenticated;
