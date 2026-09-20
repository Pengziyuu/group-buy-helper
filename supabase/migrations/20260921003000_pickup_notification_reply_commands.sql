-- Replace proactive LINE pickup pushes with short-lived one-time commands
-- consumed by an authenticated group webhook reply.

do $$
begin
  lock table public.pickup_notification_intent in share row exclusive mode;
  if exists (
    select 1 from public.pickup_notification_intent intent
    where intent.delivery_status = 'sending' and intent.retain_until > clock_timestamp()
  ) then
    raise exception 'legacy pickup notification still sending' using errcode = '55000';
  end if;
end;
$$;

create table public.pickup_notification_reply_command (
  intent_token uuid primary key references public.pickup_notification_intent(token) on delete cascade,
  command_hash text not null unique check (command_hash ~ '^[0-9a-f]{64}$'),
  payload_ciphertext text not null check (length(payload_ciphertext) between 40 and 12000 and payload_ciphertext ~ '^[A-Za-z0-9_-]+$'),
  message_hash text not null check (message_hash ~ '^[0-9a-f]{64}$'),
  delivery_status text not null default 'issued' check (delivery_status in ('issued', 'replying', 'replied', 'failed')),
  webhook_event_id text unique check (webhook_event_id is null or length(webhook_event_id) between 1 and 255),
  used_by_hash text check (used_by_hash is null or used_by_hash ~ '^[0-9a-f]{64}$'),
  failure_code text check (failure_code is null or failure_code in ('recipients_changed', 'reply_failed', 'reply_timeout', 'invalid_payload')),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '10 minutes'),
  completed_at timestamptz,
  retain_until timestamptz not null default (clock_timestamp() + interval '1 hour'),
  check (expires_at <= retain_until),
  check (
    (delivery_status = 'issued' and webhook_event_id is null and used_by_hash is null and completed_at is null and failure_code is null)
    or (delivery_status = 'replying' and webhook_event_id is not null and used_by_hash is not null and completed_at is null and failure_code is null)
    or (delivery_status = 'replied' and webhook_event_id is not null and used_by_hash is not null and completed_at is not null and failure_code is null)
    or (delivery_status = 'failed' and webhook_event_id is not null and used_by_hash is not null and completed_at is not null and failure_code is not null)
  )
);

create index pickup_notification_reply_command_expiry_idx
  on public.pickup_notification_reply_command (expires_at);

alter table public.pickup_notification_reply_command enable row level security;
revoke all on table public.pickup_notification_reply_command from public, anon, authenticated;
grant select, insert, update, delete on table public.pickup_notification_reply_command to service_role;

create function public.issue_pickup_notification_reply_command(
  p_token uuid,
  p_campaign_id uuid,
  p_audience text,
  p_caller_user_id uuid,
  p_caller_hash text,
  p_binding_kind text,
  p_command_hash text,
  p_payload_ciphertext text,
  p_message_hash text
)
returns table (expires_at timestamptz, recipient_count integer, message_count integer)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_community_id uuid;
  v_group_id text;
  v_expires_at timestamptz;
  v_recipient_count integer;
  v_message_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_audience not in ('phase13', 'phase2') or p_binding_kind not in ('test', 'production')
    or p_caller_hash !~ '^[0-9a-f]{64}$' or p_command_hash !~ '^[0-9a-f]{64}$'
    or p_message_hash !~ '^[0-9a-f]{64}$'
    or length(p_payload_ciphertext) not between 40 and 12000
    or p_payload_ciphertext !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'invalid pickup reply command' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.admin_users admin
    join public.line_organizer_identity identity on identity.auth_user_id = admin.user_id
    where admin.user_id = p_caller_user_id
      and encode(digest(convert_to('pickup-caller:' || admin.user_id::text, 'UTF8'), 'sha256'), 'hex') = p_caller_hash
  ) then
    raise exception 'approved LINE organizer required' using errcode = '42501';
  end if;

  select campaign.community_id into v_community_id
  from public.campaign campaign
  where campaign.id = p_campaign_id and campaign.opened_at is not null
    and campaign.status in ('closed', 'arrived');
  if v_community_id is null then
    raise exception 'campaign must be closed' using errcode = '55000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pickup-environment:' || p_campaign_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('pickup-binding:' || v_community_id::text || ':' || p_binding_kind, 0));

  if (p_binding_kind = 'test') <> exists (
    select 1 from public.pickup_notification_test_campaign marker where marker.campaign_id = p_campaign_id
  ) then
    raise exception 'notification environment mismatch' using errcode = '42501';
  end if;
  select binding.line_group_id into v_group_id
  from public.community_line_group binding
  where binding.community_id = v_community_id and binding.binding_kind = p_binding_kind;

  select command_row.expires_at, intent.recipient_count, intent.message_count
    into v_expires_at, v_recipient_count, v_message_count
  from public.pickup_notification_intent intent
  left join public.pickup_notification_reply_command command_row on command_row.intent_token = intent.token
  where intent.token = p_token and intent.campaign_id = p_campaign_id and intent.audience = p_audience
    and intent.caller_hash = p_caller_hash and intent.binding_kind = p_binding_kind
    and intent.line_group_id = v_group_id and intent.delivery_status = 'ready'
    and intent.expires_at > clock_timestamp() and command_row.intent_token is null
  for update of intent;
  if v_recipient_count is null then
    raise exception 'notification preview expired' using errcode = 'P0002';
  end if;

  insert into public.pickup_notification_reply_command (
    intent_token, command_hash, payload_ciphertext, message_hash
  ) values (p_token, p_command_hash, p_payload_ciphertext, p_message_hash)
  returning pickup_notification_reply_command.expires_at into v_expires_at;

  update public.pickup_notification_intent intent
  set expires_at = v_expires_at
  where intent.token = p_token and intent.retain_until >= v_expires_at;
  if not found then
    raise exception 'notification command exceeds retention window' using errcode = '55000';
  end if;

  return query select v_expires_at, v_recipient_count, v_message_count;
end;
$$;

create function public.inspect_pickup_notification_reply_command(
  p_command_hash text,
  p_line_group_id text,
  p_line_user_id text
)
returns table (
  intent_token uuid,
  campaign_id uuid,
  audience text,
  binding_kind text,
  payload_ciphertext text,
  message_hash text,
  recipient_hash text,
  recipient_count integer,
  message_count integer
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_command_hash !~ '^[0-9a-f]{64}$' or p_line_group_id !~ '^C[0-9a-f]{32}$'
    or p_line_user_id !~ '^U[0-9a-f]{32}$' then
    return;
  end if;
  return query
  select intent.token, intent.campaign_id, intent.audience, intent.binding_kind,
    command_row.payload_ciphertext, command_row.message_hash, intent.recipient_hash,
    intent.recipient_count, intent.message_count
  from public.pickup_notification_reply_command command_row
  join public.pickup_notification_intent intent on intent.token = command_row.intent_token
  join public.campaign campaign on campaign.id = intent.campaign_id
  join public.community_line_group binding on binding.community_id = campaign.community_id
    and binding.binding_kind = intent.binding_kind and binding.line_group_id = p_line_group_id
  join public.line_organizer_identity identity on identity.line_user_id = p_line_user_id
  join public.admin_users admin on admin.user_id = identity.auth_user_id
  where command_row.command_hash = p_command_hash and command_row.delivery_status = 'issued'
    and command_row.expires_at > clock_timestamp() and intent.delivery_status = 'ready'
    and intent.line_group_id = p_line_group_id and campaign.opened_at is not null
    and campaign.status in ('closed', 'arrived')
    and encode(digest(convert_to('pickup-caller:' || admin.user_id::text, 'UTF8'), 'sha256'), 'hex') = intent.caller_hash
    and ((intent.binding_kind = 'test' and exists (
      select 1 from public.pickup_notification_test_campaign marker where marker.campaign_id = intent.campaign_id
    )) or (intent.binding_kind = 'production' and not exists (
      select 1 from public.pickup_notification_test_campaign marker where marker.campaign_id = intent.campaign_id
    )));
end;
$$;

create function public.claim_pickup_notification_reply_command(
  p_command_hash text,
  p_webhook_event_id text,
  p_line_group_id text,
  p_line_user_id text,
  p_recipient_hash text,
  p_eligible_hash text,
  p_message_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_command public.pickup_notification_reply_command;
  v_intent public.pickup_notification_intent;
  v_community_id uuid;
  v_user_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required' using errcode = '42501'; end if;
  if p_command_hash !~ '^[0-9a-f]{64}$' or length(p_webhook_event_id) not between 1 and 255
    or p_line_group_id !~ '^C[0-9a-f]{32}$' or p_line_user_id !~ '^U[0-9a-f]{32}$'
    or p_recipient_hash !~ '^[0-9a-f]{64}$' or p_eligible_hash !~ '^[0-9a-f]{64}$'
    or p_message_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid pickup reply claim' using errcode = '22023';
  end if;

  select command_row.* into v_command from public.pickup_notification_reply_command command_row
  where command_row.command_hash = p_command_hash;
  if v_command.intent_token is null then return false; end if;
  select intent.* into v_intent from public.pickup_notification_intent intent where intent.token = v_command.intent_token;
  select campaign.community_id into v_community_id from public.campaign campaign where campaign.id = v_intent.campaign_id;
  perform pg_advisory_xact_lock(hashtextextended('pickup-environment:' || v_intent.campaign_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('pickup-binding:' || v_community_id::text || ':' || v_intent.binding_kind, 0));
  select command_row.* into v_command from public.pickup_notification_reply_command command_row
    where command_row.command_hash = p_command_hash for update;
  select intent.* into v_intent from public.pickup_notification_intent intent where intent.token = v_command.intent_token for update;

  select identity.auth_user_id into v_user_id from public.line_organizer_identity identity
  join public.admin_users admin on admin.user_id = identity.auth_user_id
  where identity.line_user_id = p_line_user_id;
  if v_user_id is null
    or encode(digest(convert_to('pickup-caller:' || v_user_id::text, 'UTF8'), 'sha256'), 'hex') <> v_intent.caller_hash
    or v_command.delivery_status <> 'issued' or v_command.expires_at <= clock_timestamp()
    or v_intent.delivery_status <> 'ready' or v_intent.expires_at <= clock_timestamp()
    or v_intent.line_group_id <> p_line_group_id or v_intent.recipient_hash <> p_recipient_hash
    or v_command.message_hash <> p_message_hash
    or public.internal_pickup_notification_eligible_hash(v_intent.campaign_id, v_intent.audience) <> p_eligible_hash
    or not exists (
      select 1 from public.campaign campaign
      join public.community_line_group binding on binding.community_id = campaign.community_id
        and binding.binding_kind = v_intent.binding_kind and binding.line_group_id = p_line_group_id
      where campaign.id = v_intent.campaign_id and campaign.opened_at is not null
        and campaign.status in ('closed', 'arrived')
    )
    or (v_intent.binding_kind = 'test') <> exists (
      select 1 from public.pickup_notification_test_campaign marker where marker.campaign_id = v_intent.campaign_id
    ) then
    return false;
  end if;
  if exists (select 1 from public.line_webhook_event_replay replay where replay.webhook_event_id = p_webhook_event_id) then
    return false;
  end if;

  insert into public.line_webhook_event_replay (webhook_event_id, expires_at)
  values (p_webhook_event_id, greatest(v_command.retain_until, clock_timestamp() + interval '15 minutes'));
  update public.pickup_notification_reply_command command_row
  set delivery_status = 'replying', webhook_event_id = p_webhook_event_id,
      used_by_hash = encode(digest(convert_to('pickup-webhook-organizer:' || p_line_user_id, 'UTF8'), 'sha256'), 'hex')
  where command_row.intent_token = v_command.intent_token;
  return true;
end;
$$;

create function public.finish_pickup_notification_reply_command(
  p_command_hash text,
  p_webhook_event_id text,
  p_succeeded boolean,
  p_failure_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_updated integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required' using errcode = '42501'; end if;
  if p_command_hash !~ '^[0-9a-f]{64}$' or length(p_webhook_event_id) not between 1 and 255
    or (p_succeeded and p_failure_code is not null)
    or (not p_succeeded and p_failure_code not in ('reply_failed', 'reply_timeout', 'invalid_payload')) then
    raise exception 'invalid pickup reply completion' using errcode = '22023';
  end if;
  update public.pickup_notification_reply_command command_row
  set delivery_status = case when p_succeeded then 'replied' else 'failed' end,
      failure_code = case when p_succeeded then null else p_failure_code end,
      completed_at = clock_timestamp()
  where command_row.command_hash = p_command_hash
    and command_row.webhook_event_id = p_webhook_event_id
    and command_row.delivery_status = 'replying';
  get diagnostics v_updated = row_count;
  return v_updated = 1 or exists (
    select 1 from public.pickup_notification_reply_command command_row
    where command_row.command_hash = p_command_hash and command_row.webhook_event_id = p_webhook_event_id
      and command_row.delivery_status = case when p_succeeded then 'replied' else 'failed' end
  );
end;
$$;

create function public.reject_pickup_notification_reply_command(
  p_command_hash text,
  p_webhook_event_id text,
  p_line_group_id text,
  p_line_user_id text,
  p_failure_code text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_updated integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required' using errcode = '42501'; end if;
  if p_failure_code not in ('recipients_changed', 'invalid_payload') then raise exception 'invalid rejection reason' using errcode = '22023'; end if;
  insert into public.line_webhook_event_replay (webhook_event_id)
  select p_webhook_event_id
  where length(p_webhook_event_id) between 1 and 255
  on conflict do nothing;
  update public.pickup_notification_reply_command command_row
  set delivery_status = 'failed', webhook_event_id = p_webhook_event_id,
      used_by_hash = encode(digest(convert_to('pickup-webhook-organizer:' || p_line_user_id, 'UTF8'), 'sha256'), 'hex'),
      failure_code = p_failure_code, completed_at = clock_timestamp()
  from public.pickup_notification_intent intent, public.campaign campaign,
    public.community_line_group binding, public.line_organizer_identity identity, public.admin_users admin
  where command_row.command_hash = p_command_hash and command_row.delivery_status = 'issued'
    and command_row.expires_at > clock_timestamp() and intent.token = command_row.intent_token
    and campaign.id = intent.campaign_id and binding.community_id = campaign.community_id
    and binding.binding_kind = intent.binding_kind and binding.line_group_id = p_line_group_id
    and intent.line_group_id = p_line_group_id and identity.line_user_id = p_line_user_id
    and admin.user_id = identity.auth_user_id
    and encode(digest(convert_to('pickup-caller:' || admin.user_id::text, 'UTF8'), 'sha256'), 'hex') = intent.caller_hash;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create function public.complete_pickup_notification_reply_command(
  p_command_hash text,
  p_webhook_event_id text
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.finish_pickup_notification_reply_command(
    p_command_hash, p_webhook_event_id, true, null
  );
$$;

create function public.fail_pickup_notification_reply_command(
  p_command_hash text,
  p_webhook_event_id text,
  p_failure_code text
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.finish_pickup_notification_reply_command(
    p_command_hash, p_webhook_event_id, false, p_failure_code
  );
$$;

create function public.block_pickup_reply_command_reclassification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign_id uuid;
begin
  v_campaign_id := case when tg_op = 'DELETE' then old.campaign_id else new.campaign_id end;
  if exists (
    select 1 from public.pickup_notification_reply_command command_row
    join public.pickup_notification_intent intent on intent.token = command_row.intent_token
    where intent.campaign_id = v_campaign_id
      and command_row.delivery_status in ('issued', 'replying') and command_row.expires_at > clock_timestamp()
  ) then
    raise exception 'campaign pickup reply command active' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger block_pickup_reply_command_reclassification
before insert or delete on public.pickup_notification_test_campaign
for each row execute function public.block_pickup_reply_command_reclassification();

create function public.block_pickup_reply_command_rebinding()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and exists (
    select 1 from public.pickup_notification_reply_command command_row
    join public.pickup_notification_intent intent on intent.token = command_row.intent_token
    where intent.line_group_id = old.line_group_id and intent.binding_kind = old.binding_kind
      and command_row.delivery_status in ('issued', 'replying') and command_row.expires_at > clock_timestamp()
  ) then
    raise exception 'pickup reply command active for binding' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger block_pickup_reply_command_rebinding
before update or delete on public.community_line_group
for each row execute function public.block_pickup_reply_command_rebinding();

revoke all on function public.issue_pickup_notification_reply_command(uuid, uuid, text, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.inspect_pickup_notification_reply_command(text, text, text) from public, anon, authenticated;
revoke all on function public.claim_pickup_notification_reply_command(text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.finish_pickup_notification_reply_command(text, text, boolean, text) from public, anon, authenticated, service_role;
revoke all on function public.reject_pickup_notification_reply_command(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.complete_pickup_notification_reply_command(text, text) from public, anon, authenticated;
revoke all on function public.fail_pickup_notification_reply_command(text, text, text) from public, anon, authenticated;
grant execute on function public.issue_pickup_notification_reply_command(uuid, uuid, text, uuid, text, text, text, text, text) to service_role;
grant execute on function public.inspect_pickup_notification_reply_command(text, text, text) to service_role;
grant execute on function public.claim_pickup_notification_reply_command(text, text, text, text, text, text, text) to service_role;
grant execute on function public.reject_pickup_notification_reply_command(text, text, text, text, text) to service_role;
grant execute on function public.complete_pickup_notification_reply_command(text, text) to service_role;
grant execute on function public.fail_pickup_notification_reply_command(text, text, text) to service_role;

-- Retire the database entry points used only by the proactive push path.
drop function public.inspect_pickup_notification_intent(uuid, uuid, text, uuid, text, text, text);
drop function public.claim_pickup_notification_intent(uuid, uuid, text, text, text, text, uuid, text, text, text);
drop function public.mark_pickup_notification_intent_sent(uuid, uuid, text, text, text);
revoke all on function public.inspect_pickup_notification_intent(uuid, uuid, text, uuid, text) from service_role;
revoke all on function public.claim_pickup_notification_intent(uuid, uuid, text, text, text, text, uuid, text, text) from service_role;
revoke all on function public.mark_pickup_notification_intent_sent(uuid, uuid, text, text) from service_role;
drop function public.inspect_pickup_notification_intent(uuid, uuid, text, uuid, text);
drop function public.claim_pickup_notification_intent(uuid, uuid, text, text, text, text, uuid, text, text);
drop function public.mark_pickup_notification_intent_sent(uuid, uuid, text, text);
alter table public.pickup_notification_intent drop column line_retry_key;

select cron.schedule(
  'cleanup-line-pickup-reply-commands',
  '*/5 * * * *',
  $cron$
    delete from public.pickup_notification_reply_command where retain_until <= clock_timestamp();
  $cron$
);
