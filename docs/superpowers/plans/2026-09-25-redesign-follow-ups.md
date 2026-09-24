# 改版後續修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正第 4、5 階段上線後留下、團主決定要修的問題：
- **時間顯示：**
  - 相對時間（剛剛／N 分鐘前）每分鐘自動更新；
  - 團主端訂單表加「下單時間」欄；
  - 住戶端訂單牆改用同樣的相對時間。
- **開團資訊改為發布必填。**
- **三處操作失敗後鍵盤焦點遺失：**
  - 備註儲存；
  - 領取通知讀取名單；
  - 重新同步。
- **備註或取消已成功、只有重新載入列表失敗時，不再顯示成操作失敗。**

**Architecture:**
- **共用時間模組：**相對時間的格式化與「每分鐘更新的現在時間」（`useNow`）放在 `src/components/relativeTime.ts`，團主端與住戶端共用。
- **原本的相對時間函式：**原本在 `orderView.ts` 的 `formatRelativeTime` 搬到共用模組；`orderView.ts` 改為轉出（re-export），既有呼叫與測試不必改。
- **其他修正：**都在原元件內小幅調整。

**Tech Stack:** React 19、TypeScript 6、Vitest 4、Testing Library

**Spec:**
- `docs/superpowers/specs/2026-09-21-frontend-redesign-design.md`。
- 團主在 2026-09-24 的決定（見下方〈對 Spec 的調整〉）。
- 問題來源：
  - `docs/superpowers/plans/2026-09-25-redesign-phase-4-overview-orders-pickup.md` 最後一節；
  - `docs/superpowers/plans/2026-09-25-redesign-phase-5-content-editor.md` 最後一節。

## Global Constraints

- 只改前端：不得修改 `supabase/**`、`scripts/*.py`、`src/services/**`、`src/domain/**`、`src/types/database.ts`。
- 不新增 npm 相依套件。
- **視覺與可點範圍：**
  - 聚焦外框 `2px solid #0071e3`、`outline-offset: 2px`；
  - 字重只用 400 與 600；
  - 輔助小字最小 12px；
  - 團主端 1024px 以上可點範圍 ≥ 24px，1024px 以下 ≥ 44px；住戶端 ≥ 44px；
  - 文字對比 ≥ 4.5:1。
- 產品規則不可破壞：
  - 住戶訂單牆不得顯示任何人的期別／戶號；
  - 團主備註上限 500 字；
  - 整筆取消只在開團中；
  - 自動儲存約 0.5 秒、失敗不自動重試；
  - 不做付款功能。
- TDD：每個行為先寫失敗測試，確認失敗原因是功能缺失，再寫最小實作。
- 修改既有測試時，原本驗證的行為必須仍被某個測試驗證；刻意改變的行為另外寫明。
- 使用者可見文案一律繁體中文。
- **只 commit、不 push。**

## 對 Spec 的調整（團主 2026-09-24 決定）

1. **開團資訊（公告）改為發布必填**，取代第 5 階段計畫第 11 條「發布前檢查不要求公告」。發布前檢查多一條「填寫開團資訊」，跳段標籤的 •／✓ 與此一致。
2. **團主端訂單表加「下單時間」欄**：
   - 顯示相對時間（與概況同規則）；
   - 修改過的訂單第二行顯示「已修改・{相對時間}」；
   - 滑鼠停留顯示完整時間。
3. **住戶端訂單牆的時間改用相對時間**：
   - 第一行「下單 {相對時間}」，修改過的第二行「已修改・{相對時間}」；
   - 原本是「下單時間 2026/08/14 08:10」「已修改・最後修改 …」。
   - 「我的訂單」的「最後修改」維持完整時間，不在這次範圍。
4. **相對時間規則沿用概況**（不到 1 分鐘「剛剛」；1～59 分鐘「N 分鐘前」；1～23 小時「N 小時前」；24 小時以上「MM/DD HH:mm」）。
   - 畫面上每 60 秒重算一次，不連網路。
   - 顯示處用 `<time dateTime>`，並以 `title` 提供完整時間。
5. **重新載入列表失敗時**：備註或取消已成功就照實顯示成功，改用既有的「即時同步中斷，畫面可能不是最新」＋「重新同步」提示列表可能不是最新。

## Review Focus

1. **相對時間的邊界：**
   - 剛好 60 秒顯示「1 分鐘前」、剛好 60 分鐘顯示「1 小時前」、剛好 24 小時顯示日期；
   - 未來時間（伺服器與裝置時鐘差）不能顯示負數。
   - Task 1 測試。
2. **計時器：**元件卸載後計時器要清除；有傳入固定 `now`（測試用）時不開計時器。Task 1 測試。
3. **備註儲存中再按 Enter**：不能送出第二次儲存。以前輸入框停用擋住了，這次改成唯讀，必須另外擋。Task 5 測試。
4. **重新載入失敗時：**
   - 備註要顯示新內容、不出現錯誤；
   - 取消訂單要關閉確認視窗；
   - 都要顯示同步中斷提示。
   - Task 6 測試。
5. **開團資訊只有空白字元**：算未填，要擋發布。Task 4 測試。

## 檔案地圖

| 檔案 | 動作 | 責任 |
|---|---|---|
| `src/components/relativeTime.ts`、`relativeTime.test.tsx` | 新增 | `formatRelativeTime`、`useNow`、`RelativeTime` 元件 |
| `src/components/organizer/orderView.ts` | 修改 | `formatRelativeTime` 改為轉出 |
| `src/components/organizer/OverviewSection.tsx`、`OverviewSection.test.tsx` | 修改 | 每分鐘更新 |
| `src/components/organizer/OrdersSection.tsx`、`OrdersSection.test.tsx`、`organizer.css` | 修改 | 下單時間欄 |
| `src/components/resident/OrderWall.tsx`、`residentComponents.test.tsx`、`src/App.test.tsx`、`src/LocalLiveApps.test.tsx` | 修改 | 訂單牆相對時間 |
| `src/components/organizer/content/contentChecks.ts`、`contentChecks.test.ts`、`src/AdminApp.test.tsx` | 修改 | 開團資訊必填 |
| `src/components/organizer/OrderNoteCell.tsx`、`src/PickupNotificationPanel.tsx`、`src/components/organizer/LiveStatus.tsx` 與其測試 | 修改 | 焦點 |
| `src/LocalLiveApps.tsx`、`src/LocalLiveApps.test.tsx` | 修改 | 重新載入失敗不算操作失敗 |
| `docs/AI_AGENT_HANDOFF.md`、`README.md` | 修改 | 說明 |

---

### Task 0: 改版前基準截圖

- [ ] **Step 1:** 確認 `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/` 回 `200`。若不是，背景執行 `npm run dev -- --port 5173 --strictPort`。
- [ ] **Step 2:** `node scripts/capture-pages.mjs .superpowers/qa/follow-ups/before`，Expected 24 張＋`report.json`。截圖不 commit。

---

### Task 1: 共用相對時間與每分鐘更新

**Files:**
- Create: `src/components/relativeTime.ts`、`src/components/relativeTime.test.tsx`
- Modify: `src/components/organizer/orderView.ts`

**Interfaces:**
- Produces（Task 2、3 使用）：
  - `formatRelativeTime(value: string | undefined | null, now: Date): string`
  - `useNow(fixed?: Date, intervalMs = 60_000): Date`
    - 有 `fixed` 時直接回傳它，不開計時器；
    - 否則每 `intervalMs` 更新一次，卸載時清除。
  - `<RelativeTime value={iso} now={date} prefix?="下單 " />`
    - 輸出 `<time dateTime={iso} title={完整時間}>{prefix}{相對時間}</time>`；
    - `value` 無效時輸出 `null`。
- `orderView.ts` 的 `formatRelativeTime` 改為 `export { formatRelativeTime } from '../relativeTime'`，既有匯入不變。

- [ ] **Step 1: 寫失敗測試** `src/components/relativeTime.test.tsx`：

```tsx
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatRelativeTime, RelativeTime, useNow } from './relativeTime'

const now = new Date('2026-09-25T04:00:00.000Z')

describe('formatRelativeTime', () => {
  it('uses just now, minutes, hours, then the Taipei date and time', () => {
    expect(formatRelativeTime('2026-09-25T03:59:40.000Z', now)).toBe('剛剛')
    expect(formatRelativeTime('2026-09-25T03:59:00.000Z', now)).toBe('1 分鐘前')
    expect(formatRelativeTime('2026-09-25T03:01:00.000Z', now)).toBe('59 分鐘前')
    expect(formatRelativeTime('2026-09-25T03:00:00.000Z', now)).toBe('1 小時前')
    expect(formatRelativeTime('2026-09-24T04:00:01.000Z', now)).toBe('23 小時前')
    expect(formatRelativeTime('2026-09-24T04:00:00.000Z', now)).toBe('09/24 12:00')
  })

  it('never shows a negative time for a clock that runs ahead, and ignores missing values', () => {
    expect(formatRelativeTime('2026-09-25T04:03:00.000Z', now)).toBe('剛剛')
    expect(formatRelativeTime(undefined, now)).toBe('')
    expect(formatRelativeTime(null, now)).toBe('')
    expect(formatRelativeTime('not a date', now)).toBe('')
  })
})

function Clock({ fixed }: { fixed?: Date }) {
  const current = useNow(fixed)
  return <p>{current.toISOString()}</p>
}

describe('useNow', () => {
  afterEach(() => { vi.useRealTimers() })

  it('refreshes once a minute and stops when unmounted', () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const { unmount } = render(<Clock />)
    expect(screen.getByText('2026-09-25T04:00:00.000Z')).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(60_000) })
    expect(screen.getByText('2026-09-25T04:01:00.000Z')).toBeInTheDocument()

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('uses a fixed time without starting a timer', () => {
    vi.useFakeTimers()
    render(<Clock fixed={now} />)
    expect(screen.getByText('2026-09-25T04:00:00.000Z')).toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('RelativeTime', () => {
  it('shows the relative time with the full time as a hint', () => {
    render(<RelativeTime value="2026-09-25T03:57:00.000Z" now={now} prefix="下單 " />)
    const time = screen.getByText('下單 3 分鐘前')
    expect(time.tagName).toBe('TIME')
    expect(time).toHaveAttribute('dateTime', '2026-09-25T03:57:00.000Z')
    expect(time).toHaveAttribute('title', '2026/09/25 11:57')
  })

  it('renders nothing for a missing time', () => {
    const { container } = render(<RelativeTime value={undefined} now={now} />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2:** `npx vitest run src/components/relativeTime.test.tsx` → FAIL（模組不存在）。

- [ ] **Step 3: 實作** `src/components/relativeTime.ts`：

```ts
import { createElement, useEffect, useState } from 'react'
import { formatZhTwTimestamp } from '../domain/timestamp'

const parse = (value: string | undefined | null) => {
  const time = Date.parse(value ?? '')
  return Number.isNaN(time) ? null : time
}

// A device clock running ahead of the server must not produce "-1 分鐘前", so anything not yet a minute old is "剛剛".
export function formatRelativeTime(value: string | undefined | null, now: Date): string {
  const time = parse(value)
  if (time === null || !value) return ''
  const minutes = Math.floor((now.getTime() - time) / 60_000)
  if (minutes < 1) return '剛剛'
  if (minutes < 60) return `${minutes} 分鐘前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小時前`
  return formatZhTwTimestamp(value).slice(5)
}

export function useNow(fixed?: Date, intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (fixed) return
    const timer = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(timer)
  }, [fixed, intervalMs])
  return fixed ?? now
}

type RelativeTimeProps = { value: string | undefined | null; now: Date; prefix?: string; className?: string }

export function RelativeTime({ value, now, prefix = '', className }: RelativeTimeProps) {
  const text = formatRelativeTime(value, now)
  if (!text || !value) return null
  return createElement('time', { dateTime: value, title: formatZhTwTimestamp(value), className }, `${prefix}${text}`)
}
```

若 lint 要求元件放在 `.tsx`：
- 把檔名改為 `relativeTime.tsx`；
- 用 JSX 取代 `createElement`；
- 寫進回報（後續 Task 的匯入路徑不含副檔名，不受影響）。

`src/components/organizer/orderView.ts`：
- 刪除原本的 `export function formatRelativeTime …` 整個函式，在檔案 import 區後加 `export { formatRelativeTime } from '../relativeTime'`。
- `formatZhTwTimestamp` 若因此未使用，從 import 移除。

- [ ] **Step 4:** `npx vitest run src/components/relativeTime.test.tsx src/components/organizer` → PASS；`npm test`、`npx tsc -b`、`npm run lint` → 無錯誤、無警告。
- [ ] **Step 5: Commit** `git commit -m "feat: share relative times and refresh them every minute"`（add 上述檔案）。

---

### Task 2: 團主端概況每分鐘更新，訂單表加下單時間

**Files:**
- Modify: `src/components/organizer/OverviewSection.tsx`、`OverviewSection.test.tsx`
- Modify: `src/components/organizer/OrdersSection.tsx`、`OrdersSection.test.tsx`、`organizer.css`

**Interfaces:**
- Consumes：Task 1 的 `useNow`、`RelativeTime`；`orderView.ts` 的 `wasEdited(order)`。
- Produces：`OrdersSection` 新增選填 prop `now?: Date`（測試用，同 `OverviewSection`）。

- [ ] **Step 1: 寫失敗測試**

`OverviewSection.test.tsx` 的 `describe` 內新增：
- 檔案頂端從 vitest 補 import `afterEach`、`vi`；
- 從 `@testing-library/react` 補 import `act`；
- 原有的 fixture 名稱沿用檔案裡的。

```tsx
  it('refreshes the relative times every minute without new orders', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-25T04:00:30.000Z'))
    const fresh = { ...summary, orderRows: [{ ...summary.orderRows[0], orderedAt: '2026-09-25T04:00:00.000Z', updatedAt: undefined }] }
    render(<OverviewSection campaignId="campaign-1" campaignTitle="冰餅團" openedAt="2026-09-20T00:00:00.000Z" summary={fresh} status="open" liveState="live" />)
    const latest = screen.getByRole('list', { name: '最新訂單' })
    expect(within(latest).getByText('剛剛')).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(120_000) })
    expect(within(latest).getByText('2 分鐘前')).toBeInTheDocument()
    vi.useRealTimers()
  })
```

- 若檔內 fixture 變數名不是 `summary`，照實際名稱替換。
- 若最新訂單的時間文字外包了「已修改・」等前綴，改用 `getByText(/剛剛$/)`，並寫進回報。

`OrdersSection.test.tsx` 的 `describe` 內新增：

```tsx
  it('shows when each order was placed and when it was changed', () => {
    const now = new Date('2026-09-24T12:30:00.000Z')
    const edited: OrganizerOrderSummary = {
      ...summary,
      orderRows: summary.orderRows.map((order) => order.orderId === 'order-1'
        ? { ...order, updatedAt: '2026-09-24T12:25:00.000Z' }
        : order),
    }
    render(<OrdersSection campaignTitle="一涼製冰所" openedAt="2026-09-20T00:00:00.000Z" summary={edited} status="open" liveState="live" now={now} />)

    expect(screen.getByRole('columnheader', { name: '下單時間' })).toBeInTheDocument()
    const placed = within(rowOf(/H11/)).getByText('2 小時前')
    expect(placed.tagName).toBe('TIME')
    expect(placed).toHaveAttribute('title', '2026/09/24 18:00')
    expect(within(rowOf(/H11/)).getByText('已修改・5 分鐘前')).toBeInTheDocument()
    expect(within(rowOf(/2I7/)).getByText('30 分鐘前')).toBeInTheDocument()
    expect(within(rowOf(/2I7/)).queryByText(/已修改/)).not.toBeInTheDocument()
  })
```

（該檔 fixture 的 `orderedAt` 是 `2026-09-24T1${index}:00:00.000Z`，H11 是第 0 筆、2I7 是第 2 筆；`updatedAt` 未設定。）

- [ ] **Step 2:** `npx vitest run src/components/organizer/OverviewSection.test.tsx src/components/organizer/OrdersSection.test.tsx` → FAIL（時間不更新；沒有「下單時間」欄）。

- [ ] **Step 3: 實作**

`OverviewSection.tsx`：
- 加上 `import { useNow } from '../relativeTime'`；
- `const today = now ?? new Date()` 改為 `const today = useNow(now)`。

這一行在元件最上方的 hooks 區塊之後、任何提前 return 之前，所以能直接替換。

`OrdersSection.tsx`：
1. 加上 import：
   - `import { RelativeTime, useNow } from '../relativeTime'`
   - 從 `./orderView` 多匯入 `wasEdited`。
2. props 型別加 `now?: Date`，解構加 `now`。在元件開頭的其他 `useState` 之後加 `const currentTime = useNow(now)`。
3. `<thead>` 在「金額」欄之後加 `<th scope="col">下單時間</th>`。
4. 每列在金額的 `<td>` 之後加：

```tsx
                        <td data-label="下單時間" className="organizer-order-time">
                          <RelativeTime value={order.orderedAt} now={currentTime} />
                          {wasEdited(order) && (
                            <small>已修改・<RelativeTime value={order.updatedAt} now={currentTime} /></small>
                          )}
                        </td>
```

`organizer.css` 檔尾加：

```css
.organizer-order-time { white-space: nowrap; font-variant-numeric: tabular-nums; }
.organizer-order-time small { display: block; color: var(--color-text-secondary); font-size: var(--font-size-caption); }
```

- [ ] **Step 4:** 上述兩個測試檔 → PASS；`npm test`、`npx tsc -b`、`npm run lint` → 無錯誤、無警告。
- [ ] **Step 5: Commit** `git commit -m "feat: show order times in the organizer order table and keep relative times current"`。

---

### Task 3: 住戶端訂單牆改用相對時間

**Files:**
- Modify: `src/components/resident/OrderWall.tsx`
- Modify: `src/components/resident/residentComponents.test.tsx`、`src/App.test.tsx`、`src/LocalLiveApps.test.tsx`

**Interfaces:**
- Consumes：Task 1 的 `useNow`、`RelativeTime`。
- Produces：`OrderWall` 新增選填 prop `now?: Date`（測試用）。`App.tsx` 不必改。

- [ ] **Step 1: 修改與新增測試（先失敗）**

1. `src/App.test.tsx` 的 `shows campaign and order timestamps with meaningful edit markers`：
   - `getByText('下單時間 2026/08/14 08:10')` → `getByText('下單 08/14 08:10')`；
   - `getByText('已修改・最後修改 2026/08/14 08:12')` → `getByText('已修改・08/14 08:12')`；
   - 第一行「開團」時間的斷言不動。

   Demo 訂單在 2026-08，距今超過 24 小時，所以顯示日期。
2. `src/LocalLiveApps.test.tsx` 中同樣的兩行：
   - `下單時間 2026/08/14 09:00` → `下單 08/14 09:00`；
   - `已修改・最後修改 2026/08/14 09:05` → `已修改・08/14 09:05`。
3. `src/App.test.tsx` 的 `・最後修改 2026/08/14 08:12` 屬於「我的訂單」，**不改**。
4. `residentComponents.test.tsx` 在 `OrderWall` 相關測試旁新增（沿用檔內既有的 `orders` fixture 產生方式；若沒有可重用的，照下面自建）：

```tsx
  it('shows how long ago each order was placed and changed on the order wall', () => {
    const now = new Date('2026-09-25T04:00:00.000Z')
    const wall = [
      { customerId: 'c1', name: '住戶甲', items: { A: 1 }, orderedAt: '2026-09-25T03:55:00.000Z', updatedAt: '2026-09-25T03:59:30.000Z' },
      { customerId: 'c2', name: '住戶乙', items: { A: 2 }, orderedAt: '2026-09-25T01:00:00.000Z', updatedAt: '2026-09-25T01:00:00.000Z' },
    ]
    render(<OrderWall orders={wall as never} quantityUnit="個" itemDisplayLabel={(code) => code} now={now} />)

    const placed = screen.getByText('下單 5 分鐘前')
    expect(placed.tagName).toBe('TIME')
    expect(placed).toHaveAttribute('title', '2026/09/25 11:55')
    expect(screen.getByText('已修改・剛剛')).toBeInTheDocument()
    expect(screen.getByText('下單 3 小時前')).toBeInTheDocument()
    expect(screen.getAllByText(/已修改/)).toHaveLength(1)
    expect(screen.queryByText(/下單時間/)).not.toBeInTheDocument()
  })
```

`as never` 只是為了省略 `VisibleOrder` 其他欄位。若 TypeScript 或 lint 不接受，就補齊 `VisibleOrder` 必要欄位（見 `src/data/demo.ts`），並寫進回報。

- [ ] **Step 2:** `npx vitest run src/components/resident src/App.test.tsx` → FAIL（仍顯示「下單時間 …」）。

- [ ] **Step 3: 實作** `OrderWall.tsx`：
1. import 改為：
   - `import { wasMeaningfullyUpdated } from '../../domain/timestamp'`
   - `import { RelativeTime, useNow } from '../relativeTime'`
2. props 型別加 `now?: Date`，解構加 `now`，在 `useState` 之後加 `const currentTime = useNow(now)`。
3. `<p className="resident-wall-time">…</p>` 整段換成：

```tsx
                  <p className="resident-wall-time">
                    <RelativeTime value={order.orderedAt} now={currentTime} prefix="下單 " />
                    {wasMeaningfullyUpdated(order.orderedAt, order.updatedAt) && (
                      <span>已修改・<RelativeTime value={order.updatedAt} now={currentTime} /></span>
                    )}
                  </p>
```

`resident.css` 的 `.resident-wall-time { display: grid; … }` 會讓兩段各佔一行，不必改。

- [ ] **Step 4:** `npm test`、`npx tsc -b`、`npm run lint` → 全部通過、無警告。
- [ ] **Step 5: Commit** `git commit -m "feat: show relative order times on the resident order wall"`。

---

### Task 4: 開團資訊改為發布必填

**Files:**
- Modify: `src/components/organizer/content/contentChecks.ts`、`contentChecks.test.ts`
- Modify: `src/AdminApp.test.tsx`（以及其他因此無法發布的測試資料）

- [ ] **Step 1: 修改測試（先失敗）**

`contentChecks.test.ts`：
1. `lists each missing requirement in form order`：
   - fixture 加 `announcement: ' '`；
   - 期望陣列在 `'填寫團購標題'` 之後插入 `'填寫開團資訊'`。
2. `does not require an announcement or images` 改名為 `requires the announcement but not images`，內容改為：

```ts
    expect(publishBlockers({ ...ready, announcement: ' \n ' })).toEqual(['填寫開團資訊'])
    expect(publishBlockers(ready)).toEqual([])
```

（`ready` 本來就沒有圖片欄位，第二行即驗證「不要求圖片」。）

- [ ] **Step 2:** `npx vitest run src/components/organizer/content/contentChecks.test.ts` → FAIL。

- [ ] **Step 3: 實作** `publishBlockers` 中，`if (!input.title.trim()) blockers.push('填寫團購標題')` 之後加：

```ts
  if (!input.announcement.trim()) blockers.push('填寫開團資訊')
```

- [ ] **Step 4: 修正因此無法發布的既有測試資料**

Run: `npm test`。會失敗的是「開團資訊為空字串、又要按發布」的測試。已知有：
- `AdminApp.test.tsx` 的 `persists the default mix-and-match rate before enabling publication without touching the rate field`
- `AdminApp.test.tsx` 的 `applies the canonical campaign returned by publication immediately`

修法：把這些 fixture 的 `announcement: ''` 改成 `announcement: '公告'`。

- 不要改斷言。
- 若有測試是在驗證「沒有公告時的其他行為」（例如預覽），不要改它的 fixture。
- 每一處修改都寫進回報（測試名稱與改了什麼）。

- [ ] **Step 5:** `npm test`、`npx tsc -b`、`npm run lint` → 全部通過。
- [ ] **Step 6: Commit** `git commit -m "feat: require the campaign announcement before publishing"`。

---

### Task 5: 三處操作失敗後焦點遺失

**Files:**
- Modify: `src/components/organizer/OrderNoteCell.tsx`、`src/components/organizer/OrdersSection.test.tsx`
- Modify: `src/PickupNotificationPanel.tsx`、`src/PickupNotificationPanel.test.tsx`
- Modify: `src/components/organizer/LiveStatus.tsx`；新增 `src/components/organizer/LiveStatus.test.tsx`（若已有同名測試檔就加在裡面）

**行為：**
- **備註：**儲存中輸入框改為唯讀（`readOnly`＋`aria-busy`），而不是停用，焦點就不會離開。儲存中再按 Enter 或離開欄位都不能重複送出。失敗時焦點仍在輸入框。
- **領取通知：**讀取名單失敗時，焦點回到剛按的那個「預覽…通知」按鈕。
- **重新同步：**按下後提醒列消失，焦點移到取代它的狀態文字（「連線中…」），讓讀屏軟體念出來。

- [ ] **Step 1: 寫失敗測試**

1. `OrdersSection.test.tsx` 的 `locks only the order row being updated`：
   - `expect(screen.getByRole('textbox', { name: 'H11 備註' })).toBeDisabled()` 改為下面兩行：

   ```tsx
       const noteInput = screen.getByRole('textbox', { name: 'H11 備註' })
       expect(noteInput).toHaveAttribute('readonly')
       expect(noteInput).toHaveFocus()
   ```

   - 在它之後加：

   ```tsx
       await user.keyboard('{Enter}')
       expect(onSetOrderOrganizerNote).toHaveBeenCalledTimes(1)
   ```

2. 同檔 `keeps the note editor open with the error when saving fails` 最後加：

   ```tsx
       expect(screen.getByRole('textbox', { name: 'H11 備註' })).toHaveFocus()
   ```

3. `PickupNotificationPanel.test.tsx` 新增：

```tsx
  it('returns focus to the chosen audience when reading the recipient list fails', async () => {
    const user = userEvent.setup()
    let failPreview!: () => void
    const onPreview = vi.fn(() => new Promise<never>((_, reject) => { failPreview = () => reject(new Error('暫時無法讀取名單')) }))
    render(<PickupNotificationPanel {...baseProps} onPreview={onPreview} />)

    await user.click(screen.getByRole('button', { name: '預覽二期通知' }))
    // Browsers drop focus from a button once it is disabled; jsdom does not, so mimic it.
    ;(document.activeElement as HTMLElement).blur()
    await act(async () => { failPreview() })

    expect(await screen.findByRole('alert')).toHaveTextContent('暫時無法讀取名單')
    expect(screen.getByRole('button', { name: '預覽二期通知' })).toHaveFocus()
  })
```

（`act` 從 `@testing-library/react` 補 import。）

4. `LiveStatus.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LiveStatus } from './LiveStatus'

describe('LiveStatus', () => {
  it('keeps keyboard focus on the status that replaces the retry button', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const { rerender } = render(<LiveStatus state="offline" onRetry={onRetry} />)

    await user.click(screen.getByRole('button', { name: '重新同步' }))
    expect(onRetry).toHaveBeenCalledOnce()
    rerender(<LiveStatus state="connecting" onRetry={onRetry} />)

    expect(screen.getByText('連線中…')).toHaveFocus()
  })

  it('does not take focus when the status changes on its own', () => {
    const { rerender } = render(<LiveStatus state="connecting" />)
    rerender(<LiveStatus state="live" />)
    expect(screen.getByText('即時更新')).not.toHaveFocus()
  })
})
```

- [ ] **Step 2:** `npx vitest run src/components/organizer src/PickupNotificationPanel.test.tsx` → FAIL（輸入框是停用；焦點不在預覽鈕；焦點不在狀態文字）。

- [ ] **Step 3: 實作**

`OrderNoteCell.tsx`：
- 編輯中的 `<input>`：
  - `disabled={saving}` 改為 `readOnly={saving}`；
  - 並加 `aria-busy={saving || undefined}`。
- `onKeyDown` 開頭加 `if (saving) return`，讓 Enter 與 Escape 在儲存中都不作用。
- `onBlur` 已有 `!saving` 判斷，不必改。

`PickupNotificationPanel.tsx`：
1. `type FocusTarget` 加 `'second-choice'`。
2. 加 `const secondChoiceRef = useRef<HTMLButtonElement>(null)`，並接到「預覽二期…通知」的 `<Button ref={secondChoiceRef} …>`。
3. 焦點 effect 的 `elements` 物件加 `'second-choice': secondChoiceRef.current`。
4. `openPreview` 的 `catch` 區塊，在 `setError(…)` 之後加：

   ```ts
         focusTargetRef.current = nextAudience === 'phase2' ? 'second-choice' : 'first-choice'
   ```

`LiveStatus.tsx` 整檔換成：

```tsx
import { useEffect, useRef } from 'react'
import { FeedbackMessage } from '../ui/FeedbackMessage'

export type LiveState = 'connecting' | 'live' | 'offline' | 'unavailable'

export function LiveStatus({ state, onRetry }: { state: LiveState; onRetry?: () => void }) {
  const statusRef = useRef<HTMLSpanElement>(null)
  const retriedRef = useRef(false)

  // The retry button disappears as soon as the retry starts; keep keyboard users on the status that replaces it.
  useEffect(() => {
    if (!retriedRef.current || state === 'offline') return
    retriedRef.current = false
    statusRef.current?.focus()
  }, [state])

  if (state === 'unavailable') return null
  if (state === 'offline') {
    return (
      <FeedbackMessage
        tone="warning"
        className="organizer-live-warning"
        actionLabel={onRetry ? '重新同步' : undefined}
        onAction={onRetry ? () => { retriedRef.current = true; onRetry() } : undefined}
      >
        即時同步中斷，畫面可能不是最新
      </FeedbackMessage>
    )
  }
  return (
    <span ref={statusRef} tabIndex={-1} className="organizer-live" data-state={state}>
      {state === 'live' ? '即時更新' : '連線中…'}
    </span>
  )
}
```

- [ ] **Step 4:** 上述測試 → PASS；`npm test`、`npx tsc -b`、`npm run lint` → 全部通過、無警告。
- [ ] **Step 5: Commit** `git commit -m "fix: keep keyboard focus after failed note saves, failed previews and resync"`。

---

### Task 6: 備註或取消成功、重新載入失敗時不算失敗

**Files:**
- Modify: `src/LocalLiveApps.tsx`（`LocalLiveAdminApp`）
- Modify: `src/LocalLiveApps.test.tsx`

**Interfaces:**
- Consumes：`LocalLiveAdminApp` 既有的 `reloadOrderSummary`、`setLiveState`（第 4 階段即時更新）、`setOrderOrganizerNote`、`cancelOrder`。

- [ ] **Step 1: 寫失敗測試**

在 `src/LocalLiveApps.test.tsx` 的 `describe('organizer realtime', …)` 內新增。它使用該 describe 既有的 `realtimeClient()`、`publishedRepository()`；`ordersRepository` 與 `orderSummary` 是檔案頂端的 fixture。

```tsx
  it('keeps a saved note and a cancelled order as done when only the refresh afterwards fails', async () => {
    const user = userEvent.setup()
    const { client } = realtimeClient()
    const workflow = ordersRepository()
    vi.mocked(workflow.loadSummary)
      .mockResolvedValueOnce(orderSummary)
      .mockRejectedValue(new Error('network'))
    render(<LocalLiveAdminApp client={client} campaignId="campaign-1" repository={publishedRepository()} ordersRepository={workflow} section="orders" />)
    expect(await screen.findByRole('heading', { level: 2, name: '訂單' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '編輯 H11 備註' }))
    await user.type(screen.getByRole('textbox', { name: 'H11 備註' }), '放管理室{Enter}')

    expect(await screen.findByRole('button', { name: '編輯 H11 備註' })).toHaveTextContent('放管理室')
    expect(screen.queryByText(/儲存備註失敗|network/)).not.toBeInTheDocument()
    expect(screen.getByText('即時同步中斷，畫面可能不是最新')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '更多操作 H11・佩怡' }))
    await user.click(screen.getByRole('menuitem', { name: '取消 H11 訂單' }))
    await user.click(screen.getByRole('button', { name: '確認取消訂單' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '確認取消訂單' })).not.toBeInTheDocument())
    expect(workflow.cancelOrder).toHaveBeenCalledOnce()
  })
```

- 若 H11 在初始 fixture 已有備註，`toHaveTextContent('放管理室')` 仍成立（新內容接在後面）。
- 若因初始備註而斷言不成立，先 `clear` 再輸入，並寫進回報。

- [ ] **Step 2:** `npx vitest run src/LocalLiveApps.test.tsx -t "only the refresh afterwards fails"` → FAIL（顯示錯誤，或確認視窗未關閉）。

- [ ] **Step 3: 實作** 在 `LocalLiveAdminApp` 中，`setOrderOrganizerNote` 與 `cancelOrder` 定義之前加：

```tsx
  // The write already succeeded; a failed refresh only means the list may be stale, which the live status reports.
  const refreshAfterWrite = async () => {
    try {
      await reloadOrderSummary()
    } catch {
      setLiveState('offline')
    }
  }
```

並把這兩個處理函式裡的 `await reloadOrderSummary()` 改為 `await refreshAfterWrite()`。
- 寫入本身（`ordersGateway.setOrderOrganizerNote`／`cancelOrder`）的錯誤仍照舊丟出，由畫面顯示失敗。

- [ ] **Step 4:** `npm test`、`npx tsc -b`、`npm run lint` → 全部通過、無警告。
- [ ] **Step 5: Commit** `git commit -m "fix: report a failed refresh after a note or cancel as a sync problem, not a failed change"`。

---

### Task 7: 截圖、文件與完整驗證

- [ ] **Step 1:** `npm test`、`npx tsc -b`、`npm run lint`、`npm run build` → 全部通過。
- [ ] **Step 2:** `node scripts/capture-pages.mjs .superpowers/qa/follow-ups/after`。Expected：24 張，無水平溢出。比對 `before`，以下幾張應有變化，其餘應相同，並在回報說明：
  - `admin-orders-*`：多了下單時間欄；
  - `admin-overview-*`：時間顯示可能不同；
  - `resident-campaign-*`：訂單牆時間。

  逐張看 375px 的訂單表與訂單牆沒有擠壓或換行錯亂。截圖不 commit。
- [ ] **Step 3: 文件**
  - `README.md`：把「公開訂單牆顯示下單時間與最後修改時間」改為「公開訂單牆以相對時間（剛剛／N 分鐘前…）顯示下單與修改時間，每分鐘自動更新」。
  - `docs/AI_AGENT_HANDOFF.md`：
    - 描述內容設定的那一行（含 `contentChecks.ts`）之後加一行：`- 發布前檢查：團購標題、開團資訊、每個品項的名稱與單價、門檻、結單日期、優惠設定都要完成才能發布；圖片不是必填。`
    - 描述 `OverviewSection.tsx`、`OrdersSection.tsx` 的那一行，末尾補上：`相對時間由 src/components/relativeTime.ts 每分鐘重算。`
- [ ] **Step 4:** 在本計畫檔尾加 `## 執行結果（YYYY-MM-DD）`，寫入以下內容：
  - commit 範圍、測試數、截圖結果；
  - 執行中的修正；
  - 延後的小問題；
  - 請團主確認的事項，至少包含：概況頁放著幾分鐘後，時間會自己變。
- [ ] **Step 5: Commit** `git commit -m "docs: describe relative order times and the required announcement"`（add `README.md`、`docs/AI_AGENT_HANDOFF.md`、本計畫檔）。

## 執行結果（2026-09-25）

**Commit 範圍：** `9325c55..19f678f`（`7a94c4d` 共用相對時間、`3da7fc6` 團主端訂單表下單時間欄＋概況每分鐘更新、`d8c57e6` 住戶端訂單牆相對時間、`553e4c6` 開團資訊發布必填、`25b6900` 三處焦點修正、`6b4d376` 重新載入失敗不算操作失敗、`19f678f` 補強領取通知焦點回復測試）。本次（Task 7）另加一個 commit（見下方 Step 5）。

**測試／驗證：**
- `npm test`：97 個測試檔、710 個測試全數通過。
- `npx tsc -b`：無錯誤。
- `npm run lint`（oxlint）：無錯誤、無警告。
- `npm run build`：成功；僅既有的「部分 chunk 超過 500 kB」建置提示（與本次改動無關，不是錯誤）。

**截圖結果：** `node scripts/capture-pages.mjs .superpowers/qa/follow-ups/after` 產出 24 張 PNG＋`report.json`，`scrollWidth` 在 375／768／1440 三種寬度下都等於 viewport 寬度、`offenders=0`，沒有水平溢出。與 `before` 逐張位元比對：
- `admin-orders-375/768/1440`：有差異，多了「下單時間」欄，第二行「已修改・{相對時間}」，滑鼠停留有完整時間 `title`；375px 與 768px 的訂單卡片／表格逐張目視確認無擠壓或換行錯亂。
- `resident-campaign-375/768/1440`：有差異，「大家的訂單」（含住戶自己在牆上被標示出來的那一列）改成「下單 08/14 08:10」「已修改・08/14 08:12」的相對時間格式（demo 資料是 2026/08/14，距今已超過 24 小時，所以顯示為 `MM/DD HH:mm` 而非「N 小時前」），逐張目視確認排版正常。「我的訂單」不屬於這次範圍，`App.tsx` 裡仍顯示完整的「最後修改」時間，沒有改動。
- `admin-overview-375/768/1440`：與 `before` 位元完全相同。原因：demo 資料裡「最新訂單」的下單時間都超過 24 小時（2026/08/14），無論是改版前的 `orderView.ts` 版 `formatRelativeTime` 或改版後 `src/components/relativeTime.ts` 版，同一個時間點都會格式化成同樣的 `MM/DD HH:mm` 字串，畫面文字沒有變化，因此截圖位元相同；這不代表功能沒生效，只是 demo 資料剛好落在「顯示絕對日期」的區間——demo 訂單時間都超過 24 小時，截圖看不出每分鐘重算的效果。每分鐘自動更新確實生效，是由 `OverviewSection.test.tsx` 的 fake-timer 測試（`refreshes the relative times every minute without new orders`）驗證的，並非用截圖或手動操作驗證。
- 其餘 15 張（`admin-editor-*`、`admin-list-*`、`admin-residents-*`、`admin-settings-*`、`resident-list-*`）與 `before` 位元完全相同，符合預期。

**執行中的修正（相對於原計畫文字的偏離，均已如實記錄於對應 commit）：**
- 四個「已修改・…」斷言（`OrdersSection.test.tsx`、`residentComponents.test.tsx` 等）改用比對 `textContent` 的自訂 matcher，因為 Testing Library 預設的文字比對不會跨越內嵌的 `<time>` 元素邊界，無法用 `getByText` 直接比對含巢狀標籤的完整字串。
- `PickupNotificationPanel` 的焦點回復測試原本用 `blur()` 停用中的按鈕來模擬瀏覽器行為，但 jsdom 對 disabled 按鈕呼叫 `blur()` 是 no-op，導致測試在復原修正前也會通過（沒有真的守住 bug）；改為先把焦點移到一個暫時的 DOM 元素、模擬瀏覽器把焦點從被停用按鈕上移開的行為，並回退實作驗證測試會 RED，才確認測試確實守住這個修正。

**延後的小問題（不影響功能、未修正）：**
- `src/components/relativeTime.ts` 中 `formatRelativeTime` 有一處 `!value` 判斷與前面的 `time === null` 判斷重複（`value` 為 falsy 時 `Date.parse('')` 已會是 `NaN`，`time === null` 已涵蓋），可再簡化但不影響行為。
- `OrdersSection.test.tsx` 有一處多餘的空白行，屬純風格問題。

**請團主確認：**
- 團主概況頁（`/admin/campaign/{id}/overview`）打開後放著幾分鐘不動，「最新訂單」與相關時間顯示會自己每分鐘更新一次，不必重新整理頁面。
- 團主端訂單表（`/admin/campaign/{id}/orders`）新增「下單時間」欄，顯示相對時間，修改過的訂單第二行會多一行「已修改・{相對時間}」，滑鼠停留可看到完整時間。
- 住戶端訂單牆（公開團購頁的「大家的訂單」）改成「下單 N 分鐘前」的相對時間顯示方式。
- 發布團購前，若「開團資訊」欄位是空白（含只有空白字元），會被擋下並顯示「填寫開團資訊」，跟其他必填項目一樣。
- 這次上線之後，已經開團、但「開團資訊」目前是空白的團購，之後想再發布任何更新（例如改內容、改品項），都會先被擋下、要求先把開團資訊填好才能發布。
