-- Rollback-only check for short campaign links: new campaigns get 8-character codes, older
-- 36-character codes keep working, malformed codes are refused, and link previews accept both.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id) values ('11111111-2222-4333-8444-5555555555a1');
insert into public.admin_users (user_id) values ('11111111-2222-4333-8444-5555555555a1');
select set_config('request.jwt.claim.sub', '11111111-2222-4333-8444-5555555555a1', true);

do $$
declare
  fresh public.campaign;
  older public.campaign;
  generated text[];
  bad text;
begin
  select * into fresh from public.create_campaign_draft('短網址驗證');
  if fresh.slug !~ '^[0-9a-z]{8}$' then raise exception 'new campaign did not get an 8-character code: %', fresh.slug; end if;

  select array_agg(public.random_campaign_slug()) into generated from generate_series(1, 2000);
  if exists (select 1 from unnest(generated) code where code !~ '^[0-9a-z]{8}$') then
    raise exception 'generated a malformed code';
  end if;
  if (select count(distinct code) from unnest(generated) code) < 1990 then
    raise exception 'generated codes repeat far more than chance allows';
  end if;
  -- Every character appears: a generator stuck on part of the alphabet would make codes easier to guess.
  if (select count(distinct ch) from unnest(generated) code, regexp_split_to_table(code, '') ch) <> 36 then
    raise exception 'generated codes do not use all 36 characters';
  end if;

  select * into older from public.create_campaign_draft('舊長網址驗證');
  update public.campaign set slug = encode(extensions.gen_random_bytes(18), 'hex') where id = older.id
    returning * into older;

  foreach bad in array array['K7QP2XZA', 'k7qp2xz', 'k7qp2xza9', 'k7qp-xza', repeat('g', 36)] loop
    begin
      update public.campaign set slug = bad where id = fresh.id;
      raise exception 'malformed code % was accepted', bad;
    exception when check_violation then null;
    end;
  end loop;

  -- Publish both the way an organizer would; previews only show opened campaigns.
  update public.campaign_draft set
    items = '[{"code":"ITEM1","name":"測試商品","unitPrice":100,"active":true}]'::jsonb,
    unit_price = 100, threshold = 5, threshold_configured = true,
    item_name_configured = true, item_price_configured = true
  where campaign_id in (fresh.id, older.id);
  perform public.publish_campaign_draft(fresh.id);
  perform public.publish_campaign_draft(older.id);
  if (select title from public.campaign_link_preview(fresh.slug)) is distinct from '短網址驗證' then
    raise exception 'link preview missed the 8-character code';
  end if;
  if (select title from public.campaign_link_preview(older.slug)) is distinct from '舊長網址驗證' then
    raise exception 'link preview missed the 36-character code';
  end if;
  if exists (select 1 from public.campaign_link_preview(upper(fresh.slug))) then
    raise exception 'link preview accepted an upper-case code';
  end if;

  raise notice 'PASS: 8-character codes for new campaigns, 36-character codes kept, malformed codes refused, previews accept both';
end;
$$;
rollback;
