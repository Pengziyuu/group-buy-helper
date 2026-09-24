# 前端改版第 5 階段：團主端內容設定 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把團購工作區的「內容設定」改寫成規格的新版編輯器，包含：
- 上方固定列：儲存狀態、發布狀態、預覽住戶頁、發布按鈕。
- 跳段標籤，並標示各段是否已填妥。
- 四段表單：
  - 公告與圖片（含圖片多選上傳）；
  - 品項與價格（緊湊表格，Enter 新增列）；
  - 成團與時程；
  - 優惠與進階。
- 右欄：可切手機／電腦的住戶頁預覽，以及「發布前檢查」。

**Architecture:**
- **邏輯留在 `AdminApp.tsx`：** 草稿、自動儲存、發布與鎖定邏輯原樣保留，只換掉畫面。
- **拆出的元件：** 畫面拆成 `src/components/organizer/content/` 裡的元件，每個元件只收資料與回呼，不自己存草稿：
  - 品項表
  - 圖片管理
  - 預覽
  - 上方固定列
  - 跳段標籤
  - 發布前檢查
- **純函式：** 判斷「哪些必填沒填、各段是否填妥、儲存狀態文字、圖片數量上限、新增品項」的邏輯放在 `contentChecks.ts`，可單獨測試。

**Tech Stack:** React 19、TypeScript 6、Vite 8、Vitest 4、Testing Library、原生 CSS（`src/styles/tokens.css` 的 token）

**Spec:**
- 主要依據：`docs/superpowers/specs/2026-09-21-frontend-redesign-design.md`，含以下章節：
  - 〈團主端〉的〈內容設定〉
  - 〈共用元件〉
  - 〈螢幕寬度切換〉
  - 〈狀態畫面〉
  - 〈必須維持的產品規則〉
  - 〈測試與驗證〉
  - 〈風險與待驗證〉的「圖片多選上傳」
- 前幾階段留下的事項：
  - `docs/superpowers/plans/2026-09-24-redesign-phase-3-organizer-shell.md` 最後一節；
  - `docs/superpowers/plans/2026-09-25-redesign-phase-4-overview-orders-pickup.md` 最後一節。

## Global Constraints

- Node.js 22.12.0 以上（機器上為 v22.23.2）。
- **只改前端：** 不得修改 `supabase/**`、`scripts/*.py`、`src/services/**`、`src/domain/**`、`src/types/database.ts`。可以修改 `src/LocalLiveApps.tsx`、`src/RuntimeApp.tsx` 的組裝。
- 不新增 npm 相依套件。
- 操作色只有一種：`#0066cc`；聚焦外框 `2px solid #0071e3`、`outline-offset: 2px`。
- **字體：** 沿用 `--font-sans`；中文不套負字距；字重只用 400 與 600。
  - 團主端表格與表單 14px（`--font-size-dense`）；
  - 輔助小字最小 12px；
  - 頁面標題 20～22px。
- 不使用裝飾性漸層與 UI 陰影；只做淺色模式。
- **可點範圍：** 團主端 1024px 以上 ≥ 24×24px；1024px 以下 ≥ 44×44px。所有可點擊元素有 `:focus-visible`。
- 文字與底色組合對比 ≥ 4.5:1（大字 ≥ 3:1）。
- 不做付款功能（2026-09-24 決定）。
- 產品規則（不可破壞）：
  - 品項代碼 A…Z、AA…，不加「號」。
  - 開團後品項、單價、折扣、額外品項開關鎖定；標題、公告、圖片、門檻、時程仍可修改。
  - 圖片最多 10 張，第一張為封面。
  - 公告 20,000 字上限。
  - 額外品項不計入金額、門檻與折扣。
- 行為不可減少：
  - 自動儲存的時機（停止輸入約 0.5 秒）；
  - 儲存失敗不自動重試，只能手動「重試」；
  - 儲存完成前不能發布；
  - 草稿與發布隔離（住戶看不到未發布的草稿）；
  - 開團後鎖定；
  - 切換分區不丟未儲存的草稿（`AdminApp` 保持掛載）；
  - 換團時不顯示前一團資料；
  - 上傳中不能發布，也不會觸發自動儲存。
- TDD：每個行為先寫失敗測試，確認失敗原因是功能缺失，再寫最小實作。
- 修改既有測試時，原本驗證的行為必須仍被某個測試驗證；刻意改變的行為另外寫明。
- 使用者可見文案一律繁體中文。
- **只 commit、不 push。** 何時上線由團主決定。

## 對 Spec 的調整

1. **發布前檢查多一條「每個啟用中的品項都要有名稱」：**
   - 新增的品項名稱預設空白，並自動把游標移到名稱欄。
   - 原本預設「新口味」，但團主容易忘了改。
   - 若允許空白名稱發布，住戶會看到沒有名字的品項。
2. **新列的單價沿用上一列**（規格原文）。原本沿用所有品項中最低的單價。
3. **「參加任選」改為品項表的一欄**（規格原文），優惠段落不再重複列出品項勾選。
4. **預覽的做法：**
   - 不直接重用住戶端元件：那些元件帶固定的 `id` 與 `h1`，放進團主頁會重複 id、打亂標題層級。
   - 改用同樣視覺語言的預覽專用元件。
   - 電腦版預覽以等比例縮小呈現，縮小時不可操作（`inert`），避免縮小後的按鈕小於可點範圍。
5. **「預覽住戶頁 ↗」只在已發布、有住戶連結時顯示**：草稿還沒有住戶頁可開。
6. **本機示範（localStorage Demo）沒有上傳服務，沿用「圖片網址＋新增圖片」。**
7. **上傳圖片期間仍停用其他編輯欄位**，沿用現況。
8. **儲存狀態多兩種說明：**
   - 「有欄位需要修正，修正後才會自動儲存」：輸入不合法時不會自動儲存，原本畫面沒有說明。
   - 「所有變更都已儲存」：開啟頁面後還沒有儲存過時顯示。
9. **跳段標籤不改網址**：改網址會觸發團主端換頁時把焦點移到頁首的行為。改為捲動到該段，並把焦點移到該段標題。
10. **「優惠與進階」沒有必填**：各開關都關閉時標為已填妥。開了任選優惠卻沒選品項時標為未完成。
11. **「發布前檢查」不要求公告或圖片**，沿用現況：現在沒有公告、沒有圖片也能發布。

## Review Focus

以下五種情況沒有任何既有測試涵蓋，最可能讓團主遇到問題。每一項都在負責的 Task 補上測試：

1. **一次選多張圖，中間某張上傳失敗：**
   - 已上傳成功的要留在草稿；
   - 失敗的要以檔名列出原因；
   - 上傳期間不能自動儲存，全部結束後只存一次。
   - Task 4、Task 7 測試。
2. **選的圖片超過剩餘名額**（例如已有 9 張又選 3 張）：只上傳能放下的，其餘以檔名說明沒有加入，也不送上傳。Task 4 測試。
3. **在品項表按 Enter：** 只有在最後一列的單價按 Enter 才新增一列，且只新增一列。以下情況都不能新增：
   - 中文輸入法選字中；
   - 在其他列按 Enter；
   - 已開團；
   - 已達 100 個品項。

   Task 3 測試。
4. **發布按鈕：**
   - 有未完成必填、上傳中或儲存中時一律停用，並在按鈕旁說明原因；
   - 補齊後說明消失、按鈕可用。

   Task 7 測試。
5. **按跳段標籤：** 網址不能改變（不觸發團主端換頁），焦點要移到該段標題。Task 6 測試。

## 檔案地圖

| 檔案 | 動作 | 責任 |
|---|---|---|
| `src/components/organizer/content/contentChecks.ts`、`contentChecks.test.ts` | 新增 | 發布前檢查、各段是否填妥、儲存狀態文字、發布狀態、圖片名額、新增品項、統一單價 |
| `src/components/ui/ImageGallery.tsx`、`ImageGallery.test.tsx` | 修改 | `onOpen` 改為選填；沒有時大圖不是按鈕（預覽用） |
| `src/components/organizer/content/ItemTable.tsx`、`ItemTable.test.tsx` | 新增 | 品項表 |
| `src/components/organizer/content/ImageManager.tsx`、`ImageManager.test.tsx` | 新增 | 圖片縮圖格、多選依序上傳、個別錯誤、示範模式的圖片網址 |
| `src/components/organizer/content/ContentPreview.tsx`、`ContentPreview.test.tsx` | 新增 | 住戶頁預覽（手機／電腦） |
| `src/components/organizer/content/ContentTopBar.tsx`、`ContentSectionNav.tsx`、`PublishChecklist.tsx`、`contentChrome.test.tsx` | 新增 | 上方固定列、跳段標籤、發布前檢查 |
| `src/components/organizer/content/content.css` | 新增 | 內容設定所有樣式 |
| `src/AdminApp.tsx`、`src/AdminApp.test.tsx` | 改寫 | 保留邏輯，畫面改用新元件 |
| `src/AdminApp.css` | 改寫 | 只留仍被使用的 `.admin-shell`、`.admin-eyebrow`，改用 token |
| `src/LocalLiveApps.tsx`、`src/LocalLiveApps.test.tsx` | 修改 | 傳入住戶頁連結；更新文字查找 |
| `src/RuntimeApp.tsx` | 修改 | Demo 傳入住戶頁連結 |
| `docs/AI_AGENT_HANDOFF.md`、`README.md` | 修改 | 內容設定說明 |

---

### Task 0: 改版前基準截圖

**Files:** 無程式變更。

- [ ] **Step 1: 確認 Demo 在執行**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
```

Expected: `200`。若不是，背景執行 `npm run dev -- --port 5173 --strictPort` 後再確認。

- [ ] **Step 2: 截圖**

```bash
node scripts/capture-pages.mjs .superpowers/qa/phase-5/before
```

Expected：
- 24 張（8 頁 × 3 寬度）與 `report.json`；
- 每頁 `scrollWidth` 不超過寬度。

內容設定頁是 `admin-editor-*`。截圖不 commit。

---

### Task 1: 內容設定的純函式

**Files:**
- Create: `src/components/organizer/content/contentChecks.ts`
- Create: `src/components/organizer/content/contentChecks.test.ts`

**Interfaces:**
- Consumes：
  - `CampaignItem`（`src/services/demoCampaignStore.ts`：`{ code, name, unitPrice?, active, discountEligible? }`）
  - `itemLabel(index)`（`src/domain/itemLabel.ts`）
  - `formatZhTwTimestamp(value)`（`src/domain/timestamp.ts`，格式 `YYYY/MM/DD HH:mm`，台灣時間）
- Produces（後續 Task 使用）：
  - `type ContentSectionId = 'announcement' | 'items' | 'schedule' | 'advanced'`
  - `CONTENT_SECTIONS: Array<{ id: ContentSectionId; label: string; anchor: string }>`
  - `type ContentReadiness = { title; announcement; items; itemPricesValid; thresholdValid; scheduleValid; discountRulesValid }`
  - `publishBlockers(input: ContentReadiness): string[]`
  - `sectionCompletion(input: ContentReadiness): Record<ContentSectionId, boolean>`
  - `type SaveState = { tone: 'idle' | 'saving' | 'warning' | 'error'; text: string }`
  - `describeSaveState(input: { pending; saving; failedMessage: string | null; canSave; lastSavedAt: Date | null }): SaveState`
  - `type PublicationStatus = 'unpublished' | 'outdated' | 'current'`
  - `publicationStatus(openedAt: string | null, publicationState: 'draft' | 'published'): PublicationStatus`
  - `PUBLICATION_TEXT: Record<PublicationStatus, string>`
  - `publishBlockReason(input: { blockers: string[]; uploading: boolean; savePending: boolean }): string | null`
  - `MAX_CAMPAIGN_IMAGES = 10`
  - `splitImageUploads<T>(files: T[], currentCount: number, max?: number): { accepted: T[]; skipped: T[] }`
  - `nextItemCode(items: CampaignItem[]): string`
  - `appendItem(items: CampaignItem[], code: string): CampaignItem[]`
  - `applyPriceToAll(items: CampaignItem[], price: number): CampaignItem[]`

- [ ] **Step 1: 寫失敗測試**

`src/components/organizer/content/contentChecks.test.ts`：

```ts
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

  it('does not require an announcement or images', () => {
    expect(publishBlockers({ ...ready, announcement: '' })).toEqual([])
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
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/components/organizer/content/contentChecks.test.ts`
Expected: FAIL（`Cannot find module './contentChecks'`）。

- [ ] **Step 3: 實作 `src/components/organizer/content/contentChecks.ts`**

```ts
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
```

- [ ] **Step 4: 確認通過**

Run: `npx vitest run src/components/organizer/content/contentChecks.test.ts` → PASS。
Run: `npx tsc -b`、`npm run lint` → 無錯誤、無警告。

- [ ] **Step 5: Commit**

```bash
git add src/components/organizer/content/contentChecks.ts src/components/organizer/content/contentChecks.test.ts
git commit -m "feat: add content editor checks for publishing, sections and saving"
```

---

### Task 2: 圖片展示可以不開放大圖

**Files:**
- Modify: `src/components/ui/ImageGallery.tsx`
- Modify: `src/components/ui/ImageGallery.test.tsx`

**Interfaces:**
- Produces：`ImageGallery({ images, onOpen? })`。
  - 沒有 `onOpen` 時，大圖是一般區塊，不是按鈕，也沒有「放大」字樣。
  - 縮圖切換照舊。
  - 住戶端既有用法（有 `onOpen`）不變。

- [ ] **Step 1: 寫失敗測試**

在 `src/components/ui/ImageGallery.test.tsx` 的 `describe` 內新增（檔案頂端已 import `render`、`screen`、`userEvent`；若缺哪個就補上）：

```tsx
  it('shows the main image without a zoom button when it cannot be opened', async () => {
    const user = userEvent.setup()
    render(<ImageGallery images={[
      { src: '/one.jpg', alt: '第一張' },
      { src: '/two.jpg', alt: '第二張' },
    ]} />)

    expect(screen.queryByRole('button', { name: /放大檢視/ })).not.toBeInTheDocument()
    expect(screen.queryByText('放大')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: '第一張' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '顯示第 2 張圖片' }))
    expect(screen.getByRole('img', { name: '第二張' })).toBeInTheDocument()
  })
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/components/ui/ImageGallery.test.tsx`
Expected: FAIL（找到「放大檢視」按鈕，或 TypeScript 報 `onOpen` 必填）。

- [ ] **Step 3: 實作**

`src/components/ui/ImageGallery.tsx`：

1. props 型別改為 `onOpen?: (index: number) => void`。
2. 把大圖區塊（目前 `failedSources.has(image.src) ? (…) : (<button …>…</button>)` 的按鈕分支）換成：

```tsx
      ) : onOpen ? (
        <button
          type="button"
          className="ui-gallery-main"
          aria-label={`放大檢視 第 ${index + 1} 張圖片：${image.alt}`}
          onClick={() => onOpen(index)}
        >
          {mainImage}
          <span className="ui-gallery-zoom" aria-hidden="true">放大</span>
        </button>
      ) : (
        <div className="ui-gallery-main">{mainImage}</div>
      )}
```

3. 在 `const image = images[index]` 之後定義 `mainImage`（原本按鈕內的背景與圖片，一字不改搬過來）：

```tsx
  const mainImage = (
    <>
      <span
        className="ui-gallery-backdrop"
        aria-hidden="true"
        style={{ backgroundImage: `url(${JSON.stringify(image.src)})` }}
      />
      <img
        className="ui-gallery-image"
        src={image.src}
        alt={image.alt}
        onError={() => setFailedSources((current) => new Set(current).add(image.src))}
      />
    </>
  )
```

`src/components/ui/ui.css` 第 151 行的 `.ui-gallery-main` 帶有 `cursor: zoom-in`。不能放大的大圖不該顯示放大游標，所以在該行之後加一行：

```css
div.ui-gallery-main { cursor: default; }
```

- [ ] **Step 4: 確認通過**

Run: `npx vitest run src/components/ui src/components/resident` → PASS（住戶端用法不受影響）。
Run: `npx tsc -b`、`npm run lint` → 無錯誤、無警告。

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/ImageGallery.tsx src/components/ui/ImageGallery.test.tsx src/components/ui/ui.css
git commit -m "feat: let the image gallery show images without opening the viewer"
```

---

### Task 3: 品項表

**Files:**
- Create: `src/components/organizer/content/ItemTable.tsx`
- Create: `src/components/organizer/content/ItemTable.test.tsx`
- Create: `src/components/organizer/content/content.css`

**Interfaces:**
- Consumes：
  - Task 1：`appendItem`、`applyPriceToAll`、`nextItemCode`
  - `itemLabel`、`MAX_CAMPAIGN_ITEMS`（= 100，`src/domain/itemLabel.ts`）
  - `Button`
- Produces（Task 7 使用）：`<ItemTable items locked disabled mixMatchEnabled onChange />`
  - `onChange(nextItems)` 回傳整份新陣列；由呼叫端負責存起來並標記草稿。
  - 控制項名稱：
    - 名稱欄 `品項 X 商品名稱（口味）`
    - 單價欄 `品項 X 單價`
    - 任選勾選 `品項 X 加入任選優惠`
    - 統一單價輸入 `統一單價`＋按鈕「全部套用」
    - 按鈕「增加品項」「減少品項」

**行為：**
- **Enter 新增一列：** 只有在最後一列的單價按 Enter 才新增一列。新列名稱空白、單價沿用最後一列，並聚焦新列名稱。以下情況不新增：
  - 輸入法選字中；
  - 已鎖定；
  - 停用中；
  - 已有 100 個品項。
- **「全部套用」**把統一單價寫進每個品項。
- **刪除：**「減少品項」只刪最後一列，至少保留一列。
- **「參加任選」欄：**只在任選優惠開啟時顯示。停用的品項不能勾。
- **鎖定（已開團）：**所有欄位停用；統一單價、增加、減少都不顯示。

- [ ] **Step 1: 寫失敗測試**

`src/components/organizer/content/ItemTable.test.tsx`：

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { CampaignItem } from '../../../services/demoCampaignStore'
import { ItemTable } from './ItemTable'

const baseItems: CampaignItem[] = [
  { code: 'ITEM1', name: '牛奶', unitPrice: 45, active: true },
  { code: 'ITEM2', name: '花生', unitPrice: 50, active: true },
]

function Harness({ initial = baseItems, locked = false, mixMatchEnabled = false, onChange = vi.fn() }: {
  initial?: CampaignItem[]
  locked?: boolean
  mixMatchEnabled?: boolean
  onChange?: (items: CampaignItem[]) => void
}) {
  const [items, setItems] = useState(initial)
  return (
    <ItemTable
      items={items}
      locked={locked}
      disabled={false}
      mixMatchEnabled={mixMatchEnabled}
      onChange={(next) => { onChange(next); setItems(next) }}
    />
  )
}

describe('ItemTable', () => {
  it('adds one row from Enter in the last price, inheriting that price, and focuses its name', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await user.click(screen.getByRole('spinbutton', { name: '品項 B 單價' }))
    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('rowheader', { name: 'C' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: '品項 C 單價' })).toHaveValue(50)
    const name = screen.getByRole('textbox', { name: '品項 C 商品名稱（口味）' })
    expect(name).toHaveValue('')
    expect(name).toHaveFocus()
  })

  it('does not add a row from Enter on another row or while an input method is composing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await user.click(screen.getByRole('spinbutton', { name: '品項 A 單價' }))
    await user.keyboard('{Enter}')
    fireEvent.keyDown(screen.getByRole('spinbutton', { name: '品項 B 單價' }), { key: 'Enter', isComposing: true })

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('rowheader', { name: 'C' })).not.toBeInTheDocument()
  })

  it('stops adding rows at the item limit', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const full = Array.from({ length: 100 }, (_, index) => ({
      code: `ITEM${index + 1}`, name: `口味${index + 1}`, unitPrice: 10, active: true,
    }))
    render(<Harness initial={full} onChange={onChange} />)

    expect(screen.getByRole('button', { name: '增加品項' })).toBeDisabled()
    await user.click(screen.getByRole('spinbutton', { name: '品項 CV 單價' }))
    await user.keyboard('{Enter}')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('adds a row from the button too', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: '增加品項' }))

    expect(screen.getByRole('textbox', { name: '品項 C 商品名稱（口味）' })).toHaveFocus()
  })

  it('applies one price to every item', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    expect(screen.getByRole('button', { name: '全部套用' })).toBeDisabled()
    await user.type(screen.getByRole('spinbutton', { name: '統一單價' }), '60')
    await user.click(screen.getByRole('button', { name: '全部套用' }))

    expect(screen.getByRole('spinbutton', { name: '品項 A 單價' })).toHaveValue(60)
    expect(screen.getByRole('spinbutton', { name: '品項 B 單價' })).toHaveValue(60)
  })

  it('removes only the last item and always keeps one', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: '減少品項' }))

    expect(screen.queryByRole('rowheader', { name: 'B' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '品項 A 商品名稱（口味）' })).toHaveValue('牛奶')
    expect(screen.getByRole('button', { name: '減少品項' })).toBeDisabled()
  })

  it('offers the mix-and-match column only when that discount is on, and not for inactive items', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const items: CampaignItem[] = [...baseItems, { code: 'ITEM3', name: '舊口味', unitPrice: 40, active: false }]
    const { rerender } = render(<ItemTable items={items} locked={false} disabled={false} mixMatchEnabled={false} onChange={onChange} />)
    expect(screen.queryByRole('columnheader', { name: '參加任選' })).not.toBeInTheDocument()

    rerender(<ItemTable items={items} locked={false} disabled={false} mixMatchEnabled onChange={onChange} />)
    expect(screen.getByRole('columnheader', { name: '參加任選' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '品項 C 加入任選優惠' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: '品項 A 加入任選優惠' }))
    expect(onChange).toHaveBeenCalledWith([{ ...baseItems[0], discountEligible: true }, baseItems[1], items[2]])
  })

  it('locks every field and hides the editing controls once the campaign has opened', () => {
    const onChange = vi.fn()
    render(<Harness locked mixMatchEnabled onChange={onChange} />)

    expect(screen.getByRole('textbox', { name: '品項 A 商品名稱（口味）' })).toBeDisabled()
    expect(screen.getByRole('spinbutton', { name: '品項 B 單價' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: '品項 A 加入任選優惠' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '增加品項' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '減少品項' })).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: '統一單價' })).not.toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('spinbutton', { name: '品項 B 單價' }), { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/components/organizer/content/ItemTable.test.tsx`
Expected: FAIL（`Cannot find module './ItemTable'`）。

- [ ] **Step 3: 實作 `src/components/organizer/content/ItemTable.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import { itemLabel, MAX_CAMPAIGN_ITEMS } from '../../../domain/itemLabel'
import type { CampaignItem } from '../../../services/demoCampaignStore'
import { Button } from '../../ui/Button'
import { appendItem, applyPriceToAll, nextItemCode } from './contentChecks'

const PRICE_PATTERN = /^\d+(?:\.\d{0,2})?$/
const MAX_PRICE = 9999999.99

type ItemTableProps = {
  items: CampaignItem[]
  locked: boolean
  disabled: boolean
  mixMatchEnabled: boolean
  onChange: (items: CampaignItem[]) => void
}

export function ItemTable({ items, locked, disabled, mixMatchEnabled, onChange }: ItemTableProps) {
  const [bulkPrice, setBulkPrice] = useState('')
  const nameInputs = useRef<Array<HTMLInputElement | null>>([])
  const focusRowRef = useRef<number | null>(null)
  const editable = !locked && !disabled
  const canAdd = editable && items.length < MAX_CAMPAIGN_ITEMS
  const bulkPriceValid = PRICE_PATTERN.test(bulkPrice) && Number(bulkPrice) <= MAX_PRICE

  // A new row's name field only exists after the parent re-renders with the longer list.
  useEffect(() => {
    if (focusRowRef.current === null) return
    nameInputs.current[focusRowRef.current]?.focus()
    focusRowRef.current = null
  }, [items.length])

  const update = (code: string, patch: Partial<CampaignItem>) => {
    onChange(items.map((item) => item.code === code ? { ...item, ...patch } : item))
  }

  const addItem = () => {
    if (!canAdd) return
    focusRowRef.current = items.length
    onChange(appendItem(items, nextItemCode(items)))
  }

  return (
    <div className="content-items">
      {!locked && (
        <div className="content-item-tools">
          <label className="content-bulk-price">
            <span>統一單價</span>
            <input
              className="ui-input"
              type="number"
              min="0"
              max={MAX_PRICE}
              step="0.01"
              inputMode="decimal"
              value={bulkPrice}
              disabled={disabled}
              onChange={(event) => {
                const value = event.target.value
                if (value === '' || PRICE_PATTERN.test(value)) setBulkPrice(value)
              }}
            />
          </label>
          <Button
            variant="utility"
            size="sm"
            disabled={disabled || !bulkPriceValid}
            onClick={() => onChange(applyPriceToAll(items, Number(bulkPrice)))}
          >
            全部套用
          </Button>
        </div>
      )}
      <div className="organizer-table-wrap">
        <table className="organizer-table content-item-table" aria-label="品項列表">
          <thead>
            <tr>
              <th scope="col">代碼</th>
              <th scope="col">商品名稱（口味）</th>
              <th scope="col">單價</th>
              {mixMatchEnabled && <th scope="col">參加任選</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const label = itemLabel(index)
              const last = index === items.length - 1
              return (
                <tr key={item.code} className={item.active ? undefined : 'is-inactive'}>
                  <th scope="row" className="content-item-code">{label}</th>
                  <td data-label="商品名稱（口味）">
                    <input
                      ref={(element) => { nameInputs.current[index] = element }}
                      className="ui-input"
                      aria-label={`品項 ${label} 商品名稱（口味）`}
                      maxLength={200}
                      placeholder="商品名稱"
                      value={item.name}
                      disabled={!editable}
                      onChange={(event) => update(item.code, { name: event.target.value })}
                    />
                  </td>
                  <td data-label="單價">
                    <input
                      className="ui-input content-item-price"
                      aria-label={`品項 ${label} 單價`}
                      type="number"
                      min="0"
                      max={MAX_PRICE}
                      step="0.01"
                      inputMode="decimal"
                      value={item.unitPrice ?? ''}
                      disabled={!editable}
                      onChange={(event) => {
                        const value = event.target.value
                        if (value !== '' && !PRICE_PATTERN.test(value)) return
                        update(item.code, { unitPrice: value === '' ? undefined : Number(value) })
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
                        event.preventDefault()
                        if (last) addItem()
                      }}
                    />
                  </td>
                  {mixMatchEnabled && (
                    <td data-label="參加任選">
                      <input
                        type="checkbox"
                        className="content-item-mix"
                        aria-label={`品項 ${label} 加入任選優惠`}
                        checked={item.discountEligible ?? false}
                        disabled={!editable || !item.active}
                        onChange={(event) => update(item.code, { discountEligible: event.target.checked })}
                      />
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!locked && (
        <div className="content-item-actions">
          <Button variant="secondary" size="sm" disabled={!canAdd} onClick={addItem}>
            <span aria-hidden="true">＋</span>增加品項
          </Button>
          <Button
            variant="utility"
            size="sm"
            disabled={!editable || items.length <= 1}
            onClick={() => onChange(items.slice(0, -1))}
          >
            <span aria-hidden="true">−</span>減少品項
          </Button>
          <small>在最後一列的單價按 Enter 也能新增品項；只能刪除最後一個品項。</small>
        </div>
      )}
    </div>
  )
}
```

`Button` 的 `children` 若不是字串，`loading` 時才會用預設文字。這裡沒有用 `loading`，按鈕名稱會是「增加品項」「減少品項」（符號是 `aria-hidden`）。

- [ ] **Step 4: 建立 `src/components/organizer/content/content.css`**

這支檔案由 Task 7 在 `AdminApp.tsx` import；之後的 Task 在檔尾追加。

```css
/* Organizer content editor: sections, item table, images, preview, top bar and checklist. */
.content-section { display: grid; gap: var(--space-4); padding: var(--space-5); border: 1px solid var(--color-border); border-radius: var(--radius-surface); background: var(--color-surface); scroll-margin-top: 140px; }
.content-section h3 { margin: 0; font-size: var(--font-size-title); font-weight: var(--font-weight-strong); line-height: var(--line-height-heading); }
.content-section h3:focus { outline: none; }
.content-section h3:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
.content-subheading { margin: var(--space-2) 0 0; font-size: var(--font-size-base); font-weight: var(--font-weight-strong); }
.content-help { margin: 0; color: var(--color-text-secondary); font-size: var(--font-size-dense); }
.content-lock-note { margin: 0; padding: var(--space-2) var(--space-3); border-radius: var(--radius-control); background: var(--color-neutral-subtle); color: var(--color-neutral); font-size: var(--font-size-dense); }

.content-items { display: grid; gap: var(--space-3); }
.content-item-tools { display: flex; flex-wrap: wrap; align-items: end; gap: var(--space-2); }
.content-bulk-price { display: grid; gap: var(--space-1); color: var(--color-text-secondary); font-size: var(--font-size-dense); }
.content-bulk-price .ui-input { width: 140px; }
.content-item-table .content-item-code { width: 56px; font-weight: var(--font-weight-strong); font-variant-numeric: tabular-nums; }
.content-item-table .ui-input { width: 100%; min-width: 0; }
.content-item-table .content-item-price { max-width: 140px; }
.content-item-table tr.is-inactive { color: var(--color-text-tertiary); }
.content-item-mix { width: 24px; height: 24px; margin: 0; accent-color: var(--color-primary); }
.content-item-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.content-item-actions small { color: var(--color-text-secondary); font-size: var(--font-size-caption); }

@media (max-width: 1023px) {
  .content-item-mix { width: 28px; height: 28px; margin: 8px; }
}
```

- [ ] **Step 5: 確認通過**

Run: `npx vitest run src/components/organizer/content` → PASS，沒有 act() 警告。
Run: `npx tsc -b`、`npm run lint` → 無錯誤、無警告。

- [ ] **Step 6: Commit**

```bash
git add src/components/organizer/content/ItemTable.tsx src/components/organizer/content/ItemTable.test.tsx src/components/organizer/content/content.css
git commit -m "feat: add the content editor item table with Enter-to-add and one-price-for-all"
```

---

### Task 4: 圖片管理與多選上傳

**Files:**
- Create: `src/components/organizer/content/ImageManager.tsx`
- Create: `src/components/organizer/content/ImageManager.test.tsx`
- Modify: `src/components/organizer/content/content.css`（檔尾新增）

**Interfaces:**
- Consumes：
  - Task 1：`MAX_CAMPAIGN_IMAGES`、`splitImageUploads`
  - `Button`
  - `CampaignImage`（`{ src, alt }`）
- Produces（Task 7 使用）：`<ImageManager images disabled onUploadImage? onAddImage onRemoveImage onUploadingChange />`
  - 有 `onUploadImage` 時：
    - 顯示「加入圖片」檔案選擇（`multiple`，名稱「加入圖片」）；
    - 選好即依序上傳；
    - 每張成功就呼叫 `onAddImage(url)`。
  - 沒有 `onUploadImage`（本機示範）時，顯示「圖片網址」輸入＋「新增圖片」。
  - `onUploadingChange(true)` 在第一張開始前呼叫，`onUploadingChange(false)` 在全部結束後呼叫。
  - 縮圖是裝飾性圖片（`alt=""`）。移除鈕名稱是「移除 {圖片 alt}」。第一張標「封面」。
  - 縮圖清單名稱為「商品圖片，共 N 張」。

**行為：**
- **名額：**超過剩餘名額的檔案不上傳，以「「檔名」沒有加入：最多 10 張」說明。
- **失敗：**某張失敗時以「「檔名」上傳失敗：原因」列出，其餘照常上傳。錯誤清單是 `role="alert"`。
- **上傳中：**
  - 選擇鈕停用；
  - 顯示「上傳中 i／n…」。
- **全部結束後：**清空選擇，讓同一批檔案可以再選一次。
- **手機相容：**有些手機的檔案選擇器只觸發 `input`、不觸發 `change`；桌機兩個都會觸發。只處理第一個。

- [ ] **Step 1: 寫失敗測試**

`src/components/organizer/content/ImageManager.test.tsx`：

```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { CampaignImage } from '../../../services/demoCampaignStore'
import { ImageManager } from './ImageManager'

const png = (name: string) => new File(['image'], name, { type: 'image/png' })

function Harness({ initial = [], onUploadImage, onUploadingChange = vi.fn() }: {
  initial?: CampaignImage[]
  onUploadImage?: (file: File) => Promise<string>
  onUploadingChange?: (uploading: boolean) => void
}) {
  const [images, setImages] = useState(initial)
  return (
    <ImageManager
      images={images}
      disabled={false}
      onUploadImage={onUploadImage}
      onAddImage={(src) => setImages((current) => [...current, { src, alt: `第 ${current.length + 1} 張商品圖片` }])}
      onRemoveImage={(index) => setImages((current) => current.filter((_, currentIndex) => currentIndex !== index))}
      onUploadingChange={onUploadingChange}
    />
  )
}

const tiles = () => within(screen.getByRole('list', { name: /^商品圖片，共/ })).getAllByRole('listitem')

describe('ImageManager', () => {
  it('uploads every selected image in order and marks the first as the cover', async () => {
    const user = userEvent.setup()
    const onUploadImage = vi.fn(async (file: File) => `https://storage.test/${file.name}`)
    const onUploadingChange = vi.fn()
    render(<Harness onUploadImage={onUploadImage} onUploadingChange={onUploadingChange} />)

    const input = screen.getByLabelText<HTMLInputElement>('加入圖片')
    expect(input).toHaveAttribute('multiple')
    await user.upload(input, [png('a.png'), png('b.png')])

    await waitFor(() => expect(screen.getByRole('list', { name: '商品圖片，共 2 張' })).toBeInTheDocument())
    expect(onUploadImage.mock.calls.map(([file]) => file.name)).toEqual(['a.png', 'b.png'])
    expect(within(tiles()[0]).getByText('封面')).toBeInTheDocument()
    expect(within(tiles()[1]).queryByText('封面')).not.toBeInTheDocument()
    await waitFor(() => expect(onUploadingChange.mock.calls).toEqual([[true], [false]]))
    expect(input.files).toHaveLength(0)
  })

  it('keeps the images that uploaded and names the one that failed', async () => {
    const user = userEvent.setup()
    const onUploadImage = vi.fn(async (file: File) => {
      if (file.name === 'big.png') throw new Error('圖片不可超過 5 MB')
      return `https://storage.test/${file.name}`
    })
    render(<Harness onUploadImage={onUploadImage} />)

    await user.upload(screen.getByLabelText('加入圖片'), [png('a.png'), png('big.png'), png('c.png')])

    expect(await screen.findByRole('alert')).toHaveTextContent('「big.png」上傳失敗：圖片不可超過 5 MB')
    await waitFor(() => expect(screen.getByRole('list', { name: '商品圖片，共 2 張' })).toBeInTheDocument())
    expect(onUploadImage).toHaveBeenCalledTimes(3)
  })

  it('uploads only as many images as there is room for and names the rest', async () => {
    const user = userEvent.setup()
    const onUploadImage = vi.fn(async (file: File) => `https://storage.test/${file.name}`)
    const nine = Array.from({ length: 9 }, (_, index) => ({ src: `/${index}.png`, alt: `第 ${index + 1} 張商品圖片` }))
    render(<Harness initial={nine} onUploadImage={onUploadImage} />)

    await user.upload(screen.getByLabelText('加入圖片'), [png('x.png'), png('y.png'), png('z.png')])

    await waitFor(() => expect(screen.getByRole('list', { name: '商品圖片，共 10 張' })).toBeInTheDocument())
    expect(onUploadImage).toHaveBeenCalledTimes(1)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('「y.png」沒有加入：最多 10 張')
    expect(alert).toHaveTextContent('「z.png」沒有加入：最多 10 張')
    await waitFor(() => expect(screen.getByLabelText('加入圖片')).toBeDisabled())
  })

  it('locks the picker and shows progress while uploading', async () => {
    const user = userEvent.setup()
    let finish!: (url: string) => void
    const onUploadImage = vi.fn(() => new Promise<string>((resolve) => { finish = resolve }))
    render(<Harness onUploadImage={onUploadImage} />)

    await user.upload(screen.getByLabelText('加入圖片'), png('a.png'))
    expect(screen.getByLabelText('加入圖片')).toBeDisabled()
    expect(screen.getByText('上傳中 1／1…')).toBeInTheDocument()

    finish('https://storage.test/a.png')
    await waitFor(() => expect(screen.getByLabelText('加入圖片')).toBeEnabled())
    expect(screen.queryByText(/上傳中/)).not.toBeInTheDocument()
  })

  it('handles a mobile picker that only fires input', async () => {
    const onUploadImage = vi.fn(async () => 'https://storage.test/phone.png')
    render(<Harness onUploadImage={onUploadImage} />)

    fireEvent.input(screen.getByLabelText('加入圖片'), { target: { files: [png('Samsung照片.png')] } })

    await waitFor(() => expect(screen.getByRole('list', { name: '商品圖片，共 1 張' })).toBeInTheDocument())
    expect(onUploadImage).toHaveBeenCalledTimes(1)
  })

  it('removes an image by its label', async () => {
    const user = userEvent.setup()
    render(<Harness initial={[{ src: '/a.png', alt: '第 1 張商品圖片' }, { src: '/b.png', alt: '第 2 張商品圖片' }]} onUploadImage={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '移除 第 2 張商品圖片' }))

    expect(screen.getByRole('list', { name: '商品圖片，共 1 張' })).toBeInTheDocument()
  })

  it('adds images by address in the local demo', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    expect(screen.queryByLabelText('加入圖片')).not.toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: '圖片網址' }), '/second.svg')
    await user.click(screen.getByRole('button', { name: '新增圖片' }))

    expect(screen.getByRole('list', { name: '商品圖片，共 1 張' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '圖片網址' })).toHaveValue('')
  })
})
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/components/organizer/content/ImageManager.test.tsx`
Expected: FAIL（`Cannot find module './ImageManager'`）。

- [ ] **Step 3: 實作 `src/components/organizer/content/ImageManager.tsx`**

```tsx
import { useRef, useState } from 'react'
import type { CampaignImage } from '../../../services/demoCampaignStore'
import { Button } from '../../ui/Button'
import { MAX_CAMPAIGN_IMAGES, splitImageUploads } from './contentChecks'

type ImageManagerProps = {
  images: CampaignImage[]
  disabled: boolean
  onUploadImage?: (file: File) => Promise<string>
  onAddImage: (src: string) => void
  onRemoveImage: (index: number) => void
  onUploadingChange: (uploading: boolean) => void
}

const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error)

export function ImageManager({ images, disabled, onUploadImage, onAddImage, onRemoveImage, onUploadingChange }: ImageManagerProps) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [imageUrl, setImageUrl] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  // Desktop pickers fire `input` then `change`; some phones fire only `input`. The first one wins.
  const uploadingRef = useRef(false)
  const uploading = progress !== null
  const full = images.length >= MAX_CAMPAIGN_IMAGES

  const clearPicker = () => {
    if (inputRef.current) inputRef.current.value = ''
  }

  const uploadFiles = async (files: File[]) => {
    if (!onUploadImage || uploadingRef.current || files.length === 0) return
    const { accepted, skipped } = splitImageUploads(files, images.length)
    const problems = skipped.map((file) => `「${file.name}」沒有加入：最多 ${MAX_CAMPAIGN_IMAGES} 張`)
    setErrors(problems)
    if (accepted.length === 0) {
      clearPicker()
      return
    }
    uploadingRef.current = true
    onUploadingChange(true)
    setProgress({ done: 0, total: accepted.length })
    try {
      for (const [index, file] of accepted.entries()) {
        try {
          onAddImage(await onUploadImage(file))
        } catch (error) {
          problems.push(`「${file.name}」上傳失敗：${messageOf(error)}`)
          setErrors([...problems])
        }
        setProgress({ done: index + 1, total: accepted.length })
      }
    } finally {
      uploadingRef.current = false
      setProgress(null)
      onUploadingChange(false)
      clearPicker()
    }
  }

  const pickerDisabled = disabled || uploading || full

  return (
    <div className="content-images">
      {images.length > 0 ? (
        <ul className="content-image-grid" aria-label={`商品圖片，共 ${images.length} 張`}>
          {images.map((image, index) => (
            <li key={`${image.src}-${index}`} className="content-image-tile">
              <img src={image.src} alt="" loading="lazy" />
              {index === 0 && <span className="content-image-cover">封面</span>}
              <Button
                variant="utility"
                size="sm"
                className="content-image-remove"
                aria-label={`移除 ${image.alt}`}
                disabled={disabled || uploading}
                onClick={() => onRemoveImage(index)}
              >
                移除
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="content-help">還沒有圖片。第一張會當作封面。</p>
      )}
      <div className="content-image-add">
        {onUploadImage ? (
          <label
            className="ui-button content-image-picker"
            data-variant="secondary"
            data-size="sm"
            data-disabled={pickerDisabled || undefined}
          >
            <input
              ref={inputRef}
              className="ui-visually-hidden"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              aria-label="加入圖片"
              disabled={pickerDisabled}
              onInput={(event) => { void uploadFiles(Array.from(event.currentTarget.files ?? [])) }}
              onChange={(event) => { void uploadFiles(Array.from(event.target.files ?? [])) }}
            />
            <span aria-hidden="true">＋ 加入圖片</span>
          </label>
        ) : (
          <>
            <label className="content-image-url">
              <span>圖片網址</span>
              <input
                className="ui-input"
                value={imageUrl}
                placeholder="https://…"
                disabled={disabled || full}
                onChange={(event) => setImageUrl(event.target.value)}
              />
            </label>
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled || full || !imageUrl.trim()}
              onClick={() => {
                onAddImage(imageUrl.trim())
                setImageUrl('')
              }}
            >
              新增圖片
            </Button>
          </>
        )}
        <span className="content-image-count">{images.length} / {MAX_CAMPAIGN_IMAGES} 張</span>
      </div>
      <p className="content-help">
        {onUploadImage ? '可一次選多張，會依序上傳；支援 JPG、PNG、WebP，每張 5 MB 以內。' : '本機示範以圖片網址加入。'}
      </p>
      <p className="content-image-progress" aria-live="polite">
        {progress ? `上傳中 ${Math.min(progress.done + 1, progress.total)}／${progress.total}…` : ''}
      </p>
      {errors.length > 0 && (
        <ul className="content-image-errors" role="alert">
          {errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}
        </ul>
      )}
    </div>
  )
}
```

說明：
- 可見文字「＋ 加入圖片」設為 `aria-hidden`，名稱由 `input` 的 `aria-label` 提供，避免讀兩次。
- `uploadingRef` 在第一個 `await` 之前就設為 `true`，所以緊接著觸發的 `change` 會被略過。

- [ ] **Step 4: 在 `content.css` 檔尾加入**

```css
.content-images { display: grid; gap: var(--space-3); }
.content-image-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
.content-image-tile { position: relative; aspect-ratio: 1; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-control); background: var(--color-surface-subtle); }
.content-image-tile img { display: block; width: 100%; height: 100%; object-fit: cover; }
.content-image-cover { position: absolute; bottom: var(--space-1); left: var(--space-1); padding: 2px var(--space-2); border-radius: 999px; background: var(--color-surface); color: var(--color-text); font-size: var(--font-size-caption); font-weight: var(--font-weight-strong); }
.content-image-remove { position: absolute; top: var(--space-1); right: var(--space-1); }
.content-image-add { display: flex; flex-wrap: wrap; align-items: end; gap: var(--space-2); }
.content-image-picker { cursor: pointer; }
.content-image-picker:focus-within { outline: 2px solid var(--color-focus); outline-offset: 2px; }
.content-image-picker[data-disabled] { background: var(--color-disabled-bg); border-color: var(--color-border); color: var(--color-disabled-text); cursor: not-allowed; }
.content-image-url { display: grid; flex: 1 1 240px; gap: var(--space-1); color: var(--color-text-secondary); font-size: var(--font-size-dense); }
.content-image-count { margin-left: auto; color: var(--color-text-secondary); font-size: var(--font-size-dense); font-variant-numeric: tabular-nums; }
.content-image-progress { min-height: 1.4em; margin: 0; color: var(--color-text-secondary); font-size: var(--font-size-dense); }
.content-image-errors { display: grid; gap: var(--space-1); margin: 0; padding: var(--space-2) var(--space-3); border-radius: var(--radius-control); background: var(--color-danger-subtle); color: var(--color-danger); font-size: var(--font-size-dense); list-style: none; }
```

- [ ] **Step 5: 確認通過**

Run: `npx vitest run src/components/organizer/content` → PASS，沒有 act() 警告。
Run: `npx tsc -b`、`npm run lint` → 無錯誤、無警告。

若 `user.upload` 在 `accept` 屬性下拒絕 PNG：
- 確認測試檔 `type` 是 `image/png`；
- 不要移除 `accept`；
- 寫進回報。

- [ ] **Step 6: Commit**

```bash
git add src/components/organizer/content/ImageManager.tsx src/components/organizer/content/ImageManager.test.tsx src/components/organizer/content/content.css
git commit -m "feat: upload several campaign images at once with per-file errors"
```

---

### Task 5: 住戶頁預覽（手機／電腦）

**Files:**
- Create: `src/components/organizer/content/ContentPreview.tsx`
- Create: `src/components/organizer/content/ContentPreview.test.tsx`
- Modify: `src/components/organizer/content/content.css`（檔尾新增）

**Interfaces:**
- Consumes：
  - Task 2：`ImageGallery`（不傳 `onOpen`）
  - `SegmentedControl`、`StatusBadge`
  - `LinkifiedText`（`src/components/LinkifiedText.tsx`，default export）
  - `campaignStatusLabel`
  - `formatArrivalLabel`、`formatAutoCloseReminder`
  - `itemLabel`
- Produces（Task 7 使用）：`<ContentPreview status? title priceText arrivalLabel autoCloseAt thresholdText allowCustomItems images announcement items />`
  - 外層是 `aria-label="住戶端預覽"` 的區塊（既有測試用這個名稱找）。
  - 圖片區是 `role="region"`、`tabIndex={0}`，名稱「住戶端圖片預覽，共 N 張」。
  - 公告可「展開完整預覽／收合完整預覽」（`aria-expanded`）。
  - 品項清單名稱「品項預覽」，只列啟用中的品項，代碼依原本位置。
  - 「預覽裝置」切換「手機」「電腦」：
    - 手機：寬度最多 390px，可操作；
    - 電腦：以 1024px 寬排版後等比例縮到欄寬，並設 `inert`（不可操作、不進入 Tab 順序）。
  - 預覽裡沒有 `h1`，團名不是標題（不打亂團主頁的標題層級）。

- [ ] **Step 1: 寫失敗測試**

`src/components/organizer/content/ContentPreview.test.tsx`：

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ContentPreview } from './ContentPreview'

const props = {
  status: 'open' as const,
  title: '冰餅團',
  priceText: '$45～$50',
  arrivalLabel: '03/08',
  autoCloseAt: '2027-10-15T04:00:00.000Z',
  thresholdText: '結單：100 個成團',
  allowCustomItems: true,
  images: [{ src: '/a.png', alt: '冰餅照' }],
  announcement: '第一行\n第二行',
  items: [
    { code: 'ITEM1', name: '牛奶', unitPrice: 45, active: true },
    { code: 'ITEM2', name: '', unitPrice: 50, active: true },
    { code: 'ITEM3', name: '舊口味', unitPrice: 40, active: false },
  ],
}

describe('ContentPreview', () => {
  it('shows what residents will see without adding page headings', () => {
    render(<ContentPreview {...props} />)
    const preview = screen.getByRole('region', { name: '住戶端預覽' })

    expect(within(preview).getByText('開團中')).toBeInTheDocument()
    expect(within(preview).getByText('冰餅團')).toBeInTheDocument()
    expect(within(preview).getByText('$45～$50')).toBeInTheDocument()
    expect(within(preview).getByText('預計到貨：03/08')).toBeInTheDocument()
    expect(within(preview).getByText('10/15 12:00 自動結單')).toBeInTheDocument()
    expect(within(preview).getByText('結單：100 個成團')).toBeInTheDocument()
    expect(within(preview).getByText('可新增自訂額外品項，金額由團主另計')).toBeInTheDocument()
    expect(within(preview).getByRole('region', { name: '住戶端圖片預覽，共 1 張' })).toHaveAttribute('tabindex', '0')
    expect(within(preview).getByRole('img', { name: '冰餅照' })).toBeInTheDocument()
    expect(within(preview).queryByRole('button', { name: /放大檢視/ })).not.toBeInTheDocument()
    expect(within(preview).queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    const itemList = within(preview).getByRole('list', { name: '品項預覽' })
    expect(within(itemList).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['A牛奶$45', 'B未命名品項$50'])
  })

  it('names an untitled campaign and shows a closed or legacy arrived campaign as closed', () => {
    render(<ContentPreview {...props} title=" " status="arrived" />)
    const preview = screen.getByRole('region', { name: '住戶端預覽' })

    expect(within(preview).getByText('未命名團購')).toBeInTheDocument()
    expect(within(preview).getByText('已結單')).toBeInTheDocument()
    expect(within(preview).queryByText('開團中')).not.toBeInTheDocument()
  })

  it('expands and collapses the announcement', async () => {
    const user = userEvent.setup()
    render(<ContentPreview {...props} />)

    const expand = screen.getByRole('button', { name: '展開完整預覽' })
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    await user.click(expand)
    expect(screen.getByRole('button', { name: '收合完整預覽' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('switches between the phone and the desktop layout, and the scaled desktop view is not interactive', async () => {
    const user = userEvent.setup()
    const { container } = render(<ContentPreview {...props} />)
    const frame = () => container.querySelector('.content-preview-frame')

    expect(screen.getByRole('radio', { name: '手機' })).toBeChecked()
    expect(frame()).toHaveAttribute('data-device', 'phone')
    expect(frame()).not.toHaveAttribute('inert')

    await user.click(screen.getByRole('radio', { name: '電腦' }))
    expect(frame()).toHaveAttribute('data-device', 'desktop')
    expect(frame()).toHaveAttribute('inert')
  })
})
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/components/organizer/content/ContentPreview.test.tsx`
Expected: FAIL（`Cannot find module './ContentPreview'`）。

- [ ] **Step 3: 實作 `src/components/organizer/content/ContentPreview.tsx`**

```tsx
import { useLayoutEffect, useRef, useState } from 'react'
import LinkifiedText from '../../LinkifiedText'
import { formatArrivalLabel, formatAutoCloseReminder } from '../../../domain/campaignSchedule'
import { itemLabel } from '../../../domain/itemLabel'
import { campaignStatusLabel, type CampaignStatus } from '../../../domain/orderWorkflow'
import type { CampaignImage, CampaignItem } from '../../../services/demoCampaignStore'
import { ImageGallery } from '../../ui/ImageGallery'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { StatusBadge } from '../../ui/StatusBadge'

type PreviewDevice = 'phone' | 'desktop'
const DESKTOP_WIDTH = 1024

type ContentPreviewProps = {
  status?: CampaignStatus
  title: string
  priceText: string
  arrivalLabel: string
  autoCloseAt: string | null
  thresholdText: string
  allowCustomItems: boolean
  images: CampaignImage[]
  announcement: string
  items: CampaignItem[]
}

export function ContentPreview({
  status = 'open', title, priceText, arrivalLabel, autoCloseAt, thresholdText, allowCustomItems, images, announcement, items,
}: ContentPreviewProps) {
  const [device, setDevice] = useState<PreviewDevice>('phone')
  const [expanded, setExpanded] = useState(false)
  const [fit, setFit] = useState<{ scale: number; height: number } | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const desktop = device === 'desktop'

  // The desktop layout is drawn at its real width and scaled down to fit the column.
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const frame = frameRef.current
    if (!desktop || !viewport || !frame || typeof ResizeObserver === 'undefined') {
      setFit(null)
      return
    }
    const update = () => {
      const scale = Math.min(1, viewport.clientWidth / DESKTOP_WIDTH)
      setFit({ scale, height: frame.offsetHeight * scale })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(viewport)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [desktop])

  return (
    <section className="content-preview" aria-label="住戶端預覽">
      <div className="content-preview-bar">
        <h3>住戶頁預覽</h3>
        <SegmentedControl
          label="預覽裝置"
          value={device}
          onChange={setDevice}
          options={[{ value: 'phone', label: '手機' }, { value: 'desktop', label: '電腦' }]}
        />
      </div>
      <div className="content-preview-viewport" ref={viewportRef} style={fit ? { height: fit.height } : undefined}>
        <div
          ref={frameRef}
          className="content-preview-frame"
          data-device={device}
          inert={desktop || undefined}
          style={desktop ? { width: DESKTOP_WIDTH, transform: fit ? `scale(${fit.scale})` : undefined } : undefined}
        >
          <div className="content-preview-page">
            <div className="content-preview-card content-preview-summary">
              <StatusBadge tone={status === 'open' ? 'success' : 'neutral'}>{campaignStatusLabel(status)}</StatusBadge>
              <p className="content-preview-title">{title.trim() || '未命名團購'}</p>
              <p className="content-preview-price">{priceText}</p>
              <div className="content-preview-facts">
                <p>{formatArrivalLabel(arrivalLabel)}</p>
                {autoCloseAt && <p>{formatAutoCloseReminder(autoCloseAt)}</p>}
                <p>{thresholdText}</p>
                {allowCustomItems && <p>可新增自訂額外品項，金額由團主另計</p>}
              </div>
            </div>
            <div className="content-preview-card content-preview-info">
              <div role="region" tabIndex={0} aria-label={`住戶端圖片預覽，共 ${images.length} 張`}>
                <ImageGallery images={images} />
              </div>
              <p id="content-preview-announcement" className={`content-preview-copy ${expanded ? 'is-expanded' : 'is-collapsed'}`}>
                <LinkifiedText text={announcement} />
              </p>
              <button
                type="button"
                className="content-preview-toggle"
                aria-expanded={expanded}
                aria-controls="content-preview-announcement"
                onClick={() => setExpanded((current) => !current)}
              >
                {expanded ? '收合完整預覽' : '展開完整預覽'}
              </button>
            </div>
            <ul className="content-preview-card content-preview-items" aria-label="品項預覽">
              {items.map((item, index) => item.active ? (
                <li key={item.code}>
                  <span className="content-preview-code">{itemLabel(index)}</span>
                  <span>{item.name.trim() || '未命名品項'}</span>
                  <span>{item.unitPrice === undefined ? '未定價' : `$${item.unitPrice}`}</span>
                </li>
              ) : null)}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: 在 `content.css` 檔尾加入**

```css
.content-preview { display: grid; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-surface); background: var(--color-surface); }
.content-preview-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); }
.content-preview-bar h3 { margin: 0; font-size: var(--font-size-base); font-weight: var(--font-weight-strong); }
.content-preview-viewport { overflow: hidden; border-radius: var(--radius-control); background: var(--color-bg); }
.content-preview-frame { transform-origin: top left; }
.content-preview-frame[data-device="phone"] { max-width: 390px; margin: 0 auto; }
.content-preview-page { display: grid; gap: var(--space-3); padding: var(--space-3); }
.content-preview-frame[data-device="desktop"] .content-preview-page { grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); align-items: start; padding: var(--space-6); }
.content-preview-frame[data-device="desktop"] .content-preview-info { grid-row: 1 / span 2; grid-column: 1; }
.content-preview-card { margin: 0; padding: var(--space-4); border-radius: var(--radius-surface); background: var(--color-surface); }
.content-preview-title { margin: var(--space-2) 0 var(--space-1); font-size: var(--font-size-title); font-weight: var(--font-weight-strong); line-height: var(--line-height-heading); overflow-wrap: anywhere; }
.content-preview-price { margin: 0; font-weight: var(--font-weight-strong); }
.content-preview-facts { display: grid; gap: 2px; margin-top: var(--space-2); color: var(--color-text-secondary); font-size: var(--font-size-dense); }
.content-preview-facts p { margin: 0; }
.content-preview-copy { margin: var(--space-3) 0 var(--space-2); white-space: pre-wrap; overflow-wrap: anywhere; }
.content-preview-copy.is-collapsed { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 6; }
.content-preview-toggle { min-height: 24px; padding: 0; border: 0; background: transparent; color: var(--color-primary); font: inherit; font-size: var(--font-size-dense); cursor: pointer; }
.content-preview-items { display: grid; gap: var(--space-2); list-style: none; }
.content-preview-items li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: var(--space-2); align-items: baseline; }
.content-preview-code { font-weight: var(--font-weight-strong); font-variant-numeric: tabular-nums; }

@media (max-width: 1023px) {
  .content-preview-toggle { min-height: var(--touch-target); }
}
```

- [ ] **Step 5: 確認通過**

Run: `npx vitest run src/components/organizer/content` → PASS。
Run: `npx tsc -b`、`npm run lint` → 無錯誤、無警告。

若 TypeScript 不接受 `inert` 屬性：
- 改成 `{...(desktop ? { inert: true } : {})}`；
- 仍不行時，用 `ref` 在 `useLayoutEffect` 中 `frame.toggleAttribute('inert', desktop)`；
- 寫進回報。

- [ ] **Step 6: Commit**

```bash
git add src/components/organizer/content/ContentPreview.tsx src/components/organizer/content/ContentPreview.test.tsx src/components/organizer/content/content.css
git commit -m "feat: add a phone and desktop resident page preview for the content editor"
```

---

### Task 6: 上方固定列、跳段標籤、發布前檢查

**Files:**
- Create: `src/components/organizer/content/ContentTopBar.tsx`
- Create: `src/components/organizer/content/ContentSectionNav.tsx`
- Create: `src/components/organizer/content/PublishChecklist.tsx`
- Create: `src/components/organizer/content/contentChrome.test.tsx`
- Modify: `src/components/organizer/content/content.css`（檔尾新增）

**Interfaces:**
- Consumes：
  - Task 1：`CONTENT_SECTIONS`、`ContentSectionId`、`PUBLICATION_TEXT`、`PublicationStatus`、`SaveState`
  - `Button`、`StatusBadge`
- Produces（Task 7 使用）：
  - `type ContentNotice = { tone: 'info' | 'error'; text: string }`（由 `ContentTopBar.tsx` export）
  - `<ContentTopBar saveState onRetrySave? retryDisabled publication residentHref primaryLabel publishing publishDisabledReason onPublish notice />`
    - 標題 `h2`「內容設定」（`id="content-heading"`）。
    - 儲存狀態是整個編輯器唯一的 `role="status"`。
    - 儲存失敗時才有「重試」。
    - 發布狀態標籤、「預覽住戶頁 ↗」（`residentHref` 有值才顯示，另開分頁）。
    - 主要按鈕停用時在旁邊寫原因，並以 `aria-describedby` 連到原因。
    - 發布結果：成功用 `aria-live="polite"`，失敗用 `role="alert"`。
  - `<ContentSectionNav completion />`
    - 導覽名稱「內容設定段落」。
    - 每個連結名稱為「段名（已填妥）」或「段名（尚未完成）」。
    - 點擊時捲動到 `#<anchor>-heading` 並聚焦，**不改網址**。
  - `<PublishChecklist blockers />`：區塊名稱「發布前檢查」。沒有待辦時顯示「必填項目都已完成」。

- [ ] **Step 1: 寫失敗測試**

`src/components/organizer/content/contentChrome.test.tsx`：

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContentSectionNav } from './ContentSectionNav'
import { ContentTopBar } from './ContentTopBar'
import { PublishChecklist } from './PublishChecklist'

const topBar = {
  saveState: { tone: 'idle' as const, text: '已自動儲存 14:05' },
  retryDisabled: false,
  publication: 'current' as const,
  residentHref: '/campaign/abc',
  primaryLabel: '更新住戶頁',
  publishing: false,
  publishDisabledReason: null,
  onPublish: vi.fn(),
  notice: null,
}

describe('ContentTopBar', () => {
  it('shows the save state, the publication state, the resident page link and the publish button', async () => {
    const user = userEvent.setup()
    const onPublish = vi.fn()
    render(<ContentTopBar {...topBar} onPublish={onPublish} />)

    expect(screen.getByRole('heading', { level: 2, name: '內容設定' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('已自動儲存 14:05')
    expect(screen.getByText('住戶頁已是最新')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: '預覽住戶頁' })
    expect(link).toHaveAttribute('href', '/campaign/abc')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.queryByRole('button', { name: '重試' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '更新住戶頁' }))
    expect(onPublish).toHaveBeenCalledOnce()
  })

  it('explains why publishing is unavailable and hides the link before the first publication', () => {
    render(<ContentTopBar {...topBar} publication="unpublished" residentHref={null} primaryLabel="發布並開團" publishDisabledReason="還有 2 項需要處理，見「發布前檢查」" />)

    expect(screen.getByText('草稿・住戶還看不到')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '預覽住戶頁' })).not.toBeInTheDocument()
    const publish = screen.getByRole('button', { name: '發布並開團' })
    expect(publish).toBeDisabled()
    expect(publish).toHaveAccessibleDescription('還有 2 項需要處理，見「發布前檢查」')
  })

  it('offers a retry only after a failed save', async () => {
    const user = userEvent.setup()
    const onRetrySave = vi.fn()
    render(<ContentTopBar {...topBar} saveState={{ tone: 'error', text: '儲存失敗：網路中斷' }} onRetrySave={onRetrySave} />)

    expect(screen.getByRole('status')).toHaveTextContent('儲存失敗：網路中斷')
    await user.click(screen.getByRole('button', { name: '重試' }))
    expect(onRetrySave).toHaveBeenCalledOnce()
  })

  it('announces publish results and shows failures as alerts', () => {
    const { rerender } = render(<ContentTopBar {...topBar} notice={{ tone: 'info', text: '住戶頁已更新' }} />)
    expect(screen.getByText('住戶頁已更新')).toHaveAttribute('aria-live', 'polite')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    rerender(<ContentTopBar {...topBar} notice={{ tone: 'error', text: '發布失敗：網路中斷' }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('發布失敗：網路中斷')
  })
})

describe('ContentSectionNav', () => {
  afterEach(() => { window.history.replaceState(null, '', '/') })

  const completion = { announcement: true, items: false, schedule: true, advanced: true }

  it('marks each section as filled in or unfinished', () => {
    render(<ContentSectionNav completion={completion} />)
    const nav = screen.getByRole('navigation', { name: '內容設定段落' })

    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual([
      '✓公告與圖片（已填妥）',
      '•品項與價格（尚未完成）',
      '✓成團與時程（已填妥）',
      '✓優惠與進階（已填妥）',
    ])
    expect(within(nav).getByRole('link', { name: '品項與價格（尚未完成）' })).toBeInTheDocument()
  })

  it('jumps to a section without changing the address and focuses its heading', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/admin/campaign/campaign-1/content')
    render(
      <>
        <ContentSectionNav completion={completion} />
        <h3 id="content-items-heading" tabIndex={-1}>品項與價格</h3>
      </>,
    )
    const historyLength = window.history.length

    await user.click(screen.getByRole('link', { name: '品項與價格（尚未完成）' }))

    expect(`${window.location.pathname}${window.location.hash}`).toBe('/admin/campaign/campaign-1/content')
    expect(window.history.length).toBe(historyLength)
    expect(screen.getByRole('heading', { name: '品項與價格' })).toHaveFocus()
  })
})

describe('PublishChecklist', () => {
  it('lists what is still missing', () => {
    render(<PublishChecklist blockers={['填寫團購標題', '填寫品項 A 的名稱']} />)
    const checklist = screen.getByRole('region', { name: '發布前檢查' })

    expect(within(checklist).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['填寫團購標題', '填寫品項 A 的名稱'])
  })

  it('says when everything required is done', () => {
    render(<PublishChecklist blockers={[]} />)

    expect(within(screen.getByRole('region', { name: '發布前檢查' })).getByText('必填項目都已完成')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/components/organizer/content/contentChrome.test.tsx`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作 `src/components/organizer/content/ContentTopBar.tsx`**

```tsx
import { useId } from 'react'
import { Button } from '../../ui/Button'
import { StatusBadge } from '../../ui/StatusBadge'
import { PUBLICATION_TEXT, type PublicationStatus, type SaveState } from './contentChecks'

export type ContentNotice = { tone: 'info' | 'error'; text: string }

type ContentTopBarProps = {
  saveState: SaveState
  onRetrySave?: () => void
  retryDisabled: boolean
  publication: PublicationStatus
  residentHref: string | null
  primaryLabel: string
  publishing: boolean
  publishDisabledReason: string | null
  onPublish: () => void
  notice: ContentNotice | null
}

export function ContentTopBar({
  saveState, onRetrySave, retryDisabled, publication, residentHref, primaryLabel, publishing, publishDisabledReason, onPublish, notice,
}: ContentTopBarProps) {
  const reasonId = useId()
  return (
    <div className="content-topbar">
      <div className="content-topbar-row">
        <div className="content-topbar-main">
          <h2 id="content-heading">內容設定</h2>
          <p className="content-save-state" data-tone={saveState.tone} role="status">{saveState.text}</p>
          {saveState.tone === 'error' && onRetrySave && (
            <Button variant="utility" size="sm" disabled={retryDisabled} onClick={onRetrySave}>重試</Button>
          )}
        </div>
        <div className="content-topbar-actions">
          <StatusBadge tone={publication === 'current' ? 'success' : 'warning'}>{PUBLICATION_TEXT[publication]}</StatusBadge>
          {residentHref && (
            <a className="content-preview-link" href={residentHref} target="_blank" rel="noreferrer">
              預覽住戶頁<span aria-hidden="true"> ↗</span>
            </a>
          )}
          <Button
            onClick={onPublish}
            disabled={publishDisabledReason !== null}
            loading={publishing}
            loadingLabel="發布中…"
            aria-describedby={publishDisabledReason ? reasonId : undefined}
          >
            {primaryLabel}
          </Button>
        </div>
      </div>
      {publishDisabledReason && <p id={reasonId} className="content-publish-reason">{publishDisabledReason}</p>}
      <p className="content-notice" aria-live="polite">{notice?.tone === 'info' ? notice.text : ''}</p>
      {notice?.tone === 'error' && <p className="content-notice content-notice-error" role="alert">{notice.text}</p>}
    </div>
  )
}
```

- [ ] **Step 4: 實作 `src/components/organizer/content/ContentSectionNav.tsx`**

```tsx
import type { MouseEvent } from 'react'
import { CONTENT_SECTIONS, type ContentSectionId } from './contentChecks'

export function ContentSectionNav({ completion }: { completion: Record<ContentSectionId, boolean> }) {
  // Scroll instead of following the hash: a history entry would trigger the organizer's page-change focus handling.
  const jump = (event: MouseEvent<HTMLAnchorElement>, anchor: string) => {
    event.preventDefault()
    const heading = document.getElementById(`${anchor}-heading`)
    heading?.scrollIntoView?.({ block: 'start' })
    heading?.focus({ preventScroll: true })
  }

  return (
    <nav className="content-section-nav" aria-label="內容設定段落">
      <ol>
        {CONTENT_SECTIONS.map((section) => {
          const complete = completion[section.id]
          return (
            <li key={section.id}>
              <a href={`#${section.anchor}`} onClick={(event) => jump(event, section.anchor)}>
                <span className="content-section-mark" data-complete={complete || undefined} aria-hidden="true">{complete ? '✓' : '•'}</span>
                {section.label}
                <span className="ui-visually-hidden">{complete ? '（已填妥）' : '（尚未完成）'}</span>
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
```

- [ ] **Step 5: 實作 `src/components/organizer/content/PublishChecklist.tsx`**

```tsx
export function PublishChecklist({ blockers }: { blockers: string[] }) {
  return (
    <section className="content-checklist" aria-labelledby="content-checklist-heading">
      <h3 id="content-checklist-heading">發布前檢查</h3>
      {blockers.length === 0 ? (
        <p className="content-checklist-ready"><span aria-hidden="true">✓ </span>必填項目都已完成</p>
      ) : (
        <ul>{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
      )}
    </section>
  )
}
```

- [ ] **Step 6: 在 `content.css` 檔尾加入**

```css
.content-topbar { display: grid; gap: var(--space-2); padding: var(--space-2) 0 var(--space-3); border-bottom: 1px solid var(--color-divider); background: var(--color-bg); }
.content-topbar-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); }
.content-topbar-main, .content-topbar-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
.content-topbar h2 { margin: 0; font-size: var(--font-size-page-title); font-weight: var(--font-weight-strong); }
.content-save-state { margin: 0; color: var(--color-text-secondary); font-size: var(--font-size-dense); }
.content-save-state[data-tone="warning"] { color: var(--color-warning); }
.content-save-state[data-tone="error"] { color: var(--color-danger); }
.content-preview-link { display: inline-flex; align-items: center; min-height: 24px; color: var(--color-primary); font-size: var(--font-size-dense); }
.content-publish-reason { margin: 0; color: var(--color-text-secondary); font-size: var(--font-size-dense); text-align: right; }
.content-notice { margin: 0; font-size: var(--font-size-dense); }
.content-notice:empty { display: none; }
.content-notice-error { color: var(--color-danger); }

.content-section-nav ol { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.content-section-nav a { display: inline-flex; align-items: center; gap: var(--space-1); min-height: 32px; padding: 0 var(--space-3); border: 1px solid var(--color-border-strong); border-radius: 999px; background: var(--color-surface); color: var(--color-text); font-size: var(--font-size-dense); text-decoration: none; }
.content-section-mark { color: var(--color-text-tertiary); font-weight: var(--font-weight-strong); }
.content-section-mark[data-complete] { color: var(--color-success); }

.content-checklist { display: grid; gap: var(--space-2); padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-surface); background: var(--color-surface); }
.content-checklist h3 { margin: 0; font-size: var(--font-size-base); font-weight: var(--font-weight-strong); }
.content-checklist ul { display: grid; gap: var(--space-1); margin: 0; padding-left: 1.2em; color: var(--color-warning); font-size: var(--font-size-dense); }
.content-checklist-ready { margin: 0; color: var(--color-success); font-size: var(--font-size-dense); }

@media (hover: hover) {
  .content-section-nav a:hover { background: var(--color-fill-hover); }
}

@media (min-width: 1024px) {
  .content-topbar { position: sticky; top: 52px; z-index: var(--z-sticky); }
}

@media (max-width: 1023px) {
  .content-section-nav a, .content-preview-link { min-height: var(--touch-target); }
  .content-publish-reason { text-align: left; }
}
```

52px 是團主端上方導覽 `.organizer-topbar` 的最小高度（`organizer.css` 第 3 行）。1024px 以下工作區版面不同，所以不固定。

- [ ] **Step 7: 確認通過**

Run: `npx vitest run src/components/organizer/content` → PASS。
Run: `npx tsc -b`、`npm run lint` → 無錯誤、無警告。

- [ ] **Step 8: Commit**

```bash
git add src/components/organizer/content/ContentTopBar.tsx src/components/organizer/content/ContentSectionNav.tsx src/components/organizer/content/PublishChecklist.tsx src/components/organizer/content/contentChrome.test.tsx src/components/organizer/content/content.css
git commit -m "feat: add the content editor top bar, section links and publish checklist"
```

---

### Task 7: 以新元件改寫內容設定畫面

**Files:**
- Modify: `src/AdminApp.tsx`（整檔改寫；狀態、自動儲存與發布邏輯保留）
- Modify: `src/AdminApp.test.tsx`
- Modify: `src/AdminApp.css`（整檔改寫）
- Modify: `src/LocalLiveApps.tsx`、`src/LocalLiveApps.test.tsx`
- Modify: `src/RuntimeApp.tsx`

**Interfaces:**
- Consumes：Task 1～6 的全部元件與函式（名稱見各 Task 的 Produces）。
- Produces：`AdminApp` 新增選填 prop `residentHref?: string | null`，其餘 props 不變。
  - `LocalLiveAdminApp` 傳 `workspaceCampaign.residentHref`（未發布為 `null`）；
  - Demo 傳 `/campaign/${DEMO_CAMPAIGN_SLUG}`。

**邏輯不變的部分**（照原檔搬移，不要改寫）：
- 所有 `useState` 的初始值；
- `activeItemPrices`、`unitPrice`、`maximumItemPrice`、`itemPricesValid`、`discountRulesValid` 等計算；
- 自動儲存的 `useEffect`（含 500ms 延遲、`flushAutoSaveImmediatelyRef`、失敗不重試）；
- `retryAutoSave`；
- `publish` 的檢查與 canonical 套用；
- `itemsLocked`、`customItemsLocked`。

**會改的部分：**
- **提示訊息（`notice`）**改成 `{ tone, text } | null`。
- **自動儲存的成功與失敗**不再寫進 `notice`，改寫：
  - `lastSavedAt`（成功時間）；
  - `autoSaveError`（失敗原因）。
- **圖片：**舊的單檔選擇流程改由 `ImageManager` 處理，刪除以下變數與函式：
  - `imageUrl`、`imageFile`、`imageInputRef`、`handledImageFileRef`
  - `addImage`、`selectImageFile`
- **預覽：**`previewExpanded` 移到 `ContentPreview`。
- **新增品項**改用 Task 1 的 `nextItemCode`／`appendItem`，由 `ItemTable` 呼叫。刪除 AdminApp 內的 `nextItemCode`。

- [ ] **Step 1: 修改 `src/AdminApp.test.tsx`（先失敗）**

1. 檔案頂端 import 後加：

   ```tsx
   const png = (name: string) => new File(['image'], name, { type: 'image/png' })
   ```

2. 依下表逐一修改既有測試。除了表中「改寫」的測試，其他只替換文字與查找方式，斷言的行為不變：

| 測試 | 修改 |
|---|---|
| `loads the current campaign into the editor and resident preview` | `previewGallery` 之後的 4 行 `.querySelector('.preview-image-…')` 斷言，換成 `expect(within(previewGallery).queryByRole('button', { name: /放大檢視/ })).not.toBeInTheDocument()`（圖片名稱已由上面的 `getByRole('img', …)` 驗證，它也保證編輯區縮圖不會重複出現同名圖片） |
| `prioritizes products and images before the long campaign announcement` | 改寫，見下方 A |
| `updates the resident preview and saves the campaign draft` | `findByText('已自動暫存')` → `findByText(/^已自動儲存 \d{2}:\d{2}$/)` |
| `keeps the existing formation threshold and lets the organizer switch it to total amount` | `getByRole('group', { name: '成團門檻' })` → `getByRole('radiogroup', { name: '門檻類型' })` |
| `lets the organizer enable resident custom items and saves the setting` | `getByRole('checkbox', { name: '允許住戶新增額外品項' })` → `getByRole('switch', …)` |
| `locks the resident custom item setting after the campaign is first published` | `checkbox` → `switch`；並在最後加 `expect(screen.getByText('已開團，優惠與額外品項設定已鎖定')).toBeInTheDocument()` |
| `lets the organizer configure a base discount and one mix-and-match group before publishing` | `啟用全團基本折扣`、`啟用任選優惠` 的 `checkbox` → `switch`（`品項 A 加入任選優惠` 仍是 checkbox） |
| `keeps mix-and-match item selection inside the discount section` | 改寫，見下方 B |
| `persists the default mix-and-match rate before enabling publication without touching the rate field` | 同上，兩個開關改成 `switch` |
| `adds and removes campaign images without requiring a visible description field` | 改寫，見下方 C |
| `keeps saved drafts private until the organizer publishes them` | 三處文字替換，見下方說明 1 |
| `uses an async repository when running with Supabase content` | 三處文字替換，見下方說明 2 |
| `confirms the selected image without asking for a separate description` | 刪除：選擇後不再需要按「上傳圖片」確認。多選上傳由下方 D 驗證，「不需要圖片說明欄」由 C 驗證 |
| `accepts a mobile file picker that emits input without change` | 改寫，見下方 E |
| `uploads a product image file and adds only its public URL to the preview` | 改寫，見下方 F |
| `blocks saving and publishing while an image upload is pending` | 改寫，見下方 G |
| `keeps editing available but blocks publication while autosave is pending` | 四處文字替換，見下方說明 3 |
| `flushes edits made during an in-flight autosave before reporting success` | 三處文字替換，見下方說明 4 |
| `does not loop autosave retries after a failure without a new edit` | `自動暫存失敗：網路中斷` → `儲存失敗：網路中斷` |
| `lets the organizer manually retry a failed autosave` | `自動暫存失敗：網路中斷` → `儲存失敗：網路中斷`；按鈕 `立即重試暫存` → `重試`；`findByText('已自動暫存')` → `findByText(/^已自動儲存/)` |
| `edits item names and prices and continues labels after Z` | 刪除 `toHaveClass('workflow-action-…')` 與 `querySelector('[aria-hidden="true"]')` 四行斷言（樣式類別已不存在）；`getByText('AA')` → `getByRole('rowheader', { name: 'AA' })`（預覽的品項清單也會顯示 AA）；其餘不變 |
| `locks fallback items immediately after the first publication` | `已正式開團，品項代碼、名稱與單價已鎖定。` → `已開團，品項與價格已鎖定`；`更新住戶公告` → `更新住戶頁` |
| `locks item structure and prices after the first opening` | 同上兩處替換（`更新住戶公告` 出現兩次都要換） |
| `applies the canonical campaign returned by publication immediately` | 鎖定文字同上；`getByText('已發布')` → `getByText('住戶頁已是最新')` |
| `configures arrival choices and an optional noon closing date` | `getByRole('checkbox', { name: '設定結單日期' })` → `getByRole('switch', …)` |

文字替換說明：

1. `keeps saved drafts private until the organizer publishes them`：
   - `findByText('已自動暫存')` → `findByText(/^已自動儲存/)`
   - `更新住戶公告` → `更新住戶頁`
   - `getByText('已發布')` → `getByText('住戶頁已是最新')`
2. `uses an async repository when running with Supabase content`：
   - `getByRole('status')).toHaveTextContent('已自動暫存')` → `getByRole('status')).toHaveTextContent(/^已自動儲存/)`
   - `更新住戶公告` → `更新住戶頁`
   - 最後一行改為 `expect(await screen.findByText('住戶頁已更新')).toBeInTheDocument()`
3. `keeps editing available but blocks publication while autosave is pending`：
   - `getByLabelText('商品圖片檔案')` → `getByLabelText('加入圖片')`
   - `更新住戶公告` → `更新住戶頁`（兩處）
   - `findByText('已自動暫存')` → `findByText(/^已自動儲存/)`
   - 在第一個「按鈕停用」斷言後加 `expect(screen.getByText('儲存完成後才能發布')).toBeInTheDocument()`
4. `flushes edits made during an in-flight autosave before reporting success`：
   - `更新住戶公告` → `更新住戶頁`
   - `.not.toHaveTextContent('已自動暫存')` → `.not.toHaveTextContent('已自動儲存')`
   - `findByText('已自動暫存')` → `findByText(/^已自動儲存/)`

**A**（取代 `prioritizes products and images before the long campaign announcement`）：

```tsx
  it('orders the form as announcement and images, items, schedule, then offers, with links to each section', () => {
    render(<AdminApp />)

    const sections = ['公告與圖片', '品項與價格', '成團與時程', '優惠與進階'].map((name) => screen.getByRole('region', { name }))
    sections.slice(1).forEach((section, index) => {
      expect(sections[index].compareDocumentPosition(section)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    })
    expect(within(sections[0]).getByRole('textbox', { name: '開團資訊' })).toHaveAttribute('rows', '10')
    expect(within(sections[1]).getByText('已開團，品項與價格已鎖定')).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: '內容設定段落' })).getAllByRole('link')).toHaveLength(4)
  })
```

**B**（取代 `keeps mix-and-match item selection inside the discount section`）：

```tsx
  it('shows mix-and-match participation as a column of the item table', async () => {
    const user = userEvent.setup()
    render(<AdminApp initialContent={{
      title: '分區測試', unitPrice: 100, threshold: 10,
      announcement: '', images: [], openedAt: null,
      items: [{ code: 'A', name: '測試商品', unitPrice: 100, active: true }],
    }} initialPublicationState="draft" />)

    await user.click(screen.getByRole('switch', { name: '啟用任選優惠' }))

    const itemSection = screen.getByRole('region', { name: '品項與價格' })
    const offerSection = screen.getByRole('region', { name: '優惠與進階' })
    expect(within(itemSection).getByRole('columnheader', { name: '參加任選' })).toBeInTheDocument()
    expect(within(itemSection).getByRole('checkbox', { name: '品項 A 加入任選優惠' })).toBeInTheDocument()
    expect(within(offerSection).queryByRole('checkbox', { name: '品項 A 加入任選優惠' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: '發布前檢查' })).getByText('完成優惠設定；任選優惠至少要有一個參加的品項')).toBeInTheDocument()
  })
```

**C**（取代 `adds and removes campaign images without requiring a visible description field`）：

```tsx
  it('adds and removes campaign images by address in the local demo without a description field', async () => {
    const user = userEvent.setup()
    render(<AdminApp />)

    await user.type(screen.getByRole('textbox', { name: '圖片網址' }), '/second-product.svg')
    expect(screen.queryByRole('textbox', { name: '圖片說明' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '新增圖片' }))

    expect(screen.getByRole('list', { name: '商品圖片，共 2 張' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '住戶端圖片預覽，共 2 張' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /移除 .*第 2 張商品圖片/ }))
    expect(screen.getByRole('list', { name: '商品圖片，共 1 張' })).toBeInTheDocument()
  })
```

**D**（新增；Review Focus 1）：

```tsx
  it('keeps uploaded images when one fails and autosaves once after the whole batch', async () => {
    const user = userEvent.setup()
    const onSaveDraft = vi.fn().mockResolvedValue(undefined)
    let failSecond!: () => void
    const onUploadImage = vi.fn((file: File) => file.name === 'b.png'
      ? new Promise<string>((_, reject) => { failSecond = () => reject(new Error('圖片不可超過 5 MB')) })
      : Promise.resolve(`https://storage.test/${file.name}`))
    render(<AdminApp initialContent={{
      title: '圖片團', unitPrice: 50, threshold: 10, announcement: '公告', images: [], openedAt: null,
      items: [{ code: 'A', name: '牛奶', unitPrice: 50, active: true }],
    }} initialPublicationState="draft" onSaveDraft={onSaveDraft} onUploadImage={onUploadImage} />)

    await user.upload(screen.getByLabelText('加入圖片'), [png('a.png'), png('b.png'), png('c.png')])
    await waitFor(() => expect(onUploadImage).toHaveBeenCalledTimes(2))
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(onSaveDraft).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '發布並開團' })).toBeDisabled()
    expect(screen.getByText('圖片上傳完成後才能發布')).toBeInTheDocument()

    failSecond()
    expect(await screen.findByRole('alert')).toHaveTextContent('「b.png」上傳失敗：圖片不可超過 5 MB')
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1))
    expect(onSaveDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      images: [
        expect.objectContaining({ src: 'https://storage.test/a.png' }),
        expect.objectContaining({ src: 'https://storage.test/c.png' }),
      ],
    }))
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(onSaveDraft).toHaveBeenCalledTimes(1)
  })
```

**E**（取代 `accepts a mobile file picker that emits input without change`）：

```tsx
  it('accepts a mobile file picker that emits input without change', async () => {
    const onUploadImage = vi.fn().mockResolvedValue('http://storage.test/campaign/image.png')
    render(<AdminApp onUploadImage={onUploadImage} />)
    const file = png('Samsung照片.png')

    fireEvent.input(screen.getByLabelText('加入圖片'), { target: { files: [file] } })

    await waitFor(() => expect(onUploadImage).toHaveBeenCalledWith(file))
    expect(onUploadImage).toHaveBeenCalledTimes(1)
  })
```

**F**（取代 `uploads a product image file and adds only its public URL to the preview`）：

```tsx
  it('uploads selected images right away and adds only their public URLs', async () => {
    const user = userEvent.setup()
    const onUploadImage = vi.fn().mockResolvedValue('http://storage.test/campaign/image.png')
    render(<AdminApp onUploadImage={onUploadImage} />)
    const file = png('商品照.png')

    await user.upload(screen.getByLabelText('加入圖片'), file)

    expect(onUploadImage).toHaveBeenCalledWith(file)
    expect(await screen.findByRole('list', { name: '商品圖片，共 2 張' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '顯示第 2 張圖片' }))
    expect(screen.getByRole('img', { name: /第 2 張商品圖片/ })).toHaveAttribute('src', 'http://storage.test/campaign/image.png')
    expect(screen.getByText('有未更新到住戶頁的變更')).toBeInTheDocument()
    expect(screen.getByLabelText<HTMLInputElement>('加入圖片').files).toHaveLength(0)
  })
```

**G**（取代 `blocks saving and publishing while an image upload is pending`）：

```tsx
  it('blocks saving and publishing while an image upload is pending', async () => {
    const user = userEvent.setup()
    let finishUpload: ((url: string) => void) | undefined
    const onUploadImage = vi.fn().mockImplementation(() => new Promise<string>((resolve) => {
      finishUpload = resolve
    }))
    render(<AdminApp onUploadImage={onUploadImage} />)

    await user.upload(screen.getByLabelText('加入圖片'), png('商品照.png'))

    expect(screen.getByRole('button', { name: '更新住戶頁' })).toBeDisabled()
    expect(screen.getByText('圖片上傳完成後才能發布')).toBeInTheDocument()
    expect(screen.getByLabelText('加入圖片')).toBeDisabled()

    finishUpload?.('http://storage.test/campaign/pending.png')
    expect(await screen.findByRole('list', { name: '商品圖片，共 2 張' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: '更新住戶頁' })).toBeEnabled())
  })
```

3. 在 `describe` 檔尾（`configures arrival choices…` 之後）新增：

```tsx
  it('lists what is missing before publishing and enables publishing once it is filled in', async () => {
    const user = userEvent.setup()
    render(<AdminApp initialContent={{
      title: '', unitPrice: 50, threshold: 10, announcement: '公告', images: [], openedAt: null,
      items: [{ code: 'ITEM1', name: '', unitPrice: 50, active: true }],
    }} initialPublicationState="draft" onSaveDraft={vi.fn().mockResolvedValue(undefined)} />)

    const checklist = screen.getByRole('region', { name: '發布前檢查' })
    expect(within(checklist).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['填寫團購標題', '填寫品項 A 的名稱'])
    expect(screen.getByRole('button', { name: '發布並開團' })).toBeDisabled()
    expect(screen.getByText('還有 2 項需要處理，見「發布前檢查」')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '公告與圖片（尚未完成）' })).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: '團購標題' }), '週末團')
    await user.type(screen.getByRole('textbox', { name: '品項 A 商品名稱（口味）' }), '牛奶')

    expect(within(checklist).getByText('必填項目都已完成')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '公告與圖片（已填妥）' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: '發布並開團' })).toBeEnabled())
    expect(screen.queryByText(/見「發布前檢查」/)).not.toBeInTheDocument()
  })

  it('shows the save state, the publication state and a link to the live resident page', async () => {
    const user = userEvent.setup()
    render(<AdminApp initialContent={{
      title: '已開團', unitPrice: 50, threshold: 10, announcement: '公告', images: [],
      items: [{ code: 'A', name: '牛奶', unitPrice: 50, active: true }], openedAt: '2026-09-20T00:00:00.000Z',
    }} initialPublicationState="published" residentHref="/campaign/abc" onSaveDraft={vi.fn().mockResolvedValue(undefined)} />)

    expect(screen.getByRole('heading', { level: 2, name: '內容設定' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('所有變更都已儲存')
    expect(screen.getByText('住戶頁已是最新')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '預覽住戶頁' })).toHaveAttribute('href', '/campaign/abc')

    await user.type(screen.getByRole('textbox', { name: '團購標題' }), '！')
    expect(screen.getByText('有未更新到住戶頁的變更')).toBeInTheDocument()
    expect(await screen.findByText(/^已自動儲存 \d{2}:\d{2}$/)).toBeInTheDocument()
  })

  it('says residents cannot see a campaign that was never published and offers no resident page link', () => {
    render(<AdminApp initialContent={{
      title: '新團', unitPrice: 50, threshold: 10, announcement: '', images: [],
      items: [{ code: 'A', name: '牛奶', unitPrice: 50, active: true }], openedAt: null,
    }} initialPublicationState="draft" residentHref={null} />)

    expect(screen.getByText('草稿・住戶還看不到')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '預覽住戶頁' })).not.toBeInTheDocument()
  })

  it('adds an item row from Enter in the last price and saves it with the inherited price', async () => {
    const user = userEvent.setup()
    const onSaveDraft = vi.fn().mockResolvedValue(undefined)
    render(<AdminApp initialContent={{
      title: '品項團', unitPrice: 40, threshold: 10, announcement: '', images: [], openedAt: null,
      items: [{ code: 'ITEM1', name: '牛奶', unitPrice: 40, active: true }],
    }} initialPublicationState="draft" onSaveDraft={onSaveDraft} />)

    await user.click(screen.getByRole('spinbutton', { name: '品項 A 單價' }))
    await user.keyboard('{Enter}')
    await user.keyboard('花生')

    expect(screen.getByRole('textbox', { name: '品項 B 商品名稱（口味）' })).toHaveValue('花生')
    await waitFor(() => expect(onSaveDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      items: [
        expect.objectContaining({ code: 'ITEM1', name: '牛奶', unitPrice: 40 }),
        expect.objectContaining({ code: 'ITEM2', name: '花生', unitPrice: 40 }),
      ],
    })))
  })
```

- [ ] **Step 2: 修改 `src/LocalLiveApps.test.tsx`（先失敗）**

1. `getByRole('button', { name: '更新住戶公告' })` → `getByRole('button', { name: '更新住戶頁' })`。在 `loads the next campaign instead of showing the previous draft…` 附近；用 grep 找。
2. 同時斷言 `開啟住戶頁` 連結 href 的那個登入測試：
   - `expect(screen.getByText('已發布')).toBeInTheDocument()` 換成 `expect(screen.getByText('住戶頁已是最新')).toBeInTheDocument()`；
   - 在它之後加：

   ```tsx
       expect(screen.getByRole('link', { name: '預覽住戶頁' })).toHaveAttribute('href', '/campaign/82be35197b9a8c709a939627ce4c411d8de3')
   ```

3. 用 `商品圖片檔案` 查找檔案欄位的測試（驗證登入重新驗證時編輯器不重新掛載）：
   - 兩處 `getByLabelText('商品圖片檔案')` 改成 `getByLabelText('加入圖片')`；
   - 刪除 `expect(fileInput.files?.[0]).toBe(selectedFile)` 這一行，因為選好後會立即上傳並清空選擇。
   - 要驗證的「同一個欄位元素仍在、沒有重新載入」由其餘斷言維持。
   - 若 `selectedFile` 變數因此未使用而被 lint 抓到，保留 `await user.upload(fileInput, selectedFile)` 即可（它仍被使用）。

用 `grep -n "更新住戶公告\|'已發布'\|商品圖片檔案" src/LocalLiveApps.test.tsx` 確認三處都已改完。

- [ ] **Step 3: 確認測試失敗**

Run: `npx vitest run src/AdminApp.test.tsx src/LocalLiveApps.test.tsx`
Expected: FAIL（找不到「公告與圖片」區塊、「加入圖片」、「更新住戶頁」等）。

- [ ] **Step 4: 改寫 `src/AdminApp.tsx`**

整檔換成下面的內容。標示「與原檔相同」的區塊，從原檔一字不改複製過來。

```tsx
import { useEffect, useRef, useState } from 'react'
import './AdminApp.css'
import './components/organizer/content/content.css'
import { ContentPreview } from './components/organizer/content/ContentPreview'
import { ContentSectionNav } from './components/organizer/content/ContentSectionNav'
import { ContentTopBar, type ContentNotice } from './components/organizer/content/ContentTopBar'
import {
  describeSaveState,
  publicationStatus,
  publishBlockers,
  publishBlockReason,
  sectionCompletion,
} from './components/organizer/content/contentChecks'
import { ImageManager } from './components/organizer/content/ImageManager'
import { ItemTable } from './components/organizer/content/ItemTable'
import { PublishChecklist } from './components/organizer/content/PublishChecklist'
import { FormField } from './components/ui/FormField'
import { SegmentedControl } from './components/ui/SegmentedControl'
import { Switch } from './components/ui/Switch'
import { campaign, items } from './data/demo'
import type { CampaignStatus } from './domain/orderWorkflow'
import { normalizeQuantityUnit, QUANTITY_UNITS, type QuantityUnit } from './domain/quantityUnit'
import {
  buildArrivalLabel,
  daysInMonth,
  formatArrivalLabel,
  parseArrivalLabel,
  taipeiDateInputFromIso,
  taipeiNoonIso,
  todayInTaipei,
  validDateInput,
  type ArrivalMode,
  type ArrivalPeriod,
} from './domain/campaignSchedule'
import {
  campaignContentEquals,
  loadDraftCampaign,
  loadPublishedCampaign,
  normalizeCampaignContent,
  publishCampaign,
  saveDraftCampaign,
  type CampaignContent,
} from './services/demoCampaignStore'

// const defaultContent …（與原檔相同）

type PublicationState = 'draft' | 'published'

type AdminAppProps = {
  initialContent?: CampaignContent
  initialPublicationState?: PublicationState
  onSaveDraft?: (content: CampaignContent) => Promise<void>
  onPublish?: (content: CampaignContent) => Promise<CampaignContent | void>
  campaignStatus?: CampaignStatus
  onUploadImage?: (file: File) => Promise<string>
  residentHref?: string | null
  section?: 'content' | null
}

// function messageFromError …（與原檔相同）

const ARRIVAL_OPTIONS: Array<{ value: ArrivalMode; label: string }> = [
  { value: 'notice', label: '貨到通知' },
  { value: 'date', label: '指定日期' },
  { value: 'month-period', label: '月份時段' },
]

function AdminApp({
  initialContent,
  initialPublicationState,
  onSaveDraft,
  onPublish,
  campaignStatus,
  onUploadImage,
  residentHref = null,
  section = 'content',
}: AdminAppProps = {}) {
  // 從 `const [initialDraft] = useState(…)` 到 `const [openedAt, setOpenedAt] = useState(initialDraft.openedAt)`（與原檔相同）
  const operationLock = useRef(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [notice, setNotice] = useState<ContentNotice | null>(null)
  const [busyAction, setBusyAction] = useState<'publish' | null>(null)
  const [draftRevision, setDraftRevision] = useState(0)
  const [autoSaveCycle, setAutoSaveCycle] = useState(0)
  const [autoSaving, setAutoSaving] = useState(false)
  const [autoSaveFailedRevision, setAutoSaveFailedRevision] = useState<number | null>(null)
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  // savedRevisionRef、latestRevisionRef、autoSaveInFlightRef、flushAutoSaveImmediatelyRef、publicationState 的 useState（與原檔相同）
  // editorBusy、activeItemPrices、unitPrice、maximumItemPrice、itemPricesValid、discountRulesValid（與原檔相同）
  const thresholdInputValid = /^\d+$/.test(thresholdInput) && Number(thresholdInput) >= 1
  const amountThresholdInputValid = /^\d+(?:\.\d{0,2})?$/.test(amountThresholdInput)
    && Number(amountThresholdInput) > 0
    && Number(amountThresholdInput) <= 999999999999.99
  const thresholdValid = thresholdKind === 'quantity' ? thresholdInputValid : amountThresholdInputValid
  const numericInputsValid = itemPricesValid && discountRulesValid && thresholdValid
  // scheduleInputsValid、arrivalLabel、autoCloseAt、draftSavePending（與原檔相同）
  const itemsLocked = openedAt !== null
  const customItemsLocked = openedAt !== null

  // currentContent（與原檔相同）

  const markDraft = () => {
    latestRevisionRef.current += 1
    setDraftRevision(latestRevisionRef.current)
    setPublicationState('draft')
    setAutoSaveFailedRevision(null)
    setAutoSaveError(null)
    setNotice(null)
  }

  // 自動儲存 useEffect：與原檔相同，只改成功與失敗的兩個分支：
  //   .then(() => {
  //     savedRevisionRef.current = revision
  //     if (latestRevisionRef.current === revision) {
  //       setAutoSaveFailedRevision(null)
  //       setAutoSaveError(null)
  //       setLastSavedAt(new Date())
  //     }
  //   }).catch((error: unknown) => {
  //     savedRevisionRef.current = revision
  //     if (latestRevisionRef.current === revision) {
  //       setAutoSaveFailedRevision(revision)
  //       setAutoSaveError(messageFromError(error))
  //     }
  //   })
  //   依賴陣列不變。

  const retryAutoSave = () => {
    if (autoSaveFailedRevision === null || editorBusy || autoSaveInFlightRef.current) return
    savedRevisionRef.current = Math.min(savedRevisionRef.current, autoSaveFailedRevision - 1)
    flushAutoSaveImmediatelyRef.current = true
    setAutoSaveFailedRevision(null)
    setAutoSaveError(null)
    setAutoSaveCycle((cycle) => cycle + 1)
  }

  // publish：與原檔相同，只改三處提示：
  //   開頭 `setNotice('')` → `setNotice(null)`
  //   成功 `setNotice(wasOpened ? '住戶公告已更新' : '已發布並開團')`
  //     → `setNotice({ tone: 'info', text: wasOpened ? '住戶頁已更新' : '已發布並開團' })`
  //   失敗 `setNotice(`發布失敗：${messageFromError(error)}`)`
  //     → `setNotice({ tone: 'error', text: `發布失敗：${messageFromError(error)}` })`

  const addImage = (src: string) => {
    setImages((current) => [...current, { src, alt: `${title.trim() || '商品'}第 ${current.length + 1} 張商品圖片` }])
    markDraft()
  }

  const removeImage = (index: number) => {
    setImages((current) => current.filter((_, currentIndex) => currentIndex !== index))
    markDraft()
  }

  const readiness = {
    title,
    announcement,
    items: campaignItems,
    itemPricesValid,
    thresholdValid,
    scheduleValid: scheduleInputsValid,
    discountRulesValid,
  }
  const blockers = publishBlockers(readiness)
  const saveState = describeSaveState({
    pending: draftSavePending,
    saving: autoSaving,
    failedMessage: autoSaveError,
    canSave: numericInputsValid && scheduleInputsValid,
    lastSavedAt,
  })
  const publishing = busyAction === 'publish'
  const publishDisabledReason = publishing
    ? null
    : publishBlockReason({ blockers, uploading: uploadingImage, savePending: autoSaving || draftSavePending })
  const priceText = unitPrice === maximumItemPrice ? `$${unitPrice}` : `$${unitPrice}～$${maximumItemPrice}`
  const thresholdText = thresholdKind === 'amount'
    ? `滿 NT$ ${amountThreshold.toLocaleString('zh-TW')} 成團`
    : `結單：${threshold} ${quantityUnit}成團`

  return (
    <div className="admin-shell">
      <section id="admin-settings-panel" className="content-editor" aria-labelledby="content-heading" hidden={section !== 'content'}>
        <ContentTopBar
          saveState={saveState}
          onRetrySave={retryAutoSave}
          retryDisabled={editorBusy || autoSaving}
          publication={publicationStatus(openedAt, publicationState)}
          residentHref={residentHref}
          primaryLabel={itemsLocked ? '更新住戶頁' : '發布並開團'}
          publishing={publishing}
          publishDisabledReason={publishDisabledReason}
          onPublish={() => { void publish() }}
          notice={notice}
        />
        <ContentSectionNav completion={sectionCompletion(readiness)} />
        <div className="content-layout">
          <div className="content-form">
            <section id="content-announcement" className="content-section" aria-labelledby="content-announcement-heading">
              <h3 id="content-announcement-heading" tabIndex={-1}>公告與圖片</h3>
              <FormField id="content-title" label="團購標題" required>
                <input className="ui-input" disabled={editorBusy} value={title} onChange={(event) => { setTitle(event.target.value); markDraft() }} />
              </FormField>
              <FormField id="campaign-announcement" label="開團資訊" helper={`${announcement.length.toLocaleString('en-US')} / 20,000 字`}>
                <textarea
                  className="ui-input content-announcement"
                  rows={10}
                  maxLength={20000}
                  disabled={editorBusy}
                  value={announcement}
                  onChange={(event) => { setAnnouncement(event.target.value); markDraft() }}
                />
              </FormField>
              <h4 className="content-subheading">商品圖片</h4>
              <ImageManager
                images={images}
                disabled={publishing}
                onUploadImage={onUploadImage}
                onAddImage={addImage}
                onRemoveImage={removeImage}
                onUploadingChange={setUploadingImage}
              />
            </section>

            <section id="content-items" className="content-section" aria-labelledby="content-items-heading">
              <h3 id="content-items-heading" tabIndex={-1}>品項與價格</h3>
              {itemsLocked
                ? <p className="content-lock-note">已開團，品項與價格已鎖定</p>
                : <p className="content-help">代碼會自動延伸為 A～Z、AA～AZ；每個品項都要有名稱與單價。</p>}
              <ItemTable
                items={campaignItems}
                locked={itemsLocked}
                disabled={editorBusy}
                mixMatchEnabled={mixMatchEnabled}
                onChange={(nextItems) => { setCampaignItems(nextItems); markDraft() }}
              />
            </section>

            <section id="content-schedule" className="content-section" aria-labelledby="content-schedule-heading">
              <h3 id="content-schedule-heading" tabIndex={-1}>成團與時程</h3>
              <div className="content-field-group">
                <span className="content-group-label" aria-hidden="true">門檻類型</span>
                <SegmentedControl
                  label="門檻類型"
                  value={thresholdKind}
                  onChange={(kind) => { setThresholdKind(kind); markDraft() }}
                  options={[
                    { value: 'quantity', label: '數量', disabled: editorBusy },
                    { value: 'amount', label: '總金額', disabled: editorBusy },
                  ]}
                />
              </div>
              <div className="content-field-grid">
                {thresholdKind === 'quantity' ? (
                  <FormField id="content-threshold" label="成團門檻" helper="剛好達標後自動結單，超過門檻的訂單不會送出。">
                    <input
                      className="ui-input"
                      disabled={editorBusy}
                      type="number"
                      min="1"
                      inputMode="numeric"
                      value={thresholdInput}
                      onChange={(event) => {
                        const value = event.target.value
                        setThresholdInput(value)
                        if (value !== '' && /^\d+$/.test(value) && Number(value) >= 1) {
                          setThreshold(Number(value))
                          markDraft()
                        }
                      }}
                      onBlur={() => {
                        if (!thresholdInputValid) setThresholdInput(String(threshold))
                      }}
                    />
                  </FormField>
                ) : (
                  <FormField id="content-amount-threshold" label="成團門檻金額" helper="只顯示成團進度，達到金額後不會自動結單。">
                    <input
                      className="ui-input"
                      disabled={editorBusy}
                      type="number"
                      min="0.01"
                      max="999999999999.99"
                      step="0.01"
                      inputMode="decimal"
                      value={amountThresholdInput}
                      onChange={(event) => {
                        const value = event.target.value
                        if (value !== '' && !/^\d+(?:\.\d{0,2})?$/.test(value)) return
                        setAmountThresholdInput(value)
                        if (value !== '' && Number(value) > 0 && Number(value) <= 999999999999.99) {
                          setAmountThreshold(Number(value))
                          markDraft()
                        }
                      }}
                      onBlur={() => {
                        if (!amountThresholdInputValid) setAmountThresholdInput(String(amountThreshold))
                      }}
                    />
                  </FormField>
                )}
                <FormField id="content-quantity-unit" label="數量單位" helper="套用於成團進度、訂單總數與品項彙總。">
                  <select
                    className="ui-input"
                    disabled={editorBusy}
                    value={quantityUnit}
                    onChange={(event) => {
                      setQuantityUnit(normalizeQuantityUnit(event.target.value))
                      markDraft()
                    }}
                  >
                    {QUANTITY_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </FormField>
              </div>
              <div className="content-field-group">
                <span className="content-group-label" aria-hidden="true">預計到貨</span>
                <SegmentedControl
                  label="預計到貨"
                  value={arrivalMode}
                  onChange={(mode) => { setArrivalMode(mode); markDraft() }}
                  options={ARRIVAL_OPTIONS.map((option) => ({ ...option, disabled: editorBusy }))}
                />
                {arrivalMode !== 'notice' && (
                  <div className="content-inline-fields">
                    <FormField id="content-arrival-month" label="到貨月份">
                      <select className="ui-input" value={arrivalMonth} disabled={editorBusy} onChange={(event) => {
                        const month = Number(event.target.value)
                        setArrivalMonth(month)
                        setArrivalDay((current) => Math.min(current, daysInMonth(month)))
                        markDraft()
                      }}>
                        {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{month}月</option>)}
                      </select>
                    </FormField>
                    {arrivalMode === 'date' ? (
                      <FormField id="content-arrival-day" label="到貨日期">
                        <select className="ui-input" value={arrivalDay} disabled={editorBusy} onChange={(event) => { setArrivalDay(Number(event.target.value)); markDraft() }}>
                          {Array.from({ length: daysInMonth(arrivalMonth) }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day}日</option>)}
                        </select>
                      </FormField>
                    ) : (
                      <FormField id="content-arrival-period" label="到貨時段">
                        <select className="ui-input" value={arrivalPeriod} disabled={editorBusy} onChange={(event) => { setArrivalPeriod(event.target.value as ArrivalPeriod); markDraft() }}>
                          <option value="初">月初</option>
                          <option value="中">月中</option>
                          <option value="底">月底</option>
                        </select>
                      </FormField>
                    )}
                  </div>
                )}
                <p className="content-help">{formatArrivalLabel(arrivalLabel)}</p>
              </div>
              <Switch
                label="設定結單日期"
                description="台灣時間當日中午12:00自動結單；若數量先達門檻，會提前結單。"
                checked={autoCloseEnabled}
                disabled={editorBusy}
                onChange={(checked) => {
                  setAutoCloseEnabled(checked)
                  if (checked && !autoCloseDate) setAutoCloseDate(todayInTaipei())
                  markDraft()
                }}
              />
              {autoCloseEnabled && (
                <FormField id="content-auto-close" label="結單日期" error={scheduleInputsValid ? undefined : '結單日期要是今天或之後'}>
                  <input
                    className="ui-input content-date"
                    type="date"
                    min={todayInTaipei()}
                    value={autoCloseDate}
                    disabled={editorBusy}
                    onChange={(event) => { setAutoCloseDate(event.target.value); markDraft() }}
                  />
                </FormField>
              )}
            </section>

            <section id="content-advanced" className="content-section" aria-labelledby="content-advanced-heading">
              <h3 id="content-advanced-heading" tabIndex={-1}>優惠與進階</h3>
              {itemsLocked
                ? <p className="content-lock-note">已開團，優惠與額外品項設定已鎖定</p>
                : <p className="content-help">選填，開啟才會套用。</p>}
              <Switch
                label="啟用全團基本折扣"
                description="所有正式品項預設套用；額外品項不計價。"
                checked={baseDiscountEnabled}
                disabled={editorBusy || itemsLocked}
                onChange={(checked) => {
                  setBaseDiscountEnabled(checked)
                  if (checked && baseDiscountRate >= 1) setBaseDiscountRate(0.9)
                  markDraft()
                }}
              />
              {baseDiscountEnabled && (
                <FormField id="content-base-discount" label="基本折數" helper="例如輸入9代表9折。" className="content-number-field">
                  <input
                    className="ui-input"
                    type="number"
                    min="0.1"
                    max="10"
                    step="0.1"
                    value={Number((baseDiscountRate * 10).toFixed(2))}
                    disabled={editorBusy || itemsLocked}
                    onChange={(event) => {
                      const fold = Number(event.target.value)
                      if (fold > 0 && fold <= 10) { setBaseDiscountRate(fold / 10); markDraft() }
                    }}
                  />
                </FormField>
              )}
              <Switch
                label="啟用任選優惠"
                description="同一住戶在參加任選的品項合計達到最低件數後，這些品項全部套用優惠折數；參加的品項在「品項與價格」勾選。"
                checked={mixMatchEnabled}
                disabled={editorBusy || itemsLocked}
                onChange={(checked) => {
                  setMixMatchEnabled(checked)
                  if (!checked) {
                    setCampaignItems((current) => current.map((item) => ({ ...item, discountEligible: false })))
                  }
                  markDraft()
                }}
              />
              {mixMatchEnabled && (
                <div className="content-field-grid">
                  <FormField id="content-mix-name" label="任選優惠名稱">
                    <input className="ui-input" maxLength={100} value={mixMatchName} disabled={editorBusy || itemsLocked}
                      onChange={(event) => { setMixMatchName(event.target.value); markDraft() }} />
                  </FormField>
                  <FormField id="content-mix-minimum" label="任選最低件數" className="content-number-field">
                    <input className="ui-input" type="number" min="2" max="100" step="1" value={mixMatchMinimumQuantity} disabled={editorBusy || itemsLocked}
                      onChange={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 2 && value <= 100) { setMixMatchMinimumQuantity(value); markDraft() } }} />
                  </FormField>
                  <FormField id="content-mix-rate" label="任選優惠折數" helper="例如輸入8.5代表85折。" className="content-number-field">
                    <input className="ui-input" type="number" min="0.1" max="10" step="0.1" value={Number((mixMatchDiscountRate * 10).toFixed(2))} disabled={editorBusy || itemsLocked}
                      onChange={(event) => { const fold = Number(event.target.value); if (fold > 0 && fold <= 10) { setMixMatchDiscountRate(fold / 10); markDraft() } }} />
                  </FormField>
                </div>
              )}
              <Switch
                label="允許住戶新增額外品項"
                description={customItemsLocked
                  ? '正式開團後此設定不可變更。'
                  : '住戶可填名稱與數量，不輸入金額；額外品項不納入成團門檻。'}
                checked={allowCustomItems}
                disabled={editorBusy || customItemsLocked}
                onChange={(checked) => { setAllowCustomItems(checked); markDraft() }}
              />
            </section>
          </div>

          <aside className="content-side" aria-label="住戶頁預覽與發布前檢查">
            <ContentPreview
              status={campaignStatus}
              title={title}
              priceText={priceText}
              arrivalLabel={arrivalLabel}
              autoCloseAt={autoCloseAt}
              thresholdText={thresholdText}
              allowCustomItems={allowCustomItems}
              images={images}
              announcement={announcement}
              items={campaignItems}
            />
            <PublishChecklist blockers={blockers} />
          </aside>
        </div>
      </section>
    </div>
  )
}

export default AdminApp
```

注意：
- **原檔的 `thresholdInputValid`、`amountThresholdInputValid`、`numericInputsValid`** 由上面的版本取代（多了 `thresholdValid`，結果相同）。
- **原檔的 `itemsLocked`、`customItemsLocked`** 要移到 `currentContent` 之前，因為 `publish` 用到 `itemsLocked`。它們原本在 `publish` 之後，靠函式執行時才讀取；移到前面後行為相同。
- **原檔 `publish` 裡的三個檢查照留**（至少一個有名稱的品項、單價、折扣），作為按鈕停用之外的第二道防線。
- **刪掉的變數、函式與 import：**
  - `imageUrl`、`imageFile`、`imageInputRef`、`handledImageFileRef`、`addImage`（舊版）、`selectImageFile`
  - `previewExpanded`、`nextItemCode`（舊版）
  - `LinkifiedText`、`campaignStatusLabel`、`itemLabel`、`MAX_CAMPAIGN_ITEMS`、`formatAutoCloseReminder` 的 import

  `npx tsc -b` 與 `npm run lint` 會指出遺漏的未使用項。

- [ ] **Step 5: 改寫 `src/AdminApp.css`**

改寫後，只有 `.admin-shell`（`organizer.css` 也有引用）與 `.admin-eyebrow`（登入頁與通知測試中心使用）仍被其他畫面使用。

1. 先用這個指令確認：

   ```bash
   for c in admin-shell admin-eyebrow admin-header editor-card field-grid campaign-item-list image-list preview-phone resident-preview threshold-fieldset schedule-fieldset discount-editor; do echo "$c: $(grep -rlw -- "$c" src --include='*.tsx' | tr '\n' ' ')"; done
   ```

   Expected：只有 `admin-shell`、`admin-eyebrow` 後面列出檔案。
2. 整檔換成：

```css
/* Container for the organizer content editor, and the small label above login and notification-lab titles. */
.admin-shell { color: var(--color-text); }
.admin-eyebrow { margin: 0 0 var(--space-1); color: var(--color-primary); font-size: var(--font-size-caption); font-weight: var(--font-weight-strong); letter-spacing: .08em; }
```

- [ ] **Step 6: 在 `content.css` 檔尾加入版面樣式**

```css
.content-editor { display: grid; gap: var(--space-4); }
.content-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 400px); gap: var(--space-5); align-items: start; }
.content-form, .content-side { display: grid; gap: var(--space-4); min-width: 0; }
.content-field-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-4); }
.content-field-group { display: grid; gap: var(--space-2); }
.content-group-label { font-size: var(--font-size-dense); font-weight: var(--font-weight-strong); }
.content-inline-fields { display: flex; flex-wrap: wrap; gap: var(--space-3); }
.content-number-field .ui-input, .content-date { max-width: 200px; }
.content-announcement { min-height: 200px; resize: vertical; }

@media (max-width: 1279px) {
  .content-layout { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 639px) {
  .content-section { padding: var(--space-4); }
}
```

- [ ] **Step 7: 傳入住戶頁連結**

- `src/LocalLiveApps.tsx`：`LocalLiveAdminApp` 裡 `<AdminApp` 的 props 加上 `residentHref={workspaceCampaign.residentHref}`。
- `src/RuntimeApp.tsx`：`DemoOrganizerWorkspace` 裡 `<AdminApp` 的 props 加上 ``residentHref={`/campaign/${DEMO_CAMPAIGN_SLUG}`}``。

- [ ] **Step 8: 確認通過**

Run: `npm test` → 全部 PASS，沒有 act() 警告。

若此 Task 沒列到的既有測試失敗，原因只可能是下列其中之一：
- 內容設定的文字換成新文案（例如「更新住戶公告」→「更新住戶頁」）；
- 開關的 role 由 checkbox 改為 switch；
- 圖片改成「加入圖片」。

依新文案改期望值，逐一寫進回報（測試名稱與改了什麼）。不可刪除測試，也不可減少斷言的行為。

Run: `npx tsc -b`、`npm run lint`、`npm run build` → 無錯誤、無警告。

- [ ] **Step 9: Commit**

```bash
git add src/AdminApp.tsx src/AdminApp.test.tsx src/AdminApp.css src/components/organizer/content/content.css src/LocalLiveApps.tsx src/LocalLiveApps.test.tsx src/RuntimeApp.tsx
git commit -m "feat: rebuild the content editor into four sections with a live preview and publish checklist"
```

---

### Task 8: 截圖、文件與完整驗證

**Files:**
- Modify: `docs/AI_AGENT_HANDOFF.md`、`README.md`
- Modify: `docs/superpowers/plans/2026-09-25-redesign-phase-5-content-editor.md`（檔尾加執行結果）

**Interfaces:** 無。

- [ ] **Step 1: 完整驗證**

```bash
npm test
npx tsc -b
npm run lint
npm run build
```

Expected: 全部通過、沒有警告；`npm run build` 成功。

- [ ] **Step 2: 改版後截圖並比對**

確認 Demo 在 5173 執行（見 Task 0 Step 1），然後：

```bash
node scripts/capture-pages.mjs .superpowers/qa/phase-5/after
```

Expected: 24 張；`report.json` 每頁沒有水平溢出。

逐張看 `admin-editor-375.png`、`admin-editor-768.png`、`admin-editor-1440.png`，與 `before` 同名檔比對。在回報列出：
- 1440px 是否為左表單、右預覽兩欄，上方固定列與跳段標籤在最上面；
- 768px 與 375px 是否為單欄，預覽在表單後面，品項表在 375px 轉成小卡且沒有水平捲動；
- 其他 21 張與 `before` 是否相同（除了內容設定頁，其他頁不該有變化）。

截圖不 commit。

- [ ] **Step 3: 更新 `docs/AI_AGENT_HANDOFF.md`**

1. 找到描述 `src/AdminApp.tsx` 的那一行，改為：

   ```markdown
   - `src/AdminApp.tsx`：團購內容設定。草稿、自動儲存（約 0.5 秒、失敗不自動重試）、發布與開團後鎖定的邏輯都在這裡；畫面由 `src/components/organizer/content/` 的元件組成（上方固定列、跳段標籤、品項表、圖片管理、住戶頁預覽、發布前檢查），判斷規則在 `contentChecks.ts`。
   ```

   若找不到描述 `AdminApp.tsx` 的行，就把這一行加在描述 `src/components/organizer/OverviewSection.tsx` 的那一行之後。
2. 在同一節加一行：

   ```markdown
   - 內容設定的圖片可一次選多張，依序逐張呼叫既有上傳 gateway；上傳期間不自動儲存也不能發布，全部結束後才自動儲存一次。本機示範沒有上傳服務，改用圖片網址。
   ```

- [ ] **Step 4: 更新 `README.md`**

在 README 的功能清單中，描述團主概況（`團主概況：`開頭）那一行之前加：

```markdown
- 團主內容設定：公告與圖片、品項與價格、成團與時程、優惠與進階四段；圖片可多選依序上傳；品項表在最後一列單價按 Enter 新增；右側可切手機／電腦的住戶頁預覽與「發布前檢查」
```

- [ ] **Step 5: 在本計畫檔尾加執行結果**

在本檔最後加上一節 `## 執行結果（YYYY-MM-DD）`，寫入以下內容，並在 commit 前填好實際值：
- commit 範圍；
- 測試檔數與測試數；
- 截圖結果（24 張、有無溢出）；
- 執行中對計畫的修正；
- 延後的小問題；
- 需要團主在正式環境確認的事項。至少包含：
  1. 用 LINE 登入的團主一次選多張圖上傳，確認全部上傳、失敗的有個別說明；
  2. 已開團的團改公告後按「更新住戶頁」，住戶頁更新。

- [ ] **Step 6: Commit**

```bash
git add docs/AI_AGENT_HANDOFF.md README.md docs/superpowers/plans/2026-09-25-redesign-phase-5-content-editor.md
git commit -m "docs: describe the new content editor and record phase 5 results"
```
