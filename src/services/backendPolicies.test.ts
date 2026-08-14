import { describe, expect, it } from 'vitest'
import {
  assertOrganizerBinding,
  assertOrganizerAuthenticationMethod,
  assertVerifiedLineTokenPayload,
  normalizeOrderItems,
  selectLineResidentAuthUserId,
} from '../../supabase/functions/_shared/policies'

describe('assertOrganizerAuthenticationMethod', () => {
  it('allows only LINE-controlled magic links and refreshes for a LINE organizer', () => {
    expect(() => assertOrganizerAuthenticationMethod(true, 'magiclink')).not.toThrow()
    expect(() => assertOrganizerAuthenticationMethod(true, 'otp')).not.toThrow()
    expect(() => assertOrganizerAuthenticationMethod(true, 'token_refresh')).not.toThrow()
    expect(() => assertOrganizerAuthenticationMethod(true, 'password')).toThrow('LINE驗證')
    expect(() => assertOrganizerAuthenticationMethod(true, 'recovery')).toThrow('LINE驗證')
  })

  it('does not restrict users who are not LINE organizers', () => {
    expect(() => assertOrganizerAuthenticationMethod(false, 'password')).not.toThrow()
  })
})

describe('assertOrganizerBinding', () => {
  it('returns the approved auth user when the admin membership matches', () => {
    expect(assertOrganizerBinding('auth-1', 'auth-1')).toBe('auth-1')
  })

  it('rejects an approved LINE binding without matching admin membership', () => {
    expect(() => assertOrganizerBinding('auth-1', null)).toThrow('團主資格設定不完整')
  })
})

describe('assertVerifiedLineTokenPayload', () => {
  const now = 1_786_589_000

  it('returns the LINE subject only for a current official payload and matching channel', () => {
    expect(assertVerifiedLineTokenPayload({
      iss: 'https://access.line.me',
      aud: '2011099887',
      sub: 'U123',
      exp: now + 300,
      iat: now - 30,
    }, '2011099887', now)).toBe('U123')
  })

  it('rejects a token verified for another LINE channel', () => {
    expect(() => assertVerifiedLineTokenPayload({
      iss: 'https://access.line.me',
      aud: 'another-channel',
      sub: 'U123',
      exp: now + 300,
      iat: now - 30,
    }, '2011099887', now)).toThrow('LINE_INVALID_AUDIENCE')
  })
})

describe('selectLineResidentAuthUserId', () => {
  it('reuses the organizer Auth UID for an organizer entering as a resident', () => {
    expect(selectLineResidentAuthUserId('organizer-uid', null)).toBe('organizer-uid')
    expect(selectLineResidentAuthUserId('organizer-uid', 'organizer-uid')).toBe('organizer-uid')
  })

  it('resumes an existing resident Auth UID', () => {
    expect(selectLineResidentAuthUserId(null, 'resident-uid')).toBe('resident-uid')
  })

  it('rejects conflicting organizer and resident bindings for the same LINE subject', () => {
    expect(() => selectLineResidentAuthUserId('organizer-uid', 'different-uid'))
      .toThrow('LINE身分綁定衝突')
  })

  it('returns null when a new resident account is required', () => {
    expect(selectLineResidentAuthUserId(null, null)).toBeNull()
  })
})

describe('normalizeOrderItems', () => {
  it('keeps positive integer quantities and drops zeros', () => {
    expect(normalizeOrderItems({ a: 2, B: 0, c: 1 }, ['A', 'B', 'C']))
      .toEqual({ A: 2, C: 1 })
  })

  it('rejects unknown product codes', () => {
    expect(() => normalizeOrderItems({ Z: 1 }, ['A', 'B']))
      .toThrow('不存在的品項')
  })

  it.each([-1, 1.5, 21])('rejects invalid quantity %s', (quantity) => {
    expect(() => normalizeOrderItems({ A: quantity }, ['A']))
      .toThrow('0 到 20 的整數')
  })
})
