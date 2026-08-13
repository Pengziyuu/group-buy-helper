import { describe, expect, it, vi } from 'vitest'
import { createLineOrganizerGateway } from './lineOrganizerGateway'
import type { LiffClient } from './liffIdentity'

function liff(): LiffClient {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    isLoggedIn: vi.fn().mockReturnValue(true),
    login: vi.fn(),
    getProfile: vi.fn().mockResolvedValue({ userId: 'untrusted-profile-id', displayName: '團主甲' }),
    getIDToken: vi.fn().mockReturnValue('signed-line-token'),
  }
}

describe('createLineOrganizerGateway', () => {
  it('returns a safe pending request without creating a Supabase session', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { status: 'pending', requestCode: 'request-code', displayName: '團主甲' },
      error: null,
    })
    const verifyOtp = vi.fn()
    const gateway = createLineOrganizerGateway({
      auth: { verifyOtp, getUser: vi.fn() },
      functions: { invoke },
    }, liff(), '2011099887-PlmOrmYw')

    await expect(gateway.signIn()).resolves.toEqual({
      status: 'pending', requestCode: 'request-code', displayName: '團主甲',
    })
    expect(invoke).toHaveBeenCalledWith('line-organizer-login', {
      body: { idToken: 'signed-line-token' },
    })
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('exchanges an approved one-time token and verifies the resulting user', async () => {
    const session = { access_token: 'access-token', user: { id: 'auth-1' } }
    const verifyOtp = vi.fn().mockResolvedValue({ data: { session }, error: null })
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null })
    const gateway = createLineOrganizerGateway({
      auth: { verifyOtp, getUser },
      functions: { invoke: vi.fn().mockResolvedValue({
        data: { status: 'approved', tokenHash: 'one-time-hash', verificationType: 'email' }, error: null,
      }) },
    }, liff(), '2011099887-PlmOrmYw')

    await expect(gateway.signIn()).resolves.toEqual({ status: 'approved', session })
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'one-time-hash', type: 'email' })
    expect(getUser).toHaveBeenCalledWith('access-token')
  })
})
