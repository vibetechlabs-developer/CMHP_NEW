# -*- coding: utf-8 -*-
"""Shared helper + accumulator used by every module_*.py file."""

OPS = []
_next_id = [1]


def op(module, method, path, action, scope, permissions, screen, version_req,
       purpose, path_params=None, query_params=None, auth=None, headers=None,
       request_fields=None, request_example=None, response_example=None,
       response_status=200, errors=None, side_effects=None, frontend_usage=None,
       source_files=None, status="code-verified", notes=None):
    o = {
        "id": f"op-{_next_id[0]:03d}",
        "module": module,
        "method": method,
        "path": path,
        "action": action,
        "scope": scope,
        "permissions": permissions,
        "screen": screen,
        "version_requirement": version_req,
        "status": status,
        "detail": {
            "purpose": purpose,
            "path_params": path_params or [],
            "query_params": query_params or [],
            "auth": auth or "Bearer access token required (Authorization header). Membership/permission re-checked server-side on every call.",
            "headers": headers or "Authorization: Bearer <access>. No CSRF header needed (CSRF only applies to the cookie-authenticated /auth/ endpoints).",
            "request_fields": request_fields or [],
            "request_example": request_example,
            "response_example": response_example,
            "response_status": response_status,
            "errors": errors or [],
            "side_effects": side_effects or "None beyond the described create/update — no stock, production or financial side effect exists anywhere in this API.",
            "frontend_usage": frontend_usage or "",
            "source_files": source_files or [],
        },
        "notes": notes or "",
    }
    _next_id[0] += 1
    OPS.append(o)
    return o


STD_ERRORS_RW = [
    {"status": 400, "condition": "Validation failure (bad field value, unknown/protected field, or business-rule rejection)."},
    {"status": 401, "condition": "Missing/invalid/expired access token."},
    {"status": 403, "condition": "Authenticated with membership, but the specific permission is missing (names it)."},
    {"status": 404, "condition": "No such resource, or no membership/access at all (deliberately indistinguishable)."},
]
STD_ERRORS_MUTATE = STD_ERRORS_RW + [
    {"status": 409, "condition": "Stale expected_version (or, for goods receipts, an idempotency-key content mismatch) — refetch and show the conflict, never silently retry."},
]
