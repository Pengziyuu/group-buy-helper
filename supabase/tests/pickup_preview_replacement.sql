-- Rollback-only integration: repeated previews replace unused ones, not issued commands.
\set ON_ERROR_STOP on
begin;
set local request.jwt.claim.role = 'service_role';
insert into auth.users (id, instance_id, aud, role, email)
values ('92000000-0000-4000-8000-000000000091','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pickup-preview-probe@example.invalid');
insert into public.admin_users (user_id) values ('92000000-0000-4000-8000-000000000091');
insert into public.line_organizer_identity (line_user_id, auth_user_id)
values ('Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','92000000-0000-4000-8000-000000000091');
insert into public.community_line_group (community_id,line_group_id,binding_kind)
values ('00000000-0000-4000-8000-000000000001','Caaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','production');
update public.campaign set status='closed' where id='10000000-0000-4000-8000-000000000001';
do $$
declare v_token uuid; v_count int; v_previous uuid;
begin
  for i in 1..7 loop
    select token into v_token from public.reserve_pickup_notification_intent(
      '10000000-0000-4000-8000-000000000001','all','00000000-0000-4000-8000-000000000001',
      '92000000-0000-4000-8000-000000000091',repeat('a',64),'production');
    if not public.finalize_pickup_notification_intent(
      v_token,'10000000-0000-4000-8000-000000000001','all',repeat('a',64),'production',repeat('b',64),1,1)
      then raise exception 'finalize failed'; end if;
    select count(*) into v_count from public.pickup_notification_intent
    where caller_hash=repeat('a',64) and expires_at > now();
    if v_count <> 1 then raise exception 'expected one active preview, got %',v_count; end if;
    if v_previous is not null and exists(select 1 from public.pickup_notification_intent where token=v_previous)
      then raise exception 'old preview retained'; end if;
    v_previous := v_token;
  end loop;
  insert into public.pickup_notification_reply_command (intent_token,command_hash,payload_ciphertext,message_hash)
  values (v_previous,repeat('c',64),repeat('A',48),repeat('d',64));
  select token into v_token from public.reserve_pickup_notification_intent(
    '10000000-0000-4000-8000-000000000001','combined','00000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000091',repeat('a',64),'production');
  if not exists (select 1 from public.pickup_notification_reply_command where intent_token=v_previous)
    then raise exception 'issued command was deleted'; end if;
  select count(*) into v_count from public.pickup_notification_intent
  where caller_hash=repeat('a',64) and expires_at > now();
  if v_count <> 2 then raise exception 'issued command must remain while a new preview is created'; end if;
  raise notice 'seven sequential previews succeeded; one active preview plus issued command retained';
end $$;
rollback;
