"""Verify that organizer privileges add to, rather than replace, resident abilities.

Required environment variables: API_URL, ANON_KEY, SECRET_KEY. The script creates
isolated hosted/local fixtures and removes them before exit. Secret values are never
printed.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
import uuid
from collections.abc import Callable
from typing import Any

API_URL = os.environ["API_URL"]
ANON_KEY = os.environ["ANON_KEY"]
SECRET_KEY = os.environ["SECRET_KEY"]


def call(
    method: str,
    path: str,
    key: str,
    *,
    token: str | None = None,
    body: Any = None,
    prefer: str | None = None,
) -> tuple[int, Any]:
    headers = {"apikey": key, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if prefer:
        headers["Prefer"] = prefer
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
    request = urllib.request.Request(
        f"{API_URL}{path}", data=data, method=method, headers=headers
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw = error.read().decode()
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = raw
        return error.code, payload


def signup() -> tuple[str, str]:
    status, payload = call("POST", "/auth/v1/signup", ANON_KEY, body={})
    assert status in (200, 201), (status, payload)
    return payload["user"]["id"], payload["access_token"]


ORDER_WALL_SAFE_COLUMNS = {
    "campaign_slug", "campaign_id", "order_id", "customer_id", "customer_name",
    "period", "unit", "note", "ordered_at", "order_updated_at",
    "campaign_item_id", "item_code", "item_name", "sort_order", "item_active",
    "qty", "item_updated_at",
}


def validate_order_wall_rows(rows: list[dict[str, Any]]) -> None:
    assert rows, "expected at least one order wall row"
    for row in rows:
        unexpected = set(row) - ORDER_WALL_SAFE_COLUMNS
        assert not unexpected, f"order_wall exposed unexpected columns: {sorted(unexpected)}"


def cleanup_fixtures(
    call_fn: Callable[..., tuple[int, Any]],
    *,
    campaign_id: str | None,
    customer_ids: tuple[str | None, ...],
    admin_id: str | None,
    user_ids: tuple[str | None, ...],
) -> list[str]:
    operations: list[tuple[str, str, str | None]] = []
    if campaign_id:
        operations.extend([
            ("orders", f"/rest/v1/orders?campaign_id=eq.{campaign_id}", "return=minimal"),
            ("campaign", f"/rest/v1/campaign?id=eq.{campaign_id}", "return=minimal"),
        ])
    operations.extend(
        ("customer", f"/rest/v1/customer?id=eq.{customer_id}", "return=minimal")
        for customer_id in customer_ids if customer_id
    )
    if admin_id:
        operations.append((
            "admin membership", f"/rest/v1/admin_users?user_id=eq.{admin_id}",
            "return=minimal",
        ))
    operations.extend(
        ("auth user", f"/auth/v1/admin/users/{user_id}", None)
        for user_id in user_ids if user_id
    )

    errors: list[str] = []
    for label, path, prefer in operations:
        try:
            status, payload = call_fn(
                "DELETE", path, SECRET_KEY,
                **({"prefer": prefer} if prefer else {}),
            )
            if status not in (200, 204):
                errors.append(f"{label} cleanup returned HTTP {status}: {payload}")
        except Exception as error:  # Continue so one network failure cannot skip later cleanup.
            errors.append(f"{label} cleanup failed: {error}")
    return errors


def main() -> None:
    admin_id: str | None = None
    other_id: str | None = None
    campaign_id: str | None = None
    customer_id: str | None = None
    other_customer_id: str | None = None
    checks: dict[str, bool] = {}
    result: dict[str, Any] | None = None
    cleanup_errors: list[str] = []

    try:
        admin_id, admin_token = signup()
        other_id, other_token = signup()

        status, payload = call(
            "POST", "/rest/v1/admin_users", SECRET_KEY,
            body={"user_id": admin_id}, prefer="return=minimal",
        )
        assert status in (200, 201), (status, payload)
        checks["same_uid_is_admin"] = True

        status, created = call(
            "POST", "/rest/v1/rpc/create_campaign_draft", ANON_KEY,
            token=admin_token, body={"p_title": "角色疊加驗證團"},
        )
        assert status == 200, (status, created)
        row = created[0] if isinstance(created, list) else created
        campaign_id = row["id"]
        slug = row["slug"]

        customer_id = str(uuid.uuid4())
        other_customer_id = str(uuid.uuid4())
        profiles = [
            {
                "id": customer_id, "period": 9, "unit": "ADMIN01",
                "name": "團主住戶", "auth_user_id": admin_id,
            },
            {
                "id": other_customer_id, "period": 9, "unit": "OTHER01",
                "name": "其他住戶", "auth_user_id": other_id,
            },
        ]
        status, payload = call(
            "POST", "/rest/v1/customer", SECRET_KEY,
            body=profiles, prefer="return=minimal",
        )
        assert status in (200, 201), (status, payload)

        status, payload = call(
            "POST", "/rest/v1/rpc/publish_campaign_draft", ANON_KEY,
            token=admin_token, body={"p_campaign_id": campaign_id},
        )
        assert status == 200, (status, payload)

        status, payload = call(
            "POST", "/rest/v1/rpc/join_campaign_by_slug", ANON_KEY,
            token=admin_token, body={"p_slug": slug},
        )
        assert status == 200, (status, payload)
        checks["admin_uid_can_join_as_resident"] = True

        status, own_profile = call(
            "POST", "/rest/v1/rpc/get_customer_self", ANON_KEY,
            token=admin_token, body={},
        )
        assert status == 200 and own_profile == [{
            "id": customer_id, "name": "團主住戶", "period": 9, "unit": "ADMIN01",
        }], (status, own_profile)
        checks["admin_uid_resolves_own_customer"] = True

        status, created_order = call(
            "POST", "/rest/v1/rpc/submit_customer_order", ANON_KEY,
            token=admin_token,
            body={"p_campaign_id": campaign_id, "p_items": {"ITEM1": 2}},
        )
        assert status == 200, (status, created_order)
        order_id = created_order["id"]
        checks["admin_uid_can_create_own_order"] = True

        status, updated_order = call(
            "POST", "/rest/v1/rpc/submit_customer_order", ANON_KEY,
            token=admin_token,
            body={"p_campaign_id": campaign_id, "p_items": {"ITEM1": 3}},
        )
        assert status == 200 and updated_order["id"] == order_id, (status, updated_order)
        assert updated_order["items"] == {"ITEM1": 3}, updated_order
        checks["admin_uid_can_modify_own_order"] = True

        status, payload = call(
            "POST", "/rest/v1/rpc/join_campaign_by_slug", ANON_KEY,
            token=other_token, body={"p_slug": slug},
        )
        assert status == 200, (status, payload)

        status, sensitive = call(
            "GET", "/rest/v1/customer?select=id,line_user_id,auth_user_id",
            ANON_KEY, token=other_token,
        )
        assert status in (401, 403), (status, sensitive)
        checks["resident_cannot_select_identity_columns"] = True

        status, wall = call(
            "GET",
            f"/rest/v1/order_wall?campaign_id=eq.{campaign_id}&select=*",
            ANON_KEY,
            token=other_token,
        )
        assert status == 200, (status, wall)
        validate_order_wall_rows(wall)
        checks["wall_omits_sensitive_identity"] = True

        status, admin_list = call(
            "GET", "/rest/v1/admin_campaign_list?select=id", ANON_KEY,
            token=other_token,
        )
        assert status == 200 and admin_list == [], (status, admin_list)
        checks["resident_not_promoted_to_admin"] = True

        result = {"checks": len(checks), **checks}
    finally:
        cleanup_errors = cleanup_fixtures(
            call,
            campaign_id=campaign_id,
            customer_ids=(customer_id, other_customer_id),
            admin_id=admin_id,
            user_ids=(admin_id, other_id),
        )

    if cleanup_errors:
        raise RuntimeError("fixture cleanup failed: " + "; ".join(cleanup_errors))
    assert result is not None
    print(json.dumps({**result, "test_data_cleaned_up": True}, ensure_ascii=False))


if __name__ == "__main__":
    main()
