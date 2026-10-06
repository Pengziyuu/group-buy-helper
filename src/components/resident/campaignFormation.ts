import { normalizeQuantityUnit } from '../../domain/quantityUnit'
import type { ResidentCampaignListItem } from '../../ResidentCampaignListApp'
import type { ResidentMyOrder } from '../../ResidentMyOrdersApp'
import { formatMoney } from './residentFormat'

/** Progress toward the threshold the campaign uses, as the list card shows it. */
export function residentCampaignProgress(campaign: ResidentCampaignListItem) {
  if (campaign.thresholdKind === 'amount') {
    const value = campaign.totalAmount ?? 0
    const target = campaign.amountThreshold ?? campaign.threshold
    return { value, target, text: `${formatMoney(value)} / ${formatMoney(target)}` }
  }
  const unit = normalizeQuantityUnit(campaign.quantityUnit)
  return {
    value: campaign.totalQuantity,
    target: campaign.threshold,
    text: `${campaign.totalQuantity} ${unit} / ${campaign.threshold} ${unit}`,
  }
}

/**
 * Marks each order with whether its campaign reached the threshold, read from the campaign list
 * (list_my_orders() does not carry the totals). Left unknown when the list could not be read or
 * does not include the campaign.
 */
export function withFormation(orders: ResidentMyOrder[], campaigns: ResidentCampaignListItem[] | null): ResidentMyOrder[] {
  if (!campaigns) return orders
  const bySlug = new Map(campaigns.map((campaign) => [campaign.slug, campaign]))
  return orders.map((order) => {
    const campaign = bySlug.get(order.slug)
    if (!campaign) return order
    const progress = residentCampaignProgress(campaign)
    return { ...order, formed: progress.value >= progress.target }
  })
}
