import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  buildPickupMentionMessages,
  getLineGroupMemberIdsForCandidates,
  openPickupRecipientSnapshot,
  pickupEligibleRecipientSnapshotHash,
  pickupRecipientSnapshotHash,
  sealPickupRecipientSnapshot,
  verifyLineWebhookSignature,
} from '../../supabase/functions/_shared/pickupNotification'

describe('LINE pickup notification payload', () => {
  it('splits recipients into at most twenty real mention substitutions per textV2 message', () => {
    const recipients = Array.from({ length: 21 }, (_, index) => ({
      lineUserId: `U${String(index).padStart(32, '0')}`,
    }))

    const messages = buildPickupMentionMessages(recipients, '領取通知內容')

    expect(messages).toHaveLength(2)
    expect(Object.keys(messages[0].substitution)).toHaveLength(20)
    expect(Object.keys(messages[1].substitution)).toHaveLength(1)
    expect(messages[0].type).toBe('textV2')
    expect(messages[0].text).toContain('{user0}')
    expect(messages[0].substitution.user0).toEqual({
      type: 'mention',
      mentionee: { type: 'user', userId: recipients[0].lineUserId },
    })
  })

  it('rejects braces and messages that cannot fit safely in LINE text v2', () => {
    expect(() => buildPickupMentionMessages([{ lineUserId: `U${'1'.repeat(32)}` }], '錯誤 {內容}')).toThrow('通知內容不能包含大括號')
    expect(() => buildPickupMentionMessages([{ lineUserId: `U${'1'.repeat(32)}` }], '字'.repeat(4900))).toThrow('通知內容過長')
  })

  it('hashes the group and sorted unique recipient snapshot deterministically', async () => {
    const one = `U${'1'.repeat(32)}`
    const two = `U${'2'.repeat(32)}`
    const hash = await pickupRecipientSnapshotHash(`C${'a'.repeat(32)}`, [two, one, one])
    await expect(pickupRecipientSnapshotHash(`C${'a'.repeat(32)}`, [one, two])).resolves.toBe(hash)
    await expect(pickupRecipientSnapshotHash(`C${'b'.repeat(32)}`, [one, two])).resolves.not.toBe(hash)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('hashes sorted eligible LINE identities independently of group membership', async () => {
    const one = `U${'1'.repeat(32)}`
    const two = `U${'2'.repeat(32)}`
    const hash = await pickupEligibleRecipientSnapshotHash([two, one, one])
    await expect(pickupEligibleRecipientSnapshotHash([one, two])).resolves.toBe(hash)
    await expect(pickupEligibleRecipientSnapshotHash([one])).resolves.not.toBe(hash)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('seals recipient ids into an authenticated opaque token and rejects tampering', async () => {
    const intentId = '92000000-0000-4000-8000-000000000001'
    const groupId = `C${'a'.repeat(32)}`
    const ids = [`U${'1'.repeat(32)}`, `U${'2'.repeat(32)}`]
    const sealed = await sealPickupRecipientSnapshot('test-secret-with-at-least-32-characters', intentId, groupId, ids)
    expect(sealed).toMatch(new RegExp(`^${intentId}\\.[A-Za-z0-9_-]+$`))
    expect(sealed).not.toContain(groupId)
    expect(sealed).not.toContain(ids[0])
    await expect(openPickupRecipientSnapshot('test-secret-with-at-least-32-characters', sealed)).resolves.toEqual({ intentId, groupId, lineUserIds: ids })
    const separator = sealed.indexOf('.') + 1
    const replacement = sealed[separator] === 'A' ? 'B' : 'A'
    const tampered = sealed.slice(0, separator) + replacement + sealed.slice(separator + 1)
    await expect(openPickupRecipientSnapshot('test-secret-with-at-least-32-characters', tampered)).rejects.toThrow('預覽憑證無效')
  })

  it('verifies the LINE webhook signature against the exact raw request body', async () => {
    const secret = 'channel-secret'
    const body = '{"events":[]}'
    const signature = createHmac('sha256', secret).update(body).digest('base64')

    await expect(verifyLineWebhookSignature(body, signature, secret)).resolves.toBe(true)
    await expect(verifyLineWebhookSignature(`${body} `, signature, secret)).resolves.toBe(false)
  })

  it('checks only known purchasers and treats a missing member as unavailable', async () => {
    const one = `U${'1'.repeat(32)}`
    const two = `U${'2'.repeat(32)}`
    const request = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))

    await expect(getLineGroupMemberIdsForCandidates(
      `C${'a'.repeat(32)}`,
      [one, two],
      'secret-token',
      request,
    )).resolves.toEqual([one])
    expect(request).toHaveBeenCalledTimes(2)
    expect(String(request.mock.calls[0][0])).toContain(`/member/${one}`)
    expect(String(request.mock.calls[1][0])).toContain(`/member/${two}`)
    expect(request.mock.calls.map((call) => String(call[0])).join(' ')).not.toContain('/members/ids')
  })

  it('bounds purchaser membership checks to ten concurrent LINE requests', async () => {
    const candidates = Array.from({ length: 21 }, (_, index) => `U${String(index).padStart(32, '0')}`)
    let active = 0
    let maximumActive = 0
    const request = vi.fn(async () => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return new Response('{}', { status: 200 })
    })

    await expect(getLineGroupMemberIdsForCandidates(
      `C${'a'.repeat(32)}`,
      candidates,
      'secret-token',
      request,
    )).resolves.toEqual(candidates)
    expect(maximumActive).toBe(10)
  })

  it('checks more than one hundred purchasers before enforcing the final mention limit', async () => {
    const candidates = Array.from({ length: 101 }, (_, index) => `U${index.toString(16).padStart(32, '0')}`)
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 404 }))

    await expect(getLineGroupMemberIdsForCandidates(
      `C${'a'.repeat(32)}`,
      candidates,
      'secret-token',
      request,
    )).resolves.toEqual([])
    expect(request).toHaveBeenCalledTimes(101)
  })

  it('fails closed on non-200 successful HTTP statuses', async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    await expect(getLineGroupMemberIdsForCandidates(
      `C${'a'.repeat(32)}`,
      [`U${'1'.repeat(32)}`],
      'secret-token',
      request,
    )).rejects.toThrow('無法確認LINE群組成員')
  })

  it('fails closed on LINE membership errors without exposing authorization', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 403 }))
    await expect(getLineGroupMemberIdsForCandidates(
      `C${'a'.repeat(32)}`,
      [`U${'1'.repeat(32)}`],
      'secret-token',
      request,
    )).rejects.toThrow('無法確認LINE群組成員')
  })
})
