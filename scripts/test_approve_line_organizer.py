import importlib.util
import pathlib
import unittest

MODULE_PATH = pathlib.Path(__file__).with_name("approve_line_organizer.py")
SPEC = importlib.util.spec_from_file_location("approve_line_organizer", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class ApprovalReconciliationTest(unittest.TestCase):
    def test_rpc_transport_failure_reconciles_committed_approval_without_deleting_user(self):
        calls = []
        reconciled = False

        def request(method, path, body=None):
            nonlocal reconciled
            calls.append((method, path, body))
            if "line_organizer_identity" in path:
                return (200, [{"auth_user_id": "auth-1"}]) if reconciled else (200, [])
            if "line_organizer_request" in path:
                return 200, [{"request_code": "request-1", "display_name": "團主甲"}]
            if path.startswith("/auth/v1/admin/users") and method == "GET":
                return 200, {"users": []}
            if path == "/auth/v1/admin/users" and method == "POST":
                return 201, {"id": "auth-1"}
            if path == "/rest/v1/rpc/approve_line_organizer":
                reconciled = True
                raise TimeoutError("response lost")
            raise AssertionError((method, path, body))

        result = MODULE.approve("request-1", request)

        self.assertEqual(result["authUserId"], "auth-1")
        self.assertFalse(any(method == "DELETE" for method, _, _ in calls))

    def test_partial_auth_user_on_later_page_is_reused(self):
        calls = []
        request_code = "request-1"
        internal_email = f"line-organizer-{request_code}@auth.invalid"

        def request(method, path, body=None):
            calls.append((method, path, body))
            if "line_organizer_identity" in path:
                return 200, []
            if "line_organizer_request" in path:
                return 200, [{"request_code": request_code, "display_name": "團主甲"}]
            if path == "/auth/v1/admin/users?page=1&per_page=1000":
                return 200, {"users": [
                    {"id": f"other-{index}", "email": f"other-{index}@example.test"}
                    for index in range(1000)
                ]}
            if path == "/auth/v1/admin/users?page=2&per_page=1000":
                return 200, {"users": [{"id": "auth-later", "email": internal_email}]}
            if path == "/rest/v1/rpc/approve_line_organizer":
                self.assertEqual(body["p_auth_user_id"], "auth-later")
                return 200, "auth-later"
            raise AssertionError((method, path, body))

        result = MODULE.approve(request_code, request)

        self.assertEqual(result["authUserId"], "auth-later")
        self.assertFalse(any(
            method == "POST" and path == "/auth/v1/admin/users"
            for method, path, _ in calls
        ))

    def test_retry_returns_existing_approval_without_creating_or_approving_again(self):
        calls = []

        def request(method, path, body=None):
            calls.append((method, path, body))
            if "line_organizer_identity" in path:
                return 200, [{"auth_user_id": "auth-1"}]
            raise AssertionError((method, path, body))

        result = MODULE.approve("request-1", request)

        self.assertEqual(result["authUserId"], "auth-1")
        self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
