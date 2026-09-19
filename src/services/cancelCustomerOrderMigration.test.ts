import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20260919150000_cancel_customer_order.sql')

describe('organizer order cancellation migration', () => {
  it('lets only organizers cancel an open campaign order and removes it outright', () => {
    expect(existsSync(migrationPath)).toBe(true)
    if (!existsSync(migrationPath)) return
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase()

    expect(sql).toContain('create or replace function public.cancel_customer_order(')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public, pg_temp')
    expect(sql).toContain('public.is_admin()')
    expect(sql).toContain('public.campaign_is_editable(')
    expect(sql).toContain('delete from public.orders')
  })

  it('keeps the RPC off anon and service_role while residents stay unable to delete orders', () => {
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase()

    expect(sql).toContain('revoke all on function public.cancel_customer_order(uuid)')
    expect(sql).toContain('from public, anon, service_role')
    expect(sql).toContain('grant execute on function public.cancel_customer_order(uuid)')
    expect(sql).toContain('to authenticated')
    expect(sql).not.toContain('grant delete on table public.orders to authenticated')
  })
})
