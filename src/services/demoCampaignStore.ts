export type CampaignImage = {
  src: string
  alt: string
}

export type CampaignContent = {
  title: string
  unitPrice: number
  threshold: number
  announcement: string
  images: CampaignImage[]
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
    && typeof candidate.announcement === 'string'
    && candidate.announcement.length <= 20_000
    && Array.isArray(candidate.images)
    && candidate.images.length <= 10
    && candidate.images.every((image) => Boolean(image)
      && typeof image === 'object'
      && typeof image.src === 'string'
      && typeof image.alt === 'string')
}

function loadCampaign(key: string, fallback: CampaignContent, storage = browserStorage()): CampaignContent {
  if (!storage) return fallback
  try {
    const raw = storage.getItem(key)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    return isCampaignContent(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function saveCampaign(key: string, content: CampaignContent, storage = browserStorage()): void {
  if (!storage) return
  if (!isCampaignContent(content)) throw new Error('團購資料格式錯誤')
  storage.setItem(key, JSON.stringify(content))
}

export function campaignContentEquals(left: CampaignContent, right: CampaignContent): boolean {
  return left.title === right.title
    && left.unitPrice === right.unitPrice
    && left.threshold === right.threshold
    && left.announcement === right.announcement
    && left.images.length === right.images.length
    && left.images.every((image, index) => image.src === right.images[index]?.src && image.alt === right.images[index]?.alt)
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
