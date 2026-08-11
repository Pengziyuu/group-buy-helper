"""Verify campaign draft RLS and publication against local Supabase.

Required environment variables are emitted by `supabase status -o env` and must
be exported by the caller. Secret values are never printed.
"""
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

    status, payload = call(
        "POST",
        "/rest/v1/admin_users",
        SECRET_KEY,
        body={"user_id": admin_id},
        prefer="return=minimal",
    )
    assert status in (200, 201), (status, payload)

    status, payload = call(
        "POST",
        "/rest/v1/rpc/join_campaign_by_slug",
        ANON_KEY,
        token=resident_token,
        body={"p_slug": CAMPAIGN_SLUG},
    )
    assert status == 200, (status, payload)

    status, before = call(
        "GET",
        f"/rest/v1/campaign_public?id=eq.{CAMPAIGN_ID}&select=title,unit_price,threshold,announcement,images",
        ANON_KEY,
        token=resident_token,
    )
    assert status == 200 and len(before) == 1, (status, before)

    def cleanup() -> None:
        call(
            "PATCH",
            f"/rest/v1/campaign?id=eq.{CAMPAIGN_ID}",
            SECRET_KEY,
            body=before[0],
            prefer="return=minimal",
        )
        call(
            "DELETE",
            f"/rest/v1/campaign_draft?campaign_id=eq.{CAMPAIGN_ID}",
            SECRET_KEY,
            prefer="return=minimal",
        )
        call(
            "DELETE",
            f"/rest/v1/admin_users?user_id=eq.{admin_id}",
            SECRET_KEY,
            prefer="return=minimal",
        )
        call("DELETE", f"/auth/v1/admin/users/{admin_id}", SECRET_KEY)
        call("DELETE", f"/auth/v1/admin/users/{resident_id}", SECRET_KEY)

    cleanup_at_exit = atexit.register(cleanup)

    title = "Supabase 發布驗證團"
    draft = {
        "campaign_id": CAMPAIGN_ID,
        "title": title,
        "unit_price": 50,
        "threshold": 80,
        "announcement": "只有團主可見的草稿內容",
        "images": [
            {"src": "campaigns/test/front.jpg", "alt": "冰餅包裝正面"}
        ],
    }
    status, saved = call(
        "POST",
        "/rest/v1/campaign_draft?on_conflict=campaign_id",
        ANON_KEY,
        token=admin_token,
        body=draft,
        prefer="resolution=merge-duplicates,return=representation",
    )
    assert status in (200, 201) and saved[0]["title"] == title, (status, saved)

    status, resident_drafts = call(
        "GET",
        "/rest/v1/campaign_draft?select=title",
        ANON_KEY,
        token=resident_token,
    )
    assert status == 200 and resident_drafts == [], (status, resident_drafts)

    status, anonymous_drafts = call(
        "GET", "/rest/v1/campaign_draft?select=title", ANON_KEY
    )
    assert status in (401, 403), (status, anonymous_drafts)

    status, still_old = call(
        "GET",
        f"/rest/v1/campaign_public?id=eq.{CAMPAIGN_ID}&select=title",
        ANON_KEY,
        token=resident_token,
    )
    assert status == 200 and still_old[0]["title"] == before[0]["title"], (
        status,
        still_old,
    )

    status, payload = call(
        "POST",
        "/rest/v1/rpc/publish_campaign_draft",
        ANON_KEY,
        token=resident_token,
        body={"p_campaign_id": CAMPAIGN_ID},
    )
    assert status in (401, 403), (status, payload)

    status, published = call(
        "POST",
        "/rest/v1/rpc/publish_campaign_draft",
        ANON_KEY,
        token=admin_token,
        body={"p_campaign_id": CAMPAIGN_ID},
    )
    assert status == 200 and published["title"] == title, (status, published)

    status, after = call(
        "GET",
        f"/rest/v1/campaign_public?id=eq.{CAMPAIGN_ID}&select=title,images",
        ANON_KEY,
        token=resident_token,
    )
    assert (
        status == 200
        and after[0]["title"] == title
        and after[0]["images"][0]["alt"] == "冰餅包裝正面"
    ), (status, after)

    invalid = {**draft, "images": [{"src": "campaigns/test/front.jpg"}]}
    status, payload = call(
        "POST",
        "/rest/v1/campaign_draft?on_conflict=campaign_id",
        ANON_KEY,
        token=admin_token,
        body=invalid,
        prefer="resolution=merge-duplicates,return=minimal",
    )
    assert status == 400, (status, payload)

    cleanup()
    atexit.unregister(cleanup_at_exit)

    status, restored = call(
        "GET",
        f"/rest/v1/campaign?id=eq.{CAMPAIGN_ID}&select=title,unit_price,threshold,announcement,images",
        SECRET_KEY,
    )
    assert status == 200 and restored == before, (status, restored)
    status, remaining_drafts = call(
        "GET",
        f"/rest/v1/campaign_draft?campaign_id=eq.{CAMPAIGN_ID}&select=campaign_id",
        SECRET_KEY,
    )
    assert status == 200 and remaining_drafts == [], (status, remaining_drafts)
    for user_id in (admin_id, resident_id):
        status, payload = call(
            "GET", f"/auth/v1/admin/users/{user_id}", SECRET_KEY
        )
        assert status == 404, (status, payload)

    print(
        json.dumps(
            {
                "checks": 9,
                "admin_can_save_draft": True,
                "resident_cannot_read_draft": True,
                "anonymous_cannot_read_draft": True,
                "draft_does_not_change_public": True,
                "resident_cannot_publish": True,
                "admin_publish_changes_public": True,
                "image_alt_preserved": True,
                "invalid_image_rejected": True,
                "test_data_cleaned_up": True,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
