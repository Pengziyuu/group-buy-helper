-- Local development data only. No phone numbers, addresses, or LINE identifiers.
insert into public.campaign (id, slug, title, unit_price, threshold, status, deadline)
values (
  '10000000-0000-4000-8000-000000000001',
  '0123456789abcdef0123456789abcdef0123',
  '小農鮮乳社區團購',
  45,
  100,
  'open',
  '2030-12-31T15:59:59Z'
);

insert into public.campaign_item (id, campaign_id, code, name, sort_order)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'MILK', '鮮乳', 1),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'YOGURT', '優格', 2),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'PUDDING', '鮮奶布丁', 3);

insert into public.product_template (code, name, default_price, sort_order)
values
  ('MILK', '鮮乳', 45, 1),
  ('YOGURT', '優格', 45, 2),
  ('PUDDING', '鮮奶布丁', 45, 3);

insert into public.customer (id, period, unit, name)
values
  ('30000000-0000-4000-8000-000000000001', 2, '2K13', '斯祈'),
  ('30000000-0000-4000-8000-000000000002', 2, '2K09', '怡君'),
  ('30000000-0000-4000-8000-000000000003', 2, '2K06', '佳玲'),
  ('30000000-0000-4000-8000-000000000004', 2, '2K02', '雅雯'),
  ('30000000-0000-4000-8000-000000000005', 2, '2K15', '志明'),
  ('30000000-0000-4000-8000-000000000006', 2, '2K18', '美華');
