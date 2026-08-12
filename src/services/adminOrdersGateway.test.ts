import { describe, expect, it, vi } from 'vitest'
import { createAdminOrdersGateway, type AdminOrdersSupabaseClient } from './adminOrdersGateway'

function queryResult(data: unknown) {
  const order = vi.fn().mockResolvedValue({ data, error: null })
  const eq = vi.fn().mockReturnValue({ order, then: (resolve: (value: unknown) => unknown) => resolve({ data, error: null }) })
  const select = vi.fn().mockReturnValue({ eq })
  return { select, eq, order }
}

describe('Supabase admin orders gateway', () => {
  it('rebuilds resident orders and merges organizer-only fulfillment state', async () => {
    const itemQuery = queryResult([
      { code: 'A', name: '牛奶', active: true, sort_order: 1 },
      { code: 'B', name: '歷史花生', active: false, sort_order: 2 },
    ])
    const wallQuery = queryResult([
      { order_id: 'order-1', customer_name: '斯祈', period: 2, unit: '2K13', item_code: 'A', qty: 2, ordered_at: '2026-08-14T00:10:00Z', order_updated_at: '2026-08-14T00:12:00Z' },
      { order_id: 'order-1', customer_name: '斯祈', period: 2, unit: '2K13', item_code: 'B', qty: 1, ordered_at: '2026-08-14T00:10:00Z', order_updated_at: '2026-08-14T00:12:00Z' },
      { order_id: 'order-2', customer_name: '佩怡', period: 1, unit: 'H11', item_code: 'B', qty: 2, ordered_at: '2026-08-14T00:15:00Z', order_updated_at: '2026-08-14T00:15:00Z' },
    ])
    const statusQuery = queryResult([
      { order_id: 'order-1', paid: true, pickup_status: 'ready' },
      { order_id: 'order-2', paid: false, pickup_status: 'pending' },
    ])
    const single = vi.fn().mockResolvedValue({ data: { status: 'open' }, error: null })
    const campaignQuery = { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single }) }) }
    const from = vi.fn((table: string) => {
      if (table === 'campaign_item') return itemQuery
      if (table === 'organizer_order_status') return statusQuery
      if (table === 'campaign_public') return campaignQuery
      return wallQuery
    })
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null })
    const client = { from, rpc } as unknown as AdminOrdersSupabaseClient
    const gateway = createAdminOrdersGateway(client)

    await expect(gateway.loadCampaignStatus('campaign-1')).resolves.toBe('open')

    const summary = await gateway.loadSummary('campaign-1', 45, 10)

    expect(from).toHaveBeenCalledWith('organizer_order_status')
    expect(summary.householdCount).toBe(2)
    expect(summary.quantity).toBe(5)
    expect(summary.amount).toBe(225)
    expect(summary.itemRows.map(({ code, quantity }) => ({ code, quantity }))).toEqual([
      { code: 'A', quantity: 2 },
      { code: 'B', quantity: 3 },
    ])
    expect(summary.orderRows.find((order) => order.unit === '2K13')).toMatchObject({
      orderId: 'order-1',
      itemSummary: 'A號×2、B號×1',
      orderedAt: '2026-08-14T00:10:00Z',
      updatedAt: '2026-08-14T00:12:00Z',
      paid: true,
      pickupStatus: 'ready',
    })

    await gateway.setCampaignStatus('campaign-1', 'closed')
    expect(rpc).toHaveBeenCalledWith('set_campaign_status', {
      p_campaign_id: 'campaign-1', p_status: 'closed',
    })

    await gateway.setOrderFulfillment('order-1', {
      paid: true, pickupStatus: 'picked_up',
    })
    expect(rpc).toHaveBeenCalledWith('set_order_fulfillment', {
      p_order_id: 'order-1',
      p_paid: true,
      p_pickup_status: 'picked_up',
    })
  })
})
