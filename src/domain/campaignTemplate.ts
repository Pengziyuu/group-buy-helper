import type { CampaignContent, CampaignImage, CampaignItem, CampaignMixMatchDiscount } from '../services/demoCampaignStore'
import { normalizeQuantityUnit, type QuantityUnit } from './quantityUnit'

export const TEMPLATE_NAME_MAX = 100
export const DEFAULT_ARRIVAL_LABEL = '貨到通知'

export type CampaignTemplateContent = {
  title: string
  announcement: string
  images: CampaignImage[]
  items: CampaignItem[]
  unitPrice: number
  threshold: number
  thresholdKind: 'quantity' | 'amount'
  amountThreshold: number | null
  quantityUnit: QuantityUnit
  baseDiscountRate: number
  mixMatchDiscount: CampaignMixMatchDiscount | null
  allowCustomItems: boolean
  arrivalLabel?: string
}

export type CampaignTemplate = { id: string; name: string; content: CampaignTemplateContent; updatedAt: string }

export type CreateFromTemplateResult = { id: string; missingImages: number; contentError: string | null }

const nameKey = (name: string) => name.trim().toLowerCase()

export function duplicateTemplateNameMessage(name: string): string {
  return `已經有叫「${name.trim()}」的範本，請改名，或選擇取代既有範本`
}

export function templateNameError(name: string, existing: CampaignTemplate[], exceptId?: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return '範本名稱不能空白'
  if (trimmed.length > TEMPLATE_NAME_MAX) return `範本名稱最多 ${TEMPLATE_NAME_MAX} 字`
  const taken = existing.some((template) => template.id !== exceptId && nameKey(template.name) === nameKey(trimmed))
  return taken ? duplicateTemplateNameMessage(trimmed) : null
}

// Only what is worth reusing: schedule dates, the opening time and retired items belong to the old campaign.
export function templateContentFromCampaign(content: CampaignContent): CampaignTemplateContent {
  const template: CampaignTemplateContent = {
    title: content.title,
    announcement: content.announcement,
    images: content.images.map((image) => ({ ...image })),
    items: content.items
      .filter((item) => item.active)
      .map((item) => ({
        code: item.code,
        name: item.name,
        unitPrice: item.unitPrice ?? content.unitPrice,
        active: true,
        discountEligible: item.discountEligible ?? false,
      })),
    unitPrice: content.unitPrice,
    threshold: content.threshold,
    thresholdKind: content.thresholdKind === 'amount' ? 'amount' : 'quantity',
    amountThreshold: content.thresholdKind === 'amount' ? content.amountThreshold ?? null : null,
    quantityUnit: normalizeQuantityUnit(content.quantityUnit),
    baseDiscountRate: content.baseDiscountRate ?? 1,
    mixMatchDiscount: content.mixMatchDiscount ? { ...content.mixMatchDiscount } : null,
    allowCustomItems: content.allowCustomItems ?? false,
  }
  if (content.arrivalLabel === DEFAULT_ARRIVAL_LABEL) template.arrivalLabel = DEFAULT_ARRIVAL_LABEL
  return template
}

export function campaignContentFromTemplate(template: CampaignTemplateContent, title: string): CampaignContent {
  return {
    title,
    unitPrice: template.unitPrice,
    threshold: template.threshold,
    thresholdKind: template.thresholdKind,
    amountThreshold: template.amountThreshold,
    quantityUnit: template.quantityUnit,
    allowCustomItems: template.allowCustomItems,
    baseDiscountRate: template.baseDiscountRate,
    mixMatchDiscount: template.mixMatchDiscount ? { ...template.mixMatchDiscount } : null,
    arrivalLabel: DEFAULT_ARRIVAL_LABEL,
    autoCloseAt: null,
    announcement: template.announcement,
    images: template.images.map((image) => ({ ...image })),
    items: template.items.map((item) => ({ ...item })),
    openedAt: null,
  }
}

export function imagePathFromPublicUrl(src: string, publicPrefix: string): string | null {
  if (!publicPrefix || !src.startsWith(publicPrefix)) return null
  const path = src.slice(publicPrefix.length).split('?')[0]
  if (!path) return null
  try {
    return decodeURIComponent(path)
  } catch {
    return null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export function parseTemplateContent(value: unknown): CampaignTemplateContent {
  const valid = isRecord(value)
    && typeof value.title === 'string'
    && typeof value.announcement === 'string'
    && Array.isArray(value.images)
    && value.images.every((image) => isRecord(image) && typeof image.src === 'string' && typeof image.alt === 'string')
    && Array.isArray(value.items)
    && value.items.every((item) => isRecord(item) && typeof item.code === 'string' && typeof item.name === 'string'
      && typeof item.unitPrice === 'number' && typeof item.active === 'boolean')
    && typeof value.unitPrice === 'number'
    && typeof value.threshold === 'number'
  if (!valid) throw new Error('範本內容格式錯誤')
  const record = value as Record<string, unknown>
  const mixMatch = record.mixMatchDiscount
  return {
    title: record.title as string,
    announcement: record.announcement as string,
    images: (record.images as CampaignImage[]).map((image) => ({ src: image.src, alt: image.alt })),
    items: (record.items as CampaignItem[]).map((item) => ({
      code: item.code,
      name: item.name,
      unitPrice: item.unitPrice,
      active: item.active,
      discountEligible: item.discountEligible ?? false,
    })),
    unitPrice: record.unitPrice as number,
    threshold: record.threshold as number,
    thresholdKind: record.thresholdKind === 'amount' ? 'amount' : 'quantity',
    amountThreshold: typeof record.amountThreshold === 'number' ? record.amountThreshold : null,
    quantityUnit: normalizeQuantityUnit(typeof record.quantityUnit === 'string' ? record.quantityUnit : undefined),
    baseDiscountRate: typeof record.baseDiscountRate === 'number' ? record.baseDiscountRate : 1,
    mixMatchDiscount: isRecord(mixMatch) && typeof mixMatch.name === 'string'
      && typeof mixMatch.minimumQuantity === 'number' && typeof mixMatch.rate === 'number'
      ? { name: mixMatch.name, minimumQuantity: mixMatch.minimumQuantity, rate: mixMatch.rate }
      : null,
    allowCustomItems: record.allowCustomItems === true,
    ...(record.arrivalLabel === DEFAULT_ARRIVAL_LABEL ? { arrivalLabel: DEFAULT_ARRIVAL_LABEL } : {}),
  }
}
