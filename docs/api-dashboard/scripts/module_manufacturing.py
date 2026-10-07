# -*- coding: utf-8 -*-
"""apps.formulas, apps.batch_plans, apps.store_preparation, apps.users,
apps.common (health)."""
from common import op, STD_ERRORS_RW, STD_ERRORS_MUTATE

# ===========================================================================
# apps.formulas — Manufacturing Formulas: draft revisions + approval
# (Task 11A/11C). Draft preparation + approval only — approval does NOT
# authorize production, create batches, reserve or issue stock.
# ===========================================================================
op("formulas", "GET", "/api/v1/companies/<company_id>/formulas/", "List formulas", "company",
   ["formulas.view"], "FRM-01", "not applicable", "Lists formulas with revision summaries.",
   path_params=[{"name": "company_id", "type": "int"}],
   query_params=[{"name": "search", "type": "string", "notes": "code/name"}, {"name": "product", "type": "int"}],
   response_example={"count": 1, "next": None, "previous": None, "results": [{"id": 9, "code": "F-001", "name": "Herbal tonic formula",
       "revisions": [{"revision_number": 1, "status": "APPROVED", "line_count": 2, "version": 2}]}]},
   errors=STD_ERRORS_RW, source_files=["apps/formulas/views.py"])

op("formulas", "POST", "/api/v1/companies/<company_id>/formulas/", "Create formula", "company",
   ["formulas.view", "formulas.create"], "FRM-03", "no (new resource; creates formula + empty revision 1, both version=1)",
   "Creates a formula AND its empty revision 1, atomically. Product must be active with an active sales unit. The revision's output unit is derived from the product's sales unit by default (immutable), or an explicit output_uom_id may be supplied (Task 12B-2) to manufacture in a different unit than the product is sold in.",
   path_params=[{"name": "company_id", "type": "int"}],
   request_fields=[{"name": "product_id", "required": True}, {"name": "code", "required": True, "immutable": True}, {"name": "name", "required": True},
                    {"name": "base_output_quantity", "required": True, "notes": "> 0, max 3 decimals; whole numbers if the output unit is COUNT."},
                    {"name": "output_uom_id", "required": False, "immutable": True, "notes": "Optional (Task 12B-2); defaults to the product's own sales unit; becomes immutable once the revision is created."}],
   request_example={"product_id": 5, "code": "f-001", "name": "Herbal tonic formula", "base_output_quantity": "100"},
   response_example={"id": 9, "code": "F-001", "version": 1, "latest_revision_number": 1, "revisions": [{"revision_number": 1, "status": "DRAFT", "line_count": 0, "version": 1}]},
   response_status=201, errors=STD_ERRORS_RW + [{"status": 409, "condition": "Duplicate code within the same company (several formulas per product are allowed)."}],
   source_files=["apps/formulas/views.py", "apps/formulas/serializers.py"])

op("formulas", "GET", "/api/v1/companies/<company_id>/formulas/<formula_id>/", "Formula detail", "company",
   ["formulas.view"], "FRM-02", "not applicable", "Formula detail with revision summaries (no lines — fetch the revision detail for lines).",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "formula_id", "type": "int"}],
   response_example={"id": 9, "code": "F-001", "name": "Herbal tonic formula", "version": 1, "latest_revision_number": 1},
   errors=STD_ERRORS_RW, source_files=["apps/formulas/views.py"])

op("formulas", "PATCH", "/api/v1/companies/<company_id>/formulas/<formula_id>/", "Edit formula metadata", "company",
   ["formulas.view", "formulas.edit"], "FRM-02", "yes",
   "Edits name/notes only. This is ONE of four distinct version-like values on this resource — see module notes for the full distinction.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "formula_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}, {"name": "name", "required": False}],
   request_example={"expected_version": 1, "name": "Herbal tonic formula (v2)"},
   response_example={"id": 9, "version": 2},
   errors=STD_ERRORS_MUTATE,
   notes="Four distinct version-like values exist on Formula/FormulaRevision and must never be conflated: Formula.version (concurrency token for name/notes), Formula.latest_revision_number (a plain allocation counter, never sent as expected_version, unaffected by metadata edits), FormulaRevision.revision_number (sequential draft label 1,2,3..., read-only), and FormulaRevision.version (content concurrency token for that revision's own base output/notes/lines). Creating a revision bumps only latest_revision_number; editing formula metadata bumps only Formula.version; editing a revision bumps only that revision's own version — none invalidates another.",
   source_files=["apps/formulas/views.py"])

op("formulas", "GET", "/api/v1/companies/<company_id>/formulas/<formula_id>/revisions/", "List formula revisions", "company",
   ["formulas.view"], "FRM-02", "not applicable", "Lists revision summaries (no lines).",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "formula_id", "type": "int"}],
   response_example={"count": 1, "next": None, "previous": None, "results": [{"id": 12, "revision_number": 1, "status": "DRAFT", "line_count": 2, "version": 2}]},
   errors=STD_ERRORS_RW, source_files=["apps/formulas/views.py"])

op("formulas", "POST", "/api/v1/companies/<company_id>/formulas/<formula_id>/revisions/", "Create a new draft revision", "company",
   ["formulas.view", "formulas.create"], "FRM-05", "no (new resource; strictly sequential under a formula row lock)",
   "Creates an empty revision numbered latest_revision_number + 1. Product and sales unit must still be active. Does not affect any already-approved revision.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "formula_id", "type": "int"}],
   request_fields=[{"name": "base_output_quantity", "required": True}, {"name": "notes", "required": False}, {"name": "output_uom_id", "required": False, "immutable": True}],
   request_example={"base_output_quantity": "200", "notes": ""},
   response_example={"id": 13, "formula_id": 9, "revision_number": 2, "status": "DRAFT", "line_count": 0, "version": 1},
   response_status=201, errors=STD_ERRORS_RW, source_files=["apps/formulas/views.py"])

op("formulas", "GET", "/api/v1/companies/<company_id>/formulas/<formula_id>/revisions/<revision_id>/", "Formula revision detail (with lines)", "company",
   ["formulas.view"], "FRM-04", "not applicable",
   "Full revision detail with raw + packaging material lines in one collection (split by material_type client-side).",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "formula_id", "type": "int"}, {"name": "revision_id", "type": "int"}],
   response_example={"id": 12, "formula_id": 9, "revision_number": 1, "status": "DRAFT", "base_output_quantity": "100.000", "output_uom_code": "BTL", "version": 2,
       "lines": [{"id": 31, "material_code": "RAW-001", "material_type": "RAW_MATERIAL", "quantity": "5.500"}, {"id": 32, "material_code": "PCK-001", "material_type": "PACKAGING_MATERIAL", "quantity": "100.000"}]},
   errors=STD_ERRORS_RW, source_files=["apps/formulas/views.py"])

op("formulas", "PATCH", "/api/v1/companies/<company_id>/formulas/<formula_id>/revisions/<revision_id>/", "Save draft (edit revision)", "company",
   ["formulas.view", "formulas.edit"], "FRM-04", "yes",
   "DRAFT only (400 once APPROVED — permanently read-only afterward). lines, when present (even []), is the complete final collection — id updates, no-id creates, missing lines removed. Changing base_output_quantity never rescales existing lines. output_uom is always immutable here.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "formula_id", "type": "int"}, {"name": "revision_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}, {"name": "base_output_quantity", "required": False},
                    {"name": "lines", "required": False, "notes": "Full replace when present. material_type/unit_id/line_number never accepted — all derived from the material. Each line may carry label_claim, ar_no and special_value (free text, optional, not used in any calculation)."}],
   request_example={"expected_version": 1, "base_output_quantity": "100", "lines": [{"id": 31, "material_id": 7, "quantity": "5.500"}, {"material_id": 8, "quantity": "100"}]},
   response_example={"id": 12, "version": 2, "line_count": 2},
   errors=STD_ERRORS_MUTATE + [{"status": 400, "condition": "Revision is APPROVED — permanently read-only."}],
   source_files=["apps/formulas/views.py"])

op("formulas", "GET", "/api/v1/companies/<company_id>/formulas/<formula_id>/revisions/<revision_id>/requirement-preview/", "Material requirement preview", "company",
   ["formulas.view"], "FRM-06", "not applicable (draft/approved revision.version echoed for reference only)",
   "Read-only planning estimate — a DRAFT or APPROVED revision both work. No stock availability check, nothing reserved/issued/consumed, no unit conversion, no rounding rule applied. Uses exact rational arithmetic (fractions), never binary floats; results shown as decimal strings at 50 significant digits (ROUND_HALF_EVEN) when non-terminating.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "formula_id", "type": "int"}, {"name": "revision_id", "type": "int"}],
   query_params=[{"name": "target_output_quantity", "required": True, "type": "decimal string", "notes": "> 0, max 3 decimals, max 11 integer digits, whole number if output unit is COUNT. Unknown/repeated params are 400."}],
   response_example={"preview": {"informational": True, "calculation": {"method": "proportional", "arithmetic": "exact rational arithmetic (no binary floats)"}},
       "scale_factor": {"value": "0.5", "is_exact": True}, "lines": [{"material_code": "CAP-1", "base_line_quantity": "25.000", "required_quantity": {"value": "12.5", "is_exact": True}}],
       "calculation_complete": True, "calculation_issues": [], "warnings": []},
   errors=STD_ERRORS_RW + [{"status": 400, "condition": "target_output_quantity missing/invalid/non-positive/too many decimals/not whole for a COUNT unit; unknown query parameter."},
                            {"status": 409, "condition": "The revision was still being edited concurrently after 3 retries — refetch and retry."}],
   frontend_usage="Start Here step 8 (preview requirements).", source_files=["apps/formulas/views.py", "apps/formulas/requirement_preview.py"])

op("formulas", "GET", "/api/v1/companies/<company_id>/formulas/<formula_id>/revisions/<revision_id>/approval-preview/", "Approval eligibility preview", "company",
   ["formulas.view"], "FRM-07", "not applicable (revision.version echoed for use in the approve call)",
   "Read-only, informational (Task 11C). Can be stale immediately and never guarantees a later approval will succeed. eligibility.ready_to_attempt is eligibility only, NOT permission — also check eligibility.actor_has_approve_permission separately.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "formula_id", "type": "int"}, {"name": "revision_id", "type": "int"}],
   response_example={"eligibility": {"ready_to_attempt": True, "actor_has_approve_permission": True, "blocking_reasons": []},
       "contributors": {"requesting_user_is_contributor": False, "history_complete": True},
       "approval": {"approved_by_id": None, "policy": {"status": "CONFIGURED", "allow_self_approval": False}}},
   errors=STD_ERRORS_RW, frontend_usage="Start Here step 6-equivalent for formulas (review before approving).",
   source_files=["apps/formulas/views.py", "apps/formulas/approval.py"])

op("formulas", "POST", "/api/v1/companies/<company_id>/formulas/<formula_id>/revisions/<revision_id>/approve/", "Approve a formula revision", "company",
   ["formulas.view", "formulas.approve"], "FRM-07", "yes",
   "DRAFT -> APPROVED. Approval records that a revision's content was approved — it does NOT authorize production, create batches, reserve or issue stock, or validate scaling. Working policy, not client-confirmed. Multiple approved revisions may coexist on one formula and none is chosen for you.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "formula_id", "type": "int"}, {"name": "revision_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}],
   request_example={"expected_version": 2},
   response_example={"id": 12, "status": "APPROVED", "version": 3, "approved_by_id": 8, "approved_at": "2026-09-24T10:00:00Z", "approval_policy_version": 1},
   errors=STD_ERRORS_MUTATE + [
       {"status": 400, "condition": "code=formula_approval_policy_not_configured — an administrator must answer the company policy first. Other 400s carry blocking_reasons (REVISION_NOT_DRAFT, EMPTY_REVISION, INACTIVE_PRODUCT, SELF_APPROVAL_NOT_ALLOWED, CONTRIBUTOR_HISTORY_INCOMPLETE, etc.)."},
   ],
   side_effects="After approval the revision is read-only (PATCH -> 400); Formula master name/notes stay editable. No unapprove/clone/retire/supersede exists.",
   frontend_usage="Prerequisite for Start Here step 7 (batch plan creation requires an APPROVED revision).",
   source_files=["apps/formulas/views.py", "apps/formulas/approval.py"])

op("formulas", "GET", "/api/v1/companies/<company_id>/formula-approval-policy/", "Read formula approval policy", "configuration",
   ["active superuser"], "FRM-07 (admin)", "not applicable", "Reads the company's approval policy.",
   path_params=[{"name": "company_id", "type": "int"}],
   response_example={"company_id": 3, "status": "CONFIGURED", "version": 1, "allow_self_approval": False},
   errors=STD_ERRORS_RW, source_files=["apps/formulas/views.py"])

op("formulas", "PATCH", "/api/v1/companies/<company_id>/formula-approval-policy/", "Configure formula approval policy", "configuration",
   ["active superuser"], "FRM-07 (admin)", "yes (0 = no row yet, creates it)", "Configures the single allow_self_approval policy value.",
   path_params=[{"name": "company_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}, {"name": "allow_self_approval", "required": False, "notes": "true/false only — null is rejected on write (though null is a valid READ state meaning unanswered)."}],
   request_example={"expected_version": 0, "allow_self_approval": False},
   response_example={"company_id": 3, "status": "CONFIGURED", "version": 1, "allow_self_approval": False},
   errors=STD_ERRORS_MUTATE, source_files=["apps/formulas/views.py"])

# ===========================================================================
# apps.formula_imports — Formula Draft CSV Import (Task 14B). Only creates
# brand-new Formula identities, each with its own DRAFT revision 1 and
# material lines — never adds a revision to an existing formula, never
# approves anything. No frontend screen built yet — backend only.
# ===========================================================================
op("formula_imports", "POST", "/api/v1/companies/<company_id>/formulas/import-preview/", "Preview a formula CSV import", "company",
   ["formulas.view", "formulas.create", "formulas.import", "shared_catalog.view (any active store)"], "none yet (backend only)", "no (new resource each call)",
   "Multipart upload (field 'file'). One row per material line; repeated formula_code values group rows into one formula, order-preserving even when interleaved with another code's rows. Never creates a Formula/FormulaRevision/FormulaLine. Group-header fields (formula_name/product_code/base_output_quantity/output_uom_code/formula_notes/revision_notes) must agree across every row in the group, or the conflict is reported naming the field.",
   path_params=[{"name": "company_id", "type": "int"}],
   request_fields=[{"name": "file", "required": True, "notes": "multipart/form-data field. Columns: formula_code, formula_name, product_code, base_output_quantity, output_uom_code, material_code, material_quantity (all required), formula_notes, revision_notes (both optional). Material type and line unit are always derived from the resolved Material, never client-supplied."}],
   response_example={"id": 7, "status": "PREVIEWED", "total_rows": 2, "total_groups": 1, "valid_groups": 1, "invalid_groups": 0, "eligible_for_commit": True, "file_errors": [], "version": 1, "groups": {"count": 1, "results": [{"group_number": 1, "formula_code": "F-IMPORT-001", "is_valid": True, "lines": [{"line_number": 1, "material_code": "RM-001", "is_valid": True}]}]}},
   response_status=201, errors=STD_ERRORS_RW,
   side_effects="Persists a FormulaImportBatch + its normalized FormulaImportGroup/FormulaImportLine rows only — no Formula row is ever created by this endpoint.",
   source_files=["apps/formula_imports/views.py", "apps/formula_imports/services.py", "apps/formula_imports/models.py"])

op("formula_imports", "GET", "/api/v1/companies/<company_id>/formulas/import-preview/<batch_id>/", "Get formula import preview detail (paginated groups)", "company",
   ["formulas.view", "formulas.create", "formulas.import", "shared_catalog.view (any active store)"], "none yet (backend only)", "not applicable",
   "Same shape as the preview response; ?page=/?page_size= paginate GROUPS (each with its own nested lines, never separately paginated). Ownership-scoped: the batch's own company AND created_by must both match the caller, or this folds into the same 404 as a nonexistent id.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "batch_id", "type": "int"}],
   query_params=[{"name": "page", "type": "int"}, {"name": "page_size", "type": "int", "notes": "max 100"}],
   response_example={"id": 7, "status": "PREVIEWED", "groups": {"count": 1, "next": None, "previous": None, "results": []}},
   errors=STD_ERRORS_RW, source_files=["apps/formula_imports/views.py"])

op("formula_imports", "POST", "/api/v1/companies/<company_id>/formulas/import-commit/", "Commit a formula CSV import", "company",
   ["formulas.view", "formulas.create", "formulas.import", "shared_catalog.view (any active store)"], "none yet (backend only)", "yes (see notes — the SAME token repeated after success returns the ORIGINAL result, not a 409)",
   "All-or-nothing: any invalid row/group, an existing formula code (even a DRAFT one), or a product/material/unit that changed since preview, blocks the ENTIRE commit. Creates a brand-new Formula + DRAFT revision 1 + lines + exactly one FormulaRevisionContributor (the importing user, contributor_history_complete=True) per group. Body references the server-issued preview id only, never a replacement formula/line list.",
   path_params=[{"name": "company_id", "type": "int"}],
   request_fields=[{"name": "preview_id", "required": True}, {"name": "expected_version", "required": True, "notes": "Always the value the preview response reported — this resource's version never changes."}],
   request_example={"preview_id": 7, "expected_version": 1},
   response_example={"id": 7, "status": "COMMITTED", "created_formulas": [{"formula_id": 501, "code": "F-IMPORT-001", "revision_id": 900}]},
   errors=STD_ERRORS_MUTATE + [{"status": 400, "condition": "Preview expired, ineligible, or a formula code/product/material/unit changed since preview — no formulas created."}],
   notes="version is fixed at 1 for the resource's whole life; the concurrency guard is the row lock + status field, not an incrementing counter — same design as apps.product_imports (Task 14A). See docs/backend-decisions.md, Task 14B.",
   source_files=["apps/formula_imports/views.py", "apps/formula_imports/services.py"])

# ===========================================================================
# apps.batch_plans — Manufacturing Batch Planning Drafts (Task 12A) +
# structured packing content (12B-2) + official batch numbering (12D).
# A BatchPlan is a planning draft only — not an official manufacturing
# batch, approval, or stock reservation.
# ===========================================================================
op("batch_plans", "GET", "/api/v1/companies/<company_id>/batch-plans/", "List batch plans", "company",
   ["batch_plans.view"], "BATCH-01", "not applicable",
   "Lists planning drafts. Always shows 'Planning draft — official batch number not assigned' until allocate-number is called.",
   path_params=[{"name": "company_id", "type": "int"}],
   response_example={"count": 1, "next": None, "previous": None, "results": [{"id": 60, "target_output_quantity": "500.000", "official_batch_number": None, "version": 1}]},
   errors=STD_ERRORS_RW, source_files=["apps/batch_plans/views.py"])

op("batch_plans", "POST", "/api/v1/companies/<company_id>/batch-plans/", "Create a planning draft", "company",
   ["batch_plans.view", "batch_plans.create", "sales_orders.view"], "BATCH-02", "no (new resource; server assigns version=1)",
   "Pins an explicit sales-order line + an already-APPROVED formula revision (must match the line's product and sales unit exactly, by id). Nothing is defaulted — the user must explicitly pick both. List/detail never expose the formula's own recipe lines.",
   path_params=[{"name": "company_id", "type": "int"}],
   request_fields=[{"name": "sales_order_line_id", "required": True, "immutable": True}, {"name": "formula_revision_id", "required": True, "immutable": True, "notes": "Must be APPROVED and match the line's product/unit exactly."},
                    {"name": "target_output_quantity", "required": True}, {"name": "planned_manufacturing_date", "required": False}, {"name": "packing_size_note", "required": False}, {"name": "notes", "required": False},
                    {"name": "planned_pack_quantity", "required": False, "notes": "Task 12B-2: required together with the next two ONLY when the order line's unit differs from the revision's output unit."},
                    {"name": "packing_content_quantity", "required": False}, {"name": "packing_content_uom_id", "required": False}],
   request_example={"sales_order_line_id": 31, "formula_revision_id": 12, "target_output_quantity": "50"},
   response_example={"id": 60, "sales_order_line_id": 31, "formula_revision_id": 12, "formula_code": "F-001", "formula_revision_number": 1,
                      "target_output_quantity": "50.000", "official_batch_number": None, "version": 1,
                      "source_snapshots": {"product_code": "PROD-001"}, "source_drift": {"is_incompatible": False}},
   response_status=201,
   errors=STD_ERRORS_RW + [{"status": 400, "condition": "formula_revision_id-keyed: \"Products must match\", \"Units must match\", \"Only an APPROVED formula revision can be selected\"; or a structured packing-fields error naming exactly which of the three packing fields are missing."}],
   frontend_usage="Start Here step 7 (create a batch plan from an approved formula).",
   source_files=["apps/batch_plans/views.py", "apps/batch_plans/serializers.py"])

op("batch_plans", "GET", "/api/v1/companies/<company_id>/batch-plans/<plan_id>/", "Batch plan detail", "company",
   ["batch_plans.view"], "BATCH-03", "not applicable",
   "Full detail: read-only source links (never re-pointed), source_drift (computed live on every read, can differ from the captured source_snapshots), and (Task 12D) official_batch_number/numbered_by_id/numbered_at.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "plan_id", "type": "int"}],
   response_example={"id": 60, "target_output_quantity": "50.000", "planned_pack_quantity": None, "packing_assessment": None,
                      "source_drift": {"is_incompatible": False}, "official_batch_number": None, "numbered_by_id": None, "numbered_at": None, "version": 1},
   errors=STD_ERRORS_RW, source_files=["apps/batch_plans/views.py"])

op("batch_plans", "PATCH", "/api/v1/companies/<company_id>/batch-plans/<plan_id>/", "Edit a batch plan", "company",
   ["batch_plans.view", "batch_plans.edit"], "BATCH-03", "yes",
   "Only target_output_quantity, planned_manufacturing_date, packing_size_note, notes (plus the packing-relationship fields, Task 12B-2) are editable — source links, snapshots, company and status are never editable (400 if attempted). A target_output_quantity change is blocked with a structured 400 when source_drift.is_incompatible is true.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "plan_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}, {"name": "target_output_quantity", "required": False}, {"name": "notes", "required": False}],
   request_example={"expected_version": 1, "target_output_quantity": "55"},
   response_example={"id": 60, "target_output_quantity": "55.000", "version": 2},
   errors=STD_ERRORS_MUTATE + [{"status": 400, "condition": "target_output_quantity change attempted while source_drift.is_incompatible is true, or the current product/output unit is inactive."}],
   source_files=["apps/batch_plans/views.py"])

op("batch_plans", "GET", "/api/v1/companies/<company_id>/batch-plans/<plan_id>/requirement-preview/", "Batch plan requirement preview", "company",
   ["batch_plans.view", "formulas.view"], "BATCH-04", "not applicable",
   "Reuses the exact-fraction calculator and response shape as the formula requirement preview, with an added plan/source_context/source_drift block. Blocked (calculation_complete: false, one INCOMPATIBLE_SOURCE_DRIFT issue) when the source has drifted incompatibly. Never shows available_stock, shortage, can_produce or a reservation result.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "plan_id", "type": "int"}],
   response_example={"preview": {"informational": True}, "plan": {"id": 60, "target_output_quantity": "50.000"},
                      "source_drift": {"is_incompatible": False}, "lines": [{"material_code": "CAP-1", "required_quantity": {"value": "12.5", "is_exact": True}}],
                      "calculation_complete": True, "calculation_issues": []},
   errors=STD_ERRORS_RW, frontend_usage="Start Here step 8 (preview requirements and packing assessment).",
   source_files=["apps/batch_plans/views.py", "apps/formulas/requirement_preview.py"])

op("batch_plans", "POST", "/api/v1/companies/<company_id>/batch-plans/<plan_id>/allocate-number/", "Allocate official batch number", "company",
   ["batch_plans.view", "batch_plans.allocate_number (deliberately NOT formulas.approve)"], "BATCH-05", "yes",
   "Allocates a PERMANENT identifier: {client_code}{YY}-{sequence:03d} (e.g. GER26-001), scoped to operating_company + client_code + business year, sequential per that scope. Authorizes nothing — not production, not stock, not dispatch — and never changes the plan's own DRAFT status. code/year/sequence/number are never accepted from the client; all four are always server-resolved under lock.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "plan_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True, "notes": "The plan's current version. No other field is accepted."}],
   request_example={"expected_version": 2},
   response_example={"id": 60, "official_batch_number": "GER26-001", "numbered_by_id": 8, "numbered_at": "2026-09-29T10:15:00+05:30", "version": 3},
   errors=STD_ERRORS_MUTATE + [{"status": 400, "condition": "The source has drifted incompatibly (source_drift.is_incompatible) — allocation is blocked until it is resolved again."}],
   side_effects="A repeat call at the CURRENT (post-allocation) version is a harmless no-op returning the same number unchanged — a genuine double-click needs no special guard once the version has updated. Never show a predicted 'next number' before the call — the real sequence is only decided under lock at the moment of the actual call.",
   frontend_usage="Start Here step 9 (allocate the official batch number).",
   source_files=["apps/batch_plans/views.py", "apps/batch_plans/numbering.py"])

# ===========================================================================
# apps.store_preparation — confirmed store-side preparation info for an
# EXISTING planning draft (Task 12C). Store-scoped, plus batch_plans.view
# in the plan's own operating company — dual access, not a superset.
# ===========================================================================
op("store_preparation", "GET", "/api/v1/stores/<store_id>/preparations/", "List store preparations", "store + company",
   ["store_preparation.view (store)", "batch_plans.view (plan's own company, per record)"], "PREP-01", "not applicable",
   "Lists preparation records, scoped to companies the caller also sees. A store worker serving both operating companies needs company access granted separately — it is never implied by store membership.",
   path_params=[{"name": "store_id", "type": "int"}],
   response_example={"count": 1, "next": None, "previous": None, "results": [{"id": 8, "batch_plan_id": 60, "packing_type": "25 Gm G2", "insert_required": None}]},
   errors=STD_ERRORS_RW, source_files=["apps/store_preparation/views.py"])

op("store_preparation", "POST", "/api/v1/stores/<store_id>/preparations/", "Create a store preparation record", "store + company",
   ["store_preparation.view (store)", "store_preparation.create (store)", "sales_orders.view (order line's company) for order-line rows", "batch_plans.view (plan's company) for legacy batch rows"], "PREP-01", "no (new resource; server assigns version=1)",
   "Creates store preparation for EXACTLY ONE owner: sales_order_line_id (confirmed workflow: saved before any batch plan exists) or the legacy batch_plan_id. store_id always comes from the URL. Response never includes formula lines, recipe quantities or prices. One order-line preparation per store and line (409 on duplicate).",
   path_params=[{"name": "store_id", "type": "int"}],
   request_fields=[{"name": "sales_order_line_id", "required": False, "immutable": True, "notes": "Give exactly one of sales_order_line_id or batch_plan_id."}, {"name": "batch_plan_id", "required": False, "immutable": True, "notes": "Legacy batch-specific rows only."}, {"name": "packing_type", "required": False, "notes": "Free text, e.g. '25 Gm G2' — no fixed choice list."},
                    {"name": "insert_required", "required": False, "notes": "true/false/omit for 'not specified'."}],
   request_example={"sales_order_line_id": 31, "packing_type": "25 Gm G2", "insert_required": True},
   response_example={"id": 8, "batch_plan_id": 60, "packing_type": "25 Gm G2", "insert_required": True, "version": 1,
                      "plan_context": {"planning_id": 60, "order_reference": "SO-20260924-3F9A1C22BE", "product_code": "PROD-001"}},
   response_status=201, errors=STD_ERRORS_RW + [{"status": 409, "condition": "A preparation for this store and order line (or this batch plan, for legacy rows) already exists."}],
   frontend_usage="Start Here step 10 (create/update store preparation).",
   source_files=["apps/store_preparation/views.py", "apps/store_preparation/serializers.py"])

op("store_preparation", "GET", "/api/v1/stores/<store_id>/preparations/<preparation_id>/", "Store preparation detail", "store + company",
   ["store_preparation.view (store)", "batch_plans.view (company)"], "PREP-01", "not applicable", "Detail of one preparation record.",
   path_params=[{"name": "store_id", "type": "int"}, {"name": "preparation_id", "type": "int"}],
   response_example={"id": 8, "batch_plan_id": 60, "packing_type": "25 Gm G2", "insert_required": True, "version": 1},
   errors=STD_ERRORS_RW, source_files=["apps/store_preparation/views.py"])

op("store_preparation", "PATCH", "/api/v1/stores/<store_id>/preparations/<preparation_id>/", "Edit a store preparation record", "store + company",
   ["store_preparation.view", "store_preparation.edit (store)", "batch_plans.view (company)"], "PREP-01", "yes",
   "Only packing_type/insert_required are editable; batch_plan_id/store_id are immutable (400 if present at all). Send insert_required: null explicitly to reset to 'not specified' — do not confuse omitting the key (unchanged) with sending null (cleared). Display rule: show 'N/A' only when the value is false; null must show as 'Not specified'.",
   path_params=[{"name": "store_id", "type": "int"}, {"name": "preparation_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}, {"name": "packing_type", "required": False}, {"name": "insert_required", "required": False, "nullable": True}],
   request_example={"expected_version": 1, "insert_required": None},
   response_example={"id": 8, "insert_required": None, "version": 2},
   errors=STD_ERRORS_MUTATE, source_files=["apps/store_preparation/views.py"])

# ===========================================================================
# apps.material_requisitions — Material Requisition Draft Foundation
# (Task 13A). Store-scoped, plus BOTH batch_plans.view and formulas.view
# in the plan's own operating company (every endpoint here exposes
# recipe-derived quantities, unlike store_preparation). A requisition
# REQUESTS materials; it never reserves, issues or consumes any stock (no
# such concept exists anywhere in this codebase) and authorizes no
# manufacturing. DRAFT is the only status; there is no submit/approve/
# reject/cancel/issue endpoint anywhere in this slice.
# ===========================================================================
op("material_requisitions", "GET", "/api/v1/stores/<store_id>/material-requisitions/", "List material requisitions", "store + company",
   ["material_requisitions.view (store)", "batch_plans.view (company)", "formulas.view (company)"], "MREQ-01", "not applicable",
   "Lists DRAFT material requisitions, scoped to companies the caller holds BOTH batch_plans.view AND formulas.view in.",
   path_params=[{"name": "store_id", "type": "int"}],
   query_params=[{"name": "batch_plan", "type": "int", "notes": "Filter to one source plan's requisition."}],
   response_example={"count": 1, "next": None, "previous": None, "results": [{"id": 12, "batch_plan_id": 60, "status": "DRAFT", "formula_code_snapshot": "F-001", "target_output_quantity_snapshot": "50.000", "version": 1}]},
   errors=STD_ERRORS_RW, source_files=["apps/material_requisitions/views.py"])

op("material_requisitions", "GET", "/api/v1/stores/<store_id>/batch-plans/<plan_id>/requisition-status/", "Read requisition status for a batch plan (status only)", "store + company",
   ["store_preparation.view (store)", "batch_plans.view (company)"], "MREQ-03", "not applicable",
   "Returns only the workflow status of this plan's requisition in THIS active store. state is present (status and status_label included) or unavailable. unavailable is returned identically for an absent requisition, one held in another store, and one held in a deactivated store, so existence is never disclosed. No lines, quantities, material, formula, actors or approval history. formulas.view is not required. Read-only. Refusals: non-member store 404; missing store_preparation.view 403; missing company batch_plans.view 404.",
   path_params=[{"name": "store_id", "type": "int"}, {"name": "plan_id", "type": "int"}],
   response_example={"batch_plan_id": 60, "state": "present", "status": "DRAFT", "status_label": "Draft"},
   # Unavailable example (absent, other-store and deactivated-store records share this body):
   # {"batch_plan_id": 60, "state": "unavailable"}
   errors=STD_ERRORS_RW, source_files=["apps/material_requisitions/views.py", "apps/material_requisitions/urls.py"])

op("material_requisitions", "POST", "/api/v1/stores/<store_id>/material-requisitions/", "Create a material requisition", "store + company",
   ["material_requisitions.view", "material_requisitions.create (store)", "batch_plans.view (company)", "formulas.view (company)"], "MREQ-02", "no (new resource; see expected_batch_plan_version below)",
   "Creates the ONE DRAFT requisition for an existing batch plan, auto-fetching every line from the plan's pinned APPROVED formula revision using the exact-fraction requirement calculator (reused unchanged from apps.formulas.requirement_preview — never a second scaling formula). Nothing about the lines or their quantities is ever client-supplied.",
   path_params=[{"name": "store_id", "type": "int"}],
   request_fields=[{"name": "batch_plan_id", "required": True, "immutable": True}, {"name": "expected_batch_plan_version", "required": True, "notes": "The source PLAN's version last reviewed — distinct from this requisition's own expected_version, which does not exist until the record itself does."}, {"name": "notes", "required": False}],
   request_example={"batch_plan_id": 60, "expected_batch_plan_version": 3},
   response_example={"id": 12, "batch_plan_id": 60, "status": "DRAFT", "version": 1,
       "raw_lines": [{"id": 90, "material_code_snapshot": "RAW-001", "base_line_quantity_snapshot": "10.000", "calculated_quantity": "5", "calculation_is_exact": True, "requested_quantity": "5.000", "quantity_decision_issue": ""}],
       "packaging_lines": [{"id": 91, "material_code_snapshot": "PCK-001", "calculated_quantity": "2.31", "requested_quantity": None, "quantity_decision_issue": "FRACTIONAL_COUNT_QUANTITY"}],
       "source_drift": {"is_incompatible": False, "quantity_affecting": False}},
   response_status=201,
   errors=STD_ERRORS_RW + [
       {"status": 409, "condition": "expected_batch_plan_version is stale (the plan changed since last reviewed), OR a requisition already exists for this plan (one-per-plan database constraint — a working structural choice, not a confirmed rule that a supplementary requisition is forbidden)."},
       {"status": 400, "condition": "The plan's source has drifted incompatible, the output unit is inactive, or the formula revision has no lines."},
   ],
   side_effects="Never mutates the source BatchPlan, FormulaRevision, or SalesOrder (verified by test). requested_quantity is auto-populated per line ONLY when the exact calculated requirement fits 3 decimal places / 11 integer digits without rounding and (for a COUNT unit) is already whole — otherwise null with quantity_decision_issue naming why (QUANTITY_REQUIRES_ROUNDING / FRACTIONAL_COUNT_QUANTITY / QUANTITY_OUT_OF_RANGE); the exact value is always preserved regardless.",
   frontend_usage="Opened from an existing Batch Planning Draft detail screen (BATCH-03).",
   source_files=["apps/material_requisitions/views.py", "apps/material_requisitions/services.py", "apps/formulas/requirement_preview.py"])

op("material_requisitions", "GET", "/api/v1/stores/<store_id>/material-requisitions/<requisition_id>/", "Material requisition detail", "store + company",
   ["material_requisitions.view (store)", "batch_plans.view (company)", "formulas.view (company)"], "MREQ-03", "not applicable",
   "Full detail: raw_lines/packaging_lines (split by material_type), each line's frozen calculation_snapshot kept separate from the editable requested_quantity, source_drift (computed fresh, unlocked, every read), and current_plan_context (the plan's live official_batch_number if allocated, shown as context only — Task 12D allocation is never itself quantity-affecting drift).",
   path_params=[{"name": "store_id", "type": "int"}, {"name": "requisition_id", "type": "int"}],
   response_example={"id": 12, "batch_plan_id": 60, "status": "DRAFT", "version": 1,
       "raw_lines": [{"id": 90, "material_is_active": True, "calculated_quantity": "5", "requested_quantity": "5.000"}],
       "packaging_lines": [],
       "source_drift": {"is_incompatible": False, "quantity_affecting": False, "plan_version_changed": False, "current_official_batch_number": None},
       "current_plan_context": {"batch_plan_id": 60, "batch_plan_version": 3, "official_batch_number": None}},
   errors=STD_ERRORS_RW,
   side_effects="A material referenced by a line that later becomes inactive never changes this historical read — only the live material_is_active flag changes; requested_quantity/calculated_quantity stay exactly as captured (verified by test).",
   source_files=["apps/material_requisitions/views.py", "apps/material_requisitions/serializers.py"])

op("material_requisitions", "PATCH", "/api/v1/stores/<store_id>/material-requisitions/<requisition_id>/", "Edit a material requisition", "store + company",
   ["material_requisitions.view", "material_requisitions.edit (store)", "batch_plans.view (company)", "formulas.view (company)"], "MREQ-03", "yes",
   "Edits header notes and/or existing lines' requested_quantity/quantity_remark ONLY — deliberately NOT the full-replace line convention every other line-bearing resource in this API uses. lines, when present, is a list of PARTIAL edits identified by id; every entry MUST reference an EXISTING line (no id, an unknown/foreign id, or a duplicate id, is 400). Lines can never be added or removed through this endpoint in this task.",
   path_params=[{"name": "store_id", "type": "int"}, {"name": "requisition_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}, {"name": "notes", "required": False},
                    {"name": "lines", "required": False, "notes": "List of {id, requested_quantity, quantity_remark} partial edits. requested_quantity: null clears a previously-set value."}],
   request_example={"expected_version": 1, "lines": [{"id": 91, "requested_quantity": "3", "quantity_remark": "Rounded up per store manager"}]},
   response_example={"id": 12, "version": 2},
   errors=STD_ERRORS_MUTATE + [
       {"status": 400, "condition": "A requested_quantity differing from the line's own exact calculated requirement was submitted without a non-blank quantity_remark in the same request; OR requested_quantity is non-positive, wrong precision, or fractional for a COUNT unit; OR any line references a foreign/duplicate/missing id; OR a quantity edit was attempted while source_drift.quantity_affecting is true (notes-only edits remain allowed in that case)."},
   ],
   side_effects="A true no-op (identical values resubmitted) leaves version unchanged and writes no audit entry. A manually entered requested_quantity is only ever a proposed request — never an approved rounding, loss or wastage rule.",
   source_files=["apps/material_requisitions/views.py", "apps/material_requisitions/services.py"])

op("material_requisitions", "POST", "/api/v1/stores/<store_id>/material-requisitions/<requisition_id>/submit/", "Submit a material requisition", "store + company",
   ["material_requisitions.view", "material_requisitions.submit (store)", "batch_plans.view (company)", "formulas.view (company)"], "MREQ-03", "yes (see side_effects — the SAME token repeated against an already-SUBMITTED requisition is an idempotent no-op, not a 409)",
   "Task 15A: DRAFT -> SUBMITTED. Freezes the request for a future processing workflow this task does not define — does NOT approve quantities, reserve stock, issue materials, authorize production or release anything from QC. Deliberately independent of material_requisitions.edit (not also required). Validates, under lock: at least one line; every line has a resolved, positive, precision/range/COUNT-valid requested_quantity; every line differing from the EXACT calculated requirement (fractions.Fraction comparison, never a rounded display string) carries a non-blank quantity_remark; no quantity-affecting source drift; the pinned formula revision is still APPROVED; every referenced material/unit is still active. Deliberately NOT required: available stock, QC release, an official batch number, a confirmed sales order, or purchasing's three-step approval.",
   path_params=[{"name": "store_id", "type": "int"}, {"name": "requisition_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}],
   request_example={"expected_version": 1},
   response_example={"id": 12, "status": "SUBMITTED", "version": 2, "submitted_by_id": 9, "submitted_at": "2026-10-01T09:05:00Z"},
   errors=STD_ERRORS_MUTATE + [
       {"status": 400, "condition": "Not DRAFT (and not an idempotent current-version repeat of an existing SUBMITTED); no lines; an unresolved/invalid requested_quantity; a differing quantity without quantity_remark; quantity-affecting source drift; the formula revision no longer APPROVED; or a referenced material/unit no longer active."},
   ],
   side_effects="Every header/line edit (PATCH) is rejected (400) once SUBMITTED, forever — there is no reopen/amend action. A later BatchPlan change remains visible via source_drift on a GET, never rewriting this requisition's own frozen snapshots. Creates no StockMovement, BatchNumberAllocation, or BatchPlan status change.",
   notes="SUBMITTED is explicitly NOT 'approved', 'ready to issue', or 'fulfilled', and is NOT automatically the client's own Excel 'Requisition Status' column — that mapping is still unconfirmed. See docs/backend-decisions.md, Task 15A.",
   source_files=["apps/material_requisitions/views.py", "apps/material_requisitions/services.py"])

op("material_requisitions", "POST", "/api/v1/stores/<store_id>/material-requisitions/<requisition_id>/approve/", "Approve a material requisition", "store + company",
   ["material_requisitions.view", "material_requisitions.approve (store)", "batch_plans.view (company)", "formulas.view (company)"], "not applicable (backend only; no frontend screen built yet)", "yes (an already-APPROVED requisition at its current version is an idempotent no-op, preserving the original decided_by/decided_at)",
   "Task 15C: SUBMITTED -> APPROVED, the one approval step this working flow defines (accepted by the project lead, not yet client-validated; deliberately not apps.purchasing's three-step engine). A recorded decision only — does NOT reserve stock, issue materials, authorize production, or release anything from QC. Blocked (400) if the actor is the requisition's own creator, the current round's submitter, or made a substantive requested_quantity change currently reflected on any line (carried-forward-unchanged values keep their original author) — no exception, including for superusers. Blocked for EVERY actor if the round's contributor history cannot be proven complete (legacy data only). Re-validates, under lock: frozen submitted quantities/explanations, source formula still APPROVED, referenced materials/units still active, and no quantity-affecting source drift (the same checks submission itself ran).",
   path_params=[{"name": "store_id", "type": "int"}, {"name": "requisition_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}],
   request_example={"expected_version": 2},
   response_example={"id": 12, "status": "APPROVED", "version": 3, "current_round": 1, "current_decision": {"round_number": 1, "outcome": "APPROVED", "decided_by_id": 11, "decided_at": "2026-10-01T10:00:00Z"}},
   errors=STD_ERRORS_MUTATE + [
       {"status": 400, "condition": "Not SUBMITTED; self-decision (creator/submitter/contributor); incomplete contributor provenance; quantity-affecting source drift; formula revision no longer APPROVED; or a referenced material/unit no longer active."},
   ],
   side_effects="Creates no StockMovement, BatchNumberAllocation, or BatchPlan status change. source_drift on a later GET stays fully independent of this decision — never silently revokes or rewrites it; a future issue action, if built, must perform its own current validation.",
   notes="Approval is historical, not a trust-forever stamp — see docs/frontend-api-handoff.md §18.11. See docs/backend-decisions.md, Task 15C.",
   source_files=["apps/material_requisitions/views.py", "apps/material_requisitions/services.py"])

op("material_requisitions", "POST", "/api/v1/stores/<store_id>/material-requisitions/<requisition_id>/reject/", "Reject a material requisition", "store + company",
   ["material_requisitions.view", "material_requisitions.approve (store)", "batch_plans.view (company)", "formulas.view (company)"], "not applicable (backend only; no frontend screen built yet)", "yes (same version/reason repeated against an already-REJECTED requisition is an idempotent no-op; a DIFFERENT reason at that version is 409, never silently applied)",
   "Task 15C: SUBMITTED -> REJECTED, always with a non-blank rejection_reason. Same permission as approve (there is no separate .reject code) and the identical self-decision ban. Deliberately does NOT re-check source drift — unlike approve, a drift that would block approval never blocks rejection, since rejection's whole purpose is to send the request back for correction.",
   path_params=[{"name": "store_id", "type": "int"}, {"name": "requisition_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}, {"name": "rejection_reason", "required": True, "notes": "Non-blank."}],
   request_example={"expected_version": 2, "rejection_reason": "Quantities look wrong on the raw line"},
   response_example={"id": 12, "status": "REJECTED", "version": 3, "current_round": 1, "current_decision": {"round_number": 1, "outcome": "REJECTED", "rejection_reason": "Quantities look wrong on the raw line", "decided_by_id": 11, "decided_at": "2026-10-01T10:00:00Z"}},
   errors=STD_ERRORS_MUTATE + [
       {"status": 400, "condition": "Blank rejection_reason; not SUBMITTED; self-decision (creator/submitter/contributor); or incomplete contributor provenance."},
       {"status": 409, "condition": "Stale expected_version; or already REJECTED with a DIFFERENT reason than the one supplied."},
   ],
   side_effects="Creates no StockMovement or BatchPlan status change. The round this closes is permanently preserved (outcome + reason), never overwritten by a later revise/resubmit.",
   notes="See docs/backend-decisions.md, Task 15C.",
   source_files=["apps/material_requisitions/views.py", "apps/material_requisitions/services.py"])

op("material_requisitions", "POST", "/api/v1/stores/<store_id>/material-requisitions/<requisition_id>/revise/", "Revise a rejected material requisition back to draft", "store + company",
   ["material_requisitions.view", "material_requisitions.edit (store)", "material_requisitions.revise (store)", "batch_plans.view (company)", "formulas.view (company)"], "not applicable (backend only; no frontend screen built yet)", "yes (a DRAFT reached via a genuine prior revise, repeated at its current version, is an idempotent no-op — a never-submitted DRAFT is 400, 'nothing to revise')",
   "Task 15C: REJECTED -> DRAFT, the only way back. Reopens editable data, so .edit is additionally required (unlike approve/reject/submit, which each stand alone). Two paths: (1) no quantity-affecting source drift — a plain reopen, every line/contributor carries forward completely unchanged; (2) drift exists — requires refresh_from_source=true AND the CURRENT expected_batch_plan_version (proof the reviewer has seen the current state), then rebuilds every line from the source using the exact same calculator create_material_requisition uses, clearing any manual override/remark and never silently rounding an unresolved result. Every prior round's own submission and decision is permanently preserved either way — resubmitting starts a NEW round; the old rejection is never overwritten.",
   path_params=[{"name": "store_id", "type": "int"}, {"name": "requisition_id", "type": "int"}],
   request_fields=[
       {"name": "expected_version", "required": True},
       {"name": "refresh_from_source", "required": False, "notes": "Default false. Required true when quantity-affecting source drift exists."},
       {"name": "expected_batch_plan_version", "required": False, "notes": "Required, and must equal the BatchPlan's CURRENT version, only when refresh_from_source is used for actual drift."},
   ],
   request_example={"expected_version": 4},
   response_example={"id": 12, "status": "DRAFT", "version": 5, "current_round": 1},
   errors=STD_ERRORS_MUTATE + [
       {"status": 400, "condition": "Not REJECTED (and not an idempotent DRAFT-via-prior-revise repeat); quantity-affecting drift exists but refresh_from_source was not set true."},
       {"status": 409, "condition": "Stale expected_version; or expected_batch_plan_version does not match the plan's current version."},
   ],
   side_effects="Does not itself touch notes/lines when no refresh is needed (use the existing PATCH endpoint afterwards). current_round is left untouched — the next submit increments it regardless of its current value.",
   notes="See docs/frontend-api-handoff.md §18.10 and docs/backend-decisions.md, Task 15C.",
   source_files=["apps/material_requisitions/views.py", "apps/material_requisitions/services.py"])

# ===========================================================================
# apps.batch_register — Read-Only Order-Batch Register (Task 15B). No model,
# no migration, no mutation endpoint anywhere in this app — combines EXISTING
# order/batch-plan/store-preparation/requisition data, one row per BatchPlan.
# ===========================================================================
op("batch_register", "GET", "/api/v1/companies/<company_id>/batch-register/", "List the order-batch register", "company",
   ["batch_plans.view"], "not applicable (backend only; no frontend screen built yet)", "not applicable (read-only)",
   "Task 15B: one row per BatchPlan in the company, combining fields already governed by sales_orders/customers/products/formulas/store_preparation/material_requisitions — no new business status or lifecycle behavior, and batch_plans.view is never broadened to see a joined section the caller could not already see directly. sales_orders.view/customers.view/products.view are each independently OPTIONAL and gate exactly one response section (order_context/customer/product_type_current respectively, {\"access\": \"restricted\"} when missing — a flat denial, since every row's order/customer/product unconditionally exists). store_preparation/material_requisition are gated by their OWN existing store-scoped permission (plus, for the requisition, the same dual formulas.view check apps.material_requisitions itself enforces); both can be created at ANY store regardless of the plan's company, and a row can keep existing after its store is later deactivated, so {\"access\": \"unavailable\"} (Task 15B.1/15B.2) is returned for EVERY case where a real record cannot be shown — absent, hidden in an inaccessible active store, or hidden in a now-inactive store — with no exception: there is no longer an {\"exists\": false} shape at all, only full detail (exists:true) for a record in a store the caller currently holds the permission in, or unavailable otherwise. See docs/backend-decisions.md, Tasks 15B.1/15B.2 for the full boundary reasoning and the leaks this closed.",
   path_params=[{"name": "company_id", "type": "int"}],
   query_params=[
       {"name": "product", "type": "int", "notes": "Filters on BatchPlan's own immutable product_id_snapshot — no extra permission required."},
       {"name": "customer", "type": "int", "notes": "Requires customers.view (403 if missing); filters on the linked sales order's customer."},
       {"name": "order_date_from", "type": "date (YYYY-MM-DD)", "notes": "Requires sales_orders.view (403 if missing)."},
       {"name": "order_date_to", "type": "date (YYYY-MM-DD)", "notes": "Requires sales_orders.view (403 if missing)."},
       {"name": "planned_manufacturing_date_from", "type": "date (YYYY-MM-DD)", "notes": "No extra permission required — BatchPlan's own field."},
       {"name": "planned_manufacturing_date_to", "type": "date (YYYY-MM-DD)", "notes": "No extra permission required."},
       {"name": "has_batch_number", "type": "bool (true/false)", "notes": "Filters on whether a BatchNumberAllocation exists for the plan."},
       {"name": "search", "type": "string", "notes": "Matches product_code_snapshot/product_name_snapshot/source_order_reference_snapshot/official batch number — all already-visible snapshot fields, never a restricted one."},
       {"name": "order", "type": "string", "notes": "One of created_at, -created_at, planned_manufacturing_date, -planned_manufacturing_date (small explicit allow-list, default -created_at); any other value is a 400."},
   ],
   response_example={"count": 1, "next": None, "previous": None, "results": [{
       "batch_plan_id": 42, "version": 3, "status": "DRAFT", "created_at": "2026-09-20T10:00:00Z",
       "planned_manufacturing_date": "2026-10-05",
       "sales_order_id": 7, "sales_order_reference": "SO-2026-0007", "sales_order_line_id": 15,
       "product_id_snapshot": 5, "product_code_snapshot": "PRD-001", "product_name_snapshot": "Herbal Tonic 200ml",
       "product_type_current": {"access": "restricted"},
       "customer": {"access": "accessible", "id": 3, "name": "Acme Pharma", "code": "CUST-003"},
       "order_context": {"access": "accessible", "order_date": "2026-09-18", "order_status": "CONFIRMED", "line_quantity": "500", "line_sales_uom_code": "BTL"},
       "planned_pack_quantity": "500", "packing_content_quantity": "100000", "packing_content_uom_code": "ML",
       "target_output_quantity": "100000", "output_uom_code": "ML",
       "official_batch_number": None,
       "store_preparation": {"access": "unavailable"},
       "material_requisition": {"access": "unavailable"},
       "source_drift": {"is_incompatible": False, "issues": [], "product_detail": {"access": "unavailable"}},
   }]},
   errors=[
       {"status": 400, "condition": "Unknown query parameter (named individually); an unparseable date/int/bool filter value; or order not one of the small allow-listed values."},
       {"status": 401, "condition": "Missing/invalid/expired access token."},
       {"status": 403, "condition": "Missing batch_plans.view in this company; or missing customers.view/sales_orders.view while customer/order_date_* filters are supplied (names the specific missing permission)."},
       {"status": 404, "condition": "No such company, or no membership/access at all (deliberately indistinguishable)."},
   ],
   side_effects="None — purely read-only; no model, no migration, no write anywhere in apps.batch_register. Each row is read in one ordinary, non-locking, non-atomic query set, not a frozen cross-record snapshot.",
   notes="No new model/migration (deliberately — this task's own 'no duplicated register table' instruction taken literally). No per-row extra queries: register_queryset's select_related covers every joined section plus both reverse one-to-ones (store_preparation, material_requisition) and number_allocation. source_drift surfaces is_incompatible (generic, already part of apps.batch_plans's own existing ungated contract) and issues from the existing apps.batch_plans.assess_source_drift — never its own current_source_state sub-dict, which would otherwise leak order_date/customer_id around the order_context/customer sections' own gating. Three issue codes (INCOMPATIBLE_PRODUCT_DRIFT/PRODUCT_RENAMED/INACTIVE_PRODUCT) are split into a nested source_drift.product_detail sub-section, {\"access\": \"unavailable\"} without products.view (Task 15B.2 — redacting only the message was insufficient, since the bare code already names the protected live fact). Task 15B: 28 tests. Task 15B.1 (closed the disclosed store-coverage existence leak): 8 more tests. Task 15B.2 (removed the full-active-store-coverage exception entirely — a deactivated store can still hold an existing record — and closed the source_drift code-level leak): 3 more tests, 2 existing tests updated for the simplified contract. 39 tests total, OK, Python exit 0. See docs/backend-decisions.md and docs/backend-tasks.md, Tasks 15B/15B.1/15B.2.",
   source_files=["apps/batch_register/views.py", "apps/batch_register/services.py"])

# ===========================================================================
# apps.users — superuser-only user CRUD + company-membership/role management
# ===========================================================================
op("users", "GET", "/api/v1/users/", "List users", "configuration",
   ["active superuser"], "ADM-01", "not applicable", "Lists every user in the system.",
   query_params=[{"name": "search", "type": "string", "notes": "username/email/first/last name"}, {"name": "is_active", "type": "strict bool"},
                 {"name": "ordering", "type": "enum", "notes": "Allowlisted to username/-username/date_joined/-date_joined/email/-email only — 400 on anything else."}],
   response_example={"count": 1, "next": None, "previous": None, "results": [{"id": 12, "username": "jdoe", "email": "jdoe@example.com", "is_active": True}]},
   errors=STD_ERRORS_RW, source_files=["apps/users/views.py"])

op("users", "POST", "/api/v1/users/", "Create user", "configuration",
   ["active superuser"], "ADM-02", "no (no expected_version field exists on User at all)",
   "Creates a user account.",
   request_fields=[{"name": "username", "required": True}, {"name": "email", "required": True}, {"name": "first_name", "required": False}, {"name": "last_name", "required": False},
                    {"name": "initial_password", "required": True}],
   request_example={"username": "jdoe", "email": "jdoe@example.com", "first_name": "Jane", "last_name": "Doe", "initial_password": "a-strong-pass-1"},
   response_example={"id": 12, "username": "jdoe", "email": "jdoe@example.com", "is_active": True},
   response_status=201,
   errors=STD_ERRORS_RW + [{"status": 400, "condition": "Body contains is_staff/is_superuser/is_active/groups/user_permissions/password — these are never exposed on this form."}],
   source_files=["apps/users/views.py", "apps/users/serializers.py"])

op("users", "GET", "/api/v1/users/<user_id>/", "User detail", "configuration",
   ["active superuser"], "ADM-03", "not applicable", "Full user detail.",
   path_params=[{"name": "user_id", "type": "int"}],
   response_example={"id": 12, "username": "jdoe", "email": "jdoe@example.com", "is_active": True, "is_staff": False, "is_superuser": False, "memberships_url": "/api/v1/users/12/memberships/"},
   errors=STD_ERRORS_RW, source_files=["apps/users/views.py"])

op("users", "PATCH", "/api/v1/users/<user_id>/", "Edit user", "configuration",
   ["active superuser"], "ADM-03", "no", "Edits profile fields. No version/expected_version field exists on User — no conflict handling needed here.",
   path_params=[{"name": "user_id", "type": "int"}],
   request_fields=[{"name": "email", "required": False}, {"name": "first_name", "required": False}, {"name": "last_name", "required": False}],
   request_example={"email": "jane.doe@example.com"}, response_example={"id": 12, "email": "jane.doe@example.com"},
   errors=STD_ERRORS_RW, source_files=["apps/users/views.py"])

op("users", "POST", "/api/v1/users/<user_id>/activate/", "Reactivate user", "configuration",
   ["active superuser"], "ADM-03", "no", "Reactivates a deactivated user.",
   path_params=[{"name": "user_id", "type": "int"}], request_fields=[], request_example={},
   response_example={"id": 12, "is_active": True}, errors=STD_ERRORS_RW, source_files=["apps/users/views.py"])

op("users", "POST", "/api/v1/users/<user_id>/deactivate/", "Deactivate user", "configuration",
   ["active superuser"], "ADM-03", "no", "Deactivates a user. Rejects a superuser target (403) and self-deactivation (400).",
   path_params=[{"name": "user_id", "type": "int"}], request_fields=[], request_example={},
   response_example={"id": 12, "is_active": False},
   errors=STD_ERRORS_RW + [{"status": 403, "condition": "Target is a superuser."}, {"status": 400, "condition": "Attempting to deactivate yourself."}],
   source_files=["apps/users/views.py"])

op("users", "GET", "/api/v1/users/<user_id>/memberships/", "List a user's company memberships", "configuration",
   ["active superuser"], "ADM-04", "not applicable", "Bare JSON array, not paginated.",
   path_params=[{"name": "user_id", "type": "int"}],
   response_example=[{"id": 18, "user_id": 12, "company_id": 3, "company_code": "DEMOA", "is_active": True}],
   errors=STD_ERRORS_RW, source_files=["apps/users/views.py"])

op("users", "POST", "/api/v1/users/<user_id>/memberships/", "Grant/reactivate a company membership", "configuration",
   ["active superuser"], "ADM-04", "no", "Grants a user active membership in a company, or reactivates an inactive one.",
   path_params=[{"name": "user_id", "type": "int"}],
   request_fields=[{"name": "company_id", "required": True}], request_example={"company_id": 3},
   response_example={"id": 18, "user_id": 12, "company_id": 3, "is_active": True}, response_status=201, errors=STD_ERRORS_RW, source_files=["apps/users/views.py"])

op("users", "POST", "/api/v1/users/<user_id>/memberships/<membership_id>/deactivate/", "Revoke a company membership", "configuration",
   ["active superuser"], "ADM-04", "no", "Revokes membership; every company-scoped role assignment under it stops taking effect.",
   path_params=[{"name": "user_id", "type": "int"}, {"name": "membership_id", "type": "int"}],
   request_fields=[], request_example={}, response_example={"id": 18, "is_active": False}, errors=STD_ERRORS_RW, source_files=["apps/users/views.py"])

op("users", "GET", "/api/v1/users/<user_id>/memberships/<membership_id>/roles/", "List a membership's company roles", "configuration",
   ["active superuser"], "ADM-04", "not applicable", "Bare JSON array, not paginated.",
   path_params=[{"name": "user_id", "type": "int"}, {"name": "membership_id", "type": "int"}],
   response_example=[{"id": 35, "membership_id": 18, "role_id": 5, "role_code": "sales-rep", "is_active": True}],
   errors=STD_ERRORS_RW, source_files=["apps/users/views.py"])

op("users", "POST", "/api/v1/users/<user_id>/memberships/<membership_id>/roles/", "Assign a company role", "configuration",
   ["active superuser"], "ADM-04", "no", "Assigns a company role to a membership.",
   path_params=[{"name": "user_id", "type": "int"}, {"name": "membership_id", "type": "int"}],
   request_fields=[{"name": "role_id", "required": True}], request_example={"role_id": 5},
   response_example={"id": 35, "membership_id": 18, "role_id": 5, "is_active": True}, response_status=201, errors=STD_ERRORS_RW, source_files=["apps/users/views.py"])

op("users", "POST", "/api/v1/users/<user_id>/memberships/<membership_id>/roles/<assignment_id>/deactivate/", "Unassign a company role", "configuration",
   ["active superuser"], "ADM-04", "no", "Deactivates one role assignment (not the membership itself).",
   path_params=[{"name": "user_id", "type": "int"}, {"name": "membership_id", "type": "int"}, {"name": "assignment_id", "type": "int"}],
   request_fields=[], request_example={}, response_example={"id": 35, "is_active": False}, errors=STD_ERRORS_RW, source_files=["apps/users/views.py"])

# ===========================================================================
# apps.common — health check
# ===========================================================================
op("common", "GET", "/api/v1/health/", "Liveness check", "public",
   [], "n/a (infrastructure)", "not applicable",
   "Simple liveness probe for monitoring/deployment tooling.",
   auth="None — public endpoint.", headers="None required.",
   response_example={"status": "ok"}, errors=[],
   source_files=["apps/common/views.py"])

op("batch_plans", "GET", "/api/v1/companies/<company_id>/batch-plans/planning-units/", "Units for batch planning pickers", "company",
   ["batch_plans.view"], "BATCH-06", "not applicable",
   "Active units only, for the packing-content and batch-size pickers. Deliberately not gated by shared_catalog.view or any catalog administration permission.",
   path_params=[{"name": "company_id", "type": "int"}],
   response_example={"results": [{"id": 1, "code": "BTL", "name": "Bottle", "dimension": "COUNT"}]},
   errors=STD_ERRORS_RW, source_files=["apps/batch_plans/views.py"])

op("batch_plans", "GET", "/api/v1/companies/<company_id>/batch-plans/eligible-revisions/", "Approved formula revisions for a product", "company",
   ["batch_plans.view"], "BATCH-07", "not applicable",
   "APPROVED revisions of one product in this company, for choosing a batch plan's source. Returns identity and quantities only: never recipe lines and never draft revisions. Empty result means no approved formula exists for that product.",
   path_params=[{"name": "company_id", "type": "int"}],
   query_params=[{"name": "product", "required": True, "type": "int"}],
   response_example={"results": [{"id": 3, "formula_id": 2, "formula_code": "DEMOF", "formula_name": "Demo formula", "revision_number": 1, "base_output_quantity": "100.000", "output_uom_id": 1, "output_uom_code": "BTL"}]},
   errors=STD_ERRORS_RW, source_files=["apps/batch_plans/views.py"])

# ===========================================================================
# apps.bmr - batch manufacturing record (one per batch plan). Lines come from
# the batch plan's existing requirement preview. Free-text fields only.
# ===========================================================================

op("bmr", "GET", "/api/v1/companies/<company_id>/batch-plans/<plan_id>/bmr/", "Read the batch manufacturing record of a plan", "company",
   ["bmr.view", "batch_plans.view"], "BMR-01", "not applicable",
   "Returns the BMR with its raw material and packing slip lines. 404 when no record exists yet for this plan.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "plan_id", "type": "int"}],
   response_example={"id": 7, "batch_plan_id": 9, "formula_revision_id": 3, "version": 1, "lines": [{"id": 1, "slip": "RAW", "required_text": "5", "label_claim": "", "ar_no": "", "version": 1}]},
   errors=STD_ERRORS_RW, source_files=["apps/bmr/views.py"])

op("bmr", "POST", "/api/v1/companies/<company_id>/batch-plans/<plan_id>/bmr/", "Create the batch manufacturing record from the requirement preview", "company",
   ["bmr.create", "batch_plans.view", "formulas.view"], "BMR-01", "no (new resource)",
   "Creates the record with one line per formula line, taking each required quantity from the existing requirement preview. Refused when the preview is not calculation-complete, and once per plan. Does not allocate a batch number, create stock movements or requisitions.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "plan_id", "type": "int"}],
   response_status=201,
   response_example={"id": 7, "batch_plan_id": 9, "lines": []},
   errors=STD_ERRORS_MUTATE + [{"status": 409, "condition": "A record already exists for this plan."}],
   source_files=["apps/bmr/views.py", "apps/bmr/services.py"])

op("bmr", "PATCH", "/api/v1/companies/<company_id>/bmr/<bmr_id>/lines/<line_id>/", "Edit a BMR line's free-text fields", "company",
   ["bmr.view", "bmr.edit"], "BMR-01", "yes (expected_version = line version)",
   "Edits special_value, label_claim, ar_no and (packing lines only) qty_received. Required quantities cannot be changed here. Version-checked and audited.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "bmr_id", "type": "int"}, {"name": "line_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}, {"name": "special_value", "required": False}, {"name": "label_claim", "required": False}, {"name": "ar_no", "required": False}, {"name": "qty_received", "required": False, "notes": "Packing lines only."}],
   request_example={"expected_version": 1, "label_claim": "0.25 mL", "ar_no": "AR-TEST-001"},
   response_example={"id": 1, "label_claim": "0.25 mL", "ar_no": "AR-TEST-001", "version": 2},
   errors=STD_ERRORS_MUTATE, source_files=["apps/bmr/views.py", "apps/bmr/services.py"])
