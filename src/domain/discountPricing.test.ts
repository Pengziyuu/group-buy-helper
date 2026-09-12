import { describe, expect, it } from 'vitest'
import { priceOrder, discountedUnitPrice, type DiscountPricing } from './discountPricing'

const pricing: DiscountPricing = {
  baseRate: 0.9,
  mixMatch: {
    name: '任選三件85折',
    minimumQuantity: 3,
    rate: 0.85,
    itemCodes: ['A', 'B', 'C'],
  },
}

const items = [
  { code: 'A', unitPrice: 170 },
  { code: 'B', unitPrice: 299 },
  { code: 'C', unitPrice: 350 },
  { code: 'D', unitPrice: 180 },
]

describe('discount pricing', () => {
  it('rounds each discounted unit price to a whole Taiwan dollar', () => {
    expect(discountedUnitPrice(125, 0.9)).toBe(113)
    expect(discountedUnitPrice(25, 0.58)).toBe(15)
    expect(discountedUnitPrice(299, 0.85)).toBe(254)
    expect(discountedUnitPrice(345, 0.9)).toBe(311)
  })

  it('keeps eligible items at the base rate before three items', () => {
    const result = priceOrder({ A: 1, B: 1 }, items, pricing)

    expect(result.mixMatchQuantity).toBe(2)
    expect(result.mixMatchApplied).toBe(false)
    expect(result.lines.map((line) => [line.code, line.discountType, line.finalUnitPrice])).toEqual([
      ['A', 'base', 153],
      ['B', 'base', 269],
    ])
    expect(result.total).toBe(422)
  })

  it('applies the mix-and-match rate to every eligible item once their combined quantity reaches three', () => {
    const result = priceOrder({ A: 1, B: 1, C: 1, D: 2 }, items, pricing)

    expect(result.mixMatchQuantity).toBe(3)
    expect(result.mixMatchApplied).toBe(true)
    expect(result.lines.map((line) => [line.code, line.discountType, line.finalUnitPrice, line.lineTotal])).toEqual([
      ['A', 'mix_match', 145, 145],
      ['B', 'mix_match', 254, 254],
      ['C', 'mix_match', 298, 298],
      ['D', 'base', 162, 324],
    ])
    expect(result.total).toBe(1021)
  })

  it('applies the mix-and-match rate to all six eligible items instead of grouping them in threes', () => {
    const result = priceOrder({ A: 4, B: 2 }, items, pricing)

    expect(result.mixMatchApplied).toBe(true)
    expect(result.lines.find((line) => line.code === 'A')?.finalUnitPrice).toBe(145)
    expect(result.lines.find((line) => line.code === 'B')?.finalUnitPrice).toBe(254)
    expect(result.total).toBe(1088)
  })

  it('ignores zero quantities and does not count group-external items toward the threshold', () => {
    const result = priceOrder({ A: 2, B: 0, D: 5 }, items, pricing)

    expect(result.mixMatchQuantity).toBe(2)
    expect(result.mixMatchApplied).toBe(false)
    expect(result.total).toBe(1116)
  })
})
