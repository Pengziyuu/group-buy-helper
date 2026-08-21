import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  LocalLiveAdminApp,
  LocalLiveResidentApp,
  type LiveAdminOrdersRepository,
  type LiveAdminRepository,
  type LiveCampaignManagementRepository,
  type LiveResidentMemberRepository,
} from './LocalLiveApps'
import { initialOrders, items } from './data/demo'
import { buildOrganizerOrderSummary } from './domain/adminOrders'
import type { AdminCampaignSupabaseClient } from './services/adminCampaignGateway'
import type { CampaignContent } from './services/demoCampaignStore'
import type { LineOrganizerResult } from './services/lineOrganizerGateway'
import type { LineResidentSignInResult } from './services/lineResidentGateway'
import type { LiffClient } from './services/liffIdentity'
import {
  LOGOUT_TOMBSTONE_KEY,
  SUPABASE_AUTH_CODE_VERIFIER_KEY,
  SUPABASE_AUTH_FLOWS_CODE_VERIFIER_KEY,
  SUPABASE_AUTH_STORAGE_KEY,
  type AuthSessionStorage,
} from './services/authStorage'

const published: CampaignContent = {
  title: 'Supabase 已發布冰餅團',
  unitPrice: 50,
  threshold: 80,
  announcement: '資料庫公告',
  images: [{ src: '/remote.svg', alt: '資料庫商品圖' }],
  items: items.map((item) => ({ ...item, active: true })),
  openedAt: '2026-08-12T00:00:00Z',
}

const orderSummary = buildOrganizerOrderSummary({ orders: initialOrders, items, unitPrice: 50, threshold: 80 })
const ordersRepository = (): LiveAdminOrdersRepository => ({
  loadCampaignStatus: vi.fn().mockResolvedValue('open'),
  loadSummary: vi.fn().mockResolvedValue(orderSummary),
  setCampaignStatus: vi.fn().mockResolvedValue(undefined),
  setOrderFulfillment: vi.fn().mockResolvedValue(undefined),
})

function memoryAuthStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  const storage: AuthSessionStorage = {
    get length() { return values.size },
    getItem: vi.fn((key) => values.get(key) ?? null),
    key: vi.fn((index) => [...values.keys()][index] ?? null),
    setItem: vi.fn((key, value) => { values.set(key, value) }),
    removeItem: vi.fn((key) => { values.delete(key) }),
  }
  return { storage, values }
}

function authClient(session: unknown = null, getUserError: unknown = null) {
  const signInWithPassword = vi.fn().mockResolvedValue({
    data: {
      session: {
        access_token: 'session-token',
        user: { id: 'signed-in-admin', is_anonymous: false },
      },
    },
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
  it('opens the fixed resident LIFF entry and renders all published campaigns', async () => {
    const user = userEvent.setup()
    const { client } = authClient()
    const signIn = vi.fn<() => Promise<LineResidentSignInResult>>().mockResolvedValue({
      session: { access_token: 'resident-access', user: { id: 'resident-uid' } } as never,
      identity: { displayName: '彭梓育', pictureUrl: 'https://example.com/avatar.jpg' },
    })
    const list = vi.fn().mockResolvedValue([{
      slug: '0123456789abcdef0123456789abcdef0123',
      title: '早餐團購',
      status: 'open' as const,
      unitPrice: 55,
      openedAt: '2026-08-14T08:00:00.000Z',
      totalQuantity: 8,
      threshold: 10,
    }])
    const liffClient: LiffClient = {
      init: vi.fn().mockResolvedValue(undefined),
      isLoggedIn: vi.fn().mockReturnValue(true),
      login: vi.fn(),
      getProfile: vi.fn().mockResolvedValue({ userId: 'not-trusted', displayName: '前端名稱' }),
      getIDToken: vi.fn().mockReturnValue('trusted-line-id-token'),
    }

    render(
      <LocalLiveResidentApp
        client={client}
        liffId="2011099887-Resident"
        liffClient={liffClient}
        lineResidentGateway={{ signIn }}
        residentListRepository={{ list }}
      />,
    )

    expect(await screen.findByRole('heading', { name: '全部開團' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '早餐團購' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '彭梓育的LINE頭貼' })).toBeInTheDocument()
    expect(signIn).toHaveBeenCalledWith('trusted-line-id-token')
    expect(list).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: '登出' }))
    expect(client.auth.signOut).toHaveBeenCalledOnce()
    expect(await screen.findByText('已登出，請重新開啟住戶LINE入口')).toBeInTheDocument()
  })

  it('uses the production product name when the fixed resident entry is missing', async () => {
    const { client } = authClient()
    render(<LocalLiveResidentApp client={client} liffId="resident-liff" />)

    expect(await screen.findByText('無法載入住戶入口')).toBeInTheDocument()
    expect(screen.queryByText(/Demo/)).not.toBeInTheDocument()
  })

  it('shows the campaign list after organizer authentication when no campaign is selected', async () => {
    const user = userEvent.setup()
    const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
    const { client } = authClient(session)
    const managementRepository: LiveCampaignManagementRepository = {
      list: vi.fn().mockResolvedValue([{
        id: 'campaign-1', slug: 'share-slug', title: '歷史冰餅團', status: 'closed',
        openedAt: '2026-08-12T00:00:00Z', createdAt: '2026-08-12T00:00:00Z', updatedAt: '2026-08-12T01:00:00Z',
      }]),
      create: vi.fn(),
      delete: vi.fn().mockResolvedValue({ warning: null }),
    }
    const residentMemberRepository: LiveResidentMemberRepository = {
      list: vi.fn().mockResolvedValue([{
        memberCode: 'abcdef0123456789abcdef0123456789abcd',
        displayName: '住戶甲', pictureUrl: null, period: 2, unit: 'K13',
        joinedAt: '2026-08-14T00:00:00Z', blocked: false, blockedAt: null,
      }]),
      setBlocked: vi.fn().mockResolvedValue(undefined),
    }

    render(
      <LocalLiveAdminApp
        client={client}
        managementRepository={managementRepository}
        residentMemberRepository={residentMemberRepository}
        authStorage={null}
      />,
    )

    expect(await screen.findByRole('heading', { name: '我的團購' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '歷史冰餅團' })).toBeInTheDocument()
    expect(managementRepository.list).toHaveBeenCalledTimes(1)
    expect(residentMemberRepository.list).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: '住戶管理 1' }))
    expect(screen.getByRole('heading', { name: '住戶管理' })).toBeInTheDocument()
    expect(screen.getByText('住戶甲')).toBeInTheDocument()
  })

  it('opens a newly created draft before it has a published snapshot', async () => {
    const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
    const { client } = authClient(session)
    const newDraft: CampaignContent = {
      title: '週末麵包團', unitPrice: 0, threshold: 1, announcement: '', images: [],
      items: [{ code: 'ITEM1', name: 'A號', active: true }], openedAt: null,
    }
    const repository: LiveAdminRepository = {
      loadPublished: vi.fn().mockRejectedValue(new Error('尚未發布')),
      loadOptionalPublished: vi.fn().mockResolvedValue(null),
      loadOptionalDraft: vi.fn().mockResolvedValue(newDraft),
      saveDraft: vi.fn().mockResolvedValue(newDraft),
      publish: vi.fn().mockResolvedValue({ ...newDraft, openedAt: '2026-08-12T00:00:00Z' }),
    }

    render(
      <LocalLiveAdminApp
        client={client}
        campaignId="new-campaign"
        repository={repository}
        ordersRepository={ordersRepository()}
      />,
    )

    expect(await screen.findByRole('textbox', { name: '團購標題' })).toHaveValue('週末麵包團')
    expect(screen.getAllByText('A號')).not.toHaveLength(0)
    expect(screen.getByRole('button', { name: '發布並開團' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '結單' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '查看住戶端 ↗' })).not.toBeInTheDocument()
    expect(repository.loadOptionalPublished).toHaveBeenCalledWith('new-campaign')
  })

  it('uses LINE instead of email and shows a safe organizer approval code', async () => {
    const user = userEvent.setup()
    const { client } = authClient()
    const signIn = vi.fn<() => Promise<LineOrganizerResult>>().mockResolvedValue({
      status: 'pending',
      requestCode: 'f09df3a5-4d5d-4938-89a4-d8f8e91c2354',
      displayName: '團主甲',
    })

    render(
      <LocalLiveAdminApp
        client={client}
        campaignId="campaign-1"
        repository={{
          loadPublished: vi.fn(), loadOptionalDraft: vi.fn(), saveDraft: vi.fn(), publish: vi.fn(),
        }}
        ordersRepository={ordersRepository()}
        liffId="2011099887-PlmOrmYw"
        liffClient={{} as LiffClient}
        lineOrganizerGateway={{ signIn }}
      />,
    )

    expect(await screen.findByRole('button', { name: '使用 LINE 登入' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Email' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '使用 LINE 登入' }))
    expect(await screen.findByText('f09df3a5-4d5d-4938-89a4-d8f8e91c2354')).toBeInTheDocument()
    expect(screen.getByText(/團主甲/)).toBeInTheDocument()
  })

  it('requires organizer login before loading the remote editor', async () => {
    const user = userEvent.setup()
    const { client, signInWithPassword } = authClient()
    const repository: LiveAdminRepository = {
      loadPublished: vi.fn().mockResolvedValue(published),
      loadOptionalDraft: vi.fn().mockResolvedValue(null),
      loadResidentSlug: vi.fn().mockResolvedValue('82be35197b9a8c709a939627ce4c411d8de3'),
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
    expect(screen.getByRole('link', { name: '查看住戶端 ↗' })).toHaveAttribute(
      'href',
      '/campaign/82be35197b9a8c709a939627ce4c411d8de3',
    )
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

  it('keeps the editor mounted while revalidating the same organizer after returning from a picker', async () => {
    const user = userEvent.setup()
    const initialSession = {
      access_token: 'initial-token',
      user: { id: 'admin-user', is_anonymous: false },
    }
    const refreshedSession = { ...initialSession, access_token: 'refocused-token' }
    let authStateCallback: ((event: string, session: unknown) => void) | undefined
    let finishRevalidation: ((result: unknown) => void) | undefined
    const getUser = vi.fn()
      .mockResolvedValueOnce({ data: { user: initialSession.user }, error: null })
      .mockImplementationOnce(() => new Promise((resolve) => {
        finishRevalidation = resolve
      }))
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: initialSession }, error: null }),
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
    expect(await screen.findByRole('textbox', { name: '團購標題' })).toBeInTheDocument()
    expect(repository.loadPublished).toHaveBeenCalledTimes(1)
    const fileInput = screen.getByLabelText<HTMLInputElement>('商品圖片檔案')
    const selectedFile = new File(['image'], 'picker-return.png', { type: 'image/png' })
    await user.upload(fileInput, selectedFile)

    act(() => authStateCallback?.('SIGNED_IN', refreshedSession))
    await waitFor(() => expect(getUser).toHaveBeenCalledWith('refocused-token'))

    expect(screen.getByRole('textbox', { name: '團購標題' })).toBeInTheDocument()
    expect(screen.getByLabelText('商品圖片檔案')).toBe(fileInput)
    expect(fileInput.files?.[0]).toBe(selectedFile)
    expect(screen.queryByText('載入團購草稿與訂單…')).not.toBeInTheDocument()
    expect(repository.loadPublished).toHaveBeenCalledTimes(1)
    expect(workflowRepository.loadSummary).toHaveBeenCalledTimes(1)

    await act(async () => {
      finishRevalidation?.({ data: { user: initialSession.user }, error: null })
    })
    await waitFor(() => expect(getUser).toHaveBeenCalledTimes(2))
    expect(repository.loadPublished).toHaveBeenCalledTimes(1)
    expect(workflowRepository.loadSummary).toHaveBeenCalledTimes(1)
  })

  it('preserves a verified editor for Supabase AuthRetryableFetchError with status zero', async () => {
    const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
    let authStateCallback: ((event: string, session: unknown) => void) | undefined
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
        getUser: vi.fn()
          .mockResolvedValueOnce({ data: { user: session.user }, error: null })
          .mockResolvedValueOnce({
            data: { user: null },
            error: { status: 0, name: 'AuthRetryableFetchError', message: 'fetch failed' },
          }),
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

    render(
      <LocalLiveAdminApp
        client={client}
        campaignId="campaign-1"
        repository={repository}
        ordersRepository={ordersRepository()}
      />,
    )
    const editor = await screen.findByRole('textbox', { name: '團購標題' })

    act(() => authStateCallback?.('TOKEN_REFRESHED', session))

    await waitFor(() => expect(client.auth.getUser).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('textbox', { name: '團購標題' })).toBe(editor)
    expect(client.auth.signOut).not.toHaveBeenCalled()
  })

  it('fails closed immediately when same-user revalidation returns a terminal auth error', async () => {
    const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
    let authStateCallback: ((event: string, session: unknown) => void) | undefined
    const signOut = vi.fn().mockImplementation(() => new Promise(() => undefined))
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
        getUser: vi.fn()
          .mockResolvedValueOnce({ data: { user: session.user }, error: null })
          .mockResolvedValueOnce({
            data: { user: null },
            error: { status: 401, code: 'bad_jwt', message: 'JWT is no longer valid' },
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
    expect(await screen.findByRole('textbox', { name: '團購標題' })).toBeInTheDocument()

    act(() => authStateCallback?.('TOKEN_REFRESHED', session))

    expect(await screen.findByText('登出中…')).toBeInTheDocument()
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('textbox', { name: '團購標題' })).not.toBeInTheDocument()
  })

  it('clears the organizer UI before a direct sign-out request finishes', async () => {
    const user = userEvent.setup()
    const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
    const { client } = authClient(session)
    let finishSignOut: (() => void) | undefined
    vi.mocked(client.auth.signOut).mockImplementation(() => new Promise((resolve) => {
      finishSignOut = () => resolve({ error: null })
    }))
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
    expect(await screen.findByRole('textbox', { name: '團購標題' })).toBeInTheDocument()
    const authStateCallback = vi.mocked(client.auth.onAuthStateChange).mock.calls[0][0] as (
      event: string,
      nextSession: unknown,
    ) => void

    await user.click(screen.getByRole('button', { name: '登出' }))

    expect(await screen.findByText('登出中…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '登入' })).not.toBeInTheDocument()
    await act(async () => {
      authStateCallback('SIGNED_IN', session)
      authStateCallback('SIGNED_OUT', null)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(client.auth.getUser).toHaveBeenCalledTimes(1)
    expect(screen.getByText('登出中…')).toBeInTheDocument()
    expect(repository.loadPublished).toHaveBeenCalledTimes(1)

    await act(async () => {
      finishSignOut?.()
    })
    expect(await screen.findByRole('heading', { name: '團主登入' })).toBeInTheDocument()
  })

  it('keeps a replacement client blocked until the previous client sign-out settles', async () => {
    const user = userEvent.setup()
    const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
    let finishSignOut: (() => void) | undefined
    const first = authClient(session).client
    vi.mocked(first.auth.signOut).mockImplementation(() => new Promise((resolve) => {
      finishSignOut = () => resolve({ error: null })
    }))
    const second = authClient(session).client
    const primary = memoryAuthStorage({ [SUPABASE_AUTH_STORAGE_KEY]: 'persisted-session' })
    const fallback = memoryAuthStorage()
    const repository: LiveAdminRepository = {
      loadPublished: vi.fn().mockResolvedValue(published),
      loadOptionalDraft: vi.fn().mockResolvedValue(null),
      saveDraft: vi.fn(),
      publish: vi.fn(),
    }
    const view = render(
      <LocalLiveAdminApp
        client={first}
        campaignId="campaign-1"
        repository={repository}
        ordersRepository={ordersRepository()}
        authStorage={primary.storage}
        logoutFallbackStorage={fallback.storage}
      />,
    )
    expect(await screen.findByRole('textbox', { name: '團購標題' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '登出' }))
    expect(await screen.findByText('登出中…')).toBeInTheDocument()

    view.rerender(
      <LocalLiveAdminApp
        client={second}
        campaignId="campaign-1"
        repository={repository}
        ordersRepository={ordersRepository()}
        authStorage={primary.storage}
        logoutFallbackStorage={fallback.storage}
      />,
    )
    expect(screen.getByText('登出中…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '登入' })).not.toBeInTheDocument()
    expect(second.auth.getSession).not.toHaveBeenCalled()

    await act(async () => {
      finishSignOut?.()
    })
    expect(await screen.findByRole('heading', { name: '團主登入' })).toBeInTheDocument()
    expect(primary.values.has(SUPABASE_AUTH_STORAGE_KEY)).toBe(false)
    expect(fallback.values.has(LOGOUT_TOMBSTONE_KEY)).toBe(false)
  })

  it('clears persisted auth and reports when remote sign-out rejects', async () => {
    const user = userEvent.setup()
    const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
    const { client } = authClient(session)
    vi.mocked(client.auth.signOut).mockRejectedValue(new TypeError('offline'))
    const { storage, values } = memoryAuthStorage({ [SUPABASE_AUTH_STORAGE_KEY]: 'persisted-session' })
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
        authStorage={storage}
      />,
    )
    expect(await screen.findByRole('textbox', { name: '團購標題' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '登出' }))

    expect(await screen.findByRole('heading', { name: '團主登入' })).toBeInTheDocument()
    expect(values.has(SUPABASE_AUTH_STORAGE_KEY)).toBe(false)
    expect(values.has(LOGOUT_TOMBSTONE_KEY)).toBe(false)
    expect(screen.getByRole('alert')).toHaveTextContent('本機已登出，但無法撤銷遠端工作階段')
  })

  it('clears persisted auth when remote sign-out returns an error result', async () => {
    const user = userEvent.setup()
    const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
    const { client } = authClient(session)
    vi.mocked(client.auth.signOut).mockResolvedValue({
      error: { message: 'remote revoke failed' },
    } as Awaited<ReturnType<typeof client.auth.signOut>>)
    const { storage, values } = memoryAuthStorage({ [SUPABASE_AUTH_STORAGE_KEY]: 'persisted-session' })
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
        authStorage={storage}
      />,
    )
    expect(await screen.findByRole('textbox', { name: '團購標題' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '登出' }))

    expect(await screen.findByRole('heading', { name: '團主登入' })).toBeInTheDocument()
    expect(values.has(SUPABASE_AUTH_STORAGE_KEY)).toBe(false)
    expect(values.has(LOGOUT_TOMBSTONE_KEY)).toBe(false)
    expect(screen.getByRole('alert')).toHaveTextContent('本機已登出，但無法撤銷遠端工作階段')
  })

  it('removes fixed, flows, and per-flow PKCE verifier keys during logout', async () => {
    const user = userEvent.setup()
    const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
    const { client } = authClient(session)
    const perFlowKey = `${SUPABASE_AUTH_STORAGE_KEY}-flow-flow-id-code-verifier`
    const { storage, values } = memoryAuthStorage({
      [SUPABASE_AUTH_STORAGE_KEY]: 'persisted-session',
      [SUPABASE_AUTH_CODE_VERIFIER_KEY]: 'legacy-verifier',
      [SUPABASE_AUTH_FLOWS_CODE_VERIFIER_KEY]: 'flows-verifier',
      [perFlowKey]: 'per-flow-verifier',
    })
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
        authStorage={storage}
      />,
    )
    expect(await screen.findByRole('textbox', { name: '團購標題' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '登出' }))
    expect(await screen.findByRole('heading', { name: '團主登入' })).toBeInTheDocument()

    for (const key of [
      SUPABASE_AUTH_STORAGE_KEY,
      SUPABASE_AUTH_CODE_VERIFIER_KEY,
      SUPABASE_AUTH_FLOWS_CODE_VERIFIER_KEY,
      perFlowKey,
    ]) expect(values.has(key)).toBe(false)
  })

  it('cleans fixed and indexed auth keys when storage enumeration and both tombstones fail', async () => {
    const user = userEvent.setup()
    const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
    const { client } = authClient(session)
    const flowId = 'flow-id-1234'
    const perFlowKey = `${SUPABASE_AUTH_STORAGE_KEY}-flow-${flowId}-code-verifier`
    const values = new Map<string, string>([
      [SUPABASE_AUTH_STORAGE_KEY, 'persisted-session'],
      [SUPABASE_AUTH_CODE_VERIFIER_KEY, 'legacy-verifier'],
      [SUPABASE_AUTH_FLOWS_CODE_VERIFIER_KEY, JSON.stringify([flowId])],
      [perFlowKey, 'per-flow-verifier'],
    ])
    let lengthReads = 0
    const storage: AuthSessionStorage = {
      get length() {
        lengthReads += 1
        if (lengthReads === 1) throw new Error('length unavailable')
        return 2
      },
      getItem: vi.fn((keyName) => values.get(keyName) ?? null),
      get key(): ((index: number) => string | null) | undefined {
        throw new Error('key property unavailable')
      },
      setItem: vi.fn(() => { throw new Error('primary tombstone unavailable') }),
      removeItem: vi.fn((keyName) => { values.delete(keyName) }),
    }
    const fallback = memoryAuthStorage()
    fallback.storage.setItem = vi.fn(() => { throw new Error('fallback tombstone unavailable') })
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
        authStorage={storage}
        logoutFallbackStorage={fallback.storage}
      />,
    )
    expect(await screen.findByRole('textbox', { name: '團購標題' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '登出' }))

    expect(await screen.findByRole('heading', { name: '團主登入' })).toBeInTheDocument()
    expect(screen.queryByText('登出中…')).not.toBeInTheDocument()
    for (const keyName of [
      SUPABASE_AUTH_STORAGE_KEY,
      SUPABASE_AUTH_CODE_VERIFIER_KEY,
      SUPABASE_AUTH_FLOWS_CODE_VERIFIER_KEY,
      perFlowKey,
    ]) expect(values.has(keyName)).toBe(false)
  })

  it('keeps a fallback tombstone and blocks login when credential cleanup fails', async () => {
    const user = userEvent.setup()
    const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
    const first = authClient(session).client
    const primary = memoryAuthStorage({ [SUPABASE_AUTH_STORAGE_KEY]: 'persisted-session' })
    primary.storage.setItem = vi.fn(() => { throw new Error('primary storage is read-only') })
    primary.storage.removeItem = vi.fn((key) => {
      if (key === SUPABASE_AUTH_STORAGE_KEY) throw new Error('session removal failed')
      primary.values.delete(key)
    })
    const fallback = memoryAuthStorage()
    const repository: LiveAdminRepository = {
      loadPublished: vi.fn().mockResolvedValue(published),
      loadOptionalDraft: vi.fn().mockResolvedValue(null),
      saveDraft: vi.fn(),
      publish: vi.fn(),
    }
    const firstView = render(
      <LocalLiveAdminApp
        client={first}
        campaignId="campaign-1"
        repository={repository}
        ordersRepository={ordersRepository()}
        authStorage={primary.storage}
        logoutFallbackStorage={fallback.storage}
      />,
    )
    expect(await screen.findByRole('textbox', { name: '團購標題' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '登出' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('無法清除本機登入資料')
    expect(screen.queryByRole('button', { name: '登入' })).not.toBeInTheDocument()
    expect(primary.values.has(SUPABASE_AUTH_STORAGE_KEY)).toBe(true)
    expect(fallback.values.get(LOGOUT_TOMBSTONE_KEY)).toBe('1')
    firstView.unmount()

    const second = authClient(session).client
    render(
      <LocalLiveAdminApp
        client={second}
        campaignId="campaign-1"
        repository={repository}
        ordersRepository={ordersRepository()}
        authStorage={primary.storage}
        logoutFallbackStorage={fallback.storage}
      />,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('無法清除本機登入資料')
    expect(second.auth.getSession).not.toHaveBeenCalled()
    expect(repository.loadPublished).toHaveBeenCalledTimes(1)
    expect(fallback.values.get(LOGOUT_TOMBSTONE_KEY)).toBe('1')
  })

  it('uses a durable tombstone to prevent session restoration after reloading during sign-out', async () => {
    const user = userEvent.setup()
    const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
    const first = authClient(session).client
    vi.mocked(first.auth.signOut).mockImplementation(() => new Promise(() => undefined))
    const { storage, values } = memoryAuthStorage({ [SUPABASE_AUTH_STORAGE_KEY]: 'persisted-session' })
    const repository: LiveAdminRepository = {
      loadPublished: vi.fn().mockResolvedValue(published),
      loadOptionalDraft: vi.fn().mockResolvedValue(null),
      saveDraft: vi.fn(),
      publish: vi.fn(),
    }
    const firstView = render(
      <LocalLiveAdminApp
        client={first}
        campaignId="campaign-1"
        repository={repository}
        ordersRepository={ordersRepository()}
        authStorage={storage}
      />,
    )
    expect(await screen.findByRole('textbox', { name: '團購標題' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '登出' }))
    expect(await screen.findByText('登出中…')).toBeInTheDocument()
    expect(values.get(LOGOUT_TOMBSTONE_KEY)).toBe('1')
    firstView.unmount()

    const second = authClient(session).client
    render(
      <LocalLiveAdminApp
        client={second}
        campaignId="campaign-1"
        repository={repository}
        ordersRepository={ordersRepository()}
        authStorage={storage}
      />,
    )

    expect(await screen.findByRole('heading', { name: '團主登入' })).toBeInTheDocument()
    expect(second.auth.getSession).not.toHaveBeenCalled()
    expect(repository.loadPublished).toHaveBeenCalledTimes(1)
    expect(values.has(SUPABASE_AUTH_STORAGE_KEY)).toBe(false)
    expect(values.has(LOGOUT_TOMBSTONE_KEY)).toBe(false)
    expect(screen.getByRole('alert')).toHaveTextContent('先前的登出已在本機完成')

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'admin@example.test')
    await user.type(screen.getByLabelText('密碼'), 'password')
    await user.click(screen.getByRole('button', { name: '登入' }))
    expect(await screen.findByRole('textbox', { name: '團購標題' })).toBeInTheDocument()
    const recoveredAuthCallback = vi.mocked(second.auth.onAuthStateChange).mock.calls[0][0] as (
      event: string,
      nextSession: unknown,
    ) => void
    act(() => recoveredAuthCallback('SIGNED_OUT', null))
    expect(await screen.findByRole('heading', { name: '團主登入' })).toBeInTheDocument()
  })

  it('ignores an old client sign-in that resolves after the Supabase client changes', async () => {
    const user = userEvent.setup()
    const first = authClient().client
    const oldSignInResult = {
      data: {
        session: {
          access_token: 'old-client-token',
          user: { id: 'old-client-admin', is_anonymous: false },
        },
      },
      error: null,
    } as Awaited<ReturnType<typeof first.auth.signInWithPassword>>
    let finishOldSignIn: (() => void) | undefined
    vi.mocked(first.auth.signInWithPassword).mockImplementation(() => new Promise((resolve) => {
      finishOldSignIn = () => resolve(oldSignInResult)
    }))
    const second = authClient().client
    const repository: LiveAdminRepository = {
      loadPublished: vi.fn().mockResolvedValue(published),
      loadOptionalDraft: vi.fn().mockResolvedValue(null),
      saveDraft: vi.fn(),
      publish: vi.fn(),
    }
    const view = render(
      <LocalLiveAdminApp
        client={first}
        campaignId="campaign-1"
        repository={repository}
        ordersRepository={ordersRepository()}
      />,
    )
    expect(await screen.findByRole('heading', { name: '團主登入' })).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'admin@example.test')
    await user.type(screen.getByLabelText('密碼'), 'password')
    await user.click(screen.getByRole('button', { name: '登入' }))

    view.rerender(
      <LocalLiveAdminApp
        client={second}
        campaignId="campaign-1"
        repository={repository}
        ordersRepository={ordersRepository()}
      />,
    )
    expect(await screen.findByRole('heading', { name: '團主登入' })).toBeInTheDocument()

    await act(async () => {
      finishOldSignIn?.()
    })

    expect(screen.getByRole('heading', { name: '團主登入' })).toBeInTheDocument()
    expect(repository.loadPublished).not.toHaveBeenCalled()
  })

  it('does not reuse a verified organizer marker after the Supabase client changes', async () => {
    const session = { access_token: 'first-token', user: { id: 'admin-user', is_anonymous: false } }
    const first = authClient(session).client
    const secondSession = { ...session, access_token: 'second-token' }
    const second = authClient(secondSession).client
    vi.mocked(second.auth.getUser).mockImplementation(() => new Promise(() => undefined))
    const repository: LiveAdminRepository = {
      loadPublished: vi.fn().mockResolvedValue(published),
      loadOptionalDraft: vi.fn().mockResolvedValue(null),
      saveDraft: vi.fn(),
      publish: vi.fn(),
    }
    const workflowRepository = ordersRepository()
    const view = render(
      <LocalLiveAdminApp
        client={first}
        campaignId="campaign-1"
        repository={repository}
        ordersRepository={workflowRepository}
      />,
    )
    expect(await screen.findByRole('textbox', { name: '團購標題' })).toBeInTheDocument()

    view.rerender(
      <LocalLiveAdminApp
        client={second}
        campaignId="campaign-1"
        repository={repository}
        ordersRepository={workflowRepository}
      />,
    )

    expect(await screen.findByText('確認團主登入狀態…')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '團購標題' })).not.toBeInTheDocument()
    expect(repository.loadPublished).toHaveBeenCalledTimes(1)
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

  it('keeps a verified organizer session when the organizer opens the resident page', async () => {
    const organizerSession = {
      access_token: 'organizer-token',
      user: { id: 'admin-resident-user', is_anonymous: false },
    }
    const { client } = authClient(organizerSession)
    const single = vi.fn().mockResolvedValue({
      data: {
        title: published.title,
        unit_price: published.unitPrice,
        threshold: published.threshold,
        announcement: published.announcement,
        images: published.images,
        items: published.items,
        opened_at: published.openedAt,
        status: 'open',
      },
      error: null,
    })
    const campaignEq = vi.fn().mockReturnValue({ single })
    const wallEq = vi.fn().mockResolvedValue({ data: [], error: null })
    const on = vi.fn().mockReturnThis()
    const subscribe = vi.fn().mockReturnThis()
    Object.assign(client, {
      rpc: vi.fn((name: string) => Promise.resolve(name === 'get_customer_self'
        ? { data: [{ id: 'admin-customer', name: '團主住戶', period: 2, unit: 'A01' }], error: null }
        : name === 'get_line_resident_self'
          ? { data: [{ display_name: '團主住戶', picture_url: null }], error: null }
          : { data: [{ id: 'campaign-1' }], error: null })),
      from: vi.fn((table: string) => table === 'campaign_public'
        ? { select: vi.fn().mockReturnValue({ eq: campaignEq }) }
        : { select: vi.fn().mockReturnValue({ eq: wallEq }) }),
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

    expect(await screen.findByRole('heading', { name: published.title })).toBeInTheDocument()
    expect(client.auth.getUser).toHaveBeenCalledWith('organizer-token')
    expect(client.auth.signInAnonymously).not.toHaveBeenCalled()
  })

  it('rejects a restored resident session when Supabase returns another user', async () => {
    const session = {
      access_token: 'mismatched-token',
      user: { id: 'stored-user', is_anonymous: false },
    }
    const { client } = authClient(session)
    client.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'authoritative-user', is_anonymous: false } },
      error: null,
    })
    const rpc = vi.fn()
    Object.assign(client, { rpc })

    render(<LocalLiveResidentApp client={client} campaignSlug="campaign-slug" />)

    expect(await screen.findByText('住戶登入狀態無效，請重新開啟頁面')).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
    expect(client.auth.signInAnonymously).not.toHaveBeenCalled()
  })

  it('fails closed when Supabase rejects a restored resident token', async () => {
    const session = {
      access_token: 'expired-token',
      user: { id: 'stored-user', is_anonymous: false },
    }
    const { client } = authClient(session)
    client.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: new Error('JWT expired'),
    })
    const rpc = vi.fn()
    Object.assign(client, { rpc })

    render(<LocalLiveResidentApp client={client} campaignSlug="campaign-slug" />)

    expect(await screen.findByText('JWT expired')).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
    expect(client.auth.signInAnonymously).not.toHaveBeenCalled()
  })

  it('binds a first-time resident through the trusted RPC and enables ordering', async () => {
    const user = userEvent.setup()
    const session = { access_token: 'resident-token', user: { id: 'resident-uid', is_anonymous: false } }
    const { client } = authClient(session)
    const single = vi.fn().mockResolvedValue({
      data: {
        title: published.title, unit_price: published.unitPrice, threshold: published.threshold,
        announcement: published.announcement, images: published.images, items: published.items,
        opened_at: published.openedAt, status: 'open',
      },
      error: null,
    })
    const campaignEq = vi.fn().mockReturnValue({ single })
    const wallEq = vi.fn().mockResolvedValue({ data: [], error: null })
    const rpc = vi.fn((name: string) => {
      if (name === 'join_campaign_by_slug') return Promise.resolve({ data: [{ id: 'campaign-1' }], error: null })
      if (name === 'get_line_resident_self') return Promise.resolve({
        data: [{ display_name: '彭梓育', picture_url: 'https://example.com/avatar.jpg' }], error: null,
      })
      if (name === 'get_customer_self') return Promise.resolve({ data: [], error: null })
      if (name === 'bind_customer_self') return Promise.resolve({
        data: [{ id: 'customer-new', name: '彭梓育', period: 2, unit: 'A01' }], error: null,
      })
      throw new Error(`unexpected RPC ${name}`)
    })
    const on = vi.fn().mockReturnThis()
    const subscribe = vi.fn().mockReturnThis()
    Object.assign(client, {
      rpc,
      from: vi.fn((table: string) => table === 'campaign_public'
        ? { select: vi.fn().mockReturnValue({ eq: campaignEq }) }
        : { select: vi.fn().mockReturnValue({ eq: wallEq }) }),
      channel: vi.fn().mockReturnValue({ on, subscribe }),
      removeChannel: vi.fn().mockResolvedValue(undefined),
    })

    render(<LocalLiveResidentApp client={client} campaignSlug="campaign-slug" />)

    expect(await screen.findByText('彭梓育')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '姓名' })).not.toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: '戶號' }), 'a01')
    await user.click(screen.getByRole('button', { name: '儲存住戶資料' }))

    expect(rpc).toHaveBeenCalledWith('bind_customer_self', {
      p_period: 2, p_unit: 'A01',
    })
    expect(await screen.findByRole('button', { name: '增加 A號' })).toBeInTheDocument()
  })

  it('loads published campaign content for a verified LINE resident session', async () => {
    const session = { access_token: 'resident-token', user: { id: 'resident-user', is_anonymous: false } }
    const { client } = authClient(session)
    const single = vi.fn().mockResolvedValue({
      data: {
        title: published.title,
        unit_price: published.unitPrice,
        threshold: published.threshold,
        announcement: published.announcement,
        images: published.images,
        items: published.items,
        opened_at: published.openedAt,
        status: 'closed',
      },
      error: null,
    })
    const eq = vi.fn().mockReturnValue({ single })
    const campaignSelect = vi.fn().mockReturnValue({ eq })
    const wallEq = vi.fn().mockResolvedValue({
      data: [{
        order_id: 'order-live-1', customer_id: 'customer-live-1', customer_name: '資料庫住戶',
        picture_url: 'https://example.com/resident.jpg',
        period: 2, unit: '9Z9', item_code: published.items[0].code, qty: 3,
        ordered_at: '2026-08-14T01:00:00Z', order_updated_at: '2026-08-14T01:05:00Z',
      }],
      error: null,
    })
    const customerSelect = vi.fn().mockResolvedValue({
      data: [{ id: 'customer-live-1', name: '資料庫住戶', period: 2, unit: '9Z9' }],
      error: null,
    })
    const from = vi.fn((table: string) => {
      if (table === 'campaign_public') return { select: campaignSelect }
      if (table === 'order_wall') return { select: vi.fn().mockReturnValue({ eq: wallEq }) }
      return { select: customerSelect }
    })
    const on = vi.fn().mockReturnThis()
    const subscribe = vi.fn().mockReturnThis()
    Object.assign(client, {
      rpc: vi.fn((name: string) => Promise.resolve(name === 'get_customer_self'
        ? { data: [{ id: 'customer-live-1', name: '資料庫住戶', period: 2, unit: '9Z9' }], error: null }
        : name === 'get_line_resident_self'
          ? { data: [{ display_name: '資料庫住戶', picture_url: 'https://example.com/resident.jpg' }], error: null }
          : { data: [{ id: 'campaign-1' }], error: null })),
      from,
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
    expect(screen.getAllByText('資料庫住戶').length).toBeGreaterThan(0)
    expect(screen.getByRole('img', { name: '資料庫住戶的LINE頭貼' })).toBeInTheDocument()
    expect(screen.getByText('下單時間 2026/08/14 09:00')).toBeInTheDocument()
    expect(screen.getByText('已修改・最後修改 2026/08/14 09:05')).toBeInTheDocument()
    expect(screen.queryByText('斯祈')).not.toBeInTheDocument()
  })

  it('resolves a resident share slug to its campaign id before loading data', async () => {
    const session = { access_token: 'resident-token', user: { id: 'resident-user', is_anonymous: false } }
    const { client } = authClient(session)
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [{ id: 'resolved-campaign' }], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ display_name: '住戶', picture_url: null }], error: null })
    const single = vi.fn().mockResolvedValue({
      data: {
        title: '分享團', unit_price: 50, threshold: 10, announcement: '', images: [],
        items: [{ code: 'ITEM1', name: 'A號', active: true }],
        opened_at: '2026-08-12T00:00:00Z', status: 'open',
      },
      error: null,
    })
    const campaignEq = vi.fn().mockReturnValue({ single })
    const wallEq = vi.fn().mockResolvedValue({ data: [], error: null })
    const from = vi.fn((table: string) => table === 'campaign_public'
      ? { select: vi.fn().mockReturnValue({ eq: campaignEq }) }
      : { select: vi.fn().mockReturnValue({ eq: wallEq }) })
    const on = vi.fn().mockReturnThis()
    const subscribe = vi.fn().mockReturnThis()
    Object.assign(client, {
      rpc,
      from,
      channel: vi.fn().mockReturnValue({ on, subscribe }),
      removeChannel: vi.fn(),
    })

    render(<LocalLiveResidentApp client={client} campaignSlug="share-slug" />)

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('join_campaign_by_slug', { p_slug: 'share-slug' }))
    await waitFor(() => expect(campaignEq).toHaveBeenCalledWith('id', 'resolved-campaign'))
  })

  it('ignores an older realtime failure after a manual sync retry succeeds', async () => {
    const user = userEvent.setup()
    const session = { access_token: 'resident-token', user: { id: 'resident-user', is_anonymous: false } }
    const { client } = authClient(session)
    const publishedRow = {
      title: published.title,
      unit_price: published.unitPrice,
      threshold: published.threshold,
      announcement: published.announcement,
      images: published.images,
      items: published.items,
      opened_at: published.openedAt,
      status: 'open',
    }
    let rejectStaleRequest!: (reason?: unknown) => void
    const staleRequest = new Promise<never>((_, reject) => { rejectStaleRequest = reject })
    const single = vi.fn()
      .mockResolvedValueOnce({ data: publishedRow, error: null })
      .mockRejectedValueOnce(new Error('第一次同步失敗'))
      .mockImplementationOnce(() => staleRequest)
      .mockResolvedValue({ data: publishedRow, error: null })
    const campaignEq = vi.fn().mockReturnValue({ single })
    const wallEq = vi.fn().mockResolvedValue({ data: [], error: null })
    const callbacks: Array<() => void> = []
    const channel = {
      on: vi.fn((_event: string, _filter: unknown, callback: () => void) => {
        callbacks.push(callback)
        return channel
      }),
      subscribe: vi.fn(() => channel),
    }
    Object.assign(client, {
      rpc: vi.fn((name: string) => Promise.resolve(name === 'get_customer_self'
        ? { data: [{ id: 'customer-1', name: '測試住戶', period: 2, unit: 'A01' }], error: null }
        : name === 'get_line_resident_self'
          ? { data: [{ display_name: '測試住戶', picture_url: null }], error: null }
          : { data: [{ id: 'campaign-1' }], error: null })),
      from: vi.fn((table: string) => table === 'campaign_public'
        ? { select: vi.fn().mockReturnValue({ eq: campaignEq }) }
        : { select: vi.fn().mockReturnValue({ eq: wallEq }) }),
      channel: vi.fn().mockReturnValue(channel),
      removeChannel: vi.fn().mockResolvedValue(undefined),
    })

    render(<LocalLiveResidentApp client={client} campaignSlug="campaign-slug" />)
    expect(await screen.findByRole('heading', { name: published.title })).toBeInTheDocument()

    act(() => { callbacks[0]() })
    expect(await screen.findByRole('alert')).toHaveTextContent('第一次同步失敗')
    act(() => { callbacks[0]() })
    await waitFor(() => expect(single).toHaveBeenCalledTimes(3))

    await user.click(screen.getByRole('button', { name: '重新同步' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())

    await act(async () => {
      rejectStaleRequest(new Error('過期的同步錯誤'))
      await Promise.resolve()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
