# LINE領取通知設定與驗證

本功能讓團主針對每個已結單團購，分別向「一期＋三期」及「二期」的實際購買者發送LINE正式mention。系統不保存發送時間、發送團主或通知歷史。

## 安全架構

- LINE Messaging API Channel必須與既有LINE Login Channels建立在**同一個LINE Provider**，確保同一住戶的LINE User ID一致。
- Channel secret與Channel access token只能存於Supabase Edge Function secrets。
- Browser只送出`campaignId`、通知組別與已核對文案，不送LINE User ID或群組ID。
- Edge Function會重新驗證Supabase session、`public.is_admin()`與`public.is_approved_line_organizer()`、團購狀態及實際訂單，並只針對本次購買者逐一確認其目前仍在目標LINE群組。
- 預覽會建立15分鐘技術性send intent；開始發送後只延長至建立時即固定的1小時絕對上限，並由pg_cron每5分鐘自動清除到期資料。DB只保存隨機token、匿名caller hash、收件人／文案hash、LINE retry key、狀態與到期時間，不保存LINE User ID名單、文案、團主UID、發送時間或長期通知歷史。
- 收件人LINE ID與group ID只放在團主瀏覽器暫持的AES-GCM opaque preview token密文中；密鑰只存在Edge Function secret。Browser不能讀取或竄改內容，DB也不落地保存這份名單。
- 發送時只逐一重查本次購買者是否仍在LINE群組，不讀取無關群組成員；`ready → sending`的claim會在單一Postgres statement snapshot內，同時重算全部DB資格名單hash、核對目前community群組綁定、團購狀態與團主權限。任一名單、群組或文案hash不一致就要求重新預覽。
- 網路逾時的`sending`重試不再查詢可變資料，而是從opaque token重建完全相同payload並沿用LINE `X-Line-Retry-Key`，避免重複通知。
- Webhook綁定事件以15分鐘event ID cache與5分鐘時間窗防重播，不建立永久webhook歷史。
- `community_line_group`、短期技術表與敏感收件人RPC只授權`service_role`。
- 每則Text message v2最多20個mentions；單次最多5則、共100位。超過時拒絕，不截斷名單。

## 1. LINE Developers Console

1. 在[LINE Official Account Manager](https://manager.line.biz/)建立LINE官方帳號。
2. 從Official Account Manager為該帳號啟用Messaging API；啟用時選擇既有LINE Login Channels所在的**同一Provider**。系統會自動建立對應的Messaging API Channel。
3. 回到LINE Developers Console確認Channel位於正確Provider。
4. 將LINE Official Account的「允許機器人加入群組」開啟。
5. 取得Channel secret及Channel access token。
6. 不要把兩個值貼進GitHub、Vercel、瀏覽器env或任何前端檔案。

參考文件：

- [Messaging API overview](https://developers.line.biz/en/docs/messaging-api/overview/)
- [Get group chat member profile](https://developers.line.biz/en/reference/messaging-api/#get-group-member-profile)
- [Text message v2 mentions](https://developers.line.biz/en/reference/messaging-api/#text-message-v2)

> **成員查驗：**系統已持有購買者經同Provider LIFF驗證的LINE User ID，因此只呼叫單一群組成員profile端點確認各購買者是否仍在群組。這個端點沒有完整群組名單端點的verified／premium限制；系統不呼叫`/members/ids`，也不讀取無關群組成員。

## 2. Supabase secrets

在已連結正式專案的本機執行：

```bash
npx supabase secrets set \
  LINE_MESSAGING_CHANNEL_SECRET='[REDACTED]' \
  LINE_MESSAGING_CHANNEL_ACCESS_TOKEN='[REDACTED]' \
  PICKUP_NOTIFICATION_INTENT_SECRET='[REDACTED-AT-LEAST-32-RANDOM-CHARS]'
```

確認時只看secret名稱，不輸出值：

```bash
npx supabase secrets list
```

## 3. 後端部署順序

先套用migration，再部署兩個Edge Functions，最後才部署顯示通知按鈕的前端：

```bash
npx supabase db push --dry-run
npx supabase db push
npx supabase functions deploy line-group-webhook
npx supabase functions deploy send-pickup-notification
```

LINE webhook URL格式：

```text
https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/line-group-webhook
```

在LINE Developers Console設定Webhook URL、開啟webhook，並執行Verify。

## 4. 綁定社區群組

1. 將官方帳號加入目標社區LINE群組。
2. 使用已在系統核准的團主LINE帳號，在該群組輸入完全相同的文字：

```text
綁定團購通知
```

3. 機器人回覆「團購領取通知已綁定至這個群組。」才算成功。

Webhook會驗證`x-line-signature`，再以同Provider的LINE User ID確認發話者同時存在於`line_organizer_identity`及`admin_users`。陌生住戶或未核准團主不能綁定。

## 5. 受控正式驗證

1. 使用真實但可控的已結單團購，確認訂單及住戶期別正確。
2. 團主開啟「訂單管理」後，先按「預覽一期、三期通知」或「預覽二期通知」。
3. 核對可＠名單、無法＠名單與預計訊息數。
4. 編輯通知內容後再確認發送。
5. 確認LINE群組收到由官方帳號發出的正式mentions。
6. 若發送失敗，UI必須顯示失敗；不得以普通`@姓名`文字替代。

正式測試不建立seed、不恢復已刪除團購，也不在未經確認時向群組發訊息。
