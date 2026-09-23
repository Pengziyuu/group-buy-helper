-- Run through docker exec psql; this entire probe is rollback-isolated.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
values
('10000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','probe1@users.invalid','not-used',now()),
('10000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','probe2@users.invalid','not-used',now());
insert into public.community_line_group (community_id,binding_kind,line_group_id)
values ('00000000-0000-4000-8000-000000000001','production','C11111111111111111111111111111111');
do $$
declare
  group_id text; revision uuid; admitted_count integer; result_count integer;
begin
  select line_group_id,binding_revision into group_id,revision from public.community_line_group where binding_kind='production';
  -- Auth and identity alone must not grant prior admission.
  insert into public.line_resident_identity (line_user_id, auth_user_id, display_name, last_verified_at)
  values ('U11111111111111111111111111111111','10000000-0000-4000-8000-000000000001','甲',now());
  begin
    perform public.provision_line_resident('U11111111111111111111111111111111',
      '10000000-0000-4000-8000-000000000001','甲',null,null,null,null);
    raise exception 'identity-only bypass';
  exception when sqlstate '42501' then null; end;
  select count(*) into admitted_count from public.community_resident_admission;
  if admitted_count <> 0 then raise exception 'unauthorized admission'; end if;
  -- Test binding must not count.
  begin
    perform public.provision_line_resident('U11111111111111111111111111111111',
      '10000000-0000-4000-8000-000000000001','甲',null,group_id,extensions.gen_random_uuid(),now());
    raise exception 'stale binding bypass';
  exception when sqlstate '42501' then null; end;
  perform public.provision_line_resident('U11111111111111111111111111111111',
      '10000000-0000-4000-8000-000000000001','甲',null,group_id,revision,now());
  -- Once admitted, no group health/proof is required.
  perform public.provision_line_resident('U11111111111111111111111111111111',
      '10000000-0000-4000-8000-000000000001','甲',null,null,null,null);
  -- A later-started lookup must not be overwritten by an older request that finishes last.
  perform public.service_record_resident_group_checks(revision,
    '[{"line_user_id":"U11111111111111111111111111111111","group_status":"not_in_group"}]'::jsonb,
    clock_timestamp() + interval '1 second');
  begin
    perform public.service_record_resident_group_checks(revision,
      '[{"line_user_id":"U11111111111111111111111111111111","group_status":"in_group"}]'::jsonb,
      clock_timestamp());
    raise exception 'stale status overwrite';
  exception when sqlstate '55000' then null; end;
  if (select group_status from public.resident_group_check limit 1) <> 'not_in_group' then
    raise exception 'newer status lost'; end if;
  -- Blocked residents stay blocked even if previously admitted.
  insert into public.community_resident_block
    (community_id,user_id,line_user_id,member_code,joined_at,blocked_by)
  values ('00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001','U11111111111111111111111111111111',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', now(),'10000000-0000-4000-8000-000000000002');
  begin
    perform public.provision_line_resident('U11111111111111111111111111111111',
      '10000000-0000-4000-8000-000000000001','甲',null,null,null,null);
    raise exception 'blocked resident bypass';
  exception when sqlstate '42501' then null; end;
  delete from public.community_resident_block where line_user_id='U11111111111111111111111111111111';
  -- Group rebinding invalidates historical status but not admission.
  update public.community_line_group set line_group_id='C22222222222222222222222222222222' where binding_kind='production';
  if (select group_status from public.resident_group_check limit 1) <> 'not_in_group' then raise exception 'missing latest check'; end if;
  -- Foreign subject cannot be silently admitted through a previous member's Auth UID.
  begin
    perform public.provision_line_resident('U22222222222222222222222222222222',
      '10000000-0000-4000-8000-000000000001','乙',null,null,null,null);
    raise exception 'auth identity bypass';
  exception when sqlstate '23505' then null; end;
  select count(*) into result_count from public.community_resident_admission;
  if result_count <> 1 then raise exception 'admission count mismatch: %',result_count; end if;
  -- Browser roles cannot enumerate provider identities or forge status writes.
  if has_function_privilege('authenticated', 'public.service_resident_group_candidates(text[])', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.service_record_resident_group_checks(uuid,jsonb,timestamptz)', 'EXECUTE')
    or has_table_privilege('authenticated', 'public.community_resident_admission', 'SELECT')
    or has_table_privilege('authenticated', 'public.resident_group_check', 'SELECT') then
    raise exception 'browser privilege leak';
  end if;
  begin
    execute 'set local role authenticated';
    perform public.admin_list_resident_group_statuses();
    raise exception 'non-admin status bypass';
  exception when sqlstate '42501' then
    execute 'reset role';
  end;
  raise notice 'group admission proof: identity-only denied, binding revision guarded, admitted retry allowed, blocks enforced, auth conflict denied, browser grants denied';
end $$;
rollback;
