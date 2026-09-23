import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CampaignListItem } from '../../services/campaignManagementGateway'
import { OrganizerNavigationProvider } from './OrganizerLink'
import { OrganizerHome } from './OrganizerHome'

const draft: CampaignListItem = {
  id: 'draft-id', slug: 'draft-slug', title: '新草稿', status: 'open', openedAt: null,
  createdAt: '2026-08-12T00:00:00Z', updatedAt: '2026-08-12T01:00:00Z',
  images: [], quantityUnit: '個', orderCount: 0, totalQuantity: 0, totalAmount: 0, paidOrderCount: 0,
  thresholdKind: 'quantity', threshold: 100, amountThreshold: null,
}
const open: CampaignListItem = {
  id: 'open-id', slug: 'open-slug', title: '冰餅團', status: 'open', openedAt: '2026-08-12T02:00:00Z',
  createdAt: '2026-08-12T00:00:00Z', updatedAt: '2026-08-12T03:00:00Z',
  images: [{ src: 'https://example.com/ice.jpg', alt: '冰餅商品照' }], quantityUnit: '盒',
  orderCount: 6, totalQuantity: 18, totalAmount: 2430, paidOrderCount: 4,
  thresholdKind: 'quantity', threshold: 30, amountThreshold: null, autoCloseAt: '2026-09-25T04:00:00.000Z',
}
const closed: CampaignListItem = {
  id: 'closed-id', slug: 'closed-slug', title: '已結單水果團', status: 'closed', openedAt: '2026-08-10T00:00:00Z',
  createdAt: '2026-08-09T00:00:00Z', updatedAt: '2026-08-11T00:00:00Z',
  images: [], quantityUnit: '箱', orderCount: 5, totalQuantity: 4, totalAmount: 600, paidOrderCount: 2,
  thresholdKind: 'quantity', threshold: 4, amountThreshold: null, autoCloseAt: '2026-08-12T04:00:00.000Z',
}
const arrived: CampaignListItem = { ...closed, id: 'arrived-id', slug: 'arrived-slug', title: '已到貨麵包團', status: 'arrived', openedAt: '2026-08-08T00:00:00Z' }
const now = new Date('2026-09-25T01:00:00.000Z')

function renderHome(props: Partial<Parameters<typeof OrganizerHome>[0]> = {}) {
  const navigate = vi.fn()
  render(
    <OrganizerNavigationProvider navigate={navigate}>
      <OrganizerHome campaigns={[closed, draft, open]} now={now} {...props} />
    </OrganizerNavigationProvider>,
  )
  return navigate
}

const rowOf = (title: string) => screen.getByRole('link', { name: title }).closest('tr') as HTMLElement

describe('OrganizerHome', () => {
  it('lists open, draft, then closed campaigns in one table', () => {
    renderHome({ campaigns: [closed, draft, open, arrived] })

    expect(screen.getByRole('heading', { level: 1, name: '團購' })).toBeInTheDocument()
    const table = screen.getByRole('table', { name: '團購列表' })
    expect(within(table).getAllByRole('rowheader').map((cell) => within(cell).getByRole('link').textContent))
      .toEqual(['冰餅團', '新草稿', '已結單水果團', '已到貨麵包團'])
    expect(screen.getByRole('link', { name: '冰餅團' })).toHaveAttribute('href', '/admin/campaign/open-id')
    expect(screen.queryByText('工作概況')).not.toBeInTheDocument()
  })

  it('filters campaigns by phase and counts each phase', async () => {
    const user = userEvent.setup()
    renderHome({ campaigns: [closed, draft, open, arrived] })

    expect(screen.getByRole('radio', { name: '全部 4' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: '草稿 1' }))
    expect(screen.getByRole('link', { name: '新草稿' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '冰餅團' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '已結單 2' }))
    expect(screen.getByRole('link', { name: '已結單水果團' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '已到貨麵包團' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '新草稿' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '開團中 1' }))
    expect(screen.getByRole('link', { name: '冰餅團' })).toBeInTheDocument()
  })

  it('shows status, progress, orders, closing time and time for each phase without payment columns', () => {
    renderHome()

    const openRow = rowOf('冰餅團')
    expect(within(openRow).getByText('開團中')).toBeInTheDocument()
    expect(within(openRow).getByRole('img', { name: '冰餅商品照' })).toHaveAttribute('src', 'https://example.com/ice.jpg')
    expect(within(openRow).getByRole('progressbar', { name: '冰餅團成團進度' })).toHaveAttribute('aria-valuenow', '18')
    expect(within(openRow).getByText('18／30 盒')).toBeInTheDocument()
    expect(within(openRow).getByText('還差 12 盒成團')).toBeInTheDocument()
    expect(within(openRow).getByText('6')).toBeInTheDocument()
    expect(within(openRow).getByText('今天 12:00')).toHaveClass('organizer-soon')
    expect(within(openRow).getByText('2026/08/12 10:00')).toBeInTheDocument()

    const draftRow = rowOf('新草稿')
    expect(within(draftRow).getByText('草稿')).toBeInTheDocument()
    expect(within(draftRow).getByText('住戶看不到・尚未發布')).toBeInTheDocument()
    expect(within(draftRow).getByRole('img', { name: '新草稿尚未設定圖片' })).toBeInTheDocument()
    expect(within(draftRow).getByText('發布後開始接單')).toBeInTheDocument()
    expect(within(draftRow).getByText('未設定')).toBeInTheDocument()
    expect(within(draftRow).getByText('最後編輯 2026/08/12 09:00')).toBeInTheDocument()
    expect(within(draftRow).queryByRole('button', { name: '複製住戶連結 新草稿' })).not.toBeInTheDocument()

    const closedRow = rowOf('已結單水果團')
    expect(within(closedRow).getByText('已結單')).toBeInTheDocument()
    expect(within(closedRow).getByText('5')).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: '未付款' })).not.toBeInTheDocument()
    expect(within(closedRow).queryByText(/12:00/)).not.toBeInTheDocument()
  })

  it('uses the total amount for amount-based formation progress', () => {
    const amountCampaign: CampaignListItem = {
      ...open, id: 'amount-id', slug: 'amount-slug', title: '年節禮盒團',
      thresholdKind: 'amount', amountThreshold: 10000, totalQuantity: 36, totalAmount: 8500,
    }
    renderHome({ campaigns: [amountCampaign] })

    const row = rowOf('年節禮盒團')
    const progress = within(row).getByRole('progressbar', { name: '年節禮盒團成團進度' })
    expect(progress).toHaveAttribute('aria-valuenow', '8500')
    expect(progress).toHaveAttribute('aria-valuemax', '10000')
    expect(within(row).getByText('$8,500／$10,000')).toBeInTheDocument()
    expect(within(row).getByText('還差 $1,500 成團')).toBeInTheDocument()
  })

  it('points to pending work only when something needs attention', () => {
    renderHome({ autoCloseNotificationState: 'unconfigured', unboundResidentCount: 3 })

    const attention = screen.getByRole('region', { name: '待處理' })
    expect(attention).toHaveTextContent('自動結單通知還沒有指定接收的團主')
    expect(within(attention).getByRole('link', { name: '前往設定' })).toHaveAttribute('href', '/admin/settings')
    expect(attention).toHaveTextContent('3 位住戶尚未填戶號')
    expect(within(attention).getByRole('link', { name: '查看住戶' })).toHaveAttribute('href', '/admin/residents?filter=unbound')
  })

  it('hides the attention area when nothing is pending', () => {
    renderHome({ autoCloseNotificationState: 'current_user', unboundResidentCount: 0 })
    expect(screen.queryByRole('region', { name: '待處理' })).not.toBeInTheDocument()
  })

  it('opens a campaign from anywhere on its row but not from the row actions', async () => {
    const user = userEvent.setup()
    const navigate = renderHome({ onCopyResidentLink: vi.fn().mockResolvedValue(undefined), onDelete: vi.fn() })
    const row = rowOf('冰餅團')

    await user.click(within(row).getByText('開團中'))
    expect(navigate).toHaveBeenCalledWith('/admin/campaign/open-id')
    navigate.mockClear()

    await user.click(within(row).getByRole('button', { name: '複製住戶連結 冰餅團' }))
    await user.click(within(row).getByRole('button', { name: '更多操作 冰餅團' }))
    await user.click(screen.getByRole('menuitem', { name: '刪除 冰餅團' }))
    expect(navigate).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '取消刪除' }))
    await user.click(screen.getByRole('link', { name: '冰餅團' }))
    expect(navigate).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith('/admin/campaign/open-id')
  })

  it('copies a published resident link and confirms the action', async () => {
    const user = userEvent.setup()
    const onCopyResidentLink = vi.fn().mockResolvedValue(undefined)
    renderHome({ onCopyResidentLink })

    await user.click(screen.getByRole('button', { name: '複製住戶連結 冰餅團' }))

    expect(onCopyResidentLink).toHaveBeenCalledWith('/campaign/open-slug')
    expect(await screen.findByRole('status')).toHaveTextContent('已複製冰餅團住戶連結')
  })

  it('offers the resident page only for published campaigns and deletion for every campaign', async () => {
    const user = userEvent.setup()
    renderHome({ onDelete: vi.fn() })

    await user.click(screen.getByRole('button', { name: '更多操作 冰餅團' }))
    const view = screen.getByRole('menuitem', { name: '查看住戶頁 冰餅團' })
    expect(view).toHaveAttribute('href', '/campaign/open-slug')
    expect(view).toHaveAttribute('target', '_blank')
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: '更多操作 新草稿' }))
    expect(screen.queryByRole('menuitem', { name: '查看住戶頁 新草稿' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '刪除 新草稿' })).toBeInTheDocument()
  })

  it('requires explicit confirmation before permanently deleting a campaign', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn().mockResolvedValue(undefined)
    renderHome({ onDelete })

    await user.click(screen.getByRole('button', { name: '更多操作 冰餅團' }))
    await user.click(screen.getByRole('menuitem', { name: '刪除 冰餅團' }))
    expect(onDelete).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: '確認刪除團購' })
    expect(dialog).toHaveTextContent('冰餅團')
    expect(dialog).toHaveTextContent('訂單及歷史資料都會永久刪除，無法復原')

    await user.click(screen.getByRole('button', { name: '取消刪除' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: '確認刪除團購' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '更多操作 冰餅團' }))
    await user.click(screen.getByRole('menuitem', { name: '刪除 冰餅團' }))
    await user.click(screen.getByRole('button', { name: '確認永久刪除' }))

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('open-id'))
    expect(screen.queryByRole('link', { name: '冰餅團' })).not.toBeInTheDocument()
  })

  it('keeps the campaign and confirmation open when deletion fails', async () => {
    const user = userEvent.setup()
    renderHome({ onDelete: vi.fn().mockRejectedValue(new Error('刪除團購失敗：permission denied')) })

    await user.click(screen.getByRole('button', { name: '更多操作 冰餅團' }))
    await user.click(screen.getByRole('menuitem', { name: '刪除 冰餅團' }))
    await user.click(screen.getByRole('button', { name: '確認永久刪除' }))

    const dialog = screen.getByRole('dialog', { name: '確認刪除團購' })
    expect(await screen.findByRole('alert')).toHaveTextContent('刪除團購失敗：permission denied')
    expect(dialog).toContainElement(screen.getByRole('alert'))
    expect(screen.getByRole('link', { name: '冰餅團' })).toBeInTheDocument()
  })

  it('shows the cleanup warning returned after deleting', async () => {
    const user = userEvent.setup()
    renderHome({ onDelete: vi.fn().mockResolvedValue({ warning: '團購已刪除，但有 1 張圖片未能清除' }) })

    await user.click(screen.getByRole('button', { name: '更多操作 冰餅團' }))
    await user.click(screen.getByRole('menuitem', { name: '刪除 冰餅團' }))
    await user.click(screen.getByRole('button', { name: '確認永久刪除' }))

    expect(await screen.findByText('團購已刪除，但有 1 張圖片未能清除')).toBeInTheDocument()
  })

  it('invites the organizer to create the first campaign when there are none', () => {
    renderHome({ campaigns: [] })
    expect(screen.getByText('建立第一團')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
