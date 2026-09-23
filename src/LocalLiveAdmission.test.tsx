import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LocalLiveResidentApp } from './LocalLiveApps'
import { ResidentAdmissionError } from './services/lineResidentGateway'

function setup() {
  const session = { access_token: 'resident-token', user: { id: 'resident', is_anonymous: false } }
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: session.user }, error: null }),
      signOut: vi.fn(),
    },
    rpc: vi.fn(async (name: string) => ({ data: name === 'join_campaign_by_slug' ? [{ id: 'campaign' }]
      : name === 'get_line_resident_self' ? [{ display_name: '住戶甲', picture_url: null }]
        : [], error: null })),
    from: vi.fn((table: string) => ({ select: () => ({ eq: () => table === 'campaign_public'
      ? { single: async () => ({ data: { title: '受保護團購', unit_price: 50, threshold: 1, announcement: '', images: [], items: [], opened_at: '2026-09-01T00:00:00Z', status: 'open' }, error: null }) }
      : Promise.resolve({ data: [], error: null }) }) })),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
  }
  const liffClient = {
    init: vi.fn().mockResolvedValue(undefined), isLoggedIn: () => true, login: vi.fn(),
    getProfile: vi.fn().mockResolvedValue({ userId: 'untrusted', displayName: '住戶甲' }),
    getIDToken: vi.fn().mockReturnValue('fresh-token'),
  }
  const list = vi.fn().mockResolvedValue([])
  return { client, session, liffClient, list }
}

describe('resident first admission', () => {
  it.each([undefined, 'campaign-slug'])('keeps %s protected and rechecks LINE/server after joining', async (campaignSlug) => {
    const user = userEvent.setup()
    const { client, session, liffClient, list } = setup()
    let approve!: (value: unknown) => void
    const signIn = vi.fn().mockRejectedValueOnce(new ResidentAdmissionError('GROUP_MEMBERSHIP_REQUIRED'))
      .mockImplementationOnce(() => new Promise((resolve) => { approve = resolve }))
    render(<LocalLiveResidentApp client={client as never} campaignSlug={campaignSlug}
      liffId="resident-liff" liffClient={liffClient} lineResidentGateway={{ signIn }} residentListRepository={{ list }} />)
    expect(await screen.findByText('請先加入社區團購群組，才能使用團購系統')).toBeInTheDocument()
    expect(list).not.toHaveBeenCalled()
    expect(client.from).not.toHaveBeenCalled()
    expect(client.rpc).not.toHaveBeenCalledWith('join_campaign_by_slug', expect.anything())
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    // A partial/stale cached session must not bypass the explicit retry.
    client.auth.getSession.mockResolvedValue({ data: { session } as never, error: null })
    await user.click(screen.getByRole('button', { name: '已加入，重新確認' }))
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(2))
    expect(liffClient.init).toHaveBeenCalledTimes(2)
    expect(client.from).not.toHaveBeenCalled()
    expect(list).not.toHaveBeenCalled()
    await act(async () => approve({ session, identity: { displayName: '住戶甲', pictureUrl: null } }))
    expect(await screen.findByRole('heading', { name: campaignSlug ? '受保護團購' : /^團購$/ })).toBeInTheDocument()
  })
})
