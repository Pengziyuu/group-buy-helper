-- Public LINE-authenticated resident admission with organizer-managed blocking.

alter table public.community drop column invite_slug;

alter table public.community_member
  add column member_code text not null default encode(extensions.gen_random_bytes(18), 'hex');
alter table public.community_member
  add constraint community_member_code_format check (member_code ~ '^[0-9a-f]{36}$'),
  add constraint community_member_code_unique unique (member_code);

create table public.community_resident_block (
  community_id uuid not null references public.community(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  line_user_id text not null unique,
  member_code text not null unique check (member_code ~ '^[0-9a-f]{36}$'),
  joined_at timestamptz not null,
  blocked_at timestamptz not null default now(),
  blocked_by uuid not null references auth.users(id) on delete restrict,
  primary key (community_id, line_user_id)
);

alter table public.community_resident_block enable row level security;
revoke all on table public.community_resident_block from public, anon, authenticated;
grant select, insert, update, delete on table public.community_resident_block to service_role;

revoke all on function public.provision_line_resident(text, uuid, text, text, text)
  from public, anon, authenticated, service_role;
drop function public.provision_line_resident(text, uuid, text, text, text);

create function public.provision_line_resident(
  p_line_user_id text,
  p_auth_user_id uuid,
  p_display_name text,
  p_picture_url text
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

  if exists (
    select 1 from public.community_resident_block b
    where b.line_user_id = p_line_user_id
  ) then
    raise exception 'resident blocked' using errcode = '42501';
  end if;

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
    and c.active;
  if v_community_id is null then
    raise exception 'resident community unavailable' using errcode = '42501';
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
  on conflict on constraint community_member_pkey do nothing;

  update public.customer
  set name = v_display_name, picture_url = v_picture_url
  where auth_user_id = p_auth_user_id;

  return query select v_community_id, v_display_name, v_picture_url;
end;
$$;

revoke all on function public.provision_line_resident(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.provision_line_resident(text, uuid, text, text)
  to service_role;

-- Existing campaign_access is historical capability state, not current admission.
-- Every read must still require a live community membership.
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
  join public.community_member cm
    on cm.community_id = c.community_id and cm.user_id = auth.uid()
  where c.slug = p_slug and c.opened_at is not null;
end;
$$;

-- Direct order-note/delete and payment reads depend on owns_order(), so make the
-- helper admission-aware while preserving the order row itself for audit history.
create or replace function public.owns_order(p_order_id uuid)
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
  );
$$;

create function public.admin_list_residents()
returns table (
  member_code text,
  display_name text,
  picture_url text,
  period integer,
  unit text,
  joined_at timestamptz,
  blocked boolean,
  blocked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'admin required' using errcode = '42501';
  end if;

  return query
  select
    m.member_code,
    i.display_name,
    i.picture_url,
    c.period,
    c.unit,
    m.joined_at,
    false,
    null::timestamptz
  from public.community_member m
  join public.line_resident_identity i on i.auth_user_id = m.user_id
  left join public.customer c on c.auth_user_id = m.user_id
  where m.community_id = '00000000-0000-4000-8000-000000000001'

  union all

  select
    b.member_code,
    i.display_name,
    i.picture_url,
    c.period,
    c.unit,
    b.joined_at,
    true,
    b.blocked_at
  from public.community_resident_block b
  join public.line_resident_identity i on i.line_user_id = b.line_user_id
  left join public.customer c on c.auth_user_id = b.user_id
  where b.community_id = '00000000-0000-4000-8000-000000000001'

  order by 7, 6 desc;
end;
$$;

revoke all on function public.admin_list_residents() from public, anon;
grant execute on function public.admin_list_residents() to authenticated;

create function public.admin_set_resident_blocked(p_member_code text, p_blocked boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_community_id constant uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_user_id uuid;
  v_line_user_id text;
  v_joined_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'admin required' using errcode = '42501';
  end if;
  if p_member_code is null or p_member_code !~ '^[0-9a-f]{36}$' then
    raise exception 'invalid member code' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('resident-member:' || p_member_code, 0));

  if p_blocked then
    if exists (
      select 1 from public.community_resident_block b
      where b.community_id = v_community_id and b.member_code = p_member_code
    ) then
      return;
    end if;

    select i.line_user_id into v_line_user_id
    from public.community_member m
    join public.line_resident_identity i on i.auth_user_id = m.user_id
    where m.community_id = v_community_id
      and m.member_code = p_member_code;
    if v_line_user_id is null then
      raise exception 'resident member not found' using errcode = 'P0002';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('line-subject:' || v_line_user_id, 0));
    if exists (
      select 1 from public.community_resident_block b
      where b.community_id = v_community_id and b.member_code = p_member_code
    ) then
      return;
    end if;

    select m.user_id, i.line_user_id, m.joined_at
    into v_user_id, v_line_user_id, v_joined_at
    from public.community_member m
    join public.line_resident_identity i on i.auth_user_id = m.user_id
    where m.community_id = v_community_id
      and m.member_code = p_member_code
    for update of m;

    if v_user_id is null or v_line_user_id is null then
      raise exception 'resident member not found' using errcode = 'P0002';
    end if;

    insert into public.community_resident_block (
      community_id, user_id, line_user_id, member_code, joined_at, blocked_by
    ) values (
      v_community_id, v_user_id, v_line_user_id, p_member_code, v_joined_at, auth.uid()
    );
    delete from public.community_member
    where community_id = v_community_id and user_id = v_user_id;
  else
    if exists (
      select 1 from public.community_member m
      where m.community_id = v_community_id and m.member_code = p_member_code
    ) then
      return;
    end if;

    select b.line_user_id into v_line_user_id
    from public.community_resident_block b
    where b.community_id = v_community_id
      and b.member_code = p_member_code;
    if v_line_user_id is null then
      raise exception 'resident member not found' using errcode = 'P0002';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('line-subject:' || v_line_user_id, 0));
    if exists (
      select 1 from public.community_member m
      where m.community_id = v_community_id and m.member_code = p_member_code
    ) then
      return;
    end if;

    select b.user_id, b.line_user_id, b.joined_at
    into v_user_id, v_line_user_id, v_joined_at
    from public.community_resident_block b
    where b.community_id = v_community_id
      and b.member_code = p_member_code
    for update;

    if v_user_id is null or v_line_user_id is null then
      raise exception 'resident member not found' using errcode = 'P0002';
    end if;

    delete from public.community_resident_block
    where community_id = v_community_id and member_code = p_member_code;
    insert into public.community_member (community_id, user_id, member_code, joined_at)
    values (v_community_id, v_user_id, p_member_code, v_joined_at);
  end if;
end;
$$;

revoke all on function public.admin_set_resident_blocked(text, boolean) from public, anon;
grant execute on function public.admin_set_resident_blocked(text, boolean) to authenticated;
