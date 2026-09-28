-- Rollback-only integration test for blank new drafts and publish safety.
begin;
insert into auth.users (id) values ('11111111-2222-4333-8444-555555555555');
insert into public.admin_users (user_id) values ('11111111-2222-4333-8444-555555555555');
select set_config('request.jwt.claim.sub', '11111111-2222-4333-8444-555555555555', true);

do $$
declare
  c public.campaign;
  draft_items jsonb;
begin
  select * into c from public.create_campaign_draft('空白品項驗證');
  select items into draft_items from public.campaign_draft where campaign_id = c.id;
  if draft_items <> '[]'::jsonb then raise exception 'new draft has prefilled items: %', draft_items; end if;
  if not (select integer_currency_required from public.campaign_draft where campaign_id = c.id) then
    raise exception 'new draft does not require integer currency';
  end if;
  begin
    update public.campaign_draft set integer_currency_required = false where campaign_id = c.id;
    raise exception 'integer-currency guard was disabled';
  exception when check_violation then null;
  end;
  begin
    update public.campaign_draft set threshold_kind = 'amount', amount_threshold = 100.5 where campaign_id = c.id;
    raise exception 'fractional amount threshold was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.campaign_draft set items = '[{"code":"ITEM1","name":"牛奶","unitPrice":100.5,"active":true}]'::jsonb
      where campaign_id = c.id;
    raise exception 'fractional item price was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.publish_campaign_draft(c.id);
    raise exception 'empty draft unexpectedly published';
  exception when check_violation then
    null;
  end;
  update public.campaign_draft
    set items = '[{"code":"ITEM1","name":"牛奶","unitPrice":100,"active":true}]'::jsonb,
        unit_price = 100, threshold = 3, threshold_configured = true,
        item_name_configured = true, item_price_configured = true
    where campaign_id = c.id;
  perform public.publish_campaign_draft(c.id);
  if not exists (select 1 from public.campaign where id = c.id and opened_at is not null
    and items -> 0 ->> 'name' = '牛奶') then
    raise exception 'completed draft did not publish its organizer-defined item';
  end if;
  raise notice 'PASS: empty draft, decimal money blocked, empty publication blocked, added product published';
end $$;
rollback;
