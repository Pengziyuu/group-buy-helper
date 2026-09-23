-- Only a first-time resident admission needs current production LINE group membership.
-- Historical admission survives manual membership removal; blocks still take priority.
create table public.community_resident_admission (
  community_id uuid not null references public.community(id) on delete cascade,
  line_user_id text not null,
  admitted_at timestamptz not null default now(),
  primary key (community_id, line_user_id)
);
alter table public.community_resident_admission enable row level security;
revoke all on public.community_resident_admission from public, anon, authenticated;
grant select, insert on public.community_resident_admission to service_role;

insert into public.community_resident_admission (community_id, line_user_id, admitted_at)
select member.community_id, identity.line_user_id, member.joined_at
from public.community_member member
join public.line_resident_identity identity on identity.auth_user_id = member.user_id
union
select block.community_id, block.line_user_id, block.joined_at
from public.community_resident_block block
on conflict (community_id, line_user_id) do nothing;

alter table public.community_line_group
  add column binding_revision uuid not null default extensions.gen_random_uuid();
create function public.rotate_line_group_binding_revision()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.binding_revision := extensions.gen_random_uuid();
  return new;
end;
$$;
create trigger rotate_line_group_binding_revision
before update of line_group_id, binding_kind on public.community_line_group
for each row execute function public.rotate_line_group_binding_revision();
revoke all on function public.rotate_line_group_binding_revision() from public, anon, authenticated;

create table public.resident_group_check (
  community_id uuid not null references public.community(id) on delete cascade,
  line_user_id text not null,
  binding_revision uuid not null,
  group_status text not null check (group_status in ('in_group','not_in_group','unknown')),
  group_checked_at timestamptz not null,
  primary key (community_id, line_user_id)
);
alter table public.resident_group_check enable row level security;
revoke all on public.resident_group_check from public, anon, authenticated;
grant select, insert, update on public.resident_group_check to service_role;

-- The old four-argument entry point must not remain capable of admitting newcomers.
-- Replace it with a seven-argument service-only function; null proof is allowed only
-- when the LINE subject was already admitted, never on the basis of Auth identity.
drop function public.provision_line_resident(text, uuid, text, text);
create function public.provision_line_resident(
  p_line_user_id text, p_auth_user_id uuid, p_display_name text, p_picture_url text,
  p_group_id text, p_binding_revision uuid, p_group_checked_at timestamptz
)
returns table (community_id uuid, display_name text, picture_url text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_community_id constant uuid := '00000000-0000-4000-8000-000000000001';
  v_organizer_auth_user_id uuid;
  v_resident_auth_user_id uuid;
  v_display_name text := btrim(p_display_name);
  v_picture_url text := nullif(btrim(coalesce(p_picture_url, '')), '');
  v_existing boolean;
begin
  if p_line_user_id is null or p_line_user_id = '' or length(p_line_user_id) > 255
    or p_auth_user_id is null or length(v_display_name) not between 1 and 100
    or (v_picture_url is not null and length(v_picture_url) > 2000) then
    raise exception 'invalid resident identity' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('line-subject:' || p_line_user_id, 0));
  perform pg_advisory_xact_lock(hashtextextended('line-auth:' || p_auth_user_id::text, 0));
  if exists (select 1 from public.community_resident_block b
             where b.community_id = v_community_id and b.line_user_id = p_line_user_id) then
    raise exception 'resident blocked' using errcode = '42501';
  end if;
  select l.auth_user_id into v_organizer_auth_user_id from public.line_organizer_identity l
    where l.line_user_id = p_line_user_id;
  select l.auth_user_id into v_resident_auth_user_id from public.line_resident_identity l
    where l.line_user_id = p_line_user_id;
  if (v_organizer_auth_user_id is not null and v_organizer_auth_user_id <> p_auth_user_id)
    or (v_resident_auth_user_id is not null and v_resident_auth_user_id <> p_auth_user_id)
    or exists (select 1 from public.line_resident_identity l
      where l.auth_user_id = p_auth_user_id and l.line_user_id <> p_line_user_id) then
    raise exception 'LINE resident identity conflict' using errcode = '23505';
  end if;
  if not exists (select 1 from public.community c where c.id = v_community_id and c.active) then
    raise exception 'resident community unavailable' using errcode = '42501';
  end if;
  select exists (select 1 from public.community_resident_admission a
    where a.community_id = v_community_id and a.line_user_id = p_line_user_id) into v_existing;
  if not v_existing then
    if p_group_id is null or p_binding_revision is null or p_group_checked_at is null
      or p_group_checked_at > now() + interval '5 seconds'
      or p_group_checked_at < now() - interval '30 seconds'
      or not exists (select 1 from public.community_line_group g
        where g.community_id = v_community_id and g.binding_kind = 'production'
          and g.line_group_id = p_group_id and g.binding_revision = p_binding_revision
        for share) then
      raise exception 'GROUP_MEMBERSHIP_UNAVAILABLE' using errcode = '42501';
    end if;
  end if;
  insert into public.line_resident_identity
    (line_user_id, auth_user_id, display_name, picture_url, last_verified_at)
  values (p_line_user_id, p_auth_user_id, v_display_name, v_picture_url, now())
  on conflict (line_user_id) do update
  set display_name = excluded.display_name, picture_url = excluded.picture_url, last_verified_at = now();
  insert into public.community_member (community_id, user_id)
  values (v_community_id, p_auth_user_id)
  on conflict on constraint community_member_pkey do nothing;
  insert into public.community_resident_admission (community_id, line_user_id)
  values (v_community_id, p_line_user_id) on conflict do nothing;
  if not v_existing then
    insert into public.resident_group_check
      (community_id, line_user_id, binding_revision, group_status, group_checked_at)
    values (v_community_id, p_line_user_id, p_binding_revision, 'in_group', p_group_checked_at)
    on conflict on constraint resident_group_check_pkey do update
    set binding_revision = excluded.binding_revision, group_status = excluded.group_status,
        group_checked_at = excluded.group_checked_at;
  end if;
  update public.customer set name = v_display_name, picture_url = v_picture_url
    where auth_user_id = p_auth_user_id;
  return query select v_community_id, v_display_name, v_picture_url;
end;
$$;
revoke all on function public.provision_line_resident(text,uuid,text,text,text,uuid,timestamptz)
  from public, anon, authenticated;
grant execute on function public.provision_line_resident(text,uuid,text,text,text,uuid,timestamptz) to service_role;

create function public.admin_list_resident_group_statuses()
returns table (member_code text, group_status text, group_checked_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'admin required' using errcode = '42501'; end if;
  return query
  with residents as (
    select m.member_code, i.line_user_id, m.community_id
    from public.community_member m join public.line_resident_identity i on i.auth_user_id = m.user_id
    where m.community_id = '00000000-0000-4000-8000-000000000001'
    union all
    select b.member_code, b.line_user_id, b.community_id from public.community_resident_block b
    where b.community_id = '00000000-0000-4000-8000-000000000001'
  )
  select r.member_code,
    case when g.binding_revision = s.binding_revision then s.group_status else 'unchecked' end,
    case when g.binding_revision = s.binding_revision then s.group_checked_at else null::timestamptz end
  from residents r
  left join public.community_line_group g on g.community_id = r.community_id and g.binding_kind = 'production'
  left join public.resident_group_check s on s.community_id = r.community_id and s.line_user_id = r.line_user_id;
end;
$$;
revoke all on function public.admin_list_resident_group_statuses() from public, anon;
grant execute on function public.admin_list_resident_group_statuses() to authenticated;

create function public.service_resident_group_candidates(p_member_codes text[])
returns table (member_code text, line_user_id text, binding_revision uuid, line_group_id text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_codes integer;
begin
  v_codes := cardinality(p_member_codes);
  if p_member_codes is null or v_codes < 1 or v_codes > 20
    or (select count(distinct x) from unnest(p_member_codes) x) <> v_codes then
    raise exception 'invalid member codes' using errcode = '22023';
  end if;
  return query
    with residents as (
      select m.member_code, i.line_user_id, m.community_id
      from public.community_member m join public.line_resident_identity i on i.auth_user_id = m.user_id
      where m.community_id = '00000000-0000-4000-8000-000000000001'
      union all
      select b.member_code, b.line_user_id, b.community_id from public.community_resident_block b
      where b.community_id = '00000000-0000-4000-8000-000000000001'
    )
    select r.member_code, r.line_user_id, g.binding_revision, g.line_group_id
    from unnest(p_member_codes) requested(code)
    join residents r on r.member_code = requested.code
    left join public.community_line_group g on g.community_id = r.community_id and g.binding_kind = 'production';
end;
$$;
revoke all on function public.service_resident_group_candidates(text[]) from public, anon, authenticated;
grant execute on function public.service_resident_group_candidates(text[]) to service_role;

create function public.service_record_resident_group_checks(p_binding_revision uuid, p_checks jsonb, p_checked_at timestamptz)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_size integer; v_written integer;
begin
  v_size := case when jsonb_typeof(p_checks) = 'array' then jsonb_array_length(p_checks) else 0 end;
  if v_size < 1 or v_size > 20 or p_binding_revision is null or p_checked_at is null
    or p_checked_at > now() + interval '5 seconds' or p_checked_at < now() - interval '30 seconds'
    or (select count(distinct x->>'line_user_id') from jsonb_array_elements(p_checks) x) <> v_size
    or exists (select 1 from jsonb_array_elements(p_checks) x
      where x->>'group_status' not in ('in_group','not_in_group','unknown')
        or length(coalesce(x->>'line_user_id','')) < 2) then
    raise exception 'invalid group check' using errcode = '22023';
  end if;
  if not exists (select 1 from public.community_line_group g
    where g.community_id = '00000000-0000-4000-8000-000000000001' and g.binding_kind = 'production'
      and g.binding_revision = p_binding_revision for share) then
    raise exception 'group binding changed' using errcode = '55000';
  end if;
  insert into public.resident_group_check
    (community_id, line_user_id, binding_revision, group_status, group_checked_at)
  select '00000000-0000-4000-8000-000000000001'::uuid, x->>'line_user_id',
    p_binding_revision, x->>'group_status', p_checked_at
  from jsonb_array_elements(p_checks) x
  on conflict (community_id, line_user_id) do update
  set binding_revision = excluded.binding_revision, group_status = excluded.group_status,
      group_checked_at = excluded.group_checked_at
  where public.resident_group_check.group_checked_at <= excluded.group_checked_at;
  get diagnostics v_written = row_count;
  if v_written <> v_size then
    raise exception 'newer group check already recorded' using errcode = '55000';
  end if;
end;
$$;
revoke all on function public.service_record_resident_group_checks(uuid,jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.service_record_resident_group_checks(uuid,jsonb,timestamptz) to service_role;

-- Identity alone must never count as a restored resident session.
create or replace function public.get_line_resident_self()
returns table (display_name text, picture_url text)
language sql stable security definer set search_path = public, pg_temp as $$
  select l.display_name, l.picture_url from public.line_resident_identity l
  join public.community_member m on m.user_id = l.auth_user_id
    and m.community_id = '00000000-0000-4000-8000-000000000001'
  join public.community_resident_admission a on a.community_id = m.community_id
    and a.line_user_id = l.line_user_id
  where l.auth_user_id = auth.uid();
$$;
