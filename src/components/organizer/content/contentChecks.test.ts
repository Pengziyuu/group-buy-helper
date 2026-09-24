import { describe, expect, it } from 'vitest'
import type { CampaignItem } from '../../../services/demoCampaignStore'
import {
  appendItem,
  applyPriceToAll,
  CONTENT_SECTIONS,
  describeSaveState,
  MAX_CAMPAIGN_IMAGES,
  nextItemCode,
  publicationStatus,
  PUBLICATION_TEXT,
  publishBlockers,
  publishBlockReason,
  sectionCompletion,
  splitImageUploads,
  type ContentReadiness,
} from './contentChecks'

const ready: ContentReadiness = {
  title: '冰餅團',
  announcement: '公告',
  items: [{ code: 'A', name: '牛奶', unitPrice: 45, active: true }],
  itemPricesValid: true,
  thresholdValid: true,
  scheduleValid: true,
  discountRulesValid: true,
}

describe('publishBlockers', () => {
  it('is empty when everything required is filled', () => {
    expect(publishBlockers(ready)).toEqual([])
  })

  it('lists each missing requirement in form order', () => {
    expect(publishBlockers({
      ...ready,
      title: '  ',
      announcement: ' ',
      items: [
        { code: 'A', name: '牛奶', unitPrice: 45, active: true },
        { code: 'B', name: ' ', unitPrice: 45, active: true },
        { code: 'C', name: '', unitPrice: 45, active: false },
      ],
      itemPricesValid: false,
      thresholdValid: false,
      scheduleValid: false,
      discountRulesValid: false,
    })).toEqual([
      '填寫團購標題',
      '填寫開團資訊',
      '填寫品項 B 的名稱',
      '每個品項都要有有效的單價',
      '填寫有效的成團門檻',
      '結單日期要是今天或之後',
      '完成優惠設定；任選優惠至少要有一個參加的品項',
    ])
  })

  it('requires at least one active item', () => {
    expect(publishBlockers({ ...ready, items: [{ code: 'A', name: '舊口味', unitPrice: 45, active: false }] }))
      .toEqual(['至少需要一個品項'])
  })

  it('requires the announcement but not images', () => {
    expect(publishBlockers({ ...ready, announcement: ' \n ' })).toEqual(['填寫開團資訊'])
    expect(publishBlockers(ready)).toEqual([])
  })
})

describe('sectionCompletion', () => {
  it('marks every section complete for a ready campaign', () => {
    expect(sectionCompletion(ready)).toEqual({ announcement: true, items: true, schedule: true, advanced: true })
  })

  it('marks each section incomplete by its own fields', () => {
    expect(sectionCompletion({ ...ready, announcement: ' ' }).announcement).toBe(false)
    expect(sectionCompletion({ ...ready, title: '' }).announcement).toBe(false)
    expect(sectionCompletion({ ...ready, items: [{ code: 'A', name: '', unitPrice: 45, active: true }] }).items).toBe(false)
    expect(sectionCompletion({ ...ready, itemPricesValid: false }).items).toBe(false)
    expect(sectionCompletion({ ...ready, scheduleValid: false }).schedule).toBe(false)
    expect(sectionCompletion({ ...ready, thresholdValid: false }).schedule).toBe(false)
    expect(sectionCompletion({ ...ready, discountRulesValid: false }).advanced).toBe(false)
  })

  it('names the four sections in form order with their anchors', () => {
    expect(CONTENT_SECTIONS.map((section) => [section.label, section.anchor])).toEqual([
      ['公告與圖片', 'content-announcement'],
      ['品項與價格', 'content-items'],
      ['成團與時程', 'content-schedule'],
      ['優惠與進階', 'content-advanced'],
    ])
  })
})

describe('describeSaveState', () => {
  const base = { pending: false, saving: false, failedMessage: null, canSave: true, lastSavedAt: null }

  it('reports a failure with its reason before anything else', () => {
    expect(describeSaveState({ ...base, pending: true, saving: true, failedMessage: '網路中斷' }))
      .toEqual({ tone: 'error', text: '儲存失敗：網路中斷' })
  })

  it('reports saving while a save runs or is about to run', () => {
    expect(describeSaveState({ ...base, saving: true })).toEqual({ tone: 'saving', text: '儲存中…' })
    expect(describeSaveState({ ...base, pending: true })).toEqual({ tone: 'saving', text: '儲存中…' })
  })

  it('explains that invalid fields hold back the autosave', () => {
    expect(describeSaveState({ ...base, pending: true, canSave: false }))
      .toEqual({ tone: 'warning', text: '有欄位需要修正，修正後才會自動儲存' })
  })

  it('shows the Taipei time of the last save', () => {
    expect(describeSaveState({ ...base, lastSavedAt: new Date('2026-09-25T06:05:00.000Z') }))
      .toEqual({ tone: 'idle', text: '已自動儲存 14:05' })
    expect(describeSaveState(base)).toEqual({ tone: 'idle', text: '所有變更都已儲存' })
  })
})

describe('publication status', () => {
  it('distinguishes never published, published with pending edits, and up to date', () => {
    expect(publicationStatus(null, 'draft')).toBe('unpublished')
    expect(publicationStatus(null, 'published')).toBe('unpublished')
    expect(publicationStatus('2026-09-20T00:00:00.000Z', 'draft')).toBe('outdated')
    expect(publicationStatus('2026-09-20T00:00:00.000Z', 'published')).toBe('current')
    expect(PUBLICATION_TEXT).toEqual({
      unpublished: '草稿・住戶還看不到',
      outdated: '有未更新到住戶頁的變更',
      current: '住戶頁已是最新',
    })
  })

  it('explains why publishing is unavailable, most important reason first', () => {
    expect(publishBlockReason({ blockers: ['填寫團購標題', '填寫品項 A 的名稱'], uploading: true, savePending: true }))
      .toBe('還有 2 項需要處理，見「發布前檢查」')
    expect(publishBlockReason({ blockers: [], uploading: true, savePending: true })).toBe('圖片上傳完成後才能發布')
    expect(publishBlockReason({ blockers: [], uploading: false, savePending: true })).toBe('儲存完成後才能發布')
    expect(publishBlockReason({ blockers: [], uploading: false, savePending: false })).toBeNull()
  })
})

describe('splitImageUploads', () => {
  it('accepts only as many files as there is room for', () => {
    expect(MAX_CAMPAIGN_IMAGES).toBe(10)
    expect(splitImageUploads(['a', 'b', 'c'], 9)).toEqual({ accepted: ['a'], skipped: ['b', 'c'] })
    expect(splitImageUploads(['a', 'b'], 0)).toEqual({ accepted: ['a', 'b'], skipped: [] })
    expect(splitImageUploads(['a'], 10)).toEqual({ accepted: [], skipped: ['a'] })
    expect(splitImageUploads(['a'], 12)).toEqual({ accepted: [], skipped: ['a'] })
  })
})

describe('item helpers', () => {
  const items: CampaignItem[] = [
    { code: 'ITEM1', name: '牛奶', unitPrice: 45, active: true, discountEligible: true },
    { code: 'ITEM3', name: '花生', unitPrice: 50, active: true },
  ]

  it('picks the first unused internal code', () => {
    expect(nextItemCode(items)).toBe('ITEM2')
    expect(nextItemCode([])).toBe('ITEM1')
  })

  it('appends an unnamed active item that inherits the last price', () => {
    expect(appendItem(items, 'ITEM2')).toEqual([
      ...items,
      { code: 'ITEM2', name: '', unitPrice: 50, active: true, discountEligible: false },
    ])
    expect(appendItem([], 'ITEM1')).toEqual([{ code: 'ITEM1', name: '', unitPrice: undefined, active: true, discountEligible: false }])
  })

  it('applies one price to every item and keeps everything else', () => {
    expect(applyPriceToAll(items, 60)).toEqual([
      { code: 'ITEM1', name: '牛奶', unitPrice: 60, active: true, discountEligible: true },
      { code: 'ITEM3', name: '花生', unitPrice: 60, active: true },
    ])
  })
})
