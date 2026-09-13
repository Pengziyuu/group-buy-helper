import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CampaignListApp from './CampaignListApp'
import type { CampaignListItem } from './services/campaignManagementGateway'
import type { ResidentMember } from './services/residentMemberManagementGateway'

const campaigns: CampaignListItem[] = [
  {
    id: 'draft-id', slug: 'draft-slug', title: '新草稿', status: 'open', openedAt: null,
    createdAt: '2026-08-12T00:00:00Z', updatedAt: '2026-08-12T01:00:00Z',
    images: [], quantityUnit: '個', orderCount: 0, totalQuantity: 0, totalAmount: 0, paidOrderCount: 0,
  },
  {
    id: 'open-id', slug: 'open-slug', title: '冰餅團', status: 'open', openedAt: '2026-08-12T02:00:00Z',
    createdAt: '2026-08-12T00:00:00Z', updatedAt: '2026-08-12T03:00:00Z',
    images: [{ src: 'https://example.com/ice.jpg', alt: '冰餅商品照' }], quantityUnit: '盒',
    orderCount: 6, totalQuantity: 18, totalAmount: 2430, paidOrderCount: 4,
  },
]

describe('organizer campaign list', () => {
  it('switches between campaign management and resident management as peer sections', async () => {
    const user = userEvent.setup()
    const members: ResidentMember[] = [{
      memberCode: 'member-1', displayName: '住戶甲', pictureUrl: null,
      period: 2, unit: '1A1', joinedAt: '2026-08-14T00:00:00Z', blocked: false, blockedAt: null,
    }]
    render(
      <CampaignListApp
        campaigns={campaigns}
        onCreate={vi.fn()}
        residentMembers={members}
        onSetResidentBlocked={vi.fn().mockResolvedValue(undefined)}
        onUpdateResidentHousehold={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(screen.getByRole('region', { name: '團購列表' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '團主工作台' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '工作概況' })).toHaveTextContent('開團中1')
    expect(screen.getByRole('region', { name: '工作概況' })).toHaveTextContent('待發布1')
    expect(screen.getByRole('region', { name: '工作概況' })).toHaveTextContent('待綁定戶號0')
    expect(screen.queryByRole('heading', { name: '住戶名單' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '住戶與戶號 1' }))
    expect(screen.getByRole('heading', { name: '住戶名單' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '團購列表' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '團購作業 2' }))
    expect(screen.getByRole('region', { name: '團購列表' })).toBeInTheDocument()
  })

  it('filters campaigns by operational state without changing repository data', async () => {
    const user = userEvent.setup()
    const completed: CampaignListItem[] = [
      {
        id: 'closed-id', slug: 'closed-slug', title: '已結單水果團', status: 'closed', openedAt: '2026-08-10T00:00:00Z',
        createdAt: '2026-08-09T00:00:00Z', updatedAt: '2026-08-11T00:00:00Z',
        images: [], quantityUnit: '箱', orderCount: 2, totalQuantity: 4, totalAmount: 600, paidOrderCount: 2,
      },
      {
        id: 'arrived-id', slug: 'arrived-slug', title: '已到貨麵包團', status: 'arrived', openedAt: '2026-08-08T00:00:00Z',
        createdAt: '2026-08-07T00:00:00Z', updatedAt: '2026-08-09T00:00:00Z',
        images: [], quantityUnit: '袋', orderCount: 1, totalQuantity: 3, totalAmount: 450, paidOrderCount: 1,
      },
    ]
    render(<CampaignListApp campaigns={[...campaigns, ...completed]} onCreate={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '待發布 1' }))
    expect(screen.getByRole('heading', { name: '新草稿' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '冰餅團' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '已結束 2' }))
    expect(screen.getByRole('heading', { name: '已結單水果團' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '已到貨麵包團' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '新草稿' })).not.toBeInTheDocument()
  })

  it('copies a published resident link and confirms the action', async () => {
    const user = userEvent.setup()
    const onCopyResidentLink = vi.fn().mockResolvedValue(undefined)
    render(
      <CampaignListApp
        campaigns={campaigns}
        onCreate={vi.fn()}
        onCopyResidentLink={onCopyResidentLink}
      />,
    )

    await user.click(screen.getByLabelText('更多操作 冰餅團', { selector: 'summary' }))
    await user.click(screen.getByRole('button', { name: '複製住戶連結 冰餅團' }))
    expect(onCopyResidentLink).toHaveBeenCalledWith('/campaign/open-slug')
    expect(await screen.findByRole('status')).toHaveTextContent('已複製冰餅團住戶連結')
    expect(screen.queryByRole('button', { name: '複製住戶連結 新草稿' })).not.toBeInTheDocument()
  })

  it('shows drafts and published campaigns with safe resident links', async () => {
    const user = userEvent.setup()
    render(<CampaignListApp campaigns={campaigns} onCreate={vi.fn()} />)

    expect(screen.getByRole('heading', { name: '團主工作台' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '管理團購 新草稿' })).toHaveAttribute('href', '/admin/campaign/draft-id')
    const draftCard = screen.getByRole('heading', { name: '新草稿' }).closest('article')
    expect(draftCard).not.toBeNull()
    expect(within(draftCard as HTMLElement).getByText('待發布')).toBeInTheDocument()
    expect(screen.getByText(/最後編輯/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '查看住戶頁 新草稿' })).not.toBeInTheDocument()
    await user.click(screen.getByLabelText('更多操作 冰餅團', { selector: 'summary' }))
    expect(screen.getByRole('link', { name: '查看住戶頁 冰餅團' })).toHaveAttribute('href', '/campaign/open-slug')
  })

  it('shows a recognizable cover and actionable order summary without opening the campaign', () => {
    render(<CampaignListApp campaigns={campaigns} onCreate={vi.fn()} />)

    const openCard = screen.getByRole('heading', { name: '冰餅團' }).closest('article') as HTMLElement
    expect(within(openCard).getByRole('img', { name: '冰餅商品照' })).toHaveAttribute('src', 'https://example.com/ice.jpg')
    expect(within(openCard).getByText('6 戶')).toBeInTheDocument()
    expect(within(openCard).getByText('18 盒')).toBeInTheDocument()
    expect(within(openCard).getByText('$2,430')).toBeInTheDocument()
    expect(within(openCard).getByText('4／6 戶')).toBeInTheDocument()
    expect(within(openCard).getByText('尚有 2 戶未付款')).toBeInTheDocument()

    const draftCard = screen.getByRole('heading', { name: '新草稿' }).closest('article') as HTMLElement
    expect(within(draftCard).getByRole('img', { name: '新草稿尚未設定圖片' })).toBeInTheDocument()
    expect(within(draftCard).getByText('發布後開始接單')).toBeInTheDocument()
  })

  it('requires explicit confirmation before permanently deleting a campaign', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn().mockResolvedValue(undefined)
    render(<CampaignListApp campaigns={campaigns} onCreate={vi.fn()} onDelete={onDelete} />)

    await user.click(screen.getByLabelText('更多操作 冰餅團', { selector: 'summary' }))
    await user.click(screen.getByRole('button', { name: '刪除 冰餅團' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: '確認刪除團購' })).toHaveTextContent('冰餅團')
    expect(screen.getByRole('dialog', { name: '確認刪除團購' })).toHaveTextContent('訂單及歷史資料都會永久刪除，無法復原')

    await user.click(screen.getByRole('button', { name: '取消刪除' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: '確認刪除團購' })).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('更多操作 冰餅團', { selector: 'summary' }))
    await user.click(screen.getByRole('button', { name: '刪除 冰餅團' }))
    await user.click(screen.getByRole('button', { name: '確認永久刪除' }))

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('open-id'))
    expect(screen.queryByRole('heading', { name: '冰餅團' })).not.toBeInTheDocument()
  })

  it('keeps the campaign and confirmation open when deletion fails', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn().mockRejectedValue(new Error('刪除團購失敗：permission denied'))
    render(<CampaignListApp campaigns={campaigns} onCreate={vi.fn()} onDelete={onDelete} />)

    await user.click(screen.getByLabelText('更多操作 冰餅團', { selector: 'summary' }))
    await user.click(screen.getByRole('button', { name: '刪除 冰餅團' }))
    await user.click(screen.getByRole('button', { name: '確認永久刪除' }))

    const dialog = screen.getByRole('dialog', { name: '確認刪除團購' })
    expect(await screen.findByRole('alert')).toHaveTextContent('刪除團購失敗：permission denied')
    expect(dialog).toContainElement(screen.getByRole('alert'))
    expect(screen.getByRole('heading', { name: '冰餅團' })).toBeInTheDocument()
  })

  it('creates a campaign and opens its editor', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockResolvedValue({ ...campaigns[0], id: 'new-id' })
    const onNavigate = vi.fn()
    render(<CampaignListApp campaigns={campaigns} onCreate={onCreate} onNavigate={onNavigate} />)

    await user.click(screen.getByRole('button', { name: '建立新團' }))
    await user.clear(screen.getByRole('textbox', { name: '團購標題' }))
    await user.type(screen.getByRole('textbox', { name: '團購標題' }), '週末麵包團')
    await user.click(screen.getByRole('button', { name: '建立並編輯' }))

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('週末麵包團'))
    expect(onNavigate).toHaveBeenCalledWith('/admin/campaign/new-id')
  })
})
