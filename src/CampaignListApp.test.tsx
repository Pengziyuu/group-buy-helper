import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CampaignListApp from './CampaignListApp'
import type { CampaignListItem } from './services/campaignManagementGateway'
import type { ResidentMember } from './services/residentMemberManagementGateway'

const campaigns: CampaignListItem[] = [
  {
    id: 'draft-id', slug: 'draft-slug', title: '新草稿', status: 'open', openedAt: null,
    createdAt: '2026-08-12T00:00:00Z', updatedAt: '2026-08-12T01:00:00Z',
  },
  {
    id: 'open-id', slug: 'open-slug', title: '冰餅團', status: 'open', openedAt: '2026-08-12T02:00:00Z',
    createdAt: '2026-08-12T00:00:00Z', updatedAt: '2026-08-12T03:00:00Z',
  },
]

describe('organizer campaign list', () => {
  it('switches between campaign management and resident management as peer sections', async () => {
    const user = userEvent.setup()
    const members: ResidentMember[] = [{
      memberCode: 'member-1', displayName: '住戶甲', pictureUrl: null,
      period: 2, unit: 'A01', joinedAt: '2026-08-14T00:00:00Z', blocked: false, blockedAt: null,
    }]
    render(
      <CampaignListApp
        campaigns={campaigns}
        onCreate={vi.fn()}
        residentMembers={members}
        onSetResidentBlocked={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(screen.getByRole('region', { name: '團購列表' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '住戶管理' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '住戶管理 1' }))
    expect(screen.getByRole('heading', { name: '住戶管理' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '團購列表' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '團購管理 2' }))
    expect(screen.getByRole('region', { name: '團購列表' })).toBeInTheDocument()
  })

  it('filters campaigns by operational state without changing repository data', async () => {
    const user = userEvent.setup()
    const completed: CampaignListItem[] = [
      {
        id: 'closed-id', slug: 'closed-slug', title: '已結單水果團', status: 'closed', openedAt: '2026-08-10T00:00:00Z',
        createdAt: '2026-08-09T00:00:00Z', updatedAt: '2026-08-11T00:00:00Z',
      },
      {
        id: 'arrived-id', slug: 'arrived-slug', title: '已到貨麵包團', status: 'arrived', openedAt: '2026-08-08T00:00:00Z',
        createdAt: '2026-08-07T00:00:00Z', updatedAt: '2026-08-09T00:00:00Z',
      },
    ]
    render(<CampaignListApp campaigns={[...campaigns, ...completed]} onCreate={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '草稿 1' }))
    expect(screen.getByRole('heading', { name: '新草稿' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '冰餅團' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '已完成 2' }))
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

    await user.click(screen.getByRole('button', { name: '複製住戶連結 冰餅團' }))
    expect(onCopyResidentLink).toHaveBeenCalledWith('/campaign/open-slug')
    expect(await screen.findByRole('status')).toHaveTextContent('已複製冰餅團住戶連結')
    expect(screen.queryByRole('button', { name: '複製住戶連結 新草稿' })).not.toBeInTheDocument()
  })

  it('shows drafts and published campaigns with safe resident links', () => {
    render(<CampaignListApp campaigns={campaigns} onCreate={vi.fn()} />)

    expect(screen.getByRole('heading', { name: '我的團購' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '編輯 新草稿' })).toHaveAttribute('href', '/admin/campaign/draft-id')
    expect(screen.getByText('尚未開團')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '住戶連結 新草稿' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '住戶連結 冰餅團' })).toHaveAttribute('href', '/campaign/open-slug')
  })

  it('requires explicit confirmation before permanently deleting a campaign', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn().mockResolvedValue(undefined)
    render(<CampaignListApp campaigns={campaigns} onCreate={vi.fn()} onDelete={onDelete} />)

    await user.click(screen.getByRole('button', { name: '刪除 冰餅團' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: '確認刪除團購' })).toHaveTextContent('冰餅團')
    expect(screen.getByRole('dialog', { name: '確認刪除團購' })).toHaveTextContent('訂單及歷史資料都會永久刪除，無法復原')

    await user.click(screen.getByRole('button', { name: '取消刪除' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: '確認刪除團購' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '刪除 冰餅團' }))
    await user.click(screen.getByRole('button', { name: '確認永久刪除' }))

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('open-id'))
    expect(screen.queryByRole('heading', { name: '冰餅團' })).not.toBeInTheDocument()
  })

  it('keeps the campaign and confirmation open when deletion fails', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn().mockRejectedValue(new Error('刪除團購失敗：permission denied'))
    render(<CampaignListApp campaigns={campaigns} onCreate={vi.fn()} onDelete={onDelete} />)

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

    await user.click(screen.getByRole('button', { name: '新增團購' }))
    await user.clear(screen.getByRole('textbox', { name: '團購標題' }))
    await user.type(screen.getByRole('textbox', { name: '團購標題' }), '週末麵包團')
    await user.click(screen.getByRole('button', { name: '建立並編輯' }))

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('週末麵包團'))
    expect(onNavigate).toHaveBeenCalledWith('/admin/campaign/new-id')
  })
})
