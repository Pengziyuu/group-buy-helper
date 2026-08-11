# 團購小幫手

給社區團購團主與住戶使用的 LIFF 團購工具。核心目標是保留 LINE 記事本「大家看得到訂單與成團進度」的可見性，同時自動統計數量。

## 目前完成

- React + Vite + TypeScript + Tailwind 專案
- 手機優先的客人端團購頁
- 即時成團進度與公開訂單牆 UI
- 客人只能編輯自己的訂單之互動流程
- 真實六筆資料示範：62/100、總金額 2,790 元
- 戶號解析規則：整串英數字為戶號、明寫期別才覆蓋、預設二期
- 團主公告長文、Emoji 與多張商品圖片展示
- `/admin` 團主開團編輯器與住戶端即時預覽
- LIFF 身分載入與 ID token 邊界
- demo/live 環境設定防呆
- Supabase schema、RLS 與 Realtime migration
- 29 個前端／領域自動測試
- 可重建的本機 Supabase migration、seed 與產生型別

## 本機執行

需要 Node.js 22.12.0 以上版本。

```bash
npm install
npm run dev
```

- 住戶端：`http://localhost:5173/`
- 團主後台 Demo：`http://localhost:5173/admin`

沒有 `.env` 時自動使用 demo 模式，不會連外或修改真實資料。

## 測試與建置

```bash
npm test
npm run build
```

## 正式環境設定

複製 `.env.example` 為 `.env.local`：

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
VITE_LIFF_ID=YOUR_LIFF_ID
```

三個值必須同時存在，否則應用程式會明確報錯，不會半套進入 live 模式。

## Supabase

Migration 位於 `supabase/migrations/`。正式上線前：

1. 建立 Supabase 專案。
2. 啟用 Anonymous Sign-Ins，讓每個 LIFF 使用者取得獨立 `auth.uid()`。
3. 執行 migration。
4. 建立團主的 Supabase Auth 帳號並加入 `admin_users`。
5. 匯入住戶白名單；只含姓名、期別、戶號，不含電話。
6. 設定 Edge Function secrets：LINE Channel ID、Supabase service role key。

本機 Supabase（需要 Docker Desktop）：

```bash
npx supabase start
npx supabase db reset
npx supabase gen types typescript --local > src/types/database.ts
npx supabase functions serve
```

`db reset` 會從零套用 migration，並載入 `supabase/seed.sql` 的非敏感示範資料。

## LINE / LIFF

1. 建立 LINE Login channel。
2. 建立 LIFF app，Endpoint URL 指向 Vercel HTTPS 網址。
3. 啟用 `profile` 與 `openid` scope。
4. 將 LIFF ID 放入 `VITE_LIFF_ID`。
5. ID token 必須交給後端向 LINE 驗證，不信任前端自行傳入的 UserID。

## 安全原則

- `line_user_id` 不出現在公開 view 或前端一般查詢。
- UserID 經 LINE ID token 驗證後，才可與白名單戶號綁定。
- 客人只能更新綁定到自己 `auth.uid()` 的訂單。
- 結單後禁止修改。
- 單品數量限制 0–20。
- 團主操作使用 Supabase Auth；敏感寫入不使用公開匿名權限。

## 下一個外部依賴

要切換到真實 live 模式，需要：

- Supabase Project URL
- Supabase publishable/anon key
- LINE LIFF ID
- LINE Login Channel ID（僅放 Edge Function secret）
- 約 30 戶白名單

不要把 service role key、LINE UserID 或其他秘密提交到 Git。
