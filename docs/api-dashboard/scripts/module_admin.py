# -*- coding: utf-8 -*-
"""apps.authentication, apps.companies, apps.permissions, apps.stores,
apps.catalog, apps.suppliers — auth + administration + shared reference data."""
from common import op, STD_ERRORS_RW, STD_ERRORS_MUTATE

# ===========================================================================
# apps.authentication — public / CSRF, no company or store context
# ===========================================================================
op("authentication", "GET", "/api/v1/auth/csrf/", "Issue CSRF token", "public",
   [], "AUTH-01", "not applicable (GET)",
   "Issues the csrftoken cookie and returns the same token in the JSON body, for clients that cannot read cookies directly. Call once before any POST to /auth/login/, /auth/refresh/ or /auth/logout/.",
   auth="None — public endpoint.",
   headers="None required.",
   response_example={"csrfToken": "a1b2c3d4e5f6..."},
   errors=[],
   side_effects="Sets the csrftoken cookie. No database write.",
   frontend_usage="Step 1 of the session bootstrap sequence (see Start Here §1).",
   source_files=["apps/authentication/views.py", "apps/authentication/csrf.py"])

op("authentication", "POST", "/api/v1/auth/login/", "Log in", "public",
   [], "AUTH-01", "not applicable",
   "Exchanges username/password for a short-lived access token (JSON body) and a long-lived refresh token (HttpOnly cookie).",
   auth="None (this call establishes auth) — but requires a valid CSRF token from step 1.",
   headers="X-CSRFToken: <csrfToken from GET /auth/csrf/>. Content-Type: application/json.",
   request_fields=[
       {"name": "username", "required": True, "nullable": False, "notes": "Case-sensitive as stored."},
       {"name": "password", "required": True, "nullable": False, "notes": "Never logged; not returned in any response."},
   ],
   request_example={"username": "demo_sales", "password": "<ask the lead — never printed in documentation>"},
   response_example={"access": "eyJhbGciOi...", "user": {"id": 8, "username": "demo_sales", "email": "", "first_name": "", "last_name": ""}},
   response_status=200,
   errors=[
       {"status": 400, "condition": "Missing username/password, or CSRF token missing/invalid."},
       {"status": 401, "condition": "Wrong username/password, or the account is inactive."},
       {"status": 429, "condition": "Login throttle exceeded (5/min per IP by default, env-configurable)."},
   ],
   side_effects="Sets the HttpOnly refresh_token cookie (path-scoped to /api/v1/auth/, SameSite=Lax). Updates last_login.",
   frontend_usage="Step 2 of session bootstrap.",
   source_files=["apps/authentication/views.py", "apps/authentication/serializers.py"])

op("authentication", "POST", "/api/v1/auth/refresh/", "Refresh access token", "public",
   [], "AUTH-01 (background)", "not applicable",
   "Rotates the refresh cookie and issues a new short-lived access token. Entirely client-driven — nothing on the backend auto-refreshes.",
   auth="Cookie-authenticated (the refresh_token cookie, sent automatically by the browser under its path scope) + CSRF header.",
   headers="X-CSRFToken required (this is a POST).",
   request_fields=[], request_example={},
   response_example={"access": "eyJhbGciOi..."},
   errors=[{"status": 401, "condition": "Missing/expired/blacklisted refresh cookie, or the user has since been deactivated — the frontend must treat this as a full logout."}],
   side_effects="Rotates the refresh token (old one blacklisted, ROTATE_REFRESH_TOKENS=True) and re-sets the cookie. Re-checks the user is active in the database, not just token signature/expiry.",
   frontend_usage="Called proactively (timer just under 5 minutes) or reactively on a 401 from any protected endpoint. One retry per failed request, never a loop.",
   source_files=["apps/authentication/views.py"])

op("authentication", "POST", "/api/v1/auth/logout/", "Log out", "public",
   [], "AUTH-01", "not applicable",
   "Blacklists the refresh token found in the cookie and clears it. Idempotent — safe to call even with a missing/expired/already-blacklisted cookie.",
   auth="Cookie-authenticated + CSRF header.",
   headers="X-CSRFToken required.",
   request_fields=[], request_example={},
   response_example=None, response_status=204, errors=[],
   side_effects="Blacklists the refresh token; clears the cookie. Does NOT revoke any access token already handed out — it remains valid in memory until its own short expiry (accepted tradeoff, not a bug).",
   frontend_usage="Clear in-memory access token and any cached identity/workspace state; return to AUTH-01.",
   source_files=["apps/authentication/views.py"])

op("authentication", "GET", "/api/v1/auth/me/", "Current user identity", "authenticated",
   [], "AUTH-01 / NAV-01", "not applicable",
   "Confirms the access token actually works and returns the caller's display identity. Also returns read-only UI capabilities derived from the same rule the server enforces (currently capabilities.can_manage_material_catalog = active superuser). Capabilities are presentation hints only and grant nothing.",
   response_example={"id": 8, "username": "demo_sales", "email": "", "first_name": "", "last_name": "", "capabilities": {"can_manage_material_catalog": False}},
   errors=STD_ERRORS_RW[1:2],
   frontend_usage="Step 3 of session bootstrap — confirms the token before loading workspace data.",
   source_files=["apps/authentication/views.py"])

# ===========================================================================
# apps.companies
# ===========================================================================
op("companies", "GET", "/api/v1/companies/mine/", "Companies I belong to", "self",
   [], "NAV-01", "not applicable",
   "Companies the caller has an active membership in. Populates the company switcher. Zero companies is a valid, real state, not an error.",
   response_example={"companies": [{"id": 3, "code": "DEMOA", "legal_name": "CMHP Pharma A Pvt Ltd", "display_name": "Company A"}]},
   errors=STD_ERRORS_RW[1:2],
   frontend_usage="Step 4 of session bootstrap.",
   source_files=["apps/companies/views.py"])

op("companies", "GET", "/api/v1/companies/", "List companies (admin)", "configuration",
   ["active superuser"], "ADM-05", "not applicable",
   "Full list of every company in the system, for superuser administration.",
   query_params=[{"name": "search", "type": "string", "notes": "code/legal_name/display_name substring, case-insensitive."}, {"name": "is_active", "type": "strict bool", "default": "unset (both)"}],
   response_example={"count": 2, "next": None, "previous": None, "results": [{"id": 3, "code": "DEMOA", "legal_name": "CMHP Pharma A Pvt Ltd", "display_name": "Company A", "is_active": True, "version": 1}]},
   errors=STD_ERRORS_RW,
   source_files=["apps/companies/views.py", "apps/companies/serializers.py"])

op("companies", "POST", "/api/v1/companies/", "Create company", "configuration",
   ["active superuser"], "ADM-05 / ADM-06", "no (no version concept in this admin module)",
   "Creates a new operating company.",
   request_fields=[
       {"name": "code", "required": True, "immutable": True, "notes": "Normalized (trimmed, upper-cased). Permanently immutable once created."},
       {"name": "legal_name", "required": True},
       {"name": "display_name", "required": True},
   ],
   request_example={"code": "CMHP-B", "legal_name": "CMHP Pharma B Pvt Ltd", "display_name": "Company B"},
   response_example={"id": 4, "code": "CMHP-B", "legal_name": "CMHP Pharma B Pvt Ltd", "display_name": "Company B", "is_active": True, "version": 1},
   response_status=201,
   errors=STD_ERRORS_RW,
   source_files=["apps/companies/views.py", "apps/companies/serializers.py"])

op("companies", "GET", "/api/v1/companies/<company_id>/", "Company detail", "configuration",
   ["active superuser"], "ADM-07", "not applicable",
   "Full detail of one company.",
   path_params=[{"name": "company_id", "type": "int"}],
   response_example={"id": 3, "code": "DEMOA", "legal_name": "CMHP Pharma A Pvt Ltd", "display_name": "Company A", "is_active": True, "version": 1},
   errors=STD_ERRORS_RW,
   source_files=["apps/companies/views.py"])

op("companies", "PATCH", "/api/v1/companies/<company_id>/", "Edit company metadata", "configuration",
   ["active superuser"], "ADM-07", "no (no version concept in this admin module)",
   "Edits legal_name/display_name. code stays permanently immutable.",
   path_params=[{"name": "company_id", "type": "int"}],
   request_fields=[{"name": "legal_name", "required": False}, {"name": "display_name", "required": False}],
   request_example={"legal_name": "CMHP Pharma A Pvt Ltd (Updated)"},
   response_example={"id": 3, "code": "DEMOA", "legal_name": "CMHP Pharma A Pvt Ltd (Updated)", "display_name": "Company A", "is_active": True, "version": 1},
   errors=STD_ERRORS_RW,
   notes="This admin module has no expected_version/optimistic-concurrency field anywhere in its serializers — confirmed by direct code search (apps/companies/serializers.py has no 'version' reference at all). A concurrent edit here can silently overwrite another admin's change; unlike every core business-transaction module, there is no conflict detection on this resource today.",
   source_files=["apps/companies/views.py", "apps/companies/serializers.py"])

op("companies", "POST", "/api/v1/companies/<company_id>/activate/", "Reactivate company", "configuration",
   ["active superuser"], "ADM-07", "no",
   "Reactivates a deactivated company.",
   path_params=[{"name": "company_id", "type": "int"}],
   request_fields=[], request_example={},
   response_example={"id": 3, "code": "DEMOA", "is_active": True},
   errors=STD_ERRORS_RW,
   source_files=["apps/companies/views.py"])

op("companies", "POST", "/api/v1/companies/<company_id>/deactivate/", "Deactivate company", "configuration",
   ["active superuser"], "ADM-07", "no",
   "Deactivates a company. Every company-scoped resource under it becomes unreachable for non-superusers (folded into 404).",
   path_params=[{"name": "company_id", "type": "int"}],
   request_fields=[], request_example={},
   response_example={"id": 3, "code": "DEMOA", "is_active": False},
   errors=STD_ERRORS_RW,
   source_files=["apps/companies/views.py"])

# ===========================================================================
# apps.permissions — permission catalog + company-role AND store-role
# management + the two "my-permissions" self-lookups
# ===========================================================================
op("permissions", "GET", "/api/v1/permissions/", "Permission catalog", "configuration",
   ["active superuser"], "ADM-08", "not applicable",
   "Full catalog of every permission code defined in the system.",
   query_params=[
       {"name": "search", "type": "string"}, {"name": "module", "type": "string"},
       {"name": "scope", "type": "enum COMPANY|STORE", "notes": "400 on any other value."},
       {"name": "is_active", "type": "strict bool"}, {"name": "page_size", "type": "int", "notes": "Request 100 for a full picker — default page size is 20 and this catalog regularly exceeds it."},
   ],
   response_example={"count": 143, "next": "http://.../?page=2", "previous": None, "results": [{"id": 1, "code": "customers.view", "module": "customers", "scope": "COMPANY", "description": "View customers", "is_active": True}]},
   errors=STD_ERRORS_RW,
   source_files=["apps/permissions/views.py", "apps/permissions/serializers.py"])

op("permissions", "GET", "/api/v1/companies/<company_id>/roles/", "List company roles", "company",
   ["active superuser"], "ADM-09", "not applicable",
   "Roles defined for one company.",
   path_params=[{"name": "company_id", "type": "int"}],
   response_example={"count": 3, "next": None, "previous": None, "results": [{"id": 5, "company_id": 3, "code": "sales-rep", "name": "Sales Representative", "is_active": True}]},
   errors=STD_ERRORS_RW, source_files=["apps/permissions/views.py"])

op("permissions", "POST", "/api/v1/companies/<company_id>/roles/", "Create company role", "company",
   ["active superuser"], "ADM-09", "no (no version concept in this admin module)",
   "Creates a named role in one company. Holds no permissions until PUT .../permissions/ assigns some.",
   path_params=[{"name": "company_id", "type": "int"}],
   request_fields=[{"name": "code", "required": True, "immutable": True}, {"name": "name", "required": True}, {"name": "description", "required": False}],
   request_example={"code": "sales-rep", "name": "Sales Representative", "description": ""},
   response_example={"id": 5, "company_id": 3, "code": "sales-rep", "name": "Sales Representative", "description": "", "is_active": True},
   response_status=201, errors=STD_ERRORS_RW, source_files=["apps/permissions/views.py"])

op("permissions", "GET", "/api/v1/companies/<company_id>/roles/<role_id>/", "Company role detail", "company",
   ["active superuser"], "ADM-10", "not applicable",
   "Detail of one company role, including its assigned permission_codes.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "role_id", "type": "int"}],
   response_example={"id": 5, "company_id": 3, "code": "sales-rep", "name": "Sales Representative", "is_active": True, "permission_codes": ["customers.view", "products.view"]},
   errors=STD_ERRORS_RW, source_files=["apps/permissions/views.py"])

op("permissions", "PATCH", "/api/v1/companies/<company_id>/roles/<role_id>/", "Edit company role name/description", "company",
   ["active superuser"], "ADM-10", "no (no version concept in this admin module)",
   "Edits name/description only. code is immutable. Permission assignment is a separate endpoint (PUT .../permissions/).",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "role_id", "type": "int"}],
   request_fields=[{"name": "name", "required": False}, {"name": "description", "required": False}],
   request_example={"name": "Senior Sales Representative"},
   response_example={"id": 5, "company_id": 3, "code": "sales-rep", "name": "Senior Sales Representative", "is_active": True},
   errors=STD_ERRORS_RW, source_files=["apps/permissions/views.py"])

op("permissions", "POST", "/api/v1/companies/<company_id>/roles/<role_id>/activate/", "Reactivate company role", "company",
   ["active superuser"], "ADM-10", "no",
   "Reactivates a deactivated role.", path_params=[{"name": "company_id", "type": "int"}, {"name": "role_id", "type": "int"}],
   request_fields=[], request_example={}, response_example={"id": 5, "is_active": True}, errors=STD_ERRORS_RW, source_files=["apps/permissions/views.py"])

op("permissions", "POST", "/api/v1/companies/<company_id>/roles/<role_id>/deactivate/", "Deactivate company role", "company",
   ["active superuser"], "ADM-10", "no",
   "Deactivates a role. Users holding it keep whatever effective permissions come from their OTHER active roles only.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "role_id", "type": "int"}],
   request_fields=[], request_example={}, response_example={"id": 5, "is_active": False}, errors=STD_ERRORS_RW, source_files=["apps/permissions/views.py"])

op("permissions", "PUT", "/api/v1/companies/<company_id>/roles/<role_id>/permissions/", "Replace company role's permission set", "company",
   ["active superuser"], "ADM-10", "no (full-replace endpoint, not version-gated)",
   "Full atomic replace of a role's entire COMPANY-scope permission set — not additive. Omitting a currently-assigned code removes it.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "role_id", "type": "int"}],
   request_fields=[{"name": "permission_codes", "required": True, "notes": "Array of permission code strings, COMPANY scope only."}],
   request_example={"permission_codes": ["customers.view", "customers.create", "products.view"]},
   response_example={"id": 5, "code": "sales-rep", "permission_codes": ["customers.view", "customers.create", "products.view"]},
   errors=STD_ERRORS_RW + [{"status": 400, "condition": "The company or role is inactive."}],
   side_effects="Every user holding this role sees their effective permissions change on their next request — no session invalidation needed, since permissions are re-resolved from the database on every call.",
   source_files=["apps/permissions/views.py", "apps/permissions/services.py"])

op("permissions", "GET", "/api/v1/stores/<store_id>/roles/", "List store roles", "store",
   ["active superuser"], "ADM-13", "not applicable",
   "Roles defined for one shared store (mirrors company roles).", path_params=[{"name": "store_id", "type": "int"}],
   response_example={"count": 1, "next": None, "previous": None, "results": [{"id": 9, "store_id": 4, "code": "store-clerk", "name": "Store Clerk", "is_active": True}]},
   errors=STD_ERRORS_RW, source_files=["apps/permissions/views.py"])

op("permissions", "POST", "/api/v1/stores/<store_id>/roles/", "Create store role", "store",
   ["active superuser"], "ADM-13", "no",
   "Creates a named role in one shared store.", path_params=[{"name": "store_id", "type": "int"}],
   request_fields=[{"name": "code", "required": True, "immutable": True}, {"name": "name", "required": True}, {"name": "description", "required": False}],
   request_example={"code": "store-clerk", "name": "Store Clerk"},
   response_example={"id": 9, "store_id": 4, "code": "store-clerk", "name": "Store Clerk", "is_active": True},
   response_status=201, errors=STD_ERRORS_RW, source_files=["apps/permissions/views.py"])

op("permissions", "GET", "/api/v1/stores/<store_id>/roles/<role_id>/", "Store role detail", "store",
   ["active superuser"], "ADM-13", "not applicable",
   "Detail of one store role, including assigned permission_codes.", path_params=[{"name": "store_id", "type": "int"}, {"name": "role_id", "type": "int"}],
   response_example={"id": 9, "store_id": 4, "code": "store-clerk", "name": "Store Clerk", "permission_codes": ["receiving.view"]},
   errors=STD_ERRORS_RW, source_files=["apps/permissions/views.py"])

op("permissions", "PATCH", "/api/v1/stores/<store_id>/roles/<role_id>/", "Edit store role name/description", "store",
   ["active superuser"], "ADM-13", "no",
   "Edits name/description only.", path_params=[{"name": "store_id", "type": "int"}, {"name": "role_id", "type": "int"}],
   request_fields=[{"name": "name", "required": False}, {"name": "description", "required": False}],
   request_example={"name": "Senior Store Clerk"}, response_example={"id": 9, "name": "Senior Store Clerk"},
   errors=STD_ERRORS_RW, source_files=["apps/permissions/views.py"])

op("permissions", "POST", "/api/v1/stores/<store_id>/roles/<role_id>/activate/", "Reactivate store role", "store",
   ["active superuser"], "ADM-13", "no", "Reactivates a deactivated store role.",
   path_params=[{"name": "store_id", "type": "int"}, {"name": "role_id", "type": "int"}],
   request_fields=[], request_example={}, response_example={"id": 9, "is_active": True}, errors=STD_ERRORS_RW, source_files=["apps/permissions/views.py"])

op("permissions", "POST", "/api/v1/stores/<store_id>/roles/<role_id>/deactivate/", "Deactivate store role", "store",
   ["active superuser"], "ADM-13", "no", "Deactivates a store role.",
   path_params=[{"name": "store_id", "type": "int"}, {"name": "role_id", "type": "int"}],
   request_fields=[], request_example={}, response_example={"id": 9, "is_active": False}, errors=STD_ERRORS_RW, source_files=["apps/permissions/views.py"])

op("permissions", "PUT", "/api/v1/stores/<store_id>/roles/<role_id>/permissions/", "Replace store role's permission set", "store",
   ["active superuser"], "ADM-13", "no (full-replace endpoint, not version-gated)",
   "Full atomic replace of a role's entire STORE-scope permission set.",
   path_params=[{"name": "store_id", "type": "int"}, {"name": "role_id", "type": "int"}],
   request_fields=[{"name": "permission_codes", "required": True, "notes": "Array of permission code strings, STORE scope only."}],
   request_example={"permission_codes": ["receiving.view", "receiving.create"]},
   response_example={"id": 9, "code": "store-clerk", "permission_codes": ["receiving.view", "receiving.create"]},
   errors=STD_ERRORS_RW + [{"status": 400, "condition": "The store or role is inactive."}],
   source_files=["apps/permissions/views.py"])

op("permissions", "GET", "/api/v1/companies/<company_id>/my-permissions/", "My effective permissions in this company", "company",
   ["none beyond active membership"], "NAV-02", "not applicable",
   "The caller's OWN effective permission codes in this company — never another user's.",
   path_params=[{"name": "company_id", "type": "int"}],
   response_example={"company_id": 3, "permissions": ["customers.view", "products.view", "sales_orders.view", "sales_orders.create"]},
   errors=[{"status": 401, "condition": "Missing/invalid access token."}, {"status": 404, "condition": "Nonexistent company, inactive company, and no active membership all produce the identical 404 — no distinction."}],
   frontend_usage="Drives which buttons/menu items NAV-02 and every other screen shows for the current company.",
   source_files=["apps/permissions/views.py"])

op("permissions", "GET", "/api/v1/stores/<store_id>/my-permissions/", "My effective permissions in this store", "store",
   ["none beyond active membership"], "NAV-02", "not applicable",
   "The caller's own effective permission codes in this shared store.",
   path_params=[{"name": "store_id", "type": "int"}],
   response_example={"store_id": 4, "permissions": ["receiving.view", "receiving.create"]},
   errors=[{"status": 401, "condition": "Missing/invalid access token."}, {"status": 404, "condition": "Nonexistent/inactive store or no active membership — identical 404."}],
   source_files=["apps/permissions/views.py"])

# ===========================================================================
# apps.stores — shared store CRUD/lifecycle, memberships, storage locations
# ===========================================================================
op("stores", "GET", "/api/v1/stores/mine/", "Stores I belong to", "self",
   [], "NAV-01", "not applicable",
   "Shared stores the caller has an active membership in. Zero is a valid state.",
   response_example={"stores": [{"id": 4, "code": "DEMOWH", "name": "Demo Warehouse"}]},
   errors=STD_ERRORS_RW[1:2], source_files=["apps/stores/views.py"])

op("stores", "GET", "/api/v1/stores/<store_id>/overview/", "Store identity summary", "store",
   ["shared_store.view"], "NAV-03", "not applicable",
   "Store identity summary only — no stock/quantity data of any kind exists on this or any other endpoint.",
   path_params=[{"name": "store_id", "type": "int"}],
   response_example={"id": 4, "code": "DEMOWH", "name": "Demo Warehouse", "is_active": True},
   errors=STD_ERRORS_RW, source_files=["apps/stores/views.py"])

op("stores", "GET", "/api/v1/stores/", "List stores (admin)", "configuration",
   ["active superuser"], "ADM-11", "not applicable",
   "Full list of every shared store.",
   response_example={"count": 1, "next": None, "previous": None, "results": [{"id": 4, "code": "DEMOWH", "name": "Demo Warehouse", "is_active": True}]},
   errors=STD_ERRORS_RW, source_files=["apps/stores/views.py"])

op("stores", "POST", "/api/v1/stores/", "Create store", "configuration",
   ["active superuser"], "ADM-11", "no",
   "Creates a shared store (physically one store, shared by both operating companies).",
   request_fields=[{"name": "code", "required": True, "immutable": True}, {"name": "name", "required": True}],
   request_example={"code": "DEMOWH", "name": "Demo Warehouse"},
   response_example={"id": 4, "code": "DEMOWH", "name": "Demo Warehouse", "is_active": True},
   response_status=201, errors=STD_ERRORS_RW, source_files=["apps/stores/views.py"])

op("stores", "GET", "/api/v1/stores/<store_id>/", "Store detail", "configuration",
   ["active superuser"], "ADM-12", "not applicable", "Full detail of one store.",
   path_params=[{"name": "store_id", "type": "int"}],
   response_example={"id": 4, "code": "DEMOWH", "name": "Demo Warehouse", "is_active": True},
   errors=STD_ERRORS_RW, source_files=["apps/stores/views.py"])

op("stores", "PATCH", "/api/v1/stores/<store_id>/", "Edit store metadata", "configuration",
   ["active superuser"], "ADM-12", "no", "Edits name. code is immutable.",
   path_params=[{"name": "store_id", "type": "int"}],
   request_fields=[{"name": "name", "required": False}], request_example={"name": "Main Warehouse"},
   response_example={"id": 4, "code": "DEMOWH", "name": "Main Warehouse"},
   errors=STD_ERRORS_RW, source_files=["apps/stores/views.py"])

op("stores", "POST", "/api/v1/stores/<store_id>/activate/", "Reactivate store", "configuration",
   ["active superuser"], "ADM-12", "no", "Reactivates a deactivated store.",
   path_params=[{"name": "store_id", "type": "int"}], request_fields=[], request_example={},
   response_example={"id": 4, "is_active": True}, errors=STD_ERRORS_RW, source_files=["apps/stores/views.py"])

op("stores", "POST", "/api/v1/stores/<store_id>/deactivate/", "Deactivate store", "configuration",
   ["active superuser"], "ADM-12", "no", "Deactivates a store. Every store-scoped resource under it becomes unreachable for non-superusers.",
   path_params=[{"name": "store_id", "type": "int"}], request_fields=[], request_example={},
   response_example={"id": 4, "is_active": False}, errors=STD_ERRORS_RW, source_files=["apps/stores/views.py"])

op("stores", "GET", "/api/v1/stores/<store_id>/memberships/", "List store memberships", "store",
   ["active superuser"], "ADM-14", "not applicable",
   "List a store's memberships. Returns a bare JSON array, NOT the paginated envelope — one of only four endpoints in this API that don't paginate.",
   path_params=[{"name": "store_id", "type": "int"}],
   response_example=[{"id": 20, "store_id": 4, "user_id": 8, "username": "demo_sales", "is_active": True}],
   errors=STD_ERRORS_RW, source_files=["apps/stores/views.py"])

op("stores", "POST", "/api/v1/stores/<store_id>/memberships/", "Grant/reactivate a store membership", "store",
   ["active superuser"], "ADM-14", "no",
   "Grants a user active membership in this store, or reactivates an existing inactive one.",
   path_params=[{"name": "store_id", "type": "int"}],
   request_fields=[{"name": "user_id", "required": True}],
   request_example={"user_id": 8}, response_example={"id": 20, "store_id": 4, "user_id": 8, "is_active": True},
   response_status=201, errors=STD_ERRORS_RW, source_files=["apps/stores/views.py"])

op("stores", "POST", "/api/v1/stores/<store_id>/memberships/<membership_id>/deactivate/", "Revoke a store membership", "store",
   ["active superuser"], "ADM-14", "no", "Revokes membership; every store-scoped role assignment under it stops taking effect.",
   path_params=[{"name": "store_id", "type": "int"}, {"name": "membership_id", "type": "int"}],
   request_fields=[], request_example={}, response_example={"id": 20, "is_active": False},
   errors=STD_ERRORS_RW, source_files=["apps/stores/views.py"])

op("stores", "GET", "/api/v1/stores/<store_id>/memberships/<membership_id>/roles/", "List a membership's store roles", "store",
   ["active superuser"], "ADM-14", "not applicable",
   "Role assignments for one membership. Bare array, not paginated.",
   path_params=[{"name": "store_id", "type": "int"}, {"name": "membership_id", "type": "int"}],
   response_example=[{"id": 40, "membership_id": 20, "role_id": 9, "role_code": "store-clerk", "is_active": True}],
   errors=STD_ERRORS_RW, source_files=["apps/stores/views.py"])

op("stores", "POST", "/api/v1/stores/<store_id>/memberships/<membership_id>/roles/", "Assign a store role", "store",
   ["active superuser"], "ADM-14", "no",
   "Assigns a store role to a membership.", path_params=[{"name": "store_id", "type": "int"}, {"name": "membership_id", "type": "int"}],
   request_fields=[{"name": "role_id", "required": True}], request_example={"role_id": 9},
   response_example={"id": 40, "membership_id": 20, "role_id": 9, "is_active": True},
   response_status=201, errors=STD_ERRORS_RW, source_files=["apps/stores/views.py"])

op("stores", "POST", "/api/v1/stores/<store_id>/memberships/<membership_id>/roles/<assignment_id>/deactivate/", "Unassign a store role", "store",
   ["active superuser"], "ADM-14", "no", "Deactivates one role assignment (not the membership itself).",
   path_params=[{"name": "store_id", "type": "int"}, {"name": "membership_id", "type": "int"}, {"name": "assignment_id", "type": "int"}],
   request_fields=[], request_example={}, response_example={"id": 40, "is_active": False},
   errors=STD_ERRORS_RW, source_files=["apps/stores/views.py"])

op("stores", "GET", "/api/v1/stores/<store_id>/locations/", "List storage locations", "store",
   ["active superuser", "or storage_locations.view for any active store member (read)"], "CAT-04", "not applicable",
   "List storage locations within a store.", path_params=[{"name": "store_id", "type": "int"}],
   response_example={"count": 2, "next": None, "previous": None, "results": [{"id": 15, "store_id": 4, "code": "A1", "name": "Aisle 1", "is_active": True}]},
   errors=STD_ERRORS_RW, source_files=["apps/stores/views.py"])

op("stores", "POST", "/api/v1/stores/<store_id>/locations/", "Create storage location", "store",
   ["active superuser"], "CAT-04", "no", "Creates a storage location within a store.",
   path_params=[{"name": "store_id", "type": "int"}],
   request_fields=[{"name": "code", "required": True, "immutable": True}, {"name": "name", "required": True}],
   request_example={"code": "A1", "name": "Aisle 1"}, response_example={"id": 15, "store_id": 4, "code": "A1", "name": "Aisle 1", "is_active": True},
   response_status=201, errors=STD_ERRORS_RW, source_files=["apps/stores/views.py"])

op("stores", "GET", "/api/v1/stores/<store_id>/locations/<location_id>/", "Storage location detail", "store",
   ["active superuser", "or storage_locations.view (read)"], "CAT-04", "not applicable",
   "Detail of one storage location.", path_params=[{"name": "store_id", "type": "int"}, {"name": "location_id", "type": "int"}],
   response_example={"id": 15, "store_id": 4, "code": "A1", "name": "Aisle 1", "is_active": True},
   errors=STD_ERRORS_RW, source_files=["apps/stores/views.py"])

op("stores", "PATCH", "/api/v1/stores/<store_id>/locations/<location_id>/", "Edit storage location", "store",
   ["active superuser"], "CAT-04", "no", "Edits name. code is immutable.",
   path_params=[{"name": "store_id", "type": "int"}, {"name": "location_id", "type": "int"}],
   request_fields=[{"name": "name", "required": False}], request_example={"name": "Aisle 1 (Cold Storage)"},
   response_example={"id": 15, "code": "A1", "name": "Aisle 1 (Cold Storage)"},
   errors=STD_ERRORS_RW, source_files=["apps/stores/views.py"])

op("stores", "POST", "/api/v1/stores/<store_id>/locations/<location_id>/activate/", "Reactivate storage location", "store",
   ["active superuser"], "CAT-04", "no", "Reactivates a deactivated location.",
   path_params=[{"name": "store_id", "type": "int"}, {"name": "location_id", "type": "int"}],
   request_fields=[], request_example={}, response_example={"id": 15, "is_active": True}, errors=STD_ERRORS_RW, source_files=["apps/stores/views.py"])

op("stores", "POST", "/api/v1/stores/<store_id>/locations/<location_id>/deactivate/", "Deactivate storage location", "store",
   ["active superuser"], "CAT-04", "no", "Deactivates a location.",
   path_params=[{"name": "store_id", "type": "int"}, {"name": "location_id", "type": "int"}],
   request_fields=[], request_example={}, response_example={"id": 15, "is_active": False}, errors=STD_ERRORS_RW, source_files=["apps/stores/views.py"])

# ===========================================================================
# apps.catalog — units of measure, material categories, materials (shared
# across companies, no version/concurrency concept exists on any of them —
# confirmed by direct code search of apps/catalog/serializers.py)
# ===========================================================================
CATALOG_NOTE = "This entire module (units, categories, materials) has no expected_version field or 'version' response key anywhere — confirmed by direct code search of apps/catalog/serializers.py, which contains zero references to 'version'. Unlike every core business-transaction module, edits here are unconditional overwrites with no optimistic-concurrency conflict detection."

for kind, seg, screen, code_ex, name_ex, extra_fields, extra_ex in [
    ("units", "units", "CAT-01", "KG", "Kilogram", [{"name": "dimension", "required": True, "immutable": True, "notes": "MASS/VOLUME/COUNT — immutable."}, {"name": "canonical_factor", "required": True, "immutable": True, "notes": "Conversion factor to the dimension's canonical unit — immutable."}], {"dimension": "MASS", "canonical_factor": "1"}),
    ("material-categories", "material-categories", "CAT-02", "APIS", "Active Pharmaceutical Ingredients", [], {}),
    ("materials", "materials", "CAT-03", "PARA-500", "Paracetamol 500mg (bulk)", [{"name": "kind", "required": True, "notes": "RAW_MATERIAL or PACKAGING_MATERIAL."}, {"name": "category_id", "required": False}, {"name": "base_unit_id", "required": True, "immutable": True}], {"kind": "RAW_MATERIAL", "category_id": 2, "base_unit_id": 1}),
]:
    read_perm = ["active superuser", "or shared_catalog.view in any active store (read)"]
    op("catalog", "GET", f"/api/v1/{seg}/", f"List {kind.replace('-', ' ')}", "shared (cross-company)",
       read_perm, screen, "not applicable", f"Lists {kind.replace('-', ' ')} — shared reference data, not scoped to any company.",
       query_params=[{"name": "search", "type": "string"}, {"name": "is_active", "type": "strict bool"}] + ([{"name": "kind", "type": "enum RAW_MATERIAL|PACKAGING_MATERIAL"}, {"name": "category", "type": "int"}, {"name": "base_unit", "type": "int", "notes": "Strict integer, 400 on non-integer."}] if kind == "materials" else []),
       response_example={"count": 1, "next": None, "previous": None, "results": [dict({"id": 1, "code": code_ex, "name": name_ex, "is_active": True}, **extra_ex)]},
       errors=STD_ERRORS_RW, notes=CATALOG_NOTE, source_files=["apps/catalog/views.py", "apps/catalog/serializers.py"])
    op("catalog", "POST", f"/api/v1/{seg}/", f"Create {kind[:-1] if kind.endswith('s') else kind}", "shared (cross-company)",
       ["active superuser"], screen, "no (no version concept in this module)", f"Creates a new {kind.replace('-', ' ')} entry.",
       request_fields=[{"name": "code", "required": True, "immutable": True}, {"name": "name", "required": True}] + extra_fields,
       request_example=dict({"code": code_ex, "name": name_ex}, **extra_ex),
       response_example=dict({"id": 1, "code": code_ex, "name": name_ex, "is_active": True}, **extra_ex),
       response_status=201, errors=STD_ERRORS_RW, notes=CATALOG_NOTE, source_files=["apps/catalog/views.py", "apps/catalog/serializers.py"])
    id_param = "unit_id" if kind == "units" else ("category_id" if kind == "material-categories" else "material_id")
    op("catalog", "GET", f"/api/v1/{seg}/<{id_param}>/", f"{kind[:-1].capitalize()} detail", "shared (cross-company)",
       read_perm, screen, "not applicable", f"Detail of one {kind[:-1]}.",
       path_params=[{"name": id_param, "type": "int"}],
       response_example=dict({"id": 1, "code": code_ex, "name": name_ex, "is_active": True}, **extra_ex),
       errors=STD_ERRORS_RW, notes=CATALOG_NOTE, source_files=["apps/catalog/views.py"])
    op("catalog", "PATCH", f"/api/v1/{seg}/<{id_param}>/", f"Edit {kind[:-1]} name", "shared (cross-company)",
       ["active superuser"], screen, "no (no version concept in this module)", "Edits name (and description for materials). code and other immutable fields cannot change.",
       path_params=[{"name": id_param, "type": "int"}],
       request_fields=[{"name": "name", "required": False}],
       request_example={"name": name_ex + " (Updated)"},
       response_example={"id": 1, "code": code_ex, "name": name_ex + " (Updated)"},
       errors=STD_ERRORS_RW, notes=CATALOG_NOTE, source_files=["apps/catalog/views.py"])
    op("catalog", "POST", f"/api/v1/{seg}/<{id_param}>/activate/", f"Reactivate {kind[:-1]}", "shared (cross-company)",
       ["active superuser"], screen, "no", f"Reactivates a deactivated {kind[:-1]}.",
       path_params=[{"name": id_param, "type": "int"}], request_fields=[], request_example={},
       response_example={"id": 1, "is_active": True}, errors=STD_ERRORS_RW, source_files=["apps/catalog/views.py"])
    op("catalog", "POST", f"/api/v1/{seg}/<{id_param}>/deactivate/", f"Deactivate {kind[:-1]}", "shared (cross-company)",
       ["active superuser"], screen, "no", f"Deactivates a {kind[:-1]}." + (" Blocked while an active material still references it." if kind == "units" else ""),
       path_params=[{"name": id_param, "type": "int"}], request_fields=[], request_example={},
       response_example={"id": 1, "is_active": False},
       errors=STD_ERRORS_RW + ([{"status": 400, "condition": "An active material still references this unit as its base_unit."}] if kind == "units" else []),
       source_files=["apps/catalog/views.py"])

# ===========================================================================
# apps.material_imports — Material Master CSV Import (Task 14C). Active-
# superuser-only, matching apps.catalog's OWN existing material-create
# authorization exactly - never relaxed to shared_catalog.view. No
# company scope anywhere - materials are shared, cross-company identities.
# Backend only; no frontend screen built yet.
# ===========================================================================
op("material_imports", "POST", "/api/v1/materials/import-preview/", "Preview a material CSV import", "shared (cross-company)",
   ["active superuser"], "none yet (backend only)", "no (new resource each call)",
   "Multipart upload (field 'file'). Never creates a Material - only validates and stages the file. Always returns 201, even for a file this task cannot parse at all.",
   request_fields=[{"name": "file", "required": True, "notes": "multipart/form-data field. Columns: code, name, material_type (RAW_MATERIAL/PACKAGING_MATERIAL, required), base_unit_code (required), description (optional). base_unit is resolved against existing ACTIVE units only - never auto-created, never an inferred conversion factor."}],
   response_example={"id": 3, "status": "PREVIEWED", "total_rows": 2, "valid_rows": 2, "invalid_rows": 0, "eligible_for_commit": True, "file_errors": [], "version": 1, "rows": {"count": 2, "results": [{"row_number": 1, "code": "RM-201", "material_type": "RAW_MATERIAL", "is_valid": True}]}},
   response_status=201, errors=STD_ERRORS_RW,
   side_effects="Persists a MaterialImportBatch + its normalized MaterialImportRow rows only - no Material row is ever created by this endpoint.",
   source_files=["apps/material_imports/views.py", "apps/material_imports/services.py", "apps/material_imports/models.py"])

op("material_imports", "GET", "/api/v1/materials/import-preview/<batch_id>/", "Get material import preview detail (paginated rows)", "shared (cross-company)",
   ["active superuser"], "none yet (backend only)", "not applicable",
   "Same shape as the preview response; ?page=/?page_size= over the row list. Ownership-scoped (no company axis) - a different superuser gets 404, never someone else's preview.",
   path_params=[{"name": "batch_id", "type": "int"}],
   query_params=[{"name": "page", "type": "int"}, {"name": "page_size", "type": "int", "notes": "max 100"}],
   response_example={"id": 3, "status": "PREVIEWED", "rows": {"count": 2, "next": None, "previous": None, "results": []}},
   errors=STD_ERRORS_RW, source_files=["apps/material_imports/views.py"])

op("material_imports", "POST", "/api/v1/materials/import-commit/", "Commit a material CSV import", "shared (cross-company)",
   ["active superuser"], "none yet (backend only)", "yes (see notes - the SAME token repeated after success returns the ORIGINAL result, not a 409)",
   "All-or-nothing: any invalid row, or a code/unit that changed since preview, blocks the ENTIRE commit. Create-only - never updates, reactivates or overwrites an existing Material. Body references the server-issued preview id only, never a replacement material list.",
   request_fields=[{"name": "preview_id", "required": True}, {"name": "expected_version", "required": True, "notes": "Always the value the preview response reported - this resource's version never changes."}],
   request_example={"preview_id": 3, "expected_version": 1},
   response_example={"id": 3, "status": "COMMITTED", "created_material_ids": [701, 702]},
   errors=STD_ERRORS_MUTATE + [{"status": 400, "condition": "Preview expired, ineligible, or a code/unit changed since preview - no materials created."}],
   notes="version is fixed at 1 for the resource's whole life; the concurrency guard is the row lock + status field, not an incrementing counter - same design as apps.product_imports/apps.formula_imports (Tasks 14A/14B). See docs/backend-decisions.md, Task 14C.",
   source_files=["apps/material_imports/views.py", "apps/material_imports/services.py"])

# ===========================================================================
# apps.suppliers — shared, cross-company, superuser-administered
# ===========================================================================
op("suppliers", "GET", "/api/v1/suppliers/", "List suppliers", "shared (cross-company)",
   ["active superuser"], "ADM-11/12 area", "not applicable", "Lists suppliers — shared reference data.",
   query_params=[{"name": "search", "type": "string"}, {"name": "is_active", "type": "strict bool"}],
   response_example={"count": 1, "next": None, "previous": None, "results": [{"id": 9, "code": "ACME", "legal_name": "Acme Herbs Pvt Ltd", "is_active": True}]},
   errors=STD_ERRORS_RW, source_files=["apps/suppliers/views.py"])

op("suppliers", "POST", "/api/v1/suppliers/", "Create supplier", "shared (cross-company)",
   ["active superuser"], "ADM-11/12 area", "no (no version concept in this module)", "Creates a supplier.",
   request_fields=[{"name": "code", "required": True, "immutable": True}, {"name": "legal_name", "required": True}, {"name": "contact_name", "required": False}, {"name": "email", "required": False}],
   request_example={"code": "ACME", "legal_name": "Acme Herbs Pvt Ltd"},
   response_example={"id": 9, "code": "ACME", "legal_name": "Acme Herbs Pvt Ltd", "is_active": True},
   response_status=201, errors=STD_ERRORS_RW, source_files=["apps/suppliers/views.py"])

op("suppliers", "GET", "/api/v1/suppliers/<supplier_id>/", "Supplier detail", "shared (cross-company)",
   ["active superuser"], "ADM-11/12 area", "not applicable", "Detail of one supplier.",
   path_params=[{"name": "supplier_id", "type": "int"}],
   response_example={"id": 9, "code": "ACME", "legal_name": "Acme Herbs Pvt Ltd", "is_active": True},
   errors=STD_ERRORS_RW, source_files=["apps/suppliers/views.py"])

op("suppliers", "PATCH", "/api/v1/suppliers/<supplier_id>/", "Edit supplier metadata", "shared (cross-company)",
   ["active superuser"], "ADM-11/12 area", "no (no version concept in this module)", "Edits legal_name/contact/email. code is immutable.",
   path_params=[{"name": "supplier_id", "type": "int"}],
   request_fields=[{"name": "legal_name", "required": False}, {"name": "contact_name", "required": False}, {"name": "email", "required": False}],
   request_example={"contact_name": "Rahul Sharma"}, response_example={"id": 9, "code": "ACME", "contact_name": "Rahul Sharma"},
   errors=STD_ERRORS_RW, source_files=["apps/suppliers/views.py"])

op("suppliers", "POST", "/api/v1/suppliers/<supplier_id>/activate/", "Reactivate supplier", "shared (cross-company)",
   ["active superuser"], "ADM-11/12 area", "no", "Reactivates a deactivated supplier.",
   path_params=[{"name": "supplier_id", "type": "int"}], request_fields=[], request_example={},
   response_example={"id": 9, "is_active": True}, errors=STD_ERRORS_RW, source_files=["apps/suppliers/views.py"])

op("suppliers", "POST", "/api/v1/suppliers/<supplier_id>/deactivate/", "Deactivate supplier", "shared (cross-company)",
   ["active superuser"], "ADM-11/12 area", "no", "Deactivates a supplier.",
   path_params=[{"name": "supplier_id", "type": "int"}], request_fields=[], request_example={},
   response_example={"id": 9, "is_active": False}, errors=STD_ERRORS_RW, source_files=["apps/suppliers/views.py"])

op("catalog", "GET", "/api/v1/product-types/", "List product types", "shared",
   ["shared_catalog.view (in an active store)"], "CAT-05", "not applicable",
   "Maintained product-type lookup used by the product and order-line type dropdowns. Active types by default.",
   query_params=[{"name": "is_active", "required": False, "type": "bool"}],
   response_example={"count": 9, "results": [{"id": 1, "name": "Capsule", "is_active": True}]},
   errors=STD_ERRORS_RW, source_files=["apps/catalog/views.py"])

op("catalog", "POST", "/api/v1/product-types/", "Create a product type", "shared",
   ["superuser only (configuration)"], "CAT-05", "no",
   "Adds a product type. Name must be unique (case-insensitive) and non-blank.",
   request_fields=[{"name": "name", "required": True}],
   request_example={"name": "Syrup"}, response_example={"id": 10, "name": "Syrup", "is_active": True},
   response_status=201, errors=STD_ERRORS_MUTATE, source_files=["apps/catalog/views.py"])

op("catalog", "PATCH", "/api/v1/product-types/<product_type_id>/", "Rename or activate/deactivate a product type", "shared",
   ["superuser only (configuration)"], "CAT-05", "no",
   "Changes name or is_active. Audited.",
   path_params=[{"name": "product_type_id", "type": "int"}],
   request_fields=[{"name": "name", "required": False}, {"name": "is_active", "required": False}],
   request_example={"is_active": False}, response_example={"id": 10, "name": "Syrup", "is_active": False},
   errors=STD_ERRORS_MUTATE, source_files=["apps/catalog/views.py"])
