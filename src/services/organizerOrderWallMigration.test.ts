import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20260920195000_restore_admin_order_households.sql')

describe('organizer order wall migration', () => {
  it('provides full household details only through an organizer-gated view', () => {
    expect(existsSync(migrationPath)).toBe(true)
    if (!existsSync(migrationPath)) return

    const sql = readFileSync(migrationPath, 'utf8').toLowerCase()
    expect(sql).toContain('create view public.organizer_order_wall with (security_invoker = true)')
    expect(sql).toContain('cu.period')
    expect(sql).toContain('cu.unit')
    expect(sql).toContain('where public.is_admin()')
    expect(sql).toContain('grant select on table public.organizer_order_wall to authenticated')
    expect(sql).toContain('revoke all on table public.organizer_order_wall from public, anon, authenticated')
  })

  it('keeps the resident order wall household fields masked', () => {
    const privacyMigration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260920111500_hide_order_wall_households.sql'),
      'utf8',
    ).toLowerCase()

    expect(privacyMigration).toContain('null::integer as period')
    expect(privacyMigration).toContain('null::text as unit')
  })
})
