import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  buildPickupDualModeMessages,
  sealPickupReplyPayload,
  openPickupReplyPayload,
} from '../../supabase/functions/_shared/pickupNotification'

const recipients = (count: number, period: number, start = 0) => Array.from({ length: count }, (_, i) => ({
  lineUserId: `U${(i + start).toString(16).padStart(32, '0')}`,
  period,
}))

describe('pickup backend dual mode', () => {
  it('ambient combines all three periods into one body and batches every mention', () => {
    const messages = buildPickupDualModeMessages('ambient', [...recipients(21, 1), ...recipients(1, 2, 21), ...recipients(1, 3, 22)], { all: '常溫領取資訊' })
    expect(messages).toHaveLength(2)
    expect(messages.flatMap((m) => Object.values(m.substitution).map((s) => s.mentionee.userId))).toHaveLength(23)
    expect(messages.every((m) => m.text.includes('常溫領取資訊'))).toBe(true)
  })

  it('cold keeps phase13 and phase2 separate with complete text in every batch', () => {
    const messages = buildPickupDualModeMessages('cold', [...recipients(21, 1), ...recipients(1, 3, 21), ...recipients(1, 2, 22)], { phase13: '一期三期寄櫃', phase2: '二期冷凍領取' })
    expect(messages).toHaveLength(3)
    expect(messages.slice(0, 2).every((m) => m.text.includes('一期三期寄櫃') && !m.text.includes('二期冷凍領取'))).toBe(true)
    expect(messages[2].text).toContain('二期冷凍領取')
  })

  it('fails closed above five Reply bubbles without dropping recipients', () => {
    expect(() => buildPickupDualModeMessages('cold', [...recipients(81, 1), ...recipients(1, 2, 81)], { phase13: '一期', phase2: '二期' })).toThrow(/5|指令/)
  })

  it('seals both bodies together and rejects invalid shapes', async () => {
    const secret = 'test-secret-with-at-least-32-characters'
    const id = '92000000-0000-4000-8000-000000000001'
    const payload = JSON.stringify({ phase13: '寄櫃', phase2: '冷凍' })
    expect(await openPickupReplyPayload(secret, id, await sealPickupReplyPayload(secret, id, payload))).toBe(payload)
    expect(() => buildPickupDualModeMessages('cold', recipients(1, 1), { phase13: '寄櫃' } as never)).toThrow()
  })

  it('migration binds combined audiences into reservation and claim eligibility', () => {
    const migration = readFileSync('supabase/migrations/20260929010000_pickup_dual_mode.sql', 'utf8')
    expect(migration).toContain("'all', 'combined'")
    expect(migration).toContain('internal_pickup_notification_eligible_hash')
    expect(migration).toContain('internal_pickup_notification_recipients')
  })

  it('replaces unused previews of the same campaign instead of counting mode switches against five slots', () => {
    const migration = readFileSync('supabase/migrations/20260929150000_replace_pickup_previews.sql', 'utf8')
    expect(migration).toContain('pickup_notification_reply_command')
    expect(migration).toContain('intent.campaign_id = p_campaign_id')
    expect(migration).toContain('intent.caller_hash = p_caller_hash')
    expect(migration).toContain('intent.binding_kind = p_binding_kind')
    expect(migration).toContain("intent.delivery_status = 'ready'")
    expect(migration).toContain('delete from public.pickup_notification_intent')
  })
})
