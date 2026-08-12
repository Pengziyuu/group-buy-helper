-- Organizer campaign management: atomically create drafts, list campaigns,
-- and keep unpublished slugs private until first publication.

create or replace function public.create_campaign_draft(p_title text default '未命名團購')
returns public.campaign
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_items jsonb := jsonb_build_array(
    jsonb_build_object('code', 'ITEM1', 'name', 'A號', 'active', true)
  );
  v_campaign public.campaign;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin permission required' using errcode = '42501';
  end if;
  if length(v_title) not between 1 and 200 then
    raise exception 'campaign title must be between 1 and 200 characters' using errcode = '22023';
  end if;

  insert into public.campaign (
    title, unit_price, threshold, status, deadline, announcement, images, items
  ) values (
    v_title, 0, 1, 'open', now() + interval '30 days', '', '[]'::jsonb, v_items
  ) returning * into v_campaign;

  insert into public.campaign_draft (
    campaign_id, title, unit_price, threshold, announcement, images, items, updated_by
  ) values (
    v_campaign.id, v_title, 0, 1, '', '[]'::jsonb, v_items, auth.uid()
  );

  return v_campaign;
end;
$$;

create or replace view public.admin_campaign_list
with (security_invoker = true)
as
select c.id, c.slug, coalesce(d.title, c.title) as title, c.status, c.opened_at, c.created_at,
  greatest(c.updated_at, coalesce(d.updated_at, c.updated_at)) as updated_at
from public.campaign c
left join public.campaign_draft d on d.campaign_id = c.id
where public.is_admin();

-- A redeemed capability is useful only after first publication. This closes the
-- pre-existing-access path for campaigns that were never opened.
create or replace function public.has_campaign_access(p_campaign_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.campaign_access ca
    join public.campaign c on c.id = ca.campaign_id
    where ca.campaign_id = p_campaign_id
      and ca.user_id = auth.uid()
      and c.opened_at is not null
  );
$$;

create or replace function public.join_campaign_by_slug(p_slug text)
returns table (id uuid, slug text, title text, unit_price numeric, threshold integer,
  status text, deadline timestamptz, announcement text, images jsonb, items jsonb,
  opened_at timestamptz, created_at timestamptz, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.campaign c
    where c.slug = p_slug and c.opened_at is not null
  ) then
    raise exception 'published campaign not found' using errcode = 'PT404';
  end if;

  insert into public.campaign_access (campaign_id, user_id)
  select c.id, auth.uid()
  from public.campaign c
  where c.slug = p_slug and c.opened_at is not null
  on conflict do nothing;

  return query
  select c.id, c.slug, c.title, c.unit_price, c.threshold, c.status,
    c.deadline, c.announcement, c.images, c.items, c.opened_at, c.created_at, c.updated_at
  from public.campaign c
  where c.slug = p_slug and c.opened_at is not null;
end;
$$;

revoke all on function public.create_campaign_draft(text) from public, anon;
grant execute on function public.create_campaign_draft(text) to authenticated, service_role;
revoke all on function public.join_campaign_by_slug(text) from public, anon;
grant execute on function public.join_campaign_by_slug(text) to authenticated, service_role;
revoke all on table public.admin_campaign_list from public, anon;
grant select on table public.admin_campaign_list to authenticated, service_role;
