-- One household may now be shared by several LINE accounts, and people from
-- outside the community bind with no household at all. household_kind states
-- which of the two a row is, so rules that must exclude outsiders can say so
-- directly instead of testing period for a magic value.
--
-- Dropping unique (period, unit) is what allows the sharing. The account-level
-- unique keys on auth_user_id and line_user_id stay, so one LINE account is
-- still exactly one customer row and therefore one order per campaign.

alter table public.customer
  add column household_kind text not null default 'resident'
  check (household_kind in ('resident', 'other'));

alter table public.customer drop constraint customer_period_unit_key;

alter table public.customer alter column period drop not null;
alter table public.customer alter column unit drop not null;

alter table public.customer drop constraint customer_household_format;
alter table public.customer add constraint customer_household_format check (
  case household_kind
    when 'resident' then period is not null and unit is not null
                      and public.valid_resident_household(period, unit)
    when 'other'    then period is null and unit is null
  end
);
