import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const path = resolve(process.cwd(), 'supabase/migrations/20261004010000_protect_customer_households.sql')

describe('customer household privacy forward migration', () => {
  it('removes direct authenticated household column access without removing the shared wall', () => {
    expect(existsSync(path)).toBe(true)
    if (!existsSync(path)) return
    const sql = readFileSync(path, 'utf8').toLowerCase()
    expect(sql).toMatch(/revoke select\s*\(period,\s*unit\)\s*on public\.customer from authenticated/)
    expect(sql).toContain('create or replace view public.organizer_order_wall with (security_invoker = true)')
    expect(sql).toContain('where public.is_admin()')
    expect(sql).not.toMatch(/grant select\s*\(period,\s*unit\)\s*on public\.customer to authenticated/)
  })
})
