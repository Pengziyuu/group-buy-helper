import { describe, expect, it, vi } from 'vitest'
import { loadLiffIdentity, type LiffClient } from './liffIdentity'

function fakeLiff(overrides: Partial<LiffClient>): LiffClient {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    isLoggedIn: vi.fn().mockReturnValue(true),
    login: vi.fn(),
    getProfile: vi.fn().mockResolvedValue({ userId: 'U123', displayName: '斯祈', pictureUrl: 'https://example/avatar.jpg' }),
    getIDToken: vi.fn().mockReturnValue('signed-line-token'),
    ...overrides,
  }
}

describe('loadLiffIdentity', () => {
  it('starts LINE login and returns null when the visitor is not authenticated', async () => {
    const client = fakeLiff({ isLoggedIn: vi.fn().mockReturnValue(false) })

    await expect(loadLiffIdentity(client, '123-liff')).resolves.toBeNull()
    expect(client.init).toHaveBeenCalledWith({ liffId: '123-liff' })
    expect(client.login).toHaveBeenCalledOnce()
  })

  it('returns verified profile material for the binding endpoint', async () => {
    const client = fakeLiff({})

    await expect(loadLiffIdentity(client, '123-liff')).resolves.toEqual({
      displayName: '斯祈',
      pictureUrl: 'https://example/avatar.jpg',
      idToken: 'signed-line-token',
    })
  })

  it('rejects a logged-in session that has no ID token', async () => {
    const client = fakeLiff({ getIDToken: vi.fn().mockReturnValue(null) })
    await expect(loadLiffIdentity(client, '123-liff')).rejects.toThrow('LINE ID token')
  })
})
