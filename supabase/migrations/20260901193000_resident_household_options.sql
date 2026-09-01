-- Complete resident household plan and organizer-managed household corrections.
-- Phase one: A-Z + 1-15. Phases two and three: prefix 1-3 + A-Z + 1-15.

create function public.valid_resident_household(p_period integer, p_unit text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(
    (p_period = 1 and p_unit ~ '^[A-Z]([1-9]|1[0-5])$')
    or (p_period in (2, 3) and p_unit ~ '^[1-3][A-Z]([1-9]|1[0-5])$'),
    false
  );
$$;

revoke all on function public.valid_resident_household(integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.valid_resident_household(integer, text)
  to authenticated, service_role;

-- NOT VALID avoids taking an unnecessarily strong initial scan lock while adding the
-- constraint. The explicit validation proves all current hosted/local rows are ready.
alter table public.customer
  add constraint customer_household_format
  check (public.valid_resident_household(period, unit)) not valid;
alter table public.customer validate constraint customer_household_format;

create or replace function public.bind_customer_self(p_period integer, p_unit text)
returns table (id uuid, name text, picture_url text, period integer, unit text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text;
  v_picture_url text;
  v_unit text := upper(btrim(p_unit));
  v_existing public.customer%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not public.valid_resident_household(p_period, v_unit) then
    raise exception '住戶期別或戶號不符合社區編碼' using errcode = '22023';
  end if;

  select l.display_name, l.picture_url into v_name, v_picture_url
  from public.line_resident_identity l
  where l.auth_user_id = v_user_id;
  if v_name is null then
    raise exception '請先完成LINE住戶驗證' using errcode = '42501';
  end if;

  select * into v_existing
  from public.customer
  where auth_user_id = v_user_id
  for update;
  if found then
    if v_existing.period <> p_period or v_existing.unit <> v_unit then
      raise exception '住戶資料已綁定，如需變更請聯絡團主' using errcode = '23505';
    end if;
    update public.customer as customer
    set name = v_name, picture_url = v_picture_url
    where customer.id = v_existing.id;
    return query select v_existing.id, v_name, v_picture_url, v_existing.period, v_existing.unit;
    return;
  end if;

  begin
    insert into public.customer (name, picture_url, period, unit, auth_user_id)
    values (v_name, v_picture_url, p_period, v_unit, v_user_id)
    returning customer.id, customer.name, customer.picture_url, customer.period, customer.unit
    into id, name, picture_url, period, unit;
    return next;
  exception when unique_violation then
    select * into v_existing
    from public.customer
    where auth_user_id = v_user_id;
    if found and v_existing.period = p_period and v_existing.unit = v_unit then
      return query select v_existing.id, v_existing.name, v_existing.picture_url,
                          v_existing.period, v_existing.unit;
      return;
    end if;
    raise exception '此期別與戶號已由其他住戶綁定' using errcode = '23505';
  end;
end;
$$;

revoke all on function public.bind_customer_self(integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.bind_customer_self(integer, text)
  to authenticated, service_role;

create function public.admin_update_resident_household(
  p_member_code text,
  p_period integer,
  p_unit text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_community_id constant uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_user_id uuid;
  v_unit text := upper(btrim(p_unit));
  v_updated integer;
begin
  if not public.is_admin() then
    raise exception 'admin required' using errcode = '42501';
  end if;
  if p_member_code is null or p_member_code !~ '^[0-9a-f]{36}$' then
    raise exception 'invalid member code' using errcode = '22023';
  end if;
  if not public.valid_resident_household(p_period, v_unit) then
    raise exception '住戶期別或戶號不符合社區編碼' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('resident-member:' || p_member_code, 0));

  select resident.user_id into v_user_id
  from (
    select member.user_id
    from public.community_member member
    where member.community_id = v_community_id
      and member.member_code = p_member_code
    union all
    select blocked.user_id
    from public.community_resident_block blocked
    where blocked.community_id = v_community_id
      and blocked.member_code = p_member_code
  ) resident
  limit 1;

  if v_user_id is null then
    raise exception 'resident member not found' using errcode = 'P0002';
  end if;

  begin
    update public.customer
    set period = p_period,
        unit = v_unit
    where auth_user_id = v_user_id;
    get diagnostics v_updated = row_count;
  exception when unique_violation then
    raise exception '此期別與戶號已由其他住戶綁定' using errcode = '23505';
  end;

  if v_updated <> 1 then
    raise exception '住戶尚未綁定期別／戶號' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_update_resident_household(text, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_update_resident_household(text, integer, text)
  to authenticated, service_role;
