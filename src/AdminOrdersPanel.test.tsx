import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { initialOrders, items } from './data/demo'
import { buildOrganizerOrderSummary } from './domain/adminOrders'
import AdminOrdersPanel from './AdminOrdersPanel'

const summary = buildOrganizerOrderSummary({
  orders: initialOrders,
  items,
  threshold: 100,
})

describe('organizer orders panel', () => {
  it('shows campaign totals, item breakdown and resident orders', () => {
    render(<AdminOrdersPanel summary={summary} />)

    expect(screen.getByRole('heading', { name: '訂單統計' })).toBeInTheDocument()
    expect(screen.getByText('6 戶')).toBeInTheDocument()
    expect(screen.getByText('62 個')).toBeInTheDocument()
    expect(screen.getByText('$2,790')).toBeInTheDocument()
    expect(screen.getByText('還差 38 個成團')).toBeInTheDocument()
    const itemRow = screen.getByRole('row', { name: /B\s*花生（招牌）\s*14 個/ })
    expect(itemRow).toBeInTheDocument()
    expect(itemRow.querySelector('.admin-item-code')).toHaveTextContent(/^B$/)
    expect(itemRow.querySelector('.admin-item-name')).toHaveTextContent('花生（招牌）')
    expect(itemRow.closest('table')).toHaveClass('item-summary-table')
    expect(screen.getByRole('row', { name: /2K13 斯祈 B 花生（招牌）×2、D 草莓×2、E 可可×2/ })).toBeInTheDocument()
  })

  it('offers LINE pickup notification actions only for a closed live campaign', () => {
    const onPreviewPickupNotification = vi.fn().mockResolvedValue({
      sent: false,
      previewToken: null,
      mentionableRecipients: [],
      unavailableRecipients: [],
      mentionableCount: 0,
      messageCount: 0,
    })
    const onSendPickupNotification = vi.fn()
    const { rerender } = render(
      <AdminOrdersPanel
        summary={summary}
        campaignStatus="open"
        campaignId="campaign-1"
        campaignTitle="神農包子"
        onPreviewPickupNotification={onPreviewPickupNotification}
        onSendPickupNotification={onSendPickupNotification}
      />,
    )
    expect(screen.queryByRole('heading', { name: 'LINE領取通知' })).not.toBeInTheDocument()

    rerender(
      <AdminOrdersPanel
        summary={summary}
        campaignStatus="closed"
        campaignId="campaign-1"
        campaignTitle="神農包子"
        onPreviewPickupNotification={onPreviewPickupNotification}
        onSendPickupNotification={onSendPickupNotification}
      />,
    )
    expect(screen.getByRole('heading', { name: 'LINE領取通知' })).toBeInTheDocument()
  })

  it('requires confirmation before changing payment and saves an organizer note explicitly', async () => {
    const user = userEvent.setup()
    const onSetCampaignStatus = vi.fn().mockResolvedValue(undefined)
    const onSetOrderPaid = vi.fn().mockResolvedValue(undefined)
    const onSetOrderOrganizerNote = vi.fn().mockResolvedValue(undefined)
    const workflowSummary = {
      ...summary,
      orderRows: summary.orderRows.map((order, index) => ({
        ...order,
        orderId: `order-${index + 1}`,
        paid: false,
        organizerNote: index === 0 ? '請放管理室' : '',
      })),
    }

    render(
      <AdminOrdersPanel
        summary={workflowSummary}
        campaignStatus="open"
        onSetCampaignStatus={onSetCampaignStatus}
        onSetOrderPaid={onSetOrderPaid}
        onSetOrderOrganizerNote={onSetOrderOrganizerNote}
      />,
    )

    expect(screen.getByText('收單中')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '結單' }))
    expect(onSetCampaignStatus).toHaveBeenCalledWith('closed')

    await user.click(screen.getByRole('button', { name: '標記 H11 已付款' }))
    expect(screen.getByRole('dialog', { name: '確認付款狀態' })).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '確認付款狀態' })).toHaveTextContent(/H11.*已付款/)
    expect(onSetOrderPaid).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '確認標記已付款' }))
    expect(onSetOrderPaid).toHaveBeenCalledWith('order-1', true)

    const note = screen.getByRole('textbox', { name: 'H11 備註' })
    expect(screen.queryByRole('combobox', { name: 'H11 領取狀態' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '儲存 H11 備註' })).toBeDisabled()
    await user.clear(note)
    await user.type(note, '改放警衛室')
    await user.click(screen.getByRole('button', { name: '儲存 H11 備註' }))
    expect(onSetOrderOrganizerNote).toHaveBeenCalledWith('order-1', '改放警衛室')
  })

  it('keeps a rejected payment confirmation open with an alert and retry action', async () => {
    const user = userEvent.setup()
    const onSetOrderPaid = vi.fn()
      .mockRejectedValueOnce(new Error('付款狀態更新失敗'))
      .mockResolvedValueOnce(undefined)
    const workflowSummary = {
      ...summary,
      orderRows: [{ ...summary.orderRows[0], orderId: 'order-1', paid: false, organizerNote: '' }],
    }

    render(<AdminOrdersPanel summary={workflowSummary} campaignStatus="open" onSetOrderPaid={onSetOrderPaid} />)
    await user.click(screen.getByRole('button', { name: '標記 H11 已付款' }))
    await user.click(screen.getByRole('button', { name: '確認標記已付款' }))

    const dialog = screen.getByRole('dialog', { name: '確認付款狀態' })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('付款狀態更新失敗')
    expect(within(dialog).getByRole('button', { name: '確認標記已付款' })).toBeEnabled()

    await user.click(within(dialog).getByRole('button', { name: '確認標記已付款' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '確認付款狀態' })).not.toBeInTheDocument())
    expect(onSetOrderPaid).toHaveBeenCalledTimes(2)
  })

  it('locks only the order row being updated', async () => {
    const user = userEvent.setup()
    let resolveUpdate: (() => void) | undefined
    const onSetOrderPaid = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { resolveUpdate = resolve }))
    const workflowSummary = {
      ...summary,
      orderRows: summary.orderRows.slice(0, 2).map((order, index) => ({
        ...order,
        orderId: `order-${index + 1}`,
        paid: false,
        organizerNote: '',
      })),
    }

    render(<AdminOrdersPanel summary={workflowSummary} campaignStatus="open" onSetOrderPaid={onSetOrderPaid} onSetOrderOrganizerNote={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '標記 H11 已付款' }))
    await user.click(screen.getByRole('button', { name: '確認標記已付款' }))

    expect(screen.getByRole('button', { name: '更新 H11 中' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '標記 1E7 已付款' })).toBeEnabled()
    expect(screen.getByRole('textbox', { name: '1E7 備註' })).toBeEnabled()
    resolveUpdate?.()
    await waitFor(() => expect(screen.getByRole('button', { name: '標記 H11 已付款' })).toBeEnabled())
  })

  it('filters resident orders to unpaid orders', async () => {
    const user = userEvent.setup()
    const workflowSummary = {
      ...summary,
      orderRows: summary.orderRows.slice(0, 2).map((order, index) => ({
        ...order,
        orderId: `order-${index + 1}`,
        paid: index === 0,
        organizerNote: '',
      })),
    }
    render(<AdminOrdersPanel summary={workflowSummary} campaignStatus="open" onSetOrderPaid={vi.fn()} onSetOrderOrganizerNote={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '待處理 1' }))
    expect(screen.queryByText('H11')).not.toBeInTheDocument()
    expect(screen.getByText('1E7')).toBeInTheDocument()
  })
})
