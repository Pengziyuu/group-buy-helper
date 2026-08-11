import { render, screen } from '@testing-library/react'
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

function authClient(session: unknown = null) {
  const signInWithPassword = vi.fn().mockResolvedValue({
    data: { session: { access_token: 'session-token' } },
    error: null,
  })
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
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
