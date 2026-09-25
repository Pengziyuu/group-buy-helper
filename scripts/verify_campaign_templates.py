"""Verify campaign template table, RLS and template image Storage policies against local Supabase."""
from __future__ import annotations

import atexit
import base64
import json
import os
import urllib.error
import urllib.request
import uuid

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

    # Case-insensitive duplicate rejection: only ASCII differs in case here, so this fails
    # if the unique index were `(btrim(name))` without `lower()`.
    status, raw = insert_template(admin_token, "Tmpl A", content())
    latin_template_created = status == 201 and isinstance(raw, list)
    assert latin_template_created, (status, raw)
    created_ids.append(raw[0]["id"])

    status, raw = insert_template(admin_token, " tmpl a ", content())
    case_insensitive_duplicate_rejected = status == 409 and '23505' in json.dumps(raw)
    assert case_insensitive_duplicate_rejected, (status, raw)

    # Whitespace-only duplicate rejection (same name, only leading/trailing spaces differ).
    status, raw = insert_template(admin_token, "  驗證範本  ", content())
    whitespace_duplicate_rejected = status == 409 and '23505' in json.dumps(raw)
    if status == 201 and isinstance(raw, list):
        created_ids.append(raw[0]["id"])
    assert whitespace_duplicate_rejected, (status, raw)

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

    missing_template_path = f"templates/00000000-0000-4000-8000-000000000000/{uuid.uuid4()}.png"
    status, _ = request("POST", f"/storage/v1/object/campaign-images/{missing_template_path}",
                        ANON_KEY, token=admin_token, body=PNG, content_type="image/png")
    upload_blocked_without_template = status in (400, 401, 403)
    assert upload_blocked_without_template, status

    template_path = f"templates/{template_id}/{uuid.uuid4()}.png"
    status, _ = request("POST", f"/storage/v1/object/campaign-images/{template_path}",
                        ANON_KEY, token=resident_token, body=PNG, content_type="image/png")
    resident_cannot_upload = status in (400, 401, 403)
    assert resident_cannot_upload, status

    status, raw = request("POST", f"/storage/v1/object/campaign-images/{template_path}",
                          ANON_KEY, token=admin_token, body=PNG, content_type="image/png")
    admin_can_upload = status == 200
    assert admin_can_upload, (status, raw)
    uploaded.append(template_path)

    copy_path = f"templates/{template_id}/{uuid.uuid4()}.png"
    status, raw = request("POST", "/storage/v1/object/copy", ANON_KEY, token=admin_token,
                          body=json.dumps({"bucketId": "campaign-images", "sourceKey": template_path,
                                           "destinationKey": copy_path}).encode())
    admin_can_copy = status == 200
    assert admin_can_copy, (status, raw)
    uploaded.append(copy_path)

    malformed_path_blocked = {}
    nested_path = f"templates/{template_id}/nested/{uuid.uuid4()}.png"
    status, _ = request("POST", f"/storage/v1/object/campaign-images/{nested_path}",
                        ANON_KEY, token=admin_token, body=PNG, content_type="image/png")
    malformed_path_blocked["nested"] = status in (400, 401, 403)

    wrong_extension_path = f"templates/{template_id}/{uuid.uuid4()}.gif"
    status, _ = request("POST", f"/storage/v1/object/campaign-images/{wrong_extension_path}",
                        ANON_KEY, token=admin_token, body=PNG, content_type="image/gif")
    malformed_path_blocked["wrong_extension"] = status in (400, 401, 403)
    assert all(malformed_path_blocked.values()), malformed_path_blocked

    status, raw = request("DELETE", f"/rest/v1/campaign_template?id=eq.{template_id}", ANON_KEY,
                          token=admin_token, prefer="return=representation")
    admin_can_delete = status == 200 and len(json.loads(raw)) == 1
    assert admin_can_delete, (status, raw)
    created_ids.remove(template_id)

    status, raw = request("DELETE", "/storage/v1/object/campaign-images", ANON_KEY, token=admin_token,
                          body=json.dumps({"prefixes": [template_path, copy_path]}).encode())
    deleted_objects = json.loads(raw) if raw else []
    deleted_names = {item.get("name") for item in deleted_objects}
    status_list, raw_list = request(
        "POST", "/storage/v1/object/list/campaign-images", ANON_KEY, token=admin_token,
        body=json.dumps({"prefix": f"templates/{template_id}", "limit": 100, "offset": 0}).encode(),
    )
    remaining_objects = json.loads(raw_list) if status_list == 200 else [{"error": status_list}]
    images_removed_after_delete = (
        status in (200, 204)
        and template_path in deleted_names
        and copy_path in deleted_names
        and remaining_objects == []
    )
    assert images_removed_after_delete, (status, raw, remaining_objects)
    uploaded.clear()

    print(json.dumps({
        "checks": 19,
        "admin_can_create": admin_can_create,
        "admin_can_read": admin_can_read,
        "resident_cannot_read": resident_cannot_read,
        "anon_cannot_read": anon_cannot_read,
        "resident_cannot_create": resident_cannot_create,
        "case_insensitive_duplicate_rejected": case_insensitive_duplicate_rejected,
        "whitespace_duplicate_rejected": whitespace_duplicate_rejected,
        "bad_content_rejected": bad_content_rejected,
        "admin_can_rename": admin_can_rename,
        "upload_blocked_without_template": upload_blocked_without_template,
        "resident_cannot_upload": resident_cannot_upload,
        "admin_can_upload": admin_can_upload,
        "admin_can_copy": admin_can_copy,
        "malformed_path_blocked": malformed_path_blocked,
        "admin_can_delete_and_clean_images": admin_can_delete and images_removed_after_delete,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
