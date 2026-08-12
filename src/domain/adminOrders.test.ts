import { describe, expect, it } from 'vitest'
import { initialOrders, items } from '../data/demo'
import { buildOrganizerOrderSummary } from './adminOrders'

describe('organizer order summary', () => {
  it('builds household, amount, item and resident breakdowns from visible orders', () => {
    const summary = buildOrganizerOrderSummary({
      orders: initialOrders,
      items,
      unitPrice: 45,
      threshold: 100,
    })

    expect(summary.householdCount).toBe(6)
    expect(summary.quantity).toBe(62)
    expect(summary.amount).toBe(2790)
    expect(summary.remaining).toBe(38)
    expect(summary.itemRows.map(({ code, quantity }) => ({ code, quantity }))).toEqual([
      { code: 'A', quantity: 2 },
      { code: 'B', quantity: 14 },
      { code: 'C', quantity: 8 },
      { code: 'D', quantity: 10 },
      { code: 'E', quantity: 8 },
      { code: 'F', quantity: 6 },
      { code: 'G', quantity: 4 },
      { code: 'H', quantity: 6 },
      { code: 'I', quantity: 4 },
    ])
    expect(summary.orderRows).toHaveLength(6)
    expect(summary.orderRows.find((order) => order.unit === '2K13')).toEqual(expect.objectContaining({
      name: '斯祈',
      quantity: 6,
      amount: 270,
      itemSummary: 'B號×2、D號×2、E號×2',
    }))
  })
})
