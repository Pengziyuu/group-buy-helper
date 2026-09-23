# 前端改版第 3 階段：團主端架構 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依規格建立團主端的新網址與路由、上方導覽、團購工作區左側欄、首頁表格、住戶頁與設定頁；尚未改寫的分區（訂單、內容設定、領取通知）暫時沿用現有畫面。

**Architecture:**
- **導覽與網址：** 團主端改為單頁內導覽。`RuntimeApp` 以 `history.pushState` 持有目前網址，透過 React context 提供 `navigate`；`OrganizerLink` 攔截一般左鍵點擊。`LocalLiveAdminApp` 因此在團主端頁面之間不會重新掛載，也不必重新驗證登入。
- **頁面元件：** 新增 `src/components/organizer/`，包含上方導覽殼層、建立新團視窗、首頁表格、設定頁與工作區左側欄。住戶頁直接改寫既有的 `ResidentMemberManagementApp`。
- **編輯器不卸載：** 同一團的工作區內，`AdminApp`（內容設定＋訂單）始終保持掛載，只以 `section` 屬性切換顯示。切換分區不會遺失尚未自動儲存的編輯。
- **結單與領取通知搬移：** 結單／重新開放從訂單面板搬到左側欄，並加上確認視窗；領取通知從訂單面板搬到自己的分區。

**Tech Stack:** React 19、TypeScript 6、Vite 8、Vitest 4、Testing Library、原生 CSS（`src/styles/tokens.css` 的 token）

**Spec:**
- 主要依據：`docs/superpowers/specs/2026-09-21-frontend-redesign-design.md` 的〈團主端〉（架構與網址、首頁、左側欄、住戶、設定）、〈螢幕寬度切換〉、〈狀態畫面〉、〈必須維持的產品規則〉、〈測試與驗證〉。
- 第 1 階段留給第 3 階段的事項：見 `docs/superpowers/plans/2026-09-21-redesign-phase-1-foundations.md` 最後一節。
- 第 2 階段結果：見 `docs/superpowers/plans/2026-09-21-redesign-phase-2-resident.md` 最後一節。

## Global Constraints

- Node.js 22.12.0 以上（機器上為 v22.23.2）。
- 只改前端：不得修改 `supabase/**`、`scripts/*.py`、`src/services/**`、`src/domain/**`、`src/types/database.ts`。可以修改 `src/LocalLiveApps.tsx`、`src/RuntimeApp.tsx`、`src/main.tsx` 的組裝與路由分派（規格〈程式結構〉允許）。
- 不新增 npm 相依套件。
- 操作色只有一種：`#0066cc`；聚焦外框 `2px solid #0071e3`、`outline-offset: 2px`。
- 字體沿用 `--font-sans`；中文不套負字距；字重只用 400 與 600；團主端表格與表單 14px（`--font-size-dense`），輔助小字最小 12px；頁面標題 20～22px。
- 不使用裝飾性漸層與 UI 陰影；只做淺色模式。
- **可點範圍：** 團主端 1024px 以上 ≥ 24×24px；1024px 以下 ≥ 44×44px（外觀可以較小，以內距或偽元素補足）。所有可點擊元素有 `:focus-visible`。
- 文字與底色組合對比 ≥ 4.5:1（大字 ≥ 3:1）。
- 產品規則（不可破壞）：
  - 團主前端不接觸 LINE User ID、Auth UID、community UUID；住戶管理只用 `memberCode`。
  - `arrived` 顯示為「已結單」，不提供標記到貨。
  - Excel 匯出只在結單後。
  - 領取通知維持一次性指令，正式與測試嚴格隔離。
  - 群組狀態僅供核對，不自動停用住戶。
- 行為不可減少：
  - 自動儲存時機與失敗不自動重試。
  - 草稿與發布隔離。
  - 開團後鎖定品項與價格。
  - session 驗證 fail-closed 與各種登出流程。
  - 嚴格的 UUID／slug 路由。
- TDD：每個行為先寫失敗測試，確認失敗原因是功能缺失，再寫最小實作。
- 修改既有測試時，原本驗證的行為必須仍被某個測試驗證（本計畫每一處測試修改都寫明替代的斷言；刻意移除的行為另外寫明理由）。
- 使用者可見文案一律繁體中文。
- **只 commit、不 push。** 何時上線由團主決定。

## 對 Spec 的調整

1. **「概況」屬於第 4 階段。** 本階段左側欄不放「概況」：
   - 開團中的團預設進入「訂單」。
   - `/admin/campaign/<uuid>/overview` 先以 `replaceState` 導向該團的預設分區（網址仍可解析，第 4 階段不必改路由）。
   - 第 4 階段加入概況後，再把開團中的預設改回概況。
2. **登出只放在「設定 → 帳號」**（規格的設定頁），編輯器頂端的「登出」移除。登出流程本身不變，相關測試改在設定頁操作。
3. **住戶頁「全部」不含已封鎖**，已封鎖只出現在「已封鎖」篩選；標題「住戶 N 位」的 N 同樣不含已封鎖。未綁定改稱「尚未填戶號」（規格用語）。
4. **已結單的團不顯示結單時間：**
   - 首頁「結單」欄顯示「—」，左側欄也不列「結單」。
   - 原因：提前結單不會清掉 `auto_close_at`，時間可能從未發生（住戶端第 2 階段已改為「原訂結單」，團主端直接不顯示）。
5. **首頁空白狀態：** 標題「建立第一團」，說明指向右上角的「建立新團」（建立視窗屬於上方導覽，所有頁面共用）。
6. **住戶頁保留 2026-09-24 加入的群組查驗**（一個按鈕查驗全部、數量與燈號），規格撰寫時尚無此功能。
7. **左側欄的團名與封面取自載入時的內容：**
   - 在內容設定修改標題後，左側欄要等發布或重新載入才更新。
   - 內容設定會在第 5 階段重寫，屆時再改成即時同步。
8. **領取通知分區暫時沿用現有 `PickupNotificationPanel`**（按鈕＋對話框），第 4 階段改成頁面內步驟。
9. **結單／重新開放改為先確認**（規格要求；原本在訂單面板按下即送出）。
10. **團主端標籤：** 「待發布」改為「草稿」、「已結束」改為「已結單」（規格〈已確認的決策〉）；首頁不再有「工作概況」四格數字。

## Review Focus

以下五種情況沒有任何既有測試涵蓋，最可能讓團主遇到問題。每一項都在負責的 Task 補上測試：

1. **在內容設定打字後立刻切到「訂單」再切回來**，打的字必須還在。
   - 原因：編輯器若因切換分區卸載，500ms 自動儲存計時會被丟掉。
   - 由 Task 8 測試：`AdminApp` 以 `section` 切換時保留草稿，並在 live 工作區再驗一次。
2. **從 A 團回首頁再進 B 團**（或用瀏覽器上一頁／下一頁），不能先顯示 A 團的草稿。
   - 原因：`AdminApp` 只在掛載時讀 `initialContent`，若沿用舊實例，編輯時會把 A 團內容存進 B 團。
   - 由 Task 8 測試：換團時先顯示載入中，再出現 B 團標題。
3. **首頁表格整列可點，但按列內的「複製住戶連結」、「⋯」與選單項目不能觸發進入工作區。**
   - Task 4 測試。
4. **列內「⋯」選單不能被可捲動的表格裁切**，且在對話框內按 Esc 只關選單、不關對話框（第 1 階段遺留）。
   - Task 2 測試：固定定位與向上展開、Esc 不外傳、選擇連結後焦點回到觸發鈕。
5. **只有團購 UUID 的網址**（例如 LINE 分享或舊書籤）要導向正確分區，並以 `replaceState` 取代，按「上一頁」不會卡在原地反覆導向。`/overview` 同理。
   - Task 7 測試工作區導向；Task 1 測試路由解析。

## 檔案地圖

| 檔案 | 動作 | 責任 |
|---|---|---|
| `src/routing.ts`、`src/routing.test.ts` | 修改 | 新增住戶、設定與工作區分區路由；`parseResidentFilter`、`campaignSectionPath` |
| `src/components/ui/Menu.tsx`、`Menu.test.tsx`、`ui.css` | 修改 | 選單固定定位與向上展開；Esc 不外傳；連結項目關閉後焦點回觸發鈕 |
| `src/components/organizer/organizerNavigation.ts` | 新增 | 網址狀態 hook、navigate context |
| `src/components/organizer/OrganizerLink.tsx` | 新增 | `OrganizerNavigationProvider`、`OrganizerLink` |
| `src/components/organizer/OrganizerShell.tsx`、`CreateCampaignDialog.tsx` | 新增 | 上方導覽與建立新團視窗 |
| `src/components/organizer/organizerShell.test.tsx` | 新增 | 導覽與建立新團測試 |
| `src/components/organizer/organizer.css` | 新增 | 團主端殼層、首頁、設定、工作區樣式 |
| `src/components/organizer/campaignListView.ts`、`campaignListView.test.ts` | 新增 | 首頁分類、排序、進度文字 |
| `src/components/organizer/copyResidentLink.ts` | 新增 | 複製住戶連結（首頁與左側欄共用） |
| `src/components/organizer/OrganizerHome.tsx`、`OrganizerHome.test.tsx` | 新增 | 首頁表格 |
| `src/components/organizer/residentView.ts`、`residentView.test.ts` | 新增 | 住戶篩選、搜尋、戶號文字 |
| `src/ResidentMemberManagementApp.tsx`、`.css`、`.test.tsx` | 改寫／修改 | 住戶頁 |
| `src/components/organizer/OrganizerSettings.tsx`、`OrganizerSettings.test.tsx` | 新增 | 設定頁 |
| `src/components/organizer/workspaceSections.ts`、`WorkspaceRail.tsx`、`CampaignWorkspace.tsx`、`PickupSection.tsx`、`organizerWorkspace.test.tsx` | 新增 | 工作區左側欄、分區導向、領取通知分區 |
| `src/AdminApp.tsx`、`AdminApp.test.tsx` | 修改 | 移除頂部標題、分頁與登出；新增 `section` 屬性 |
| `src/AdminOrdersPanel.tsx`、`AdminOrdersPanel.test.tsx` | 修改 | 移除結單鈕與領取通知 |
| `src/LocalLiveApps.tsx`、`LocalLiveApps.test.tsx` | 修改 | 依頁面載入資料、套上殼層與工作區 |
| `src/RuntimeApp.tsx`、`RuntimeApp.test.tsx`、`src/main.tsx` | 修改 | 網址狀態、各頁分派、Demo 各頁 |
| `src/CampaignListApp.tsx`、`.css`、`.test.tsx` | 刪除 | 由首頁、住戶頁、設定頁取代 |
| `scripts/capture-pages.mjs` | 修改 | 新頁面清單；`click` 找不到元素時報錯 |
| `docs/AI_AGENT_HANDOFF.md`、`README.md` | 修改 | 團主端網址清單 |

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
node scripts/capture-pages.mjs .superpowers/qa/phase-3/before
```

Expected：
- 15 行輸出、15 張 PNG 與 `report.json`（腳本現有的 5 頁 × 3 寬度，含 `admin-orders` 點擊 `#admin-orders-tab`）。
- 每行 scrollWidth 兩個數字相同。
- 沒有 commit。

---

### Task 1: 團主端路由

**Files:**
- Modify: `src/routing.ts`（整檔改寫）
- Modify: `src/routing.test.ts`
- Modify: `src/RuntimeApp.tsx`（只改路由種類名稱，見 Step 4）

**Interfaces:**
- Produces（Task 3～8 使用）：
  - `type WorkspaceSection = 'overview' | 'orders' | 'content' | 'pickup'`
  - `type ResidentFilter = 'all' | 'unbound' | 'other' | 'blocked'`
  - `AppRoute` 新增 `{ kind: 'admin-residents' }`、`{ kind: 'admin-settings' }`；原 `admin-editor` 改名為 `{ kind: 'admin-campaign'; campaignId: string; section: WorkspaceSection | null }`
  - `parseResidentFilter(search: string): ResidentFilter`
  - `campaignSectionPath(campaignId: string, section: WorkspaceSection): string`

- [ ] **Step 1: 寫失敗測試**

把 `src/routing.test.ts` 的 import 與前三個測試換成下面內容，並新增兩個測試；最後一個 `recovers only strict resident routes from LINE liff.state` 測試保留不動：

```ts
import { describe, expect, it } from 'vitest'
import { campaignSectionPath, parseAppRoute, parseResidentFilter, resolveLiffPath, selectAppMode } from './routing'

const campaignId = '8d2f0f6a-1111-4222-8333-123456789abc'
const campaignSlug = '0123456789abcdef0123456789abcdef0123'
const inviteSlug = 'abcdef0123456789abcdef0123456789abcd'

describe('app routing', () => {
  it('opens organizer mode on every organizer page and workspace section', () => {
    for (const path of [
      '/admin', '/admin/', '/admin/residents', '/admin/settings/', '/admin/notification-lab',
      `/admin/campaign/${campaignId}`, `/admin/campaign/${campaignId}/orders`,
    ]) {
      expect(selectAppMode(path)).toBe('admin')
    }
    expect(selectAppMode('/')).toBe('resident')
    expect(selectAppMode(`/campaign/${campaignSlug}`)).toBe('resident')
  })

  it('parses organizer pages, workspace sections, and resident share routes', () => {
    expect(parseAppRoute('/admin')).toEqual({ kind: 'admin-list' })
    expect(parseAppRoute('/admin/residents')).toEqual({ kind: 'admin-residents' })
    expect(parseAppRoute('/admin/settings/')).toEqual({ kind: 'admin-settings' })
    expect(parseAppRoute('/admin/notification-lab')).toEqual({ kind: 'admin-notification-lab' })
    expect(parseAppRoute(`/admin/campaign/${campaignId}`)).toEqual({ kind: 'admin-campaign', campaignId, section: null })
    for (const section of ['overview', 'orders', 'content', 'pickup'] as const) {
      expect(parseAppRoute(`/admin/campaign/${campaignId}/${section}`)).toEqual({ kind: 'admin-campaign', campaignId, section })
      expect(parseAppRoute(`/admin/campaign/${campaignId}/${section}/`)).toEqual({ kind: 'admin-campaign', campaignId, section })
    }
    expect(parseAppRoute(`/campaign/${campaignSlug}`)).toEqual({ kind: 'resident-campaign', campaignSlug })
    expect(parseAppRoute(`/join/${inviteSlug}`)).toEqual({ kind: 'resident-invite', inviteSlug })
    expect(parseAppRoute('/')).toEqual({ kind: 'resident-default' })
  })

  it('rejects malformed, encoded, unknown-section, and trailing-segment routes safely', () => {
    expect(parseAppRoute('/admin/campaign/not-a-uuid')).toEqual({ kind: 'not-found' })
    expect(parseAppRoute(`/admin/campaign/${campaignId}/extra`)).toEqual({ kind: 'not-found' })
    expect(parseAppRoute(`/admin/campaign/${campaignId}/ORDERS`)).toEqual({ kind: 'not-found' })
    expect(parseAppRoute(`/admin/campaign/${campaignId}/orders/extra`)).toEqual({ kind: 'not-found' })
    expect(parseAppRoute('/admin/anything')).toEqual({ kind: 'not-found' })
    expect(parseAppRoute('/admin/residents/extra')).toEqual({ kind: 'not-found' })
    expect(parseAppRoute('/admin//')).toEqual({ kind: 'not-found' })
    expect(parseAppRoute('/admin/constructor')).toEqual({ kind: 'not-found' })
    expect(parseAppRoute('/campaign/short')).toEqual({ kind: 'not-found' })
    expect(parseAppRoute(`/campaign/${campaignSlug}/extra`)).toEqual({ kind: 'not-found' })
    expect(parseAppRoute('/campaign/%E0%A4%A')).toEqual({ kind: 'not-found' })
    expect(parseAppRoute(`/admin//campaign/${campaignId}`)).toEqual({ kind: 'not-found' })
    expect(parseAppRoute(`//campaign/${campaignSlug}`)).toEqual({ kind: 'not-found' })
    expect(parseAppRoute(`/c%61mpaign/${campaignSlug}`)).toEqual({ kind: 'not-found' })
  })

  it('reads only known resident filters from the query string', () => {
    expect(parseResidentFilter('?filter=unbound')).toBe('unbound')
    expect(parseResidentFilter('?filter=other')).toBe('other')
    expect(parseResidentFilter('?filter=blocked')).toBe('blocked')
    expect(parseResidentFilter('')).toBe('all')
    expect(parseResidentFilter('?filter=UNBOUND')).toBe('all')
    expect(parseResidentFilter('?filter=unbound&filter=blocked')).toBe('unbound')
  })

  it('builds workspace section paths', () => {
    expect(campaignSectionPath(campaignId, 'orders')).toBe(`/admin/campaign/${campaignId}/orders`)
  })
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/routing.test.ts`
Expected: FAIL（`parseResidentFilter`、`campaignSectionPath` 不存在；`admin-residents` 等路由回傳 `not-found`）。

- [ ] **Step 3: 改寫 `src/routing.ts`**

```ts
export type AppMode = 'resident' | 'admin'
export type WorkspaceSection = 'overview' | 'orders' | 'content' | 'pickup'
export type ResidentFilter = 'all' | 'unbound' | 'other' | 'blocked'

export type AppRoute =
  | { kind: 'admin-list' }
  | { kind: 'admin-residents' }
  | { kind: 'admin-settings' }
  | { kind: 'admin-notification-lab' }
  | { kind: 'admin-campaign'; campaignId: string; section: WorkspaceSection | null }
  | { kind: 'resident-campaign'; campaignSlug: string }
  | { kind: 'resident-invite'; inviteSlug: string }
  | { kind: 'resident-default' }
  | { kind: 'not-found' }

const UUID_SOURCE = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const SLUG_SOURCE = '[0-9a-f]{36}'
// Section names are lower-case only; the UUID keeps its original case-insensitive match.
const ADMIN_CAMPAIGN_PATTERN = new RegExp(`^/admin/campaign/(${UUID_SOURCE})(?:/(overview|orders|content|pickup))?/?$`)
const RESIDENT_CAMPAIGN_PATTERN = new RegExp(`^/campaign/(${SLUG_SOURCE})/?$`, 'i')
const RESIDENT_INVITE_PATTERN = new RegExp(`^/join/(${SLUG_SOURCE})/?$`)
const ADMIN_PAGES: Record<string, AppRoute> = {
  '/admin': { kind: 'admin-list' },
  '/admin/residents': { kind: 'admin-residents' },
  '/admin/settings': { kind: 'admin-settings' },
  '/admin/notification-lab': { kind: 'admin-notification-lab' },
}

export function resolveLiffPath(pathname: string, search: string): string {
  if (pathname !== '/') return pathname
  const states = new URLSearchParams(search).getAll('liff.state')
  if (states.length !== 1) return pathname
  const stateRoute = parseAppRoute(states[0])
  return stateRoute.kind === 'resident-invite' || stateRoute.kind === 'resident-campaign'
    ? states[0]
    : pathname
}

export function parseAppRoute(pathname: string): AppRoute {
  if (pathname === '/') return { kind: 'resident-default' }

  const adminPath = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  if (Object.hasOwn(ADMIN_PAGES, adminPath)) return { ...ADMIN_PAGES[adminPath] }

  const adminMatch = ADMIN_CAMPAIGN_PATTERN.exec(pathname)
  if (adminMatch) {
    return { kind: 'admin-campaign', campaignId: adminMatch[1], section: (adminMatch[2] as WorkspaceSection | undefined) ?? null }
  }

  const residentMatch = RESIDENT_CAMPAIGN_PATTERN.exec(pathname)
  if (residentMatch) return { kind: 'resident-campaign', campaignSlug: residentMatch[1] }

  const inviteMatch = RESIDENT_INVITE_PATTERN.exec(pathname)
  if (inviteMatch) return { kind: 'resident-invite', inviteSlug: inviteMatch[1] }

  return { kind: 'not-found' }
}

export function selectAppMode(pathname: string): AppMode {
  return parseAppRoute(pathname).kind.startsWith('admin-') ? 'admin' : 'resident'
}

export function parseResidentFilter(search: string): ResidentFilter {
  const value = new URLSearchParams(search).get('filter')
  return value === 'unbound' || value === 'other' || value === 'blocked' ? value : 'all'
}

export function campaignSectionPath(campaignId: string, section: WorkspaceSection): string {
  return `/admin/campaign/${campaignId}/${section}`
}
```

- [ ] **Step 4: 讓 `RuntimeApp` 跟上新名稱（暫時對應）**

在 `src/RuntimeApp.tsx`：
- live 分支與 localStorage Demo 分支中的 `appRoute.kind === 'admin-list'`，都改成：
  ```ts
  appRoute.kind === 'admin-list' || appRoute.kind === 'admin-residents' || appRoute.kind === 'admin-settings'
  ```
  這是暫時對應，Task 8 會改成各自的頁面。
- 兩處 `appRoute.kind === 'admin-editor'` 改成 `appRoute.kind === 'admin-campaign'`。

- [ ] **Step 5: 確認通過**

Run: `npx vitest run src/routing.test.ts src/RuntimeApp.test.tsx` → PASS。
Run: `npx tsc -b` → 無錯誤。

- [ ] **Step 6: Commit**

```bash
git add src/routing.ts src/routing.test.ts src/RuntimeApp.tsx
git commit -m "feat: add organizer page and workspace section routes"
```

---

### Task 2: 選單遺留事項（固定定位、Esc 不外傳、連結後焦點）

**Files:**
- Modify: `src/components/ui/Menu.tsx`（整檔改寫）
- Modify: `src/components/ui/Menu.test.tsx`（新增 4 個測試）
- Modify: `src/components/ui/ui.css`（`.ui-menu-popup` 一行）

**Interfaces:**
- `Menu` 的 props 不變。行為變更：
  - 彈出層改為 `position: fixed`，開啟時依觸發鈕位置計算 `top`／`right`；下方空間不足時向上展開；捲動或縮放視窗時重新定位。
  - 按 Esc 會停止事件傳遞。
  - 選擇連結項目後焦點回到觸發鈕。

- [ ] **Step 1: 寫失敗測試**

在 `src/components/ui/Menu.test.tsx`：
- import 加上 `ConfirmDialog`：`import { ConfirmDialog } from './ConfirmDialog'`。若檔案尚未匯入 `vi`，在 vitest 的 import 補上。
- 在 `describe` 內新增：

```tsx
  const rect = (box: { top: number; bottom: number; left: number; right: number }) => ({
    ...box, x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top, toJSON: () => box,
  }) as DOMRect

  it('places the popup in the viewport so a scrolling table cannot clip it', async () => {
    const user = userEvent.setup()
    render(<Menu label="更多操作" items={[{ label: '刪除', onSelect: vi.fn() }]} />)
    const trigger = screen.getByRole('button', { name: '更多操作' })
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(rect({ top: 100, bottom: 132, left: 268, right: 300 }))

    await user.click(trigger)

    const popup = screen.getByRole('menu', { name: '更多操作' })
    expect(popup.style.top).toBe('136px')
    expect(popup.style.right).toBe(`${window.innerWidth - 300}px`)
  })

  it('opens upwards when there is no room below the trigger', async () => {
    const user = userEvent.setup()
    const offsetHeight = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('role') === 'menu' ? 120 : 0
    })
    try {
      render(<Menu label="更多操作" items={[{ label: '刪除', onSelect: vi.fn() }]} />)
      const trigger = screen.getByRole('button', { name: '更多操作' })
      const top = window.innerHeight - 40
      vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(rect({ top, bottom: top + 32, left: 268, right: 300 }))

      await user.click(trigger)

      expect(screen.getByRole('menu', { name: '更多操作' }).style.top).toBe(`${top - 4 - 120}px`)
    } finally {
      offsetHeight.mockRestore()
    }
  })

  it('returns focus to the trigger after choosing a link item', async () => {
    const user = userEvent.setup()
    render(<Menu label="更多操作" items={[{ label: '查看說明', href: '#help' }]} />)
    const trigger = screen.getByRole('button', { name: '更多操作' })

    await user.click(trigger)
    await user.click(screen.getByRole('menuitem', { name: '查看說明' }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes only itself when Escape is pressed inside a dialog', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(
      <ConfirmDialog title="確認" confirmLabel="確定" onConfirm={vi.fn()} onCancel={onCancel}>
        <Menu label="更多操作" items={[{ label: '刪除', onSelect: vi.fn() }]} />
      </ConfirmDialog>,
    )
    const trigger = screen.getByRole('button', { name: '更多操作' })

    await user.click(trigger)
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(onCancel).not.toHaveBeenCalled()

    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
  })
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/components/ui/Menu.test.tsx`
Expected：新增的 4 個測試 FAIL：
- 位置測試：`style.top` 是空字串。
- 焦點測試：焦點不在觸發鈕。
- Esc 測試：`onCancel` 被呼叫。

- [ ] **Step 3: 改寫 `src/components/ui/Menu.tsx`**

```tsx
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export type MenuItem = {
  label: string
  ariaLabel?: string
  onSelect?: () => void
  href?: string
  target?: string
  tone?: 'default' | 'danger'
  disabled?: boolean
  icon?: ReactNode
}

type MenuProps = {
  label: string
  items: MenuItem[]
  triggerContent?: ReactNode
  size?: 'md' | 'sm'
  className?: string
}

const POPUP_GAP = 4
const VIEWPORT_MARGIN = 8

export function Menu({ label, items, triggerContent = '⋯', size = 'md', className = '' }: MenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const menuItems = () => [
    ...(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
  ]

  useLayoutEffect(() => {
    if (!open) return
    // A fixed popup cannot be clipped by a scrolling ancestor such as a wide table.
    const place = () => {
      const trigger = triggerRef.current
      const popup = popupRef.current
      if (!trigger || !popup) return
      const anchor = trigger.getBoundingClientRect()
      const height = popup.offsetHeight
      const below = anchor.bottom + POPUP_GAP
      const above = anchor.top - POPUP_GAP - height
      const top = below + height > window.innerHeight - VIEWPORT_MARGIN && above >= VIEWPORT_MARGIN ? above : below
      popup.style.top = `${top}px`
      popup.style.right = `${Math.max(VIEWPORT_MARGIN, window.innerWidth - anchor.right)}px`
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    menuItems()[0]?.focus()
    const closeOnOutsidePointer = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [open])

  const close = (returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    const elements = menuItems()
    if (elements.length === 0) return
    const index = elements.indexOf(document.activeElement as HTMLElement)
    const targets: Record<string, HTMLElement | undefined> = {
      ArrowDown: elements[(index + 1) % elements.length],
      ArrowUp: elements[(index - 1 + elements.length) % elements.length],
      Home: elements[0],
      End: elements[elements.length - 1],
    }
    const target = targets[event.key]
    if (target) {
      event.preventDefault()
      target.focus()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      // Keep an enclosing dialog open: its Escape listener sits on the document.
      event.stopPropagation()
      close(true)
    } else if (event.key === 'Tab') {
      close(false)
    }
  }

  return (
    <div
      ref={rootRef}
      className={`ui-menu ${className}`.trim()}
      data-size={size}
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="ui-menu-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">{triggerContent}</span>
      </button>
      {open && (
        <div ref={popupRef} id={menuId} role="menu" aria-label={label} className="ui-menu-popup" onKeyDown={moveFocus}>
          {items.map((item) => item.href && !item.disabled ? (
            <a
              key={item.label}
              role="menuitem"
              href={item.href}
              target={item.target}
              rel={item.target === '_blank' ? 'noreferrer' : undefined}
              tabIndex={-1}
              aria-label={item.ariaLabel}
              data-tone={item.tone}
              onClick={() => close(true)}
            >
              {item.icon}
              <span>{item.label}</span>
            </a>
          ) : (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              aria-label={item.ariaLabel}
              aria-disabled={item.disabled || undefined}
              data-tone={item.tone}
              onClick={() => {
                if (item.disabled) return
                close(true)
                item.onSelect?.()
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 改 `.ui-menu-popup` 的定位**

在 `src/components/ui/ui.css` 的 `.ui-menu-popup` 規則中，把 `position: absolute; top: calc(100% + 4px); right: 0;` 換成 `position: fixed; top: 0; right: 0;`，其餘屬性不動。

- [ ] **Step 5: 確認通過**

Run: `npx vitest run src/components/ui` → PASS（含原本 5 個 Menu 測試）。
Run: `npx tsc -b` 與 `npm run lint` → 無錯誤。

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Menu.tsx src/components/ui/Menu.test.tsx src/components/ui/ui.css
git commit -m "fix: keep menus unclipped and let Escape close only the menu"
```

---

### Task 3: 團主端導覽與殼層

**Files:**
- Create: `src/components/organizer/organizerNavigation.ts`
- Create: `src/components/organizer/OrganizerLink.tsx`
- Create: `src/components/organizer/CreateCampaignDialog.tsx`
- Create: `src/components/organizer/OrganizerShell.tsx`
- Create: `src/components/organizer/organizer.css`
- Test: `src/components/organizer/organizerShell.test.tsx`

**Interfaces:**
- Consumes：
  - `Button`（`variant`、`size`、`loading`、`loadingLabel`）
  - `FormField`（`id`、`label`、`required`）
  - `FeedbackMessage`
  - `useModalDialog({ dialogRef, initialFocusRef, onDismiss, busy })`
- Produces（Task 4～8 使用）：
  - `type OrganizerLocation = { pathname: string; search: string }`
  - `type OrganizerNavigate = (path: string, options?: { replace?: boolean }) => void`
  - `useBrowserLocation(initial: OrganizerLocation): [OrganizerLocation, OrganizerNavigate]`
  - `useOrganizerNavigate(): OrganizerNavigate`：沒有 provider 時的預設行為：`replace` 用 `history.replaceState`，否則 `location.assign`。
  - `<OrganizerNavigationProvider navigate>`
  - `<OrganizerLink href …>`：一般 `<a>` 屬性；一般左鍵點擊改用 navigate；有 `target` 或按修飾鍵時照瀏覽器預設。
  - `<OrganizerShell current: 'campaigns' | 'residents' | 'settings' onCreate?: (title: string) => Promise<{ id: string }>>`：建立成功後導向 `/admin/campaign/<id>/content`。

- [ ] **Step 1: 寫失敗測試**

`src/components/organizer/organizerShell.test.tsx`：

```tsx
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useBrowserLocation } from './organizerNavigation'
import { OrganizerLink, OrganizerNavigationProvider } from './OrganizerLink'
import { OrganizerShell } from './OrganizerShell'

function LocationHarness() {
  const [location, navigate] = useBrowserLocation({ pathname: '/admin', search: '' })
  return (
    <OrganizerNavigationProvider navigate={navigate}>
      <p data-testid="location">{location.pathname}{location.search}</p>
      <OrganizerLink href="/admin/residents?filter=unbound">住戶</OrganizerLink>
    </OrganizerNavigationProvider>
  )
}

function renderShell(props: Partial<Parameters<typeof OrganizerShell>[0]> = {}) {
  const navigate = vi.fn()
  render(
    <OrganizerNavigationProvider navigate={navigate}>
      <OrganizerShell current="campaigns" {...props}><main><h1>頁面內容</h1></main></OrganizerShell>
    </OrganizerNavigationProvider>,
  )
  return navigate
}

afterEach(() => { window.history.replaceState(null, '', '/') })

describe('organizer navigation', () => {
  it('moves between organizer pages without reloading and follows the browser history', async () => {
    const user = userEvent.setup()
    render(<LocationHarness />)

    await user.click(screen.getByRole('link', { name: '住戶' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/residents?filter=unbound')
    expect(window.location.pathname).toBe('/admin/residents')

    act(() => {
      window.history.pushState(null, '', '/admin/settings')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/settings')
  })

  it('leaves modified clicks to the browser so organizers can open a new tab', () => {
    const navigate = vi.fn()
    render(<OrganizerNavigationProvider navigate={navigate}><OrganizerLink href="/admin/settings">設定</OrganizerLink></OrganizerNavigationProvider>)
    let handledByLink = true
    const guard = (event: Event) => {
      handledByLink = event.defaultPrevented
      event.preventDefault()
    }
    document.addEventListener('click', guard)
    fireEvent.click(screen.getByRole('link', { name: '設定' }), { ctrlKey: true })
    document.removeEventListener('click', guard)

    expect(handledByLink).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('OrganizerShell', () => {
  it('shows the organizer navigation with the current page marked', () => {
    renderShell({ current: 'residents' })
    const nav = screen.getByRole('navigation', { name: '團主後台' })
    expect(nav).toContainElement(screen.getByRole('link', { name: '團購' }))
    expect(screen.getByRole('link', { name: '團購' })).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('link', { name: '住戶' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '設定' })).toHaveAttribute('href', '/admin/settings')
    expect(screen.getByRole('link', { name: '團購小幫手' })).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('heading', { name: '頁面內容' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '建立新團' })).not.toBeInTheDocument()
  })

  it('creates a campaign from any page and opens its content settings', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockResolvedValue({ id: 'new-id' })
    const navigate = renderShell({ onCreate })

    await user.click(screen.getByRole('button', { name: '建立新團' }))
    const dialog = screen.getByRole('dialog', { name: '建立新團' })
    const title = screen.getByRole('textbox', { name: '團購標題' })
    expect(title).toHaveFocus()
    expect(title).toHaveValue('未命名團購')
    await user.clear(title)
    expect(screen.getByRole('button', { name: '建立並編輯' })).toBeDisabled()
    await user.type(title, '週末麵包團')
    await user.click(screen.getByRole('button', { name: '建立並編輯' }))

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('週末麵包團'))
    expect(navigate).toHaveBeenCalledWith('/admin/campaign/new-id/content')
    expect(dialog).not.toBeInTheDocument()
  })

  it('keeps the create dialog open with the error when creation fails', async () => {
    const user = userEvent.setup()
    const navigate = renderShell({ onCreate: vi.fn().mockRejectedValue(new Error('建立團購失敗：permission denied')) })

    await user.click(screen.getByRole('button', { name: '建立新團' }))
    await user.click(screen.getByRole('button', { name: '建立並編輯' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('建立團購失敗：permission denied')
    expect(screen.getByRole('dialog', { name: '建立新團' })).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('closes the create dialog with Escape and returns focus to its button', async () => {
    const user = userEvent.setup()
    renderShell({ onCreate: vi.fn() })
    const open = screen.getByRole('button', { name: '建立新團' })

    await user.click(open)
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: '建立新團' })).not.toBeInTheDocument()
    expect(open).toHaveFocus()
  })
})
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/components/organizer/organizerShell.test.tsx`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作 `src/components/organizer/organizerNavigation.ts`**

```ts
import { createContext, useCallback, useContext, useEffect, useState } from 'react'

export type OrganizerLocation = { pathname: string; search: string }
export type NavigateOptions = { replace?: boolean }
export type OrganizerNavigate = (path: string, options?: NavigateOptions) => void

// Without a provider (isolated component tests), replacing only rewrites the address bar.
function browserNavigate(path: string, options: NavigateOptions = {}) {
  if (options.replace) window.history.replaceState(window.history.state, '', path)
  else window.location.assign(path)
}

export const OrganizerNavigationContext = createContext<OrganizerNavigate>(browserNavigate)

export function useOrganizerNavigate(): OrganizerNavigate {
  return useContext(OrganizerNavigationContext)
}

export function useBrowserLocation(initial: OrganizerLocation): [OrganizerLocation, OrganizerNavigate] {
  const [source, setSource] = useState(initial)
  const [location, setLocation] = useState(initial)
  if (source.pathname !== initial.pathname || source.search !== initial.search) {
    setSource(initial)
    setLocation(initial)
  }

  useEffect(() => {
    const sync = () => setLocation({ pathname: window.location.pathname, search: window.location.search })
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  const navigate = useCallback<OrganizerNavigate>((path, options = {}) => {
    const url = new URL(path, window.location.origin)
    const next = `${url.pathname}${url.search}`
    if (options.replace) {
      window.history.replaceState(window.history.state, '', next)
    } else {
      window.history.pushState(null, '', next)
      document.documentElement.scrollTop = 0
    }
    setLocation({ pathname: url.pathname, search: url.search })
  }, [])

  return [location, navigate]
}
```

- [ ] **Step 4: 實作 `src/components/organizer/OrganizerLink.tsx`**

```tsx
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { OrganizerNavigationContext, useOrganizerNavigate, type OrganizerNavigate } from './organizerNavigation'

export function OrganizerNavigationProvider({ navigate, children }: { navigate: OrganizerNavigate; children: ReactNode }) {
  return <OrganizerNavigationContext.Provider value={navigate}>{children}</OrganizerNavigationContext.Provider>
}

type OrganizerLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }

export function OrganizerLink({ href, target, onClick, ...props }: OrganizerLinkProps) {
  const navigate = useOrganizerNavigate()
  return (
    <a
      {...props}
      href={href}
      target={target}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented || target || event.button !== 0
          || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        navigate(href)
      }}
    />
  )
}
```

- [ ] **Step 5: 實作 `src/components/organizer/CreateCampaignDialog.tsx`**

```tsx
import { useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '../ui/Button'
import { FeedbackMessage } from '../ui/FeedbackMessage'
import { FormField } from '../ui/FormField'
import { useModalDialog } from '../ui/useModalDialog'
import { useOrganizerNavigate } from './organizerNavigation'

type CreateCampaignDialogProps = {
  onCreate: (title: string) => Promise<{ id: string }>
  onClose: () => void
}

export function CreateCampaignDialog({ onCreate, onClose }: CreateCampaignDialogProps) {
  const navigate = useOrganizerNavigate()
  const dialogRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const inputId = useId()
  const [title, setTitle] = useState('未命名團購')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useModalDialog({ dialogRef, initialFocusRef: inputRef, onDismiss: onClose, busy })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const nextTitle = title.trim()
    if (!nextTitle || busy) return
    setBusy(true)
    setError('')
    try {
      const campaign = await onCreate(nextTitle)
      onClose()
      navigate(`/admin/campaign/${campaign.id}/content`)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '建立團購失敗')
      setBusy(false)
    }
  }

  return (
    <div className="ui-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose()
    }}>
      <section ref={dialogRef} className="ui-dialog organizer-create-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <h2 id={titleId}>建立新團</h2>
        <form onSubmit={(event) => { void submit(event) }}>
          <div className="ui-dialog-content">
            <FormField id={inputId} label="團購標題" required>
              <input ref={inputRef} className="ui-input" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
            </FormField>
            {error && <FeedbackMessage tone="error">{error}</FeedbackMessage>}
          </div>
          <div className="ui-dialog-actions">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>取消</Button>
            <Button type="submit" loading={busy} loadingLabel="建立中…" disabled={busy || !title.trim()}>建立並編輯</Button>
          </div>
        </form>
      </section>
    </div>
  )
}
```

（`FeedbackMessage` 的 `error` 語氣會輸出 `role="alert"`，測試依此查找。）

- [ ] **Step 6: 實作 `src/components/organizer/OrganizerShell.tsx`**

```tsx
import { useState, type ReactNode } from 'react'
import { Button } from '../ui/Button'
import { CreateCampaignDialog } from './CreateCampaignDialog'
import { OrganizerLink } from './OrganizerLink'
import './organizer.css'

export type OrganizerSection = 'campaigns' | 'residents' | 'settings'

const NAV_ITEMS: Array<{ key: OrganizerSection; label: string; href: string }> = [
  { key: 'campaigns', label: '團購', href: '/admin' },
  { key: 'residents', label: '住戶', href: '/admin/residents' },
  { key: 'settings', label: '設定', href: '/admin/settings' },
]

type OrganizerShellProps = {
  current: OrganizerSection
  onCreate?: (title: string) => Promise<{ id: string }>
  children: ReactNode
}

export function OrganizerShell({ current, onCreate, children }: OrganizerShellProps) {
  const [creating, setCreating] = useState(false)

  return (
    <div className="organizer-app">
      <header className="organizer-topbar">
        <OrganizerLink className="organizer-brand" href="/admin">團購小幫手</OrganizerLink>
        <nav className="organizer-nav" aria-label="團主後台">
          {NAV_ITEMS.map((item) => (
            <OrganizerLink key={item.key} href={item.href} aria-current={current === item.key ? 'page' : undefined}>
              {item.label}
            </OrganizerLink>
          ))}
        </nav>
        {onCreate && (
          <Button className="organizer-create" size="sm" onClick={() => setCreating(true)}>
            <span aria-hidden="true">＋</span> 建立新團
          </Button>
        )}
      </header>
      {children}
      {creating && onCreate && <CreateCampaignDialog onCreate={onCreate} onClose={() => setCreating(false)} />}
    </div>
  )
}
```

關閉視窗後的焦點歸還由 `useModalDialog` 處理（它記住開啟前的焦點）。

- [ ] **Step 7: 建立 `src/components/organizer/organizer.css`**

```css
/* Organizer shell: top navigation and the page frame shared by every organizer page. */
.organizer-app { min-height: 100vh; background: var(--color-bg); color: var(--color-text); font-size: var(--font-size-dense); }
.organizer-topbar { position: sticky; top: 0; z-index: var(--z-sticky); display: flex; align-items: center; gap: var(--space-4); min-height: 52px; padding: 0 var(--space-6); border-bottom: 1px solid var(--color-divider); background: var(--color-surface); }
.organizer-brand { display: inline-flex; align-items: center; min-height: 32px; color: var(--color-text); font-weight: var(--font-weight-strong); text-decoration: none; }
.organizer-nav { display: flex; gap: var(--space-1); }
.organizer-nav a { display: inline-flex; align-items: center; min-height: 32px; padding: 0 var(--space-3); border-radius: var(--radius-control); color: var(--color-text-secondary); text-decoration: none; }
.organizer-nav a[aria-current="page"] { background: var(--color-neutral-subtle); color: var(--color-text); font-weight: var(--font-weight-strong); }
.organizer-create { margin-left: auto; }
.organizer-page { width: min(100%, 1440px); margin: 0 auto; padding: var(--space-5) var(--space-6) var(--space-10); }
.organizer-page h1 { margin: 0; font-size: var(--font-size-page-title); font-weight: var(--font-weight-strong); line-height: var(--line-height-heading); }
.organizer-page-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-4); }
.organizer-muted { color: var(--color-text-secondary); }
.organizer-create-dialog .ui-input { width: 100%; }

@media (hover: hover) {
  .organizer-nav a:not([aria-current="page"]):hover { background: var(--color-fill-hover); color: var(--color-text); }
}

@media (max-width: 1023px) {
  .organizer-topbar { flex-wrap: wrap; gap: var(--space-2); padding: var(--space-2) var(--space-4); }
  .organizer-brand, .organizer-nav a { min-height: var(--touch-target); }
  .organizer-app .ui-button { min-height: var(--touch-target); }
  .organizer-page { padding: var(--space-4) var(--space-4) var(--space-8); }
}

@media (max-width: 639px) {
  .organizer-nav { order: 3; width: 100%; }
}
```

- [ ] **Step 8: 確認通過**

Run: `npx vitest run src/components/organizer/organizerShell.test.tsx` → PASS，輸出沒有 `Not implemented: navigation` 之類的警告。
Run: `npx tsc -b` 與 `npm run lint` → 無錯誤、無警告。

- [ ] **Step 9: Commit**

```bash
git add src/components/organizer
git commit -m "feat: add the organizer top navigation and create-campaign dialog"
```

---

### Task 4: 首頁：所有團購

**Files:**
- Create: `src/components/organizer/campaignListView.ts`、`campaignListView.test.ts`
- Create: `src/components/organizer/copyResidentLink.ts`
- Create: `src/components/organizer/OrganizerHome.tsx`、`OrganizerHome.test.tsx`
- Modify: `src/components/organizer/organizer.css`（檔尾新增）

**Interfaces:**
- Consumes：
  - Task 2：`Menu`（固定定位）
  - Task 3：`OrganizerLink`、`useOrganizerNavigate`、`OrganizerNavigationProvider`
  - 第 2 階段：`describeAutoClose(value, now)`
  - `SegmentedControl`、`StatusBadge`、`ProgressBar`、`Button`、`ConfirmDialog`、`EmptyState`、`FeedbackMessage`
- Produces：
  - `campaignPhase(c): 'open' | 'draft' | 'closed'`
  - `sortCampaigns(list)`
  - `filterCampaigns(list, filter)`
  - `countCampaigns(list): Record<'all' | 'open' | 'draft' | 'closed', number>`
  - `unpaidOrderCount(c)`
  - `formationProgress(c): { value; max; text; statusText; formed }`
  - `copyResidentLink(path: string, copy?: (path: string) => Promise<void>): Promise<void>`
  - `<OrganizerHome campaigns autoCloseNotificationState? unboundResidentCount? now? onDelete? onCopyResidentLink?>`

取代 `CampaignListApp` 的首頁部分；`CampaignListApp` 在 Task 8 接線後刪除。下表列出 `CampaignListApp.test.tsx` 每個測試的去向：

| 原測試 | 由誰驗證 |
|---|---|
| 指定自己接收自動結單通知 | Task 6 設定頁 |
| 團購／住戶兩區切換 | Task 3 上方導覽＋Task 8 路由 |
| 「其他」不算未填戶號 | Task 5 `residentView.test.ts` |
| 依狀態篩選 | 本 Task：篩選測試 |
| 複製住戶連結 | 本 Task：複製測試 |
| 草稿與已發布的安全連結 | 本 Task：「看得到該看的欄位」與「查看住戶頁只給已發布」測試 |
| 封面與成團進度 | 本 Task：欄位測試 |
| 金額門檻進度 | 本 Task：金額進度測試 |
| 刪除需確認 | 本 Task：刪除確認測試 |
| 刪除失敗保留視窗 | 本 Task：刪除失敗測試 |
| 建立新團並進入編輯 | Task 3 殼層測試 |

- [ ] **Step 1: 寫失敗測試（純函式）**

`src/components/organizer/campaignListView.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import type { CampaignListItem } from '../../services/campaignManagementGateway'
import { campaignPhase, countCampaigns, filterCampaigns, formationProgress, sortCampaigns, unpaidOrderCount } from './campaignListView'

function campaign(overrides: Partial<CampaignListItem> & Pick<CampaignListItem, 'id'>): CampaignListItem {
  return {
    slug: `${overrides.id}-slug`, title: overrides.id, status: 'open', openedAt: '2026-09-01T00:00:00Z',
    createdAt: '2026-08-30T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', images: [], quantityUnit: '個',
    orderCount: 0, totalQuantity: 0, totalAmount: 0, paidOrderCount: 0,
    thresholdKind: 'quantity', threshold: 10, amountThreshold: null,
    ...overrides,
  }
}

describe('campaign list view', () => {
  it('classifies drafts, open campaigns, and closed or arrived campaigns', () => {
    expect(campaignPhase(campaign({ id: 'd', openedAt: null }))).toBe('draft')
    expect(campaignPhase(campaign({ id: 'o' }))).toBe('open')
    expect(campaignPhase(campaign({ id: 'c', status: 'closed' }))).toBe('closed')
    expect(campaignPhase(campaign({ id: 'a', status: 'arrived' }))).toBe('closed')
  })

  it('groups open, draft, then closed campaigns with the newest first in each group', () => {
    const sorted = sortCampaigns([
      campaign({ id: 'closed-old', status: 'closed', openedAt: '2026-08-01T00:00:00Z' }),
      campaign({ id: 'draft-old', openedAt: null, updatedAt: '2026-09-02T00:00:00Z' }),
      campaign({ id: 'open-old', openedAt: '2026-09-01T00:00:00Z' }),
      campaign({ id: 'closed-new', status: 'arrived', openedAt: '2026-08-20T00:00:00Z' }),
      campaign({ id: 'draft-new', openedAt: null, updatedAt: '2026-09-10T00:00:00Z' }),
      campaign({ id: 'open-new', openedAt: '2026-09-05T00:00:00Z' }),
    ])
    expect(sorted.map((item) => item.id)).toEqual(['open-new', 'open-old', 'draft-new', 'draft-old', 'closed-new', 'closed-old'])
  })

  it('filters and counts by phase', () => {
    const list = [
      campaign({ id: 'o' }), campaign({ id: 'd', openedAt: null }),
      campaign({ id: 'c', status: 'closed' }), campaign({ id: 'a', status: 'arrived' }),
    ]
    expect(countCampaigns(list)).toEqual({ all: 4, open: 1, draft: 1, closed: 2 })
    expect(filterCampaigns(list, 'closed').map((item) => item.id)).toEqual(['c', 'a'])
    expect(filterCampaigns(list, 'all')).toHaveLength(4)
  })

  it('counts unpaid orders without going below zero', () => {
    expect(unpaidOrderCount(campaign({ id: 'x', orderCount: 6, paidOrderCount: 4 }))).toBe(2)
    expect(unpaidOrderCount(campaign({ id: 'y', orderCount: 1, paidOrderCount: 3 }))).toBe(0)
  })

  it('describes quantity and amount formation progress', () => {
    expect(formationProgress(campaign({ id: 'q', quantityUnit: '盒', totalQuantity: 18, threshold: 30 })))
      .toEqual({ value: 18, max: 30, text: '18／30 盒', statusText: '還差 12 盒成團', formed: false })
    expect(formationProgress(campaign({ id: 'm', thresholdKind: 'amount', amountThreshold: 10000, totalAmount: 8500 })))
      .toMatchObject({ value: 8500, max: 10000, text: '$8,500／$10,000', statusText: '還差 $1,500 成團' })
    expect(formationProgress(campaign({ id: 'f', totalQuantity: 12, threshold: 10 })).statusText).toBe('已達成團門檻')
    expect(formationProgress(campaign({ id: 'u', status: 'closed', totalQuantity: 2, threshold: 10 })).statusText).toBe('結單時未達成團門檻')
  })
})
```

- [ ] **Step 2: 寫失敗測試（首頁）**

`src/components/organizer/OrganizerHome.test.tsx`：

```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CampaignListItem } from '../../services/campaignManagementGateway'
import { OrganizerNavigationProvider } from './OrganizerLink'
import { OrganizerHome } from './OrganizerHome'

const draft: CampaignListItem = {
  id: 'draft-id', slug: 'draft-slug', title: '新草稿', status: 'open', openedAt: null,
  createdAt: '2026-08-12T00:00:00Z', updatedAt: '2026-08-12T01:00:00Z',
  images: [], quantityUnit: '個', orderCount: 0, totalQuantity: 0, totalAmount: 0, paidOrderCount: 0,
  thresholdKind: 'quantity', threshold: 100, amountThreshold: null,
}
const open: CampaignListItem = {
  id: 'open-id', slug: 'open-slug', title: '冰餅團', status: 'open', openedAt: '2026-08-12T02:00:00Z',
  createdAt: '2026-08-12T00:00:00Z', updatedAt: '2026-08-12T03:00:00Z',
  images: [{ src: 'https://example.com/ice.jpg', alt: '冰餅商品照' }], quantityUnit: '盒',
  orderCount: 6, totalQuantity: 18, totalAmount: 2430, paidOrderCount: 4,
  thresholdKind: 'quantity', threshold: 30, amountThreshold: null, autoCloseAt: '2026-09-25T04:00:00.000Z',
}
const closed: CampaignListItem = {
  id: 'closed-id', slug: 'closed-slug', title: '已結單水果團', status: 'closed', openedAt: '2026-08-10T00:00:00Z',
  createdAt: '2026-08-09T00:00:00Z', updatedAt: '2026-08-11T00:00:00Z',
  images: [], quantityUnit: '箱', orderCount: 5, totalQuantity: 4, totalAmount: 600, paidOrderCount: 2,
  thresholdKind: 'quantity', threshold: 4, amountThreshold: null, autoCloseAt: '2026-08-12T04:00:00.000Z',
}
const arrived: CampaignListItem = { ...closed, id: 'arrived-id', slug: 'arrived-slug', title: '已到貨麵包團', status: 'arrived', openedAt: '2026-08-08T00:00:00Z' }
const now = new Date('2026-09-25T01:00:00.000Z')

function renderHome(props: Partial<Parameters<typeof OrganizerHome>[0]> = {}) {
  const navigate = vi.fn()
  render(
    <OrganizerNavigationProvider navigate={navigate}>
      <OrganizerHome campaigns={[closed, draft, open]} now={now} {...props} />
    </OrganizerNavigationProvider>,
  )
  return navigate
}

const rowOf = (title: string) => screen.getByRole('link', { name: title }).closest('tr') as HTMLElement

describe('OrganizerHome', () => {
  it('lists open, draft, then closed campaigns in one table', () => {
    renderHome({ campaigns: [closed, draft, open, arrived] })

    expect(screen.getByRole('heading', { level: 1, name: '團購' })).toBeInTheDocument()
    const table = screen.getByRole('table', { name: '團購列表' })
    expect(within(table).getAllByRole('rowheader').map((cell) => within(cell).getByRole('link').textContent))
      .toEqual(['冰餅團', '新草稿', '已結單水果團', '已到貨麵包團'])
    expect(screen.getByRole('link', { name: '冰餅團' })).toHaveAttribute('href', '/admin/campaign/open-id')
    expect(screen.queryByText('工作概況')).not.toBeInTheDocument()
  })

  it('filters campaigns by phase and counts each phase', async () => {
    const user = userEvent.setup()
    renderHome({ campaigns: [closed, draft, open, arrived] })

    expect(screen.getByRole('radio', { name: '全部 4' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: '草稿 1' }))
    expect(screen.getByRole('link', { name: '新草稿' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '冰餅團' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '已結單 2' }))
    expect(screen.getByRole('link', { name: '已結單水果團' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '已到貨麵包團' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '新草稿' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '開團中 1' }))
    expect(screen.getByRole('link', { name: '冰餅團' })).toBeInTheDocument()
  })

  it('shows status, progress, orders, unpaid count, closing time and time for each phase', () => {
    renderHome()

    const openRow = rowOf('冰餅團')
    expect(within(openRow).getByText('開團中')).toBeInTheDocument()
    expect(within(openRow).getByRole('img', { name: '冰餅商品照' })).toHaveAttribute('src', 'https://example.com/ice.jpg')
    expect(within(openRow).getByRole('progressbar', { name: '冰餅團成團進度' })).toHaveAttribute('aria-valuenow', '18')
    expect(within(openRow).getByText('18／30 盒')).toBeInTheDocument()
    expect(within(openRow).getByText('還差 12 盒成團')).toBeInTheDocument()
    expect(within(openRow).getByText('6')).toBeInTheDocument()
    expect(within(openRow).getAllByText('—')).toHaveLength(1)
    expect(within(openRow).getByText('今天 12:00')).toHaveClass('organizer-soon')
    expect(within(openRow).getByText('2026/08/12 10:00')).toBeInTheDocument()

    const draftRow = rowOf('新草稿')
    expect(within(draftRow).getByText('草稿')).toBeInTheDocument()
    expect(within(draftRow).getByText('住戶看不到・尚未發布')).toBeInTheDocument()
    expect(within(draftRow).getByRole('img', { name: '新草稿尚未設定圖片' })).toBeInTheDocument()
    expect(within(draftRow).getByText('發布後開始接單')).toBeInTheDocument()
    expect(within(draftRow).getByText('未設定')).toBeInTheDocument()
    expect(within(draftRow).getByText('最後編輯 2026/08/12 09:00')).toBeInTheDocument()
    expect(within(draftRow).queryByRole('button', { name: '複製住戶連結 新草稿' })).not.toBeInTheDocument()

    const closedRow = rowOf('已結單水果團')
    expect(within(closedRow).getByText('已結單')).toBeInTheDocument()
    expect(within(closedRow).getByText('3')).toBeInTheDocument()
    expect(within(closedRow).queryByText(/12:00/)).not.toBeInTheDocument()
  })

  it('uses the total amount for amount-based formation progress', () => {
    const amountCampaign: CampaignListItem = {
      ...open, id: 'amount-id', slug: 'amount-slug', title: '年節禮盒團',
      thresholdKind: 'amount', amountThreshold: 10000, totalQuantity: 36, totalAmount: 8500,
    }
    renderHome({ campaigns: [amountCampaign] })

    const row = rowOf('年節禮盒團')
    const progress = within(row).getByRole('progressbar', { name: '年節禮盒團成團進度' })
    expect(progress).toHaveAttribute('aria-valuenow', '8500')
    expect(progress).toHaveAttribute('aria-valuemax', '10000')
    expect(within(row).getByText('$8,500／$10,000')).toBeInTheDocument()
    expect(within(row).getByText('還差 $1,500 成團')).toBeInTheDocument()
  })

  it('points to pending work only when something needs attention', () => {
    renderHome({ autoCloseNotificationState: 'unconfigured', unboundResidentCount: 3 })

    const attention = screen.getByRole('region', { name: '待處理' })
    expect(attention).toHaveTextContent('自動結單通知還沒有指定接收的團主')
    expect(within(attention).getByRole('link', { name: '前往設定' })).toHaveAttribute('href', '/admin/settings')
    expect(attention).toHaveTextContent('3 位住戶尚未填戶號')
    expect(within(attention).getByRole('link', { name: '查看住戶' })).toHaveAttribute('href', '/admin/residents?filter=unbound')
  })

  it('hides the attention area when nothing is pending', () => {
    renderHome({ autoCloseNotificationState: 'current_user', unboundResidentCount: 0 })
    expect(screen.queryByRole('region', { name: '待處理' })).not.toBeInTheDocument()
  })

  it('opens a campaign from anywhere on its row but not from the row actions', async () => {
    const user = userEvent.setup()
    const navigate = renderHome({ onCopyResidentLink: vi.fn().mockResolvedValue(undefined), onDelete: vi.fn() })
    const row = rowOf('冰餅團')

    await user.click(within(row).getByText('開團中'))
    expect(navigate).toHaveBeenCalledWith('/admin/campaign/open-id')
    navigate.mockClear()

    await user.click(within(row).getByRole('button', { name: '複製住戶連結 冰餅團' }))
    await user.click(within(row).getByRole('button', { name: '更多操作 冰餅團' }))
    await user.click(screen.getByRole('menuitem', { name: '刪除 冰餅團' }))
    expect(navigate).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '取消刪除' }))
    await user.click(screen.getByRole('link', { name: '冰餅團' }))
    expect(navigate).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith('/admin/campaign/open-id')
  })

  it('copies a published resident link and confirms the action', async () => {
    const user = userEvent.setup()
    const onCopyResidentLink = vi.fn().mockResolvedValue(undefined)
    renderHome({ onCopyResidentLink })

    await user.click(screen.getByRole('button', { name: '複製住戶連結 冰餅團' }))

    expect(onCopyResidentLink).toHaveBeenCalledWith('/campaign/open-slug')
    expect(await screen.findByRole('status')).toHaveTextContent('已複製冰餅團住戶連結')
  })

  it('offers the resident page only for published campaigns and deletion for every campaign', async () => {
    const user = userEvent.setup()
    renderHome({ onDelete: vi.fn() })

    await user.click(screen.getByRole('button', { name: '更多操作 冰餅團' }))
    const view = screen.getByRole('menuitem', { name: '查看住戶頁 冰餅團' })
    expect(view).toHaveAttribute('href', '/campaign/open-slug')
    expect(view).toHaveAttribute('target', '_blank')
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: '更多操作 新草稿' }))
    expect(screen.queryByRole('menuitem', { name: '查看住戶頁 新草稿' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '刪除 新草稿' })).toBeInTheDocument()
  })

  it('requires explicit confirmation before permanently deleting a campaign', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn().mockResolvedValue(undefined)
    renderHome({ onDelete })

    await user.click(screen.getByRole('button', { name: '更多操作 冰餅團' }))
    await user.click(screen.getByRole('menuitem', { name: '刪除 冰餅團' }))
    expect(onDelete).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: '確認刪除團購' })
    expect(dialog).toHaveTextContent('冰餅團')
    expect(dialog).toHaveTextContent('訂單及歷史資料都會永久刪除，無法復原')

    await user.click(screen.getByRole('button', { name: '取消刪除' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: '確認刪除團購' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '更多操作 冰餅團' }))
    await user.click(screen.getByRole('menuitem', { name: '刪除 冰餅團' }))
    await user.click(screen.getByRole('button', { name: '確認永久刪除' }))

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('open-id'))
    expect(screen.queryByRole('link', { name: '冰餅團' })).not.toBeInTheDocument()
  })

  it('keeps the campaign and confirmation open when deletion fails', async () => {
    const user = userEvent.setup()
    renderHome({ onDelete: vi.fn().mockRejectedValue(new Error('刪除團購失敗：permission denied')) })

    await user.click(screen.getByRole('button', { name: '更多操作 冰餅團' }))
    await user.click(screen.getByRole('menuitem', { name: '刪除 冰餅團' }))
    await user.click(screen.getByRole('button', { name: '確認永久刪除' }))

    const dialog = screen.getByRole('dialog', { name: '確認刪除團購' })
    expect(await screen.findByRole('alert')).toHaveTextContent('刪除團購失敗：permission denied')
    expect(dialog).toContainElement(screen.getByRole('alert'))
    expect(screen.getByRole('link', { name: '冰餅團' })).toBeInTheDocument()
  })

  it('shows the cleanup warning returned after deleting', async () => {
    const user = userEvent.setup()
    renderHome({ onDelete: vi.fn().mockResolvedValue({ warning: '團購已刪除，但有 1 張圖片未能清除' }) })

    await user.click(screen.getByRole('button', { name: '更多操作 冰餅團' }))
    await user.click(screen.getByRole('menuitem', { name: '刪除 冰餅團' }))
    await user.click(screen.getByRole('button', { name: '確認永久刪除' }))

    expect(await screen.findByText('團購已刪除，但有 1 張圖片未能清除')).toBeInTheDocument()
  })

  it('invites the organizer to create the first campaign when there are none', () => {
    renderHome({ campaigns: [] })
    expect(screen.getByText('建立第一團')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: 確認測試失敗**

Run: `npx vitest run src/components/organizer/campaignListView.test.ts src/components/organizer/OrganizerHome.test.tsx`
Expected: FAIL（模組不存在）。

- [ ] **Step 4: 實作 `src/components/organizer/campaignListView.ts`**

```ts
import type { CampaignListItem } from '../../services/campaignManagementGateway'

export type CampaignPhase = 'open' | 'draft' | 'closed'
export type CampaignFilter = 'all' | CampaignPhase

const PHASE_ORDER: Record<CampaignPhase, number> = { open: 0, draft: 1, closed: 2 }
const currency = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 })

const timestamp = (value: string | null | undefined) => Date.parse(value ?? '') || 0

export function campaignPhase(campaign: Pick<CampaignListItem, 'openedAt' | 'status'>): CampaignPhase {
  if (!campaign.openedAt) return 'draft'
  return campaign.status === 'open' ? 'open' : 'closed'
}

export function sortCampaigns(campaigns: CampaignListItem[]): CampaignListItem[] {
  return [...campaigns].sort((a, b) => {
    const phaseA = campaignPhase(a)
    const phaseB = campaignPhase(b)
    if (phaseA !== phaseB) return PHASE_ORDER[phaseA] - PHASE_ORDER[phaseB]
    return phaseA === 'draft'
      ? timestamp(b.updatedAt) - timestamp(a.updatedAt)
      : timestamp(b.openedAt) - timestamp(a.openedAt)
  })
}

export function filterCampaigns(campaigns: CampaignListItem[], filter: CampaignFilter): CampaignListItem[] {
  return filter === 'all' ? campaigns : campaigns.filter((campaign) => campaignPhase(campaign) === filter)
}

export function countCampaigns(campaigns: CampaignListItem[]): Record<CampaignFilter, number> {
  const counts: Record<CampaignFilter, number> = { all: campaigns.length, open: 0, draft: 0, closed: 0 }
  for (const campaign of campaigns) counts[campaignPhase(campaign)] += 1
  return counts
}

export function unpaidOrderCount(campaign: Pick<CampaignListItem, 'orderCount' | 'paidOrderCount'>): number {
  return Math.max(0, campaign.orderCount - campaign.paidOrderCount)
}

export type FormationProgress = { value: number; max: number; text: string; statusText: string; formed: boolean }

export function formationProgress(campaign: CampaignListItem): FormationProgress {
  const usesAmount = campaign.thresholdKind === 'amount'
  const max = usesAmount ? (campaign.amountThreshold ?? campaign.threshold) : campaign.threshold
  const value = usesAmount ? campaign.totalAmount : campaign.totalQuantity
  const remaining = Math.max(0, max - value)
  const formed = value >= max
  const text = usesAmount
    ? `${currency.format(value)}／${currency.format(max)}`
    : `${value}／${max} ${campaign.quantityUnit}`
  const statusText = formed
    ? '已達成團門檻'
    : campaign.status === 'open'
      ? usesAmount ? `還差 ${currency.format(remaining)} 成團` : `還差 ${remaining} ${campaign.quantityUnit}成團`
      : '結單時未達成團門檻'
  return { value, max, text, statusText, formed }
}
```

- [ ] **Step 5: 實作 `src/components/organizer/copyResidentLink.ts`**

從 `CampaignListApp` 搬出，行為不變：

```ts
export async function copyResidentLink(path: string, copy?: (path: string) => Promise<void>): Promise<void> {
  if (copy) return copy(path)
  const value = new URL(path, window.location.origin).toString()
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const input = document.createElement('textarea')
  input.value = value
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.append(input)
  input.select()
  const copied = document.execCommand?.('copy') ?? false
  input.remove()
  if (!copied) throw new Error('這個瀏覽器不支援自動複製')
}
```

- [ ] **Step 6: 實作 `src/components/organizer/OrganizerHome.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { describeAutoClose } from '../../domain/campaignSchedule'
import { formatZhTwTimestamp } from '../../domain/timestamp'
import type { AutoCloseNotificationSettingState } from '../../services/autoCloseNotificationSettingsGateway'
import type { CampaignListItem } from '../../services/campaignManagementGateway'
import { EmptyState } from '../ui/AsyncState'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { FeedbackMessage } from '../ui/FeedbackMessage'
import { Menu, type MenuItem } from '../ui/Menu'
import { ProgressBar } from '../ui/ProgressBar'
import { SegmentedControl } from '../ui/SegmentedControl'
import { StatusBadge } from '../ui/StatusBadge'
import {
  campaignPhase, countCampaigns, filterCampaigns, formationProgress, sortCampaigns, unpaidOrderCount,
  type CampaignFilter, type CampaignPhase,
} from './campaignListView'
import { copyResidentLink } from './copyResidentLink'
import { OrganizerLink } from './OrganizerLink'
import { useOrganizerNavigate } from './organizerNavigation'

const PHASE_BADGES: Record<CampaignPhase, { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  open: { label: '開團中', tone: 'success' },
  draft: { label: '草稿', tone: 'warning' },
  closed: { label: '已結單', tone: 'neutral' },
}
// Clicks on these keep their own behavior instead of opening the campaign row.
const ROW_ACTION_SELECTOR = 'a, button, input, select, textarea, label, [role="menu"]'

type OrganizerHomeProps = {
  campaigns: CampaignListItem[]
  autoCloseNotificationState?: AutoCloseNotificationSettingState
  unboundResidentCount?: number
  now?: Date
  onDelete?: (campaignId: string) => Promise<{ warning: string | null } | void>
  onCopyResidentLink?: (path: string) => Promise<void>
}

function CampaignThumb({ campaign }: { campaign: CampaignListItem }) {
  const image = campaign.images[0]
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [image?.src])
  if (image && !failed) {
    return <img className="organizer-thumb" src={image.src} alt={image.alt} loading="lazy" onError={() => setFailed(true)} />
  }
  return <span className="organizer-thumb organizer-thumb-empty" role="img" aria-label={`${campaign.title}尚未設定圖片`}>無圖</span>
}

export function OrganizerHome({ campaigns, autoCloseNotificationState, unboundResidentCount = 0, now, onDelete, onCopyResidentLink }: OrganizerHomeProps) {
  const navigate = useOrganizerNavigate()
  const [visibleCampaigns, setVisibleCampaigns] = useState(campaigns)
  const [filter, setFilter] = useState<CampaignFilter>('all')
  const [deleteTarget, setDeleteTarget] = useState<CampaignListItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deleteWarning, setDeleteWarning] = useState('')
  const [copyingId, setCopyingId] = useState('')
  const [copyFeedback, setCopyFeedback] = useState('')
  const [copyError, setCopyError] = useState('')

  useEffect(() => { setVisibleCampaigns(campaigns) }, [campaigns])

  const counts = countCampaigns(visibleCampaigns)
  const rows = filterCampaigns(sortCampaigns(visibleCampaigns), filter)
  const today = now ?? new Date()
  const needsRecipient = autoCloseNotificationState === 'unconfigured'

  const copyLink = async (campaign: CampaignListItem) => {
    if (copyingId) return
    setCopyingId(campaign.id)
    setCopyFeedback('')
    setCopyError('')
    try {
      await copyResidentLink(`/campaign/${campaign.slug}`, onCopyResidentLink)
      setCopyFeedback(`已複製${campaign.title}住戶連結`)
    } catch (copyFailure) {
      setCopyError(copyFailure instanceof Error ? copyFailure.message : '複製住戶連結失敗')
    } finally {
      setCopyingId('')
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget || !onDelete || deleting) return
    setDeleting(true)
    setDeleteError('')
    try {
      const result = await onDelete(deleteTarget.id)
      setVisibleCampaigns((current) => current.filter((campaign) => campaign.id !== deleteTarget.id))
      setDeleteTarget(null)
      setDeleteWarning(result?.warning ?? '')
    } catch (deleteFailure) {
      setDeleteError(deleteFailure instanceof Error ? deleteFailure.message : '刪除團購失敗')
    } finally {
      setDeleting(false)
    }
  }

  const menuItems = (campaign: CampaignListItem, phase: CampaignPhase): MenuItem[] => [
    ...(phase === 'draft' ? [] : [{
      label: '查看住戶頁', ariaLabel: `查看住戶頁 ${campaign.title}`, href: `/campaign/${campaign.slug}`, target: '_blank',
    }]),
    ...(onDelete ? [{
      label: '刪除團購', ariaLabel: `刪除 ${campaign.title}`, tone: 'danger' as const,
      onSelect: () => { setDeleteError(''); setDeleteTarget(campaign) },
    }] : []),
  ]

  return (
    <main className="organizer-page organizer-home">
      <div className="organizer-page-heading">
        <h1>團購</h1>
        <SegmentedControl
          label="團購狀態篩選"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: '全部', count: counts.all },
            { value: 'open', label: '開團中', count: counts.open },
            { value: 'draft', label: '草稿', count: counts.draft },
            { value: 'closed', label: '已結單', count: counts.closed },
          ]}
        />
      </div>

      {(needsRecipient || unboundResidentCount > 0) && (
        <section className="organizer-attention" aria-label="待處理">
          <ul>
            {needsRecipient && <li>自動結單通知還沒有指定接收的團主<OrganizerLink href="/admin/settings">前往設定</OrganizerLink></li>}
            {unboundResidentCount > 0 && <li>{unboundResidentCount} 位住戶尚未填戶號<OrganizerLink href="/admin/residents?filter=unbound">查看住戶</OrganizerLink></li>}
          </ul>
        </section>
      )}

      {deleteWarning && <FeedbackMessage tone="warning">{deleteWarning}</FeedbackMessage>}
      {copyFeedback && <FeedbackMessage tone="success">{copyFeedback}</FeedbackMessage>}
      {copyError && <FeedbackMessage tone="error">{copyError}</FeedbackMessage>}

      {visibleCampaigns.length === 0 ? (
        <EmptyState title="建立第一團" description="按右上角的「建立新團」開始第一次團購。" />
      ) : rows.length === 0 ? (
        <p className="organizer-muted">此分類目前沒有團購。</p>
      ) : (
        <div className="organizer-table-wrap">
          <table className="organizer-table" aria-label="團購列表">
            <thead>
              <tr>
                <th scope="col">團購</th>
                <th scope="col">狀態</th>
                <th scope="col">成團進度</th>
                <th scope="col">訂單</th>
                <th scope="col">未付款</th>
                <th scope="col">結單</th>
                <th scope="col">時間</th>
                <th scope="col"><span className="ui-visually-hidden">操作</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((campaign) => {
                const phase = campaignPhase(campaign)
                const badge = PHASE_BADGES[phase]
                const progress = formationProgress(campaign)
                const closing = phase === 'closed' ? null : describeAutoClose(campaign.autoCloseAt, today)
                const href = `/admin/campaign/${campaign.id}`
                const items = menuItems(campaign, phase)
                return (
                  <tr key={campaign.id} className="organizer-table-row" onClick={(event) => {
                    if (event.target instanceof Element && event.target.closest(ROW_ACTION_SELECTOR)) return
                    navigate(href)
                  }}>
                    <th scope="row">
                      <div className="organizer-campaign-cell">
                        <CampaignThumb campaign={campaign} />
                        <div>
                          <OrganizerLink className="organizer-row-link" href={href}>{campaign.title}</OrganizerLink>
                          {phase === 'draft' && <small>住戶看不到・尚未發布</small>}
                        </div>
                      </div>
                    </th>
                    <td data-label="狀態"><StatusBadge tone={badge.tone}>{badge.label}</StatusBadge></td>
                    <td data-label="成團進度">
                      {phase === 'draft' ? <span className="organizer-muted">發布後開始接單</span> : (
                        <div className="organizer-progress-cell">
                          <span className="ui-num">{progress.text}</span>
                          <ProgressBar label={`${campaign.title}成團進度`} value={progress.value} max={progress.max} />
                          <small className={progress.formed ? 'is-formed' : undefined}>{progress.statusText}</small>
                        </div>
                      )}
                    </td>
                    <td data-label="訂單" className="ui-num">{phase === 'draft' ? '—' : campaign.orderCount}</td>
                    <td data-label="未付款" className="ui-num">{phase === 'closed' ? unpaidOrderCount(campaign) : '—'}</td>
                    <td data-label="結單">
                      {phase === 'closed' ? '—' : closing
                        ? <span className={closing.soon ? 'organizer-soon' : undefined}>{closing.when}</span>
                        : <span className="organizer-muted">未設定</span>}
                    </td>
                    <td data-label="時間" className="ui-num">
                      {phase === 'draft' || !campaign.openedAt
                        ? `最後編輯 ${formatZhTwTimestamp(campaign.updatedAt)}`
                        : formatZhTwTimestamp(campaign.openedAt)}
                    </td>
                    <td>
                      <div className="organizer-row-actions">
                        {phase !== 'draft' && (
                          <Button variant="utility" size="sm" aria-label={`複製住戶連結 ${campaign.title}`} disabled={Boolean(copyingId)} onClick={() => { void copyLink(campaign) }}>
                            {copyingId === campaign.id ? '複製中…' : '複製住戶連結'}
                          </Button>
                        )}
                        {items.length > 0 && <Menu size="sm" label={`更多操作 ${campaign.title}`} items={items} />}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="確認刪除團購"
          confirmLabel="確認永久刪除"
          cancelLabel="取消刪除"
          busy={deleting}
          onCancel={() => { setDeleteTarget(null); setDeleteError('') }}
          onConfirm={() => { void confirmDelete() }}
        >
          <p>確定要刪除「{deleteTarget.title}」嗎？</p>
          <p>訂單及歷史資料都會永久刪除，無法復原。</p>
          {deleteError && <FeedbackMessage tone="error">{deleteError}</FeedbackMessage>}
        </ConfirmDialog>
      )}
    </main>
  )
}
```

- [ ] **Step 7: 在 `organizer.css` 檔尾加入首頁樣式**

```css
/* Organizer home: attention list and the campaign table, which turns into cards below 640px. */
.organizer-attention { margin-bottom: var(--space-4); }
.organizer-attention ul { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.organizer-attention li { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3); border-radius: var(--radius-control); background: var(--color-warning-subtle); }
.organizer-attention a { color: var(--color-primary); font-weight: var(--font-weight-strong); }
.organizer-table-wrap { overflow-x: auto; border: 1px solid var(--color-border); border-radius: var(--radius-surface); background: var(--color-surface); }
.organizer-table { width: 100%; border-collapse: collapse; }
.organizer-table :is(th, td) { padding: var(--space-3); border-bottom: 1px solid var(--color-divider); text-align: left; vertical-align: middle; font-weight: var(--font-weight-regular); }
.organizer-table thead th { background: var(--color-surface-subtle); color: var(--color-text-secondary); font-size: var(--font-size-caption); white-space: nowrap; }
.organizer-table tbody tr:last-child > * { border-bottom: 0; }
.organizer-table-row { cursor: pointer; }
.organizer-campaign-cell { display: flex; align-items: center; gap: var(--space-3); min-width: 220px; }
.organizer-campaign-cell small { display: block; color: var(--color-warning); font-size: var(--font-size-caption); }
.organizer-thumb { flex: none; width: 44px; height: 44px; border-radius: var(--radius-control); object-fit: cover; background: var(--color-surface-subtle); }
.organizer-thumb-empty { display: grid; place-items: center; color: var(--color-text-secondary); font-size: var(--font-size-caption); }
.organizer-row-link { color: var(--color-text); font-weight: var(--font-weight-strong); text-decoration: none; }
.organizer-progress-cell { display: grid; gap: 4px; min-width: 140px; }
.organizer-progress-cell small { color: var(--color-text-secondary); font-size: var(--font-size-caption); }
.organizer-progress-cell small.is-formed { color: var(--color-success); }
.organizer-soon { color: var(--color-warning); font-weight: var(--font-weight-strong); }
.organizer-row-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-2); white-space: nowrap; }

@media (hover: hover) {
  .organizer-table-row:hover > * { background: var(--color-fill-hover); }
  .organizer-row-link:hover { color: var(--color-primary); }
}

@media (max-width: 639px) {
  .organizer-table-wrap { overflow: visible; border: 0; background: transparent; }
  .organizer-table, .organizer-table tbody, .organizer-table tr, .organizer-table th, .organizer-table td { display: block; }
  .organizer-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); }
  .organizer-table tbody { display: grid; gap: var(--space-3); }
  .organizer-table tbody tr { padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-surface); background: var(--color-surface); }
  .organizer-table tbody td { display: flex; justify-content: space-between; gap: var(--space-3); padding: var(--space-1) 0; border: 0; }
  .organizer-table tbody th { padding: 0 0 var(--space-2); border: 0; }
  .organizer-table tbody td[data-label]::before { content: attr(data-label); color: var(--color-text-secondary); font-size: var(--font-size-caption); }
  .organizer-row-actions { justify-content: flex-start; }
}
```

- [ ] **Step 8: 確認通過**

Run: `npx vitest run src/components/organizer` → PASS。
Run: `npx tsc -b` 與 `npm run lint` → 無錯誤、無警告。

- [ ] **Step 9: Commit**

```bash
git add src/components/organizer
git commit -m "feat: add the organizer campaign table home"
```

---

### Task 5: 住戶頁

**Files:**
- Create: `src/components/organizer/residentView.ts`、`residentView.test.ts`
- Modify: `src/ResidentMemberManagementApp.tsx`（整檔改寫）
- Modify: `src/ResidentMemberManagementApp.css`（整檔改寫）
- Modify: `src/ResidentMemberManagementApp.test.tsx`

**Interfaces:**
- Consumes：
  - Task 1：`ResidentFilter`
  - Task 2：`Menu`
  - `SegmentedControl`、`StatusBadge`、`Button`、`ConfirmDialog`、`FeedbackMessage`
- Produces：
  - `isUnboundResident(member)`：Task 8 首頁的未填戶號數量用它。
  - `residentHouseholdLabel(member)`
  - `matchesResidentFilter(member, filter)`
  - `countResidents(members)`
  - `matchesResidentSearch(member, query)`
  - `ResidentMemberManagementApp` 新增 `initialFilter?: ResidentFilter`（預設 `'all'`），其餘 props 不變。

- [ ] **Step 1: 寫失敗測試（純函式）**

`src/components/organizer/residentView.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import type { ResidentMember } from '../../services/residentMemberManagementGateway'
import { countResidents, isUnboundResident, matchesResidentFilter, matchesResidentSearch, residentHouseholdLabel } from './residentView'

const bound: ResidentMember = {
  memberCode: 'a'.repeat(36), displayName: '住戶甲', pictureUrl: null, period: 2, unit: '2K13',
  joinedAt: '2026-08-14T00:00:00Z', blocked: false, blockedAt: null,
}
const unbound: ResidentMember = { ...bound, memberCode: 'b'.repeat(36), displayName: '住戶丁', period: null, unit: null }
const other: ResidentMember = { ...unbound, memberCode: 'c'.repeat(36), displayName: '住戶丙', householdKind: 'other' }
const blocked: ResidentMember = { ...unbound, memberCode: 'd'.repeat(36), displayName: '陌生住戶', blocked: true, blockedAt: '2026-08-15T00:00:00Z' }

describe('resident view', () => {
  it('counts only active residents without a household as unbound, never other or blocked members', () => {
    expect(isUnboundResident(unbound)).toBe(true)
    expect(isUnboundResident(other)).toBe(false)
    expect(isUnboundResident(blocked)).toBe(false)
    expect(isUnboundResident(bound)).toBe(false)
  })

  it('labels households, other members and missing households', () => {
    expect(residentHouseholdLabel(bound)).toBe('二期 2K13')
    expect(residentHouseholdLabel(other)).toBe('其他')
    expect(residentHouseholdLabel(unbound)).toBe('尚未填戶號')
  })

  it('keeps blocked members apart from every other filter and counts each filter', () => {
    const members = [bound, unbound, other, blocked]
    expect(members.filter((member) => matchesResidentFilter(member, 'all'))).toEqual([bound, unbound, other])
    expect(members.filter((member) => matchesResidentFilter(member, 'unbound'))).toEqual([unbound])
    expect(members.filter((member) => matchesResidentFilter(member, 'other'))).toEqual([other])
    expect(members.filter((member) => matchesResidentFilter(member, 'blocked'))).toEqual([blocked])
    expect(countResidents(members)).toEqual({ all: 3, unbound: 1, other: 1, blocked: 1 })
  })

  it('searches by LINE name or household, ignoring case and surrounding spaces', () => {
    expect(matchesResidentSearch(bound, '2k13')).toBe(true)
    expect(matchesResidentSearch(bound, ' 甲 ')).toBe(true)
    expect(matchesResidentSearch(bound, '二期')).toBe(true)
    expect(matchesResidentSearch(bound, '乙')).toBe(false)
    expect(matchesResidentSearch(bound, '   ')).toBe(true)
  })
})
```

- [ ] **Step 2: 修改住戶頁測試**

在 `src/ResidentMemberManagementApp.test.tsx`：

1. 在檔案頂端 `otherMember` 之後加入：
   ```tsx
   const unboundMember = {
     memberCode: '1111111111111111111111111111111111aa',
     displayName: '住戶丁',
     pictureUrl: null,
     period: null,
     unit: null,
     joinedAt: '2026-08-16T00:00:00Z',
     blocked: false,
     blockedAt: null,
   }
   ```
2. `checks every active resident with one button and summarises the result with lights`：
   - 把 `expect(within(screen.getByRole('article', { name: '陌生住戶' })).queryByText(/群組/)).not.toBeInTheDocument()` 換成下面三行。已封鎖住戶仍然不顯示燈號，只是改在「已封鎖」篩選裡確認：
     ```tsx
     expect(screen.queryByRole('article', { name: '陌生住戶' })).not.toBeInTheDocument()
     await user.click(screen.getByRole('radio', { name: '已封鎖 1' }))
     expect(within(screen.getByRole('article', { name: '陌生住戶' })).queryByText(/群組/)).not.toBeInTheDocument()
     ```
   - 把這行移到最後的 `expect(screen.getByText(/群組狀態僅供核對/))` 之後。
3. `shows verified LINE residents without internal identity fields`：整個測試換成下面內容。原本對按鈕 class 與圖示的斷言，改為確認「移除並封鎖」在選單中且是危險樣式：
   ```tsx
     it('shows verified LINE residents without internal identity fields', async () => {
       const user = userEvent.setup()
       render(<ResidentMemberManagementApp members={members} onSetBlocked={vi.fn()} onUpdateHousehold={vi.fn()} />)

       expect(screen.getByRole('heading', { level: 1, name: '住戶 1 位' })).toBeInTheDocument()
       expect(screen.getByText('住戶甲')).toBeInTheDocument()
       expect(screen.getByText('二期 2K13')).toBeInTheDocument()
       expect(screen.getByRole('img', { name: '住戶甲的LINE頭貼' })).toBeInTheDocument()
       expect(document.body.textContent).not.toContain('abcdef0123456789abcdef0123456789abcd')
       expect(screen.getByRole('button', { name: '調整住戶資料 住戶甲' })).toHaveTextContent('調整戶號')
       await user.click(screen.getByRole('button', { name: '更多操作 住戶甲' }))
       expect(screen.getByRole('menuitem', { name: '移除並封鎖 住戶甲' })).toHaveAttribute('data-tone', 'danger')
       await user.keyboard('{Escape}')

       expect(screen.queryByText('陌生住戶')).not.toBeInTheDocument()
       await user.click(screen.getByRole('radio', { name: '已封鎖 1' }))
       expect(screen.getByText('陌生住戶')).toBeInTheDocument()
       expect(screen.getByText('已封鎖', { selector: '.ui-status-badge' })).toBeInTheDocument()
     })
   ```
4. `requires confirmation before removing and blocking a resident`：把 `await user.click(screen.getByRole('button', { name: '移除並封鎖 住戶甲' }))` 換成：
   ```tsx
   await user.click(screen.getByRole('button', { name: '更多操作 住戶甲' }))
   await user.click(screen.getByRole('menuitem', { name: '移除並封鎖 住戶甲' }))
   ```
5. `lets the organizer unblock a resident`：render 加上 `initialFilter="blocked"`。
6. 在 `describe` 末尾新增：
   ```tsx
     it('filters residents and searches by name or household', async () => {
       const user = userEvent.setup()
       render(<ResidentMemberManagementApp members={[...members, otherMember, unboundMember]} onSetBlocked={vi.fn()} onUpdateHousehold={vi.fn()} />)

       expect(screen.getByRole('heading', { level: 1, name: '住戶 3 位' })).toBeInTheDocument()
       expect(screen.getByRole('radio', { name: '全部 3' })).toBeChecked()
       expect(screen.getByRole('radio', { name: '未填戶號 1' })).toBeInTheDocument()
       expect(screen.getByRole('radio', { name: '其他 1' })).toBeInTheDocument()
       expect(screen.getByRole('radio', { name: '已封鎖 1' })).toBeInTheDocument()

       await user.type(screen.getByRole('searchbox', { name: '搜尋住戶' }), '2k13')
       expect(screen.getByRole('article', { name: '住戶甲' })).toBeInTheDocument()
       expect(screen.queryByRole('article', { name: '住戶丙' })).not.toBeInTheDocument()

       await user.clear(screen.getByRole('searchbox', { name: '搜尋住戶' }))
       await user.click(screen.getByRole('radio', { name: '未填戶號 1' }))
       const unboundCard = screen.getByRole('article', { name: '住戶丁' })
       expect(within(unboundCard).getByText('尚未填戶號')).toBeInTheDocument()
       expect(screen.queryByRole('article', { name: '住戶甲' })).not.toBeInTheDocument()

       await user.type(screen.getByRole('searchbox', { name: '搜尋住戶' }), '不存在')
       expect(screen.getByText('沒有符合條件的住戶。')).toBeInTheDocument()
     })

     it('opens on the filter it was linked with', () => {
       render(<ResidentMemberManagementApp members={[...members, unboundMember]} initialFilter="unbound" onSetBlocked={vi.fn()} onUpdateHousehold={vi.fn()} />)
       expect(screen.getByRole('radio', { name: '未填戶號 1' })).toBeChecked()
       expect(screen.getByRole('article', { name: '住戶丁' })).toBeInTheDocument()
       expect(screen.queryByRole('article', { name: '住戶甲' })).not.toBeInTheDocument()
     })
   ```

- [ ] **Step 3: 確認測試失敗**

Run: `npx vitest run src/components/organizer/residentView.test.ts src/ResidentMemberManagementApp.test.tsx`
Expected: FAIL（`residentView` 不存在；住戶頁沒有「住戶 N 位」標題、篩選與搜尋）。

- [ ] **Step 4: 實作 `src/components/organizer/residentView.ts`**

```ts
import { formatHousehold } from '../../domain/household'
import type { ResidentFilter } from '../../routing'
import type { ResidentMember } from '../../services/residentMemberManagementGateway'

const FILTERS: ResidentFilter[] = ['all', 'unbound', 'other', 'blocked']

export function isUnboundResident(member: ResidentMember): boolean {
  return !member.blocked && (member.householdKind ?? 'resident') === 'resident' && (member.period === null || !member.unit)
}

export function residentHouseholdLabel(member: ResidentMember): string {
  const kind = member.householdKind ?? 'resident'
  if (kind === 'resident' && (member.period === null || !member.unit)) return '尚未填戶號'
  return formatHousehold(kind, member.period, member.unit)
}

export function matchesResidentFilter(member: ResidentMember, filter: ResidentFilter): boolean {
  if (filter === 'blocked') return member.blocked
  if (member.blocked) return false
  if (filter === 'unbound') return isUnboundResident(member)
  if (filter === 'other') return member.householdKind === 'other'
  return true
}

export function countResidents(members: ResidentMember[]): Record<ResidentFilter, number> {
  return Object.fromEntries(
    FILTERS.map((filter) => [filter, members.filter((member) => matchesResidentFilter(member, filter)).length]),
  ) as Record<ResidentFilter, number>
}

export function matchesResidentSearch(member: ResidentMember, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [member.displayName, residentHouseholdLabel(member), member.unit ?? '']
    .some((value) => value.toLowerCase().includes(needle))
}
```

- [ ] **Step 5: 改寫 `src/ResidentMemberManagementApp.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { formatZhTwTimestamp } from './domain/timestamp'
import type { ResidentFilter } from './routing'
import type { ResidentMember, ResidentGroupStatusUpdate } from './services/residentMemberManagementGateway'
import { countResidents, matchesResidentFilter, matchesResidentSearch, residentHouseholdLabel } from './components/organizer/residentView'
import { Button } from './components/ui/Button'
import { ConfirmDialog } from './components/ui/ConfirmDialog'
import { FeedbackMessage } from './components/ui/FeedbackMessage'
import { Menu } from './components/ui/Menu'
import { SegmentedControl } from './components/ui/SegmentedControl'
import { StatusBadge } from './components/ui/StatusBadge'
import {
  type HouseholdKind,
  formatHouseholdUnit,
  HOUSEHOLD_LETTERS,
  HOUSEHOLD_NUMBERS,
  HOUSEHOLD_PREFIXES,
  parseHouseholdUnit,
  RESIDENT_PERIODS,
  type ResidentPeriod,
} from './domain/household'
import './ResidentMemberManagementApp.css'

type Props = {
  members: ResidentMember[]
  initialFilter?: ResidentFilter
  onSetBlocked: (memberCode: string, blocked: boolean) => Promise<void>
  onUpdateHousehold: (memberCode: string, household: { kind: HouseholdKind; period: number | null; unit: string | null }) => Promise<void>
  onRefreshGroupStatuses?: (memberCodes: string[]) => Promise<ResidentGroupStatusUpdate[]>
}

const GROUP_CHECK_BATCH_SIZE = 20
const GROUP_CHECK_BUSY = 'group-check'

function groupStatusLabel(status: ResidentMember['groupStatus']): string {
  if (status === 'in_group') return '在群組內'
  if (status === 'not_in_group') return '不在群組'
  if (status === 'unknown') return '無法確認'
  return '尚未查驗'
}

function Avatar({ member }: { member: ResidentMember }) {
  if (member.pictureUrl) {
    return <img src={member.pictureUrl} alt={`${member.displayName}的LINE頭貼`} referrerPolicy="no-referrer" />
  }
  return <span aria-hidden="true">{member.displayName.slice(0, 1)}</span>
}

export default function ResidentMemberManagementApp({ members, initialFilter = 'all', onSetBlocked, onUpdateHousehold, onRefreshGroupStatuses }: Props) {
  const [visibleMembers, setVisibleMembers] = useState(members)
  const [filter, setFilter] = useState<ResidentFilter>(initialFilter)
  const [query, setQuery] = useState('')
  const [removeTarget, setRemoveTarget] = useState<ResidentMember | null>(null)
  const [editTargetCode, setEditTargetCode] = useState('')
  const [editKind, setEditKind] = useState<HouseholdKind>('resident')
  const [editPeriod, setEditPeriod] = useState<ResidentPeriod>(2)
  const [editPrefix, setEditPrefix] = useState(1)
  const [editLetter, setEditLetter] = useState('A')
  const [editNumber, setEditNumber] = useState(1)
  const [busyCode, setBusyCode] = useState('')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [groupCheckProgress, setGroupCheckProgress] = useState<{ done: number; total: number } | null>(null)

  useEffect(() => { setVisibleMembers(members) }, [members])

  const activeMembers = visibleMembers.filter((member) => !member.blocked)
  const counts = countResidents(visibleMembers)
  const shownMembers = visibleMembers.filter((member) => matchesResidentFilter(member, filter) && matchesResidentSearch(member, query))
  const groupCounts = {
    in: activeMembers.filter((member) => member.groupStatus === 'in_group').length,
    out: activeMembers.filter((member) => member.groupStatus === 'not_in_group').length,
  }

  const refreshAllGroupStatuses = async () => {
    if (busyCode || !onRefreshGroupStatuses) return
    const codes = activeMembers.map((member) => member.memberCode)
    if (codes.length === 0) return
    setBusyCode(GROUP_CHECK_BUSY)
    setError('')
    setFeedback('')
    let failed = 0
    try {
      for (let start = 0; start < codes.length; start += GROUP_CHECK_BATCH_SIZE) {
        setGroupCheckProgress({ done: start, total: codes.length })
        const batch = codes.slice(start, start + GROUP_CHECK_BATCH_SIZE)
        try {
          const statuses = new Map((await onRefreshGroupStatuses(batch)).map((status) => [status.memberCode, status]))
          if (batch.some((code) => !statuses.has(code))) throw new Error('群組查驗結果不完整')
          setVisibleMembers((current) => current.map((item) => {
            const status = statuses.get(item.memberCode)
            return status ? { ...item, groupStatus: status.groupStatus, groupCheckedAt: status.groupCheckedAt } : item
          }))
        } catch {
          // The server keeps the previous result for a batch it could not confirm.
          failed += batch.length
        }
      }
      if (failed > 0) setError(`${failed} 位暫時無法確認，原本的結果未變更，請稍後再試`)
      else setFeedback(`已更新 ${codes.length} 位住戶的群組狀態`)
    } finally {
      setGroupCheckProgress(null)
      setBusyCode('')
    }
  }

  const changeBlocked = async (member: ResidentMember, blocked: boolean) => {
    if (busyCode) return
    setBusyCode(member.memberCode)
    setError('')
    setFeedback('')
    try {
      await onSetBlocked(member.memberCode, blocked)
      setVisibleMembers((current) => current.map((item) => item.memberCode === member.memberCode
        ? { ...item, blocked, blockedAt: blocked ? new Date().toISOString() : null }
        : item))
      setFeedback(blocked ? `已移除並封鎖${member.displayName}` : `已解除${member.displayName}的封鎖`)
      setRemoveTarget(null)
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : '更新住戶狀態失敗')
    } finally {
      setBusyCode('')
    }
  }

  const openHouseholdEditor = (member: ResidentMember) => {
    const period = RESIDENT_PERIODS.includes(member.period as ResidentPeriod)
      ? member.period as ResidentPeriod
      : 2
    try {
      const parsed = parseHouseholdUnit(period, member.unit ?? '')
      setEditPeriod(parsed.period)
      setEditPrefix(parsed.prefix ?? 1)
      setEditLetter(parsed.letter)
      setEditNumber(parsed.number)
    } catch {
      const partial = (member.unit ?? '').toUpperCase().match(/([A-Z])([1-9]|1[0-5])$/)
      setEditPeriod(period)
      setEditPrefix(1)
      setEditLetter(partial?.[1] ?? 'A')
      setEditNumber(Number(partial?.[2] ?? 1))
    }
    setEditKind(member.householdKind ?? 'resident')
    setError('')
    setFeedback('')
    setEditTargetCode(member.memberCode)
  }

  const updateHousehold = async (member: ResidentMember) => {
    if (busyCode) return
    const unit = formatHouseholdUnit({
      kind: editKind,
      period: editPeriod,
      prefix: editPeriod === 1 ? null : editPrefix,
      letter: editLetter,
      number: editNumber,
    })
    // 'other' has no household: formatHouseholdUnit returns null for that kind,
    // which is the value the CHECK constraint wants, not a validation failure.
    if (editKind === 'resident' && unit === null) return
    const household = editKind === 'other'
      ? { kind: 'other' as const, period: null, unit: null }
      : { kind: 'resident' as const, period: editPeriod, unit: unit! }
    setBusyCode(member.memberCode)
    setError('')
    setFeedback('')
    try {
      await onUpdateHousehold(member.memberCode, household)
      setVisibleMembers((current) => current.map((item) => item.memberCode === member.memberCode
        ? { ...item, householdKind: household.kind, period: household.period, unit: household.unit }
        : item))
      setFeedback(editKind === 'other' ? `已將${member.displayName}改為其他` : `已更新${member.displayName}的期別／戶號`)
      setEditTargetCode('')
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : '調整住戶資料失敗')
    } finally {
      setBusyCode('')
    }
  }

  return (
    <main className="organizer-page resident-member-management" aria-labelledby="resident-member-heading">
      <div className="organizer-page-heading">
        <h1 id="resident-member-heading">住戶 <span className="ui-num">{activeMembers.length} 位</span></h1>
      </div>

      <div className="resident-member-toolbar">
        <input
          className="ui-input resident-member-search"
          type="search"
          aria-label="搜尋住戶"
          placeholder="搜尋名字或戶號"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <SegmentedControl
          label="住戶篩選"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: '全部', count: counts.all },
            { value: 'unbound', label: '未填戶號', count: counts.unbound },
            { value: 'other', label: '其他', count: counts.other },
            { value: 'blocked', label: '已封鎖', count: counts.blocked },
          ]}
        />
      </div>

      {onRefreshGroupStatuses && (
        <section className="resident-group-check" aria-label="LINE群組查驗">
          <ul className="resident-group-summary" aria-label="正式群組狀態">
            <li><span className="resident-group-dot" data-status="in_group" aria-hidden="true" />在群組內 <strong>{groupCounts.in}</strong></li>
            <li><span className="resident-group-dot" data-status="not_in_group" aria-hidden="true" />不在群組 <strong>{groupCounts.out}</strong></li>
            <li><span className="resident-group-dot" data-status="unchecked" aria-hidden="true" />尚未查驗 <strong>{activeMembers.length - groupCounts.in - groupCounts.out}</strong></li>
          </ul>
          <Button
            variant="secondary"
            size="sm"
            aria-label="更新全部群組狀態"
            disabled={Boolean(busyCode) || activeMembers.length === 0}
            onClick={() => { void refreshAllGroupStatuses() }}
          >
            <span aria-hidden="true">↻</span>
            {groupCheckProgress ? `查驗中…${groupCheckProgress.done}/${groupCheckProgress.total}` : '更新全部群組狀態'}
          </Button>
          <p>群組狀態僅供核對，不會自動停用既有住戶。</p>
        </section>
      )}

      {feedback && <FeedbackMessage tone="success">{feedback}</FeedbackMessage>}
      {error && !removeTarget && <FeedbackMessage tone="error">{error}</FeedbackMessage>}
      {visibleMembers.length === 0
        ? <p className="resident-member-empty">目前還沒有住戶加入。</p>
        : shownMembers.length === 0 && <p className="resident-member-empty">沒有符合條件的住戶。</p>}

      <div className="resident-member-list">
        {shownMembers.map((member) => {
          const nameId = `resident-member-name-${member.memberCode}`
          const canEditHousehold = !member.blocked && (member.householdKind === 'other' || (member.period !== null && Boolean(member.unit)))
          return (
            <article key={member.memberCode} aria-labelledby={nameId} className={member.blocked ? 'resident-member-card is-blocked' : 'resident-member-card'}>
              <div className="resident-member-avatar"><Avatar member={member} /></div>
              <div className="resident-member-copy">
                <div className="resident-member-name">
                  <h2 id={nameId}>{member.displayName}</h2>
                  {member.blocked && <StatusBadge tone="neutral">已封鎖</StatusBadge>}
                </div>
                <p>{residentHouseholdLabel(member)}</p>
                <small>加入時間 {formatZhTwTimestamp(member.joinedAt)}</small>
                {onRefreshGroupStatuses && !member.blocked && (
                  <p className="resident-member-group-status">
                    <span className="resident-group-dot" data-status={member.groupStatus ?? 'unchecked'} aria-hidden="true" />
                    {groupStatusLabel(member.groupStatus)}
                  </p>
                )}
              </div>
              <div className="resident-member-actions">
                {canEditHousehold && (
                  <Button variant="utility" size="sm" aria-label={`調整住戶資料 ${member.displayName}`} disabled={Boolean(busyCode)} onClick={() => openHouseholdEditor(member)}>
                    調整戶號
                  </Button>
                )}
                {member.blocked ? (
                  <Button variant="utility" size="sm" aria-label={`解除封鎖 ${member.displayName}`} disabled={Boolean(busyCode)} onClick={() => { void changeBlocked(member, false) }}>
                    {busyCode === member.memberCode ? '處理中…' : '解除封鎖'}
                  </Button>
                ) : (
                  <Menu
                    size="sm"
                    label={`更多操作 ${member.displayName}`}
                    items={[{
                      label: '移除並封鎖',
                      ariaLabel: `移除並封鎖 ${member.displayName}`,
                      tone: 'danger',
                      disabled: Boolean(busyCode),
                      onSelect: () => { setError(''); setRemoveTarget(member) },
                    }]}
                  />
                )}
              </div>
              {editTargetCode === member.memberCode && (
                <div className="resident-household-editor" aria-label={`調整${member.displayName}的住戶資料`}>
                  <label><span>期別</span><select
                    aria-label={`${member.displayName} 期別`}
                    value={editKind === 'other' ? 'other' : editPeriod}
                    onChange={(event) => {
                      if (event.target.value === 'other') {
                        setEditKind('other')
                        return
                      }
                      setEditKind('resident')
                      setEditPeriod(Number(event.target.value) as ResidentPeriod)
                    }}
                  >
                    {RESIDENT_PERIODS.map((period) => <option key={period} value={period}>{new Intl.NumberFormat('zh-Hant-u-nu-hanidec').format(period)}期</option>)}
                    <option value="other">其他</option>
                  </select></label>
                  {editKind === 'resident' && <><fieldset className="resident-household-unit">
                    <legend>戶號</legend>
                    <div className="resident-household-unit-parts">
                      {editPeriod !== 1 && <label><span>數字</span><select aria-label={`${member.displayName} 戶號數字`} value={editPrefix} onChange={(event) => setEditPrefix(Number(event.target.value))}>
                        {HOUSEHOLD_PREFIXES.map((prefix) => <option key={prefix} value={prefix}>{prefix}</option>)}
                      </select></label>}
                      <label><span>英文字母</span><select aria-label={`${member.displayName} 戶號英文字母`} value={editLetter} onChange={(event) => setEditLetter(event.target.value)}>
                        {HOUSEHOLD_LETTERS.map((letter) => <option key={letter} value={letter}>{letter}</option>)}
                      </select></label>
                    </div>
                  </fieldset>
                  <label><span>樓層</span><select aria-label={`${member.displayName} 樓層`} value={editNumber} onChange={(event) => setEditNumber(Number(event.target.value))}>
                    {HOUSEHOLD_NUMBERS.map((number) => <option key={number} value={number}>{number}</option>)}
                  </select></label></>}
                  <div className="resident-household-editor-actions">
                    <Button variant="secondary" size="sm" disabled={Boolean(busyCode)} onClick={() => setEditTargetCode('')}>取消</Button>
                    <Button size="sm" aria-label={`儲存住戶資料 ${member.displayName}`} disabled={Boolean(busyCode)} onClick={() => { void updateHousehold(member) }}>
                      {busyCode === member.memberCode ? '儲存中…' : '儲存調整'}
                    </Button>
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>

      {removeTarget && (
        <ConfirmDialog
          title="確認移除住戶"
          confirmLabel="確認移除並封鎖"
          busy={Boolean(busyCode)}
          onCancel={() => { setRemoveTarget(null); setError('') }}
          onConfirm={() => { void changeBlocked(removeTarget, true) }}
        >
          <p>確定要移除並封鎖「{removeTarget.displayName}」嗎？</p>
          <p>對方將立即失去住戶存取權，除非團主日後解除封鎖。</p>
          {error && <FeedbackMessage tone="error">{error}</FeedbackMessage>}
        </ConfirmDialog>
      )}
    </main>
  )
}
```

說明：
- 錯誤訊息在確認視窗開啟時只顯示在視窗內（`error && !removeTarget`），避免同一則錯誤出現兩次、`findByRole('alert')` 找到兩個。
- `formatHousehold` 已改由 `residentView` 使用，本檔不再匯入。

- [ ] **Step 6: 改寫 `src/ResidentMemberManagementApp.css`**

```css
/* Organizer residents page: toolbar, group check, and resident cards. */
.resident-member-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin-bottom: var(--space-4); }
.resident-member-search { flex: 1 1 240px; max-width: 360px; }
.resident-member-empty { color: var(--color-text-secondary); }
.resident-member-list { display: grid; gap: var(--space-2); }
.resident-member-card { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-surface); background: var(--color-surface); }
.resident-member-card.is-blocked { background: var(--color-surface-subtle); }
.resident-member-avatar :is(img, span) { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; object-fit: cover; background: var(--color-neutral-subtle); color: var(--color-text); font-weight: var(--font-weight-strong); }
.resident-member-copy { display: grid; gap: 2px; min-width: 0; }
.resident-member-name { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.resident-member-name h2 { margin: 0; font-size: var(--font-size-base); font-weight: var(--font-weight-strong); overflow-wrap: anywhere; }
.resident-member-copy p { margin: 0; }
.resident-member-copy small { color: var(--color-text-secondary); font-size: var(--font-size-caption); }
.resident-member-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--space-2); }
.resident-household-editor { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--color-divider); }
.resident-household-editor label { display: grid; gap: 4px; color: var(--color-text-secondary); font-size: var(--font-size-caption); }
.resident-household-editor select { min-height: 32px; padding: 0 var(--space-2); border: 1px solid var(--color-border-strong); border-radius: var(--radius-control); background: var(--color-surface); color: var(--color-text); font: inherit; font-size: var(--font-size-dense); }
.resident-household-unit { margin: 0; padding: 0; border: 0; }
.resident-household-unit legend { padding: 0; color: var(--color-text-secondary); font-size: var(--font-size-caption); }
.resident-household-unit-parts { display: flex; gap: var(--space-2); }
.resident-household-editor-actions { display: flex; gap: var(--space-2); }

/* One-button LINE group check: counts and one light per resident. */
.resident-group-check { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-4); margin-bottom: var(--space-4); padding: var(--space-3) var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-surface); background: var(--color-surface); }
.resident-group-check p { flex-basis: 100%; margin: 0; color: var(--color-text-secondary); font-size: var(--font-size-caption); }
.resident-group-summary { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-5); margin: 0; padding: 0; list-style: none; }
.resident-group-summary li,
.resident-member-copy .resident-member-group-status { display: inline-flex; align-items: center; gap: var(--space-2); }
.resident-group-summary strong { font-variant-numeric: tabular-nums; font-weight: var(--font-weight-strong); }
.resident-group-dot { flex: none; width: 10px; height: 10px; border-radius: 50%; background: var(--color-control-off); }
.resident-group-dot[data-status="in_group"] { background: var(--color-success); }
.resident-group-dot[data-status="not_in_group"] { background: var(--color-danger); }

@media (max-width: 1023px) {
  .resident-household-editor select { min-height: var(--touch-target); }
}

@media (max-width: 639px) {
  .resident-member-card { grid-template-columns: 44px minmax(0, 1fr); }
  .resident-member-actions { grid-column: 1 / -1; justify-content: flex-start; }
  .resident-member-search { max-width: none; }
}
```

- [ ] **Step 7: 確認通過**

`CampaignListApp` 在 Task 8 刪除前，仍把住戶頁嵌在「住戶與戶號」分區，所以兩個檔案的標題查找要跟著改（標題文字變了，切換行為不變）：
- `src/CampaignListApp.test.tsx` 第 63、66 行：`{ name: '住戶名單' }` 改成 `{ level: 1, name: '住戶 1 位' }`。
- `src/LocalLiveApps.test.tsx` 第 395 行：同樣改。

Run: `npx vitest run src/components/organizer src/ResidentMemberManagementApp.test.tsx src/CampaignListApp.test.tsx src/LocalLiveApps.test.tsx` → PASS。

Run: `npx tsc -b` 與 `npm run lint` → 無錯誤、無警告。

- [ ] **Step 8: Commit**

```bash
git add src/components/organizer/residentView.ts src/components/organizer/residentView.test.ts src/ResidentMemberManagementApp.tsx src/ResidentMemberManagementApp.css src/ResidentMemberManagementApp.test.tsx src/CampaignListApp.test.tsx src/LocalLiveApps.test.tsx
git commit -m "feat: add resident search, filters and menus to the residents page"
```

---

### Task 6: 設定頁

**Files:**
- Create: `src/components/organizer/OrganizerSettings.tsx`、`OrganizerSettings.test.tsx`
- Modify: `src/components/organizer/organizer.css`（檔尾新增）

**Interfaces:**
- Consumes：
  - `AutoCloseNotificationSettings`（`state`、`onSelectCurrentUser`）
  - Task 3：`OrganizerLink`
  - `Button`
- Produces：`<OrganizerSettings autoCloseNotificationState? onSelectCurrentUserForAutoCloseNotification? onSignOut?>`

- [ ] **Step 1: 寫失敗測試**

`src/components/organizer/OrganizerSettings.test.tsx`：

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { OrganizerNavigationProvider } from './OrganizerLink'
import { OrganizerSettings } from './OrganizerSettings'

function renderSettings(props: Partial<Parameters<typeof OrganizerSettings>[0]> = {}) {
  render(<OrganizerNavigationProvider navigate={vi.fn()}><OrganizerSettings {...props} /></OrganizerNavigationProvider>)
}

describe('OrganizerSettings', () => {
  it('lets the signed-in approved organizer make themselves the sole notification recipient', async () => {
    const user = userEvent.setup()
    const onSelectCurrentUser = vi.fn().mockResolvedValue(undefined)
    renderSettings({ autoCloseNotificationState: 'other_organizer', onSelectCurrentUserForAutoCloseNotification: onSelectCurrentUser })

    expect(screen.getByRole('heading', { level: 1, name: '設定' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '自動結單通知' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '改由我接收通知' }))
    await waitFor(() => expect(onSelectCurrentUser).toHaveBeenCalledOnce())
  })

  it('links to the isolated notification lab', () => {
    renderSettings()
    expect(screen.getByRole('link', { name: '開啟通知測試中心' })).toHaveAttribute('href', '/admin/notification-lab')
  })

  it('signs the organizer out from the account section', async () => {
    const user = userEvent.setup()
    const onSignOut = vi.fn().mockResolvedValue(undefined)
    renderSettings({ onSignOut })

    await user.click(screen.getByRole('button', { name: '登出' }))
    expect(onSignOut).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/components/organizer/OrganizerSettings.test.tsx`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作 `src/components/organizer/OrganizerSettings.tsx`**

```tsx
import { useState } from 'react'
import AutoCloseNotificationSettings from '../../AutoCloseNotificationSettings'
import type { AutoCloseNotificationSettingState } from '../../services/autoCloseNotificationSettingsGateway'
import { Button } from '../ui/Button'
import { OrganizerLink } from './OrganizerLink'

type OrganizerSettingsProps = {
  autoCloseNotificationState?: AutoCloseNotificationSettingState
  onSelectCurrentUserForAutoCloseNotification?: () => Promise<void>
  onSignOut?: () => Promise<void>
}

export function OrganizerSettings({ autoCloseNotificationState, onSelectCurrentUserForAutoCloseNotification, onSignOut }: OrganizerSettingsProps) {
  const [signingOut, setSigningOut] = useState(false)

  return (
    <main className="organizer-page organizer-settings">
      <h1>設定</h1>
      {autoCloseNotificationState && onSelectCurrentUserForAutoCloseNotification && (
        <AutoCloseNotificationSettings
          state={autoCloseNotificationState}
          onSelectCurrentUser={onSelectCurrentUserForAutoCloseNotification}
        />
      )}
      <section className="organizer-settings-section" aria-labelledby="notification-lab-heading">
        <h2 id="notification-lab-heading">通知測試中心</h2>
        <p>用測試群組試發領取通知，不會通知正式社區。</p>
        <OrganizerLink className="ui-button" data-variant="secondary" data-size="sm" href="/admin/notification-lab">開啟通知測試中心</OrganizerLink>
      </section>
      {onSignOut && (
        <section className="organizer-settings-section" aria-labelledby="account-heading">
          <h2 id="account-heading">帳號</h2>
          <Button
            variant="secondary"
            size="sm"
            loading={signingOut}
            loadingLabel="正在登出…"
            onClick={() => {
              setSigningOut(true)
              void onSignOut().finally(() => setSigningOut(false))
            }}
          >登出</Button>
        </section>
      )}
    </main>
  )
}
```

說明：
- `onSignOut` 成功時，`LocalLiveAdminApp` 會換成整頁的「登出中…」再到登入畫面，這個元件卸載。React 19 在卸載後的 setState 不會警告，`finally` 可以保留。
- 按鈕的處理中文字用「正在登出…」，避免和整頁的「登出中…」同時出現時，既有登出測試的 `findByText('登出中…')` 找到兩個元素。

- [ ] **Step 4: 在 `organizer.css` 檔尾加入設定頁樣式**

```css
/* Organizer settings: one card per setting group. */
.organizer-settings { display: grid; gap: var(--space-4); max-width: 800px; }
.organizer-settings-section { display: grid; gap: var(--space-2); padding: var(--space-4) var(--space-5); border: 1px solid var(--color-border); border-radius: var(--radius-surface); background: var(--color-surface); }
.organizer-settings-section h2 { margin: 0; font-size: var(--font-size-base); font-weight: var(--font-weight-strong); }
.organizer-settings-section p { margin: 0; color: var(--color-text-secondary); }
.organizer-settings-section .ui-button { justify-self: start; }
```

- [ ] **Step 5: 確認通過**

Run: `npx vitest run src/components/organizer` → PASS。
Run: `npx tsc -b` 與 `npm run lint` → 無錯誤、無警告。

- [ ] **Step 6: Commit**

```bash
git add src/components/organizer
git commit -m "feat: add the organizer settings page"
```

---

### Task 7: 團購工作區（左側欄、分區導向、領取通知分區）

**Files:**
- Create: `src/components/organizer/workspaceSections.ts`
- Create: `src/components/organizer/WorkspaceRail.tsx`
- Create: `src/components/organizer/CampaignWorkspace.tsx`
- Create: `src/components/organizer/PickupSection.tsx`
- Create: `src/components/organizer/organizerWorkspace.test.tsx`
- Modify: `src/components/organizer/organizer.css`（檔尾新增）

本 Task 只新增工作區元件，不動既有頁面；`AdminApp`、`AdminOrdersPanel` 與接線都在 Task 8 一起改，確保每個 commit 的完整測試都通過。

**Interfaces:**
- Consumes：
  - Task 1：`WorkspaceSection`、`campaignSectionPath`
  - Task 3：`OrganizerLink`、`useOrganizerNavigate`
  - Task 4：`copyResidentLink`
  - `describeAutoClose`、`normalizeArrivalLabel`（`src/domain/campaignSchedule.ts`）
  - `campaignStatusAction`、`campaignStatusLabel`（`src/domain/orderWorkflow.ts`）
  - `formatZhTwTimestamp`
  - `PickupNotificationPanel`（props 不變）
- Produces（Task 8 使用）：
  - `type ShownSection = 'orders' | 'content' | 'pickup'`
  - `resolveWorkspaceSection(requested: WorkspaceSection | null, published: boolean): ShownSection`
  - `sectionUnavailableReason(section: ShownSection, status: CampaignStatus, published: boolean): string | null`
  - `type WorkspaceCampaign = { id; title; status; published; coverImage: CampaignImage | null; openedAt: string | null; autoCloseAt?: string | null; arrivalLabel?: string; orderCount: number | null; residentHref: string | null }`
  - `<CampaignWorkspace campaign requestedSection section now? onSetCampaignStatus? onCopyResidentLink?>{children}</CampaignWorkspace>`：`requestedSection !== section` 時以 `replace` 導向 `campaignSectionPath(id, section)`。
  - `<PickupSection campaignId campaignTitle campaignStatus published excludedOtherCount onPreview? onCreateCommand?>`

- [ ] **Step 1: 寫失敗測試**

`src/components/organizer/organizerWorkspace.test.tsx`：

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CampaignWorkspace } from './CampaignWorkspace'
import { OrganizerNavigationProvider } from './OrganizerLink'
import { PickupSection } from './PickupSection'
import { WorkspaceRail, type WorkspaceCampaign } from './WorkspaceRail'
import { resolveWorkspaceSection, sectionUnavailableReason } from './workspaceSections'

const openCampaign: WorkspaceCampaign = {
  id: 'campaign-1',
  title: '一涼製冰所 超厚三明治冰餅',
  status: 'open',
  published: true,
  coverImage: { src: 'https://example.com/ice.jpg', alt: '冰餅商品照' },
  openedAt: '2026-08-14T00:05:09.000Z',
  autoCloseAt: '2026-09-25T04:00:00.000Z',
  arrivalLabel: '貨到通知',
  orderCount: 6,
  residentHref: '/campaign/0123456789abcdef0123456789abcdef0123',
}
const now = new Date('2026-09-25T01:00:00.000Z')

function renderRail(props: Partial<Parameters<typeof WorkspaceRail>[0]> = {}) {
  render(
    <OrganizerNavigationProvider navigate={vi.fn()}>
      <WorkspaceRail campaign={openCampaign} section="orders" now={now} {...props} />
    </OrganizerNavigationProvider>,
  )
}

describe('workspace sections', () => {
  it('opens drafts on content settings and published campaigns on orders until the overview exists', () => {
    expect(resolveWorkspaceSection(null, false)).toBe('content')
    expect(resolveWorkspaceSection('orders', false)).toBe('content')
    expect(resolveWorkspaceSection('pickup', false)).toBe('content')
    expect(resolveWorkspaceSection(null, true)).toBe('orders')
    expect(resolveWorkspaceSection('overview', true)).toBe('orders')
    expect(resolveWorkspaceSection('content', true)).toBe('content')
    expect(resolveWorkspaceSection('pickup', true)).toBe('pickup')
  })

  it('explains why a section is unavailable', () => {
    expect(sectionUnavailableReason('orders', 'open', false)).toBe('發布後可用')
    expect(sectionUnavailableReason('pickup', 'open', false)).toBe('發布後可用')
    expect(sectionUnavailableReason('pickup', 'open', true)).toBe('結單後才能使用')
    expect(sectionUnavailableReason('pickup', 'closed', true)).toBeNull()
    expect(sectionUnavailableReason('content', 'open', false)).toBeNull()
    expect(sectionUnavailableReason('orders', 'open', true)).toBeNull()
  })
})

describe('WorkspaceRail', () => {
  it('shows the campaign, its schedule and the sections an open campaign can use', () => {
    renderRail()

    const rail = screen.getByRole('complementary', { name: '團購工作區' })
    expect(within(rail).getByRole('link', { name: '所有團購' })).toHaveAttribute('href', '/admin')
    expect(within(rail).getByRole('img', { name: '冰餅商品照' })).toHaveAttribute('src', 'https://example.com/ice.jpg')
    expect(within(rail).getByRole('heading', { level: 1, name: '一涼製冰所 超厚三明治冰餅' })).toBeInTheDocument()
    expect(within(rail).getByText('開團中')).toBeInTheDocument()
    expect(within(rail).getByText('今天 12:00')).toBeInTheDocument()
    expect(within(rail).getByText('貨到通知')).toBeInTheDocument()
    expect(within(rail).getByText('2026/08/14 08:05')).toBeInTheDocument()

    const nav = within(rail).getByRole('navigation', { name: '團購分區' })
    const orders = within(nav).getByRole('link', { name: '訂單 6' })
    expect(orders).toHaveAttribute('href', '/admin/campaign/campaign-1/orders')
    expect(orders).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: '內容設定' })).toHaveAttribute('href', '/admin/campaign/campaign-1/content')
    expect(within(nav).queryByRole('link', { name: /領取通知/ })).not.toBeInTheDocument()
    expect(within(nav).getByText('結單後才能使用')).toBeInTheDocument()
    expect(within(nav).queryByText('概況')).not.toBeInTheDocument()
  })

  it('asks before closing orders and closes only after confirmation', async () => {
    const user = userEvent.setup()
    const onSetCampaignStatus = vi.fn().mockResolvedValue(undefined)
    renderRail({ onSetCampaignStatus })

    await user.click(screen.getByRole('button', { name: '結單' }))
    expect(screen.getByRole('dialog', { name: '確認結單' })).toHaveTextContent('結單後住戶就不能再下單或修改訂單')
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(onSetCampaignStatus).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '結單' }))
    await user.click(screen.getByRole('button', { name: '確認結單' }))
    expect(onSetCampaignStatus).toHaveBeenCalledWith('closed')
    expect(screen.queryByRole('dialog', { name: '確認結單' })).not.toBeInTheDocument()
  })

  it('keeps the confirmation open with the error when the status change fails', async () => {
    const user = userEvent.setup()
    renderRail({ onSetCampaignStatus: vi.fn().mockRejectedValue(new Error('更新團購狀態失敗：network')) })

    await user.click(screen.getByRole('button', { name: '結單' }))
    await user.click(screen.getByRole('button', { name: '確認結單' }))

    const dialog = screen.getByRole('dialog', { name: '確認結單' })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('更新團購狀態失敗：network')
  })

  it('shows closed and legacy arrived campaigns as closed and offers reopening', async () => {
    const user = userEvent.setup()
    const onSetCampaignStatus = vi.fn().mockResolvedValue(undefined)
    renderRail({ campaign: { ...openCampaign, status: 'arrived' }, onSetCampaignStatus })

    expect(screen.getByText('已結單')).toBeInTheDocument()
    expect(screen.queryByText('已到貨')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '標記到貨' })).not.toBeInTheDocument()
    expect(screen.queryByText('今天 12:00')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '領取通知' })).toHaveAttribute('href', '/admin/campaign/campaign-1/pickup')

    await user.click(screen.getByRole('button', { name: '重新開放' }))
    expect(screen.getByRole('dialog', { name: '確認重新開放' })).toHaveTextContent('重新開放後住戶可以再次下單與修改訂單')
    await user.click(screen.getByRole('button', { name: '確認重新開放' }))
    expect(onSetCampaignStatus).toHaveBeenCalledWith('open')
  })

  it('marks a draft and keeps order and pickup sections unavailable until publishing', () => {
    renderRail({
      campaign: { ...openCampaign, published: false, openedAt: null, orderCount: null, residentHref: null, coverImage: null },
      section: 'content',
      onSetCampaignStatus: vi.fn(),
    })

    expect(screen.getByText('草稿')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '結單' })).not.toBeInTheDocument()
    expect(screen.getByText('尚未發布')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '一涼製冰所 超厚三明治冰餅尚未設定圖片' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /訂單/ })).not.toBeInTheDocument()
    expect(screen.getAllByText('發布後可用')).toHaveLength(2)
    expect(screen.getByRole('link', { name: '內容設定' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('button', { name: /複製住戶連結/ })).not.toBeInTheDocument()
  })

  it('copies and opens the resident page link', async () => {
    const user = userEvent.setup()
    const onCopyResidentLink = vi.fn().mockResolvedValue(undefined)
    renderRail({ onCopyResidentLink })

    await user.click(screen.getByRole('button', { name: '複製住戶連結 一涼製冰所 超厚三明治冰餅' }))
    expect(onCopyResidentLink).toHaveBeenCalledWith('/campaign/0123456789abcdef0123456789abcdef0123')
    expect(await screen.findByRole('status')).toHaveTextContent('已複製住戶連結')
    const openLink = screen.getByRole('link', { name: '開啟住戶頁' })
    expect(openLink).toHaveAttribute('href', '/campaign/0123456789abcdef0123456789abcdef0123')
    expect(openLink).toHaveAttribute('target', '_blank')
  })
})

describe('CampaignWorkspace', () => {
  it('replaces a bare or unavailable section address with the section it shows', () => {
    const navigate = vi.fn()
    const { rerender } = render(
      <OrganizerNavigationProvider navigate={navigate}>
        <CampaignWorkspace campaign={openCampaign} requestedSection={null} section="orders" now={now}><p>分區內容</p></CampaignWorkspace>
      </OrganizerNavigationProvider>,
    )
    expect(navigate).toHaveBeenCalledWith('/admin/campaign/campaign-1/orders', { replace: true })
    expect(screen.getByRole('main')).toHaveTextContent('分區內容')

    navigate.mockClear()
    rerender(
      <OrganizerNavigationProvider navigate={navigate}>
        <CampaignWorkspace campaign={openCampaign} requestedSection="orders" section="orders" now={now}><p>分區內容</p></CampaignWorkspace>
      </OrganizerNavigationProvider>,
    )
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('PickupSection', () => {
  const handlers = {
    onPreview: vi.fn().mockResolvedValue({ previewToken: null, mentionableRecipients: [], unavailableRecipients: [], mentionableCount: 0, messageCount: 0 }),
    onCreateCommand: vi.fn(),
  }

  it('offers LINE pickup notifications only after closing a published campaign', () => {
    const { rerender } = render(<PickupSection campaignId="campaign-1" campaignTitle="神農包子" campaignStatus="open" published excludedOtherCount={0} {...handlers} />)
    expect(screen.getByText('結單後才能使用領取通知。')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'LINE領取通知' })).not.toBeInTheDocument()

    rerender(<PickupSection campaignId="campaign-1" campaignTitle="神農包子" campaignStatus="closed" published excludedOtherCount={0} {...handlers} />)
    expect(screen.getByRole('heading', { name: 'LINE領取通知' })).toBeInTheDocument()

    rerender(<PickupSection campaignId="campaign-1" campaignTitle="神農包子" campaignStatus="closed" published={false} excludedOtherCount={0} {...handlers} />)
    expect(screen.getByText('發布並結單後才能發送領取通知。')).toBeInTheDocument()
  })

  it('explains that the local demo cannot send LINE notifications', () => {
    render(<PickupSection campaignId="campaign-1" campaignTitle="神農包子" campaignStatus="closed" published excludedOtherCount={0} />)
    expect(screen.getByText('本機示範不提供LINE領取通知')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/components/organizer/organizerWorkspace.test.tsx`
Expected: FAIL（工作區模組不存在）。

- [ ] **Step 3: 實作 `src/components/organizer/workspaceSections.ts`**

```ts
import type { CampaignStatus } from '../../domain/orderWorkflow'
import type { WorkspaceSection } from '../../routing'

export type ShownSection = Exclude<WorkspaceSection, 'overview'>

// Phase 3 has no overview yet, so published campaigns open on their orders.
export function resolveWorkspaceSection(requested: WorkspaceSection | null, published: boolean): ShownSection {
  if (!published) return 'content'
  if (requested === null || requested === 'overview') return 'orders'
  return requested
}

export function sectionUnavailableReason(section: ShownSection, status: CampaignStatus, published: boolean): string | null {
  if (section === 'content') return null
  if (!published) return '發布後可用'
  if (section === 'pickup' && status === 'open') return '結單後才能使用'
  return null
}
```

- [ ] **Step 4: 實作 `src/components/organizer/WorkspaceRail.tsx`**

```tsx
import { useState } from 'react'
import { describeAutoClose, normalizeArrivalLabel } from '../../domain/campaignSchedule'
import { campaignStatusAction, campaignStatusLabel, type CampaignStatus } from '../../domain/orderWorkflow'
import { formatZhTwTimestamp } from '../../domain/timestamp'
import { campaignSectionPath } from '../../routing'
import type { CampaignImage } from '../../services/demoCampaignStore'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { FeedbackMessage } from '../ui/FeedbackMessage'
import { StatusBadge } from '../ui/StatusBadge'
import { copyResidentLink } from './copyResidentLink'
import { OrganizerLink } from './OrganizerLink'
import { sectionUnavailableReason, type ShownSection } from './workspaceSections'

export type WorkspaceCampaign = {
  id: string
  title: string
  status: CampaignStatus
  published: boolean
  coverImage: CampaignImage | null
  openedAt: string | null
  autoCloseAt?: string | null
  arrivalLabel?: string
  orderCount: number | null
  residentHref: string | null
}

type WorkspaceRailProps = {
  campaign: WorkspaceCampaign
  section: ShownSection
  now?: Date
  onSetCampaignStatus?: (status: CampaignStatus) => Promise<void>
  onCopyResidentLink?: (path: string) => Promise<void>
}

const STATUS_CONFIRMATIONS: Record<'open' | 'closed', { title: string; body: string; confirm: string }> = {
  closed: { title: '確認結單', body: '結單後住戶就不能再下單或修改訂單，之後仍可重新開放。', confirm: '確認結單' },
  open: { title: '確認重新開放', body: '重新開放後住戶可以再次下單與修改訂單。', confirm: '確認重新開放' },
}

const NAV_ITEMS: Array<{ section: ShownSection; label: string }> = [
  { section: 'orders', label: '訂單' },
  { section: 'content', label: '內容設定' },
  { section: 'pickup', label: '領取通知' },
]

export function WorkspaceRail({ campaign, section, now, onSetCampaignStatus, onCopyResidentLink }: WorkspaceRailProps) {
  const [confirming, setConfirming] = useState(false)
  const [changing, setChanging] = useState(false)
  const [statusError, setStatusError] = useState('')
  const [copyFeedback, setCopyFeedback] = useState('')
  const [copyError, setCopyError] = useState('')
  const action = campaignStatusAction(campaign.status)
  const confirmation = STATUS_CONFIRMATIONS[action.next === 'closed' ? 'closed' : 'open']
  const isOpen = campaign.status === 'open'
  const closing = describeAutoClose(campaign.autoCloseAt, now ?? new Date())
  const badge = !campaign.published
    ? { tone: 'warning' as const, label: '草稿' }
    : { tone: isOpen ? 'success' as const : 'neutral' as const, label: campaignStatusLabel(campaign.status) }

  const changeStatus = async () => {
    if (!onSetCampaignStatus || changing) return
    setChanging(true)
    setStatusError('')
    try {
      await onSetCampaignStatus(action.next)
      setConfirming(false)
    } catch (changeError) {
      setStatusError(changeError instanceof Error ? changeError.message : '更新團購狀態失敗')
    } finally {
      setChanging(false)
    }
  }

  const copyLink = async () => {
    if (!campaign.residentHref) return
    setCopyFeedback('')
    setCopyError('')
    try {
      await copyResidentLink(campaign.residentHref, onCopyResidentLink)
      setCopyFeedback('已複製住戶連結')
    } catch (copyFailure) {
      setCopyError(copyFailure instanceof Error ? copyFailure.message : '複製住戶連結失敗')
    }
  }

  return (
    <aside className="organizer-rail" aria-label="團購工作區">
      <OrganizerLink className="organizer-rail-back" href="/admin"><span aria-hidden="true">‹</span> 所有團購</OrganizerLink>
      <div className="organizer-rail-cover">
        {campaign.coverImage
          ? <img src={campaign.coverImage.src} alt={campaign.coverImage.alt} />
          : <span className="organizer-rail-cover-empty" role="img" aria-label={`${campaign.title}尚未設定圖片`}>尚未設定圖片</span>}
      </div>
      <h1 className="organizer-rail-title">{campaign.title}</h1>
      <div className="organizer-rail-status">
        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
        {campaign.published && onSetCampaignStatus && (
          <Button variant="secondary" size="sm" onClick={() => { setStatusError(''); setConfirming(true) }}>{action.label}</Button>
        )}
      </div>
      <dl className="organizer-rail-facts">
        {isOpen && <div><dt>結單</dt><dd>{closing ? closing.when : '未設定'}</dd></div>}
        <div><dt>到貨</dt><dd>{normalizeArrivalLabel(campaign.arrivalLabel)}</dd></div>
        <div><dt>開團</dt><dd>{campaign.openedAt ? formatZhTwTimestamp(campaign.openedAt) : '尚未發布'}</dd></div>
      </dl>
      <nav className="organizer-rail-nav" aria-label="團購分區">
        {NAV_ITEMS.map((item) => {
          const reason = sectionUnavailableReason(item.section, campaign.status, campaign.published)
          if (reason) {
            return (
              <span key={item.section} className="organizer-rail-link" aria-disabled="true">
                {item.label}<small>{reason}</small>
              </span>
            )
          }
          const count = item.section === 'orders' ? campaign.orderCount : null
          return (
            <OrganizerLink
              key={item.section}
              className="organizer-rail-link"
              href={campaignSectionPath(campaign.id, item.section)}
              aria-current={section === item.section ? 'page' : undefined}
            >
              {item.label}{count !== null && <>{' '}<span className="ui-num">{count}</span></>}
            </OrganizerLink>
          )
        })}
      </nav>
      {campaign.residentHref && (
        <div className="organizer-rail-share">
          <span>住戶連結</span>
          <Button variant="utility" size="sm" aria-label={`複製住戶連結 ${campaign.title}`} onClick={() => { void copyLink() }}>複製</Button>
          <a href={campaign.residentHref} target="_blank" rel="noreferrer">開啟住戶頁<span aria-hidden="true"> ↗</span></a>
        </div>
      )}
      {copyFeedback && <FeedbackMessage tone="success">{copyFeedback}</FeedbackMessage>}
      {copyError && <FeedbackMessage tone="error">{copyError}</FeedbackMessage>}
      {confirming && (
        <ConfirmDialog
          title={confirmation.title}
          confirmLabel={confirmation.confirm}
          destructive={false}
          busy={changing}
          onCancel={() => setConfirming(false)}
          onConfirm={() => { void changeStatus() }}
        >
          <p>{confirmation.body}</p>
          {statusError && <FeedbackMessage tone="error">{statusError}</FeedbackMessage>}
        </ConfirmDialog>
      )}
    </aside>
  )
}
```

- [ ] **Step 5: 實作 `src/components/organizer/CampaignWorkspace.tsx`**

```tsx
import { useEffect, type ReactNode } from 'react'
import type { CampaignStatus } from '../../domain/orderWorkflow'
import { campaignSectionPath, type WorkspaceSection } from '../../routing'
import { useOrganizerNavigate } from './organizerNavigation'
import { WorkspaceRail, type WorkspaceCampaign } from './WorkspaceRail'
import type { ShownSection } from './workspaceSections'

type CampaignWorkspaceProps = {
  campaign: WorkspaceCampaign
  requestedSection: WorkspaceSection | null
  section: ShownSection
  now?: Date
  onSetCampaignStatus?: (status: CampaignStatus) => Promise<void>
  onCopyResidentLink?: (path: string) => Promise<void>
  children: ReactNode
}

export function CampaignWorkspace({ campaign, requestedSection, section, now, onSetCampaignStatus, onCopyResidentLink, children }: CampaignWorkspaceProps) {
  const navigate = useOrganizerNavigate()

  useEffect(() => {
    // Replace, not push: Back must not return to an address that redirects again.
    if (requestedSection !== section) navigate(campaignSectionPath(campaign.id, section), { replace: true })
  }, [campaign.id, navigate, requestedSection, section])

  return (
    <div className="organizer-workspace">
      <WorkspaceRail campaign={campaign} section={section} now={now} onSetCampaignStatus={onSetCampaignStatus} onCopyResidentLink={onCopyResidentLink} />
      <main className="organizer-workspace-main">{children}</main>
    </div>
  )
}
```

- [ ] **Step 6: 實作 `src/components/organizer/PickupSection.tsx`**

```tsx
import type { CampaignStatus } from '../../domain/orderWorkflow'
import type { PickupNotificationAudience } from '../../domain/pickupNotification'
import PickupNotificationPanel from '../../PickupNotificationPanel'
import type { PickupNotificationCommand, PickupNotificationResponse } from '../../services/pickupNotificationGateway'
import { EmptyState } from '../ui/AsyncState'

type PickupSectionProps = {
  campaignId: string
  campaignTitle: string
  campaignStatus: CampaignStatus
  published: boolean
  excludedOtherCount: number
  onPreview?: (audience: PickupNotificationAudience, message: string) => Promise<PickupNotificationResponse>
  onCreateCommand?: (audience: PickupNotificationAudience, message: string, previewToken: string) => Promise<PickupNotificationCommand>
}

export function PickupSection({ campaignId, campaignTitle, campaignStatus, published, excludedOtherCount, onPreview, onCreateCommand }: PickupSectionProps) {
  return (
    <section className="organizer-section" aria-labelledby="pickup-section-heading">
      <h2 id="pickup-section-heading">領取通知</h2>
      {!published ? (
        <p className="organizer-muted">發布並結單後才能發送領取通知。</p>
      ) : campaignStatus === 'open' ? (
        <p className="organizer-muted">結單後才能使用領取通知。</p>
      ) : onPreview && onCreateCommand ? (
        <PickupNotificationPanel
          campaignId={campaignId}
          campaignTitle={campaignTitle}
          campaignStatus={campaignStatus}
          excludedOtherCount={excludedOtherCount}
          onPreview={onPreview}
          onCreateCommand={onCreateCommand}
        />
      ) : (
        <EmptyState title="本機示範不提供LINE領取通知" description="連接 Supabase 的團主後台才能產生領取通知指令。" />
      )}
    </section>
  )
}
```

- [ ] **Step 7: 在 `organizer.css` 檔尾加入工作區樣式**

```css
/* Campaign workspace: left rail + main column; below 1024px the rail becomes a top bar with scrolling section tabs. */
.organizer-workspace { display: grid; grid-template-columns: 240px minmax(0, 1fr); align-items: start; width: min(100%, 1440px); margin: 0 auto; }
.organizer-rail { position: sticky; top: 52px; display: flex; flex-direction: column; gap: var(--space-3); min-height: calc(100vh - 52px); max-height: calc(100vh - 52px); overflow-y: auto; padding: var(--space-4); border-right: 1px solid var(--color-divider); background: var(--color-surface); }
.organizer-rail-back { display: inline-flex; align-items: center; gap: var(--space-1); min-height: 24px; color: var(--color-primary); font-weight: var(--font-weight-strong); text-decoration: none; }
.organizer-rail-cover { overflow: hidden; aspect-ratio: 4 / 3; border-radius: var(--radius-control); background: var(--color-surface-subtle); }
.organizer-rail-cover img { display: block; width: 100%; height: 100%; object-fit: cover; }
.organizer-rail-cover-empty { display: grid; place-items: center; height: 100%; color: var(--color-text-secondary); font-size: var(--font-size-caption); }
.organizer-rail-title { margin: 0; font-size: 17px; font-weight: var(--font-weight-strong); line-height: var(--line-height-heading); overflow-wrap: anywhere; }
.organizer-rail-status { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.organizer-rail-facts { display: grid; gap: var(--space-1); margin: 0; }
.organizer-rail-facts div { display: flex; gap: var(--space-2); }
.organizer-rail-facts dt { min-width: 2.5em; color: var(--color-text-secondary); }
.organizer-rail-facts dd { margin: 0; }
.organizer-rail-nav { display: grid; gap: 2px; }
.organizer-rail-link { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); min-height: 36px; padding: 0 var(--space-3); border-radius: var(--radius-control); color: var(--color-text); text-decoration: none; }
.organizer-rail-link[aria-current="page"] { background: var(--color-primary-subtle); color: var(--color-primary); font-weight: var(--font-weight-strong); }
.organizer-rail-link[aria-disabled="true"] { color: var(--color-disabled-text); cursor: not-allowed; }
.organizer-rail-link small { font-size: var(--font-size-caption); }
.organizer-rail-share { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin-top: auto; padding-top: var(--space-3); border-top: 1px solid var(--color-divider); }
.organizer-rail-share a { color: var(--color-primary); }
.organizer-workspace-main { min-width: 0; padding: var(--space-5) var(--space-6) var(--space-10); }
.organizer-workspace-main .admin-shell { min-height: 0; max-width: none; margin: 0; padding: 0; }
.organizer-section h2 { margin: 0 0 var(--space-3); font-size: var(--font-size-title); font-weight: var(--font-weight-strong); }

@media (hover: hover) {
  .organizer-rail-link:not([aria-disabled="true"]):not([aria-current="page"]):hover { background: var(--color-fill-hover); }
}

@media (max-width: 1023px) {
  .organizer-workspace { grid-template-columns: minmax(0, 1fr); }
  .organizer-rail { position: static; gap: var(--space-2); min-height: 0; max-height: none; overflow: visible; padding: var(--space-3) var(--space-4); border-right: 0; border-bottom: 1px solid var(--color-divider); }
  .organizer-rail-cover, .organizer-rail-facts { display: none; }
  .organizer-rail-nav { display: flex; gap: var(--space-1); overflow-x: auto; }
  .organizer-rail-link { flex: none; min-height: var(--touch-target); }
  .organizer-rail-back, .organizer-rail-share a { min-height: var(--touch-target); }
  .organizer-rail-share { margin-top: 0; }
  .organizer-workspace-main { padding: var(--space-4) var(--space-4) var(--space-8); }
}
```

- [ ] **Step 8: 確認通過**

Run: `npx vitest run src/components/organizer` → PASS。
Run: `npx tsc -b` 與 `npm run lint` → 無錯誤、無警告。
Run: `npx vitest run` → 全部通過（本 Task 沒有改動既有檔案）。

- [ ] **Step 9: Commit**

```bash
git add src/components/organizer
git commit -m "feat: add the campaign workspace rail and pickup section"
```

---

### Task 8: 接線：編輯器改為分區顯示、live 與 Demo 的各頁、刪除舊首頁

**Files:**
- Modify: `src/AdminApp.tsx`、`src/AdminApp.test.tsx`
- Modify: `src/AdminOrdersPanel.tsx`、`src/AdminOrdersPanel.test.tsx`
- Modify: `src/LocalLiveApps.tsx`、`src/LocalLiveApps.test.tsx`
- Modify: `src/RuntimeApp.tsx`、`src/RuntimeApp.test.tsx`
- Modify: `src/main.tsx`
- Delete: `src/CampaignListApp.tsx`、`src/CampaignListApp.css`、`src/CampaignListApp.test.tsx`

這些檔案要一起改：編輯器拿掉分頁、登出與結單後，live 與 Demo 必須同時改用工作區，完整測試才會通過。

**Interfaces:**
- `AdminApp` 的 props 變更：
  - 移除 `onSignOut`、`residentHref`、`campaignId`、`onSetCampaignStatus`、`onPreviewPickupNotification`、`onCreatePickupNotificationCommand`。
  - 新增 `section?: 'content' | 'orders' | null`（預設 `'content'`；`null` 兩區都隱藏，給領取通知分區用）。
  - 根元素由 `<main>` 改為 `<div>`（主要內容區由工作區提供）。
- `AdminOrdersPanel` 的 props 變更：移除 `campaignId`、`onSetCampaignStatus`、`onPreviewPickupNotification`、`onCreatePickupNotificationCommand`。
- `LocalLiveAdminApp` 新增三個 props：
  - `page?: 'home' | 'residents' | 'settings'`（預設 `'home'`）
  - `section?: WorkspaceSection | null`（預設 `null`）
  - `residentFilter?: ResidentFilter`（預設 `'all'`）
  - 原有 props 不變。
- `RuntimeApp` 新增 `search?: string`（預設 `''`）。
- 資料只依頁面載入：
  - 首頁：團購、住戶、通知設定（待處理提示要用）
  - 住戶頁：住戶
  - 設定頁：通知設定
  - 通知測試中心：團購與測試團標記

**測試去向：**

| 原測試 | 處理 |
|---|---|
| `AdminApp`「開團設定與訂單管理是互斥分頁」 | 改為 `section` 切換測試，並加驗切換後草稿仍在（Review Focus 1） |
| `AdminApp`「工作區分頁的鍵盤操作」 | **刪除**。分頁元件被左側欄連結取代，連結的鍵盤操作是瀏覽器原生行為，不再需要自訂的方向鍵切換。 |
| `AdminApp` 匯出 Excel、取消訂單 | 改用 `section="orders"`，不點分頁 |
| `AdminOrdersPanel` 領取通知只在結單後出現 | 由 Task 7 的 `PickupSection` 測試驗證 |
| `AdminOrdersPanel` 只有開團／結單兩種狀態、`arrived` 顯示已結單 | 由 Task 7 的左側欄 arrived 測試驗證 |
| `AdminOrdersPanel` 付款確認與備註測試中的結單點擊 | 結單由 Task 7 的左側欄測試驗證（多了確認視窗）；付款與備註斷言不動 |
| `LocalLiveApps` 編輯器的「登出」 | 改在設定頁操作，登出流程的斷言不動 |
| `LocalLiveApps` 訂單分頁、結單 | 改用 `section` 與左側欄的結單確認 |

- [ ] **Step 1: 修改 `AdminApp` 與 `AdminOrdersPanel` 的測試**

`src/AdminApp.test.tsx`：

1. 整個 `separates campaign settings and order management into exclusive tabs` 換成：
   ```tsx
     it('shows only the section chosen by the workspace and keeps the draft while switching', async () => {
       const user = userEvent.setup()
       const { rerender } = render(<AdminApp section="content" />)
       const title = screen.getByRole('textbox', { name: '團購標題' })
       await user.clear(title)
       await user.type(title, '切換前的新標題')
       expect(screen.queryByRole('heading', { name: '訂單統計' })).not.toBeInTheDocument()

       rerender(<AdminApp section="orders" />)
       expect(screen.getByRole('heading', { name: '訂單統計' })).toBeInTheDocument()
       expect(screen.queryByRole('textbox', { name: '團購標題' })).not.toBeInTheDocument()

       rerender(<AdminApp section={null} />)
       expect(screen.queryByRole('heading', { name: '訂單統計' })).not.toBeInTheDocument()
       expect(screen.queryByRole('textbox', { name: '團購標題' })).not.toBeInTheDocument()

       rerender(<AdminApp section="content" />)
       expect(screen.getByRole('textbox', { name: '團購標題' })).toHaveValue('切換前的新標題')
       expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
       expect(screen.queryByRole('button', { name: '登出' })).not.toBeInTheDocument()
     })
   ```
2. 刪除整個 `supports keyboard navigation between organizer workspace tabs` 測試。理由見上方表格。
3. `uses the loaded campaign title for Excel export without a duplicate title prop`：
   - render 改為 `render(<AdminApp campaignStatus="closed" section="orders" />)`。
   - 刪除點「訂單管理」分頁那一行。
4. `lets organizers cancel a resident order from the orders workspace`：
   - render 改為 `render(<AdminApp campaignStatus="open" section="orders" onCancelOrder={onCancelOrder} />)`。
   - 刪除點分頁那一行。
5. 若其他測試還有 `getByRole('tab', …)`：
   - 改成在 render 加 `section="orders"`，並刪除點分頁的那一行。
   - 若 `userEvent.setup()` 因此不再使用，一併刪除。

`src/AdminOrdersPanel.test.tsx`：

1. 刪除整個 `offers LINE pickup notification actions only for a closed live campaign`（改由 `PickupSection` 測試驗證）。
2. 刪除整個 `uses only open and closed organizer workflow states while preserving legacy arrived data`（改由 `WorkspaceRail` 的 arrived 測試驗證）。
3. `requires confirmation before changing payment and saves an organizer note explicitly`：
   - 刪除 `const onSetCampaignStatus = …` 與 render 的 `onSetCampaignStatus={onSetCampaignStatus}`。
   - 刪除這三行（結單改由 `WorkspaceRail` 測試驗證）：
     ```tsx
     expect(screen.getByText('開團中')).toBeInTheDocument()
     await user.click(screen.getByRole('button', { name: '結單' }))
     expect(onSetCampaignStatus).toHaveBeenCalledWith('closed')
     ```
4. 新增一個測試，確認結單鈕確實搬走了：
   ```tsx
     it('leaves campaign status changes to the workspace rail', () => {
       render(<AdminOrdersPanel summary={summary} campaignStatus="open" />)
       expect(screen.queryByRole('button', { name: '結單' })).not.toBeInTheDocument()
       expect(screen.queryByRole('heading', { name: 'LINE領取通知' })).not.toBeInTheDocument()
     })
   ```

- [ ] **Step 2: 改寫 `LocalLiveApps.test.tsx` 的團主端測試**

1. 在 `ordersRepository` 之後新增：
   ```tsx
   const settingsRepository = (): LiveAutoCloseNotificationSettingsRepository => ({
     getState: vi.fn().mockResolvedValue('current_user'),
     selectCurrentUser: vi.fn().mockResolvedValue(undefined),
   })
   ```
   若 `LiveAutoCloseNotificationSettingsRepository` 尚未匯入，從 `./LocalLiveApps` 的型別 import 補上。
2. **編輯器測試：** 每一個 `<LocalLiveAdminApp` 有 `campaignId=` 的 render，加上 `section="content"`。第 3、4、5 點列出的測試例外。
3. **付款與取消訂單測試：** 原本等「團購標題」再點「訂單管理」分頁的兩個測試（`uses the published threshold for the organizer order summary while a different draft is pending`、`cancels a resident order through the live organizer gateway and reloads the summary`）：
   - render 改加 `section="orders"`。
   - `await screen.findByRole('textbox', { name: '團購標題' })` 改成 `await screen.findByRole('heading', { name: '訂單統計' })`。
   - 刪除點分頁那一行。
4. **結單測試：** `requires organizer login before loading the remote editor`：
   - 保留 `section="content"` 與原本對標題欄位內容的斷言。
   - 把點「訂單管理」分頁與點「結單」這兩行換成：
     ```tsx
     await user.click(screen.getByRole('button', { name: '結單' }))
     await user.click(screen.getByRole('button', { name: '確認結單' }))
     ```
   - 後面對 `setCampaignStatus` 的斷言不動。
5. **登出測試：** 所有點 `button 登出` 的測試（`clears the organizer UI before a direct sign-out request finishes` 等八個）：
   - render（含 `rerender`）的 `campaignId="campaign-1"` 改為 `page="settings"`，並加上 `autoCloseNotificationSettingsRepository={settingsRepository()}`。
   - `repository`、`ordersRepository` 若有可保留。
   - 等待的 `await screen.findByRole('textbox', { name: '團購標題' })` 改為 `await screen.findByRole('heading', { level: 1, name: '設定' })`。
   - 其餘斷言不動，登出流程的每個驗證都保留。
6. **首頁測試：** `shows the campaign list after organizer authentication when no campaign is selected`（目前等 `團主工作台` 標題、點「住戶與戶號 1」）：
   - `findByRole('heading', { name: '團主工作台' })` 改為 `findByRole('heading', { level: 1, name: '團購' })`。
   - `getByRole('heading', { name: '歷史冰餅團' })` 改為 `getByRole('link', { name: '歷史冰餅團' })`。
   - 刪除點「住戶與戶號 1」及其後兩行（住戶頁改由下一個新測試驗證）。
7. 在團主端 `describe` 內新增三個測試：
   ```tsx
     it('loads only resident members on the residents page and opens the linked filter', async () => {
       const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
       const { client } = authClient(session)
       const managementRepository: LiveCampaignManagementRepository = { list: vi.fn(), create: vi.fn(), delete: vi.fn() }
       const residentMemberRepository: LiveResidentMemberRepository = {
         list: vi.fn().mockResolvedValue([
           { memberCode: 'abcdef0123456789abcdef0123456789abcd', displayName: '住戶甲', pictureUrl: null, period: 2, unit: '2K13', joinedAt: '2026-08-14T00:00:00Z', blocked: false, blockedAt: null },
           { memberCode: '0123456789abcdef0123456789abcdef0123', displayName: '住戶丁', pictureUrl: null, period: null, unit: null, joinedAt: '2026-08-15T00:00:00Z', blocked: false, blockedAt: null },
         ]),
         setBlocked: vi.fn(),
         updateHousehold: vi.fn(),
       }

       render(<LocalLiveAdminApp client={client} page="residents" residentFilter="unbound" managementRepository={managementRepository} residentMemberRepository={residentMemberRepository} />)

       expect(await screen.findByRole('heading', { level: 1, name: '住戶 2 位' })).toBeInTheDocument()
       expect(screen.getByRole('radio', { name: '未填戶號 1' })).toBeChecked()
       expect(screen.getByRole('article', { name: '住戶丁' })).toBeInTheDocument()
       expect(screen.getByRole('link', { name: '住戶' })).toHaveAttribute('aria-current', 'page')
       expect(managementRepository.list).not.toHaveBeenCalled()
     })

     it('keeps unsaved content edits while switching workspace sections', async () => {
       const user = userEvent.setup()
       const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
       const { client } = authClient(session)
       const repository: LiveAdminRepository = {
         loadPublished: vi.fn().mockResolvedValue(published),
         loadOptionalDraft: vi.fn().mockResolvedValue(null),
         saveDraft: vi.fn(() => new Promise<CampaignContent>(() => {})),
         publish: vi.fn(),
       }
       const props = { client, campaignId: 'campaign-1', repository, ordersRepository: ordersRepository() }
       const { rerender } = render(<LocalLiveAdminApp {...props} section="content" />)

       const title = await screen.findByRole('textbox', { name: '團購標題' })
       await user.clear(title)
       await user.type(title, '切換分區前的標題')
       rerender(<LocalLiveAdminApp {...props} section="orders" />)
       expect(screen.getByRole('heading', { name: '訂單統計' })).toBeInTheDocument()
       rerender(<LocalLiveAdminApp {...props} section="content" />)

       expect(screen.getByRole('textbox', { name: '團購標題' })).toHaveValue('切換分區前的標題')
     })

     it('loads the next campaign instead of showing the previous draft when the campaign changes', async () => {
       const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
       const { client } = authClient(session)
       const repository: LiveAdminRepository = {
         loadPublished: vi.fn(async (id: string) => ({ ...published, title: id === 'campaign-1' ? '第一團' : '第二團' })),
         loadOptionalDraft: vi.fn().mockResolvedValue(null),
         saveDraft: vi.fn(),
         publish: vi.fn(),
       }
       const props = { client, repository, ordersRepository: ordersRepository(), section: 'content' as const }
       const { rerender } = render(<LocalLiveAdminApp {...props} campaignId="campaign-1" />)
       expect(await screen.findByRole('textbox', { name: '團購標題' })).toHaveValue('第一團')

       rerender(<LocalLiveAdminApp {...props} campaignId="campaign-2" />)

       expect(await screen.findByRole('textbox', { name: '團購標題' })).toHaveValue('第二團')
       const rail = screen.getByRole('complementary', { name: '團購工作區' })
       expect(within(rail).getByRole('heading', { level: 1, name: '第二團' })).toBeInTheDocument()
     })
   ```
   若 `LiveAdminRepository`、`CampaignContent`、`LiveCampaignManagementRepository`、`LiveResidentMemberRepository` 尚未匯入，補上型別 import。

- [ ] **Step 3: 改寫 `RuntimeApp.test.tsx`**

1. `vi.mock('./LocalLiveApps', …)` 裡的 `LocalLiveAdminApp` 換成：
   ```tsx
     LocalLiveAdminApp: ({ campaignId, section, page, residentFilter, liffId, liffClient, notificationLab }: { campaignId?: string; section?: string | null; page?: string; residentFilter?: string; liffId?: string; liffClient?: unknown; notificationLab?: boolean }) => notificationLab
       ? <div>supabase-admin:notification-lab</div>
       : (
         <div>supabase-admin:{campaignId ? `${campaignId}/${section ?? 'default'}` : `${page}/${residentFilter ?? 'all'}`}:{liffId ?? 'no-liff'}:{liffClient ? 'client' : 'no-client'}</div>
       ),
   ```
2. `injects LIFF only into the production organizer app` 的預期文字改為 `supabase-admin:home/all:2011099887-PlmOrmYw:client`。
3. `connects the admin list and editor to the Supabase-backed app` 改為：
   ```tsx
     it('connects every organizer page and workspace section to the Supabase-backed app', () => {
       const { rerender } = render(<RuntimeApp config={liveConfig} pathname="/admin" client={stableClient} />)
       expect(screen.getByText('supabase-admin:home/all:no-liff:no-client')).toBeInTheDocument()

       rerender(<RuntimeApp config={liveConfig} pathname="/admin/residents" search="?filter=unbound" client={stableClient} />)
       expect(screen.getByText('supabase-admin:residents/unbound:no-liff:no-client')).toBeInTheDocument()

       rerender(<RuntimeApp config={liveConfig} pathname="/admin/settings" client={stableClient} />)
       expect(screen.getByText('supabase-admin:settings/all:no-liff:no-client')).toBeInTheDocument()

       rerender(<RuntimeApp config={liveConfig} pathname="/admin/campaign/8d2f0f6a-1111-4222-8333-123456789abc" client={stableClient} />)
       expect(screen.getByText('supabase-admin:8d2f0f6a-1111-4222-8333-123456789abc/default:no-liff:no-client')).toBeInTheDocument()

       rerender(<RuntimeApp config={liveConfig} pathname="/admin/campaign/8d2f0f6a-1111-4222-8333-123456789abc/pickup" client={stableClient} />)
       expect(screen.getByText('supabase-admin:8d2f0f6a-1111-4222-8333-123456789abc/pickup:no-liff:no-client')).toBeInTheDocument()
     })
   ```
4. `RuntimeApp localStorage organizer demo routing` 的測試整個換成下面內容，並在該 `describe` 加 `afterEach(() => { window.history.replaceState(null, '', '/') })`（`afterEach` 從 vitest 匯入；`waitFor` 從 Testing Library 匯入）：
   ```tsx
     it('moves from the organizer home into a campaign workspace and back without reloading', async () => {
       const user = userEvent.setup()
       const config = { mode: 'demo' as const }
       const campaignId = '01234567-89ab-cdef-0123-456789abcdef'
       render(<RuntimeApp config={config} pathname="/admin" />)

       expect(screen.getByRole('heading', { level: 1, name: '團購' })).toBeInTheDocument()
       await user.click(screen.getByRole('link', { name: '一涼製冰所 超厚三明治冰餅' }))

       await waitFor(() => expect(window.location.pathname).toBe(`/admin/campaign/${campaignId}/orders`))
       expect(screen.getByRole('heading', { name: '訂單統計' })).toBeInTheDocument()
       await user.click(screen.getByRole('button', { name: '標記 H11 已付款' }))
       await user.click(screen.getByRole('button', { name: '確認標記已付款' }))
       expect(await screen.findByRole('button', { name: '標記 H11 未付款' })).toBeInTheDocument()

       await user.click(screen.getByRole('link', { name: '內容設定' }))
       expect(window.location.pathname).toBe(`/admin/campaign/${campaignId}/content`)
       expect(screen.getByRole('textbox', { name: '團購標題' })).toBeInTheDocument()

       await user.click(screen.getByRole('link', { name: '所有團購' }))
       expect(screen.getByRole('heading', { level: 1, name: '團購' })).toBeInTheDocument()
     })

     it('opens the demo residents and settings pages', () => {
       const config = { mode: 'demo' as const }
       const { rerender } = render(<RuntimeApp config={config} pathname="/admin/residents" />)
       expect(screen.getByRole('heading', { level: 1, name: '住戶 1 位' })).toBeInTheDocument()

       rerender(<RuntimeApp config={config} pathname="/admin/settings" />)
       expect(screen.getByRole('heading', { level: 1, name: '設定' })).toBeInTheDocument()
     })
   ```

- [ ] **Step 4: 確認測試失敗**

Run: `npx vitest run src/AdminApp.test.tsx src/AdminOrdersPanel.test.tsx src/LocalLiveApps.test.tsx src/RuntimeApp.test.tsx`
Expected：FAIL：
- `AdminApp` 沒有 `section` 屬性，仍顯示分頁與登出；訂單面板仍有結單鈕。
- `page`、`section`、`search` 尚未接上。
- 首頁仍是舊的「團主工作台」。

- [ ] **Step 5: 修改 `src/AdminOrdersPanel.tsx`**

1. props 型別與解構移除 `campaignId`、`onSetCampaignStatus`、`onPreviewPickupNotification`、`onCreatePickupNotificationCommand`。
2. 刪除 `const statusAction = …`。
3. `{campaignStatus && (<div className="admin-workflow-bar">…</div>)}` 整塊換成只保留匯出鈕（活動狀態改由左側欄顯示）：
   ```tsx
         {exportVisible && (
           <div className="admin-workflow-bar">
             <div className="admin-workflow-actions">
               <button
                 type="button"
                 className="workflow-action workflow-action-export"
                 aria-label="匯出成團明細"
                 disabled={!hasExportRows || busyKeys.has('export')}
                 title={!hasExportRows ? '目前沒有可匯出的訂單' : undefined}
                 onClick={() => run('export', exportOrders)}
               >
                 <span className="workflow-action-icon" aria-hidden="true">↓</span>
                 {busyKeys.has('export') ? '建立Excel中…' : '匯出成團明細'}
               </button>
             </div>
           </div>
         )}
   ```
4. 刪除 `{campaignStatus && campaignId && campaignTitle && onPreviewPickupNotification && onCreatePickupNotificationCommand && (<PickupNotificationPanel … />)}` 整塊。
5. 刪除變成未使用的 import：`PickupNotificationPanel`、pickup 相關型別、`campaignStatusAction`；`campaignStatusLabel` 若不再使用也刪除。

- [ ] **Step 6: 修改 `src/AdminApp.tsx`**

1. props 型別：
   - 刪除 `onSignOut`、`campaignId`、`onSetCampaignStatus`、`onPreviewPickupNotification`、`onCreatePickupNotificationCommand`、`residentHref`。
   - 新增 `section?: 'content' | 'orders' | null`。
2. 解構：刪除同樣六項，新增 `section = 'content',`。
3. 刪除第 7、8 行的 pickup 型別 import。`react` import 移除 `type KeyboardEvent`。
4. 刪除以下狀態與函式：
   - `const settingsTabRef = …`、`const ordersTabRef = …`
   - `const [activeWorkspace, setActiveWorkspace] = …`
   - `const signOut = async () => { … }`
   - `const handleWorkspaceTabKeyDown = … { … }`
5. `busyAction` 的型別由 `'publish' | 'signout' | null` 改為 `'publish' | null`。
6. 在 `return (` 之後：
   - 把 `<main className="admin-shell">` 開頭，一直到 `</div>`（`role="tablist"` 那一段結束）為止的標題列與分頁，換成 `<div className="admin-shell">`。
   - 內容設定區塊的開頭 `<section id="admin-settings-panel" role="tabpanel" aria-labelledby="admin-settings-tab" hidden={activeWorkspace !== 'settings'}>` 換成：
     ```tsx
     <section id="admin-settings-panel" aria-label="內容設定" hidden={section !== 'content'}>
     ```
   - 訂單區塊的開頭 `<section id="admin-orders-panel" role="tabpanel" aria-labelledby="admin-orders-tab" hidden={activeWorkspace !== 'orders'}>` 換成：
     ```tsx
     <section id="admin-orders-panel" aria-label="訂單" hidden={section !== 'orders'}>
     ```
   - 傳給 `AdminOrdersPanel` 的 props 刪除 `campaignId`、`onSetCampaignStatus`、`onPreviewPickupNotification`、`onCreatePickupNotificationCommand`。
   - 最外層結尾的 `</main>` 改為 `</div>`。
7. 若 `resolvedOrderSummary` 為空時的 `<div className="admin-orders-empty">` 內有 `<h2>訂單管理</h2>`，文字改為 `訂單`。其餘不動。

- [ ] **Step 7: 修改 `src/LocalLiveApps.tsx`**

1. **import：**
   - 刪除 `CampaignListApp`。
   - 新增：
     ```tsx
     import { CampaignWorkspace } from './components/organizer/CampaignWorkspace'
     import { OrganizerHome } from './components/organizer/OrganizerHome'
     import { OrganizerSettings } from './components/organizer/OrganizerSettings'
     import { OrganizerShell } from './components/organizer/OrganizerShell'
     import { PickupSection } from './components/organizer/PickupSection'
     import { isUnboundResident } from './components/organizer/residentView'
     import type { WorkspaceCampaign } from './components/organizer/WorkspaceRail'
     import { resolveWorkspaceSection } from './components/organizer/workspaceSections'
     import type { ResidentFilter, WorkspaceSection } from './routing'
     ```
   - 若 `ResidentMemberManagementApp` 尚未匯入，補上 `import ResidentMemberManagementApp from './ResidentMemberManagementApp'`。
2. **props：** `LocalLiveAdminApp` 的解構加 `page = 'home'`、`section = null`、`residentFilter = 'all'`。型別加：
   ```ts
   page?: 'home' | 'residents' | 'settings'
   section?: WorkspaceSection | null
   residentFilter?: ResidentFilter
   ```
3. **刪除：** `const activeCampaignManagementGateway = …` 與 `const activeResidentMemberGateway = …` 兩行。
   **新增：** 在 `const [content, setContent] = …` 下一行加上：
   ```tsx
   const [contentCampaignId, setContentCampaignId] = useState<string | null>(null)
   ```
   這個狀態記錄目前的草稿屬於哪一團。換團後、新資料載入前，React 會先用舊的 `content` 渲染一次；畫面只在它等於 `campaignId` 時才掛上編輯器，避免這一次渲染用 A 團內容掛載 B 團的編輯器。
4. **資料載入：** 從 `useEffect(() => {` 且第一段是 `if (!organizerUserId) {` 的那個 effect（結尾 deps 是 `[activeCampaignManagementGateway, activeResidentMemberGateway, campaignId, gateway, notificationLab, ordersGateway, organizerUserId]`）整個換成下面兩個 effect：
   ```tsx
     const listPage = campaignId ? null : notificationLab ? 'notification-lab' : page

     useEffect(() => {
       if (!organizerUserId) {
         setCampaigns(null)
         setTestCampaignIds(null)
         setResidentMembers(null)
         setAutoCloseNotificationState(null)
         return
       }
       if (!listPage) return
       let active = true
       setError('')
       const loaders: Record<'notification-lab' | 'home' | 'residents' | 'settings', () => Promise<void>> = {
         'notification-lab': async () => {
           const [items, markedIds] = await Promise.all([campaignManagementGateway.list(), testCampaignGatewayRef.current.list()])
           if (active) {
             setCampaigns(items)
             setTestCampaignIds(markedIds)
           }
         },
         residents: async () => {
           const members = await residentMemberGateway.list()
           if (active) setResidentMembers(members)
         },
         settings: async () => {
           const notificationState = await autoCloseNotificationSettingsGatewayRef.current.getState()
           if (active) setAutoCloseNotificationState(notificationState)
         },
         home: async () => {
           const [items, members, notificationState] = await Promise.all([
             campaignManagementGateway.list(),
             residentMemberGateway.list(),
             autoCloseNotificationSettingsGatewayRef.current.getState(),
           ])
           if (active) {
             setCampaigns(items)
             setResidentMembers(members)
             setAutoCloseNotificationState(notificationState)
           }
         },
       }
       loaders[listPage]().catch((loadError: unknown) => {
         if (active) setError(errorMessage(loadError))
       })
       return () => { active = false }
     }, [campaignManagementGateway, listPage, organizerUserId, residentMemberGateway])

     useEffect(() => {
       // Clear first so a new campaign never renders with the previous campaign's draft.
       setContentCampaignId(null)
       setContent(null)
       setPublishedContent(null)
       setOrderSummary(null)
       setCampaignStatus(null)
       setResidentSlug(null)
       if (!organizerUserId || !campaignId) return
       let active = true
       setError('')
       const publishedPromise = gateway.loadOptionalPublished
         ? gateway.loadOptionalPublished(campaignId)
         : gateway.loadPublished(campaignId)
       void Promise.all([
         publishedPromise,
         gateway.loadOptionalDraft(campaignId),
         ordersGateway.loadCampaignStatus(campaignId),
         gateway.loadResidentSlug?.(campaignId) ?? Promise.resolve(null),
       ]).then(async ([published, draft, status, loadedResidentSlug]) => {
         if (!active) return
         const baseContent = draft ?? published
         if (!baseContent) throw new Error('找不到團購草稿')
         const editableContent = draft ? { ...draft, openedAt: published?.openedAt ?? null } : baseContent
         const summary = published
           ? await ordersGateway.loadSummary(campaignId, published.threshold, published.thresholdKind, published.amountThreshold, published.quantityUnit)
           : null
         if (!active) return
         setContentCampaignId(campaignId)
         setContent(editableContent)
         setPublishedContent(published)
         setOrderSummary(summary)
         setCampaignStatus(status)
         setResidentSlug(loadedResidentSlug)
         setPublicationState(!published || (draft && !campaignContentEquals(editableContent, published)) ? 'draft' : 'published')
       }).catch((loadError: unknown) => {
         if (active) setError(errorMessage(loadError))
       })
       return () => { active = false }
     }, [campaignId, gateway, ordersGateway, organizerUserId])
   ```
5. **畫面：** 從登入畫面之後的 `if (error) return <LiveError message={error} />` 開始，到 `LocalLiveAdminApp` 函式結尾為止的內容，整段換成：
   ```tsx
     if (error) return <LiveError message={error} />

     const createCampaign = (title: string) => campaignManagementGateway.create(title)
     const signOut = async () => {
       authValidationGeneration.current += 1
       signInGeneration.current += 1
       authEventsBlocked.current = true
       validatedOrganizerId.current = null
       setError('')
       setSession(null)
       await signOutRemotely()
     }

     if (!campaignId) {
       if (notificationLab) {
         if (!campaigns || !testCampaignIds) return <LiveLoading label="載入通知測試中心…" />
         return (
           <OrganizerShell current="settings" onCreate={createCampaign}>
             <NotificationTestLab
               campaigns={campaigns}
               testCampaignIds={testCampaignIds}
               onSetTestCampaign={async (targetCampaignId, enabled) => {
                 await testCampaignGateway.setEnabled(targetCampaignId, enabled)
               }}
               onPreview={(targetCampaignId, audience, message) => pickupNotificationTestGateway.preview(targetCampaignId, audience, message)}
               onCreateCommand={(targetCampaignId, audience, message, previewToken) => pickupNotificationTestGateway.createCommand(targetCampaignId, audience, message, previewToken)}
             />
           </OrganizerShell>
         )
       }
       if (page === 'residents') {
         if (!residentMembers) return <LiveLoading label="載入住戶…" />
         return (
           <OrganizerShell current="residents" onCreate={createCampaign}>
             <ResidentMemberManagementApp
               members={residentMembers}
               initialFilter={residentFilter}
               onRefreshGroupStatuses={residentMemberGateway.refreshGroupStatuses
                 ? (memberCodes) => residentMemberGateway.refreshGroupStatuses!(memberCodes)
                 : undefined}
               onSetBlocked={async (memberCode, blocked) => {
                 await residentMemberGateway.setBlocked(memberCode, blocked)
                 setResidentMembers(await residentMemberGateway.list())
               }}
               onUpdateHousehold={async (memberCode, household) => {
                 await residentMemberGateway.updateHousehold(memberCode, household)
                 setResidentMembers(await residentMemberGateway.list())
               }}
             />
           </OrganizerShell>
         )
       }
       if (page === 'settings') {
         if (!autoCloseNotificationState) return <LiveLoading label="載入設定…" />
         return (
           <OrganizerShell current="settings" onCreate={createCampaign}>
             <OrganizerSettings
               autoCloseNotificationState={autoCloseNotificationState}
               onSelectCurrentUserForAutoCloseNotification={async () => {
                 await autoCloseNotificationSettingsGateway.selectCurrentUser()
                 setAutoCloseNotificationState(await autoCloseNotificationSettingsGateway.getState())
               }}
               onSignOut={signOut}
             />
           </OrganizerShell>
         )
       }
       if (!campaigns || !residentMembers || !autoCloseNotificationState) return <LiveLoading label="載入團購、住戶與通知設定…" />
       return (
         <OrganizerShell current="campaigns" onCreate={createCampaign}>
           <OrganizerHome
             campaigns={campaigns}
             autoCloseNotificationState={autoCloseNotificationState}
             unboundResidentCount={residentMembers.filter(isUnboundResident).length}
             onDelete={async (targetCampaignId) => {
               const result = await campaignManagementGateway.delete(targetCampaignId)
               setCampaigns((current) => current?.filter((campaign) => campaign.id !== targetCampaignId) ?? null)
               return result
             }}
           />
         </OrganizerShell>
       )
     }
     if (!content || !campaignStatus || contentCampaignId !== campaignId) return <LiveLoading label="載入團購草稿與訂單…" />

     const reloadOrderSummary = async () => {
       if (!publishedContent) return
       setOrderSummary(await ordersGateway.loadSummary(
         campaignId,
         publishedContent.threshold,
         publishedContent.thresholdKind,
         publishedContent.amountThreshold,
         publishedContent.quantityUnit,
       ))
     }
     const published = publishedContent !== null
     const shownSection = resolveWorkspaceSection(section, published)
     const workspaceCampaign: WorkspaceCampaign = {
       id: campaignId,
       title: content.title,
       status: campaignStatus,
       published,
       coverImage: content.images[0] ?? null,
       openedAt: publishedContent?.openedAt ?? null,
       autoCloseAt: content.autoCloseAt,
       arrivalLabel: content.arrivalLabel,
       orderCount: orderSummary?.orderCount ?? null,
       residentHref: residentSlug ? `/campaign/${residentSlug}` : null,
     }

     return (
       <OrganizerShell current="campaigns" onCreate={createCampaign}>
         <CampaignWorkspace
           key={campaignId}
           campaign={workspaceCampaign}
           requestedSection={section}
           section={shownSection}
           onSetCampaignStatus={async (status) => {
             await ordersGateway.setCampaignStatus(campaignId, status)
             setCampaignStatus(await ordersGateway.loadCampaignStatus(campaignId))
           }}
         >
           <AdminApp
             section={shownSection === 'pickup' ? null : shownSection}
             initialContent={content}
             initialPublicationState={publicationState}
             orderSummary={orderSummary}
             campaignStatus={campaignStatus}
             campaignTitle={content.title}
             onUploadImage={(file) => imageGateway.upload(campaignId, file)}
             onSetOrderPaid={async (orderId, paid) => {
               await ordersGateway.setOrderPaid(orderId, paid)
               await reloadOrderSummary()
             }}
             onSetOrderOrganizerNote={async (orderId, note) => {
               await ordersGateway.setOrderOrganizerNote(orderId, note)
               await reloadOrderSummary()
             }}
             onCancelOrder={async (orderId) => {
               await ordersGateway.cancelOrder(orderId)
               await reloadOrderSummary()
             }}
             onSaveDraft={async (nextContent) => {
               await gateway.saveDraft(campaignId, nextContent)
             }}
             onPublish={async (nextContent) => {
               await gateway.saveDraft(campaignId, nextContent)
               const nextPublished = await gateway.publish(campaignId)
               setContent(nextPublished)
               setPublishedContent(nextPublished)
               setResidentSlug(await gateway.loadResidentSlug?.(campaignId) ?? null)
               setOrderSummary(await ordersGateway.loadSummary(campaignId, nextPublished.threshold, nextPublished.thresholdKind, nextPublished.amountThreshold, nextPublished.quantityUnit))
               return nextPublished
             }}
           />
           {shownSection === 'pickup' && (
             <PickupSection
               campaignId={campaignId}
               campaignTitle={content.title}
               campaignStatus={campaignStatus}
               published={published}
               excludedOtherCount={orderSummary?.orderRows.filter((row) => row.householdKind === 'other').length ?? 0}
               onPreview={(audience, message) => pickupNotificationGateway.preview(campaignId, audience, message)}
               onCreateCommand={(audience, message, previewToken) => pickupNotificationGateway.createCommand(campaignId, audience, message, previewToken)}
             />
           )}
         </CampaignWorkspace>
       </OrganizerShell>
     )
   }
   ```

   注意：
   - `onPublish` 內的變數改名為 `nextPublished`，避免遮蔽外層的 `published`。
   - 發布後 `published` 變成 `true`；若目前是 `content`，`shownSection` 仍是 `content`（`requestedSection` 也是 `content`），不會跳走。

- [ ] **Step 8: 修改 `src/RuntimeApp.tsx`**

1. **import 新增：**
   ```tsx
   import { CampaignWorkspace } from './components/organizer/CampaignWorkspace'
   import { OrganizerHome } from './components/organizer/OrganizerHome'
   import { OrganizerNavigationProvider } from './components/organizer/OrganizerLink'
   import { useBrowserLocation } from './components/organizer/organizerNavigation'
   import { OrganizerSettings } from './components/organizer/OrganizerSettings'
   import { OrganizerShell } from './components/organizer/OrganizerShell'
   import { PickupSection } from './components/organizer/PickupSection'
   import { resolveWorkspaceSection } from './components/organizer/workspaceSections'
   import ResidentMemberManagementApp from './ResidentMemberManagementApp'
   import { parseResidentFilter, type WorkspaceSection } from './routing'
   ```
   `parseResidentFilter` 與既有的 `parseAppRoute`、`selectAppMode` 合併成同一行 import。
   刪除 `import CampaignListApp from './CampaignListApp'`。
2. **Demo 工作區：** `DemoOrganizerEditor` 改名並改寫為：
   ```tsx
   function DemoOrganizerWorkspace({ requestedSection }: { requestedSection: WorkspaceSection | null }) {
     const [campaignStatus, setCampaignStatus] = useState<CampaignStatus>('open')
     const [orders, setOrders] = useState<OrganizerVisibleOrder[]>(initialDemoOrganizerOrders)
     const orderSummary = buildOrganizerOrderSummary({ orders, items, threshold: campaign.threshold })
     const section = resolveWorkspaceSection(requestedSection, true)

     return (
       <CampaignWorkspace
         campaign={{
           id: DEMO_CAMPAIGN_ID,
           title: campaign.title,
           status: campaignStatus,
           published: true,
           coverImage: campaign.images[0] ?? null,
           openedAt: campaign.openedAt,
           orderCount: orders.length,
           residentHref: `/campaign/${DEMO_CAMPAIGN_SLUG}`,
         }}
         requestedSection={requestedSection}
         section={section}
         onSetCampaignStatus={async (status) => setCampaignStatus(status)}
       >
         <AdminApp
           section={section === 'pickup' ? null : section}
           orderSummary={orderSummary}
           campaignStatus={campaignStatus}
           onSetOrderPaid={async (orderId, paid) => {
             setOrders((current) => current.map((order) => order.orderId === orderId ? { ...order, paid } : order))
           }}
           onSetOrderOrganizerNote={async (orderId, organizerNote) => {
             setOrders((current) => current.map((order) => order.orderId === orderId ? { ...order, organizerNote } : order))
           }}
         />
         {section === 'pickup' && (
           <PickupSection campaignId={DEMO_CAMPAIGN_ID} campaignTitle={campaign.title} campaignStatus={campaignStatus} published excludedOtherCount={0} />
         )}
       </CampaignWorkspace>
     )
   }
   ```
3. **路由與網址狀態：**
   - 原本的 `export default function RuntimeApp({ config, pathname, client, liffClient }: RuntimeAppProps)` 改名為 `function RuntimeRoutes({ config, pathname, search, client, liffClient }: RuntimeAppProps & { search: string })`，函式內容保留，只改下面第 4、5 點提到的分支。
   - `RuntimeAppProps` 加 `search?: string`。
   - 新增：
   ```tsx
   export default function RuntimeApp({ config, pathname, search = '', client, liffClient }: RuntimeAppProps) {
     const [location, navigate] = useBrowserLocation({ pathname, search })
     const routes = <RuntimeRoutes config={config} pathname={location.pathname} search={location.search} client={client} liffClient={liffClient} />
     return selectAppMode(location.pathname) === 'admin'
       ? <OrganizerNavigationProvider navigate={navigate}>{routes}</OrganizerNavigationProvider>
       : routes
   }
   ```
4. **live 分支：** `RuntimeRoutes` 裡把 Task 1 暫時合併的 admin 分支、通知測試中心與 `admin-campaign` 分支，換成：
   ```tsx
       const adminProps = {
         client,
         liffId: config.mode === 'live' ? config.liffId : undefined,
         liffClient,
         authStorage: getBrowserAuthStorage(),
         logoutFallbackStorage: getBrowserSessionStorage(),
       }
       if (appRoute.kind === 'admin-list') return <LocalLiveAdminApp {...adminProps} page="home" />
       if (appRoute.kind === 'admin-residents') return <LocalLiveAdminApp {...adminProps} page="residents" residentFilter={parseResidentFilter(search)} />
       if (appRoute.kind === 'admin-settings') return <LocalLiveAdminApp {...adminProps} page="settings" />
       if (appRoute.kind === 'admin-notification-lab') return <LocalLiveAdminApp {...adminProps} notificationLab />
       if (appRoute.kind === 'admin-campaign') return <LocalLiveAdminApp {...adminProps} campaignId={appRoute.campaignId} section={appRoute.section} />
   ```
   所有團主頁都回傳同一種元素 `LocalLiveAdminApp`、位置相同，所以換頁時 React 沿用同一個實例，不會重新驗證登入。
5. **localStorage Demo 分支：** 把 Task 1 暫時合併的 admin 分支與 `admin-campaign` 分支換成：
   ```tsx
     const createDemoCampaign = async () => ({ id: DEMO_CAMPAIGN_ID })
     if (appRoute.kind === 'admin-list') {
       return (
         <OrganizerShell current="campaigns" onCreate={createDemoCampaign}>
           <OrganizerHome campaigns={[demoOrganizerCampaign]} autoCloseNotificationState="current_user" unboundResidentCount={0} />
         </OrganizerShell>
       )
     }
     if (appRoute.kind === 'admin-residents') {
       return (
         <OrganizerShell current="residents" onCreate={createDemoCampaign}>
           <ResidentMemberManagementApp
             members={demoResidentMembers}
             initialFilter={parseResidentFilter(search)}
             onSetBlocked={async () => undefined}
             onUpdateHousehold={async () => undefined}
           />
         </OrganizerShell>
       )
     }
     if (appRoute.kind === 'admin-settings') {
       return (
         <OrganizerShell current="settings" onCreate={createDemoCampaign}>
           <OrganizerSettings autoCloseNotificationState="current_user" onSelectCurrentUserForAutoCloseNotification={async () => undefined} />
         </OrganizerShell>
       )
     }
     if (appRoute.kind === 'admin-campaign') {
       return (
         <OrganizerShell current="campaigns" onCreate={createDemoCampaign}>
           <DemoOrganizerWorkspace requestedSection={appRoute.section} />
         </OrganizerShell>
       )
     }
   ```
   Demo 的通知測試中心分支保留原本的 `EmptyState`，外面包上 `<OrganizerShell current="settings" onCreate={createDemoCampaign}>`。
   注意 `createDemoCampaign` 要宣告在第一個用到它的分支之前。

- [ ] **Step 9: 修改 `src/main.tsx`**

`<RuntimeApp …>` 加上 `search={window.location.search}`。

- [ ] **Step 10: 刪除舊首頁**

```bash
git rm src/CampaignListApp.tsx src/CampaignListApp.css src/CampaignListApp.test.tsx
```

確認沒有殘留的引用。下面的 grep 應該沒有任何輸出：

```bash
grep -rn "CampaignListApp" src
```

- [ ] **Step 11: 確認通過**

Run: `npx vitest run src/AdminApp.test.tsx src/AdminOrdersPanel.test.tsx src/PickupNotificationPanel.test.tsx src/LocalLiveApps.test.tsx src/RuntimeApp.test.tsx src/components/organizer` → PASS，輸出沒有 `Not implemented: navigation` 之類的警告。
Run: `npx tsc -b`、`npm run lint` → 無錯誤、無警告。
Run: `npx vitest run` → 全部通過。在回報中寫明測試檔與測試數量的變化，以及每個被刪除的測試由哪個測試接手。

- [ ] **Step 12: Commit**

```bash
git add src/AdminApp.tsx src/AdminApp.test.tsx src/AdminOrdersPanel.tsx src/AdminOrdersPanel.test.tsx src/LocalLiveApps.tsx src/LocalLiveApps.test.tsx src/RuntimeApp.tsx src/RuntimeApp.test.tsx src/main.tsx
git commit -m "feat: route organizer pages through the new shell and workspace"
```

---

### Task 9: 截圖腳本、文件與整體驗證

**Files:**
- Modify: `scripts/capture-pages.mjs`
- Modify: `docs/AI_AGENT_HANDOFF.md`、`README.md`
- 只在發現破版時修改 `src/components/organizer/organizer.css`、`src/ResidentMemberManagementApp.css` 或 `src/components/ui/ui.css`

- [ ] **Step 1: 更新截圖腳本**

在 `scripts/capture-pages.mjs`：

1. `pages` 換成：
   ```js
   const pages = [
     { name: 'resident-list', path: '/' },
     { name: 'resident-campaign', path: '/campaign/0123456789abcdef0123456789abcdef0123' },
     { name: 'admin-list', path: '/admin' },
     { name: 'admin-residents', path: '/admin/residents' },
     { name: 'admin-settings', path: '/admin/settings' },
     { name: 'admin-editor', path: '/admin/campaign/01234567-89ab-cdef-0123-456789abcdef/content' },
     { name: 'admin-orders', path: '/admin/campaign/01234567-89ab-cdef-0123-456789abcdef/orders' },
   ]
   ```
2. `if (page.click) { … }` 換成找不到元素就報錯的版本（第 1 階段遺留事項）：
   ```js
         if (page.click) {
           const clicked = await evaluate(`(() => {
             const element = document.querySelector(${JSON.stringify(page.click)})
             if (!element) return false
             element.click()
             return true
           })()`)
           if (!clicked) throw new Error(`${page.name}: click target ${page.click} not found`)
           await wait(300)
         }
   ```

- [ ] **Step 2: 更新文件的網址清單**

`docs/AI_AGENT_HANDOFF.md`〈路由與runtime模式〉中，`/admin` 與 `/admin/campaign/<uuid>` 兩行換成：

```markdown
- `/admin`：團主首頁（所有團購）。
- `/admin/residents`：住戶（`?filter=unbound|other|blocked` 開啟對應篩選）。
- `/admin/settings`：設定（自動結單通知、通知測試中心入口、登出）。
- `/admin/campaign/<uuid>/<分區>`：團購工作區；分區為 `orders`、`content`、`pickup`（`overview` 於第 4 階段提供，目前導向預設分區）。只有 UUID 的網址會以 `replaceState` 導向預設分區：草稿 → 內容設定，已發布 → 訂單。
- 團主端各頁之間以 `history.pushState` 切換，不重新載入，也不重新驗證登入。
```

`README.md` 第 97 行的 `/admin`、`/admin/campaign/<uuid>` 改為 `/admin`（含 `/admin/residents`、`/admin/settings`）、`/admin/campaign/<uuid>/<分區>`。

- [ ] **Step 3: 完整測試、lint、build**

```bash
npx vitest run
npm run lint
npm run build
```

Expected：
- 全部通過；lint 無錯誤、無警告。
- build 成功，只允許既有的 chunk 超過 500 kB 警告。

- [ ] **Step 4: 截改版後畫面並比對溢出**

```bash
node scripts/capture-pages.mjs .superpowers/qa/phase-3/after
node -e "const before=require('./.superpowers/qa/phase-3/before/report.json');const after=require('./.superpowers/qa/phase-3/after/report.json');for(const shot of after){const base=before.find((entry)=>entry.file===shot.file);const worse=shot.scrollWidth>shot.clientWidth||shot.offenders.length>(base?base.offenders.length:0);console.log(worse?'CHECK':'ok   ',shot.file,shot.scrollWidth+'/'+shot.clientWidth,'offenders',(base?base.offenders.length:'-')+' -> '+shot.offenders.length)}"
```

Expected: 21 行都是 `ok`。

- [ ] **Step 5: 住戶端頁面不應改變**

`resident-list` 與 `resident-campaign` 共 6 對截圖：
- 先比對 SHA-256，預期逐位元組相同（本階段只改到住戶端的選單定位，截圖時選單未開啟）。
- 若有差異，開圖找原因並回報。

- [ ] **Step 6: 團主端頁面對照規格**

逐張打開 `admin-*-{375,768,1440}.png`，對照規格〈團主端〉與本計畫〈對 Spec 的調整〉逐項確認：

- **上方導覽：**
  - 左側「團購小幫手」，中間「團購｜住戶｜設定」且目前頁有標示，右側「＋ 建立新團」。
  - 640px 以下導覽換到第二列，不擠壓。
- **首頁：**
  - 標題「團購」與分段切換「全部｜開團中｜草稿｜已結單」。
  - 表格欄位：縮圖＋名稱、狀態、成團進度、訂單、未付款、結單、時間、操作。
  - 1440 是一張表；375 每團是一張小卡，欄名在左、值在右。
- **住戶：** 標題「住戶 N 位」、搜尋、篩選、群組查驗區塊（Demo 沒有查驗功能，不會出現）、住戶卡片與「調整戶號」「⋯」。
- **設定：** 自動結單通知、通知測試中心、（Demo 無登出）。
- **工作區 1440：**
  - 左側欄由上而下：「‹ 所有團購」、封面、團名、狀態＋「結單」、結單／到貨／開團、分區（訂單 N、內容設定、領取通知「結單後才能使用」）、最底部住戶連結。
  - 主內容是現有的訂單或內容設定畫面，沒有舊的「團主後台」標題與分頁。
- **工作區 768／375：** 左側欄收成頂端（團名＋狀態＋結單鈕），分區變成可橫向捲動的分頁，沒有封面與時程。
- **全部頁面：** 沒有文字截斷、重疊、白字壓白底；1024 以下可點元素至少 44px 高。

發現問題就只修該處樣式，並重跑 Step 3～5。

- [ ] **Step 7: 鍵盤與焦點抽查**

在 Demo（`http://localhost:5173/admin`）用鍵盤操作一次：
1. Tab 走過導覽，每個焦點都看得到外框。
2. 從首頁表格的團名連結按 Enter 進入工作區。
3. 走過左側欄分區連結，按「結單」後在確認視窗內按 Esc，視窗關閉、焦點回到「結單」。
4. 回首頁，開啟某列「⋯」選單，確認選單沒有被表格裁切；按 Esc 焦點回到「⋯」。
5. 住戶頁：「⋯」→「移除並封鎖」出現確認視窗，按取消後焦點回到「⋯」。

把結果寫進回報。

- [ ] **Step 8: Commit**

```bash
git add scripts/capture-pages.mjs docs/AI_AGENT_HANDOFF.md README.md
git commit -m "chore: capture the new organizer pages and document their routes"
```

若 Step 6 有修樣式，另外 commit：

```bash
git add <修改的 CSS>
git commit -m "fix: <頁面與問題>"
```

- [ ] **Step 9: 回報，不 push**

回報內容：
- 測試數量、lint、build 結果。
- 21 張截圖的溢出結果。
- 住戶端 6 對截圖是否逐位元組相同。
- 團主端各頁對照規格的結果，以及修了哪些破版。
- 鍵盤抽查結果。
- 需要團主在正式環境確認的項目：
  1. LINE 登入後回到子網址（例如 `/admin/campaign/<uuid>/orders`）是否回到原分區（規格〈風險與待驗證〉）。
  2. 瀏覽器上一頁／下一頁在各團主頁之間是否正常。
  3. 首頁「⋯」選單在真實資料的長表格中是否正常開啟。
