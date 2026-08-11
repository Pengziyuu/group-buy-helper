export type Order = {
  customerId: string
  items: Record<string, number>
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

export function summarizeCampaign(
  orders: Order[],
  unitPrice: number,
  threshold: number,
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
  const quantity = Object.values(sortedTotals).reduce((sum, value) => sum + value, 0)

  return {
    itemTotals: sortedTotals,
    quantity,
    amount: quantity * unitPrice,
    threshold,
    remaining: Math.max(0, threshold - quantity),
    progressPercent: Math.min(100, Math.round((quantity / threshold) * 100)),
    formed: quantity >= threshold,
  }
}
