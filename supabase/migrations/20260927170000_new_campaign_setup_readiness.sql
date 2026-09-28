-- Keep legacy drafts ready; only newly created blank campaigns require explicit threshold setup.
alter table public.campaign_draft
  add column threshold_configured boolean not null default true,
  add column item_name_configured boolean not null default true,
  add column item_price_configured boolean not null default true;

create or replace function public.create_campaign_draft(p_title text default '未命名團購')
returns public.campaign
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_items jsonb := jsonb_build_array(
    jsonb_build_object('code', 'ITEM1', 'name', 'A', 'unitPrice', 0, 'active', true)
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
    campaign_id, title, unit_price, threshold, threshold_configured,
    item_name_configured, item_price_configured,
    announcement, images, items, updated_by
  ) values (
    v_campaign.id, v_title, 0, 1, false, false, false, '', '[]'::jsonb, v_items, auth.uid()
  );

  return v_campaign;
end;
$$;

revoke all on function public.create_campaign_draft(text) from public, anon;
grant execute on function public.create_campaign_draft(text) to authenticated, service_role;

-- Enforce the same first-publication gate even when the publish RPC is called directly.
create function public.require_new_campaign_setup()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.opened_at is null and new.opened_at is not null and exists (
    select 1 from public.campaign_draft draft
    where draft.campaign_id = new.id
      and (not draft.threshold_configured or not draft.item_name_configured or not draft.item_price_configured)
  ) then
    raise exception '請先完成成團門檻、品項名稱與單價設定' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger require_new_campaign_setup_before_publish
before update on public.campaign
for each row execute function public.require_new_campaign_setup();
