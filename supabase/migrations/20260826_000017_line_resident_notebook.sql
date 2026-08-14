-- Trusted LINE resident identity, community-scoped campaign discovery, and notebook avatars.

create table public.community (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  name text not null check (length(btrim(name)) between 1 and 100),
  invite_slug text not null default encode(extensions.gen_random_bytes(18), 'hex'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (invite_slug),
  check (invite_slug ~ '^[0-9a-f]{36}$')
);

insert into public.community (id, name)
values ('00000000-0000-4000-8000-000000000001', '預設社區');

alter table public.campaign
  add column community_id uuid references public.community(id) on delete restrict
  default '00000000-0000-4000-8000-000000000001';
update public.campaign
set community_id = '00000000-0000-4000-8000-000000000001'
where community_id is null;
alter table public.campaign alter column community_id set not null;
alter table public.campaign add constraint campaign_single_community
  check (community_id = '00000000-0000-4000-8000-000000000001');
create index campaign_community_opened_idx on public.campaign (community_id, opened_at desc);

create table public.community_member (
  community_id uuid not null references public.community(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);
create index community_member_user_idx on public.community_member (user_id, community_id);

create table public.line_resident_identity (
  line_user_id text primary key,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 100),
  picture_url text check (picture_url is null or length(picture_url) <= 2000),
  created_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now()
);

alter table public.customer add column picture_url text
  check (picture_url is null or length(picture_url) <= 2000);

alter table public.community enable row level security;
alter table public.community_member enable row level security;
alter table public.line_resident_identity enable row level security;

revoke all on table public.community from public, anon, authenticated;
revoke all on table public.community_member from public, anon, authenticated;
revoke all on table public.line_resident_identity from public, anon, authenticated;
grant select, insert, update, delete on table public.community, public.community_member,
  public.line_resident_identity to service_role;

create function public.provision_line_resident(
  p_line_user_id text,
  p_auth_user_id uuid,
  p_display_name text,
  p_picture_url text,
  p_invite_slug text
)
returns table (community_id uuid, display_name text, picture_url text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_community_id uuid;
  v_organizer_auth_user_id uuid;
  v_resident_auth_user_id uuid;
  v_display_name text := btrim(p_display_name);
  v_picture_url text := nullif(btrim(coalesce(p_picture_url, '')), '');
begin
  if p_line_user_id is null or p_line_user_id = '' or length(p_line_user_id) > 255 then
    raise exception 'invalid LINE identity' using errcode = '22023';
  end if;
  if p_auth_user_id is null then
    raise exception 'invalid auth identity' using errcode = '22023';
  end if;
  if length(v_display_name) not between 1 and 100 then
    raise exception 'invalid LINE display name' using errcode = '22023';
  end if;
  if v_picture_url is not null and length(v_picture_url) > 2000 then
    raise exception 'invalid LINE picture URL' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('line-subject:' || p_line_user_id, 0));
  perform pg_advisory_xact_lock(hashtextextended('line-auth:' || p_auth_user_id::text, 0));

  select l.auth_user_id into v_organizer_auth_user_id
  from public.line_organizer_identity l
  where l.line_user_id = p_line_user_id;
  if v_organizer_auth_user_id is not null and v_organizer_auth_user_id <> p_auth_user_id then
    raise exception 'LINE organizer identity conflict' using errcode = '23505';
  end if;

  select l.auth_user_id into v_resident_auth_user_id
  from public.line_resident_identity l
  where l.line_user_id = p_line_user_id;
  if v_resident_auth_user_id is not null and v_resident_auth_user_id <> p_auth_user_id then
    raise exception 'LINE resident identity conflict' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.line_resident_identity l
    where l.auth_user_id = p_auth_user_id and l.line_user_id <> p_line_user_id
  ) then
    raise exception 'Auth identity already belongs to another LINE resident' using errcode = '23505';
  end if;

  select c.id into v_community_id
  from public.community c
  where c.id = '00000000-0000-4000-8000-000000000001'
    and c.invite_slug = p_invite_slug
    and c.active;
  if v_community_id is null then
    raise exception 'invalid community invitation' using errcode = '42501';
  end if;

  insert into public.line_resident_identity (
    line_user_id, auth_user_id, display_name, picture_url, last_verified_at
  ) values (
    p_line_user_id, p_auth_user_id, v_display_name, v_picture_url, now()
  )
  on conflict (line_user_id) do update
  set display_name = excluded.display_name,
      picture_url = excluded.picture_url,
      last_verified_at = now();

  insert into public.community_member (community_id, user_id)
  values (v_community_id, p_auth_user_id)
  on conflict do nothing;

  update public.customer
  set name = v_display_name, picture_url = v_picture_url
  where auth_user_id = p_auth_user_id;

  return query select v_community_id, v_display_name, v_picture_url;
end;
$$;

revoke all on function public.provision_line_resident(text, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.provision_line_resident(text, uuid, text, text, text)
  to service_role;

create or replace function public.has_campaign_access(p_campaign_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.campaign_access access
    join public.campaign campaign on campaign.id = access.campaign_id
    join public.community_member member
      on member.community_id = campaign.community_id
      and member.user_id = access.user_id
    where access.campaign_id = p_campaign_id
      and access.user_id = auth.uid()
      and campaign.opened_at is not null
  );
$$;

create or replace function public.customer_is_wall_visible(p_customer_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.orders customer_order
    join public.campaign campaign on campaign.id = customer_order.campaign_id
    join public.campaign_access access
      on access.campaign_id = customer_order.campaign_id
      and access.user_id = auth.uid()
    join public.community_member member
      on member.community_id = campaign.community_id
      and member.user_id = auth.uid()
    where customer_order.customer_id = p_customer_id
      and campaign.opened_at is not null
  );
$$;

create or replace function public.can_edit_order(p_order_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.orders customer_order
    join public.customer customer on customer.id = customer_order.customer_id
    join public.campaign campaign on campaign.id = customer_order.campaign_id
    join public.community_member member
      on member.community_id = campaign.community_id
      and member.user_id = auth.uid()
    where customer_order.id = p_order_id
      and customer.auth_user_id = auth.uid()
      and campaign.status = 'open'
      and campaign.deadline > now()
  );
$$;

create or replace function public.get_line_organizer_candidate_auth_user(p_request_code uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select resident.auth_user_id
  from public.line_organizer_request request
  join public.line_resident_identity resident
    on resident.line_user_id = request.line_user_id
  where request.request_code = p_request_code;
$$;
revoke all on function public.get_line_organizer_candidate_auth_user(uuid)
  from public, anon, authenticated;
grant execute on function public.get_line_organizer_candidate_auth_user(uuid)
  to service_role;

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
  v_resident_auth_user_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;

  select identity.auth_user_id into v_existing
  from public.line_organizer_identity identity
  where identity.approval_request_code = p_request_code;
  if v_existing is not null then
    if v_existing <> p_auth_user_id then
      raise exception 'approval already belongs to another auth user' using errcode = '23505';
    end if;
    return v_existing;
  end if;

  select * into v_request
  from public.line_organizer_request request
  where request.request_code = p_request_code
  for update;
  if not found then
    raise exception 'organizer request not found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('line-subject:' || v_request.line_user_id, 0));
  perform pg_advisory_xact_lock(hashtextextended('line-auth:' || p_auth_user_id::text, 0));

  select resident.auth_user_id into v_resident_auth_user_id
  from public.line_resident_identity resident
  where resident.line_user_id = v_request.line_user_id;
  if v_resident_auth_user_id is not null and v_resident_auth_user_id <> p_auth_user_id then
    raise exception 'LINE resident identity must reuse its existing auth user' using errcode = '23505';
  end if;
  if exists (
    select 1
    from public.line_resident_identity resident
    where resident.auth_user_id = p_auth_user_id
      and resident.line_user_id <> v_request.line_user_id
  ) then
    raise exception 'Auth identity already belongs to another LINE resident' using errcode = '23505';
  end if;
  if not exists (select 1 from auth.users where id = p_auth_user_id) then
    raise exception 'auth user not found' using errcode = '23503';
  end if;

  insert into public.line_organizer_identity (
    line_user_id, auth_user_id, approval_request_code
  ) values (
    v_request.line_user_id, p_auth_user_id, p_request_code
  );
  insert into public.admin_users (user_id)
  values (p_auth_user_id)
  on conflict (user_id) do nothing;
  delete from public.line_organizer_request
  where line_user_id = v_request.line_user_id;
  return p_auth_user_id;
end;
$$;
revoke all on function public.approve_line_organizer(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.approve_line_organizer(uuid, uuid)
  to service_role;

create function public.get_line_resident_self()
returns table (display_name text, picture_url text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select l.display_name, l.picture_url
  from public.line_resident_identity l
  where l.auth_user_id = auth.uid();
$$;
revoke all on function public.get_line_resident_self() from public, anon;
grant execute on function public.get_line_resident_self() to authenticated, service_role;

create function public.list_resident_campaigns()
returns table (
  slug text,
  title text,
  unit_price numeric,
  threshold integer,
  status text,
  opened_at timestamptz,
  total_quantity bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.slug, c.title, c.unit_price, c.threshold, c.status, c.opened_at,
         coalesce(sum(oi.qty), 0)::bigint as total_quantity
  from public.community_member cm
  join public.campaign c on c.community_id = cm.community_id
  left join public.order_item oi on oi.campaign_id = c.id
  where cm.user_id = auth.uid()
    and c.opened_at is not null
  group by c.id, c.slug, c.title, c.unit_price, c.threshold, c.status, c.opened_at
  order by c.opened_at desc;
$$;
revoke all on function public.list_resident_campaigns() from public, anon;
grant execute on function public.list_resident_campaigns() to authenticated, service_role;

-- Household identity comes only from the trusted LINE resident record.
drop function if exists public.bind_customer_self(text, integer, text);
create function public.bind_customer_self(p_period integer, p_unit text)
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
  if p_period not in (1, 2) then
    raise exception '期別只能是一期或二期' using errcode = '22023';
  end if;
  if length(v_unit) not between 1 and 20 or v_unit !~ '^[A-Z0-9]+$' then
    raise exception '戶號只能包含大寫英文字母與數字，且最長20字' using errcode = '22023';
  end if;

  select l.display_name, l.picture_url into v_name, v_picture_url
  from public.line_resident_identity l
  where l.auth_user_id = v_user_id;
  if v_name is null then
    raise exception '請先完成LINE住戶驗證' using errcode = '42501';
  end if;

  select * into v_existing from public.customer where auth_user_id = v_user_id;
  if found then
    if v_existing.period <> p_period or v_existing.unit <> v_unit then
      raise exception '住戶資料已綁定，如需變更請聯絡團主' using errcode = '23505';
    end if;
    update public.customer as cu
    set name = v_name, picture_url = v_picture_url
    where cu.id = v_existing.id;
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
    select * into v_existing from public.customer where auth_user_id = v_user_id;
    if found and v_existing.period = p_period and v_existing.unit = v_unit then
      return query select v_existing.id, v_existing.name, v_existing.picture_url,
                          v_existing.period, v_existing.unit;
      return;
    end if;
    raise exception '此期別與戶號已由其他住戶綁定' using errcode = '23505';
  end;
end;
$$;
revoke all on function public.bind_customer_self(integer, text) from public, anon;
grant execute on function public.bind_customer_self(integer, text) to authenticated, service_role;

-- Zero-downtime compatibility for the previous frontend. The submitted name is
-- deliberately ignored; the two-argument function reads the verified LINE name.
create function public.bind_customer_self(p_name text, p_period integer, p_unit text)
returns table (id uuid, name text, period integer, unit text)
language sql
security definer
set search_path = public, pg_temp
as $$
  select resident.id, resident.name, resident.period, resident.unit
  from public.bind_customer_self(p_period, p_unit) resident;
$$;
revoke all on function public.bind_customer_self(text, integer, text) from public, anon;
grant execute on function public.bind_customer_self(text, integer, text) to authenticated, service_role;

drop function public.get_customer_self();
create function public.get_customer_self()
returns table (id uuid, name text, picture_url text, period integer, unit text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select cu.id, cu.name, cu.picture_url, cu.period, cu.unit
  from public.customer cu
  where cu.auth_user_id = auth.uid();
$$;
revoke all on function public.get_customer_self() from public, anon;
grant execute on function public.get_customer_self() to authenticated, service_role;

create or replace function public.join_campaign_by_slug(p_slug text)
returns table (id uuid, slug text, title text, unit_price numeric, threshold integer,
  status text, deadline timestamptz, announcement text, images jsonb, items jsonb,
  opened_at timestamptz, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  insert into public.campaign_access (campaign_id, user_id)
  select c.id, auth.uid()
  from public.campaign c
  join public.community_member cm
    on cm.community_id = c.community_id and cm.user_id = auth.uid()
  where c.slug = p_slug and c.opened_at is not null
  on conflict do nothing;
  return query
  select c.id, c.slug, c.title, c.unit_price, c.threshold, c.status,
         c.deadline, c.announcement, c.images, c.items, c.opened_at, c.created_at, c.updated_at
  from public.campaign c
  join public.campaign_access ca on ca.campaign_id = c.id and ca.user_id = auth.uid()
  where c.slug = p_slug and c.opened_at is not null;
end;
$$;

-- Recreate the safe wall with the verified display avatar but no LINE/Auth identifier.
drop view public.order_wall;
create view public.order_wall with (security_invoker = true) as
select c.slug as campaign_slug, o.campaign_id, o.id as order_id, o.customer_id,
  cu.name as customer_name, cu.picture_url, cu.period, cu.unit, o.note,
  o.created_at as ordered_at, o.updated_at as order_updated_at,
  ci.id as campaign_item_id, ci.code as item_code, ci.name as item_name,
  ci.sort_order, ci.active as item_active, oi.qty, oi.updated_at as item_updated_at
from public.orders o
join public.campaign c on c.id = o.campaign_id
join public.customer cu on cu.id = o.customer_id
left join public.order_item oi on oi.order_id = o.id
left join public.campaign_item ci on ci.id = oi.campaign_item_id;

revoke all on table public.order_wall from anon, authenticated;
grant select on table public.order_wall to authenticated;
grant select (picture_url) on public.customer to authenticated;

-- LINE-controlled resident users cannot bypass LINE through password/recovery flows.
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

  if (
    exists (select 1 from public.line_organizer_identity where auth_user_id = v_user_id)
    or exists (select 1 from public.line_resident_identity where auth_user_id = v_user_id)
  ) and v_method not in ('magiclink', 'otp', 'token_refresh') then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'LINE user must authenticate through LINE'
      )
    );
  end if;
  return event;
exception
  when invalid_text_representation then
    return jsonb_build_object(
      'error', jsonb_build_object('http_code', 400, 'message', 'Invalid authentication event')
    );
end;
$$;

revoke all on function public.line_organizer_access_token_hook(jsonb)
  from public, anon, authenticated;
grant execute on function public.line_organizer_access_token_hook(jsonb)
  to supabase_auth_admin, service_role;
grant select on table public.line_resident_identity to supabase_auth_admin;
