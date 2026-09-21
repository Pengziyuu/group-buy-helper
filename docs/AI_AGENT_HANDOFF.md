# AI Agent 接手指南

> 本文件是接手本專案的第一入口。先讀完本頁，再依工作內容閱讀 `README.md`、相關 migration、測試與專題文件。不要只從畫面或元件名稱推測資料權限。

## 1. 專案定位與目前狀態

這是單一社區使用的 LINE LIFF 團購系統：

- 住戶以 LINE 驗證身分，瀏覽所有已發布團購、下單及查看自己的訂單。
- 團主以另一個 LIFF 入口登入，管理團購、住戶、訂單、付款完成狀態、匯出與通知。
- 前端部署於 Vercel，資料、Auth、Realtime、Storage、pg_cron 與 Edge Functions 位於 Supabase。
- 正式站：<https://group-buy-helper-liart.vercel.app/>
- 團主入口：<https://group-buy-helper-liart.vercel.app/admin>
- Supabase project ref：`ynezmoyjovjeeimjdizr`
- 功能基線 commit：`5603ccd809bbc3a55213d87e243e11688e2e3b93`；接手時仍應先執行 `git log -5 --oneline` 與 `git status --short`。
- 最後完整驗證：69個測試檔、447項測試、lint、production build、本機資料庫重建與正式部署均通過。

### 目前唯一需要真人完成的設定

新上線的「自動結單通知」尚未替任何人指定收件者。真正要接收通知的已核准團主必須：

1. 用自己的 LINE 帳號進入團主 LIFF。
2. 在團主工作台的「自動結單通知」按「將我設為通知接收者」。
3. 看到「你目前是通知接收者」才算完成。

另一位已核准團主日後可登入並按「改由我接收通知」覆蓋設定。前端不列出團主名單，也不接收任何 LINE User ID、Auth UID 或選項識別碼。

## 2. 十分鐘上手

環境需求：Node.js `>=22.12.0`、Docker Desktop、Supabase CLI；Windows工具環境主要使用 Git Bash。

```bash
npm install
npm test -- --run
npm run lint
npm run build
```

本機完整 Supabase：

```bash
npx supabase start
npx supabase db reset
npx supabase gen types typescript --local > src/types/database.ts
python scripts/start_local_live_demo.py
```

- `5173`：沒有完整env時的 localStorage Demo，不代表Live功能可用。
- `5174`：由啟動器建立的本機 Supabase Live Demo。
- 修改 migration 後，至少執行一次從零 `db reset`；不要只驗證增量資料庫。
- 產生 `src/types/database.ts` 後要重新執行 lint與build，並確認檔案第一行仍是TypeScript型別，不含CLI訊息。

## 3. 程式入口與檔案地圖

### 前端

- `src/main.tsx`：瀏覽器入口。
- `src/RuntimeApp.tsx`、`src/routing.ts`：runtime模式與路由判定。
- `src/LocalLiveApps.tsx`：正式Supabase/LIFF組裝層、Auth生命週期及各gateway接線。
- `src/ResidentCampaignListApp.tsx`：住戶全部已發布團購列表。
- `src/App.tsx`：住戶團購詳情、下單、自己的訂單與即時訂單牆。
- `src/CampaignListApp.tsx`：團主工作台、團購列表、住戶管理入口與自動結單通知設定。
- `src/AdminApp.tsx`：團購草稿／發布編輯器。
- `src/AdminOrdersPanel.tsx`：團主訂單、付款、取消、匯出與領取通知。
- `src/NotificationTestLab.tsx`：與正式通知介面隔離的通知測試中心。
- `src/services/`：Supabase gateway、Excel匯出與migration／Edge Function契約測試。
- `src/domain/`：價格、折扣、戶籍、時間、門檻與訂單純領域邏輯。
- `src/types/database.ts`：由Supabase schema產生，不要手寫猜測RPC型別。

### Supabase

- `supabase/migrations/`：唯一schema歷史；新的行為要以新migration向前演進，不修改已部署migration。
- `supabase/functions/line-organizer-login/`：團主LINE身分交換。
- `supabase/functions/line-resident-login/`：住戶LINE身分交換。
- `supabase/functions/line-group-webhook/`：群組綁定與一次性領取通知指令。
- `supabase/functions/send-pickup-notification/`：正式領取通知預覽／指令。
- `supabase/functions/send-test-pickup-notification/`：測試中心專用入口。
- `supabase/functions/send-auto-close-organizer-notifications/`：pg_cron呼叫的一對一LINE Push worker。
- `supabase/seed.sql`：非敏感本機示範資料。

### 專題文件

- `docs/line-pickup-notifications.md`：領取通知的一次性指令、Reply API、正式／測試隔離與部署程序。
- `docs/superpowers/specs/2026-09-19-resident-identity-model-design.md`：住戶／其他身分模型。

## 4. 路由與runtime模式

- `/`：正式環境為LINE驗證住戶的全部已發布團購列表。
- `/campaign/<slug>`：單一已發布團購住戶頁；slug是分享能力，不暴露資料庫UUID。
- `/admin`：團主工作台。
- `/admin/campaign/<uuid>`：團購管理。
- `/admin/notification-lab`：隔離的通知測試中心。
- `vercel.json`將`/admin`及其子路徑rewrite到`admin.html`，其他路徑rewrite到`index.html`。

不要把localStorage Demo的成功當成Supabase Live驗收。Live交付至少要驗證Auth、RLS/RPC、Storage、Realtime與正式網址。

## 5. 不可破壞的產品規則

### 團購與商品

- 使用者可見活動狀態只有「開團中／已結單」；歷史`arrived`只保留底層相容，UI視為已結單，不再提供標記到貨。
- 品項代碼使用`A…Z、AA…`，畫面不加「號」；每項仍顯示真實名稱／口味及個別價格。
- 正式品項沒有每項20件產品限制，只受`smallint`安全範圍`0–32767`與數量型整團上限限制。
- 額外品項是活動層級開關；每單最多10筆、每筆1–20，只填名稱與數量並標示「金額另計」，完全不納入正式數量、金額、折扣、門檻或自動結單。
- 數量門檻：剛好達標即在訂單交易內自動結單，超額必須拒絕。
- 總金額門檻：以折扣後實收金額計算進度，但不自動結單。
- 排定結單：台灣時間12:00；到貨文字支援「貨到通知」、`MM/DD`及月份上／中／底。
- 即使每分鐘cron尚未掃描，截止後也不能新增、修改或取消訂單。

### 折扣

- 可設定基本折扣與一個指定商品任選優惠群組。
- 同一住戶單筆訂單內跨品項累計；達門檻後群組商品全部改用優惠折扣。
- 優惠折扣取代基本折扣，不疊加；折後單價先四捨五入成整數再乘數量。
- 訂單保存原價、折扣與成交價快照。

### 住戶身分與隱私

- LINE名稱與頭貼只能來自後端驗證過的LINE資料，不能讓使用者手填。
- 住戶即時訂單牆不得回傳或顯示任何人的期別／戶號，包括呼叫者自己。
- 登入住戶自己的期別／戶號只在「我的訂單」顯示。
- 團主後台可看完整住戶資料，但Browser只使用隨機`memberCode`操作，不取得LINE subject、Auth UID或community UUID。
- 同一期別＋戶號可有多個LINE帳號，各自獨立下單。
- `household_kind = other`不要求期別／戶號，也不納入LINE領取通知。
- 公開LINE入會模式是已接受的產品風險：任何有效LINE帳號可從固定LIFF入口加入，由團主依可信名稱／頭貼辨識及封鎖陌生人。

### 訂單與付款

- 只追蹤已付款／未付款，不記錄付款方式。
- 住戶不能送出空訂單；整筆取消由團主在開團中操作，且不可復原。
- 團購已結單後住戶訂單鎖定。
- `.xlsx`匯出是結單後純前端唯讀下載，不寫資料庫；正式總價使用公式，額外品項金額留空並標示另計。

## 6. LINE通知模型

### 領取通知：群組Reply API

領取通知不是直接群組Push。團主在後台產生短效、單次指令，貼入已綁定群組後，Bot以當次Webhook的Reply API發出Text message v2 mentions。完整規則見 `docs/line-pickup-notifications.md`。

不可退化：

- 正式／測試介面、群組槽位、Edge入口及intent嚴格隔離。
- 指令短效、單次、hash-only；Reply token只能在當次Webhook立即使用。
- 每個Text message v2最多20 mentions，每次Reply最多5個message objects，單一指令最多100人。
- 不取得完整群組成員名單，只逐一確認已知購買者仍是目標群組成員。

### 自動結單通知：唯一團主一對一Push

核心migration：`20260921070000_auto_close_organizer_notifications.sql`。

- 目前登入的已核准團主以`set_my_auto_close_notification_organizer()`將自己設為唯一收件者。
- UI只拿到`unconfigured/current_user/other_organizer`狀態，不取得任何團主識別碼。
- 只處理排定時間到期與數量門檻達標；手動未達條件結單不通知。
- 結單交易只建立durable outbox，不直接呼叫LINE。
- worker原子claim，使用固定`X-Line-Retry-Key`；LINE已接受的409視為成功。
- claim時在同一SQL敘述重新核對原收件者仍同時存在於`line_organizer_identity`及`admin_users`；資格失效即標記`skipped`，不得改傳其他團主。
- 通知失敗不回滾團購狀態。
- 團購刪除時outbox以`ON DELETE SET NULL`保留，不可連帶刪除待送事件。
- 正式cron secret同時存在於Edge Function secret與Supabase Vault；不得提交或輸出其值。

## 7. Auth與資料庫安全邊界

- 有效LINE token只證明身分，不自動授予團主權限；團主必須經待核准紀錄與可信後端核准。
- 團主與住戶角色可疊加在同一Auth UID，但團主路由必須再呼叫伺服器端`is_admin()`，不能只判斷session非匿名。
- `line_user_id`、Auth UID、group ID、access token、reply token、service-role key不得出現在前端回應、錯誤、log、seed或Git。
- 所有Browser可達資料表都要有RLS與最小grant；敏感欄位不能只靠UI隱藏。
- `SECURITY DEFINER`函式必須固定`search_path`、自行重查`auth.uid()`與目前權限，並限制EXECUTE grant。
- 住戶牆與團主訂單資料使用不同安全view；不要再讓團主共用已遮罩戶號的住戶view。
- 單一社區constraint是刻意設計；未完成全套多租戶改造前不得移除。

## 8. 正式部署資訊

### LINE設定（識別碼不是secret）

- LINE官方帳號：`團購小幫手`，基本ID `@147edsjc`。
- 團主LIFF ID：`2011099887-PlmOrmYw`，Endpoint為正式站`/admin`。
- 住戶LIFF ID：`2011099887-TRjJIzLR`，Endpoint為正式站根目錄。
- scope：`openid`、`profile`；Add friend option關閉。
- Login與Messaging API channels必須位於同一LINE Provider。

### 正式secret名稱

值只存在Supabase秘密管理／Vault，不放進文件：

- `LINE_CHANNEL_ID`
- `LINE_MESSAGING_CHANNEL_SECRET`
- `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`
- `LINE_RATE_LIMIT_PEPPER`
- `LINE_RESIDENT_EMAIL_PEPPER`
- `PICKUP_NOTIFICATION_INTENT_SECRET`
- `AUTO_CLOSE_NOTIFICATION_CRON_SECRET`
- Vault：`auto_close_notification_function_url`
- Vault：`auto_close_notification_cron_secret`

### 穩健發布順序

1. `git status --short`，確認`.hermes/`、截圖、token、診斷檔沒有納入版本控制。
2. `npx supabase db reset`。
3. 執行相關聚焦測試，再跑一次最終完整測試、lint、build與`git diff --check`。
4. `npx supabase db push --linked --dry-run`，確認只有預期migration。
5. 手動套用正式migration並讀回schema／權限／cron結果。
6. 部署相關Edge Functions並實測授權成功與未授權失敗。
7. 重新產生`src/types/database.ts`。
8. commit／push到`main`，追蹤Vercel Production deployment成功。
9. 實測固定正式網址，不只測Vercel臨時網址；登入牆存在時至少確認Production bundle包含新版標記，涉及真實操作則由使用者登入驗收。

## 9. 修改前必查的常見陷阱

- 不要把`campaign_draft.updated_by`當成團購建立者；它只是最後編輯者，`campaign`目前沒有可信creator欄位。
- 不要以一般`status: open → closed`就判定自動結單；只有排定截止與數量達標才通知。
- PostgreSQL trigger的`UPDATE OF status`只看原始SET欄位；若BEFORE trigger改變status，AFTER trigger可能不執行。現行自動結單通知因此監聽整筆UPDATE，再比較OLD／NEW狀態。
- 資格清理與claim若分成兩個SQL敘述會有TOCTOU競態；現行worker在同一原子claim敘述內再次驗證。
- Push成功但資料庫complete前中斷時，必須以同一LINE retry key重試；不要產生新key。
- LINE通知失敗永遠不能把團購改回開團中。
- 不要重新啟用對300多人群組的主動Push；領取通知必須維持一次性指令＋Reply API。
- UI顯示`arrived`、付款方式、圖片說明欄、正式品項20件限制，都屬已移除或不再使用的舊概念。
- 所有可點擊操作都要有明顯按鈕外觀、邊界、圖示與`:focus-visible`；原生檔案選擇器也算操作。可點範圍：住戶端與團主端1024px以下至少44px（手指點擊），團主端1024px以上至少24px（滑鼠操作，WCAG 2.2 AA）；按鈕外觀可以比可點範圍小。

## 10. 接手任務的最小流程

1. 先讀本文件及與任務相鄰的測試／migration。
2. 用搜尋追完UI → gateway → RPC/view → table／Edge Function資料流。
3. 先寫會因缺少需求而失敗的聚焦測試。
4. 實作最小修正；涉及Supabase時從零reset並以真實角色／交易驗證。
5. 同一批阻擋集中修完後，只做一次最終完整測試與一次聚焦安全複審。
6. 部署後讀回外部狀態，不能只依賴CLI exit code。
7. 用繁體中文記錄使用者可見文案、驗收方式與尚待真人完成的步驟。
