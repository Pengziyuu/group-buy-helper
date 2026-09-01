import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20260901_000020_item_names_and_prices.sql')

describe('per-item pricing migration', () => {
  it('persists validated item prices and publishes them atomically', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toMatch(/alter table public\.campaign_item[\s\S]*add column unit_price numeric\(12,2\)/i)
    expect(sql).toMatch(/update public\.campaign_item[\s\S]*campaign\.unit_price/i)
    expect(sql).toMatch(/valid_campaign_items[\s\S]*item \? 'unitPrice'[\s\S]*jsonb_typeof\(item -> 'unitPrice'\) <> 'number'/i)
    expect(sql).toMatch(/create or replace function public\.create_campaign_draft[\s\S]*'name', 'A'[\s\S]*'unitPrice', 0/i)
    expect(sql).toMatch(/publish_campaign_draft[\s\S]*jsonb_array_elements\(v_draft\.items\)[\s\S]*unitPrice/i)
    expect(sql).toMatch(/from public\.campaign_draft[\s\S]*where campaign_id = p_campaign_id[\s\S]*for update/i)
    expect(sql).toMatch(/insert into public\.campaign_item \([\s\S]*unit_price/i)
    expect(sql).toMatch(/jsonb_build_object\([\s\S]*'unitPrice', (?:ci|item)\.unit_price/i)
    expect(sql).toMatch(/revoke all on function public\.publish_campaign_draft\(uuid\)\s+from public, anon/i)
    expect(sql).toMatch(/grant execute on function public\.publish_campaign_draft\(uuid\)\s+to authenticated, service_role/i)
  })

  it('calculates fulfillment from persisted item prices', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toMatch(/set_order_fulfillment[\s\S]*sum\((?:oi|order_item)\.qty \* (?:ci|campaign_item)\.unit_price\)/i)
    expect(sql).toMatch(/set_order_fulfillment[\s\S]*from public\.orders[\s\S]*where id = p_order_id[\s\S]*for update/i)
    expect(sql).not.toMatch(/sum\(oi\.qty\)[\s\S]*\* c\.unit_price/i)
    expect(sql).toMatch(/if auth\.uid\(\) is null or not public\.is_admin\(\)/i)
  })
})
