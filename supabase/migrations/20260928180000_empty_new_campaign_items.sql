-- New campaigns begin with no organizer-defined products. Only an unpublished
-- draft may have an empty item array; public campaigns and templates still
-- require at least one valid active item.
alter table public.campaign_draft
  drop constraint campaign_draft_items_valid;
alter table public.campaign_draft
  add constraint campaign_draft_items_valid check (
    items = '[]'::jsonb or public.valid_campaign_items(items)
  );

-- Grandfather earlier drafts; newly created drafts must store whole NT dollars.
alter table public.campaign_draft
  add column integer_currency_required boolean not null default false;

create function public.valid_whole_dollar_items(p_items jsonb)
returns boolean language plpgsql immutable
set search_path = public, pg_temp
as $$
begin
  if p_items = '[]'::jsonb then return true; end if;
  if not public.valid_campaign_items(p_items) then return false; end if;
  return not exists (
    select 1 from jsonb_array_elements(p_items) item
    where (item ->> 'unitPrice')::numeric <> trunc((item ->> 'unitPrice')::numeric)
  );
end;
$$;

alter table public.campaign_draft
  add constraint campaign_draft_whole_dollars check (
    not integer_currency_required or (
      unit_price = trunc(unit_price)
      and (threshold_kind <> 'amount' or amount_threshold = trunc(amount_threshold))
      and public.valid_whole_dollar_items(items)
    )
  );

-- A caller may not turn off validation on a draft that was created under it.
create function public.prevent_whole_dollar_downgrade()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.integer_currency_required and not new.integer_currency_required then
    raise exception '新團整數金額驗證不可停用' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger prevent_whole_dollar_downgrade
before update of integer_currency_required on public.campaign_draft
for each row execute function public.prevent_whole_dollar_downgrade();

-- Also verify the actual public snapshot when first publishing through the RPC
-- or a direct campaign update. Previously published rows remain untouched.
create function public.require_whole_dollar_publication()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.opened_at is null and new.opened_at is not null and exists (
    select 1 from public.campaign_draft d
    where d.campaign_id = new.id and d.integer_currency_required
  ) and (
    new.unit_price <> trunc(new.unit_price)
    or (new.threshold_kind = 'amount' and new.amount_threshold <> trunc(new.amount_threshold))
    or not public.valid_whole_dollar_items(new.items)
  ) then
    raise exception '新團金額與品項單價必須是整數' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger require_whole_dollar_publication_before_open
before update on public.campaign
for each row execute function public.require_whole_dollar_publication();

create or replace function public.create_campaign_draft(p_title text default '未命名團購')
returns public.campaign
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  -- The campaign row needs a valid placeholder before first publication.
  -- It is not shown to the organizer or residents; the draft is empty.
  v_placeholder jsonb := jsonb_build_array(
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
    v_title, 0, 1, 'open', now() + interval '30 days', '', '[]'::jsonb, v_placeholder
  ) returning * into v_campaign;

  insert into public.campaign_draft (
    campaign_id, title, unit_price, threshold, threshold_configured,
    item_name_configured, item_price_configured, integer_currency_required,
    announcement, images, items, updated_by
  ) values (
    v_campaign.id, v_title, 0, 1, false, false, false, true, '', '[]'::jsonb, '[]'::jsonb, auth.uid()
  );

  return v_campaign;
end;
$$;

revoke all on function public.create_campaign_draft(text) from public, anon;
grant execute on function public.create_campaign_draft(text) to authenticated, service_role;
