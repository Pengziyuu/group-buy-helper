# 團購範本 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 團主可以把任一團購存成範本（範本與團購分開保存，有自己的圖片副本），並在「＋ 建立新團」時從範本建立新團。

**Architecture:**
- **資料庫：**新增資料表 `campaign_template`，用一筆 JSON 存可重用的團購內容，只有團主能讀寫。範本圖片放在既有 `campaign-images` 空間的 `templates/<範本 id>/`，另加上傳權限。
- **前端：**
  - `src/domain/campaignTemplate.ts` 放純函式：內容的取出與轉換、名稱檢查、圖片路徑解析。
  - `src/services/campaignTemplateGateway.ts` 負責讀寫範本與複製圖片（Supabase Storage `copy`）。
  - 本機示範用 `src/services/demoTemplateStore.ts` 以 localStorage 實作同一個介面。
- **畫面：**
  - 工作區左側欄「存成範本」視窗；
  - 設定頁「團購範本」區；
  - 「＋ 建立新團」視窗多「從範本建立」。

**Tech Stack:** React 19、TypeScript 6、Vitest 4、Testing Library、Supabase（Postgres＋Storage，本機用 `npx supabase`）、Python 3 驗證腳本

**Spec:** `docs/superpowers/specs/2026-09-25-campaign-templates-design.md`

## Global Constraints

- 不修改任何現有資料表、view、RPC、policy、Edge Function。資料庫只新增，舊版前端不受影響。
- 不新增 npm 相依套件。
- 範本只有 `public.is_admin()` 的團主能讀寫；`anon` 與住戶沒有任何權限。
- 範本內容**不存**：`autoCloseAt`、`openedAt`，以及不是「貨到通知」的 `arrivalLabel`。
- `items` 只存啟用中的品項，一律 `active: true`；沒有單價的品項用內容的 `unitPrice` 補上。
- 從範本建立的新團一律是草稿：`autoCloseAt` 設 `null`、`openedAt` 設 `null`、`arrivalLabel` 設「貨到通知」。
- 範本名稱去掉前後空白後 1～100 字，不分大小寫不可重複。
- **視覺與可點範圍：**
  - 聚焦外框 `2px solid #0071e3`、`outline-offset: 2px`；
  - 字重只用 400 與 600；輔助小字最小 12px；
  - 團主端 1024px 以上可點範圍 ≥ 24px，1024px 以下 ≥ 44px；
  - 文字對比 ≥ 4.5:1。
- 使用者可見文案一律繁體中文。
- TDD：每個行為先寫失敗測試，確認失敗原因是功能缺失，再寫最小實作。
- 修改既有測試時，原本驗證的行為必須仍被某個測試驗證。
- **只 commit、不 push；正式資料庫的 migration 也不在計畫中執行**。部署在計畫完成、團主同意後另外進行。

## 對 Spec 的調整

1. **「存成範本」視窗一律提示「會使用這一團已儲存的內容」**，不偵測內容設定頁是否還有沒存完的修改。左側欄拿不到編輯器的即時狀態，而自動儲存約 0.5 秒就完成。
2. **從範本建立後的提示**（部分圖片沒複製成功、內容沒完整帶入），透過記憶體中的「團購提示」傳到新團工作區，顯示在工作區主內容上方，而不是只放在內容設定頁。任何分區都看得到。

## Review Focus

1. **存成新範本途中某張圖片複製失敗：**不能留下範本列或已複製的圖片，錯誤訊息要說明原因。Task 3 測試。
2. **取代既有範本失敗**（圖片複製或寫入失敗）：舊範本內容與圖片完全不變，這次多複製的圖片要清掉。成功時只刪「舊內容用到、新內容沒用到」且在該範本資料夾下的圖片。Task 3 測試。
3. **範本裡的圖片網址不在我們的儲存空間**（例如示範資料的 `/remote.svg`）：直接沿用網址，不嘗試複製、不算失敗。Task 2、Task 3 測試。
4. **從範本建立時：**草稿已建立但寫入內容失敗，仍回傳新團 id 與錯誤訊息，讓畫面導向新草稿並提示；部分圖片複製失敗時回報張數，其餘照常。Task 3、Task 6 測試。
5. **同名：**新範本或改名撞到既有名稱（大小寫、前後空白不同也算），在送出前就擋下並顯示同一句說明。若資料庫的唯一索引仍擋下（例如另一個分頁剛建立），也顯示同一句。Task 2、Task 3、Task 5 測試。

## 檔案地圖

| 檔案 | 動作 | 責任 |
|---|---|---|
| `supabase/migrations/20260925010000_campaign_templates.sql` | 新增 | 資料表、檢查函式、索引、RLS、範本圖片路徑函式、storage policy、權限 |
| `scripts/verify_campaign_templates.py` | 新增 | 本機 Supabase 權限與資料檢查驗證 |
| `src/types/database.ts` | 修改 | 加入 `campaign_template` 型別 |
| `src/domain/campaignTemplate.ts`、`campaignTemplate.test.ts` | 新增 | 純函式 |
| `src/services/campaignImageGateway.ts` | 修改 | 匯出 `createCompatibleUuid` |
| `src/services/campaignTemplateGateway.ts`、`campaignTemplateGateway.test.ts` | 新增 | 正式環境範本讀寫與圖片複製 |
| `src/services/demoTemplateStore.ts`、`demoTemplateStore.test.ts` | 新增 | 本機示範範本（localStorage） |
| `src/components/organizer/campaignNotices.ts` | 新增 | 建立新團後的提示暫存 |
| `src/components/organizer/SaveTemplateDialog.tsx`、`WorkspaceRail.tsx`、`CampaignWorkspace.tsx` | 新增／修改 | 存成範本 |
| `src/components/organizer/TemplateSettings.tsx`、`OrganizerSettings.tsx` | 新增／修改 | 設定頁範本管理 |
| `src/components/organizer/CreateCampaignDialog.tsx`、`OrganizerShell.tsx` | 修改 | 從範本建立 |
| `src/components/organizer/templates.test.tsx`、`organizer.css` | 新增／修改 | 畫面測試與樣式 |
| `src/LocalLiveApps.tsx`、`src/LocalLiveApps.test.tsx`、`src/RuntimeApp.tsx`、`src/RuntimeApp.test.tsx` | 修改 | 組裝 |
| `README.md`、`docs/AI_AGENT_HANDOFF.md` | 修改 | 說明與驗證指令 |

---

### Task 0: 改版前基準截圖

- [ ] **Step 1:** 確認 `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/` 回 `200`。若不是，背景執行 `npm run dev -- --port 5173 --strictPort`。
- [ ] **Step 2:** `node scripts/capture-pages.mjs .superpowers/qa/templates/before`。Expected：24 張＋`report.json`。截圖不 commit。

---

### Task 1: 資料庫 migration 與驗證腳本

**Files:**
- Create: `supabase/migrations/20260925010000_campaign_templates.sql`
- Create: `scripts/verify_campaign_templates.py`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces（Task 3 使用）：
  - 資料表 `public.campaign_template(id uuid, name text, content jsonb, updated_by uuid, created_at timestamptz, updated_at timestamptz)`；
  - 名稱唯一索引違反時 PostgREST 錯誤 `code` 為 `'23505'`；
  - 範本圖片可上傳到 `campaign-images/templates/<範本 id>/…`，前提是呼叫者是團主且範本存在。

**本機環境：**需要 Docker 與本機 Supabase。
- 先執行 `npx supabase status`。若沒有啟動，執行 `npx supabase start`。
- 若 Docker 不可用，回報 BLOCKED，不要跳過驗證。

- [ ] **Step 1: 寫驗證腳本（先失敗）** `scripts/verify_campaign_templates.py`：

```python
"""Verify campaign template table, RLS and template image Storage policies against local Supabase."""
from __future__ import annotations

import atexit
import base64
import json
import os
import urllib.error
import urllib.request

API_URL = os.environ["API_URL"]
ANON_KEY = os.environ["ANON_KEY"]
SECRET_KEY = os.environ["SECRET_KEY"]

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


def request(method: str, path: str, key: str | None = None, *,
            token: str | None = None, body: bytes | None = None,
            content_type: str = "application/json",
            prefer: str | None = None) -> tuple[int, bytes]:
    headers = {"Content-Type": content_type}
    if key:
        headers["apikey"] = key
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(f"{API_URL}{path}", data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def signup() -> tuple[str, str]:
    status, raw = request("POST", "/auth/v1/signup", ANON_KEY, body=b"{}")
    payload = json.loads(raw)
    assert status in (200, 201), (status, payload)
    return payload["user"]["id"], payload["access_token"]


def content(title: str = "範本驗證團", **overrides: object) -> dict:
    value: dict = {
        "title": title,
        "announcement": "公告",
        "images": [],
        "items": [{"code": "ITEM1", "name": "牛奶", "unitPrice": 45, "active": True}],
        "unitPrice": 45,
        "threshold": 10,
        "thresholdKind": "quantity",
        "amountThreshold": None,
        "quantityUnit": "個",
        "baseDiscountRate": 1,
        "mixMatchDiscount": None,
        "allowCustomItems": False,
    }
    value.update(overrides)
    return value


def insert_template(token: str, name: str, body: dict) -> tuple[int, object]:
    status, raw = request(
        "POST", "/rest/v1/campaign_template", ANON_KEY, token=token,
        body=json.dumps({"name": name, "content": body}).encode(),
        prefer="return=representation",
    )
    return status, json.loads(raw) if raw else None


def main() -> None:
    admin_id, admin_token = signup()
    resident_id, resident_token = signup()
    status, raw = request(
        "POST", "/rest/v1/admin_users", SECRET_KEY,
        body=json.dumps({"user_id": admin_id}).encode(),
    )
    assert status in (200, 201), (status, raw)

    created_ids: list[str] = []
    uploaded: list[str] = []

    def cleanup() -> None:
        if uploaded:
            request("DELETE", "/storage/v1/object/campaign-images", ANON_KEY, token=admin_token,
                    body=json.dumps({"prefixes": uploaded}).encode())
        for template_id in created_ids:
            request("DELETE", f"/rest/v1/campaign_template?id=eq.{template_id}", SECRET_KEY)
        request("DELETE", f"/rest/v1/admin_users?user_id=eq.{admin_id}", SECRET_KEY)
        request("DELETE", f"/auth/v1/admin/users/{admin_id}", SECRET_KEY)
        request("DELETE", f"/auth/v1/admin/users/{resident_id}", SECRET_KEY)

    atexit.register(cleanup)

    status, rows = insert_template(admin_token, "驗證範本", content())
    admin_can_create = status == 201 and isinstance(rows, list) and rows[0]["name"] == "驗證範本"
    assert admin_can_create, (status, rows)
    template_id = rows[0]["id"]
    created_ids.append(template_id)

    status, raw = request("GET", "/rest/v1/campaign_template?select=id,name", ANON_KEY, token=admin_token)
    admin_can_read = status == 200 and any(row["id"] == template_id for row in json.loads(raw))
    assert admin_can_read, (status, raw)

    status, raw = request("GET", "/rest/v1/campaign_template?select=id", ANON_KEY, token=resident_token)
    resident_cannot_read = status == 200 and json.loads(raw) == []
    assert resident_cannot_read, (status, raw)

    status, raw = request("GET", "/rest/v1/campaign_template?select=id", ANON_KEY)
    anon_cannot_read = status in (401, 403) or (status == 200 and json.loads(raw) == [])
    assert anon_cannot_read, (status, raw)

    status, _ = insert_template(resident_token, "住戶範本", content())
    resident_cannot_create = status in (401, 403)
    assert resident_cannot_create, status

    status, raw = insert_template(admin_token, "  驗證範本  ".upper(), content())
    status_lower, raw_lower = insert_template(admin_token, " 驗證範本 ", content())
    duplicate_name_rejected = status_lower == 409 and '23505' in json.dumps(raw_lower)
    if status == 201 and isinstance(raw, list):
        created_ids.append(raw[0]["id"])
    assert duplicate_name_rejected, (status_lower, raw_lower)

    bad_contents = {
        "blank_item_name": content(items=[{"code": "ITEM1", "name": " ", "unitPrice": 45, "active": True}]),
        "too_many_images": content(images=[{"src": f"/{index}.png", "alt": "圖"} for index in range(11)]),
        "announcement_too_long": content(announcement="字" * 20001),
        "missing_title": {key: value for key, value in content().items() if key != "title"},
    }
    bad_content_rejected = {}
    for label, body in bad_contents.items():
        status, raw = insert_template(admin_token, f"壞內容-{label}", body)
        bad_content_rejected[label] = status == 400 and '23514' in json.dumps(raw)
        if status == 201 and isinstance(raw, list):
            created_ids.append(raw[0]["id"])
    assert all(bad_content_rejected.values()), bad_content_rejected

    status, raw = request(
        "PATCH", f"/rest/v1/campaign_template?id=eq.{template_id}", ANON_KEY, token=admin_token,
        body=json.dumps({"name": "改名後範本"}).encode(), prefer="return=representation",
    )
    admin_can_rename = status == 200 and json.loads(raw)[0]["name"] == "改名後範本"
    assert admin_can_rename, (status, raw)

    missing_template_path = "templates/00000000-0000-4000-8000-000000000000/missing.png"
    status, _ = request("POST", f"/storage/v1/object/campaign-images/{missing_template_path}",
                        ANON_KEY, token=admin_token, body=PNG, content_type="image/png")
    upload_blocked_without_template = status in (400, 401, 403)
    assert upload_blocked_without_template, status

    template_path = f"templates/{template_id}/{admin_id}.png"
    status, _ = request("POST", f"/storage/v1/object/campaign-images/{template_path}",
                        ANON_KEY, token=resident_token, body=PNG, content_type="image/png")
    resident_cannot_upload = status in (400, 401, 403)
    assert resident_cannot_upload, status

    status, raw = request("POST", f"/storage/v1/object/campaign-images/{template_path}",
                          ANON_KEY, token=admin_token, body=PNG, content_type="image/png")
    admin_can_upload = status == 200
    assert admin_can_upload, (status, raw)
    uploaded.append(template_path)

    copy_path = f"templates/{template_id}/{admin_id}-copy.png"
    status, raw = request("POST", "/storage/v1/object/copy", ANON_KEY, token=admin_token,
                          body=json.dumps({"bucketId": "campaign-images", "sourceKey": template_path,
                                           "destinationKey": copy_path}).encode())
    admin_can_copy = status == 200
    assert admin_can_copy, (status, raw)
    uploaded.append(copy_path)

    status, raw = request("DELETE", f"/rest/v1/campaign_template?id=eq.{template_id}", ANON_KEY,
                          token=admin_token, prefer="return=representation")
    admin_can_delete = status == 200 and len(json.loads(raw)) == 1
    assert admin_can_delete, (status, raw)
    created_ids.remove(template_id)

    status, raw = request("DELETE", "/storage/v1/object/campaign-images", ANON_KEY, token=admin_token,
                          body=json.dumps({"prefixes": [template_path, copy_path]}).encode())
    images_removed_after_delete = status in (200, 204)
    assert images_removed_after_delete, (status, raw)
    uploaded.clear()

    print(json.dumps({
        "checks": 13,
        "admin_can_create": admin_can_create,
        "admin_can_read": admin_can_read,
        "resident_cannot_read": resident_cannot_read,
        "anon_cannot_read": anon_cannot_read,
        "resident_cannot_create": resident_cannot_create,
        "duplicate_name_rejected": duplicate_name_rejected,
        "bad_content_rejected": bad_content_rejected,
        "admin_can_rename": admin_can_rename,
        "upload_blocked_without_template": upload_blocked_without_template,
        "resident_cannot_upload": resident_cannot_upload,
        "admin_can_upload": admin_can_upload,
        "admin_can_copy": admin_can_copy,
        "admin_can_delete_and_clean_images": admin_can_delete and images_removed_after_delete,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 確認失敗**

```bash
set -a
eval "$(npx supabase status -o env)"
set +a
python scripts/verify_campaign_templates.py
```

Expected: 失敗於 `admin_can_create`（資料表不存在，PostgREST 回 404）。

- [ ] **Step 3: 寫 migration** `supabase/migrations/20260925010000_campaign_templates.sql`：

```sql
-- Organizer-only campaign templates: a JSON snapshot of reusable campaign content,
-- with images copied under templates/<template id>/ in the campaign-images bucket.

create or replace function public.valid_campaign_template_content(p_content jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    return false;
  end if;
  if coalesce(jsonb_typeof(p_content -> 'title'), '') <> 'string'
     or length(btrim(p_content ->> 'title')) not between 1 and 200 then
    return false;
  end if;
  if coalesce(jsonb_typeof(p_content -> 'announcement'), '') <> 'string'
     or length(p_content ->> 'announcement') > 20000 then
    return false;
  end if;
  return public.valid_campaign_images(p_content -> 'images')
    and public.valid_campaign_items(p_content -> 'items');
end;
$$;

revoke all on function public.valid_campaign_template_content(jsonb) from public, anon;
grant execute on function public.valid_campaign_template_content(jsonb) to authenticated, service_role;

create table if not exists public.campaign_template (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  content jsonb not null check (public.valid_campaign_template_content(content)),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists campaign_template_name_key
on public.campaign_template (lower(btrim(name)));

drop trigger if exists campaign_template_set_updated_at on public.campaign_template;
create trigger campaign_template_set_updated_at
before update on public.campaign_template
for each row execute function public.set_updated_at();

alter table public.campaign_template enable row level security;

drop policy if exists campaign_template_admin_all on public.campaign_template;
create policy campaign_template_admin_all on public.campaign_template
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on table public.campaign_template from anon, authenticated;
grant select, insert, update, delete on table public.campaign_template to authenticated;
grant all on table public.campaign_template to service_role;

-- Template images may only be written while the template row exists, mirroring campaign_image_path_is_live.
create or replace function public.template_image_path_is_live(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin()
    and split_part(p_name, '/', 1) = 'templates'
    and exists (
      select 1
      from public.campaign_template t
      where t.id = case
        when split_part(p_name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then split_part(p_name, '/', 2)::uuid
        else null
      end
    );
$$;

revoke all on function public.template_image_path_is_live(text) from public, anon;
grant execute on function public.template_image_path_is_live(text) to authenticated, service_role;

drop policy if exists campaign_template_images_admin_insert on storage.objects;
create policy campaign_template_images_admin_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'campaign-images'
  and public.template_image_path_is_live(name)
);

drop policy if exists campaign_template_images_admin_update on storage.objects;
create policy campaign_template_images_admin_update
on storage.objects for update to authenticated
using (
  bucket_id = 'campaign-images'
  and public.template_image_path_is_live(name)
)
with check (
  bucket_id = 'campaign-images'
  and public.template_image_path_is_live(name)
);
```

- [ ] **Step 4: 套用並確認通過**

```bash
npx supabase db reset
set -a
eval "$(npx supabase status -o env)"
set +a
python scripts/verify_campaign_templates.py
python scripts/verify_storage.py
python scripts/verify_campaign_management.py
```

Expected：
- 新腳本印出 13 項全部 `true`；
- 既有兩支腳本照舊通過，證明現有圖片與團購管理不受影響。

**若 `admin_can_copy` 失敗：**本機 Storage 的 copy 需要不同權限。這時：
- 在回報中記錄錯誤內容；
- 改在 migration 加一條 `for select` policy：`bucket_id = 'campaign-images' and public.template_image_path_is_live(name)`；
- 重跑，並寫進回報；
- 不可放寬既有團購圖片的 policy。

- [ ] **Step 5: 更新型別**

```bash
npx supabase gen types typescript --local > src/types/database.ts
git diff --stat src/types/database.ts
```

- 若 diff 只多了 `campaign_template` 表與兩個新函式，就保留。
- 若還改動了其他表，代表原檔已過時。此時：
  - 執行 `git checkout src/types/database.ts`；
  - 改成手動在 `Tables` 內 `campaign_draft` 之前加入下面的定義；
  - 並寫進回報。

```ts
      campaign_template: {
        Row: {
          content: Json
          created_at: string
          id: string
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content: Json
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
```

- [ ] **Step 6:** `npx tsc -b`、`npm test` → 全部通過。
- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260925010000_campaign_templates.sql scripts/verify_campaign_templates.py src/types/database.ts
git commit -m "feat: add organizer-only campaign templates with template image storage"
```

---

### Task 2: 範本純函式

**Files:**
- Create: `src/domain/campaignTemplate.ts`、`src/domain/campaignTemplate.test.ts`

**Interfaces:**
- Consumes：
  - `CampaignContent`、`CampaignImage`、`CampaignItem`、`CampaignMixMatchDiscount`（`src/services/demoCampaignStore.ts`）；
  - `normalizeQuantityUnit`、`QuantityUnit`（`src/domain/quantityUnit.ts`）。
- Produces（Task 3～7 使用）：

```ts
export const TEMPLATE_NAME_MAX = 100
export const DEFAULT_ARRIVAL_LABEL = '貨到通知'
export type CampaignTemplateContent = {
  title: string
  announcement: string
  images: CampaignImage[]
  items: CampaignItem[]
  unitPrice: number
  threshold: number
  thresholdKind: 'quantity' | 'amount'
  amountThreshold: number | null
  quantityUnit: QuantityUnit
  baseDiscountRate: number
  mixMatchDiscount: CampaignMixMatchDiscount | null
  allowCustomItems: boolean
  arrivalLabel?: string
}
export type CampaignTemplate = { id: string; name: string; content: CampaignTemplateContent; updatedAt: string }
export type CreateFromTemplateResult = { id: string; missingImages: number; contentError: string | null }
export function duplicateTemplateNameMessage(name: string): string
export function templateNameError(name: string, existing: CampaignTemplate[], exceptId?: string): string | null
export function templateContentFromCampaign(content: CampaignContent): CampaignTemplateContent
export function campaignContentFromTemplate(template: CampaignTemplateContent, title: string): CampaignContent
export function imagePathFromPublicUrl(src: string, publicPrefix: string): string | null
export function parseTemplateContent(value: unknown): CampaignTemplateContent
```

- [ ] **Step 1: 寫失敗測試** `src/domain/campaignTemplate.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import type { CampaignContent } from '../services/demoCampaignStore'
import {
  campaignContentFromTemplate,
  duplicateTemplateNameMessage,
  imagePathFromPublicUrl,
  parseTemplateContent,
  templateContentFromCampaign,
  templateNameError,
  type CampaignTemplate,
} from './campaignTemplate'

const campaign: CampaignContent = {
  title: '一涼冰餅',
  unitPrice: 45,
  threshold: 100,
  thresholdKind: 'quantity',
  amountThreshold: null,
  quantityUnit: '盒',
  allowCustomItems: true,
  baseDiscountRate: 0.9,
  mixMatchDiscount: { name: '任選三件85折', minimumQuantity: 3, rate: 0.85 },
  arrivalLabel: '10月中',
  autoCloseAt: '2026-10-15T04:00:00.000Z',
  announcement: '公告',
  images: [{ src: 'https://example.supabase.co/storage/v1/object/public/campaign-images/c1/a.png', alt: '冰餅' }],
  items: [
    { code: 'ITEM1', name: '牛奶', unitPrice: 45, active: true, discountEligible: true },
    { code: 'ITEM2', name: '花生', active: true },
    { code: 'OLD', name: '舊口味', unitPrice: 40, active: false },
  ],
  openedAt: '2026-09-20T00:00:00.000Z',
}

describe('templateContentFromCampaign', () => {
  it('keeps the reusable content and drops schedule, opening and inactive items', () => {
    expect(templateContentFromCampaign(campaign)).toEqual({
      title: '一涼冰餅',
      announcement: '公告',
      images: campaign.images,
      items: [
        { code: 'ITEM1', name: '牛奶', unitPrice: 45, active: true, discountEligible: true },
        { code: 'ITEM2', name: '花生', unitPrice: 45, active: true, discountEligible: false },
      ],
      unitPrice: 45,
      threshold: 100,
      thresholdKind: 'quantity',
      amountThreshold: null,
      quantityUnit: '盒',
      baseDiscountRate: 0.9,
      mixMatchDiscount: { name: '任選三件85折', minimumQuantity: 3, rate: 0.85 },
      allowCustomItems: true,
    })
  })

  it('keeps the arrival only when it is the arrival notice', () => {
    expect(templateContentFromCampaign({ ...campaign, arrivalLabel: '貨到通知' }).arrivalLabel).toBe('貨到通知')
    expect(templateContentFromCampaign({ ...campaign, arrivalLabel: undefined })).not.toHaveProperty('arrivalLabel')
  })

  it('fills defaults for older content without the newer settings', () => {
    const legacy: CampaignContent = {
      title: '舊團', unitPrice: 30, threshold: 5, announcement: '', images: [], openedAt: null,
      items: [{ code: 'A', name: '原味', unitPrice: 30, active: true }],
    }
    expect(templateContentFromCampaign(legacy)).toMatchObject({
      thresholdKind: 'quantity', amountThreshold: null, quantityUnit: '個', baseDiscountRate: 1, mixMatchDiscount: null, allowCustomItems: false,
    })
  })
})

describe('campaignContentFromTemplate', () => {
  it('starts a new unopened draft with the given title, no closing date and the arrival notice', () => {
    const template = templateContentFromCampaign(campaign)
    const content = campaignContentFromTemplate(template, '十月冰餅團')
    expect(content).toMatchObject({
      title: '十月冰餅團',
      autoCloseAt: null,
      openedAt: null,
      arrivalLabel: '貨到通知',
      items: template.items,
      images: template.images,
      mixMatchDiscount: template.mixMatchDiscount,
    })
  })
})

describe('templateNameError', () => {
  const existing: CampaignTemplate[] = [{ id: 't1', name: 'Ice 冰餅', content: templateContentFromCampaign(campaign), updatedAt: '2026-09-25T00:00:00.000Z' }]

  it('requires a name of at most 100 characters', () => {
    expect(templateNameError('  ', existing)).toBe('範本名稱不能空白')
    expect(templateNameError('字'.repeat(101), existing)).toBe('範本名稱最多 100 字')
    expect(templateNameError('新範本', existing)).toBeNull()
  })

  it('rejects the same name regardless of case and surrounding spaces, except for the template itself', () => {
    expect(templateNameError('  ice 冰餅 ', existing)).toBe(duplicateTemplateNameMessage('ice 冰餅'))
    expect(duplicateTemplateNameMessage('ice 冰餅')).toBe('已經有叫「ice 冰餅」的範本，請改名，或選擇取代既有範本')
    expect(templateNameError('ICE 冰餅', existing, 't1')).toBeNull()
  })
})

describe('imagePathFromPublicUrl', () => {
  const prefix = 'https://example.supabase.co/storage/v1/object/public/campaign-images/'

  it('extracts the storage path of our own images and ignores other addresses', () => {
    expect(imagePathFromPublicUrl(`${prefix}c1/a.png`, prefix)).toBe('c1/a.png')
    expect(imagePathFromPublicUrl(`${prefix}templates/t1/%E5%9C%96.png?v=1`, prefix)).toBe('templates/t1/圖.png')
    expect(imagePathFromPublicUrl('/remote.svg', prefix)).toBeNull()
    expect(imagePathFromPublicUrl('https://other.example.com/a.png', prefix)).toBeNull()
  })
})

describe('parseTemplateContent', () => {
  it('accepts stored content and rejects malformed data', () => {
    const stored = templateContentFromCampaign(campaign)
    expect(parseTemplateContent(JSON.parse(JSON.stringify(stored)))).toEqual(stored)
    expect(() => parseTemplateContent(null)).toThrow('範本內容格式錯誤')
    expect(() => parseTemplateContent({ ...stored, items: 'x' })).toThrow('範本內容格式錯誤')
    expect(() => parseTemplateContent({ ...stored, title: 1 })).toThrow('範本內容格式錯誤')
  })
})
```

- [ ] **Step 2:** `npx vitest run src/domain/campaignTemplate.test.ts` → FAIL（模組不存在）。

- [ ] **Step 3: 實作** `src/domain/campaignTemplate.ts`：

```ts
import type { CampaignContent, CampaignImage, CampaignItem, CampaignMixMatchDiscount } from '../services/demoCampaignStore'
import { normalizeQuantityUnit, type QuantityUnit } from './quantityUnit'

export const TEMPLATE_NAME_MAX = 100
export const DEFAULT_ARRIVAL_LABEL = '貨到通知'

export type CampaignTemplateContent = {
  title: string
  announcement: string
  images: CampaignImage[]
  items: CampaignItem[]
  unitPrice: number
  threshold: number
  thresholdKind: 'quantity' | 'amount'
  amountThreshold: number | null
  quantityUnit: QuantityUnit
  baseDiscountRate: number
  mixMatchDiscount: CampaignMixMatchDiscount | null
  allowCustomItems: boolean
  arrivalLabel?: string
}

export type CampaignTemplate = { id: string; name: string; content: CampaignTemplateContent; updatedAt: string }

export type CreateFromTemplateResult = { id: string; missingImages: number; contentError: string | null }

const nameKey = (name: string) => name.trim().toLowerCase()

export function duplicateTemplateNameMessage(name: string): string {
  return `已經有叫「${name.trim()}」的範本，請改名，或選擇取代既有範本`
}

export function templateNameError(name: string, existing: CampaignTemplate[], exceptId?: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return '範本名稱不能空白'
  if (trimmed.length > TEMPLATE_NAME_MAX) return `範本名稱最多 ${TEMPLATE_NAME_MAX} 字`
  const taken = existing.some((template) => template.id !== exceptId && nameKey(template.name) === nameKey(trimmed))
  return taken ? duplicateTemplateNameMessage(trimmed) : null
}

// Only what is worth reusing: schedule dates, the opening time and retired items belong to the old campaign.
export function templateContentFromCampaign(content: CampaignContent): CampaignTemplateContent {
  const template: CampaignTemplateContent = {
    title: content.title,
    announcement: content.announcement,
    images: content.images.map((image) => ({ ...image })),
    items: content.items
      .filter((item) => item.active)
      .map((item) => ({
        code: item.code,
        name: item.name,
        unitPrice: item.unitPrice ?? content.unitPrice,
        active: true,
        discountEligible: item.discountEligible ?? false,
      })),
    unitPrice: content.unitPrice,
    threshold: content.threshold,
    thresholdKind: content.thresholdKind === 'amount' ? 'amount' : 'quantity',
    amountThreshold: content.thresholdKind === 'amount' ? content.amountThreshold ?? null : null,
    quantityUnit: normalizeQuantityUnit(content.quantityUnit),
    baseDiscountRate: content.baseDiscountRate ?? 1,
    mixMatchDiscount: content.mixMatchDiscount ? { ...content.mixMatchDiscount } : null,
    allowCustomItems: content.allowCustomItems ?? false,
  }
  if (content.arrivalLabel === DEFAULT_ARRIVAL_LABEL) template.arrivalLabel = DEFAULT_ARRIVAL_LABEL
  return template
}

export function campaignContentFromTemplate(template: CampaignTemplateContent, title: string): CampaignContent {
  return {
    title,
    unitPrice: template.unitPrice,
    threshold: template.threshold,
    thresholdKind: template.thresholdKind,
    amountThreshold: template.amountThreshold,
    quantityUnit: template.quantityUnit,
    allowCustomItems: template.allowCustomItems,
    baseDiscountRate: template.baseDiscountRate,
    mixMatchDiscount: template.mixMatchDiscount ? { ...template.mixMatchDiscount } : null,
    arrivalLabel: DEFAULT_ARRIVAL_LABEL,
    autoCloseAt: null,
    announcement: template.announcement,
    images: template.images.map((image) => ({ ...image })),
    items: template.items.map((item) => ({ ...item })),
    openedAt: null,
  }
}

export function imagePathFromPublicUrl(src: string, publicPrefix: string): string | null {
  if (!publicPrefix || !src.startsWith(publicPrefix)) return null
  const path = src.slice(publicPrefix.length).split('?')[0]
  if (!path) return null
  try {
    return decodeURIComponent(path)
  } catch {
    return null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export function parseTemplateContent(value: unknown): CampaignTemplateContent {
  const valid = isRecord(value)
    && typeof value.title === 'string'
    && typeof value.announcement === 'string'
    && Array.isArray(value.images)
    && value.images.every((image) => isRecord(image) && typeof image.src === 'string' && typeof image.alt === 'string')
    && Array.isArray(value.items)
    && value.items.every((item) => isRecord(item) && typeof item.code === 'string' && typeof item.name === 'string'
      && typeof item.unitPrice === 'number' && typeof item.active === 'boolean')
    && typeof value.unitPrice === 'number'
    && typeof value.threshold === 'number'
  if (!valid) throw new Error('範本內容格式錯誤')
  const record = value as Record<string, unknown>
  const mixMatch = record.mixMatchDiscount
  return {
    title: record.title as string,
    announcement: record.announcement as string,
    images: (record.images as CampaignImage[]).map((image) => ({ src: image.src, alt: image.alt })),
    items: (record.items as CampaignItem[]).map((item) => ({
      code: item.code,
      name: item.name,
      unitPrice: item.unitPrice,
      active: item.active,
      discountEligible: item.discountEligible ?? false,
    })),
    unitPrice: record.unitPrice as number,
    threshold: record.threshold as number,
    thresholdKind: record.thresholdKind === 'amount' ? 'amount' : 'quantity',
    amountThreshold: typeof record.amountThreshold === 'number' ? record.amountThreshold : null,
    quantityUnit: normalizeQuantityUnit(record.quantityUnit),
    baseDiscountRate: typeof record.baseDiscountRate === 'number' ? record.baseDiscountRate : 1,
    mixMatchDiscount: isRecord(mixMatch) && typeof mixMatch.name === 'string'
      && typeof mixMatch.minimumQuantity === 'number' && typeof mixMatch.rate === 'number'
      ? { name: mixMatch.name, minimumQuantity: mixMatch.minimumQuantity, rate: mixMatch.rate }
      : null,
    allowCustomItems: record.allowCustomItems === true,
    ...(record.arrivalLabel === DEFAULT_ARRIVAL_LABEL ? { arrivalLabel: DEFAULT_ARRIVAL_LABEL } : {}),
  }
}
```

注意：
- `normalizeQuantityUnit` 的參數型別若不是 `unknown`，在 `parseTemplateContent` 裡改成 `typeof record.quantityUnit === 'string' ? record.quantityUnit : undefined` 再傳入。
- `CampaignMixMatchDiscount` 若 `demoCampaignStore.ts` 沒有 export，就補上 `export`，並寫進回報。

- [ ] **Step 4:** `npx vitest run src/domain/campaignTemplate.test.ts` → PASS；`npm test`、`npx tsc -b`、`npm run lint` → 全部通過。
- [ ] **Step 5: Commit** `git commit -m "feat: add campaign template content rules"`（add 兩個新檔，以及若有修改的 `demoCampaignStore.ts`）。

---

### Task 3: 正式環境範本 gateway

**Files:**
- Modify: `src/services/campaignImageGateway.ts`（`createCompatibleUuid` 加上 `export`，其餘不動）
- Create: `src/services/campaignTemplateGateway.ts`、`src/services/campaignTemplateGateway.test.ts`

**Interfaces:**
- Consumes：
  - Task 1 的 `campaign_template` 表與範本圖片權限；
  - Task 2 的 `CampaignTemplate`、`CreateFromTemplateResult`、`templateContentFromCampaign`、`campaignContentFromTemplate`、`imagePathFromPublicUrl`、`parseTemplateContent`、`templateNameError`、`duplicateTemplateNameMessage`。
- Produces（Task 4、8 使用）：

```ts
export type CampaignTemplateRepository = {
  list(): Promise<CampaignTemplate[]>
  create(name: string, content: CampaignContent): Promise<CampaignTemplate>
  replace(templateId: string, content: CampaignContent): Promise<CampaignTemplate>
  rename(templateId: string, name: string): Promise<CampaignTemplate>
  delete(templateId: string): Promise<{ warning: string | null }>
  createCampaign(templateId: string, title: string): Promise<CreateFromTemplateResult>
}
export function createCampaignTemplateGateway(
  client: SupabaseClient<Database>,
  deps: { createCampaign(title: string): Promise<{ id: string }>; saveDraft(campaignId: string, content: CampaignContent): Promise<unknown> },
  createId?: () => string,
): CampaignTemplateRepository
```

- [ ] **Step 1: 寫失敗測試** `src/services/campaignTemplateGateway.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest'
import type { CampaignContent } from './demoCampaignStore'
import { createCampaignTemplateGateway } from './campaignTemplateGateway'

const BASE = 'https://example.supabase.co/storage/v1/object/public/campaign-images/'
const publicUrl = (path: string) => `${BASE}${path}`

type Row = { id: string; name: string; content: Record<string, unknown>; updated_at: string }

function fakeClient({ failCopy = (_from: string) => false, failUpdate = false } = {}) {
  const rows = new Map<string, Row>()
  const objects = new Set<string>(['campaign-1/a.png', 'campaign-1/b.png'])
  const copies: Array<[string, string]> = []
  const removed: string[] = []
  let nextId = 1
  const table = {
    select: () => ({
      order: async () => ({ data: [...rows.values()], error: null }),
      eq: (_column: string, id: string) => ({
        single: async () => rows.has(id) ? { data: rows.get(id), error: null } : { data: null, error: { message: 'not found' } },
      }),
    }),
    insert: (value: { name: string; content: Row['content'] }) => ({
      select: () => ({
        single: async () => {
          if ([...rows.values()].some((row) => row.name.trim().toLowerCase() === value.name.trim().toLowerCase())) {
            return { data: null, error: { code: '23505', message: 'duplicate key' } }
          }
          const row = { id: `00000000-0000-4000-8000-00000000000${nextId++}`, name: value.name, content: value.content, updated_at: '2026-09-25T00:00:00.000Z' }
          rows.set(row.id, row)
          return { data: row, error: null }
        },
      }),
    }),
    update: (patch: Partial<Row>) => ({
      eq: (_column: string, id: string) => ({
        select: () => ({
          single: async () => {
            if (failUpdate) return { data: null, error: { message: 'update failed' } }
            const row = { ...rows.get(id)!, ...patch, updated_at: '2026-09-25T01:00:00.000Z' }
            rows.set(id, row)
            return { data: row, error: null }
          },
        }),
      }),
    }),
    delete: () => ({
      eq: async (_column: string, id: string) => {
        rows.delete(id)
        return { error: null }
      },
    }),
  }
  const bucket = {
    getPublicUrl: (path: string) => ({ data: { publicUrl: publicUrl(path) } }),
    copy: async (from: string, to: string) => {
      copies.push([from, to])
      if (failCopy(from) || !objects.has(from)) return { data: null, error: { message: `copy failed: ${from}` } }
      objects.add(to)
      return { data: { path: to }, error: null }
    },
    remove: async (paths: string[]) => {
      removed.push(...paths)
      paths.forEach((path) => objects.delete(path))
      return { data: [], error: null }
    },
    list: async (prefix: string) => ({
      data: [...objects].filter((path) => path.startsWith(`${prefix}/`)).map((path) => ({ name: path.slice(prefix.length + 1) })),
      error: null,
    }),
  }
  const client = { from: () => table, storage: { from: () => bucket } }
  return { client: client as never, rows, objects, copies, removed }
}

const campaign: CampaignContent = {
  title: '一涼冰餅',
  unitPrice: 45,
  threshold: 100,
  arrivalLabel: '10月中',
  autoCloseAt: '2026-10-15T04:00:00.000Z',
  announcement: '公告',
  images: [
    { src: publicUrl('campaign-1/a.png'), alt: '冰餅 1' },
    { src: '/remote.svg', alt: '外部圖' },
    { src: publicUrl('campaign-1/b.png'), alt: '冰餅 2' },
  ],
  items: [{ code: 'ITEM1', name: '牛奶', unitPrice: 45, active: true }],
  openedAt: '2026-09-20T00:00:00.000Z',
}

let counter = 0
const createId = () => `id-${++counter}`
const deps = () => ({ createCampaign: vi.fn(async () => ({ id: 'campaign-9' })), saveDraft: vi.fn(async () => undefined) })

describe('campaignTemplateGateway', () => {
  it('saves a new template with its own copies of our images and keeps other addresses as they are', async () => {
    const fake = fakeClient()
    const gateway = createCampaignTemplateGateway(fake.client, deps(), createId)

    const template = await gateway.create('  一涼冰餅範本 ', campaign)

    expect(template.name).toBe('一涼冰餅範本')
    expect(fake.copies.map(([from]) => from)).toEqual(['campaign-1/a.png', 'campaign-1/b.png'])
    expect(fake.copies.every(([, to]) => to.startsWith(`templates/${template.id}/`))).toBe(true)
    expect(template.content.images.map((image) => image.alt)).toEqual(['冰餅 1', '外部圖', '冰餅 2'])
    expect(template.content.images[1].src).toBe('/remote.svg')
    expect(template.content.images[0].src).toBe(publicUrl(fake.copies[0][1]))
    expect(template.content).not.toHaveProperty('autoCloseAt')
    expect(template.content).not.toHaveProperty('arrivalLabel')
  })

  it('removes the half-saved template and its copied images when a copy fails', async () => {
    const fake = fakeClient({ failCopy: (from) => from === 'campaign-1/b.png' })
    const gateway = createCampaignTemplateGateway(fake.client, deps(), createId)

    await expect(gateway.create('一涼冰餅範本', campaign)).rejects.toThrow('存成範本失敗：copy failed: campaign-1/b.png')

    expect(fake.rows.size).toBe(0)
    expect(fake.removed).toEqual([fake.copies[0][1]])
    expect([...fake.objects].some((path) => path.startsWith('templates/'))).toBe(false)
  })

  it('rejects a duplicate name before writing anything, and maps the database duplicate error the same way', async () => {
    const fake = fakeClient()
    const gateway = createCampaignTemplateGateway(fake.client, deps(), createId)
    await gateway.create('一涼冰餅', campaign)
    const copiesBefore = fake.copies.length

    await expect(gateway.create(' 一涼冰餅 ', campaign)).rejects.toThrow('已經有叫「一涼冰餅」的範本，請改名，或選擇取代既有範本')
    expect(fake.copies.length).toBe(copiesBefore)
  })

  it('replaces a template, keeping its name and deleting only its own images that are no longer used', async () => {
    const fake = fakeClient()
    const gateway = createCampaignTemplateGateway(fake.client, deps(), createId)
    const original = await gateway.create('一涼冰餅', campaign)
    const oldPaths = fake.copies.map(([, to]) => to)

    const replaced = await gateway.replace(original.id, { ...campaign, title: '一涼冰餅（新版）', images: [campaign.images[0]] })

    expect(replaced.name).toBe('一涼冰餅')
    expect(replaced.content.title).toBe('一涼冰餅（新版）')
    expect(replaced.content.images).toHaveLength(1)
    expect(fake.removed.sort()).toEqual([...oldPaths].sort())
  })

  it('keeps the old template untouched when replacing fails', async () => {
    const fake = fakeClient()
    const gateway = createCampaignTemplateGateway(fake.client, deps(), createId)
    const original = await gateway.create('一涼冰餅', campaign)
    const before = JSON.stringify(fake.rows.get(original.id))
    const failing = createCampaignTemplateGateway(fakeClientSharing(fake, { failUpdate: true }), deps(), createId)

    await expect(failing.replace(original.id, campaign)).rejects.toThrow('取代範本失敗：update failed')

    expect(JSON.stringify(fake.rows.get(original.id))).toBe(before)
    const newCopies = fake.copies.slice(2).map(([, to]) => to)
    expect(newCopies.length).toBeGreaterThan(0)
    expect(newCopies.every((path) => !fake.objects.has(path))).toBe(true)
  })

  it('renames with the same duplicate rule and deletes a template with its images', async () => {
    const fake = fakeClient()
    const gateway = createCampaignTemplateGateway(fake.client, deps(), createId)
    const first = await gateway.create('冰餅', campaign)
    await gateway.create('包子', { ...campaign, images: [] })

    await expect(gateway.rename(first.id, ' 包子 ')).rejects.toThrow('已經有叫「包子」的範本')
    expect((await gateway.rename(first.id, '冰餅（每月）')).name).toBe('冰餅（每月）')

    expect(await gateway.delete(first.id)).toEqual({ warning: null })
    expect(fake.rows.has(first.id)).toBe(false)
    expect([...fake.objects].some((path) => path.startsWith(`templates/${first.id}/`))).toBe(false)
  })

  it('creates a draft campaign from a template, copying images into the new campaign folder', async () => {
    const fake = fakeClient()
    const campaignDeps = deps()
    const gateway = createCampaignTemplateGateway(fake.client, campaignDeps, createId)
    const template = await gateway.create('一涼冰餅', campaign)

    const result = await gateway.createCampaign(template.id, '十月冰餅團')

    expect(result).toEqual({ id: 'campaign-9', missingImages: 0, contentError: null })
    expect(campaignDeps.createCampaign).toHaveBeenCalledWith('十月冰餅團')
    const saved = campaignDeps.saveDraft.mock.calls[0]?.[1] as CampaignContent
    expect(campaignDeps.saveDraft.mock.calls[0]?.[0]).toBe('campaign-9')
    expect(saved).toMatchObject({ title: '十月冰餅團', autoCloseAt: null, openedAt: null, arrivalLabel: '貨到通知' })
    expect(saved.images.filter((image) => image.src.startsWith(BASE)).every((image) => image.src.startsWith(`${BASE}campaign-9/`))).toBe(true)
  })

  it('reports missing images and a failed content save without losing the new draft', async () => {
    const fake = fakeClient()
    const gateway = createCampaignTemplateGateway(fake.client, deps(), createId)
    const template = await gateway.create('一涼冰餅', campaign)
    const brokenPath = fake.copies[0][1]
    fake.objects.delete(brokenPath)
    const failingDeps = { createCampaign: vi.fn(async () => ({ id: 'campaign-10' })), saveDraft: vi.fn(async () => { throw new Error('儲存團購草稿失敗：network') }) }
    const failing = createCampaignTemplateGateway(fake.client, failingDeps, createId)

    const result = await failing.createCampaign(template.id, '十一月冰餅團')

    expect(result).toEqual({ id: 'campaign-10', missingImages: 1, contentError: '儲存團購草稿失敗：network' })
    const saved = failingDeps.saveDraft.mock.calls[0]?.[1] as CampaignContent
    expect(saved.images).toHaveLength(2)
  })
})

function fakeClientSharing(base: ReturnType<typeof fakeClient>, options: { failUpdate: boolean }) {
  const shared = fakeClient(options)
  const baseClient = base.client as unknown as { from: () => Record<string, unknown>; storage: unknown }
  const sharedClient = shared.client as unknown as { from: () => Record<string, unknown> }
  return {
    from: () => ({ ...baseClient.from(), update: sharedClient.from().update }),
    storage: baseClient.storage,
  } as never
}
```

`fakeClientSharing` 讓「取代失敗」測試使用同一份資料與圖片，但更新一律失敗。若 TypeScript 對這段假物件有意見，可以改寫成在 `fakeClient` 加一個可切換的 `failUpdate` 旗標（例如回傳 `setFailUpdate(true)`），測試改用它，並寫進回報。

- [ ] **Step 2:** `npx vitest run src/services/campaignTemplateGateway.test.ts` → FAIL（模組不存在）。

- [ ] **Step 3: 實作** `src/services/campaignTemplateGateway.ts`：

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  campaignContentFromTemplate,
  duplicateTemplateNameMessage,
  imagePathFromPublicUrl,
  parseTemplateContent,
  templateContentFromCampaign,
  templateNameError,
  type CampaignTemplate,
  type CreateFromTemplateResult,
} from '../domain/campaignTemplate'
import type { Database, Json } from '../types/database'
import { createCompatibleUuid } from './campaignImageGateway'
import type { CampaignContent, CampaignImage } from './demoCampaignStore'

export type CampaignTemplateRepository = {
  list(): Promise<CampaignTemplate[]>
  create(name: string, content: CampaignContent): Promise<CampaignTemplate>
  replace(templateId: string, content: CampaignContent): Promise<CampaignTemplate>
  rename(templateId: string, name: string): Promise<CampaignTemplate>
  delete(templateId: string): Promise<{ warning: string | null }>
  createCampaign(templateId: string, title: string): Promise<CreateFromTemplateResult>
}

type CampaignCreation = {
  createCampaign(title: string): Promise<{ id: string }>
  saveDraft(campaignId: string, content: CampaignContent): Promise<unknown>
}

const BUCKET = 'campaign-images'
const COLUMNS = 'id,name,content,updated_at'

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return String(error)
}

const isDuplicateName = (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505')

function toTemplate(row: unknown): CampaignTemplate {
  const value = row as { id?: unknown; name?: unknown; content?: unknown; updated_at?: unknown } | null
  if (!value || typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.updated_at !== 'string') {
    throw new Error('Supabase 回傳的範本格式錯誤')
  }
  return { id: value.id, name: value.name, content: parseTemplateContent(value.content), updatedAt: value.updated_at }
}

const extensionOf = (path: string) => {
  const name = path.slice(path.lastIndexOf('/') + 1)
  return name.includes('.') ? name.slice(name.lastIndexOf('.')) : ''
}

export function createCampaignTemplateGateway(
  client: SupabaseClient<Database>,
  campaigns: CampaignCreation,
  createId: () => string = createCompatibleUuid,
): CampaignTemplateRepository {
  const bucket = () => client.storage.from(BUCKET)
  const table = () => client.from('campaign_template')
  const publicPrefix = () => bucket().getPublicUrl('').data.publicUrl

  // Copies our own images into `folder`; addresses outside our storage are kept as they are.
  const copyImages = async (images: CampaignImage[], folder: string) => {
    const prefix = publicPrefix()
    const copied: string[] = []
    const failures: string[] = []
    const result: CampaignImage[] = []
    for (const image of images) {
      const source = imagePathFromPublicUrl(image.src, prefix)
      if (!source) {
        result.push({ ...image })
        continue
      }
      const destination = `${folder}/${createId()}${extensionOf(source)}`
      const { error } = await bucket().copy(source, destination)
      if (error) {
        failures.push(errorMessage(error))
        continue
      }
      copied.push(destination)
      result.push({ src: bucket().getPublicUrl(destination).data.publicUrl, alt: image.alt })
    }
    return { images: result, copied, failures }
  }

  const removePaths = async (paths: string[]) => {
    if (paths.length === 0) return null
    const { error } = await bucket().remove(paths)
    return error
  }

  const list = async (): Promise<CampaignTemplate[]> => {
    const { data, error } = await table().select(COLUMNS).order('updated_at', { ascending: false })
    if (error) throw new Error(`讀取範本失敗：${errorMessage(error)}`)
    return (data ?? []).map(toTemplate)
  }

  const loadOne = async (templateId: string): Promise<CampaignTemplate> => {
    const { data, error } = await table().select(COLUMNS).eq('id', templateId).single()
    if (error) throw new Error(`讀取範本失敗：${errorMessage(error)}`)
    return toTemplate(data)
  }

  const writeContent = async (templateId: string, content: unknown) => {
    const { data, error } = await table().update({ content: content as Json }).eq('id', templateId).select(COLUMNS).single()
    return { data, error }
  }

  return {
    list,

    async create(name, content) {
      const nameError = templateNameError(name, await list())
      if (nameError) throw new Error(nameError)
      const snapshot = templateContentFromCampaign(content)
      const { data, error } = await table()
        .insert({ name: name.trim(), content: { ...snapshot, images: [] } as unknown as Json })
        .select(COLUMNS)
        .single()
      if (error) throw new Error(isDuplicateName(error) ? duplicateTemplateNameMessage(name) : `存成範本失敗：${errorMessage(error)}`)
      const template = toTemplate(data)
      const copied = await copyImages(snapshot.images, `templates/${template.id}`)
      const rollback = async () => {
        await removePaths(copied.copied)
        await table().delete().eq('id', template.id)
      }
      if (copied.failures.length > 0) {
        await rollback()
        throw new Error(`存成範本失敗：${copied.failures[0]}`)
      }
      const updated = await writeContent(template.id, { ...snapshot, images: copied.images })
      if (updated.error) {
        await rollback()
        throw new Error(`存成範本失敗：${errorMessage(updated.error)}`)
      }
      return toTemplate(updated.data)
    },

    async replace(templateId, content) {
      const current = await loadOne(templateId)
      const snapshot = templateContentFromCampaign(content)
      const copied = await copyImages(snapshot.images, `templates/${templateId}`)
      if (copied.failures.length > 0) {
        await removePaths(copied.copied)
        throw new Error(`取代範本失敗：${copied.failures[0]}`)
      }
      const updated = await writeContent(templateId, { ...snapshot, images: copied.images })
      if (updated.error) {
        await removePaths(copied.copied)
        throw new Error(`取代範本失敗：${errorMessage(updated.error)}`)
      }
      // Only after the new content is stored: drop this template's images the new content no longer uses.
      const prefix = publicPrefix()
      const kept = new Set(copied.images.map((image) => imagePathFromPublicUrl(image.src, prefix)))
      const stale = current.content.images
        .map((image) => imagePathFromPublicUrl(image.src, prefix))
        .filter((path): path is string => path !== null && path.startsWith(`templates/${templateId}/`) && !kept.has(path))
      await removePaths(stale)
      return toTemplate(updated.data)
    },

    async rename(templateId, name) {
      const nameError = templateNameError(name, await list(), templateId)
      if (nameError) throw new Error(nameError)
      const { data, error } = await table().update({ name: name.trim() }).eq('id', templateId).select(COLUMNS).single()
      if (error) throw new Error(isDuplicateName(error) ? duplicateTemplateNameMessage(name) : `範本改名失敗：${errorMessage(error)}`)
      return toTemplate(data)
    },

    async delete(templateId) {
      const { error } = await table().delete().eq('id', templateId)
      if (error) throw new Error(`刪除範本失敗：${errorMessage(error)}`)
      const folder = `templates/${templateId}`
      const { data: objects, error: listError } = await bucket().list(folder, { limit: 100 })
      if (listError) return { warning: `範本已刪除，但無法列出待清理圖片：${errorMessage(listError)}` }
      const removeError = await removePaths((objects ?? []).map((object) => `${folder}/${object.name}`))
      if (removeError) return { warning: `範本已刪除，但部分圖片清理失敗：${errorMessage(removeError)}` }
      return { warning: null }
    },

    async createCampaign(templateId, title) {
      const template = await loadOne(templateId)
      const campaign = await campaigns.createCampaign(title)
      const copied = await copyImages(template.content.images, campaign.id)
      const content = campaignContentFromTemplate({ ...template.content, images: copied.images }, title)
      try {
        await campaigns.saveDraft(campaign.id, content)
        return { id: campaign.id, missingImages: copied.failures.length, contentError: null }
      } catch (saveError) {
        return { id: campaign.id, missingImages: copied.failures.length, contentError: errorMessage(saveError) }
      }
    },
  }
}
```

範本最多 10 張圖，所以 `list(folder, { limit: 100 })` 一次就能列完。

`src/services/campaignImageGateway.ts`：把 `function createCompatibleUuid(): string {` 改成 `export function createCompatibleUuid(): string {`。

- [ ] **Step 4:** `npx vitest run src/services/campaignTemplateGateway.test.ts` → PASS；`npm test`、`npx tsc -b`、`npm run lint` → 全部通過。
- [ ] **Step 5: Commit** `git commit -m "feat: add the campaign template gateway with image copies"`（add 三個檔案）。

---

### Task 4: 本機示範範本與建立後的提示暫存

**Files:**
- Create: `src/services/demoTemplateStore.ts`、`src/services/demoTemplateStore.test.ts`
- Create: `src/components/organizer/campaignNotices.ts`、`src/components/organizer/campaignNotices.test.ts`

**Interfaces:**
- Consumes：Task 2 的純函式與型別；Task 3 的 `CampaignTemplateRepository` 型別。
- Produces（Task 5～8 使用）：

```ts
// demoTemplateStore.ts
export const DEMO_TEMPLATES_KEY = 'group-buy-helper:campaign-templates'
export function createDemoTemplateRepository(options: {
  storage?: Storage | null
  createId?: () => string
  now?: () => Date
  createCampaign(content: CampaignContent): Promise<{ id: string }>
}): CampaignTemplateRepository
// campaignNotices.ts
export function rememberCampaignNotice(campaignId: string, text: string): void
export function peekCampaignNotice(campaignId: string): string | null
export function clearCampaignNotice(campaignId: string): void
export function noticeForTemplateResult(result: CreateFromTemplateResult): string | null
```

- [ ] **Step 1: 寫失敗測試**

`src/services/demoTemplateStore.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CampaignContent } from './demoCampaignStore'
import { createDemoTemplateRepository, DEMO_TEMPLATES_KEY } from './demoTemplateStore'

const content: CampaignContent = {
  title: '示範冰餅', unitPrice: 45, threshold: 100, announcement: '公告',
  images: [{ src: '/ice.png', alt: '冰餅' }],
  items: [{ code: 'ITEM1', name: '牛奶', unitPrice: 45, active: true }],
  openedAt: '2026-08-14T00:05:00.000Z', autoCloseAt: '2026-10-15T04:00:00.000Z',
}

describe('demo template repository', () => {
  beforeEach(() => localStorage.clear())

  it('saves, lists newest first, renames, replaces and deletes templates in the browser', async () => {
    let tick = 0
    const repository = createDemoTemplateRepository({
      createId: () => `t${++tick}`,
      now: () => new Date(Date.UTC(2026, 8, 25, 0, tick)),
      createCampaign: vi.fn(async () => ({ id: 'demo' })),
    })

    const first = await repository.create('冰餅', content)
    await repository.create('包子', { ...content, title: '示範包子' })
    expect((await repository.list()).map((template) => template.name)).toEqual(['包子', '冰餅'])
    await expect(repository.create(' 冰餅 ', content)).rejects.toThrow('已經有叫「冰餅」的範本')
    expect(first.content).not.toHaveProperty('autoCloseAt')

    expect((await repository.rename(first.id, '冰餅（每月）')).name).toBe('冰餅（每月）')
    expect((await repository.replace(first.id, { ...content, title: '新版冰餅' })).content.title).toBe('新版冰餅')
    expect(await repository.delete(first.id)).toEqual({ warning: null })
    expect((await repository.list()).map((template) => template.name)).toEqual(['包子'])
    expect(JSON.parse(localStorage.getItem(DEMO_TEMPLATES_KEY) ?? '[]')).toHaveLength(1)
  })

  it('creates a campaign from a template through the demo campaign store', async () => {
    const createCampaign = vi.fn(async () => ({ id: 'demo-campaign' }))
    const repository = createDemoTemplateRepository({ createCampaign })
    const template = await repository.create('冰餅', content)

    expect(await repository.createCampaign(template.id, '十月冰餅')).toEqual({ id: 'demo-campaign', missingImages: 0, contentError: null })
    expect(createCampaign).toHaveBeenCalledWith(expect.objectContaining({ title: '十月冰餅', autoCloseAt: null, openedAt: null, arrivalLabel: '貨到通知' }))
  })

  it('reports a readable error when the browser storage is unavailable', async () => {
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } } as unknown as Storage
    const repository = createDemoTemplateRepository({ storage: broken, createCampaign: vi.fn() })

    await expect(repository.list()).rejects.toThrow('無法讀取本機範本')
  })
})
```

`src/components/organizer/campaignNotices.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { clearCampaignNotice, noticeForTemplateResult, peekCampaignNotice, rememberCampaignNotice } from './campaignNotices'

describe('campaign notices', () => {
  it('keeps a notice for a campaign until it is cleared', () => {
    rememberCampaignNotice('c1', '有 1 張範本圖片沒有複製成功，請重新加入')
    expect(peekCampaignNotice('c1')).toBe('有 1 張範本圖片沒有複製成功，請重新加入')
    expect(peekCampaignNotice('c1')).toBe('有 1 張範本圖片沒有複製成功，請重新加入')
    clearCampaignNotice('c1')
    expect(peekCampaignNotice('c1')).toBeNull()
  })

  it('describes what went wrong when creating from a template', () => {
    expect(noticeForTemplateResult({ id: 'c', missingImages: 0, contentError: null })).toBeNull()
    expect(noticeForTemplateResult({ id: 'c', missingImages: 2, contentError: null })).toBe('有 2 張範本圖片沒有複製成功，請重新加入')
    expect(noticeForTemplateResult({ id: 'c', missingImages: 2, contentError: 'network' })).toBe('範本內容沒有完整帶入：network')
  })
})
```

- [ ] **Step 2:** `npx vitest run src/services/demoTemplateStore.test.ts src/components/organizer/campaignNotices.test.ts` → FAIL（模組不存在）。

- [ ] **Step 3: 實作**

`src/services/demoTemplateStore.ts`：

```ts
import {
  campaignContentFromTemplate,
  templateContentFromCampaign,
  templateNameError,
  type CampaignTemplate,
} from '../domain/campaignTemplate'
import { parseTemplateContent } from '../domain/campaignTemplate'
import { createCompatibleUuid } from './campaignImageGateway'
import type { CampaignTemplateRepository } from './campaignTemplateGateway'
import type { CampaignContent } from './demoCampaignStore'

export const DEMO_TEMPLATES_KEY = 'group-buy-helper:campaign-templates'

type DemoTemplateOptions = {
  storage?: Storage | null
  createId?: () => string
  now?: () => Date
  createCampaign(content: CampaignContent): Promise<{ id: string }>
}

const browserStorage = (): Storage | null => (typeof window === 'undefined' ? null : window.localStorage)

// The local demo has no upload service, so templates keep image addresses as they are.
export function createDemoTemplateRepository({
  storage = browserStorage(),
  createId = createCompatibleUuid,
  now = () => new Date(),
  createCampaign,
}: DemoTemplateOptions): CampaignTemplateRepository {
  const read = (): CampaignTemplate[] => {
    try {
      const raw = storage?.getItem(DEMO_TEMPLATES_KEY)
      const rows = raw ? (JSON.parse(raw) as CampaignTemplate[]) : []
      return rows.map((row) => ({ ...row, content: parseTemplateContent(row.content) }))
    } catch (error) {
      throw new Error(`無法讀取本機範本：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const write = (templates: CampaignTemplate[]) => {
    try {
      storage?.setItem(DEMO_TEMPLATES_KEY, JSON.stringify(templates))
    } catch (error) {
      throw new Error(`無法儲存本機範本：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const sorted = (templates: CampaignTemplate[]) => [...templates].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  const find = (templates: CampaignTemplate[], templateId: string) => {
    const template = templates.find((candidate) => candidate.id === templateId)
    if (!template) throw new Error('找不到這個範本')
    return template
  }

  return {
    async list() {
      return sorted(read())
    },
    async create(name, content) {
      const templates = read()
      const nameError = templateNameError(name, templates)
      if (nameError) throw new Error(nameError)
      const template: CampaignTemplate = { id: createId(), name: name.trim(), content: templateContentFromCampaign(content), updatedAt: now().toISOString() }
      write([...templates, template])
      return template
    },
    async replace(templateId, content) {
      const templates = read()
      const updated = { ...find(templates, templateId), content: templateContentFromCampaign(content), updatedAt: now().toISOString() }
      write(templates.map((template) => template.id === templateId ? updated : template))
      return updated
    },
    async rename(templateId, name) {
      const templates = read()
      const nameError = templateNameError(name, templates, templateId)
      if (nameError) throw new Error(nameError)
      const updated = { ...find(templates, templateId), name: name.trim(), updatedAt: now().toISOString() }
      write(templates.map((template) => template.id === templateId ? updated : template))
      return updated
    },
    async delete(templateId) {
      write(read().filter((template) => template.id !== templateId))
      return { warning: null }
    },
    async createCampaign(templateId, title) {
      const template = find(read(), templateId)
      const campaign = await createCampaign(campaignContentFromTemplate(template.content, title))
      return { id: campaign.id, missingImages: 0, contentError: null }
    },
  }
}
```

（兩行 `import … from '../domain/campaignTemplate'` 合併成一行也可以；lint 若要求合併就合併。）

`src/components/organizer/campaignNotices.ts`：

```ts
import type { CreateFromTemplateResult } from '../../domain/campaignTemplate'

// Carries a one-off notice from the create dialog to the new campaign's workspace within this page session.
const notices = new Map<string, string>()

export function rememberCampaignNotice(campaignId: string, text: string): void {
  notices.set(campaignId, text)
}

export function peekCampaignNotice(campaignId: string): string | null {
  return notices.get(campaignId) ?? null
}

export function clearCampaignNotice(campaignId: string): void {
  notices.delete(campaignId)
}

export function noticeForTemplateResult(result: CreateFromTemplateResult): string | null {
  if (result.contentError) return `範本內容沒有完整帶入：${result.contentError}`
  if (result.missingImages > 0) return `有 ${result.missingImages} 張範本圖片沒有複製成功，請重新加入`
  return null
}
```

- [ ] **Step 4:** 兩個測試檔 → PASS；`npm test`、`npx tsc -b`、`npm run lint` → 全部通過。
- [ ] **Step 5: Commit** `git commit -m "feat: add demo campaign templates and post-create notices"`。

---

### Task 5: 「存成範本」視窗與工作區

**Files:**
- Create: `src/components/organizer/SaveTemplateDialog.tsx`
- Create: `src/components/organizer/templates.test.tsx`（本 Task 先放存成範本相關測試；Task 6、7 在同檔加入）
- Modify: `src/components/organizer/WorkspaceRail.tsx`、`src/components/organizer/CampaignWorkspace.tsx`、`src/components/organizer/organizer.css`

**Interfaces:**
- Consumes：
  - Task 2 的 `CampaignTemplate`、`templateNameError`；
  - Task 4 的 `peekCampaignNotice`、`clearCampaignNotice`；
  - 既有 `useModalDialog`、`SegmentedControl`、`FormField`、`Button`、`FeedbackMessage`。
- Produces（Task 8 使用）：

```ts
export type SaveTemplateActions = {
  loadTemplates: () => Promise<CampaignTemplate[]>
  saveNew: (name: string) => Promise<CampaignTemplate>
  replace: (templateId: string) => Promise<CampaignTemplate>
}
// WorkspaceRail 與 CampaignWorkspace 新增選填 prop：saveTemplate?: SaveTemplateActions
```

- `CampaignWorkspace` 會在主內容上方顯示 `peekCampaignNotice(campaign.id)` 的提示（警告樣式），並在第一次顯示後清掉暫存。

- [ ] **Step 1: 寫失敗測試** `src/components/organizer/templates.test.tsx`：

```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CampaignTemplate, CampaignTemplateContent } from '../../domain/campaignTemplate'
import { CampaignWorkspace } from './CampaignWorkspace'
import { rememberCampaignNotice } from './campaignNotices'
import { OrganizerNavigationProvider } from './OrganizerLink'
import type { WorkspaceCampaign } from './WorkspaceRail'

const templateContent: CampaignTemplateContent = {
  title: '一涼冰餅', announcement: '公告', images: [],
  items: [{ code: 'ITEM1', name: '牛奶', unitPrice: 45, active: true, discountEligible: false }],
  unitPrice: 45, threshold: 100, thresholdKind: 'quantity', amountThreshold: null, quantityUnit: '個',
  baseDiscountRate: 1, mixMatchDiscount: null, allowCustomItems: false,
}
const template = (id: string, name: string): CampaignTemplate => ({ id, name, content: templateContent, updatedAt: '2026-09-24T02:00:00.000Z' })

const campaign: WorkspaceCampaign = {
  id: 'campaign-1', title: '十月冰餅團', status: 'open', published: true, coverImage: null,
  openedAt: '2026-09-20T00:00:00.000Z', orderCount: 3, residentHref: '/campaign/abc',
}

function renderWorkspace(saveTemplate?: Parameters<typeof CampaignWorkspace>[0]['saveTemplate'], target = campaign) {
  return render(
    <OrganizerNavigationProvider navigate={vi.fn()}>
      <CampaignWorkspace campaign={target} requestedSection="overview" section="overview" saveTemplate={saveTemplate}>
        <p>分區內容</p>
      </CampaignWorkspace>
    </OrganizerNavigationProvider>,
  )
}

describe('save as template', () => {
  it('saves the campaign as a new template named after it by default', async () => {
    const user = userEvent.setup()
    const saveNew = vi.fn(async (name: string) => template('t9', name))
    renderWorkspace({ loadTemplates: vi.fn(async () => []), saveNew, replace: vi.fn() })

    await user.click(screen.getByRole('button', { name: '存成範本' }))
    const dialog = screen.getByRole('dialog', { name: '存成範本' })
    expect(within(dialog).getByRole('textbox', { name: '範本名稱' })).toHaveValue('十月冰餅團')
    expect(within(dialog).getByText(/會使用這一團已儲存的內容/)).toBeInTheDocument()
    await waitFor(() => expect(within(dialog).getByRole('radio', { name: '取代既有範本' })).toBeDisabled())

    await user.click(within(dialog).getByRole('button', { name: '儲存範本' }))

    expect(saveNew).toHaveBeenCalledWith('十月冰餅團')
    expect(screen.queryByRole('dialog', { name: '存成範本' })).not.toBeInTheDocument()
    expect(screen.getByText('已存成範本「十月冰餅團」')).toBeInTheDocument()
  })

  it('stops a duplicate name before saving', async () => {
    const user = userEvent.setup()
    const saveNew = vi.fn()
    renderWorkspace({ loadTemplates: vi.fn(async () => [template('t1', '十月冰餅團')]), saveNew, replace: vi.fn() })

    await user.click(screen.getByRole('button', { name: '存成範本' }))
    const dialog = screen.getByRole('dialog', { name: '存成範本' })

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('已經有叫「十月冰餅團」的範本')
    expect(within(dialog).getByRole('button', { name: '儲存範本' })).toBeDisabled()
    expect(saveNew).not.toHaveBeenCalled()
  })

  it('replaces a chosen template', async () => {
    const user = userEvent.setup()
    const replace = vi.fn(async (id: string) => template(id, '包子'))
    renderWorkspace({ loadTemplates: vi.fn(async () => [template('t1', '冰餅'), template('t2', '包子')]), saveNew: vi.fn(), replace })

    await user.click(screen.getByRole('button', { name: '存成範本' }))
    const dialog = screen.getByRole('dialog', { name: '存成範本' })
    await user.click(await within(dialog).findByRole('radio', { name: '取代既有範本' }))
    await user.selectOptions(within(dialog).getByRole('combobox', { name: '要取代的範本' }), 't2')
    await user.click(within(dialog).getByRole('button', { name: '儲存範本' }))

    expect(replace).toHaveBeenCalledWith('t2')
    expect(screen.getByText('已存成範本「包子」')).toBeInTheDocument()
  })

  it('keeps the dialog open with the reason when saving fails', async () => {
    const user = userEvent.setup()
    renderWorkspace({ loadTemplates: vi.fn(async () => []), saveNew: vi.fn(async () => { throw new Error('存成範本失敗：copy failed') }), replace: vi.fn() })

    await user.click(screen.getByRole('button', { name: '存成範本' }))
    const dialog = screen.getByRole('dialog', { name: '存成範本' })
    await user.click(within(dialog).getByRole('button', { name: '儲存範本' }))

    expect(await within(dialog).findByText('存成範本失敗：copy failed')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '儲存範本' })).toBeEnabled()
  })

  it('offers no template button when templates are not available', () => {
    renderWorkspace(undefined)
    expect(screen.queryByRole('button', { name: '存成範本' })).not.toBeInTheDocument()
  })

  it('shows a notice left by creating the campaign from a template, once', () => {
    rememberCampaignNotice('campaign-2', '有 1 張範本圖片沒有複製成功，請重新加入')
    const target = { ...campaign, id: 'campaign-2' }
    const { unmount } = renderWorkspace(undefined, target)
    expect(screen.getByText('有 1 張範本圖片沒有複製成功，請重新加入')).toBeInTheDocument()
    unmount()

    renderWorkspace(undefined, target)
    expect(screen.queryByText('有 1 張範本圖片沒有複製成功，請重新加入')).not.toBeInTheDocument()
  })
})
```

（`CampaignWorkspace` 的既有 props 名稱以實際檔案為準；若 `requestedSection`／`section` 型別不接受 `'overview'`，改用檔案內允許的分區值，並寫進回報。）

- [ ] **Step 2:** `npx vitest run src/components/organizer/templates.test.tsx` → FAIL（沒有「存成範本」按鈕、模組不存在）。

- [ ] **Step 3: 實作** `src/components/organizer/SaveTemplateDialog.tsx`：

```tsx
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { templateNameError, type CampaignTemplate } from '../../domain/campaignTemplate'
import { Button } from '../ui/Button'
import { FeedbackMessage } from '../ui/FeedbackMessage'
import { FormField } from '../ui/FormField'
import { SegmentedControl } from '../ui/SegmentedControl'
import { useModalDialog } from '../ui/useModalDialog'

export type SaveTemplateActions = {
  loadTemplates: () => Promise<CampaignTemplate[]>
  saveNew: (name: string) => Promise<CampaignTemplate>
  replace: (templateId: string) => Promise<CampaignTemplate>
}

type SaveTemplateDialogProps = SaveTemplateActions & {
  defaultName: string
  onSaved: (template: CampaignTemplate) => void
  onClose: () => void
}

const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error)

export function SaveTemplateDialog({ defaultName, loadTemplates, saveNew, replace, onSaved, onClose }: SaveTemplateDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const loadRef = useRef(loadTemplates)
  const titleId = useId()
  const nameId = useId()
  const targetId = useId()
  const [mode, setMode] = useState<'new' | 'replace'>('new')
  const [name, setName] = useState(defaultName)
  const [templates, setTemplates] = useState<CampaignTemplate[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useModalDialog({ dialogRef, initialFocusRef: nameRef, onDismiss: onClose, busy })

  useEffect(() => {
    let active = true
    loadRef.current()
      .then((list) => {
        if (!active) return
        setTemplates(list)
        setTarget(list[0]?.id ?? '')
      })
      .catch((loadFailure: unknown) => { if (active) setLoadError(messageOf(loadFailure)) })
    return () => { active = false }
  }, [])

  const nameError = mode === 'new' && templates ? templateNameError(name, templates) : null
  const canSubmit = !busy && templates !== null && (mode === 'new' ? name.trim() !== '' && !nameError : target !== '')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError('')
    try {
      const saved = mode === 'new' ? await saveNew(name.trim()) : await replace(target)
      onSaved(saved)
      onClose()
    } catch (saveError) {
      setError(messageOf(saveError))
      setBusy(false)
    }
  }

  return (
    <div className="ui-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose()
    }}>
      <section ref={dialogRef} className="ui-dialog organizer-template-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <h2 id={titleId}>存成範本</h2>
        <form onSubmit={(event) => { void submit(event) }}>
          <div className="ui-dialog-content">
            <SegmentedControl
              label="儲存方式"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'new', label: '存成新範本' },
                { value: 'replace', label: '取代既有範本', disabled: !templates || templates.length === 0 },
              ]}
            />
            {mode === 'new' ? (
              <FormField id={nameId} label="範本名稱" required error={nameError ?? undefined}>
                <input ref={nameRef} className="ui-input" maxLength={100} value={name} onChange={(event) => setName(event.target.value)} />
              </FormField>
            ) : (
              <FormField id={targetId} label="要取代的範本" helper="範本名稱不變，內容換成這一團目前已儲存的內容。">
                <select className="ui-input" value={target} onChange={(event) => setTarget(event.target.value)}>
                  {(templates ?? []).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                </select>
              </FormField>
            )}
            <p className="organizer-muted">會使用這一團已儲存的內容；還在編輯的修改，請等內容設定顯示「已自動儲存」後再存。</p>
            {templates === null && !loadError && <p className="organizer-muted">讀取範本中…</p>}
            {loadError && <FeedbackMessage tone="error">讀取範本失敗：{loadError}</FeedbackMessage>}
            {error && <FeedbackMessage tone="error">{error}</FeedbackMessage>}
          </div>
          <div className="ui-dialog-actions">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>取消</Button>
            <Button type="submit" loading={busy} loadingLabel="儲存中…" disabled={!canSubmit}>儲存範本</Button>
          </div>
        </form>
      </section>
    </div>
  )
}
```

`WorkspaceRail.tsx`：
1. import：
   - `import { SaveTemplateDialog, type SaveTemplateActions } from './SaveTemplateDialog'`；
   - 從 `react` 已 import `useState`。
2. props 型別加 `saveTemplate?: SaveTemplateActions`，解構加 `saveTemplate`。
3. 元件開頭的 state 區加：

   ```tsx
     const [savingTemplate, setSavingTemplate] = useState(false)
     const [templateFeedback, setTemplateFeedback] = useState('')
   ```

4. 在 `{campaign.residentHref && (` 住戶連結區塊**之前**插入：

   ```tsx
         {saveTemplate && (
           <div className="organizer-rail-template">
             <Button variant="secondary" size="sm" onClick={() => { setTemplateFeedback(''); setSavingTemplate(true) }}>存成範本</Button>
             {templateFeedback && <FeedbackMessage tone="success">{templateFeedback}</FeedbackMessage>}
           </div>
         )}
         {savingTemplate && saveTemplate && (
           <SaveTemplateDialog
             {...saveTemplate}
             defaultName={campaign.title}
             onSaved={(saved) => setTemplateFeedback(`已存成範本「${saved.name}」`)}
             onClose={() => setSavingTemplate(false)}
           />
         )}
   ```

`CampaignWorkspace.tsx`：
1. import：
   - `import { useEffect, useState, type ReactNode } from 'react'`
   - `import { FeedbackMessage } from '../ui/FeedbackMessage'`
   - `import { clearCampaignNotice, peekCampaignNotice } from './campaignNotices'`
   - `import type { SaveTemplateActions } from './SaveTemplateDialog'`
2. props 型別加 `saveTemplate?: SaveTemplateActions`，解構加 `saveTemplate`，並傳給 `<WorkspaceRail … saveTemplate={saveTemplate} />`。
3. 在元件開頭加：

   ```tsx
     // StrictMode runs initializers twice, so read here and clear in an effect rather than taking in one step.
     const [notice] = useState(() => peekCampaignNotice(campaign.id))
     useEffect(() => { clearCampaignNotice(campaign.id) }, [campaign.id])
   ```

4. `<main className="organizer-workspace-main">{children}</main>` 改為：

   ```tsx
         <main className="organizer-workspace-main">
           {notice && <FeedbackMessage tone="warning" className="organizer-workspace-notice">{notice}</FeedbackMessage>}
           {children}
         </main>
   ```

`organizer.css` 檔尾加：

```css
.organizer-rail-template { display: grid; gap: var(--space-2); justify-items: start; }
.organizer-workspace-notice { margin-bottom: var(--space-4); }
.organizer-template-dialog { width: min(100% - 32px, 480px); }
```

- [ ] **Step 4:** `npx vitest run src/components/organizer` → PASS；`npm test`、`npx tsc -b`、`npm run lint` → 全部通過。
- [ ] **Step 5: Commit** `git commit -m "feat: save a campaign as a template from the workspace"`。

---

### Task 6: 設定頁「團購範本」區

**Files:**
- Create: `src/components/organizer/TemplateSettings.tsx`
- Modify: `src/components/organizer/OrganizerSettings.tsx`、`src/components/organizer/templates.test.tsx`、`organizer.css`

**Interfaces:**
- Consumes：
  - Task 2 的 `CampaignTemplate`、`templateNameError`；
  - `formatZhTwTimestamp`（`src/domain/timestamp.ts`）；
  - 既有 `ConfirmDialog`、`LoadingState`、`ErrorState`。
- Produces（Task 8 使用）：

```ts
export type TemplateSettingsActions = {
  list: () => Promise<CampaignTemplate[]>
  rename: (templateId: string, name: string) => Promise<CampaignTemplate>
  remove: (templateId: string) => Promise<{ warning: string | null }>
}
// OrganizerSettings 新增選填 prop：templateActions?: TemplateSettingsActions
```

- [ ] **Step 1: 寫失敗測試**：在 `templates.test.tsx` 檔尾新增（頂端補 `import { OrganizerSettings } from './OrganizerSettings'`）：

```tsx
describe('template settings', () => {
  const actions = (templates: CampaignTemplate[]) => ({
    list: vi.fn(async () => templates),
    rename: vi.fn(async (id: string, name: string) => ({ ...templates.find((item) => item.id === id)!, name })),
    remove: vi.fn(async () => ({ warning: null })),
  })

  it('lists templates with item counts and update times, and explains when there are none', async () => {
    const { unmount } = render(<OrganizerSettings templateActions={actions([template('t1', '冰餅')])} />)
    const section = screen.getByRole('region', { name: '團購範本' })
    const row = (await within(section).findByRole('rowheader', { name: '冰餅' })).closest('tr') as HTMLElement
    expect(within(row).getByText('1 個')).toBeInTheDocument()
    expect(within(row).getByText('2026/09/24 10:00')).toBeInTheDocument()
    unmount()

    render(<OrganizerSettings templateActions={actions([])} />)
    expect(await screen.findByText('還沒有範本。在團購工作區按「存成範本」就會出現在這裡。')).toBeInTheDocument()
  })

  it('renames a template in place and blocks a duplicate name', async () => {
    const user = userEvent.setup()
    const templateActions = actions([template('t1', '冰餅'), template('t2', '包子')])
    render(<OrganizerSettings templateActions={templateActions} />)

    await user.click(await screen.findByRole('button', { name: '改名 冰餅' }))
    const input = screen.getByRole('textbox', { name: '冰餅 的新名稱' })
    await user.clear(input)
    await user.type(input, ' 包子 {Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('已經有叫「包子」的範本')
    expect(templateActions.rename).not.toHaveBeenCalled()

    await user.clear(input)
    await user.type(input, '冰餅（每月）{Enter}')
    expect(templateActions.rename).toHaveBeenCalledWith('t1', '冰餅（每月）')
    expect(await screen.findByRole('rowheader', { name: '冰餅（每月）' })).toBeInTheDocument()
  })

  it('deletes a template after confirmation', async () => {
    const user = userEvent.setup()
    const templateActions = actions([template('t1', '冰餅')])
    render(<OrganizerSettings templateActions={templateActions} />)

    await user.click(await screen.findByRole('button', { name: '刪除 冰餅' }))
    const dialog = screen.getByRole('dialog', { name: '刪除範本' })
    expect(dialog).toHaveTextContent('刪除範本「冰餅」？已用這個範本建立的團購不受影響。')
    await user.click(within(dialog).getByRole('button', { name: '刪除範本' }))

    expect(templateActions.remove).toHaveBeenCalledWith('t1')
    expect(await screen.findByText('已刪除範本「冰餅」')).toBeInTheDocument()
    expect(screen.queryByRole('rowheader', { name: '冰餅' })).not.toBeInTheDocument()
  })

  it('offers a retry when the list cannot be read', async () => {
    const user = userEvent.setup()
    const list = vi.fn().mockRejectedValueOnce(new Error('讀取範本失敗：network')).mockResolvedValue([template('t1', '冰餅')])
    render(<OrganizerSettings templateActions={{ list, rename: vi.fn(), remove: vi.fn() }} />)

    expect(await screen.findByText('讀取範本失敗：network')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重試' }))
    expect(await screen.findByRole('rowheader', { name: '冰餅' })).toBeInTheDocument()
  })
})
```

（`2026-09-24T02:00:00.000Z` 在台灣時間是 `2026/09/24 10:00`。）

- [ ] **Step 2:** `npx vitest run src/components/organizer/templates.test.tsx` → 新測試 FAIL（沒有「團購範本」區）。

- [ ] **Step 3: 實作** `src/components/organizer/TemplateSettings.tsx`：

```tsx
import { useEffect, useRef, useState } from 'react'
import { templateNameError, type CampaignTemplate } from '../../domain/campaignTemplate'
import { formatZhTwTimestamp } from '../../domain/timestamp'
import { ErrorState, LoadingState } from '../ui/AsyncState'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { FeedbackMessage } from '../ui/FeedbackMessage'

export type TemplateSettingsActions = {
  list: () => Promise<CampaignTemplate[]>
  rename: (templateId: string, name: string) => Promise<CampaignTemplate>
  remove: (templateId: string) => Promise<{ warning: string | null }>
}

const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error)

export function TemplateSettings({ actions }: { actions: TemplateSettingsActions }) {
  const actionsRef = useRef(actions)
  actionsRef.current = actions
  const [templates, setTemplates] = useState<CampaignTemplate[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [renameError, setRenameError] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState<CampaignTemplate | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null)

  useEffect(() => {
    let active = true
    setLoadError('')
    actionsRef.current.list()
      .then((list) => { if (active) setTemplates(list) })
      .catch((error: unknown) => { if (active) setLoadError(messageOf(error)) })
    return () => { active = false }
  }, [reloadKey])

  const startRename = (template: CampaignTemplate) => {
    setEditingId(template.id)
    setDraftName(template.name)
    setRenameError('')
    setNotice(null)
  }

  const saveName = async (template: CampaignTemplate) => {
    const error = templateNameError(draftName, templates ?? [], template.id)
    if (error) {
      setRenameError(error)
      return
    }
    setRenaming(true)
    try {
      const updated = await actions.rename(template.id, draftName.trim())
      setTemplates((current) => (current ?? []).map((candidate) => candidate.id === updated.id ? updated : candidate))
      setEditingId(null)
      setNotice({ tone: 'success', text: `已改名為「${updated.name}」` })
    } catch (renameFailure) {
      setRenameError(messageOf(renameFailure))
    } finally {
      setRenaming(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    const target = deleting
    setDeleteBusy(true)
    setDeleteError('')
    try {
      const result = await actions.remove(target.id)
      setTemplates((current) => (current ?? []).filter((candidate) => candidate.id !== target.id))
      setDeleting(null)
      setNotice(result.warning ? { tone: 'warning', text: result.warning } : { tone: 'success', text: `已刪除範本「${target.name}」` })
    } catch (deleteFailure) {
      setDeleteError(messageOf(deleteFailure))
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <section className="organizer-settings-section organizer-template-settings" aria-labelledby="template-settings-heading">
      <h2 id="template-settings-heading">團購範本</h2>
      {loadError ? (
        <ErrorState title="無法讀取範本" message={loadError} actionLabel="重試" onAction={() => { setTemplates(null); setReloadKey((key) => key + 1) }} />
      ) : templates === null ? (
        <LoadingState label="讀取範本中…" variant="skeleton" rows={2} />
      ) : templates.length === 0 ? (
        <p>還沒有範本。在團購工作區按「存成範本」就會出現在這裡。</p>
      ) : (
        <div className="organizer-table-wrap">
          <table className="organizer-table" aria-label="團購範本">
            <thead>
              <tr>
                <th scope="col">名稱</th>
                <th scope="col">品項數</th>
                <th scope="col">最後更新</th>
                <th scope="col"><span className="ui-visually-hidden">操作</span></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => {
                const editing = editingId === template.id
                return (
                  <tr key={template.id}>
                    <th scope="row">
                      {editing ? (
                        <div className="organizer-template-rename">
                          <input
                            className="ui-input"
                            aria-label={`${template.name} 的新名稱`}
                            maxLength={100}
                            value={draftName}
                            readOnly={renaming}
                            autoFocus
                            onChange={(event) => { setDraftName(event.target.value); setRenameError('') }}
                            onKeyDown={(event) => {
                              if (event.nativeEvent.isComposing || renaming) return
                              if (event.key === 'Enter') { event.preventDefault(); void saveName(template) }
                              if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setEditingId(null) }
                            }}
                          />
                          {renameError && <small role="alert">{renameError}</small>}
                        </div>
                      ) : template.name}
                    </th>
                    <td data-label="品項數">{template.content.items.length} 個</td>
                    <td data-label="最後更新">{formatZhTwTimestamp(template.updatedAt)}</td>
                    <td className="organizer-template-actions">
                      {editing ? (
                        <>
                          <Button size="sm" loading={renaming} loadingLabel="儲存中…" onClick={() => { void saveName(template) }}>儲存</Button>
                          <Button size="sm" variant="utility" disabled={renaming} onClick={() => setEditingId(null)}>取消</Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="utility" aria-label={`改名 ${template.name}`} onClick={() => startRename(template)}>改名</Button>
                          <Button size="sm" variant="danger" aria-label={`刪除 ${template.name}`} onClick={() => { setDeleteError(''); setNotice(null); setDeleting(template) }}>刪除</Button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {notice && <FeedbackMessage tone={notice.tone}>{notice.text}</FeedbackMessage>}
      {deleting && (
        <ConfirmDialog
          title="刪除範本"
          confirmLabel="刪除範本"
          busy={deleteBusy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => { void confirmDelete() }}
        >
          <p>刪除範本「{deleting.name}」？已用這個範本建立的團購不受影響。</p>
          {deleteError && <FeedbackMessage tone="error">{deleteError}</FeedbackMessage>}
        </ConfirmDialog>
      )}
    </section>
  )
}
```

注意：
- 若 lint 不接受 `autoFocus`（`jsx-a11y/no-autofocus`），改在 `startRename` 之後用 `useEffect` 聚焦該輸入框，並寫進回報。
- `ConfirmDialog` 的確認鈕是否預設為危險樣式，以既有元件為準，不另外改。
- `FeedbackMessage` 的 `tone` 若沒有 `'warning'`，改成既有的警告值，並寫進回報。

`OrganizerSettings.tsx`：
1. import：`import { TemplateSettings, type TemplateSettingsActions } from './TemplateSettings'`。
2. props 型別加 `templateActions?: TemplateSettingsActions`，解構加 `templateActions`。
3. 在「通知測試中心」`<section>` **之前**插入 `{templateActions && <TemplateSettings actions={templateActions} />}`。

`organizer.css` 檔尾加：

```css
.organizer-template-rename { display: grid; gap: var(--space-1); min-width: 200px; }
.organizer-template-rename small { color: var(--color-danger); font-size: var(--font-size-caption); font-weight: var(--font-weight-regular); }
.organizer-template-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--space-2); }
```

- [ ] **Step 4:** `npx vitest run src/components/organizer` → PASS；`npm test`、`npx tsc -b`、`npm run lint` → 全部通過。
- [ ] **Step 5: Commit** `git commit -m "feat: manage campaign templates on the settings page"`。

---

### Task 7: 「＋ 建立新團」可以從範本建立

**Files:**
- Modify: `src/components/organizer/CreateCampaignDialog.tsx`、`src/components/organizer/OrganizerShell.tsx`、`src/components/organizer/templates.test.tsx`

**Interfaces:**
- Consumes：Task 2 的 `CampaignTemplate`、`CreateFromTemplateResult`；Task 4 的 `rememberCampaignNotice`、`noticeForTemplateResult`。
- Produces（Task 8 使用）：

```ts
export type CreateFromTemplateActions = {
  list: () => Promise<CampaignTemplate[]>
  create: (templateId: string, title: string) => Promise<CreateFromTemplateResult>
}
// CreateCampaignDialog 與 OrganizerShell 新增選填 prop：templates?: CreateFromTemplateActions
```

- [ ] **Step 1: 寫失敗測試**：在 `templates.test.tsx` 檔尾新增（頂端補 `import { OrganizerShell } from './OrganizerShell'` 與 `import { peekCampaignNotice } from './campaignNotices'`）：

```tsx
describe('create from a template', () => {
  function renderShell(templates?: Parameters<typeof OrganizerShell>[0]['templates']) {
    const navigate = vi.fn()
    const onCreate = vi.fn(async () => ({ id: 'blank-1' }))
    render(
      <OrganizerNavigationProvider navigate={navigate}>
        <OrganizerShell current="campaigns" onCreate={onCreate} templates={templates}><p>首頁</p></OrganizerShell>
      </OrganizerNavigationProvider>,
    )
    return { navigate, onCreate }
  }

  it('creates a draft from the chosen template with the template title prefilled', async () => {
    const user = userEvent.setup()
    const create = vi.fn(async () => ({ id: 'new-1', missingImages: 0, contentError: null }))
    const { navigate, onCreate } = renderShell({ list: vi.fn(async () => [template('t1', '冰餅')]), create })

    await user.click(screen.getByRole('button', { name: '建立新團' }))
    const dialog = screen.getByRole('dialog', { name: '建立新團' })
    await user.click(within(dialog).getByRole('radio', { name: '從範本建立' }))
    await user.selectOptions(await within(dialog).findByRole('combobox', { name: '範本' }), 't1')
    expect(within(dialog).getByRole('textbox', { name: '團購標題' })).toHaveValue('一涼冰餅')
    await user.clear(within(dialog).getByRole('textbox', { name: '團購標題' }))
    await user.type(within(dialog).getByRole('textbox', { name: '團購標題' }), '十月冰餅團')
    await user.click(within(dialog).getByRole('button', { name: '建立並編輯' }))

    expect(create).toHaveBeenCalledWith('t1', '十月冰餅團')
    expect(onCreate).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith('/admin/campaign/new-1/content')
    expect(peekCampaignNotice('new-1')).toBeNull()
  })

  it('leaves a notice for the new campaign when images or content did not come across', async () => {
    const user = userEvent.setup()
    const create = vi.fn(async () => ({ id: 'new-2', missingImages: 2, contentError: null }))
    renderShell({ list: vi.fn(async () => [template('t1', '冰餅')]), create })

    await user.click(screen.getByRole('button', { name: '建立新團' }))
    const dialog = screen.getByRole('dialog', { name: '建立新團' })
    await user.click(within(dialog).getByRole('radio', { name: '從範本建立' }))
    await within(dialog).findByRole('combobox', { name: '範本' })
    await user.click(within(dialog).getByRole('button', { name: '建立並編輯' }))

    expect(peekCampaignNotice('new-2')).toBe('有 2 張範本圖片沒有複製成功，請重新加入')
  })

  it('keeps blank creation as before and explains when there are no templates', async () => {
    const user = userEvent.setup()
    const { onCreate, navigate } = renderShell({ list: vi.fn(async () => []), create: vi.fn() })

    await user.click(screen.getByRole('button', { name: '建立新團' }))
    const dialog = screen.getByRole('dialog', { name: '建立新團' })
    expect(within(dialog).getByRole('radio', { name: '空白團購' })).toBeChecked()
    await user.click(within(dialog).getByRole('radio', { name: '從範本建立' }))
    expect(await within(dialog).findByText('還沒有範本，可以先在團購工作區按「存成範本」。')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '建立並編輯' })).toBeDisabled()

    await user.click(within(dialog).getByRole('radio', { name: '空白團購' }))
    await user.click(within(dialog).getByRole('button', { name: '建立並編輯' }))
    expect(onCreate).toHaveBeenCalledWith('未命名團購')
    expect(navigate).toHaveBeenCalledWith('/admin/campaign/blank-1/content')
  })

  it('shows no template choice when templates are not available', async () => {
    const user = userEvent.setup()
    renderShell(undefined)
    await user.click(screen.getByRole('button', { name: '建立新團' }))
    expect(screen.queryByRole('radio', { name: '從範本建立' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2:** `npx vitest run src/components/organizer/templates.test.tsx` → 新測試 FAIL。

- [ ] **Step 3: 實作**

`CreateCampaignDialog.tsx` 整檔換成：

```tsx
import { useId, useRef, useState, type FormEvent } from 'react'
import type { CampaignTemplate, CreateFromTemplateResult } from '../../domain/campaignTemplate'
import { Button } from '../ui/Button'
import { FeedbackMessage } from '../ui/FeedbackMessage'
import { FormField } from '../ui/FormField'
import { SegmentedControl } from '../ui/SegmentedControl'
import { useModalDialog } from '../ui/useModalDialog'
import { noticeForTemplateResult, rememberCampaignNotice } from './campaignNotices'
import { useOrganizerNavigate } from './organizerNavigation'

export type CreateFromTemplateActions = {
  list: () => Promise<CampaignTemplate[]>
  create: (templateId: string, title: string) => Promise<CreateFromTemplateResult>
}

type CreateCampaignDialogProps = {
  onCreate: (title: string) => Promise<{ id: string }>
  templates?: CreateFromTemplateActions
  onClose: () => void
}

const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error)

export function CreateCampaignDialog({ onCreate, templates, onClose }: CreateCampaignDialogProps) {
  const navigate = useOrganizerNavigate()
  const dialogRef = useRef<HTMLElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const inputId = useId()
  const templateFieldId = useId()
  const [title, setTitle] = useState('未命名團購')
  const [source, setSource] = useState<'blank' | 'template'>('blank')
  const [templateList, setTemplateList] = useState<CampaignTemplate[] | null>(null)
  const [templateId, setTemplateId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useModalDialog({ dialogRef, initialFocusRef: inputRef, onDismiss: onClose, busy })

  const chooseTemplate = (id: string, list: CampaignTemplate[]) => {
    setTemplateId(id)
    const chosen = list.find((candidate) => candidate.id === id)
    if (chosen) setTitle(chosen.content.title)
  }

  const switchSource = (next: 'blank' | 'template') => {
    setSource(next)
    setError('')
    if (next !== 'template' || !templates || templateList !== null) return
    templates.list()
      .then((list) => {
        setTemplateList(list)
        if (list[0]) chooseTemplate(list[0].id, list)
      })
      .catch((loadError: unknown) => setError(`讀取範本失敗：${messageOf(loadError)}`))
  }

  const usingTemplate = source === 'template'
  const canSubmit = !busy && title.trim() !== '' && (!usingTemplate || templateId !== '')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    const nextTitle = title.trim()
    setBusy(true)
    setError('')
    try {
      if (usingTemplate && templates) {
        const result = await templates.create(templateId, nextTitle)
        const notice = noticeForTemplateResult(result)
        if (notice) rememberCampaignNotice(result.id, notice)
        onClose()
        navigate(`/admin/campaign/${result.id}/content`)
        return
      }
      const campaign = await onCreate(nextTitle)
      onClose()
      navigate(`/admin/campaign/${campaign.id}/content`)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '建立團購失敗')
      setBusy(false)
    }
  }

  return (
    <div className="ui-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose()
    }}>
      <section ref={dialogRef} className="ui-dialog organizer-create-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <h2 id={titleId}>建立新團</h2>
        <form onSubmit={(event) => { void submit(event) }}>
          <div className="ui-dialog-content">
            {templates && (
              <SegmentedControl
                label="建立方式"
                value={source}
                onChange={switchSource}
                options={[{ value: 'blank', label: '空白團購' }, { value: 'template', label: '從範本建立' }]}
              />
            )}
            {usingTemplate && templateList !== null && (templateList.length === 0 ? (
              <p className="organizer-muted">還沒有範本，可以先在團購工作區按「存成範本」。</p>
            ) : (
              <FormField id={templateFieldId} label="範本" helper="結單日期與到貨時間不會帶入，請在內容設定重新設定。">
                <select className="ui-input" value={templateId} onChange={(event) => chooseTemplate(event.target.value, templateList)}>
                  {templateList.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                </select>
              </FormField>
            ))}
            {usingTemplate && templateList === null && !error && <p className="organizer-muted">讀取範本中…</p>}
            <FormField id={inputId} label="團購標題" required>
              <input ref={inputRef} className="ui-input" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
            </FormField>
            {error && <FeedbackMessage tone="error">{error}</FeedbackMessage>}
          </div>
          <div className="ui-dialog-actions">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>取消</Button>
            <Button type="submit" loading={busy} loadingLabel="建立中…" disabled={!canSubmit}>建立並編輯</Button>
          </div>
        </form>
      </section>
    </div>
  )
}
```

`OrganizerShell.tsx`：
- import `type CreateFromTemplateActions`（自 `./CreateCampaignDialog`）；
- props 型別加 `templates?: CreateFromTemplateActions`，解構加 `templates`；
- `<CreateCampaignDialog onCreate={onCreate} onClose={…} />` 加上 `templates={templates}`。

- [ ] **Step 4:** `npx vitest run src/components/organizer` → PASS（既有建立新團測試必須照舊通過）；`npm test`、`npx tsc -b`、`npm run lint` → 全部通過。
- [ ] **Step 5: Commit** `git commit -m "feat: create a campaign from a template"`。

---

### Task 8: 組裝到正式環境與本機示範

**Files:**
- Modify: `src/LocalLiveApps.tsx`、`src/LocalLiveApps.test.tsx`
- Modify: `src/RuntimeApp.tsx`、`src/RuntimeApp.test.tsx`

**Interfaces:**
- Consumes：
  - Task 3 `createCampaignTemplateGateway`、`CampaignTemplateRepository`；
  - Task 4 `createDemoTemplateRepository`；
  - Task 5 `SaveTemplateActions`；Task 6 `TemplateSettingsActions`；Task 7 `CreateFromTemplateActions`。
- Produces：`LocalLiveAdminApp` 新增選填 prop `templateRepository?: CampaignTemplateRepository`（測試用）。

- [ ] **Step 1: 寫失敗測試**

`src/LocalLiveApps.test.tsx` 新增一個 `describe('campaign templates', …)`，放在檔尾。它沿用檔案頂端的 `authClient`、`published`、`ordersRepository`、`LiveAdminRepository`：

```tsx
describe('campaign templates', () => {
  const session = { access_token: 'valid-token', user: { id: 'admin-user', is_anonymous: false } }
  const repository = (): LiveAdminRepository => ({
    loadPublished: vi.fn().mockResolvedValue(published),
    loadOptionalPublished: vi.fn().mockResolvedValue(published),
    loadOptionalDraft: vi.fn().mockResolvedValue({ ...published, title: '草稿標題' }),
    saveDraft: vi.fn(),
    publish: vi.fn(),
  })
  const templateRepository = () => ({
    list: vi.fn(async () => []),
    create: vi.fn(async (name: string) => ({ id: 't1', name, content: { ...templateContentFromCampaign(published) }, updatedAt: '2026-09-25T00:00:00.000Z' })),
    replace: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(async () => ({ warning: null })),
    createCampaign: vi.fn(async () => ({ id: 'campaign-2', missingImages: 0, contentError: null })),
  })

  it('saves the campaign’s saved draft as a template from the workspace', async () => {
    const user = userEvent.setup()
    const { client } = authClient(session)
    const templates = templateRepository()
    render(<LocalLiveAdminApp client={client} campaignId="campaign-1" repository={repository()} ordersRepository={ordersRepository()} templateRepository={templates} section="overview" />)

    await user.click(await screen.findByRole('button', { name: '存成範本' }))
    const dialog = screen.getByRole('dialog', { name: '存成範本' })
    await waitFor(() => expect(templates.list).toHaveBeenCalled())
    await user.click(within(dialog).getByRole('button', { name: '儲存範本' }))

    await waitFor(() => expect(templates.create).toHaveBeenCalledWith('草稿標題', expect.objectContaining({ title: '草稿標題' })))
  })

  it('lists templates on the settings page and creates a campaign from one', async () => {
    const user = userEvent.setup()
    const { client } = authClient(session)
    const templates = templateRepository()
    templates.list.mockResolvedValue([{ id: 't1', name: '冰餅', content: templateContentFromCampaign(published), updatedAt: '2026-09-25T00:00:00.000Z' }] as never)
    render(<LocalLiveAdminApp client={client} page="settings" repository={repository()} ordersRepository={ordersRepository()} templateRepository={templates} autoCloseNotificationSettingsRepository={settingsRepository()} />)

    expect(await screen.findByRole('rowheader', { name: '冰餅' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '建立新團' }))
    const dialog = screen.getByRole('dialog', { name: '建立新團' })
    await user.click(within(dialog).getByRole('radio', { name: '從範本建立' }))
    await within(dialog).findByRole('combobox', { name: '範本' })
    await user.click(within(dialog).getByRole('button', { name: '建立並編輯' }))

    expect(templates.createCampaign).toHaveBeenCalledWith('t1', published.title)
  })
})
```

- 頂端補上 `import { templateContentFromCampaign } from './domain/campaignTemplate'`。
- `settingsRepository` 是檔案頂端既有的假物件。
- 若設定頁在測試中還需要其他 repository 才能載入，照檔內其他設定頁測試補齊，並寫進回報。

`src/RuntimeApp.test.tsx` 在 demo 路由的 `describe` 內新增：

```tsx
  it('saves the demo campaign as a template and shows it on the settings page', async () => {
    const user = userEvent.setup()
    const config = { mode: 'demo' as const }
    const campaignId = '01234567-89ab-cdef-0123-456789abcdef'
    const { unmount } = render(<RuntimeApp config={config} pathname={`/admin/campaign/${campaignId}/overview`} />)

    await user.click(screen.getByRole('button', { name: '存成範本' }))
    const dialog = screen.getByRole('dialog', { name: '存成範本' })
    await user.clear(within(dialog).getByRole('textbox', { name: '範本名稱' }))
    await user.type(within(dialog).getByRole('textbox', { name: '範本名稱' }), '示範範本')
    await user.click(within(dialog).getByRole('button', { name: '儲存範本' }))
    expect(await screen.findByText('已存成範本「示範範本」')).toBeInTheDocument()
    unmount()

    render(<RuntimeApp config={config} pathname="/admin/settings" />)
    expect(await screen.findByRole('rowheader', { name: '示範範本' })).toBeInTheDocument()
  })
```

- 檔案若沒有 `beforeEach(() => localStorage.clear())`，在此 `describe` 加上。
- `within`、`userEvent` 若未 import 就補上。

- [ ] **Step 2:** `npx vitest run src/LocalLiveApps.test.tsx -t "campaign templates" src/RuntimeApp.test.tsx` → FAIL（沒有「存成範本」、沒有範本區）。

- [ ] **Step 3: 實作**

`src/LocalLiveApps.tsx`（`LocalLiveAdminApp`）：
1. import：
   - `import { createCampaignTemplateGateway, type CampaignTemplateRepository } from './services/campaignTemplateGateway'`
2. props 型別加 `templateRepository?: CampaignTemplateRepository`，解構加 `templateRepository`。
3. 在其他 `useMemo` gateway 之後加：

   ```tsx
     const templateGateway = useMemo(
       () => templateRepository ?? createCampaignTemplateGateway(client, {
         createCampaign: (title) => campaignManagementGateway.create(title),
         saveDraft: (campaignId, content) => gateway.saveDraft(campaignId, content),
       }),
       [campaignManagementGateway, client, gateway, templateRepository],
     )
   ```

4. 在 `const createCampaign = …` 之後加：

   ```tsx
     const createFromTemplate = {
       list: () => templateGateway.list(),
       create: (templateId: string, title: string) => templateGateway.createCampaign(templateId, title),
     }
   ```

5. 每一個 `<OrganizerShell … onCreate={createCampaign}>`（含 `inShell` 輔助函式裡那一個）都加上 `templates={createFromTemplate}`。
6. 設定頁的 `<OrganizerSettings …>` 加上：

   ```tsx
               templateActions={{
                 list: () => templateGateway.list(),
                 rename: (templateId, name) => templateGateway.rename(templateId, name),
                 remove: (templateId) => templateGateway.delete(templateId),
               }}
   ```

7. 團購工作區：在 `workspaceCampaign` 定義之後加：

   ```tsx
     // Templates are taken from what is stored, so an unsaved edit in the editor is not included.
     const loadSavedContent = async () => {
       const draft = await gateway.loadOptionalDraft(campaignId)
       if (draft) return draft
       const published = gateway.loadOptionalPublished ? await gateway.loadOptionalPublished(campaignId) : null
       return published ?? gateway.loadPublished(campaignId)
     }
   ```

   並在 `<CampaignWorkspace …>` 加上：

   ```tsx
           saveTemplate={{
             loadTemplates: () => templateGateway.list(),
             saveNew: async (name) => templateGateway.create(name, await loadSavedContent()),
             replace: async (templateId) => templateGateway.replace(templateId, await loadSavedContent()),
           }}
   ```

   （變數名 `published` 若與外層衝突，改名為 `publishedContentForTemplate`。）

`src/RuntimeApp.tsx`：
1. import：
   - `import { createDemoTemplateRepository } from './services/demoTemplateStore'`
   - `import { loadDraftCampaign, saveDraftCampaign, type CampaignContent } from './services/demoCampaignStore'`（已 import 的就合併）。
2. 在 `initialDemoOrganizerOrders` 之後加：

   ```tsx
   const demoFallbackContent: CampaignContent = {
     title: campaign.title,
     unitPrice: campaign.unitPrice,
     threshold: campaign.threshold,
     announcement: campaign.announcement,
     images: campaign.images,
     items,
     openedAt: campaign.openedAt,
   }
   // The demo has one campaign, so creating from a template rewrites its draft.
   const demoTemplates = createDemoTemplateRepository({
     createCampaign: async (content) => {
       saveDraftCampaign(content)
       return { id: DEMO_CAMPAIGN_ID }
     },
   })
   const demoCreateFromTemplate = {
     list: () => demoTemplates.list(),
     create: (templateId: string, title: string) => demoTemplates.createCampaign(templateId, title),
   }
   ```

3. `DemoOrganizerWorkspace` 的 `<CampaignWorkspace …>` 加上：

   ```tsx
         saveTemplate={{
           loadTemplates: () => demoTemplates.list(),
           saveNew: (name) => demoTemplates.create(name, loadDraftCampaign(demoFallbackContent)),
           replace: (templateId) => demoTemplates.replace(templateId, loadDraftCampaign(demoFallbackContent)),
         }}
   ```

4. 每個 `<OrganizerShell … onCreate={createDemoCampaign}>` 加 `templates={demoCreateFromTemplate}`。
5. demo 設定頁的 `<OrganizerSettings …>` 加：

   ```tsx
           templateActions={{
             list: () => demoTemplates.list(),
             rename: (templateId, name) => demoTemplates.rename(templateId, name),
             remove: (templateId) => demoTemplates.delete(templateId),
           }}
   ```

- [ ] **Step 4:** `npm test`、`npx tsc -b`、`npm run lint`、`npm run build` → 全部通過、沒有警告。既有的建立新團、刪除團購、設定頁測試必須照舊通過。
- [ ] **Step 5: Commit** `git commit -m "feat: wire campaign templates into the live and demo organizer apps"`。

---

### Task 9: 文件、截圖與完整驗證

**Files:**
- Modify: `README.md`、`docs/AI_AGENT_HANDOFF.md`、本計畫檔（檔尾執行結果）

- [ ] **Step 1: 完整驗證**

```bash
npm test
npx tsc -b
npm run lint
npm run build
set -a
eval "$(npx supabase status -o env)"
set +a
python scripts/verify_campaign_templates.py
python scripts/verify_storage.py
python scripts/verify_campaign_management.py
```

Expected：全部通過；新腳本 13 項 `true`。

- [ ] **Step 2: 截圖**

`node scripts/capture-pages.mjs .superpowers/qa/templates/after`。Expected：24 張，無水平溢出。
- `admin-settings-*` 多了「團購範本」區（示範模式沒有範本時顯示空狀態）；
- 其餘頁面除左側欄多了「存成範本」按鈕，應與 `before` 相同。

截圖不 commit。

- [ ] **Step 3: 文件**
  - `README.md` 本機驗證腳本清單（`python scripts/verify_admin_as_resident.py` 那行之後）加一行 `python scripts/verify_campaign_templates.py`；把「六支腳本共驗證 70 項」改為「七支腳本共驗證 83 項」；並在該段描述最後加上一句：「範本腳本驗證團主可建立、讀取、改名、刪除範本，住戶與未登入者讀寫不到，同名與壞內容被擋，範本不存在時不能上傳範本圖片，以及範本圖片可複製與清理。」
  - `README.md` 功能清單加一行：`- 團購範本：任一團購可存成範本（含圖片副本，舊團刪除不受影響），建立新團時可從範本帶入公告、圖片、品項、門檻與優惠；結單日期與到貨時間需重新設定`
  - `docs/AI_AGENT_HANDOFF.md` 的程式位置清單加：
    - `` - `src/domain/campaignTemplate.ts`、`src/services/campaignTemplateGateway.ts`：團購範本。範本內容是 `CampaignContent` 的子集；**團購日後新增可重用的設定時，要同時加進 `templateContentFromCampaign` 與 `campaignContentFromTemplate`**。範本圖片放在 `campaign-images/templates/<範本 id>/`，由 `template_image_path_is_live` 控制上傳。 ``
- [ ] **Step 4:** 本計畫檔尾加 `## 執行結果（YYYY-MM-DD）`：
  - commit 範圍、測試數、驗證腳本結果、截圖結果；
  - 執行中的修正、延後的小問題；
  - **部署步驟與團主確認事項：**
    1. `npx supabase db push` 套用 migration 到正式資料庫（需團主同意）；
    2. 在正式環境跑 `verify_campaign_templates.py`；
    3. push 前端；
    4. 團主實際把一團存成範本、從範本建立新團、確認圖片都在；刪除原團後範本仍可用。
- [ ] **Step 5: Commit** `git commit -m "docs: describe campaign templates and their verification"`（add `README.md`、`docs/AI_AGENT_HANDOFF.md`、本計畫檔）。

---

## 部署（不屬於任何 Task，需團主同意後由 controller 執行）

1. 確認正式 Supabase 專案（`ynezmoyjovjeeimjdizr`）目前的 migration 狀態與本機一致：`npx supabase migration list --linked`。
2. `npx supabase db push`，只套用 `20260925010000_campaign_templates.sql`。
3. 以正式環境的 URL 與金鑰跑 `scripts/verify_campaign_templates.py`（腳本會建立並清除臨時使用者與範本）。
4. `git push origin main`，確認 Vercel 部署成功。
