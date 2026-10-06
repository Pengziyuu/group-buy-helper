import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LiffClient } from './services/liffIdentity'

// Records when the campaign page's code is first asked for; its own file, so the rest of the suite keeps the real page.
const requested = vi.hoisted(() => ({ campaignPage: false }))
vi.mock('./App', () => {
  requested.campaignPage = true
  return { default: () => null }
})

const { LocalLiveResidentApp } = await import('./LocalLiveApps')

describe('resident campaign page loading', () => {
  it('starts fetching the page code while sign-in and the campaign data are still on their way', async () => {
    const pending = new Promise<never>(() => {})
    const client = {
      auth: {
        getSession: vi.fn(() => pending),
        getUser: vi.fn(() => pending),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
      rpc: vi.fn(() => pending),
      from: vi.fn(() => { throw new Error('not reached while signing in') }),
      channel: vi.fn(),
      removeChannel: vi.fn(),
    }
    const liffClient: LiffClient = {
      init: vi.fn(() => pending),
      isLoggedIn: vi.fn().mockReturnValue(false),
      login: vi.fn(),
      getProfile: vi.fn(() => pending),
      getIDToken: vi.fn().mockReturnValue(null),
    }

    render(<LocalLiveResidentApp client={client as never} campaignSlug="campaign-slug" liffId="2011099887-Resident" liffClient={liffClient} />)

    await vi.waitFor(() => expect(requested.campaignPage).toBe(true))
  })
})
