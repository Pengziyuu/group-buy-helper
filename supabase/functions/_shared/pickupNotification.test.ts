import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  openPickupRecipientSnapshot,
  sealPickupRecipientSnapshot,
  openPickupReplyPayload,
  sealPickupReplyPayload,
  pickupEligibleRecipientSnapshotHash,
  assertPickupReplyPayloadSize,
  pickupPeriodSnapshotMatches,
  generatePickupReplyCommandCode,
  pickupReplyCommandText,
  parsePickupReplyCommand,
} from './pickupNotification'

const secret = 'test-secret-with-at-least-32-characters'
const intent = '92000000-0000-4000-8000-000000000001'
const group = `C${'a'.repeat(32)}`
const id = `U${'b'.repeat(32)}`

 describe('領取通知後端快照', () => {
  it('新 audience 的 eligible hash 會因同一住戶期別改變而改變，舊 audience 仍使用 ID 規格', async () => {
    const old = await pickupEligibleRecipientSnapshotHash([id])
    expect(await pickupEligibleRecipientSnapshotHash([{ lineUserId: id, period: 1 }], 'combined')).toBe(
      'bdfc798898e91a45104e2d5501d2920ce8b74fc37428ecb7846866ac432ddd86',
    )
    expect(await pickupEligibleRecipientSnapshotHash([{ lineUserId: id, period: 1 }], 'combined')).not.toBe(
      await pickupEligibleRecipientSnapshotHash([{ lineUserId: id, period: 2 }], 'combined'),
    )
    expect(await pickupEligibleRecipientSnapshotHash([id])).toBe(old)
  })

  it('新預覽憑證保存期別且舊版三欄憑證仍可解開', async () => {
    const newToken = await sealPickupRecipientSnapshot(secret, intent, 'production', group, [id], [1])
    expect((await openPickupRecipientSnapshot(secret, newToken)).periods).toEqual([1])
    const legacyToken = await sealPickupRecipientSnapshot(secret, intent, 'production', group, [id])
    expect(await openPickupRecipientSnapshot(secret, legacyToken)).toMatchObject({ lineUserIds: [id] })
    expect((await openPickupRecipientSnapshot(secret, legacyToken)).periods).toBeUndefined()
  })

  it('建指令遇到同一 ID 從一期變二期，拒絕舊預覽快照', async () => {
    const token = await sealPickupRecipientSnapshot(secret, intent, 'production', group, [id], [1])
    const opened = await openPickupRecipientSnapshot(secret, token)
    expect(pickupPeriodSnapshotMatches(opened, [{ lineUserId: id, period: 1 }])).toBe(true)
    expect(pickupPeriodSnapshotMatches(opened, [{ lineUserId: id, period: 2 }])).toBe(false)
    const legacy = await openPickupRecipientSnapshot(secret, await sealPickupRecipientSnapshot(secret, intent, 'production', group, [id]))
    expect(pickupPeriodSnapshotMatches(legacy, [{ lineUserId: id, period: 1 }])).toBe(false)
  })

  it('兩段長文的 JSON 可加密解開，仍限制總長及空白', async () => {
    const combined = JSON.stringify({ phase13: 'a'.repeat(4_000), phase2: 'b'.repeat(4_000) })
    expect(await openPickupReplyPayload(secret, intent, await sealPickupReplyPayload(secret, intent, combined))).toBe(combined)
    expect((await sealPickupReplyPayload(secret, intent, 'a'.repeat(8_972))).length).toBe(12_000)
    expect(() => assertPickupReplyPayloadSize('a'.repeat(8_973))).toThrow(/過長/)
    expect(() => assertPickupReplyPayloadSize(JSON.stringify({ phase13: '甲'.repeat(4_500), phase2: '乙'.repeat(4_500) }))).toThrow(/過長/)
    await expect(sealPickupReplyPayload(secret, intent, '甲'.repeat(12_001))).rejects.toThrow()
    await expect(sealPickupReplyPayload(secret, intent, '   ')).rejects.toThrow()
  })

  it('SQL 對新 audience 的 eligibility 納入期別並保留 claim 原子重新比對', () => {
    const migration = readFileSync('supabase/migrations/20260929010000_pickup_dual_mode.sql', 'utf8')
    expect(migration).toMatch(/eligible\.period|customer\.period.*line_user_id/s)
    expect(migration).toContain('get diagnostics v_claimed = row_count')
    expect(migration).toContain('and public.internal_pickup_notification_eligible_hash(v_intent.campaign_id, v_intent.audience) = p_eligible_hash')
    expect(migration).toContain('internal_pickup_notification_eligible_hash')
    const claim = readFileSync('supabase/migrations/20260921003000_pickup_notification_reply_commands.sql', 'utf8')
    expect(claim).toContain('public.internal_pickup_notification_eligible_hash(v_intent.campaign_id, v_intent.audience) <> p_eligible_hash')
  })
})

describe('領取通知短指令', () => {
  it('短碼只有 4 碼，不含容易看錯的 0、O、1、I', () => {
    for (let index = 0; index < 200; index += 1) {
      expect(generatePickupReplyCommandCode()).toMatch(/^[2-9A-HJ-NP-Z]{4}$/)
    }
    expect(pickupReplyCommandText('production', 'K7Q2')).toBe('發送領取通知 K7Q2')
    expect(pickupReplyCommandText('test', 'K7Q2')).toBe('測試領取通知 K7Q2')
  })

  it('群組裡貼回來的指令：正式與測試分開，空白和大小寫寬鬆', () => {
    const production = parsePickupReplyCommand('發送領取通知 K7Q2')
    expect(production).toEqual({ destination: 'production', hashKey: 'P-K7Q2' })
    expect(parsePickupReplyCommand('  發送領取通知　k7q2 ')).toEqual(production)
    expect(parsePickupReplyCommand('發送領取通知K7Q2')).toEqual(production)
    expect(parsePickupReplyCommand('測試領取通知 K7Q2')).toEqual({ destination: 'test', hashKey: 'T-K7Q2' })
    expect(parsePickupReplyCommand('發送領取通知 K7Q')).toBeNull()
    expect(parsePickupReplyCommand('發送領取通知 K7Q20')).toBeNull()
    expect(parsePickupReplyCommand('發送領取通知 K0Q2')).toBeNull()
    expect(parsePickupReplyCommand('請發送領取通知 K7Q2')).toBeNull()
  })

  it('上線前發出、還在 10 分鐘內的舊長指令照樣認得', () => {
    const legacy = 'x8Kq2Lm9Zr4Tb1Wn7Yc3Vd'
    expect(parsePickupReplyCommand(`發送領取通知 P-${legacy}`)).toEqual({ destination: 'production', hashKey: `P-${legacy}` })
    expect(parsePickupReplyCommand(`測試領取通知 T-${legacy}`)).toEqual({ destination: 'test', hashKey: `T-${legacy}` })
    // The old code is case-sensitive base64url, so it is not folded to upper case.
    expect(parsePickupReplyCommand(`發送領取通知 P-${legacy.toLowerCase()}`)).toEqual({ destination: 'production', hashKey: `P-${legacy.toLowerCase()}` })
  })
})
