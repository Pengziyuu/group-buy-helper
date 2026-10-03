# 技術架構與設計決策

這份文件說明團購小幫手的**現行程式邊界**，供讀者從作品集 README 深入了解，也供維護者追資料流。實際權限仍以最新 migration、Edge Function、測試和正式環境設定為準；不要把文件當成授權機制。

## 範圍與執行模式

每套 Vercel＋Supabase 部署只服務**一個社區**。正式站有兩個 LIFF 入口：住戶從根網址／團購連結進入，團主從 `/admin` 進入；兩者由同一 React 應用依路由和身分顯示不同工作流程。

| 模式 | 資料與身分 | 適合驗證 | 不代表 |
| --- | --- | --- | --- |
| 無 Live 環境變數的 Demo | 瀏覽器 localStorage／示範資料 | 版面、部分草稿與下單互動 | LINE 授權、RLS、跨裝置同步、真實群組通知 |
| 本機 Supabase Demo | 可丟棄的本機 Postgres／Auth | RPC、RLS、Storage、Realtime 及本機團主流程 | 正式 LINE LIFF 與 Messaging API 端到端 |
| 正式 Live | Vercel＋Supabase＋LINE | 已核准使用者的真實流程 | 公開免登入測試帳號 |

模式選擇見 `src/services/runtime.ts`，瀏覽器入口在 `src/main.tsx`，分流在 `src/RuntimeApp.tsx` 與 `src/routing.ts`；正式 Auth 與 gateway 組裝集中於 `src/LocalLiveApps.tsx`。**不要把 Demo 成功當作正式站驗收**。

## 從住戶下單到團主核對

1. 住戶 LIFF 取得 LINE ID token；`line-resident-login` Edge Function 向 LINE 驗證，換取 Supabase session。僅首次入會的新成員需要在已綁定的**正式** LINE 群組通過後端資格查驗；測試群組不算。既有成員不因日後退群自動失去使用權，團主封鎖仍可即時生效。
2. 根網址列出已發布團購；`/c/<slug>` 是目前分享短網址，已分享的 `/campaign/<slug>` 保留相容。新團使用短碼，舊團長碼仍可解析。`api/campaign-preview.ts` 使用公開、受限的預覽 RPC 在 HTML 回傳前填入 LINE 分享所需的公開標題／圖片中繼資料。
3. `src/App.tsx` 顯示已發布內容、可編輯的**自己**的訂單與公開訂單牆；寫入走 `src/services/` 的 gateway，再由資料庫 RPC 檢查身分、商品、優惠、團購狀態與門檻。正式商品的價格快照與額外品項分開保存，避免後續改價改寫歷史訂單或把「金額另計」算入門檻。
4. 團主 LIFF 經 `line-organizer-login` 驗證身分後，仍需可信核准並通過資料庫 `is_admin()`；LINE 登入或有效 Supabase session **不等於**團主權限。團主可編輯獨立草稿，經原子發布後才更新住戶可見版本。
5. `OrdersSection` 將訂單搜尋、戶號排序、備註及取消集中於團主工作區；結單後才出現純前端 `.xlsx` 匯出，Excel 公式計算正式品項總價。系統不收款，付款由團主於系統外處理。

`campaign_draft`／已發布資料、安全檢視、函式與權限由 `supabase/migrations/` 演進；`src/types/database.ts` 由 schema 產生。資料庫歷史不可只因現行版本覆蓋先前定義就刪除。

## 隱私與授權界線

- **公開牆不等於戶別公開。** `order_wall` 只顯示驗證後的 LINE 顯示資料、訂單與時間，不回傳任何人的期別／戶號。自己的戶別由私有路徑提供；團主的 `organizer_order_wall` 則需管理權限。
- **前端遮罩不是權限。** `20261004010000_protect_customer_households.sql` 除了既有的安全視圖，還撤銷住戶角色直接讀取 `customer.period/unit` 的底表欄位權限；管理視圖所需戶別經受管理員檢查的窄函式取得。`supabase/tests/customer_household_privacy.sql` 驗證自己／他人／團主與兩種牆的行為。
- **RLS 與 RPC** 在資料庫端決定可見資料和可寫狀態；團主身分由可信核准流程取得，不信任瀏覽器傳來的 LINE User ID。LINE subject、service-role key、群組識別碼與通知密鑰不得出現在公開回應、前端 `VITE_` 變數或版本控制。
- **Realtime 有補讀。** 住戶端在訂閱回報 `SUBSCRIBED` 後重新同步，以封閉初次讀取與訂閱就緒之間的空窗；公告和住戶資料各自記錄版本／錯誤，斷線提示會在恢復訂閱後補讀。這只保證程式有恢復策略，仍須在真實使用流程驗證網路環境。

## 通知是兩條不同流程

**領取通知**：團主在已結單團購預覽已知購買者，依常溫／冷凍冷藏組別建立短效一次性指令。已核准團主把指令貼至已綁定的 LINE 群組，`line-group-webhook` 驗證 LINE 簽章、群組／發話者與指令狀態，再以該事件的 Reply API 回覆 mentions；不抓取完整群組名單，也不把正式群組作為測試目標。前端的正式入口與測試中心分別使用 `send-pickup-notification`／`send-test-pickup-notification`。容量與重試界線詳見[通知文件](line-pickup-notifications.md)。

**自動結單通知**：排程或達標結單的資料庫交易留下 durable outbox，由 `send-auto-close-organizer-notifications` worker 對目前指定且仍具權限的團主發一對一訊息；手動結單不觸發此通知。通知送出失敗不回滾已完成的結單交易。

## 發布與驗證邊界

- `main` 受 PR 與 CI 保護；`.github/workflows/ci.yml` 跑 lint／測試／建置、從零套用所有 migration、SQL 與 Python 權限／行為驗證，以及 Edge Function 型別檢查。
- 資料庫先在本機從空資料重建並驗證，再對已連結正式專案 dry-run，確認僅有預期 migration 才手動套用；正式資料庫與前端／Edge 不會原子換版，破壞性變更應分階段發布。
- Vercel 由 `vercel.json` 提供團主 HTML、住戶 SPA 路由與 `/c/<slug>` 預覽中介層；部署後 `.github/workflows/production-check.yml` 對固定正式網址作 smoke check。頁面／腳本載入成功不等於完成 LINE 登入、實際下單及群組通知驗收。
- 本機截圖與 localStorage Demo 是**介面展示**；涉及私有資料、RLS 或 LINE 的主張應以實際角色、API 與有權限的使用者驗證。

維護指令、專題規則及秘密管理名稱見 [AI Agent 接手指南](AI_AGENT_HANDOFF.md)。
