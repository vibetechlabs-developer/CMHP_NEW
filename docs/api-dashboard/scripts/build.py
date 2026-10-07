# -*- coding: utf-8 -*-
"""Combines module_*.py into docs/api-dashboard/api-data.json.

Regeneration instructions (see docs/api-dashboard/README.md for the full
version): re-run the resolver-walk script against the live codebase, diff
its (method, path) set against this file's, update whichever module_*.py
files changed, then re-run this script.
"""
import json

import module_admin       # noqa: F401  (populates OPS as an import side effect)
import module_purchasing  # noqa: F401
import module_sales       # noqa: F401
import module_manufacturing  # noqa: F401
from common import OPS

MODULES = [
    {"key": "authentication", "name": "Health & Authentication", "django_app": "apps.authentication",
     "description": "CSRF bootstrap, login, refresh, logout, current user. Public / cookie-authenticated, no company or store context.",
     "screens": ["AUTH-01"]},
    {"key": "companies", "name": "Companies, Roles & Permissions", "django_app": "apps.companies",
     "description": "Operating-company CRUD/lifecycle and the caller's own company-membership list.",
     "screens": ["NAV-01", "ADM-05", "ADM-06", "ADM-07"]},
    {"key": "permissions", "name": "Companies, Roles & Permissions", "django_app": "apps.permissions",
     "description": "Permission catalog; company-role AND store-role CRUD/lifecycle/permission-assignment; the two self-lookup my-permissions endpoints.",
     "screens": ["NAV-02", "ADM-08", "ADM-09", "ADM-10", "ADM-13"]},
    {"key": "stores", "name": "Shared Stores & Memberships", "django_app": "apps.stores",
     "description": "Shared store CRUD/lifecycle, the caller's own store list, store overview, store membership + role-assignment management, storage locations.",
     "screens": ["NAV-01", "NAV-03", "ADM-11", "ADM-12", "ADM-14", "CAT-04"]},
    {"key": "catalog", "name": "Materials, Units & Locations", "django_app": "apps.catalog",
     "description": "Units of measure, material categories, materials — shared reference data, cross-company, no version/concurrency concept.",
     "screens": ["CAT-01", "CAT-02", "CAT-03"]},
    {"key": "material_imports", "name": "Material Master CSV Import (Task 14C)", "django_app": "apps.material_imports",
     "description": "Validated preview + explicit all-or-nothing commit for bulk-creating brand-new Material identities (raw or packaging) into the shared catalog from a CSV file. Active-superuser-only, matching existing material-create authorization exactly. No company scope - materials are shared, cross-company identities. Backend only; no frontend screen built yet.",
     "screens": []},
    {"key": "suppliers", "name": "Suppliers", "django_app": "apps.suppliers",
     "description": "Supplier CRUD/lifecycle — shared, cross-company, superuser-administered.",
     "screens": ["ADM-11/12 area"]},
    {"key": "purchasing", "name": "Purchase Requests & Purchase Orders", "django_app": "apps.purchasing",
     "description": "Purchase Requests (create/submit/3-step approve/reject/revise/cancel) and Purchase Orders (create from an approved request/edit/issue/cancel).",
     "screens": ["PR-01", "PR-02", "PR-03", "PR-04", "PR-05", "PO-01", "PO-02", "PO-03", "PO-04", "PO-05"]},
    {"key": "receiving", "name": "Goods Receiving", "django_app": "apps.receiving",
     "description": "Goods Receipts (create/edit/post/cancel) and eligible-order lookup. Dual store+company access; the ONE deliberate always-404-never-403 exception in this API.",
     "screens": ["GR-01", "GR-02", "GR-03", "GR-05", "GR-06", "GR-07"]},
    {"key": "stock_movements", "name": "Physical Receipt Ledger (Recorded Receipts)", "django_app": "apps.stock_movements",
     "description": "Read-only, append-only RECEIPT_IN stock movements created automatically when a goods receipt is posted, plus recorded-receipt balance totals. Not a stock-availability system — no ownership, QC-release, reservation, issue or return concept exists.",
     "screens": ["STK-01"]},
    {"key": "quality", "name": "Material Specifications & Incoming QC", "django_app": "apps.quality",
     "description": "Material Specifications + draft versions (global, superuser-only) and Incoming QC Inspections (store-scoped draft observation recording — no accept/reject/release action exists).",
     "screens": ["SPEC-01", "SPEC-02", "SPEC-03", "SPEC-04", "SPEC-05", "QC-01", "QC-02", "QC-03", "QC-04", "QC-05"]},
    {"key": "customers", "name": "Customers", "django_app": "apps.customers",
     "description": "Company-scoped customer identity/contact directory. No GST/PAN/credit-limit/payment-terms concept.",
     "screens": ["CUST-01", "CUST-02", "CUST-03", "CUST-04"]},
    {"key": "products", "name": "Products", "django_app": "apps.products",
     "description": "Company-scoped product master.",
     "screens": ["PROD-01", "PROD-02", "PROD-03", "PROD-04"]},
    {"key": "product_imports", "name": "Product CSV Import (Task 14A)", "django_app": "apps.product_imports",
     "description": "Validated preview + explicit all-or-nothing commit for bulk-creating the company-scoped Product master from a CSV file. Create-only — never updates, reactivates or overwrites an existing product. Backend only; no frontend screen built yet.",
     "screens": []},
    {"key": "quotations", "name": "Quotations", "django_app": "apps.quotations",
     "description": "Company-scoped quotation drafts. Drafting only — no approval, sending, acceptance, or sales-order conversion.",
     "screens": ["QUOT-01", "QUOT-02", "QUOT-03"]},
    {"key": "sales_orders", "name": "Sales Orders & Confirmation Policy", "django_app": "apps.sales_orders",
     "description": "Direct Sales Order drafts, confirmation preview + confirm (policy-gated), confirmation policy administration.",
     "screens": ["SO-01", "SO-02", "SO-03", "SO-04", "SO-05", "SO-06"]},
    {"key": "formulas", "name": "Formulas, Approval Policy & Requirement Calculation", "django_app": "apps.formulas",
     "description": "Formula/revision drafts, approval policy, revision approval (policy-gated), approval preview, requirement preview. Approval does not authorize production.",
     "screens": ["FRM-01", "FRM-02", "FRM-03", "FRM-04", "FRM-05", "FRM-06", "FRM-07"]},
    {"key": "formula_imports", "name": "Formula Draft CSV Import (Task 14B)", "django_app": "apps.formula_imports",
     "description": "Validated preview + explicit all-or-nothing commit for bulk-creating brand-new Formula identities (each with its own DRAFT revision 1 and material lines) from a CSV file. Never adds a revision to an existing formula, never approves anything. Backend only; no frontend screen built yet.",
     "screens": []},
    {"key": "batch_plans", "name": "Batch Plans, Packing Assessment & Official Numbering", "django_app": "apps.batch_plans",
     "description": "Manufacturing batch planning drafts, structured packing content, requirement preview, official batch number allocation. A planning draft is not an official batch, approval, or stock reservation.",
     "screens": ["BATCH-01", "BATCH-02", "BATCH-03", "BATCH-04", "BATCH-05"]},
    {"key": "store_preparation", "name": "Store Preparation", "django_app": "apps.store_preparation",
     "description": "Store-side Packing Type / insert-required confirmation for an existing planning draft. Dual store+company access, not a superset.",
     "screens": ["PREP-01"]},
    {"key": "material_requisitions", "name": "Material Requisitions", "django_app": "apps.material_requisitions",
     "description": "Material requisition auto-fetched from a batch plan's approved formula — DRAFT (editable) -> SUBMITTED (Task 15A, frozen) -> APPROVED or REJECTED (Task 15C, one approval step, project-lead-accepted working flow, not client-validated; REJECTED -> DRAFT via revise is the only way back). Never reserves, issues or consumes stock, at any status — approval is a recorded decision only. Store access plus BOTH batch_plans.view and formulas.view in the plan's company.",
     "screens": ["MREQ-01", "MREQ-02", "MREQ-03"]},
    {"key": "batch_register", "name": "Read-Only Order-Batch Register (Task 15B)", "django_app": "apps.batch_register",
     "description": "Paginated, read-only register combining EXISTING order/batch-plan/store-preparation/requisition data, one row per BatchPlan. No new model, no new business status, no mutation endpoint. batch_plans.view only required for the base rows; sales_orders.view/customers.view/products.view each independently gate one optional field cluster (restricted uniformly, never leaking existence, when missing); store_preparation/material_requisition sections follow their own existing store-scoped permissions. Backend only; no frontend screen built yet.",
     "screens": []},
    {"key": "users", "name": "Users & Access Administration", "django_app": "apps.users",
     "description": "Superuser-only user CRUD/lifecycle, company-membership + role-assignment management.",
     "screens": ["ADM-01", "ADM-02", "ADM-03", "ADM-04"]},
    {"key": "common", "name": "Health & Authentication", "django_app": "apps.common",
     "description": "Liveness check for monitoring/deployment tooling.",
     "screens": []},
]

NOT_IMPLEMENTED = [
    {"id": "PLAN-01", "name": "Customer Orders (unified)", "purpose": "Capture a customer's order",
     "status": "NOT IMPLEMENTED as a single concept — a company-scoped customer master, product master, quotation drafts and direct sales-order drafts are implemented separately; quotation-to-order conversion is not."},
    {"id": "PLAN-03", "name": "Formula / BOM (advanced)", "purpose": "Define what materials a batch consumes",
     "status": "PARTIALLY IMPLEMENTED — draft formula/revision + approval exists; scaling, yield, waste and unit conversion do not."},
    {"id": "PLAN-04", "name": "Stock Check / Ledger", "purpose": "Show on-hand stock and reserve/consume it",
     "status": "PARTIALLY IMPLEMENTED — Task 13C added a read-only, append-only RECEIPT_IN stock movement ledger (apps.stock_movements) recording physical receipt quantities only. This is explicitly NOT on-hand/available/usable stock (historical receipts are not backfilled, opening stock is not included) and has no reservation or consumption of any kind. See docs/shared-store-inventory-plan.md for the full design and what remains open."},
    {"id": "PLAN-05", "name": "Incoming QC Disposition (accept/reject/release)", "purpose": "Accept/reject a physically received delivery and release it to production",
     "status": "NOT IMPLEMENTED — a separate draft-observation-recording slice (Incoming QC Inspection) exists; it has no accept/reject/release action of any kind."},
    {"id": "PLAN-06", "name": "Material Release", "purpose": "Release QC-accepted material to production", "status": "NOT IMPLEMENTED"},
    {"id": "PLAN-07", "name": "Production Planning (capacity)", "purpose": "Schedule batches against capacity", "status": "NOT IMPLEMENTED"},
    {"id": "PLAN-08", "name": "Production / BMR", "purpose": "Record a batch manufacturing record", "status": "PARTIAL - BMR header, raw and packing slips, sign-off lines and print are built; production execution is not"},
    {"id": "PLAN-09", "name": "Packaging / Filling", "purpose": "Track packaging/filling operations", "status": "NOT IMPLEMENTED"},
    {"id": "PLAN-10", "name": "Final QC/QA Release", "purpose": "Release a finished batch", "status": "NOT IMPLEMENTED"},
    {"id": "PLAN-11", "name": "Invoicing", "purpose": "Bill a customer", "status": "NOT IMPLEMENTED"},
    {"id": "PLAN-12", "name": "Dispatch", "purpose": "Ship a finished order", "status": "NOT IMPLEMENTED"},
    {"id": "PLAN-13", "name": "Reference Books", "purpose": "Shared document/reference library", "status": "NOT IMPLEMENTED"},
    {"id": "PLAN-14", "name": "TQM", "purpose": "Total Quality Management workflows", "status": "NOT IMPLEMENTED"},
    {"id": "PLAN-15", "name": "Reports / Analytics", "purpose": "Cross-module reporting", "status": "NOT IMPLEMENTED — no aggregate/reporting endpoint exists anywhere."},
    {"id": "PLAN-16", "name": "Tally Integration", "purpose": "Accounting system sync", "status": "NOT IMPLEMENTED"},
    {"id": "AWAITING-1", "name": "Requisition lifecycle (submit/fulfil/supplemental requests)", "purpose": "Formal material request/transfer workflow beyond the DRAFT document itself",
     "status": "PARTIALLY IMPLEMENTED — Task 13A added a real DRAFT MaterialRequisition (apps.material_requisitions), auto-fetched from a batch plan's approved formula, with no stock effect. The lifecycle beyond DRAFT (submit/fulfil/approve, whether a plan can have more than one requisition, and the client's own 'Requisition Status' column) is still AWAITING CLIENT DECISION — see docs/erp-handoff-open-decisions.md."},
    {"id": "AWAITING-2", "name": "Issue / Return", "purpose": "Record material issued to production and any returned excess",
     "status": "AWAITING CLIENT DECISION — depends on the stock-ledger decision (PLAN-04) not yet made."},
]

DISCREPANCIES = [
    {
        "area": "Material Requisitions vs. the client register's 'Requisition Status' field",
        "finding": "Task 13A's MaterialRequisition (apps.material_requisitions) is a separate, richer concept — an actual requisition document with material lines and calculated quantities — from the client's own single 'Requisition Status' column on their register (previously mapped to StorePreparation, which deliberately has no such field). MaterialRequisition.status has exactly ONE value (DRAFT) today; the multi-state lifecycle the client's column implies (submitted/fulfilled/etc.) is still unanswered. Do not read Task 13A as having resolved that field — see docs/client-register-field-mapping.md and docs/erp-handoff-open-decisions.md.",
    },
    {
        "area": "CORS configuration",
        "finding": "docs/api-inventory-current.md (written earlier this session) states no CORS configuration exists anywhere in the codebase. That was true when it was written and is now OUTDATED by a separate, later task in this same session: django-cors-headers is now installed and wired into config/settings/base.py (corsheaders app + CorsMiddleware) and config/settings/local.py now reads CSRF_TRUSTED_ORIGINS from the environment. Both CORS_ALLOWED_ORIGINS and CSRF_TRUSTED_ORIGINS default to EMPTY — nothing is enabled unless a developer's own .env sets them, so a plain single-machine local run is unaffected. This dashboard reflects the CURRENT, code-verified state, not the inventory doc's now-stale claim.",
    },
    {
        "area": "Formula approval — intro text vs later sections",
        "finding": "docs/frontend-api-handoff.md §14's own opening paragraph says 'no approval... Do not render Approve...' — written before Task 11C added real approval. §14.8c (later in the same document) is the correct, current contract: approve/approval-preview/approval-policy all exist and are implemented. This dashboard follows §14.8c and the live code, not §14's stale opening paragraph.",
    },
    {
        "area": "Optimistic concurrency is not universal",
        "finding": "Every core business-transaction module (customers, products, quotations, sales_orders, formulas, batch_plans, store_preparation, quality, receiving, purchasing) requires expected_version on every mutating call — confirmed directly by searching every app's serializers.py for the literal field. By contrast, apps.catalog (units/categories/materials), apps.companies, apps.stores, apps.suppliers, apps.users and apps.permissions (role management) have ZERO expected_version usage anywhere — confirmed the same way. These administrative/reference-data modules perform unconditional overwrites with no conflict detection. This is a real, current gap, not a dashboard error — flagged per-operation in the Version Token column.",
    },
    {
        "area": "Three distinct 'version' concepts on Material Specifications and Formulas",
        "finding": "Both resources carry a row's own optimistic-concurrency token, a plain server-side allocation counter (never sent as expected_version), and a child record's own separate concurrency token. docs/frontend-api-handoff.md §9.2/§14.3 document this distinction explicitly after a real bug (Task 09B-3B.1) where the first implementation of MaterialSpecification shipped with NO concurrency token at all, reasoning it was unversioned master-data — fixed the same session. This dashboard keeps the three counters visually separate in every affected operation's detail panel.",
    },
]

COUNTING_RULES = [
    "Unique API path patterns and implemented method+path operations were recalculated fresh from the live django.urls.get_resolver() output on 2026-09-29 — not copied from any earlier document's numbers.",
    "GET and POST on the same path = 2 operations; GET and PATCH = 2 operations. A path with only one method = 1 operation.",
    "HEAD and OPTIONS are excluded — DRF adds these automatically to every APIView/GenericAPIView; they were never counted as separate operations.",
    "Django Admin (/admin/...) and any static/media route are excluded entirely.",
    "A method only counts as implemented if that HTTP verb is genuinely defined somewhere in the view class's MRO (get/post/put/patch/delete), not merely theoretically routable.",
    "This project has no DELETE endpoint anywhere — every lifecycle transition is a paired POST .../activate/ / .../deactivate/ or an equivalent named action (submit/confirm/issue/approve/post/cancel), never a hard delete.",
    "Every row below was cross-checked programmatically against the live resolver dump (exact method+path set comparison) before this file was generated — zero mismatches.",
]

_PATH_PATTERNS = len(set(o["path"] for o in OPS))
_OPERATIONS = len(OPS)

data = {
    "meta": {
        "generated_at": "2026-09-30",
        "generator": "docs/api-dashboard — built from a live django.urls.get_resolver() walk plus direct reading of apps/*/views.py, apps/*/serializers.py and apps/*/models.py, cross-referenced against docs/frontend-api-handoff.md and docs/api-inventory-current.md.",
        "counts": {
            "path_patterns": _PATH_PATTERNS,
            "operations": _OPERATIONS,
            "modules_implemented": len(set(o["module"] for o in OPS)),
            "modules_not_implemented": len(NOT_IMPLEMENTED),
            "source_code_verified_operations": _OPERATIONS,
            "documentation_only_operations": 0,
        },
        "verification_note": f"All {_OPERATIONS} operations are source-code verified in the sense that their existence (method + exact path) was confirmed directly against the live URL resolver in this session, and their permission codes were either read directly from the relevant views.py in this session (apps.customers, apps.purchasing, apps.quality, apps.receiving, apps.material_requisitions) or carried over from docs/frontend-api-handoff.md / docs/api-inventory-current.md, both of which were themselves built from direct code reading in earlier tasks of this same project and are cross-checked, not re-derived from memory, in this dashboard. No entry describes a proposed or planned endpoint as implemented.",
        "counting_rules": COUNTING_RULES,
        "last_inventory_verification_date": "2026-09-30",
        "discrepancies": DISCREPANCIES,
    },
    "modules": MODULES,
    "not_implemented_modules": NOT_IMPLEMENTED,
    "operations": OPS,
}

out_path = "../api-data.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

# Validate it parses back and counts match.
with open(out_path, encoding="utf-8") as f:
    reloaded = json.load(f)
assert len(reloaded["operations"]) == _OPERATIONS, len(reloaded["operations"])
assert reloaded["meta"]["counts"]["operations"] == _OPERATIONS
print("Wrote", out_path, "-", len(reloaded["operations"]), "operations,", len(reloaded["modules"]), "module rows,", len(reloaded["not_implemented_modules"]), "not-implemented rows.")
