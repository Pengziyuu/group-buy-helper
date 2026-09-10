import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20260908183000_campaign_quantity_units.sql')
const migration = readFileSync(migrationPath, 'utf8')

describe('campaign quantity units migration', () => {
  it('keeps existing campaigns on 個 and restricts both draft and published units', () => {
    expect(migration).toMatch(/alter table public\.campaign[\s\S]*quantity_unit text not null default '個'/i)
    expect(migration).toMatch(/alter table public\.campaign_draft[\s\S]*quantity_unit text not null default '個'/i)
    expect(migration).toMatch(/quantity_unit in \('個', '盒', '包', '袋', '瓶', '罐', '組', '份', '條', '顆', '箱'\)/i)
    expect(migration).not.toMatch(/update public\.campaign\s+set quantity_unit/i)
  })

  it('publishes and exposes the selected unit through every resident read path', () => {
    expect(migration).toMatch(/publish_campaign_draft[\s\S]*quantity_unit = v_draft\.quantity_unit/i)
    expect(migration).toMatch(/campaign_public[\s\S]*quantity_unit/i)
    expect(migration).toMatch(/list_resident_campaigns[\s\S]*quantity_unit text[\s\S]*campaign\.quantity_unit/i)
  })

  it('uses the persisted unit in quantity-limit database errors', () => {
    expect(migration).toMatch(/此訂單最多可保留 % %，請減少 % %[\s\S]*v_campaign\.quantity_unit[\s\S]*v_campaign\.quantity_unit/i)
  })
})
