# 住戶身分模型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓一組期別＋戶號可由多個 LINE 帳號各自獨立下單，並新增沒有戶號的「其他」身分供社區以外的人使用。

**Architecture:** 在 `public.customer` 新增 `household_kind`（`'resident'` / `'other'`）並移除 `unique (period, unit)`，讓多列 customer 共用同一組戶號。訂單歸屬、RLS 與 `order_wall` 的主幹不動，因為它們認的是 `customer.id`。資料庫函式以「新增帶 kind 的簽名、舊簽名改為薄包裝」維持部署空窗期的相容性。

**Tech Stack:** PostgreSQL 17（Supabase）、React 19、TypeScript 6、Vite 8、Vitest 4、Python 3（驗證腳本）

**Spec:** `docs/superpowers/specs/2026-09-19-resident-identity-model-design.md`

## Global Constraints

- Node.js 22.12.0 以上（`.nvmrc` 寫 `22`；低於此版本 `npm test` 會整批失敗）
- 不新增任何 npm 相依套件
- TDD：每個行為先寫失敗測試、確認失敗原因為功能缺失，再寫最小實作
- 部署順序固定為資料庫先、前端後；資料庫變更必須向後相容於尚未更新的前端
- 單一社區部署模型：不得新增第二筆 community，也不得放寬 community 相關 constraint
- 不得把 service role key、LINE User ID 或任何密鑰寫進程式碼、測試或 commit
- 所有新資料庫函式一律 `security definer` + `set search_path = public, pg_temp`，並 `revoke all ... from public, anon` 後才授權
- 專案文件與使用者可見文案一律繁體中文

## 對 Spec 的一處更正

Spec 的〈領取通知的排除〉一節主張「若 RPC 回傳『其他』而前端濾掉，雜湊會不一致」。實際讀過兩支 SQL 後這個說法不成立：`internal_pickup_notification_recipients` 與 `internal_pickup_notification_eligible_hash` **都**已經有 `customer.period in (1, 3)` / `customer.period = 2` 的條件，而 SQL 三值邏輯下 NULL 不屬於任何一邊，因此「其他」在兩支查詢中已被一致地排除，不會產生雜湊落差。

Task 3 仍然要加上 `household_kind = 'resident'`，但理由改為**縱深防禦與意圖表達**：日後若有人新增期別或調整分組條件，NULL 的隱性保護會消失。這不是在修一個現存的缺陷。

## 受影響函式的最新定義位置

實作時必須以**最新**定義為基礎複製修改，不可改到舊版：

| 函式／檢視 | 最新定義所在 migration |
|---|---|
| `internal_pickup_notification_recipients` | `20260911010000_resident_custom_order_items.sql` |
| `internal_pickup_notification_eligible_hash` | `20260911010000_resident_custom_order_items.sql` |
| `bind_customer_self` | `20260901193000_resident_household_options.sql` |
| `admin_update_resident_household` | `20260901193000_resident_household_options.sql` |
| `admin_list_residents` | `20260827_000018_open_line_resident_admission.sql` |
| `order_wall`（view） | `20260912010000_campaign_discounts.sql` |

## File Structure

**新增：**

- `supabase/migrations/20260919160000_household_kind.sql` — 欄位與約束
- `supabase/migrations/20260919161000_household_kind_binding.sql` — 綁定與團主改戶號 RPC
- `supabase/migrations/20260919162000_household_kind_pickup.sql` — 通知兩支 RPC 的排除條件
- `supabase/migrations/20260919163000_household_kind_exposure.sql` — `order_wall` 與 `admin_list_residents` 回傳 kind
- `src/services/householdKindMigration.test.ts` — 前四支 migration 的 SQL 文字斷言

**修改：**

- `src/domain/household.ts` — kind-aware 的格式化與選擇模型
- `src/domain/adminOrders.ts` — 排序與 `householdCount` → `orderCount`
- `src/domain/pickupNotification.ts` — recipient 型別的 period 可為 null
- `src/services/orderExport.ts` — 排序
- `src/services/adminOrdersGateway.ts`、`src/services/residentMemberManagementGateway.ts`、`src/services/lineResidentGateway.ts` — 傳遞 kind
- `src/types/database.ts` — 由 `supabase gen types` 重新產生
- `src/App.tsx` — 綁定表單與住戶端顯示
- `src/AdminOrdersPanel.tsx` — `periodLabel` 四個呼叫點與「筆數」
- `src/ResidentMemberManagementApp.tsx` — 住戶列表顯示
- `src/data/demo.ts` — demo 的 customerId
- `scripts/verify_order_workflow.py` — 四項新驗證
- `README.md` — 功能清單與驗證項數

---

### Task 1: 資料模型 — `household_kind` 欄位與約束

**Files:**
- Create: `supabase/migrations/20260919160000_household_kind.sql`
- Create: `src/services/householdKindMigration.test.ts`

**Interfaces:**
- Consumes: 既有的 `public.valid_resident_household(integer, text)`
- Produces: `public.customer.household_kind text not null`，值域 `'resident'` / `'other'`；`period` 與 `unit` 改為可為 null；`unique (period, unit)` 不再存在

- [ ] **Step 1: 確認要移除的約束實際名稱**

本機 Supabase 必須先啟動（`npx supabase start`）。執行：

```bash
docker exec supabase_db_group-buy-helper psql -U postgres -d postgres -c "\d public.customer"
```

預期看到 `customer_period_unit_key` 與 `customer_household_format`。若名稱不同，後續步驟的 SQL 要改用實際名稱。

- [ ] **Step 2: 寫失敗測試**

建立 `src/services/householdKindMigration.test.ts`：

```typescript
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const schemaPath = resolve(process.cwd(), 'supabase/migrations/20260919160000_household_kind.sql')

describe('household kind schema migration', () => {
  it('adds the household kind column and lets several accounts share one household', () => {
    expect(existsSync(schemaPath)).toBe(true)
    if (!existsSync(schemaPath)) return
    const sql = readFileSync(schemaPath, 'utf8').toLowerCase()

    expect(sql).toContain('add column household_kind text not null default')
    expect(sql).toContain("check (household_kind in ('resident', 'other'))")
    expect(sql).toContain('drop constraint customer_period_unit_key')
    expect(sql).toContain('alter column period drop not null')
    expect(sql).toContain('alter column unit drop not null')
  })

  it('ties the household columns to the kind so no half-filled row is possible', () => {
    const sql = readFileSync(schemaPath, 'utf8').toLowerCase()

    expect(sql).toContain('drop constraint customer_household_format')
    expect(sql).toContain('add constraint customer_household_format')
    expect(sql).toContain('public.valid_resident_household(period, unit)')
    expect(sql).toMatch(/when 'other'\s+then period is null and unit is null/)
  })

  it('keeps the account-level uniqueness that makes one order per account work', () => {
    const sql = readFileSync(schemaPath, 'utf8').toLowerCase()

    expect(sql).not.toContain('drop constraint customer_auth_user_id_key')
    expect(sql).not.toContain('drop constraint customer_line_user_id_key')
  })
})
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `npx vitest run src/services/householdKindMigration.test.ts`
Expected: FAIL，`existsSync` 回傳 false，migration 檔尚未存在

- [ ] **Step 4: 寫 migration**

建立 `supabase/migrations/20260919160000_household_kind.sql`：

```sql
-- One household may now be shared by several LINE accounts, and people from
-- outside the community bind with no household at all. household_kind states
-- which of the two a row is, so rules that must exclude outsiders can say so
-- directly instead of testing period for a magic value.
--
-- Dropping unique (period, unit) is what allows the sharing. The account-level
-- unique keys on auth_user_id and line_user_id stay, so one LINE account is
-- still exactly one customer row and therefore one order per campaign.

alter table public.customer
  add column household_kind text not null default 'resident'
  check (household_kind in ('resident', 'other'));

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

- [ ] **Step 5: 執行測試確認通過**

Run: `npx vitest run src/services/householdKindMigration.test.ts`
Expected: PASS（3 個測試）

- [ ] **Step 6: 在真資料庫套用並驗證約束真的生效**

```bash
npx supabase db reset
```

Expected: 全部 migration 套用完成，無錯誤。接著驗證 CHECK 兩個分支都擋得住半填狀態。以下三段各自執行，`PSQL` 代表 `docker exec supabase_db_group-buy-helper psql -U postgres -d postgres -c`：

其他身分卻帶了戶號，應失敗並顯示 `customer_household_format`：

```bash
docker exec supabase_db_group-buy-helper psql -U postgres -d postgres -c "insert into public.customer (household_kind, period, unit, name) values ('other', 2, '2K13', 'bad');"
```

住戶身分卻沒有戶號，應失敗並顯示 `customer_household_format`：

```bash
docker exec supabase_db_group-buy-helper psql -U postgres -d postgres -c "insert into public.customer (household_kind, name) values ('resident', 'bad');"
```

第二個帳號綁到 seed 已存在的 2K13，應**成功**，這就是一戶多列可行的證明：

```bash
docker exec supabase_db_group-buy-helper psql -U postgres -d postgres -c "insert into public.customer (household_kind, period, unit, name) values ('resident', 2, '2K13', 'second account');"
```

驗證完跑一次 `npx supabase db reset` 清掉這筆測試資料。

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260919160000_household_kind.sql src/services/householdKindMigration.test.ts
git commit -m "feat: let one household hold several accounts"
```

---

### Task 2: 綁定與團主改戶號 RPC

**Files:**
- Create: `supabase/migrations/20260919161000_household_kind_binding.sql`
- Modify: `src/services/householdKindMigration.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `customer.household_kind`
- Produces:
  - `public.bind_customer_self(p_household_kind text, p_period integer, p_unit text)` → `returns table (id uuid, name text, picture_url text, period integer, unit text)`
  - `public.bind_customer_self(p_period integer, p_unit text)` — 保留，內部以 `'resident'` 轉呼叫
  - `public.admin_update_resident_household(p_member_code text, p_household_kind text, p_period integer, p_unit text)` → `returns void`
  - `public.admin_update_resident_household(p_member_code text, p_period integer, p_unit text)` — 保留，內部以 `'resident'` 轉呼叫

- [ ] **Step 1: 取出兩支函式的最新定義作為基礎**

```bash
sed -n '29,94p' supabase/migrations/20260901193000_resident_household_options.sql
```

```bash
sed -n '96,157p' supabase/migrations/20260901193000_resident_household_options.sql
```

新版本以這兩段為基礎修改。不要從 `20260825_000016` 或 `20260826_000017` 複製，那些是舊版。

- [ ] **Step 2: 寫失敗測試**

在 `src/services/householdKindMigration.test.ts` 末尾追加：

```typescript
const bindingPath = resolve(process.cwd(), 'supabase/migrations/20260919161000_household_kind_binding.sql')

describe('household kind binding migration', () => {
  it('adds a kind-aware signature while the old one keeps working for the deployed frontend', () => {
    expect(existsSync(bindingPath)).toBe(true)
    if (!existsSync(bindingPath)) return
    const sql = readFileSync(bindingPath, 'utf8').toLowerCase()

    expect(sql).toContain('function public.bind_customer_self(p_household_kind text, p_period integer, p_unit text)')
    expect(sql).toContain('function public.bind_customer_self(p_period integer, p_unit text)')
    expect(sql).toContain("public.bind_customer_self('resident', p_period, p_unit)")
    expect(sql).toContain("public.admin_update_resident_household(p_member_code, 'resident', p_period, p_unit)")
  })

  it('drops the household collision error that can no longer happen', () => {
    const sql = readFileSync(bindingPath, 'utf8')

    expect(sql).not.toContain('此期別與戶號已由其他住戶綁定')
    expect(sql).toContain('住戶資料已綁定，如需變更請聯絡團主')
  })

  it('compares the kind as well as the household when refusing a silent switch', () => {
    const sql = readFileSync(bindingPath, 'utf8').toLowerCase()

    expect(sql).toContain('v_existing.household_kind <> p_household_kind')
  })

  it('keeps every signature off anon and locked to the usual search path', () => {
    const sql = readFileSync(bindingPath, 'utf8').toLowerCase()

    expect(sql).toContain('set search_path = public, pg_temp')
    expect(sql).toContain('revoke all on function public.bind_customer_self(text, integer, text)')
    expect(sql).toContain('revoke all on function public.admin_update_resident_household(text, text, integer, text)')
    expect(sql).toContain('from public, anon, authenticated, service_role')
  })
})
```

註：第一個測試的 `toContain` 是把簽名寫成單行比對，因此實作時三參數版的 `create or replace function` 與參數列要寫在同一行。

- [ ] **Step 3: 執行測試確認失敗**

Run: `npx vitest run src/services/householdKindMigration.test.ts`
Expected: 新增的 4 個 FAIL（檔案不存在），Task 1 的 3 個仍 PASS

- [ ] **Step 4: 寫 migration**

建立 `supabase/migrations/20260919161000_household_kind_binding.sql`。以 Step 1 取出的定義為基礎，套用下列變更。

`bind_customer_self` 三參數版，簽名寫成單行：

```sql
create or replace function public.bind_customer_self(p_household_kind text, p_period integer, p_unit text)
```

宣告區加入 `v_period integer := p_period;`，並把原本無條件的 `valid_resident_household` 檢查換成：

```sql
  if p_household_kind not in ('resident', 'other') then
    raise exception '住戶身分種類不正確' using errcode = '22023';
  end if;
  if p_household_kind = 'resident' then
    if not public.valid_resident_household(p_period, v_unit) then
      raise exception '住戶期別或戶號不符合社區編碼' using errcode = '22023';
    end if;
  else
    v_unit := null;
    v_period := null;
  end if;
```

已綁定的比對條件改為：

```sql
    if v_existing.household_kind <> p_household_kind
      or (p_household_kind = 'resident'
          and (v_existing.period <> p_period or v_existing.unit <> v_unit)) then
      raise exception '住戶資料已綁定，如需變更請聯絡團主' using errcode = '23505';
    end if;
```

INSERT 改為：

```sql
    insert into public.customer (name, picture_url, household_kind, period, unit, auth_user_id)
    values (v_name, v_picture_url, p_household_kind, v_period, v_unit, v_user_id)
```

`exception when unique_violation` 區塊裡，比對條件同樣加上 kind，最後的 raise 改為：

```sql
    raise exception '住戶資料已綁定，如需變更請聯絡團主' using errcode = '23505';
```

相容包裝：

```sql
create or replace function public.bind_customer_self(p_period integer, p_unit text)
returns table (id uuid, name text, picture_url text, period integer, unit text)
language sql
security definer
set search_path = public, pg_temp
as $function$
  select * from public.bind_customer_self('resident', p_period, p_unit);
$function$;
```

`admin_update_resident_household` 四參數版：簽名改為 `(p_member_code text, p_household_kind text, p_period integer, p_unit text)`，加入相同的 kind 驗證，UPDATE 改為：

```sql
    update public.customer
    set household_kind = p_household_kind,
        period = case when p_household_kind = 'resident' then p_period end,
        unit = case when p_household_kind = 'resident' then v_unit end
    where auth_user_id = v_user_id;
```

並整段移除 `exception when unique_violation then raise exception '此期別與戶號已由其他住戶綁定'`。相容包裝：

```sql
create or replace function public.admin_update_resident_household(p_member_code text, p_period integer, p_unit text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $function$
  select public.admin_update_resident_household(p_member_code, 'resident', p_period, p_unit);
$function$;
```

四個簽名各自授權：

```sql
revoke all on function public.bind_customer_self(text, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.bind_customer_self(text, integer, text) to authenticated, service_role;

revoke all on function public.bind_customer_self(integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.bind_customer_self(integer, text) to authenticated, service_role;

revoke all on function public.admin_update_resident_household(text, text, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_update_resident_household(text, text, integer, text) to authenticated, service_role;

revoke all on function public.admin_update_resident_household(text, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_update_resident_household(text, integer, text) to authenticated, service_role;
```

- [ ] **Step 5: 執行測試確認通過**

Run: `npx vitest run src/services/householdKindMigration.test.ts`
Expected: PASS（7 個測試）

- [ ] **Step 6: 在真資料庫確認四個簽名都在**

```bash
npx supabase db reset
```

```bash
docker exec supabase_db_group-buy-helper psql -U postgres -d postgres -c "\df public.bind_customer_self public.admin_update_resident_household"
```

Expected: 共四列，兩個 `bind_customer_self`、兩個 `admin_update_resident_household`

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260919161000_household_kind_binding.sql src/services/householdKindMigration.test.ts
git commit -m "feat: bind residents by household kind"
```

---

### Task 3: 領取通知排除「其他」

**Files:**
- Create: `supabase/migrations/20260919162000_household_kind_pickup.sql`
- Modify: `src/services/householdKindMigration.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `customer.household_kind`
- Produces: `internal_pickup_notification_recipients(uuid, text)` 與 `internal_pickup_notification_eligible_hash(uuid, text)` 的新版本，兩者的收件人條件完全一致

**背景：** 這不是在修現存缺陷。兩支查詢都已有 `customer.period in (1, 3)` / `customer.period = 2`，NULL 在三值邏輯下不屬於任何一邊，因此「其他」本來就被一致排除。加上 `household_kind = 'resident'` 是縱深防禦：日後若有人新增期別或改動分組條件，NULL 的隱性保護就會消失。

- [ ] **Step 1: 取出兩支函式的最新定義**

```bash
grep -n "function public.internal_pickup_notification_recipients\|function public.internal_pickup_notification_eligible_hash\|^\$\$;" supabase/migrations/20260911010000_resident_custom_order_items.sql
```

依輸出的行號用 `sed -n 'A,Bp'` 取出兩段完整定義作為基礎。

- [ ] **Step 2: 寫失敗測試**

在 `src/services/householdKindMigration.test.ts` 末尾追加：

```typescript
const pickupPath = resolve(process.cwd(), 'supabase/migrations/20260919162000_household_kind_pickup.sql')

describe('household kind pickup notification migration', () => {
  it('excludes non-residents from both the recipient list and its eligibility hash', () => {
    expect(existsSync(pickupPath)).toBe(true)
    if (!existsSync(pickupPath)) return
    const sql = readFileSync(pickupPath, 'utf8').toLowerCase()

    expect(sql).toContain('function public.internal_pickup_notification_recipients')
    expect(sql).toContain('function public.internal_pickup_notification_eligible_hash')
    expect(sql.match(/customer\.household_kind = 'resident'/g) ?? []).toHaveLength(2)
  })

  it('keeps the audience predicate identical in both functions', () => {
    const sql = readFileSync(pickupPath, 'utf8').toLowerCase()

    expect(sql.match(/customer\.period in \(1, 3\)/g) ?? []).toHaveLength(2)
    expect(sql.match(/customer\.period = 2/g) ?? []).toHaveLength(2)
  })

  it('keeps both functions away from browser roles', () => {
    const sql = readFileSync(pickupPath, 'utf8').toLowerCase()

    expect(sql).toContain('revoke all on function public.internal_pickup_notification_recipients(uuid, text) from public, anon, authenticated')
    expect(sql).toContain('revoke all on function public.internal_pickup_notification_eligible_hash(uuid, text) from public, anon, authenticated')
  })
})
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `npx vitest run src/services/householdKindMigration.test.ts`
Expected: 新增的 3 個 FAIL，先前 7 個仍 PASS

- [ ] **Step 4: 寫 migration**

建立 `supabase/migrations/20260919162000_household_kind_pickup.sql`，把 Step 1 取出的兩段定義原樣貼入並改為 `create or replace function`，各自在 WHERE 加一個條件。

`internal_pickup_notification_recipients` 的 WHERE 由：

```sql
  where (p_audience = 'phase13' and customer.period in (1, 3))
     or (p_audience = 'phase2' and customer.period = 2)
```

改為：

```sql
  where customer.household_kind = 'resident'
    and ((p_audience = 'phase13' and customer.period in (1, 3))
      or (p_audience = 'phase2' and customer.period = 2))
```

`internal_pickup_notification_eligible_hash` 的 WHERE 由：

```sql
    where campaign.id = p_campaign_id
      and ((p_audience = 'phase13' and customer.period in (1, 3))
        or (p_audience = 'phase2' and customer.period = 2))
```

改為：

```sql
    where campaign.id = p_campaign_id
      and customer.household_kind = 'resident'
      and ((p_audience = 'phase13' and customer.period in (1, 3))
        or (p_audience = 'phase2' and customer.period = 2))
```

其餘一律不動，包含 `order by`、`distinct`、join 順序與授權區塊。授權區塊照抄：

```sql
revoke all on function public.internal_pickup_notification_recipients(uuid, text) from public, anon, authenticated;
revoke all on function public.internal_pickup_notification_eligible_hash(uuid, text) from public, anon, authenticated;
```

- [ ] **Step 5: 執行測試確認通過**

Run: `npx vitest run src/services/householdKindMigration.test.ts`
Expected: PASS（10 個測試）

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260919162000_household_kind_pickup.sql src/services/householdKindMigration.test.ts
git commit -m "feat: keep non-residents out of pickup notifications"
```

---

### Task 4: 把 `household_kind` 曝露給前端

**Files:**
- Create: `supabase/migrations/20260919163000_household_kind_exposure.sql`
- Modify: `src/services/householdKindMigration.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `customer.household_kind`
- Produces: `public.order_wall` 新增欄位 `household_kind text`；`public.admin_list_residents()` 的回傳表新增 `household_kind text`

- [ ] **Step 1: 取出最新定義**

```bash
sed -n '509,521p' supabase/migrations/20260912010000_campaign_discounts.sql
```

```bash
sed -n '174,232p' supabase/migrations/20260827_000018_open_line_resident_admission.sql
```

- [ ] **Step 2: 寫失敗測試**

在 `src/services/householdKindMigration.test.ts` 末尾追加：

```typescript
const exposurePath = resolve(process.cwd(), 'supabase/migrations/20260919163000_household_kind_exposure.sql')

describe('household kind exposure migration', () => {
  it('returns the kind from the order wall without loosening how it is read', () => {
    expect(existsSync(exposurePath)).toBe(true)
    if (!existsSync(exposurePath)) return
    const sql = readFileSync(exposurePath, 'utf8').toLowerCase()

    expect(sql).toContain('create or replace view public.order_wall with (security_invoker = true)')
    expect(sql).toContain('cu.household_kind')
    expect(sql).toContain('grant select on table public.order_wall to authenticated')
    expect(sql).toContain('revoke all on table public.order_wall from anon')
  })

  it('returns the kind in the organizer resident list', () => {
    const sql = readFileSync(exposurePath, 'utf8').toLowerCase()

    expect(sql).toContain('function public.admin_list_residents()')
    expect(sql).toContain('household_kind text')
    expect(sql).toContain('public.is_admin()')
  })
})
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `npx vitest run src/services/householdKindMigration.test.ts`
Expected: 新增的 2 個 FAIL，先前 10 個仍 PASS

- [ ] **Step 4: 寫 migration**

建立 `supabase/migrations/20260919163000_household_kind_exposure.sql`。

`order_wall` 以 Step 1 取出的定義為基礎，在 `cu.period, cu.unit` 之後加入 `cu.household_kind`，其餘欄位順序與 join 完全不動。因為是加欄位而非改欄位，可用 `create or replace view`；但若 PostgreSQL 因欄位順序拒絕 replace，則改為 `drop view public.order_wall;` 後重建，**並且必須重新下授權**：

```sql
revoke all on table public.order_wall from anon, authenticated;
grant select on table public.order_wall to authenticated;
```

`with (security_invoker = true)` 一定要保留，否則住戶會繞過 RLS 讀到別人的資料。

`admin_list_residents()` 在 `returns table (...)` 加入 `household_kind text`，並在 SELECT 對應位置加上該欄位。授權照抄：

```sql
revoke all on function public.admin_list_residents() from public, anon;
grant execute on function public.admin_list_residents() to authenticated;
```

- [ ] **Step 5: 執行測試確認通過**

Run: `npx vitest run src/services/householdKindMigration.test.ts`
Expected: PASS（12 個測試）

- [ ] **Step 6: 在真資料庫驗證住戶仍讀得到訂單牆**

```bash
npx supabase db reset
```

```bash
set -a; eval "$(npx supabase status -o env)"; set +a; PYTHONIOENCODING=utf-8 python scripts/verify_order_workflow.py
```

Expected: 11 項全為 true。這一步是在確認重建 view 沒有把授權弄丟。

- [ ] **Step 7: 重新產生型別**

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

註：這會一併帶入 `list_admin_campaign_cards` 既有的 4 處型別落差（`opened_at`、`amount_threshold` 的可空性），那是本次之前就存在的漂移，接受它並在 commit 訊息說明。

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260919163000_household_kind_exposure.sql src/services/householdKindMigration.test.ts src/types/database.ts
git commit -m "feat: expose the household kind to the frontend"
```

---

### Task 5: `household.ts` 改為 kind-aware

**Files:**
- Modify: `src/domain/household.ts`
- Modify: `src/domain/household.test.ts`

**Interfaces:**
- Produces:
  - `export type HouseholdKind = 'resident' | 'other'`
  - `export function formatHousehold(kind: HouseholdKind, period: number | null, unit: string | null): string` — 住戶回傳 `'二期 2K13'`，其他回傳 `'其他'`
  - `HouseholdSelection` 加入 `kind: HouseholdKind`；`kind === 'other'` 時 `prefix`／`letter`／`number` 一律忽略
  - `formatHouseholdUnit(selection)` 在 `kind === 'other'` 時回傳 `null`

- [ ] **Step 1: 寫失敗測試**

在 `src/domain/household.test.ts` 末尾追加：

```typescript
import { formatHousehold, type HouseholdKind } from './household'

describe('household kind formatting', () => {
  it('labels a resident with period and unit', () => {
    expect(formatHousehold('resident', 2, '2K13')).toBe('二期 2K13')
  })

  it('labels someone outside the community without inventing a period', () => {
    expect(formatHousehold('other', null, null)).toBe('其他')
  })

  it('refuses a resident with no household rather than rendering NaN', () => {
    expect(() => formatHousehold('resident', null, null)).toThrow('住戶必須有期別與戶號')
  })

  it('produces no unit string for someone outside the community', () => {
    expect(formatHouseholdUnit({ kind: 'other', period: 1, prefix: null, letter: 'A', number: 1 })).toBeNull()
  })
})
```

註：`formatHouseholdUnit` 已在檔案頂部被 import，不需重複 import。

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run src/domain/household.test.ts`
Expected: FAIL，`formatHousehold is not a function`

- [ ] **Step 3: 實作**

在 `src/domain/household.ts` 加入：

```typescript
export type HouseholdKind = 'resident' | 'other'

export function formatHousehold(kind: HouseholdKind, period: number | null, unit: string | null): string {
  if (kind === 'other') return '其他'
  if (period === null || unit === null) throw new Error('住戶必須有期別與戶號')
  return `${formatResidentPeriod(period)} ${unit}`
}
```

`HouseholdSelection` 加上 `kind: HouseholdKind`。`assertHouseholdSelection` 開頭插入 `if (selection.kind === 'other') return`。`formatHouseholdUnit` 的回傳型別改為 `string | null`，並在 `assertHouseholdSelection` 之後加入 `if (selection.kind === 'other') return null`。`parseHouseholdUnit` 回傳的物件補上 `kind: 'resident'`。

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run src/domain/household.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/household.ts src/domain/household.test.ts
git commit -m "feat: model the household kind in the domain"
```

---

### Task 6: 排序與「筆數」

**Files:**
- Modify: `src/domain/adminOrders.ts`
- Modify: `src/domain/adminOrders.test.ts`
- Modify: `src/services/orderExport.ts`
- Modify: `src/services/orderExport.test.ts`

**Interfaces:**
- Consumes: Task 5 的 `HouseholdKind`
- Produces: `OrganizerOrderSummary.orderCount`（取代 `householdCount`）；`OrganizerOrderRow` 與匯出列加入 `householdKind: HouseholdKind`、`period: number | null`、`unit: string | null`

- [ ] **Step 1: 寫失敗測試**

在 `src/domain/adminOrders.test.ts` 末尾追加：

```typescript
describe('ordering when a household is shared', () => {
  const base = { items: { A: 1 }, orderedAt: '2026-08-14T00:10:00Z', updatedAt: '2026-08-14T00:10:00Z' }

  it('breaks a tie between two accounts in one household by name', () => {
    const summary = buildOrganizerOrderSummary({
      orders: [
        { ...base, customerId: 'c2', orderId: 'o2', name: '乙', period: 2, unit: '2K13', householdKind: 'resident' },
        { ...base, customerId: 'c1', orderId: 'o1', name: '甲', period: 2, unit: '2K13', householdKind: 'resident' },
      ],
      items: [{ code: 'A', unitPrice: 45 }],
      threshold: 10,
    })

    expect(summary.orderRows.map((row) => row.name)).toEqual(['甲', '乙'])
  })

  it('puts people outside the community last instead of sorting on a null period', () => {
    const summary = buildOrganizerOrderSummary({
      orders: [
        { ...base, customerId: 'c3', orderId: 'o3', name: '丙', period: null, unit: null, householdKind: 'other' },
        { ...base, customerId: 'c1', orderId: 'o1', name: '甲', period: 2, unit: '2K13', householdKind: 'resident' },
      ],
      items: [{ code: 'A', unitPrice: 45 }],
      threshold: 10,
    })

    expect(summary.orderRows.map((row) => row.name)).toEqual(['甲', '丙'])
  })

  it('counts orders rather than households now that a household can hold several', () => {
    const summary = buildOrganizerOrderSummary({
      orders: [
        { ...base, customerId: 'c1', orderId: 'o1', name: '甲', period: 2, unit: '2K13', householdKind: 'resident' },
        { ...base, customerId: 'c2', orderId: 'o2', name: '乙', period: 2, unit: '2K13', householdKind: 'resident' },
      ],
      items: [{ code: 'A', unitPrice: 45 }],
      threshold: 10,
    })

    expect(summary.orderCount).toBe(2)
  })
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run src/domain/adminOrders.test.ts`
Expected: FAIL，`orderCount` 為 undefined、排序結果不符

- [ ] **Step 3: 實作排序與計數**

`src/domain/adminOrders.ts`：`OrganizerOrderSummary` 的 `householdCount: number` 改名為 `orderCount: number`，`householdCount: orders.length` 改為 `orderCount: orders.length`。排序改為：

```typescript
    .sort((left, right) => compareHousehold(left, right) || left.name.localeCompare(right.name, 'zh-TW'))
```

並在檔案中加入：

```typescript
function compareHousehold(
  left: { householdKind: HouseholdKind; period: number | null; unit: string | null },
  right: { householdKind: HouseholdKind; period: number | null; unit: string | null },
): number {
  if (left.householdKind !== right.householdKind) return left.householdKind === 'resident' ? -1 : 1
  if (left.householdKind === 'other') return 0
  return (left.period ?? 0) - (right.period ?? 0) || (left.unit ?? '').localeCompare(right.unit ?? '')
}
```

型別上 `OrganizerOrderRow` 與其輸入的 order 型別，`period` 改為 `number | null`、`unit` 改為 `string | null`，並加入 `householdKind: HouseholdKind`。

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run src/domain/adminOrders.test.ts`
Expected: PASS。既有斷言 `expect(summary.householdCount).toBe(6)` 與 `toBe(1)` 要一併改名為 `orderCount`。

- [ ] **Step 5: 匯出排序寫失敗測試**

在 `src/services/orderExport.test.ts` 末尾追加：

```typescript
describe('export ordering when a household is shared', () => {
  it('keeps two accounts in one household in a stable name order and puts others last', () => {
    const rows = buildOrderExportRows({
      ...summary,
      orderRows: [
        { ...summary.orderRows[0], orderId: 'o3', name: '丙', period: null, unit: null, householdKind: 'other' },
        { ...summary.orderRows[0], orderId: 'o2', name: '乙', period: 2, unit: '2K13', householdKind: 'resident' },
        { ...summary.orderRows[0], orderId: 'o1', name: '甲', period: 2, unit: '2K13', householdKind: 'resident' },
      ],
    }, '測試團購')

    expect(rows.map((row) => row.name)).toEqual(['甲', '乙', '丙'])
  })
})
```

註：`summary` 為該測試檔既有的 fixture，沿用即可。

- [ ] **Step 6: 執行測試確認失敗**

Run: `npx vitest run src/services/orderExport.test.ts`
Expected: FAIL，順序不符

- [ ] **Step 7: 實作匯出排序**

`src/services/orderExport.ts` 的排序由：

```typescript
    left.period - right.period || unitCollator.compare(left.unit, right.unit)
```

改為：

```typescript
    (left.householdKind === right.householdKind ? 0 : left.householdKind === 'resident' ? -1 : 1)
      || (left.period ?? 0) - (right.period ?? 0)
      || unitCollator.compare(left.unit ?? '', right.unit ?? '')
      || left.name.localeCompare(right.name, 'zh-TW')
```

匯出列的戶號欄以 `formatHousehold(order.householdKind, order.period, order.unit)` 產生。

- [ ] **Step 8: 執行測試確認通過**

Run: `npx vitest run src/services/orderExport.test.ts src/domain/adminOrders.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/domain/adminOrders.ts src/domain/adminOrders.test.ts src/services/orderExport.ts src/services/orderExport.test.ts
git commit -m "feat: order shared households predictably"
```

---

### Task 7: 前端資料層傳遞 `household_kind`

**Files:**
- Modify: `src/services/adminOrdersGateway.ts`
- Modify: `src/services/adminOrdersGateway.test.ts`
- Modify: `src/services/residentMemberManagementGateway.ts`
- Modify: `src/services/residentMemberManagementGateway.test.ts`
- Modify: `src/LocalLiveApps.tsx:1176-1195`
- Modify: `src/LocalLiveApps.test.tsx`
- Modify: `src/App.tsx:90`

**Interfaces:**
- Consumes: Task 4 的 `order_wall.household_kind` 與 `admin_list_residents().household_kind`；Task 5 的 `HouseholdKind`；Task 6 的 `OrganizerOrderRow`
- Produces:
  - `type ResidentBindingInput = { kind: HouseholdKind; period: number | null; unit: string | null }`（`src/App.tsx:90`，取代原本的 `Pick<ResidentCustomer, 'period' | 'unit'>`）
  - `ResidentCustomer` 的 `period` 改為 `number | null`、`unit` 改為 `string | null`，並加入 `householdKind: HouseholdKind`
  - gateway 回傳的每一列都帶 `householdKind`

**注意：綁定不經過 `lineResidentGateway`。** `bind_customer_self` 是在 `src/LocalLiveApps.tsx:1177` 直接以 `client.rpc(...)` 呼叫的，改動要落在那裡。

- [ ] **Step 1: 寫失敗測試**

在 `src/services/adminOrdersGateway.test.ts` 既有的 order wall fixture 每一列加上 `household_kind: 'resident'`，並在檔案末尾追加：

```typescript
it('carries the household kind through so the panel can label people outside the community', async () => {
  const wallQuery = queryResult([
    { order_id: 'order-9', customer_id: 'c9', customer_name: '丙', period: null, unit: null, household_kind: 'other', item_code: 'A', qty: 1, list_unit_price: 45, discount_type: 'base', discount_rate: 1, final_unit_price: 45, promotion_name: null, ordered_at: '2026-08-14T00:10:00Z', order_updated_at: '2026-08-14T00:10:00Z' },
  ])
  const itemQuery = queryResult([{ code: 'A', name: '牛奶', unit_price: 45, active: true, sort_order: 1 }])
  const statusQuery = queryResult([{ order_id: 'order-9', paid: false, organizer_note: null }])
  const single = vi.fn().mockResolvedValue({ data: { status: 'open' }, error: null })
  const campaignQuery = { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single }) }) }
  const from = vi.fn((table: string) => {
    if (table === 'campaign_item') return itemQuery
    if (table === 'organizer_order_status') return statusQuery
    if (table === 'campaign_public') return campaignQuery
    return wallQuery
  })
  const client = { from, rpc: vi.fn() } as unknown as AdminOrdersSupabaseClient

  const summary = await createAdminOrdersGateway(client).loadSummary('campaign-1', 10)

  expect(summary.orderRows[0].householdKind).toBe('other')
  expect(summary.orderRows[0].period).toBeNull()
})
```

在 `src/LocalLiveApps.test.tsx` 既有那筆 `bind_customer_self` 測試（約 1606 行）之後追加：

```typescript
it('binds someone outside the community without inventing a household', async () => {
  const rpc = vi.fn((name: string) => {
    if (name === 'bind_customer_self') {
      return Promise.resolve({ data: [{ id: 'c9', name: '丙', picture_url: null, period: null, unit: null, household_kind: 'other' }], error: null })
    }
    return Promise.resolve({ data: [], error: null })
  })

  await expect(bindThroughLiveResidentApp(rpc, { kind: 'other', period: null, unit: null }))
    .resolves.toMatchObject({ householdKind: 'other', period: null, unit: null })

  expect(rpc).toHaveBeenCalledWith('bind_customer_self', {
    p_household_kind: 'other', p_period: null, p_unit: null,
  })
})
```

註：`bindThroughLiveResidentApp` 不是既有 helper。實作這個測試時，請照該檔案第 1600 行附近既有的 `bind_customer_self` 測試寫法，渲染 `LocalLiveResidentApp` 並透過表單觸發綁定，而不是自行發明 helper；上面的 `expect` 內容即為要驗證的行為。

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run src/services/adminOrdersGateway.test.ts src/LocalLiveApps.test.tsx`
Expected: FAIL，`householdKind` 為 undefined、rpc 參數不符

- [ ] **Step 3: 實作 gateway**

`adminOrdersGateway.ts` 的 order wall `select(...)` 字串加入 `household_kind`，組裝列時帶 `householdKind: row.household_kind ?? 'resident'`，並把 `period` / `unit` 的非空檢查放寬為允許 null。`residentMemberManagementGateway.ts` 同樣把 `household_kind` 帶進回傳列。

- [ ] **Step 4: 實作綁定呼叫**

`src/LocalLiveApps.tsx:1176` 起改為：

```typescript
      onBindResident={async ({ kind, period, unit }) => {
        const { data, error: bindError } = await client.rpc('bind_customer_self', {
          p_household_kind: kind,
          p_period: period,
          p_unit: unit,
        })
        if (bindError) throw bindError
        const customer = data?.[0]
        if (!customer?.id || !customer.name) throw new Error('住戶資料綁定結果無效')
        if (kind === 'resident' && (customer.period === null || !customer.unit)) {
          throw new Error('住戶資料綁定結果無效')
        }
```

**這一步是本任務最容易漏的地方：** 原本的守衛是 `customer.period === null || !customer.unit` 無條件拋錯，「其他」的綁定必然踩中。守衛必須改為只在 `kind === 'resident'` 時才要求期別與戶號。

隨後組裝 `bound` 物件時加入 `householdKind: kind`。

`src/App.tsx:90` 的型別改為：

```typescript
type ResidentBindingInput = { kind: HouseholdKind; period: number | null; unit: string | null }
```

並把 `ResidentCustomer` 的 `period` / `unit` 放寬為可空、加入 `householdKind`。

- [ ] **Step 5: 執行測試確認通過**

Run: `npx vitest run src/services/ src/LocalLiveApps.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/ src/LocalLiveApps.tsx src/LocalLiveApps.test.tsx src/App.tsx
git commit -m "feat: carry the household kind through the data layer"
```

---

### Task 8: 綁定表單的「其他」選項

**Files:**
- Modify: `src/App.tsx:650-690`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: Task 5 的 `HouseholdKind`、Task 7 的 `bindResident(kind, period, unit)`

- [ ] **Step 1: 寫失敗測試**

在 `src/App.test.tsx` 末尾追加：

```typescript
it('lets someone outside the community bind without a household', async () => {
  const user = userEvent.setup()
  const onBindResident = vi.fn().mockResolvedValue(undefined)
  render(<App residentCustomer={null} onBindResident={onBindResident} />)

  await user.selectOptions(screen.getByRole('combobox', { name: '期別' }), '其他')

  expect(screen.queryByRole('combobox', { name: '戶號英文字母' })).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox', { name: '樓層' })).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '儲存住戶資料' }))

  expect(onBindResident).toHaveBeenCalledWith('other', null, null)
})

it('still requires a unit from someone who says they live here', async () => {
  const user = userEvent.setup()
  const onBindResident = vi.fn().mockResolvedValue(undefined)
  render(<App residentCustomer={null} onBindResident={onBindResident} />)

  await user.selectOptions(screen.getByRole('combobox', { name: '期別' }), '一期')
  await user.selectOptions(screen.getByRole('combobox', { name: '戶號英文字母' }), 'H')
  await user.selectOptions(screen.getByRole('combobox', { name: '樓層' }), '11')
  await user.click(screen.getByRole('button', { name: '儲存住戶資料' }))

  expect(onBindResident).toHaveBeenCalledWith('resident', 1, 'H11')
})
```

註：表單四個 select 的可及性名稱分別是「期別」（來自 `<span>`）、「戶號數字」與「戶號英文字母」（aria-label）、「樓層」（`<span>`）；其中「戶號數字」只在非一期時出現。

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run src/App.test.tsx -t "outside the community bind"`
Expected: FAIL，選項「其他」不存在

- [ ] **Step 3: 實作**

期別 select 在 `RESIDENT_PERIODS.map(...)` 產生的選項後，追加一個 value 為 `other` 的選項，顯示文字「其他」。元件狀態新增 `householdKind`，當其為 `'other'` 時不渲染前段／棟別／號碼三個 select。送出時依 kind 決定傳 `('other', null, null)` 或 `('resident', period, formatHouseholdUnit(selection))`。

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: let people outside the community bind"
```

---

### Task 9: 顯示與文案

**Files:**
- Modify: `src/AdminOrdersPanel.tsx:16` 與其四個 `periodLabel` 呼叫點（239、331、359，以及住戶管理列表）
- Modify: `src/AdminOrdersPanel.tsx:152`（參加戶數）
- Modify: `src/AdminOrdersPanel.test.tsx`
- Modify: `src/App.tsx:476,716`
- Modify: `src/ResidentMemberManagementApp.tsx`
- Modify: `src/ResidentMemberManagementApp.test.tsx`

**Interfaces:**
- Consumes: Task 5 的 `formatHousehold`、Task 6 的 `orderCount`

- [ ] **Step 1: 寫失敗測試**

在 `src/AdminOrdersPanel.test.tsx` 末尾追加：

```typescript
it('labels an order from outside the community and counts orders rather than households', () => {
  const mixed = {
    ...summary,
    orderCount: 2,
    orderRows: [
      { ...summary.orderRows[0], orderId: 'o1', name: '甲', period: 2, unit: '2K13', householdKind: 'resident' as const },
      { ...summary.orderRows[0], orderId: 'o2', name: '丙', period: null, unit: null, householdKind: 'other' as const },
    ],
  }

  render(<AdminOrdersPanel summary={mixed} campaignStatus="open" />)

  expect(screen.getByText('2 筆')).toBeInTheDocument()
  expect(screen.getByRole('row', { name: /其他\s*丙/ })).toBeInTheDocument()
  expect(screen.queryByText('NaN期')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run src/AdminOrdersPanel.test.tsx -t "outside the community"`
Expected: FAIL，顯示「參加戶數 2 戶」且戶號欄出現 `NaN期`

- [ ] **Step 3: 實作**

`src/AdminOrdersPanel.tsx` 移除本地的 `periodLabel`，改為 import `formatHousehold`。四個呼叫點改寫：

- 表格戶號欄：`{formatHousehold(order.householdKind, order.period, order.unit)}`
- 付款確認框：`「{formatHousehold(paymentTarget.householdKind, paymentTarget.period, paymentTarget.unit)}・{paymentTarget.name}」`
- 取消訂單確認框：同上，改用 `cancelTarget`
- 統計卡片：`<span>參加筆數</span><strong>{summary.orderCount} 筆</strong>`

`src/App.tsx:476` 與 `:716` 的 `formatResidentPeriod(...)` 加 `unit` 的組合，改為 `formatHousehold(kind, period, unit)`。`ResidentMemberManagementApp.tsx` 的住戶列表同樣改用 `formatHousehold`。

- [ ] **Step 3b: 通知面板顯示被排除的人數**

Spec 要求「其他」不能静默消失。先在 `src/PickupNotificationPanel.test.tsx` 末尾追加失敗測試：

```typescript
it('warns that people outside the community will not be notified', () => {
  render(<PickupNotificationPanel {...baseProps} excludedOtherCount={2} />)

  expect(screen.getByText('本團另有 2 位「其他」身分的訂購者不會收到通知，請自行聯繫。')).toBeInTheDocument()
})

it('says nothing when every buyer is a resident', () => {
  render(<PickupNotificationPanel {...baseProps} excludedOtherCount={0} />)

  expect(screen.queryByText(/不會收到通知/)).not.toBeInTheDocument()
})
```

註：`baseProps` 為該測試檔既有的 fixture。確認失敗後，`PickupNotificationPanel` 新增可選 prop `excludedOtherCount?: number`，大於 0 時渲染該行提醒；`AdminOrdersPanel` 以 `summary.orderRows.filter((row) => row.householdKind === 'other').length` 傳入。

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run`
Expected: 全綠。既有測試中斷言「6 戶」「參加戶數」的地方要一併改為「6 筆」「參加筆數」。

- [ ] **Step 5: Commit**

```bash
git add src/AdminOrdersPanel.tsx src/AdminOrdersPanel.test.tsx src/App.tsx src/ResidentMemberManagementApp.tsx src/ResidentMemberManagementApp.test.tsx
git commit -m "feat: label households by kind across both apps"
```

---

### Task 10: Demo 資料

**Files:**
- Modify: `src/data/demo.ts`

**Interfaces:**
- Consumes: Task 5 的 `HouseholdKind`

- [ ] **Step 1: 寫失敗測試**

在 `src/App.test.tsx` 末尾追加：

```typescript
it('gives every demo order its own identity so one household can hold two of them', () => {
  const ids = initialOrders.map((order) => order.customerId)

  expect(new Set(ids).size).toBe(ids.length)
  expect(initialOrders.every((order) => order.householdKind === 'resident')).toBe(true)
})
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx vitest run src/App.test.tsx -t "own identity"`
Expected: FAIL，`householdKind` 為 undefined

- [ ] **Step 3: 實作**

`src/data/demo.ts` 的每筆 `initialOrders` 加上 `householdKind: 'resident'`，並把 `customerId` 由 `'2:2K13'` 這類合成字串改為 `'demo-customer-1'` 至 `'demo-customer-6'`。`currentCustomerId` 同步改為對應的新值。

- [ ] **Step 4: 執行測試確認通過**

Run: `npx vitest run`
Expected: 全綠

- [ ] **Step 5: Commit**

```bash
git add src/data/demo.ts src/App.test.tsx
git commit -m "fix: give demo orders independent identities"
```

---

### Task 11: 實機驗證腳本

**Files:**
- Modify: `scripts/verify_order_workflow.py`

**Interfaces:**
- Consumes: Task 1–4 的資料庫變更

- [ ] **Step 1: 加入四項驗證**

在 `scripts/verify_order_workflow.py` 的 `print(json.dumps({` 之前插入以下區塊。`SECOND_*` 與 `OTHER_*` 為新的拋棄式常數，需在檔案頂端與 `CANCEL_*` 一起宣告，並在 `cleanup()` 中一併刪除：

```python
    second_id, second_token = signup()
    assert call("POST", "/rest/v1/community_member", SECRET_KEY, prefer="return=minimal",
                body={"community_id": COMMUNITY_ID, "user_id": second_id})[0] in (200, 201)
    status, _ = call("POST", "/rest/v1/rpc/bind_customer_self", ANON_KEY, token=second_token,
                     body={"p_household_kind": "resident", "p_period": 2, "p_unit": "2K13"})
    shared_household_allows_second_account = status == 200
    assert shared_household_allows_second_account, status

    other_id, other_token = signup()
    assert call("POST", "/rest/v1/community_member", SECRET_KEY, prefer="return=minimal",
                body={"community_id": COMMUNITY_ID, "user_id": other_id})[0] in (200, 201)
    status, bound = call("POST", "/rest/v1/rpc/bind_customer_self", ANON_KEY, token=other_token,
                         body={"p_household_kind": "other", "p_period": None, "p_unit": None})
    other_binds_without_household = status == 200 and bound[0]["period"] is None and bound[0]["unit"] is None
    assert other_binds_without_household, (status, bound)

    status, recipients = call("POST", "/rest/v1/rpc/internal_pickup_notification_recipients", SECRET_KEY,
                              body={"p_campaign_id": CAMPAIGN_ID, "p_audience": "phase2"})
    pickup_excludes_other = status == 200 and all(row["unit"] is not None for row in recipients)
    assert pickup_excludes_other, (status, recipients)

    hashes = []
    for audience in ("phase13", "phase2"):
        _, rows = call("POST", "/rest/v1/rpc/internal_pickup_notification_recipients", SECRET_KEY,
                       body={"p_campaign_id": CAMPAIGN_ID, "p_audience": audience})
        _, digest = call("POST", "/rest/v1/rpc/internal_pickup_notification_eligible_hash", SECRET_KEY,
                         body={"p_campaign_id": CAMPAIGN_ID, "p_audience": audience})
        expected = hashlib.sha256("\n".join(sorted({row["line_user_id"] for row in rows})).encode()).hexdigest()
        hashes.append(digest == expected)
    recipients_match_eligibility_hash = all(hashes)
    assert recipients_match_eligibility_hash, hashes
```

檔案頂端 `import json` 之後加入 `import hashlib`。`print` 的字典把 `"checks"` 由 `11` 改為 `15`，並加入四個新鍵。

註：第四項的 `expected` 以空字串 join 空集合會得到空字串的 sha256，與 SQL 端 `coalesce(string_agg(...), '')` 的行為一致。此檢查必須在團購處於 `closed` 或 `arrived` 狀態時執行，因為 recipients RPC 有 `campaign must be closed` 的前置條件；腳本在此處campaign 已被設為 closed，位置正確。

- [ ] **Step 2: 執行腳本**

```bash
npx supabase db reset
```

```bash
set -a; eval "$(npx supabase status -o env)"; set +a; PYTHONIOENCODING=utf-8 python scripts/verify_order_workflow.py
```

Expected: `{"checks": 15, ...}`，所有值為 true

- [ ] **Step 3: 再執行一次確認可重複**

```bash
set -a; eval "$(npx supabase status -o env)"; set +a; PYTHONIOENCODING=utf-8 python scripts/verify_order_workflow.py
```

Expected: 同樣 15 項全 true。若第二次失敗，代表 `cleanup()` 沒有清乾淨拋棄式資料。

- [ ] **Step 4: Commit**

```bash
git add scripts/verify_order_workflow.py
git commit -m "test: verify shared households and the other household kind"
```

---

### Task 12: 收尾與部署

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新 README**

「目前完成」區塊加入一行：

```markdown
- 一組期別＋戶號可由多個 LINE 帳號各自獨立下單；期別另有「其他」供社區以外的人使用，其不納入 LINE 領取通知
```

「安全原則」區塊加入一行：

```markdown
- 領取通知只發給 `household_kind = 'resident'` 的購買者，排除條件寫在資料庫端的收件人與資格雜湊兩支函式中
```

驗證項數由 55 改為 59，並在工作流腳本的說明中補上四項新驗證。

- [ ] **Step 2: 全套驗證**

```bash
npm test
```

Expected: 全綠

```bash
npm run build
```

Expected: `✓ built`，無 TypeScript 錯誤

```bash
npx oxlint
```

Expected: exit 0，無輸出

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: record the household kind rules"
```

- [ ] **Step 4: 部署（資料庫先，前端後）**

```bash
npx supabase db push --dry-run
```

Expected: 列出四支新 migration，不含其他項目

```bash
npx supabase db push
```

```bash
npx supabase migration list
```

Expected: 四支新 migration 的 local 與 remote 欄皆有值

```bash
git push origin main
```

- [ ] **Step 5: 停止本機 Supabase**

```bash
npx supabase stop
```

---

## 執行順序與風險

Task 1–4 必須依序完成且一次部署，因為 Task 2–4 的函式依賴 Task 1 的欄位。Task 5–10 是前端，可在資料庫變更上線後再部署。Task 11 需要本機 Supabase 與 Docker。

最高風險是 Task 4 重建 `order_wall`：若授權或 `security_invoker` 掉了，住戶會讀不到訂單牆，或更糟，讀到不屬於自己的資料。Task 4 Step 6 的實機驗證就是為了擋這件事，不可略過。

次高風險是 Task 1 移除 `unique (period, unit)`：這是不可逆的，且移除後就失去戶號冒用的偵測能力。此為 spec 已確認接受的取捨。
