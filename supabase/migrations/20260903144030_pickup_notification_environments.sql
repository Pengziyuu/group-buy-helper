-- Separate LINE pickup notification test and production destinations.
-- The existing bound group is the controlled test group and is migrated into the test slot.

do $$
begin
  lock table public.pickup_notification_intent in share row exclusive mode;
  if exists (
    select 1
    from public.pickup_notification_intent intent
    where intent.delivery_status = 'sending'
      and intent.retain_until > now()
  ) then
    raise exception 'legacy pickup notification still sending' using errcode = '55000';
  end if;
end;
$$;

alter table public.community_line_group
  add column binding_kind text;

update public.community_line_group set binding_kind = 'test';

alter table public.community_line_group
  alter column binding_kind set not null,
  add constraint community_line_group_binding_kind_check
    check (binding_kind in ('test', 'production'));

alter table public.community_line_group
  drop constraint community_line_group_pkey,
  add constraint community_line_group_pkey primary key (community_id, binding_kind);

create table public.pickup_notification_test_campaign (
  campaign_id uuid primary key references public.campaign(id) on delete cascade
);

alter table public.pickup_notification_test_campaign enable row level security;
revoke all on table public.pickup_notification_test_campaign from public, anon, authenticated;
grant select, insert, delete on table public.pickup_notification_test_campaign to service_role;

create function public.list_pickup_notification_test_campaigns()
returns table (campaign_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_admin() or not public.is_approved_line_organizer() then
    raise exception 'approved LINE organizer required' using errcode = '42501';
  end if;
  return query
  select marker.campaign_id
  from public.pickup_notification_test_campaign marker
  join public.campaign campaign on campaign.id = marker.campaign_id
  order by campaign.updated_at desc, marker.campaign_id;
end;
$$;

create function public.set_pickup_notification_test_campaign(
  p_campaign_id uuid,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_admin() or not public.is_approved_line_organizer() then
    raise exception 'approved LINE organizer required' using errcode = '42501';
  end if;
  if p_campaign_id is null or p_enabled is null then
    raise exception 'invalid test campaign setting' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pickup-environment:' || p_campaign_id::text, 0));
  if exists (
    select 1
    from public.pickup_notification_intent intent
    where intent.campaign_id = p_campaign_id
      and intent.delivery_status = 'sending'
      and intent.expires_at > now()
  ) then
    raise exception 'campaign notification sending' using errcode = '55000';
  end if;
  if not exists (select 1 from public.campaign campaign where campaign.id = p_campaign_id) then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;

  if p_enabled then
    insert into public.pickup_notification_test_campaign (campaign_id)
    values (p_campaign_id)
    on conflict (campaign_id) do nothing;
  else
    delete from public.pickup_notification_test_campaign marker
    where marker.campaign_id = p_campaign_id;
  end if;
  return true;
end;
$$;

revoke all on function public.list_pickup_notification_test_campaigns() from public, anon;
revoke all on function public.set_pickup_notification_test_campaign(uuid, boolean) from public, anon;
grant execute on function public.list_pickup_notification_test_campaigns() to authenticated, service_role;
grant execute on function public.set_pickup_notification_test_campaign(uuid, boolean) to authenticated, service_role;

alter table public.pickup_notification_intent
  add column binding_kind text;
update public.pickup_notification_intent set binding_kind = 'test';
alter table public.pickup_notification_intent
  alter column binding_kind set not null,
  add constraint pickup_notification_intent_binding_kind_check
    check (binding_kind in ('test', 'production'));

create function public.reserve_pickup_notification_intent(
  p_campaign_id uuid,
  p_audience text,
  p_community_id uuid,
  p_caller_user_id uuid,
  p_caller_hash text,
  p_binding_kind text
)
returns table (token uuid, line_group_id text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group_id text;
  v_token uuid;
  v_active_count integer;
  v_is_test boolean;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_audience not in ('phase13', 'phase2')
    or p_binding_kind not in ('test', 'production')
    or p_caller_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid notification reservation' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.admin_users admin_users
    join public.line_organizer_identity line_organizer_identity
      on line_organizer_identity.auth_user_id = admin_users.user_id
    where admin_users.user_id = p_caller_user_id
  ) then
    raise exception 'approved LINE organizer required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.campaign campaign
    where campaign.id = p_campaign_id
      and campaign.community_id = p_community_id
      and campaign.opened_at is not null
      and campaign.status in ('closed', 'arrived')
  ) then
    raise exception 'campaign must be closed' using errcode = '55000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pickup-environment:' || p_campaign_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'pickup-binding:' || p_community_id::text || ':' || p_binding_kind,
    0
  ));
  select exists (
    select 1 from public.pickup_notification_test_campaign marker
    where marker.campaign_id = p_campaign_id
  ) into v_is_test;
  if (p_binding_kind = 'test') <> v_is_test then
    raise exception 'notification environment mismatch' using errcode = '42501';
  end if;

  select binding.line_group_id into v_group_id
  from public.community_line_group binding
  where binding.community_id = p_community_id
    and binding.binding_kind = p_binding_kind;
  if v_group_id is null then
    raise exception 'notification group not bound' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_caller_hash, 0));
  delete from public.pickup_notification_intent where expires_at <= now();
  select count(*) into v_active_count
  from public.pickup_notification_intent intent
  where intent.caller_hash = p_caller_hash and intent.expires_at > now()
    and intent.delivery_status <> 'sent';
  if v_active_count >= 5 then
    raise exception 'notification preview rate limited' using errcode = 'P0001';
  end if;

  insert into public.pickup_notification_intent (
    campaign_id, audience, line_group_id, caller_hash, binding_kind
  ) values (p_campaign_id, p_audience, v_group_id, p_caller_hash, p_binding_kind)
  returning pickup_notification_intent.token into v_token;
  return query select v_token, v_group_id;
end;
$$;

create function public.finalize_pickup_notification_intent(
  p_token uuid,
  p_campaign_id uuid,
  p_audience text,
  p_caller_hash text,
  p_binding_kind text,
  p_recipient_hash text,
  p_recipient_count integer,
  p_message_count integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_binding_kind not in ('test', 'production') or not exists (
    select 1 from public.pickup_notification_intent intent
    where intent.token = p_token and intent.binding_kind = p_binding_kind
  ) then
    raise exception 'notification environment mismatch' using errcode = '42501';
  end if;
  return public.finalize_pickup_notification_intent(
    p_token, p_campaign_id, p_audience, p_caller_hash,
    p_recipient_hash, p_recipient_count, p_message_count
  );
end;
$$;

create function public.inspect_pickup_notification_intent(
  p_token uuid,
  p_campaign_id uuid,
  p_audience text,
  p_caller_user_id uuid,
  p_caller_hash text,
  p_binding_kind text,
  p_message_hash text
)
returns table (delivery_status text, recipient_count integer, message_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_message_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid notification message hash' using errcode = '22023';
  end if;
  return query
  select old_state.delivery_status, old_state.recipient_count, old_state.message_count
  from public.pickup_notification_intent intent
  cross join lateral public.inspect_pickup_notification_intent(
    p_token, p_campaign_id, p_audience, p_caller_user_id, p_caller_hash
  ) old_state
  where intent.token = p_token
    and intent.binding_kind = p_binding_kind
    and (old_state.delivery_status = 'ready' or intent.message_hash = p_message_hash);
end;
$$;

create function public.claim_pickup_notification_intent(
  p_token uuid,
  p_campaign_id uuid,
  p_audience text,
  p_recipient_hash text,
  p_eligible_hash text,
  p_line_group_id text,
  p_caller_user_id uuid,
  p_caller_hash text,
  p_message_hash text,
  p_binding_kind text
)
returns table (
  line_retry_key uuid,
  delivery_status text,
  recipient_count integer,
  message_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_community_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_binding_kind not in ('test', 'production') then
    raise exception 'notification environment mismatch' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pickup-environment:' || p_campaign_id::text, 0));
  select campaign.community_id into v_community_id
  from public.campaign campaign
  where campaign.id = p_campaign_id;
  if v_community_id is null then
    raise exception 'notification environment mismatch' using errcode = '40001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'pickup-binding:' || v_community_id::text || ':' || p_binding_kind,
    0
  ));
  if not exists (
    select 1
    from public.pickup_notification_intent intent
    join public.campaign campaign on campaign.id = intent.campaign_id
    join public.community_line_group binding
      on binding.community_id = campaign.community_id
      and binding.binding_kind = p_binding_kind
      and binding.line_group_id = p_line_group_id
    where intent.token = p_token
      and intent.campaign_id = p_campaign_id
      and intent.binding_kind = p_binding_kind
      and intent.line_group_id = p_line_group_id
      and ((p_binding_kind = 'test' and exists (
        select 1 from public.pickup_notification_test_campaign marker
        where marker.campaign_id = p_campaign_id
      )) or (p_binding_kind = 'production' and not exists (
        select 1 from public.pickup_notification_test_campaign marker
        where marker.campaign_id = p_campaign_id
      )))
  ) then
    raise exception 'notification environment mismatch' using errcode = '40001';
  end if;

  return query select * from public.claim_pickup_notification_intent(
    p_token, p_campaign_id, p_audience, p_recipient_hash, p_eligible_hash,
    p_line_group_id, p_caller_user_id, p_caller_hash, p_message_hash
  );
end;
$$;

create function public.mark_pickup_notification_intent_sent(
  p_token uuid,
  p_campaign_id uuid,
  p_audience text,
  p_caller_hash text,
  p_binding_kind text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_marked boolean;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.pickup_notification_intent intent
    where intent.token = p_token and intent.binding_kind = p_binding_kind
  ) then
    raise exception 'notification environment mismatch' using errcode = '42501';
  end if;
  v_marked := public.mark_pickup_notification_intent_sent(
    p_token, p_campaign_id, p_audience, p_caller_hash
  );
  if v_marked then return true; end if;
  return exists (
    select 1
    from public.pickup_notification_intent intent
    where intent.token = p_token
      and intent.campaign_id = p_campaign_id
      and intent.audience = p_audience
      and intent.caller_hash = p_caller_hash
      and intent.binding_kind = p_binding_kind
      and intent.delivery_status = 'sent'
  );
end;
$$;

create function public.process_line_group_binding_event(
  p_webhook_event_id text,
  p_community_id uuid,
  p_line_group_id text,
  p_line_user_id text,
  p_binding_kind text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if length(p_webhook_event_id) not between 1 and 255
    or p_binding_kind not in ('test', 'production')
    or p_line_group_id !~ '^C[0-9a-f]{32}$' or p_line_user_id !~ '^U[0-9a-f]{32}$' then
    raise exception 'invalid LINE binding event' using errcode = '22023';
  end if;
  insert into public.line_webhook_event_replay (webhook_event_id)
  values (p_webhook_event_id)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return 'duplicate'; end if;

  if not exists (
    select 1
    from public.line_organizer_identity identity
    join public.admin_users admin on admin.user_id = identity.auth_user_id
    where identity.line_user_id = p_line_user_id
  ) then
    return 'forbidden';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'pickup-binding:' || p_community_id::text || ':' || p_binding_kind,
    0
  ));
  if exists (
    select 1
    from public.pickup_notification_intent intent
    join public.community_line_group binding
      on binding.line_group_id = intent.line_group_id
    where binding.community_id = p_community_id
      and binding.binding_kind = p_binding_kind
      and intent.binding_kind = p_binding_kind
      and intent.delivery_status = 'sending'
      and intent.expires_at > now()
  ) then
    return 'busy';
  end if;
  if exists (
    select 1 from public.community_line_group binding
    where binding.line_group_id = p_line_group_id
      and (binding.community_id <> p_community_id or binding.binding_kind <> p_binding_kind)
  ) then
    return 'conflict';
  end if;

  insert into public.community_line_group (community_id, binding_kind, line_group_id)
  values (p_community_id, p_binding_kind, p_line_group_id)
  on conflict (community_id, binding_kind) do update
    set line_group_id = excluded.line_group_id;
  return 'bound';
end;
$$;

drop function public.reserve_pickup_notification_intent(uuid, text, uuid, uuid, text);
revoke all on function public.finalize_pickup_notification_intent(uuid, uuid, text, text, text, integer, integer) from service_role;
revoke all on function public.inspect_pickup_notification_intent(uuid, uuid, text, uuid, text) from service_role;
revoke all on function public.claim_pickup_notification_intent(uuid, uuid, text, text, text, text, uuid, text, text) from service_role;
revoke all on function public.mark_pickup_notification_intent_sent(uuid, uuid, text, text) from service_role;
drop function public.process_line_group_binding_event(text, uuid, text, text);

revoke all on function public.reserve_pickup_notification_intent(uuid, text, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.finalize_pickup_notification_intent(uuid, uuid, text, text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.inspect_pickup_notification_intent(uuid, uuid, text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.claim_pickup_notification_intent(uuid, uuid, text, text, text, text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.mark_pickup_notification_intent_sent(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.process_line_group_binding_event(text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.reserve_pickup_notification_intent(uuid, text, uuid, uuid, text, text) to service_role;
grant execute on function public.finalize_pickup_notification_intent(uuid, uuid, text, text, text, text, integer, integer) to service_role;
grant execute on function public.inspect_pickup_notification_intent(uuid, uuid, text, uuid, text, text, text) to service_role;
grant execute on function public.claim_pickup_notification_intent(uuid, uuid, text, text, text, text, uuid, text, text, text) to service_role;
grant execute on function public.mark_pickup_notification_intent_sent(uuid, uuid, text, text, text) to service_role;
grant execute on function public.process_line_group_binding_event(text, uuid, text, text, text) to service_role;
