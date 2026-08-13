"""Approve a verified LINE organizer request without exposing LINE user IDs.

Usage:
  API_URL=... SECRET_KEY=... python scripts/approve_line_organizer.py <request-code>
"""
from __future__ import annotations

import json
import os
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections.abc import Callable
from typing import Any

API_URL = os.environ.get("API_URL", "").rstrip("/")
SECRET_KEY = os.environ.get("SECRET_KEY", "")
Request = Callable[[str, str, dict | None], tuple[int, object | None]]


def request(method: str, path: str, body: dict | None = None) -> tuple[int, object | None]:
    headers = {
        "apikey": SECRET_KEY,
        "Authorization": f"Bearer {SECRET_KEY}",
        "Content-Type": "application/json",
    }
    raw_body = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(f"{API_URL}{path}", data=raw_body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw = error.read()
        return error.code, json.loads(raw) if raw else None


def _approved_user(request_code: str, send: Request) -> str | None:
    encoded = urllib.parse.quote(request_code, safe="")
    status, rows = send(
        "GET",
        f"/rest/v1/line_organizer_identity?approval_request_code=eq.{encoded}&select=auth_user_id",
        None,
    )
    if status != 200 or not isinstance(rows, list):
        raise RuntimeError("無法核對團主核准狀態")
    if len(rows) > 1:
        raise RuntimeError("團主核准狀態不一致")
    return rows[0]["auth_user_id"] if rows else None


def _find_auth_user(internal_email: str, send: Request) -> str | None:
    page = 1
    per_page = 1000
    while True:
        status, payload = send(
            "GET",
            f"/auth/v1/admin/users?page={page}&per_page={per_page}",
            None,
        )
        if status != 200 or not isinstance(payload, dict) or not isinstance(payload.get("users"), list):
            raise RuntimeError("無法查詢團主Auth帳號")
        users = payload["users"]
        matches = [user for user in users if user.get("email") == internal_email]
        if len(matches) > 1:
            raise RuntimeError("團主Auth帳號不一致")
        if matches:
            return matches[0]["id"]
        if len(users) < per_page:
            return None
        page += 1


def approve(request_code: str, send: Request = request) -> dict[str, Any]:
    existing = _approved_user(request_code, send)
    if existing:
        return {"approved": True, "displayName": None, "authUserId": existing, "reconciled": True}

    encoded = urllib.parse.quote(request_code, safe="")
    status, rows = send(
        "GET",
        f"/rest/v1/line_organizer_request?request_code=eq.{encoded}&select=request_code,display_name",
        None,
    )
    if status != 200 or not isinstance(rows, list) or len(rows) != 1:
        raise RuntimeError("找不到待核准的團主申請")

    internal_email = f"line-organizer-{request_code}@auth.invalid"
    auth_user_id = _find_auth_user(internal_email, send)
    if not auth_user_id:
        status, auth_user = send("POST", "/auth/v1/admin/users", {
            "email": internal_email,
            "password": secrets.token_urlsafe(48),
            "email_confirm": True,
            "app_metadata": {"auth_source": "line_organizer"},
        })
        if status not in (200, 201) or not isinstance(auth_user, dict):
            raise RuntimeError("建立團主Auth帳號失敗")
        auth_user_id = auth_user["id"]

    rpc_error: Exception | None = None
    try:
        status, approved = send("POST", "/rest/v1/rpc/approve_line_organizer", {
            "p_request_code": request_code,
            "p_auth_user_id": auth_user_id,
        })
        if status == 200 and approved == auth_user_id:
            return {
                "approved": True,
                "displayName": rows[0].get("display_name"),
                "authUserId": auth_user_id,
                "reconciled": False,
            }
        rpc_error = RuntimeError("寫入團主資格失敗")
    except Exception as error:
        rpc_error = error

    reconciled = _approved_user(request_code, send)
    if reconciled == auth_user_id:
        return {
            "approved": True,
            "displayName": rows[0].get("display_name"),
            "authUserId": auth_user_id,
            "reconciled": True,
        }
    raise RuntimeError("團主核准未完成；可使用同一申請代碼安全重試") from rpc_error


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: approve_line_organizer.py <request-code>")
    if not API_URL or not SECRET_KEY:
        raise SystemExit("缺少API_URL或SECRET_KEY")
    try:
        request_code = str(uuid.UUID(sys.argv[1]))
    except ValueError as error:
        raise SystemExit("申請代碼格式錯誤") from error

    try:
        result = approve(request_code)
    except RuntimeError as error:
        raise SystemExit(str(error)) from error
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
