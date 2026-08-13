import { describe, expect, it } from 'vitest'
import { clientAddress, readJsonBodyWithLimit } from '../../supabase/functions/_shared/http'

describe('public Edge Function HTTP boundaries', () => {
  it('rejects a declared body larger than the configured limit', async () => {
    const request = new Request('https://example.test', {
      method: 'POST',
      headers: { 'content-length': '20000' },
      body: '{}',
    })
    await expect(readJsonBodyWithLimit(request, 16_384)).rejects.toThrow('請求內容過大')
  })

  it('rejects a streamed body that exceeds the limit without a content length', async () => {
    const request = new Request('https://example.test', {
      method: 'POST',
      body: JSON.stringify({ idToken: 'x'.repeat(17_000) }),
    })
    await expect(readJsonBodyWithLimit(request, 16_384)).rejects.toThrow('請求內容過大')
  })

  it('parses a bounded JSON body and uses the first forwarded client address', async () => {
    const request = new Request('https://example.test', {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
      body: JSON.stringify({ idToken: 'token' }),
    })
    await expect(readJsonBodyWithLimit(request, 16_384)).resolves.toEqual({ idToken: 'token' })
    expect(clientAddress(request)).toBe('203.0.113.7')
  })

  it('fails closed when the platform provides no client address', () => {
    expect(() => clientAddress(new Request('https://example.test'))).toThrow('無法識別請求來源')
  })
})
