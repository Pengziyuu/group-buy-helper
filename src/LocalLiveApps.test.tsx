import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  LocalLiveAdminApp,
  LocalLiveResidentApp,
  type LiveAdminOrdersRepository,
  type LiveAdminRepository,
  type LiveAutoCloseNotificationSettingsRepository,
  type LiveCampaignManagementRepository,
  type LivePickupNotificationTestCampaignRepository,
  type LiveResidentMemberRepository,
} from './LocalLiveApps'
import { initialOrders, items } from './data/demo'
import { buildOrganizerOrderSummary } from './domain/adminOrders'
import type { OrganizerOrderSummary } from './domain/adminOrders'
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

// The resident binding form does not yet expose a control for choosing the
// 'other' household kind (that lands in a later task). To exercise the real
// bind_customer_self RPC wiring in LocalLiveApps.tsx for that path, this
// renders the genuine App component unchanged and adds one extra, hidden
// test-only trigger that calls the same onBindResident prop with a
// kind: 'other' payload the real form cannot produce yet.
vi.mock('./App', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./App')>()
  const RealApp = actual.default
  const StubbedApp = (props: Parameters<typeof RealApp>[0]) => {
    const onBindResident = (props as {
      onBindResident?: (input: { kind: string; period: number | null; unit: string | null }) => Promise<unknown>
    }).onBindResident
    return (
      <>
        <RealApp {...props} />
        {onBindResident && (
          <button
            type="button"
            onClick={() => { void onBindResident({ kind: 'other', period: null, unit: null }) }}
          >
            測試綁定非社區人士
          </button>
        )}
      </>
    )
  }
  return { ...actual, default: StubbedApp }
})

const published: CampaignContent = {
  title: 'Supabase 已發布冰餅團',
  unitPrice: 50,
  threshold: 80,
  announcement: '資料庫公告',
  images: [{ src: '/remote.svg', alt: '資料庫商品圖' }],
  items: items.map((item) => ({ ...item, active: true })),
  openedAt: '2026-08-12T00:00:00Z',
}

const orderSummary = buildOrganizerOrderSummary({ orders: initialOrders, items, threshold: 80 })
const ordersRepository = (): LiveAdminOrdersRepository => ({
  loadCampaignStatus: vi.fn().mockResolvedValue('open'),
  loadSummary: vi.fn().mockResolvedValue(orderSummary),
  setCampaignStatus: vi.fn().mockResolvedValue(undefined),
  setOrderPaid: vi.fn().mockResolvedValue(undefined),
  setOrderOrganizerNote: vi.fn().mockResolvedValue(undefined),
  cancelOrder: vi.fn().mockResolvedValue(undefined),
})
const settingsRepository = (): LiveAutoCloseNotificationSettingsRepository => ({
  getState: vi.fn().mockResolvedValue('current_user'),
  selectCurrentUser: vi.fn().mockResolvedValue(undefined),
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

function authClient(session: unknown = null, getUserError: unknown = null, isAdmin = true) {
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
    rpc: vi.fn().mockImplementation((name: string) => Promise.resolve({
      data: name === 'get_auto_close_notification_setting' ? 'unconfigured' : isAdmin,
      error: null,
    })),
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
    channel: vi.fn(() => {
      const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) }
      return channel
    }),
    removeChannel: vi.fn().mockResolvedValue(undefined),
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

    expect(await screen.findByRole('heading', { name: '團購' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '早餐團購' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'LINE 帳號：彭梓育' })).toBeInTheDocument()
    expect(signIn).toHaveBeenCalledWith('trusted-line-id-token')
    expect(list).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'LINE 帳號：彭梓育' }))
    await user.click(screen.getByRole('menuitem', { name: '登出' }))
    expect(client.auth.signOut).toHaveBeenCalledOnce()
    expect(await screen.findByText('已登出，請重新開啟住戶LINE入口')).toBeInTheDocument()
  })

  it('restores a verified resident session without reopening LINE OAuth', async () => {
    const session = { access_token: 'resident-access', user: { id: 'resident-uid', is_anonymous: false } }
    const { client } = authClient(session)
    client.rpc = vi.fn().mockImplementation((name: string) => Promise.resolve(name === 'get_line_resident_self'
      ? { data: [{ display_name: '彭梓育', picture_url: 'https://example.com/avatar.jpg' }], error: null }
      : { data: null, error: null })) as never
    const list = vi.fn().mockResolvedValue([{
      slug: '0123456789abcdef0123456789abcdef0123',
      title: '早餐團購', status: 'open' as const, unitPrice: 55,
      openedAt: '2026-08-14T08:00:00.000Z', totalQuantity: 8, threshold: 10,
    }])
    const liffClient: LiffClient = {
      init: vi.fn().mockResolvedValue(undefined),
      isLoggedIn: vi.fn().mockReturnValue(false),
      login: vi.fn(),
      getProfile: vi.fn(),
      getIDToken: vi.fn().mockReturnValue(null),
    }
    const signIn = vi.fn()

    render(<LocalLiveResidentApp
      client={client}
      liffId="2011099887-Resident"
      liffClient={liffClient}
      lineResidentGateway={{ signIn }}
      residentListRepository={{ list }}
    />)

    expect(await screen.findByRole('heading', { name: '團購' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'LINE 帳號：彭梓育' })).toBeInTheDocument()
    expect(client.auth.getUser).toHaveBeenCalledWith('resident-access')
    expect(client.rpc).toHaveBeenCalledWith('get_line_resident_self')
    expect(liffClient.init).not.toHaveBeenCalled()
    expect(liffClient.login).not.toHaveBeenCalled()
    expect(signIn).not.toHaveBeenCalled()
  })

  it('falls back to LINE after clearing an invalid cached resident session', async () => {
    const session = { access_token: 'expired-access', user: { id: 'resident-uid', is_anonymous: false } }
    const { client } = authClient(session, new Error('JWT expired'))
    const signIn = vi.fn().mockResolvedValue({
      session: { access_token: 'fresh-access', user: { id: 'resident-uid' } },
      identity: { displayName: '彭梓育', pictureUrl: null },
    })
    const list = vi.fn().mockResolvedValue([])
    const liffClient: LiffClient = {
      init: vi.fn().mockResolvedValue(undefined),
      isLoggedIn: vi.fn().mockReturnValue(true),
      login: vi.fn(),
      getProfile: vi.fn().mockResolvedValue({ userId: 'untrusted', displayName: '前端名稱' }),
      getIDToken: vi.fn().mockReturnValue('fresh-line-token'),
    }

    render(<LocalLiveResidentApp
      client={client}
      liffId="2011099887-Resident"
      liffClient={liffClient}
      lineResidentGateway={{ signIn }}
      residentListRepository={{ list }}
    />)

    expect(await screen.findByRole('heading', { name: '團購' })).toBeInTheDocument()
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(liffClient.init).toHaveBeenCalledOnce()
    expect(signIn).toHaveBeenCalledWith('fresh-line-token')
  })

  it('falls back to LINE when the cached resident refresh token is invalid', async () => {
    const { client } = authClient()
    client.auth.getSession = vi.fn().mockResolvedValue({ data: { session: null }, error: new Error('Invalid Refresh Token') }) as never
    const signIn = vi.fn().mockResolvedValue({
      session: { access_token: 'fresh-access', user: { id: 'resident-uid' } },
      identity: { displayName: '彭梓育', pictureUrl: null },
    })
    const liffClient: LiffClient = {
      init: vi.fn().mockResolvedValue(undefined),
      isLoggedIn: vi.fn().mockReturnValue(true),
      login: vi.fn(),
      getProfile: vi.fn().mockResolvedValue({ userId: 'untrusted', displayName: '前端名稱' }),
      getIDToken: vi.fn().mockReturnValue('fresh-line-token'),
    }

    render(<LocalLiveResidentApp
      client={client}
      liffId="2011099887-Resident"
      liffClient={liffClient}
      lineResidentGateway={{ signIn }}
      residentListRepository={{ list: vi.fn().mockResolvedValue([]) }}
    />)

    expect(await screen.findByRole('heading', { name: '團購' })).toBeInTheDocument()
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(signIn).toHaveBeenCalledWith('fresh-line-token')
  })

  it('does not reopen LINE OAuth for a retryable resident session verification error', async () => {
    const session = { access_token: 'resident-access', user: { id: 'resident-uid', is_anonymous: false } }
    const { client } = authClient(session, new TypeError('network unavailable'))
    const liffClient: LiffClient = {
      init: vi.fn().mockResolvedValue(undefined),
      isLoggedIn: vi.fn().mockReturnValue(true),
      login: vi.fn(),
      getProfile: vi.fn(),
      getIDToken: vi.fn().mockReturnValue('line-token'),
    }
    const signIn = vi.fn()

    render(<LocalLiveResidentApp
      client={client}
      liffId="2011099887-Resident"
      liffClient={liffClient}
      lineResidentGateway={{ signIn }}
      residentListRepository={{ list: vi.fn() }}
    />)

    expect(await screen.findByText('network unavailable')).toBeInTheDocument()
    expect(client.auth.signOut).not.toHaveBeenCalled()
    expect(liffClient.init).not.toHaveBeenCalled()
    expect(signIn).not.toHaveBeenCalled()
  })

  it('uses the production product name when the fixed resident entry is missing', async () => {
    const { client } = authClient()
    render(<LocalLiveResidentApp client={client} liffId="resident-liff" />)

    expect(await screen.findByText('無法載入住戶入口')).toBeInTheDocument()
    expect(screen.queryByText(/Demo/)).not.toBeInTheDocument()
  })

  it('loads the isolated notification lab without loading resident management data', async () => {
    const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
    const { client } = authClient(session)
    const campaign = {
      id: 'campaign-test', slug: 'share-slug', title: '通知測試團', status: 'closed' as const,
      openedAt: '2026-08-12T00:00:00Z', createdAt: '2026-08-12T00:00:00Z', updatedAt: '2026-08-12T01:00:00Z',
    }
    const managementRepository: LiveCampaignManagementRepository = {
      list: vi.fn().mockResolvedValue([campaign]), create: vi.fn(), delete: vi.fn(),
    }
    const markerRepository: LivePickupNotificationTestCampaignRepository = {
      list: vi.fn().mockResolvedValue(['campaign-test']), setEnabled: vi.fn(),
    }
    const preview = vi.fn()

    render(
      <LocalLiveAdminApp
        client={client}
        notificationLab
        managementRepository={managementRepository}
        pickupNotificationTestCampaignRepository={markerRepository}
        pickupNotificationRepository={{ preview, createCommand: vi.fn() }}
      />,
    )

    expect(await screen.findByRole('heading', { name: '通知測試中心' })).toBeInTheDocument()
    expect(screen.getByText('發送方式：複製一次性測試指令並貼到測試群組')).toBeInTheDocument()
    expect(managementRepository.list).toHaveBeenCalledOnce()
    expect(markerRepository.list).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: '住戶管理' })).not.toBeInTheDocument()
  })

  it('keeps the committed marker state when mutation succeeds without a second list refresh', async () => {
    const user = userEvent.setup()
    const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
    const { client } = authClient(session)
    const campaign = {
      id: 'campaign-test', slug: 'share-slug', title: '通知測試團', status: 'closed' as const,
      openedAt: '2026-08-12T00:00:00Z', createdAt: '2026-08-12T00:00:00Z', updatedAt: '2026-08-12T01:00:00Z',
    }
    const markerRepository: LivePickupNotificationTestCampaignRepository = {
      list: vi.fn().mockResolvedValueOnce(['campaign-test']).mockRejectedValue(new Error('reload failed')),
      setEnabled: vi.fn().mockResolvedValue(undefined),
    }

    render(
      <LocalLiveAdminApp
        client={client}
        notificationLab
        managementRepository={{ list: vi.fn().mockResolvedValue([campaign]), create: vi.fn(), delete: vi.fn() }}
        pickupNotificationTestCampaignRepository={markerRepository}
        pickupNotificationRepository={{ preview: vi.fn(), createCommand: vi.fn() }}
      />,
    )

    await user.click(await screen.findByRole('button', { name: '將通知測試團移出通知測試中心' }))
    await user.click(screen.getByRole('button', { name: '確認移出測試中心' }))
    await waitFor(() => expect(markerRepository.setEnabled).toHaveBeenCalledWith('campaign-test', false))
    expect(markerRepository.list).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '將通知測試團加入通知測試中心' })).toBeInTheDocument()
  })

  it('shows the campaign list after organizer authentication when no campaign is selected', async () => {
    const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
    const { client } = authClient(session)
    const managementRepository: LiveCampaignManagementRepository = {
      list: vi.fn().mockResolvedValue([{
        id: 'campaign-1', slug: 'share-slug', title: '歷史冰餅團', status: 'closed',
        openedAt: '2026-08-12T00:00:00Z', createdAt: '2026-08-12T00:00:00Z', updatedAt: '2026-08-12T01:00:00Z',
        images: [], quantityUnit: '個', orderCount: 1, totalQuantity: 3, totalAmount: 135, paidOrderCount: 0,
        thresholdKind: 'quantity', threshold: 20, amountThreshold: null,
      }]),
      create: vi.fn(),
      delete: vi.fn().mockResolvedValue({ warning: null }),
    }
    const residentMemberRepository: LiveResidentMemberRepository = {
      list: vi.fn().mockResolvedValue([{
        memberCode: 'abcdef0123456789abcdef0123456789abcd',
        displayName: '住戶甲', pictureUrl: null, period: 2, unit: '2K13',
        joinedAt: '2026-08-14T00:00:00Z', blocked: false, blockedAt: null,
      }]),
      setBlocked: vi.fn().mockResolvedValue(undefined),
      updateHousehold: vi.fn().mockResolvedValue(undefined),
    }

    render(
      <LocalLiveAdminApp
        client={client}
        managementRepository={managementRepository}
        residentMemberRepository={residentMemberRepository}
        authStorage={null}
      />,
    )

    expect(await screen.findByRole('heading', { level: 1, name: '團購' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '歷史冰餅團' })).toBeInTheDocument()
    expect(managementRepository.list).toHaveBeenCalledTimes(1)
    expect(residentMemberRepository.list).toHaveBeenCalledTimes(1)
  })

  it('loads only resident members on the residents page and opens the linked filter', async () => {
    const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
    const { client } = authClient(session)
    const managementRepository: LiveCampaignManagementRepository = { list: vi.fn(), create: vi.fn(), delete: vi.fn() }
    const residentMemberRepository: LiveResidentMemberRepository = {
      list: vi.fn().mockResolvedValue([
        { memberCode: 'abcdef0123456789abcdef0123456789abcd', displayName: '住戶甲', pictureUrl: null, period: 2, unit: '2K13', joinedAt: '2026-08-14T00:00:00Z', blocked: false, blockedAt: null },
        { memberCode: '0123456789abcdef0123456789abcdef0123', displayName: '住戶丁', pictureUrl: null, period: null, unit: null, joinedAt: '2026-08-15T00:00:00Z', blocked: false, blockedAt: null },
      ]),
      setBlocked: vi.fn(),
      updateHousehold: vi.fn(),
    }

    render(<LocalLiveAdminApp client={client} page="residents" residentFilter="unbound" managementRepository={managementRepository} residentMemberRepository={residentMemberRepository} />)

    expect(await screen.findByRole('heading', { level: 1, name: '住戶 2 位' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '未填戶號 1' })).toBeChecked()
    expect(screen.getByRole('article', { name: '住戶丁' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '住戶' })).toHaveAttribute('aria-current', 'page')
    expect(managementRepository.list).not.toHaveBeenCalled()
  })

  it('remounts the residents page when the URL filter changes, instead of keeping the stale selection', async () => {
    const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
    const { client } = authClient(session)
    const managementRepository: LiveCampaignManagementRepository = { list: vi.fn(), create: vi.fn(), delete: vi.fn() }
    const residentMemberRepository: LiveResidentMemberRepository = {
      list: vi.fn().mockResolvedValue([
        { memberCode: 'abcdef0123456789abcdef0123456789abcd', displayName: '住戶甲', pictureUrl: null, period: 2, unit: '2K13', joinedAt: '2026-08-14T00:00:00Z', blocked: false, blockedAt: null },
        { memberCode: '0123456789abcdef0123456789abcdef0124', displayName: '住戶丙', pictureUrl: null, period: 1, unit: 'B8', joinedAt: '2026-08-14T00:00:00Z', blocked: false, blockedAt: null },
        { memberCode: '0123456789abcdef0123456789abcdef0123', displayName: '住戶丁', pictureUrl: null, period: null, unit: null, joinedAt: '2026-08-15T00:00:00Z', blocked: true, blockedAt: '2026-08-15T00:00:00Z' },
      ]),
      setBlocked: vi.fn(),
      updateHousehold: vi.fn(),
    }
    const props = { client, page: 'residents' as const, managementRepository, residentMemberRepository }
    const { rerender } = render(<LocalLiveAdminApp {...props} residentFilter="blocked" />)

    expect(await screen.findByRole('radio', { name: '已封鎖 1' })).toBeChecked()

    rerender(<LocalLiveAdminApp {...props} residentFilter="all" />)

    expect(await screen.findByRole('radio', { name: '全部 2' })).toBeChecked()
  })

  it('keeps unsaved content edits while switching workspace sections', async () => {
    const user = userEvent.setup()
    const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
    const { client } = authClient(session)
    const repository: LiveAdminRepository = {
      loadPublished: vi.fn().mockResolvedValue(published),
      loadOptionalDraft: vi.fn().mockResolvedValue(null),
      saveDraft: vi.fn(() => new Promise<CampaignContent>(() => {})),
      publish: vi.fn(),
    }
    const props = { client, campaignId: 'campaign-1', repository, ordersRepository: ordersRepository() }
    const { rerender } = render(<LocalLiveAdminApp {...props} section="content" />)

    const title = await screen.findByRole('textbox', { name: '團購標題' })
    await user.clear(title)
    await user.type(title, '切換分區前的標題')
    rerender(<LocalLiveAdminApp {...props} section="orders" />)
    expect(screen.getByRole('heading', { level: 2, name: '訂單' })).toBeInTheDocument()
    rerender(<LocalLiveAdminApp {...props} section="overview" />)
    expect(screen.getByRole('heading', { level: 2, name: '概況' })).toBeInTheDocument()
    rerender(<LocalLiveAdminApp {...props} section="content" />)

    expect(screen.getByRole('textbox', { name: '團購標題' })).toHaveValue('切換分區前的標題')
  })

  it('loads the next campaign instead of showing the previous draft when the campaign changes', async () => {
    const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
    const { client } = authClient(session)
    const repository: LiveAdminRepository = {
      loadPublished: vi.fn(async (id: string) => ({ ...published, title: id === 'campaign-1' ? '第一團' : '第二團' })),
      loadOptionalDraft: vi.fn().mockResolvedValue(null),
      saveDraft: vi.fn(),
      publish: vi.fn(),
    }
    const props = { client, repository, ordersRepository: ordersRepository(), section: 'content' as const }
    const { rerender } = render(<LocalLiveAdminApp {...props} campaignId="campaign-1" />)
    expect(await screen.findByRole('textbox', { name: '團購標題' })).toHaveValue('第一團')

    rerender(<LocalLiveAdminApp {...props} campaignId="campaign-2" />)

    expect(await screen.findByRole('textbox', { name: '團購標題' })).toHaveValue('第二團')
    const rail = screen.getByRole('complementary', { name: '團購工作區' })
    expect(within(rail).getByRole('heading', { level: 1, name: '第二團' })).toBeInTheDocument()
  })

  it('does not let a late publish for the previous campaign overwrite the one now shown', async () => {
    const user = userEvent.setup()
    const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
    const { client } = authClient(session)
    let resolvePublish: (value: CampaignContent) => void = () => {}
    const publishPromise = new Promise<CampaignContent>((resolve) => { resolvePublish = resolve })
    const repository: LiveAdminRepository = {
      loadPublished: vi.fn(async (id: string) => ({ ...published, title: id === 'campaign-1' ? '第一團' : '第二團' })),
      loadOptionalDraft: vi.fn().mockResolvedValue(null),
      saveDraft: vi.fn().mockResolvedValue(undefined),
      publish: vi.fn().mockReturnValue(publishPromise),
      loadResidentSlug: vi.fn(async (id: string) => `slug-${id}`),
    }
    const workflowRepository = ordersRepository()
    const props = { client, repository, ordersRepository: workflowRepository, section: 'content' as const }
    const { rerender } = render(<LocalLiveAdminApp {...props} campaignId="campaign-1" />)

    expect(await screen.findByRole('textbox', { name: '團購標題' })).toHaveValue('第一團')
    await user.click(screen.getByRole('button', { name: '更新住戶公告' }))
    expect(repository.publish).toHaveBeenCalledWith('campaign-1')

    rerender(<LocalLiveAdminApp {...props} campaignId="campaign-2" />)
    expect(await screen.findByRole('textbox', { name: '團購標題' })).toHaveValue('第二團')

    resolvePublish({ ...published, title: '被汙染的第一團' })
    await waitFor(() => expect(workflowRepository.loadSummary).toHaveBeenCalledTimes(3))

    expect(screen.getByRole('textbox', { name: '團購標題' })).toHaveValue('第二團')
    const rail = screen.getByRole('complementary', { name: '團購工作區' })
    expect(within(rail).getByRole('heading', { level: 1, name: '第二團' })).toBeInTheDocument()
  })

  it('opens a newly created draft before it has a published snapshot', async () => {
    const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
    const { client } = authClient(session)
    const newDraft: CampaignContent = {
      title: '週末麵包團', unitPrice: 0, threshold: 1, announcement: '', images: [],
      items: [{ code: 'ITEM1', name: 'A', unitPrice: 0, active: true }], openedAt: null,
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
        section="content"
      />,
    )

    expect(await screen.findByRole('textbox', { name: '團購標題' })).toHaveValue('週末麵包團')
    expect(screen.getByRole('textbox', { name: '品項 A 商品名稱（口味）' })).toHaveValue('A')
    expect(screen.getByRole('button', { name: '發布並開團' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '結單' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '開啟住戶頁' })).not.toBeInTheDocument()
    expect(repository.loadOptionalPublished).toHaveBeenCalledWith('new-campaign')
  })

  it('loads the order summary with the published threshold and reloads it after saving a note', async () => {
    const user = userEvent.setup()
    const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
    const { client } = authClient(session)
    const repository: LiveAdminRepository = {
      loadPublished: vi.fn().mockResolvedValue(published),
      loadOptionalPublished: vi.fn().mockResolvedValue(published),
      loadOptionalDraft: vi.fn().mockResolvedValue({
        ...published,
        threshold: 1,
        thresholdKind: 'amount',
        amountThreshold: 9999,
      }),
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
        section="orders"
      />,
    )

    expect(await screen.findByRole('heading', { level: 2, name: '訂單' })).toBeInTheDocument()
    expect(workflowRepository.loadSummary).toHaveBeenCalledWith(
      'campaign-1',
      published.threshold,
      published.thresholdKind,
      published.amountThreshold,
      published.quantityUnit,
    )

    await user.click(screen.getByRole('button', { name: '編輯 H11 備註' }))
    await user.type(screen.getByRole('textbox', { name: 'H11 備註' }), '放管理室{Enter}')
    await waitFor(() => expect(workflowRepository.setOrderOrganizerNote).toHaveBeenCalledWith(expect.any(String), '放管理室'))
    expect(workflowRepository.setOrderPaid).not.toHaveBeenCalled()
    await waitFor(() => expect(workflowRepository.loadSummary).toHaveBeenCalledTimes(2))
    expect(workflowRepository.loadSummary).toHaveBeenLastCalledWith(
      'campaign-1',
      published.threshold,
      published.thresholdKind,
      published.amountThreshold,
      published.quantityUnit,
    )
  })

  it('cancels a resident order through the live organizer gateway and reloads the summary', async () => {
    const user = userEvent.setup()
    const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
    const { client } = authClient(session)
    const repository: LiveAdminRepository = {
      loadPublished: vi.fn().mockResolvedValue(published),
      loadOptionalPublished: vi.fn().mockResolvedValue(published),
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
        section="orders"
      />,
    )

    expect(await screen.findByRole('heading', { level: 2, name: '訂單' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '更多操作 H11・佩怡' }))
    await user.click(screen.getByRole('menuitem', { name: '取消 H11 訂單' }))
    await user.click(screen.getByRole('button', { name: '確認取消訂單' }))

    await waitFor(() => expect(workflowRepository.cancelOrder).toHaveBeenCalledOnce())
    await waitFor(() => expect(workflowRepository.loadSummary).toHaveBeenCalledTimes(2))
  })

  it('opens an open published campaign on its overview and a closed one on its orders', async () => {
    const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
    const { client } = authClient(session)
    const repository: LiveAdminRepository = {
      loadPublished: vi.fn().mockResolvedValue(published),
      loadOptionalPublished: vi.fn().mockResolvedValue(published),
      loadOptionalDraft: vi.fn().mockResolvedValue(null),
      saveDraft: vi.fn(),
      publish: vi.fn(),
    }
    const { unmount } = render(<LocalLiveAdminApp client={client} campaignId="campaign-1" repository={repository} ordersRepository={ordersRepository()} />)
    expect(await screen.findByRole('heading', { level: 2, name: '概況' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '團購標題' })).not.toBeInTheDocument()
    unmount()

    const closedOrders = { ...ordersRepository(), loadCampaignStatus: vi.fn().mockResolvedValue('closed') }
    render(<LocalLiveAdminApp client={client} campaignId="campaign-1" repository={repository} ordersRepository={closedOrders} />)
    expect(await screen.findByRole('heading', { level: 2, name: '訂單' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '匯出 Excel' })).toBeEnabled()
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
        section="content"
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
        section="content"
      />,
    )
    expect(await screen.findByRole('heading', { name: '團主登入' })).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'admin@example.test')
    await user.type(screen.getByLabelText('密碼'), 'password')
    await user.click(screen.getByRole('button', { name: '登入' }))

    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'admin@example.test', password: 'password' })
    expect(await screen.findByRole('textbox', { name: '團購標題' })).toHaveValue('Supabase 已發布冰餅團')
    expect(screen.getByText('已發布')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '開啟住戶頁' })).toHaveAttribute(
      'href',
      '/campaign/82be35197b9a8c709a939627ce4c411d8de3',
    )
    await user.click(screen.getByRole('button', { name: '結單' }))
    await user.click(screen.getByRole('button', { name: '確認結單' }))
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
        section="content"
      />,
    )

    expect(await screen.findByRole('heading', { name: '團主登入' })).toBeInTheDocument()
    expect(client.auth.signOut).toHaveBeenCalled()
    expect(repository.loadPublished).not.toHaveBeenCalled()
  })

  it('does not treat a non-anonymous LINE resident session as an organizer login', async () => {
    const session = { access_token: 'resident-line-token', user: { id: 'resident-user', is_anonymous: false } }
    const { client } = authClient(session, null, false)
    const managementRepository: LiveCampaignManagementRepository = {
      list: vi.fn(), create: vi.fn(), delete: vi.fn(),
    }
    const residentMemberRepository: LiveResidentMemberRepository = {
      list: vi.fn(), setBlocked: vi.fn(), updateHousehold: vi.fn(),
    }

    render(
      <LocalLiveAdminApp
        client={client}
        managementRepository={managementRepository}
        residentMemberRepository={residentMemberRepository}
        liffId="2011099887-PlmOrmYw"
        liffClient={{} as LiffClient}
        lineOrganizerGateway={{ signIn: vi.fn() }}
      />,
    )

    expect(await screen.findByRole('heading', { name: '團主登入' })).toBeInTheDocument()
    expect(client.rpc).toHaveBeenCalledWith('is_admin')
    expect(client.auth.signOut).toHaveBeenCalled()
    expect(managementRepository.list).not.toHaveBeenCalled()
    expect(residentMemberRepository.list).not.toHaveBeenCalled()
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
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
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
      channel: vi.fn(() => {
        const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) }
        return channel
      }),
      removeChannel: vi.fn().mockResolvedValue(undefined),
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
        section="content"
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
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
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
      channel: vi.fn(() => {
        const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) }
        return channel
      }),
      removeChannel: vi.fn().mockResolvedValue(undefined),
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
        section="content"
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
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
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
      channel: vi.fn(() => {
        const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) }
        return channel
      }),
      removeChannel: vi.fn().mockResolvedValue(undefined),
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
        section="content"
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
    const settings = settingsRepository()

    render(
      <LocalLiveAdminApp
        client={client}
        page="settings"
        ordersRepository={ordersRepository()}
        autoCloseNotificationSettingsRepository={settings}
      />,
    )
    expect(await screen.findByRole('heading', { level: 1, name: '設定' })).toBeInTheDocument()
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
    expect(settings.getState).toHaveBeenCalledTimes(1)

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
        page="settings"
        repository={repository}
        ordersRepository={ordersRepository()}
        authStorage={primary.storage}
        logoutFallbackStorage={fallback.storage}
        autoCloseNotificationSettingsRepository={settingsRepository()}
      />,
    )
    expect(await screen.findByRole('heading', { level: 1, name: '設定' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '登出' }))
    expect(await screen.findByText('登出中…')).toBeInTheDocument()

    view.rerender(
      <LocalLiveAdminApp
        client={second}
        page="settings"
        repository={repository}
        ordersRepository={ordersRepository()}
        authStorage={primary.storage}
        logoutFallbackStorage={fallback.storage}
        autoCloseNotificationSettingsRepository={settingsRepository()}
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
        page="settings"
        repository={repository}
        ordersRepository={ordersRepository()}
        authStorage={storage}
        autoCloseNotificationSettingsRepository={settingsRepository()}
      />,
    )
    expect(await screen.findByRole('heading', { level: 1, name: '設定' })).toBeInTheDocument()

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
        page="settings"
        repository={repository}
        ordersRepository={ordersRepository()}
        authStorage={storage}
        autoCloseNotificationSettingsRepository={settingsRepository()}
      />,
    )
    expect(await screen.findByRole('heading', { level: 1, name: '設定' })).toBeInTheDocument()
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
        page="settings"
        repository={repository}
        ordersRepository={ordersRepository()}
        authStorage={storage}
        autoCloseNotificationSettingsRepository={settingsRepository()}
      />,
    )
    expect(await screen.findByRole('heading', { level: 1, name: '設定' })).toBeInTheDocument()
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
        page="settings"
        repository={repository}
        ordersRepository={ordersRepository()}
        authStorage={storage}
        logoutFallbackStorage={fallback.storage}
        autoCloseNotificationSettingsRepository={settingsRepository()}
      />,
    )
    expect(await screen.findByRole('heading', { level: 1, name: '設定' })).toBeInTheDocument()
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
    const settings = settingsRepository()
    const firstView = render(
      <LocalLiveAdminApp
        client={first}
        page="settings"
        ordersRepository={ordersRepository()}
        authStorage={primary.storage}
        logoutFallbackStorage={fallback.storage}
        autoCloseNotificationSettingsRepository={settings}
      />,
    )
    expect(await screen.findByRole('heading', { level: 1, name: '設定' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '登出' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('無法清除本機登入資料')
    expect(screen.queryByRole('button', { name: '登入' })).not.toBeInTheDocument()
    expect(primary.values.has(SUPABASE_AUTH_STORAGE_KEY)).toBe(true)
    expect(fallback.values.get(LOGOUT_TOMBSTONE_KEY)).toBe('1')
    firstView.unmount()

    const second = authClient(session).client
    const secondSettings = settingsRepository()
    render(
      <LocalLiveAdminApp
        client={second}
        page="settings"
        ordersRepository={ordersRepository()}
        authStorage={primary.storage}
        logoutFallbackStorage={fallback.storage}
        autoCloseNotificationSettingsRepository={secondSettings}
      />,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('無法清除本機登入資料')
    expect(second.auth.getSession).not.toHaveBeenCalled()
    expect(secondSettings.getState).not.toHaveBeenCalled()
    expect(fallback.values.get(LOGOUT_TOMBSTONE_KEY)).toBe('1')
  })

  it('uses a durable tombstone to prevent session restoration after reloading during sign-out', async () => {
    const user = userEvent.setup()
    const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
    const first = authClient(session).client
    vi.mocked(first.auth.signOut).mockImplementation(() => new Promise(() => undefined))
    const { storage, values } = memoryAuthStorage({ [SUPABASE_AUTH_STORAGE_KEY]: 'persisted-session' })
    const settings = settingsRepository()
    const firstView = render(
      <LocalLiveAdminApp
        client={first}
        page="settings"
        ordersRepository={ordersRepository()}
        authStorage={storage}
        autoCloseNotificationSettingsRepository={settings}
      />,
    )
    expect(await screen.findByRole('heading', { level: 1, name: '設定' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '登出' }))
    expect(await screen.findByText('登出中…')).toBeInTheDocument()
    expect(values.get(LOGOUT_TOMBSTONE_KEY)).toBe('1')
    firstView.unmount()

    const second = authClient(session).client
    const secondSettings = settingsRepository()
    render(
      <LocalLiveAdminApp
        client={second}
        page="settings"
        ordersRepository={ordersRepository()}
        authStorage={storage}
        autoCloseNotificationSettingsRepository={secondSettings}
      />,
    )

    expect(await screen.findByRole('heading', { name: '團主登入' })).toBeInTheDocument()
    expect(second.auth.getSession).not.toHaveBeenCalled()
    expect(secondSettings.getState).not.toHaveBeenCalled()
    expect(values.has(SUPABASE_AUTH_STORAGE_KEY)).toBe(false)
    expect(values.has(LOGOUT_TOMBSTONE_KEY)).toBe(false)
    expect(screen.getByRole('alert')).toHaveTextContent('先前的登出已在本機完成')

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'admin@example.test')
    await user.type(screen.getByLabelText('密碼'), 'password')
    await user.click(screen.getByRole('button', { name: '登入' }))
    expect(await screen.findByRole('heading', { level: 1, name: '設定' })).toBeInTheDocument()
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
        section="content"
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
        section="content"
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
        section="content"
      />,
    )
    expect(await screen.findByRole('textbox', { name: '團購標題' })).toBeInTheDocument()

    view.rerender(
      <LocalLiveAdminApp
        client={second}
        campaignId="campaign-1"
        repository={repository}
        ordersRepository={workflowRepository}
        section="content"
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
        section="content"
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
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
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
        section="content"
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
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
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
      channel: vi.fn(() => {
        const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) }
        return channel
      }),
      removeChannel: vi.fn().mockResolvedValue(undefined),
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
        section="content"
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
        section="content"
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
        section="content"
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
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
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
        section="content"
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
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
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
        section="content"
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
        ? { data: [{ id: 'admin-customer', name: '團主住戶', period: 2, unit: '1A1' }], error: null }
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
        data: [{ id: 'customer-new', name: '彭梓育', period: 2, unit: '1A1' }], error: null,
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
    await user.click(screen.getByRole('button', { name: '儲存住戶資料' }))

    expect(rpc).toHaveBeenCalledWith('bind_customer_self', {
      p_household_kind: 'resident', p_period: 2, p_unit: '1A1',
    })
    expect(await screen.findByRole('button', { name: '增加 A 牛奶（招牌）' })).toBeInTheDocument()
  })

  it('binds someone outside the community without inventing a household', async () => {
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
        data: [{ display_name: '丙', picture_url: null }], error: null,
      })
      if (name === 'get_customer_self') return Promise.resolve({ data: [], error: null })
      if (name === 'bind_customer_self') return Promise.resolve({
        data: [{ id: 'c9', name: '丙', picture_url: null, period: null, unit: null, household_kind: 'other' }], error: null,
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

    await user.click(await screen.findByRole('button', { name: '測試綁定非社區人士' }))

    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith('bind_customer_self', {
        p_household_kind: 'other', p_period: null, p_unit: null,
      })
    })
    expect(await screen.findByRole('button', { name: '增加 A 牛奶（招牌）' })).toBeInTheDocument()
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

  it('restores an already-bound resident outside the community without showing the binding form again', async () => {
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
        data: [{ display_name: '丙', picture_url: null }], error: null,
      })
      // get_customer_self() never reports household_kind, but a bound 'other'
      // customer's period and unit are both null - same as an unbound one.
      if (name === 'get_customer_self') return Promise.resolve({
        data: [{ id: 'customer-other-1', name: '丙', picture_url: null, period: null, unit: null }], error: null,
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

    expect(await screen.findByRole('button', { name: '增加 A 牛奶（招牌）' })).toBeInTheDocument()
    expect(screen.getByText('其他・丙')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '首次填寫住戶資料' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '儲存住戶資料' })).not.toBeInTheDocument()
  })

  it('shows an outside-the-community order without household details and prefills its own draft', async () => {
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
    const wallEq = vi.fn().mockResolvedValue({
      data: [{
        order_id: 'order-other-1', customer_id: 'customer-other-1', customer_name: '丙',
        picture_url: null, period: null, unit: null, household_kind: 'other',
        item_code: published.items[0].code, qty: 3,
        ordered_at: '2026-08-14T01:00:00Z', order_updated_at: '2026-08-14T01:05:00Z',
      }],
      error: null,
    })
    const rpc = vi.fn((name: string) => {
      if (name === 'join_campaign_by_slug') return Promise.resolve({ data: [{ id: 'campaign-1' }], error: null })
      if (name === 'get_line_resident_self') return Promise.resolve({
        data: [{ display_name: '丙', picture_url: null }], error: null,
      })
      if (name === 'get_customer_self') return Promise.resolve({
        data: [{ id: 'customer-other-1', name: '丙', period: null, unit: null }], error: null,
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

    // The order wall keeps the order but does not expose its household kind.
    const wall = await screen.findByRole('region', { name: '大家的訂單' })
    expect(within(wall).getByText('丙', { selector: 'strong' })).toBeInTheDocument()
    expect(within(wall).queryByText('其他')).not.toBeInTheDocument()
    expect(screen.getByText('其他・丙')).toBeInTheDocument()
    // Their own draft is prefilled from that same order rather than showing
    // an empty draft they could accidentally resubmit.
    expect(within(screen.getByLabelText('訂單摘要與送出')).getByText('3 個')).toBeInTheDocument()
  })

  it('infers other instead of throwing when a wall row has no household_kind at all', async () => {
    // A raw PostgREST row can come back with household_kind missing (not
    // just 'other'). Defaulting that blindly to 'resident' would combine
    // with this row's null period/unit to make formatHousehold throw at
    // render. Infer from period instead, the same total mapping the
    // customer_household_format CHECK guarantees.
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
    const wallEq = vi.fn().mockResolvedValue({
      data: [{
        order_id: 'order-other-2', customer_id: 'customer-other-2', customer_name: '丁',
        picture_url: null, period: null, unit: null,
        item_code: published.items[0].code, qty: 1,
        ordered_at: '2026-08-14T01:00:00Z', order_updated_at: '2026-08-14T01:05:00Z',
      }],
      error: null,
    })
    const rpc = vi.fn((name: string) => {
      if (name === 'join_campaign_by_slug') return Promise.resolve({ data: [{ id: 'campaign-1' }], error: null })
      if (name === 'get_line_resident_self') return Promise.resolve({
        data: [{ display_name: '丁', picture_url: null }], error: null,
      })
      if (name === 'get_customer_self') return Promise.resolve({
        data: [{ id: 'customer-other-2', name: '丁', period: null, unit: null }], error: null,
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

    const wall = await screen.findByRole('region', { name: '大家的訂單' })
    expect(within(wall).getByText('丁', { selector: 'strong' })).toBeInTheDocument()
    expect(within(wall).queryByText('其他')).not.toBeInTheDocument()
    expect(screen.getByText('其他・丁')).toBeInTheDocument()
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
        items: [{ code: 'ITEM1', name: 'A', unitPrice: 0, active: true }],
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
        ? { data: [{ id: 'customer-1', name: '測試住戶', period: 2, unit: '1A1' }], error: null }
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

describe('organizer realtime', () => {
  const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
  const publishedRepository = (): LiveAdminRepository => ({
    loadPublished: vi.fn().mockResolvedValue(published),
    loadOptionalPublished: vi.fn().mockResolvedValue(published),
    loadOptionalDraft: vi.fn().mockResolvedValue(null),
    saveDraft: vi.fn(),
    publish: vi.fn(),
  })

  function realtimeClient() {
    const { client } = authClient(session)
    const callbacks: Array<() => void> = []
    const statusCallbacks: Array<(status: string) => void> = []
    const channel = {
      on: vi.fn((_event: string, _filter: unknown, callback: () => void) => {
        callbacks.push(callback)
        return channel
      }),
      subscribe: vi.fn((callback: (status: string) => void) => {
        statusCallbacks.push(callback)
        return channel
      }),
    }
    const channelFactory = vi.fn().mockReturnValue(channel)
    const removeChannel = vi.fn().mockResolvedValue(undefined)
    Object.assign(client, { channel: channelFactory, removeChannel })
    const report = (status: string) => act(() => { statusCallbacks.at(-1)?.(status) })
    return { client, channel, channelFactory, removeChannel, callbacks, report }
  }

  it('subscribes to this campaign\'s orders and reloads the overview when they change', async () => {
    const { client, channel, channelFactory, callbacks, report } = realtimeClient()
    const workflow = ordersRepository()
    render(<LocalLiveAdminApp client={client} campaignId="campaign-1" repository={publishedRepository()} ordersRepository={workflow} section="overview" />)

    expect(await screen.findByRole('heading', { level: 2, name: '概況' })).toBeInTheDocument()
    expect(channelFactory).toHaveBeenCalledWith('organizer-campaign-campaign-1')
    expect(channel.on).toHaveBeenCalledWith('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: 'campaign_id=eq.campaign-1' }, expect.any(Function))
    expect(channel.on).toHaveBeenCalledWith('postgres_changes', { event: '*', schema: 'public', table: 'order_item', filter: 'campaign_id=eq.campaign-1' }, expect.any(Function))
    expect(await screen.findByText('連線中…')).toBeInTheDocument()

    report('SUBSCRIBED')
    await waitFor(() => expect(workflow.loadSummary).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('即時更新')).toBeInTheDocument()

    act(() => { callbacks[0]() })
    await waitFor(() => expect(workflow.loadSummary).toHaveBeenCalledTimes(3))
  })

  it('coalesces a burst of order events into one follow-up reload and shows the latest result', async () => {
    const { client, callbacks, report } = realtimeClient()
    const workflow = ordersRepository()
    let finishSlowReload!: (summary: OrganizerOrderSummary) => void
    vi.mocked(workflow.loadSummary)
      .mockResolvedValueOnce(orderSummary)
      .mockImplementationOnce(() => new Promise((resolve) => { finishSlowReload = resolve }))
      .mockResolvedValueOnce({ ...orderSummary, orderCount: 7 })
    render(<LocalLiveAdminApp client={client} campaignId="campaign-1" repository={publishedRepository()} ordersRepository={workflow} section="orders" />)
    expect(await screen.findByRole('heading', { level: 2, name: '訂單' })).toBeInTheDocument()

    report('SUBSCRIBED')
    act(() => { callbacks[0](); callbacks[1](); callbacks[0]() })
    expect(workflow.loadSummary).toHaveBeenCalledTimes(2)

    await act(async () => { finishSlowReload({ ...orderSummary, orderCount: 5 }) })
    await waitFor(() => expect(workflow.loadSummary).toHaveBeenCalledTimes(3))
    expect(await within(screen.getByLabelText('訂單總覽')).findByText('7 筆')).toBeInTheDocument()
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(workflow.loadSummary).toHaveBeenCalledTimes(3)
  })

  it('warns when the live connection drops and resubscribes on retry', async () => {
    const user = userEvent.setup()
    const { client, channelFactory, removeChannel, report } = realtimeClient()
    render(<LocalLiveAdminApp client={client} campaignId="campaign-1" repository={publishedRepository()} ordersRepository={ordersRepository()} section="overview" />)
    expect(await screen.findByRole('heading', { level: 2, name: '概況' })).toBeInTheDocument()

    report('CHANNEL_ERROR')
    expect(await screen.findByText('即時同步中斷，畫面可能不是最新')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新同步' }))

    expect(removeChannel).toHaveBeenCalledOnce()
    expect(channelFactory).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('連線中…')).toBeInTheDocument()
  })

  it('shows the warning when a live reload fails', async () => {
    const { client, callbacks, report } = realtimeClient()
    const workflow = ordersRepository()
    vi.mocked(workflow.loadSummary)
      .mockResolvedValueOnce(orderSummary)
      .mockResolvedValueOnce(orderSummary)
      .mockRejectedValueOnce(new Error('network'))
    render(<LocalLiveAdminApp client={client} campaignId="campaign-1" repository={publishedRepository()} ordersRepository={workflow} section="overview" />)
    expect(await screen.findByRole('heading', { level: 2, name: '概況' })).toBeInTheDocument()

    report('SUBSCRIBED')
    expect(await screen.findByText('即時更新')).toBeInTheDocument()
    act(() => { callbacks[0]() })
    expect(await screen.findByText('即時同步中斷，畫面可能不是最新')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '概況' })).toBeInTheDocument()
  })

  it('does not subscribe for drafts and removes the channel when leaving the campaign', async () => {
    const { client, channelFactory, removeChannel, report } = realtimeClient()
    const draftRepository: LiveAdminRepository = {
      ...publishedRepository(),
      loadOptionalPublished: vi.fn().mockResolvedValue(null),
      loadOptionalDraft: vi.fn().mockResolvedValue(published),
    }
    const { unmount } = render(<LocalLiveAdminApp client={client} campaignId="campaign-2" repository={draftRepository} ordersRepository={ordersRepository()} section="content" />)
    expect(await screen.findByRole('textbox', { name: '團購標題' })).toBeInTheDocument()
    expect(channelFactory).not.toHaveBeenCalled()
    unmount()

    const second = render(<LocalLiveAdminApp client={client} campaignId="campaign-1" repository={publishedRepository()} ordersRepository={ordersRepository()} section="overview" />)
    expect(await screen.findByRole('heading', { level: 2, name: '概況' })).toBeInTheDocument()
    second.unmount()
    expect(removeChannel).toHaveBeenCalledOnce()
    expect(() => report('SUBSCRIBED')).not.toThrow()
  })
})

describe('organizer loading and error states', () => {
  const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }

  it('keeps the organizer navigation while a page loads and when it fails, and retries the load', async () => {
    const user = userEvent.setup()
    const { client } = authClient(session)
    const members = [{ memberCode: 'm1', displayName: '住戶甲', pictureUrl: null, period: 2, unit: '1A1', joinedAt: '2026-09-01T00:00:00Z', blocked: false, blockedAt: null }]
    let failLoad!: (error: Error) => void
    const list = vi.fn()
      .mockImplementationOnce(() => new Promise((_, reject) => { failLoad = reject }))
      .mockResolvedValue(members)
    render(
      <LocalLiveAdminApp
        client={client}
        page="residents"
        residentMemberRepository={{ list, setBlocked: vi.fn(), updateHousehold: vi.fn() }}
        ordersRepository={ordersRepository()}
      />,
    )

    expect(await screen.findByRole('status', { name: '載入住戶…' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '團主後台' })).toBeInTheDocument()

    await act(async () => { failLoad(new Error('讀取住戶失敗：network')) })
    expect(await screen.findByRole('alert')).toHaveTextContent('無法載入這一頁')
    expect(screen.getByText('讀取住戶失敗：network')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '住戶' })).toHaveAttribute('aria-current', 'page')

    await user.click(screen.getByRole('button', { name: '重試' }))
    expect(await screen.findByRole('heading', { level: 1, name: '住戶 1 位' })).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('keeps the navigation while a campaign workspace loads and retries a failed load', async () => {
    const user = userEvent.setup()
    const { client } = authClient(session)
    const repository: LiveAdminRepository = {
      loadPublished: vi.fn().mockResolvedValue(published),
      loadOptionalPublished: vi.fn()
        .mockRejectedValueOnce(new Error('讀取團購失敗：network'))
        .mockResolvedValue(published),
      loadOptionalDraft: vi.fn().mockResolvedValue(null),
      saveDraft: vi.fn(),
      publish: vi.fn(),
    }
    render(<LocalLiveAdminApp client={client} campaignId="campaign-1" repository={repository} ordersRepository={ordersRepository()} section="overview" />)

    expect(await screen.findByRole('alert')).toHaveTextContent('無法載入這一頁')
    expect(screen.getByRole('navigation', { name: '團主後台' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '團購' })).toHaveAttribute('aria-current', 'page')

    await user.click(screen.getByRole('button', { name: '重試' }))
    expect(await screen.findByRole('heading', { level: 2, name: '概況' })).toBeInTheDocument()
    expect(repository.loadOptionalPublished).toHaveBeenCalledTimes(2)
  })
})
