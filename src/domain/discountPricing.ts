export type DiscountType = 'none' | 'base' | 'mix_match'

export type MixMatchDiscount = {
  name: string
  minimumQuantity: number
  rate: number
  itemCodes: string[]
}

export type DiscountPricing = {
  baseRate: number
  mixMatch?: MixMatchDiscount | null
}

export type DiscountableItem = {
  code: string
  unitPrice: number
}

export type PricedOrderLine = {
  code: string
  quantity: number
  listUnitPrice: number
  discountRate: number
  discountType: DiscountType
  promotionName: string | null
  finalUnitPrice: number
  lineTotal: number
}

export type PricedOrder = {
  lines: PricedOrderLine[]
  mixMatchQuantity: number
  mixMatchApplied: boolean
  subtotal: number
  total: number
  savings: number
}

function validRate(rate: number): boolean {
  return Number.isFinite(rate) && rate > 0 && rate <= 1
}

export function discountedUnitPrice(unitPrice: number, rate: number): number {
  if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('商品原價必須是非負數')
  if (!validRate(rate)) throw new Error('折扣率必須大於0且不超過1')
  const priceInCents = Math.round(unitPrice * 100)
  const rateInBasisPoints = Math.round(rate * 10_000)
  return Math.floor((priceInCents * rateInBasisPoints + 500_000) / 1_000_000)
}

export function priceOrder(
  quantities: Record<string, number>,
  items: DiscountableItem[],
  pricing: DiscountPricing,
): PricedOrder {
  if (!validRate(pricing.baseRate)) throw new Error('基本折扣率格式錯誤')
  const itemByCode = new Map(items.map((item) => [item.code, item]))
  const eligibleCodes = new Set(pricing.mixMatch?.itemCodes ?? [])
  const mixMatchQuantity = Object.entries(quantities).reduce((sum, [code, quantity]) => (
    eligibleCodes.has(code) && Number.isInteger(quantity) && quantity > 0 ? sum + quantity : sum
  ), 0)
  const mixMatchApplied = Boolean(pricing.mixMatch
    && validRate(pricing.mixMatch.rate)
    && Number.isInteger(pricing.mixMatch.minimumQuantity)
    && pricing.mixMatch.minimumQuantity >= 2
    && mixMatchQuantity >= pricing.mixMatch.minimumQuantity)

  const lines = items.flatMap((item): PricedOrderLine[] => {
    const quantity = quantities[item.code] ?? 0
    if (!Number.isInteger(quantity) || quantity < 0) throw new Error(`${item.code}數量格式錯誤`)
    if (quantity === 0) return []
    const usesMixMatch = mixMatchApplied && eligibleCodes.has(item.code)
    const discountRate = usesMixMatch ? pricing.mixMatch!.rate : pricing.baseRate
    const finalUnitPrice = discountedUnitPrice(item.unitPrice, discountRate)
    return [{
      code: item.code,
      quantity,
      listUnitPrice: item.unitPrice,
      discountRate,
      discountType: usesMixMatch ? 'mix_match' : discountRate < 1 ? 'base' : 'none',
      promotionName: usesMixMatch ? pricing.mixMatch!.name : null,
      finalUnitPrice,
      lineTotal: finalUnitPrice * quantity,
    }]
  })

  for (const [code, quantity] of Object.entries(quantities)) {
    if (quantity > 0 && !itemByCode.has(code)) throw new Error(`找不到品項 ${code}`)
  }
  const subtotal = lines.reduce((sum, line) => sum + line.listUnitPrice * line.quantity, 0)
  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0)
  return { lines, mixMatchQuantity, mixMatchApplied, subtotal, total, savings: subtotal - total }
}
