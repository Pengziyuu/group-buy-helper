import { describe, expect, it } from 'vitest'
import source from '../../supabase/functions/line-resident-login/index.ts?raw'
import config from '../../supabase/config.toml?raw'

const legacyResidentFunctions = import.meta.glob(
  '../../supabase/functions/{bind-line-user,submit-order}/index.ts',
)

describe('line-resident-login Edge Function boundary', () => {
  it('removes legacy resident Edge Functions that bypass or duplicate the canonical flow', () => {
    expect(Object.keys(legacyResidentFunctions)).toEqual([])
  })

  it('bounds input, verifies LINE, rate-limits, and provisions through the trusted RPC', () => {
    expect(source).toContain("request.method !== 'POST'")
    expect(source).toContain('readJsonBodyWithLimit(request, 16_384)')
    expect(source).toContain('idToken.length > 8_192')
    expect(source).not.toMatch(/inviteSlug|p_invite_slug/i)
    expect(source).toContain('enforceLineLoginRateLimit')
    expect(source).toContain('verifyLineIdToken')
    expect(source).toContain("admin.rpc('provision_line_resident'")
  })

  it('uses a deterministic non-deliverable account and emits only a one-time exchange token', () => {
    expect(source).toContain('@users.invalid')
    expect(source).toContain("type: 'magiclink'")
    expect(source).toContain('hashed_token')
    const successResponse = source.match(/return jsonResponse\(\(\{\s*status: 'approved'[\s\S]*?\}\)/)?.[0]
      ?? source.match(/return jsonResponse\(\{\s*status: 'approved'[\s\S]*?\}\)/)?.[0]
      ?? ''
    expect(successResponse).not.toMatch(/lineUserId/i)
    expect(successResponse).not.toMatch(/authUserId/i)
    expect(successResponse).not.toMatch(/\bemail\s*:/i)
  })

  it('is public only at the gateway layer while identity verification remains mandatory', () => {
    expect(config).toMatch(/\[functions\.line-resident-login\][\s\S]*verify_jwt = false/)
  })
})
