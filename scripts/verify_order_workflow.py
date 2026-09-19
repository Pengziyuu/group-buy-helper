"""Verify organizer-only campaign and fulfillment workflow through local Supabase APIs."""
from __future__ import annotations

import atexit
import hashlib
import json
import os
import urllib.error
import urllib.request
from typing import Any

API_URL = os.environ["API_URL"]
ANON_KEY = os.environ["ANON_KEY"]
SECRET_KEY = os.environ["SECRET_KEY"]
COMMUNITY_ID = "00000000-0000-4000-8000-000000000001"
CAMPAIGN_ID = "10000000-0000-4000-8000-000000000001"
CAMPAIGN_SLUG = "0123456789abcdef0123456789abcdef0123"
ORDER_ID = "40000000-0000-4000-8000-000000000001"
CUSTOMER_ID = "30000000-0000-4000-8000-000000000001"
CANCEL_CUSTOMER_ID = "30000000-0000-4000-8000-0000000000f1"
CANCEL_ORDER_ID = "40000000-0000-4000-8000-0000000000f1"
CANCEL_ITEM_ID = "20000000-0000-4000-8000-000000000001"


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
    assert call("POST", "/rest/v1/community_member", SECRET_KEY, prefer="return=minimal",
                body={"community_id": COMMUNITY_ID, "user_id": resident_id})[0] in (200, 201)
    joined_status, joined = call("POST", "/rest/v1/rpc/join_campaign_by_slug", ANON_KEY,
                                 token=resident_token, body={"p_slug": CAMPAIGN_SLUG})
    assert joined_status == 200 and joined, (joined_status, joined)

    # auth user ids for throwaway accounts created below (after atexit.register)
    # that bind their own customer row via bind_customer_self. customer.auth_user_id
    # is ON DELETE SET NULL, not CASCADE, so the customer row must be deleted
    # explicitly before the auth user or it survives as an orphan.
    extra_account_ids: list[str] = []

    def cleanup() -> None:
        call("PATCH", f"/rest/v1/campaign?id=eq.{CAMPAIGN_ID}", SECRET_KEY,
             body={"status": "open"}, prefer="return=minimal")
        call("DELETE", f"/rest/v1/organizer_order_note?order_id=eq.{ORDER_ID}", SECRET_KEY,
             prefer="return=minimal")
        call("DELETE", f"/rest/v1/payment?order_id=eq.{ORDER_ID}", SECRET_KEY,
             prefer="return=minimal")
        call("PATCH", f"/rest/v1/customer?id=eq.{CUSTOMER_ID}", SECRET_KEY,
             body={"auth_user_id": None}, prefer="return=minimal")
        call("DELETE", f"/rest/v1/orders?id=eq.{CANCEL_ORDER_ID}", SECRET_KEY,
             prefer="return=minimal")
        call("DELETE", f"/rest/v1/customer?id=eq.{CANCEL_CUSTOMER_ID}", SECRET_KEY,
             prefer="return=minimal")
        for account_id in extra_account_ids:
            call("DELETE", f"/rest/v1/customer?auth_user_id=eq.{account_id}", SECRET_KEY,
                 prefer="return=minimal")
            call("DELETE", f"/auth/v1/admin/users/{account_id}", SECRET_KEY)
        call("DELETE", f"/rest/v1/admin_users?user_id=eq.{admin_id}", SECRET_KEY,
             prefer="return=minimal")
        call("DELETE", f"/auth/v1/admin/users/{admin_id}", SECRET_KEY)
        call("DELETE", f"/auth/v1/admin/users/{resident_id}", SECRET_KEY)

    atexit.register(cleanup)

    # A throwaway household and order so cancelling never destroys seed rows.
    assert call("POST", "/rest/v1/customer", SECRET_KEY, prefer="return=minimal",
                body={"id": CANCEL_CUSTOMER_ID, "period": 2, "unit": "3Z15",
                      "name": "取消驗證"})[0] in (200, 201)
    assert call("POST", "/rest/v1/orders", SECRET_KEY, prefer="return=minimal",
                body={"id": CANCEL_ORDER_ID, "campaign_id": CAMPAIGN_ID,
                      "customer_id": CANCEL_CUSTOMER_ID})[0] in (200, 201)
    assert call("POST", "/rest/v1/order_item", SECRET_KEY, prefer="return=minimal",
                body={"order_id": CANCEL_ORDER_ID, "campaign_id": CAMPAIGN_ID,
                      "campaign_item_id": CANCEL_ITEM_ID, "qty": 2})[0] in (200, 201)
    assert call("POST", "/rest/v1/payment", SECRET_KEY, prefer="return=minimal",
                body={"order_id": CANCEL_ORDER_ID, "amount": 90, "paid": True,
                      "paid_at": "2026-09-19T00:00:00Z"})[0] in (200, 201)

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

    status, _ = call("POST", "/rest/v1/rpc/set_order_paid", ANON_KEY,
                     token=resident_token,
                     body={"p_order_id": ORDER_ID, "p_paid": True})
    resident_cannot_update_payment = status in (401, 403)
    assert resident_cannot_update_payment, status

    status, payment = call("POST", "/rest/v1/rpc/set_order_paid", ANON_KEY,
                           token=admin_token,
                           body={"p_order_id": ORDER_ID, "p_paid": True})
    assert status == 200 and payment["paid"] is True, (status, payment)
    status, note = call("POST", "/rest/v1/rpc/set_order_organizer_note", ANON_KEY,
                        token=admin_token,
                        body={"p_order_id": ORDER_ID, "p_organizer_note": "管理室"})
    admin_can_update_payment_and_note = status == 200 and note["organizer_note"] == "管理室"
    assert admin_can_update_payment_and_note, (status, note)

    status, admin_rows = call(
        "GET", f"/rest/v1/organizer_order_status?order_id=eq.{ORDER_ID}",
        ANON_KEY, token=admin_token,
    )
    admin_can_read_status = status == 200 and admin_rows[0]["paid"] is True and admin_rows[0]["organizer_note"] == "管理室"
    assert admin_can_read_status, (status, admin_rows)

    status, resident_rows = call(
        "GET", f"/rest/v1/organizer_order_status?order_id=eq.{ORDER_ID}",
        ANON_KEY, token=resident_token,
    )
    resident_cannot_read_admin_view = status in (401, 403) or resident_rows == []
    assert resident_cannot_read_admin_view, (status, resident_rows)

    status, _ = call("POST", "/rest/v1/rpc/cancel_customer_order", ANON_KEY,
                     token=resident_token, body={"p_order_id": CANCEL_ORDER_ID})
    resident_cannot_cancel = status in (401, 403)
    assert resident_cannot_cancel, status

    status, _ = call("POST", "/rest/v1/rpc/cancel_customer_order", ANON_KEY,
                     token=admin_token, body={"p_order_id": CANCEL_ORDER_ID})
    closed_blocks_cancel = status in (400, 409, 422)
    assert closed_blocks_cancel, status

    assert call("POST", "/rest/v1/rpc/set_campaign_status", ANON_KEY, token=admin_token,
                body={"p_campaign_id": CAMPAIGN_ID, "p_status": "open"})[0] == 200

    status, cancelled = call("POST", "/rest/v1/rpc/cancel_customer_order", ANON_KEY,
                             token=admin_token, body={"p_order_id": CANCEL_ORDER_ID})
    admin_can_cancel_open_order = status == 200 and cancelled["order_id"] == CANCEL_ORDER_ID
    assert admin_can_cancel_open_order, (status, cancelled)

    remaining = [
        call("GET", f"/rest/v1/{table}?order_id=eq.{CANCEL_ORDER_ID}", SECRET_KEY)[1]
        for table in ("order_item", "payment", "organizer_order_note")
    ]
    remaining.append(call("GET", f"/rest/v1/orders?id=eq.{CANCEL_ORDER_ID}", SECRET_KEY)[1])
    cancel_removes_order_and_children = all(rows == [] for rows in remaining)
    assert cancel_removes_order_and_children, remaining

    # A real LINE-verified resident (line_resident_identity row present) may
    # share one household with another verified account; bind_customer_self
    # rejects only mismatched period/unit, not a second occupant of the same one.
    second_id, second_token = signup()
    extra_account_ids.append(second_id)
    assert call("POST", "/rest/v1/community_member", SECRET_KEY, prefer="return=minimal",
                body={"community_id": COMMUNITY_ID, "user_id": second_id})[0] in (200, 201)
    assert call("POST", "/rest/v1/line_resident_identity", SECRET_KEY, prefer="return=minimal",
                body={"line_user_id": f"verify-second-{second_id}", "auth_user_id": second_id,
                      "display_name": "共戶驗證帳號"})[0] in (200, 201)
    status, _ = call("POST", "/rest/v1/rpc/bind_customer_self", ANON_KEY, token=second_token,
                     body={"p_household_kind": "resident", "p_period": 2, "p_unit": "2K13"})
    shared_household_allows_second_account = status == 200
    assert shared_household_allows_second_account, status

    other_id, other_token = signup()
    extra_account_ids.append(other_id)
    assert call("POST", "/rest/v1/community_member", SECRET_KEY, prefer="return=minimal",
                body={"community_id": COMMUNITY_ID, "user_id": other_id})[0] in (200, 201)
    assert call("POST", "/rest/v1/line_resident_identity", SECRET_KEY, prefer="return=minimal",
                body={"line_user_id": f"verify-other-{other_id}", "auth_user_id": other_id,
                      "display_name": "社區外驗證帳號"})[0] in (200, 201)
    status, bound = call("POST", "/rest/v1/rpc/bind_customer_self", ANON_KEY, token=other_token,
                         body={"p_household_kind": "other", "p_period": None, "p_unit": None})
    other_binds_without_household = status == 200 and bound[0]["period"] is None and bound[0]["unit"] is None
    assert other_binds_without_household, (status, bound)

    # The frontend deployed in production today only ever calls the old
    # two-argument bind_customer_self(integer, text). Task 2 rewrote it into a
    # thin SQL wrapper that delegates to the three-argument version with
    # p_household_kind fixed to 'resident'. Prove that delegation end-to-end
    # with the exact call shape production makes: no kind argument at all.
    legacy_id, legacy_token = signup()
    extra_account_ids.append(legacy_id)
    assert call("POST", "/rest/v1/community_member", SECRET_KEY, prefer="return=minimal",
                body={"community_id": COMMUNITY_ID, "user_id": legacy_id})[0] in (200, 201)
    assert call("POST", "/rest/v1/line_resident_identity", SECRET_KEY, prefer="return=minimal",
                body={"line_user_id": f"verify-legacy-{legacy_id}", "auth_user_id": legacy_id,
                      "display_name": "舊版綁定驗證帳號"})[0] in (200, 201)
    status, legacy_bound = call("POST", "/rest/v1/rpc/bind_customer_self", ANON_KEY, token=legacy_token,
                                body={"p_period": 1, "p_unit": "A3"})
    legacy_two_arg_bind_still_works = (
        status == 200 and bool(legacy_bound)
        and legacy_bound[0]["period"] == 1 and legacy_bound[0]["unit"] == "A3"
    )
    if legacy_two_arg_bind_still_works:
        _, legacy_rows = call(
            "GET", f"/rest/v1/customer?id=eq.{legacy_bound[0]['id']}&select=household_kind", SECRET_KEY,
        )
        legacy_two_arg_bind_still_works = bool(legacy_rows) and legacy_rows[0]["household_kind"] == "resident"
    assert legacy_two_arg_bind_still_works, (status, legacy_bound)

    # The notification RPCs require the campaign to be closed or arrived; the
    # cancel-flow checks above reopened it, so close it again before reading.
    assert call("POST", "/rest/v1/rpc/set_campaign_status", ANON_KEY, token=admin_token,
                body={"p_campaign_id": CAMPAIGN_ID, "p_status": "closed"})[0] == 200

    status, recipients = call("POST", "/rest/v1/rpc/internal_pickup_notification_recipients", SECRET_KEY,
                              body={"p_campaign_id": CAMPAIGN_ID, "p_audience": "phase2"})
    pickup_excludes_other = status == 200 and all(row["unit"] is not None for row in recipients)
    assert pickup_excludes_other, (status, recipients)

    hashes = []
    for audience in ("phase13", "phase2"):
        _, rows = call("POST", "/rest/v1/rpc/internal_pickup_notification_recipients", SECRET_KEY,
                       body={"p_campaign_id": CAMPAIGN_ID, "p_audience": audience})
        _, digest = call("POST", "/rest/v1/rpc/internal_pickup_notification_eligible_hash", SECRET_KEY,
                         body={"p_campaign_id": CAMPAIGN_ID, "p_audience": audience})
        expected = hashlib.sha256("\n".join(sorted({row["line_user_id"] for row in rows})).encode()).hexdigest()
        hashes.append(digest == expected)
    recipients_match_eligibility_hash = all(hashes)
    assert recipients_match_eligibility_hash, hashes

    print(json.dumps({
        "checks": 16,
        "resident_cannot_close": resident_cannot_close,
        "admin_can_close": admin_can_close,
        "closed_blocks_order_edits": closed_blocks_order_edits,
        "resident_cannot_update_payment": resident_cannot_update_payment,
        "admin_can_update_payment_and_note": admin_can_update_payment_and_note,
        "admin_can_read_status": admin_can_read_status,
        "resident_cannot_read_admin_view": resident_cannot_read_admin_view,
        "resident_cannot_cancel": resident_cannot_cancel,
        "closed_blocks_cancel": closed_blocks_cancel,
        "admin_can_cancel_open_order": admin_can_cancel_open_order,
        "cancel_removes_order_and_children": cancel_removes_order_and_children,
        "shared_household_allows_second_account": shared_household_allows_second_account,
        "other_binds_without_household": other_binds_without_household,
        "legacy_two_arg_bind_still_works": legacy_two_arg_bind_still_works,
        "pickup_excludes_other": pickup_excludes_other,
        "recipients_match_eligibility_hash": recipients_match_eligibility_hash,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
