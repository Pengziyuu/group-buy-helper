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
- `/admin` 團購列表可保留舊團、建立新團，並依草稿／收單中／已結單／已到貨顯示狀態
- 新團預設只有 A 號；發布後取得不暴露資料庫 UUID 的 `/campaign/<slug>` 住戶分享連結
- 草稿會自動暫存並與已發布版本隔離；只有「發布並開團／更新住戶公告」會更新住戶端
- 商品名稱與口味對照集中寫在開團資訊；下單選項只顯示 A 號、B 號等字母
- 第一次開團前可增加或減少最後字母；正式開團後單價與品項字母鎖定
- 住戶頁顯示資料庫開團時間，公開訂單牆顯示下單時間與最後修改時間
- LIFF 身分載入與 ID token 邊界
- demo/live 環境設定防呆
- Supabase schema、RLS 與 Realtime migration
- Supabase `campaign_draft`、團主專用 RLS、原子發布 RPC 與前端 gateway
- 本機 Supabase Auth 團主登入與住戶 Realtime 可視化 Demo
- 團主訂單統計：戶數、總量、總額、成團差額、動態品項彙總與逐戶明細
- 團主工作流：結單、重新開放、標記到貨、逐戶已付款／未付款與領取狀態；不記錄付款方式
- 商品圖片以 `{src, alt}` JSON 保存，資料庫驗證替代文字及最多 10 張限制
- 團主可上傳 JPG、PNG、WebP 到 Supabase Storage；單檔最多 5 MB，住戶只能公開讀取
- 110 個前端／領域自動測試
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
Demo 模式以瀏覽器 localStorage 保存草稿與已發布內容；正式 live 模式會改用 Supabase。

## 本機 Supabase 可視化 Demo

先啟動本機 Supabase，再執行一鍵啟動器：

```bash
npx supabase start
python scripts/start_local_live_demo.py
```

啟動器不會把 Supabase key 寫入檔案，會建立／更新本機專用團主帳號，並在 `5174` 啟動 Live Demo：

- 住戶端：`http://localhost:5174/`
- 團主後台：`http://localhost:5174/admin`
- 住戶分享連結：`http://localhost:5174/campaign/<slug>`
- 同網路手機網址：啟動器會列出 `http://<區網 IP>:5174/`
- Email：`admin@group-buy.local`
- 密碼：`LocalDemo-Only-2026!`

此帳號與密碼只供本機可丟棄的 Supabase 開發資料庫使用，禁止用於正式環境。原本 `5173` 仍是互不影響的 localStorage Demo。

啟動器會自動偵測主要區網 IP；若電腦有多張網卡而選錯，可先設定 `LOCAL_LIVE_DEMO_HOST=192.168.x.x` 再啟動。

Live Demo 驗收方式：團主登入後先進入團購列表，可建立新團或管理舊團。新團預設只有 A 號，內容修改會自動暫存但住戶端尚不可見；按「發布並開團」後，列表會出現住戶分享連結。已發布內容更新後，開啟中的住戶端會透過 Realtime 自動更新。第一次開團後品項字母與單價鎖定。團主仍可上傳圖片、結單／重新開放／標記到貨，以及更新逐戶已付款／未付款與領取狀態；結單後住戶端會即時鎖定訂單控制。

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
# 團主 LIFF
VITE_LIFF_ID=YOUR_LIFF_ID
# 住戶 LIFF
VITE_RESIDENT_LIFF_ID=YOUR_RESIDENT_LIFF_ID
```

Supabase URL 與 publishable/anon key 必須同時存在，否則應用程式會明確報錯，不會半套進入 live 模式。正式 live 模式的 `/admin`、`/admin/campaign/<uuid>`、`/campaign/<slug>` 與根網址全部使用 Supabase；根網址是LINE驗證住戶的全部已發布團購列表。舊版 `/join/<invite>` 僅保留網址相容性，不再作為入會憑證。

Vercel 部署設定已放在 `vercel.json`；`/admin`使用團主專用HTML連結預覽，其餘SPA深層網址rewrite到`index.html`，因此直接開啟或重新整理團主管理／住戶分享連結不會由主機回傳404。

## Supabase

Migration 位於 `supabase/migrations/`。目前採**單一社區部署模型**：一個 Supabase／Vercel deployment 對應一個 LINE 社區群組，資料庫會拒絕第二筆 community 與非預設 community 的 campaign。若未來需要一個部署服務多社區，必須先完成 organizer-community membership、全套 RLS／RPC／Storage 多租戶改造，不可直接移除 constraint。

正式上線前：

1. 建立 Supabase 專案。
2. 保持 Anonymous Sign-Ins 關閉；住戶與團主都由可信 LINE ID token 交換獨立 Supabase Session。
3. 執行 migration。
4. 團主由 LINE 申請及可信核准流程加入 `admin_users`。
5. 設定 Edge Function secrets：LINE Channel ID、Supabase service role key與住戶內部Email雜湊pepper（`LINE_RESIDENT_EMAIL_PEPPER`）。

本機 Supabase（需要 Docker Desktop）：

```bash
npx supabase start
npx supabase db reset
npx supabase gen types typescript --local > src/types/database.ts
npx supabase functions serve
```

`db reset` 會從零套用 migration，並載入 `supabase/seed.sql` 的非敏感示範資料。

本機草稿／發布 RLS 整合驗證（Git Bash）：

```bash
set -a
eval "$(npx supabase status -o env)"
set +a
python scripts/verify_supabase_draft.py
python scripts/verify_campaign_management.py
python scripts/verify_dynamic_items.py
python scripts/verify_order_workflow.py
python scripts/verify_storage.py
```

五支腳本共驗證 51 項 Supabase 行為，並使用臨時 Auth 使用者：團購管理腳本驗證團主可原子建立新團、預設 A 號、列表採用最新草稿標題、既有存取權也不能讀取未發布團購，以及未發布 slug 隔離；草稿腳本驗證發布隔離、圖片與開團時間；動態品項腳本驗證安全刪除／停用、歷史數量與訂單時間；工作流腳本驗證團主權限、結單與履約狀態；Storage 腳本驗證團主上傳／刪除、住戶禁止寫入及公開讀取。腳本不會輸出或寫入 API key。動態品項腳本會修改本機 seed 資料，執行後請跑一次 `npx supabase db reset` 還原。

## LINE / LIFF

1. 建立 LINE Login channel。
2. 建立團主 LIFF app，Endpoint URL 指向 Vercel HTTPS `/admin` 網址。
3. 在同一個 LINE Login channel 建立住戶 LIFF app，Endpoint URL 指向 Vercel HTTPS 根網址。
4. 兩個 LIFF app 都只啟用 `profile` 與 `openid` scope，Add friend option 關閉。
5. 團主 LIFF ID 放入 `VITE_LIFF_ID`，住戶 LIFF ID 放入 `VITE_RESIDENT_LIFF_ID`，LINE Login Channel ID 放入Edge Function secret `LINE_CHANNEL_ID`。
6. 團主與住戶都只把 ID token 交給後端向 LINE 官方驗證；前端 `profile.userId`、名稱與頭貼不作為授權或可信資料來源。
7. 住戶固定使用短版入口 `https://liff.line.me/<住戶LIFF-ID>`。任何持有效LINE帳號者都可加入；LINE LIFF無法證明使用者目前是否在指定聊天群組。
   - 團主後台以LINE官方驗證名稱、頭貼、期別／戶號及加入時間顯示住戶名單。
   - 團主可移除並封鎖陌生住戶；封鎖會立即撤銷community membership，阻止再次加入。解除封鎖後恢復membership。
8. 新團主第一次以 LIFF 登入時只會取得隨機申請代碼，不會立即取得後台權限。使用可信環境執行：

```bash
API_URL=https://YOUR_PROJECT.supabase.co \
SECRET_KEY=YOUR_SERVICE_ROLE_KEY \
python scripts/approve_line_organizer.py <request-code>
```

核准腳本不接受或輸出 LINE User ID。每位團主使用自己的 LINE 帳號申請與核准，因此可安全設定兩位以上團主。

## 安全原則

- `line_user_id` 不出現在公開 view 或前端一般查詢。
- LINE subject 經官方驗證後只保存在 service-role-only 資料表，不出現在列表、訂單牆或前端權限資料。
- 住戶名稱與頭貼只從LINE官方驗證回應同步；首次住戶只填期別與戶號。
- 住戶列表只由安全RPC回傳其community內已發布團購的最小欄位；草稿與其他community永不回傳。
- 團主管理住戶只使用安全隨機member code；LINE subject、Auth UID與community UUID不回傳前端。
- 客人只能更新綁定到自己 `auth.uid()` 的訂單。
- 結單後禁止修改。
- 單品數量限制 0–20。
- 團主操作使用 Supabase Auth；敏感寫入不使用公開匿名權限。
- 草稿僅 `admin_users` 可讀寫；住戶只能讀取已發布的 `campaign_public`。
- 付款只保存完成狀態，不保存現金、轉帳等付款方式。
- `campaign-images` bucket 公開讀取，但新增、更新與刪除均由團主 RLS 限制。

## 下一個外部依賴

公開 HTTPS 測試階段需要：

- Supabase Project URL
- Supabase publishable/anon key

接 LINE LIFF 時另外需要：

- 團主與住戶兩個 LINE LIFF ID
- LINE Login Channel ID（僅放 Edge Function secret）
- 團主與住戶的固定LIFF短網址

不要把 service role key、LINE UserID 或其他秘密提交到 Git。
