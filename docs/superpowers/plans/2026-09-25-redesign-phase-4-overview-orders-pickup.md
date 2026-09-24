# 前端改版第 4 階段：團主端概況、訂單、領取通知 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在第 3 階段的團購工作區內完成三個分區：
- 「概況」：開團中的預設分區。
- 新版「訂單」：不做付款功能。
- 頁面內步驟的「領取通知」。

同時加入團主端即時更新，並讓列表頁的載入與錯誤畫面保留上方導覽。

**Architecture:**
- **訂單移出編輯器：** 訂單畫面從 `AdminApp`（內容設定編輯器）移出。工作區直接依分區渲染 `OverviewSection`、`OrdersSection`、`PickupSection`，資料都來自 `LocalLiveAdminApp` 已有的 `orderSummary`。`AdminApp` 只剩內容設定，仍保持掛載以保留未存草稿。
- **純函式：** 概況與訂單共用的品項標籤、最新訂單排序、相對時間、搜尋、排序放在 `src/components/organizer/orderView.ts`。「上次查看時間」存在瀏覽器 localStorage，讀寫失敗就不顯示新訂單藍點。
- **即時更新：** 在 `LocalLiveAdminApp` 訂閱該團的 `orders`、`order_item` 變動，重新呼叫既有的 `loadSummary`。連續變動合併成一次，確保以最後一次的結果為準。
- **領取通知：** 沿用 `PickupNotificationPanel` 的 props（通知測試中心也用它），畫面由對話框改為三個頁面內步驟。

**Tech Stack:** React 19、TypeScript 6、Vite 8、Vitest 4、Testing Library、Supabase Realtime（既有 client）、原生 CSS（`src/styles/tokens.css` 的 token）

**Spec:**
- 主要依據：`docs/superpowers/specs/2026-09-21-frontend-redesign-design.md`，含以下章節：
  - 〈團主端〉的概況、訂單、領取通知
  - 〈狀態畫面〉
  - 〈前端新增邏輯〉
  - 〈風險與待驗證〉
  - 〈必須維持的產品規則〉
  - 〈已確認的決策〉的「付款功能」列：2026-09-24 決定不做付款功能，優先於規格其他提到付款的段落。
- 第 3 階段留下的事項：`docs/superpowers/plans/2026-09-24-redesign-phase-3-organizer-shell.md` 最後一節。

## Global Constraints

- Node.js 22.12.0 以上（機器上為 v22.23.2）。
- 只改前端：不得修改 `supabase/**`、`scripts/*.py`、`src/services/**`、`src/domain/**`、`src/types/database.ts`。可以修改 `src/LocalLiveApps.tsx`、`src/RuntimeApp.tsx` 的組裝與分派。
- 不新增 npm 相依套件。
- 操作色只有一種：`#0066cc`；聚焦外框 `2px solid #0071e3`、`outline-offset: 2px`。
- 字體沿用 `--font-sans`；中文不套負字距；字重只用 400 與 600；團主端表格與表單 14px（`--font-size-dense`），輔助小字最小 12px；頁面標題 20～22px。
- 不使用裝飾性漸層與 UI 陰影；只做淺色模式。
- **可點範圍：** 團主端 1024px 以上 ≥ 24×24px；1024px 以下 ≥ 44×44px。所有可點擊元素有 `:focus-visible`。
- 文字與底色組合對比 ≥ 4.5:1（大字 ≥ 3:1）。
- **不做付款功能：** 不新增也不保留任何付款介面，包括：
  - 付款欄、付款切換、已付款／未付款的篩選或統計、已收／未收金額；
  - 領取通知名單上的付款狀態；
  - 取消訂單時的「已付款」提醒。

  Excel 匯出沿用 `src/services/orderExport.ts`，它本來就沒有付款欄位。
- 產品規則（不可破壞）：
  - 團主前端不接觸 LINE User ID、Auth UID、community UUID；住戶只以 `memberCode` 識別。
  - `arrived` 顯示為「已結單」。
  - Excel 匯出只在結單後。
  - 整筆取消只在開團中。
  - 團主備註上限 500 字。
  - 領取通知維持一次性指令：產生後頁面必須寫明「此頁尚未代表通知已發送」；正式與測試嚴格隔離（測試模式訊息自動加「【測試】」前綴）。
  - 「其他」身分的訂購者不會收到通知的提示保留。
- 行為不可減少：
  - 自動儲存時機與失敗不自動重試。
  - 草稿與發布隔離。
  - 開團後鎖定。
  - session 驗證 fail-closed 與登出流程。
  - 換團時不顯示前一團資料（第 3 階段的 `contentCampaignId` 與晚到結果防護）。
- TDD：每個行為先寫失敗測試，確認失敗原因是功能缺失，再寫最小實作。
- 修改既有測試時，原本驗證的行為必須仍被某個測試驗證；刻意移除的行為（付款相關）另外寫明。
- 使用者可見文案一律繁體中文。
- **只 commit、不 push。** 何時上線由團主決定。

## 對 Spec 的調整

1. **不做付款功能**（2026-09-24 決定，已寫入規格）：
   - **訂單頁：** 拿掉「付款」欄、「全部｜未付款｜已付款」篩選、已收／未收金額，總覽只剩「N 筆、總數量、總額」。
   - **概況：** 規格寫結單後把「今天新增」換成「未付款 N 筆」，改為換成「總數量」。
   - **領取通知：** 名單不顯示已付款／未付款。
   - **取消訂單：** 確認視窗拿掉「已付款」退款提醒。
2. **訂單工具列只有搜尋與排序**（付款篩選拿掉後沒有其他篩選需求）。
3. **領取通知第 1 步沿用兩個「預覽…通知」按鈕當作選擇對象**：
   - 按下即讀取名單並進入第 2 步。
   - 第 2 步可「重新選擇」回到第 1 步；第 3 步按「完成」回到第 1 步。
   - 通知測試中心沿用同一元件，按鈕名稱不變。
4. **即時更新的狀態文字：**
   - 概況與訂單標題旁顯示「即時更新」（連線中顯示「連線中…」）。
   - 連線中斷時改成提醒列「即時同步中斷，畫面可能不是最新」＋「重新同步」。
   - 本機示範（localStorage Demo）沒有即時更新，不顯示狀態。
5. **匯出 Excel 按鈕：**
   - 訂單標題列一律顯示；開團中停用，並在旁邊寫「結單後才能匯出」。
   - 概況在結單後顯示同一按鈕，並提示前往「領取通知」。
6. **最新訂單顯示期別／戶號**：這是團主端，規格的「每筆顯示名字、戶號」即此意；住戶端訂單牆不露戶號的規則不受影響。
7. **第 3 階段遺留：** 列表頁與工作區的載入、錯誤畫面改為包在上方導覽內，錯誤提供「重試」（規格〈狀態畫面〉）。
8. **團主端即時更新在正式環境的驗收交給團主：** 用住戶帳號下單，看團主概況是否自動更新。代理不在瀏覽器輸入密碼登入本機 Live Demo，自動測試以假的 Realtime client 驗證訂閱與重新載入。

## Review Focus

以下五種情況沒有任何既有測試涵蓋，最可能讓團主遇到問題。每一項都在負責的 Task 補上測試：

1. **一次送單同時觸發 `orders` 與 `order_item` 兩個事件：**
   - 不能造成重複或亂序的重新載入。
   - 載入進行中又來事件時，要在目前這次結束後再載一次，畫面以最後一次為準。
   - Task 6 測試。
2. **團主正在編輯某筆備註時，即時更新帶來新的訂單資料，輸入中的文字不能被覆蓋。** Task 3 測試。
3. **某一列在存備註或取消時，只鎖定該列，其他列照常可操作。** Task 3 測試。
4. **瀏覽器禁止 localStorage（無痕、隱私模式）時，概況要照常顯示，只是沒有新訂單藍點。** Task 2 測試。
5. **領取通知在產生指令後「完成」再選另一個對象時，不能沿用前一次的預覽代碼或指令。** 團購若被重新開放，領取通知分區要立即顯示無法使用。Task 4 測試。

## 檔案地圖

| 檔案 | 動作 | 責任 |
|---|---|---|
| `src/components/organizer/orderView.ts`、`orderView.test.ts` | 新增 | 品項標籤、最新訂單、相對時間、今天筆數、搜尋、排序、是否已修改、是否為新 |
| `src/components/organizer/lastSeenStore.ts`、`lastSeenStore.test.ts` | 新增 | 讀寫「上次查看時間」，失敗時回傳 null |
| `src/components/organizer/ExportOrdersButton.tsx` | 新增 | 匯出 Excel 按鈕（概況與訂單共用） |
| `src/components/organizer/LiveStatus.tsx` | 新增 | 即時更新狀態文字與重新同步 |
| `src/components/organizer/OverviewSection.tsx`、`OverviewSection.test.tsx` | 新增 | 概況 |
| `src/components/organizer/OrderNoteCell.tsx` | 新增 | 備註行內編輯 |
| `src/components/organizer/OrdersSection.tsx`、`OrdersSection.test.tsx` | 新增 | 新版訂單 |
| `src/components/organizer/organizer.css` | 修改（檔尾新增） | 分區、KPI、面板、品項長條、最新訂單、標籤、訂單工具列與備註 |
| `src/PickupNotificationPanel.tsx`、`.css`、`.test.tsx` | 改寫 | 頁面內三步驟 |
| `src/components/organizer/workspaceSections.ts`、`WorkspaceRail.tsx`、`organizerWorkspace.test.tsx` | 修改 | 概況分區、依狀態的預設分區 |
| `src/AdminApp.tsx`、`AdminApp.test.tsx` | 修改 | 拿掉訂單與付款 |
| `src/LocalLiveApps.tsx`、`LocalLiveApps.test.tsx` | 修改 | 渲染新分區、即時更新、殼層內的載入／錯誤 |
| `src/RuntimeApp.tsx`、`RuntimeApp.test.tsx` | 修改 | Demo 的新分區 |
| `src/AdminOrdersPanel.tsx`、`.css`、`.test.tsx` | 刪除 | 由 `OrdersSection` 與 `OverviewSection` 取代 |
| `scripts/capture-pages.mjs` | 修改 | 加入概況頁 |
| `docs/AI_AGENT_HANDOFF.md`、`README.md` | 修改 | 分區說明、即時更新、不做付款 |

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
node scripts/capture-pages.mjs .superpowers/qa/phase-4/before
```

Expected: 21 行輸出（7 頁 × 3 寬度）、21 張 PNG 與 `report.json`；每行 scrollWidth 兩個數字相同。沒有 commit。

---

### Task 1: 訂單顯示用的純函式與上次查看時間

**Files:**
- Create: `src/components/organizer/orderView.ts`、`orderView.test.ts`
- Create: `src/components/organizer/lastSeenStore.ts`、`lastSeenStore.test.ts`

**Interfaces:**
- Consumes：
  - `OrganizerOrderRow`、`OrganizerItemRow`、`buildOrganizerOrderSummary`（`src/domain/adminOrders.ts`）
  - `compareHousehold`、`formatHousehold`（`src/domain/household.ts`）
  - `taipeiDateInputFromIso`（`src/domain/campaignSchedule.ts`）
  - `formatZhTwTimestamp`、`wasMeaningfullyUpdated`（`src/domain/timestamp.ts`）
- Produces（Task 2、3 使用）：
  - `type OrderSort = 'household' | 'orderedAt'`
  - `type OrderItemChip = { key: string; label: string; name: string; quantity: number; custom: boolean }`
  - `orderItemChips(order, itemRows): OrderItemChip[]`：正式品項依品項順序，後接額外品項。
  - `latestOrders(rows, limit = 10)`：依最後活動時間新到舊。
  - `sortOrders(rows, sort)`：`household` 用 `compareHousehold`；`orderedAt` 新到舊。
  - `matchesOrderSearch(row, query)`：名字或戶號，不分大小寫。
  - `orderHouseholdLabel(row)`
  - `orderControlLabel(row)`：「其他」身分用「其他」，住戶用戶號。
  - `countOrdersOnTaipeiDay(rows, now)`
  - `wasEdited(row)`
  - `isNewSince(row, lastSeen: string | null)`
  - `formatRelativeTime(value, now)`：「剛剛」／「N 分鐘前」／「N 小時前」／「MM/DD HH:mm」。
  - `readLastSeen(campaignId, storage?)`：回傳 `string | null`。
  - `writeLastSeen(campaignId, value, storage?)`

- [ ] **Step 1: 寫失敗測試**

`src/components/organizer/orderView.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { initialOrders, items } from '../../data/demo'
import { buildOrganizerOrderSummary, type OrganizerOrderRow } from '../../domain/adminOrders'
import {
  countOrdersOnTaipeiDay, formatRelativeTime, isNewSince, latestOrders, matchesOrderSearch,
  orderControlLabel, orderHouseholdLabel, orderItemChips, sortOrders, wasEdited,
} from './orderView'

const summary = buildOrganizerOrderSummary({ orders: initialOrders, items, threshold: 100 })

function row(overrides: Partial<OrganizerOrderRow>): OrganizerOrderRow {
  return { ...summary.orderRows[0], ...overrides }
}

describe('order view helpers', () => {
  it('lists regular items in item order and extra items after them', () => {
    const order = row({
      items: { D: 2, B: 1 },
      customItems: [{ id: 'bag', name: ' 紙袋 ', quantity: 3 }, { id: 'blank', name: '  ', quantity: 1 }],
    })
    expect(orderItemChips(order, summary.itemRows)).toEqual([
      { key: 'B', label: 'B', name: '花生（招牌）', quantity: 1, custom: false },
      { key: 'D', label: 'D', name: '草莓', quantity: 2, custom: false },
      { key: 'bag', label: '紙袋', name: '紙袋', quantity: 3, custom: true },
    ])
  })

  it('orders the latest activity first and limits the list', () => {
    const rows = Array.from({ length: 12 }, (_, index) => row({
      orderId: `o${index}`,
      orderedAt: `2026-09-20T0${index % 10}:00:00.000Z`,
      updatedAt: index === 3 ? '2026-09-21T00:00:00.000Z' : `2026-09-20T0${index % 10}:00:00.000Z`,
    }))
    const latest = latestOrders(rows)
    expect(latest).toHaveLength(10)
    expect(latest[0].orderId).toBe('o3')
  })

  it('sorts by household or by the newest order time', () => {
    const rows = [
      row({ orderId: 'b', name: '乙', period: 2, unit: '2K13', householdKind: 'resident', orderedAt: '2026-09-20T01:00:00.000Z' }),
      row({ orderId: 'c', name: '丙', period: null, unit: null, householdKind: 'other', orderedAt: '2026-09-20T03:00:00.000Z' }),
      row({ orderId: 'a', name: '甲', period: 1, unit: 'H11', householdKind: 'resident', orderedAt: '2026-09-20T02:00:00.000Z' }),
    ]
    expect(sortOrders(rows, 'household').map((order) => order.orderId)).toEqual(['a', 'b', 'c'])
    expect(sortOrders(rows, 'orderedAt').map((order) => order.orderId)).toEqual(['c', 'a', 'b'])
  })

  it('searches by name or household and labels controls', () => {
    const resident = row({ name: '斯祈', period: 2, unit: '2K13', householdKind: 'resident' })
    const other = row({ name: '社區朋友', period: null, unit: null, householdKind: 'other' })
    expect(matchesOrderSearch(resident, '2k13')).toBe(true)
    expect(matchesOrderSearch(resident, '二期')).toBe(true)
    expect(matchesOrderSearch(resident, ' 斯 ')).toBe(true)
    expect(matchesOrderSearch(resident, '佩怡')).toBe(false)
    expect(matchesOrderSearch(resident, '  ')).toBe(true)
    expect(orderHouseholdLabel(resident)).toBe('二期 2K13')
    expect(orderControlLabel(resident)).toBe('2K13')
    expect(orderControlLabel(other)).toBe('其他')
  })

  it('counts orders placed on the Taipei calendar day', () => {
    const rows = [
      row({ orderedAt: '2026-09-24T16:30:00.000Z' }),
      row({ orderedAt: '2026-09-25T10:00:00.000Z' }),
      row({ orderedAt: '2026-09-24T15:59:00.000Z' }),
      row({ orderedAt: undefined }),
    ]
    expect(countOrdersOnTaipeiDay(rows, new Date('2026-09-25T04:00:00.000Z'))).toBe(2)
  })

  it('marks edited orders and orders changed since the last visit', () => {
    const edited = row({ orderedAt: '2026-09-20T01:00:00.000Z', updatedAt: '2026-09-20T02:00:00.000Z' })
    const untouched = row({ orderedAt: '2026-09-20T01:00:00.000Z', updatedAt: '2026-09-20T01:00:00.000Z' })
    expect(wasEdited(edited)).toBe(true)
    expect(wasEdited(untouched)).toBe(false)
    expect(isNewSince(edited, '2026-09-20T01:30:00.000Z')).toBe(true)
    expect(isNewSince(untouched, '2026-09-20T01:30:00.000Z')).toBe(false)
    expect(isNewSince(edited, null)).toBe(false)
    expect(isNewSince(edited, 'not-a-date')).toBe(false)
  })

  it('describes how long ago something happened', () => {
    const now = new Date('2026-09-25T04:00:00.000Z')
    expect(formatRelativeTime('2026-09-25T03:59:40.000Z', now)).toBe('剛剛')
    expect(formatRelativeTime('2026-09-25T03:57:00.000Z', now)).toBe('3 分鐘前')
    expect(formatRelativeTime('2026-09-25T01:00:00.000Z', now)).toBe('3 小時前')
    expect(formatRelativeTime('2026-09-23T01:05:00.000Z', now)).toBe('09/23 09:05')
    expect(formatRelativeTime(undefined, now)).toBe('')
  })
})
```

`src/components/organizer/lastSeenStore.test.ts`：

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readLastSeen, writeLastSeen } from './lastSeenStore'

afterEach(() => { window.localStorage.clear() })

describe('last seen store', () => {
  it('remembers the last visit per campaign', () => {
    expect(readLastSeen('campaign-1')).toBeNull()
    writeLastSeen('campaign-1', '2026-09-25T04:00:00.000Z')
    expect(readLastSeen('campaign-1')).toBe('2026-09-25T04:00:00.000Z')
    expect(readLastSeen('campaign-2')).toBeNull()
  })

  it('ignores unreadable values and storage that throws', () => {
    window.localStorage.setItem('group-buy-helper:organizer-last-seen:campaign-1', 'garbage')
    expect(readLastSeen('campaign-1')).toBeNull()

    const broken = {
      getItem: vi.fn(() => { throw new Error('denied') }),
      setItem: vi.fn(() => { throw new Error('denied') }),
    }
    expect(readLastSeen('campaign-1', broken)).toBeNull()
    expect(() => writeLastSeen('campaign-1', '2026-09-25T04:00:00.000Z', broken)).not.toThrow()
  })
})
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/components/organizer/orderView.test.ts src/components/organizer/lastSeenStore.test.ts`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作 `src/components/organizer/orderView.ts`**

```ts
import type { OrganizerItemRow, OrganizerOrderRow } from '../../domain/adminOrders'
import { taipeiDateInputFromIso } from '../../domain/campaignSchedule'
import { compareHousehold, formatHousehold } from '../../domain/household'
import { formatZhTwTimestamp, wasMeaningfullyUpdated } from '../../domain/timestamp'

export type OrderSort = 'household' | 'orderedAt'
export type OrderItemChip = { key: string; label: string; name: string; quantity: number; custom: boolean }

const timestamp = (value: string | null | undefined) => Date.parse(value ?? '') || 0
const lastActivity = (order: OrganizerOrderRow) => Math.max(timestamp(order.orderedAt), timestamp(order.updatedAt))

export function orderItemChips(order: OrganizerOrderRow, itemRows: OrganizerItemRow[]): OrderItemChip[] {
  const regular = itemRows
    .filter((item) => (order.items[item.code] ?? 0) > 0)
    .map((item) => ({ key: item.code, label: item.label, name: item.name, quantity: order.items[item.code], custom: false }))
  const custom = (order.customItems ?? [])
    .filter((item) => item.name.trim() && item.quantity > 0)
    .map((item) => ({ key: item.id, label: item.name.trim(), name: item.name.trim(), quantity: item.quantity, custom: true }))
  return [...regular, ...custom]
}

export function latestOrders(rows: OrganizerOrderRow[], limit = 10): OrganizerOrderRow[] {
  return [...rows].sort((left, right) => lastActivity(right) - lastActivity(left)).slice(0, limit)
}

export function sortOrders(rows: OrganizerOrderRow[], sort: OrderSort): OrganizerOrderRow[] {
  return sort === 'orderedAt'
    ? [...rows].sort((left, right) => timestamp(right.orderedAt) - timestamp(left.orderedAt))
    : [...rows].sort((left, right) => compareHousehold(left, right))
}

export function orderHouseholdLabel(order: OrganizerOrderRow): string {
  return formatHousehold(order.householdKind, order.period, order.unit)
}

export function orderControlLabel(order: OrganizerOrderRow): string {
  return order.householdKind === 'other' ? orderHouseholdLabel(order) : order.unit ?? orderHouseholdLabel(order)
}

export function matchesOrderSearch(order: OrganizerOrderRow, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [order.name, orderHouseholdLabel(order), order.unit ?? ''].some((value) => value.toLowerCase().includes(needle))
}

export function countOrdersOnTaipeiDay(rows: OrganizerOrderRow[], now: Date): number {
  const today = taipeiDateInputFromIso(now.toISOString())
  return rows.filter((order) => order.orderedAt && taipeiDateInputFromIso(order.orderedAt) === today).length
}

export function wasEdited(order: OrganizerOrderRow): boolean {
  return Boolean(order.orderedAt && order.updatedAt && wasMeaningfullyUpdated(order.orderedAt, order.updatedAt))
}

export function isNewSince(order: OrganizerOrderRow, lastSeen: string | null): boolean {
  const seen = timestamp(lastSeen)
  return seen > 0 && lastActivity(order) > seen
}

export function formatRelativeTime(value: string | undefined, now: Date): string {
  const time = timestamp(value)
  if (!time || !value) return ''
  const minutes = Math.floor((now.getTime() - time) / 60_000)
  if (minutes < 1) return '剛剛'
  if (minutes < 60) return `${minutes} 分鐘前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小時前`
  return formatZhTwTimestamp(value).slice(5)
}
```

- [ ] **Step 4: 實作 `src/components/organizer/lastSeenStore.ts`**

```ts
type ReadableStorage = Pick<Storage, 'getItem'>
type WritableStorage = Pick<Storage, 'setItem'>

const storageKey = (campaignId: string) => `group-buy-helper:organizer-last-seen:${campaignId}`

function browserStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

// Private browsing can block storage entirely; the overview then just shows no "new" dots.
export function readLastSeen(campaignId: string, storage: ReadableStorage | null = browserStorage()): string | null {
  try {
    const value = storage?.getItem(storageKey(campaignId)) ?? null
    return value && Number.isFinite(Date.parse(value)) ? value : null
  } catch {
    return null
  }
}

export function writeLastSeen(campaignId: string, value: string, storage: WritableStorage | null = browserStorage()): void {
  try {
    storage?.setItem(storageKey(campaignId), value)
  } catch {
    // Ignore: the dots are a convenience, not state the organizer relies on.
  }
}
```

- [ ] **Step 5: 確認通過**

Run: `npx vitest run src/components/organizer` → PASS。
Run: `npx tsc -b` 與 `npm run lint` → 無錯誤、無警告。

若 `row({ items: { D: 2, B: 1 } })` 的 `B`／`D` 名稱與 `src/data/demo.ts` 的品項不同：以 demo 資料的實際名稱為準修改測試的期望值，並寫進回報。期望的結構（正式品項依品項順序、額外品項在後、空白名稱略過）不變。

- [ ] **Step 6: Commit**

```bash
git add src/components/organizer/orderView.ts src/components/organizer/orderView.test.ts src/components/organizer/lastSeenStore.ts src/components/organizer/lastSeenStore.test.ts
git commit -m "feat: add order view helpers and the organizer last-seen store"
```

---

### Task 2: 匯出按鈕、即時狀態與概況分區

**Files:**
- Create: `src/components/organizer/ExportOrdersButton.tsx`
- Create: `src/components/organizer/LiveStatus.tsx`
- Create: `src/components/organizer/OverviewSection.tsx`、`OverviewSection.test.tsx`
- Modify: `src/components/organizer/organizer.css`（檔尾新增）

**Interfaces:**
- Consumes：
  - Task 1 全部
  - `buildOrderExportRows`、`downloadOrderExport`（`src/services/orderExport.ts`；`downloadOrderExport({ summary, campaignTitle, openedAt })`）
  - `OrganizerLink`、`campaignSectionPath`
  - `ProgressBar`、`Button`、`FeedbackMessage`（支援 `actionLabel`／`onAction`）
- Produces（Task 3、5、6 使用）：
  - `type LiveState = 'connecting' | 'live' | 'offline' | 'unavailable'`（從 `LiveStatus.tsx` 匯出）
  - `<LiveStatus state onRetry?>`
  - `<ExportOrdersButton summary campaignTitle openedAt status onExport?>`：按鈕名稱「匯出 Excel」；開團中停用並顯示「結單後才能匯出」；沒有可匯出列時停用並顯示「目前沒有可匯出的訂單」。
  - `<OverviewSection campaignId campaignTitle openedAt summary status liveState onRetrySync? now?>`

- [ ] **Step 1: 寫失敗測試**

`src/components/organizer/OverviewSection.test.tsx`：

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initialOrders, items } from '../../data/demo'
import { buildOrganizerOrderSummary, type OrganizerOrderSummary } from '../../domain/adminOrders'
import { ExportOrdersButton } from './ExportOrdersButton'
import { OrganizerNavigationProvider } from './OrganizerLink'
import { OverviewSection } from './OverviewSection'

const now = new Date('2026-09-25T04:00:00.000Z')
const base = buildOrganizerOrderSummary({ orders: initialOrders, items, threshold: 100 })
const summary: OrganizerOrderSummary = {
  ...base,
  orderRows: base.orderRows.map((order, index) => ({
    ...order,
    orderId: `order-${index + 1}`,
    // All placed the previous Taipei evening; only order 2 was edited this morning, 3 minutes before `now`.
    orderedAt: `2026-09-24T1${index}:00:00.000Z`,
    updatedAt: index === 1 ? '2026-09-25T03:57:00.000Z' : `2026-09-24T1${index}:00:00.000Z`,
  })),
}

function renderOverview(props: Partial<Parameters<typeof OverviewSection>[0]> = {}) {
  return render(
    <OrganizerNavigationProvider navigate={vi.fn()}>
      <OverviewSection
        campaignId="campaign-1"
        campaignTitle="一涼製冰所"
        openedAt="2026-09-20T00:00:00.000Z"
        summary={summary}
        status="open"
        liveState="live"
        now={now}
        {...props}
      />
    </OrganizerNavigationProvider>,
  )
}

afterEach(() => { window.localStorage.clear() })

describe('OverviewSection', () => {
  it('shows progress, orders, total and today for an open campaign', () => {
    renderOverview()

    expect(screen.getByRole('heading', { level: 2, name: '概況' })).toBeInTheDocument()
    expect(screen.getByText('即時更新')).toBeInTheDocument()
    const kpis = screen.getByRole('list', { name: '團購數字' })
    expect(within(kpis).getByText('62 / 100 個')).toBeInTheDocument()
    expect(within(kpis).getByText('還差 38 個成團')).toBeInTheDocument()
    expect(within(kpis).getByRole('progressbar', { name: '成團進度' })).toHaveAttribute('aria-valuenow', '62')
    expect(within(kpis).getByText('6 筆')).toBeInTheDocument()
    expect(within(kpis).getByText('$2,790')).toBeInTheDocument()
    expect(within(kpis).getByText('今天新增')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '匯出 Excel' })).not.toBeInTheDocument()
    expect(screen.queryByText(/付款/)).not.toBeInTheDocument()
  })

  it('shows the money still missing for an amount threshold', () => {
    const amountSummary = buildOrganizerOrderSummary({
      orders: initialOrders, items, threshold: 100, thresholdKind: 'amount', amountThreshold: 5000,
    })
    renderOverview({ summary: amountSummary })
    expect(screen.getByText('$2,790 / $5,000')).toBeInTheDocument()
    expect(screen.getByText('還差 $2,210 成團')).toBeInTheDocument()
  })

  it('switches to the total quantity, export and a pickup pointer after closing', () => {
    renderOverview({ status: 'closed' })

    const kpis = screen.getByRole('list', { name: '團購數字' })
    expect(within(kpis).queryByText('今天新增')).not.toBeInTheDocument()
    expect(within(kpis).getByText('總數量')).toBeInTheDocument()
    expect(within(kpis).getByText('62 個')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '匯出 Excel' })).toBeEnabled()
    expect(screen.getByRole('link', { name: '領取通知' })).toHaveAttribute('href', '/admin/campaign/campaign-1/pickup')
  })

  it('shows each item quantity for ordering from the supplier', () => {
    renderOverview()
    const itemList = screen.getByRole('list', { name: '品項數量' })
    const peanut = within(itemList).getByText('花生（招牌）').closest('li') as HTMLElement
    expect(within(peanut).getByText('B')).toBeInTheDocument()
    expect(within(peanut).getByText('14')).toBeInTheDocument()
  })

  it('lists the latest orders with items, edits and relative times', () => {
    renderOverview()
    const latest = screen.getByRole('list', { name: '最新訂單' })
    const entries = within(latest).getAllByRole('listitem')
    expect(entries).toHaveLength(6)
    expect(entries[0]).toHaveTextContent('已修改・3 分鐘前')
    expect(within(entries[0]).getAllByText(/^[A-I] \d+$/).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: '查看全部 6 筆' })).toHaveAttribute('href', '/admin/campaign/campaign-1/orders')
  })

  it('marks orders changed since the last visit and remembers this visit', () => {
    window.localStorage.setItem('group-buy-helper:organizer-last-seen:campaign-1', '2026-09-25T03:30:00.000Z')
    renderOverview()

    const latest = screen.getByRole('list', { name: '最新訂單' })
    expect(within(latest).getAllByText('上次查看後有更新')).toHaveLength(1)
    expect(window.localStorage.getItem('group-buy-helper:organizer-last-seen:campaign-1')).not.toBe('2026-09-25T03:30:00.000Z')
  })

  it('still shows the overview when storage is blocked, without new-order dots', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    try {
      renderOverview()
      expect(screen.getByRole('heading', { level: 2, name: '概況' })).toBeInTheDocument()
      expect(screen.queryByText('上次查看後有更新')).not.toBeInTheDocument()
    } finally {
      getItem.mockRestore()
      setItem.mockRestore()
    }
  })

  it('warns when live updates stop and lets the organizer resync', async () => {
    const user = userEvent.setup()
    const onRetrySync = vi.fn()
    renderOverview({ liveState: 'offline', onRetrySync })

    expect(screen.getByRole('status')).toHaveTextContent('即時同步中斷，畫面可能不是最新')
    await user.click(screen.getByRole('button', { name: '重新同步' }))
    expect(onRetrySync).toHaveBeenCalledOnce()
  })

  it('invites sharing when nobody has ordered yet', () => {
    renderOverview({ summary: { ...summary, orderCount: 0, orderRows: [] } })
    expect(screen.getByText('還沒有人下單。')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /查看全部/ })).not.toBeInTheDocument()
  })
})

describe('ExportOrdersButton', () => {
  it('exports only after closing and explains why it is disabled', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<ExportOrdersButton summary={summary} campaignTitle="榮泉餅店" openedAt="2026-09-11T05:00:00.000Z" status="open" onExport={onExport} />)
    expect(screen.getByRole('button', { name: '匯出 Excel' })).toBeDisabled()
    expect(screen.getByText('結單後才能匯出')).toBeInTheDocument()

    rerender(<ExportOrdersButton summary={summary} campaignTitle="榮泉餅店" openedAt="2026-09-11T05:00:00.000Z" status="closed" onExport={onExport} />)
    await user.click(screen.getByRole('button', { name: '匯出 Excel' }))
    expect(onExport).toHaveBeenCalledOnce()

    rerender(<ExportOrdersButton summary={summary} campaignTitle="榮泉餅店" openedAt="2026-09-11T05:00:00.000Z" status="arrived" onExport={onExport} />)
    expect(screen.getByRole('button', { name: '匯出 Excel' })).toBeEnabled()
  })

  it('disables export for empty shells but enables custom-only orders', () => {
    const emptyShell = { ...summary.orderRows[0], items: { A: 0 }, customItems: [{ id: 'blank', name: '   ', quantity: 0 }] }
    const { rerender } = render(
      <ExportOrdersButton summary={{ ...summary, orderCount: 0, orderRows: [emptyShell] }} campaignTitle="空團" openedAt="2026-09-11T05:00:00.000Z" status="closed" />,
    )
    expect(screen.getByRole('button', { name: '匯出 Excel' })).toBeDisabled()
    expect(screen.getByText('目前沒有可匯出的訂單')).toBeInTheDocument()

    rerender(
      <ExportOrdersButton
        summary={{ ...summary, orderCount: 1, orderRows: [{ ...emptyShell, customItems: [{ id: 'bag', name: '紙袋', quantity: 1 }] }] }}
        campaignTitle="額外品項團"
        openedAt="2026-09-11T05:00:00.000Z"
        status="arrived"
      />,
    )
    expect(screen.getByRole('button', { name: '匯出 Excel' })).toBeEnabled()
  })

  it('shows an export failure without leaving the button busy', async () => {
    const user = userEvent.setup()
    render(<ExportOrdersButton summary={summary} campaignTitle="榮泉餅店" openedAt="2026-09-11T05:00:00.000Z" status="closed" onExport={vi.fn().mockRejectedValue(new Error('建立 Excel 失敗'))} />)
    await user.click(screen.getByRole('button', { name: '匯出 Excel' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('建立 Excel 失敗')
    expect(screen.getByRole('button', { name: '匯出 Excel' })).toBeEnabled()
  })
})
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/components/organizer/OverviewSection.test.tsx`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作 `src/components/organizer/LiveStatus.tsx`**

```tsx
import { FeedbackMessage } from '../ui/FeedbackMessage'

export type LiveState = 'connecting' | 'live' | 'offline' | 'unavailable'

export function LiveStatus({ state, onRetry }: { state: LiveState; onRetry?: () => void }) {
  if (state === 'unavailable') return null
  if (state === 'offline') {
    return (
      <FeedbackMessage tone="warning" className="organizer-live-warning" actionLabel={onRetry ? '重新同步' : undefined} onAction={onRetry}>
        即時同步中斷，畫面可能不是最新
      </FeedbackMessage>
    )
  }
  return <span className="organizer-live" data-state={state}>{state === 'live' ? '即時更新' : '連線中…'}</span>
}
```

- [ ] **Step 4: 實作 `src/components/organizer/ExportOrdersButton.tsx`**

```tsx
import { useId, useState } from 'react'
import type { OrganizerOrderSummary } from '../../domain/adminOrders'
import type { CampaignStatus } from '../../domain/orderWorkflow'
import { buildOrderExportRows, downloadOrderExport } from '../../services/orderExport'
import { Button } from '../ui/Button'
import { FeedbackMessage } from '../ui/FeedbackMessage'

type ExportOrdersButtonProps = {
  summary: OrganizerOrderSummary
  campaignTitle: string
  openedAt: string | null
  status: CampaignStatus
  onExport?: () => Promise<void>
}

export function ExportOrdersButton({ summary, campaignTitle, openedAt, status, onExport }: ExportOrdersButtonProps) {
  const reasonId = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const closed = status === 'closed' || status === 'arrived'
  const reason = !closed
    ? '結單後才能匯出'
    : buildOrderExportRows(summary, campaignTitle).length === 0 ? '目前沒有可匯出的訂單' : ''

  const exportOrders = async () => {
    if (busy || reason || !openedAt) return
    setBusy(true)
    setError('')
    try {
      await (onExport ? onExport() : downloadOrderExport({ summary, campaignTitle, openedAt }))
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : '匯出 Excel 失敗')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="organizer-export">
      <Button
        variant="secondary"
        size="sm"
        disabled={Boolean(reason) || !openedAt}
        loading={busy}
        loadingLabel="建立 Excel 中…"
        aria-describedby={reason ? reasonId : undefined}
        onClick={() => { void exportOrders() }}
      >
        匯出 Excel
      </Button>
      {reason && <small id={reasonId}>{reason}</small>}
      {error && <FeedbackMessage tone="error">{error}</FeedbackMessage>}
    </div>
  )
}
```

說明：
- `Button` 在 `loading` 時會把文字換成 `loadingLabel`。
- 測試只在非忙碌時以「匯出 Excel」查找，所以忙碌時名稱改變不影響測試。

- [ ] **Step 5: 實作 `src/components/organizer/OverviewSection.tsx`**

```tsx
import { useEffect, useState } from 'react'
import type { OrganizerOrderSummary } from '../../domain/adminOrders'
import type { CampaignStatus } from '../../domain/orderWorkflow'
import { campaignSectionPath } from '../../routing'
import { ProgressBar } from '../ui/ProgressBar'
import { ExportOrdersButton } from './ExportOrdersButton'
import { readLastSeen, writeLastSeen } from './lastSeenStore'
import { LiveStatus, type LiveState } from './LiveStatus'
import { OrganizerLink } from './OrganizerLink'
import {
  countOrdersOnTaipeiDay, formatRelativeTime, isNewSince, latestOrders, orderHouseholdLabel, orderItemChips, wasEdited,
} from './orderView'

const currency = (amount: number) => `$${amount.toLocaleString('en-US')}`

type OverviewSectionProps = {
  campaignId: string
  campaignTitle: string
  openedAt: string | null
  summary: OrganizerOrderSummary
  status: CampaignStatus
  liveState: LiveState
  onRetrySync?: () => void
  now?: Date
}

export function OverviewSection({ campaignId, campaignTitle, openedAt, summary, status, liveState, onRetrySync, now }: OverviewSectionProps) {
  // Read before this visit is recorded, so "new" means new since the previous visit.
  const [lastSeen] = useState(() => readLastSeen(campaignId))
  useEffect(() => { writeLastSeen(campaignId, new Date().toISOString()) }, [campaignId])

  const today = now ?? new Date()
  const closed = status !== 'open'
  const usesAmount = summary.thresholdKind === 'amount'
  const unit = summary.quantityUnit
  const progressValue = usesAmount ? summary.amount : summary.quantity
  const progressText = usesAmount
    ? `${currency(summary.amount)} / ${currency(summary.threshold)}`
    : `${summary.quantity} / ${summary.threshold} ${unit}`
  const remainingText = summary.formed
    ? '已成團'
    : usesAmount ? `還差 ${currency(summary.remaining)} 成團` : `還差 ${summary.remaining} ${unit}成團`
  const latest = latestOrders(summary.orderRows)
  const largestItem = Math.max(1, ...summary.itemRows.map((item) => item.quantity))

  return (
    <section className="organizer-section organizer-overview" aria-labelledby="overview-heading">
      <div className="organizer-section-heading">
        <h2 id="overview-heading">概況</h2>
        <LiveStatus state={liveState} onRetry={onRetrySync} />
        {closed && <ExportOrdersButton summary={summary} campaignTitle={campaignTitle} openedAt={openedAt} status={status} />}
      </div>
      {closed && (
        <p className="organizer-section-note">
          已結單。可以匯出 Excel 核對，並到<OrganizerLink href={campaignSectionPath(campaignId, 'pickup')}>領取通知</OrganizerLink>通知住戶領貨。
        </p>
      )}

      <ul className="organizer-kpis" aria-label="團購數字">
        <li className="organizer-kpi is-progress">
          <span>成團進度</span>
          <strong className="ui-num">{progressText}</strong>
          <ProgressBar label="成團進度" value={progressValue} max={summary.threshold} />
          <small>{remainingText}</small>
        </li>
        <li className="organizer-kpi"><span>訂單</span><strong className="ui-num">{summary.orderCount} 筆</strong></li>
        <li className="organizer-kpi"><span>預估總額</span><strong className="ui-num">{currency(summary.amount)}</strong></li>
        {closed
          ? <li className="organizer-kpi"><span>總數量</span><strong className="ui-num">{summary.quantity} {unit}</strong></li>
          : <li className="organizer-kpi"><span>今天新增</span><strong className="ui-num">{countOrdersOnTaipeiDay(summary.orderRows, today)} 筆</strong></li>}
      </ul>

      <div className="organizer-overview-columns">
        <section className="organizer-panel" aria-labelledby="overview-items-heading">
          <h3 id="overview-items-heading">品項數量</h3>
          <ul className="organizer-item-bars" aria-label="品項數量">
            {summary.itemRows.map((item) => (
              <li key={item.code}>
                <span className="organizer-item-code">{item.label}</span>
                <span className="organizer-item-name">{item.name}</span>
                <span className="organizer-item-bar" aria-hidden="true">
                  <span style={{ width: `${Math.round((item.quantity / largestItem) * 100)}%` }} />
                </span>
                <strong className="ui-num">{item.quantity}</strong>
              </li>
            ))}
          </ul>
        </section>

        <section className="organizer-panel" aria-labelledby="overview-latest-heading">
          <div className="organizer-panel-heading">
            <h3 id="overview-latest-heading">最新訂單</h3>
            {summary.orderCount > 0 && (
              <OrganizerLink href={campaignSectionPath(campaignId, 'orders')}>查看全部 {summary.orderCount} 筆</OrganizerLink>
            )}
          </div>
          {latest.length === 0 ? <p className="organizer-muted">還沒有人下單。</p> : (
            <ol className="organizer-latest" aria-label="最新訂單">
              {latest.map((order) => (
                <li key={order.orderId}>
                  {isNewSince(order, lastSeen)
                    ? <span className="organizer-new-dot"><span className="ui-visually-hidden">上次查看後有更新</span></span>
                    : <span aria-hidden="true" />}
                  <span className="organizer-latest-who"><strong>{order.name}</strong><small>{orderHouseholdLabel(order)}</small></span>
                  <span className="organizer-chips">
                    {orderItemChips(order, summary.itemRows).map((chip) => (
                      <span key={chip.key} className={chip.custom ? 'organizer-chip is-custom' : 'organizer-chip'} title={chip.custom ? undefined : chip.name}>
                        {chip.custom ? `${chip.label} ×${chip.quantity}・另計` : `${chip.label} ${chip.quantity}`}
                      </span>
                    ))}
                  </span>
                  <span className="organizer-latest-meta">
                    <span className="ui-num">{order.quantity} {unit}・{currency(order.amount)}</span>
                    <small>{wasEdited(order) ? '已修改・' : ''}{formatRelativeTime(order.updatedAt ?? order.orderedAt, today)}</small>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </section>
  )
}
```

- [ ] **Step 6: 在 `organizer.css` 檔尾加入分區與概況樣式**

```css
/* Workspace sections: heading row, live status, KPI tiles, panels, item bars, latest orders and chips. */
.organizer-section { display: grid; gap: var(--space-4); }
.organizer-section-heading { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
.organizer-section-heading h2 { margin: 0 auto 0 0; font-size: var(--font-size-page-title); font-weight: var(--font-weight-strong); }
.organizer-section-note { margin: 0; color: var(--color-text-secondary); }
.organizer-section-note a { color: var(--color-primary); font-weight: var(--font-weight-strong); }
.organizer-live { display: inline-flex; align-items: center; gap: var(--space-1); color: var(--color-success); font-size: var(--font-size-caption); }
.organizer-live::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
.organizer-live[data-state="connecting"] { color: var(--color-text-secondary); }
.organizer-live-warning { flex-basis: 100%; }
.organizer-kpis { display: grid; grid-template-columns: minmax(0, 1.4fr) repeat(3, minmax(0, 1fr)); gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
.organizer-kpi { display: grid; align-content: start; gap: var(--space-1); padding: var(--space-3) var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-surface); background: var(--color-surface); }
.organizer-kpi > span { color: var(--color-text-secondary); font-size: var(--font-size-caption); }
.organizer-kpi strong { font-size: 20px; font-weight: var(--font-weight-strong); }
.organizer-kpi small { color: var(--color-text-secondary); font-size: var(--font-size-caption); }
.organizer-overview-columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); align-items: start; gap: var(--space-3); }
.organizer-panel { display: grid; gap: var(--space-2); padding: var(--space-3) var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-surface); background: var(--color-surface); }
.organizer-panel h3 { margin: 0; font-size: var(--font-size-base); font-weight: var(--font-weight-strong); }
.organizer-panel-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--space-2); }
.organizer-panel-heading a { display: inline-flex; align-items: center; min-height: 24px; color: var(--color-primary); }
.organizer-item-bars { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.organizer-item-bars li { display: grid; grid-template-columns: 24px minmax(0, 1fr) minmax(60px, 120px) 40px; align-items: center; gap: var(--space-2); }
.organizer-item-code { display: grid; place-items: center; width: 24px; height: 24px; border-radius: var(--radius-sm); background: var(--color-surface-subtle); font-size: var(--font-size-caption); font-weight: var(--font-weight-strong); }
.organizer-item-name { overflow-wrap: anywhere; }
.organizer-item-bar { height: 6px; overflow: hidden; border-radius: var(--radius-pill); background: var(--color-divider); }
.organizer-item-bar span { display: block; height: 100%; background: var(--color-primary); }
.organizer-item-bars strong { text-align: right; font-variant-numeric: tabular-nums; }
.organizer-latest { display: grid; margin: 0; padding: 0; list-style: none; }
.organizer-latest li { display: grid; grid-template-columns: 10px minmax(96px, 140px) minmax(0, 1fr) auto; align-items: baseline; gap: var(--space-2); padding: var(--space-2) 0; border-top: 1px solid var(--color-divider); }
.organizer-latest li:first-child { border-top: 0; }
.organizer-new-dot { align-self: center; width: 8px; height: 8px; border-radius: 50%; background: var(--color-primary); }
.organizer-latest-who, .organizer-latest-meta { display: grid; gap: 2px; }
.organizer-latest-who small, .organizer-latest-meta small { color: var(--color-text-secondary); font-size: var(--font-size-caption); }
.organizer-latest-meta { text-align: right; }
.organizer-chips { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.organizer-chip { display: inline-flex; align-items: center; min-height: 22px; padding: 0 var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm); font-size: var(--font-size-caption); font-variant-numeric: tabular-nums; white-space: nowrap; }
.organizer-chip.is-custom { border-style: dashed; }
.organizer-export { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.organizer-export small { color: var(--color-text-secondary); font-size: var(--font-size-caption); }

@media (max-width: 1023px) {
  .organizer-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .organizer-overview-columns { grid-template-columns: minmax(0, 1fr); }
  .organizer-panel-heading a { min-height: var(--touch-target); }
}

@media (max-width: 639px) {
  .organizer-kpis { grid-template-columns: minmax(0, 1fr); }
  .organizer-latest li { grid-template-columns: 10px minmax(0, 1fr); }
  .organizer-latest li > :nth-child(n + 3) { grid-column: 2; text-align: left; }
}
```

- [ ] **Step 7: 確認通過**

Run: `npx vitest run src/components/organizer` → PASS，輸出沒有警告。
Run: `npx tsc -b` 與 `npm run lint` → 無錯誤、無警告。

`lists the latest orders…` 測試：
- 若 demo 訂單的品項讓 `/^[A-I] \d+$/` 對不到任何標籤，照 `src/data/demo.ts` 實際品項代碼調整正規式，並寫進回報。
- 要驗證的是「最新一筆以『代碼 數量』標籤顯示」。

- [ ] **Step 8: Commit**

```bash
git add src/components/organizer
git commit -m "feat: add the campaign overview section and shared export button"
```

---

### Task 3: 新版訂單分區與備註行內編輯

**Files:**
- Create: `src/components/organizer/OrderNoteCell.tsx`
- Create: `src/components/organizer/OrdersSection.tsx`、`OrdersSection.test.tsx`
- Modify: `src/components/organizer/organizer.css`（檔尾新增）

**Interfaces:**
- Consumes：
  - Task 1：`orderItemChips`、`sortOrders`、`matchesOrderSearch`、`orderHouseholdLabel`、`orderControlLabel`、`OrderSort`
  - Task 2：`ExportOrdersButton`、`LiveStatus`、`LiveState`
  - `Menu`（固定定位）、`SegmentedControl`、`ConfirmDialog`、`EmptyState`
- Produces（Task 5、6 使用）：
  - `<OrdersSection campaignTitle openedAt summary status liveState onRetrySync? onSetOrderOrganizerNote? onCancelOrder? onExport?>`
  - `<OrderNoteCell order controlLabel disabled onSave? onSavingChange>`

`AdminOrdersPanel.test.tsx` 各測試的去向（該檔在 Task 5 刪除）：

| 原測試 | 由誰驗證 |
|---|---|
| 總數、品項彙總、住戶訂單 | 總數與訂單：本 Task；品項彙總：Task 2 概況 |
| 數量單位 | 本 Task |
| 金額門檻的差額 | Task 2 概況 |
| 結單後才能匯出 Excel | Task 2 `ExportOrdersButton` |
| 空殼訂單不能匯出、只有額外品項可以 | Task 2 `ExportOrdersButton` |
| 付款確認＋備註儲存 | 備註：本 Task；付款：**刪除**（不做付款功能） |
| 付款失敗保留視窗 | **刪除**（不做付款功能） |
| 只鎖定更新中的那一列 | 本 Task（改以備註儲存驗證） |
| 只看未付款 | **刪除**（不做付款功能）；改由本 Task 的搜尋與排序測試補上工具列行為 |
| 整筆取消需確認 | 本 Task |
| 結單後不能取消 | 本 Task |
| 已付款單取消時的退款提醒 | **刪除**（不做付款功能） |
| 「其他」身分與筆數 | 本 Task |
| 控制項名稱用「其他」不用 null | 本 Task |
| 結單鈕已移到左側欄 | 第 3 階段工作區測試已涵蓋 |

- [ ] **Step 1: 寫失敗測試**

`src/components/organizer/OrdersSection.test.tsx`：

```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { initialOrders, items } from '../../data/demo'
import { buildOrganizerOrderSummary, type OrganizerOrderSummary } from '../../domain/adminOrders'
import { OrdersSection } from './OrdersSection'

const base = buildOrganizerOrderSummary({ orders: initialOrders, items, threshold: 100 })
const summary: OrganizerOrderSummary = {
  ...base,
  orderRows: base.orderRows.map((order, index) => ({
    ...order,
    orderId: `order-${index + 1}`,
    organizerNote: index === 0 ? '請放管理室' : '',
    orderedAt: `2026-09-24T1${index}:00:00.000Z`,
  })),
}

function renderOrders(props: Partial<Parameters<typeof OrdersSection>[0]> = {}) {
  return render(
    <OrdersSection
      campaignTitle="一涼製冰所"
      openedAt="2026-09-20T00:00:00.000Z"
      summary={summary}
      status="open"
      liveState="live"
      {...props}
    />,
  )
}

const rowOf = (name: RegExp) => screen.getByRole('rowheader', { name }).closest('tr') as HTMLElement

describe('OrdersSection', () => {
  it('shows the totals and each order with item tags, without any payment controls', () => {
    renderOrders()

    expect(screen.getByRole('heading', { level: 2, name: '訂單' })).toBeInTheDocument()
    const totals = screen.getByLabelText('訂單總覽')
    expect(within(totals).getByText('6 筆')).toBeInTheDocument()
    expect(within(totals).getByText('62 個')).toBeInTheDocument()
    expect(within(totals).getByText('$2,790')).toBeInTheDocument()
    const row = rowOf(/2K13\s*斯祈/)
    expect(within(row).getByText('B 2')).toHaveAttribute('title', '花生（招牌）')
    expect(within(row).getByText('D 2')).toBeInTheDocument()
    expect(within(row).getByText('6 個')).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: '付款' })).not.toBeInTheDocument()
    expect(screen.queryByText(/已付款|未付款/)).not.toBeInTheDocument()
  })

  it('uses the campaign quantity unit and marks extra items as priced separately', () => {
    const boxSummary = buildOrganizerOrderSummary({
      orders: initialOrders.map((order, index) => index === 0
        ? { ...order, customItems: [{ id: 'custom-1', name: '限定蛋糕', quantity: 2 }] }
        : order),
      items,
      threshold: 100,
      quantityUnit: '盒',
    })
    renderOrders({ summary: boxSummary })

    expect(within(screen.getByLabelText('訂單總覽')).getByText('62 盒')).toBeInTheDocument()
    const row = rowOf(/H11/)
    expect(within(row).getByText('限定蛋糕 ×2・另計')).toBeInTheDocument()
    expect(within(row).getByText('＋另計')).toBeInTheDocument()
  })

  it('keeps export disabled until the campaign closes', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn().mockResolvedValue(undefined)
    const { rerender } = renderOrders({ onExport })
    expect(screen.getByRole('button', { name: '匯出 Excel' })).toBeDisabled()
    expect(screen.getByText('結單後才能匯出')).toBeInTheDocument()

    rerender(<OrdersSection campaignTitle="一涼製冰所" openedAt="2026-09-20T00:00:00.000Z" summary={summary} status="closed" liveState="live" onExport={onExport} />)
    await user.click(screen.getByRole('button', { name: '匯出 Excel' }))
    expect(onExport).toHaveBeenCalledOnce()
  })

  it('searches by name or household and sorts by household or order time', async () => {
    const user = userEvent.setup()
    renderOrders()
    const names = () => screen.getAllByRole('rowheader').map((cell) => cell.textContent)

    expect(names()[0]).toMatch(/H11/)
    await user.click(screen.getByRole('radio', { name: '下單時間' }))
    expect(names()[0]).toMatch(/Lena/)

    await user.type(screen.getByRole('searchbox', { name: '搜尋訂單' }), '2k13')
    expect(names()).toHaveLength(1)
    expect(names()[0]).toMatch(/斯祈/)

    await user.clear(screen.getByRole('searchbox', { name: '搜尋訂單' }))
    await user.type(screen.getByRole('searchbox', { name: '搜尋訂單' }), '不存在的人')
    expect(screen.getByText('沒有符合的訂單。')).toBeInTheDocument()
  })

  it('edits an organizer note in place and saves with Enter', async () => {
    const user = userEvent.setup()
    const onSetOrderOrganizerNote = vi.fn().mockResolvedValue(undefined)
    renderOrders({ onSetOrderOrganizerNote })

    const edit = screen.getByRole('button', { name: '編輯 H11 備註' })
    expect(edit).toHaveTextContent('請放管理室')
    await user.click(edit)
    const input = screen.getByRole('textbox', { name: 'H11 備註' })
    expect(input).toHaveFocus()
    expect(input).toHaveAttribute('maxLength', '500')
    await user.clear(input)
    await user.type(input, '改放警衛室{Enter}')

    expect(onSetOrderOrganizerNote).toHaveBeenCalledWith('order-1', '改放警衛室')
    const saved = await screen.findByRole('button', { name: '編輯 H11 備註' })
    expect(saved).toHaveTextContent('改放警衛室')
    expect(saved).toHaveFocus()
  })

  it('cancels a note edit with Escape and saves on leaving the field', async () => {
    const user = userEvent.setup()
    const onSetOrderOrganizerNote = vi.fn().mockResolvedValue(undefined)
    renderOrders({ onSetOrderOrganizerNote })

    await user.click(screen.getByRole('button', { name: '編輯 1E7 備註' }))
    await user.type(screen.getByRole('textbox', { name: '1E7 備註' }), '不要存{Escape}')
    expect(onSetOrderOrganizerNote).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '編輯 1E7 備註' })).toHaveTextContent('新增備註')

    await user.click(screen.getByRole('button', { name: '編輯 2I7 備註' }))
    await user.type(screen.getByRole('textbox', { name: '2I7 備註' }), '放門口')
    await user.tab()
    expect(onSetOrderOrganizerNote).toHaveBeenCalledWith('order-3', '放門口')
  })

  it('keeps the note editor open with the error when saving fails', async () => {
    const user = userEvent.setup()
    renderOrders({ onSetOrderOrganizerNote: vi.fn().mockRejectedValue(new Error('儲存備註失敗：network')) })

    await user.click(screen.getByRole('button', { name: '編輯 H11 備註' }))
    await user.type(screen.getByRole('textbox', { name: 'H11 備註' }), '補充{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('儲存備註失敗：network')
    expect(screen.getByRole('textbox', { name: 'H11 備註' })).toHaveValue('請放管理室補充')
  })

  it('does not overwrite a note being typed when fresh order data arrives', async () => {
    const user = userEvent.setup()
    const { rerender } = renderOrders({ onSetOrderOrganizerNote: vi.fn() })

    await user.click(screen.getByRole('button', { name: '編輯 H11 備註' }))
    const input = screen.getByRole('textbox', { name: 'H11 備註' })
    await user.clear(input)
    await user.type(input, '正在輸入')
    const refreshed = { ...summary, orderRows: summary.orderRows.map((order) => order.orderId === 'order-1' ? { ...order, organizerNote: '別人改的' } : order) }
    rerender(<OrdersSection campaignTitle="一涼製冰所" openedAt="2026-09-20T00:00:00.000Z" summary={refreshed} status="open" liveState="live" onSetOrderOrganizerNote={vi.fn()} />)

    expect(screen.getByRole('textbox', { name: 'H11 備註' })).toHaveValue('正在輸入')
  })

  it('locks only the order row being updated', async () => {
    const user = userEvent.setup()
    let finish: (() => void) | undefined
    const onSetOrderOrganizerNote = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
    renderOrders({ onSetOrderOrganizerNote })

    await user.click(screen.getByRole('button', { name: '編輯 H11 備註' }))
    await user.type(screen.getByRole('textbox', { name: 'H11 備註' }), '！{Enter}')

    expect(rowOf(/H11/)).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('textbox', { name: 'H11 備註' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '編輯 1E7 備註' })).toBeEnabled()
    finish?.()
    await waitFor(() => expect(rowOf(/H11/)).not.toHaveAttribute('aria-busy'))
  })

  it('cancels a whole order only while open and only after confirmation', async () => {
    const user = userEvent.setup()
    const onCancelOrder = vi.fn().mockResolvedValue(undefined)
    const { rerender } = renderOrders({ onCancelOrder })

    await user.click(screen.getByRole('button', { name: '更多操作 H11・佩怡' }))
    await user.click(screen.getByRole('menuitem', { name: '取消 H11 訂單' }))
    const dialog = screen.getByRole('dialog', { name: '確認取消訂單' })
    expect(dialog).toHaveTextContent(/H11/)
    expect(dialog).not.toHaveTextContent(/付款/)
    expect(onCancelOrder).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '確認取消訂單' }))
    expect(onCancelOrder).toHaveBeenCalledWith('order-1')

    rerender(<OrdersSection campaignTitle="一涼製冰所" openedAt="2026-09-20T00:00:00.000Z" summary={summary} status="closed" liveState="live" onCancelOrder={onCancelOrder} />)
    expect(screen.queryByRole('button', { name: '更多操作 H11・佩怡' })).not.toBeInTheDocument()
  })

  it('labels orders from outside the community as 其他 and counts orders, not households', () => {
    const mixed: OrganizerOrderSummary = {
      ...summary,
      orderCount: 2,
      orderRows: [
        { ...summary.orderRows[0], orderId: 'o1', name: '甲', period: 2, unit: '2K13', householdKind: 'resident' },
        { ...summary.orderRows[0], orderId: 'o2', name: '丙', period: null, unit: null, householdKind: 'other' },
      ],
    }
    renderOrders({ summary: mixed, onSetOrderOrganizerNote: vi.fn() })

    expect(within(screen.getByLabelText('訂單總覽')).getByText('2 筆')).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: /其他\s*丙/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '編輯 其他 備註' })).toBeInTheDocument()
    expect(screen.queryByText(/null|NaN期/)).not.toBeInTheDocument()
  })

  it('explains an empty order list', () => {
    renderOrders({ summary: { ...summary, orderCount: 0, orderRows: [] } })
    expect(screen.getByText('還沒有人下單')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/components/organizer/OrdersSection.test.tsx`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作 `src/components/organizer/OrderNoteCell.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import type { OrganizerOrderRow } from '../../domain/adminOrders'

type OrderNoteCellProps = {
  order: OrganizerOrderRow
  controlLabel: string
  disabled: boolean
  onSave?: (note: string) => Promise<void>
  onSavingChange: (saving: boolean) => void
}

export function OrderNoteCell({ order, controlLabel, disabled, onSave, onSavingChange }: OrderNoteCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedNote, setSavedNote] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  // Set once Enter or Escape has decided this edit, so the blur that follows does not save again.
  const settledRef = useRef(false)
  const returnFocusRef = useRef(false)
  const note = savedNote ?? order.organizerNote

  // The reloaded server copy replaces the note shown right after saving.
  useEffect(() => { setSavedNote(null) }, [order.organizerNote])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])
  useEffect(() => {
    if (editing || !returnFocusRef.current) return
    returnFocusRef.current = false
    buttonRef.current?.focus()
  }, [editing])

  const start = () => {
    settledRef.current = false
    setDraft(note)
    setError('')
    setEditing(true)
  }

  const finish = (returnFocus: boolean) => {
    returnFocusRef.current = returnFocus
    setError('')
    setEditing(false)
  }

  const save = async (returnFocus: boolean): Promise<boolean> => {
    if (!onSave) return false
    if (draft === note) {
      finish(returnFocus)
      return true
    }
    setSaving(true)
    setError('')
    onSavingChange(true)
    try {
      await onSave(draft)
      setSavedNote(draft)
      finish(returnFocus)
      return true
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '儲存備註失敗')
      return false
    } finally {
      setSaving(false)
      onSavingChange(false)
    }
  }

  if (!editing) {
    return (
      <button
        ref={buttonRef}
        type="button"
        className="organizer-note-button"
        aria-label={`編輯 ${controlLabel} 備註`}
        disabled={disabled || !onSave}
        onClick={start}
      >
        {note || <span className="organizer-muted">新增備註</span>}
      </button>
    )
  }

  return (
    <div className="organizer-note-editor">
      <input
        ref={inputRef}
        className="ui-input"
        aria-label={`${controlLabel} 備註`}
        maxLength={500}
        value={draft}
        disabled={saving}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            settledRef.current = true
            void save(true).then((saved) => { if (!saved) settledRef.current = false })
          } else if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            settledRef.current = true
            finish(true)
          }
        }}
        onBlur={() => { if (!settledRef.current && !saving) void save(false) }}
      />
      {saving && <small role="status">儲存中…</small>}
      {error && <small className="organizer-note-error" role="alert">{error}</small>}
    </div>
  )
}
```

- [ ] **Step 4: 實作 `src/components/organizer/OrdersSection.tsx`**

```tsx
import { useState } from 'react'
import type { OrganizerOrderRow, OrganizerOrderSummary } from '../../domain/adminOrders'
import type { CampaignStatus } from '../../domain/orderWorkflow'
import { EmptyState } from '../ui/AsyncState'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { FeedbackMessage } from '../ui/FeedbackMessage'
import { Menu } from '../ui/Menu'
import { SegmentedControl } from '../ui/SegmentedControl'
import { ExportOrdersButton } from './ExportOrdersButton'
import { LiveStatus, type LiveState } from './LiveStatus'
import { OrderNoteCell } from './OrderNoteCell'
import {
  matchesOrderSearch, orderControlLabel, orderHouseholdLabel, orderItemChips, sortOrders, type OrderSort,
} from './orderView'

const currency = (amount: number) => `$${amount.toLocaleString('en-US')}`

type OrdersSectionProps = {
  campaignTitle: string
  openedAt: string | null
  summary: OrganizerOrderSummary
  status: CampaignStatus
  liveState: LiveState
  onRetrySync?: () => void
  onSetOrderOrganizerNote?: (orderId: string, note: string) => Promise<void>
  onCancelOrder?: (orderId: string) => Promise<void>
  onExport?: () => Promise<void>
}

export function OrdersSection({
  campaignTitle, openedAt, summary, status, liveState, onRetrySync, onSetOrderOrganizerNote, onCancelOrder, onExport,
}: OrdersSectionProps) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<OrderSort>('household')
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set())
  const [cancelTarget, setCancelTarget] = useState<OrganizerOrderRow | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const unit = summary.quantityUnit
  const rows = sortOrders(summary.orderRows.filter((order) => matchesOrderSearch(order, query)), sort)

  const setBusy = (orderId: string, busy: boolean) => setBusyIds((current) => {
    const next = new Set(current)
    if (busy) next.add(orderId)
    else next.delete(orderId)
    return next
  })

  const confirmCancel = async () => {
    if (!cancelTarget || !onCancelOrder || cancelling) return
    const target = cancelTarget
    setCancelling(true)
    setCancelError('')
    setBusy(target.orderId, true)
    try {
      await onCancelOrder(target.orderId)
      setCancelTarget(null)
    } catch (cancelFailure) {
      setCancelError(cancelFailure instanceof Error ? cancelFailure.message : '取消訂單失敗')
    } finally {
      setCancelling(false)
      setBusy(target.orderId, false)
    }
  }

  return (
    <section className="organizer-section organizer-orders" aria-labelledby="orders-heading">
      <div className="organizer-section-heading">
        <h2 id="orders-heading">訂單</h2>
        <LiveStatus state={liveState} onRetry={onRetrySync} />
        <ExportOrdersButton summary={summary} campaignTitle={campaignTitle} openedAt={openedAt} status={status} onExport={onExport} />
      </div>

      <dl className="organizer-order-totals" aria-label="訂單總覽">
        <div><dt>訂單</dt><dd>{summary.orderCount} 筆</dd></div>
        <div><dt>總數量</dt><dd>{summary.quantity} {unit}</dd></div>
        <div><dt>總額</dt><dd>{currency(summary.amount)}</dd></div>
      </dl>

      {summary.orderRows.length === 0 ? (
        <EmptyState title="還沒有人下單" description="把住戶連結分享到群組後，訂單會出現在這裡。" />
      ) : (
        <>
          <div className="organizer-toolbar">
            <input
              className="ui-input"
              type="search"
              aria-label="搜尋訂單"
              placeholder="搜尋名字或戶號"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <SegmentedControl
              label="訂單排序"
              value={sort}
              onChange={setSort}
              options={[{ value: 'household', label: '戶號' }, { value: 'orderedAt', label: '下單時間' }]}
            />
          </div>
          {rows.length === 0 ? <p className="organizer-muted">沒有符合的訂單。</p> : (
            <div className="organizer-table-wrap">
              <table className="organizer-table organizer-order-table" aria-label="訂單列表">
                <thead>
                  <tr>
                    <th scope="col">戶號・姓名</th>
                    <th scope="col">訂購內容</th>
                    <th scope="col">數量</th>
                    <th scope="col">金額</th>
                    <th scope="col">團主備註</th>
                    <th scope="col"><span className="ui-visually-hidden">操作</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((order) => {
                    const controlLabel = orderControlLabel(order)
                    const busy = busyIds.has(order.orderId)
                    const chips = orderItemChips(order, summary.itemRows)
                    return (
                      <tr key={order.orderId} aria-busy={busy || undefined}>
                        <th scope="row">
                          <span className="organizer-order-household">{orderHouseholdLabel(order)}</span>
                          {' '}<strong>{order.name}</strong>
                        </th>
                        <td data-label="訂購內容">
                          {chips.length === 0 ? <span className="organizer-muted">無正式品項</span> : (
                            <span className="organizer-chips">
                              {chips.map((chip) => (
                                <span key={chip.key} className={chip.custom ? 'organizer-chip is-custom' : 'organizer-chip'} title={chip.custom ? undefined : chip.name}>
                                  {chip.custom ? `${chip.label} ×${chip.quantity}・另計` : `${chip.label} ${chip.quantity}`}
                                </span>
                              ))}
                            </span>
                          )}
                        </td>
                        <td data-label="數量" className="ui-num">{order.quantity} {unit}</td>
                        <td data-label="金額" className="ui-num">
                          {currency(order.amount)}
                          {order.customItemSummary && <small className="organizer-muted"> ＋另計</small>}
                        </td>
                        <td data-label="團主備註">
                          <OrderNoteCell
                            order={order}
                            controlLabel={controlLabel}
                            disabled={busy}
                            onSave={onSetOrderOrganizerNote ? (note) => onSetOrderOrganizerNote(order.orderId, note) : undefined}
                            onSavingChange={(saving) => setBusy(order.orderId, saving)}
                          />
                        </td>
                        <td>
                          {status === 'open' && onCancelOrder && (
                            <Menu
                              size="sm"
                              label={`更多操作 ${controlLabel}・${order.name}`}
                              items={[{
                                label: '取消整筆訂單',
                                ariaLabel: `取消 ${controlLabel} 訂單`,
                                tone: 'danger',
                                disabled: busy,
                                onSelect: () => { setCancelError(''); setCancelTarget(order) },
                              }]}
                            />
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {cancelTarget && (
        <ConfirmDialog
          title="確認取消訂單"
          confirmLabel="確認取消訂單"
          cancelLabel="返回"
          busy={cancelling}
          onCancel={() => { setCancelError(''); setCancelTarget(null) }}
          onConfirm={() => { void confirmCancel() }}
        >
          <p>確定要整筆取消「{orderHouseholdLabel(cancelTarget)}・{cancelTarget.name}」的訂單嗎？共 {cancelTarget.quantity} {unit}、{currency(cancelTarget.amount)}。</p>
          <p>取消後訂單與明細直接刪除，無法復原。住戶若要重新下單，需自行再次送出。</p>
          {cancelError && <FeedbackMessage tone="error">{cancelError}</FeedbackMessage>}
        </ConfirmDialog>
      )}
    </section>
  )
}
```

注意：
- 測試 `edits an organizer note in place…` 要求儲存後焦點回到「編輯 H11 備註」鈕。`OrderNoteCell` 的 `returnFocusRef` 會在編輯結束的那次渲染後把焦點放回按鈕。
- 儲存時該列 `aria-busy`，其他列不受影響。

- [ ] **Step 5: 在 `organizer.css` 檔尾加入訂單樣式**

```css
/* Orders section: totals, toolbar, order table and the in-place note editor. */
.organizer-order-totals { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-5); margin: 0; }
.organizer-order-totals div { display: flex; align-items: baseline; gap: var(--space-2); }
.organizer-order-totals dt { color: var(--color-text-secondary); }
.organizer-order-totals dd { margin: 0; font-weight: var(--font-weight-strong); font-variant-numeric: tabular-nums; }
.organizer-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
.organizer-toolbar .ui-input { flex: 1 1 220px; max-width: 320px; }
.organizer-order-table th[scope="row"] { min-width: 140px; }
.organizer-order-household { display: block; color: var(--color-text-secondary); font-size: var(--font-size-caption); }
.organizer-note-button { display: inline-flex; align-items: center; min-height: 32px; max-width: 260px; padding: 0 var(--space-2); border: 1px dashed transparent; border-radius: var(--radius-control); background: transparent; color: var(--color-text); font: inherit; text-align: left; overflow-wrap: anywhere; cursor: text; }
.organizer-note-button:disabled { cursor: not-allowed; }
.organizer-note-editor { display: grid; gap: 4px; min-width: 180px; }
.organizer-note-editor small { font-size: var(--font-size-caption); }
.organizer-note-error { color: var(--color-danger); }

@media (hover: hover) {
  .organizer-note-button:not(:disabled):hover { border-color: var(--color-border-strong); }
}

@media (max-width: 1023px) {
  .organizer-note-button { min-height: var(--touch-target); }
}
```

- [ ] **Step 6: 確認通過**

Run: `npx vitest run src/components/organizer` → PASS，輸出沒有 act() 警告。
Run: `npx tsc -b` 與 `npm run lint` → 無錯誤、無警告。

若 `sorts … by order time` 的期望（`Lena` 在最前）與 demo 資料的戶號排序不同：
- 以 `sortOrders(…, 'household')` 的第 6 筆（`orderedAt` 最晚那筆）的名字為準修改期望值，並寫進回報。
- 要驗證的是「改成下單時間後，最新的一筆排第一」。

- [ ] **Step 7: Commit**

```bash
git add src/components/organizer
git commit -m "feat: add the orders section with in-place organizer notes"
```

---

### Task 4: 領取通知改為頁面內步驟

**Files:**
- Modify: `src/PickupNotificationPanel.tsx`（整檔改寫）
- Modify: `src/PickupNotificationPanel.css`（整檔改寫）
- Modify: `src/PickupNotificationPanel.test.tsx`

**Interfaces:**
- Consumes：`Button`（forwardRef）、`pickupNotificationAudienceLabel`、`pickupNotificationTemplate`、`formatResidentPeriod`
- Produces：props 完全不變（`PickupSection` 與 `NotificationTestLab` 都用它）。

畫面改為三個步驟：
1. **選擇通知對象：** 兩個「預覽…通知」按鈕，名稱不變。
2. **確認名單與訊息：** 可＠人數、訊息則數、名單、目前無法＠的名單、可編輯的訊息，以及「產生…指令並＠N位住戶」按鈕。
3. **複製指令到群組：** 指令、「複製指令」、「此頁尚未代表通知已發送」，以及「完成」按鈕。

焦點依步驟移動：
- 讀取名單後，焦點移到第 2 步標題。
- 產生指令後，焦點移到「複製指令」。
- 產生失敗時，焦點移到產生按鈕。
- 「重新選擇」或「完成」後，焦點回到第一個預覽按鈕。

名單不再顯示付款狀態。

- [ ] **Step 1: 修改測試**

在 `src/PickupNotificationPanel.test.tsx`：

1. 整個 `traps focus in the modal and restores trigger focus on Escape` 換成下面三個測試。
   - 原測試驗證對話框的焦點圈與 Esc；對話框移除後，改驗證步驟間的焦點移動。
   - 另外驗證「完成後重新選擇對象不沿用舊的預覽代碼」（Review Focus 5）。

   ```tsx
     it('moves focus through the steps and starts over without reusing the previous preview', async () => {
       const user = userEvent.setup()
       const onPreview = vi.fn()
         .mockResolvedValueOnce(preview)
         .mockResolvedValueOnce({ ...preview, previewToken: 'second-token' })
       const onCreateCommand = vi.fn().mockResolvedValue(command)
       render(<PickupNotificationPanel {...baseProps} onPreview={onPreview} onCreateCommand={onCreateCommand} />)

       await user.click(screen.getByRole('button', { name: '預覽二期通知' }))
       expect(await screen.findByRole('heading', { name: '2. 確認名單與訊息' })).toHaveFocus()
       expect(screen.getByText('已選擇：二期')).toBeInTheDocument()

       await user.click(screen.getByRole('button', { name: '產生正式群組指令並＠2位住戶' }))
       expect(await screen.findByRole('button', { name: '複製指令' })).toHaveFocus()
       expect(screen.getByText(/此頁尚未代表通知已發送/)).toBeInTheDocument()

       await user.click(screen.getByRole('button', { name: '完成' }))
       expect(screen.getByRole('button', { name: '預覽一期、三期通知' })).toHaveFocus()
       expect(screen.queryByRole('button', { name: '複製指令' })).not.toBeInTheDocument()

       await user.click(screen.getByRole('button', { name: '預覽一期、三期通知' }))
       await user.click(await screen.findByRole('button', { name: '產生正式群組指令並＠2位住戶' }))
       expect(onCreateCommand).toHaveBeenLastCalledWith('phase13', expect.any(String), 'second-token')
     })

     it('hides itself as soon as the campaign is reopened and starts over when closed again', async () => {
       const user = userEvent.setup()
       const { rerender } = render(<PickupNotificationPanel {...baseProps} onPreview={vi.fn().mockResolvedValue(preview)} />)
       await user.click(screen.getByRole('button', { name: '預覽二期通知' }))
       expect(await screen.findByRole('heading', { name: '2. 確認名單與訊息' })).toBeInTheDocument()

       rerender(<PickupNotificationPanel {...baseProps} campaignStatus="open" onPreview={vi.fn()} />)
       expect(screen.queryByRole('heading', { name: 'LINE領取通知' })).not.toBeInTheDocument()

       rerender(<PickupNotificationPanel {...baseProps} onPreview={vi.fn()} />)
       expect(screen.queryByRole('heading', { name: '2. 確認名單與訊息' })).not.toBeInTheDocument()
       expect(screen.getByRole('button', { name: '預覽二期通知' })).toBeEnabled()
     })

     it('never shows payment status in the recipient lists', async () => {
       const user = userEvent.setup()
       render(<PickupNotificationPanel {...baseProps} onPreview={vi.fn().mockResolvedValue(preview)} />)
       await user.click(screen.getByRole('button', { name: '預覽一期、三期通知' }))
       expect(await screen.findByText('一期・A1・王小美')).toBeInTheDocument()
       // Exact matches: the default message body itself mentions 尚未付款, which is the organizer's own wording.
       expect(screen.queryByText('已付款')).not.toBeInTheDocument()
       expect(screen.queryByText('未付款')).not.toBeInTheDocument()
     })
   ```

2. 其他測試只要沒有查找 `dialog`、「關閉領取通知」、「取消」就不動。
   - 若有查找「取消」，改成「重新選擇」。
   - 若有查找「關閉」，改成「完成」。
   - 寫進回報。

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/PickupNotificationPanel.test.tsx`
Expected: FAIL（沒有步驟標題、仍顯示付款狀態）。

- [ ] **Step 3: 改寫 `src/PickupNotificationPanel.tsx`**

```tsx
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from './components/ui/Button'
import type { CampaignStatus } from './domain/orderWorkflow'
import {
  pickupNotificationAudienceLabel,
  pickupNotificationTemplate,
  type PickupNotificationAudience,
  type PickupNotificationRecipient,
} from './domain/pickupNotification'
import type { PickupNotificationCommand, PickupNotificationResponse } from './services/pickupNotificationGateway'
import { formatResidentPeriod } from './domain/household'
import './PickupNotificationPanel.css'

type PickupNotificationPanelProps = {
  campaignId: string
  campaignTitle: string
  campaignStatus: CampaignStatus
  mode?: 'production' | 'test'
  excludedOtherCount?: number
  onPreview: (audience: PickupNotificationAudience, message: string) => Promise<PickupNotificationResponse>
  onCreateCommand: (audience: PickupNotificationAudience, message: string, previewToken: string) => Promise<PickupNotificationCommand>
}

type FocusTarget = 'step-two' | 'copy' | 'command' | 'first-choice'

function recipientLabel(recipient: PickupNotificationRecipient): string {
  return `${formatResidentPeriod(recipient.period)}・${recipient.unit}・${recipient.displayName}`
}

function RecipientList({ recipients }: { recipients: PickupNotificationRecipient[] }) {
  return (
    <ul className="pickup-recipient-list">
      {recipients.map((recipient) => (
        <li key={recipient.memberCode}>
          {recipient.pictureUrl
            ? <img src={recipient.pictureUrl} alt="" />
            : <span className="pickup-recipient-avatar" aria-hidden="true">{recipient.displayName.slice(0, 1)}</span>}
          <strong>{recipientLabel(recipient)}</strong>
        </li>
      ))}
    </ul>
  )
}

function PickupNotificationPanel({ campaignId, campaignTitle, campaignStatus, mode = 'production', excludedOtherCount, onPreview, onCreateCommand }: PickupNotificationPanelProps) {
  const isTest = mode === 'test'
  const messageLimit = 4500 - (isTest ? '【測試】\n'.length : 0)
  const idPrefix = useId()
  const panelHeadingId = `${idPrefix}-panel-heading`
  const stepOneId = `${idPrefix}-step-one`
  const stepTwoId = `${idPrefix}-step-two`
  const stepThreeId = `${idPrefix}-step-three`
  const mentionableHeadingId = `${idPrefix}-mentionable-heading`
  const unavailableHeadingId = `${idPrefix}-unavailable-heading`
  const [audience, setAudience] = useState<PickupNotificationAudience | null>(null)
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<PickupNotificationResponse | null>(null)
  const [command, setCommand] = useState<PickupNotificationCommand | null>(null)
  const [copyStatus, setCopyStatus] = useState('')
  const [busy, setBusy] = useState<'preview' | 'create-command' | null>(null)
  const [busyAudience, setBusyAudience] = useState<PickupNotificationAudience | null>(null)
  const [error, setError] = useState('')
  const firstChoiceRef = useRef<HTMLButtonElement>(null)
  const stepTwoHeadingRef = useRef<HTMLHeadingElement>(null)
  const commandButtonRef = useRef<HTMLButtonElement>(null)
  const copyButtonRef = useRef<HTMLButtonElement>(null)
  const operationLock = useRef(false)
  const focusTargetRef = useRef<FocusTarget | null>(null)

  // Reopening the campaign discards any preview token or command from the closed period.
  useEffect(() => {
    if (campaignStatus !== 'open') return
    setAudience(null)
    setPreview(null)
    setMessage('')
    setCommand(null)
    setCopyStatus('')
    setError('')
  }, [campaignStatus])

  // Focus follows the step the organizer has just reached.
  useEffect(() => {
    const target = focusTargetRef.current
    if (!target || busy !== null) return
    focusTargetRef.current = null
    const elements: Record<FocusTarget, HTMLElement | null> = {
      'step-two': stepTwoHeadingRef.current,
      copy: copyButtonRef.current,
      command: commandButtonRef.current,
      'first-choice': firstChoiceRef.current,
    }
    elements[target]?.focus()
  }, [audience, busy, command, error, preview])

  if (campaignStatus === 'open') return null

  const outboundMessage = (body: string) => isTest ? `【測試】\n${body}` : body

  const openPreview = async (nextAudience: PickupNotificationAudience) => {
    if (operationLock.current) return
    operationLock.current = true
    const nextMessage = pickupNotificationTemplate(nextAudience, campaignTitle)
    setBusy('preview')
    setBusyAudience(nextAudience)
    setError('')
    setCommand(null)
    setCopyStatus('')
    try {
      const result = await onPreview(nextAudience, outboundMessage(nextMessage))
      setAudience(nextAudience)
      setMessage(nextMessage)
      setPreview(result)
      focusTargetRef.current = 'step-two'
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : '目前無法讀取通知名單，請稍後再試。')
    } finally {
      operationLock.current = false
      setBusy(null)
      setBusyAudience(null)
    }
  }

  const createCommand = async () => {
    if (!audience || !preview?.previewToken || operationLock.current || !message.trim()) return
    operationLock.current = true
    setBusy('create-command')
    setError('')
    setCopyStatus('')
    try {
      setCommand(await onCreateCommand(audience, outboundMessage(message), preview.previewToken))
      focusTargetRef.current = 'copy'
    } catch (commandError) {
      setError(commandError instanceof Error ? commandError.message : '目前無法產生通知指令，請稍後再試。')
      focusTargetRef.current = 'command'
    } finally {
      operationLock.current = false
      setBusy(null)
    }
  }

  const copyCommand = async () => {
    if (!command) return
    setError('')
    try {
      await navigator.clipboard.writeText(command.command)
      setCopyStatus(isTest ? '指令已複製，等待您貼到測試群組。' : '指令已複製，等待您貼到正式社區群組。')
    } catch {
      setError('無法自動複製，請手動選取指令複製。')
    }
  }

  const startOver = () => {
    if (operationLock.current) return
    setAudience(null)
    setPreview(null)
    setMessage('')
    setError('')
    setCommand(null)
    setCopyStatus('')
    focusTargetRef.current = 'first-choice'
  }

  const chosen = audience && preview

  return (
    <section className="pickup-notification-panel" data-campaign-id={campaignId} aria-labelledby={panelHeadingId}>
      <div>
        <h3 id={panelHeadingId}>{isTest ? `LINE通知測試：${campaignTitle}` : 'LINE領取通知'}</h3>
        <p>{isTest ? '發送方式：複製一次性測試指令並貼到測試群組' : '發送方式：複製一次性指令並貼到正式社區群組'}</p>
      </div>
      {Boolean(excludedOtherCount) && <p className="pickup-notification-excluded">本團另有 {excludedOtherCount} 位「其他」身分的訂購者不會收到通知，請自行聯繫。</p>}

      <ol className="pickup-steps">
        <li className="pickup-step" data-state={chosen ? 'done' : 'current'} aria-labelledby={stepOneId}>
          <h4 id={stepOneId}>1. 選擇通知對象</h4>
          {chosen ? (
            <div className="pickup-step-actions">
              <p>已選擇：{pickupNotificationAudienceLabel(audience)}</p>
              <Button variant="utility" size="sm" disabled={busy !== null} onClick={startOver}>重新選擇</Button>
            </div>
          ) : (
            <div className="pickup-step-actions" aria-busy={busy === 'preview'}>
              <Button ref={firstChoiceRef} variant="secondary" aria-label={isTest ? `預覽${campaignTitle}一期、三期測試通知` : undefined} disabled={busy !== null} onClick={() => { void openPreview('phase13') }}>
                {busy === 'preview' && busyAudience === 'phase13' ? '讀取一期、三期名單中…' : `預覽一期、三期${isTest ? '測試' : ''}通知`}
              </Button>
              <Button variant="secondary" aria-label={isTest ? `預覽${campaignTitle}二期測試通知` : undefined} disabled={busy !== null} onClick={() => { void openPreview('phase2') }}>
                {busy === 'preview' && busyAudience === 'phase2' ? '讀取二期名單中…' : `預覽二期${isTest ? '測試' : ''}通知`}
              </Button>
            </div>
          )}
          {error && !chosen && <p className="pickup-notification-error" role="alert">{error}</p>}
        </li>

        {chosen && (
          <li className="pickup-step" data-state={command ? 'done' : 'current'} aria-labelledby={stepTwoId}>
            <h4 id={stepTwoId} ref={stepTwoHeadingRef} tabIndex={-1}>2. 確認名單與訊息</h4>
            <section aria-labelledby={mentionableHeadingId}>
              <h5 id={mentionableHeadingId}>可＠{preview.mentionableCount}位</h5>
              <p>將分成{preview.messageCount}則LINE訊息回覆。</p>
              {preview.mentionableCount > 0
                ? <RecipientList recipients={preview.mentionableRecipients} />
                : <p className="pickup-empty-state">目前沒有符合條件且仍在群組中的購買者，因此不能產生指令。</p>}
            </section>
            {preview.unavailableRecipients.length > 0 && (
              <section className="pickup-unavailable" aria-labelledby={unavailableHeadingId}>
                <h5 id={unavailableHeadingId}>以下{preview.unavailableRecipients.length}位目前無法＠</h5>
                <p>可能已不在通知群組中；本次不會＠這些住戶。</p>
                <RecipientList recipients={preview.unavailableRecipients} />
              </section>
            )}
            <label className="pickup-message-field">
              <span>{isTest ? '測試通知正文' : '通知內容'}</span>
              {isTest && <small>系統回覆時會自動加上「【測試】」前綴。</small>}
              <textarea aria-label={isTest ? '測試通知正文' : '通知內容'} value={message} maxLength={messageLimit} rows={8} disabled={busy === 'create-command' || command !== null} onChange={(event) => setMessage(event.target.value)} />
            </label>
            {error && <p className="pickup-notification-error" role="alert">{error}</p>}
            {!command && (
              <div className="pickup-step-actions">
                <Button ref={commandButtonRef} disabled={busy !== null || preview.mentionableCount === 0 || !preview.previewToken || !message.trim()} onClick={() => { void createCommand() }}>
                  {busy === 'create-command' ? '產生指令中…' : `產生${isTest ? '測試' : '正式'}群組指令並＠${preview.mentionableCount}位住戶`}
                </Button>
              </div>
            )}
          </li>
        )}

        {chosen && command && (
          <li className="pickup-step" data-state="current" aria-labelledby={stepThreeId}>
            <h4 id={stepThreeId}>3. 複製指令到群組</h4>
            <section className="pickup-command-result" aria-label="一次性LINE群組指令">
              <strong>{isTest ? '測試群組指令已產生' : '正式群組指令已產生'}</strong>
              <p>請複製並貼到{isTest ? '測試群組' : '正式社區群組'}。此頁尚未代表通知已發送。</p>
              <input className="ui-input" aria-label="一次性LINE群組指令" readOnly value={command.command} onFocus={(event) => event.currentTarget.select()} />
              <div className="pickup-step-actions">
                <Button ref={copyButtonRef} onClick={() => { void copyCommand() }}>複製指令</Button>
                <Button variant="secondary" onClick={startOver}>完成</Button>
              </div>
              {copyStatus && <p className="pickup-notification-success" role="status">{copyStatus}</p>}
            </section>
          </li>
        )}
      </ol>
      <span className="pickup-sr-status" aria-live="polite">
        {busy === 'preview' ? `正在讀取${busyAudience ? pickupNotificationAudienceLabel(busyAudience) : ''}名單` : busy === 'create-command' ? '正在產生一次性群組指令' : ''}
      </span>
    </section>
  )
}

export default PickupNotificationPanel
```

說明：
- 第 3 步出現後，第 2 步的錯誤訊息仍顯示在第 2 步。
- 複製失敗的訊息「無法自動複製…」也用同一個 `error`，會顯示在第 2 步的錯誤位置。
- 原測試 `keeps a selectable command when clipboard permission fails` 只查找 `role="alert"`，不受位置影響。

- [ ] **Step 4: 改寫 `src/PickupNotificationPanel.css`**

```css
/* LINE pickup notification: three in-page steps (audience → list and message → command). */
.pickup-notification-panel { display: grid; gap: var(--space-3); }
.pickup-notification-panel h3 { margin: 0; font-size: var(--font-size-base); font-weight: var(--font-weight-strong); }
.pickup-notification-panel > div > p { margin: 0; color: var(--color-text-secondary); }
.pickup-notification-excluded { margin: 0; color: var(--color-warning); }
.pickup-steps { display: grid; gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
.pickup-step { display: grid; gap: var(--space-2); padding: var(--space-3) var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-surface); background: var(--color-surface); }
.pickup-step[data-state="done"] { background: var(--color-surface-subtle); }
.pickup-step h4, .pickup-step h5 { margin: 0; font-size: var(--font-size-dense); font-weight: var(--font-weight-strong); }
.pickup-step h4:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
.pickup-step p { margin: 0; }
.pickup-step section { display: grid; gap: var(--space-2); }
.pickup-step-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.pickup-recipient-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.pickup-recipient-list li { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.pickup-recipient-list strong { font-weight: var(--font-weight-regular); overflow-wrap: anywhere; }
.pickup-recipient-list img, .pickup-recipient-avatar { flex: none; width: 28px; height: 28px; border-radius: 50%; object-fit: cover; }
.pickup-recipient-avatar { display: grid; place-items: center; background: var(--color-neutral-subtle); font-size: var(--font-size-caption); }
.pickup-unavailable { padding-top: var(--space-2); border-top: 1px solid var(--color-divider); }
.pickup-empty-state { color: var(--color-text-secondary); }
.pickup-message-field { display: grid; gap: var(--space-1); }
.pickup-message-field span { font-weight: var(--font-weight-strong); }
.pickup-message-field small { color: var(--color-text-secondary); font-size: var(--font-size-caption); }
.pickup-message-field textarea { width: 100%; min-height: 160px; padding: var(--space-2); border: 1px solid var(--color-border-strong); border-radius: var(--radius-control); color: var(--color-text); font: inherit; resize: vertical; }
.pickup-command-result .ui-input { width: 100%; }
.pickup-notification-error { color: var(--color-danger); }
.pickup-notification-success { color: var(--color-success); }
.pickup-sr-status { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
```

- [ ] **Step 5: 確認通過**

Run: `npx vitest run src/PickupNotificationPanel.test.tsx src/NotificationTestLab.test.tsx src/components/organizer` → PASS。
Run: `npx tsc -b` 與 `npm run lint` → 無錯誤、無警告。

- [ ] **Step 6: Commit**

```bash
git add src/PickupNotificationPanel.tsx src/PickupNotificationPanel.css src/PickupNotificationPanel.test.tsx
git commit -m "feat: turn pickup notifications into in-page steps without payment status"
```

---

### Task 5: 把新分區接進工作區，移除舊訂單面板

**Files:**
- Modify: `src/components/organizer/workspaceSections.ts`、`WorkspaceRail.tsx`、`CampaignWorkspace.tsx`、`organizerWorkspace.test.tsx`
- Modify: `src/AdminApp.tsx`、`src/AdminApp.css`、`src/AdminApp.test.tsx`
- Modify: `src/LocalLiveApps.tsx`、`src/LocalLiveApps.test.tsx`
- Modify: `src/RuntimeApp.tsx`、`src/RuntimeApp.test.tsx`
- Delete: `src/AdminOrdersPanel.tsx`、`src/AdminOrdersPanel.css`、`src/AdminOrdersPanel.test.tsx`

**Interfaces:**
- Consumes：
  - Task 2：`OverviewSection`、`LiveState`
  - Task 3：`OrdersSection`
- Produces（Task 6、7 使用）：
  - `resolveWorkspaceSection(requested: WorkspaceSection | null, published: boolean, status: CampaignStatus): WorkspaceSection`
  - `sectionUnavailableReason(section: WorkspaceSection, status, published)`
  - `LocalLiveAdminApp` 裡的 `reloadOrderSummary`（不變）
  - 分區渲染位置（Task 6 在此把 `liveState` 換成真實狀態）

**預設分區規則：**
- 草稿：一律顯示「內容設定」。
- 已發布且網址沒有分區：
  - 開團中 → 「概況」；
  - 已結單 → 「訂單」。
- 網址有分區就照網址。「領取通知」在開團中仍可進入，只顯示「結單後才能使用領取通知。」，與現在相同。

`ShownSection` 別名刪除，一律用 `WorkspaceSection`。

`AdminApp` 只剩內容設定：
- `section` 型別改為 `'content' | null`。
- 移除 `orderSummary`、`campaignTitle`、`onSetOrderPaid`、`onSetOrderOrganizerNote`、`onCancelOrder` 與 demo 訂單統計。
- `campaignStatus` 保留（住戶端預覽的狀態文字用它）。

`LiveAdminOrdersRepository` 型別與 gateway 的 `setOrderPaid` 不動（`src/services/**` 不可修改），只是前端不再呼叫。

- [ ] **Step 1: 修改工作區測試（先失敗）**

在 `src/components/organizer/organizerWorkspace.test.tsx`：

1. 第一個 `describe('workspace sections')` 的兩個測試整個換成：

   ```tsx
     it('opens drafts on content, open campaigns on the overview and closed campaigns on orders', () => {
       expect(resolveWorkspaceSection(null, false, 'open')).toBe('content')
       expect(resolveWorkspaceSection('overview', false, 'open')).toBe('content')
       expect(resolveWorkspaceSection('orders', false, 'open')).toBe('content')
       expect(resolveWorkspaceSection(null, true, 'open')).toBe('overview')
       expect(resolveWorkspaceSection(null, true, 'closed')).toBe('orders')
       expect(resolveWorkspaceSection(null, true, 'arrived')).toBe('orders')
       expect(resolveWorkspaceSection('overview', true, 'closed')).toBe('overview')
       expect(resolveWorkspaceSection('content', true, 'open')).toBe('content')
       expect(resolveWorkspaceSection('pickup', true, 'open')).toBe('pickup')
     })

     it('explains why a section is unavailable', () => {
       expect(sectionUnavailableReason('overview', 'open', false)).toBe('發布後可用')
       expect(sectionUnavailableReason('orders', 'open', false)).toBe('發布後可用')
       expect(sectionUnavailableReason('pickup', 'open', false)).toBe('發布後可用')
       expect(sectionUnavailableReason('pickup', 'open', true)).toBe('結單後才能使用')
       expect(sectionUnavailableReason('pickup', 'closed', true)).toBeNull()
       expect(sectionUnavailableReason('content', 'open', false)).toBeNull()
       expect(sectionUnavailableReason('overview', 'open', true)).toBeNull()
       expect(sectionUnavailableReason('orders', 'open', true)).toBeNull()
     })
   ```

2. `shows the campaign, its schedule and the sections an open campaign can use` 的最後一行：

   ```tsx
       expect(within(nav).queryByText('概況')).not.toBeInTheDocument()
   ```

   換成：

   ```tsx
       const overview = within(nav).getByRole('link', { name: '概況' })
       expect(overview).toHaveAttribute('href', '/admin/campaign/campaign-1/overview')
       expect(overview).not.toHaveAttribute('aria-current')
       expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(['概況', '訂單 6', '內容設定'])
   ```

3. `marks a draft and keeps order and pickup sections unavailable until publishing`：
   - 測試名稱改為 `marks a draft and keeps overview, order and pickup sections unavailable until publishing`。
   - `expect(screen.getAllByText('發布後可用')).toHaveLength(2)` 改為 `toHaveLength(3)`。
   - 在它上一行加 `expect(screen.queryByRole('link', { name: '概況' })).not.toBeInTheDocument()`。

- [ ] **Step 2: 修改 `AdminApp.test.tsx`（先失敗）**

1. `shows only the section chosen by the workspace and keeps the draft while switching` 換成下面這版。原測試驗證的「切換分區不丟草稿」仍由這版與 `LocalLiveApps.test.tsx` 的 `keeps unsaved content edits while switching workspace sections` 驗證。

   ```tsx
     it('shows the editor only in the content section and keeps the draft while hidden', async () => {
       const user = userEvent.setup()
       const { rerender } = render(<AdminApp section="content" />)
       const title = screen.getByRole('textbox', { name: '團購標題' })
       await user.clear(title)
       await user.type(title, '切換前的新標題')

       rerender(<AdminApp section={null} />)
       expect(screen.queryByRole('textbox', { name: '團購標題' })).not.toBeInTheDocument()
       expect(screen.queryByRole('heading', { name: /訂單/ })).not.toBeInTheDocument()

       rerender(<AdminApp section="content" />)
       expect(screen.getByRole('textbox', { name: '團購標題' })).toHaveValue('切換前的新標題')
       expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
       expect(screen.queryByRole('button', { name: '登出' })).not.toBeInTheDocument()
     })
   ```

2. 刪除下面兩個測試：
   - `uses the loaded campaign title for Excel export without a duplicate title prop`：匯出已由 Task 2 `ExportOrdersButton` 與 Task 3 `OrdersSection` 測試驗證。
   - `lets organizers cancel a resident order from the orders workspace`：由 Task 3 `cancels a whole order only while open…` 與本 Task 改寫的 `LocalLiveApps` 取消測試驗證。
3. 其餘測試中的 `orderSummary={null}` 屬性全部刪除（該 prop 不再存在）。

- [ ] **Step 3: 修改 `LocalLiveApps.test.tsx`（先失敗）**

1. `keeps unsaved content edits while switching workspace sections` 中：

   ```tsx
       rerender(<LocalLiveAdminApp {...props} section="orders" />)
       expect(screen.getByRole('heading', { name: '訂單統計' })).toBeInTheDocument()
   ```

   換成：

   ```tsx
       rerender(<LocalLiveAdminApp {...props} section="orders" />)
       expect(screen.getByRole('heading', { level: 2, name: '訂單' })).toBeInTheDocument()
       rerender(<LocalLiveAdminApp {...props} section="overview" />)
       expect(screen.getByRole('heading', { level: 2, name: '概況' })).toBeInTheDocument()
   ```

2. 在那個測試之後找到用 `標記 H11 已付款` 的測試（它先驗證 `loadSummary` 的參數，再標記付款並驗證重新載入）：
   - 名稱改為 `loads the order summary with the published threshold and reloads it after saving a note`。
   - `expect(await screen.findByRole('heading', { name: '訂單統計' }))` 改為 `expect(await screen.findByRole('heading', { level: 2, name: '訂單' }))`。
   - 兩行付款操作：

     ```tsx
         await user.click(screen.getByRole('button', { name: '標記 H11 已付款' }))
         await user.click(screen.getByRole('button', { name: '確認標記已付款' }))
     ```

     換成：

     ```tsx
         await user.click(screen.getByRole('button', { name: '編輯 H11 備註' }))
         await user.type(screen.getByRole('textbox', { name: 'H11 備註' }), '放管理室{Enter}')
         await waitFor(() => expect(workflowRepository.setOrderOrganizerNote).toHaveBeenCalledWith(expect.any(String), '放管理室'))
         expect(workflowRepository.setOrderPaid).not.toHaveBeenCalled()
     ```

   - 後面 `loadSummary` 呼叫兩次與參數的斷言不動。
3. `cancels a resident order through the live organizer gateway and reloads the summary`：
   - `findByRole('heading', { name: '訂單統計' })` 改為 `findByRole('heading', { level: 2, name: '訂單' })`。
   - `await user.click(screen.getByRole('button', { name: '取消 H11 訂單' }))` 換成：

     ```tsx
         await user.click(screen.getByRole('button', { name: '更多操作 H11・佩怡' }))
         await user.click(screen.getByRole('menuitem', { name: '取消 H11 訂單' }))
     ```

4. 在同一個 `describe` 內新增：

   ```tsx
     it('opens an open published campaign on its overview and a closed one on its orders', async () => {
       const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
       const { client } = authClient(session)
       const repository: LiveAdminRepository = {
         loadPublished: vi.fn().mockResolvedValue(published),
         loadOptionalPublished: vi.fn().mockResolvedValue(published),
         loadOptionalDraft: vi.fn().mockResolvedValue(null),
         saveDraft: vi.fn(),
         publish: vi.fn(),
       }
       const { unmount } = render(<LocalLiveAdminApp client={client} campaignId="campaign-1" repository={repository} ordersRepository={ordersRepository()} />)
       expect(await screen.findByRole('heading', { level: 2, name: '概況' })).toBeInTheDocument()
       expect(screen.queryByRole('textbox', { name: '團購標題' })).not.toBeInTheDocument()
       unmount()

       const closedOrders = { ...ordersRepository(), loadCampaignStatus: vi.fn().mockResolvedValue('closed') }
       render(<LocalLiveAdminApp client={client} campaignId="campaign-1" repository={repository} ordersRepository={closedOrders} />)
       expect(await screen.findByRole('heading', { level: 2, name: '訂單' })).toBeInTheDocument()
       expect(screen.getByRole('button', { name: '匯出 Excel' })).toBeEnabled()
     })
   ```

   這個測試沒有包 `OrganizerNavigationProvider`：
   - 若 `CampaignWorkspace` 的網址替換在沒有 provider 時會拋錯，就比照同檔其他渲染工作區的測試包 provider（`navigate={vi.fn()}`）。
   - 寫進回報。

- [ ] **Step 4: 修改 `RuntimeApp.test.tsx`（先失敗）**

1. `moves from the organizer home into a campaign workspace and back without reloading`：

   ```tsx
       await waitFor(() => expect(window.location.pathname).toBe(`/admin/campaign/${campaignId}/orders`))
       expect(screen.getByRole('heading', { name: '訂單統計' })).toBeInTheDocument()
   ```

   換成：

   ```tsx
       await waitFor(() => expect(window.location.pathname).toBe(`/admin/campaign/${campaignId}/overview`))
       expect(screen.getByRole('heading', { level: 2, name: '概況' })).toBeInTheDocument()
       expect(screen.queryByText('即時更新')).not.toBeInTheDocument()

       await user.click(screen.getByRole('link', { name: '訂單 6' }))
       expect(window.location.pathname).toBe(`/admin/campaign/${campaignId}/orders`)
       expect(screen.getByRole('heading', { level: 2, name: '訂單' })).toBeInTheDocument()
       await user.click(screen.getByRole('button', { name: '編輯 H11 備註' }))
       await user.type(screen.getByRole('textbox', { name: 'H11 備註' }), '示範備註{Enter}')
       expect(await screen.findByRole('button', { name: '編輯 H11 備註' })).toHaveTextContent('示範備註')
   ```

2. `keeps focus on the campaign heading through the follow-up URL replace that fills in the default section` 的 `/orders` 改成 `/overview`。

- [ ] **Step 5: 確認測試失敗**

Run: `npx vitest run src/components/organizer/organizerWorkspace.test.tsx src/AdminApp.test.tsx src/LocalLiveApps.test.tsx src/RuntimeApp.test.tsx`

Expected: FAIL：
- `resolveWorkspaceSection` 少參數；
- 沒有「概況」連結；
- 「訂單」標題不存在；
- `AdminApp` 仍渲染訂單。

- [ ] **Step 6: 改 `src/components/organizer/workspaceSections.ts`**

整檔換成：

```ts
import type { CampaignStatus } from '../../domain/orderWorkflow'
import type { WorkspaceSection } from '../../routing'

// Drafts only have content settings; a bare address opens where the organizer works next:
// the overview while taking orders, the order list once closed.
export function resolveWorkspaceSection(requested: WorkspaceSection | null, published: boolean, status: CampaignStatus): WorkspaceSection {
  if (!published) return 'content'
  if (requested === null) return status === 'open' ? 'overview' : 'orders'
  return requested
}

export function sectionUnavailableReason(section: WorkspaceSection, status: CampaignStatus, published: boolean): string | null {
  if (section === 'content') return null
  if (!published) return '發布後可用'
  if (section === 'pickup' && status === 'open') return '結單後才能使用'
  return null
}
```

- [ ] **Step 7: 改 `WorkspaceRail.tsx` 與 `CampaignWorkspace.tsx`**

`WorkspaceRail.tsx`：
- import 改為 `import { sectionUnavailableReason } from './workspaceSections'`，並在 routing 的 import 加上 `type WorkspaceSection`：`import { campaignSectionPath, type WorkspaceSection } from '../../routing'`。
- `section: ShownSection` 改為 `section: WorkspaceSection`。
- `NAV_ITEMS` 改為：

```tsx
const NAV_ITEMS: Array<{ section: WorkspaceSection; label: string }> = [
  { section: 'overview', label: '概況' },
  { section: 'orders', label: '訂單' },
  { section: 'content', label: '內容設定' },
  { section: 'pickup', label: '領取通知' },
]
```

`CampaignWorkspace.tsx`：
- 刪除 `import type { ShownSection } from './workspaceSections'`。
- `section: ShownSection` 改為 `section: WorkspaceSection`。`WorkspaceSection` 已經從 routing import。

- [ ] **Step 8: 精簡 `src/AdminApp.tsx`**

1. 刪除以下 import：
   - `import AdminOrdersPanel from './AdminOrdersPanel'`
   - `import { buildOrganizerOrderSummary, type OrganizerOrderSummary } from './domain/adminOrders'`

   `import { campaign, initialOrders, items } from './data/demo'` 改為 `import { campaign, items } from './data/demo'`。
2. 刪除 `const demoOrderSummary = buildOrganizerOrderSummary({ … })` 整段。
3. `AdminAppProps`：
   - 刪除 `orderSummary`、`campaignTitle`、`onSetOrderPaid`、`onSetOrderOrganizerNote`、`onCancelOrder` 五行。
   - `section?: 'content' | 'orders' | null` 改為 `section?: 'content' | null`。
4. 函式參數解構刪除同樣五個名稱。
5. 刪除 `const resolvedOrderSummary = …` 一行。
6. JSX 刪除整個 `<section id="admin-orders-panel" …>…</section>`（從 `<section id="admin-orders-panel"` 到它的 `</section>`）。
7. `src/AdminApp.css` 刪除 `.admin-orders-empty` 開頭的三條規則。

改完後執行 `npx tsc -b`。若 `campaignStatus` 以外還有未使用的變數或 import 的錯誤，一併刪除並寫進回報。

- [ ] **Step 9: 改 `LocalLiveAdminApp`（`src/LocalLiveApps.tsx`）**

1. import 區在 `import { OrganizerShell } …` 之後加：

   ```tsx
   import { OrdersSection } from './components/organizer/OrdersSection'
   import { OverviewSection } from './components/organizer/OverviewSection'
   ```

2. `const shownSection = resolveWorkspaceSection(section, published)` 改為：

   ```tsx
     const shownSection = resolveWorkspaceSection(section, published, campaignStatus)
   ```

3. 在 `const workspaceCampaign` 之前加入兩個處理函式：

   ```tsx
     const setOrderOrganizerNote = async (orderId: string, note: string) => {
       await ordersGateway.setOrderOrganizerNote(orderId, note)
       await reloadOrderSummary()
     }
     const cancelOrder = async (orderId: string) => {
       await ordersGateway.cancelOrder(orderId)
       await reloadOrderSummary()
     }
   ```

4. `<AdminApp …>` 改為下面這版：
   - 移除 `orderSummary`、`campaignTitle`、`onSetOrderPaid`、`onSetOrderOrganizerNote`、`onCancelOrder`。
   - `section` 改寫。
   - `onPublish` 等其他 props 原樣保留。

   ```tsx
           <AdminApp
             section={shownSection === 'content' ? 'content' : null}
             initialContent={content}
             initialPublicationState={publicationState}
             campaignStatus={campaignStatus}
             onUploadImage={(file) => imageGateway.upload(campaignId, file)}
             onSaveDraft={async (nextContent) => {
               await gateway.saveDraft(campaignId, nextContent)
             }}
             onPublish={/* 原本的 onPublish 函式，一字不改 */}
           />
   ```

   注意：`onPublish={/* … */}` 只是在計畫裡標示位置，實作時保留原函式本體。
5. 在 `<AdminApp />` 與 `{shownSection === 'pickup' && …}` 之間加入：

   ```tsx
           {shownSection === 'overview' && orderSummary && (
             <OverviewSection
               campaignId={campaignId}
               campaignTitle={content.title}
               openedAt={publishedContent?.openedAt ?? null}
               summary={orderSummary}
               status={campaignStatus}
               liveState="unavailable"
             />
           )}
           {shownSection === 'orders' && orderSummary && (
             <OrdersSection
               campaignTitle={content.title}
               openedAt={publishedContent?.openedAt ?? null}
               summary={orderSummary}
               status={campaignStatus}
               liveState="unavailable"
               onSetOrderOrganizerNote={setOrderOrganizerNote}
               onCancelOrder={cancelOrder}
             />
           )}
   ```

   `liveState="unavailable"` 由 Task 6 換成真實狀態。已發布的團購在載入時一定同時取得 `orderSummary`，所以 `orderSummary &&` 只是型別防護。

- [ ] **Step 10: 改 `DemoOrganizerWorkspace`（`src/RuntimeApp.tsx`）**

1. import 加：

   ```tsx
   import { OrdersSection } from './components/organizer/OrdersSection'
   import { OverviewSection } from './components/organizer/OverviewSection'
   ```

2. `const section = resolveWorkspaceSection(requestedSection, true)` 改為 `resolveWorkspaceSection(requestedSection, true, campaignStatus)`。
3. `<AdminApp …/>` 整段換成下面這段，並接在它後面加兩個分區：

   ```tsx
         <AdminApp section={section === 'content' ? 'content' : null} campaignStatus={campaignStatus} />
         {section === 'overview' && (
           <OverviewSection
             campaignId={DEMO_CAMPAIGN_ID}
             campaignTitle={campaign.title}
             openedAt={campaign.openedAt}
             summary={orderSummary}
             status={campaignStatus}
             liveState="unavailable"
           />
         )}
         {section === 'orders' && (
           <OrdersSection
             campaignTitle={campaign.title}
             openedAt={campaign.openedAt}
             summary={orderSummary}
             status={campaignStatus}
             liveState="unavailable"
             onSetOrderOrganizerNote={async (orderId, organizerNote) => {
               setOrders((current) => current.map((order) => order.orderId === orderId ? { ...order, organizerNote } : order))
             }}
             onCancelOrder={async (orderId) => {
               setOrders((current) => current.filter((order) => order.orderId !== orderId))
             }}
           />
         )}
   ```

   `initialDemoOrganizerOrders` 的 `paid: false` 保留：`OrganizerVisibleOrder` 型別（`src/domain/**`，不可修改）要求這個欄位，畫面已不再使用。

- [ ] **Step 11: 刪除舊訂單面板**

```bash
git rm src/AdminOrdersPanel.tsx src/AdminOrdersPanel.css src/AdminOrdersPanel.test.tsx
```

Run: `npx tsc -b`。若還有檔案 import `AdminOrdersPanel`，改為使用 `OrdersSection`／`OverviewSection`，或刪除該 import，並寫進回報。

- [ ] **Step 12: 確認通過**

Run: `npm test` → 全部 PASS，沒有 act() 警告。

若有此 Task 沒列到的既有測試失敗，原因只可能是：
- 沒有分區的網址現在預設開到「概況」；
- 或「訂單統計」標題改成「訂單」。

依新行為改期望值，逐一寫進回報（測試名稱與改了什麼）。不可刪除測試。

Run: `npx tsc -b`、`npm run lint` → 無錯誤、無警告。

- [ ] **Step 13: Commit**

```bash
git add -A src/components/organizer src/AdminApp.tsx src/AdminApp.css src/AdminApp.test.tsx src/LocalLiveApps.tsx src/LocalLiveApps.test.tsx src/RuntimeApp.tsx src/RuntimeApp.test.tsx src/AdminOrdersPanel.tsx src/AdminOrdersPanel.css src/AdminOrdersPanel.test.tsx
git commit -m "feat: show the overview and new orders sections in the campaign workspace"
```

---

### Task 6: 團主端即時更新

**Files:**
- Modify: `src/LocalLiveApps.tsx`（`LocalLiveAdminApp`）
- Modify: `src/LocalLiveApps.test.tsx`

**Interfaces:**
- Consumes：
  - Task 2：`LiveState`
  - Task 5：`reloadOrderSummary`，以及概況與訂單的 `liveState` 位置
  - Supabase client：`client.channel(name).on('postgres_changes', filter, callback).subscribe(statusCallback)`，以及 `client.removeChannel(channel)`（住戶端已用同一 API，見 `LocalLiveResidentApp`）
- Produces：
  - 概況與訂單顯示的 `liveState`；
  - `onRetrySync` 會重新訂閱。

行為：
- **何時訂閱：** 只有在「已登入、已載入這一團的內容、這團已發布」時才訂閱。頻道名稱 `organizer-campaign-<id>`，監聽該團的 `orders` 與 `order_item` 所有事件。
- **合併連續事件：**
  - 事件進來時，若沒有載入在進行就重新載入；
  - 若已有載入在進行，只記下「還要再載一次」，等目前這次結束後再載一次。
  - 所以不會同時有兩個重新載入，畫面以最後一次為準（Review Focus 1）。
- **連線狀態：**
  - 訂閱成功（`SUBSCRIBED`）時先重新載入一次，補上訂閱前漏掉的變動。
  - 重新載入成功 → `live`（「即時更新」）。
  - `CHANNEL_ERROR`、`TIMED_OUT`、`CLOSED` 或重新載入失敗 → `offline`（提醒列＋「重新同步」）。
  - 「重新同步」會移除舊頻道並重新訂閱。
- **清理：** 換團、登出或卸載時移除頻道；之後進來的狀態回呼一律忽略。

- [ ] **Step 1: 讓測試用的假 client 支援 Realtime**

`src/LocalLiveApps.test.tsx` 的 `authClient()` 裡，`const client = { rpc: …, auth: {…} }` 物件在 `auth` 之後加：

```tsx
    channel: vi.fn(() => {
      const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) }
      return channel
    }),
    removeChannel: vi.fn().mockResolvedValue(undefined),
```

- 預設的假頻道永遠不回報連線狀態，所以既有測試的 `loadSummary` 呼叫次數不變。
- 住戶端測試用 `Object.assign(client, { channel, removeChannel })` 覆蓋，不受影響。

- [ ] **Step 2: 寫失敗測試**

在 `src/LocalLiveApps.test.tsx` 檔尾新增：

```tsx
describe('organizer realtime', () => {
  const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
  const publishedRepository = (): LiveAdminRepository => ({
    loadPublished: vi.fn().mockResolvedValue(published),
    loadOptionalPublished: vi.fn().mockResolvedValue(published),
    loadOptionalDraft: vi.fn().mockResolvedValue(null),
    saveDraft: vi.fn(),
    publish: vi.fn(),
  })

  function realtimeClient() {
    const { client } = authClient(session)
    const callbacks: Array<() => void> = []
    const statusCallbacks: Array<(status: string) => void> = []
    const channel = {
      on: vi.fn((_event: string, _filter: unknown, callback: () => void) => {
        callbacks.push(callback)
        return channel
      }),
      subscribe: vi.fn((callback: (status: string) => void) => {
        statusCallbacks.push(callback)
        return channel
      }),
    }
    const channelFactory = vi.fn().mockReturnValue(channel)
    const removeChannel = vi.fn().mockResolvedValue(undefined)
    Object.assign(client, { channel: channelFactory, removeChannel })
    const report = (status: string) => act(() => { statusCallbacks.at(-1)?.(status) })
    return { client, channel, channelFactory, removeChannel, callbacks, report }
  }

  it('subscribes to this campaign\'s orders and reloads the overview when they change', async () => {
    const { client, channel, channelFactory, callbacks, report } = realtimeClient()
    const workflow = ordersRepository()
    render(<LocalLiveAdminApp client={client} campaignId="campaign-1" repository={publishedRepository()} ordersRepository={workflow} section="overview" />)

    expect(await screen.findByRole('heading', { level: 2, name: '概況' })).toBeInTheDocument()
    expect(channelFactory).toHaveBeenCalledWith('organizer-campaign-campaign-1')
    expect(channel.on).toHaveBeenCalledWith('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: 'campaign_id=eq.campaign-1' }, expect.any(Function))
    expect(channel.on).toHaveBeenCalledWith('postgres_changes', { event: '*', schema: 'public', table: 'order_item', filter: 'campaign_id=eq.campaign-1' }, expect.any(Function))
    expect(await screen.findByText('連線中…')).toBeInTheDocument()

    report('SUBSCRIBED')
    await waitFor(() => expect(workflow.loadSummary).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('即時更新')).toBeInTheDocument()

    act(() => { callbacks[0]() })
    await waitFor(() => expect(workflow.loadSummary).toHaveBeenCalledTimes(3))
  })

  it('coalesces a burst of order events into one follow-up reload and shows the latest result', async () => {
    const { client, callbacks, report } = realtimeClient()
    const workflow = ordersRepository()
    let finishSlowReload!: (summary: OrganizerOrderSummary) => void
    vi.mocked(workflow.loadSummary)
      .mockResolvedValueOnce(orderSummary)
      .mockImplementationOnce(() => new Promise((resolve) => { finishSlowReload = resolve }))
      .mockResolvedValueOnce({ ...orderSummary, orderCount: 7 })
    render(<LocalLiveAdminApp client={client} campaignId="campaign-1" repository={publishedRepository()} ordersRepository={workflow} section="orders" />)
    expect(await screen.findByRole('heading', { level: 2, name: '訂單' })).toBeInTheDocument()

    report('SUBSCRIBED')
    act(() => { callbacks[0](); callbacks[1](); callbacks[0]() })
    expect(workflow.loadSummary).toHaveBeenCalledTimes(2)

    await act(async () => { finishSlowReload({ ...orderSummary, orderCount: 5 }) })
    await waitFor(() => expect(workflow.loadSummary).toHaveBeenCalledTimes(3))
    expect(await within(screen.getByLabelText('訂單總覽')).findByText('7 筆')).toBeInTheDocument()
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(workflow.loadSummary).toHaveBeenCalledTimes(3)
  })

  it('warns when the live connection drops and resubscribes on retry', async () => {
    const user = userEvent.setup()
    const { client, channelFactory, removeChannel, report } = realtimeClient()
    render(<LocalLiveAdminApp client={client} campaignId="campaign-1" repository={publishedRepository()} ordersRepository={ordersRepository()} section="overview" />)
    expect(await screen.findByRole('heading', { level: 2, name: '概況' })).toBeInTheDocument()

    report('CHANNEL_ERROR')
    expect(await screen.findByText('即時同步中斷，畫面可能不是最新')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新同步' }))

    expect(removeChannel).toHaveBeenCalledOnce()
    expect(channelFactory).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('連線中…')).toBeInTheDocument()
  })

  it('shows the warning when a live reload fails', async () => {
    const { client, callbacks, report } = realtimeClient()
    const workflow = ordersRepository()
    vi.mocked(workflow.loadSummary)
      .mockResolvedValueOnce(orderSummary)
      .mockResolvedValueOnce(orderSummary)
      .mockRejectedValueOnce(new Error('network'))
    render(<LocalLiveAdminApp client={client} campaignId="campaign-1" repository={publishedRepository()} ordersRepository={workflow} section="overview" />)
    expect(await screen.findByRole('heading', { level: 2, name: '概況' })).toBeInTheDocument()

    report('SUBSCRIBED')
    expect(await screen.findByText('即時更新')).toBeInTheDocument()
    act(() => { callbacks[0]() })
    expect(await screen.findByText('即時同步中斷，畫面可能不是最新')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '概況' })).toBeInTheDocument()
  })

  it('does not subscribe for drafts and removes the channel when leaving the campaign', async () => {
    const { client, channelFactory, removeChannel, report } = realtimeClient()
    const draftRepository: LiveAdminRepository = {
      ...publishedRepository(),
      loadOptionalPublished: vi.fn().mockResolvedValue(null),
      loadOptionalDraft: vi.fn().mockResolvedValue(published),
    }
    const { unmount } = render(<LocalLiveAdminApp client={client} campaignId="campaign-2" repository={draftRepository} ordersRepository={ordersRepository()} section="content" />)
    expect(await screen.findByRole('textbox', { name: '團購標題' })).toBeInTheDocument()
    expect(channelFactory).not.toHaveBeenCalled()
    unmount()

    const second = render(<LocalLiveAdminApp client={client} campaignId="campaign-1" repository={publishedRepository()} ordersRepository={ordersRepository()} section="overview" />)
    expect(await screen.findByRole('heading', { level: 2, name: '概況' })).toBeInTheDocument()
    second.unmount()
    expect(removeChannel).toHaveBeenCalledOnce()
    expect(() => report('SUBSCRIBED')).not.toThrow()
  })
})
```

`OrganizerOrderSummary`、`within`、`act` 若檔案頂端尚未 import，一併補上：
- `import type { OrganizerOrderSummary } from './domain/adminOrders'`
- `within`、`act` 從 `@testing-library/react` import。

若上面各個 `render` 需要 `OrganizerNavigationProvider` 才能渲染工作區，比照 Task 5 Step 3 的處理，並寫進回報。

- [ ] **Step 3: 確認測試失敗**

Run: `npx vitest run src/LocalLiveApps.test.tsx -t "organizer realtime"`
Expected: FAIL（`channel` 沒被呼叫、沒有「連線中…」）。

- [ ] **Step 4: 實作**

在 `src/LocalLiveApps.tsx`：

1. import 加：`import type { LiveState } from './components/organizer/LiveStatus'`。
2. `LocalLiveAdminApp` 的 state 宣告區（`const [fatalAuthError, …]` 之後）加：

   ```tsx
     const [liveState, setLiveState] = useState<LiveState>('unavailable')
     const [liveAttempt, setLiveAttempt] = useState(0)
     // Points at the latest reloadOrderSummary so the subscription never calls a stale closure.
     const orderSyncRef = useRef<(() => Promise<void>) | null>(null)
   ```

3. 在「載入團購內容」那個 `useEffect`（依賴 `[campaignId, gateway, ordersGateway, organizerUserId]`）之後、`const acceptSignedInSession` 之前加：

   ```tsx
     const liveCampaignId = organizerUserId && campaignId && contentCampaignId === campaignId && publishedContent
       ? campaignId
       : null

     useEffect(() => {
       if (!liveCampaignId) {
         setLiveState('unavailable')
         return
       }
       let active = true
       let running = false
       let queued = false
       // One reload at a time; events that arrive meanwhile collapse into a single follow-up reload.
       const sync = async () => {
         if (running) {
           queued = true
           return
         }
         running = true
         try {
           do {
             queued = false
             await orderSyncRef.current?.()
           } while (queued && active)
           if (active) setLiveState('live')
         } catch {
           if (active) setLiveState('offline')
         } finally {
           running = false
         }
       }
       const filter = `campaign_id=eq.${liveCampaignId}`
       setLiveState('connecting')
       const channel = client
         .channel(`organizer-campaign-${liveCampaignId}`)
         .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter }, () => { void sync() })
         .on('postgres_changes', { event: '*', schema: 'public', table: 'order_item', filter }, () => { void sync() })
         .subscribe((status) => {
           if (!active) return
           // Reload on (re)subscribing to catch changes made before the channel was ready.
           if (status === 'SUBSCRIBED') void sync()
           else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setLiveState('offline')
         })
       return () => {
         active = false
         void client.removeChannel(channel)
       }
     }, [client, liveCampaignId, liveAttempt])
   ```

4. 在 `const reloadOrderSummary = async () => {…}` 定義之後加：

   ```tsx
     orderSyncRef.current = reloadOrderSummary
     const retrySync = () => setLiveAttempt((current) => current + 1)
   ```

5. Task 5 加入的 `OverviewSection` 與 `OrdersSection` 都把 `liveState="unavailable"` 換成：

   ```tsx
                 liveState={liveState}
                 onRetrySync={retrySync}
   ```

`reloadOrderSummary` 已有「換團後的晚到結果不寫入」防護（`currentCampaignIdRef`），不需再加。

- [ ] **Step 5: 確認通過**

Run: `npx vitest run src/LocalLiveApps.test.tsx` → 全部 PASS，沒有 act() 警告。
Run: `npm test`、`npx tsc -b`、`npm run lint` → 全部通過、無警告。

若 `subscribe` 回呼參數的型別讓字串比較出現型別錯誤：
- 把參數標成 `(status: \`${REALTIME_SUBSCRIBE_STATES}\`)`，其中 `REALTIME_SUBSCRIBE_STATES` 由 `@supabase/supabase-js` import，只用型別。
- 不要改用 `as` 斷言。

- [ ] **Step 6: Commit**

```bash
git add src/LocalLiveApps.tsx src/LocalLiveApps.test.tsx
git commit -m "feat: refresh organizer orders in real time and show the sync status"
```

---

### Task 7: 列表頁與工作區的載入、錯誤畫面保留上方導覽

**Files:**
- Modify: `src/LocalLiveApps.tsx`（`LocalLiveAdminApp`）
- Modify: `src/LocalLiveApps.test.tsx`

**Interfaces:**
- Consumes：
  - `OrganizerShell({ current, onCreate, children })`
  - `LoadingState({ label, variant: 'skeleton' })`
  - `ErrorState({ title, message, actionLabel, onAction, page })`
- Produces：無新介面。

**目前的問題：** 登入後的資料載入中與載入失敗，都以整頁取代畫面，上方導覽消失，錯誤也沒有重試。

**改法：**
- **登入後：** 載入中與失敗都包在 `OrganizerShell` 裡。
  - 導覽的目前項目：
    - 團購工作區、首頁 → 「團購」；
    - 住戶 → 「住戶」；
    - 設定、通知測試中心 → 「設定」。
  - 載入中用骨架。
  - 失敗顯示「無法載入這一頁」、錯誤訊息與「重試」。「重試」會清除錯誤，並讓目前頁面的載入 effect 重跑。
- **登入前與驗證流程：** 登出中、確認登入狀態、登入頁、`fatalAuthError` 的畫面都不變。

- [ ] **Step 1: 寫失敗測試**

在 `src/LocalLiveApps.test.tsx` 檔尾新增：

```tsx
describe('organizer loading and error states', () => {
  const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }

  it('keeps the organizer navigation while a page loads and when it fails, and retries the load', async () => {
    const user = userEvent.setup()
    const { client } = authClient(session)
    const members = [{ memberCode: 'm1', displayName: '住戶甲', pictureUrl: null, period: 2, unit: '1A1', joinedAt: '2026-09-01T00:00:00Z', blocked: false, blockedAt: null }]
    let failLoad!: (error: Error) => void
    const list = vi.fn()
      .mockImplementationOnce(() => new Promise((_, reject) => { failLoad = reject }))
      .mockResolvedValue(members)
    render(
      <LocalLiveAdminApp
        client={client}
        page="residents"
        residentMemberRepository={{ list, setBlocked: vi.fn(), updateHousehold: vi.fn() }}
        ordersRepository={ordersRepository()}
      />,
    )

    expect(await screen.findByRole('status', { name: '載入住戶…' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '團主後台' })).toBeInTheDocument()

    await act(async () => { failLoad(new Error('讀取住戶失敗：network')) })
    expect(await screen.findByRole('alert')).toHaveTextContent('無法載入這一頁')
    expect(screen.getByText('讀取住戶失敗：network')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '住戶' })).toHaveAttribute('aria-current', 'page')

    await user.click(screen.getByRole('button', { name: '重試' }))
    expect(await screen.findByRole('heading', { level: 1, name: '住戶 1 位' })).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('keeps the navigation while a campaign workspace loads and retries a failed load', async () => {
    const user = userEvent.setup()
    const { client } = authClient(session)
    const repository: LiveAdminRepository = {
      loadPublished: vi.fn().mockResolvedValue(published),
      loadOptionalPublished: vi.fn()
        .mockRejectedValueOnce(new Error('讀取團購失敗：network'))
        .mockResolvedValue(published),
      loadOptionalDraft: vi.fn().mockResolvedValue(null),
      saveDraft: vi.fn(),
      publish: vi.fn(),
    }
    render(<LocalLiveAdminApp client={client} campaignId="campaign-1" repository={repository} ordersRepository={ordersRepository()} section="overview" />)

    expect(await screen.findByRole('alert')).toHaveTextContent('無法載入這一頁')
    expect(screen.getByRole('navigation', { name: '團主後台' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '團購' })).toHaveAttribute('aria-current', 'page')

    await user.click(screen.getByRole('button', { name: '重試' }))
    expect(await screen.findByRole('heading', { level: 2, name: '概況' })).toBeInTheDocument()
    expect(repository.loadOptionalPublished).toHaveBeenCalledTimes(2)
  })
})
```

先用 `grep -n "residentMemberRepository=\|LiveResidentMemberRepository = {" -A6 src/LocalLiveApps.tsx src/LocalLiveApps.test.tsx` 確認以下兩點，缺的欄位或不同的名稱照實際型別補齊，寫進回報：
- `LiveResidentMemberRepository` 的必要欄位；
- `OrganizerShell` 導覽連結的實際名稱（「團購」「住戶」「設定」）。

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/LocalLiveApps.test.tsx -t "organizer loading and error states"`
Expected: FAIL（找不到導覽，錯誤標題是「無法載入團購小幫手」，沒有「重試」）。

- [ ] **Step 3: 實作**

在 `src/LocalLiveApps.tsx` 的 `LocalLiveAdminApp`：

1. import：確認 `LoadingState`、`ErrorState` 已從 `./components/ui/AsyncState` import。`LiveLoading` 已使用 `LoadingState`，若 `ErrorState` 未 import 就補上。
2. state 區加：`const [reloadKey, setReloadKey] = useState(0)`。
3. 兩個資料載入 effect 的依賴陣列都加上 `reloadKey`：
   - 列表頁那個：`[campaignManagementGateway, listPage, organizerUserId, residentMemberGateway, reloadKey]`；
   - 團購內容那個：`[campaignId, gateway, ordersGateway, organizerUserId, reloadKey]`。
4. 把 `const createCampaign = …` 移到 `if (!session) { … }` 區塊之後、`if (error) …` 之前，並在它後面加：

   ```tsx
     const shellCurrent = campaignId ? 'campaigns' : notificationLab ? 'settings' : page === 'home' ? 'campaigns' : page
     const inShell = (children: ReactNode) => (
       <OrganizerShell current={shellCurrent} onCreate={createCampaign}>{children}</OrganizerShell>
     )
     const shellLoading = (label: string) => inShell(<LoadingState label={label} variant="skeleton" rows={4} />)
   ```

   `ReactNode` 加到檔案頂端的 react import：`import { …, type FormEvent, type ReactNode } from 'react'`。
5. `if (error) return <LiveError message={error} />` 換成：

   ```tsx
     if (error) {
       return inShell(
         <ErrorState
           title="無法載入這一頁"
           message={error}
           actionLabel="重試"
           onAction={() => {
             setError('')
             setReloadKey((current) => current + 1)
           }}
           page
         />,
       )
     }
   ```

6. 已登入後的五個 `return <LiveLoading label="…" />` 全部改成 `return shellLoading('…')`，文字不變：
   - `載入通知測試中心…`
   - `載入住戶…`
   - `載入設定…`
   - `載入團購、住戶與通知設定…`
   - `載入團購草稿與訂單…`

   登入前的 `LiveLoading`（`登出中…`、`確認團主登入狀態…`）不動。

`OrganizerShell` 的 `current` 型別是 `'campaigns' | 'residents' | 'settings'`。`page` 的型別是 `'home' | 'residents' | 'settings'`，排除 `'home'` 後 TypeScript 可推得正確型別；若推不出，就為 `shellCurrent` 標註 `OrganizerSection`（由 `OrganizerShell.tsx` import 型別）。

- [ ] **Step 4: 確認通過**

Run: `npm test`、`npx tsc -b`、`npm run lint` → 全部通過、無警告。

若既有測試用 `findByText('載入…')` 找載入文字仍會通過（骨架以視覺隱藏文字保留標籤）。若有測試依賴 `無法載入團購小幫手` 這個標題：
- 屬於登入後資料載入錯誤的，改成新標題「無法載入這一頁」；
- 屬於登入流程的，不改。

逐一寫進回報。

- [ ] **Step 5: Commit**

```bash
git add src/LocalLiveApps.tsx src/LocalLiveApps.test.tsx
git commit -m "fix: keep organizer navigation on loading and error screens and offer retry"
```

---

### Task 8: 截圖、文件與完整驗證

**Files:**
- Modify: `scripts/capture-pages.mjs`
- Modify: `docs/AI_AGENT_HANDOFF.md`、`README.md`

**Interfaces:** 無。

- [ ] **Step 1: 截圖腳本加入概況頁**

`scripts/capture-pages.mjs` 的 `pages` 陣列，在 `admin-editor` 之前加：

```js
  { name: 'admin-overview', path: '/admin/campaign/01234567-89ab-cdef-0123-456789abcdef/overview' },
```

- [ ] **Step 2: 更新 `docs/AI_AGENT_HANDOFF.md`**

1. 第 10 行 `管理團購、住戶、訂單、付款完成狀態、匯出與通知。` 改為 `管理團購、住戶、訂單與團主備註、匯出與通知；付款由團主依匯出的 Excel 在系統外處理。`
2. `src/AdminOrdersPanel.tsx` 那一行改為：

   ```markdown
   - `src/components/organizer/OverviewSection.tsx`、`OrdersSection.tsx`：團主概況（成團進度、今日新增、品項數量、最新訂單）與訂單（搜尋、排序、團主備註、整筆取消、匯出）；`LocalLiveAdminApp` 訂閱該團 `orders`／`order_item` 的 Realtime 變動後重新載入。
   ```

3. `/admin/campaign/<uuid>/<分區>` 那一行改為：

   ```markdown
   - `/admin/campaign/<uuid>/<分區>`：團購工作區；分區為 `overview`、`orders`、`content`、`pickup`。只有 UUID 的網址會以 `replaceState` 導向預設分區：草稿 → 內容設定；已發布且開團中 → 概況；已結單 → 訂單。
   ```

4. 〈訂單與付款〉的 `只追蹤已付款／未付款，不記錄付款方式。` 改為：

   ```markdown
   - 前端不提供付款功能（2026-09-24 決定）：團主結單後匯出 Excel，自行處理付款。資料庫的 `paid` 欄位與 `setOrderPaid` gateway 仍在，但畫面不讀也不寫；不要再加付款介面。
   ```

5. 若同檔有提到「領取通知對話框」或「付款狀態」出現在領取通知名單，改為「頁面內三步驟」並拿掉付款狀態描述。用 `grep -n "對話框\|付款" docs/AI_AGENT_HANDOFF.md` 找。

- [ ] **Step 3: 更新 `README.md`**

1. 第 29 行 `團主訂單統計：戶數、總量、總額、成團差額、動態品項彙總與逐戶明細` 改為 `團主概況：成團進度、今日新增、品項數量與最新訂單，並即時更新；團主訂單：搜尋、依戶號或下單時間排序、團主備註與整筆取消`。
2. 第 30 行 `團主工作流：結單、重新開放、逐戶已付款／未付款與團主備註；到貨由LINE領取通知處理，不記錄付款方式` 改為 `團主工作流：結單、重新開放、團主備註與結單後匯出 Excel；到貨由LINE領取通知處理；付款由團主依 Excel 在系統外處理`。
3. 第 75 行 `以及更新逐戶已付款／未付款與團主備註` 改為 `以及編輯團主備註`。
4. 第 31、138、179 行描述的是資料庫行為（付款紀錄連帶刪除、工作流腳本驗證付款狀態、付款只保存完成狀態）。資料庫沒有改，這三處不動。

- [ ] **Step 4: 完整驗證**

Run（依序）：

```bash
npm test
npx tsc -b
npm run lint
npm run build
```

Expected: 全部通過、沒有警告；`npm run build` 成功。

- [ ] **Step 5: 改版後截圖並比對**

確認 Demo 在 5173 執行（見 Task 0 Step 1），然後：

```bash
node scripts/capture-pages.mjs .superpowers/qa/phase-4/after
```

Expected：
- 24 張（8 頁 × 3 寬度）；
- `report.json` 每頁 `horizontalOverflow` 為 false；
- 沒有 console error。

逐張看 `after` 的：
- `admin-overview-*`
- `admin-orders-*`
- `admin-editor-*`

並與 `before` 的 `admin-orders-*`、`admin-editor-*` 比對。在回報列出：
- 375px 下訂單表格是否可讀、有無水平捲動；
- 概況的 KPI 與最新訂單是否排列正常；
- 內容設定頁與改版前是否一致（應該一致：只移除了隱藏的訂單分區）。

截圖不 commit。

- [ ] **Step 6: Commit**

```bash
git add scripts/capture-pages.mjs docs/AI_AGENT_HANDOFF.md README.md
git commit -m "docs: describe the overview, realtime orders and the no-payment decision"
```

---

## 完成後交給團主驗收（不屬於任何 Task）

以下需要真實 LINE 帳號與正式資料，由團主在上線後自行確認：
1. 用住戶帳號下單或修改訂單，團主的概況與訂單頁應在幾秒內自動更新，標題旁顯示「即時更新」。
2. 手機網路斷線再恢復時，出現「即時同步中斷」提醒，按「重新同步」後恢復。
3. 結單後到「領取通知」依三個步驟產生並複製指令，貼到群組確認機器人回覆。

## 執行結果與留給後續階段的事項（2026-09-25）

**結果：**
- Task 0～8 全部完成（commits `4d7ea1a`…`92d1555`），每個 Task 審查都沒有要修的問題；2026-09-25 push 上線。
- 90 個測試檔、644 項全部通過；tsc、lint、build 通過。
- 24 張截圖（8 頁 × 3 寬度）無水平溢出；內容設定頁除了左側欄多了「概況」，與改版前相同。

**執行中對計畫的修正：**
- Task 3 的額外品項測試把自訂品項加在 `initialOrders[0]`（2K13），計畫卻去 H11 那一列找；改為在正確的那一列驗證，驗證的行為不變。
- Task 6 另外替 4 個自建假 Supabase client 的登入測試補上 `channel`／`removeChannel`，因為已發布的團會開始訂閱即時更新。

**延後的小問題（最終審查判定不影響上線）：**
- 概況的相對時間（「剛剛」「N 分鐘前」）與「今天新增」只在資料更新時重算；長時間沒有新訂單時會過時，跨午夜也不會歸零。
- 鍵盤焦點會在三個地方遺失：備註按 Enter 儲存失敗後、領取通知預覽讀取失敗後、按「重新同步」後。
- 存備註或取消訂單成功、但之後重新載入列表失敗時，畫面會顯示成操作失敗。
- 團購沒有開團時間時，匯出按鈕停用但不說明原因（已發布的團不會發生）。
- 即時更新：
  - 重新載入進行中若連線中斷，載入完成後狀態可能暫時顯示「即時更新」，下一次連線事件會更正；
  - 存備註、取消後的重新載入沒有與即時更新共用排隊。
- 測試：
  - 換團與登出時移除訂閱頻道沒有獨立測試；
  - `AdminApp` 分區測試對舊訂單標題的斷言過弱。

**需要團主在正式環境確認：**
1. 用住戶帳號下單或修改訂單，團主的概況與訂單頁應在幾秒內自動更新，標題旁顯示「即時更新」。
2. 手機網路斷線再恢復時，出現「即時同步中斷」提醒，按「重新同步」後恢復。
3. 結單後到「領取通知」依三個步驟產生並複製指令，貼到群組確認機器人回覆。
