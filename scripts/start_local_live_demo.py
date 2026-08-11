"""Provision and start the local Supabase visual demo on port 5174.

This script never writes Supabase keys to disk. The fixed organizer credential is
for the disposable local development database only and must never be reused in a
real deployment.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import socket
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ADMIN_EMAIL = "admin@group-buy.local"
ADMIN_PASSWORD = "LocalDemo-Only-2026!"
CAMPAIGN_ID = "10000000-0000-4000-8000-000000000001"
CAMPAIGN_SLUG = "0123456789abcdef0123456789abcdef0123"
PORT = "5174"


def command_environment() -> dict[str, str]:
    npx = shutil.which("npx.cmd") or shutil.which("npx")
    if not npx:
        raise RuntimeError("找不到 npx，請使用 Node.js 22.12.0 以上版本")
    result = subprocess.run(
        [npx, "supabase", "status", "-o", "env"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    values: dict[str, str] = {}
    for line in result.stdout.splitlines():
        match = re.fullmatch(r"([A-Z_]+)=(.*)", line.strip())
        if match:
            values[match.group(1)] = match.group(2).strip().strip('"')
    required = ("API_URL", "ANON_KEY", "SECRET_KEY")
    missing = [key for key in required if not values.get(key)]
    if missing:
        raise RuntimeError(f"Supabase 狀態缺少：{', '.join(missing)}")
    return values


def request(
    method: str,
    url: str,
    secret_key: str,
    body: Any = None,
    prefer: str | None = None,
) -> tuple[int, Any]:
    headers = {"apikey": secret_key, "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    data = None if body is None else json.dumps(body).encode()
    call = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(call, timeout=20) as response:
            raw = response.read().decode()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw = error.read().decode()
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = raw
        return error.code, payload


def find_user(api_url: str, secret_key: str) -> dict[str, Any] | None:
    status, payload = request(
        "GET",
        f"{api_url}/auth/v1/admin/users?per_page=1000",
        secret_key,
    )
    if status != 200:
        raise RuntimeError(f"讀取本機 Auth 使用者失敗（HTTP {status}）")
    users = payload.get("users", []) if isinstance(payload, dict) else []
    return next((user for user in users if user.get("email") == ADMIN_EMAIL), None)


def provision_admin(api_url: str, secret_key: str) -> str:
    user = find_user(api_url, secret_key)
    if user is None:
        status, payload = request(
            "POST",
            f"{api_url}/auth/v1/admin/users",
            secret_key,
            {
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD,
                "email_confirm": True,
            },
        )
        if status not in (200, 201) or not isinstance(payload, dict):
            raise RuntimeError(f"建立本機團主帳號失敗（HTTP {status}）")
        user = payload
    else:
        status, _ = request(
            "PUT",
            f"{api_url}/auth/v1/admin/users/{user['id']}",
            secret_key,
            {"password": ADMIN_PASSWORD, "email_confirm": True},
        )
        if status != 200:
            raise RuntimeError(f"更新本機團主密碼失敗（HTTP {status}）")

    user_id = str(user["id"])
    status, _ = request(
        "POST",
        f"{api_url}/rest/v1/admin_users?on_conflict=user_id",
        secret_key,
        {"user_id": user_id},
        "resolution=merge-duplicates,return=minimal",
    )
    if status not in (200, 201):
        raise RuntimeError(f"加入 admin_users 失敗（HTTP {status}）")
    return user_id


def public_api_url(api_url: str) -> tuple[str, str]:
    override = os.environ.get("LOCAL_LIVE_DEMO_HOST", "").strip()
    host = override
    if not host:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            probe.connect(("8.8.8.8", 80))
            host = probe.getsockname()[0]
        except OSError:
            host = "127.0.0.1"
        finally:
            probe.close()

    parsed = urllib.parse.urlsplit(api_url)
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    network_location = f"{host}:{port}"
    return urllib.parse.urlunsplit(
        (parsed.scheme, network_location, parsed.path, parsed.query, parsed.fragment)
    ), host


def main() -> None:
    values = command_environment()
    provision_admin(values["API_URL"], values["SECRET_KEY"])
    browser_api_url, network_host = public_api_url(values["API_URL"])

    npm = shutil.which("npm.cmd") or shutil.which("npm")
    if not npm:
        raise RuntimeError("找不到 npm，請使用 Node.js 22.12.0 以上版本")

    environment = os.environ.copy()
    environment.update(
        {
            "VITE_LOCAL_SUPABASE_DEMO": "true",
            "VITE_SUPABASE_URL": browser_api_url,
            "VITE_SUPABASE_ANON_KEY": values["ANON_KEY"],
            "VITE_DEMO_CAMPAIGN_ID": CAMPAIGN_ID,
            "VITE_DEMO_CAMPAIGN_SLUG": CAMPAIGN_SLUG,
        }
    )

    print("\n本機 Supabase Live Demo 已準備：")
    print(f"  住戶端：http://localhost:{PORT}/")
    print(f"  團主端：http://localhost:{PORT}/admin")
    if network_host != "127.0.0.1":
        print(f"  手機住戶端：http://{network_host}:{PORT}/")
        print(f"  手機團主端：http://{network_host}:{PORT}/admin")
    print(f"  Email：{ADMIN_EMAIL}")
    print(f"  密碼：{ADMIN_PASSWORD}")
    print("\n此帳號僅限本機 Supabase，請勿用於正式環境。\n")
    sys.stdout.flush()

    subprocess.run(
        [npm, "run", "dev", "--", "--host", "0.0.0.0", "--port", PORT, "--strictPort"],
        cwd=ROOT,
        env=environment,
        check=True,
    )


if __name__ == "__main__":
    main()
