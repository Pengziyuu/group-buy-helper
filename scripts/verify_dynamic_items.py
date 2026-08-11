"""Verify dynamic item publication, retirement, and order timestamps locally."""
from __future__ import annotations
import json
import os
from pathlib import Path
import shutil
import subprocess
import urllib.error
import urllib.request
from urllib.parse import urlparse
from typing import Any

API_URL = os.environ["API_URL"]
ANON_KEY = os.environ["ANON_KEY"]
SECRET_KEY = os.environ["SECRET_KEY"]
CAMPAIGN_ID = "10000000-0000-4000-8000-000000000001"
CAMPAIGN_SLUG = "0123456789abcdef0123456789abcdef0123"
CUSTOMER_ID = "30000000-0000-4000-8000-000000000001"
ORDER_ID = "40000000-0000-4000-8000-000000000001"


def call(method: str, path: str, key: str, *, token: str | None = None,
         body: Any = None, prefer: str | None = None) -> tuple[int, Any]:
    headers = {"apikey": key, "Content-Type": "application/json"}
    if token: headers["Authorization"] = f"Bearer {token}"
    if prefer: headers["Prefer"] = prefer
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
    request = urllib.request.Request(f"{API_URL}{path}", data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read().decode()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw = error.read().decode()
        try: return error.code, json.loads(raw)
        except json.JSONDecodeError: return error.code, raw


def signup() -> tuple[str, str]:
    status, payload = call("POST", "/auth/v1/signup", ANON_KEY, body={})
    assert status in (200, 201), (status, payload)
    return payload["user"]["id"], payload["access_token"]


def run_checks() -> None:
    admin_id, admin_token = signup()
    resident_id, resident_token = signup()
    assert call("POST", "/rest/v1/admin_users", SECRET_KEY,
                body={"user_id": admin_id}, prefer="return=minimal")[0] in (200, 201)
    status, self_before_binding = call("POST", "/rest/v1/rpc/get_customer_self", ANON_KEY,
                                       token=resident_token, body={})
    assert status == 200 and self_before_binding == [], (status, self_before_binding)
    assert call("PATCH", f"/rest/v1/customer?id=eq.{CUSTOMER_ID}", SECRET_KEY,
                body={"auth_user_id": resident_id}, prefer="return=minimal")[0] in (200, 204)
    status, self_after_binding = call("POST", "/rest/v1/rpc/get_customer_self", ANON_KEY,
                                      token=resident_token, body={})
    assert status == 200 and len(self_after_binding) == 1 and self_after_binding[0]["id"] == CUSTOMER_ID
    assert call("POST", "/rest/v1/rpc/join_campaign_by_slug", ANON_KEY,
                token=resident_token, body={"p_slug": CAMPAIGN_SLUG})[0] == 200
    status, _ = call(
        "POST", "/rest/v1/campaign_item", ANON_KEY, token=admin_token,
        body={"campaign_id": CAMPAIGN_ID, "code": "BYPASS", "name": "不可直接新增", "sort_order": 99},
        prefer="return=minimal",
    )
    assert status in (401, 403), status
    status, _ = call(
        "PATCH", f"/rest/v1/campaign?id=eq.{CAMPAIGN_ID}", ANON_KEY,
        token=admin_token, body={"title": "不可直接發布"}, prefer="return=minimal",
    )
    assert status in (401, 403), status
    status, _ = call(
        "POST", "/rest/v1/order_item", ANON_KEY, token=resident_token,
        body={
            "order_id": ORDER_ID, "campaign_id": CAMPAIGN_ID,
            "campaign_item_id": "20000000-0000-4000-8000-000000000002", "qty": 20,
        }, prefer="return=minimal",
    )
    assert status in (401, 403), status
    status, _ = call("DELETE", f"/rest/v1/orders?id=eq.{ORDER_ID}", ANON_KEY,
                     token=resident_token, prefer="return=minimal")
    assert status in (401, 403), status

    status, rows = call("GET", f"/rest/v1/campaign?id=eq.{CAMPAIGN_ID}&select=title,unit_price,threshold,announcement,images,items,opened_at", SECRET_KEY)
    assert status == 200 and len(rows) == 1, (status, rows)
    campaign = rows[0]
    opened_at = campaign["opened_at"]

    async_fields = {
        "campaign_id": CAMPAIGN_ID,
        "title": campaign["title"], "unit_price": campaign["unit_price"],
        "threshold": campaign["threshold"], "announcement": campaign["announcement"],
        "images": campaign["images"],
    }
    with_j = [*campaign["items"], {"code": "J", "name": "期間限定", "active": True}]
    status, _ = call("POST", "/rest/v1/campaign_draft?on_conflict=campaign_id", ANON_KEY,
                     token=admin_token, body={**async_fields, "items": with_j},
                     prefer="resolution=merge-duplicates,return=minimal")
    assert status in (200, 201), status
    assert call("POST", "/rest/v1/rpc/publish_campaign_draft", ANON_KEY,
                token=admin_token, body={"p_campaign_id": CAMPAIGN_ID})[0] == 200

    retired = [item for item in campaign["items"] if item["code"] != "B"]
    status, _ = call("POST", "/rest/v1/campaign_draft?on_conflict=campaign_id", ANON_KEY,
                     token=admin_token, body={**async_fields, "items": retired},
                     prefer="resolution=merge-duplicates,return=minimal")
    assert status in (200, 201), status
    assert call("POST", "/rest/v1/rpc/publish_campaign_draft", ANON_KEY,
                token=admin_token, body={"p_campaign_id": CAMPAIGN_ID})[0] == 200

    status, item_rows = call("GET", f"/rest/v1/campaign_item?campaign_id=eq.{CAMPAIGN_ID}&select=code,active", SECRET_KEY)
    states = {row["code"]: row["active"] for row in item_rows}
    assert status == 200 and states["B"] is False and "J" not in states, (status, states)

    status, before_order = call("GET", f"/rest/v1/order_wall?order_id=eq.{ORDER_ID}&select=item_code,qty,ordered_at,order_updated_at", ANON_KEY, token=resident_token)
    assert status == 200
    first_ordered_at = before_order[0]["ordered_at"]
    first_updated_at = before_order[0]["order_updated_at"]

    status, payload = call("POST", "/rest/v1/rpc/submit_customer_order", ANON_KEY,
                           token=resident_token,
                           body={"p_campaign_id": CAMPAIGN_ID, "p_items": {"A": 1}})
    assert status == 200, (status, payload)
    status, after_order = call("GET", f"/rest/v1/order_wall?order_id=eq.{ORDER_ID}&select=item_code,qty,ordered_at,order_updated_at", ANON_KEY, token=resident_token)
    quantities = {row["item_code"]: row["qty"] for row in after_order}
    assert quantities == {"A": 1, "B": 2}, quantities
    assert all(row["ordered_at"] == first_ordered_at for row in after_order)
    assert all(row["order_updated_at"] > first_updated_at for row in after_order)
    resident_edit_time = after_order[0]["order_updated_at"]
    status, payload = call("POST", "/rest/v1/rpc/submit_customer_order", ANON_KEY,
                           token=resident_token,
                           body={"p_campaign_id": CAMPAIGN_ID, "p_items": {"A": 1}})
    assert status == 200 and payload["items"] == {"A": 1, "B": 2}, (status, payload)
    status, unchanged = call(
        "GET", f"/rest/v1/order_wall?order_id=eq.{ORDER_ID}&select=order_updated_at",
        ANON_KEY, token=resident_token,
    )
    assert status == 200 and all(row["order_updated_at"] == resident_edit_time for row in unchanged)
    status, _ = call("POST", "/rest/v1/rpc/submit_customer_order", ANON_KEY,
                     token=resident_token,
                     body={"p_campaign_id": CAMPAIGN_ID, "p_items": {"A": 0, "B": 0}})
    assert status in (400, 409, 422), status
    status, _ = call("POST", "/rest/v1/rpc/submit_customer_order", ANON_KEY,
                     token=resident_token,
                     body={"p_campaign_id": CAMPAIGN_ID, "p_items": {"b": 1}})
    assert status in (400, 409, 422), status
    status, payload = call(
        "POST", "/rest/v1/rpc/set_order_fulfillment", ANON_KEY, token=admin_token,
        body={"p_order_id": ORDER_ID, "p_paid": True, "p_pickup_status": "pending"},
    )
    assert status == 200, (status, payload)
    status, after_fulfillment = call(
        "GET", f"/rest/v1/order_wall?order_id=eq.{ORDER_ID}&select=order_updated_at",
        ANON_KEY, token=resident_token,
    )
    assert status == 200 and all(row["order_updated_at"] == resident_edit_time for row in after_fulfillment)

    status, _ = call("POST", "/rest/v1/rpc/submit_customer_order", ANON_KEY,
                     token=resident_token,
                     body={"p_campaign_id": CAMPAIGN_ID, "p_items": {"A": 1, "B": 3}})
    assert status in (400, 409, 422), status

    status, published = call("GET", f"/rest/v1/campaign_public?id=eq.{CAMPAIGN_ID}&select=items,opened_at", ANON_KEY, token=resident_token)
    assert status == 200 and published[0]["opened_at"] == opened_at
    assert next(item for item in published[0]["items"] if item["code"] == "B")["active"] is False
    status, canonical_draft = call(
        "GET", f"/rest/v1/campaign_draft?campaign_id=eq.{CAMPAIGN_ID}&select=items",
        ANON_KEY, token=admin_token,
    )
    assert status == 200 and canonical_draft[0]["items"] == published[0]["items"]

    print(json.dumps({
        "checks": 19,
        "lowercase_item_key_rejected": True,
        "empty_order_rejected": True,
        "identical_resubmit_keeps_timestamp": True,
        "canonical_draft_matches_published": True,
        "unbound_customer_self_empty": True,
        "bound_customer_self_exact": True,
        "direct_item_write_rejected": True,
        "direct_campaign_write_rejected": True,
        "direct_order_item_write_rejected": True,
        "direct_order_delete_rejected": True,
        "zero_order_item_deleted": True,
        "ordered_item_retired": True,
        "inactive_history_preserved": True,
        "inactive_increase_rejected": True,
        "ordered_at_preserved": True,
        "updated_at_advanced": True,
        "fulfillment_does_not_change_order_time": True,
        "opened_at_stable": True,
        "published_items_updated": True,
    }, ensure_ascii=False))


def find_supabase_cli() -> str:
    configured = os.environ.get("SUPABASE_CLI")
    if configured:
        return configured
    discovered = shutil.which("supabase")
    if discovered:
        return discovered
    candidates = sorted((Path.home() / "AppData/Local/npm-cache/_npx").glob(
        "*/node_modules/@supabase/cli-windows-x64/bin/supabase.exe"
    ))
    if candidates:
        return str(candidates[-1])
    raise RuntimeError("找不到 Supabase CLI，無法保證驗證資料清理")


def reset_local_database() -> None:
    subprocess.run(
        [find_supabase_cli(), "db", "reset"],
        cwd=Path(__file__).resolve().parent.parent,
        check=True,
        stdout=subprocess.DEVNULL,
    )


def main() -> None:
    if urlparse(API_URL).hostname not in {"127.0.0.1", "localhost"}:
        raise RuntimeError("此破壞性驗證只允許本機 Supabase")
    try:
        run_checks()
    finally:
        reset_local_database()


if __name__ == "__main__": main()
