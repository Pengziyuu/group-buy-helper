import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  buildPickupDualModeMessages,
  sealPickupReplyPayload,
  openPickupReplyPayload,
  parsePickupDualModePayload,
  serializePickupDualModePayload,
} from '../../supabase/functions/_shared/pickupNotification'

const recipients = (count: number, period: number, start = 0) => Array.from({ length: count }, (_, i) => ({
  lineUserId: `U${(i + start).toString(16).padStart(32, '0')}`,
  period,
}))

describe('pickup backend dual mode', () => {
  it('ambient balances visible bubble lengths and puts its full body only after the last mentions', () => {
    const body = '常溫領取資訊：商品已到貨，請依團主公告的時間與地點領取。尚未付款的鄰居，有空再麻煩處理。'
    const people = [...recipients(19, 1), ...recipients(1, 2, 19), ...recipients(1, 3, 20)]
    const messages = buildPickupDualModeMessages('ambient', people, { all: body })
    expect(messages).toHaveLength(2)
    expect(messages[0].text).toMatch(/^\{user0\}( \{user\d+\})*$/)
    expect(messages[1].text).toContain(`\n${body}`)
    expect(messages.map((message) => Object.keys(message.substitution).length).reduce((sum, count) => sum + count, 0)).toBe(21)
    expect(messages.flatMap((message) => Object.values(message.substitution).map((item) => item.mentionee.userId)))
      .toEqual(people.map((person) => person.lineUserId))
    expect(Object.keys(messages[0].substitution).length).toBeGreaterThan(Object.keys(messages[1].substitution).length)
    expect(Math.abs(messages[0].text.length - messages[1].text.length)).toBeLessThan(20)
  })

  it('cold keeps phase13 and phase2 separate and puts each full body only in its own last bubble', () => {
    const people = [...recipients(21, 1), ...recipients(1, 3, 21), ...recipients(1, 2, 22)]
    const messages = buildPickupDualModeMessages('cold', people, { phase13: '一期三期寄櫃', phase2: '二期冷凍領取' })
    expect(messages).toHaveLength(3)
    expect(messages[0].text).toMatch(/^\{user0\}( \{user\d+\})*$/)
    expect(messages[1].text).toContain('一期三期寄櫃')
    expect(messages[2].text).toContain('二期冷凍領取')
    expect(messages.filter((message) => message.text.includes('一期三期寄櫃'))).toHaveLength(1)
    expect(messages.filter((message) => message.text.includes('二期冷凍領取'))).toHaveLength(1)
    expect(messages.flatMap((message) => Object.values(message.substitution).map((item) => item.mentionee.userId)))
      .toEqual([...people.filter((person) => person.period !== 2), ...people.filter((person) => person.period === 2)]
        .map((person) => person.lineUserId))
  })

  it('versions new commands without changing already issued dual-mode commands', () => {
    const bodies = { all: '常溫領取內容' }
    const versioned = serializePickupDualModePayload('ambient', bodies)
    expect(parsePickupDualModePayload('all', versioned)).toEqual({ bodies, batching: 'balanced-once' })
    expect(parsePickupDualModePayload('all', JSON.stringify(bodies))).toEqual({ bodies, batching: 'repeat' })
    const legacy = buildPickupDualModeMessages('ambient', recipients(21, 1), bodies, 'repeat')
    expect(legacy).toHaveLength(2)
    expect(legacy.every((message) => message.text.endsWith('常溫領取內容'))).toBe(true)
    expect(() => parsePickupDualModePayload('all', JSON.stringify({ ...bodies, batching: 'unsupported' }))).toThrow()
    expect(() => parsePickupDualModePayload('all', JSON.stringify({ ...bodies, extra: 'unexpected' }))).toThrow()
    expect(parsePickupDualModePayload('combined', serializePickupDualModePayload('cold', {
      phase13: '寄櫃', phase2: '冷凍',
    }))).toEqual({ bodies: { phase13: '寄櫃', phase2: '冷凍' }, batching: 'balanced-once' })
  })

  it('uses the fewest Reply bubbles within LINE limits and keeps the only body on the final bubble', () => {
    for (const count of [1, 20, 21, 40, 41, 100]) {
      const people = recipients(count, 1)
      const messages = buildPickupDualModeMessages('ambient', people, { all: '領取說明' })
      expect(messages).toHaveLength(Math.ceil(count / 20))
      expect(messages.every((message) => Object.keys(message.substitution).length >= 1
        && Object.keys(message.substitution).length <= 20 && message.text.length <= 5_000)).toBe(true)
      expect(messages.slice(0, -1).every((message) => /^\{user0\}( \{user\d+\})*$/.test(message.text))).toBe(true)
      expect(messages.filter((message) => message.text.includes('領取說明'))).toHaveLength(1)
      expect(messages.at(-1)?.text).toContain('領取說明')
      expect(messages.flatMap((message) => Object.values(message.substitution).map((item) => item.mentionee.userId)))
        .toEqual(people.map((person) => person.lineUserId))
    }
  })

  it('allocates more mentions to body-free bubbles when the reviewed text grows', () => {
    const people = recipients(21, 1)
    const short = buildPickupDualModeMessages('ambient', people, { all: '取貨通知' })
    const long = buildPickupDualModeMessages('ambient', people, { all: '詳細領取資訊'.repeat(35) })
    expect(Object.keys(long[0].substitution).length).toBeGreaterThan(Object.keys(short[0].substitution).length)
    expect(long[0].text).not.toContain('詳細領取資訊')
    expect(long[1].text).toContain('詳細領取資訊')
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
