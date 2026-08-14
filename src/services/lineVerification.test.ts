import { describe, expect, it, vi } from 'vitest'
import { lineVerificationPublicMessage, verifyLineIdToken } from '../../supabase/functions/_shared/line'

describe('verifyLineIdToken', () => {
  it('verifies the ID token with LINE and returns only the trusted payload', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      iss: 'https://access.line.me',
      aud: '2011099887',
      sub: 'U-trusted',
      exp: 1_786_589_300,
      iat: 1_786_588_970,
      name: '團主甲',
      picture: 'https://profile.line-scdn.net/avatar',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await expect(verifyLineIdToken(
      'signed-id-token',
      '2011099887',
      fetcher,
      1_786_589_000,
    )).resolves.toEqual({
      subject: 'U-trusted',
      displayName: '團主甲',
      pictureUrl: 'https://profile.line-scdn.net/avatar',
    })

    const [url, request] = fetcher.mock.calls[0]
    expect(url).toBe('https://api.line.me/oauth2/v2.1/verify')
    expect(request.method).toBe('POST')
    expect(String(request.body)).toContain('id_token=signed-id-token')
    expect(String(request.body)).toContain('client_id=2011099887')
  })

  it('classifies safe external-browser diagnostics without exposing token material', async () => {
    const rejected = verifyLineIdToken(
      'sensitive-token',
      '2011099887',
      vi.fn().mockResolvedValue(new Response('{}', { status: 400 })),
      1_786_589_000,
    )
    await expect(rejected).rejects.toMatchObject({ code: 'LINE_VERIFY_REJECTED' })
    await rejected.catch((error: unknown) => {
      expect(lineVerificationPublicMessage(error)).toBe('LINE身分驗證失敗（LINE_VERIFY_REJECTED）')
      expect(lineVerificationPublicMessage(error)).not.toContain('sensitive-token')
    })

    const invalidAudience = verifyLineIdToken(
      'another-sensitive-token',
      '2011099887',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({
        iss: 'https://access.line.me', aud: 'another-channel', sub: 'U-trusted',
        exp: 1_786_589_300, iat: 1_786_588_970,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
      1_786_589_000,
    )
    await expect(invalidAudience).rejects.toMatchObject({ code: 'LINE_INVALID_AUDIENCE' })
  })
})
