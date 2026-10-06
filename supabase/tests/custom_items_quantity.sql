-- Run only against the local Supabase database: docker exec -i
-- supabase_db_group-buy-helper psql -v ON_ERROR_STOP=1 -U postgres -d postgres
-- < supabase/tests/custom_items_quantity.sql
-- Custom items count toward the quantity threshold: blocking, auto-closing, reopening and lists.
begin;
insert into auth.users (id) values
  ('a0000000-0000-4000-8000-000000000021'),
  ('a0000000-0000-4000-8000-000000000022');
update public.customer set auth_user_id = 'a0000000-0000-4000-8000-000000000021'
where id = '30000000-0000-4000-8000-000000000001';
insert into public.community_member (community_id, user_id)
values ('00000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000021');
insert into public.campaign_access (campaign_id, user_id)
values ('10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000021');
insert into public.admin_users (user_id) values ('a0000000-0000-4000-8000-000000000022');

-- Another household already holds a custom item; the threshold leaves room for 3 more of anything.
alter table public.campaign disable trigger lock_published_campaign_custom_items;
update public.campaign set allow_custom_items = true where id = '10000000-0000-4000-8000-000000000001';
alter table public.campaign enable trigger lock_published_campaign_custom_items;
update public.orders set custom_items = '[{"id":"bag","name":"提袋","quantity":2}]'::jsonb
where id = '40000000-0000-4000-8000-000000000002';
create temporary table quantities on commit drop as
select (select sum(qty) from public.order_item where campaign_id = '10000000-0000-4000-8000-000000000001')::bigint + 2 as ordered;
update public.campaign set threshold = (select ordered + 3 from quantities), threshold_auto_close = true, threshold_kind = 'quantity'
where id = '10000000-0000-4000-8000-000000000001';
grant select on quantities to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000021', true);
do $$
declare v_row record;
begin
  select * into v_row from public.list_resident_campaigns() where slug = '0123456789abcdef0123456789abcdef0123';
  if v_row.total_quantity <> (select ordered from quantities) then
    raise exception 'list leaves custom items out: % vs %', v_row.total_quantity, (select ordered from quantities);
  end if;

  -- 4 custom on top of this household's unchanged formal items is one over the threshold.
  begin
    perform public.submit_customer_order('10000000-0000-4000-8000-000000000001', '{"B":2,"D":2,"E":2}'::jsonb,
      '[{"id":"cake","name":"蛋糕","quantity":4}]'::jsonb);
    raise exception 'custom items went past the threshold';
  exception when check_violation then
    if sqlerrm not like '%本次最多可訂%' then raise; end if;
  end;

  -- Exactly 3 reaches it, and the campaign closes on its own.
  perform public.submit_customer_order('10000000-0000-4000-8000-000000000001', '{"B":2,"D":2,"E":2}'::jsonb,
    '[{"id":"cake","name":"蛋糕","quantity":3}]'::jsonb);
end;
$$;
reset role;

do $$
begin
  if (select status from public.campaign where id = '10000000-0000-4000-8000-000000000001') <> 'closed' then
    raise exception 'reaching the threshold with custom items did not close the campaign';
  end if;
  if not exists (select 1 from public.campaign_auto_close_notification
                 where campaign_id = '10000000-0000-4000-8000-000000000001' and close_reason = 'quantity') then
    raise exception 'auto-close notice did not see the threshold as reached';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000022', true);
do $$
begin
  if (select total_quantity from public.list_admin_campaign_cards() where id = '10000000-0000-4000-8000-000000000001')
     <> (select ordered + 3 from quantities) then
    raise exception 'organizer list leaves custom items out';
  end if;
  begin
    perform public.set_campaign_status('10000000-0000-4000-8000-000000000001', 'open');
    raise exception 'reopened a campaign whose custom items fill the threshold';
  exception when check_violation then
    if sqlerrm not like '%不能重新開團%' then raise; end if;
  end;
end;
$$;
reset role;
rollback;
