from __future__ import annotations

import os
import unittest
from unittest.mock import Mock

os.environ.setdefault("API_URL", "https://example.test")
os.environ.setdefault("ANON_KEY", "test-anon")
os.environ.setdefault("SECRET_KEY", "test-secret")

from scripts.verify_admin_as_resident import (  # noqa: E402
    cleanup_fixtures,
    validate_order_wall_rows,
)


class AdminAsResidentVerificationTest(unittest.TestCase):
    def test_order_wall_allowlist_rejects_an_unexpected_identity_column(self) -> None:
        safe_row = {
            "campaign_slug": "slug",
            "campaign_id": "campaign",
            "order_id": "order",
            "customer_id": "customer",
            "customer_name": "住戶",
            "period": 2,
            "unit": "A01",
            "note": None,
            "ordered_at": "2026-08-12T00:00:00Z",
            "order_updated_at": "2026-08-12T00:00:00Z",
            "campaign_item_id": "item",
            "item_code": "ITEM1",
            "item_name": "A號",
            "sort_order": 0,
            "item_active": True,
            "qty": 1,
            "item_updated_at": "2026-08-12T00:00:00Z",
        }
        validate_order_wall_rows([safe_row])

        with self.assertRaisesRegex(AssertionError, "unexpected columns"):
            validate_order_wall_rows([{**safe_row, "line_user_id": "U-sensitive"}])

    def test_cleanup_continues_after_network_and_http_failures(self) -> None:
        responses = [
            OSError("network down"),
            (500, {"message": "failed"}),
            (204, None),
            (204, None),
            (204, None),
            (200, None),
            (200, None),
        ]
        call_fn = Mock(side_effect=responses)

        errors = cleanup_fixtures(
            call_fn,
            campaign_id="campaign",
            customer_ids=("customer-a", "customer-b"),
            admin_id="admin",
            user_ids=("admin", "resident"),
        )

        self.assertEqual(call_fn.call_count, 7)
        self.assertEqual(len(errors), 2)
        self.assertIn("network down", errors[0])
        self.assertIn("HTTP 500", errors[1])


if __name__ == "__main__":
    unittest.main()
