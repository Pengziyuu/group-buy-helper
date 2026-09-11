import { summarizeCampaign } from './campaign'
import { summarizePayment } from './orderWorkflow'
import { itemLabel } from './itemLabel'
import { normalizeQuantityUnit, type QuantityUnit } from './quantityUnit'
import type { CustomOrderItem } from './customOrderItem'

export type OrganizerCampaignItem = {
  code: string
  name: string
  unitPrice: number
  active?: boolean
}

export type OrganizerVisibleOrder = {
  orderId?: string
  customerId: string
  name: string
  period: number
  unit: string
  items: Record<string, number>
  customItems?: CustomOrderItem[]
  paid?: boolean
  organizerNote?: string
  orderedAt?: string
  updatedAt?: string
}

export type OrganizerItemRow = OrganizerCampaignItem & {
  label: string
  quantity: number
  amount: number
}

export type OrganizerOrderRow = OrganizerVisibleOrder & {
  orderId: string
  quantity: number
  amount: number
  itemSummary: string
  customItemSummary: string
  paid: boolean
  organizerNote: string
}

export type OrganizerOrderSummary = {
  householdCount: number
  quantity: number
  amount: number
  threshold: number
  thresholdKind: 'quantity' | 'amount'
  quantityUnit: QuantityUnit
  remaining: number
  progressPercent: number
  formed: boolean
  itemRows: OrganizerItemRow[]
  orderRows: OrganizerOrderRow[]
  fulfillment: ReturnType<typeof summarizePayment>
}

export function buildOrganizerOrderSummary({
  orders,
  items,
  threshold,
  thresholdKind = 'quantity',
  amountThreshold = null,
  quantityUnit = '個',
}: {
  orders: OrganizerVisibleOrder[]
  items: OrganizerCampaignItem[]
  threshold: number
  thresholdKind?: 'quantity' | 'amount'
  amountThreshold?: number | null
  quantityUnit?: QuantityUnit
}): OrganizerOrderSummary {
  const campaignSummary = summarizeCampaign(orders, items, {
    kind: thresholdKind,
    target: thresholdKind === 'amount' ? (amountThreshold ?? threshold) : threshold,
  })
  const itemByCode = new Map(items.map((item, index) => [item.code, {
    ...item,
    label: itemLabel(index),
  }]))

  const itemRows = items.map((item, index) => {
    const quantity = campaignSummary.itemTotals[item.code] ?? 0
    return {
      ...item,
      label: itemLabel(index),
      quantity,
      amount: quantity * item.unitPrice,
    }
  })

  const orderRows = orders
    .map((order) => {
      const visibleItems = Object.entries(order.items)
        .filter(([, quantity]) => quantity > 0)
        .sort(([left], [right]) => {
          const leftIndex = items.findIndex((item) => item.code === left)
          const rightIndex = items.findIndex((item) => item.code === right)
          return leftIndex - rightIndex || left.localeCompare(right)
        })
      const quantity = visibleItems.reduce((sum, [, itemQuantity]) => sum + itemQuantity, 0)
      const amount = visibleItems.reduce((sum, [code, itemQuantity]) => {
        const item = itemByCode.get(code)
        if (!item) throw new Error(`找不到品項 ${code}`)
        return sum + itemQuantity * item.unitPrice
      }, 0)
      const itemSummary = visibleItems
        .map(([code, itemQuantity]) => {
          const item = itemByCode.get(code)
          return item ? `${item.label} ${item.name}×${itemQuantity}` : `${code}×${itemQuantity}`
        })
        .join('、')
      const customItemSummary = (order.customItems ?? [])
        .filter((item) => item.name.trim() && item.quantity > 0)
        .map((item) => `${item.name.trim()}×${item.quantity}（另計）`)
        .join('、')
      return {
        ...order,
        orderId: order.orderId ?? order.customerId,
        quantity,
        amount,
        itemSummary,
        customItemSummary,
        paid: order.paid ?? false,
        organizerNote: order.organizerNote ?? '',
      }
    })
    .sort((left, right) => left.period - right.period || left.unit.localeCompare(right.unit))

  return {
    householdCount: orders.length,
    quantity: campaignSummary.quantity,
    amount: campaignSummary.amount,
    threshold: campaignSummary.threshold,
    thresholdKind,
    quantityUnit: normalizeQuantityUnit(quantityUnit),
    remaining: campaignSummary.remaining,
    progressPercent: campaignSummary.progressPercent,
    formed: campaignSummary.formed,
    itemRows,
    orderRows,
    fulfillment: summarizePayment(orderRows),
  }
}
