-- Switching delivery modes and checking the same campaign repeatedly should not
-- exhaust the organizer's five *simultaneous* preview slots. Supersede only
-- unissued ready previews for this caller, campaign, and environment. Never
-- delete an issued command or another campaign's preview.
create or replace function public.reserve_pickup_notification_intent(
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
  if p_audience not in ('phase13', 'phase2', 'all', 'combined')
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
    'pickup-binding:' || p_community_id::text || ':' || p_binding_kind, 0
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
  delete from public.pickup_notification_intent intent
  where intent.campaign_id = p_campaign_id
    and intent.caller_hash = p_caller_hash
    and intent.binding_kind = p_binding_kind
    and intent.delivery_status = 'ready'
    and not exists (
      select 1 from public.pickup_notification_reply_command command
      where command.intent_token = intent.token
    );
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

revoke all on function public.reserve_pickup_notification_intent(uuid, text, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.reserve_pickup_notification_intent(uuid, text, uuid, uuid, text, text)
  to service_role;
