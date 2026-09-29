-- Rollback-only probe for the actual SQL hash after a resident moves from period 1 to 2.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, instance_id, aud, role, email)
values ('92000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pickup-hash-probe@example.invalid');
update public.customer set auth_user_id = '92000000-0000-4000-8000-000000000002'
where id = '30000000-0000-4000-8000-000000000002';
insert into public.community_member (community_id, user_id)
values ('00000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000002');
insert into public.line_resident_identity (line_user_id, auth_user_id, display_name)
values ('Ubbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '92000000-0000-4000-8000-000000000002', 'hash probe');
create temporary table hash_before as
select public.internal_pickup_notification_eligible_hash('10000000-0000-4000-8000-000000000001', 'combined') as combined_hash,
  public.internal_pickup_notification_eligible_hash('10000000-0000-4000-8000-000000000001', 'phase13') as legacy_hash;
update public.customer set period = 2, unit = '2K14'
where id = '30000000-0000-4000-8000-000000000002';
do $$
begin
  if (select combined_hash from hash_before) <> 'bdfc798898e91a45104e2d5501d2920ce8b74fc37428ecb7846866ac432ddd86' then
    raise exception 'SQL and WebCrypto combined hash disagree';
  end if;
  if (select combined_hash from hash_before) = public.internal_pickup_notification_eligible_hash('10000000-0000-4000-8000-000000000001', 'combined') then
    raise exception 'combined eligibility hash did not change with period';
  end if;
  if (select legacy_hash from hash_before) <> encode(extensions.digest(convert_to('Ubbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'UTF8'), 'sha256'), 'hex') then
    raise exception 'legacy phase13 ID hash changed';
  end if;
  if public.internal_pickup_notification_eligible_hash('10000000-0000-4000-8000-000000000001', 'phase2') <> encode(extensions.digest(convert_to('Ubbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'UTF8'), 'sha256'), 'hex') then
    raise exception 'legacy phase2 ID hash changed';
  end if;
end $$;
rollback;
