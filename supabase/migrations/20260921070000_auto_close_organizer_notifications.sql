begin;

create extension if not exists pg_net with schema extensions;

create table public.auto_close_notification_setting (
  singleton boolean primary key default true check (singleton),
  organizer_auth_user_id uuid unique references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.auto_close_notification_setting enable row level security;
revoke all on table public.auto_close_notification_setting from public, anon, authenticated;
grant select, insert, update, delete on table public.auto_close_notification_setting to service_role;

create or replace function public.get_auto_close_notification_setting()
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_selected_user_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin permission required' using errcode = '42501';
  end if;

  select setting.organizer_auth_user_id
  into v_selected_user_id
  from public.auto_close_notification_setting setting
  join public.line_organizer_identity identity
    on identity.auth_user_id = setting.organizer_auth_user_id
  join public.admin_users admin_user
    on admin_user.user_id = identity.auth_user_id
  where setting.singleton;

  if v_selected_user_id is null then
    return 'unconfigured';
  end if;
  if v_selected_user_id = auth.uid() then
    return 'current_user';
  end if;
  return 'other_organizer';
end;
$$;

revoke all on function public.get_auto_close_notification_setting() from public, anon;
grant execute on function public.get_auto_close_notification_setting() to authenticated, service_role;

create or replace function public.set_my_auto_close_notification_organizer()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin permission required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.line_organizer_identity identity
    join public.admin_users admin_user on admin_user.user_id = identity.auth_user_id
    where identity.auth_user_id = auth.uid()
  ) then
    raise exception 'approved LINE organizer required' using errcode = '42501';
  end if;

  insert into public.auto_close_notification_setting (
    singleton, organizer_auth_user_id, updated_at
  ) values (
    true, auth.uid(), clock_timestamp()
  )
  on conflict (singleton) do update
  set organizer_auth_user_id = auth.uid(),
      updated_at = excluded.updated_at;

  return true;
end;
$$;

revoke all on function public.set_my_auto_close_notification_organizer() from public, anon;
grant execute on function public.set_my_auto_close_notification_organizer() to authenticated, service_role;

create table public.campaign_auto_close_notification (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaign(id) on delete set null,
  close_reason text not null check (close_reason in ('scheduled', 'quantity')),
  recipient_line_user_id text,
  message_text text not null check (length(message_text) between 1 and 5000),
  line_retry_key uuid not null default gen_random_uuid(),
  delivery_status text not null check (
    delivery_status in ('ready', 'sending', 'retrying', 'sent', 'failed', 'skipped')
  ),
  attempts smallint not null default 0 check (attempts between 0 and 8),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  failure_code text,
  created_at timestamptz not null default now(),
  check (
    (delivery_status = 'skipped' and recipient_line_user_id is null)
    or (delivery_status <> 'skipped' and recipient_line_user_id ~ '^U[0-9a-fA-F]{32}$')
  )
);

create index campaign_auto_close_notification_pending_idx
  on public.campaign_auto_close_notification (next_attempt_at, created_at)
  where delivery_status in ('ready', 'retrying', 'sending');

alter table public.campaign_auto_close_notification enable row level security;
revoke all on table public.campaign_auto_close_notification from public, anon, authenticated;
grant select, insert, update, delete on table public.campaign_auto_close_notification to service_role;

create or replace function public.queue_campaign_auto_close_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_close_reason text;
  v_organizer_auth_user_id uuid;
  v_line_user_id text;
  v_failure_code text;
  v_status text;
  v_reason_label text;
begin
  if old.status <> 'open' or new.status <> 'closed' then
    return new;
  end if;

  if new.opened_at is not null
     and new.auto_close_at is not null
     and new.auto_close_at <= clock_timestamp() then
    v_close_reason := 'scheduled';
    v_reason_label := '已到設定的結單時間';
  elsif new.opened_at is not null
     and new.threshold_kind = 'quantity'
     and (
       select coalesce(sum(order_item.qty), 0)
       from public.order_item order_item
       where order_item.campaign_id = new.id
     ) >= new.threshold then
    v_close_reason := 'quantity';
    v_reason_label := '已達成團數量';
  end if;

  if v_close_reason is null then
    return new;
  end if;

  select setting.organizer_auth_user_id
  into v_organizer_auth_user_id
  from public.auto_close_notification_setting setting
  where setting.singleton;

  if v_organizer_auth_user_id is null then
    v_failure_code := 'missing_recipient_setting';
  else
    select identity.line_user_id
    into v_line_user_id
    from public.line_organizer_identity identity
    join public.admin_users admin_user on admin_user.user_id = identity.auth_user_id
    where identity.auth_user_id = v_organizer_auth_user_id;
    if v_line_user_id is null or v_line_user_id !~ '^U[0-9a-fA-F]{32}$' then
      v_failure_code := 'missing_line_identity';
      v_line_user_id := null;
    end if;
  end if;

  v_status := case when v_line_user_id is null then 'skipped' else 'ready' end;

  insert into public.campaign_auto_close_notification (
    campaign_id, close_reason, recipient_line_user_id, message_text,
    delivery_status, failure_code
  ) values (
    new.id,
    v_close_reason,
    v_line_user_id,
    '「' || new.title || '」已自動結單。' || E'\n'
      || '結單原因：' || v_reason_label || E'\n'
      || '請前往團主後台查看訂單。',
    v_status,
    v_failure_code
  );

  return new;
end;
$$;

revoke all on function public.queue_campaign_auto_close_notification() from public, anon, authenticated;

drop trigger if exists queue_campaign_auto_close_notification on public.campaign;
create trigger queue_campaign_auto_close_notification
after update on public.campaign
for each row execute function public.queue_campaign_auto_close_notification();

create or replace function public.claim_campaign_auto_close_notifications(p_limit integer default 10)
returns table (
  notification_id uuid,
  recipient_line_user_id text,
  message_text text,
  line_retry_key uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_limit < 1 or p_limit > 25 then
    raise exception 'invalid claim limit' using errcode = '22023';
  end if;

  update public.campaign_auto_close_notification notification
  set delivery_status = 'failed', failure_code = 'retry_window_expired', locked_at = null
  where notification.delivery_status in ('ready', 'retrying', 'sending')
    and notification.created_at <= clock_timestamp() - interval '24 hours';

  return query
  with invalidated as (
    update public.campaign_auto_close_notification notification
    set delivery_status = 'skipped',
        recipient_line_user_id = null,
        failure_code = 'revoked_recipient',
        locked_at = null
    where (
        notification.delivery_status in ('ready', 'retrying')
        or (
          notification.delivery_status = 'sending'
          and notification.locked_at <= clock_timestamp() - interval '2 minutes'
        )
      )
      and not exists (
        select 1
        from public.line_organizer_identity identity
        join public.admin_users admin_user on admin_user.user_id = identity.auth_user_id
        where identity.line_user_id = notification.recipient_line_user_id
      )
    returning notification.id
  ), candidates as (
    select notification.id
    from public.campaign_auto_close_notification notification
    where notification.delivery_status in ('ready', 'retrying', 'sending')
      and notification.created_at > clock_timestamp() - interval '24 hours'
      and notification.attempts < 8
      and exists (
        select 1
        from public.line_organizer_identity identity
        join public.admin_users admin_user on admin_user.user_id = identity.auth_user_id
        where identity.line_user_id = notification.recipient_line_user_id
      )
      and (
        (notification.delivery_status in ('ready', 'retrying')
          and notification.next_attempt_at <= clock_timestamp())
        or (notification.delivery_status = 'sending'
          and notification.locked_at <= clock_timestamp() - interval '2 minutes')
      )
    order by notification.next_attempt_at, notification.created_at
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.campaign_auto_close_notification notification
    set delivery_status = 'sending',
        attempts = notification.attempts + 1,
        locked_at = clock_timestamp()
    from candidates
    where notification.id = candidates.id
    returning notification.id, notification.recipient_line_user_id,
      notification.message_text, notification.line_retry_key
  )
  select claimed.id, claimed.recipient_line_user_id,
    claimed.message_text, claimed.line_retry_key
  from claimed;
end;
$$;

revoke all on function public.claim_campaign_auto_close_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_campaign_auto_close_notifications(integer) to service_role;

create or replace function public.complete_campaign_auto_close_notification(
  p_notification_id uuid,
  p_line_retry_key uuid
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

  update public.campaign_auto_close_notification notification
  set delivery_status = 'sent', sent_at = coalesce(notification.sent_at, clock_timestamp()),
      locked_at = null, failure_code = null
  where notification.id = p_notification_id
    and notification.line_retry_key = p_line_retry_key
    and notification.delivery_status = 'sending';
  if found then return true; end if;

  return exists (
    select 1 from public.campaign_auto_close_notification notification
    where notification.id = p_notification_id
      and notification.line_retry_key = p_line_retry_key
      and notification.delivery_status = 'sent'
  );
end;
$$;

revoke all on function public.complete_campaign_auto_close_notification(uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_campaign_auto_close_notification(uuid, uuid) to service_role;

create or replace function public.fail_campaign_auto_close_notification(
  p_notification_id uuid,
  p_line_retry_key uuid,
  p_retryable boolean,
  p_failure_code text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_notification public.campaign_auto_close_notification%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_failure_code not in ('timeout', 'rate_limited', 'line_server_error', 'line_rejected', 'completion_failed') then
    raise exception 'invalid failure code' using errcode = '22023';
  end if;

  select * into v_notification
  from public.campaign_auto_close_notification notification
  where notification.id = p_notification_id
    and notification.line_retry_key = p_line_retry_key
  for update;

  if not found or v_notification.delivery_status not in ('sending', 'retrying', 'failed') then
    return false;
  end if;
  if v_notification.delivery_status in ('retrying', 'failed') then
    return true;
  end if;

  update public.campaign_auto_close_notification notification
  set delivery_status = case
        when p_retryable
          and notification.attempts < 8
          and notification.created_at > clock_timestamp() - interval '24 hours'
        then 'retrying' else 'failed' end,
      next_attempt_at = case
        when p_retryable
          and notification.attempts < 8
          and notification.created_at > clock_timestamp() - interval '24 hours'
        then clock_timestamp() + make_interval(secs => least(900, 15 * power(2, notification.attempts - 1))::integer)
        else notification.next_attempt_at end,
      locked_at = null,
      failure_code = p_failure_code
  where notification.id = p_notification_id;
  return true;
end;
$$;

revoke all on function public.fail_campaign_auto_close_notification(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.fail_campaign_auto_close_notification(uuid, uuid, boolean, text) to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'deliver-auto-close-organizer-notifications';

select cron.schedule(
  'deliver-auto-close-organizer-notifications',
  '* * * * *',
  $cron$
    with worker_secrets as (
      select
        max(decrypted_secret) filter (where name = 'auto_close_notification_function_url') as function_url,
        max(decrypted_secret) filter (where name = 'auto_close_notification_cron_secret') as cron_secret
      from vault.decrypted_secrets
    )
    select net.http_post(
      url := worker_secrets.function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-auto-close-cron-secret', worker_secrets.cron_secret
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    )
    from worker_secrets
    where worker_secrets.function_url is not null
      and worker_secrets.cron_secret is not null;
  $cron$
);

commit;
