import { summarizeCampaign } from './campaign'
import { summarizeFulfillment, type PickupStatus } from './orderWorkflow'

export type OrganizerCampaignItem = {
  code: string
  name: string
}

export type OrganizerVisibleOrder = {
  orderId?: string
  customerId: string
  name: string
  period: number
  unit: string
  items: Record<string, number>
  paid?: boolean
  pickupStatus?: PickupStatus
}

export type OrganizerItemRow = OrganizerCampaignItem & {
  quantity: number
  amount: number
}

export type OrganizerOrderRow = OrganizerVisibleOrder & {
  orderId: string
  quantity: number
  amount: number
  itemSummary: string
  paid: boolean
  pickupStatus: PickupStatus
}

export type OrganizerOrderSummary = {
  householdCount: number
  quantity: number
  amount: number
  threshold: number
  remaining: number
  progressPercent: number
  formed: boolean
  itemRows: OrganizerItemRow[]
  orderRows: OrganizerOrderRow[]
  fulfillment: ReturnType<typeof summarizeFulfillment>
}

export function buildOrganizerOrderSummary({
  orders,
  items,
  unitPrice,
  threshold,
}: {
  orders: OrganizerVisibleOrder[]
  items: OrganizerCampaignItem[]
  unitPrice: number
  threshold: number
}): OrganizerOrderSummary {
  const campaignSummary = summarizeCampaign(orders, unitPrice, threshold)
  const itemByCode = new Map(items.map((item) => [item.code, item]))

  const itemRows = items.map((item) => {
    const quantity = campaignSummary.itemTotals[item.code] ?? 0
    return {
      ...item,
      quantity,
      amount: quantity * unitPrice,
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
      const itemSummary = visibleItems
        .map(([code, itemQuantity]) => `${itemByCode.get(code)?.name ?? code}×${itemQuantity}`)
        .join('、')
      return {
        ...order,
        orderId: order.orderId ?? order.customerId,
        quantity,
        amount: quantity * unitPrice,
        itemSummary,
        paid: order.paid ?? false,
        pickupStatus: order.pickupStatus ?? 'pending',
      }
    })
    .sort((left, right) => left.period - right.period || left.unit.localeCompare(right.unit))

  return {
    householdCount: orders.length,
    quantity: campaignSummary.quantity,
    amount: campaignSummary.amount,
    threshold,
    remaining: campaignSummary.remaining,
    progressPercent: campaignSummary.progressPercent,
    formed: campaignSummary.formed,
    itemRows,
    orderRows,
    fulfillment: summarizeFulfillment(orderRows),
  }
}
