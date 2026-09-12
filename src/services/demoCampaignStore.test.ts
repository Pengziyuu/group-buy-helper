import { beforeEach, describe, expect, it } from 'vitest'
import {
  campaignContentEquals,
  loadDraftCampaign,
  loadPublishedCampaign,
  publishCampaign,
  saveDraftCampaign,
  type CampaignContent,
} from './demoCampaignStore'

const original: CampaignContent = {
  title: '原始團購',
  unitPrice: 45,
  threshold: 100,
  baseDiscountRate: 1,
  mixMatchDiscount: null,
  announcement: '原始公告',
  images: [],
  items: [
    { code: 'MILK', name: '牛奶', unitPrice: 45, active: true, discountEligible: false },
    { code: 'OLD', name: '舊口味', unitPrice: 45, active: false, discountEligible: false },
  ],
  openedAt: '2026-08-14T00:05:09.000Z',
}

const edited: CampaignContent = {
  ...original,
  title: '更新後團購',
  announcement: '更新後公告',
}

beforeEach(() => localStorage.clear())

describe('demo campaign draft and publishing store', () => {
  it('keeps a saved draft separate from the resident published version', () => {
    saveDraftCampaign(edited)

    expect(loadDraftCampaign(original)).toEqual(edited)
    expect(loadPublishedCampaign(original)).toEqual(original)
  })

  it('changes the resident version only after publishing', () => {
    saveDraftCampaign(edited)
    publishCampaign(edited)

    expect(loadPublishedCampaign(original)).toEqual(edited)
  })

  it('persists ordered item state and includes it in draft equality', () => {
    const reordered = {
      ...original,
      items: [original.items[1], original.items[0]],
    }

    saveDraftCampaign(reordered)

    expect(loadDraftCampaign(original).items).toEqual(reordered.items)
    expect(campaignContentEquals(original, reordered)).toBe(false)
  })

  it('includes discount settings and item eligibility in draft equality', () => {
    const discounted = {
      ...original,
      baseDiscountRate: 0.9,
      mixMatchDiscount: { name: '任選三件85折', minimumQuantity: 3, rate: 0.85 },
      items: original.items.map((item, index) => ({ ...item, discountEligible: index === 0 })),
    }

    expect(campaignContentEquals(original, discounted)).toBe(false)
    saveDraftCampaign(discounted)
    expect(loadDraftCampaign(original)).toMatchObject({
      baseDiscountRate: 0.9,
      mixMatchDiscount: { name: '任選三件85折', minimumQuantity: 3, rate: 0.85 },
    })
    expect(loadDraftCampaign(original).items[0]?.discountEligible).toBe(true)
  })

  it('normalizes legacy campaigns to no discount', () => {
    expect(loadDraftCampaign(original)).toMatchObject({ baseDiscountRate: 1, mixMatchDiscount: null })
  })

  it('ignores the server-owned opened timestamp when comparing editable draft content', () => {
    expect(campaignContentEquals(original, { ...original, openedAt: null })).toBe(true)
  })

  it('rejects content without an active named item', () => {
    const invalid = {
      ...original,
      items: [{ code: 'OLD', name: '舊口味', unitPrice: 45, active: false }],
    }

    expect(() => saveDraftCampaign(invalid)).toThrow('團購資料格式錯誤')
  })
})
