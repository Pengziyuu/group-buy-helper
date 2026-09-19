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
