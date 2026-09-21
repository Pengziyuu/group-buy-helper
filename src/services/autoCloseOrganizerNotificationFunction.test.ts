import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const functionPath = resolve(process.cwd(), 'supabase/functions/send-auto-close-organizer-notifications/index.ts')

describe('auto-close organizer notification worker', () => {
  it('requires the server-only cron secret before using service-role access', () => {
    expect(existsSync(functionPath)).toBe(true)
    if (!existsSync(functionPath)) return
    const source = readFileSync(functionPath, 'utf8')
    expect(source).toContain("Deno.env.get('AUTO_CLOSE_NOTIFICATION_CRON_SECRET')")
    expect(source).toContain("request.headers.get('x-auto-close-cron-secret')")
    expect(source).toContain('timingSafeEqual')
    expect(source.indexOf('timingSafeEqual')).toBeLessThan(source.indexOf('SUPABASE_SERVICE_ROLE_KEY'))
  })

  it('claims server-derived organizer notifications and sends one-to-one LINE push with a stable retry key', () => {
    const source = readFileSync(functionPath, 'utf8')
    expect(source).toContain("rpc('claim_campaign_auto_close_notifications'")
    expect(source).toContain('https://api.line.me/v2/bot/message/push')
    expect(source).toContain("'X-Line-Retry-Key': notification.line_retry_key")
    expect(source).toContain('to: notification.recipient_line_user_id')
    expect(source).not.toContain('groupId')
    expect(source).not.toContain('recipient_line_user_ids')
  })

  it('uses the exact snapshotted payload and never accepts message or recipient input from the caller', () => {
    const source = readFileSync(functionPath, 'utf8')
    expect(source).toContain('notification.message_text')
    expect(source).not.toMatch(/body\.(message|recipient|lineUserId)/)
    expect(source).not.toMatch(/parsed\.(message|recipient|lineUserId)/)
  })

  it('treats an accepted retry conflict as success and persists bounded retry failures', () => {
    const source = readFileSync(functionPath, 'utf8')
    expect(source).toContain("response.status === 409")
    expect(source).toContain("response.headers.has('x-line-accepted-request-id')")
    expect(source).toMatch(/rpc\(\s*'complete_campaign_auto_close_notification'/)
    expect(source).toContain("rpc('fail_campaign_auto_close_notification'")
    expect(source).toContain('retryable')
    expect(source).toContain('AbortSignal.timeout')
  })

  it('does not expose LINE IDs, provider responses, secrets, or database details in its response', () => {
    const source = readFileSync(functionPath, 'utf8')
    expect(source).not.toMatch(/jsonResponse\([^\n]*recipient_line_user_id/)
    expect(source).not.toMatch(/jsonResponse\([^\n]*line_retry_key/)
    expect(source).not.toContain('await response.text()')
    expect(source).not.toContain('error.message')
  })
})
