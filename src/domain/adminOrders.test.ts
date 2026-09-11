import { describe, expect, it } from 'vitest'
import { initialOrders, items } from '../data/demo'
import { buildOrganizerOrderSummary } from './adminOrders'

const pricedItems = items.map((item, index) => ({
  ...item,
  unitPrice: index === 1 ? 60 : 45,
}))

describe('organizer order summary', () => {
  it('builds household, item-price amounts and resident breakdowns from visible orders', () => {
    const summary = buildOrganizerOrderSummary({
      orders: initialOrders,
      items: pricedItems,
      threshold: 100,
    })

    expect(summary.householdCount).toBe(6)
    expect(summary.quantity).toBe(62)
    expect(summary.amount).toBe(3000)
    expect(summary.remaining).toBe(38)
    expect(summary.itemRows.map(({ code, name, unitPrice, quantity }) => ({ code, name, unitPrice, quantity }))).toEqual([
      { code: 'A', name: '牛奶（招牌）', unitPrice: 45, quantity: 2 },
      { code: 'B', name: '花生（招牌）', unitPrice: 60, quantity: 14 },
      { code: 'C', name: '抹茶', unitPrice: 45, quantity: 8 },
      { code: 'D', name: '草莓', unitPrice: 45, quantity: 10 },
      { code: 'E', name: '可可', unitPrice: 45, quantity: 8 },
      { code: 'F', name: '黑芝麻', unitPrice: 45, quantity: 6 },
      { code: 'G', name: 'OREO', unitPrice: 45, quantity: 4 },
      { code: 'H', name: '烏龍奶', unitPrice: 45, quantity: 6 },
      { code: 'I', name: '泰奶', unitPrice: 45, quantity: 4 },
    ])
    expect(summary.orderRows).toHaveLength(6)
    expect(summary.orderRows.find((order) => order.unit === '2K13')).toEqual(expect.objectContaining({
      name: '斯祈',
      quantity: 6,
      amount: 300,
      itemSummary: 'B 花生（招牌）×2、D 草莓×2、E 可可×2',
      organizerNote: '',
    }))
    expect(summary.fulfillment).toEqual({ total: 6, paid: 0, unpaid: 6 })
  })

  it('counts a custom-only order as one household without inventing quantity or amount', () => {
    const summary = buildOrganizerOrderSummary({
      orders: [{
        customerId: 'customer-custom-only', name: '自訂住戶', period: 1, unit: '1A1', items: {}, orderedAt: '2026-09-11T00:00:00.000Z',
        customItems: [{ id: 'custom-1', name: '限定蛋糕', quantity: 2 }],
      }],
      items: pricedItems,
      threshold: 100,
    })

    expect(summary.householdCount).toBe(1)
    expect(summary.quantity).toBe(0)
    expect(summary.amount).toBe(0)
    expect(summary.itemRows.every((item) => item.quantity === 0)).toBe(true)
    expect(summary.orderRows[0]).toEqual(expect.objectContaining({
      quantity: 0,
      amount: 0,
      itemSummary: '',
      customItemSummary: '限定蛋糕×2（另計）',
    }))
  })
})
