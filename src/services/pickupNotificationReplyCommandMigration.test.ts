import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20260921003000_pickup_notification_reply_commands.sql')

describe('pickup notification reply command migration', () => {
  it('stores only a hashed command and encrypted short-lived payload behind service role', () => {
    expect(existsSync(migrationPath)).toBe(true)
    if (!existsSync(migrationPath)) return
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase()
    expect(sql).toContain('create table public.pickup_notification_reply_command')
    expect(sql).toContain('command_hash text')
    expect(sql).toContain('payload_ciphertext text')
    expect(sql).not.toContain('command_plaintext')
    expect(sql).not.toContain('message_body')
    expect(sql).toMatch(/revoke all on table public\.pickup_notification_reply_command from public, anon, authenticated/)
    expect(sql).toMatch(/expires_at[\s\S]*interval '10 minutes'/)
    expect(sql).toMatch(/retain_until[\s\S]*interval '1 hour'/)
    expect(sql).toMatch(/update public\.pickup_notification_intent[\s\S]*set expires_at = v_expires_at/)
  })

  it('provides service-role-only issue inspect claim complete and fail boundaries', () => {
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase()
    for (const name of [
      'issue_pickup_notification_reply_command',
      'inspect_pickup_notification_reply_command',
      'claim_pickup_notification_reply_command',
      'complete_pickup_notification_reply_command',
      'fail_pickup_notification_reply_command',
    ]) {
      expect(sql).toContain(`function public.${name}`)
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*from public, anon, authenticated`))
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*to service_role`))
    }
    expect(sql).toContain("delivery_status in ('issued', 'replying', 'replied', 'failed')")
    expect(sql).toContain('line_webhook_event_replay')
    expect(sql).toContain('internal_pickup_notification_eligible_hash')
    expect(sql).toContain('pickup-environment:')
    expect(sql).toContain('pickup-binding:')
  })

  it('removes the old service-role push claim surface after a drain gate', () => {
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase()
    expect(sql).toMatch(/legacy pickup notification still sending/)
    expect(sql).toContain('drop function public.claim_pickup_notification_intent')
    expect(sql).toContain('drop function public.mark_pickup_notification_intent_sent')
    expect(sql).toContain('drop function public.inspect_pickup_notification_intent')
  })
})
