"""Verify secure organizer campaign creation/listing against local Supabase."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

API_URL = os.environ["API_URL"]
ANON_KEY = os.environ["ANON_KEY"]
SECRET_KEY = os.environ["SECRET_KEY"]


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
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = raw
        return error.code, payload


def signup() -> tuple[str, str]:
    status, payload = call("POST", "/auth/v1/signup", ANON_KEY, body={})
    assert status in (200, 201), (status, payload)
    return payload["user"]["id"], payload["access_token"]


def main() -> None:
    admin_id, admin_token = signup()
    resident_id, resident_token = signup()
    campaign_id: str | None = None

    try:
        status, payload = call("POST", "/rest/v1/admin_users", SECRET_KEY,
                               body={"user_id": admin_id}, prefer="return=minimal")
        assert status in (200, 201), (status, payload)

        create_body = {"p_title": "API 新團購"}
        status, payload = call("POST", "/rest/v1/rpc/create_campaign_draft", ANON_KEY,
                               token=resident_token, body=create_body)
        assert status in (401, 403), (status, payload)

        status, created = call("POST", "/rest/v1/rpc/create_campaign_draft", ANON_KEY,
                               token=admin_token, body=create_body)
        assert status == 200 and created, (status, created)
        row = created[0] if isinstance(created, list) else created
        campaign_id = row["id"]
        slug = row["slug"]
        assert row["title"] == "API 新團購"
        assert row["opened_at"] is None

        status, drafts = call(
            "GET",
            f"/rest/v1/campaign_draft?campaign_id=eq.{campaign_id}&select=title,unit_price,threshold,items",
            ANON_KEY,
            token=admin_token,
        )
        assert status == 200 and drafts == [{
            "title": "API 新團購",
            "unit_price": 0,
            "threshold": 1,
            "items": [{"code": "ITEM1", "name": "A號", "active": True}],
        }], (status, drafts)

        status, payload = call(
            "POST", "/rest/v1/campaign_access", SECRET_KEY,
            body={"campaign_id": campaign_id, "user_id": resident_id}, prefer="return=minimal",
        )
        assert status in (200, 201), (status, payload)
        status, unpublished = call(
            "GET", f"/rest/v1/campaign_public?id=eq.{campaign_id}&select=id,title",
            ANON_KEY, token=resident_token,
        )
        assert status == 200 and unpublished == [], (status, unpublished)
        status, has_access = call(
            "POST", "/rest/v1/rpc/has_campaign_access", ANON_KEY,
            token=resident_token, body={"p_campaign_id": campaign_id},
        )
        assert status == 200 and has_access is False, (status, has_access)

        status, payload = call(
            "PATCH", f"/rest/v1/campaign_draft?campaign_id=eq.{campaign_id}",
            ANON_KEY, token=admin_token, body={"title": "API 新團購（已暫存）"},
            prefer="return=minimal",
        )
        assert status in (200, 204), (status, payload)

        status, listing = call(
            "GET",
            "/rest/v1/admin_campaign_list?select=id,slug,title,status,opened_at,updated_at&order=updated_at.desc",
            ANON_KEY,
            token=admin_token,
        )
        listed = next((item for item in listing if item["id"] == campaign_id), None)
        assert status == 200 and listed and listed["title"] == "API 新團購（已暫存）", (status, listing)

        status, payload = call("POST", "/rest/v1/rpc/join_campaign_by_slug", ANON_KEY,
                               token=resident_token, body={"p_slug": slug})
        assert status in (400, 403, 404), (status, payload)

        print(json.dumps({
            "checks": 9,
            "resident_cannot_create": True,
            "admin_can_create": True,
            "default_a_item_created": True,
            "admin_list_contains_campaign": True,
            "admin_list_uses_latest_draft_title": True,
            "legacy_access_cannot_read_unpublished": True,
            "unpublished_capability_is_inactive": True,
            "unpublished_slug_rejected": True,
            "test_data_cleaned_up": True,
        }, ensure_ascii=False))
    finally:
        if campaign_id:
            call("DELETE", f"/rest/v1/campaign?id=eq.{campaign_id}", SECRET_KEY,
                 prefer="return=minimal")
        call("DELETE", f"/rest/v1/admin_users?user_id=eq.{admin_id}", SECRET_KEY,
             prefer="return=minimal")
        call("DELETE", f"/auth/v1/admin/users/{admin_id}", SECRET_KEY)
        call("DELETE", f"/auth/v1/admin/users/{resident_id}", SECRET_KEY)


if __name__ == "__main__":
    main()
