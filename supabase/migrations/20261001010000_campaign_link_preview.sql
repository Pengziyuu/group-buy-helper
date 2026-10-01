-- A shared campaign URL may reveal its published name and cover before LINE login.
-- The random slug is the only capability; drafts and member/order data stay private.
create or replace function public.campaign_link_preview(p_slug text)
returns table (title text, image_url text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select campaign.title,
         case when jsonb_typeof(campaign.images -> 0) = 'object'
              then campaign.images -> 0 ->> 'src'
              else null end as image_url
  from public.campaign campaign
  where campaign.slug = p_slug
    and campaign.opened_at is not null
    and p_slug ~ '^[0-9a-f]{36}$'
  limit 1;
$$;
revoke all on function public.campaign_link_preview(text) from public, anon, authenticated;
grant execute on function public.campaign_link_preview(text) to anon, authenticated, service_role;
