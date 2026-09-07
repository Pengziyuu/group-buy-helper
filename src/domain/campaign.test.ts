import { describe, expect, it } from 'vitest'
import { summarizeCampaign, type Order } from './campaign'

const orders: Order[] = [
  { customerId: '2:2K13', items: { B: 2, D: 2, E: 2 } },
  { customerId: '1:H11', items: { B: 1, C: 1, D: 1, F: 1 } },
  { customerId: '2:3H15', items: { C: 2, E: 1, F: 1, H: 2 } },
  { customerId: '2:2I7', items: { A: 2, B: 2, C: 2, D: 2, E: 2, F: 2, G: 2, H: 2, I: 2 } },
  { customerId: '2:1E7', items: { B: 4, F: 2, G: 2, H: 2, I: 2 } },
  { customerId: '2:3E9', items: { B: 5, C: 3, D: 5, E: 3 } },
]

const itemPrices = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I',
].map((code) => ({ code, unitPrice: 45 }))

describe('summarizeCampaign', () => {
  it('matches the hand-verified totals from the real six-order sample', () => {
    expect(summarizeCampaign(orders, itemPrices, 100)).toEqual({
      itemTotals: { A: 2, B: 14, C: 8, D: 10, E: 8, F: 6, G: 4, H: 6, I: 4 },
      quantity: 62,
      amount: 2790,
      threshold: 100,
      remaining: 38,
      progressPercent: 62,
      formed: false,
    })
  })

  it('ignores zero quantities and never reports a negative remaining count', () => {
    expect(summarizeCampaign([{ customerId: '2:2K13', items: { A: 101, B: 0 } }], itemPrices, 100)).toMatchObject({
      itemTotals: { A: 101 },
      quantity: 101,
      remaining: 0,
      progressPercent: 100,
      formed: true,
    })
  })

  it('calculates the campaign amount from each item price', () => {
    expect(summarizeCampaign(
      [{ customerId: '2:2K13', items: { A: 2, B: 3 } }],
      [{ code: 'A', unitPrice: 45 }, { code: 'B', unitPrice: 60 }],
      10,
    )).toMatchObject({ quantity: 5, amount: 270 })
  })

  it('calculates progress from total amount for an amount threshold', () => {
    expect(summarizeCampaign(
      [{ customerId: '2:2K13', items: { A: 2, B: 3 } }],
      [{ code: 'A', unitPrice: 45 }, { code: 'B', unitPrice: 60 }],
      { kind: 'amount', target: 500 },
    )).toMatchObject({
      threshold: 500,
      remaining: 230,
      progressPercent: 54,
      formed: false,
    })
  })
})
