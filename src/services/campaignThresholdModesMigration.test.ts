import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20260904180000_campaign_threshold_modes.sql')

const sql = () => readFileSync(migrationPath, 'utf8')

describe('campaign threshold modes migration', () => {
  it('keeps existing campaigns on quantity thresholds and adds amount thresholds', () => {
    const migration = sql()

    expect(migration).toMatch(/add column threshold_kind text not null default 'quantity'/i)
    expect(migration).toMatch(/check \(threshold_kind in \('quantity', 'amount'\)\)/i)
    expect(migration).toMatch(/add column amount_threshold numeric\(14,2\)/i)
    expect(migration).toMatch(/threshold_kind = 'quantity'[\s\S]*amount_threshold is null[\s\S]*threshold_kind = 'amount'[\s\S]*amount_threshold > 0/i)
    expect(migration).toMatch(/update public\.campaign[\s\S]*set status = 'closed'[\s\S]*status = 'open'[\s\S]*sum\(order_item\.qty\)[\s\S]*>= campaign\.threshold/i)
  })

  it('serializes quantity submissions, rejects overflow, and closes only at the exact target', () => {
    const migration = sql()

    expect(migration).toMatch(/submit_customer_order[\s\S]*from public\.campaign[\s\S]*for update/i)
    expect(migration).toMatch(/v_other_quantity[\s\S]*sum\(order_item\.qty\)/i)
    expect(migration).toMatch(/v_other_quantity \+ v_desired_quantity > v_campaign\.threshold/i)
    expect(migration).toMatch(/此訂單最多可保留 % 個，請減少 % 個/i)
    expect(migration).toMatch(/v_other_quantity \+ v_desired_quantity = v_campaign\.threshold[\s\S]*set status = 'closed'/i)
    expect(migration).not.toMatch(/threshold_kind = 'amount'[\s\S]{0,300}set status = 'closed'/i)
  })

  it('publishes both threshold settings and exposes amount progress safely', () => {
    const migration = sql()

    expect(migration).toMatch(/publish_campaign_draft[\s\S]*threshold_kind = v_draft\.threshold_kind[\s\S]*amount_threshold = v_draft\.amount_threshold/i)
    expect(migration).toMatch(/create (?:or replace )?view public\.campaign_public[\s\S]*threshold_kind[\s\S]*amount_threshold/i)
    expect(migration).toMatch(/list_resident_campaigns[\s\S]*total_amount numeric/i)
    expect(migration).toMatch(/sum\(order_item\.qty \* campaign_item\.unit_price\)/i)
  })

  it('prevents reopening a quantity campaign that already reached its threshold', () => {
    const migration = sql()

    expect(migration).toMatch(/set_campaign_status[\s\S]*from public\.campaign[\s\S]*for update/i)
    expect(migration).toMatch(/p_status = 'open'[\s\S]*threshold_kind = 'quantity'[\s\S]*v_current_quantity >= v_campaign\.threshold/i)
    expect(migration).toMatch(/目前數量已達成團門檻，不能重新開團/i)
  })
})
