import { describe, expect, it, vi } from 'vitest'
import { createLineResidentGateway } from './lineResidentGateway'

describe('createLineResidentGateway', () => {
  it('exchanges a trusted resident token and verifies the resulting Supabase user', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        status: 'approved',
        tokenHash: 'one-time-hash',
        verificationType: 'email',
        displayName: '彭梓育',
        pictureUrl: 'https://example.com/avatar.jpg',
      },
      error: null,
    })
    const verifyOtp = vi.fn().mockResolvedValue({
      data: { session: { access_token: 'access', user: { id: 'resident-uid' } } },
      error: null,
    })
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'resident-uid' } }, error: null })
    const gateway = createLineResidentGateway({ functions: { invoke }, auth: { verifyOtp, getUser } } as never)

    const result = await gateway.signIn('line-id-token', '0123456789abcdef0123456789abcdef0123')

    expect(invoke).toHaveBeenCalledWith('line-resident-login', {
      body: { idToken: 'line-id-token', inviteSlug: '0123456789abcdef0123456789abcdef0123' },
    })
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'email', token_hash: 'one-time-hash' })
    expect(getUser).toHaveBeenCalledWith('access')
    expect(result.identity).toEqual({ displayName: '彭梓育', pictureUrl: 'https://example.com/avatar.jpg' })
    expect(result.session.user.id).toBe('resident-uid')
  })

  it('rejects an exchanged session whose user cannot be verified', async () => {
    const gateway = createLineResidentGateway({
      functions: { invoke: vi.fn().mockResolvedValue({
        data: { status: 'approved', tokenHash: 'hash', verificationType: 'email', displayName: '住戶', pictureUrl: null },
        error: null,
      }) },
      auth: {
        verifyOtp: vi.fn().mockResolvedValue({ data: { session: { access_token: 'access', user: { id: 'uid-a' } } }, error: null }),
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'uid-b' } }, error: null }),
      },
    } as never)

    await expect(gateway.signIn('line-id-token', '0123456789abcdef0123456789abcdef0123'))
      .rejects.toThrow('住戶登入驗證失敗')
  })
})
