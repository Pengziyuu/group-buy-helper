export type Order = {
  customerId: string
  items: Record<string, number>
  itemUnitPrices?: Record<string, number>
}

export type PricedCampaignItem = {
  code: string
  unitPrice: number
}

export type CampaignSummary = {
  itemTotals: Record<string, number>
  quantity: number
  amount: number
  threshold: number
  remaining: number
  progressPercent: number
  formed: boolean
}

export type CampaignThreshold = number | {
  kind: 'quantity' | 'amount'
  target: number
}

export function summarizeCampaign(
  orders: Order[],
  items: PricedCampaignItem[],
  thresholdConfig: CampaignThreshold,
): CampaignSummary {
  const itemTotals: Record<string, number> = {}

  for (const order of orders) {
    for (const [code, quantity] of Object.entries(order.items)) {
      if (quantity <= 0) continue
      itemTotals[code] = (itemTotals[code] ?? 0) + quantity
    }
  }

  const sortedTotals = Object.fromEntries(
    Object.entries(itemTotals).sort(([a], [b]) => a.localeCompare(b)),
  )
  const priceByCode = new Map(items.map((item) => [item.code, item.unitPrice]))
  const quantity = Object.values(sortedTotals).reduce((sum, value) => sum + value, 0)
  const amount = orders.reduce((orderSum, order) => orderSum + Object.entries(order.items).reduce((sum, [code, itemQuantity]) => {
    if (itemQuantity <= 0) return sum
    const unitPrice = order.itemUnitPrices?.[code] ?? priceByCode.get(code)
    if (unitPrice === undefined) throw new Error(`找不到品項 ${code} 的價格`)
    return sum + itemQuantity * unitPrice
  }, 0), 0)
  const threshold = typeof thresholdConfig === 'number' ? thresholdConfig : thresholdConfig.target
  const current = typeof thresholdConfig === 'object' && thresholdConfig.kind === 'amount' ? amount : quantity

  return {
    itemTotals: sortedTotals,
    quantity,
    amount,
    threshold,
    remaining: Math.max(0, threshold - current),
    progressPercent: Math.min(100, Math.round((current / threshold) * 100)),
    formed: current >= threshold,
  }
}
