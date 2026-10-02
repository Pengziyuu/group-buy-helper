-- Rollback-only integration: published/draft snapshot, progress-only, discounted amount,
-- notification reason, custom-only, deadline, reopen and role grants.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id) values
  ('11111111-2222-4333-8444-5555555555b1'),
  ('11111111-2222-4333-8444-5555555555b2');
insert into public.admin_users (user_id) values ('11111111-2222-4333-8444-5555555555b1');
insert into public.customer (name, household_kind, period, auth_user_id)
values ('門檻測試住戶', 'other', null, '11111111-2222-4333-8444-5555555555b2');
insert into public.community_member (community_id, user_id)
select id, '11111111-2222-4333-8444-5555555555b2' from public.community limit 1;
select set_config('request.jwt.claim.sub', '11111111-2222-4333-8444-5555555555b1', true);
do $$
declare
  c public.campaign;
  a public.campaign;
  q public.campaign;
  d public.campaign;
  e public.campaign;
  r jsonb;
  amount numeric;
begin
  select * into c from public.create_campaign_draft('門檻開關驗證');
  if not (select threshold_auto_close from public.campaign where id = c.id) or
     not (select threshold_auto_close from public.campaign_draft where campaign_id = c.id) then
    raise exception 'new quantity campaign/draft must default to auto-close';
  end if;
  if exists (select 1 from public.campaign where threshold_kind = 'amount' and threshold_auto_close) or
     exists (select 1 from public.campaign_draft where threshold_kind = 'amount' and threshold_auto_close) then
    raise exception 'legacy amount rows must remain progress-only';
  end if;
  update public.campaign_draft set
    items = '[{"code":"ITEM1","name":"測試商品","unitPrice":100,"active":true}]',
    unit_price = 100, threshold = 2, threshold_auto_close = false,
    threshold_configured = true, item_name_configured = true, item_price_configured = true
  where campaign_id = c.id;
  if not (select threshold_auto_close from public.campaign where id = c.id) then
    raise exception 'unpublished draft leaked into published snapshot';
  end if;
  perform public.publish_campaign_draft(c.id);
  if (select threshold_auto_close from public.campaign where id = c.id) then
    raise exception 'quantity progress-only setting was not published';
  end if;
  select * into q from public.create_campaign_draft('數量自動結單');
  update public.campaign_draft set items = '[{"code":"ITEM1","name":"商品","unitPrice":100,"active":true}]',
    unit_price = 100, threshold = 2, threshold_configured = true,
    item_name_configured = true, item_price_configured = true
  where campaign_id = q.id;
  perform public.publish_campaign_draft(q.id);
  select * into a from public.create_campaign_draft('金額自動結單');
  update public.campaign_draft set items = '[{"code":"ITEM1","name":"優惠商品","unitPrice":100,"active":true}]',
    unit_price = 100, threshold_kind = 'amount', amount_threshold = 100,
    threshold_auto_close = true, base_discount_rate = 0.5, allow_custom_items = true,
    threshold_configured = true, item_name_configured = true, item_price_configured = true
  where campaign_id = a.id;
  perform public.publish_campaign_draft(a.id);
  select * into d from public.create_campaign_draft('到期結單');
  update public.campaign_draft set items = '[{"code":"ITEM1","name":"商品","unitPrice":100,"active":true}]',
    unit_price = 100, threshold_kind = 'amount', amount_threshold = 100,
    threshold_auto_close = false, threshold_configured = true,
    item_name_configured = true, item_price_configured = true
  where campaign_id = d.id;
  perform public.publish_campaign_draft(d.id);
  select * into e from public.create_campaign_draft('金額僅進度');
  update public.campaign_draft set items = '[{"code":"ITEM1","name":"商品","unitPrice":100,"active":true}]',
    unit_price = 100, threshold_kind = 'amount', amount_threshold = 100,
    threshold_auto_close = false, threshold_configured = true,
    item_name_configured = true, item_price_configured = true
  where campaign_id = e.id;
  perform public.publish_campaign_draft(e.id);
  insert into public.campaign_access (campaign_id, user_id) values
    (c.id, '11111111-2222-4333-8444-5555555555b2'),
    (q.id, '11111111-2222-4333-8444-5555555555b2'),
    (a.id, '11111111-2222-4333-8444-5555555555b2'),
    (d.id, '11111111-2222-4333-8444-5555555555b2'),
    (e.id, '11111111-2222-4333-8444-5555555555b2');
  perform set_config('request.jwt.claim.sub', '11111111-2222-4333-8444-5555555555b2', true);
  r := public.submit_customer_order(c.id, '{"ITEM1":3}');
  if r ->> 'campaign_status' <> 'open' then raise exception 'progress-only quantity closed'; end if;
  perform set_config('request.jwt.claim.sub', '11111111-2222-4333-8444-5555555555b1', true);
  perform public.publish_campaign_draft(c.id);
  if (select status from public.campaign where id = c.id) <> 'open' then
    raise exception 'quantity progress-only publication closed an over-target campaign';
  end if;
  update public.campaign_draft set threshold_auto_close = true where campaign_id = c.id;
  begin
    perform public.publish_campaign_draft(c.id);
    raise exception 'enabling quantity cap accepted historical overage';
  exception when check_violation then null;
  end;
  update public.campaign_draft set threshold_auto_close = false where campaign_id = c.id;
  perform set_config('request.jwt.claim.sub', '11111111-2222-4333-8444-5555555555b2', true);
  r := public.submit_customer_order(a.id, '{}'::jsonb, '[{"id":"x","name":"另計","quantity":1}]'::jsonb);
  if r ->> 'campaign_status' <> 'open' then raise exception 'custom-only order closed amount campaign'; end if;
  r := public.submit_customer_order(a.id, '{"ITEM1":1}');
  if r ->> 'campaign_status' <> 'open' then raise exception 'amount closed on list price rather than discounted price'; end if;
  r := public.submit_customer_order(a.id, '{"ITEM1":3}');
  if r ->> 'campaign_status' <> 'closed' then raise exception 'discounted over-target amount did not close'; end if;
  select sum(oi.qty * oi.final_unit_price) into amount from public.order_item oi where oi.campaign_id = a.id;
  if amount <> 150 then raise exception 'discounted persisted amount incorrect: %', amount; end if;
  r := public.submit_customer_order(e.id, '{"ITEM1":2}');
  if r ->> 'campaign_status' <> 'open' then raise exception 'amount progress-only closed'; end if;
  r := public.submit_customer_order(q.id, '{"ITEM1":2}');
  if r ->> 'campaign_status' <> 'closed' then raise exception 'legacy quantity exact fill failed'; end if;
  begin
    perform public.submit_customer_order(a.id, '{"ITEM1":4}');
    raise exception 'closed amount campaign accepted order edit';
  exception when check_violation then null;
  end;
  perform set_config('request.jwt.claim.sub', '11111111-2222-4333-8444-5555555555b1', true);
  perform public.set_campaign_status(c.id, 'closed');
  perform public.set_campaign_status(c.id, 'open');
  perform public.set_campaign_status(e.id, 'closed');
  perform public.set_campaign_status(e.id, 'open');
  if exists (select 1 from public.campaign_auto_close_notification where campaign_id = e.id) then
    raise exception 'manual progress-only amount close queued notification';
  end if;
  update public.campaign_draft set threshold_auto_close = true where campaign_id = e.id;
  perform public.publish_campaign_draft(e.id);
  if (select status from public.campaign where id = e.id) <> 'closed' or
     (select count(*) from public.campaign_auto_close_notification where campaign_id = e.id and close_reason = 'amount') <> 1 then
    raise exception 'enabling amount auto-close on reached published campaign failed';
  end if;
  begin
    perform public.set_campaign_status(a.id, 'open');
    raise exception 'reached amount campaign reopened';
  exception when check_violation then null;
  end;
  begin
    perform public.set_campaign_status(q.id, 'open');
    raise exception 'reached quantity campaign reopened';
  exception when check_violation then null;
  end;
  if (select count(*) from public.campaign_auto_close_notification where campaign_id = a.id and close_reason = 'amount') <> 1 then
    raise exception 'amount notification missing or duplicated';
  end if;
  if (select count(*) from public.campaign_auto_close_notification where campaign_id = q.id and close_reason = 'quantity') <> 1 then
    raise exception 'quantity notification missing or duplicated';
  end if;
  if exists (select 1 from public.campaign_auto_close_notification where campaign_id = c.id) then
    raise exception 'manual close queued a threshold notification';
  end if;
  update public.campaign set auto_close_at = date_trunc('minute', clock_timestamp() - interval '1 minute') where id = d.id;
  if (select status from public.campaign where id = d.id) <> 'closed' or
     (select count(*) from public.campaign_auto_close_notification where campaign_id = d.id and close_reason = 'scheduled') <> 1 then
    raise exception 'deadline transition and notification broken';
  end if;
  if not has_function_privilege('authenticated', 'public.submit_customer_order(uuid,jsonb,jsonb)', 'EXECUTE') or
     has_function_privilege('anon', 'public.submit_customer_order(uuid,jsonb,jsonb)', 'EXECUTE') or
     has_function_privilege('authenticated', 'public.queue_campaign_auto_close_notification()', 'EXECUTE') then
    raise exception 'function grants widened';
  end if;
  raise notice 'PASS: threshold modes, snapshots, discounted amounts, custom-only, quantity, deadline, notification and grants';
end $$;
-- Exercise ordinary database role rather than only SECURITY DEFINER under postgres.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-2222-4333-8444-5555555555b2', true);
do $$
begin
  if not exists (select 1 from public.list_resident_campaigns()
    where title = '金額自動結單' and threshold_auto_close and status = 'closed' and total_amount = 150) then
    raise exception 'resident list did not expose published discounted amount and toggle';
  end if;
  if not exists (select 1 from public.campaign_public where title = '門檻開關驗證' and not threshold_auto_close) then
    raise exception 'resident view did not expose published progress-only toggle';
  end if;
  begin
    perform public.list_admin_campaign_cards();
    raise exception 'resident accessed admin campaign cards';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: authenticated resident reader and admin denial';
end $$;
rollback;
