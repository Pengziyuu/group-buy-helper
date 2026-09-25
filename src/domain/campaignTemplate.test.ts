import { describe, expect, it } from 'vitest'
import type { CampaignContent } from '../services/demoCampaignStore'
import {
  campaignContentFromTemplate,
  duplicateTemplateNameMessage,
  imagePathFromPublicUrl,
  parseTemplateContent,
  templateContentFromCampaign,
  templateNameError,
  type CampaignTemplate,
} from './campaignTemplate'

const campaign: CampaignContent = {
  title: '一涼冰餅',
  unitPrice: 45,
  threshold: 100,
  thresholdKind: 'quantity',
  amountThreshold: null,
  quantityUnit: '盒',
  allowCustomItems: true,
  baseDiscountRate: 0.9,
  mixMatchDiscount: { name: '任選三件85折', minimumQuantity: 3, rate: 0.85 },
  arrivalLabel: '10月中',
  autoCloseAt: '2026-10-15T04:00:00.000Z',
  announcement: '公告',
  images: [{ src: 'https://example.supabase.co/storage/v1/object/public/campaign-images/c1/a.png', alt: '冰餅' }],
  items: [
    { code: 'ITEM1', name: '牛奶', unitPrice: 45, active: true, discountEligible: true },
    { code: 'ITEM2', name: '花生', active: true },
    { code: 'OLD', name: '舊口味', unitPrice: 40, active: false },
  ],
  openedAt: '2026-09-20T00:00:00.000Z',
}

describe('templateContentFromCampaign', () => {
  it('keeps the reusable content and drops schedule, opening and inactive items', () => {
    expect(templateContentFromCampaign(campaign)).toEqual({
      title: '一涼冰餅',
      announcement: '公告',
      images: campaign.images,
      items: [
        { code: 'ITEM1', name: '牛奶', unitPrice: 45, active: true, discountEligible: true },
        { code: 'ITEM2', name: '花生', unitPrice: 45, active: true, discountEligible: false },
      ],
      unitPrice: 45,
      threshold: 100,
      thresholdKind: 'quantity',
      amountThreshold: null,
      quantityUnit: '盒',
      baseDiscountRate: 0.9,
      mixMatchDiscount: { name: '任選三件85折', minimumQuantity: 3, rate: 0.85 },
      allowCustomItems: true,
    })
  })

  it('keeps the arrival only when it is the arrival notice', () => {
    expect(templateContentFromCampaign({ ...campaign, arrivalLabel: '貨到通知' }).arrivalLabel).toBe('貨到通知')
    expect(templateContentFromCampaign({ ...campaign, arrivalLabel: undefined })).not.toHaveProperty('arrivalLabel')
  })

  it('fills defaults for older content without the newer settings', () => {
    const legacy: CampaignContent = {
      title: '舊團', unitPrice: 30, threshold: 5, announcement: '', images: [], openedAt: null,
      items: [{ code: 'A', name: '原味', unitPrice: 30, active: true }],
    }
    expect(templateContentFromCampaign(legacy)).toMatchObject({
      thresholdKind: 'quantity', amountThreshold: null, quantityUnit: '個', baseDiscountRate: 1, mixMatchDiscount: null, allowCustomItems: false,
    })
  })
})

describe('campaignContentFromTemplate', () => {
  it('starts a new unopened draft with the given title, no closing date and the arrival notice', () => {
    const template = templateContentFromCampaign(campaign)
    const content = campaignContentFromTemplate(template, '十月冰餅團')
    expect(content).toMatchObject({
      title: '十月冰餅團',
      autoCloseAt: null,
      openedAt: null,
      arrivalLabel: '貨到通知',
      items: template.items,
      images: template.images,
      mixMatchDiscount: template.mixMatchDiscount,
    })
  })
})

describe('templateNameError', () => {
  const existing: CampaignTemplate[] = [{ id: 't1', name: 'Ice 冰餅', content: templateContentFromCampaign(campaign), updatedAt: '2026-09-25T00:00:00.000Z' }]

  it('requires a name of at most 100 characters', () => {
    expect(templateNameError('  ', existing)).toBe('範本名稱不能空白')
    expect(templateNameError('字'.repeat(101), existing)).toBe('範本名稱最多 100 字')
    expect(templateNameError('新範本', existing)).toBeNull()
  })

  it('rejects the same name regardless of case and surrounding spaces, except for the template itself', () => {
    expect(templateNameError('  ice 冰餅 ', existing)).toBe(duplicateTemplateNameMessage('ice 冰餅'))
    expect(duplicateTemplateNameMessage('ice 冰餅')).toBe('已經有叫「ice 冰餅」的範本，請改名，或選擇取代既有範本')
    expect(templateNameError('ICE 冰餅', existing, 't1')).toBeNull()
  })
})

describe('imagePathFromPublicUrl', () => {
  const prefix = 'https://example.supabase.co/storage/v1/object/public/campaign-images/'

  it('extracts the storage path of our own images and ignores other addresses', () => {
    expect(imagePathFromPublicUrl(`${prefix}c1/a.png`, prefix)).toBe('c1/a.png')
    expect(imagePathFromPublicUrl(`${prefix}templates/t1/%E5%9C%96.png?v=1`, prefix)).toBe('templates/t1/圖.png')
    expect(imagePathFromPublicUrl('/remote.svg', prefix)).toBeNull()
    expect(imagePathFromPublicUrl('https://other.example.com/a.png', prefix)).toBeNull()
  })
})

describe('parseTemplateContent', () => {
  it('accepts stored content and rejects malformed data', () => {
    const stored = templateContentFromCampaign(campaign)
    expect(parseTemplateContent(JSON.parse(JSON.stringify(stored)))).toEqual(stored)
    expect(() => parseTemplateContent(null)).toThrow('範本內容格式錯誤')
    expect(() => parseTemplateContent({ ...stored, items: 'x' })).toThrow('範本內容格式錯誤')
    expect(() => parseTemplateContent({ ...stored, title: 1 })).toThrow('範本內容格式錯誤')
  })
})
