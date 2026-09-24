import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initialOrders, items } from '../../data/demo'
import { buildOrganizerOrderSummary, type OrganizerOrderSummary } from '../../domain/adminOrders'
import { ExportOrdersButton } from './ExportOrdersButton'
import { OrganizerNavigationProvider } from './OrganizerLink'
import { OverviewSection } from './OverviewSection'

const now = new Date('2026-09-25T04:00:00.000Z')
const base = buildOrganizerOrderSummary({ orders: initialOrders, items, threshold: 100 })
const summary: OrganizerOrderSummary = {
  ...base,
  orderRows: base.orderRows.map((order, index) => ({
    ...order,
    orderId: `order-${index + 1}`,
    // All placed the previous Taipei evening; only order 2 was edited this morning, 3 minutes before `now`.
    orderedAt: `2026-09-24T1${index}:00:00.000Z`,
    updatedAt: index === 1 ? '2026-09-25T03:57:00.000Z' : `2026-09-24T1${index}:00:00.000Z`,
  })),
}

function renderOverview(props: Partial<Parameters<typeof OverviewSection>[0]> = {}) {
  return render(
    <OrganizerNavigationProvider navigate={vi.fn()}>
      <OverviewSection
        campaignId="campaign-1"
        campaignTitle="一涼製冰所"
        openedAt="2026-09-20T00:00:00.000Z"
        summary={summary}
        status="open"
        liveState="live"
        now={now}
        {...props}
      />
    </OrganizerNavigationProvider>,
  )
}

afterEach(() => {
  window.localStorage.clear()
  vi.useRealTimers()
})

describe('OverviewSection', () => {
  it('shows progress, orders, total and today for an open campaign', () => {
    renderOverview()

    expect(screen.getByRole('heading', { level: 2, name: '概況' })).toBeInTheDocument()
    expect(screen.getByText('即時更新')).toBeInTheDocument()
    const kpis = screen.getByRole('list', { name: '團購數字' })
    expect(within(kpis).getByText('62 / 100 個')).toBeInTheDocument()
    expect(within(kpis).getByText('還差 38 個成團')).toBeInTheDocument()
    expect(within(kpis).getByRole('progressbar', { name: '成團進度' })).toHaveAttribute('aria-valuenow', '62')
    expect(within(kpis).getByText('6 筆')).toBeInTheDocument()
    expect(within(kpis).getByText('$2,790')).toBeInTheDocument()
    expect(within(kpis).getByText('今天新增')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '匯出 Excel' })).not.toBeInTheDocument()
    expect(screen.queryByText(/付款/)).not.toBeInTheDocument()
  })

  it('shows the money still missing for an amount threshold', () => {
    const amountSummary = buildOrganizerOrderSummary({
      orders: initialOrders, items, threshold: 100, thresholdKind: 'amount', amountThreshold: 5000,
    })
    renderOverview({ summary: amountSummary })
    expect(screen.getByText('$2,790 / $5,000')).toBeInTheDocument()
    expect(screen.getByText('還差 $2,210 成團')).toBeInTheDocument()
  })

  it('switches to the total quantity, export and a pickup pointer after closing', () => {
    renderOverview({ status: 'closed' })

    const kpis = screen.getByRole('list', { name: '團購數字' })
    expect(within(kpis).queryByText('今天新增')).not.toBeInTheDocument()
    expect(within(kpis).getByText('總數量')).toBeInTheDocument()
    expect(within(kpis).getByText('62 個')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '匯出 Excel' })).toBeEnabled()
    expect(screen.getByRole('link', { name: '領取通知' })).toHaveAttribute('href', '/admin/campaign/campaign-1/pickup')
  })

  it('shows each item quantity for ordering from the supplier', () => {
    renderOverview()
    const itemList = screen.getByRole('list', { name: '品項數量' })
    const peanut = within(itemList).getByText('花生（招牌）').closest('li') as HTMLElement
    expect(within(peanut).getByText('B')).toBeInTheDocument()
    expect(within(peanut).getByText('14')).toBeInTheDocument()
  })

  it('lists the latest orders with items, edits and relative times', () => {
    renderOverview()
    const latest = screen.getByRole('list', { name: '最新訂單' })
    const entries = within(latest).getAllByRole('listitem')
    expect(entries).toHaveLength(6)
    expect(entries[0]).toHaveTextContent('已修改・3 分鐘前')
    expect(within(entries[0]).getAllByText(/^[A-I] \d+$/).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: '查看全部 6 筆' })).toHaveAttribute('href', '/admin/campaign/campaign-1/orders')
  })

  it('marks orders changed since the last visit and remembers this visit', () => {
    window.localStorage.setItem('group-buy-helper:organizer-last-seen:campaign-1', '2026-09-25T03:30:00.000Z')
    renderOverview()

    const latest = screen.getByRole('list', { name: '最新訂單' })
    expect(within(latest).getAllByText('上次查看後有更新')).toHaveLength(1)
    expect(window.localStorage.getItem('group-buy-helper:organizer-last-seen:campaign-1')).not.toBe('2026-09-25T03:30:00.000Z')
  })

  it('still shows the overview when storage is blocked, without new-order dots', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    try {
      renderOverview()
      expect(screen.getByRole('heading', { level: 2, name: '概況' })).toBeInTheDocument()
      expect(screen.queryByText('上次查看後有更新')).not.toBeInTheDocument()
    } finally {
      getItem.mockRestore()
      setItem.mockRestore()
    }
  })

  it('warns when live updates stop and lets the organizer resync', async () => {
    const user = userEvent.setup()
    const onRetrySync = vi.fn()
    renderOverview({ liveState: 'offline', onRetrySync })

    expect(screen.getByRole('status')).toHaveTextContent('即時同步中斷，畫面可能不是最新')
    await user.click(screen.getByRole('button', { name: '重新同步' }))
    expect(onRetrySync).toHaveBeenCalledOnce()
  })

  it('refreshes the relative times every minute without new orders', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-25T04:00:30.000Z'))
    const fresh = { ...summary, orderRows: [{ ...summary.orderRows[0], orderedAt: '2026-09-25T04:00:00.000Z', updatedAt: undefined }] }
    render(<OverviewSection campaignId="campaign-1" campaignTitle="冰餅團" openedAt="2026-09-20T00:00:00.000Z" summary={fresh} status="open" liveState="live" />)
    const latest = screen.getByRole('list', { name: '最新訂單' })
    expect(within(latest).getByText('剛剛')).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(120_000) })
    expect(within(latest).getByText('2 分鐘前')).toBeInTheDocument()
  })

  it('invites sharing when nobody has ordered yet', () => {
    renderOverview({ summary: { ...summary, orderCount: 0, orderRows: [] } })
    expect(screen.getByText('還沒有人下單。')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /查看全部/ })).not.toBeInTheDocument()
  })
})

describe('ExportOrdersButton', () => {
  it('exports only after closing and explains why it is disabled', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<ExportOrdersButton summary={summary} campaignTitle="榮泉餅店" openedAt="2026-09-11T05:00:00.000Z" status="open" onExport={onExport} />)
    expect(screen.getByRole('button', { name: '匯出 Excel' })).toBeDisabled()
    expect(screen.getByText('結單後才能匯出')).toBeInTheDocument()

    rerender(<ExportOrdersButton summary={summary} campaignTitle="榮泉餅店" openedAt="2026-09-11T05:00:00.000Z" status="closed" onExport={onExport} />)
    await user.click(screen.getByRole('button', { name: '匯出 Excel' }))
    expect(onExport).toHaveBeenCalledOnce()

    rerender(<ExportOrdersButton summary={summary} campaignTitle="榮泉餅店" openedAt="2026-09-11T05:00:00.000Z" status="arrived" onExport={onExport} />)
    expect(screen.getByRole('button', { name: '匯出 Excel' })).toBeEnabled()
  })

  it('disables export for empty shells but enables custom-only orders', () => {
    const emptyShell = { ...summary.orderRows[0], items: { A: 0 }, customItems: [{ id: 'blank', name: '   ', quantity: 0 }] }
    const { rerender } = render(
      <ExportOrdersButton summary={{ ...summary, orderCount: 0, orderRows: [emptyShell] }} campaignTitle="空團" openedAt="2026-09-11T05:00:00.000Z" status="closed" />,
    )
    expect(screen.getByRole('button', { name: '匯出 Excel' })).toBeDisabled()
    expect(screen.getByText('目前沒有可匯出的訂單')).toBeInTheDocument()

    rerender(
      <ExportOrdersButton
        summary={{ ...summary, orderCount: 1, orderRows: [{ ...emptyShell, customItems: [{ id: 'bag', name: '紙袋', quantity: 1 }] }] }}
        campaignTitle="額外品項團"
        openedAt="2026-09-11T05:00:00.000Z"
        status="arrived"
      />,
    )
    expect(screen.getByRole('button', { name: '匯出 Excel' })).toBeEnabled()
  })

  it('shows an export failure without leaving the button busy', async () => {
    const user = userEvent.setup()
    render(<ExportOrdersButton summary={summary} campaignTitle="榮泉餅店" openedAt="2026-09-11T05:00:00.000Z" status="closed" onExport={vi.fn().mockRejectedValue(new Error('建立 Excel 失敗'))} />)
    await user.click(screen.getByRole('button', { name: '匯出 Excel' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('建立 Excel 失敗')
    expect(screen.getByRole('button', { name: '匯出 Excel' })).toBeEnabled()
  })
})
