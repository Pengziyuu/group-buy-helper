import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20260903144030_pickup_notification_environments.sql')

describe('pickup notification environment migration', () => {
  it('migrates the existing binding to test and creates independent group slots', () => {
    expect(existsSync(migrationPath)).toBe(true)
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain("update public.community_line_group set binding_kind = 'test'")
    expect(sql).toMatch(/primary key\s*\(community_id,\s*binding_kind\)/i)
    expect(sql).toMatch(/check\s*\(binding_kind in \('test', 'production'\)\)/i)
    expect(sql).not.toContain('drop constraint community_line_group_line_group_id_key')
  })

  it('binds reservation, inspection, claim, completion and webhook updates to one environment', () => {
    expect(existsSync(migrationPath)).toBe(true)
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toMatch(/pickup_notification_intent[\s\S]*add column binding_kind text/i)
    expect(sql).toContain('p_binding_kind text')
    expect(sql).toMatch(/binding\.binding_kind = p_binding_kind/i)
    expect(sql).toMatch(/intent\.binding_kind = p_binding_kind/i)
    expect(sql).toContain("pickup-environment:")
    expect(sql).toContain("delivery_status = 'sending'")
    expect(sql).toContain("return 'busy'")
    expect(sql).toMatch(/on conflict \(community_id, binding_kind\)/i)
    expect(sql).toMatch(/drop function public\.reserve_pickup_notification_intent\(uuid, text, uuid, uuid, text\)/i)
  })

  it('serializes reservation, claiming and rebinding with the same community slot lock', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql.match(/pickup-binding:/g)).toHaveLength(3)
    expect(sql).toMatch(/create function public\.reserve_pickup_notification_intent[\s\S]*pickup-binding:/i)
    expect(sql).toMatch(/create function public\.claim_pickup_notification_intent[\s\S]*pickup-binding:/i)
    expect(sql).toMatch(/create function public\.process_line_group_binding_event[\s\S]*pickup-binding:/i)
  })

  it('treats a matching already-sent intent as successful completion', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toMatch(/create function public\.mark_pickup_notification_intent_sent[\s\S]*delivery_status = 'sent'/i)
    expect(sql).toMatch(/intent\.campaign_id = p_campaign_id[\s\S]*intent\.audience = p_audience[\s\S]*intent\.caller_hash = p_caller_hash/i)
  })

  it('binds terminal inspection to the exact outbound message hash', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toMatch(/create function public\.inspect_pickup_notification_intent\([\s\S]*p_message_hash text/i)
    expect(sql).toMatch(/old_state\.delivery_status = 'ready'[\s\S]*intent\.message_hash = p_message_hash/i)
  })

  it('refuses cutover while a legacy sending intent is still retained', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const tableLock = sql.indexOf('lock table public.pickup_notification_intent in share row exclusive mode')
    const drainCheck = sql.indexOf("intent.delivery_status = 'sending'")

    expect(tableLock).toBeGreaterThan(-1)
    expect(drainCheck).toBeGreaterThan(tableLock)
    expect(sql).toMatch(/delivery_status = 'sending'[\s\S]*retain_until > now\(\)[\s\S]*legacy pickup notification still sending/i)
  })

  it('keeps explicit test campaign classification behind narrow organizer RPCs', () => {
    expect(existsSync(migrationPath)).toBe(true)
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('create table public.pickup_notification_test_campaign')
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('set_pickup_notification_test_campaign')
    expect(sql).toContain('list_pickup_notification_test_campaigns')
    expect(sql).toContain('is_approved_line_organizer()')
    expect(sql).toMatch(/revoke all on table public\.pickup_notification_test_campaign from public, anon, authenticated/i)
  })
})
