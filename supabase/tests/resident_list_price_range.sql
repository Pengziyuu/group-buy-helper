-- Run only against the local Supabase database: docker exec -i
-- supabase_db_group-buy-helper psql -v ON_ERROR_STOP=1 -U postgres -d postgres
-- < supabase/tests/resident_list_price_range.sql
begin;
insert into auth.users (id) values ('a0000000-0000-4000-8000-000000000021');
insert into public.community_member (community_id, user_id)
values ('00000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000021');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000021', true);
do $$
declare
  v_row record;
begin
  -- Every seeded item costs 45: the list has one price, no range.
  select * into v_row from public.list_resident_campaigns() where slug = '0123456789abcdef0123456789abcdef0123';
  if v_row.unit_price <> 45 or v_row.max_unit_price <> 45 then
    raise exception 'one shared price expected, got % to %', v_row.unit_price, v_row.max_unit_price;
  end if;
end;
$$;
reset role;

-- One item dearer, and an inactive one dearer still, which is not for sale and must not count.
-- Published items are locked against every role, so the fixture goes around the lock.
alter table public.campaign_item disable trigger lock_published_campaign_items;
update public.campaign_item set unit_price = 60 where id = '20000000-0000-4000-8000-000000000004';
update public.campaign_item set unit_price = 99, active = false where id = '20000000-0000-4000-8000-000000000005';
alter table public.campaign_item enable trigger lock_published_campaign_items;
-- A base discount applies to both ends, as it does to unit_price. Discounts are locked too.
alter table public.campaign disable trigger lock_published_campaign_discounts;
update public.campaign set base_discount_rate = 0.9 where id = '10000000-0000-4000-8000-000000000001';
alter table public.campaign enable trigger lock_published_campaign_discounts;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000021', true);
do $$
declare
  v_row record;
begin
  select * into v_row from public.list_resident_campaigns() where slug = '0123456789abcdef0123456789abcdef0123';
  if v_row.unit_price <> 41 or v_row.max_unit_price <> 54 then
    raise exception 'range expected 41 to 54 (45 and 60 at 90%%), got % to %', v_row.unit_price, v_row.max_unit_price;
  end if;
end;
$$;
rollback;
