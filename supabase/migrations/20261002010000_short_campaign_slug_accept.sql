-- Shorter campaign links, step 1 of 2: accept 8-character codes alongside the 36-character ones.
-- Only adds: existing codes and every link already shared stay valid, and new campaigns keep
-- getting 36-character codes until 20261002020000 switches the default, which is applied only
-- after the site that opens /c/<8 characters> links is live.

-- 8 characters from 0-9a-z: about 2.8 trillion codes, far too many to guess one, short enough to share.
create or replace function public.random_campaign_slug()
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  alphabet constant text := '0123456789abcdefghijklmnopqrstuvwxyz';
  candidate text;
  random_byte integer;
begin
  loop
    candidate := '';
    while length(candidate) < 8 loop
      random_byte := get_byte(extensions.gen_random_bytes(1), 0);
      -- 252 = 7 × 36: skipping 252-255 keeps every character equally likely.
      if random_byte < 252 then
        candidate := candidate || substr(alphabet, random_byte % 36 + 1, 1);
      end if;
    end loop;
    exit when not exists (select 1 from public.campaign where slug = candidate);
  end loop;
  return candidate;
end;
$$;
revoke all on function public.random_campaign_slug() from public, anon;
grant execute on function public.random_campaign_slug() to authenticated, service_role;

alter table public.campaign drop constraint campaign_slug_random_format;
alter table public.campaign add constraint campaign_slug_random_format
  check (slug ~ '^([0-9a-f]{36}|[0-9a-z]{8})$');

-- Same function as 20261001010000, accepting either code format.
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
    and p_slug ~ '^([0-9a-f]{36}|[0-9a-z]{8})$'
  limit 1;
$$;
revoke all on function public.campaign_link_preview(text) from public, anon, authenticated;
grant execute on function public.campaign_link_preview(text) to anon, authenticated, service_role;
