-- LINE Official Account group binding, short-lived replay/idempotency state,
-- and service-role-only pickup mention recipients.

create extension if not exists pg_cron with schema pg_catalog;

create table public.community_line_group (
  community_id uuid primary key references public.community(id) on delete cascade,
  line_group_id text not null unique,
  check (line_group_id ~ '^C[0-9a-f]{32}$')
);

create table public.pickup_notification_intent (
  token uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaign(id) on delete cascade,
  audience text not null check (audience in ('phase13', 'phase2')),
  line_group_id text not null check (line_group_id ~ '^C[0-9a-f]{32}$'),
  recipient_hash text check (recipient_hash is null or recipient_hash ~ '^[0-9a-f]{64}$'),
  caller_hash text not null check (caller_hash ~ '^[0-9a-f]{64}$'),
  message_hash text check (message_hash is null or message_hash ~ '^[0-9a-f]{64}$'),
  recipient_count integer check (recipient_count is null or recipient_count between 1 and 100),
  message_count integer check (message_count is null or message_count between 1 and 5),
  line_retry_key uuid not null unique default gen_random_uuid(),
  delivery_status text not null default 'preparing'
    check (delivery_status in ('preparing', 'ready', 'sending', 'sent')),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  retain_until timestamptz not null default (now() + interval '1 hour'),
  check (expires_at <= retain_until),
  check (
    (delivery_status = 'preparing' and recipient_hash is null
      and recipient_count is null and message_count is null and message_hash is null)
    or
    (delivery_status = 'ready' and recipient_hash is not null
      and recipient_count is not null and message_count is not null and message_hash is null)
    or
    (delivery_status in ('sending', 'sent') and recipient_hash is not null
      and recipient_count is not null and message_count is not null and message_hash is not null)
  )
);
create index pickup_notification_intent_expiry_idx
  on public.pickup_notification_intent (expires_at);
create index pickup_notification_intent_caller_expiry_idx
  on public.pickup_notification_intent (caller_hash, expires_at);

create table public.line_webhook_event_replay (
  webhook_event_id text primary key check (length(webhook_event_id) between 1 and 255),
  expires_at timestamptz not null default (now() + interval '15 minutes')
);
create index line_webhook_event_replay_expiry_idx
  on public.line_webhook_event_replay (expires_at);

alter table public.community_line_group enable row level security;
alter table public.pickup_notification_intent enable row level security;
alter table public.line_webhook_event_replay enable row level security;

revoke all on table public.community_line_group from public, anon, authenticated;
revoke all on table public.pickup_notification_intent from public, anon, authenticated;
revoke all on table public.line_webhook_event_replay from public, anon, authenticated;
grant select, insert, update, delete on table public.community_line_group to service_role;
grant select, insert, update, delete on table public.pickup_notification_intent,
  public.line_webhook_event_replay to service_role;

create function public.is_approved_line_organizer()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admin_users admin_users
    join public.line_organizer_identity line_organizer_identity
      on line_organizer_identity.auth_user_id = admin_users.user_id
    where admin_users.user_id = auth.uid()
  );
$$;
revoke all on function public.is_approved_line_organizer() from public, anon;
grant execute on function public.is_approved_line_organizer() to authenticated, service_role;

create function public.internal_pickup_notification_recipients(
  p_campaign_id uuid,
  p_audience text
)
returns table (
  line_user_id text,
  member_code text,
  display_name text,
  picture_url text,
  period integer,
  unit text,
  paid boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign public.campaign;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_campaign_id is null then
    raise exception 'invalid campaign' using errcode = '22023';
  end if;
  if p_audience not in ('phase13', 'phase2') then
    raise exception 'invalid notification audience' using errcode = '22023';
  end if;

  select campaign.* into v_campaign
  from public.campaign campaign
  where campaign.id = p_campaign_id;

  if v_campaign.id is null then
    raise exception 'campaign not found' using errcode = 'P0002';
  end if;
  if v_campaign.opened_at is null or v_campaign.status not in ('closed', 'arrived') then
    raise exception 'campaign must be closed' using errcode = '55000';
  end if;

  return query
  select distinct
    identity_row.line_user_id,
    member.member_code,
    identity_row.display_name,
    identity_row.picture_url,
    customer.period,
    customer.unit,
    coalesce(payment_row.paid, false)
  from public.customer customer
  join public.orders customer_order
    on customer_order.customer_id = customer.id
    and customer_order.campaign_id = v_campaign.id
  join public.order_item order_item
    on order_item.order_id = customer_order.id
    and order_item.qty > 0
  join public.community_member member
    on member.community_id = v_campaign.community_id
    and member.user_id = customer.auth_user_id
  join public.line_resident_identity identity_row
    on identity_row.auth_user_id = customer.auth_user_id
  left join public.payment payment_row
    on payment_row.order_id = customer_order.id
  where (p_audience = 'phase13' and customer.period in (1, 3))
     or (p_audience = 'phase2' and customer.period = 2)
  order by customer.period, customer.unit, identity_row.line_user_id;
end;
$$;

create function public.internal_pickup_notification_eligible_hash(
  p_campaign_id uuid,
  p_audience text
)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select encode(
    extensions.digest(
      convert_to(coalesce(string_agg(eligible.line_user_id, E'\n' order by eligible.line_user_id), ''), 'UTF8'),
      'sha256'
    ),
    'hex'
  )
  from (
    select distinct identity_row.line_user_id
    from public.campaign campaign
    join public.orders customer_order
      on customer_order.campaign_id = campaign.id
    join public.customer customer
      on customer.id = customer_order.customer_id
    join public.order_item order_item
      on order_item.order_id = customer_order.id
      and order_item.qty > 0
    join public.community_member member
      on member.community_id = campaign.community_id
      and member.user_id = customer.auth_user_id
    join public.line_resident_identity identity_row
      on identity_row.auth_user_id = customer.auth_user_id
    where campaign.id = p_campaign_id
      and ((p_audience = 'phase13' and customer.period in (1, 3))
        or (p_audience = 'phase2' and customer.period = 2))
  ) eligible;
$$;

create function public.reserve_pickup_notification_intent(
  p_campaign_id uuid,
  p_audience text,
  p_community_id uuid,
  p_caller_user_id uuid,
  p_caller_hash text
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
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_audience not in ('phase13', 'phase2') or p_caller_hash !~ '^[0-9a-f]{64}$' then
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
  select binding.line_group_id into v_group_id
  from public.community_line_group binding
  where binding.community_id = p_community_id;
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
    campaign_id, audience, line_group_id, caller_hash
  ) values (p_campaign_id, p_audience, v_group_id, p_caller_hash)
  returning pickup_notification_intent.token into v_token;
  return query select v_token, v_group_id;
end;
$$;

create function public.finalize_pickup_notification_intent(
  p_token uuid,
  p_campaign_id uuid,
  p_audience text,
  p_caller_hash text,
  p_recipient_hash text,
  p_recipient_count integer,
  p_message_count integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_recipient_count = 0 and p_message_count = 0 then
    delete from public.pickup_notification_intent intent
    where intent.token = p_token and intent.campaign_id = p_campaign_id
      and intent.audience = p_audience and intent.caller_hash = p_caller_hash
      and intent.delivery_status = 'preparing';
    return false;
  end if;
  if p_recipient_hash !~ '^[0-9a-f]{64}$'
    or p_recipient_count not between 1 and 100 or p_message_count not between 1 and 5 then
    raise exception 'invalid notification snapshot' using errcode = '22023';
  end if;
  update public.pickup_notification_intent intent
  set recipient_hash = p_recipient_hash,
      recipient_count = p_recipient_count,
      message_count = p_message_count,
      delivery_status = 'ready'
  where intent.token = p_token and intent.campaign_id = p_campaign_id
    and intent.audience = p_audience and intent.caller_hash = p_caller_hash
    and intent.delivery_status = 'preparing' and intent.expires_at > now();
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'notification preview expired' using errcode = 'P0002';
  end if;
  return true;
end;
$$;

create function public.inspect_pickup_notification_intent(
  p_token uuid,
  p_campaign_id uuid,
  p_audience text,
  p_caller_user_id uuid,
  p_caller_hash text
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
  if not exists (
    select 1 from public.admin_users admin_users
    join public.line_organizer_identity line_organizer_identity
      on line_organizer_identity.auth_user_id = admin_users.user_id
    where admin_users.user_id = p_caller_user_id
  ) then
    raise exception 'approved LINE organizer required' using errcode = '42501';
  end if;
  return query
  select intent.delivery_status, intent.recipient_count, intent.message_count
  from public.pickup_notification_intent intent
  where intent.token = p_token and intent.campaign_id = p_campaign_id
    and intent.audience = p_audience and intent.caller_hash = p_caller_hash
    and intent.expires_at > now();
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
  p_message_hash text
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
  v_intent public.pickup_notification_intent;
  v_updated integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  select intent.* into v_intent
  from public.pickup_notification_intent intent
  where intent.token = p_token
  for update;

  if v_intent.token is null or v_intent.expires_at <= now() then
    raise exception 'notification preview expired' using errcode = 'P0002';
  end if;
  if v_intent.campaign_id <> p_campaign_id or v_intent.audience <> p_audience
    or v_intent.caller_hash <> p_caller_hash then
    raise exception 'notification preview mismatch' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.admin_users admin_users
    join public.line_organizer_identity line_organizer_identity
      on line_organizer_identity.auth_user_id = admin_users.user_id
    where admin_users.user_id = p_caller_user_id
  ) then
    raise exception 'approved LINE organizer required' using errcode = '42501';
  end if;

  if v_intent.delivery_status = 'sent' then
    return query select v_intent.line_retry_key, v_intent.delivery_status,
      v_intent.recipient_count, v_intent.message_count;
    return;
  end if;
  if v_intent.delivery_status = 'preparing' then
    raise exception 'notification preview incomplete' using errcode = '55000';
  end if;
  if v_intent.recipient_hash <> p_recipient_hash then
    raise exception 'notification recipients changed' using errcode = '40001';
  end if;
  if v_intent.message_hash is not null and v_intent.message_hash <> p_message_hash then
    raise exception 'notification message changed after send' using errcode = '40001';
  end if;
  if v_intent.delivery_status = 'sending' then
    return query select v_intent.line_retry_key, v_intent.delivery_status,
      v_intent.recipient_count, v_intent.message_count;
    return;
  end if;

  if p_eligible_hash !~ '^[0-9a-f]{64}$' or p_line_group_id !~ '^C[0-9a-f]{32}$' then
    raise exception 'invalid notification snapshot' using errcode = '22023';
  end if;

  update public.pickup_notification_intent intent
  set delivery_status = 'sending',
      message_hash = p_message_hash,
      expires_at = intent.retain_until
  from public.campaign campaign
  where intent.token = v_intent.token
    and intent.delivery_status = 'ready'
    and campaign.id = intent.campaign_id
    and campaign.opened_at is not null
    and campaign.status in ('closed', 'arrived')
    and intent.line_group_id = p_line_group_id
    and exists (
      select 1 from public.community_line_group binding
      where binding.community_id = campaign.community_id
        and binding.line_group_id = p_line_group_id
    )
    and public.internal_pickup_notification_eligible_hash(
      intent.campaign_id, intent.audience
    ) = p_eligible_hash
    and exists (
      select 1 from public.admin_users admin_users
      join public.line_organizer_identity line_organizer_identity
        on line_organizer_identity.auth_user_id = admin_users.user_id
      where admin_users.user_id = p_caller_user_id
    );
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'notification snapshot changed' using errcode = '40001';
  end if;
  v_intent.delivery_status := 'sending';
  return query select v_intent.line_retry_key, v_intent.delivery_status,
    v_intent.recipient_count, v_intent.message_count;
end;
$$;

create function public.mark_pickup_notification_intent_sent(
  p_token uuid,
  p_campaign_id uuid,
  p_audience text,
  p_caller_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  update public.pickup_notification_intent intent
  set delivery_status = 'sent', expires_at = intent.retain_until
  where intent.token = p_token and intent.campaign_id = p_campaign_id
    and intent.audience = p_audience and intent.caller_hash = p_caller_hash
    and intent.delivery_status = 'sending';
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create function public.process_line_group_binding_event(
  p_webhook_event_id text,
  p_community_id uuid,
  p_line_group_id text,
  p_line_user_id text
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
    or p_line_group_id !~ '^C[0-9a-f]{32}$' or p_line_user_id !~ '^U[0-9a-f]{32}$' then
    raise exception 'invalid LINE binding event' using errcode = '22023';
  end if;
  insert into public.line_webhook_event_replay (webhook_event_id)
  values (p_webhook_event_id)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return 'duplicate'; end if;

  if not exists (
    select 1 from public.line_organizer_identity line_organizer_identity
    join public.admin_users admin_users
      on admin_users.user_id = line_organizer_identity.auth_user_id
    where line_organizer_identity.line_user_id = p_line_user_id
  ) then
    return 'forbidden';
  end if;

  insert into public.community_line_group (community_id, line_group_id)
  values (p_community_id, p_line_group_id)
  on conflict (community_id) do update set line_group_id = excluded.line_group_id;
  return 'bound';
end;
$$;

revoke all on function public.internal_pickup_notification_recipients(uuid, text) from public, anon, authenticated;
revoke all on function public.internal_pickup_notification_eligible_hash(uuid, text) from public, anon, authenticated;
revoke all on function public.reserve_pickup_notification_intent(uuid, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.finalize_pickup_notification_intent(uuid, uuid, text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.inspect_pickup_notification_intent(uuid, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.claim_pickup_notification_intent(uuid, uuid, text, text, text, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.mark_pickup_notification_intent_sent(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.process_line_group_binding_event(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.internal_pickup_notification_recipients(uuid, text) to service_role;
grant execute on function public.internal_pickup_notification_eligible_hash(uuid, text) to service_role;
grant execute on function public.reserve_pickup_notification_intent(uuid, text, uuid, uuid, text) to service_role;
grant execute on function public.finalize_pickup_notification_intent(uuid, uuid, text, text, text, integer, integer) to service_role;
grant execute on function public.inspect_pickup_notification_intent(uuid, uuid, text, uuid, text) to service_role;
grant execute on function public.claim_pickup_notification_intent(uuid, uuid, text, text, text, text, uuid, text, text) to service_role;
grant execute on function public.mark_pickup_notification_intent_sent(uuid, uuid, text, text) to service_role;
grant execute on function public.process_line_group_binding_event(text, uuid, text, text) to service_role;

select cron.schedule(
  'cleanup-line-notification-technical-state',
  '*/5 * * * *',
  $cron$
    delete from public.pickup_notification_intent where expires_at <= now();
    delete from public.line_webhook_event_replay where expires_at <= now();
  $cron$
);
