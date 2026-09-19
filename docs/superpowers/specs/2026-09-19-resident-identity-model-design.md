# 住戶身分模型設計：一戶多帳號與「其他」身分

**日期：** 2026-09-19
**狀態：** 已與團主確認，待實作計畫

## 目標

1. 同一組期別＋戶號可以給多個 LINE 帳號使用。彼此靠 LINE 帳號區分，期別＋戶號只是顯示用的身分標籤。
2. 期別多一個「其他」選項，選擇後沒有戶號，供社區以外的人使用。

## 現況與問題

`customer` 目前是一戶一列：

```sql
unique (period, unit),      -- 一個戶號只有一列
unique (line_user_id),      -- 一個 LINE 帳號只對應一列
unique (auth_user_id)       -- 一個 Supabase 使用者只對應一列
```

`unique (period, unit)` 讓一戶只能綁一個 LINE 帳號。`valid_resident_household` 要求期別為 1/2/3 且戶號符合社區編碼，沒有「無戶號」的表達方式。

訂單歸屬在 live 路徑上認的是 `customer.id`（UUID），不是期別＋戶號，所以訂單、RLS 與 `order_wall` 的主幹不需要改。

## 已確認的決策

| 決策 | 結論 |
|---|---|
| 同戶號多帳號的訂單 | 各自獨立一筆，互不干涉 |
| 「其他」的領取通知 | 不納入，由團主自行聯繫 |
| 團主統計的「戶數」 | 改為訂單筆數 |
| 「其他」的辨識方式 | 只用 LINE 暱稱，不新增備註欄 |

## 採用方案

在 `customer` 新增 `household_kind` 欄位（`'resident'` / `'other'`），並移除戶號唯一鍵。

評估過但未採用：

- **哨兵值方案**（用 `period = 0` 代表其他）：省一個欄位，但通知的排除條件會變成魔術數字，意圖無法自我說明，複雜度被推進每一個讀 `period` 的地方。
- **獨立 household 資料表**：領域模型最乾淨，但需要資料遷移，且 `order_wall`、`admin_list_residents`、匯出與通知收件人 RPC 全部要改 join。以單一社區、一戶少數幾人的規模而言不成比例。

## 資料模型

```sql
alter table public.customer
  add column household_kind text not null default 'resident'
  check (household_kind in ('resident', 'other'));

-- Postgres 對 inline `unique (period, unit)` 的預設命名；實作時先以 \d customer 確認
alter table public.customer drop constraint customer_period_unit_key;

alter table public.customer alter column period drop not null;
alter table public.customer alter column unit drop not null;

alter table public.customer drop constraint customer_household_format;
alter table public.customer add constraint customer_household_format check (
  case household_kind
    when 'resident' then period is not null and unit is not null
                      and public.valid_resident_household(period, unit)
    when 'other'    then period is null and unit is null
  end
);
```

保留不動的三條唯一鍵，它們是「各自獨立一筆訂單」的基礎：`customer.auth_user_id`、`customer.line_user_id`、`orders (campaign_id, customer_id)`。一個 LINE 帳號仍然只對應一列 `customer`、一團只有一筆訂單；改變的只是多列 `customer` 可以共用同一組 `(period, unit)`。

既有資料全是住戶，`default 'resident'` 直接涵蓋，不需要 backfill 或停機。

`valid_resident_household` 不變，只在 `kind = 'resident'` 時被呼叫。

### 已知取捨

`unique (period, unit)` 原本順帶提供「戶號被佔用」的保護。移除後任何人都能宣告任何戶號，資料庫不會阻擋。這是需求本身無可避免的代價：要允許一戶多人，就無法同時偵測冒用。補償機制是團主後台的封鎖與 `admin_update_resident_household` 改戶號，屬於事後處理。

「其他」只靠 LINE 暱稱辨識。暱稱可能是英文、表情符號或重複，分貨時團主需自行確認身分。此為明示決策，非疏漏。

## 後端行為

### 綁定 RPC 的簽名相容

部署順序是資料庫先、前端後。若直接替換 `bind_customer_self(integer, text)` 的簽名，在兩者之間的空窗期，線上前端會呼叫一個已不存在的函式。

做法是新增三參數版本，並把舊的兩參數版本改成轉呼叫的薄包裝：

```sql
create or replace function public.bind_customer_self(
  p_household_kind text, p_period integer, p_unit text) ...

create or replace function public.bind_customer_self(p_period integer, p_unit text) ...
  -- 內部呼叫 bind_customer_self('resident', p_period, p_unit)
```

資料庫上線時舊前端照常運作，前端上線後改走三參數版。移除包裝由後續獨立的清理 migration 處理，不在本次範圍。

`admin_update_resident_household(text, integer, text)` 同樣處理，讓團主能把住戶改為「其他」。

### 綁定的行為變化

- 移除「此期別與戶號已由其他住戶綁定」：拿掉唯一鍵後不再觸發。保留通用的 `unique_violation` 處理以涵蓋 `auth_user_id` / `line_user_id` 的競態，且不讓原始錯誤訊息外洩。
- 「住戶資料已綁定，如需變更請聯絡團主」的比對條件加入 `household_kind`。住戶改成「其他」或反向都走團主。
- 同一人重複綁定同一身分維持冪等，只更新 LINE 名稱與頭貼。
- `admin_update_resident_household` 內相同的 unique_violation →「此期別與戶號已由其他住戶綁定」分支一併失效，同樣移除。

### 領取通知的排除

`internal_pickup_notification_recipients` 與 `internal_pickup_notification_eligible_hash` **兩支都要加上 `household_kind = 'resident'` 過濾，且條件必須完全一致**。

原因：前端 `groupPickupNotificationRecipients` 是用 `period === 1 || period === 3` 與 `period === 2` 分組，「其他」的 `period` 為 NULL 因此本來就不會落入任何一組。但發送流程會用 `eligible_hash` 在資料庫端重算名單雜湊比對。若 RPC 回傳了「其他」而前端濾掉，雜湊不一致會讓團主反覆看到「請重新預覽」且無從得知原因。排除必須做在 SQL。

### 團主對被排除者的可見性

`admin_list_residents` 與 `order_wall` 增加回傳 `household_kind`。`order_wall` 以 `create or replace view` 重建，必須保留 `with (security_invoker = true)` 與 `grant select ... to authenticated`；若因欄位順序而需 drop 重建，授權要重新下一次。通知面板在預覽時顯示本團有多少位「其他」身分的訂購者不會收到通知，避免靜默遺漏。

### 不變更的部分

RLS 完全不動。`owns_customer`、`owns_order`、`has_campaign_access` 都認 `auth.uid()`，與戶號無關。

`join_campaign_by_slug` 要求 `community_member`，而成員資格的語意是「持有效 LINE 帳號者皆可加入」，不是「住在社區裡」，因此「其他」的人循現有流程即可取得存取權，不需新增路徑。

## 前端

### 綁定表單

期別選單加「其他」；選到時隱藏戶號的前段／棟別／號碼三個選擇器。`HouseholdSelection` 加入 kind。`formatResidentPeriod` 目前對 1/2/3 以外的值直接 throw，改為 kind-aware，而非把哨兵值塞進 `RESIDENT_PERIODS`。

### 排序

現有規則 `left.period - right.period || unitCollator.compare(left.unit, right.unit)`（`src/domain/adminOrders.ts`、`src/services/orderExport.ts`）有兩個問題：`period` 為 NULL 時相減得到 NaN，排序未定義；同戶號多筆時 period 與 unit 皆相等而無 tiebreaker，順序會在每次載入時跳動。

新規則：住戶依期別、戶號、姓名；「其他」一律排在最後，彼此依姓名。匯出的 Excel 順序直接影響團主分貨，此規則需有測試鎖定。

### 顯示

訂單牆與後台表格現在是期別加戶號合併顯示（例如「二期 2K13」）；「其他」整個欄位只顯示「其他」，不附期別。`src/AdminOrdersPanel.tsx` 的 `periodLabel` 對 1/2/3 以外的值會輸出「NaN期」，四個呼叫點都要改成 kind-aware：表格戶號欄、付款確認框、取消訂單確認框，以及住戶管理列表。同戶號多人本來就各自顯示 LINE 名稱，視覺上可區分。團主統計的「戶數」改為「筆數」。

### Demo 模式

`src/data/demo.ts` 的 `customerId` 是 `期別:戶號` 的合成字串，一戶多人後會相撞，需改為各自獨立的識別字串。live 路徑使用真正的 UUID，不受影響。

## 測試

| 層 | 內容 |
|---|---|
| Domain | kind 的格式化；排序涵蓋 NULL period 與同戶號並列；通知分組不受影響 |
| Migration | SQL 文字斷言：CHECK 的兩個分支、唯一鍵已移除、兩支通知 RPC 皆含 `household_kind = 'resident'` |
| Gateway / 元件 | 綁定表單的「其他」流程、後台表格顯示、筆數文案 |
| 實機驗證腳本 | 見下 |

`scripts/verify_order_workflow.py` 新增四項，這些只有真資料庫驗得到：

1. 兩個不同 LINE 帳號綁同一組期別＋戶號皆成功，且各自能在同一團送出自己的訂單
2. 綁「其他」成功，且 period 與 unit 為 NULL
3. `internal_pickup_notification_recipients` 不回傳「其他」的人
4. `recipients` 與 `eligible_hash` 對同一團算出的名單一致

第 4 項直接對應前述的雜湊陷阱，是本次最有價值的驗證。

開發流程採 TDD：每項行為先寫失敗測試、確認失敗原因為功能缺失，再寫最小實作。

## 部署順序

1. `npx supabase db push`（含相容包裝，舊前端不受影響）
2. 驗證腳本在本機重置後的資料庫上全過
3. `git push`，Vercel 部署前端

資料庫必須先行，否則前端會呼叫到不存在的欄位與參數。

## 不在本次範圍

- 建立獨立的 `household` 資料表
- 「其他」的第三個通知組別
- 每戶合計的檢視或統計
- 「其他」的備註欄位
- 移除相容用的舊簽名包裝（後續獨立 migration）
