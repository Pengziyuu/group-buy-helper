begin;

create or replace function public.is_valid_arrival_label(p_arrival_label text)
returns boolean
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $$
declare
  v_month integer;
  v_day integer;
begin
  if p_arrival_label = '貨到通知' then
    return true;
  end if;

  if p_arrival_label ~ '^(0[1-9]|1[0-2])/(0[1-9]|[12][0-9]|3[01])$' then
    v_month := split_part(p_arrival_label, '/', 1)::integer;
    v_day := split_part(p_arrival_label, '/', 2)::integer;
    begin
      perform make_date(2000, v_month, v_day);
      return true;
    exception
      when datetime_field_overflow then return false;
    end;
  end if;

  return p_arrival_label ~ '^([1-9]|1[0-2])月(初|中|底)$';
end;
$$;

revoke all on function public.is_valid_arrival_label(text) from public, anon;
grant execute on function public.is_valid_arrival_label(text) to authenticated, service_role;

alter table public.campaign
  drop constraint campaign_arrival_label_valid,
  add constraint campaign_arrival_label_valid
    check (public.is_valid_arrival_label(arrival_label));

alter table public.campaign_draft
  drop constraint campaign_draft_arrival_label_valid,
  add constraint campaign_draft_arrival_label_valid
    check (public.is_valid_arrival_label(arrival_label));

create or replace function public.campaign_is_editable(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.campaign campaign
    where campaign.id = p_campaign_id
      and campaign.status = 'open'
      and (
        campaign.auto_close_at is null
        or campaign.auto_close_at > clock_timestamp()
      )
  );
$$;

create or replace function public.enforce_campaign_auto_close()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'open'
     and new.opened_at is not null
     and new.auto_close_at is not null
     and new.auto_close_at <= clock_timestamp() then
    new.status := 'closed';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_campaign_auto_close() from public, anon, authenticated;

drop trigger if exists enforce_campaign_auto_close on public.campaign;
create trigger enforce_campaign_auto_close
before insert or update on public.campaign
for each row execute function public.enforce_campaign_auto_close();

commit;
