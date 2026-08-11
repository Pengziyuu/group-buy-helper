import { render, screen } from '@testing-library/react'
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
    expect(screen.getByRole('row', { name: /B 花生（招牌） 14 個/ })).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /2K13 斯祈 花生（招牌）×2、草莓×2、可可×2 6 個/ })).toBeInTheDocument()
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
        paymentMethod: null,
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
      paymentMethod: 'cash',
      pickupStatus: 'pending',
    })

    await user.selectOptions(screen.getByRole('combobox', { name: 'H11 領取狀態' }), 'ready')
    expect(onSetOrderFulfillment).toHaveBeenCalledWith('order-1', {
      paid: false,
      paymentMethod: null,
      pickupStatus: 'ready',
    })
  })
})
