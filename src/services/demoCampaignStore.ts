import { normalizeQuantityUnit, type QuantityUnit } from '../domain/quantityUnit'

export type CampaignImage = {
  src: string
  alt: string
}

export type CampaignItem = {
  code: string
  name: string
  unitPrice?: number
  active: boolean
  discountEligible?: boolean
}

export type CampaignMixMatchDiscount = {
  name: string
  minimumQuantity: number
  rate: number
}

export type CampaignThresholdKind = 'quantity' | 'amount'

export type CampaignContent = {
  title: string
  unitPrice: number
  threshold: number
  thresholdKind?: CampaignThresholdKind
  amountThreshold?: number | null
  quantityUnit?: QuantityUnit
  allowCustomItems?: boolean
  baseDiscountRate?: number
  mixMatchDiscount?: CampaignMixMatchDiscount | null
  announcement: string
  images: CampaignImage[]
  items: CampaignItem[]
  openedAt: string | null
}

const DRAFT_KEY = 'group-buy-helper:campaign:draft'
const PUBLISHED_KEY = 'group-buy-helper:campaign:published'

function browserStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

function isCampaignContent(value: unknown): value is CampaignContent {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<CampaignContent>
  return typeof candidate.title === 'string'
    && typeof candidate.unitPrice === 'number'
    && Number.isFinite(candidate.unitPrice)
    && candidate.unitPrice >= 0
    && typeof candidate.threshold === 'number'
    && Number.isInteger(candidate.threshold)
    && candidate.threshold > 0
    && (candidate.thresholdKind === undefined || candidate.thresholdKind === 'quantity' || candidate.thresholdKind === 'amount')
    && (candidate.amountThreshold === undefined || candidate.amountThreshold === null
      || (typeof candidate.amountThreshold === 'number' && Number.isFinite(candidate.amountThreshold) && candidate.amountThreshold > 0))
    && (candidate.thresholdKind !== 'amount' || (typeof candidate.amountThreshold === 'number' && candidate.amountThreshold > 0))
    && (candidate.allowCustomItems === undefined || typeof candidate.allowCustomItems === 'boolean')
    && (candidate.baseDiscountRate === undefined
      || (typeof candidate.baseDiscountRate === 'number' && candidate.baseDiscountRate > 0 && candidate.baseDiscountRate <= 1))
    && (candidate.mixMatchDiscount === undefined || candidate.mixMatchDiscount === null
      || (typeof candidate.mixMatchDiscount === 'object'
        && typeof candidate.mixMatchDiscount.name === 'string'
        && candidate.mixMatchDiscount.name.trim().length > 0
        && candidate.mixMatchDiscount.name.length <= 100
        && Number.isInteger(candidate.mixMatchDiscount.minimumQuantity)
        && candidate.mixMatchDiscount.minimumQuantity >= 2
        && typeof candidate.mixMatchDiscount.rate === 'number'
        && candidate.mixMatchDiscount.rate > 0
        && candidate.mixMatchDiscount.rate <= 1))
    && typeof candidate.announcement === 'string'
    && candidate.announcement.length <= 20_000
    && Array.isArray(candidate.images)
    && candidate.images.length <= 10
    && candidate.images.every((image) => Boolean(image)
      && typeof image === 'object'
      && typeof image.src === 'string'
      && typeof image.alt === 'string')
    && Array.isArray(candidate.items)
    && candidate.items.length > 0
    && candidate.items.length <= 100
    && candidate.items.every((item) => Boolean(item)
      && typeof item === 'object'
      && typeof item.code === 'string'
      && /^[A-Z0-9]{1,64}$/.test(item.code)
      && typeof item.name === 'string'
      && item.name.trim().length > 0
      && item.name.length <= 200
      && (item.unitPrice === undefined
        || (typeof item.unitPrice === 'number' && Number.isFinite(item.unitPrice) && item.unitPrice >= 0))
      && typeof item.active === 'boolean'
      && (item.discountEligible === undefined || typeof item.discountEligible === 'boolean'))
    && new Set(candidate.items.map((item) => item.code)).size === candidate.items.length
    && candidate.items.some((item) => item.active && item.name.trim().length > 0)
    && (candidate.openedAt === null
      || (typeof candidate.openedAt === 'string' && Number.isFinite(Date.parse(candidate.openedAt))))
}

export function normalizeCampaignContent(content: CampaignContent): CampaignContent {
  return {
    ...content,
    baseDiscountRate: content.baseDiscountRate ?? 1,
    mixMatchDiscount: content.mixMatchDiscount ?? null,
    items: content.items.map((item) => ({
      ...item,
      unitPrice: item.unitPrice ?? content.unitPrice,
      discountEligible: item.discountEligible ?? false,
    })),
  }
}

function loadCampaign(key: string, fallback: CampaignContent, storage = browserStorage()): CampaignContent {
  if (!storage) return normalizeCampaignContent(fallback)
  try {
    const raw = storage.getItem(key)
    if (!raw) return normalizeCampaignContent(fallback)
    const parsed: unknown = JSON.parse(raw)
    return normalizeCampaignContent(isCampaignContent(parsed) ? parsed : fallback)
  } catch {
    return normalizeCampaignContent(fallback)
  }
}

function saveCampaign(key: string, content: CampaignContent, storage = browserStorage()): void {
  if (!storage) return
  if (!isCampaignContent(content)) throw new Error('團購資料格式錯誤')
  storage.setItem(key, JSON.stringify(normalizeCampaignContent(content)))
}

export function campaignContentEquals(left: CampaignContent, right: CampaignContent): boolean {
  return left.title === right.title
    && left.unitPrice === right.unitPrice
    && left.threshold === right.threshold
    && (left.thresholdKind ?? 'quantity') === (right.thresholdKind ?? 'quantity')
    && (left.amountThreshold ?? null) === (right.amountThreshold ?? null)
    && normalizeQuantityUnit(left.quantityUnit) === normalizeQuantityUnit(right.quantityUnit)
    && (left.allowCustomItems ?? false) === (right.allowCustomItems ?? false)
    && (left.baseDiscountRate ?? 1) === (right.baseDiscountRate ?? 1)
    && JSON.stringify(left.mixMatchDiscount ?? null) === JSON.stringify(right.mixMatchDiscount ?? null)
    && left.announcement === right.announcement
    && left.images.length === right.images.length
    && left.images.every((image, index) => image.src === right.images[index]?.src && image.alt === right.images[index]?.alt)
    && left.items.length === right.items.length
    && left.items.every((item, index) => item.code === right.items[index]?.code
      && item.name === right.items[index]?.name
      && (item.unitPrice ?? left.unitPrice) === (right.items[index]?.unitPrice ?? right.unitPrice)
      && (item.discountEligible ?? false) === (right.items[index]?.discountEligible ?? false)
      && item.active === right.items[index]?.active)
}

export function loadDraftCampaign(fallback: CampaignContent, storage?: Storage | null): CampaignContent {
  return loadCampaign(DRAFT_KEY, fallback, storage)
}

export function loadPublishedCampaign(fallback: CampaignContent, storage?: Storage | null): CampaignContent {
  return loadCampaign(PUBLISHED_KEY, fallback, storage)
}

export function saveDraftCampaign(content: CampaignContent, storage?: Storage | null): void {
  saveCampaign(DRAFT_KEY, content, storage)
}

export function publishCampaign(content: CampaignContent, storage?: Storage | null): void {
  saveCampaign(DRAFT_KEY, content, storage)
  saveCampaign(PUBLISHED_KEY, content, storage)
}
