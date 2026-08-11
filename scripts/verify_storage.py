"""Verify campaign image Storage bucket and policies against local Supabase."""
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

# A valid 1x1 transparent PNG.
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


def request(method: str, path: str, key: str | None = None, *,
            token: str | None = None, body: bytes | None = None,
            content_type: str = "application/json") -> tuple[int, bytes]:
    headers = {"Content-Type": content_type}
    if key:
        headers["apikey"] = key
    if token:
        headers["Authorization"] = f"Bearer {token}"
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


def main() -> None:
    admin_id, admin_token = signup()
    resident_id, resident_token = signup()
    object_path = f"storage-policy-test/{admin_id}.png"
    status, raw = request(
        "POST", "/rest/v1/admin_users", SECRET_KEY,
        body=json.dumps({"user_id": admin_id}).encode(),
    )
    assert status in (200, 201), (status, raw)

    def cleanup() -> None:
        request("DELETE", "/storage/v1/object/campaign-images",
                ANON_KEY, token=admin_token,
                body=json.dumps({"prefixes": [object_path]}).encode())
        request("DELETE", f"/rest/v1/admin_users?user_id=eq.{admin_id}", SECRET_KEY)
        request("DELETE", f"/auth/v1/admin/users/{admin_id}", SECRET_KEY)
        request("DELETE", f"/auth/v1/admin/users/{resident_id}", SECRET_KEY)

    atexit.register(cleanup)

    resident_path = f"storage-policy-test/{resident_id}.png"
    status, _ = request(
        "POST", f"/storage/v1/object/campaign-images/{resident_path}",
        ANON_KEY, token=resident_token, body=PNG, content_type="image/png",
    )
    resident_cannot_upload = status in (400, 401, 403)
    assert resident_cannot_upload, status

    status, raw = request(
        "POST", f"/storage/v1/object/campaign-images/{object_path}",
        ANON_KEY, token=admin_token, body=PNG, content_type="image/png",
    )
    admin_can_upload = status == 200
    assert admin_can_upload, (status, raw)

    status, downloaded = request(
        "GET", f"/storage/v1/object/public/campaign-images/{object_path}",
    )
    public_can_read = status == 200 and downloaded == PNG
    assert public_can_read, (status, len(downloaded))

    status, _ = request(
        "DELETE", "/storage/v1/object/campaign-images",
        ANON_KEY, token=resident_token,
        body=json.dumps({"prefixes": [object_path]}).encode(),
    )
    delete_status = status
    status, still_downloaded = request(
        "GET", f"/storage/v1/object/public/campaign-images/{object_path}",
    )
    resident_cannot_delete = delete_status in (200, 204, 400, 401, 403) and status == 200 and still_downloaded == PNG
    assert resident_cannot_delete, (delete_status, status, len(still_downloaded))

    status, raw = request(
        "DELETE", "/storage/v1/object/campaign-images",
        ANON_KEY, token=admin_token,
        body=json.dumps({"prefixes": [object_path]}).encode(),
    )
    admin_can_delete = status in (200, 204)
    assert admin_can_delete, (status, raw)

    print(json.dumps({
        "checks": 5,
        "resident_cannot_upload": resident_cannot_upload,
        "admin_can_upload": admin_can_upload,
        "public_can_read": public_can_read,
        "resident_cannot_delete": resident_cannot_delete,
        "admin_can_delete": admin_can_delete,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
