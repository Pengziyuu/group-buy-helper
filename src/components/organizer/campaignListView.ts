import type { CampaignListItem } from '../../services/campaignManagementGateway'

export type CampaignPhase = 'open' | 'draft' | 'closed'
export type CampaignFilter = 'all' | CampaignPhase

const PHASE_ORDER: Record<CampaignPhase, number> = { open: 0, draft: 1, closed: 2 }
const currency = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 })

const timestamp = (value: string | null | undefined) => Date.parse(value ?? '') || 0

export function campaignPhase(campaign: Pick<CampaignListItem, 'openedAt' | 'status'>): CampaignPhase {
  if (!campaign.openedAt) return 'draft'
  return campaign.status === 'open' ? 'open' : 'closed'
}

export function sortCampaigns(campaigns: CampaignListItem[]): CampaignListItem[] {
  return [...campaigns].sort((a, b) => {
    const phaseA = campaignPhase(a)
    const phaseB = campaignPhase(b)
    if (phaseA !== phaseB) return PHASE_ORDER[phaseA] - PHASE_ORDER[phaseB]
    return phaseA === 'draft'
      ? timestamp(b.updatedAt) - timestamp(a.updatedAt)
      : timestamp(b.openedAt) - timestamp(a.openedAt)
  })
}

export function filterCampaigns(campaigns: CampaignListItem[], filter: CampaignFilter): CampaignListItem[] {
  return filter === 'all' ? campaigns : campaigns.filter((campaign) => campaignPhase(campaign) === filter)
}

export function countCampaigns(campaigns: CampaignListItem[]): Record<CampaignFilter, number> {
  const counts: Record<CampaignFilter, number> = { all: campaigns.length, open: 0, draft: 0, closed: 0 }
  for (const campaign of campaigns) counts[campaignPhase(campaign)] += 1
  return counts
}

export type FormationProgress = { value: number; max: number; text: string; statusText: string; formed: boolean }

export function formationProgress(campaign: CampaignListItem): FormationProgress {
  const usesAmount = campaign.thresholdKind === 'amount'
  const max = usesAmount ? (campaign.amountThreshold ?? campaign.threshold) : campaign.threshold
  const value = usesAmount ? campaign.totalAmount : campaign.totalQuantity
  const remaining = Math.max(0, max - value)
  const formed = value >= max
  const text = usesAmount
    ? `${currency.format(value)}／${currency.format(max)}`
    : `${value}／${max} ${campaign.quantityUnit}`
  const statusText = formed
    ? '已達成團門檻'
    : campaign.status === 'open'
      ? usesAmount ? `還差 ${currency.format(remaining)} 成團` : `還差 ${remaining} ${campaign.quantityUnit}成團`
      : '結單時未達成團門檻'
  return { value, max, text, statusText, formed }
}
