export type CampaignStatus = 'open' | 'closed' | 'arrived'

export type OrderPayment = {
  paid: boolean
}

const campaignLabels: Record<CampaignStatus, string> = {
  open: '開團中',
  closed: '已結單',
  arrived: '已到貨',
}

export function campaignStatusLabel(status: CampaignStatus): string {
  return campaignLabels[status]
}

export function campaignStatusAction(status: CampaignStatus): { next: CampaignStatus; label: string } {
  if (status === 'open') return { next: 'closed', label: '結單' }
  if (status === 'closed') return { next: 'open', label: '重新開放' }
  return { next: 'closed', label: '取消到貨' }
}

export function summarizePayment(orders: OrderPayment[]) {
  return orders.reduce(
    (summary, order) => {
      summary.total += 1
      if (order.paid) summary.paid += 1
      else summary.unpaid += 1
      return summary
    },
    { total: 0, paid: 0, unpaid: 0 },
  )
}
