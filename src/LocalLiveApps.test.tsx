import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  LocalLiveAdminApp,
  LocalLiveResidentApp,
  type LiveAdminOrdersRepository,
  type LiveAdminRepository,
} from './LocalLiveApps'
import { initialOrders, items } from './data/demo'
import { buildOrganizerOrderSummary } from './domain/adminOrders'
import type { AdminCampaignSupabaseClient } from './services/adminCampaignGateway'
import type { CampaignContent } from './services/demoCampaignStore'

const published: CampaignContent = {
  title: 'Supabase 已發布冰餅團',
  unitPrice: 50,
  threshold: 80,
  announcement: '資料庫公告',
  images: [{ src: '/remote.svg', alt: '資料庫商品圖' }],
}

const orderSummary = buildOrganizerOrderSummary({ orders: initialOrders, items, unitPrice: 50, threshold: 80 })
const ordersRepository = (): LiveAdminOrdersRepository => ({
  loadCampaignStatus: vi.fn().mockResolvedValue('open'),
  loadSummary: vi.fn().mockResolvedValue(orderSummary),
  setCampaignStatus: vi.fn().mockResolvedValue(undefined),
  setOrderFulfillment: vi.fn().mockResolvedValue(undefined),
})

function authClient(session: unknown = null, getUserError: unknown = null) {
  const signInWithPassword = vi.fn().mockResolvedValue({
    data: { session: { access_token: 'session-token' } },
    error: null,
  })
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
      getUser: vi.fn().mockResolvedValue({
        data: { user: getUserError ? null : (session as { user?: unknown } | null)?.user ?? null },
        error: getUserError,
      }),
      signInWithPassword,
      signInAnonymously: vi.fn().mockResolvedValue({ data: { session: { access_token: 'resident-token' } }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  } as unknown as AdminCampaignSupabaseClient
  return { client, signInWithPassword }
}

describe('local Supabase visual demo apps', () => {
  it('requires organizer login before loading the remote editor', async () => {
    const user = userEvent.setup()
    const { client, signInWithPassword } = authClient()
    const repository: LiveAdminRepository = {
      loadPublished: vi.fn().mockResolvedValue(published),
      loadOptionalDraft: vi.fn().mockResolvedValue(null),
      saveDraft: vi.fn().mockResolvedValue(published),
      publish: vi.fn().mockResolvedValue(undefined),
    }
    const workflowRepository = ordersRepository()

    render(
      <LocalLiveAdminApp
        client={client}
        campaignId="campaign-1"
        repository={repository}
        ordersRepository={workflowRepository}
      />,
    )
    expect(await screen.findByRole('heading', { name: '團主登入' })).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'admin@example.test')
    await user.type(screen.getByLabelText('密碼'), 'password')
    await user.click(screen.getByRole('button', { name: '登入' }))

    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'admin@example.test', password: 'password' })
    expect(await screen.findByRole('textbox', { name: '團購標題' })).toHaveValue('Supabase 已發布冰餅團')
    expect(screen.getByText('已發布')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '結單' }))
    expect(workflowRepository.setCampaignStatus).toHaveBeenCalledWith('campaign-1', 'closed')
  })

  it('does not treat an anonymous resident session as an organizer login', async () => {
    const { client } = authClient({ user: { is_anonymous: true } })
    const repository: LiveAdminRepository = {
      loadPublished: vi.fn(),
      loadOptionalDraft: vi.fn(),
      saveDraft: vi.fn(),
      publish: vi.fn(),
    }

    render(
      <LocalLiveAdminApp
        client={client}
        campaignId="campaign-1"
        repository={repository}
        ordersRepository={ordersRepository()}
      />,
    )

    expect(await screen.findByRole('heading', { name: '團主登入' })).toBeInTheDocument()
    expect(client.auth.signOut).toHaveBeenCalled()
    expect(repository.loadPublished).not.toHaveBeenCalled()
  })

  it('signs out a stale organizer session left behind by a database reset', async () => {
    const staleSession = { access_token: 'stale-token', user: { id: 'deleted-user', is_anonymous: false } }
    const { client } = authClient(staleSession, {
      code: 'user_not_found',
      message: 'User from sub claim in JWT does not exist',
    })
    const repository: LiveAdminRepository = {
      loadPublished: vi.fn().mockResolvedValue(published),
      loadOptionalDraft: vi.fn().mockResolvedValue(null),
      saveDraft: vi.fn().mockResolvedValue(published),
      publish: vi.fn().mockResolvedValue(undefined),
    }
    const workflowRepository = ordersRepository()

    render(
      <LocalLiveAdminApp
        client={client}
        campaignId="campaign-1"
        repository={repository}
        ordersRepository={workflowRepository}
      />,
    )

    expect(await screen.findByRole('heading', { name: '團主登入' })).toBeInTheDocument()
    expect(client.auth.getUser).toHaveBeenCalled()
    expect(client.auth.signOut).toHaveBeenCalled()
    expect(repository.loadPublished).not.toHaveBeenCalled()
    expect(workflowRepository.loadCampaignStatus).not.toHaveBeenCalled()
    expect(workflowRepository.loadSummary).not.toHaveBeenCalled()
  })

  it('does not resurrect an older validated session after SIGNED_OUT', async () => {
    const staleSession = { access_token: 'old-token', user: { id: 'old-user', is_anonymous: false } }
    let authStateCallback: ((event: string, session: unknown) => void) | undefined
    let finishValidation: ((result: unknown) => void) | undefined
    const getUser = vi.fn().mockImplementation(() => new Promise((resolve) => {
      finishValidation = resolve
    }))
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: staleSession }, error: null }),
        getUser,
        signInWithPassword: vi.fn(),
        signOut: vi.fn().mockResolvedValue({ error: null }),
        onAuthStateChange: vi.fn().mockImplementation((callback) => {
          authStateCallback = callback
          return { data: { subscription: { unsubscribe: vi.fn() } } }
        }),
      },
    } as unknown as AdminCampaignSupabaseClient
    const repository: LiveAdminRepository = {
      loadPublished: vi.fn().mockResolvedValue(published),
      loadOptionalDraft: vi.fn().mockResolvedValue(null),
      saveDraft: vi.fn(),
      publish: vi.fn(),
    }
    const workflowRepository = ordersRepository()

    render(
      <LocalLiveAdminApp
        client={client}
        campaignId="campaign-1"
        repository={repository}
        ordersRepository={workflowRepository}
      />,
    )
    await waitFor(() => expect(getUser).toHaveBeenCalled())

    act(() => authStateCallback?.('SIGNED_OUT', null))
    await act(async () => {
      finishValidation?.({ data: { user: staleSession.user }, error: null })
    })

    expect(await screen.findByRole('heading', { name: '團主登入' })).toBeInTheDocument()
    expect(repository.loadPublished).not.toHaveBeenCalled()
    expect(workflowRepository.loadCampaignStatus).not.toHaveBeenCalled()
    expect(workflowRepository.loadSummary).not.toHaveBeenCalled()
  })

  it('does not let an older invalid session sign out a newer valid session', async () => {
    const oldSession = { access_token: 'old-token', user: { id: 'old-user', is_anonymous: false } }
    const newSession = { access_token: 'new-token', user: { id: 'new-user', is_anonymous: false } }
    let authStateCallback: ((event: string, session: unknown) => void) | undefined
    let finishOldValidation: ((result: unknown) => void) | undefined
    const getUser = vi.fn().mockImplementation((token: string) => {
      if (token === 'new-token') {
        return Promise.resolve({ data: { user: newSession.user }, error: null })
      }
      return new Promise((resolve) => {
        finishOldValidation = resolve
      })
    })
    const signOut = vi.fn().mockResolvedValue({ error: null })
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: oldSession }, error: null }),
        getUser,
        signInWithPassword: vi.fn(),
        signOut,
        onAuthStateChange: vi.fn().mockImplementation((callback) => {
          authStateCallback = callback
          return { data: { subscription: { unsubscribe: vi.fn() } } }
        }),
      },
    } as unknown as AdminCampaignSupabaseClient
    const repository: LiveAdminRepository = {
      loadPublished: vi.fn().mockResolvedValue(published),
      loadOptionalDraft: vi.fn().mockResolvedValue(null),
      saveDraft: vi.fn(),
      publish: vi.fn(),
    }

    render(
      <LocalLiveAdminApp
        client={client}
        campaignId="campaign-1"
        repository={repository}
        ordersRepository={ordersRepository()}
      />,
    )
    await waitFor(() => expect(getUser).toHaveBeenCalledWith('old-token'))

    act(() => authStateCallback?.('SIGNED_IN', newSession))
    expect(await screen.findByRole('textbox', { name: '團購標題' })).toBeInTheDocument()

    await act(async () => {
      finishOldValidation?.({
        data: { user: null },
        error: { code: 'user_not_found', message: 'deleted old user' },
      })
    })

    expect(signOut).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: '團購標題' })).toBeInTheDocument()
  })

  it('rejects a restored session whose authoritative user identity does not match', async () => {
    const cachedSession = { access_token: 'cached-token', user: { id: 'cached-user', is_anonymous: false } }
    const { client } = authClient(cachedSession)
    vi.mocked(client.auth.getUser).mockResolvedValue({
      data: { user: { id: 'different-user', is_anonymous: false } },
      error: null,
    } as never)
    const repository: LiveAdminRepository = {
      loadPublished: vi.fn().mockResolvedValue(published),
      loadOptionalDraft: vi.fn().mockResolvedValue(null),
      saveDraft: vi.fn(),
      publish: vi.fn(),
    }

    render(
      <LocalLiveAdminApp
        client={client}
        campaignId="campaign-1"
        repository={repository}
        ordersRepository={ordersRepository()}
      />,
    )

    expect(await screen.findByRole('heading', { name: '團主登入' })).toBeInTheDocument()
    expect(client.auth.signOut).toHaveBeenCalled()
    expect(repository.loadPublished).not.toHaveBeenCalled()
  })

  it('does not destroy a restored session when validation fails transiently', async () => {
    const session = { access_token: 'valid-token', user: { id: 'valid-user', is_anonymous: false } }
    const { client } = authClient(session, { code: 'request_timeout', message: 'temporary timeout' })
    const repository: LiveAdminRepository = {
      loadPublished: vi.fn().mockResolvedValue(published),
      loadOptionalDraft: vi.fn().mockResolvedValue(null),
      saveDraft: vi.fn(),
      publish: vi.fn(),
    }
    const workflowRepository = ordersRepository()

    render(
      <LocalLiveAdminApp
        client={client}
        campaignId="campaign-1"
        repository={repository}
        ordersRepository={workflowRepository}
      />,
    )

    expect(await screen.findByRole('heading', { name: '團主登入' })).toBeInTheDocument()
    expect(client.auth.signOut).not.toHaveBeenCalled()
    expect(repository.loadPublished).not.toHaveBeenCalled()
    expect(workflowRepository.loadCampaignStatus).not.toHaveBeenCalled()
    expect(workflowRepository.loadSummary).not.toHaveBeenCalled()
  })

  it('handles the SIGNED_OUT callback from stale-session cleanup without recursion', async () => {
    const staleSession = { access_token: 'stale-token', user: { id: 'deleted-user', is_anonymous: false } }
    let authStateCallback: ((event: string, session: unknown) => void) | undefined
    const signOut = vi.fn().mockImplementation(async () => {
      authStateCallback?.('SIGNED_OUT', null)
      return { error: null }
    })
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: staleSession }, error: null }),
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { code: 'user_not_found', message: 'deleted user' },
        }),
        signInWithPassword: vi.fn(),
        signOut,
        onAuthStateChange: vi.fn().mockImplementation((callback) => {
          authStateCallback = callback
          return { data: { subscription: { unsubscribe: vi.fn() } } }
        }),
      },
    } as unknown as AdminCampaignSupabaseClient
    const repository: LiveAdminRepository = {
      loadPublished: vi.fn().mockResolvedValue(published),
      loadOptionalDraft: vi.fn().mockResolvedValue(null),
      saveDraft: vi.fn(),
      publish: vi.fn(),
    }

    render(
      <LocalLiveAdminApp
        client={client}
        campaignId="campaign-1"
        repository={repository}
        ordersRepository={ordersRepository()}
      />,
    )

    expect(await screen.findByRole('heading', { name: '團主登入' })).toBeInTheDocument()
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(repository.loadPublished).not.toHaveBeenCalled()
  })

  it('ignores a pending session validation after unmount', async () => {
    const session = { access_token: 'pending-token', user: { id: 'pending-user', is_anonymous: false } }
    let finishValidation: ((result: unknown) => void) | undefined
    const getUser = vi.fn().mockImplementation(() => new Promise((resolve) => {
      finishValidation = resolve
    }))
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
        getUser,
        signInWithPassword: vi.fn(),
        signOut: vi.fn().mockResolvedValue({ error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
    } as unknown as AdminCampaignSupabaseClient
    const repository: LiveAdminRepository = {
      loadPublished: vi.fn().mockResolvedValue(published),
      loadOptionalDraft: vi.fn().mockResolvedValue(null),
      saveDraft: vi.fn(),
      publish: vi.fn(),
    }

    const view = render(
      <LocalLiveAdminApp
        client={client}
        campaignId="campaign-1"
        repository={repository}
        ordersRepository={ordersRepository()}
      />,
    )
    await waitFor(() => expect(getUser).toHaveBeenCalled())
    view.unmount()

    await act(async () => {
      finishValidation?.({ data: { user: session.user }, error: null })
    })

    expect(repository.loadPublished).not.toHaveBeenCalled()
    expect(client.auth.signOut).not.toHaveBeenCalled()
  })

  it('loads published campaign content for an anonymous resident session', async () => {
    const { client } = authClient()
    const single = vi.fn().mockResolvedValue({
      data: {
        title: published.title,
        unit_price: published.unitPrice,
        threshold: published.threshold,
        announcement: published.announcement,
        images: published.images,
        status: 'closed',
      },
      error: null,
    })
    const eq = vi.fn().mockReturnValue({ single })
    const select = vi.fn().mockReturnValue({ eq })
    const on = vi.fn().mockReturnThis()
    const subscribe = vi.fn().mockReturnThis()
    Object.assign(client, {
      rpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
      from: vi.fn().mockReturnValue({ select }),
      channel: vi.fn().mockReturnValue({ on, subscribe }),
      removeChannel: vi.fn().mockResolvedValue(undefined),
    })

    render(
      <LocalLiveResidentApp
        client={client}
        campaignId="campaign-1"
        campaignSlug="campaign-slug"
      />,
    )

    expect(await screen.findByRole('heading', { name: 'Supabase 已發布冰餅團' })).toBeInTheDocument()
    expect(screen.getByText(/Supabase Live Demo/)).toBeInTheDocument()
    expect(screen.getByText('已結單')).toBeInTheDocument()
  })
})
