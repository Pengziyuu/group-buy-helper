import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20260920111500_hide_order_wall_households.sql')

describe('resident order wall household privacy migration', () => {
  it('removes period and unit values from every order wall row', () => {
    expect(existsSync(migrationPath)).toBe(true)
    if (!existsSync(migrationPath)) return
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase()

    expect(sql).toContain('create or replace view public.order_wall with (security_invoker = true)')
    expect(sql).toContain('null::integer as period')
    expect(sql).toContain('null::text as unit')
    expect(sql).not.toContain('cu.period')
    expect(sql).not.toContain('cu.unit')
  })

  it('preserves browser access only through the authenticated view grant', () => {
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase()

    expect(sql).toContain('revoke all on table public.order_wall from public, anon, authenticated')
    expect(sql).toContain('grant select on table public.order_wall to authenticated')
    expect(sql).not.toContain('grant select (period')
    expect(sql).not.toContain('grant select (unit')
  })
})
