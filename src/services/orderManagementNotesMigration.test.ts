import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(resolve('supabase/migrations/20260908_000021_order_management_notes.sql'), 'utf8')

describe('order management notes migration', () => {
  it('removes per-order pickup tracking and the obsolete RPC', () => {
    expect(sql).toMatch(/drop function\s+public\.set_order_fulfillment\(uuid, boolean, text\)/i)
    expect(sql).toMatch(/alter table public\.orders\s+drop column pickup_status/i)
    expect(sql).not.toMatch(/'pending'\s*,\s*'ready'\s*,\s*'picked_up'/i)
  })

  it('stores organizer notes behind admin-only RLS', () => {
    expect(sql).toMatch(/create table public\.organizer_order_note/i)
    expect(sql).toMatch(/length\(note\) <= 500/i)
    expect(sql).toMatch(/enable row level security/i)
    expect(sql).toMatch(/using \(public\.is_admin\(\)\)/i)
    expect(sql).toMatch(/with check \(public\.is_admin\(\)\)/i)
  })

  it('creates field-specific admin RPCs so concurrent payment and note writes cannot overwrite each other', () => {
    expect(sql).toMatch(/function public\.set_order_paid\([\s\S]*p_paid boolean/i)
    expect(sql).toMatch(/function public\.set_order_organizer_note\([\s\S]*p_organizer_note text/i)
    expect(sql).not.toMatch(/function public\.set_order_management/i)
    expect(sql).toMatch(/length\(coalesce\(p_organizer_note, ''\)\) > 500/i)
    expect(sql).toMatch(/revoke all on table public\.organizer_order_note from public, anon, authenticated/i)
    expect(sql).toMatch(/grant select on table public\.organizer_order_note to authenticated/i)
    expect(sql).toMatch(/grant execute on function public\.set_order_paid\(uuid, boolean\)\s+to authenticated/i)
    expect(sql).toMatch(/grant execute on function public\.set_order_organizer_note\(uuid, text\)\s+to authenticated/i)
    expect(sql).not.toMatch(/grant execute on function public\.set_order_(?:paid|organizer_note)\([^)]*\)\s+to [^;]*service_role/i)
  })

  it('locks campaign then order before calculating the persisted payment amount', () => {
    const paymentFunction = sql.match(/create function public\.set_order_paid\([\s\S]*?\n\$\$;/i)?.[0] ?? ''
    const campaignLock = paymentFunction.search(/from public\.campaign[\s\S]*?for update/i)
    const orderLock = paymentFunction.search(/perform 1\s+from public\.orders[\s\S]*?for update/i)
    const amountCalculation = paymentFunction.search(/sum\(order_item\.qty \* campaign_item\.unit_price\)/i)

    expect(campaignLock).toBeGreaterThanOrEqual(0)
    expect(orderLock).toBeGreaterThan(campaignLock)
    expect(amountCalculation).toBeGreaterThan(orderLock)
  })
})