import { itemLabel } from '../../../domain/itemLabel'
import { formatZhTwTimestamp } from '../../../domain/timestamp'
import type { CampaignItem } from '../../../services/demoCampaignStore'

export type ContentSectionId = 'announcement' | 'items' | 'schedule' | 'advanced'

export const CONTENT_SECTIONS: Array<{ id: ContentSectionId; label: string; anchor: string }> = [
  { id: 'announcement', label: '公告與圖片', anchor: 'content-announcement' },
  { id: 'items', label: '品項與價格', anchor: 'content-items' },
  { id: 'schedule', label: '成團與時程', anchor: 'content-schedule' },
  { id: 'advanced', label: '優惠與進階', anchor: 'content-advanced' },
]

export type ContentReadiness = {
  title: string
  announcement: string
  items: CampaignItem[]
  itemPricesValid: boolean
  thresholdValid: boolean
  scheduleValid: boolean
  discountRulesValid: boolean
}

// Phrased as what the organizer still has to do, in the order the form asks for it.
export function publishBlockers(input: ContentReadiness): string[] {
  const blockers: string[] = []
  if (!input.title.trim()) blockers.push('填寫團購標題')
  if (!input.announcement.trim()) blockers.push('填寫開團資訊')
  if (!input.items.some((item) => item.active)) blockers.push('至少需要一個品項')
  input.items.forEach((item, index) => {
    if (item.active && !item.name.trim()) blockers.push(`填寫品項 ${itemLabel(index)} 的名稱`)
  })
  if (!input.itemPricesValid) blockers.push('每個品項都要有有效的單價')
  if (!input.thresholdValid) blockers.push('填寫有效的成團門檻')
  if (!input.scheduleValid) blockers.push('結單日期要是今天或之後')
  if (!input.discountRulesValid) blockers.push('完成優惠設定；任選優惠至少要有一個參加的品項')
  return blockers
}

export function sectionCompletion(input: ContentReadiness): Record<ContentSectionId, boolean> {
  return {
    announcement: input.title.trim().length > 0 && input.announcement.trim().length > 0,
    items: input.items.some((item) => item.active)
      && input.items.every((item) => !item.active || item.name.trim().length > 0)
      && input.itemPricesValid,
    schedule: input.thresholdValid && input.scheduleValid,
    advanced: input.discountRulesValid,
  }
}

export type SaveState = { tone: 'idle' | 'saving' | 'warning' | 'error'; text: string }

export function describeSaveState({ pending, saving, failedMessage, canSave, lastSavedAt }: {
  pending: boolean
  saving: boolean
  failedMessage: string | null
  canSave: boolean
  lastSavedAt: Date | null
}): SaveState {
  if (failedMessage !== null) return { tone: 'error', text: `儲存失敗：${failedMessage}` }
  if (saving) return { tone: 'saving', text: '儲存中…' }
  if (pending) {
    return canSave
      ? { tone: 'saving', text: '儲存中…' }
      : { tone: 'warning', text: '有欄位需要修正，修正後才會自動儲存' }
  }
  if (lastSavedAt) return { tone: 'idle', text: `已自動儲存 ${formatZhTwTimestamp(lastSavedAt).slice(-5)}` }
  return { tone: 'idle', text: '所有變更都已儲存' }
}

export type PublicationStatus = 'unpublished' | 'outdated' | 'current'

export function publicationStatus(openedAt: string | null, publicationState: 'draft' | 'published'): PublicationStatus {
  if (openedAt === null) return 'unpublished'
  return publicationState === 'draft' ? 'outdated' : 'current'
}

export const PUBLICATION_TEXT: Record<PublicationStatus, string> = {
  unpublished: '草稿・住戶還看不到',
  outdated: '有未更新到住戶頁的變更',
  current: '住戶頁已是最新',
}

export function publishBlockReason({ blockers, uploading, savePending }: {
  blockers: string[]
  uploading: boolean
  savePending: boolean
}): string | null {
  if (blockers.length > 0) return `還有 ${blockers.length} 項需要處理，見「發布前檢查」`
  if (uploading) return '圖片上傳完成後才能發布'
  if (savePending) return '儲存完成後才能發布'
  return null
}

export const MAX_CAMPAIGN_IMAGES = 10

export function splitImageUploads<T>(files: T[], currentCount: number, max = MAX_CAMPAIGN_IMAGES): { accepted: T[]; skipped: T[] } {
  const room = Math.max(0, max - currentCount)
  return { accepted: files.slice(0, room), skipped: files.slice(room) }
}

// Internal codes only need to be unique; residents see the A, B, … labels from the row position.
export function nextItemCode(items: CampaignItem[]): string {
  let suffix = 1
  while (items.some((item) => item.code === `ITEM${suffix}`)) suffix += 1
  return `ITEM${suffix}`
}

export function appendItem(items: CampaignItem[], code: string): CampaignItem[] {
  const lastPrice = items.at(-1)?.unitPrice
  return [...items, { code, name: '', unitPrice: lastPrice, active: true, discountEligible: false }]
}

export function applyPriceToAll(items: CampaignItem[], price: number): CampaignItem[] {
  return items.map((item) => ({ ...item, unitPrice: price }))
}
