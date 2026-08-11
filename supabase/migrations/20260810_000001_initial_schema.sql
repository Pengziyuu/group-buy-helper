-- Initial schema for the group-buy helper.
--
-- Security model:
-- * Visitors sign in with Supabase Anonymous Auth (database role: authenticated).
-- * A visitor proves knowledge of an unguessable campaign slug by calling
--   join_campaign_by_slug(); that records campaign access for auth.uid().
-- * RLS uses that access record for the public order wall and Realtime.
-- * line_user_id is deliberately excluded from every client SELECT grant/view.
-- * Admin membership can only be provisioned by a trusted SQL/service-role path.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.admin_users a where a.user_id = auth.uid()
  );
$$;

create table if not exists public.campaign (
  id uuid primary key default gen_random_uuid(),
  slug text not null default encode(extensions.gen_random_bytes(18), 'hex'),
  title text not null check (length(btrim(title)) between 1 and 200),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  threshold integer not null check (threshold > 0),
  status text not null default 'open' check (status in ('open', 'closed', 'arrived')),
  deadline timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_slug_key unique (slug),
  constraint campaign_slug_random_format check (slug ~ '^[0-9a-f]{36}$')
);

create table if not exists public.campaign_item (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaign(id) on delete cascade,
  code text not null check (
    length(btrim(code)) between 1 and 64
    and code = upper(code)
    and code ~ '^[A-Z0-9]+$'
  ),
  name text not null check (length(btrim(name)) between 1 and 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, code),
  unique (campaign_id, id)
);

create table if not exists public.product_template (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (length(btrim(code)) between 1 and 64),
  name text not null check (length(btrim(name)) between 1 and 200),
  default_price numeric(12,2) check (default_price is null or default_price >= 0),
  note text check (note is null or length(note) <= 1000),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer (
  id uuid primary key default gen_random_uuid(),
  period integer not null default 2 check (period > 0),
  unit text not null check (unit ~ '^[A-Z0-9]+$' and unit = upper(unit)),
  name text not null check (length(btrim(name)) between 1 and 100),
  line_user_id text,
  auth_user_id uuid references auth.users(id) on delete set null,
  total_spent numeric(14,2) not null default 0 check (total_spent >= 0),
  order_count integer not null default 0 check (order_count >= 0),
  vip_level smallint not null default 0 check (vip_level >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period, unit),
  unique (line_user_id),
  unique (auth_user_id)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaign(id) on delete restrict,
  customer_id uuid not null references public.customer(id) on delete restrict,
  note text check (note is null or length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, customer_id),
  unique (id, campaign_id)
);

create table if not exists public.order_item (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  campaign_id uuid not null,
  campaign_item_id uuid not null,
  qty smallint not null default 0 check (qty between 0 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, campaign_item_id),
  foreign key (order_id, campaign_id)
    references public.orders(id, campaign_id) on delete cascade,
  foreign key (campaign_id, campaign_item_id)
    references public.campaign_item(campaign_id, id) on delete restrict
);

create table if not exists public.payment (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  amount numeric(14,2) not null check (amount >= 0),
  paid boolean not null default false,
  paid_at timestamptz,
  method text check (method is null or method = 'LINE Pay'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_paid_at_consistency check (
    (paid and paid_at is not null) or (not paid and paid_at is null)
  )
);

-- A capability record: only the SECURITY DEFINER slug redemption function writes it.
create table if not exists public.campaign_access (
  campaign_id uuid not null references public.campaign(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create index if not exists campaign_status_deadline_idx
  on public.campaign (status, deadline);
create index if not exists campaign_item_campaign_sort_idx
  on public.campaign_item (campaign_id, sort_order, code);
create index if not exists customer_auth_user_idx
  on public.customer (auth_user_id);
create index if not exists orders_customer_idx
  on public.orders (customer_id);
create index if not exists orders_campaign_created_idx
  on public.orders (campaign_id, created_at);
create index if not exists order_item_campaign_idx
  on public.order_item (campaign_id);
create index if not exists order_item_item_idx
  on public.order_item (campaign_item_id);
create index if not exists campaign_access_user_idx
  on public.campaign_access (user_id, campaign_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists campaign_set_updated_at on public.campaign;
create trigger campaign_set_updated_at
before update on public.campaign
for each row execute function public.set_updated_at();

drop trigger if exists campaign_item_set_updated_at on public.campaign_item;
create trigger campaign_item_set_updated_at
before update on public.campaign_item
for each row execute function public.set_updated_at();

drop trigger if exists product_template_set_updated_at on public.product_template;
create trigger product_template_set_updated_at
before update on public.product_template
for each row execute function public.set_updated_at();

drop trigger if exists customer_set_updated_at on public.customer;
create trigger customer_set_updated_at
before update on public.customer
for each row execute function public.set_updated_at();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists order_item_set_updated_at on public.order_item;
create trigger order_item_set_updated_at
before update on public.order_item
for each row execute function public.set_updated_at();

drop trigger if exists payment_set_updated_at on public.payment;
create trigger payment_set_updated_at
before update on public.payment
for each row execute function public.set_updated_at();

-- Redeem a random slug. Anonymous Auth users have auth.uid() and role authenticated.
create or replace function public.join_campaign_by_slug(p_slug text)
returns table (
  id uuid,
  slug text,
  title text,
  unit_price numeric,
  threshold integer,
  status text,
  deadline timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  insert into public.campaign_access (campaign_id, user_id)
  select c.id, auth.uid()
  from public.campaign c
  where c.slug = p_slug
  on conflict do nothing;

  return query
  select c.id, c.slug, c.title, c.unit_price, c.threshold,
         c.status, c.deadline, c.created_at, c.updated_at
  from public.campaign c
  where c.slug = p_slug;
end;
$$;

-- Small SECURITY DEFINER predicates avoid recursive RLS evaluation when a
-- policy needs to inspect another RLS-protected table. They return booleans
-- only and use a fixed search_path.
create or replace function public.has_campaign_access(p_campaign_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.campaign_access ca
    where ca.campaign_id = p_campaign_id and ca.user_id = auth.uid()
  );
$$;

create or replace function public.owns_customer(p_customer_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.customer cu
    where cu.id = p_customer_id and cu.auth_user_id = auth.uid()
  );
$$;

create or replace function public.owns_order(p_order_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.orders o
    join public.customer cu on cu.id = o.customer_id
    where o.id = p_order_id and cu.auth_user_id = auth.uid()
  );
$$;

create or replace function public.campaign_is_editable(p_campaign_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.campaign c
    where c.id = p_campaign_id
      and c.status = 'open'
      and c.deadline > now()
  );
$$;

create or replace function public.can_edit_order(p_order_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.orders o
    join public.customer cu on cu.id = o.customer_id
    join public.campaign c on c.id = o.campaign_id
    where o.id = p_order_id
      and cu.auth_user_id = auth.uid()
      and c.status = 'open'
      and c.deadline > now()
  );
$$;

create or replace function public.customer_is_wall_visible(p_customer_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.orders o
    join public.campaign_access ca on ca.campaign_id = o.campaign_id
    where o.customer_id = p_customer_id and ca.user_id = auth.uid()
  );
$$;

-- Replace the caller's complete order in one database transaction. The
-- SECURITY DEFINER body re-checks authorization before bypassing RLS.
create or replace function public.submit_customer_order(
  p_campaign_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_entry record;
  v_qty integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select c.id into v_customer_id
  from public.customer c
  where c.auth_user_id = auth.uid();
  if v_customer_id is null then
    raise exception '戶號尚未綁定' using errcode = '42501';
  end if;

  if not public.has_campaign_access(p_campaign_id) then
    raise exception '尚未取得這一團的存取權' using errcode = '42501';
  end if;
  if not public.campaign_is_editable(p_campaign_id) then
    raise exception '本團已結單，不能修改訂單' using errcode = '23514';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'object' then
    raise exception '訂單品項格式錯誤' using errcode = '22023';
  end if;

  for v_entry in select key, value from jsonb_each(p_items)
  loop
    if jsonb_typeof(v_entry.value) <> 'number'
       or (v_entry.value #>> '{}') !~ '^\d+$' then
      raise exception '% 數量必須是 0 到 20 的整數', upper(v_entry.key)
        using errcode = '22023';
    end if;
    v_qty := (v_entry.value #>> '{}')::integer;
    if v_qty < 0 or v_qty > 20 then
      raise exception '% 數量必須是 0 到 20 的整數', upper(v_entry.key)
        using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.campaign_item ci
      where ci.campaign_id = p_campaign_id and ci.code = upper(v_entry.key)
    ) then
      raise exception '不存在的品項：%', upper(v_entry.key) using errcode = '23503';
    end if;
  end loop;

  if not exists (
    select 1 from jsonb_each(p_items) e
    where (e.value #>> '{}') ~ '^\d+$' and (e.value #>> '{}')::integer > 0
  ) then
    raise exception '訂單至少需要一個品項' using errcode = '23514';
  end if;

  insert into public.orders (campaign_id, customer_id)
  values (p_campaign_id, v_customer_id)
  on conflict (campaign_id, customer_id)
  do update set updated_at = now()
  returning id into v_order_id;

  delete from public.order_item where order_id = v_order_id;

  insert into public.order_item (order_id, campaign_id, campaign_item_id, qty)
  select v_order_id, p_campaign_id, ci.id, (e.value #>> '{}')::integer
  from jsonb_each(p_items) e
  join public.campaign_item ci
    on ci.campaign_id = p_campaign_id and ci.code = upper(e.key)
  where (e.value #>> '{}')::integer > 0;

  return jsonb_build_object(
    'id', v_order_id,
    'campaign_id', p_campaign_id,
    'customer_id', v_customer_id,
    'items', p_items
  );
end;
$$;

alter table public.admin_users enable row level security;
alter table public.campaign enable row level security;
alter table public.campaign_item enable row level security;
alter table public.product_template enable row level security;
alter table public.customer enable row level security;
alter table public.orders enable row level security;
alter table public.order_item enable row level security;
alter table public.payment enable row level security;
alter table public.campaign_access enable row level security;

-- Admin table is intentionally readable only by the current admin; there is no
-- client INSERT/UPDATE/DELETE policy, preventing self-promotion.
drop policy if exists admin_users_read_self_admin on public.admin_users;
create policy admin_users_read_self_admin on public.admin_users
for select to authenticated
using (user_id = auth.uid() and public.is_admin());

drop policy if exists campaign_admin_all on public.campaign;
create policy campaign_admin_all on public.campaign
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists campaign_access_read on public.campaign;
create policy campaign_access_read on public.campaign
for select to authenticated
using (public.has_campaign_access(id));

drop policy if exists campaign_item_admin_all on public.campaign_item;
create policy campaign_item_admin_all on public.campaign_item
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists campaign_item_wall_read on public.campaign_item;
create policy campaign_item_wall_read on public.campaign_item
for select to authenticated
using (public.has_campaign_access(campaign_id));

drop policy if exists product_template_admin_all on public.product_template;
create policy product_template_admin_all on public.product_template
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists customer_admin_all on public.customer;
create policy customer_admin_all on public.customer
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists customer_read_self_or_wall on public.customer;
create policy customer_read_self_or_wall on public.customer
for select to authenticated
using (
  auth_user_id = auth.uid()
  or public.customer_is_wall_visible(id)
);

drop policy if exists orders_admin_all on public.orders;
create policy orders_admin_all on public.orders
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists orders_wall_read on public.orders;
create policy orders_wall_read on public.orders
for select to authenticated
using (public.has_campaign_access(campaign_id));

drop policy if exists orders_insert_self_open on public.orders;
create policy orders_insert_self_open on public.orders
for insert to authenticated
with check (
  public.owns_customer(customer_id)
  and public.has_campaign_access(campaign_id)
  and public.campaign_is_editable(campaign_id)
);

drop policy if exists orders_update_self_open on public.orders;
create policy orders_update_self_open on public.orders
for update to authenticated
using (public.owns_order(id) and public.campaign_is_editable(campaign_id))
with check (public.owns_order(id) and public.campaign_is_editable(campaign_id));

drop policy if exists orders_delete_self_open on public.orders;
create policy orders_delete_self_open on public.orders
for delete to authenticated
using (public.owns_order(id) and public.campaign_is_editable(campaign_id));

drop policy if exists order_item_admin_all on public.order_item;
create policy order_item_admin_all on public.order_item
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists order_item_wall_read on public.order_item;
create policy order_item_wall_read on public.order_item
for select to authenticated
using (public.has_campaign_access(campaign_id));

drop policy if exists order_item_insert_self_open on public.order_item;
create policy order_item_insert_self_open on public.order_item
for insert to authenticated
with check (public.can_edit_order(order_id));

drop policy if exists order_item_update_self_open on public.order_item;
create policy order_item_update_self_open on public.order_item
for update to authenticated
using (public.can_edit_order(order_id))
with check (public.can_edit_order(order_id));

drop policy if exists order_item_delete_self_open on public.order_item;
create policy order_item_delete_self_open on public.order_item
for delete to authenticated
using (public.can_edit_order(order_id));

drop policy if exists payment_admin_all on public.payment;
create policy payment_admin_all on public.payment
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists payment_owner_read on public.payment;
create policy payment_owner_read on public.payment
for select to authenticated
using (public.owns_order(order_id));

drop policy if exists campaign_access_admin_all on public.campaign_access;
create policy campaign_access_admin_all on public.campaign_access
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists campaign_access_read_self on public.campaign_access;
create policy campaign_access_read_self on public.campaign_access
for select to authenticated
using (user_id = auth.uid());

-- Views execute with the caller's permissions/RLS and expose no LINE identifier.
create or replace view public.campaign_public
with (security_invoker = true)
as
select id, slug, title, unit_price, threshold, status, deadline, created_at, updated_at
from public.campaign;

create or replace view public.order_wall
with (security_invoker = true)
as
select
  c.slug as campaign_slug,
  o.campaign_id,
  o.id as order_id,
  cu.name as customer_name,
  cu.period,
  cu.unit,
  o.note,
  o.created_at as ordered_at,
  o.updated_at as order_updated_at,
  ci.id as campaign_item_id,
  ci.code as item_code,
  ci.name as item_name,
  ci.sort_order,
  oi.qty,
  oi.updated_at as item_updated_at
from public.orders o
join public.campaign c on c.id = o.campaign_id
join public.customer cu on cu.id = o.customer_id
left join public.order_item oi on oi.order_id = o.id
left join public.campaign_item ci on ci.id = oi.campaign_item_id;

-- Lock down all default/client privileges first. service_role and table owners retain
-- their PostgreSQL ownership/superuser capabilities.
revoke all on table public.admin_users from anon, authenticated;
revoke all on table public.campaign from anon, authenticated;
revoke all on table public.campaign_item from anon, authenticated;
revoke all on table public.product_template from anon, authenticated;
revoke all on table public.customer from anon, authenticated;
revoke all on table public.orders from anon, authenticated;
revoke all on table public.order_item from anon, authenticated;
revoke all on table public.payment from anon, authenticated;
revoke all on table public.campaign_access from anon, authenticated;
revoke all on table public.campaign_public from anon, authenticated;
revoke all on table public.order_wall from anon, authenticated;

-- Admin actions are still governed by RLS. Customer column grants intentionally
-- omit line_user_id from SELECT and prevent clients changing identity/metrics.
grant select on table public.admin_users to authenticated;
grant select, insert, update, delete on table public.campaign to authenticated;
grant select, insert, update, delete on table public.campaign_item to authenticated;
grant select, insert, update, delete on table public.product_template to authenticated;
grant select (id, period, unit, name, total_spent, order_count, vip_level,
              created_at, updated_at)
  on public.customer to authenticated;
grant insert, update, delete on table public.customer to authenticated;
grant select, insert, delete on table public.orders to authenticated;
grant update (note) on public.orders to authenticated;
grant select, insert, delete on table public.order_item to authenticated;
grant update (qty) on public.order_item to authenticated;
grant select, insert, update, delete on table public.payment to authenticated;
grant select on table public.campaign_access to authenticated;
grant select on table public.campaign_public, public.order_wall to authenticated;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.join_campaign_by_slug(text) from public, anon;
revoke all on function public.has_campaign_access(uuid) from public, anon;
revoke all on function public.owns_customer(uuid) from public, anon;
revoke all on function public.owns_order(uuid) from public, anon;
revoke all on function public.campaign_is_editable(uuid) from public, anon;
revoke all on function public.can_edit_order(uuid) from public, anon;
revoke all on function public.customer_is_wall_visible(uuid) from public, anon;
revoke all on function public.submit_customer_order(uuid, jsonb) from public, anon;
revoke all on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.join_campaign_by_slug(text) to authenticated;
grant execute on function public.has_campaign_access(uuid) to authenticated;
grant execute on function public.owns_customer(uuid) to authenticated;
grant execute on function public.owns_order(uuid) to authenticated;
grant execute on function public.campaign_is_editable(uuid) to authenticated;
grant execute on function public.can_edit_order(uuid) to authenticated;
grant execute on function public.customer_is_wall_visible(uuid) to authenticated;
grant execute on function public.submit_customer_order(uuid, jsonb) to authenticated;

-- Realtime Postgres Changes: only wall-related, non-sensitive tables are added.
-- customer is intentionally excluded so line_user_id can never enter the stream.
alter table public.campaign replica identity full;
alter table public.campaign_item replica identity full;
alter table public.orders replica identity full;
alter table public.order_item replica identity full;

do $$
declare
  rel_name text;
begin
  foreach rel_name in array array['campaign', 'campaign_item', 'orders', 'order_item']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = rel_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', rel_name);
    end if;
  end loop;
end;
$$;
