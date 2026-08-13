import { describe, expect, it, vi } from 'vitest'
import { createLiveGateway, type LiveSupabaseClient } from './liveGateway'
import type { LiffClient } from './liffIdentity'

function clients(hasSession = false) {
  const supabase: LiveSupabaseClient = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: hasSession ? { user: {} } : null }, error: null }),
      signInAnonymously: vi.fn().mockResolvedValue({ data: { session: { user: {} } }, error: null }),
    },
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }),
    },
  }
  const liff: LiffClient = {
    init: vi.fn().mockResolvedValue(undefined),
    isLoggedIn: vi.fn().mockReturnValue(true),
    login: vi.fn(),
    getProfile: vi.fn().mockResolvedValue({ userId: 'U123', displayName: '斯祈' }),
    getIDToken: vi.fn().mockReturnValue('line-token'),
  }
  return { supabase, liff }
}

describe('createLiveGateway', () => {
  it('creates an anonymous Supabase session before loading LIFF identity', async () => {
    const { supabase, liff } = clients(false)
    const gateway = createLiveGateway(supabase, liff, '123-liff')

    await expect(gateway.initialize()).resolves.toEqual({
      displayName: '斯祈',
      pictureUrl: undefined,
      idToken: 'line-token',
    })
    expect(supabase.auth.signInAnonymously).toHaveBeenCalledOnce()
  })

  it('sends only the LINE token and requested whitelist unit to the binding function', async () => {
    const { supabase, liff } = clients(true)
    const gateway = createLiveGateway(supabase, liff, '123-liff')
    await gateway.initialize()
    await gateway.bindCustomer(2, '2k13')

    expect(supabase.functions.invoke).toHaveBeenCalledWith('bind-line-user', {
      body: { idToken: 'line-token', period: 2, unit: '2K13' },
    })
  })

  it('delegates order replacement to the validated submit-order function', async () => {
    const { supabase, liff } = clients(true)
    const gateway = createLiveGateway(supabase, liff, '123-liff')
    await gateway.submitOrder('campaign-1', { A: 2 })

    expect(supabase.functions.invoke).toHaveBeenCalledWith('submit-order', {
      body: { campaignId: 'campaign-1', items: { A: 2 } },
    })
  })
})
