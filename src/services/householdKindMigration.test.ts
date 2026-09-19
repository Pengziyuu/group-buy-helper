import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const schemaPath = resolve(process.cwd(), 'supabase/migrations/20260919160000_household_kind.sql')

describe('household kind schema migration', () => {
  it('adds the household kind column and lets several accounts share one household', () => {
    expect(existsSync(schemaPath)).toBe(true)
    if (!existsSync(schemaPath)) return
    const sql = readFileSync(schemaPath, 'utf8').toLowerCase()

    expect(sql).toContain('add column household_kind text not null default')
    expect(sql).toContain("check (household_kind in ('resident', 'other'))")
    expect(sql).toContain('drop constraint customer_period_unit_key')
    expect(sql).toContain('alter column period drop not null')
    expect(sql).toContain('alter column unit drop not null')
  })

  it('ties the household columns to the kind so no half-filled row is possible', () => {
    const sql = readFileSync(schemaPath, 'utf8').toLowerCase()

    expect(sql).toContain('drop constraint customer_household_format')
    expect(sql).toContain('add constraint customer_household_format')
    expect(sql).toContain('public.valid_resident_household(period, unit)')
    expect(sql).toMatch(/when 'other'\s+then period is null and unit is null/)
  })

  it('keeps the account-level uniqueness that makes one order per account work', () => {
    const sql = readFileSync(schemaPath, 'utf8').toLowerCase()

    expect(sql).not.toContain('drop constraint customer_auth_user_id_key')
    expect(sql).not.toContain('drop constraint customer_line_user_id_key')
  })
})

const bindingPath = resolve(process.cwd(), 'supabase/migrations/20260919161000_household_kind_binding.sql')

describe('household kind binding migration', () => {
  it('adds a kind-aware signature while the old one keeps working for the deployed frontend', () => {
    expect(existsSync(bindingPath)).toBe(true)
    if (!existsSync(bindingPath)) return
    const sql = readFileSync(bindingPath, 'utf8').toLowerCase()

    expect(sql).toContain('function public.bind_customer_self(p_household_kind text, p_period integer, p_unit text)')
    expect(sql).toContain('function public.bind_customer_self(p_period integer, p_unit text)')
    expect(sql).toContain("public.bind_customer_self('resident', p_period, p_unit)")
    expect(sql).toContain("public.admin_update_resident_household(p_member_code, 'resident', p_period, p_unit)")
  })

  it('drops the household collision error that can no longer happen', () => {
    const sql = readFileSync(bindingPath, 'utf8')

    expect(sql).not.toContain('此期別與戶號已由其他住戶綁定')
    expect(sql).toContain('住戶資料已綁定，如需變更請聯絡團主')
  })

  it('compares the kind as well as the household when refusing a silent switch', () => {
    const sql = readFileSync(bindingPath, 'utf8').toLowerCase()

    expect(sql).toContain('v_existing.household_kind <> p_household_kind')
  })

  it('keeps every signature off anon and locked to the usual search path', () => {
    const sql = readFileSync(bindingPath, 'utf8').toLowerCase()

    expect(sql).toContain('set search_path = public, pg_temp')
    expect(sql).toContain('revoke all on function public.bind_customer_self(text, integer, text)')
    expect(sql).toContain('revoke all on function public.admin_update_resident_household(text, text, integer, text)')
    expect(sql).toContain('from public, anon, authenticated, service_role')
  })
})

const pickupPath = resolve(process.cwd(), 'supabase/migrations/20260919162000_household_kind_pickup.sql')

describe('household kind pickup notification migration', () => {
  it('excludes non-residents from both the recipient list and its eligibility hash', () => {
    expect(existsSync(pickupPath)).toBe(true)
    if (!existsSync(pickupPath)) return
    const sql = readFileSync(pickupPath, 'utf8').toLowerCase()

    expect(sql).toContain('function public.internal_pickup_notification_recipients')
    expect(sql).toContain('function public.internal_pickup_notification_eligible_hash')
    expect(sql.match(/customer\.household_kind = 'resident'/g) ?? []).toHaveLength(2)
  })

  it('keeps the audience predicate identical in both functions', () => {
    const sql = readFileSync(pickupPath, 'utf8').toLowerCase()

    expect(sql.match(/customer\.period in \(1, 3\)/g) ?? []).toHaveLength(2)
    expect(sql.match(/customer\.period = 2/g) ?? []).toHaveLength(2)
  })

  it('keeps both functions away from browser roles', () => {
    const sql = readFileSync(pickupPath, 'utf8').toLowerCase()

    expect(sql).toContain('revoke all on function public.internal_pickup_notification_recipients(uuid, text) from public, anon, authenticated')
    expect(sql).toContain('revoke all on function public.internal_pickup_notification_eligible_hash(uuid, text) from public, anon, authenticated')
  })
})

const exposurePath = resolve(process.cwd(), 'supabase/migrations/20260919163000_household_kind_exposure.sql')

describe('household kind exposure migration', () => {
  it('returns the kind from the order wall without loosening how it is read', () => {
    expect(existsSync(exposurePath)).toBe(true)
    if (!existsSync(exposurePath)) return
    const sql = readFileSync(exposurePath, 'utf8').toLowerCase()

    expect(sql).toContain('create or replace view public.order_wall with (security_invoker = true)')
    expect(sql).toContain('cu.household_kind')
    expect(sql).toContain('grant select on table public.order_wall to authenticated')
    expect(sql).toContain('revoke all on table public.order_wall from anon')
  })

  it('returns the kind in the organizer resident list', () => {
    const sql = readFileSync(exposurePath, 'utf8').toLowerCase()

    expect(sql).toContain('function public.admin_list_residents()')
    expect(sql).toContain('household_kind text')
    expect(sql).toContain('public.is_admin()')
  })
})
