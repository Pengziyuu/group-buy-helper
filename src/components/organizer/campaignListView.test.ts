import { describe, expect, it } from 'vitest'
import type { CampaignListItem } from '../../services/campaignManagementGateway'
import { campaignPhase, countCampaigns, filterCampaigns, formationProgress, sortCampaigns } from './campaignListView'

function campaign(overrides: Partial<CampaignListItem> & Pick<CampaignListItem, 'id'>): CampaignListItem {
  return {
    slug: `${overrides.id}-slug`, title: overrides.id, status: 'open', openedAt: '2026-09-01T00:00:00Z',
    createdAt: '2026-08-30T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', images: [], quantityUnit: '個',
    orderCount: 0, totalQuantity: 0, totalAmount: 0, paidOrderCount: 0,
    thresholdKind: 'quantity', threshold: 10, amountThreshold: null,
    ...overrides,
  }
}

describe('campaign list view', () => {
  it('classifies drafts, open campaigns, and closed or arrived campaigns', () => {
    expect(campaignPhase(campaign({ id: 'd', openedAt: null }))).toBe('draft')
    expect(campaignPhase(campaign({ id: 'o' }))).toBe('open')
    expect(campaignPhase(campaign({ id: 'c', status: 'closed' }))).toBe('closed')
    expect(campaignPhase(campaign({ id: 'a', status: 'arrived' }))).toBe('closed')
  })

  it('groups open, draft, then closed campaigns with the newest first in each group', () => {
    const sorted = sortCampaigns([
      campaign({ id: 'closed-old', status: 'closed', openedAt: '2026-08-01T00:00:00Z' }),
      campaign({ id: 'draft-old', openedAt: null, updatedAt: '2026-09-02T00:00:00Z' }),
      campaign({ id: 'open-old', openedAt: '2026-09-01T00:00:00Z' }),
      campaign({ id: 'closed-new', status: 'arrived', openedAt: '2026-08-20T00:00:00Z' }),
      campaign({ id: 'draft-new', openedAt: null, updatedAt: '2026-09-10T00:00:00Z' }),
      campaign({ id: 'open-new', openedAt: '2026-09-05T00:00:00Z' }),
    ])
    expect(sorted.map((item) => item.id)).toEqual(['open-new', 'open-old', 'draft-new', 'draft-old', 'closed-new', 'closed-old'])
  })

  it('filters and counts by phase', () => {
    const list = [
      campaign({ id: 'o' }), campaign({ id: 'd', openedAt: null }),
      campaign({ id: 'c', status: 'closed' }), campaign({ id: 'a', status: 'arrived' }),
    ]
    expect(countCampaigns(list)).toEqual({ all: 4, open: 1, draft: 1, closed: 2 })
    expect(filterCampaigns(list, 'closed').map((item) => item.id)).toEqual(['c', 'a'])
    expect(filterCampaigns(list, 'all')).toHaveLength(4)
  })

  it('describes quantity and amount formation progress', () => {
    expect(formationProgress(campaign({ id: 'q', quantityUnit: '盒', totalQuantity: 18, threshold: 30 })))
      .toEqual({ value: 18, max: 30, text: '18／30 盒', statusText: '還差 12 盒成團', formed: false })
    expect(formationProgress(campaign({ id: 'm', thresholdKind: 'amount', amountThreshold: 10000, totalAmount: 8500 })))
      .toMatchObject({ value: 8500, max: 10000, text: '$8,500／$10,000', statusText: '還差 $1,500 成團' })
    expect(formationProgress(campaign({ id: 'f', totalQuantity: 12, threshold: 10 })).statusText).toBe('已達成團門檻')
    expect(formationProgress(campaign({ id: 'u', status: 'closed', totalQuantity: 2, threshold: 10 })).statusText).toBe('結單時未達成團門檻')
  })
})
