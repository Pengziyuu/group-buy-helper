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
    expect(screen.getByText('6 筆')).toBeInTheDocument()
    expect(screen.getByText('62 個')).toBeInTheDocument()
    expect(screen.getByText('$2,790')).toBeInTheDocument()
    expect(screen.getByText('還差 38 個成團')).toBeInTheDocument()
    const itemRow = screen.getByRole('row', { name: /B\s*花生（招牌）\s*14 個/ })
    expect(itemRow).toBeInTheDocument()
    expect(itemRow.querySelector('.admin-item-code')).toHaveTextContent(/^B$/)
    expect(itemRow.querySelector('.admin-item-name')).toHaveTextContent('花生（招牌）')
    expect(itemRow.closest('table')).toHaveClass('item-summary-table')
    expect(screen.getByRole('row', { name: /2K13 斯祈 B 花生（招牌）×2（\$45\/件）、D 草莓×2（\$45\/件）、E 可可×2（\$45\/件）/ })).toBeInTheDocument()
  })

  it('uses the campaign quantity unit for every ordered quantity', () => {
    const boxSummary = buildOrganizerOrderSummary({
      orders: initialOrders.map((order, index) => index === 0
        ? { ...order, customItems: [{ id: 'custom-1', name: '限定蛋糕', quantity: 2 }] }
        : order),
      items,
      threshold: 100,
      quantityUnit: '盒',
    })
    render(<AdminOrdersPanel summary={boxSummary} />)

    expect(screen.getByText('62 盒')).toBeInTheDocument()
    expect(screen.getByText('還差 38 盒成團')).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /B\s*花生（招牌）\s*14 盒/ })).toBeInTheDocument()
    expect(screen.getAllByText(/6 盒/).length).toBeGreaterThan(0)
    expect(screen.getByText('限定蛋糕×2（另計）')).toBeInTheDocument()
    expect(screen.getByText('預估總額')).toBeInTheDocument()
    expect(screen.getByText('$2,790')).toBeInTheDocument()
  })

  it('shows remaining money rather than the quantity unit for an amount threshold', () => {
    const amountSummary = buildOrganizerOrderSummary({
      orders: initialOrders,
      items,
      threshold: 100,
      thresholdKind: 'amount',
      amountThreshold: 5000,
      quantityUnit: '盒',
    })
    render(<AdminOrdersPanel summary={amountSummary} />)

    expect(screen.getByText('還差 $2,210 成團')).toBeInTheDocument()
    expect(screen.queryByText(/還差 .*盒成團/)).not.toBeInTheDocument()
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

  it('uses only open and closed organizer workflow states while preserving legacy arrived data', () => {
    const onSetCampaignStatus = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(
      <AdminOrdersPanel summary={summary} campaignStatus="closed" onSetCampaignStatus={onSetCampaignStatus} />,
    )

    expect(screen.getByText('已結單')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新開放' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '標記到貨' })).not.toBeInTheDocument()

    rerender(<AdminOrdersPanel summary={summary} campaignStatus="arrived" onSetCampaignStatus={onSetCampaignStatus} />)
    expect(screen.getByText('已結單')).toBeInTheDocument()
    expect(screen.queryByText('已到貨')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '標記到貨' })).not.toBeInTheDocument()
  })

  it('offers a read-only Excel export only after closing the campaign', async () => {
    const user = userEvent.setup()
    const onExportOrders = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(
      <AdminOrdersPanel
        summary={summary}
        campaignStatus="open"
        campaignTitle="榮泉餅店"
        campaignOpenedAt="2026-09-11T05:00:00.000Z"
        onExportOrders={onExportOrders}
      />,
    )
    expect(screen.queryByRole('button', { name: '匯出成團明細' })).not.toBeInTheDocument()

    rerender(
      <AdminOrdersPanel
        summary={summary}
        campaignStatus="closed"
        campaignTitle="榮泉餅店"
        campaignOpenedAt="2026-09-11T05:00:00.000Z"
        onExportOrders={onExportOrders}
      />,
    )
    await user.click(screen.getByRole('button', { name: '匯出成團明細' }))
    expect(onExportOrders).toHaveBeenCalledOnce()

    rerender(
      <AdminOrdersPanel
        summary={summary}
        campaignStatus="arrived"
        campaignTitle="榮泉餅店"
        campaignOpenedAt="2026-09-11T05:00:00.000Z"
        onExportOrders={onExportOrders}
      />,
    )
    expect(screen.getByRole('button', { name: '匯出成團明細' })).toBeEnabled()
  })

  it('disables Excel export for empty shells but enables custom-only orders', () => {
    const emptyShell = {
      ...summary.orderRows[0],
      items: { A: 0 },
      customItems: [{ id: 'blank', name: '   ', quantity: 0 }],
    }
    const { rerender } = render(
      <AdminOrdersPanel
        summary={{ ...summary, orderCount: 0, orderRows: [emptyShell] }}
        campaignStatus="closed"
        campaignTitle="空團"
        campaignOpenedAt="2026-09-11T05:00:00.000Z"
      />,
    )
    expect(screen.getByRole('button', { name: '匯出成團明細' })).toBeDisabled()

    rerender(
      <AdminOrdersPanel
        summary={{
          ...summary,
          orderCount: 1,
          orderRows: [{ ...emptyShell, customItems: [{ id: 'bag', name: '紙袋', quantity: 1 }] }],
        }}
        campaignStatus="arrived"
        campaignTitle="額外品項團"
        campaignOpenedAt="2026-09-11T05:00:00.000Z"
      />,
    )
    expect(screen.getByRole('button', { name: '匯出成團明細' })).toBeEnabled()
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

    expect(screen.getByText('開團中')).toBeInTheDocument()
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
    expect(screen.queryByText(/H11/)).not.toBeInTheDocument()
    expect(screen.getByText(/1E7/)).toBeInTheDocument()
  })

  it('cancels a resident order outright after the organizer confirms', async () => {
    const user = userEvent.setup()
    const onCancelOrder = vi.fn().mockResolvedValue(undefined)
    const workflowSummary = {
      ...summary,
      orderRows: summary.orderRows.map((order, index) => ({ ...order, orderId: `order-${index + 1}`, paid: false })),
    }

    render(<AdminOrdersPanel summary={workflowSummary} campaignStatus="open" onCancelOrder={onCancelOrder} />)

    await user.click(screen.getByRole('button', { name: '取消 H11 訂單' }))
    const dialog = screen.getByRole('dialog', { name: '確認取消訂單' })
    expect(dialog).toHaveTextContent(/H11/)
    expect(onCancelOrder).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '確認取消訂單' }))
    expect(onCancelOrder).toHaveBeenCalledWith('order-1')
  })

  it('stops organizers cancelling once the campaign is closed', () => {
    const onCancelOrder = vi.fn().mockResolvedValue(undefined)
    const workflowSummary = {
      ...summary,
      orderRows: summary.orderRows.map((order, index) => ({ ...order, orderId: `order-${index + 1}`, paid: false })),
    }

    render(<AdminOrdersPanel summary={workflowSummary} campaignStatus="closed" onCancelOrder={onCancelOrder} />)

    expect(screen.getByRole('button', { name: '取消 H11 訂單' })).toBeDisabled()
  })

  it('warns that a paid order loses its payment record before cancelling', async () => {
    const user = userEvent.setup()
    const onCancelOrder = vi.fn().mockResolvedValue(undefined)
    const workflowSummary = {
      ...summary,
      orderRows: summary.orderRows.map((order, index) => ({ ...order, orderId: `order-${index + 1}`, paid: index === 0 })),
    }

    render(<AdminOrdersPanel summary={workflowSummary} campaignStatus="open" onCancelOrder={onCancelOrder} />)

    await user.click(screen.getByRole('button', { name: '取消 H11 訂單' }))
    expect(screen.getByRole('dialog', { name: '確認取消訂單' }))
      .toHaveTextContent('此單已標記已付款，取消後付款紀錄一併刪除，請自行完成退款。')
  })

  it('labels an order from outside the community and counts orders rather than households', () => {
    const mixed = {
      ...summary,
      orderCount: 2,
      orderRows: [
        { ...summary.orderRows[0], orderId: 'o1', name: '甲', period: 2, unit: '2K13', householdKind: 'resident' as const },
        { ...summary.orderRows[0], orderId: 'o2', name: '丙', period: null, unit: null, householdKind: 'other' as const },
      ],
    }

    render(<AdminOrdersPanel summary={mixed} campaignStatus="open" />)

    expect(screen.getByText('2 筆')).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /其他\s*丙/ })).toBeInTheDocument()
    expect(screen.queryByText('NaN期')).not.toBeInTheDocument()
  })

  it('uses 其他 instead of null in accessible order controls', () => {
    const otherSummary = {
      ...summary,
      orderRows: [{
        ...summary.orderRows[0],
        orderId: 'other-order',
        name: '社區朋友',
        period: null,
        unit: null,
        householdKind: 'other' as const,
        paid: false,
        organizerNote: '',
      }],
    }

    render(
      <AdminOrdersPanel
        summary={otherSummary}
        campaignStatus="open"
        onSetOrderPaid={vi.fn()}
        onSetOrderOrganizerNote={vi.fn()}
        onCancelOrder={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '標記 其他 已付款' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '其他 備註' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '儲存 其他 備註' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取消 其他 訂單' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/null/)).not.toBeInTheDocument()
  })
})
