-- Run only against the local Supabase database: docker exec -i
-- supabase_db_group-buy-helper psql -v ON_ERROR_STOP=1 -U postgres -d postgres
-- < supabase/tests/customer_household_privacy.sql
begin;
insert into auth.users (id) values
  ('a0000000-0000-4000-8000-000000000001'),
  ('a0000000-0000-4000-8000-000000000002'),
  ('a0000000-0000-4000-8000-000000000003');
update public.customer set auth_user_id = 'a0000000-0000-4000-8000-000000000001'
where id = '30000000-0000-4000-8000-000000000001';
update public.customer set auth_user_id = 'a0000000-0000-4000-8000-000000000002'
where id = '30000000-0000-4000-8000-000000000002';
insert into public.community_member (community_id, user_id)
select '00000000-0000-4000-8000-000000000001', id from auth.users
where id in ('a0000000-0000-4000-8000-000000000001',
             'a0000000-0000-4000-8000-000000000002');
insert into public.campaign_access (campaign_id, user_id)
select '10000000-0000-4000-8000-000000000001', id from auth.users
where id in ('a0000000-0000-4000-8000-000000000001',
             'a0000000-0000-4000-8000-000000000002');
insert into public.admin_users (user_id)
values ('a0000000-0000-4000-8000-000000000003');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
do $$
declare v_count integer;
begin
  if has_column_privilege('authenticated', 'public.customer', 'period', 'select')
     or has_column_privilege('authenticated', 'public.customer', 'unit', 'select') then
    raise exception 'direct period/unit column grant remains';
  end if;
  begin
    execute 'select period, unit from public.customer limit 1';
    raise exception 'direct household SELECT unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  select count(*) into v_count from public.get_customer_self()
  where id = '30000000-0000-4000-8000-000000000001' and period = 2 and unit = '2K13';
  if v_count <> 1 then raise exception 'owner private RPC failed'; end if;
  select count(*) into v_count from public.get_customer_self()
  where id = '30000000-0000-4000-8000-000000000002';
  if v_count <> 0 then raise exception 'owner RPC leaked another household'; end if;
  select count(*) into v_count from public.order_wall
  where order_id = '40000000-0000-4000-8000-000000000002'
    and customer_name = '佩怡' and period is null and unit is null;
  if v_count < 1 then raise exception 'resident shared wall failed or leaked'; end if;
  select count(*) into v_count from public.organizer_order_wall;
  if v_count <> 0 then raise exception 'resident reached organizer wall'; end if;
  select count(*) into v_count from public.organizer_customer_household(
    '30000000-0000-4000-8000-000000000002');
  if v_count <> 0 then raise exception 'resident reached household helper'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true);
do $$
begin
  if not exists (select 1 from public.get_customer_self()
                 where id = '30000000-0000-4000-8000-000000000002'
                   and period = 1 and unit = 'H11') then
    raise exception 'second resident private RPC failed';
  end if;
  if not exists (select 1 from public.order_wall
                 where order_id = '40000000-0000-4000-8000-000000000001'
                   and period is null and unit is null) then
    raise exception 'second resident shared wall failed';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000003', true);
do $$
begin
  if not exists (select 1 from public.organizer_order_wall
                 where order_id = '40000000-0000-4000-8000-000000000001'
                   and period = 2 and unit = '2K13') then
    raise exception 'organizer invoker view lost household details';
  end if;
  if not exists (select 1 from public.organizer_order_wall
                 where order_id = '40000000-0000-4000-8000-000000000002'
                   and period = 1 and unit = 'H11') then
    raise exception 'organizer invoker view lost other household details';
  end if;
end;
$$;
reset role;
rollback;
