import { describe, expect, it, vi } from 'vitest'
import { enforceLineLoginRateLimit } from '../../supabase/functions/_shared/lineRateLimit'

describe('enforceLineLoginRateLimit', () => {
  it('consumes both source and global limits using only hashed keys', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    await enforceLineLoginRateLimit({ rpc }, '203.0.113.7', 'server-pepper')

    expect(rpc).toHaveBeenCalledTimes(2)
    for (const [, parameters] of rpc.mock.calls) {
      expect(parameters.p_key_hash).toMatch(/^[0-9a-f]{64}$/)
      expect(JSON.stringify(parameters)).not.toContain('203.0.113.7')
      expect(JSON.stringify(parameters)).not.toContain('server-pepper')
    }
  })

  it('rejects before LINE verification when either limit is exhausted', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null })
    await expect(enforceLineLoginRateLimit({ rpc }, '203.0.113.7', 'server-pepper'))
      .rejects.toThrow('請稍後再試')
  })
})
