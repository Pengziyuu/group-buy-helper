import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20260920203000_campaign_schedule.sql')
const hardeningMigrationPath = resolve(process.cwd(), 'supabase/migrations/20260920230000_harden_campaign_schedule.sql')

describe('campaign schedule migration', () => {
  it('adds published and draft schedule fields without inheriting the legacy deadline', () => {
    expect(existsSync(migrationPath)).toBe(true)
    if (!existsSync(migrationPath)) return
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase()
    expect(sql).toContain('add column arrival_label text not null default \'貨到通知\'')
    expect(sql).toContain('add column auto_close_at timestamptz')
    expect(sql).not.toMatch(/auto_close_at\s*=\s*deadline/)
  })

  it('closes due published campaigns and blocks writes before cron catches up', () => {
    expect(existsSync(hardeningMigrationPath)).toBe(true)
    if (!existsSync(hardeningMigrationPath)) return
    const sql = readFileSync(hardeningMigrationPath, 'utf8').toLowerCase()
    expect(sql).toContain('create or replace function public.campaign_is_editable')
    expect(sql).toContain('campaign.auto_close_at > clock_timestamp()')
    expect(sql).not.toMatch(/campaign\.deadline\s*>\s*now\(\)/)
  })

  it('enforces only supported and calendar-valid arrival labels at the database boundary', () => {
    expect(existsSync(hardeningMigrationPath)).toBe(true)
    if (!existsSync(hardeningMigrationPath)) return
    const sql = readFileSync(hardeningMigrationPath, 'utf8').toLowerCase()
    expect(sql).toContain('create or replace function public.is_valid_arrival_label')
    expect(sql).toContain('make_date(2000')
    expect(sql).toContain("arrival_label = '貨到通知'")
    expect(sql).toContain("(初|中|底)")
    expect(sql).toContain('check (public.is_valid_arrival_label(arrival_label))')
    expect(sql.match(/check \(public\.is_valid_arrival_label\(arrival_label\)\)/g)).toHaveLength(2)
  })

  it('publishes schedule fields without changing quantity-first auto close or amount behavior', () => {
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase()
    expect(sql).toContain('arrival_label = v_draft.arrival_label')
    expect(sql).toContain('auto_close_at = v_draft.auto_close_at')
    expect(sql).toContain("v_draft.threshold_kind = 'quantity'")
    expect(sql).toContain('v_current_quantity = v_draft.threshold')
    expect(sql).not.toMatch(/v_draft\.threshold_kind\s*=\s*'amount'[\s\S]{0,120}status\s*=\s*'closed'/)
  })

  it('exposes published schedules to residents and draft schedules only to organizers', () => {
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase()
    expect(sql).toContain('create or replace view public.campaign_public')
    expect(sql).toContain('arrival_label, auto_close_at')
    expect(sql).toContain('create function public.list_resident_campaigns()')
    expect(sql).toContain('create function public.list_admin_campaign_cards()')
  })
})
