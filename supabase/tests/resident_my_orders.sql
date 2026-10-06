-- Run only against the local Supabase database: docker exec -i
-- supabase_db_group-buy-helper psql -v ON_ERROR_STOP=1 -U postgres -d postgres
-- < supabase/tests/resident_my_orders.sql
begin;
insert into auth.users (id) values
  ('a0000000-0000-4000-8000-000000000011'),
  ('a0000000-0000-4000-8000-000000000012'),
  ('a0000000-0000-4000-8000-000000000013'),
  ('a0000000-0000-4000-8000-000000000014');
-- 11 orders formal items, 12 only a custom item, 13 is a member with no household, 14 is the organizer.
update public.customer set auth_user_id = 'a0000000-0000-4000-8000-000000000011'
where id = '30000000-0000-4000-8000-000000000001';
update public.customer set auth_user_id = 'a0000000-0000-4000-8000-000000000012'
where id = '30000000-0000-4000-8000-000000000003';
insert into public.community_member (community_id, user_id)
select '00000000-0000-4000-8000-000000000001', id from auth.users
where id in ('a0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000012',
             'a0000000-0000-4000-8000-000000000013');
insert into public.campaign_access (campaign_id, user_id)
values ('10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000011');
insert into public.admin_users (user_id) values ('a0000000-0000-4000-8000-000000000014');

-- 3H15 keeps only a custom item; 3E9 is emptied back to nothing and must not count as ordering.
delete from public.order_item where order_id in ('40000000-0000-4000-8000-000000000003',
                                                 '40000000-0000-4000-8000-000000000006');
update public.orders set custom_items = '[{"id":"cake","name":"限定蛋糕","quantity":2}]'::jsonb
where id = '40000000-0000-4000-8000-000000000003';
update public.orders set custom_items = '[]'::jsonb
where id = '40000000-0000-4000-8000-000000000006';

create temporary table expected_count on commit drop as
select count(*)::bigint as households from public.orders orders
where orders.campaign_id = '10000000-0000-4000-8000-000000000001'
  and (jsonb_array_length(orders.custom_items) > 0
    or exists (select 1 from public.order_item item where item.order_id = orders.id and item.qty > 0));
grant select on expected_count to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000011', true);
do $$
declare
  v_row record;
  v_order record;
  v_count integer;
begin
  select * into v_row from public.list_resident_campaigns()
  where slug = '0123456789abcdef0123456789abcdef0123';
  if v_row.my_quantity <> 6 or not v_row.my_has_order then
    raise exception 'own quantity wrong: % %', v_row.my_quantity, v_row.my_has_order;
  end if;
  if v_row.order_household_count <> (select households from expected_count) then
    raise exception 'household count % should skip the emptied order', v_row.order_household_count;
  end if;
  if v_row.closed_at is not null then raise exception 'open campaign has a closing time'; end if;

  select count(*) into v_count from public.list_my_orders();
  if v_count <> 1 then raise exception 'expected only my own order, got %', v_count; end if;
  select * into v_order from public.list_my_orders();
  if v_order.items <> '[{"name":"花生（招牌）","quantity":2,"unitPrice":45},{"name":"草莓","quantity":2,"unitPrice":45},{"name":"可可","quantity":2,"unitPrice":45}]'::jsonb then
    raise exception 'my order items wrong: %', v_order.items;
  end if;
  if v_order.title <> '一涼製冰所 超厚三明治冰餅' or v_order.status <> 'open' then
    raise exception 'my order campaign wrong';
  end if;
  perform closed_at from public.campaign_public limit 1;
end;
$$;

select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000012', true);
do $$
declare
  v_row record;
  v_order record;
begin
  select * into v_row from public.list_resident_campaigns()
  where slug = '0123456789abcdef0123456789abcdef0123';
  if v_row.my_quantity <> 0 or not v_row.my_has_order then
    raise exception 'custom-only order should count as ordered with no quantity';
  end if;
  select * into v_order from public.list_my_orders();
  if v_order.items <> '[]'::jsonb or jsonb_array_length(v_order.custom_items) <> 1 then
    raise exception 'custom-only order wrong: % %', v_order.items, v_order.custom_items;
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000013', true);
do $$
declare v_row record;
begin
  if exists (select 1 from public.list_my_orders()) then
    raise exception 'resident without a household got orders';
  end if;
  select * into v_row from public.list_resident_campaigns()
  where slug = '0123456789abcdef0123456789abcdef0123';
  if v_row.my_quantity <> 0 or v_row.my_has_order then raise exception 'unbound resident marked as ordered'; end if;
end;
$$;
reset role;

set local role anon;
do $$
begin
  perform public.list_my_orders();
  raise exception 'anon reached list_my_orders';
exception when insufficient_privilege then null;
end;
$$;
reset role;

-- Closing by hand records the time, a later status keeps it, a direct edit cannot change it,
-- and reopening clears it.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000014', true);
select public.set_campaign_status('10000000-0000-4000-8000-000000000001', 'closed');
reset role;
do $$
declare v_closed timestamptz;
begin
  select closed_at into v_closed from public.campaign where id = '10000000-0000-4000-8000-000000000001';
  if v_closed is null then raise exception 'manual close did not record closed_at'; end if;
  update public.campaign set closed_at = '2000-01-01T00:00:00Z' where id = '10000000-0000-4000-8000-000000000001';
  update public.campaign set status = 'arrived' where id = '10000000-0000-4000-8000-000000000001';
  if (select closed_at from public.campaign where id = '10000000-0000-4000-8000-000000000001') <> v_closed then
    raise exception 'closed_at changed after closing';
  end if;
  update public.campaign set status = 'open' where id = '10000000-0000-4000-8000-000000000001';
  if (select closed_at from public.campaign where id = '10000000-0000-4000-8000-000000000001') is not null then
    raise exception 'reopening kept closed_at';
  end if;
end;
$$;

-- The scheduled close records the time too.
alter table public.campaign disable trigger enforce_campaign_auto_close;
update public.campaign set auto_close_at = date_trunc('minute', now()) - interval '1 minute'
where id = '10000000-0000-4000-8000-000000000001';
alter table public.campaign enable trigger enforce_campaign_auto_close;
do $$
begin
  perform public.close_due_campaigns();
  if (select closed_at from public.campaign where id = '10000000-0000-4000-8000-000000000001') is null then
    raise exception 'scheduled close did not record closed_at';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000014', true);
do $$
begin
  if not exists (select 1 from public.list_admin_campaign_cards()
                 where id = '10000000-0000-4000-8000-000000000001' and closed_at is not null) then
    raise exception 'organizer list lost closed_at';
  end if;
end;
$$;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000011', true);
do $$
begin
  if not exists (select 1 from public.list_my_orders() where status = 'closed' and closed_at is not null) then
    raise exception 'my orders lost closed_at';
  end if;
  if not exists (select 1 from public.campaign_public
                 where id = '10000000-0000-4000-8000-000000000001' and closed_at is not null) then
    raise exception 'resident campaign page cannot read closed_at';
  end if;
end;
$$;
reset role;
rollback;
