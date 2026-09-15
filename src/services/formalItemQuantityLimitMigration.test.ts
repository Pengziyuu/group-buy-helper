import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20260915100000_remove_formal_item_quantity_limit.sql')

describe('formal item quantity limit migration', () => {
  it('removes the product-level twenty item cap without weakening order authority', () => {
    expect(existsSync(migrationPath)).toBe(true)
    if (!existsSync(migrationPath)) return
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase()

    expect(sql).not.toContain('alter table public.order_item alter column qty type integer')
    expect(sql).toContain('alter table public.order_item drop constraint order_item_qty_check')
    expect(sql).toContain('check (qty >= 0)')
    expect(sql).not.toContain('check (qty >= 0 and qty <= 20)')
    expect(sql).toContain('create or replace function public.submit_customer_order(')
    expect(sql).toContain('set search_path = public, pg_temp')
    expect(sql).toContain('32767')
    expect(sql).not.toContain('2147483647')
    expect(sql).not.toContain('v_qty > 20')
    expect(sql).toContain('v_other_quantity + v_desired_quantity > v_campaign.threshold')
    expect(sql).toContain('discount_type')
    expect(sql).toMatch(/if v_order_id is not null and v_current_items = v_desired_items[\s\S]*return jsonb_build_object[\s\S]*if not public\.campaign_is_editable/)
    expect(sql).toContain('訂單已付款，不能修改')
    expect(sql).toContain('grant execute on function public.submit_customer_order(uuid, jsonb, jsonb) to authenticated, service_role')
  })

  it('keeps the separately confirmed custom-item quantity limit unchanged', () => {
    const customItemMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260911010000_resident_custom_order_items.sql'), 'utf8')
    expect(customItemMigration).toContain('not between 1 and 20')
  })
})
