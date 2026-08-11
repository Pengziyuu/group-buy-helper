"""Verify organizer-only campaign and fulfillment workflow through local Supabase APIs."""
from __future__ import annotations

import atexit
import json
import os
import urllib.error
import urllib.request
from typing import Any

API_URL = os.environ["API_URL"]
ANON_KEY = os.environ["ANON_KEY"]
SECRET_KEY = os.environ["SECRET_KEY"]
CAMPAIGN_ID = "10000000-0000-4000-8000-000000000001"
CAMPAIGN_SLUG = "0123456789abcdef0123456789abcdef0123"
ORDER_ID = "40000000-0000-4000-8000-000000000001"
CUSTOMER_ID = "30000000-0000-4000-8000-000000000001"


def call(method: str, path: str, key: str, *, token: str | None = None,
         body: Any = None, prefer: str | None = None) -> tuple[int, Any]:
    headers = {"apikey": key, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if prefer:
        headers["Prefer"] = prefer
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
    request = urllib.request.Request(f"{API_URL}{path}", data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read().decode()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw = error.read().decode()
        try:
            return error.code, json.loads(raw)
        except json.JSONDecodeError:
            return error.code, raw


def signup() -> tuple[str, str]:
    status, payload = call("POST", "/auth/v1/signup", ANON_KEY, body={})
    assert status in (200, 201), (status, payload)
    return payload["user"]["id"], payload["access_token"]


def main() -> None:
    admin_id, admin_token = signup()
    resident_id, resident_token = signup()

    assert call("POST", "/rest/v1/admin_users", SECRET_KEY,
                body={"user_id": admin_id}, prefer="return=minimal")[0] in (200, 201)
    assert call("PATCH", f"/rest/v1/customer?id=eq.{CUSTOMER_ID}", SECRET_KEY,
                body={"auth_user_id": resident_id}, prefer="return=minimal")[0] in (200, 204)
    assert call("POST", "/rest/v1/rpc/join_campaign_by_slug", ANON_KEY,
                token=resident_token, body={"p_slug": CAMPAIGN_SLUG})[0] == 200

    def cleanup() -> None:
        call("PATCH", f"/rest/v1/campaign?id=eq.{CAMPAIGN_ID}", SECRET_KEY,
             body={"status": "open"}, prefer="return=minimal")
        call("PATCH", f"/rest/v1/orders?id=eq.{ORDER_ID}", SECRET_KEY,
             body={"pickup_status": "pending"}, prefer="return=minimal")
        call("DELETE", f"/rest/v1/payment?order_id=eq.{ORDER_ID}", SECRET_KEY,
             prefer="return=minimal")
        call("PATCH", f"/rest/v1/customer?id=eq.{CUSTOMER_ID}", SECRET_KEY,
             body={"auth_user_id": None}, prefer="return=minimal")
        call("DELETE", f"/rest/v1/admin_users?user_id=eq.{admin_id}", SECRET_KEY,
             prefer="return=minimal")
        call("DELETE", f"/auth/v1/admin/users/{admin_id}", SECRET_KEY)
        call("DELETE", f"/auth/v1/admin/users/{resident_id}", SECRET_KEY)

    atexit.register(cleanup)

    status, _ = call("POST", "/rest/v1/rpc/set_campaign_status", ANON_KEY,
                     token=resident_token,
                     body={"p_campaign_id": CAMPAIGN_ID, "p_status": "closed"})
    resident_cannot_close = status in (401, 403)
    assert resident_cannot_close, status

    status, campaign = call("POST", "/rest/v1/rpc/set_campaign_status", ANON_KEY,
                            token=admin_token,
                            body={"p_campaign_id": CAMPAIGN_ID, "p_status": "closed"})
    admin_can_close = status == 200 and campaign["status"] == "closed"
    assert admin_can_close, (status, campaign)

    status, _ = call("POST", "/rest/v1/rpc/submit_customer_order", ANON_KEY,
                     token=resident_token,
                     body={"p_campaign_id": CAMPAIGN_ID, "p_items": {"B": 2}})
    closed_blocks_order_edits = status in (400, 409, 422)
    assert closed_blocks_order_edits, status

    status, _ = call("POST", "/rest/v1/rpc/set_order_fulfillment", ANON_KEY,
                     token=resident_token,
                     body={"p_order_id": ORDER_ID, "p_paid": True,
                           "p_payment_method": "cash", "p_pickup_status": "ready"})
    resident_cannot_update_fulfillment = status in (401, 403)
    assert resident_cannot_update_fulfillment, status

    status, fulfillment = call("POST", "/rest/v1/rpc/set_order_fulfillment", ANON_KEY,
                               token=admin_token,
                               body={"p_order_id": ORDER_ID, "p_paid": True,
                                     "p_payment_method": "cash", "p_pickup_status": "ready"})
    admin_can_update_fulfillment = (
        status == 200 and fulfillment["paid"] is True
        and fulfillment["pickup_status"] == "ready"
    )
    assert admin_can_update_fulfillment, (status, fulfillment)

    status, admin_rows = call(
        "GET", f"/rest/v1/organizer_order_status?order_id=eq.{ORDER_ID}",
        ANON_KEY, token=admin_token,
    )
    admin_can_read_status = status == 200 and admin_rows[0]["payment_method"] == "cash"
    assert admin_can_read_status, (status, admin_rows)

    status, resident_rows = call(
        "GET", f"/rest/v1/organizer_order_status?order_id=eq.{ORDER_ID}",
        ANON_KEY, token=resident_token,
    )
    resident_cannot_read_admin_view = status in (401, 403) or resident_rows == []
    assert resident_cannot_read_admin_view, (status, resident_rows)

    print(json.dumps({
        "checks": 7,
        "resident_cannot_close": resident_cannot_close,
        "admin_can_close": admin_can_close,
        "closed_blocks_order_edits": closed_blocks_order_edits,
        "resident_cannot_update_fulfillment": resident_cannot_update_fulfillment,
        "admin_can_update_fulfillment": admin_can_update_fulfillment,
        "admin_can_read_status": admin_can_read_status,
        "resident_cannot_read_admin_view": resident_cannot_read_admin_view,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
