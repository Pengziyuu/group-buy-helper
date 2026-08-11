import { describe, expect, it, vi } from 'vitest'
import { createAdminOrdersGateway, type AdminOrdersSupabaseClient } from './adminOrdersGateway'

function queryResult(data: unknown) {
  const order = vi.fn().mockResolvedValue({ data, error: null })
  const eq = vi.fn().mockReturnValue({ order, then: (resolve: (value: unknown) => unknown) => resolve({ data, error: null }) })
  const select = vi.fn().mockReturnValue({ eq })
  return { select, eq, order }
}

describe('Supabase admin orders gateway', () => {
  it('rebuilds resident orders from the safe order wall view', async () => {
    const itemQuery = queryResult([
      { code: 'A', name: '牛奶', sort_order: 1 },
      { code: 'B', name: '花生', sort_order: 2 },
    ])
    const wallQuery = queryResult([
      { order_id: 'order-1', customer_name: '斯祈', period: 2, unit: '2K13', item_code: 'A', qty: 2 },
      { order_id: 'order-1', customer_name: '斯祈', period: 2, unit: '2K13', item_code: 'B', qty: 1 },
      { order_id: 'order-2', customer_name: '佩怡', period: 1, unit: 'H11', item_code: 'B', qty: 2 },
    ])
    const from = vi.fn((table: string) => table === 'campaign_item' ? itemQuery : wallQuery)
    const client = { from } as unknown as AdminOrdersSupabaseClient

    const summary = await createAdminOrdersGateway(client).loadSummary('campaign-1', 45, 10)

    expect(from).toHaveBeenCalledWith('campaign_item')
    expect(from).toHaveBeenCalledWith('order_wall')
    expect(summary.householdCount).toBe(2)
    expect(summary.quantity).toBe(5)
    expect(summary.amount).toBe(225)
    expect(summary.itemRows.map(({ code, quantity }) => ({ code, quantity }))).toEqual([
      { code: 'A', quantity: 2 },
      { code: 'B', quantity: 3 },
    ])
    expect(summary.orderRows.find((order) => order.unit === '2K13')?.itemSummary).toBe('牛奶×2、花生×1')
  })
})
