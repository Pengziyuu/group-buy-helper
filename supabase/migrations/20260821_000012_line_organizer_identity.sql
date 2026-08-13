-- Trusted LINE organizer approval model. Neither table is exposed to browser
-- roles or Realtime. A verified LINE subject must be explicitly approved and
-- bound to a Supabase Auth user before organizer access is granted.

create table if not exists public.line_organizer_identity (
  line_user_id text primary key,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.line_organizer_request (
  line_user_id text primary key,
  request_code uuid not null unique default gen_random_uuid(),
  display_name text,
  picture_url text,
  requested_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.line_organizer_identity enable row level security;
alter table public.line_organizer_request enable row level security;

revoke all on table public.line_organizer_identity from public, anon, authenticated;
revoke all on table public.line_organizer_request from public, anon, authenticated;
grant select, insert, update, delete on table public.line_organizer_identity to service_role;
grant select, insert, update, delete on table public.line_organizer_request to service_role;

comment on table public.line_organizer_identity is
  'Trusted LINE subject to Supabase Auth organizer binding; service-role only.';
comment on table public.line_organizer_request is
  'Verified LINE organizer login requests awaiting trusted approval; service-role only.';

create or replace function public.approve_line_organizer(
  p_request_code uuid,
  p_auth_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_line_user_id text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select r.line_user_id
  into v_line_user_id
  from public.line_organizer_request r
  where r.request_code = p_request_code
  for update;

  if v_line_user_id is null then
    raise exception 'organizer request not found' using errcode = 'PT404';
  end if;

  insert into public.line_organizer_identity (line_user_id, auth_user_id)
  values (v_line_user_id, p_auth_user_id)
  on conflict (line_user_id) do update
  set auth_user_id = excluded.auth_user_id,
      approved_at = now();

  insert into public.admin_users (user_id)
  values (p_auth_user_id)
  on conflict (user_id) do nothing;

  delete from public.line_organizer_request
  where line_user_id = v_line_user_id;

  return p_auth_user_id;
end;
$$;

revoke all on function public.approve_line_organizer(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.approve_line_organizer(uuid, uuid)
to service_role;
