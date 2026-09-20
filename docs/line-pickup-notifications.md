# LINE領取通知設定與驗證

本功能讓團主針對每個已結單團購，分別向「一期＋三期」及「二期」的實際購買者建立一次性短指令。團主將指令貼到已綁定群組後，機器人使用該Webhook事件的Reply API發出正式mention，避免主動Push按群組人數消耗月訊息額度。測試與正式共用同一套Production系統及LINE官方帳號，但介面、Edge入口、群組槽位及intent皆強制分離。

## 安全架構

- LINE Messaging API Channel必須與既有LINE Login Channels建立在**同一個LINE Provider**，確保同一住戶的LINE User ID一致。
- Channel secret與Channel access token只能存於Supabase Edge Function secrets。
- 正式介面只呼叫`send-pickup-notification`，測試中心只呼叫`send-test-pickup-notification`；兩個Edge入口各自把`production`／`test`寫死，不接受Browser傳入目的地。
- Browser只送出`campaignId`、通知組別與已核對文案，不送LINE User ID、群組ID或環境參數。
- Edge Function會重新驗證Supabase session、`public.is_admin()`與`public.is_approved_line_organizer()`、團購狀態及實際訂單，並只針對本次購買者逐一確認其目前仍在目標LINE群組。
- 預覽會建立15分鐘技術性intent；建立指令後，intent與指令一併延長為自建立起10分鐘，且不得超過建立預覽時固定的1小時絕對保留上限。pg_cron每5分鐘清除到期資料。
- DB只保存高熵短碼的SHA-256雜湊、AES-GCM加密通知正文、匿名caller／收件人／文案hash、環境、單次使用狀態與短期到期時間；不保存可重播的短碼明文、LINE User ID名單、團主UID或長期通知歷史。
- 收件人LINE ID、group ID與環境只放在團主瀏覽器暫持的AES-GCM opaque preview token密文中；密鑰只存在Edge Function secret。Browser不能讀取或竄改內容，測試與正式preview token不能交換使用。
- 團主將完整短指令貼入群組後，Webhook會再次驗證LINE簽章、5分鐘事件時間窗、event ID、發話團主、原建立團主、目前綁定群組、正式／測試分類、團購狀態、購買者資格與即時群組成員名單。
- `issued → replying`由單一Postgres交易原子占用；同一短碼、同一Webhook重送或不同事件並發都只有一個勝者。Reply API失敗或逾時時短碼仍會終止，不會自動重送一次性reply token；團主需回後台重新預覽並建立新指令。
- Webhook技術事件只保留短期replay cache，不建立永久webhook歷史。
- `community_line_group`、測試團購標記表、短期技術表與敏感收件人RPC不允許Browser直接存取。測試團購標記只可經已驗證團主的窄RPC管理。
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
- [Send reply message](https://developers.line.biz/en/reference/messaging-api/#send-reply-message)

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

先確認舊版沒有仍在保留期限內的`sending` intent；查詢結果必須為`0`，否則等待`retain_until`到期並再次確認。migration本身也會在非零時中止：

```bash
npx supabase db query --linked --experimental --yes "select count(*) as retained_sending_intents from public.pickup_notification_intent where delivery_status = 'sending' and retain_until > now();"
```

確認為`0`後，先套用migration，再部署三個Edge Functions，最後才部署顯示通知按鈕的前端：

```bash
npx supabase db push --dry-run
npx supabase db push
npx supabase functions deploy line-group-webhook
npx supabase functions deploy send-pickup-notification
npx supabase functions deploy send-test-pickup-notification
```

LINE webhook URL格式：

```text
https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/line-group-webhook
```

在LINE Developers Console設定Webhook URL、開啟webhook，並執行Verify。

## 4. 分別綁定測試與正式群組

同一LINE官方帳號可以同時加入測試群組與正式社區群組。每個槽位各自只有一個群組，同一群組不能同時占用兩個槽位。

1. 將官方帳號加入測試LINE群組，由已核准團主輸入：

```text
綁定測試團購通知
```

   機器人回覆「測試團購通知已綁定至這個群組。」才算成功。

2. 將官方帳號加入正式社區LINE群組，由已核准團主輸入：

```text
綁定正式團購通知
```

   機器人回覆「正式團購通知已綁定至這個群組。」才算成功。

既有單一綁定在環境migration套用後自動成為`test`槽位，不必重新綁定測試群組。重新綁定其中一個槽位不會覆蓋另一個槽位；有尚未使用的一次性指令時，系統會阻止重新綁定或切換測試標記。

Webhook會驗證`x-line-signature`，再以同Provider的LINE User ID確認發話者同時存在於`line_organizer_identity`及`admin_users`。陌生住戶或未核准團主不能綁定。

## 5. 測試中心與正式介面

- 測試中心固定為`/admin/notification-lab`，全頁顯示測試警示，只能處理明確經資料庫標記的已結單／已到貨測試團購。
- 測試通知自動加入不可省略的`【測試】`前綴，只會建立`測試領取通知 T-…`指令，且只能在測試群組使用。
- 正式通知保留在各團購的「訂單管理」，只會建立`發送領取通知 P-…`指令，且只能在正式社區群組使用；沒有環境或群組下拉選單。
- 標記為測試的團購會被後端拒絕從正式入口建立指令；未標記團購也會被後端拒絕從測試入口建立指令。
- 指令處於`issued`或`replying`時，不可重綁該群組槽位或切換該團購的測試標記。

## 6. 受控驗證與功能晉升

1. 先在通知測試中心使用明確標記的已結單測試團購，核對名單、訊息數、`【測試】`前綴與真實mention。
2. 測試成功後，以同一個已審核Git commit及migration部署正式功能；不要複製測試intent或測試資料。
3. 正式團購開啟「訂單管理」後，先按「預覽一期、三期通知」或「預覽二期通知」。
4. 核對可＠名單、無法＠名單、目標群組類型與預計訊息數。
5. 編輯通知內容後按「產生正式群組指令」，複製畫面顯示的完整一次性指令。
6. 由建立該指令的已核准團主，在10分鐘內將指令原樣貼到已綁定的正式群組。
7. 確認機器人立即以Reply API回覆正式mentions。後台顯示「已複製」不代表已送達。
8. 若名單變更，機器人會要求重新預覽；若Reply失敗或逾時，不得重貼同一指令，應回後台建立新指令。

正式測試不建立seed、不恢復已刪除團購，也不在未經確認時向群組發訊息。
