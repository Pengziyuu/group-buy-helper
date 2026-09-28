-- Rollback-only regression: organizer may save and publish a Taipei closing time other than noon.
begin;
insert into auth.users (id) values ('11111111-2222-4333-8444-555555555555');
insert into public.admin_users (user_id) values ('11111111-2222-4333-8444-555555555555');
select set_config('request.jwt.claim.sub', '11111111-2222-4333-8444-555555555555', true);

do $$
declare
  c public.campaign;
  v_time timestamptz := '2027-10-15 18:30:00+08'::timestamptz;
begin
  select * into c from public.create_campaign_draft('自訂結單時間測試');
  update public.campaign_draft set
    items = '[{"code":"ITEM1","name":"測試商品","unitPrice":100,"active":true}]'::jsonb,
    unit_price = 100, threshold = 5, threshold_configured = true,
    item_name_configured = true, item_price_configured = true,
    auto_close_at = v_time
  where campaign_id = c.id;
  if (select auto_close_at from public.campaign_draft where campaign_id = c.id) is distinct from v_time then
    raise exception 'custom draft close time was not saved';
  end if;
  perform public.publish_campaign_draft(c.id);
  if (select auto_close_at from public.campaign where id = c.id) is distinct from v_time then
    raise exception 'custom close time was not published';
  end if;
  raise notice 'PASS: 18:30 Taipei close time saved and published';
end $$;
rollback;
