import { describe, expect, it, vi } from 'vitest'
import { createAdminOrdersGateway, type AdminOrdersSupabaseClient } from './adminOrdersGateway'

function queryResult(data: unknown) {
  const order = vi.fn().mockResolvedValue({ data, error: null })
  const eq = vi.fn().mockReturnValue({ order, then: (resolve: (value: unknown) => unknown) => resolve({ data, error: null }) })
  const select = vi.fn().mockReturnValue({ eq })
  return { select, eq, order }
}

describe('Supabase admin orders gateway', () => {
  it('rebuilds resident orders and merges organizer-only payment and note state', async () => {
    const itemQuery = queryResult([
      { code: 'A', name: '牛奶', unit_price: 45, active: true, sort_order: 1 },
      { code: 'B', name: '歷史花生', unit_price: 45, active: false, sort_order: 2 },
    ])
    const wallQuery = queryResult([
      { order_id: 'order-1', customer_name: '斯祈', period: 2, unit: '2K13', item_code: 'A', qty: 2, list_unit_price: 45, discount_type: 'base', discount_rate: 0.9, final_unit_price: 41, promotion_name: null, custom_items: [{ id: 'custom-1', name: '限定蛋糕', quantity: 2 }], ordered_at: '2026-08-14T00:10:00Z', order_updated_at: '2026-08-14T00:12:00Z' },
      { order_id: 'order-1', customer_name: '斯祈', period: 2, unit: '2K13', item_code: 'B', qty: 1, list_unit_price: 45, discount_type: 'mix_match', discount_rate: 0.85, final_unit_price: 38, promotion_name: '任選三件85折', ordered_at: '2026-08-14T00:10:00Z', order_updated_at: '2026-08-14T00:12:00Z' },
      { order_id: 'order-2', customer_name: '佩怡', period: 1, unit: 'H11', item_code: 'B', qty: 2, list_unit_price: 45, discount_type: 'base', discount_rate: 0.9, final_unit_price: 41, promotion_name: null, ordered_at: '2026-08-14T00:15:00Z', order_updated_at: '2026-08-14T00:15:00Z' },
    ])
    const statusQuery = queryResult([
      { order_id: 'order-1', paid: true, organizer_note: '請放管理室' },
      { order_id: 'order-2', paid: false, organizer_note: null },
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

    const summary = await gateway.loadSummary('campaign-1', 10)

    expect(from).toHaveBeenCalledWith('organizer_order_status')
    expect(summary.householdCount).toBe(2)
    expect(summary.quantity).toBe(5)
    expect(summary.amount).toBe(202)
    expect(summary.itemRows.map(({ code, quantity }) => ({ code, quantity }))).toEqual([
      { code: 'A', quantity: 2 },
      { code: 'B', quantity: 3 },
    ])
    expect(summary.orderRows.find((order) => order.unit === '2K13')).toMatchObject({
      orderId: 'order-1',
      amount: 120,
      itemSummary: 'A 牛奶×2（$41/件）、B 歷史花生×1（$38/件）',
      itemPriceSnapshots: {
        A: expect.objectContaining({ listUnitPrice: 45, appliedDiscountType: 'base', finalUnitPrice: 41 }),
        B: expect.objectContaining({ appliedDiscountType: 'mix_match', finalUnitPrice: 38, promotionName: '任選三件85折' }),
      },
      customItemSummary: '限定蛋糕×2（另計）',
      orderedAt: '2026-08-14T00:10:00Z',
      updatedAt: '2026-08-14T00:12:00Z',
      paid: true,
      organizerNote: '請放管理室',
    })

    await gateway.setCampaignStatus('campaign-1', 'closed')
    expect(rpc).toHaveBeenCalledWith('set_campaign_status', {
      p_campaign_id: 'campaign-1', p_status: 'closed',
    })

    await gateway.setOrderPaid('order-1', true)
    expect(rpc).toHaveBeenCalledWith('set_order_paid', {
      p_order_id: 'order-1',
      p_paid: true,
    })

    await gateway.setOrderOrganizerNote('order-1', '已電話確認')
    expect(rpc).toHaveBeenCalledWith('set_order_organizer_note', {
      p_order_id: 'order-1',
      p_organizer_note: '已電話確認',
    })
  })
})
