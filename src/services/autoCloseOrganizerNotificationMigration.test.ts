import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20260921070000_auto_close_organizer_notifications.sql')

function migrationSql() {
  expect(existsSync(migrationPath)).toBe(true)
  return existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8').toLowerCase() : ''
}

describe('auto-close organizer notification migration', () => {
  it('stores one server-controlled recipient and lets only the signed-in approved organizer select themselves', () => {
    const sql = migrationSql()
    expect(sql).toContain('create table public.auto_close_notification_setting')
    expect(sql).toContain('organizer_auth_user_id uuid')
    expect(sql).toContain('create or replace function public.get_auto_close_notification_setting')
    expect(sql).toContain('create or replace function public.set_my_auto_close_notification_organizer')
    expect(sql).toContain('organizer_auth_user_id = auth.uid()')
    expect(sql).toContain('public.line_organizer_identity')
    expect(sql).not.toContain('p_selection_id')
    expect(sql).not.toContain('notification_selection_id')
    expect(sql).not.toContain('list_auto_close_notification_organizers')
  })

  it('creates a private durable outbox only for scheduled or quantity auto-close transitions', () => {
    const sql = migrationSql()
    expect(sql).toContain('create table public.campaign_auto_close_notification')
    expect(sql).toMatch(/old\.status\s*(=|<>)\s*'open'/)
    expect(sql).toMatch(/new\.status\s*(=|<>)\s*'closed'/)
    expect(sql).toContain("v_close_reason := 'scheduled'")
    expect(sql).toContain("v_close_reason := 'quantity'")
    expect(sql).toContain('if v_close_reason is null then')
    expect(sql).toContain('return new;')
    expect(sql).toContain('after update on public.campaign')
    expect(sql).not.toContain('after update of status on public.campaign')
    expect(sql).toContain('alter table public.campaign_auto_close_notification enable row level security')
    expect(sql).toMatch(/revoke all on table public\.campaign_auto_close_notification from public, anon, authenticated/)
  })

  it('snapshots only the selected trusted organizer and safely skips a missing setting', () => {
    const sql = migrationSql()
    expect(sql).toContain('public.auto_close_notification_setting')
    expect(sql).toContain('public.line_organizer_identity')
    expect(sql).toContain('recipient_line_user_id')
    expect(sql).toContain("delivery_status = 'skipped'")
    expect(sql).toContain("v_failure_code := 'missing_recipient_setting'")
    expect(sql).toContain("v_failure_code := 'missing_line_identity'")
  })

  it('preserves queued events when a campaign is deleted and skips a recipient whose approval was revoked', () => {
    const sql = migrationSql()
    expect(sql).toMatch(/campaign_id uuid\s+references public\.campaign\(id\) on delete set null/)
    expect(sql).not.toMatch(/campaign_id uuid not null references public\.campaign\(id\) on delete cascade/)
    expect(sql).toContain("failure_code = 'revoked_recipient'")
    expect(sql).toContain('with invalidated as (')
    expect(sql).toMatch(/candidates as \([\s\S]*and exists \([\s\S]*identity\.line_user_id = notification\.recipient_line_user_id/)
    expect(sql).toContain('admin_user.user_id = identity.auth_user_id')
  })

  it('claims committed outbox rows atomically and keeps one retry key for every retry', () => {
    const sql = migrationSql()
    expect(sql).toContain('create or replace function public.claim_campaign_auto_close_notifications')
    expect(sql).toContain('for update skip locked')
    expect(sql).toContain('line_retry_key')
    expect(sql).toContain("delivery_status in ('ready', 'retrying', 'sending')")
    expect(sql).toContain("delivery_status = 'sending'")
    expect(sql).toContain("interval '24 hours'")
  })

  it('keeps LINE completion and retry state separate from the campaign close transaction', () => {
    const sql = migrationSql()
    expect(sql).toContain('create or replace function public.complete_campaign_auto_close_notification')
    expect(sql).toContain('create or replace function public.fail_campaign_auto_close_notification')
    expect(sql).toContain("delivery_status = 'sent'")
    expect(sql).toMatch(/then 'retrying' else 'failed'/)
    expect(sql).toContain('next_attempt_at')
  })

  it('schedules the worker with secrets from Vault instead of embedding credentials', () => {
    const sql = migrationSql()
    expect(sql).toContain("'deliver-auto-close-organizer-notifications'")
    expect(sql).toContain('vault.decrypted_secrets')
    expect(sql).toContain('auto_close_notification_function_url')
    expect(sql).toContain('auto_close_notification_cron_secret')
    expect(sql).not.toContain('line_messaging_channel_access_token')
    expect(sql).not.toMatch(/https:\/\/api\.line\.me/)
  })
})
