import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { initialOrders, items } from './data/demo'
import { buildOrganizerOrderSummary } from './domain/adminOrders'
import AdminOrdersPanel from './AdminOrdersPanel'

const summary = buildOrganizerOrderSummary({
  orders: initialOrders,
  items,
  unitPrice: 45,
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
    expect(screen.getByRole('row', { name: /B號 14 個/ })).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /2K13 斯祈 B號×2、D號×2、E號×2/ })).toBeInTheDocument()
  })

  it('lets the organizer close the campaign and update fulfillment by order id', async () => {
    const user = userEvent.setup()
    const onSetCampaignStatus = vi.fn().mockResolvedValue(undefined)
    const onSetOrderFulfillment = vi.fn().mockResolvedValue(undefined)
    const workflowSummary = {
      ...summary,
      orderRows: summary.orderRows.map((order, index) => ({
        ...order,
        orderId: `order-${index + 1}`,
        paid: false,
        pickupStatus: 'pending' as const,
      })),
    }

    render(
      <AdminOrdersPanel
        summary={workflowSummary}
        campaignStatus="open"
        onSetCampaignStatus={onSetCampaignStatus}
        onSetOrderFulfillment={onSetOrderFulfillment}
      />,
    )

    expect(screen.getByText('收單中')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '結單' }))
    expect(onSetCampaignStatus).toHaveBeenCalledWith('closed')

    await user.click(screen.getByRole('button', { name: '標記 H11 已付款' }))
    expect(onSetOrderFulfillment).toHaveBeenCalledWith('order-1', {
      paid: true,
      pickupStatus: 'pending',
    })

    await user.selectOptions(screen.getByRole('combobox', { name: 'H11 領取狀態' }), 'ready')
    expect(onSetOrderFulfillment).toHaveBeenCalledWith('order-1', {
      paid: false,
      pickupStatus: 'ready',
    })
  })

  it('locks only the order row being updated', async () => {
    const user = userEvent.setup()
    let resolveUpdate: (() => void) | undefined
    const onSetOrderFulfillment = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { resolveUpdate = resolve }))
    const workflowSummary = {
      ...summary,
      orderRows: summary.orderRows.slice(0, 2).map((order, index) => ({
        ...order,
        orderId: `order-${index + 1}`,
        paid: false,
        pickupStatus: 'pending' as const,
      })),
    }

    render(<AdminOrdersPanel summary={workflowSummary} campaignStatus="open" onSetOrderFulfillment={onSetOrderFulfillment} />)
    await user.click(screen.getByRole('button', { name: '標記 H11 已付款' }))

    expect(screen.getByRole('button', { name: '更新 H11 中' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '標記 1E7 已付款' })).toBeEnabled()
    expect(screen.getByRole('combobox', { name: '1E7 領取狀態' })).toBeEnabled()
    resolveUpdate?.()
    await waitFor(() => expect(screen.getByRole('button', { name: '標記 H11 已付款' })).toBeEnabled())
  })

  it('filters resident orders to unresolved payment or pickup tasks', async () => {
    const user = userEvent.setup()
    const workflowSummary = {
      ...summary,
      orderRows: summary.orderRows.slice(0, 2).map((order, index) => ({
        ...order,
        orderId: `order-${index + 1}`,
        paid: index === 0,
        pickupStatus: index === 0 ? 'picked_up' as const : 'pending' as const,
      })),
    }
    render(<AdminOrdersPanel summary={workflowSummary} campaignStatus="open" onSetOrderFulfillment={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '待處理 1' }))
    expect(screen.queryByText('H11')).not.toBeInTheDocument()
    expect(screen.getByText('1E7')).toBeInTheDocument()
  })
})
