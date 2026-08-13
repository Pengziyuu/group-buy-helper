-- Close alternate-auth bypasses for LINE organizers and rate-limit the
-- public LINE verification endpoint before it performs an outbound request.

-- Preserve a non-public reconciliation key so approval retries can determine
-- whether an ambiguous RPC response committed. Existing browser roles have no
-- privileges on this table.
alter table public.line_organizer_identity
  add column approval_request_code uuid unique;

create or replace function public.approve_line_organizer(
  p_request_code uuid,
  p_auth_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_request public.line_organizer_request%rowtype;
  v_existing uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;

  select auth_user_id into v_existing
  from public.line_organizer_identity
  where approval_request_code = p_request_code;
  if v_existing is not null then
    if v_existing <> p_auth_user_id then
      raise exception 'approval already belongs to another auth user' using errcode = '23505';
    end if;
    return v_existing;
  end if;

  select * into v_request
  from public.line_organizer_request
  where request_code = p_request_code
  for update;
  if not found then
    raise exception 'organizer request not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from auth.users where id = p_auth_user_id) then
    raise exception 'auth user not found' using errcode = '23503';
  end if;

  insert into public.line_organizer_identity (
    line_user_id,
    auth_user_id,
    approval_request_code
  ) values (
    v_request.line_user_id,
    p_auth_user_id,
    p_request_code
  );
  insert into public.admin_users (user_id)
  values (p_auth_user_id)
  on conflict (user_id) do nothing;
  delete from public.line_organizer_request
  where line_user_id = v_request.line_user_id;

  return p_auth_user_id;
end;
$$;

revoke all on function public.approve_line_organizer(uuid, uuid) from public, anon, authenticated;
grant execute on function public.approve_line_organizer(uuid, uuid) to service_role;

create table public.line_login_rate_limit (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default clock_timestamp(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.line_login_rate_limit enable row level security;
revoke all on table public.line_login_rate_limit from public, anon, authenticated;
grant select, insert, update, delete on table public.line_login_rate_limit to service_role;

create or replace function public.consume_line_login_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_window_started_at timestamptz;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;
  if p_key_hash !~ '^[0-9a-f]{64}$' or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit parameters' using errcode = '22023';
  end if;

  insert into public.line_login_rate_limit (key_hash, request_count)
  values (p_key_hash, 1)
  on conflict (key_hash) do update
  set
    window_started_at = case
      when public.line_login_rate_limit.window_started_at <= clock_timestamp() - make_interval(secs => p_window_seconds)
        then clock_timestamp()
      else public.line_login_rate_limit.window_started_at
    end,
    request_count = case
      when public.line_login_rate_limit.window_started_at <= clock_timestamp() - make_interval(secs => p_window_seconds)
        then 1
      else public.line_login_rate_limit.request_count + 1
    end,
    updated_at = clock_timestamp()
  returning request_count, window_started_at into v_count, v_window_started_at;

  delete from public.line_login_rate_limit
  where updated_at < clock_timestamp() - interval '1 day';

  return v_count <= p_limit
    and v_window_started_at > clock_timestamp() - make_interval(secs => p_window_seconds);
end;
$$;

revoke all on function public.consume_line_login_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_line_login_rate_limit(text, integer, integer)
  to service_role;

create or replace function public.line_organizer_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_method text;
begin
  v_user_id := nullif(event ->> 'user_id', '')::uuid;
  v_method := coalesce(event ->> 'authentication_method', '');

  if exists (
    select 1
    from public.line_organizer_identity
    where auth_user_id = v_user_id
  ) and v_method not in ('magiclink', 'token_refresh') then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'LINE organizer must authenticate through LINE'
      )
    );
  end if;

  return event;
exception
  when invalid_text_representation then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 400,
        'message', 'Invalid authentication event'
      )
    );
end;
$$;

revoke all on function public.line_organizer_access_token_hook(jsonb)
  from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.line_organizer_access_token_hook(jsonb)
  to supabase_auth_admin;
