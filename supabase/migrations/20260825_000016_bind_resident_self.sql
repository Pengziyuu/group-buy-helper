-- Let a verified Supabase session create its own resident profile exactly once.
-- The caller never supplies an Auth UID; auth.uid() is authoritative.

create or replace function public.bind_customer_self(
  p_name text,
  p_period integer,
  p_unit text
)
returns table (id uuid, name text, period integer, unit text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(p_name);
  v_unit text := upper(btrim(p_unit));
  v_existing public.customer%rowtype;
begin
  if v_uid is null then
    raise exception '需要有效的住戶登入';
  end if;
  if v_name is null or length(v_name) not between 1 and 100 then
    raise exception '姓名長度必須為1至100字';
  end if;
  if p_period not in (1, 2) then
    raise exception '期別只能選擇一期或二期';
  end if;
  if v_unit is null or length(v_unit) not between 1 and 20 or v_unit !~ '^[A-Z0-9]+$' then
    raise exception '戶號只能包含大寫英文字母與數字';
  end if;

  select * into v_existing
  from public.customer cu
  where cu.auth_user_id = v_uid
  for update;

  if found then
    if v_existing.name <> v_name or v_existing.period <> p_period or v_existing.unit <> v_unit then
      raise exception '此帳號已綁定其他住戶資料';
    end if;
    return query select v_existing.id, v_existing.name, v_existing.period, v_existing.unit;
    return;
  end if;

  begin
    insert into public.customer (name, period, unit, auth_user_id)
    values (v_name, p_period, v_unit, v_uid)
    returning customer.id, customer.name, customer.period, customer.unit
    into v_existing.id, v_existing.name, v_existing.period, v_existing.unit;
  exception
    when unique_violation then
      -- A concurrent call for this same Auth UID may have committed first.
      select * into v_existing
      from public.customer cu
      where cu.auth_user_id = v_uid;
      if found and v_existing.name = v_name and v_existing.period = p_period and v_existing.unit = v_unit then
        return query select v_existing.id, v_existing.name, v_existing.period, v_existing.unit;
        return;
      end if;
      raise exception '此期別與戶號已被其他住戶綁定';
  end;

  return query select v_existing.id, v_existing.name, v_existing.period, v_existing.unit;
end;
$$;

revoke all on function public.bind_customer_self(text, integer, text) from public, anon;
grant execute on function public.bind_customer_self(text, integer, text) to authenticated, service_role;

-- Resident writes remain RPC-only; administrators retain their existing policy.
revoke insert, update, delete on table public.customer from authenticated;
