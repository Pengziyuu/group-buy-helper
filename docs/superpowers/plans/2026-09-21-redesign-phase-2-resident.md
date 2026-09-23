# 前端改版第 2 階段：住戶端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依規格重做住戶端的團購列表與團購頁（手機與電腦），並先處理第 1 階段留給第 2 階段的共用元件事項。

**Architecture:** 資料流不變：`LocalLiveApps` 傳給 `App` 與 `ResidentCampaignListApp` 的 props 介面完全不動。`App.tsx` 保留狀態、定價與送出邏輯，畫面拆到 `src/components/resident/` 的小元件；新增共用元件 `ImageGallery`、`BottomSheet` 與 `useModalDialog`。住戶端樣式集中在 `src/components/resident/resident.css`，完成後刪除 `App.css` 與 `ResidentCampaignListApp.css`（圖片檢視器的樣式先搬到自己的檔案）。團購頁以同一份 DOM 配 CSS grid：手機單欄、1024px 以上左右兩欄與固定訂購欄。

**Tech Stack:** React 19、TypeScript 6、Vite 8、Vitest 4、Testing Library、原生 CSS（`src/styles/tokens.css` 的 token）

**Spec:** `docs/superpowers/specs/2026-09-21-frontend-redesign-design.md`（住戶端、設計基礎、共用元件、狀態畫面、必須維持的產品規則）；第 1 階段遺留事項見 `docs/superpowers/plans/2026-09-21-redesign-phase-1-foundations.md` 最後一節。

## Global Constraints

- Node.js 22.12.0 以上（機器上為 v22.23.2）。
- 只改前端：不得修改 `supabase/**`、`scripts/*.py`、`src/services/**`、`src/domain/**`（Task 4 新增 `describeAutoClose` 除外）、`src/types/database.ts`、`src/LocalLiveApps.tsx`。
- 不新增 npm 相依套件。
- 操作色只有一種：`#0066cc`；聚焦外框 `2px solid #0071e3`、`outline-offset: 2px`。
- 字體沿用 `--font-sans`；中文不套負字距；字重只用 400 與 600；住戶端內文 17px（`--font-size-body`）。
- 不使用裝飾性漸層與 UI 陰影；只做淺色模式。
- **住戶端所有可點擊元素可點範圍 ≥ 44×44px**（外觀可以較小，以內距或偽元素補足），並有 `:focus-visible`。
- 文字與底色組合對比 ≥ 4.5:1（大字 ≥ 3:1）。
- 產品規則（不可破壞）：住戶訂單牆不得顯示任何人的期別／戶號（含自己）；自己的期別／戶號只出現在「我的訂單」；品項代碼不加「號」；住戶不能送出空訂單，整筆取消找團主；超過數量門檻的加量要擋下並說明；額外品項每單最多 10 筆、每筆 1～20、不計價；結單後訂單鎖定；LINE 名稱與頭貼只來自後端驗證資料。
- TDD：每個行為先寫失敗測試，確認失敗原因是功能缺失，再寫最小實作。
- 修改既有測試時，原本驗證的行為必須仍被某個測試驗證（本計畫每一處測試修改都寫明替代的斷言）。
- 使用者可見文案一律繁體中文。
- **只 commit、不 push。** 第 1、2 階段完成後由團主決定一起上線。

## 對 Spec 的調整

1. **按鈕變體命名：** Spec 共用元件表寫 `destructive`，程式在第 1 階段定為 `danger`（紅框）與 `danger-solid`（紅色實心，只用在確認視窗）。Task 1 加一個測試確保 `danger-solid` 只出現在 `Button.tsx` 與 `ConfirmDialog.tsx`。
2. **列表的金額門檻進度沿用 `NT$ 440 / NT$ 1,000` 格式**，與團購頁一致（Spec 範例寫 `$9,600 / $30,000`）。
3. **結單時間格式：** 今天／明天顯示「今天 12:00」「明天 12:00」，其餘顯示「10/15（五）12:00」（月/日不補零、加星期）。列表寫成「…結單」，團購頁寫在「結單」欄位。
4. **團購頁頂端只保留「‹ 全部團購」**，拿掉舊的「前往我的訂單」捷徑；手機的底部訂單列與電腦的右側訂購欄已經讓訂單一直看得到。
5. **訂單牆的時間文字沿用舊格式**（「下單時間 …」「已修改・最後修改 …」），只改排版。
6. **送出成功提示改用第 1 階段的 `Toast`**，顯示 3.5 秒（沿用舊行為與其測試），位置在手機底部訂單列上方。
7. **送出鈕停用時的說明**寫在訂單列下方：結單「本團已結單，無法修改訂單。」；清空既有訂單「想整筆取消訂單，請聯繫團主協助取消。」；還沒選品項「選擇品項後即可送出。」；額外品項未填完整「請填寫額外品項的名稱與數量。」。
8. **公告是否截斷用內容判斷**：超過 10 行或 400 字才顯示「展開全文」（jsdom 量不到實際行高，無法用版面判斷）；截斷用 `-webkit-line-clamp: 10`，不用漸層遮罩。

## 檔案地圖

| 檔案 | 動作 | 責任 |
|---|---|---|
| `src/styles/tokens.css` | 修改 | 新增 `--color-fill-hover`、`--radius-popover`、`--z-sticky/menu/dialog/toast` |
| `src/styles/tokens.test.ts` | 修改 | 對比測試加入 `color-text` on `color-fill-hover` |
| `src/components/ui/ui.css` | 修改 | hover 包進 `@media (hover: hover)`、互動底色、層級與圓角 token、sm 按鈕與分段切換最小寬度、IconButton 選擇器；新增 BottomSheet 與 ImageGallery 樣式 |
| `src/components/ui/buttonVariants.test.ts` | 新增 | `danger-solid` 只用在確認視窗 |
| `src/components/ui/useModalDialog.ts` | 新增 | 對話框共用的焦點、Esc、捲動鎖定 |
| `src/components/ui/ConfirmDialog.tsx` | 修改 | 改用 `useModalDialog`（行為不變） |
| `src/components/ui/BottomSheet.tsx`、`BottomSheet.test.tsx` | 新增 | 底部面板（電腦版為置中對話框） |
| `src/components/ui/ImageGallery.tsx`、`ImageGallery.test.tsx` | 新增 | 大圖＋縮圖列 |
| `src/components/CampaignImageViewer.css` | 新增 | 從 `App.css` 搬出的圖片檢視器樣式 |
| `src/components/CampaignImageViewer.tsx` | 修改 | 匯入自己的 CSS |
| `src/domain/campaignSchedule.ts`、`campaignSchedule.test.ts` | 修改 | 新增 `describeAutoClose` |
| `src/ResidentCampaignListApp.tsx` | 改寫 | 團購列表 |
| `src/ResidentCampaignListApp.test.tsx` | 改寫 | 列表測試 |
| `src/components/resident/resident.css` | 新增 | 住戶端全部樣式 |
| `src/components/resident/CampaignSummary.tsx`、`CampaignInfo.tsx`、`ProductRow.tsx`、`OrderBreakdown.tsx`、`OrderSummaryBar.tsx`、`OrderWall.tsx`、`ResidentBindingForm.tsx` | 新增 | 團購頁各區塊 |
| `src/components/resident/residentComponents.test.tsx` | 新增 | 各區塊單元測試 |
| `src/App.tsx` | 改寫 | 組合各區塊；狀態與送出邏輯不變 |
| `src/App.test.tsx`、`src/LocalLiveApps.test.tsx`、`src/RuntimeApp.test.tsx` | 修改 | 依新文案與結構更新查找方式 |
| `src/App.css`、`src/ResidentCampaignListApp.css` | 刪除 | 由 `resident.css` 取代 |

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
node scripts/capture-pages.mjs .superpowers/qa/phase-2/before
```

Expected: 15 行輸出、15 張 PNG 與 `report.json`；每行 scrollWidth 兩個數字相同。沒有 commit。

---

### Task 1: 共用元件遺留事項（互動底色、層級 token、hover、最小寬度）

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/tokens.test.ts`
- Modify: `src/components/ui/ui.css`
- Create: `src/components/ui/buttonVariants.test.ts`

**Interfaces:**
- Produces（token）：`--color-fill-hover: #ececef`（hover、選單開啟時的底色）、`--radius-popover: 12px`、`--z-sticky: 20`、`--z-menu: 900`、`--z-dialog: 1000`、`--z-toast: 1100`。後續任務的 CSS 使用這些名稱。

- [ ] **Step 1: 寫失敗測試**

在 `src/styles/tokens.test.ts` 的 4.5:1 `it.each([...])` 陣列最後加一組：

```ts
    ['color-text', 'color-fill-hover'],
```

新增 `src/components/ui/buttonVariants.test.ts`：

```ts
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const srcDir = resolve(process.cwd(), 'src')

function sourceFiles(): string[] {
  return readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
    .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
    .map((path) => join(srcDir, path))
}

describe('button variants', () => {
  it('keeps the solid danger button inside the confirmation dialog', () => {
    const users = sourceFiles()
      .filter((file) => readFileSync(file, 'utf8').includes("'danger-solid'"))
      .map((file) => relative(srcDir, file).replaceAll('\\', '/'))
      .sort()

    expect(users).toEqual(['components/ui/Button.tsx', 'components/ui/ConfirmDialog.tsx'])
  })
})
```

- [ ] **Step 2: 確認測試結果**

Run: `npx vitest run src/styles/tokens.test.ts src/components/ui/buttonVariants.test.ts`
Expected: tokens 那一組 FAIL（`color-fill-hover` 未定義）；`buttonVariants` 直接 PASS（它是防護測試，守住現況）。

- [ ] **Step 3: 新增 token**

`src/styles/tokens.css`：
- 在 `--color-control-off: #86868b;` 下一行加入 `  --color-fill-hover: #ececef;`
- 在 `--radius-pill: 999px;` 下一行加入 `  --radius-popover: 12px;`
- 在 `--blur-sticky: saturate(180%) blur(20px);` 下一行後面，空一行再加入：

```css
  --z-sticky: 20;
  --z-menu: 900;
  --z-dialog: 1000;
  --z-toast: 1100;
```

- [ ] **Step 4: 修改 `src/components/ui/ui.css`**

每一項都是對現有規則的精確修改：

1. 刪除下列 6 條 hover 規則（它們會在第 6 點統一放進 `@media (hover: hover)`）：
   - `.ui-button:hover:not(:disabled) { background: var(--color-primary-hover); }`
   - `.ui-button[data-variant="secondary"]:hover:not(:disabled) { background: var(--color-primary-subtle); }`
   - `.ui-button[data-variant="utility"]:hover:not(:disabled) { background: var(--color-surface-subtle); }`
   - `.ui-button[data-variant="danger"]:hover:not(:disabled) { background: var(--color-danger-subtle); }`
   - `.ui-button[data-variant="danger-solid"]:hover:not(:disabled) { background: var(--color-danger-hover); }`
   - 把 `.ui-menu-popup :where(a, button):hover,` 與下一行 `.ui-menu-popup :where(a, button):focus-visible { background: var(--color-surface-subtle); }` 兩行合併改成只剩：`.ui-menu-popup :where(a, button):focus-visible { background: var(--color-fill-hover); }`
2. `.ui-button[data-size="sm"] { ... }` 規則內加入 `min-width: var(--touch-target);`
3. `.ui-icon-button { width: var(--touch-target); padding: 0; }` 改成 `.ui-button.ui-icon-button { width: var(--touch-target); padding: 0; }`（原本會被 utility 變體的 `padding-inline` 蓋掉）
4. `.ui-segmented-option > span { ... }` 規則內加入 `justify-content: center; min-width: var(--touch-target);`
5. 層級與圓角：
   - `.ui-dialog-backdrop` 的 `z-index: 1000` → `z-index: var(--z-dialog)`
   - `.ui-sticky-action` 的 `z-index: 20` → `z-index: var(--z-sticky)`
   - `.ui-menu-popup` 的 `z-index: 900` → `z-index: var(--z-menu)`；其 `border-radius: 12px` → `border-radius: var(--radius-popover)`
   - `.ui-toast` 的 `z-index: 1100` → `z-index: var(--z-toast)`；其 `border-radius: 12px` → `border-radius: var(--radius-popover)`
   - `.ui-menu-trigger[aria-expanded="true"] { background: var(--color-surface-subtle); }` → `background: var(--color-fill-hover);`
6. 在檔尾 `@media (max-width: 430px) {` 之前加入：

```css
@media (hover: hover) {
  .ui-button:hover:not(:disabled) { background: var(--color-primary-hover); }
  .ui-button[data-variant="secondary"]:hover:not(:disabled) { background: var(--color-primary-subtle); }
  .ui-button[data-variant="utility"]:hover:not(:disabled) { background: var(--color-fill-hover); }
  .ui-button[data-variant="danger"]:hover:not(:disabled) { background: var(--color-danger-subtle); }
  .ui-button[data-variant="danger-solid"]:hover:not(:disabled) { background: var(--color-danger-hover); }
  .ui-menu-popup :where(a, button):hover { background: var(--color-fill-hover); }
}
```

完成後 `ui.css` 內不應再有 `z-index: ` 後面接數字、也不應再有 `12px` 圓角：

```bash
grep -nE "z-index: [0-9]|border-radius: 12px" src/components/ui/ui.css
```

Expected: 沒有輸出。

- [ ] **Step 5: 確認測試通過**

Run: `npx vitest run src/styles/tokens.test.ts src/components/ui`
Expected: 全部 PASS。

Run: `npx vitest run`
Expected: 全部 PASS（75 個測試檔、489 項）。

- [ ] **Step 6: Commit**

```bash
git add src/styles/tokens.css src/styles/tokens.test.ts src/components/ui/ui.css src/components/ui/buttonVariants.test.ts
git commit -m "feat: add interaction fill and layer tokens, hover only on hover devices"
```

---

### Task 2: `useModalDialog` 與 BottomSheet

**Files:**
- Create: `src/components/ui/useModalDialog.ts`
- Modify: `src/components/ui/ConfirmDialog.tsx`
- Create: `src/components/ui/BottomSheet.tsx`
- Create: `src/components/ui/BottomSheet.test.tsx`
- Modify: `src/components/ui/ui.css`

**Interfaces:**
- Produces: `useModalDialog({ dialogRef, initialFocusRef, onDismiss, busy? })`——開啟時記住原焦點、鎖住 body 捲動、Esc（非 busy 時）呼叫 `onDismiss`、Tab 焦點困在對話框內、關閉時歸還焦點；`busy` 時焦點放在對話框本身，否則放在 `initialFocusRef`。
- Produces: `<BottomSheet title onClose>{children}</BottomSheet>`——`role="dialog"`、名稱為 `title`；關閉鈕名稱為「關閉{title}」；點背景關閉。Task 7 以 `title="訂單明細"` 使用。

- [ ] **Step 1: 寫失敗測試**

`src/components/ui/BottomSheet.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { BottomSheet } from './BottomSheet'

function Example() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>明細</button>
      {open && (
        <BottomSheet title="訂單明細" onClose={() => setOpen(false)}>
          <p>商品合計 $270</p>
          <a href="#more">更多說明</a>
        </BottomSheet>
      )}
    </>
  )
}

describe('BottomSheet', () => {
  it('opens as a labelled dialog, traps focus, and closes on Escape', async () => {
    const user = userEvent.setup()
    render(<Example />)
    const trigger = screen.getByRole('button', { name: '明細' })

    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: '訂單明細' })).toHaveTextContent('商品合計 $270')
    const close = screen.getByRole('button', { name: '關閉訂單明細' })
    expect(close).toHaveFocus()
    expect(document.body).toHaveStyle({ overflow: 'hidden' })

    await user.tab()
    expect(screen.getByRole('link', { name: '更多說明' })).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body).not.toHaveStyle({ overflow: 'hidden' })
    expect(trigger).toHaveFocus()
  })

  it('closes from the close button and the backdrop but not from inside the sheet', async () => {
    const user = userEvent.setup()
    render(<Example />)

    await user.click(screen.getByRole('button', { name: '明細' }))
    await user.click(screen.getByText('商品合計 $270'))
    expect(screen.getByRole('dialog', { name: '訂單明細' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '關閉訂單明細' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '明細' }))
    await user.click(screen.getByRole('dialog', { name: '訂單明細' }).parentElement!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/components/ui/BottomSheet.test.tsx`
Expected: FAIL（找不到 `./BottomSheet`）。

- [ ] **Step 3: 建立 `src/components/ui/useModalDialog.ts`**

```ts
import { useEffect, useRef, type RefObject } from 'react'

const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

type ModalDialogOptions = {
  dialogRef: RefObject<HTMLElement | null>
  initialFocusRef: RefObject<HTMLElement | null>
  onDismiss: () => void
  busy?: boolean
}

export function useModalDialog({ dialogRef, initialFocusRef, onDismiss, busy = false }: ModalDialogOptions) {
  const busyRef = useRef(busy)
  const onDismissRef = useRef(onDismiss)
  busyRef.current = busy
  onDismissRef.current = onDismiss

  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault()
        onDismissRef.current()
        return
      }
      const dialog = dialogRef.current
      if (event.key !== 'Tab' || !dialog) return
      const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)]
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      returnFocus?.focus()
    }
  }, [dialogRef])

  useEffect(() => {
    if (busy) dialogRef.current?.focus()
    else initialFocusRef.current?.focus()
  }, [busy, dialogRef, initialFocusRef])
}
```

- [ ] **Step 4: `ConfirmDialog` 改用 hook**

把 `src/components/ui/ConfirmDialog.tsx` 整檔換成：

```tsx
import { useId, useRef, type ReactNode } from 'react'
import { Button } from './Button'
import { useModalDialog } from './useModalDialog'

type ConfirmDialogProps = {
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel?: string
  busy?: boolean
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = '取消',
  busy = false,
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  useModalDialog({ dialogRef, initialFocusRef: cancelRef, onDismiss: onCancel, busy })

  return (
    <div className="ui-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel()
    }}>
      <section ref={dialogRef} className="ui-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <h2 id={titleId}>{title}</h2>
        <div className="ui-dialog-content">{children}</div>
        <div className="ui-dialog-actions">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
          <Button variant={destructive ? 'danger-solid' : 'primary'} onClick={onConfirm} loading={busy} disabled={busy} loadingLabel="處理中…">
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 5: 建立 `src/components/ui/BottomSheet.tsx`**

```tsx
import { useId, useRef, type ReactNode } from 'react'
import { Button } from './Button'
import { useModalDialog } from './useModalDialog'

type BottomSheetProps = {
  title: string
  onClose: () => void
  children: ReactNode
}

export function BottomSheet({ title, onClose, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  useModalDialog({ dialogRef: sheetRef, initialFocusRef: closeRef, onDismiss: onClose })

  return (
    <div className="ui-sheet-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section ref={sheetRef} className="ui-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="ui-sheet-header">
          <h2 id={titleId}>{title}</h2>
          <Button ref={closeRef} variant="utility" className="ui-icon-button" aria-label={`關閉${title}`} onClick={onClose}>×</Button>
        </header>
        <div className="ui-sheet-body">{children}</div>
      </section>
    </div>
  )
}
```

- [ ] **Step 6: 加入樣式**

在 `src/components/ui/ui.css` 的 `@media (hover: hover) {` 之前加入：

```css
.ui-sheet-backdrop { position: fixed; inset: 0; z-index: var(--z-dialog); display: flex; align-items: flex-end; justify-content: center; background: var(--color-overlay); }
.ui-sheet { width: 100%; max-height: min(85vh, 720px); display: flex; flex-direction: column; padding-bottom: env(safe-area-inset-bottom); border-radius: var(--radius-surface) var(--radius-surface) 0 0; background: var(--color-surface-raised); }
.ui-sheet-header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4); border-bottom: 1px solid var(--color-divider); }
.ui-sheet-header h2 { margin: 0; font-size: var(--font-size-title); font-weight: var(--font-weight-strong); line-height: var(--line-height-heading); }
.ui-sheet-body { overflow-y: auto; padding: var(--space-4); }
@media (min-width: 640px) {
  .ui-sheet-backdrop { align-items: center; padding: var(--space-4); }
  .ui-sheet { width: min(100%, 480px); border-radius: var(--radius-surface); }
}
```

- [ ] **Step 7: 確認測試通過**

Run: `npx vitest run src/components/ui`
Expected: 全部 PASS（包含原有 `ui.test.tsx` 的兩個 ConfirmDialog 測試，證明抽出 hook 後行為不變）。

Run: `npx tsc -b` → 無錯誤。

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/useModalDialog.ts src/components/ui/ConfirmDialog.tsx src/components/ui/BottomSheet.tsx src/components/ui/BottomSheet.test.tsx src/components/ui/ui.css
git commit -m "feat: add a bottom sheet sharing the dialog focus rules"
```

---

### Task 3: ImageGallery 與圖片檢視器樣式

**Files:**
- Create: `src/components/ui/ImageGallery.tsx`
- Create: `src/components/ui/ImageGallery.test.tsx`
- Create: `src/components/CampaignImageViewer.css`
- Modify: `src/components/CampaignImageViewer.tsx`（第 1 行後加 CSS import）
- Modify: `src/components/ui/ui.css`

**Interfaces:**
- Produces: `<ImageGallery images={CampaignImage[]} onOpen={(index: number) => void} />`。一張大圖按鈕（名稱「放大檢視 第 N 張圖片：{alt}」），多於一張時有縮圖群組（`role="group"`、名稱「共 N 張圖片」），每個縮圖按鈕名稱「顯示第 N 張圖片」並以 `aria-pressed` 標示目前那張。大圖載入失敗時換成 `role="status"` 的「圖片暫時無法顯示」。沒有圖片時不輸出任何東西。Task 6 的 `CampaignInfo` 使用。

- [ ] **Step 1: 寫失敗測試**

`src/components/ui/ImageGallery.test.tsx`：

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ImageGallery } from './ImageGallery'

const images = [
  { src: '/one.jpg', alt: '第一張' },
  { src: '/two.jpg', alt: '第二張' },
  { src: '/three.jpg', alt: '第三張' },
]

describe('ImageGallery', () => {
  it('shows one large image and opens the viewer at that image', async () => {
    const user = userEvent.setup()
    const open = vi.fn()
    render(<ImageGallery images={[images[0]]} onOpen={open} />)

    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '放大檢視 第 1 張圖片：第一張' }))
    expect(open).toHaveBeenCalledWith(0)
  })

  it('switches the large image from the thumbnails', async () => {
    const user = userEvent.setup()
    const open = vi.fn()
    render(<ImageGallery images={images} onOpen={open} />)

    const thumbnails = screen.getByRole('group', { name: '共 3 張圖片' })
    expect(within(thumbnails).getByRole('button', { name: '顯示第 1 張圖片' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(thumbnails).getByRole('button', { name: '顯示第 3 張圖片' }))
    expect(within(thumbnails).getByRole('button', { name: '顯示第 3 張圖片' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: '放大檢視 第 3 張圖片：第三張' }))
    expect(open).toHaveBeenCalledWith(2)
  })

  it('replaces a broken image with a notice but keeps the other images reachable', async () => {
    const user = userEvent.setup()
    render(<ImageGallery images={images} onOpen={vi.fn()} />)

    fireEvent.error(screen.getByRole('img', { name: '第一張' }))
    expect(screen.getByRole('status')).toHaveTextContent('圖片暫時無法顯示')
    await user.click(screen.getByRole('button', { name: '顯示第 2 張圖片' }))
    expect(screen.getByRole('button', { name: '放大檢視 第 2 張圖片：第二張' })).toBeInTheDocument()
  })

  it('renders nothing without images', () => {
    const { container } = render(<ImageGallery images={[]} onOpen={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/components/ui/ImageGallery.test.tsx`
Expected: FAIL（找不到 `./ImageGallery`）。

- [ ] **Step 3: 實作 `src/components/ui/ImageGallery.tsx`**

```tsx
import { useState } from 'react'
import type { CampaignImage } from '../../services/demoCampaignStore'

type ImageGalleryProps = {
  images: CampaignImage[]
  onOpen: (index: number) => void
}

export function ImageGallery({ images, onOpen }: ImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [failedSources, setFailedSources] = useState<Set<string>>(() => new Set())
  if (images.length === 0) return null

  const index = Math.min(activeIndex, images.length - 1)
  const image = images[index]

  return (
    <div className="ui-gallery">
      {failedSources.has(image.src) ? (
        <div className="ui-gallery-fallback" role="status">圖片暫時無法顯示</div>
      ) : (
        <button
          type="button"
          className="ui-gallery-main"
          aria-label={`放大檢視 第 ${index + 1} 張圖片：${image.alt}`}
          onClick={() => onOpen(index)}
        >
          <img
            src={image.src}
            alt={image.alt}
            onError={() => setFailedSources((current) => new Set(current).add(image.src))}
          />
          <span className="ui-gallery-zoom" aria-hidden="true">放大</span>
        </button>
      )}
      {images.length > 1 && (
        <div className="ui-gallery-thumbs" role="group" aria-label={`共 ${images.length} 張圖片`}>
          {images.map((thumbnail, thumbnailIndex) => (
            <button
              key={`${thumbnail.src}-${thumbnailIndex}`}
              type="button"
              className="ui-gallery-thumb"
              aria-label={`顯示第 ${thumbnailIndex + 1} 張圖片`}
              aria-pressed={thumbnailIndex === index}
              onClick={() => setActiveIndex(thumbnailIndex)}
            >
              <img src={thumbnail.src} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 加入 gallery 樣式**

在 `src/components/ui/ui.css` 的 `@media (hover: hover) {` 之前加入：

```css
.ui-gallery { display: grid; gap: var(--space-2); }
.ui-gallery-main { position: relative; display: block; width: 100%; aspect-ratio: 4 / 3; padding: 0; overflow: hidden; border: 0; border-radius: var(--radius-control); background: var(--color-surface-subtle); cursor: zoom-in; }
.ui-gallery-main img { display: block; width: 100%; height: 100%; object-fit: contain; }
.ui-gallery-zoom { position: absolute; right: var(--space-2); bottom: var(--space-2); padding: 2px 10px; border-radius: var(--radius-pill); background: rgb(29 29 31 / 72%); color: var(--color-on-primary); font-size: var(--font-size-caption); }
.ui-gallery-fallback { display: grid; place-items: center; aspect-ratio: 4 / 3; border-radius: var(--radius-control); background: var(--color-surface-subtle); color: var(--color-text-secondary); font-size: var(--font-size-dense); }
.ui-gallery-thumbs { display: flex; gap: var(--space-2); overflow-x: auto; }
.ui-gallery-thumb { flex: none; width: 56px; height: 56px; padding: 0; overflow: hidden; border: 2px solid transparent; border-radius: var(--radius-control); background: var(--color-surface-subtle); cursor: pointer; }
.ui-gallery-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
.ui-gallery-thumb[aria-pressed="true"] { border-color: var(--color-primary); }
```

- [ ] **Step 5: 把圖片檢視器樣式搬到自己的檔案**

`src/App.css` 第 199–216 行是檢視器樣式（`.campaign-image-viewer-backdrop` 到它自己的 `@media (max-width: 640px), (hover: none) and (pointer: coarse) {...}`），第 244–246 行是 `@media (max-width: 430px)` 內的三條檢視器規則。原樣搬出：

```bash
{ sed -n '199,216p' src/App.css; echo; echo '@media (max-width: 430px) {'; sed -n '244,246p' src/App.css; echo '}'; } > src/components/CampaignImageViewer.css
head -1 src/components/CampaignImageViewer.css
tail -5 src/components/CampaignImageViewer.css
```

Expected: 第一行以 `.campaign-image-viewer-backdrop {` 開頭；最後是 `@media (max-width: 430px) {`、三條 `.campaign-image-viewer…` 規則與 `}`。

把 `.campaign-image-viewer-backdrop` 規則裡的 `z-index: 1000` 改成 `z-index: var(--z-dialog)`。

在 `src/components/CampaignImageViewer.tsx` 的第一行 import 之後加入：

```tsx
import './CampaignImageViewer.css'
```

`App.css` 本身此時不動（Task 7 會刪除整個檔案；在那之前規則重複存在不影響畫面）。

- [ ] **Step 6: 確認測試通過**

Run: `npx vitest run src/components/ui/ImageGallery.test.tsx src/App.test.tsx`
Expected: 全部 PASS（`App.test.tsx` 的圖片檢視器測試證明搬移後檢視器仍正常）。

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/ImageGallery.tsx src/components/ui/ImageGallery.test.tsx src/components/ui/ui.css src/components/CampaignImageViewer.css src/components/CampaignImageViewer.tsx
git commit -m "feat: add an image gallery and give the image viewer its own styles"
```

---

### Task 4: 結單時間的顯示文字 `describeAutoClose`

**Files:**
- Modify: `src/domain/campaignSchedule.ts`（檔尾新增）
- Modify: `src/domain/campaignSchedule.test.ts`

**Interfaces:**
- Produces: `describeAutoClose(value: string | null | undefined, now?: Date): { when: string; soon: boolean } | null`。`when` 為「今天 12:00」「明天 12:00」或「10/15（五）12:00」（台灣時間）；`soon` 在今天或明天為 `true`。無值或無效日期回傳 `null`。Task 5、7 使用。

- [ ] **Step 1: 寫失敗測試**

在 `src/domain/campaignSchedule.test.ts` 的 import 清單加入 `describeAutoClose`，並在 `describe('campaign schedule', ...)` 內新增：

```ts
  it('describes the automatic closing time relative to today in Taipei', () => {
    const now = new Date('2026-09-25T01:00:00.000Z')

    expect(describeAutoClose('2026-09-25T04:00:00.000Z', now)).toEqual({ when: '今天 12:00', soon: true })
    expect(describeAutoClose('2026-09-26T04:00:00.000Z', now)).toEqual({ when: '明天 12:00', soon: true })
    expect(describeAutoClose('2027-10-15T04:00:00.000Z', now)).toEqual({ when: '10/15（五）12:00', soon: false })
    expect(describeAutoClose(null, now)).toBeNull()
    expect(describeAutoClose('not-a-date', now)).toBeNull()
  })

  it('uses the Taipei date when UTC is still on the previous day', () => {
    const now = new Date('2026-09-24T17:00:00.000Z')

    expect(describeAutoClose('2026-09-25T04:00:00.000Z', now)).toEqual({ when: '今天 12:00', soon: true })
  })
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/domain/campaignSchedule.test.ts`
Expected: FAIL（`describeAutoClose` 不存在）。

- [ ] **Step 3: 實作**

在 `src/domain/campaignSchedule.ts` 檔尾加入：

```ts
const taipeiWeekdayFormatter = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', weekday: 'narrow' })

export function describeAutoClose(
  value: string | null | undefined,
  now: Date = new Date(),
): { when: string; soon: boolean } | null {
  const date = taipeiDateInputFromIso(value)
  if (!date) return null
  if (date === taipeiDateInputFromIso(now.toISOString())) return { when: '今天 12:00', soon: true }
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  if (date === taipeiDateInputFromIso(tomorrow.toISOString())) return { when: '明天 12:00', soon: true }
  const [, month, day] = date.split('-')
  const weekday = taipeiWeekdayFormatter.format(new Date(value as string))
  return { when: `${Number(month)}/${Number(day)}（${weekday}）12:00`, soon: false }
}
```

- [ ] **Step 4: 確認測試通過**

Run: `npx vitest run src/domain/campaignSchedule.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/domain/campaignSchedule.ts src/domain/campaignSchedule.test.ts
git commit -m "feat: describe the automatic closing time relative to today"
```

---

### Task 5: 住戶團購列表

**Files:**
- Modify: `src/ResidentCampaignListApp.tsx`（整檔改寫）
- Modify: `src/ResidentCampaignListApp.test.tsx`（整檔改寫）
- Create: `src/components/resident/resident.css`
- Modify: `src/LocalLiveApps.test.tsx`（列表相關 5 處）
- Modify: `src/RuntimeApp.test.tsx`（列表那一個斷言）

**Interfaces:**
- Consumes: `describeAutoClose`（Task 4）、`Menu`（第 1 階段）、`--color-fill-hover`／`--z-sticky`（Task 1）。
- Produces: `ResidentCampaignListApp` 的 props 不變（`identity`、`campaigns`、`onLogout?`），另加測試用的 `now?: Date`。`ResidentLineIdentity`、`ResidentCampaignListItem` 型別不變。
- Produces（CSS）：`resident.css` 內的共用住戶頁樣式 `.resident-page`、`.resident-topbar`、`.resident-avatar`，Task 6、7 沿用。

- [ ] **Step 1: 改寫測試**

`src/ResidentCampaignListApp.test.tsx` 整檔換成：

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ResidentCampaignListApp, { type ResidentCampaignListItem } from './ResidentCampaignListApp'

const identity = { displayName: '彭梓育', pictureUrl: 'https://example.com/avatar.jpg' }

function campaign(overrides: Partial<ResidentCampaignListItem> & Pick<ResidentCampaignListItem, 'slug' | 'title'>): ResidentCampaignListItem {
  return {
    status: 'open',
    unitPrice: 55,
    openedAt: '2026-08-14T08:00:00.000Z',
    totalQuantity: 8,
    threshold: 10,
    ...overrides,
  }
}

describe('ResidentCampaignListApp', () => {
  it('lists open campaigns before closed ones with price, progress and schedule', () => {
    render(
      <ResidentCampaignListApp
        identity={identity}
        campaigns={[
          campaign({
            slug: '0123456789abcdef0123456789abcdef0123', title: '早餐團購', totalAmount: 440,
            thresholdKind: 'amount', amountThreshold: 1000, arrivalLabel: '03/08', autoCloseAt: '2027-03-05T04:00:00.000Z',
            images: [
              { src: 'https://example.com/breakfast-cover.jpg', alt: '早餐商品照片' },
              { src: 'https://example.com/breakfast-detail.jpg', alt: '早餐細節照片' },
            ],
          }),
          campaign({
            slug: 'abcdef0123456789abcdef0123456789abcd', title: '水果團購', status: 'closed', unitPrice: 120,
            openedAt: '2026-08-13T08:00:00.000Z', totalQuantity: 12, threshold: 12, quantityUnit: '箱', arrivalLabel: '貨到通知',
          }),
        ]}
      />,
    )

    expect(screen.getByRole('heading', { level: 1, name: '團購' })).toBeInTheDocument()
    expect(screen.getByText('1 團開團中')).toBeInTheDocument()

    const open = screen.getByRole('region', { name: '開團中' })
    expect(within(open).getByRole('link', { name: '早餐團購' })).toHaveAttribute('href', '/campaign/0123456789abcdef0123456789abcdef0123')
    expect(within(open).getByRole('img', { name: '早餐商品照片' })).toHaveAttribute('src', 'https://example.com/breakfast-cover.jpg')
    expect(within(open).queryByRole('img', { name: '早餐細節照片' })).not.toBeInTheDocument()
    expect(within(open).getByText('$55')).toBeInTheDocument()
    expect(within(open).getByText('NT$ 440 / NT$ 1,000')).toBeInTheDocument()
    expect(within(open).getByText('3/5（五）12:00 結單')).toBeInTheDocument()
    expect(within(open).getByRole('progressbar', { name: '早餐團購成團進度' })).toHaveAttribute('aria-valuenow', '440')

    const closed = screen.getByRole('region', { name: '已結單' })
    expect(within(closed).getByRole('link', { name: '水果團購' })).toBeInTheDocument()
    expect(within(closed).getByText('已結單', { selector: '.ui-status-badge' })).toBeInTheDocument()
    expect(within(closed).getByText('12 箱 / 12 箱')).toBeInTheDocument()
    expect(within(closed).getByText('到貨：貨到通知')).toBeInTheDocument()
    expect(within(closed).getByRole('img', { name: '水果團購尚未設定商品圖片' })).toBeInTheDocument()

    const titles = screen.getAllByRole('link').map((link) => link.textContent)
    expect(titles).toEqual(['早餐團購', '水果團購'])
  })

  it('orders each group by the newest opening and treats arrived campaigns as closed', () => {
    render(
      <ResidentCampaignListApp
        identity={identity}
        campaigns={[
          campaign({ slug: 'open-old', title: '舊的開團', openedAt: '2026-08-01T08:00:00.000Z' }),
          campaign({ slug: 'arrived', title: '到貨的團', status: 'arrived', openedAt: '2026-08-20T08:00:00.000Z' }),
          campaign({ slug: 'open-new', title: '新的開團', openedAt: '2026-08-10T08:00:00.000Z' }),
          campaign({ slug: 'closed', title: '結單的團', status: 'closed', openedAt: '2026-08-05T08:00:00.000Z' }),
        ]}
      />,
    )

    expect(within(screen.getByRole('region', { name: '開團中' })).getAllByRole('link').map((link) => link.textContent))
      .toEqual(['新的開團', '舊的開團'])
    expect(within(screen.getByRole('region', { name: '已結單' })).getAllByRole('link').map((link) => link.textContent))
      .toEqual(['到貨的團', '結單的團'])
    expect(screen.queryByText(/已到貨/)).not.toBeInTheDocument()
  })

  it('highlights campaigns that close today or tomorrow', () => {
    render(
      <ResidentCampaignListApp
        identity={identity}
        now={new Date('2026-09-25T01:00:00.000Z')}
        campaigns={[
          campaign({ slug: 'today', title: '今天結單團', autoCloseAt: '2026-09-25T04:00:00.000Z' }),
          campaign({ slug: 'tomorrow', title: '明天結單團', autoCloseAt: '2026-09-26T04:00:00.000Z' }),
        ]}
      />,
    )

    expect(screen.getByText('今天 12:00 結單')).toHaveClass('is-soon')
    expect(screen.getByText('明天 12:00 結單')).toHaveClass('is-soon')
  })

  it('shows the five newest closed campaigns until asked for older ones', async () => {
    const user = userEvent.setup()
    render(
      <ResidentCampaignListApp
        identity={identity}
        campaigns={Array.from({ length: 7 }, (_, index) => campaign({
          slug: `closed-${index}`, title: `結單團 ${index + 1}`, status: 'closed',
          openedAt: new Date(Date.UTC(2026, 7, 20 - index)).toISOString(),
        }))}
      />,
    )

    const closed = screen.getByRole('region', { name: '已結單' })
    expect(within(closed).getAllByRole('link')).toHaveLength(5)
    expect(screen.getByText('目前沒有開團中的團購')).toBeInTheDocument()
    await user.click(within(closed).getByRole('button', { name: '顯示更早的團購（2）' }))
    expect(within(closed).getAllByRole('link')).toHaveLength(7)
  })

  it('signs out from the LINE account menu', async () => {
    const user = userEvent.setup()
    const onLogout = vi.fn()
    const { container } = render(<ResidentCampaignListApp identity={identity} campaigns={[]} onLogout={onLogout} />)

    const account = screen.getByRole('button', { name: 'LINE 帳號：彭梓育' })
    expect(container.querySelector('.resident-account-menu img')).toHaveAttribute('src', 'https://example.com/avatar.jpg')
    await user.click(account)
    await user.click(screen.getByRole('menuitem', { name: '登出' }))
    expect(onLogout).toHaveBeenCalledOnce()
  })

  it('explains an empty list', () => {
    render(<ResidentCampaignListApp identity={{ displayName: '彭梓育', pictureUrl: null }} campaigns={[]} />)

    expect(screen.getByRole('img', { name: 'LINE 帳號：彭梓育' })).toBeInTheDocument()
    expect(screen.getByText('目前還沒有團購')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/ResidentCampaignListApp.test.tsx`
Expected: FAIL（找不到 `團購` 標題、`開團中` 區塊等）。

- [ ] **Step 3: 改寫 `src/ResidentCampaignListApp.tsx`**

整檔換成：

```tsx
import { useState } from 'react'
import { EmptyState } from './components/ui/AsyncState'
import { Button } from './components/ui/Button'
import { Menu } from './components/ui/Menu'
import { ProgressBar } from './components/ui/ProgressBar'
import { StatusBadge } from './components/ui/StatusBadge'
import { describeAutoClose, normalizeArrivalLabel } from './domain/campaignSchedule'
import type { CampaignStatus } from './domain/orderWorkflow'
import { normalizeQuantityUnit, type QuantityUnit } from './domain/quantityUnit'
import type { CampaignImage } from './services/demoCampaignStore'
import './components/resident/resident.css'

export type ResidentLineIdentity = {
  displayName: string
  pictureUrl: string | null
}

export type ResidentCampaignListItem = {
  slug: string
  title: string
  status: CampaignStatus
  unitPrice: number
  openedAt: string
  totalQuantity: number
  totalAmount?: number
  threshold: number
  thresholdKind?: 'quantity' | 'amount'
  amountThreshold?: number | null
  quantityUnit?: QuantityUnit
  images?: CampaignImage[]
  arrivalLabel?: string
  autoCloseAt?: string | null
}

type ResidentCampaignListAppProps = {
  identity: ResidentLineIdentity
  campaigns: ResidentCampaignListItem[]
  onLogout?: () => void | Promise<void>
  now?: Date
}

const CLOSED_PREVIEW_COUNT = 5

function byNewestOpening(left: ResidentCampaignListItem, right: ResidentCampaignListItem) {
  return Date.parse(right.openedAt) - Date.parse(left.openedAt)
}

function campaignProgress(campaign: ResidentCampaignListItem) {
  if (campaign.thresholdKind === 'amount') {
    const value = campaign.totalAmount ?? 0
    const target = campaign.amountThreshold ?? campaign.threshold
    return { value, target, text: `NT$ ${value.toLocaleString('zh-TW')} / NT$ ${target.toLocaleString('zh-TW')}` }
  }
  const unit = normalizeQuantityUnit(campaign.quantityUnit)
  return {
    value: campaign.totalQuantity,
    target: campaign.threshold,
    text: `${campaign.totalQuantity} ${unit} / ${campaign.threshold} ${unit}`,
  }
}

function CampaignThumbnail({ campaign }: { campaign: ResidentCampaignListItem }) {
  const [failed, setFailed] = useState(false)
  const image = campaign.images?.[0]
  return (
    <div className="resident-campaign-thumb">
      {image?.src && !failed
        ? <img src={image.src} alt={image.alt || `${campaign.title}商品圖片`} loading="lazy" onError={() => setFailed(true)} />
        : <div className="resident-campaign-thumb-empty" role="img" aria-label={`${campaign.title}尚未設定商品圖片`}>無圖片</div>}
    </div>
  )
}

function CampaignRow({ campaign, now }: { campaign: ResidentCampaignListItem; now: Date }) {
  const open = campaign.status === 'open'
  const progress = campaignProgress(campaign)
  const closing = open ? describeAutoClose(campaign.autoCloseAt, now) : null
  return (
    <article className="resident-campaign-row" data-status={open ? 'open' : 'closed'}>
      <CampaignThumbnail campaign={campaign} />
      <div className="resident-campaign-row-body">
        <h3><a href={`/campaign/${campaign.slug}`}>{campaign.title}</a></h3>
        {open
          ? <p className="resident-campaign-price"><strong>${campaign.unitPrice.toLocaleString('zh-TW')}</strong> 起</p>
          : <p className="resident-campaign-price"><StatusBadge tone="neutral">已結單</StatusBadge></p>}
        <ProgressBar label={`${campaign.title}成團進度`} value={progress.value} max={progress.target} />
        <p className="resident-campaign-meta">
          <span>{progress.text}</span>
          {closing
            ? <span className={closing.soon ? 'is-soon' : undefined}>{closing.when} 結單</span>
            : <span>到貨：{normalizeArrivalLabel(campaign.arrivalLabel)}</span>}
        </p>
      </div>
      <span className="resident-campaign-chevron" aria-hidden="true">›</span>
    </article>
  )
}

function ResidentAccount({ identity, onLogout }: { identity: ResidentLineIdentity; onLogout?: () => void | Promise<void> }) {
  const label = `LINE 帳號：${identity.displayName}`
  const avatar = identity.pictureUrl
    ? <img className="resident-avatar" src={identity.pictureUrl} alt="" referrerPolicy="no-referrer" />
    : <span className="resident-avatar">{identity.displayName.slice(0, 1)}</span>
  if (!onLogout) return <span className="resident-account" role="img" aria-label={label}>{avatar}</span>
  return (
    <Menu
      className="resident-account-menu"
      label={label}
      triggerContent={avatar}
      items={[{ label: '登出', onSelect: () => { void onLogout() } }]}
    />
  )
}

export default function ResidentCampaignListApp({ identity, campaigns, onLogout, now = new Date() }: ResidentCampaignListAppProps) {
  const [showAllClosed, setShowAllClosed] = useState(false)
  const openCampaigns = campaigns.filter((campaign) => campaign.status === 'open').sort(byNewestOpening)
  const closedCampaigns = campaigns.filter((campaign) => campaign.status !== 'open').sort(byNewestOpening)
  const visibleClosed = showAllClosed ? closedCampaigns : closedCampaigns.slice(0, CLOSED_PREVIEW_COUNT)
  const hiddenClosedCount = closedCampaigns.length - visibleClosed.length

  return (
    <div className="resident-page">
      <header className="resident-topbar">
        <span className="resident-topbar-brand">團購小幫手</span>
        <ResidentAccount identity={identity} onLogout={onLogout} />
      </header>
      <main className="resident-list">
        <h1>團購</h1>
        <p className="resident-list-subtitle">
          {openCampaigns.length > 0 ? `${openCampaigns.length} 團開團中` : '目前沒有開團中的團購'}
        </p>
        {campaigns.length === 0 && <EmptyState title="目前還沒有團購" description="團主開團後會出現在這裡。" />}
        {openCampaigns.length > 0 && (
          <section className="resident-list-group" aria-labelledby="open-campaigns-heading">
            <h2 id="open-campaigns-heading">開團中</h2>
            <div className="resident-campaign-grid" data-group="open">
              {openCampaigns.map((campaign) => <CampaignRow key={campaign.slug} campaign={campaign} now={now} />)}
            </div>
          </section>
        )}
        {closedCampaigns.length > 0 && (
          <section className="resident-list-group" aria-labelledby="closed-campaigns-heading">
            <h2 id="closed-campaigns-heading">已結單</h2>
            <div className="resident-campaign-grid" data-group="closed">
              {visibleClosed.map((campaign) => <CampaignRow key={campaign.slug} campaign={campaign} now={now} />)}
            </div>
            {hiddenClosedCount > 0 && (
              <Button variant="utility" className="resident-list-more" onClick={() => setShowAllClosed(true)}>
                顯示更早的團購（{hiddenClosedCount}）
              </Button>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 4: 建立 `src/components/resident/resident.css`**

```css
/* Resident pages: the campaign list and the campaign page. */
.resident-page { min-height: 100vh; background: var(--color-bg); color: var(--color-text); font-size: var(--font-size-body); }

.resident-topbar { position: sticky; top: 0; z-index: var(--z-sticky); display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); min-height: 52px; padding: 0 var(--space-4); border-bottom: 1px solid var(--color-border); background: var(--color-sticky-bg); -webkit-backdrop-filter: var(--blur-sticky); backdrop-filter: var(--blur-sticky); }
.resident-topbar-brand { font-size: var(--font-size-dense); font-weight: var(--font-weight-strong); }
.resident-avatar { width: 36px; height: 36px; flex: none; display: grid; place-items: center; overflow: hidden; border-radius: 50%; background: var(--color-neutral-subtle); color: var(--color-text-secondary); font-size: var(--font-size-dense); font-weight: var(--font-weight-strong); object-fit: cover; }
.resident-account { display: inline-grid; place-items: center; width: var(--touch-target); height: var(--touch-target); }
.resident-account-menu .ui-menu-trigger { padding: 0; border: 0; border-radius: 50%; background: transparent; }

.resident-list { width: min(100%, 1200px); margin: 0 auto; padding: var(--space-5) var(--space-4) var(--space-8); }
.resident-list h1 { margin: 0; font-size: var(--font-size-page-title); font-weight: var(--font-weight-strong); }
.resident-list-subtitle { margin: 2px 0 var(--space-4); color: var(--color-text-secondary); font-size: var(--font-size-dense); }
.resident-list-group + .resident-list-group { margin-top: var(--space-6); }
.resident-list-group h2 { margin: 0 0 var(--space-2); font-size: 15px; font-weight: var(--font-weight-strong); }
.resident-campaign-grid { display: grid; gap: var(--space-2); }
.resident-campaign-row { position: relative; display: grid; grid-template-columns: 80px minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); padding: var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-surface); background: var(--color-surface); }
.resident-campaign-thumb { width: 80px; height: 80px; overflow: hidden; border-radius: var(--radius-control); background: var(--color-surface-subtle); }
.resident-campaign-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
.resident-campaign-thumb-empty { display: grid; place-items: center; height: 100%; color: var(--color-text-tertiary); font-size: var(--font-size-caption); }
.resident-campaign-row-body { min-width: 0; display: grid; gap: 4px; }
.resident-campaign-row h3 { display: -webkit-box; margin: 0; overflow: hidden; font-size: 15px; font-weight: var(--font-weight-strong); line-height: 1.35; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.resident-campaign-row h3 a { color: inherit; text-decoration: none; }
/* The title link covers the whole row, so the full card is one 44px+ target. */
.resident-campaign-row h3 a::after { content: ""; position: absolute; inset: 0; border-radius: inherit; }
.resident-campaign-row h3 a:focus-visible { outline: none; }
.resident-campaign-row h3 a:focus-visible::after { outline: 2px solid var(--color-focus); outline-offset: 2px; }
.resident-campaign-price { margin: 0; font-size: var(--font-size-dense); }
.resident-campaign-price strong { font-weight: var(--font-weight-strong); font-variant-numeric: tabular-nums; }
.resident-campaign-meta { display: flex; flex-wrap: wrap; gap: 2px var(--space-2); margin: 0; color: var(--color-text-secondary); font-size: var(--font-size-caption); font-variant-numeric: tabular-nums; }
.resident-campaign-meta .is-soon { color: var(--color-warning); font-weight: var(--font-weight-strong); }
.resident-campaign-chevron { color: var(--color-text-tertiary); font-size: 20px; }
.resident-campaign-row[data-status="closed"] { background: var(--color-surface-subtle); }
.resident-campaign-row[data-status="closed"] .resident-campaign-thumb { opacity: 0.6; }
.resident-list-more { width: 100%; margin-top: var(--space-2); }

@media (min-width: 1024px) {
  .resident-campaign-grid[data-group="open"] { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3); }
  .resident-campaign-grid[data-group="open"] .resident-campaign-row { grid-template-columns: minmax(0, 1fr); align-items: start; padding: 0; overflow: hidden; }
  .resident-campaign-grid[data-group="open"] .resident-campaign-thumb { width: 100%; height: auto; aspect-ratio: 4 / 3; border-radius: 0; }
  .resident-campaign-grid[data-group="open"] .resident-campaign-row-body { padding: 0 var(--space-3) var(--space-3); }
  .resident-campaign-grid[data-group="open"] .resident-campaign-chevron { display: none; }
  .resident-campaign-grid[data-group="closed"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .resident-campaign-grid[data-group="closed"] .resident-campaign-row { grid-template-columns: 48px minmax(0, 1fr) auto; }
  .resident-campaign-grid[data-group="closed"] .resident-campaign-thumb { width: 48px; height: 48px; }
}
```

- [ ] **Step 5: 更新依賴列表文案的其他測試**

`src/LocalLiveApps.test.tsx`：
- 4 處 `screen.findByRole('heading', { name: '全部開團' })`（約第 155、193、226、255 行）改成 `screen.findByRole('heading', { name: '團購' })`。
- 約第 157 行 `expect(screen.getByRole('img', { name: '彭梓育的LINE頭貼' })).toBeInTheDocument()` 改成 `expect(screen.getByRole('button', { name: 'LINE 帳號：彭梓育' })).toBeInTheDocument()`。
- 約第 160 行 `await user.click(screen.getByRole('button', { name: '登出' }))` 改成兩行：

```tsx
    await user.click(screen.getByRole('button', { name: 'LINE 帳號：彭梓育' }))
    await user.click(screen.getByRole('menuitem', { name: '登出' }))
```

`src/RuntimeApp.test.tsx`（`opens the resident list at root…` 測試）：
- `screen.getByRole('heading', { name: '全部開團' })` → `screen.getByRole('heading', { name: '團購' })`
- `screen.getByRole('link', { name: '查看一涼製冰所 超厚三明治冰餅' })` → `screen.getByRole('link', { name: '一涼製冰所 超厚三明治冰餅' })`

- [ ] **Step 6: 確認測試通過**

Run: `npx vitest run src/ResidentCampaignListApp.test.tsx src/LocalLiveApps.test.tsx src/RuntimeApp.test.tsx`
Expected: 全部 PASS。

Run: `npx tsc -b` → 無錯誤。

- [ ] **Step 7: 刪除舊列表樣式並 commit**

```bash
git rm src/ResidentCampaignListApp.css
npx vitest run src/ResidentCampaignListApp.test.tsx
git add src/ResidentCampaignListApp.tsx src/ResidentCampaignListApp.test.tsx src/components/resident/resident.css src/LocalLiveApps.test.tsx src/RuntimeApp.test.tsx
git commit -m "feat: redesign the resident campaign list"
```

---

### Task 6: 團購頁區塊元件

**Files:**
- Create: `src/components/resident/CampaignSummary.tsx`
- Create: `src/components/resident/CampaignInfo.tsx`
- Create: `src/components/resident/ProductRow.tsx`
- Create: `src/components/resident/OrderBreakdown.tsx`
- Create: `src/components/resident/OrderSummaryBar.tsx`
- Create: `src/components/resident/OrderWall.tsx`
- Create: `src/components/resident/ResidentBindingForm.tsx`
- Create: `src/components/resident/residentComponents.test.tsx`
- Modify: `src/components/resident/resident.css`（檔尾新增）

**Interfaces:**
- Consumes: `ImageGallery`（Task 3）、`Button`、`StickyActionBar`、`StatusBadge`、`ProgressBar`、`QuantityControl`、`FeedbackMessage`（第 1 階段）。
- Produces（Task 7 使用）：
  - `CampaignSummary({ title, status, priceText, arrivalLabel?, closingText: string | null, progress: CampaignProgress, orderCount, openedAt })`，`type CampaignProgress = { value; max; text; remainingText; formed: boolean }`
  - `CampaignInfo({ images, announcement, onOpenImage(index) })`
  - `ProductRow({ code, name, priceText, listPrice?, hint?, quantity, disabled, onDecrement, onIncrement })`
  - `OrderBreakdown({ lines: BreakdownLine[], customItems, total, savings, quantityUnit })`，`type BreakdownLine = PricedOrderLine & { label; name; discountText }`
  - `OrderSummaryBar({ quantity, quantityUnit, amount, customQuantity, onShowBreakdown?, submitDisabled, submitting, onSubmit, hint? })`，區域名稱「訂單摘要與送出」，明細鈕名稱「查看訂單明細」
  - `OrderWall({ orders, currentCustomerId?, quantityUnit, itemDisplayLabel })`，區域名稱「大家的訂單」
  - `ResidentBindingForm({ identity?, disabled, onBind(input): Promise<void> })`，並匯出 `type ResidentBindingInput`、`type VerifiedResidentIdentity`

- [ ] **Step 1: 寫失敗測試**

`src/components/resident/residentComponents.test.tsx`：

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CampaignSummary } from './CampaignSummary'
import { CampaignInfo } from './CampaignInfo'
import { OrderBreakdown } from './OrderBreakdown'
import { OrderSummaryBar } from './OrderSummaryBar'
import { OrderWall } from './OrderWall'
import { ResidentBindingForm } from './ResidentBindingForm'
import type { VisibleOrder } from '../../data/demo'

const progress = { value: 62, max: 100, text: '62 個 / 100 個', remainingText: '還差 38 個成團', formed: false }

describe('resident campaign page parts', () => {
  it('summarises status, price, schedule and progress', () => {
    const { rerender } = render(
      <CampaignSummary title="冰餅團" status="open" priceText="$45／個" arrivalLabel="10月中"
        closingText="10/15（五）12:00" progress={progress} orderCount={6} openedAt="2026-08-14T00:05:09.000Z" />,
    )

    expect(screen.getByRole('heading', { level: 1, name: '冰餅團' })).toBeInTheDocument()
    expect(screen.getByText('開團中')).toBeInTheDocument()
    expect(screen.getByText('$45／個')).toBeInTheDocument()
    expect(screen.getByText('10月中')).toBeInTheDocument()
    expect(screen.getByText('10/15（五）12:00')).toBeInTheDocument()
    expect(screen.getByText('還差 38 個成團')).not.toHaveClass('is-formed')
    expect(screen.getByText('已有 6 筆訂單・開團 2026/08/14 08:05')).toBeInTheDocument()

    rerender(
      <CampaignSummary title="冰餅團" status="closed" priceText="$45／個" closingText={null}
        progress={{ ...progress, remainingText: '已成團', formed: true }} orderCount={6} openedAt={null} />,
    )
    expect(screen.getByText('已結單')).toBeInTheDocument()
    expect(screen.getByText('貨到通知')).toBeInTheDocument()
    expect(screen.queryByText('結單')).not.toBeInTheDocument()
    expect(screen.getByText('已成團')).toHaveClass('is-formed')
    expect(screen.getByText('已有 6 筆訂單')).toBeInTheDocument()
  })

  it('collapses only long announcements', async () => {
    const user = userEvent.setup()
    const longText = Array.from({ length: 12 }, (_, index) => `第 ${index + 1} 行`).join('\n')
    const { rerender } = render(<CampaignInfo images={[]} announcement={longText} onOpenImage={vi.fn()} />)

    expect(screen.getByRole('heading', { name: '開團資訊' })).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: '展開全文' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(screen.getByRole('button', { name: '收合' })).toHaveAttribute('aria-expanded', 'true')

    rerender(<CampaignInfo images={[]} announcement="短公告" onOpenImage={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /展開全文|收合/ })).not.toBeInTheDocument()

    rerender(<CampaignInfo images={[]} announcement="  " onOpenImage={vi.fn()} />)
    expect(screen.queryByRole('heading', { name: '開團資訊' })).not.toBeInTheDocument()
  })

  it('lists priced lines, custom items and savings in the breakdown', () => {
    render(
      <OrderBreakdown
        quantityUnit="個"
        total={706}
        savings={113}
        customItems={[{ id: 'custom-1', name: '限定蛋糕', quantity: 2 }]}
        lines={[{
          code: 'A', label: 'A', name: '五花肉片', discountText: '任選三件85折', quantity: 2, listUnitPrice: 170,
          discountRate: 0.85, discountType: 'mix_match', promotionName: '任選三件85折', finalUnitPrice: 145, lineTotal: 290,
        }]}
      />,
    )

    expect(screen.getByText('五花肉片')).toBeInTheDocument()
    expect(screen.getByText('2 × $145')).toBeInTheDocument()
    expect(screen.getByText('$290')).toBeInTheDocument()
    expect(screen.getByText('限定蛋糕')).toBeInTheDocument()
    expect(screen.getByText('金額另計')).toBeInTheDocument()
    expect(screen.getByText('$706')).toBeInTheDocument()
    expect(screen.getByText('已省 $113')).toBeInTheDocument()
  })

  it('keeps the order total, breakdown and submit together with the reason it is disabled', async () => {
    const user = userEvent.setup()
    const showBreakdown = vi.fn()
    render(
      <OrderSummaryBar quantity={6} quantityUnit="個" amount={270} customQuantity={2} onShowBreakdown={showBreakdown}
        submitDisabled submitting={false} onSubmit={vi.fn()} hint="選擇品項後即可送出。" />,
    )

    const bar = screen.getByRole('region', { name: '訂單摘要與送出' })
    expect(within(bar).getByText('6 個')).toBeInTheDocument()
    expect(within(bar).getByText('$270')).toBeInTheDocument()
    expect(within(bar).getByText('另有 2 個額外品項・金額另計')).toBeInTheDocument()
    expect(within(bar).getByText('選擇品項後即可送出。')).toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: '送出訂單' })).toBeDisabled()
    await user.click(within(bar).getByRole('button', { name: '查看訂單明細' }))
    expect(showBreakdown).toHaveBeenCalledOnce()
  })

  it('shows the order wall without households, marks the resident and caps the first view at twenty', async () => {
    const user = userEvent.setup()
    const orders: VisibleOrder[] = Array.from({ length: 23 }, (_, index) => ({
      customerId: `customer-${index}`,
      name: `住戶${index + 1}`,
      period: 2,
      unit: `2A${index + 1}`,
      householdKind: 'resident',
      items: { A: 1 },
      orderedAt: new Date(Date.UTC(2026, 7, 14, 0, index)).toISOString(),
      updatedAt: new Date(Date.UTC(2026, 7, 14, 0, index)).toISOString(),
    }))
    render(<OrderWall orders={orders} currentCustomerId="customer-0" quantityUnit="個" itemDisplayLabel={(code) => code} />)

    const wall = screen.getByRole('region', { name: '大家的訂單' })
    expect(within(wall).getByText('23 筆・即時更新')).toBeInTheDocument()
    expect(within(wall).getAllByRole('listitem')).toHaveLength(20)
    expect(within(wall).getByText('（你）')).toBeInTheDocument()
    expect(within(wall).queryByText(/2A1/)).not.toBeInTheDocument()
    await user.click(within(wall).getByRole('button', { name: '顯示全部 23 筆' }))
    expect(within(wall).getAllByRole('listitem')).toHaveLength(23)
  })

  it('binds someone outside the community and shows a safe binding error', async () => {
    const user = userEvent.setup()
    const onBind = vi.fn()
      .mockRejectedValueOnce({ code: '23505', message: '此期別與戶號已由其他住戶綁定', details: 'sensitive database detail' })
      .mockResolvedValueOnce(undefined)
    render(<ResidentBindingForm identity={{ displayName: '富美', pictureUrl: null }} disabled={false} onBind={onBind} />)

    expect(screen.getByRole('heading', { name: '首次填寫住戶資料' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '儲存住戶資料' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('此期別與戶號已由其他住戶綁定')
    expect(screen.getByRole('alert')).not.toHaveTextContent('sensitive database detail')

    await user.selectOptions(screen.getByRole('combobox', { name: '期別' }), '其他')
    expect(screen.queryByRole('combobox', { name: '樓層' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '儲存住戶資料' }))
    expect(onBind).toHaveBeenLastCalledWith({ kind: 'other', period: null, unit: null })
  })
})
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/components/resident/residentComponents.test.tsx`
Expected: FAIL（找不到各元件模組）。

- [ ] **Step 3: 建立 `CampaignSummary.tsx`**

```tsx
import { ProgressBar } from '../ui/ProgressBar'
import { StatusBadge } from '../ui/StatusBadge'
import { normalizeArrivalLabel } from '../../domain/campaignSchedule'
import { campaignStatusLabel, type CampaignStatus } from '../../domain/orderWorkflow'
import { formatZhTwTimestamp } from '../../domain/timestamp'

export type CampaignProgress = {
  value: number
  max: number
  text: string
  remainingText: string
  formed: boolean
}

type CampaignSummaryProps = {
  title: string
  status: CampaignStatus
  priceText: string
  arrivalLabel?: string
  closingText: string | null
  progress: CampaignProgress
  orderCount: number
  openedAt: string | null
}

export function CampaignSummary({ title, status, priceText, arrivalLabel, closingText, progress, orderCount, openedAt }: CampaignSummaryProps) {
  return (
    <section className="resident-card resident-summary" aria-labelledby="campaign-title">
      <div className="resident-summary-main">
        <StatusBadge tone={status === 'open' ? 'success' : 'neutral'}>{campaignStatusLabel(status)}</StatusBadge>
        <h1 id="campaign-title">{title}</h1>
        <p className="resident-summary-price">{priceText}</p>
        <dl className="resident-summary-facts">
          <div><dt>預計到貨</dt><dd>{normalizeArrivalLabel(arrivalLabel)}</dd></div>
          {closingText && <div><dt>結單</dt><dd>{closingText}</dd></div>}
        </dl>
      </div>
      <div className="resident-summary-progress">
        <p className="resident-summary-progress-text">
          <strong>{progress.text}</strong>
          <span className={progress.formed ? 'is-formed' : undefined}>{progress.remainingText}</span>
        </p>
        <ProgressBar label="成團進度" value={progress.value} max={progress.max} />
        <p className="resident-summary-meta">
          已有 {orderCount} 筆訂單{openedAt ? `・開團 ${formatZhTwTimestamp(openedAt)}` : ''}
        </p>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: 建立 `CampaignInfo.tsx`**

```tsx
import { useState } from 'react'
import LinkifiedText from '../LinkifiedText'
import { Button } from '../ui/Button'
import { ImageGallery } from '../ui/ImageGallery'
import type { CampaignImage } from '../../services/demoCampaignStore'

const COLLAPSE_LINE_COUNT = 10
const COLLAPSE_CHARACTER_COUNT = 400

type CampaignInfoProps = {
  images: CampaignImage[]
  announcement: string
  onOpenImage: (index: number) => void
}

export function CampaignInfo({ images, announcement, onOpenImage }: CampaignInfoProps) {
  const [expanded, setExpanded] = useState(false)
  const hasAnnouncement = announcement.trim().length > 0
  if (images.length === 0 && !hasAnnouncement) return null
  const collapsible = announcement.split('\n').length > COLLAPSE_LINE_COUNT || announcement.length > COLLAPSE_CHARACTER_COUNT

  return (
    <section className="resident-card resident-info" aria-labelledby="campaign-info-heading">
      <h2 id="campaign-info-heading">開團資訊</h2>
      <div className="resident-info-body" data-has-images={images.length > 0 || undefined}>
        {images.length > 0 && <ImageGallery images={images} onOpen={onOpenImage} />}
        {hasAnnouncement && (
          <div>
            <div id="campaign-announcement" className={`resident-announcement${collapsible && !expanded ? ' is-collapsed' : ''}`}>
              <LinkifiedText text={announcement} />
            </div>
            {collapsible && (
              <Button
                variant="utility"
                size="sm"
                className="resident-announcement-toggle"
                aria-controls="campaign-announcement"
                aria-expanded={expanded}
                onClick={() => setExpanded((current) => !current)}
              >{expanded ? '收合' : '展開全文'}</Button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 5: 建立 `ProductRow.tsx`**

```tsx
import { QuantityControl } from '../ui/QuantityControl'

type ProductRowProps = {
  code: string
  name: string
  priceText: string
  listPrice?: number
  hint?: string
  quantity: number
  disabled: boolean
  onDecrement: () => void
  onIncrement: () => void
}

export function ProductRow({ code, name, priceText, listPrice, hint, quantity, disabled, onDecrement, onIncrement }: ProductRowProps) {
  return (
    <div className="resident-product-row">
      <span className="resident-product-code">{code}</span>
      <div className="resident-product-name">
        <strong>{name}</strong>
        {listPrice !== undefined && <small className="resident-product-list-price">原價 ${listPrice}</small>}
        <span className="resident-product-price">{priceText}</span>
        {hint && <small>{hint}</small>}
      </div>
      <QuantityControl
        label={`${code} ${name}`}
        value={quantity}
        disabled={disabled}
        onDecrement={onDecrement}
        onIncrement={onIncrement}
      />
    </div>
  )
}
```

- [ ] **Step 6: 建立 `OrderBreakdown.tsx`**

```tsx
import type { CustomOrderItem } from '../../domain/customOrderItem'
import type { PricedOrderLine } from '../../domain/discountPricing'

export type BreakdownLine = PricedOrderLine & {
  label: string
  name: string
  discountText: string
}

type OrderBreakdownProps = {
  lines: BreakdownLine[]
  customItems: CustomOrderItem[]
  total: number
  savings: number
  quantityUnit: string
}

export function OrderBreakdown({ lines, customItems, total, savings, quantityUnit }: OrderBreakdownProps) {
  const filledCustomItems = customItems.filter((item) => item.quantity > 0)
  const customQuantity = filledCustomItems.reduce((sum, item) => sum + item.quantity, 0)
  return (
    <div className="resident-breakdown">
      <ul className="resident-breakdown-lines">
        {lines.map((line) => (
          <li key={line.code}>
            <span className="resident-product-code">{line.label}</span>
            <div>
              <strong>{line.name}</strong>
              <small>
                <span className="resident-breakdown-discount">{line.discountText}</span>
                {line.listUnitPrice !== line.finalUnitPrice ? `・原價 $${line.listUnitPrice}` : ''}
              </small>
            </div>
            <span>{line.quantity} × ${line.finalUnitPrice}</span>
            <strong>${line.lineTotal}</strong>
          </li>
        ))}
        {filledCustomItems.map((item) => (
          <li key={item.id} className="is-custom">
            <span className="resident-product-code">＋</span>
            <div><strong>{item.name || '未命名額外品項'}</strong><small>額外品項</small></div>
            <span>{item.quantity} {quantityUnit}</span>
            <strong>金額另計</strong>
          </li>
        ))}
      </ul>
      <div className="resident-breakdown-total">
        <div>
          <span>商品合計</span>
          {savings > 0 && <small>已省 ${savings}</small>}
          {customQuantity > 0 && <small>另有 {customQuantity} {quantityUnit}額外品項，金額另計</small>}
        </div>
        <strong>${total}</strong>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: 建立 `OrderSummaryBar.tsx`**

```tsx
import { Button } from '../ui/Button'
import { StickyActionBar } from '../ui/StickyActionBar'

type OrderSummaryBarProps = {
  quantity: number
  quantityUnit: string
  amount: number
  customQuantity: number
  onShowBreakdown?: () => void
  submitDisabled: boolean
  submitting: boolean
  onSubmit: () => void
  hint?: string | null
}

export function OrderSummaryBar({ quantity, quantityUnit, amount, customQuantity, onShowBreakdown, submitDisabled, submitting, onSubmit, hint }: OrderSummaryBarProps) {
  return (
    <StickyActionBar className="resident-order-bar" ariaLabel="訂單摘要與送出">
      <div className="resident-order-bar-row">
        <div className="resident-order-bar-total">
          <span className="resident-order-bar-label">本次訂單</span>
          <span className="resident-order-bar-quantity">{quantity} {quantityUnit}</span>
          <strong>${amount}</strong>
        </div>
        {onShowBreakdown && (
          <Button variant="utility" size="sm" aria-label="查看訂單明細" onClick={onShowBreakdown}>明細</Button>
        )}
        <Button className="resident-submit" onClick={onSubmit} disabled={submitDisabled} loading={submitting} loadingLabel="訂單送出中…">送出訂單</Button>
      </div>
      {customQuantity > 0 && <p className="resident-order-bar-note">另有 {customQuantity} {quantityUnit}額外品項・金額另計</p>}
      {hint && <p className="resident-order-bar-hint">{hint}</p>}
    </StickyActionBar>
  )
}
```

- [ ] **Step 8: 建立 `OrderWall.tsx`**

```tsx
import { useState } from 'react'
import type { VisibleOrder } from '../../data/demo'
import { formatZhTwTimestamp, wasMeaningfullyUpdated } from '../../domain/timestamp'
import { Button } from '../ui/Button'

const WALL_PREVIEW_COUNT = 20

type OrderWallProps = {
  orders: VisibleOrder[]
  currentCustomerId?: string
  quantityUnit: string
  itemDisplayLabel: (code: string) => string
}

const orderQuantity = (items: Record<string, number>) => Object.values(items).reduce((sum, quantity) => sum + quantity, 0)

export function OrderWall({ orders, currentCustomerId, quantityUnit, itemDisplayLabel }: OrderWallProps) {
  const [showAll, setShowAll] = useState(false)
  const sorted = [...orders].sort((left, right) => Date.parse(left.orderedAt) - Date.parse(right.orderedAt)
    || left.customerId.localeCompare(right.customerId))
  const visible = showAll ? sorted : sorted.slice(0, WALL_PREVIEW_COUNT)

  return (
    <section className="resident-card resident-wall" aria-labelledby="wall-heading">
      <div className="resident-section-heading">
        <h2 id="wall-heading">大家的訂單</h2>
        <span>{orders.length} 筆・即時更新</span>
      </div>
      {orders.length === 0 ? <p className="resident-empty">還沒有人下單。</p> : (
        <ul className="resident-wall-list">
          {visible.map((order) => {
            const own = order.customerId === currentCustomerId
            const customItems = order.customItems ?? []
            const customQuantity = customItems.reduce((sum, item) => sum + item.quantity, 0)
            return (
              <li key={order.customerId} className={own ? 'is-own' : undefined}>
                {order.pictureUrl
                  ? <img className="resident-avatar" src={order.pictureUrl} alt={`${order.name}的LINE頭貼`} referrerPolicy="no-referrer" />
                  : <span className="resident-avatar" aria-hidden="true">{order.name.slice(0, 1).toUpperCase()}</span>}
                <div className="resident-wall-main">
                  <p className="resident-wall-name"><strong>{order.name}</strong>{own && <span>（你）</span>}</p>
                  <p>{Object.entries(order.items)
                    .filter(([, quantity]) => quantity > 0)
                    .map(([code, quantity]) => `${itemDisplayLabel(code)}+${quantity}`)
                    .join('、') || '無正式品項'}</p>
                  {customItems.length > 0 && (
                    <p className="resident-wall-custom">{customItems.map((item) => `${item.name}×${item.quantity}（另計）`).join('、')}</p>
                  )}
                  <p className="resident-wall-time">
                    下單時間 {formatZhTwTimestamp(order.orderedAt)}
                    {wasMeaningfullyUpdated(order.orderedAt, order.updatedAt) && (
                      <span>已修改・最後修改 {formatZhTwTimestamp(order.updatedAt)}</span>
                    )}
                  </p>
                </div>
                <div className="resident-wall-total">
                  <strong>{orderQuantity(order.items)}{quantityUnit}</strong>
                  {customQuantity > 0 && <small>另有 {customQuantity} {quantityUnit}額外品項</small>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {!showAll && orders.length > WALL_PREVIEW_COUNT && (
        <Button variant="utility" onClick={() => setShowAll(true)}>顯示全部 {orders.length} 筆</Button>
      )}
    </section>
  )
}
```

- [ ] **Step 9: 建立 `ResidentBindingForm.tsx`**

```tsx
import { useState } from 'react'
import { Button } from '../ui/Button'
import { FeedbackMessage } from '../ui/FeedbackMessage'
import {
  formatHouseholdUnit,
  HOUSEHOLD_LETTERS,
  HOUSEHOLD_NUMBERS,
  HOUSEHOLD_PREFIXES,
  RESIDENT_PERIODS,
  type HouseholdKind,
  type ResidentPeriod,
} from '../../domain/household'

export type ResidentBindingInput = { kind: HouseholdKind; period: number | null; unit: string | null }

export type VerifiedResidentIdentity = {
  displayName: string
  pictureUrl: string | null
}

const safeResidentBindingMessages = new Set([
  '這個戶號已被綁定',
  '此期別與戶號已由其他住戶綁定',
  '住戶資料已綁定，如需變更請聯絡團主',
  '住戶期別或戶號不符合社區編碼',
  '請先完成LINE住戶驗證',
])

function residentBindingErrorMessage(error: unknown): string {
  const errorRecord = error && typeof error === 'object' ? error as Record<string, unknown> : null
  const message = error instanceof Error
    ? error.message
    : typeof errorRecord?.message === 'string' ? errorRecord.message : ''
  const code = typeof errorRecord?.code === 'string' ? errorRecord.code : ''
  const status = typeof errorRecord?.status === 'number' ? errorRecord.status : null

  if (safeResidentBindingMessages.has(message)) return message
  if (status === 401 || code === 'PGRST301' || /jwt|authentication required/i.test(message)) {
    return '登入狀態已失效，請重新開啟LINE頁面後再試。'
  }
  if (error instanceof TypeError || status === 0 || /failed to fetch|network|timeout/i.test(message)) {
    return '連線失敗，請確認網路後再試。'
  }
  return '住戶資料儲存失敗，請稍後再試。'
}

const periodFormatter = new Intl.NumberFormat('zh-Hant-u-nu-hanidec')

type ResidentBindingFormProps = {
  identity?: VerifiedResidentIdentity
  disabled: boolean
  onBind: (input: ResidentBindingInput) => Promise<void>
}

export function ResidentBindingForm({ identity, disabled, onBind }: ResidentBindingFormProps) {
  const [householdKind, setHouseholdKind] = useState<HouseholdKind>('resident')
  const [period, setPeriod] = useState<ResidentPeriod>(2)
  const [prefix, setPrefix] = useState(1)
  const [letter, setLetter] = useState('A')
  const [floor, setFloor] = useState(1)
  const [binding, setBinding] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setBinding(true)
    setError('')
    try {
      await onBind(householdKind === 'other'
        ? { kind: 'other', period: null, unit: null }
        : {
            kind: 'resident',
            period,
            unit: formatHouseholdUnit({ kind: 'resident', period, prefix: period === 1 ? null : prefix, letter, number: floor }),
          })
    } catch (failure) {
      setError(residentBindingErrorMessage(failure))
    } finally {
      setBinding(false)
    }
  }

  return (
    <div className="resident-binding">
      <h3>首次填寫住戶資料</h3>
      <p className="resident-binding-intro">完成一次綁定後，即可選擇品項並送出訂單。</p>
      {identity && (
        <div className="resident-verified-identity">
          {identity.pictureUrl
            ? <img className="resident-avatar" src={identity.pictureUrl} alt={`${identity.displayName}的LINE頭貼`} referrerPolicy="no-referrer" />
            : <span className="resident-avatar" aria-hidden="true">{identity.displayName.slice(0, 1)}</span>}
          <div><small>LINE驗證身分</small><strong>{identity.displayName}</strong></div>
        </div>
      )}
      <div className="resident-binding-fields">
        <label>
          <span>期別</span>
          <select
            className="ui-input"
            value={householdKind === 'other' ? 'other' : period}
            onChange={(event) => {
              if (event.target.value === 'other') {
                setHouseholdKind('other')
              } else {
                setHouseholdKind('resident')
                setPeriod(Number(event.target.value) as ResidentPeriod)
              }
            }}
          >
            {RESIDENT_PERIODS.map((value) => <option key={value} value={value}>{periodFormatter.format(value)}期</option>)}
            <option value="other">其他</option>
          </select>
        </label>
        {householdKind === 'resident' && (
          <>
            <fieldset className="resident-binding-unit">
              <legend>戶號</legend>
              <div className="resident-binding-unit-parts">
                {period !== 1 && (
                  <label>
                    <span>數字</span>
                    <select className="ui-input" aria-label="戶號數字" value={prefix} onChange={(event) => setPrefix(Number(event.target.value))}>
                      {HOUSEHOLD_PREFIXES.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                )}
                <label>
                  <span>英文字母</span>
                  <select className="ui-input" aria-label="戶號英文字母" value={letter} onChange={(event) => setLetter(event.target.value)}>
                    {HOUSEHOLD_LETTERS.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              </div>
            </fieldset>
            <label>
              <span>樓層</span>
              <select className="ui-input" value={floor} onChange={(event) => setFloor(Number(event.target.value))}>
                {HOUSEHOLD_NUMBERS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </>
        )}
      </div>
      <Button onClick={() => { void submit() }} disabled={disabled} loading={binding} loadingLabel="住戶資料儲存中…">儲存住戶資料</Button>
      {error && <FeedbackMessage className="resident-binding-feedback" tone="error">{error}</FeedbackMessage>}
      <p className="resident-binding-note">住戶資料只用於辨識訂單；同一戶號可由多個LINE帳號各自下單。</p>
    </div>
  )
}
```

- [ ] **Step 10: 加入區塊樣式**

在 `src/components/resident/resident.css` 檔尾加入：

```css
/* Campaign page parts */
.resident-card { padding: var(--space-4); background: var(--color-surface); }
.resident-card h2 { margin: 0; font-size: 17px; font-weight: var(--font-weight-strong); }
.resident-section-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--space-1) var(--space-3); margin-bottom: var(--space-3); }
.resident-section-heading span { color: var(--color-text-secondary); font-size: var(--font-size-dense); }
.resident-empty { margin: 0; color: var(--color-text-secondary); font-size: var(--font-size-dense); }

.resident-summary { display: grid; gap: var(--space-4); }
.resident-summary h1 { margin: var(--space-2) 0 var(--space-1); font-size: 20px; font-weight: var(--font-weight-strong); line-height: var(--line-height-heading); }
.resident-summary-price { margin: 0; font-variant-numeric: tabular-nums; }
.resident-summary-facts { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); margin: var(--space-2) 0 0; font-size: var(--font-size-dense); }
.resident-summary-facts div { display: flex; gap: var(--space-2); }
.resident-summary-facts dt { color: var(--color-text-secondary); }
.resident-summary-facts dd { margin: 0; font-weight: var(--font-weight-strong); }
.resident-summary-progress-text { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--space-2); margin: 0 0 var(--space-2); }
.resident-summary-progress-text strong { font-size: 20px; font-weight: var(--font-weight-strong); font-variant-numeric: tabular-nums; }
.resident-summary-progress-text span { color: var(--color-warning); font-size: var(--font-size-dense); font-weight: var(--font-weight-strong); }
.resident-summary-progress-text .is-formed { color: var(--color-success); }
.resident-summary-meta { margin: var(--space-2) 0 0; color: var(--color-text-secondary); font-size: var(--font-size-caption); }

.resident-info-body { display: grid; gap: var(--space-3); margin-top: var(--space-3); }
.resident-announcement { overflow-wrap: anywhere; white-space: pre-wrap; }
.resident-announcement.is-collapsed { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 10; }
.resident-announcement-toggle { margin-top: var(--space-2); }

.resident-product-row { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); padding: var(--space-2) 0; border-top: 1px solid var(--color-divider); }
.resident-product-code { width: 28px; height: 28px; display: grid; place-items: center; border-radius: var(--radius-sm); background: var(--color-surface-subtle); font-size: var(--font-size-dense); font-weight: var(--font-weight-strong); }
.resident-product-name { min-width: 0; display: grid; }
.resident-product-name strong { font-weight: var(--font-weight-strong); overflow-wrap: anywhere; }
.resident-product-price { color: var(--color-text-secondary); font-size: var(--font-size-dense); font-variant-numeric: tabular-nums; }
.resident-product-list-price { color: var(--color-text-tertiary); font-size: var(--font-size-caption); text-decoration: line-through; }
.resident-product-name small { color: var(--color-text-secondary); font-size: var(--font-size-caption); }

.resident-breakdown-lines { display: grid; margin: 0; padding: 0; list-style: none; }
.resident-breakdown-lines li { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto auto; align-items: center; gap: var(--space-3); padding: var(--space-2) 0; border-top: 1px solid var(--color-divider); font-size: var(--font-size-dense); font-variant-numeric: tabular-nums; }
.resident-breakdown-lines li:first-child { border-top: 0; }
.resident-breakdown-lines li div { min-width: 0; display: grid; }
.resident-breakdown-lines small { color: var(--color-text-secondary); font-size: var(--font-size-caption); }
.resident-breakdown-total { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--space-3); margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--color-border); }
.resident-breakdown-total div { display: grid; }
.resident-breakdown-total small { color: var(--color-text-secondary); font-size: var(--font-size-caption); }
.resident-breakdown-total strong { font-size: 20px; font-weight: var(--font-weight-strong); font-variant-numeric: tabular-nums; }

/* The order bar is fixed to the bottom on phones and sits inside the order rail on desktop (Task 7). */
.resident-order-bar { position: fixed; right: 0; bottom: 0; left: 0; }
.resident-order-bar-row { display: flex; align-items: center; gap: var(--space-2); width: min(100%, 1200px); margin: 0 auto; }
.resident-order-bar-total { flex: 1; min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: baseline; column-gap: var(--space-2); }
.resident-order-bar-label { grid-column: 1 / -1; color: var(--color-text-secondary); font-size: var(--font-size-caption); }
.resident-order-bar-quantity { font-size: var(--font-size-dense); font-variant-numeric: tabular-nums; }
.resident-order-bar-total strong { font-size: 20px; font-weight: var(--font-weight-strong); font-variant-numeric: tabular-nums; }
.resident-order-bar-note,
.resident-order-bar-hint { width: min(100%, 1200px); margin: var(--space-1) auto 0; color: var(--color-text-secondary); font-size: var(--font-size-caption); }

.resident-wall-list { display: grid; margin: 0; padding: 0; list-style: none; }
.resident-wall-list li { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; align-items: start; gap: var(--space-3); padding: var(--space-3) 0; border-top: 1px solid var(--color-divider); }
.resident-wall-list li:first-child { border-top: 0; }
.resident-wall-list li.is-own { margin-inline: calc(var(--space-2) * -1); padding-inline: var(--space-2); border-top-color: transparent; border-radius: var(--radius-control); background: var(--color-primary-subtle); }
.resident-wall-main { min-width: 0; }
.resident-wall-main p { margin: 2px 0 0; color: var(--color-text-secondary); font-size: var(--font-size-dense); overflow-wrap: anywhere; }
.resident-wall-main .resident-wall-name { margin: 0; color: var(--color-text); }
.resident-wall-name strong { font-weight: var(--font-weight-strong); }
.resident-wall-name span { color: var(--color-primary); font-size: var(--font-size-caption); }
.resident-wall-main .resident-wall-custom { color: var(--color-warning); }
.resident-wall-main .resident-wall-time { display: grid; font-size: var(--font-size-caption); }
.resident-wall-total { display: grid; justify-items: end; gap: 2px; font-variant-numeric: tabular-nums; }
.resident-wall-total small { max-width: 96px; color: var(--color-warning); font-size: var(--font-size-caption); text-align: right; }
.resident-wall > .ui-button { width: 100%; margin-top: var(--space-2); }

.resident-binding h3 { margin: 0; font-size: 15px; font-weight: var(--font-weight-strong); }
.resident-binding-intro { margin: var(--space-1) 0 var(--space-3); color: var(--color-text-secondary); font-size: var(--font-size-dense); }
.resident-verified-identity { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); padding: var(--space-2) var(--space-3); border-radius: var(--radius-control); background: var(--color-surface-subtle); }
.resident-verified-identity small { display: block; color: var(--color-text-secondary); font-size: var(--font-size-caption); }
.resident-binding-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--space-3); margin-bottom: var(--space-3); }
.resident-binding-fields label,
.resident-binding-unit { display: grid; gap: 4px; margin: 0; padding: 0; border: 0; color: var(--color-text-secondary); font-size: var(--font-size-caption); }
.resident-binding-unit legend { margin-bottom: 4px; padding: 0; }
.resident-binding-unit-parts { display: flex; gap: var(--space-2); }
.resident-binding > .ui-button { width: 100%; }
.resident-binding-feedback { margin-top: var(--space-3); }
.resident-binding-note { margin: var(--space-3) 0 0; color: var(--color-text-secondary); font-size: var(--font-size-caption); }
```

- [ ] **Step 11: 確認測試通過**

Run: `npx vitest run src/components/resident/residentComponents.test.tsx`
Expected: PASS（6 項）。

Run: `npx tsc -b` 與 `npm run lint` → 無錯誤。

- [ ] **Step 12: Commit**

```bash
git add src/components/resident
git commit -m "feat: add the resident campaign page building blocks"
```

---

### Task 7: 團購頁組合、版面與舊樣式移除

**Files:**
- Modify: `src/App.tsx`（整檔改寫）
- Modify: `src/App.test.tsx`（逐處修改，見 Step 1）
- Modify: `src/LocalLiveApps.test.tsx`（訂單牆與我的訂單 5 處）
- Modify: `src/RuntimeApp.test.tsx`（團購頁那一個斷言）
- Modify: `src/components/resident/resident.css`（檔尾新增頁面版面）
- Delete: `src/App.css`

**Interfaces:**
- Consumes: Task 2 `BottomSheet`、Task 4 `describeAutoClose`、Task 6 全部區塊、第 1 階段 `Toast`。
- `App` 的 props 型別不變（`LocalLiveApps.tsx` 不需修改）；`ResidentBindingInput`、`VerifiedResidentIdentity` 改由 `ResidentBindingForm.tsx` 匯出，`App.tsx` 匯入使用。

- [ ] **Step 1: 修改 `src/App.test.tsx`**

逐處修改（左為原內容，右為新內容；未列出的測試不動）：

1. `shows the verified campaign progress and visible order wall`：`screen.getByText('已有 6 筆訂單，大家的訂單都看得到')` → `screen.getByText('已有 6 筆訂單・開團 2026/08/14 08:05')`
2. `uses the published quantity unit…`：`expect(screen.getByText('我的訂單 6 盒')).toBeInTheDocument()` → `expect(within(screen.getByRole('region', { name: '訂單摘要與送出' })).getByText('6 盒')).toBeInTheDocument()`
3. `previews base and mix-and-match prices…`：把 `const review = screen.getByRole('region', { name: '我的訂單明細' })` 換成下面兩行，並把最後三行（`收合明細`、`queryByText('2 × $145')`、`展開明細`、`getByText('2 × $145')`）換成關閉明細的兩行：

```tsx
    await user.click(screen.getByRole('button', { name: '查看訂單明細' }))
    const review = screen.getByRole('dialog', { name: '訂單明細' })
```

```tsx
    await user.click(within(review).getByRole('button', { name: '關閉訂單明細' }))
    expect(screen.queryByRole('dialog', { name: '訂單明細' })).not.toBeInTheDocument()
```

4. `hides every household from the live wall…`：`screen.getByRole('region', { name: '目前訂單' })` → `screen.getByRole('region', { name: '大家的訂單' })`；`expect(screen.getByRole('heading', { name: '二期 2K13・斯祈' })).toBeInTheDocument()` → `expect(screen.getByText('二期 2K13・斯祈')).toBeInTheDocument()`；並在最後加一行 `expect(within(wall).getByText('（你）')).toBeInTheDocument()`
5. `shows complete campaign images and opens an accessible image viewer`：整個測試換成下面的版本。原測試「第二張圖片載入失敗」的斷言改由 Task 3 的 `ImageGallery` 測試驗證（圖片區已從橫向捲動改成大圖＋縮圖）；其餘檢視器行為（焦點、Tab 循環、滑動、上一張／下一張、背景關閉、Esc、圖片被移除時自動關閉）全部保留：

```tsx
  it('shows campaign images with the announcement and opens an accessible image viewer', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<App />)

    expect(screen.getByText(/🌞炎炎夏日 #冰品最佳首選🧊🍦/)).toBeInTheDocument()
    expect(screen.getByText(/🉐🉐美味代購價一個\$４５元🉐🉐/)).toBeInTheDocument()
    expect(screen.getByText(/保存期限:冷凍約三個月/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '超厚三明治冰餅口味示意圖' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /張圖片/ })).not.toBeInTheDocument()

    rerender(<App publishedContent={{
      title: '多圖團購', unitPrice: 45, threshold: 10, announcement: '多圖公告', items,
      images: [{ src: '/one.jpg', alt: '第一張' }, { src: '/two.jpg', alt: '第二張' }],
      openedAt: '2026-08-14T00:05:09.000Z',
    }} />)
    expect(screen.getByRole('group', { name: '共 2 張圖片' })).toBeInTheDocument()

    const mainImage = screen.getByRole('button', { name: '放大檢視 第 1 張圖片：第一張' })
    await user.click(mainImage)
    const dialog = screen.getByRole('dialog', { name: '圖片檢視 1／2' })
    const closeButton = screen.getByRole('button', { name: '關閉圖片檢視' })
    expect(closeButton).toHaveFocus()
    expect(document.body).toHaveStyle({ overflow: 'hidden' })
    expect(screen.getByRole('img', { name: '第一張（放大檢視）' })).toHaveAttribute('src', '/one.jpg')

    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: '下一張圖片' })).toHaveFocus()
    await user.tab()
    expect(closeButton).toHaveFocus()

    const previousButton = screen.getByRole('button', { name: '上一張圖片' })
    const nextButton = screen.getByRole('button', { name: '下一張圖片' })
    previousButton.style.display = 'none'
    nextButton.style.display = 'none'
    closeButton.focus()
    await user.tab()
    expect(closeButton).toHaveFocus()
    previousButton.style.display = ''
    nextButton.style.display = ''

    const viewerStage = dialog.querySelector<HTMLElement>('.campaign-image-viewer-stage')!
    expect(within(viewerStage).getByRole('button', { name: '上一張圖片' })).toHaveClass('campaign-image-viewer-previous')
    expect(within(viewerStage).getByRole('button', { name: '下一張圖片' })).toHaveClass('campaign-image-viewer-next')
    fireEvent.pointerDown(viewerStage, { pointerId: 1, pointerType: 'touch', clientX: 280, clientY: 200 })
    fireEvent.pointerUp(viewerStage, { pointerId: 1, pointerType: 'touch', clientX: 80, clientY: 205 })
    expect(screen.getByRole('dialog', { name: '圖片檢視 2／2' })).toBeInTheDocument()
    fireEvent.pointerDown(viewerStage, { pointerId: 2, pointerType: 'mouse', button: 0, clientX: 80, clientY: 200 })
    fireEvent.pointerUp(viewerStage, { pointerId: 2, pointerType: 'mouse', button: 0, clientX: 280, clientY: 195 })
    expect(screen.getByRole('dialog', { name: '圖片檢視 2／2' })).toBeInTheDocument()
    fireEvent.pointerDown(viewerStage, { pointerId: 3, pointerType: 'touch', clientX: 280, clientY: 200 })
    fireEvent.pointerDown(viewerStage, { pointerId: 4, pointerType: 'touch', clientX: 220, clientY: 200 })
    fireEvent.pointerUp(viewerStage, { pointerId: 4, pointerType: 'touch', clientX: 80, clientY: 205 })
    fireEvent.pointerUp(viewerStage, { pointerId: 3, pointerType: 'touch', clientX: 300, clientY: 200 })
    expect(screen.getByRole('dialog', { name: '圖片檢視 2／2' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '上一張圖片' }))
    expect(screen.getByRole('dialog', { name: '圖片檢視 1／2' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '下一張圖片' }))
    expect(screen.getByRole('img', { name: '第二張（放大檢視）' })).toHaveAttribute('src', '/two.jpg')

    await user.click(dialog.parentElement!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body).not.toHaveStyle({ overflow: 'hidden' })
    expect(mainImage).toHaveFocus()

    await user.click(mainImage)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mainImage).toHaveFocus()

    await user.click(screen.getByRole('button', { name: '顯示第 2 張圖片' }))
    await user.click(screen.getByRole('button', { name: '放大檢視 第 2 張圖片：第二張' }))
    expect(screen.getByRole('dialog', { name: '圖片檢視 2／2' })).toBeInTheDocument()
    expect(document.body).toHaveStyle({ overflow: 'hidden' })
    rerender(<App publishedContent={{
      title: '多圖團購', unitPrice: 45, threshold: 10, announcement: '多圖公告', items, images: [],
      openedAt: '2026-08-14T00:05:09.000Z',
    }} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(document.body).not.toHaveStyle({ overflow: 'hidden' })
  })
```

6. `provides in-app navigation and lets residents expand a long announcement`：整個測試換成：

```tsx
  it('links back to the campaign list and lets residents expand a long announcement', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('link', { name: '全部團購' })).toHaveAttribute('href', '/')
    const toggle = screen.getByRole('button', { name: '展開全文' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)
    expect(screen.getByRole('button', { name: '收合' })).toHaveAttribute('aria-expanded', 'true')
  })
```

7. `places product information before the resident order flow`：`screen.getByRole('heading', { name: /二期 2K13/ })` → `screen.getByRole('heading', { name: '我的訂單' })`
8. `lets the signed-in customer update only their own order`：`expect(screen.getByText('我的訂單 7 個')).toBeInTheDocument()` → `expect(within(screen.getByLabelText('訂單摘要與送出')).getByText('7 個')).toBeInTheDocument()`
9. `shows order submission failures as an alert and keeps the draft`：`expect(screen.getByText('7 個')).toBeInTheDocument()` → `expect(within(screen.getByLabelText('訂單摘要與送出')).getByText('7 個')).toBeInTheDocument()`
10. `shows a closed campaign and disables every order control`：`screen.getByText('本團已結單，暫停修改訂單。')` → `screen.getByText('本團已結單，無法修改訂單。')`
11. `shows item names and prices without 號…`：把 `it(...,` 的函式改成 `async () => {`，第一行加 `const user = userEvent.setup()`；把 `expect(within(screen.getByRole('region', { name: '我的訂單明細' })).getByText('$150')).toBeInTheDocument()` 換成：

```tsx
    await user.click(screen.getByRole('button', { name: '查看訂單明細' }))
    expect(within(screen.getByRole('dialog', { name: '訂單明細' })).getByText('$150')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '關閉訂單明細' }))
```

並把 `screen.getByRole('region', { name: '目前訂單' })` 改成 `screen.getByRole('region', { name: '大家的訂單' })`。
12. `shows campaign and order timestamps with meaningful edit markers`：`screen.getByText('開團時間 2026/08/14 08:05')` → `screen.getByText('已有 6 筆訂單・開團 2026/08/14 08:05')`
13. `preserves an unsent draft when another household updates through Realtime`：兩處 `screen.getByText('我的訂單 7 個')` → `within(screen.getByLabelText('訂單摘要與送出')).getByText('7 個')`
14. `shows the published arrival and optional automatic closing reminder`：兩個斷言換成：

```tsx
    expect(screen.getByText('預計到貨')).toBeInTheDocument()
    expect(screen.getByText('10月中')).toBeInTheDocument()
    expect(screen.getByText('10/15（五）12:00')).toBeInTheDocument()
```

15. 在檔尾 `})` 之前新增：

```tsx
  it('tells residents what they have already submitted and why submit is disabled', () => {
    render(<App />)

    expect(screen.getByText('你已送出 6 個・$270')).toBeInTheDocument()
    expect(screen.getByText('・最後修改 2026/08/14 08:12')).toBeInTheDocument()
    expect(screen.getByText('結單前都可以回來改數量；要整筆取消請找團主。')).toBeInTheDocument()
  })

  it('explains that items must be chosen before a first order', () => {
    const resident = { ...initialOrders[0], items: {}, householdKind: 'resident' as const }
    render(<App residentCustomer={resident} visibleOrders={[]} />)

    expect(screen.queryByText(/你已送出/)).not.toBeInTheDocument()
    expect(within(screen.getByLabelText('訂單摘要與送出')).getByText('選擇品項後即可送出。')).toBeInTheDocument()
  })
```

- [ ] **Step 2: 修改其他測試**

`src/LocalLiveApps.test.tsx`：
- 兩處 `await screen.findByRole('region', { name: '目前訂單' })`（約第 1871、1929 行）→ `await screen.findByRole('region', { name: '大家的訂單' })`
- `expect(screen.getByRole('heading', { name: '其他・丙' })).toBeInTheDocument()` → `expect(screen.getByText('其他・丙')).toBeInTheDocument()`
- `expect(screen.getByRole('heading', { name: '其他・丁' })).toBeInTheDocument()` → `expect(screen.getByText('其他・丁')).toBeInTheDocument()`
- `expect(screen.getByText('我的訂單 3 個')).toBeInTheDocument()` → `expect(within(screen.getByLabelText('訂單摘要與送出')).getByText('3 個')).toBeInTheDocument()`（若該檔案未匯入 `within`，在 `@testing-library/react` 的 import 加入）

`src/RuntimeApp.test.tsx`：`expect(screen.getByRole('heading', { name: /二期 2K13/ })).toBeInTheDocument()` → `expect(screen.getByText('二期 2K13・斯祈')).toBeInTheDocument()`

- [ ] **Step 3: 確認測試失敗**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL（新文案與結構尚未實作）。

- [ ] **Step 4: 改寫 `src/App.tsx`**

整檔換成：

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { summarizeCampaign } from './domain/campaign'
import { formatZhTwTimestamp, wasMeaningfullyUpdated } from './domain/timestamp'
import type { CampaignStatus } from './domain/orderWorkflow'
import { itemLabel } from './domain/itemLabel'
import { normalizeQuantityUnit } from './domain/quantityUnit'
import { describeAutoClose } from './domain/campaignSchedule'
import { customOrderItemsEqual, validCustomOrderItems, type CustomOrderItem } from './domain/customOrderItem'
import { discountedUnitPrice, priceOrder, type DiscountPricing } from './domain/discountPricing'
import { formatHousehold, type HouseholdKind } from './domain/household'
import { campaign, currentCustomerId, initialOrders, items, type VisibleOrder } from './data/demo'
import { loadPublishedCampaign, normalizeCampaignContent, type CampaignContent } from './services/demoCampaignStore'
import { BottomSheet } from './components/ui/BottomSheet'
import { Button } from './components/ui/Button'
import { FeedbackMessage } from './components/ui/FeedbackMessage'
import { QuantityControl } from './components/ui/QuantityControl'
import { Toast } from './components/ui/Toast'
import { CampaignImageViewer } from './components/CampaignImageViewer'
import { CampaignInfo } from './components/resident/CampaignInfo'
import { CampaignSummary, type CampaignProgress } from './components/resident/CampaignSummary'
import { OrderBreakdown, type BreakdownLine } from './components/resident/OrderBreakdown'
import { OrderSummaryBar } from './components/resident/OrderSummaryBar'
import { OrderWall } from './components/resident/OrderWall'
import { ProductRow } from './components/resident/ProductRow'
import {
  ResidentBindingForm,
  type ResidentBindingInput,
  type VerifiedResidentIdentity,
} from './components/resident/ResidentBindingForm'
import './components/resident/resident.css'

const defaultContent: CampaignContent = {
  title: campaign.title,
  unitPrice: campaign.unitPrice,
  threshold: campaign.threshold,
  announcement: campaign.announcement,
  images: campaign.images,
  items,
  openedAt: campaign.openedAt,
}

const SUCCESS_NOTICE_DURATION = 3500

const orderQuantity = (orderItems: Record<string, number>) =>
  Object.values(orderItems).reduce((sum, quantity) => sum + quantity, 0)

const formatDiscountRate = (rate: number) => {
  const tenths = Number((rate * 10).toFixed(2))
  return `${Number.isInteger(tenths) ? tenths : Number((rate * 100).toFixed(2))}折`
}

const orderItemsEqual = (left: Record<string, number>, right: Record<string, number>) => {
  const codes = new Set([...Object.keys(left), ...Object.keys(right)])
  return [...codes].every((code) => (left[code] ?? 0) === (right[code] ?? 0))
}

type ResidentCustomer = Pick<VisibleOrder, 'customerId' | 'name'> & {
  period: number | null
  unit: string | null
  householdKind: HouseholdKind
}

type AppProps = {
  publishedContent?: CampaignContent
  liveDemo?: boolean
  campaignStatus?: CampaignStatus
  visibleOrders?: VisibleOrder[]
  residentCustomer?: ResidentCustomer | null
  verifiedResidentIdentity?: VerifiedResidentIdentity
  onBindResident?: (input: ResidentBindingInput) => Promise<ResidentCustomer>
  onSubmitOrder?: (items: Record<string, number>, customItems: CustomOrderItem[]) => Promise<void>
  syncError?: string
  onSyncRetry?: () => void
}

type Notice = { id: number; tone: 'success' | 'error'; text: string }

function App({ publishedContent, liveDemo = false, campaignStatus = 'open', visibleOrders, residentCustomer, verifiedResidentIdentity, onBindResident, onSubmitOrder, syncError, onSyncRetry }: AppProps = {}) {
  const [localPublishedCampaign] = useState(() => loadPublishedCampaign(defaultContent))
  const publishedCampaign = useMemo(
    () => normalizeCampaignContent(publishedContent ?? localPublishedCampaign),
    [localPublishedCampaign, publishedContent],
  )
  const itemDisplayLabel = (code: string) => {
    const index = publishedCampaign.items.findIndex((item) => item.code === code)
    return index >= 0 ? itemLabel(index) : code
  }
  const activeItems = publishedCampaign.items.filter((item) => item.active)
  const mixMatchItems = publishedCampaign.mixMatchDiscount
    ? activeItems.filter((item) => item.discountEligible)
    : []
  const regularItems = publishedCampaign.mixMatchDiscount
    ? activeItems.filter((item) => !item.discountEligible)
    : activeItems
  const [localOrders, setLocalOrders] = useState<VisibleOrder[]>(initialOrders)
  const orders = visibleOrders ?? localOrders
  const effectiveCustomer: ResidentCustomer | null = residentCustomer === undefined
    ? { ...initialOrders.find((order) => order.customerId === currentCustomerId)!, householdKind: 'resident' }
    : residentCustomer
  const [boundResident, setBoundResident] = useState<ResidentCustomer | null>(effectiveCustomer)
  const currentResident = residentCustomer === null ? boundResident : effectiveCustomer
  const ownOrder = currentResident
    ? orders.find((order) => order.customerId === currentResident.customerId)
    : undefined

  const [draft, setDraft] = useState<Record<string, number>>({ ...(ownOrder?.items ?? {}) })
  const [savedDraft, setSavedDraft] = useState<Record<string, number>>({ ...(ownOrder?.items ?? {}) })
  const [customDraft, setCustomDraft] = useState<CustomOrderItem[]>(() => ownOrder?.customItems?.map((item) => ({ ...item })) ?? [])
  const [savedCustomDraft, setSavedCustomDraft] = useState<CustomOrderItem[]>(() => ownOrder?.customItems?.map((item) => ({ ...item })) ?? [])
  const customItemSequence = useRef(0)
  const noticeSequence = useRef(0)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const draftDirty = !orderItemsEqual(draft, savedDraft) || !customOrderItemsEqual(customDraft, savedCustomDraft)
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null)

  useEffect(() => {
    if (activeImageIndex !== null && !publishedCampaign.images[activeImageIndex]) {
      setActiveImageIndex(null)
    }
  }, [activeImageIndex, publishedCampaign.images])

  useEffect(() => {
    if (visibleOrders && !draftDirty) {
      const nextSavedDraft = { ...(ownOrder?.items ?? {}) }
      setDraft(nextSavedDraft)
      setSavedDraft(nextSavedDraft)
      const nextCustomDraft = ownOrder?.customItems?.map((item) => ({ ...item })) ?? []
      setCustomDraft(nextCustomDraft)
      setSavedCustomDraft(nextCustomDraft)
    }
  }, [draftDirty, ownOrder, visibleOrders])

  const showNotice = (tone: Notice['tone'], text: string) => {
    noticeSequence.current += 1
    setNotice({ id: noticeSequence.current, tone, text })
  }

  const thresholdKind = publishedCampaign.thresholdKind ?? 'quantity'
  const quantityUnit = normalizeQuantityUnit(publishedCampaign.quantityUnit)
  const thresholdTarget = thresholdKind === 'amount'
    ? (publishedCampaign.amountThreshold ?? publishedCampaign.threshold)
    : publishedCampaign.threshold
  const summary = useMemo(
    () => summarizeCampaign(
      orders,
      publishedCampaign.items.map((item) => ({ code: item.code, unitPrice: item.unitPrice ?? publishedCampaign.unitPrice })),
      { kind: thresholdKind, target: thresholdTarget },
    ),
    [orders, publishedCampaign, thresholdKind, thresholdTarget],
  )
  const draftQuantity = orderQuantity(draft)
  const customDraftQuantity = customDraft.reduce((sum, item) => sum + item.quantity, 0)
  const customDraftValid = customDraft.every((item) => item.name.trim().length > 0 && item.name.trim().length <= 100 && item.quantity >= 1 && item.quantity <= 20)
  const hasDraftItems = draftQuantity > 0 || customDraftQuantity > 0
  const hasSubmittedOrder = orderQuantity(savedDraft) > 0 || savedCustomDraft.length > 0
  const pricedItems = publishedCampaign.items.map((item) => ({ code: item.code, unitPrice: item.unitPrice ?? publishedCampaign.unitPrice }))
  const discountPricing: DiscountPricing = {
    baseRate: publishedCampaign.baseDiscountRate ?? 1,
    mixMatch: publishedCampaign.mixMatchDiscount ? {
      ...publishedCampaign.mixMatchDiscount,
      itemCodes: publishedCampaign.items.filter((item) => item.discountEligible).map((item) => item.code),
    } : null,
  }
  const draftPricing = priceOrder(draft, pricedItems, discountPricing)
  const savedPricing = priceOrder(savedDraft, pricedItems, discountPricing)
  const activePrices = activeItems.map((item) => discountedUnitPrice(
    item.unitPrice ?? publishedCampaign.unitPrice,
    publishedCampaign.baseDiscountRate ?? 1,
  ))
  const minimumPrice = activePrices.length > 0 ? Math.min(...activePrices) : 0
  const maximumPrice = activePrices.length > 0 ? Math.max(...activePrices) : 0
  const editable = campaignStatus === 'open'
  const controlsEditable = editable && !submitting

  const progress: CampaignProgress = {
    value: thresholdKind === 'amount' ? summary.amount : summary.quantity,
    max: summary.threshold,
    text: thresholdKind === 'amount'
      ? `NT$ ${summary.amount.toLocaleString('zh-TW')} / NT$ ${summary.threshold.toLocaleString('zh-TW')}`
      : `${summary.quantity} ${quantityUnit} / ${summary.threshold} ${quantityUnit}`,
    remainingText: summary.formed
      ? '已成團'
      : thresholdKind === 'amount'
        ? `還差 NT$ ${summary.remaining.toLocaleString('zh-TW')} 成團`
        : `還差 ${summary.remaining} ${quantityUnit}成團`,
    formed: summary.formed,
  }
  const priceText = minimumPrice === maximumPrice ? `$${minimumPrice}／${quantityUnit}` : `$${minimumPrice}～$${maximumPrice}`
  const closing = describeAutoClose(publishedCampaign.autoCloseAt)
  const breakdownLines: BreakdownLine[] = draftPricing.lines.map((line) => {
    const index = publishedCampaign.items.findIndex((item) => item.code === line.code)
    return {
      ...line,
      label: itemLabel(index),
      name: publishedCampaign.items[index]?.name ?? line.code,
      discountText: line.discountType === 'mix_match'
        ? line.promotionName ?? ''
        : line.discountType === 'base' ? formatDiscountRate(line.discountRate) : '原價',
    }
  })
  const submittedAt = ownOrder
    ? wasMeaningfullyUpdated(ownOrder.orderedAt, ownOrder.updatedAt)
      ? `最後修改 ${formatZhTwTimestamp(ownOrder.updatedAt)}`
      : `下單 ${formatZhTwTimestamp(ownOrder.orderedAt)}`
    : null
  const savedCustomQuantity = savedCustomDraft.reduce((sum, item) => sum + item.quantity, 0)
  const submitHint = !editable
    ? '本團已結單，無法修改訂單。'
    : !hasDraftItems
      ? hasSubmittedOrder ? '想整筆取消訂單，請聯繫團主協助取消。' : '選擇品項後即可送出。'
      : !customDraftValid ? '請填寫額外品項的名稱與數量。' : null

  const adjust = (code: string, delta: number) => {
    if (!controlsEditable) return
    setNotice(null)
    const currentQuantity = draft[code] ?? 0
    const nextQuantity = Math.max(0, currentQuantity + delta)
    const nextDraftQuantity = draftQuantity - currentQuantity + nextQuantity
    if (thresholdKind === 'quantity' && delta > 0) {
      const otherQuantity = Math.max(0, summary.quantity - orderQuantity(savedDraft))
      const maxOrderQuantity = Math.max(0, publishedCampaign.threshold - otherQuantity)
      if (nextDraftQuantity > maxOrderQuantity) {
        showNotice('error', `目前其他住戶已訂 ${otherQuantity} ${quantityUnit}，成團上限為 ${thresholdTarget} ${quantityUnit}，本次最多可訂 ${maxOrderQuantity} ${quantityUnit}。`)
        return
      }
    }
    setDraft((current) => {
      if (nextQuantity === 0) {
        const { [code]: _removed, ...remaining } = current
        return remaining
      }
      return { ...current, [code]: nextQuantity }
    })
  }

  const renderProductRows = (itemsToRender: typeof activeItems) => itemsToRender.map((item) => {
    const itemIndex = publishedCampaign.items.findIndex((candidate) => candidate.code === item.code)
    const displayLabel = itemLabel(itemIndex)
    const itemPrice = item.unitPrice ?? publishedCampaign.unitPrice
    const usesMixMatch = draftPricing.mixMatchApplied && item.discountEligible
    const appliedRate = usesMixMatch
      ? publishedCampaign.mixMatchDiscount?.rate ?? publishedCampaign.baseDiscountRate ?? 1
      : publishedCampaign.baseDiscountRate ?? 1
    const currentUnitPrice = discountedUnitPrice(itemPrice, appliedRate)
    const priceLabel = usesMixMatch
      ? `任選價 $${currentUnitPrice}`
      : appliedRate < 1 ? `${formatDiscountRate(appliedRate)}價 $${currentUnitPrice}` : `$${currentUnitPrice}`
    const hint = item.discountEligible && publishedCampaign.mixMatchDiscount && !usesMixMatch
      ? `任選滿${publishedCampaign.mixMatchDiscount.minimumQuantity}件可享 $${discountedUnitPrice(itemPrice, publishedCampaign.mixMatchDiscount.rate)}`
      : undefined
    return (
      <ProductRow
        key={item.code}
        code={displayLabel}
        name={item.name}
        priceText={priceLabel}
        listPrice={appliedRate < 1 ? itemPrice : undefined}
        hint={hint}
        quantity={draft[item.code] ?? 0}
        disabled={!controlsEditable}
        onDecrement={() => adjust(item.code, -1)}
        onIncrement={() => adjust(item.code, 1)}
      />
    )
  })

  const addCustomItem = () => {
    if (!controlsEditable || customDraft.length >= 10) return
    customItemSequence.current += 1
    setCustomDraft((current) => [...current, {
      id: `custom-${Date.now()}-${customItemSequence.current}`,
      name: '',
      quantity: 0,
    }])
    setNotice(null)
  }

  const updateCustomItem = (id: string, update: Partial<Pick<CustomOrderItem, 'name' | 'quantity'>>) => {
    if (!controlsEditable) return
    setCustomDraft((current) => current.map((item) => item.id === id ? { ...item, ...update } : item))
    setNotice(null)
  }

  const removeCustomItem = (id: string) => {
    if (!controlsEditable) return
    setCustomDraft((current) => current.filter((item) => item.id !== id))
    setNotice(null)
  }

  const bindResident = async (input: ResidentBindingInput) => {
    if (!onBindResident) return
    const customer = await onBindResident(input)
    setBoundResident(customer)
  }

  const submit = async () => {
    if (onSubmitOrder) {
      setSubmitting(true)
      setNotice(null)
      try {
        const submittedCustomItems = validCustomOrderItems(customDraft)
        await onSubmitOrder(draft, submittedCustomItems)
        setSavedDraft({ ...draft })
        setCustomDraft(submittedCustomItems)
        setSavedCustomDraft(submittedCustomItems)
        showNotice('success', '訂單已更新')
      } catch (error) {
        showNotice('error', error instanceof Error ? error.message : '訂單更新失敗')
      } finally {
        setSubmitting(false)
      }
      return
    }
    setLocalOrders((current) =>
      current.map((order) =>
        order.customerId === currentCustomerId
          ? { ...order, items: { ...draft }, customItems: validCustomOrderItems(customDraft), updatedAt: new Date().toISOString() }
          : order,
      ),
    )
    setSavedDraft({ ...draft })
    const submittedCustomItems = validCustomOrderItems(customDraft)
    setCustomDraft(submittedCustomItems)
    setSavedCustomDraft(submittedCustomItems)
    showNotice('success', '訂單已更新')
  }

  return (
    <div className={`resident-page${currentResident ? ' is-ordering' : ''}`}>
      <header className="resident-topbar">
        <a className="resident-back-link" href="/"><span aria-hidden="true">‹</span>全部團購</a>
      </header>
      {syncError && (
        <FeedbackMessage
          className="resident-sync-feedback"
          tone="warning"
          urgent
          actionLabel={onSyncRetry ? '重新同步' : undefined}
          onAction={onSyncRetry}
        >{syncError}</FeedbackMessage>
      )}
      <main className="resident-campaign">
        <CampaignSummary
          title={publishedCampaign.title}
          status={campaignStatus}
          priceText={priceText}
          arrivalLabel={publishedCampaign.arrivalLabel}
          closingText={closing ? closing.when : null}
          progress={progress}
          orderCount={orders.length}
          openedAt={publishedCampaign.openedAt}
        />
        <CampaignInfo
          images={publishedCampaign.images}
          announcement={publishedCampaign.announcement}
          onOpenImage={setActiveImageIndex}
        />
        <section className="resident-card resident-order" aria-labelledby="order-heading">
          <div className="resident-section-heading">
            <h2 id="order-heading">我的訂單</h2>
            {currentResident && (
              <span>{formatHousehold(currentResident.householdKind, currentResident.period, currentResident.unit)}・{currentResident.name}</span>
            )}
          </div>
          {currentResident ? (
            <>
              {hasSubmittedOrder && (
                <p className="resident-sent">
                  <strong>{`你已送出 ${orderQuantity(savedDraft)} ${quantityUnit}・$${savedPricing.total}`}</strong>
                  {savedCustomQuantity > 0 && <span>{`・另有 ${savedCustomQuantity} ${quantityUnit}額外品項`}</span>}
                  {submittedAt && <span>{`・${submittedAt}`}</span>}
                </p>
              )}
              {publishedCampaign.mixMatchDiscount && (
                <div className={`resident-discount-status${draftPricing.mixMatchApplied ? ' is-applied' : ''}`} role="status">
                  <strong>{draftPricing.mixMatchApplied
                    ? `已套用${publishedCampaign.mixMatchDiscount.name}`
                    : `再選${Math.max(0, publishedCampaign.mixMatchDiscount.minimumQuantity - draftPricing.mixMatchQuantity)}件即可享${formatDiscountRate(publishedCampaign.mixMatchDiscount.rate)}`}</strong>
                  <span>{draftPricing.mixMatchApplied
                    ? `限定區共${draftPricing.mixMatchQuantity}件，全部享優惠價`
                    : `限定區目前${draftPricing.mixMatchQuantity}件，未達標維持${formatDiscountRate(publishedCampaign.baseDiscountRate ?? 1)}`}</span>
                </div>
              )}
              <div className="resident-order-items">
                {mixMatchItems.length > 0 && publishedCampaign.mixMatchDiscount && (
                  <section className="resident-product-section" aria-labelledby="mix-match-products-heading">
                    <h3 id="mix-match-products-heading">任選優惠專區</h3>
                    <p className="resident-product-section-note">共同累計件數・{publishedCampaign.mixMatchDiscount.name}</p>
                    {renderProductRows(mixMatchItems)}
                  </section>
                )}
                {regularItems.length > 0 && (
                  <section className="resident-product-section" aria-label={publishedCampaign.mixMatchDiscount ? '其他商品' : '商品選擇'}>
                    <h3>{publishedCampaign.mixMatchDiscount ? '其他商品' : '選擇品項'}</h3>
                    {renderProductRows(regularItems)}
                  </section>
                )}
                {publishedCampaign.allowCustomItems && (
                  <section className="resident-custom-items" aria-labelledby="custom-order-items-heading">
                    <div className="resident-custom-items-heading">
                      <div>
                        <h3 id="custom-order-items-heading">額外品項</h3>
                        <p>名稱由你填寫，金額由團主另計；不納入成團門檻。</p>
                      </div>
                      <Button variant="secondary" onClick={addCustomItem} disabled={!controlsEditable || customDraft.length >= 10}>
                        <span aria-hidden="true">＋</span> 新增額外品項
                      </Button>
                    </div>
                    {customDraft.map((item, index) => (
                      <div className="resident-custom-item-row" key={item.id}>
                        <label>
                          <span>品項名稱</span>
                          <input
                            className="ui-input"
                            aria-label={`額外品項 ${index + 1} 名稱`}
                            value={item.name}
                            maxLength={100}
                            disabled={!controlsEditable}
                            placeholder="例如：限定口味"
                            onChange={(event) => updateCustomItem(item.id, { name: event.target.value })}
                          />
                        </label>
                        <QuantityControl
                          label={`額外品項 ${index + 1}`}
                          value={item.quantity}
                          max={20}
                          disabled={!controlsEditable}
                          onDecrement={() => updateCustomItem(item.id, { quantity: Math.max(0, item.quantity - 1) })}
                          onIncrement={() => updateCustomItem(item.id, { quantity: Math.min(20, item.quantity + 1) })}
                        />
                        <Button
                          variant="utility"
                          aria-label={`移除額外品項 ${index + 1}`}
                          disabled={!controlsEditable}
                          onClick={() => removeCustomItem(item.id)}
                        >移除</Button>
                      </div>
                    ))}
                    {customDraft.length > 0 && <p className="resident-custom-items-note">金額由團主另計</p>}
                  </section>
                )}
              </div>
              {editable && <p className="resident-order-rule">結單前都可以回來改數量；要整筆取消請找團主。</p>}
              {notice?.tone === 'error' && <FeedbackMessage className="resident-order-feedback" tone="error">{notice.text}</FeedbackMessage>}
              <OrderSummaryBar
                quantity={draftQuantity}
                quantityUnit={quantityUnit}
                amount={draftPricing.total}
                customQuantity={customDraftQuantity}
                onShowBreakdown={hasDraftItems ? () => setBreakdownOpen(true) : undefined}
                submitDisabled={!controlsEditable || !draftDirty || !hasDraftItems || !customDraftValid}
                submitting={submitting}
                onSubmit={() => { void submit() }}
                hint={submitHint}
              />
            </>
          ) : (
            <ResidentBindingForm identity={verifiedResidentIdentity} disabled={!editable} onBind={bindResident} />
          )}
        </section>
        <OrderWall
          orders={orders}
          currentCustomerId={currentResident?.customerId}
          quantityUnit={quantityUnit}
          itemDisplayLabel={itemDisplayLabel}
        />
      </main>
      <footer className="resident-footer">
        {liveDemo
          ? 'Supabase Live Demo・發布內容由資料庫即時同步'
          : '這是本機示範模式；接上 LIFF 與 Supabase 後會自動辨識身分並即時同步。'}
      </footer>
      {notice?.tone === 'success' && (
        <Toast
          key={notice.id}
          className="resident-order-toast"
          message={notice.text}
          duration={SUCCESS_NOTICE_DURATION}
          onDismiss={() => setNotice(null)}
        />
      )}
      {breakdownOpen && (
        <BottomSheet title="訂單明細" onClose={() => setBreakdownOpen(false)}>
          <OrderBreakdown
            lines={breakdownLines}
            customItems={customDraft}
            total={draftPricing.total}
            savings={draftPricing.savings}
            quantityUnit={quantityUnit}
          />
        </BottomSheet>
      )}
      {activeImageIndex !== null && (
        <CampaignImageViewer
          images={publishedCampaign.images}
          index={activeImageIndex}
          onIndexChange={setActiveImageIndex}
          onClose={() => setActiveImageIndex(null)}
        />
      )}
    </div>
  )
}

export default App
```

- [ ] **Step 5: 加入頁面版面樣式並刪除 `App.css`**

在 `src/components/resident/resident.css` 檔尾加入：

```css
/* Campaign page layout: one column on phones, content + fixed order rail from 1024px. */
.resident-page.is-ordering { padding-bottom: calc(132px + env(safe-area-inset-bottom)); }
.resident-back-link { display: inline-flex; align-items: center; gap: var(--space-1); min-height: var(--touch-target); color: var(--color-primary); font-size: var(--font-size-dense); text-decoration: none; }
.resident-back-link span { font-size: 22px; line-height: 1; }
.resident-sync-feedback { width: min(calc(100% - 32px), 1200px); margin: var(--space-3) auto 0; }
.resident-campaign { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-areas: "summary" "info" "order" "wall"; gap: var(--space-2); width: min(100%, 1200px); margin: 0 auto; padding: var(--space-2) 0 var(--space-6); }
.resident-summary { grid-area: summary; }
.resident-info { grid-area: info; }
.resident-order { grid-area: order; }
.resident-wall { grid-area: wall; }
.resident-sent { margin: 0 0 var(--space-3); padding: var(--space-2) var(--space-3); border-radius: var(--radius-control); background: var(--color-primary-subtle); font-size: var(--font-size-dense); }
.resident-sent strong { color: var(--color-primary); font-weight: var(--font-weight-strong); }
.resident-discount-status { display: grid; gap: 2px; margin-bottom: var(--space-3); padding: var(--space-2) var(--space-3); border-radius: var(--radius-control); background: var(--color-warning-subtle); color: var(--color-warning); font-size: var(--font-size-dense); }
.resident-discount-status.is-applied { background: var(--color-success-subtle); color: var(--color-success); }
.resident-product-section + .resident-product-section { margin-top: var(--space-4); }
.resident-product-section h3 { margin: 0 0 var(--space-1); font-size: 15px; font-weight: var(--font-weight-strong); }
.resident-product-section-note { margin: 0 0 var(--space-1); color: var(--color-text-secondary); font-size: var(--font-size-caption); }
.resident-custom-items { margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--color-divider); }
.resident-custom-items-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); }
.resident-custom-items-heading h3 { margin: 0; font-size: 15px; font-weight: var(--font-weight-strong); }
.resident-custom-items-heading p { margin: 2px 0 0; color: var(--color-text-secondary); font-size: var(--font-size-caption); }
.resident-custom-item-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: end; gap: var(--space-2); margin-top: var(--space-2); }
.resident-custom-item-row label { display: grid; gap: 4px; color: var(--color-text-secondary); font-size: var(--font-size-caption); }
.resident-custom-items-note { margin: var(--space-2) 0 0; color: var(--color-warning); font-size: var(--font-size-caption); }
.resident-order-rule { margin: var(--space-3) 0 0; padding: var(--space-2) var(--space-3); border-radius: var(--radius-control); background: var(--color-surface-subtle); color: var(--color-text-secondary); font-size: var(--font-size-dense); }
.resident-order-feedback { margin-top: var(--space-3); }
.resident-order-toast { bottom: calc(140px + env(safe-area-inset-bottom)); }
.resident-footer { padding: 0 var(--space-4) var(--space-6); color: var(--color-text-tertiary); font-size: var(--font-size-caption); text-align: center; }

@media (max-width: 430px) {
  .resident-custom-item-row { grid-template-columns: minmax(0, 1fr) auto; }
  .resident-custom-item-row label { grid-column: 1 / -1; }
}

@media (min-width: 640px) and (max-width: 1023px) {
  .resident-campaign { gap: var(--space-3); padding-inline: var(--space-4); }
  .resident-card { border: 1px solid var(--color-border); border-radius: var(--radius-surface); }
}

@media (min-width: 1024px) {
  .resident-page.is-ordering { padding-bottom: 0; }
  .resident-campaign { grid-template-columns: minmax(0, 1fr) 380px; grid-template-areas: "summary order" "info order" "wall order"; align-items: start; gap: var(--space-4); padding: var(--space-5) var(--space-6) var(--space-8); }
  .resident-card { padding: var(--space-5); border: 1px solid var(--color-border); border-radius: var(--radius-surface); }
  .resident-summary { grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); align-items: end; }
  .resident-info-body[data-has-images="true"] { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; }
  .resident-order { position: sticky; top: 68px; display: flex; flex-direction: column; max-height: calc(100vh - 84px); }
  .resident-order-items { min-height: 0; overflow-y: auto; }
  .resident-order-bar { position: static; margin: var(--space-3) calc(var(--space-5) * -1) calc(var(--space-5) * -1); border-radius: 0 0 var(--radius-surface) var(--radius-surface); }
  .resident-order-bar-row,
  .resident-order-bar-note,
  .resident-order-bar-hint { width: auto; }
  .resident-order-toast { bottom: calc(var(--space-4) + env(safe-area-inset-bottom)); }
  .resident-wall-list { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: var(--space-5); }
  .resident-wall-list li:nth-child(2) { border-top: 0; }
  .resident-footer { width: min(100%, 1200px); margin: 0 auto; padding-inline: var(--space-6); text-align: left; }
}
```

刪除舊樣式：

```bash
git rm src/App.css
```

- [ ] **Step 6: 確認測試通過**

Run: `npx vitest run src/App.test.tsx src/LocalLiveApps.test.tsx src/RuntimeApp.test.tsx src/components`
Expected: 全部 PASS。

Run: `npx tsc -b` 與 `npm run lint` → 無錯誤。

Run: `npx vitest run`
Expected: 全部 PASS。

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/LocalLiveApps.test.tsx src/RuntimeApp.test.tsx src/components/resident/resident.css
git commit -m "feat: redesign the resident campaign page"
```

---

### Task 8: 整體驗證與改版前後對照

**Files:** 只在發現破版時修改 `src/components/resident/resident.css` 或 `src/components/ui/ui.css`。

- [ ] **Step 1: 完整測試、lint、build**

```bash
npx vitest run
npm run lint
npm run build
```

Expected: 全部通過；lint 無錯誤；build 成功（只允許既有的 chunk 超過 500 kB 警告）。

- [ ] **Step 2: 截改版後畫面並比對溢出**

```bash
node scripts/capture-pages.mjs .superpowers/qa/phase-2/after
node -e "const before=require('./.superpowers/qa/phase-2/before/report.json');const after=require('./.superpowers/qa/phase-2/after/report.json');for(const shot of after){const base=before.find((entry)=>entry.file===shot.file);const worse=shot.scrollWidth>shot.clientWidth||shot.offenders.length>(base?base.offenders.length:0);console.log(worse?'CHECK':'ok   ',shot.file,shot.scrollWidth+'/'+shot.clientWidth,'offenders',(base?base.offenders.length:'-')+' -> '+shot.offenders.length)}"
```

Expected: 15 行都是 `ok`。

- [ ] **Step 3: 團主端頁面不應改變**

`admin-list`、`admin-editor`、`admin-orders` 共 9 對截圖，改版前後應看不出差異（本階段只動住戶端與共用元件的 hover／層級）。若有差異，找出原因：最可能是 `App.css`／`ResidentCampaignListApp.css` 刪除後，團主頁原本依賴了其中的全域樣式。修正方式是把該樣式補到團主頁自己的 CSS，並在 commit 訊息寫明。

- [ ] **Step 4: 住戶端頁面對照規格**

逐張打開 `resident-list-{375,768,1440}.png`、`resident-campaign-{375,768,1440}.png`，對照 Spec〈住戶端〉逐項確認：

- 列表：頂端細列（團購小幫手＋頭貼）、「團購」標題與「N 團開團中」、開團中／已結單兩段；手機是縮圖列、1440 是 4 欄卡片與兩欄已結單小列；整列可點；已結單變淡。
- 團購頁手機：順序為摘要 → 開團資訊（圖＋公告同一塊）→ 我的訂單（「你已送出」、品項、改單規則）→ 大家的訂單；底部固定訂單列（本次數量與金額、明細、送出訂單、停用原因）；內容沒有被底部列擋住。
- 團購頁 1440：左欄摘要（左文右進度）、開團資訊（左圖右文）、大家的訂單兩欄；右欄固定訂購欄，送出鈕在欄底。
- 768：單欄、卡片有框線與圓角、底部訂單列。
- 沒有文字截斷、重疊、白字壓白底。

發現問題就只修該處樣式，重跑 Step 1～2。

- [ ] **Step 5: Commit（只有修改時）**

```bash
git add <修改的 CSS>
git commit -m "fix: <頁面與問題>"
```

- [ ] **Step 6: 回報，不 push**

回報：測試數量、lint、build；15 對截圖的差異摘要（住戶端依規格改版、團主端無變化）；修了哪些破版；需要團主在 LINE 實機確認的項目（底部訂單列與安全區域、鍵盤彈出時的訂單列、明細面板手感、圖片縮圖點選）。

---

## 執行結果與留給後續階段的事項（2026-09-24）

**結果：**
- Task 0～8 全部完成，另依整體審查補一輪修正（commits `6a2e521`…`6aab8c3`）。修正後共 78 個測試檔、515 項全部通過；lint、build 通過。
- 5 頁 × 3 寬度的改版後截圖都沒有水平溢出；團主端 9 張截圖與改版前逐位元組相同。
- 團主之後另有 5 個住戶端調整（`18d5402`…`59282a9`），並於 2026-09-22 連同第 1、2 階段一起 push 上線。在 `59282a9` 的乾淨 checkout 上跑出 517 項測試，tsc、lint、build 通過；唯一失敗的 migration 文字測試是換行字元造成的，說明見下方「既有問題」。

**執行中對計畫的修正：**
- 已結單的列表列只讓商品照片變淡，不淡化「無圖片」文字（原寫法會讓文字對比低於 4.5:1）。
- 補上 `ProductRow` 的元件測試（計畫的測試檔漏了它）。
- 額外品項列的數量加減鈕在手機上恢復成不撐滿整列（刪除 `App.css` 時漏掉的規則）。
- 整體審查修正：
  - 未開團的團購不顯示結單時間。
  - 兩個依日期會失敗的測試改為固定時間。
  - 補第四種送出停用說明的測試。
  - 收合的公告內有連結取得焦點時自動展開。
  - 電腦版開團卡片、圖片縮圖列、右側訂購欄的焦點外框不再被裁切。

**待團主決定：**
- ~~結單時間~~ 已決定（`71ee65d`）：未開團且有排定時間時，團購頁與列表都標示「原訂結單」，開團中仍是「結單」。原因是後端提前結單不會清掉 `auto_close_at`。
- 訂單牆預覽目前顯示最早的 20 筆。超過 20 筆時，新進的訂單要點「顯示全部」才看得到。
- 訂單沒有變更時，「送出訂單」停用但沒有說明（改版前也是如此），可考慮補一句「訂單沒有變更。」

**上線後請在 LINE 實機確認：**
- 底部訂單列與安全區域。
- 鍵盤彈出時的訂單列與額外品項輸入框。
- 明細面板的手感與背景捲動鎖定。
- 圖片縮圖點選與放大檢視。
- 送出成功提示是否在訂單列上方。
- 額外品項列（需要一個開啟「允許住戶自填額外品項」的團）。

**延後的小問題（隨後續階段處理）：**
- 可及性：
  - 送出停用說明沒有用 `aria-describedby` 連到按鈕。
  - 同步失敗提示在 `<main>` 之外（`<main>` 是具名格線，移進去要一併調整版面）。
  - 一般商品區的區域名稱「商品選擇」與標題「選擇品項」不一致。
- 圖片與明細：
  - 縮圖載入失敗沒有替代顯示。
  - Realtime 清空未編輯的訂單時，已開啟的明細面板會留著空內容。
  - `CampaignImageViewer.css` 仍有陰影、300 字重與寫死的顏色。
- 文案：只送出額外品項時顯示「你已送出 0 個・$0・另有 N 個額外品項」。
- 測試：
  - `danger-solid` 防護測試只比對單引號寫法。
  - `BottomSheet` 的內部點擊測試只點文字。
  - 住戶綁定表單沒有斷言住戶戶號的組合結果。
  - `App.test.tsx` 有一段註解還寫著舊的提示計時位置。
- 程式整理：
  - 頭貼首字的邏輯有三份，大小寫處理不一致。
  - `resident.css` 有寫死的 17px、20px 字級。
  - `pricedItems` 與 summary 內重複同一段對應。
  - `ImageGallery` 換圖時保留原本的索引。

**既有問題：** `src/services/residentCustomOrderItemsMigration.test.ts` 的正規表示式要求 LF 換行。在 `core.autocrlf=true` 的 Windows 上重新 checkout 時，migration 會變成 CRLF，這個測試就會失敗。
