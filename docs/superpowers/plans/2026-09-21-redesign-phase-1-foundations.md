# 前端改版第 1 階段：設計基礎與共用元件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依 DESIGN.md 重做 design tokens、全域排版與共用元件，新增分段切換、開關、「⋯」選單與可復原提示，並確認既有頁面換上新 token 後沒有破版。

**Architecture:** 保留現有 token 名稱、只換值並補新 token，讓尚未改版的頁面自動換色而不需要改動。共用元件維持在 `src/components/ui/`，樣式集中於 `ui.css`；新元件各自一個檔案與測試檔。改版前後以 headless Chrome 截圖對照，只修第 1 階段造成的破版。

**Tech Stack:** React 19、TypeScript 6、Vite 8、Tailwind CSS 4（只用其 preflight）、原生 CSS 自訂屬性、Vitest 4、Testing Library、Node 22 內建 WebSocket + Chrome DevTools Protocol（截圖腳本）

**Spec:** `docs/superpowers/specs/2026-09-21-frontend-redesign-design.md`

## Global Constraints

- Node.js 22.12.0 以上；本機可用 `node -v` 確認（機器上為 v22.23.2）。
- 只改前端：不得修改 `supabase/**`、`scripts/*.py`、`src/services/*Gateway.ts` 的公開介面、`src/domain/**`、`src/types/database.ts`。
- 不新增 npm 相依套件。
- 操作色只有一種：`#0066cc`；聚焦外框 `2px solid #0071e3`、`outline-offset: 2px`。
- 字體：`system-ui, -apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif`，不下載網頁字型；中文不套負字距；字重只用 400 與 600。
- 不使用裝飾性漸層與 UI 陰影；只做淺色模式。
- 所有可點擊元素觸控範圍 ≥ 44×44px，並有 `:focus-visible`。
- 文字與底色組合對比 ≥ 4.5:1（大字 ≥ 3:1）；不合格就加深文字色。
- TDD：每個行為先寫失敗測試，確認失敗原因是功能缺失，再寫最小實作。
- 修改既有測試時，原本驗證的行為必須仍被某個測試驗證。
- 使用者可見文案一律繁體中文。
- **本階段只 commit、不 push。** push 到 `main` 會觸發 Vercel 正式部署；第 1 階段單獨上線會讓住戶端出現新舊配色混搭，是否上線由團主決定（建議與第 2 階段一起）。

## 對 Spec 的調整

1. **成功色改為 `#177033`。** Spec 寫 `#1a7f37`，但它放在 `#e3f4e8` 上對比只有約 4.45:1，未達 4.5:1。依 Spec「不合格就加深文字色」的規則加深為 `#177033`（約 5.4:1）。
2. **ImageGallery、BottomSheet、表格共用樣式延到第一個使用它們的階段。** 前兩者只有住戶端用（第 2 階段），表格樣式第一次用在團主首頁（第 3 階段）。沒有使用者的元件無法做畫面驗收，先做只會猜錯介面。
3. **全域內文仍為 16px。** 住戶端 17px、團主端 14px 由第 2、3 階段的頁面外框套用；第 1 階段改全域字級會讓尚未改版的團主頁面整體放大，無法分辨破版來源。token `--font-size-body`（17px）與 `--font-size-dense`（14px）先定義好。
4. **Toast 的「暫停」是離開後重新計時 5 秒**，而非接續剩餘時間。行為更保守（使用者不會在移開滑鼠的瞬間失去提示），實作也單純。

## 檔案地圖

| 檔案 | 動作 | 責任 |
|---|---|---|
| `scripts/capture-pages.mjs` | 新增 | localStorage Demo 各頁 375／768／1440 整頁截圖＋水平溢出報告 |
| `.gitignore` | 修改 | 忽略 `.superpowers/qa/` 截圖輸出 |
| `src/styles/tokens.css` | 改寫 | 顏色、字體、圓角、互動 token |
| `src/styles/tokens.test.ts` | 新增 | 單一操作色、無漸層／陰影、對比 ≥ 4.5:1 |
| `src/styles/foundations.css` | 改寫 | 全域字體、行高、聚焦外框、`.ui-num`、`.ui-visually-hidden` |
| `src/components/ui/Button.tsx` | 改寫 | 變體 primary／secondary／utility／danger／danger-solid、尺寸 md／sm |
| `src/components/ui/ConfirmDialog.tsx` | 修改 | 確認鈕改用 danger-solid |
| `src/components/ui/FeedbackMessage.tsx` | 修改 | 動作鈕改用 utility／sm |
| `src/components/ui/FormField.tsx` | 修改 | `required` 標示與 `aria-required` |
| `src/components/ui/AsyncState.tsx` | 修改 | `LoadingState` 新增骨架樣式 |
| `src/components/ui/SegmentedControl.tsx` | 新增 | 分段切換（原生 radio） |
| `src/components/ui/Switch.tsx` | 新增 | 開關（原生 checkbox + `role="switch"`） |
| `src/components/ui/Menu.tsx` | 新增 | 「⋯」選單，鍵盤與點外面關閉 |
| `src/components/ui/Toast.tsx` | 新增 | 可復原提示，5 秒自動關閉 |
| `src/components/ui/ui.css` | 改寫 | 所有共用元件樣式 |
| `src/components/ui/ui.test.tsx` | 修改 | 按鈕、必填、骨架、確認視窗測試 |
| `src/components/ui/SegmentedControl.test.tsx`、`Switch.test.tsx`、`Menu.test.tsx`、`Toast.test.tsx` | 新增 | 新元件行為測試 |
| `src/App.tsx` | 修改 | 兩處 `variant="tertiary"` 改為 `"utility"` |

`src/components/ui/Navigation.tsx`（AppHeader、Breadcrumbs、SectionNav）目前沒有任何頁面使用，本階段不動；第 3 階段建立團主導覽時再決定取代或刪除。

---

### Task 0: 截圖腳本與改版前基準

**Files:**
- Create: `scripts/capture-pages.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `node scripts/capture-pages.mjs <outDir> [baseUrl]` → `<outDir>/<page>-<width>.png` 與 `<outDir>/report.json`（陣列，每筆 `{ file, scrollWidth, clientWidth, offenders[] }`）。第 9 項任務與之後各階段都用它。

- [ ] **Step 1: 建立截圖腳本**

`scripts/capture-pages.mjs`：

```js
// Full-page screenshots of the localStorage demo for before/after UI review.
// Usage: node scripts/capture-pages.mjs <outDir> [baseUrl]
// Needs `npm run dev` running and Google Chrome (override with CHROME_PATH).
// Later redesign phases edit `pages` when routes change.
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [outDir, baseUrl = 'http://localhost:5173'] = process.argv.slice(2)
if (!outDir) {
  console.error('Usage: node scripts/capture-pages.mjs <outDir> [baseUrl]')
  process.exit(1)
}

const chromePath = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const widths = [375, 768, 1440]
const pages = [
  { name: 'resident-list', path: '/' },
  { name: 'resident-campaign', path: '/campaign/0123456789abcdef0123456789abcdef0123' },
  { name: 'admin-list', path: '/admin' },
  { name: 'admin-editor', path: '/admin/campaign/01234567-89ab-cdef-0123-456789abcdef' },
  { name: 'admin-orders', path: '/admin/campaign/01234567-89ab-cdef-0123-456789abcdef', click: '#admin-orders-tab' },
]

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const port = 9400 + Math.floor(Math.random() * 400)
const profileDir = await mkdtemp(join(tmpdir(), 'capture-pages-'))
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, 'about:blank',
], { stdio: 'ignore' })

let target
for (let attempt = 0; attempt < 50 && !target; attempt += 1) {
  try {
    const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json())
    target = targets.find((candidate) => candidate.type === 'page')
  } catch {
    // Chrome is still starting.
  }
  if (!target) await wait(100)
}
if (!target) throw new Error('Chrome DevTools did not become ready')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let nextId = 0
const pending = new Map()
const eventWaiters = []
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id) {
    const entry = pending.get(message.id)
    if (!entry) return
    pending.delete(message.id)
    if (message.error) entry.reject(new Error(message.error.message))
    else entry.resolve(message.result)
    return
  }
  for (const waiter of eventWaiters.filter((candidate) => candidate.method === message.method)) {
    eventWaiters.splice(eventWaiters.indexOf(waiter), 1)
    waiter.resolve(message.params)
  }
})

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId
  pending.set(id, { resolve, reject })
  socket.send(JSON.stringify({ id, method, params }))
})
const nextEvent = (method) => new Promise((resolve) => eventWaiters.push({ method, resolve }))
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value

const overflowProbe = `(() => {
  const root = document.documentElement
  const clipped = (element) => {
    for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
      if (getComputedStyle(node).overflowX !== 'visible') return true
    }
    return false
  }
  const offenders = [...document.querySelectorAll('body *')].flatMap((element) => {
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 || (rect.right <= root.clientWidth + 1 && rect.left >= -1) || clipped(element)) return []
    return [{ tag: element.tagName.toLowerCase(), className: String(element.className).slice(0, 80), left: Math.round(rect.left), right: Math.round(rect.right) }]
  }).slice(0, 12)
  return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, offenders }
})()`

await send('Page.enable')
await mkdir(outDir, { recursive: true })
const report = []
try {
  for (const page of pages) {
    for (const width of widths) {
      await send('Storage.clearDataForOrigin', { origin: new URL(baseUrl).origin, storageTypes: 'local_storage' })
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 })
      const loaded = nextEvent('Page.loadEventFired')
      await send('Page.navigate', { url: new URL(page.path, baseUrl).toString() })
      await Promise.race([loaded, wait(15000)])
      await wait(800)
      if (page.click) {
        await evaluate(`document.querySelector(${JSON.stringify(page.click)})?.click()`)
        await wait(300)
      }
      const height = await evaluate('Math.min(document.documentElement.scrollHeight, 8000)')
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 })
      await wait(300)
      const overflow = await evaluate(overflowProbe)
      const shot = await send('Page.captureScreenshot', { format: 'png' })
      const file = `${page.name}-${width}.png`
      await writeFile(join(outDir, file), Buffer.from(shot.data, 'base64'))
      report.push({ file, ...overflow })
      console.log(`${file}  scrollWidth=${overflow.scrollWidth}/${overflow.clientWidth}  offenders=${overflow.offenders.length}`)
    }
  }
  await writeFile(join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
} finally {
  socket.close()
  chrome.kill()
  await rm(profileDir, { recursive: true, force: true }).catch(() => {})
}
```

- [ ] **Step 2: 忽略截圖輸出**

在 `.gitignore` 的 `# Local agent tooling` 區塊最後加一行：

```gitignore
.superpowers/qa/
```

- [ ] **Step 3: 啟動 Demo 並截改版前基準**

另開背景程序執行（保持執行到本計畫結束）：

```bash
npm run dev -- --port 5173 --strictPort
```

確認 `http://localhost:5173/` 回應 200 後執行：

```bash
node scripts/capture-pages.mjs .superpowers/qa/phase-1/before
```

Expected: 印出 15 行（5 頁 × 3 寬度），`.superpowers/qa/phase-1/before/` 內有 15 張 PNG 與 `report.json`。每行 `scrollWidth` 兩個數字相同。

- [ ] **Step 4: Commit**

```bash
git add scripts/capture-pages.mjs .gitignore
git commit -m "chore: add demo page screenshot capture for UI review"
```

---

### Task 1: Design tokens 與全域排版

**Files:**
- Create: `src/styles/tokens.test.ts`
- Modify: `src/styles/tokens.css`（整檔改寫）
- Modify: `src/styles/foundations.css`（整檔改寫）

**Interfaces:**
- Produces（CSS 自訂屬性，後續任務與各階段使用）：`--color-primary`、`--color-primary-hover`、`--color-primary-active`、`--color-primary-subtle`、`--color-primary-on-dark`、`--color-on-primary`、`--color-focus`、`--color-bg`、`--color-surface`、`--color-surface-subtle`、`--color-surface-raised`、`--color-sticky-bg`、`--color-overlay`、`--color-text`、`--color-text-secondary`、`--color-text-tertiary`、`--color-border`、`--color-border-strong`、`--color-divider`、`--color-success(-subtle)`、`--color-warning(-subtle)`、`--color-danger(-subtle|-hover)`、`--color-neutral(-subtle)`、`--color-info(-subtle)`、`--color-line(-hover|-subtle)`、`--color-disabled-bg`、`--color-disabled-text`、`--font-sans`、`--font-size-caption|dense|base|body|title|page-title`、`--line-height-body|heading`、`--font-weight-regular|strong`、`--space-1…12`、`--radius-sm|control|surface|prominent|pill`、`--shadow-sticky`、`--shadow-dialog`、`--blur-sticky`、`--touch-target`、`--press-scale`、`--duration-fast|normal|dialog`。
- Produces（class）：`.ui-num`（等寬數字）、`.ui-visually-hidden`（只給螢幕閱讀器）。

- [ ] **Step 1: 寫失敗測試**

`src/styles/tokens.test.ts`：

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')
const tokens: Record<string, string> = Object.fromEntries(
  [...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{3,8})\s*;/gi)].map(([, name, value]) => [name, value.toLowerCase()]),
)

function luminance(hex: string) {
  const digits = hex.slice(1)
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits.slice(0, 6)
  const [red, green, blue] = [0, 2, 4]
    .map((offset) => parseInt(full.slice(offset, offset + 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrast(foreground: string, background: string) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((left, right) => right - left)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('design tokens', () => {
  it('uses the single DESIGN.md action blue and its focus ring', () => {
    expect(tokens['color-primary']).toBe('#0066cc')
    expect(tokens['color-focus']).toBe('#0071e3')
    expect(tokens['color-text']).toBe('#1d1d1f')
    expect(tokens['color-bg']).toBe('#f5f5f7')
  })

  it('declares no decorative gradients or UI shadows', () => {
    expect(css).not.toMatch(/gradient\(/)
    expect(css).toMatch(/--shadow-sticky:\s*none;/)
    expect(css).toMatch(/--shadow-dialog:\s*none;/)
  })

  it.each([
    ['color-text', 'color-bg'],
    ['color-text', 'color-surface'],
    ['color-text-secondary', 'color-surface'],
    ['color-text-secondary', 'color-bg'],
    ['color-text-secondary', 'color-surface-subtle'],
    ['color-text-tertiary', 'color-surface'],
    ['color-text-tertiary', 'color-bg'],
    ['color-primary', 'color-surface'],
    ['color-primary', 'color-primary-subtle'],
    ['color-on-primary', 'color-primary'],
    ['color-on-primary', 'color-primary-hover'],
    ['color-on-primary', 'color-danger'],
    ['color-success', 'color-success-subtle'],
    ['color-warning', 'color-warning-subtle'],
    ['color-danger', 'color-danger-subtle'],
    ['color-danger', 'color-surface'],
    ['color-neutral', 'color-neutral-subtle'],
    ['color-on-primary', 'color-text'],
    ['color-primary-on-dark', 'color-text'],
  ])('keeps %s on %s at 4.5:1 or better', (foreground, background) => {
    expect(tokens[foreground], foreground).toBeDefined()
    expect(tokens[background], background).toBeDefined()
    expect(contrast(tokens[foreground], tokens[background])).toBeGreaterThanOrEqual(4.5)
  })
})
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/styles/tokens.test.ts`
Expected: FAIL。`color-primary` 目前是 `#2f6b57`；`color-neutral`、`color-primary-on-dark` 未定義；`--shadow-sticky` 不是 `none`。

- [ ] **Step 3: 改寫 `src/styles/tokens.css`**

```css
/* Design tokens: DESIGN.md adapted for a Traditional Chinese group-buy tool.
   One action blue carries every interactive element. Status colors are the
   only additions and must keep 4.5:1 contrast (tokens.test.ts checks it). */
:root {
  color-scheme: light;

  --color-primary: #0066cc;
  --color-primary-hover: #0058b0;
  --color-primary-active: #004f9e;
  --color-primary-subtle: #e8f0fb;
  --color-primary-on-dark: #2997ff;
  --color-on-primary: #fff;
  --color-focus: #0071e3;

  --color-bg: #f5f5f7;
  --color-surface: #fff;
  --color-surface-subtle: #fafafc;
  --color-surface-raised: #fff;
  --color-sticky-bg: rgb(245 245 247 / 92%);
  --color-overlay: rgb(29 29 31 / 40%);

  --color-text: #1d1d1f;
  --color-text-secondary: #5c5c61;
  --color-text-tertiary: #6e6e73;

  --color-border: #e0e0e0;
  --color-border-strong: #d2d2d7;
  --color-divider: #f0f0f0;

  --color-success: #177033;
  --color-success-subtle: #e3f4e8;
  --color-warning: #9a4f00;
  --color-warning-subtle: #fff1e0;
  --color-danger: #b3261e;
  --color-danger-hover: #8c1d18;
  --color-danger-subtle: #fdecea;
  --color-neutral: #3a3a3c;
  --color-neutral-subtle: #ececef;
  --color-info: #0066cc;
  --color-info-subtle: #e8f0fb;

  --color-line: #06c755;
  --color-line-hover: #05b84e;
  --color-line-subtle: #e6f8ec;

  --color-disabled-bg: #f0f0f2;
  --color-disabled-text: #7a7a7a;

  --font-sans: system-ui, -apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif;
  --font-size-caption: 12px;
  --font-size-dense: 14px;
  --font-size-base: 16px;
  --font-size-body: 17px;
  --font-size-title: 20px;
  --font-size-page-title: 22px;
  --line-height-body: 1.6;
  --line-height-heading: 1.3;
  --font-weight-regular: 400;
  --font-weight-strong: 600;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;

  --radius-sm: 6px;
  --radius-control: 8px;
  --radius-surface: 18px;
  --radius-prominent: 18px;
  --radius-pill: 999px;

  --shadow-sticky: none;
  --shadow-dialog: none;
  --blur-sticky: saturate(180%) blur(20px);

  --touch-target: 44px;
  --press-scale: 0.95;
  --duration-fast: 120ms;
  --duration-normal: 180ms;
  --duration-dialog: 240ms;
}
```

- [ ] **Step 4: 改寫 `src/styles/foundations.css`**

```css
* { box-sizing: border-box; }

html { background: var(--color-bg); }

body {
  min-width: 320px;
  min-height: 100vh;
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: var(--font-size-base);
  line-height: var(--line-height-body);
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}

button,
input,
select,
textarea { font: inherit; }

button,
a,
input,
select,
textarea,
[tabindex]:not([tabindex="-1"]) {
  -webkit-tap-highlight-color: transparent;
}

:where(button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])):focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}

:where(h1, h2, h3, h4, h5, h6) { line-height: var(--line-height-heading); }
:where(p, h1, h2, h3) { overflow-wrap: anywhere; }

.ui-num { font-variant-numeric: tabular-nums; }

.ui-visually-hidden {
  position: absolute !important;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 5: 確認測試通過、其他測試不受影響**

Run: `npx vitest run src/styles/tokens.test.ts`
Expected: PASS（21 項：2 項規則＋19 組對比）

Run: `npx vitest run`
Expected: 全部 PASS（CSS 不影響 jsdom 測試）

- [ ] **Step 6: Commit**

```bash
git add src/styles/tokens.css src/styles/tokens.test.ts src/styles/foundations.css
git commit -m "feat: adopt DESIGN.md tokens with contrast-checked status colors"
```

---

### Task 2: Button 變體與尺寸

**Files:**
- Modify: `src/components/ui/Button.tsx`（整檔改寫）
- Modify: `src/components/ui/ConfirmDialog.tsx`（確認鈕變體）
- Modify: `src/components/ui/FeedbackMessage.tsx`（動作鈕）
- Modify: `src/App.tsx:469`、`src/App.tsx:561`（`variant="tertiary"` → `"utility"`）
- Modify: `src/components/ui/ui.css`（按鈕區塊）
- Test: `src/components/ui/ui.test.tsx`

**Interfaces:**
- Produces: `type ButtonVariant = 'primary' | 'secondary' | 'utility' | 'danger' | 'danger-solid'`、`type ButtonSize = 'md' | 'sm'`；`<Button variant size loading loadingLabel ...buttonProps>` 輸出 `data-variant`、`data-size`；`<IconButton label ...>` 預設 `variant="utility"`。
- 移除：`'tertiary'`、`'destructive'` 變體。

- [ ] **Step 1: 改寫按鈕測試並新增確認視窗變體測試**

在 `src/components/ui/ui.test.tsx`，把第一個測試 `it('exposes button hierarchy and a stable processing state', ...)` 整段換成：

```tsx
  it('exposes the DESIGN.md button grammar and a stable processing state', () => {
    render(<>
      <Button variant="primary" loading>儲存</Button>
      <Button variant="primary" loading loadingLabel="LINE驗證中…">使用 LINE 登入</Button>
      <Button variant="secondary">取消</Button>
      <Button variant="utility">複製住戶連結</Button>
      <Button variant="utility" size="sm">儲存備註</Button>
      <Button variant="danger">刪除團購</Button>
      <Button variant="danger-solid">確認永久刪除</Button>
      <IconButton label="關閉">×</IconButton>
    </>)

    expect(screen.getByRole('button', { name: '儲存中…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'LINE驗證中…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '取消' })).toHaveAttribute('data-variant', 'secondary')
    expect(screen.getByRole('button', { name: '複製住戶連結' })).toHaveAttribute('data-variant', 'utility')
    expect(screen.getByRole('button', { name: '複製住戶連結' })).toHaveAttribute('data-size', 'md')
    expect(screen.getByRole('button', { name: '儲存備註' })).toHaveAttribute('data-size', 'sm')
    expect(screen.getByRole('button', { name: '刪除團購' })).toHaveAttribute('data-variant', 'danger')
    expect(screen.getByRole('button', { name: '確認永久刪除' })).toHaveAttribute('data-variant', 'danger-solid')
    expect(screen.getByRole('button', { name: '關閉' })).toHaveAttribute('data-variant', 'utility')
    expect(screen.getByRole('button', { name: '關閉' })).toHaveTextContent('×')
  })

  it('reserves the solid danger button for the confirmation dialog', () => {
    render(
      <ConfirmDialog title="確認刪除團購" confirmLabel="確認永久刪除" onConfirm={vi.fn()} onCancel={vi.fn()}>
        無法復原。
      </ConfirmDialog>,
    )

    expect(screen.getByRole('button', { name: '確認永久刪除' })).toHaveAttribute('data-variant', 'danger-solid')
    expect(screen.getByRole('button', { name: '取消' })).toHaveAttribute('data-variant', 'secondary')
  })
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/components/ui/ui.test.tsx`
Expected: FAIL。`data-size` 不存在；確認鈕的 `data-variant` 是 `destructive`。

- [ ] **Step 3: 改寫 `src/components/ui/Button.tsx`**

```tsx
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'utility' | 'danger' | 'danger-solid'
export type ButtonSize = 'md' | 'sm'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  loadingLabel?: string
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel,
  disabled,
  children,
  className = '',
  ...props
}, ref) {
  const label = loading
    ? loadingLabel ?? (typeof children === 'string' ? `${children.replace(/中…$/, '')}中…` : '處理中…')
    : children
  return (
    <button
      ref={ref}
      type="button"
      className={`ui-button ${className}`.trim()}
      data-variant={variant}
      data-size={size}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <span className="ui-button-spinner" aria-hidden="true" />}
      <span>{label}</span>
    </button>
  )
})

type IconButtonProps = Omit<ButtonProps, 'children'> & {
  label: string
  children: ReactNode
}

export function IconButton({ label, className = '', children, ...props }: IconButtonProps) {
  return (
    <Button
      className={`ui-icon-button ${className}`.trim()}
      aria-label={label}
      variant={props.variant ?? 'utility'}
      {...props}
    >
      {children}
    </Button>
  )
}
```

- [ ] **Step 4: 更新呼叫端**

`src/components/ui/ConfirmDialog.tsx`，確認鈕那一行：

```tsx
          <Button variant={destructive ? 'danger-solid' : 'primary'} onClick={onConfirm} loading={busy} disabled={busy} loadingLabel="處理中…">
```

`src/components/ui/FeedbackMessage.tsx`，動作鈕那一行：

```tsx
      {actionLabel && onAction && <Button variant="utility" size="sm" onClick={onAction}>{actionLabel}</Button>}
```

`src/App.tsx` 第 469 行（「展開完整開團資訊」按鈕）與第 561 行（「移除」額外品項按鈕）：把 `variant="tertiary"` 改成 `variant="utility"`。

- [ ] **Step 5: 改寫 `ui.css` 按鈕區塊**

把 `src/components/ui/ui.css` 從第 1 行 `.ui-button {` 到 `.ui-icon-button { width: 44px; padding: 0; }`（第 1–27 行）整段換成下面內容；其後的 `.ui-button-spinner` 與 `@keyframes ui-spin` 保留不動：

```css
.ui-button {
  position: relative;
  min-height: var(--touch-target);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: 10px 22px;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-strong);
  line-height: 1.25;
  text-decoration: none;
  cursor: pointer;
  transition: background-color var(--duration-fast), border-color var(--duration-fast), color var(--duration-fast), transform var(--duration-fast);
}
.ui-button:hover:not(:disabled) { background: var(--color-primary-hover); }
.ui-button:active:not(:disabled) { transform: scale(var(--press-scale)); }
.ui-button[data-variant="secondary"] { border-color: var(--color-primary); background: var(--color-surface); color: var(--color-primary); }
.ui-button[data-variant="secondary"]:hover:not(:disabled) { background: var(--color-primary-subtle); }
.ui-button[data-variant="utility"] { padding-inline: 14px; border-color: var(--color-border-strong); border-radius: var(--radius-control); background: var(--color-surface); color: var(--color-text); font-weight: var(--font-weight-regular); }
.ui-button[data-variant="utility"]:hover:not(:disabled) { background: var(--color-surface-subtle); }
.ui-button[data-variant="danger"] { border-color: var(--color-danger); background: var(--color-surface); color: var(--color-danger); }
.ui-button[data-variant="danger"]:hover:not(:disabled) { background: var(--color-danger-subtle); }
.ui-button[data-variant="danger-solid"] { background: var(--color-danger); color: var(--color-on-primary); }
.ui-button[data-variant="danger-solid"]:hover:not(:disabled) { background: var(--color-danger-hover); }
.ui-button:disabled { border-color: transparent; background: var(--color-disabled-bg); color: var(--color-disabled-text); cursor: not-allowed; }
/* A compact 32px button still gets a 44px tall hit area. */
.ui-button[data-size="sm"] { min-height: 32px; padding: 4px 12px; font-size: var(--font-size-dense); }
.ui-button[data-size="sm"]::after { content: ""; position: absolute; inset: -6px 0; }
.ui-icon-button { width: var(--touch-target); padding: 0; }
```

- [ ] **Step 6: 確認測試與型別**

Run: `npx vitest run src/components/ui/ui.test.tsx`
Expected: PASS

Run: `npx tsc -b`
Expected: 無錯誤（若還有 `'tertiary'`／`'destructive'` 殘留，這裡會報型別錯）

Run: `npx vitest run`
Expected: 全部 PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/Button.tsx src/components/ui/ConfirmDialog.tsx src/components/ui/FeedbackMessage.tsx src/components/ui/ui.css src/components/ui/ui.test.tsx src/App.tsx
git commit -m "feat: give buttons the DESIGN.md pill and utility grammar"
```

---

### Task 3: 表單欄位與必填標示

**Files:**
- Modify: `src/components/ui/FormField.tsx`（整檔改寫）
- Modify: `src/components/ui/ui.css`（欄位區塊）
- Test: `src/components/ui/ui.test.tsx`

**Interfaces:**
- Produces: `<FormField id label helper? error? required? className?>{control}</FormField>`；`required` 時控制項取得 `aria-required="true"`，標籤後顯示 `aria-hidden` 的「必填」。
- Produces（class）：`.ui-input`，給不包在 FormField 內的輸入框（例如表格內的備註、品項表）。

- [ ] **Step 1: 寫失敗測試**

在 `src/components/ui/ui.test.tsx` 的 `it('connects form labels, helper copy, and inline validation', ...)` 之後新增：

```tsx
  it('marks required fields without polluting the accessible name', () => {
    render(
      <FormField id="campaign-title" label="團購標題" required>
        <input />
      </FormField>,
    )

    const input = screen.getByRole('textbox', { name: '團購標題' })
    expect(input).toBeRequired()
    expect(screen.getByText('必填')).toHaveAttribute('aria-hidden', 'true')
  })
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/components/ui/ui.test.tsx -t "required"`
Expected: FAIL（找不到「必填」、`toBeRequired` 失敗）

- [ ] **Step 3: 改寫 `src/components/ui/FormField.tsx`**

```tsx
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'

type ControlProps = {
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  'aria-required'?: boolean
}

type FormFieldProps = {
  id: string
  label: ReactNode
  helper?: ReactNode
  error?: ReactNode
  required?: boolean
  children: ReactElement<ControlProps>
  className?: string
}

export function FormField({ id, label, helper, error, required = false, children, className = '' }: FormFieldProps) {
  const helperId = helper ? `${id}-helper` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [children.props['aria-describedby'], helperId, errorId].filter(Boolean).join(' ') || undefined
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : children.props['aria-invalid'],
        'aria-required': required ? true : children.props['aria-required'],
      })
    : children
  return (
    <div className={`ui-field ${className}`.trim()}>
      <label htmlFor={id}>
        {label}
        {required && <span className="ui-field-required" aria-hidden="true">必填</span>}
      </label>
      {control}
      {helper && <div className="ui-field-helper" id={helperId}>{helper}</div>}
      {error && <div className="ui-field-error" id={errorId} role="alert">{error}</div>}
    </div>
  )
}
```

- [ ] **Step 4: 改寫 `ui.css` 欄位區塊**

把從 `.ui-field { display: grid; gap: 6px; }` 到 `.ui-field-error { ... }` 的 6 行換成：

```css
.ui-field { display: grid; gap: 6px; }
.ui-field > label { color: var(--color-text); font-size: var(--font-size-dense); font-weight: var(--font-weight-strong); }
.ui-field-required { margin-left: var(--space-1); color: var(--color-warning); font-size: var(--font-size-caption); font-weight: var(--font-weight-regular); }
.ui-input,
.ui-field :where(input:not([type="checkbox"], [type="radio"]), select, textarea) {
  width: 100%;
  min-height: var(--touch-target);
  padding: 10px 12px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-control);
  background: var(--color-surface);
  color: var(--color-text);
}
.ui-input:disabled,
.ui-field :where(input, select, textarea):disabled { background: var(--color-disabled-bg); color: var(--color-disabled-text); }
.ui-input[aria-invalid="true"],
.ui-field :where(input, select, textarea)[aria-invalid="true"] { border-color: var(--color-danger); }
.ui-field-helper { color: var(--color-text-secondary); font-size: var(--font-size-caption); }
.ui-field-error { color: var(--color-danger); font-size: 13px; font-weight: var(--font-weight-strong); }
```

- [ ] **Step 5: 確認測試通過**

Run: `npx vitest run src/components/ui/ui.test.tsx`
Expected: PASS（包含原本的 `connects form labels, helper copy, and inline validation`）

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/FormField.tsx src/components/ui/ui.css src/components/ui/ui.test.tsx
git commit -m "feat: mark required form fields and share one input style"
```

---

### Task 4: 狀態、進度、提示、載入骨架、確認視窗、數量鈕與固定列的新樣式

**Files:**
- Modify: `src/components/ui/AsyncState.tsx`（`LoadingState`）
- Modify: `src/components/ui/ui.css`（狀態標籤、進度、提示、非同步狀態、對話框、數量鈕、固定列）
- Test: `src/components/ui/ui.test.tsx`

**Interfaces:**
- Produces: `<LoadingState label page? variant?: 'spinner' | 'skeleton' rows?: number />`；骨架模式輸出 `role="status"`、`aria-busy="true"`、`rows` 個 `.ui-skeleton-row`。

- [ ] **Step 1: 寫失敗測試**

在 `src/components/ui/ui.test.tsx` 的 `it('provides consistent loading, empty, and recoverable error states', ...)` 之後新增：

```tsx
  it('offers a skeleton placeholder for lists and tables', () => {
    const { container } = render(<LoadingState label="載入訂單中…" variant="skeleton" rows={4} />)

    expect(screen.getByRole('status', { name: '載入訂單中…' })).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelectorAll('.ui-skeleton-row')).toHaveLength(4)
  })
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/components/ui/ui.test.tsx -t "skeleton"`
Expected: FAIL（`.ui-skeleton-row` 為 0 個）

- [ ] **Step 3: 修改 `LoadingState`**

把 `src/components/ui/AsyncState.tsx` 的 `LoadingState` 函式換成：

```tsx
type LoadingStateProps = {
  label: string
  page?: boolean
  variant?: 'spinner' | 'skeleton'
  rows?: number
}

export function LoadingState({ label, page = false, variant = 'spinner', rows = 3 }: LoadingStateProps) {
  if (variant === 'skeleton') {
    return (
      <div className="ui-skeleton" role="status" aria-label={label} aria-busy="true">
        {Array.from({ length: rows }, (_, index) => <span key={index} className="ui-skeleton-row" aria-hidden="true" />)}
        <span className="ui-visually-hidden">{label}</span>
      </div>
    )
  }
  return (
    <div className={`ui-async-state${page ? ' is-page' : ''}`} role="status" aria-label={label} aria-busy="true">
      <span className="ui-spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  )
}
```

- [ ] **Step 4: 改寫 `ui.css` 的狀態相關區塊**

以下每段都是「把原本那幾行整段換成新內容」：

(a) 狀態標籤：`.ui-status-badge { ... }` 到 `.ui-status-badge[data-tone="info"] { ... }`（5 行）換成：

```css
.ui-status-badge { display: inline-flex; align-items: center; min-height: 24px; padding: 2px 10px; border-radius: var(--radius-pill); background: var(--color-neutral-subtle); color: var(--color-neutral); font-size: var(--font-size-caption); font-weight: var(--font-weight-strong); line-height: 1.4; white-space: nowrap; }
.ui-status-badge[data-tone="success"] { background: var(--color-success-subtle); color: var(--color-success); }
.ui-status-badge[data-tone="warning"] { background: var(--color-warning-subtle); color: var(--color-warning); }
.ui-status-badge[data-tone="danger"] { background: var(--color-danger-subtle); color: var(--color-danger); }
.ui-status-badge[data-tone="info"] { background: var(--color-info-subtle); color: var(--color-info); }
```

(b) 進度條：`.ui-progress { ... }` 與 `.ui-progress > span { ... }`（2 行）換成：

```css
.ui-progress { height: 6px; overflow: hidden; border-radius: var(--radius-pill); background: var(--color-border); }
.ui-progress > span { display: block; height: 100%; border-radius: inherit; background: var(--color-primary); transition: width var(--duration-normal); }
```

(c) 提示訊息：`.ui-feedback { ... }` 到 `.ui-feedback[data-tone="info"] { ... }`（5 行）換成：

```css
.ui-feedback { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: 10px 14px; border-radius: var(--radius-control); font-size: var(--font-size-dense); }
.ui-feedback[data-tone="success"] { background: var(--color-success-subtle); color: var(--color-success); }
.ui-feedback[data-tone="error"] { background: var(--color-danger-subtle); color: var(--color-danger); }
.ui-feedback[data-tone="warning"] { background: var(--color-warning-subtle); color: var(--color-warning); }
.ui-feedback[data-tone="info"] { background: var(--color-info-subtle); color: var(--color-info); }
```

(d) 非同步狀態：`.ui-async-state { ... }` 到 `.ui-async-actions { ... }`（5 行）換成：

```css
.ui-async-state { display: grid; justify-items: start; gap: var(--space-3); padding: var(--space-5); border: 1px solid var(--color-border); border-radius: var(--radius-surface); background: var(--color-surface); color: var(--color-text); }
.ui-async-state.is-page { width: min(100%, 440px); }
.ui-async-state p { margin: 0; color: var(--color-text-secondary); }
.ui-async-state[data-state="error"] { border-color: var(--color-danger-subtle); background: var(--color-danger-subtle); }
.ui-async-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.ui-skeleton { display: grid; gap: var(--space-3); padding: var(--space-4); }
.ui-skeleton-row { display: block; height: 16px; border-radius: var(--radius-sm); background: var(--color-neutral-subtle); animation: ui-pulse 1.4s ease-in-out infinite; }
.ui-skeleton-row:nth-child(3n) { width: 70%; }
@keyframes ui-pulse { 50% { opacity: 0.55; } }
```

(e) 對話框：`.ui-dialog-backdrop { ... }` 到 `.ui-dialog-actions { ... }`（6 行）換成：

```css
.ui-dialog-backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; overflow-y: auto; padding: var(--space-4); background: var(--color-overlay); }
.ui-dialog { width: min(100%, 480px); padding: var(--space-6); border-radius: var(--radius-surface); background: var(--color-surface-raised); }
.ui-dialog h2 { margin: 0; font-size: var(--font-size-title); font-weight: var(--font-weight-strong); line-height: var(--line-height-heading); }
.ui-dialog-content { margin-top: var(--space-3); color: var(--color-text-secondary); }
.ui-dialog-content p { margin: var(--space-2) 0 0; }
.ui-dialog-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-6); }
```

(f) 數量鈕：`.ui-quantity-control { ... }` 到 `.ui-quantity-control output { ... }`（6 行）換成：

```css
.ui-quantity-control { display: inline-grid; grid-template-columns: 44px minmax(32px, auto) 44px; align-items: center; height: var(--touch-target); border: 1px solid var(--color-border-strong); border-radius: var(--radius-pill); background: var(--color-surface); }
.ui-quantity-control button { width: 44px; height: 42px; border: 0; border-radius: var(--radius-pill); background: transparent; color: var(--color-primary); font-size: 20px; cursor: pointer; }
.ui-quantity-control button:active:not(:disabled) { transform: scale(var(--press-scale)); }
.ui-quantity-control button:disabled { color: var(--color-disabled-text); cursor: not-allowed; }
.ui-quantity-control output { text-align: center; font-weight: var(--font-weight-strong); font-variant-numeric: tabular-nums; }
```

(g) 固定列：`.ui-sticky-action { ... }`（1 行）換成：

```css
.ui-sticky-action { position: sticky; bottom: 0; z-index: 20; padding: var(--space-3) var(--space-4); padding-bottom: calc(var(--space-3) + env(safe-area-inset-bottom)); border-top: 1px solid var(--color-border); background: var(--color-sticky-bg); -webkit-backdrop-filter: var(--blur-sticky); backdrop-filter: var(--blur-sticky); }
```

- [ ] **Step 5: 確認測試通過**

Run: `npx vitest run src/components/ui/ui.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/AsyncState.tsx src/components/ui/ui.css src/components/ui/ui.test.tsx
git commit -m "feat: restyle shared states and add a skeleton loading variant"
```

---

### Task 5: SegmentedControl 分段切換

**Files:**
- Create: `src/components/ui/SegmentedControl.tsx`
- Create: `src/components/ui/SegmentedControl.test.tsx`
- Modify: `src/components/ui/ui.css`（在檔尾 `@media (max-width: 430px)` 區塊之前加入）

**Interfaces:**
- Produces:
  ```ts
  type SegmentedOption<T extends string> = { value: T; label: ReactNode; count?: number; disabled?: boolean }
  function SegmentedControl<T extends string>(props: {
    label: string; value: T; options: SegmentedOption<T>[]; onChange: (value: T) => void; className?: string
  }): JSX.Element
  ```
  每個選項是原生 radio，無障礙名稱為「標籤 數量」（例如「未付款 18」）。第 2～4 階段用於團購篩選、付款篩選、門檻類型、到貨方式。

- [ ] **Step 1: 寫失敗測試**

`src/components/ui/SegmentedControl.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SegmentedControl } from './SegmentedControl'

describe('SegmentedControl', () => {
  it('works as a labelled radio group with optional counts', async () => {
    const user = userEvent.setup()
    const change = vi.fn()
    render(
      <SegmentedControl
        label="付款篩選"
        value="all"
        onChange={change}
        options={[
          { value: 'all', label: '全部', count: 50 },
          { value: 'unpaid', label: '未付款', count: 18 },
          { value: 'paid', label: '已付款', count: 32, disabled: true },
        ]}
      />,
    )

    expect(screen.getByRole('radiogroup', { name: '付款篩選' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '全部 50' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: '未付款 18' }))
    expect(change).toHaveBeenCalledWith('unpaid')
    expect(screen.getByRole('radio', { name: '已付款 32' })).toBeDisabled()
  })

  it('omits the count when none is given', () => {
    render(
      <SegmentedControl
        label="成團門檻"
        value="quantity"
        onChange={vi.fn()}
        options={[{ value: 'quantity', label: '數量' }, { value: 'amount', label: '總金額' }]}
      />,
    )

    expect(screen.getByRole('radio', { name: '數量' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '總金額' })).not.toBeChecked()
  })
})
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/components/ui/SegmentedControl.test.tsx`
Expected: FAIL（找不到 `./SegmentedControl` 模組）

- [ ] **Step 3: 實作 `src/components/ui/SegmentedControl.tsx`**

```tsx
import { useId, type ReactNode } from 'react'

export type SegmentedOption<T extends string> = {
  value: T
  label: ReactNode
  count?: number
  disabled?: boolean
}

type SegmentedControlProps<T extends string> = {
  label: string
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  className?: string
}

export function SegmentedControl<T extends string>({ label, value, options, onChange, className = '' }: SegmentedControlProps<T>) {
  const name = useId()
  return (
    <div className={`ui-segmented ${className}`.trim()} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <label key={option.value} className="ui-segmented-option">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
          />
          <span>
            {option.label}
            {option.count !== undefined && <> <span className="ui-segmented-count">{option.count}</span></>}
          </span>
        </label>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: 加入樣式**

在 `src/components/ui/ui.css` 檔尾 `@media (max-width: 430px) {` 之前加入：

```css
.ui-segmented { display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 3px; border-radius: var(--radius-pill); background: var(--color-neutral-subtle); }
.ui-segmented-option { position: relative; display: inline-flex; }
.ui-segmented-option::after { content: ""; position: absolute; inset: -4px 0; }
.ui-segmented-option input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.ui-segmented-option > span { display: inline-flex; align-items: center; gap: var(--space-1); min-height: 36px; padding: 0 14px; border-radius: var(--radius-pill); color: var(--color-text); font-size: var(--font-size-dense); white-space: nowrap; cursor: pointer; }
.ui-segmented-option input:checked + span { background: var(--color-surface); font-weight: var(--font-weight-strong); box-shadow: 0 0 0 1px var(--color-border); }
.ui-segmented-option input:focus-visible + span { outline: 2px solid var(--color-focus); outline-offset: 2px; }
.ui-segmented-option input:disabled + span { color: var(--color-disabled-text); cursor: not-allowed; }
.ui-segmented-count { color: var(--color-text-secondary); font-variant-numeric: tabular-nums; }
```

選取中那一格用 1px 外圈（`box-shadow: 0 0 0 1px`）當細框，這是 DESIGN.md 允許的「ring」用法，不是陰影層次。

- [ ] **Step 5: 確認測試通過**

Run: `npx vitest run src/components/ui/SegmentedControl.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/SegmentedControl.tsx src/components/ui/SegmentedControl.test.tsx src/components/ui/ui.css
git commit -m "feat: add a radio-backed segmented control"
```

---

### Task 6: Switch 開關

**Files:**
- Create: `src/components/ui/Switch.tsx`
- Create: `src/components/ui/Switch.test.tsx`
- Modify: `src/components/ui/ui.css`（在 `@media (max-width: 430px)` 之前加入）

**Interfaces:**
- Produces: `<Switch label description? checked onChange={(checked: boolean) => void} disabled? className? />`，輸出原生 `<input type="checkbox" role="switch">`，說明文字接到 `aria-describedby`。第 5 階段用於折扣、任選優惠、額外品項、結單日期。

- [ ] **Step 1: 寫失敗測試**

`src/components/ui/Switch.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Switch } from './Switch'

describe('Switch', () => {
  it('exposes a labelled switch with its description', async () => {
    const user = userEvent.setup()
    const change = vi.fn()
    const { rerender } = render(
      <Switch label="全團基本折扣" description="所有品項都打折，例如 9 折" checked={false} onChange={change} />,
    )

    const toggle = screen.getByRole('switch', { name: '全團基本折扣' })
    expect(toggle).not.toBeChecked()
    expect(toggle).toHaveAccessibleDescription('所有品項都打折，例如 9 折')

    await user.click(toggle)
    expect(change).toHaveBeenLastCalledWith(true)
    await user.click(screen.getByText('全團基本折扣'))
    expect(change).toHaveBeenCalledTimes(2)

    rerender(<Switch label="全團基本折扣" checked onChange={change} disabled />)
    expect(screen.getByRole('switch', { name: '全團基本折扣' })).toBeChecked()
    expect(screen.getByRole('switch', { name: '全團基本折扣' })).toBeDisabled()
  })
})
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/components/ui/Switch.test.tsx`
Expected: FAIL（找不到 `./Switch` 模組）

- [ ] **Step 3: 實作 `src/components/ui/Switch.tsx`**

```tsx
import { useId, type ReactNode } from 'react'

type SwitchProps = {
  label: ReactNode
  description?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

export function Switch({ label, description, checked, onChange, disabled = false, className = '' }: SwitchProps) {
  const id = useId()
  const descriptionId = description ? `${id}-description` : undefined
  return (
    <div className={`ui-switch ${className}`.trim()}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-describedby={descriptionId}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label htmlFor={id}>{label}</label>
      {description && <p id={descriptionId} className="ui-switch-description">{description}</p>}
    </div>
  )
}
```

- [ ] **Step 4: 加入樣式**

在 `src/components/ui/ui.css` 的 `@media (max-width: 430px) {` 之前加入：

```css
.ui-switch { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: var(--space-3); align-items: center; min-height: var(--touch-target); }
.ui-switch input { appearance: none; position: relative; width: 46px; height: 28px; margin: 8px 0; border-radius: var(--radius-pill); background: var(--color-border-strong); cursor: pointer; transition: background-color var(--duration-fast); }
.ui-switch input::before { content: ""; position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: var(--color-surface); transition: transform var(--duration-fast); }
.ui-switch input:checked { background: var(--color-primary); }
.ui-switch input:checked::before { transform: translateX(18px); }
.ui-switch input:disabled { background: var(--color-disabled-bg); cursor: not-allowed; }
.ui-switch label { font-weight: var(--font-weight-strong); cursor: pointer; }
.ui-switch-description { grid-column: 2; margin: 0; color: var(--color-text-secondary); font-size: var(--font-size-caption); }
```

- [ ] **Step 5: 確認測試通過**

Run: `npx vitest run src/components/ui/Switch.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Switch.tsx src/components/ui/Switch.test.tsx src/components/ui/ui.css
git commit -m "feat: add an accessible switch"
```

---

### Task 7: Menu「⋯」選單

**Files:**
- Create: `src/components/ui/Menu.tsx`
- Create: `src/components/ui/Menu.test.tsx`
- Modify: `src/components/ui/ui.css`（在 `@media (max-width: 430px)` 之前加入）

**Interfaces:**
- Produces:
  ```ts
  type MenuItem = {
    label: string; ariaLabel?: string; onSelect?: () => void; href?: string; target?: string
    tone?: 'default' | 'danger'; disabled?: boolean; icon?: ReactNode
  }
  function Menu(props: { label: string; items: MenuItem[]; triggerContent?: ReactNode; size?: 'md' | 'sm'; className?: string }): JSX.Element
  ```
  觸發鈕 `aria-label={label}`、`aria-haspopup="menu"`、`aria-expanded`；開啟後聚焦第一項，↑↓ Home End 移動，Esc 關閉並把焦點還給觸發鈕，點外面關閉，選擇後關閉。選擇會開對話框的項目時，焦點先回到觸發鈕，讓 `ConfirmDialog` 關閉後能正確歸還焦點。第 3、4 階段取代團主列表的 `<details>` 選單與訂單列的操作。

- [ ] **Step 1: 寫失敗測試**

`src/components/ui/Menu.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Menu } from './Menu'

describe('Menu', () => {
  it('opens a keyboard-navigable overflow menu and returns focus on Escape', async () => {
    const user = userEvent.setup()
    render(
      <Menu
        label="更多操作 冰餅團"
        items={[
          { label: '複製住戶連結', onSelect: vi.fn() },
          { label: '查看住戶頁', href: '/campaign/abc', target: '_blank' },
          { label: '刪除團購', onSelect: vi.fn(), tone: 'danger' },
        ]}
      />,
    )

    const trigger = screen.getByRole('button', { name: '更多操作 冰餅團' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('menuitem')).toHaveLength(3)
    expect(screen.getByRole('menuitem', { name: '複製住戶連結' })).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: '查看住戶頁' })).toHaveFocus()
    expect(screen.getByRole('menuitem', { name: '查看住戶頁' })).toHaveAttribute('href', '/campaign/abc')
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: '刪除團購' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('runs the chosen action once, closes, and focuses the trigger', async () => {
    const user = userEvent.setup()
    const copy = vi.fn()
    render(<Menu label="更多操作 冰餅團" items={[{ label: '複製住戶連結', onSelect: copy }]} />)

    await user.click(screen.getByRole('button', { name: '更多操作 冰餅團' }))
    await user.click(screen.getByRole('menuitem', { name: '複製住戶連結' }))

    expect(copy).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '更多操作 冰餅團' })).toHaveFocus()
  })

  it('ignores disabled items and closes on an outside click', async () => {
    const user = userEvent.setup()
    const cancel = vi.fn()
    render(<Menu label="訂單操作 斯祈" items={[{ label: '取消整筆訂單', onSelect: cancel, disabled: true }]} />)

    await user.click(screen.getByRole('button', { name: '訂單操作 斯祈' }))
    const item = screen.getByRole('menuitem', { name: '取消整筆訂單' })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    await user.click(item)
    expect(cancel).not.toHaveBeenCalled()
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.click(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('gives repeated row actions a distinct accessible name', async () => {
    const user = userEvent.setup()
    render(<Menu label="更多操作 冰餅團" items={[{ label: '刪除團購', ariaLabel: '刪除 冰餅團', onSelect: vi.fn() }]} />)

    await user.click(screen.getByRole('button', { name: '更多操作 冰餅團' }))
    expect(screen.getByRole('menuitem', { name: '刪除 冰餅團' })).toHaveTextContent('刪除團購')
  })
})
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/components/ui/Menu.test.tsx`
Expected: FAIL（找不到 `./Menu` 模組）

- [ ] **Step 3: 實作 `src/components/ui/Menu.tsx`**

```tsx
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

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

export function Menu({ label, items, triggerContent = '⋯', size = 'md', className = '' }: MenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  const enabledItems = () => [
    ...(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []),
  ]

  useEffect(() => {
    if (!open) return
    enabledItems()[0]?.focus()
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
    const elements = enabledItems()
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
      close(true)
    } else if (event.key === 'Tab') {
      close(false)
    }
  }

  return (
    <div ref={rootRef} className={`ui-menu ${className}`.trim()} data-size={size}>
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
        <div id={menuId} role="menu" aria-label={label} className="ui-menu-popup" onKeyDown={moveFocus}>
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
              onClick={() => close(false)}
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

- [ ] **Step 4: 加入樣式**

在 `src/components/ui/ui.css` 的 `@media (max-width: 430px) {` 之前加入：

```css
.ui-menu { position: relative; display: inline-flex; }
.ui-menu-trigger { position: relative; display: inline-grid; place-items: center; width: var(--touch-target); height: var(--touch-target); border: 1px solid var(--color-border-strong); border-radius: var(--radius-control); background: var(--color-surface); color: var(--color-text); font-size: 18px; line-height: 1; cursor: pointer; }
.ui-menu[data-size="sm"] .ui-menu-trigger { width: 32px; height: 32px; }
.ui-menu[data-size="sm"] .ui-menu-trigger::after { content: ""; position: absolute; inset: -6px; }
.ui-menu-trigger[aria-expanded="true"] { background: var(--color-surface-subtle); }
.ui-menu-popup { position: absolute; top: calc(100% + 4px); right: 0; z-index: 900; display: grid; min-width: 200px; padding: var(--space-1); border: 1px solid var(--color-border-strong); border-radius: 12px; background: var(--color-surface-raised); }
.ui-menu-popup :where(a, button) { display: flex; align-items: center; gap: var(--space-2); min-height: var(--touch-target); padding: 0 var(--space-3); border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text); font-size: var(--font-size-dense); text-align: left; text-decoration: none; cursor: pointer; }
.ui-menu-popup :where(a, button):hover,
.ui-menu-popup :where(a, button):focus-visible { background: var(--color-surface-subtle); }
.ui-menu-popup [data-tone="danger"] { color: var(--color-danger); }
.ui-menu-popup [aria-disabled="true"] { color: var(--color-disabled-text); cursor: not-allowed; }
```

- [ ] **Step 5: 確認測試通過**

Run: `npx vitest run src/components/ui/Menu.test.tsx`
Expected: PASS（4 項）

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Menu.tsx src/components/ui/Menu.test.tsx src/components/ui/ui.css
git commit -m "feat: add a keyboard-friendly overflow menu"
```

---

### Task 8: Toast 可復原提示

**Files:**
- Create: `src/components/ui/Toast.tsx`
- Create: `src/components/ui/Toast.test.tsx`
- Modify: `src/components/ui/ui.css`（在 `@media (max-width: 430px)` 之前加入）

**Interfaces:**
- Produces: `<Toast message actionLabel? onAction? onDismiss duration? className? />`，`role="status"`，預設 5000ms 後呼叫 `onDismiss`；滑鼠停留或焦點在內時暫停，離開後重新計時；按動作鈕先呼叫 `onAction` 再 `onDismiss`。**呼叫端每則提示要給不同的 `key`**，換一則提示才會重新計時（計時不依賴 `message` 內容，避免父元件重繪時一直重算）。第 4 階段用於付款復原。

- [ ] **Step 1: 寫失敗測試**

`src/components/ui/Toast.test.tsx`：

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Toast } from './Toast'

describe('Toast', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('announces the message and dismisses itself after five seconds', () => {
    vi.useFakeTimers()
    const dismiss = vi.fn()
    render(<Toast message="已將斯祈標記為已付款" onDismiss={dismiss} />)

    expect(screen.getByRole('status')).toHaveTextContent('已將斯祈標記為已付款')
    act(() => { vi.advanceTimersByTime(4999) })
    expect(dismiss).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1) })
    expect(dismiss).toHaveBeenCalledOnce()
  })

  it('pauses while hovered and restarts the countdown when left', () => {
    vi.useFakeTimers()
    const dismiss = vi.fn()
    render(<Toast message="已儲存" onDismiss={dismiss} />)

    fireEvent.mouseEnter(screen.getByRole('status'))
    act(() => { vi.advanceTimersByTime(10000) })
    expect(dismiss).not.toHaveBeenCalled()
    fireEvent.mouseLeave(screen.getByRole('status'))
    act(() => { vi.advanceTimersByTime(4999) })
    expect(dismiss).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1) })
    expect(dismiss).toHaveBeenCalledOnce()
  })

  it('runs the undo action and then closes', () => {
    const undo = vi.fn()
    const dismiss = vi.fn()
    render(<Toast message="已將斯祈標記為已付款" actionLabel="復原" onAction={undo} onDismiss={dismiss} />)

    fireEvent.click(screen.getByRole('button', { name: '復原' }))
    expect(undo).toHaveBeenCalledOnce()
    expect(dismiss).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: 確認測試失敗**

Run: `npx vitest run src/components/ui/Toast.test.tsx`
Expected: FAIL（找不到 `./Toast` 模組）

- [ ] **Step 3: 實作 `src/components/ui/Toast.tsx`**

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react'

type ToastProps = {
  message: ReactNode
  actionLabel?: string
  onAction?: () => void
  onDismiss: () => void
  duration?: number
  className?: string
}

export function Toast({ message, actionLabel, onAction, onDismiss, duration = 5000, className = '' }: ToastProps) {
  const [paused, setPaused] = useState(false)
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    if (paused) return
    const timer = window.setTimeout(() => onDismissRef.current(), duration)
    return () => window.clearTimeout(timer)
  }, [paused, duration])

  return (
    <div
      className={`ui-toast ${className}`.trim()}
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false)
      }}
    >
      <span>{message}</span>
      {actionLabel && onAction && (
        <button
          type="button"
          className="ui-toast-action"
          onClick={() => {
            onAction()
            onDismiss()
          }}
        >{actionLabel}</button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 加入樣式**

在 `src/components/ui/ui.css` 的 `@media (max-width: 430px) {` 之前加入：

```css
.ui-toast { position: fixed; left: 50%; bottom: calc(var(--space-4) + env(safe-area-inset-bottom)); z-index: 1100; display: flex; align-items: center; gap: var(--space-4); max-width: min(calc(100vw - 32px), 480px); padding: 10px 12px 10px 16px; border-radius: 12px; background: var(--color-text); color: var(--color-on-primary); font-size: var(--font-size-dense); transform: translateX(-50%); }
.ui-toast-action { position: relative; min-height: 32px; padding: 0 var(--space-2); border: 0; background: transparent; color: var(--color-primary-on-dark); font-weight: var(--font-weight-strong); cursor: pointer; }
.ui-toast-action::after { content: ""; position: absolute; inset: -6px 0; }
```

- [ ] **Step 5: 確認測試通過**

Run: `npx vitest run src/components/ui/Toast.test.tsx`
Expected: PASS（3 項）

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Toast.tsx src/components/ui/Toast.test.tsx src/components/ui/ui.css
git commit -m "feat: add an undoable toast"
```

---

### Task 9: 整體驗證與改版前後對照

**Files:**
- 可能修改：第 1 階段造成破版的頁面 CSS（`src/App.css`、`src/AdminApp.css`、`src/AdminOrdersPanel.css`、`src/CampaignListApp.css`、`src/ResidentCampaignListApp.css`、`src/ResidentMemberManagementApp.css`、`src/LocalLiveApps.css`、`src/PickupNotificationPanel.css`、`src/AutoCloseNotificationSettings.css`）。只修破版，不做改版（改版屬於第 2～5 階段）。

- [ ] **Step 1: 完整測試、lint、build**

```bash
npx vitest run
npm run lint
npm run build
```

Expected: 測試全部 PASS，數量為原本 447 項加上本階段新增（tokens 21、SegmentedControl 2、Switch 1、Menu 4、Toast 3，以及 ui.test 淨增 3，合計 +34）。改版前基準（2026-09-21 實測）為 69 個測試檔、447 項，因此預期為 **74 個測試檔、481 項全部通過**；lint 無錯誤；build 成功。

- [ ] **Step 2: 截改版後畫面**

確認 Task 0 的 `npm run dev` 仍在執行，然後：

```bash
node scripts/capture-pages.mjs .superpowers/qa/phase-1/after
```

- [ ] **Step 3: 比對水平溢出**

```bash
node -e "const before=require('./.superpowers/qa/phase-1/before/report.json');const after=require('./.superpowers/qa/phase-1/after/report.json');for(const shot of after){const base=before.find((entry)=>entry.file===shot.file);const worse=shot.scrollWidth>shot.clientWidth||shot.offenders.length>(base?base.offenders.length:0);console.log(worse?'CHECK':'ok   ',shot.file,shot.scrollWidth+'/'+shot.clientWidth,'offenders',(base?base.offenders.length:'-')+' -> '+shot.offenders.length)}"
```

Expected: 每一行都是 `ok`。出現 `CHECK` 的截圖要打開 `report.json` 看 `offenders` 並修正。

- [ ] **Step 4: 逐張目視對照**

把 `before/` 與 `after/` 同名 PNG 逐對打開比較（15 對）。預期的變化：綠色與藍色主色都變成 `#0066cc`、按鈕變膠囊形、卡片圓角變大、陰影消失。**要修的破版**：
- 文字被截斷或互相重疊
- 按鈕文字看不清（例如深色字壓在藍底上、白字壓在白底上）
- 版面塌陷（原本並排的區塊擠成一團或跑出容器）
- 出現水平捲軸

頁面 CSS 若以寫死的顏色蓋過共用元件（例如 `App.css` 的 `.submit-button`、`LocalLiveApps.css` 的 `.line-login-action`）而造成上述問題，只在該頁 CSS 做最小修正，並在 commit 訊息寫出修了哪一頁、哪個問題。

- [ ] **Step 5: 修正後重新驗證**

若 Step 4 有修改，重跑 Step 1～3，確認全部 PASS 且全部 `ok`。

- [ ] **Step 6: Commit（只有 Step 4 有修改時）**

```bash
git add <修改過的頁面 CSS>
git commit -m "fix: keep <頁面> readable after the token change"
```

- [ ] **Step 7: 回報，不 push**

向團主回報：
- 測試、lint、build 結果與測試數量
- 15 對截圖中有變化的頁面摘要，以及修了哪些破版
- 提醒：本階段未 push；建議與第 2 階段（住戶端）一起上線，避免住戶端出現新舊配色混搭

---

## 執行結果與留給後續階段的事項（2026-09-21）

**結果：** Task 0～9 全部完成，另依整體審查補一輪修正（commits `7234fdd`…`9e22e77`，均未 push）。74 個測試檔、487 項全部通過；lint、build 通過；5 頁 × 3 寬度改版前後截圖無破版、無水平溢出。

**執行中對計畫的修正：**
- 數量加減鈕、開關、Toast 的「復原」按鈕原計畫的觸控範圍不足 44px，已各自補上擴大可點範圍的 `::after` 或 `min-width`。
- Toast 改為分別記錄滑鼠停留與焦點，兩者任一存在就暫停（原計畫只有一個狀態，滑鼠移開會在焦點仍在時恢復倒數）。
- `prefers-reduced-motion` 時 `--press-scale: 1`，按下不再縮小。
- Menu 的停用項目仍可聚焦但不可執行（避免只有停用項目時鍵盤無法操作），焦點離開選單即關閉。
- 停用中的 Switch 改用半透明，仍看得出開或關；關閉狀態的軌道改用 `--color-control-off: #86868b`（非文字元件對比 ≥ 3:1）。

**後續階段開工前要處理：**
- 第 2 階段開始前：新增互動用的底色 token（hover、選單開啟時的底色；目前的 `--color-surface-subtle` 與白色幾乎無差）；統一 44px 觸控範圍的做法（寬度也保證 44px）；把 12px 圓角與 z-index 層級做成 token；hover 樣式包在 `@media (hover: hover)`；在計畫的〈對 Spec 的調整〉記下按鈕變體命名為 `danger`／`danger-solid`（Spec 寫 destructive），並加測試確保 `danger-solid` 只用在確認視窗。
- 第 3 階段（團主架構）開始前：Menu 放進可點的表格列時要阻止點擊冒泡；表格可捲動時選單會被裁切，考慮原生 `popover`；選擇連結項目後焦點會掉到 body；對話框內的 Menu 按 Esc 會同時關掉對話框。截圖腳本在 `click` 選擇器找不到時必須報錯（第 3 階段會移除 `#admin-orders-tab`）。IconButton 的 padding 被 utility 變體蓋掉，第一次使用時修正選擇器。
- 第 4 階段（付款復原）開始前：Toast 應先 `onDismiss` 再 `onAction`，避免吃掉接著出現的提示；復原後焦點要回到付款格；提示區改為常駐的 live region 再放入文字；呼叫端每則提示給不同 `key`。
- 既有頁面問題（隨各頁改寫處理）：`AdminApp.css` 引用不存在的 `--color-background`，`.admin-eyebrow`／`.admin-item-code` 對比約 4.1～4.3:1；`ResidentCampaignListApp.css` 的狀態標籤覆寫帶陰影與 850 字重。
