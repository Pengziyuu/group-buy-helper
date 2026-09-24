import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CampaignWorkspace } from './CampaignWorkspace'
import { OrganizerNavigationProvider } from './OrganizerLink'
import { PickupSection } from './PickupSection'
import { WorkspaceRail, type WorkspaceCampaign } from './WorkspaceRail'
import { resolveWorkspaceSection, sectionUnavailableReason } from './workspaceSections'

const openCampaign: WorkspaceCampaign = {
  id: 'campaign-1',
  title: '一涼製冰所 超厚三明治冰餅',
  status: 'open',
  published: true,
  coverImage: { src: 'https://example.com/ice.jpg', alt: '冰餅商品照' },
  openedAt: '2026-08-14T00:05:09.000Z',
  autoCloseAt: '2026-09-25T04:00:00.000Z',
  arrivalLabel: '貨到通知',
  orderCount: 6,
  residentHref: '/campaign/0123456789abcdef0123456789abcdef0123',
}
const now = new Date('2026-09-25T01:00:00.000Z')

function renderRail(props: Partial<Parameters<typeof WorkspaceRail>[0]> = {}) {
  render(
    <OrganizerNavigationProvider navigate={vi.fn()}>
      <WorkspaceRail campaign={openCampaign} section="orders" now={now} {...props} />
    </OrganizerNavigationProvider>,
  )
}

describe('workspace sections', () => {
  it('opens drafts on content settings and published campaigns on orders until the overview exists', () => {
    expect(resolveWorkspaceSection(null, false)).toBe('content')
    expect(resolveWorkspaceSection('orders', false)).toBe('content')
    expect(resolveWorkspaceSection('pickup', false)).toBe('content')
    expect(resolveWorkspaceSection(null, true)).toBe('orders')
    expect(resolveWorkspaceSection('overview', true)).toBe('orders')
    expect(resolveWorkspaceSection('content', true)).toBe('content')
    expect(resolveWorkspaceSection('pickup', true)).toBe('pickup')
  })

  it('explains why a section is unavailable', () => {
    expect(sectionUnavailableReason('orders', 'open', false)).toBe('發布後可用')
    expect(sectionUnavailableReason('pickup', 'open', false)).toBe('發布後可用')
    expect(sectionUnavailableReason('pickup', 'open', true)).toBe('結單後才能使用')
    expect(sectionUnavailableReason('pickup', 'closed', true)).toBeNull()
    expect(sectionUnavailableReason('content', 'open', false)).toBeNull()
    expect(sectionUnavailableReason('orders', 'open', true)).toBeNull()
  })
})

describe('WorkspaceRail', () => {
  it('shows the campaign, its schedule and the sections an open campaign can use', () => {
    renderRail()

    const rail = screen.getByRole('complementary', { name: '團購工作區' })
    expect(within(rail).getByRole('link', { name: '所有團購' })).toHaveAttribute('href', '/admin')
    expect(within(rail).getByRole('img', { name: '冰餅商品照' })).toHaveAttribute('src', 'https://example.com/ice.jpg')
    expect(within(rail).getByRole('heading', { level: 1, name: '一涼製冰所 超厚三明治冰餅' })).toBeInTheDocument()
    expect(within(rail).getByText('開團中')).toBeInTheDocument()
    expect(within(rail).getByText('今天 12:00')).toBeInTheDocument()
    expect(within(rail).getByText('貨到通知')).toBeInTheDocument()
    expect(within(rail).getByText('2026/08/14 08:05')).toBeInTheDocument()

    const nav = within(rail).getByRole('navigation', { name: '團購分區' })
    const orders = within(nav).getByRole('link', { name: '訂單 6' })
    expect(orders).toHaveAttribute('href', '/admin/campaign/campaign-1/orders')
    expect(orders).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: '內容設定' })).toHaveAttribute('href', '/admin/campaign/campaign-1/content')
    expect(within(nav).queryByRole('link', { name: /領取通知/ })).not.toBeInTheDocument()
    expect(within(nav).getByText('結單後才能使用')).toBeInTheDocument()
    expect(within(nav).queryByText('概況')).not.toBeInTheDocument()
  })

  it('asks before closing orders and closes only after confirmation', async () => {
    const user = userEvent.setup()
    const onSetCampaignStatus = vi.fn().mockResolvedValue(undefined)
    renderRail({ onSetCampaignStatus })

    await user.click(screen.getByRole('button', { name: '結單' }))
    expect(screen.getByRole('dialog', { name: '確認結單' })).toHaveTextContent('結單後住戶就不能再下單或修改訂單')
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(onSetCampaignStatus).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '結單' }))
    await user.click(screen.getByRole('button', { name: '確認結單' }))
    expect(onSetCampaignStatus).toHaveBeenCalledWith('closed')
    expect(screen.queryByRole('dialog', { name: '確認結單' })).not.toBeInTheDocument()
  })

  it('keeps the confirmation open with the error when the status change fails', async () => {
    const user = userEvent.setup()
    renderRail({ onSetCampaignStatus: vi.fn().mockRejectedValue(new Error('更新團購狀態失敗：network')) })

    await user.click(screen.getByRole('button', { name: '結單' }))
    await user.click(screen.getByRole('button', { name: '確認結單' }))

    const dialog = screen.getByRole('dialog', { name: '確認結單' })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('更新團購狀態失敗：network')
  })

  it('shows closed and legacy arrived campaigns as closed and offers reopening', async () => {
    const user = userEvent.setup()
    const onSetCampaignStatus = vi.fn().mockResolvedValue(undefined)
    renderRail({ campaign: { ...openCampaign, status: 'arrived' }, onSetCampaignStatus })

    expect(screen.getByText('已結單')).toBeInTheDocument()
    expect(screen.queryByText('已到貨')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '標記到貨' })).not.toBeInTheDocument()
    expect(screen.queryByText('今天 12:00')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '領取通知' })).toHaveAttribute('href', '/admin/campaign/campaign-1/pickup')

    await user.click(screen.getByRole('button', { name: '重新開放' }))
    expect(screen.getByRole('dialog', { name: '確認重新開放' })).toHaveTextContent('重新開放後住戶可以再次下單與修改訂單')
    await user.click(screen.getByRole('button', { name: '確認重新開放' }))
    expect(onSetCampaignStatus).toHaveBeenCalledWith('open')
  })

  it('marks a draft and keeps order and pickup sections unavailable until publishing', () => {
    renderRail({
      campaign: { ...openCampaign, published: false, openedAt: null, orderCount: null, residentHref: null, coverImage: null },
      section: 'content',
      onSetCampaignStatus: vi.fn(),
    })

    expect(screen.getByText('草稿')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '結單' })).not.toBeInTheDocument()
    expect(screen.getByText('尚未發布')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '一涼製冰所 超厚三明治冰餅尚未設定圖片' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /訂單/ })).not.toBeInTheDocument()
    expect(screen.getAllByText('發布後可用')).toHaveLength(2)
    expect(screen.getByRole('link', { name: '內容設定' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('button', { name: /複製住戶連結/ })).not.toBeInTheDocument()
  })

  it('copies and opens the resident page link', async () => {
    const user = userEvent.setup()
    const onCopyResidentLink = vi.fn().mockResolvedValue(undefined)
    renderRail({ onCopyResidentLink })

    await user.click(screen.getByRole('button', { name: '複製住戶連結 一涼製冰所 超厚三明治冰餅' }))
    expect(onCopyResidentLink).toHaveBeenCalledWith('/campaign/0123456789abcdef0123456789abcdef0123')
    expect(await screen.findByRole('status')).toHaveTextContent('已複製住戶連結')
    const openLink = screen.getByRole('link', { name: '開啟住戶頁' })
    expect(openLink).toHaveAttribute('href', '/campaign/0123456789abcdef0123456789abcdef0123')
    expect(openLink).toHaveAttribute('target', '_blank')
  })
})

describe('CampaignWorkspace', () => {
  it('replaces a bare or unavailable section address with the section it shows', () => {
    const navigate = vi.fn()
    const { rerender } = render(
      <OrganizerNavigationProvider navigate={navigate}>
        <CampaignWorkspace campaign={openCampaign} requestedSection={null} section="orders" now={now}><p>分區內容</p></CampaignWorkspace>
      </OrganizerNavigationProvider>,
    )
    expect(navigate).toHaveBeenCalledWith('/admin/campaign/campaign-1/orders', { replace: true })
    expect(screen.getByRole('main')).toHaveTextContent('分區內容')

    navigate.mockClear()
    rerender(
      <OrganizerNavigationProvider navigate={navigate}>
        <CampaignWorkspace campaign={openCampaign} requestedSection="orders" section="orders" now={now}><p>分區內容</p></CampaignWorkspace>
      </OrganizerNavigationProvider>,
    )
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('PickupSection', () => {
  const handlers = {
    onPreview: vi.fn().mockResolvedValue({ previewToken: null, mentionableRecipients: [], unavailableRecipients: [], mentionableCount: 0, messageCount: 0 }),
    onCreateCommand: vi.fn(),
  }

  it('offers LINE pickup notifications only after closing a published campaign', () => {
    const { rerender } = render(<PickupSection campaignId="campaign-1" campaignTitle="神農包子" campaignStatus="open" published excludedOtherCount={0} {...handlers} />)
    expect(screen.getByText('結單後才能使用領取通知。')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'LINE領取通知' })).not.toBeInTheDocument()

    rerender(<PickupSection campaignId="campaign-1" campaignTitle="神農包子" campaignStatus="closed" published excludedOtherCount={0} {...handlers} />)
    expect(screen.getByRole('heading', { name: 'LINE領取通知' })).toBeInTheDocument()

    rerender(<PickupSection campaignId="campaign-1" campaignTitle="神農包子" campaignStatus="closed" published={false} excludedOtherCount={0} {...handlers} />)
    expect(screen.getByText('發布並結單後才能發送領取通知。')).toBeInTheDocument()
  })

  it('explains that the local demo cannot send LINE notifications', () => {
    render(<PickupSection campaignId="campaign-1" campaignTitle="神農包子" campaignStatus="closed" published excludedOtherCount={0} />)
    expect(screen.getByText('本機示範不提供LINE領取通知')).toBeInTheDocument()
  })
})
