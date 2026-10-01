# -*- coding: utf-8 -*-
"""apps.purchasing (Purchase Requests + Purchase Orders), apps.receiving,
apps.quality (Material Specifications + Incoming QC Inspections)."""
from common import op, STD_ERRORS_RW, STD_ERRORS_MUTATE

# ===========================================================================
# apps.purchasing — Purchase Requests (multi-step approval) + Purchase
# Orders (draft -> issued, terminal). All company-scoped (C).
# ===========================================================================
op("purchasing", "GET", "/api/v1/companies/<company_id>/purchase-requests/", "List purchase requests", "company",
   ["purchase_requests.view"], "PR-01", "not applicable",
   "Lists this company's purchase requests.",
   path_params=[{"name": "company_id", "type": "int"}],
   response_example={"count": 1, "next": None, "previous": None, "results": [{"id": 501, "reference": "PR-20260122-a1b2c3d4e5", "status": "SUBMITTED", "version": 4}]},
   errors=STD_ERRORS_RW, source_files=["apps/purchasing/views.py"])

op("purchasing", "POST", "/api/v1/companies/<company_id>/purchase-requests/", "Create a purchase request draft", "company",
   ["purchase_requests.view", "purchase_requests.create"], "PR-02", "no (new resource; server assigns version=1)",
   "Creates a DRAFT purchase request with material/quantity lines.",
   path_params=[{"name": "company_id", "type": "int"}],
   request_fields=[{"name": "required_by", "required": False}, {"name": "notes", "required": False},
                    {"name": "lines", "required": False, "notes": "Each: material_id, unit_id, quantity, notes."}],
   request_example={"required_by": "2026-02-01", "notes": "Urgent — low stock",
                     "lines": [{"material_id": 44, "unit_id": 1, "quantity": "50.000", "notes": ""}]},
   response_example={"id": 501, "company_id": 3, "reference": "PR-20260122-a1b2c3d4e5", "status": "DRAFT", "version": 1},
   response_status=201, errors=STD_ERRORS_RW, source_files=["apps/purchasing/views.py", "apps/purchasing/serializers.py"])

op("purchasing", "GET", "/api/v1/companies/<company_id>/purchase-requests/<request_id>/", "Purchase request detail", "company",
   ["purchase_requests.view"], "PR-03", "not applicable", "Full detail including lines and approval_rounds history.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "request_id", "type": "int"}],
   response_example={
       "id": 501, "company_id": 3, "reference": "PR-20260122-a1b2c3d4e5", "status": "SUBMITTED",
       "required_by": "2026-02-01", "notes": "Urgent — low stock", "version": 4, "current_round": 1, "current_step": 2,
       "lines": [{"id": 900, "line_number": 1, "material_id": 44, "material_code": "PARA-500", "unit_id": 1, "unit_code": "KG", "quantity": "50.000"}],
       "approval_rounds": [{"id": 30, "round_number": 1, "outcome": "PENDING", "decisions": [{"step": 1, "decision": "APPROVED", "actor_id": 20}]}],
   },
   errors=STD_ERRORS_RW, source_files=["apps/purchasing/views.py"])

op("purchasing", "PATCH", "/api/v1/companies/<company_id>/purchase-requests/<request_id>/", "Edit a draft purchase request", "company",
   ["purchase_requests.view", "purchase_requests.edit"], "PR-03", "yes",
   "Edits a DRAFT request's header/lines (full-replace on lines, same convention as every other line-bearing resource).",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "request_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}, {"name": "required_by", "required": False}, {"name": "notes", "required": False}, {"name": "lines", "required": False, "notes": "Full replace when present."}],
   request_example={"expected_version": 1, "notes": "Updated", "lines": [{"material_id": 44, "unit_id": 1, "quantity": "60.000"}]},
   response_example={"id": 501, "version": 2, "status": "DRAFT"},
   errors=STD_ERRORS_MUTATE, side_effects="No-op body (identical values) skips the version bump entirely, not an error.",
   source_files=["apps/purchasing/views.py"])

op("purchasing", "POST", "/api/v1/companies/<company_id>/purchase-requests/<request_id>/submit/", "Submit for approval", "company",
   ["purchase_requests.view", "purchase_requests.submit"], "PR-03", "yes",
   "DRAFT -> SUBMITTED, starting a 3-step approval round.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "request_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}],
   request_example={"expected_version": 1}, response_example={"id": 501, "status": "SUBMITTED", "version": 2, "current_round": 1, "current_step": 1},
   errors=STD_ERRORS_MUTATE,
   side_effects="Idempotent retry: same version, already SUBMITTED -> 200 unchanged.",
   source_files=["apps/purchasing/views.py"])

op("purchasing", "POST", "/api/v1/companies/<company_id>/purchase-requests/<request_id>/cancel/", "Cancel a purchase request", "company",
   ["purchase_requests.view", "purchase_requests.cancel (DRAFT) or purchase_requests.cancel_pending (SUBMITTED — resolved server-side after locking)"], "PR-03", "yes",
   "Cancels a DRAFT or SUBMITTED request (terminal). The authoritative permission check happens AFTER the row is locked, based on the record's current status — the one place in this API where a permission requirement genuinely depends on record state.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "request_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}, {"name": "cancellation_reason", "required": False}],
   request_example={"expected_version": 2, "cancellation_reason": "No longer needed"},
   response_example={"id": 501, "status": "CANCELLED", "version": 3},
   errors=STD_ERRORS_MUTATE + [{"status": 403, "condition": "Missing purchase_requests.cancel (DRAFT) or .cancel_pending (SUBMITTED), determined only after locking the record."}],
   side_effects="Idempotent only if the reason also matches on retry — a different reason on repeat is 409.",
   source_files=["apps/purchasing/views.py"])

op("purchasing", "POST", "/api/v1/companies/<company_id>/purchase-requests/<request_id>/approve/", "Approve one round/step", "company",
   ["purchase_requests.view", "purchase_requests.approve"], "PR-05", "yes (plus expected_round/expected_step)",
   "Approves the current step of the current round. Three steps must approve to reach APPROVED (terminal).",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "request_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}, {"name": "expected_round", "required": True}, {"name": "expected_step", "required": True}],
   request_example={"expected_version": 4, "expected_round": 1, "expected_step": 2},
   response_example={"id": 501, "status": "SUBMITTED", "version": 5, "current_round": 1, "current_step": 3},
   errors=STD_ERRORS_MUTATE + [
       {"status": 400, "condition": "Deciding from the wrong status; the requester approving their own request (never allowed); the same approver deciding a second step of the same round (provisional policy, not yet client-confirmed — display the message verbatim)."},
       {"status": 409, "condition": "Correct version but the round/step has already moved on (someone else already decided it) — distinct message, same refetch-and-show handling."},
   ],
   side_effects="No retry branch — repeating the exact same call is a normal 409, never a silent no-op.",
   source_files=["apps/purchasing/views.py"])

op("purchasing", "POST", "/api/v1/companies/<company_id>/purchase-requests/<request_id>/reject/", "Reject one round/step", "company",
   ["purchase_requests.view", "purchase_requests.approve"], "PR-05", "yes (plus expected_round/expected_step)",
   "Rejects the current step, moving the whole request to REJECTED (revisable back to DRAFT via revise/).",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "request_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}, {"name": "expected_round", "required": True}, {"name": "expected_step", "required": True}, {"name": "rejection_reason", "required": True, "notes": "Non-blank."}],
   request_example={"expected_version": 4, "expected_round": 1, "expected_step": 2, "rejection_reason": "Budget not approved this quarter"},
   response_example={"id": 501, "status": "REJECTED", "version": 5},
   errors=STD_ERRORS_MUTATE, source_files=["apps/purchasing/views.py"])

op("purchasing", "POST", "/api/v1/companies/<company_id>/purchase-requests/<request_id>/revise/", "Revise after rejection", "company",
   ["purchase_requests.view", "purchase_requests.edit"], "PR-03", "yes",
   "REJECTED -> DRAFT, starting a new round. Only reachable from a genuine REJECTED->DRAFT transition (current_round > 0), never a never-submitted draft.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "request_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}],
   request_example={"expected_version": 5}, response_example={"id": 501, "status": "DRAFT", "version": 6},
   errors=STD_ERRORS_MUTATE, source_files=["apps/purchasing/views.py"])

op("purchasing", "GET", "/api/v1/companies/<company_id>/purchase-orders/", "List purchase orders", "company",
   ["purchase_orders.view"], "PO-01", "not applicable", "Lists this company's purchase orders.",
   path_params=[{"name": "company_id", "type": "int"}],
   response_example={"count": 1, "next": None, "previous": None, "results": [{"id": 88, "reference": "PO-20260123-f6a7b8c9d0", "status": "ISSUED", "version": 2}]},
   errors=STD_ERRORS_RW, source_files=["apps/purchasing/views.py"])

op("purchasing", "POST", "/api/v1/companies/<company_id>/purchase-orders/", "Create a purchase order draft", "company",
   ["purchase_orders.view", "purchase_orders.create", "purchase_requests.view (on the source request)"], "PO-02", "no",
   "Creates a DRAFT order from an APPROVED purchase request. Lines are copied verbatim from the approved round.",
   path_params=[{"name": "company_id", "type": "int"}],
   request_fields=[{"name": "source_purchase_request_id", "required": True}, {"name": "supplier_id", "required": True}, {"name": "currency_code", "required": True, "immutable": True}, {"name": "expected_delivery_date", "required": False}],
   request_example={"source_purchase_request_id": 501, "supplier_id": 9, "currency_code": "INR", "expected_delivery_date": "2026-02-10"},
   response_example={"id": 88, "company_id": 3, "reference": "PO-20260123-f6a7b8c9d0", "status": "DRAFT", "version": 1},
   response_status=201, errors=STD_ERRORS_RW, source_files=["apps/purchasing/views.py"])

op("purchasing", "GET", "/api/v1/companies/<company_id>/purchase-orders/<order_id>/", "Purchase order detail", "company",
   ["purchase_orders.view"], "PO-03", "not applicable", "Full order detail, including issue_snapshot (always present as a key, null until issued).",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "order_id", "type": "int"}],
   response_example={"id": 88, "reference": "PO-20260123-f6a7b8c9d0", "status": "ISSUED", "version": 2, "subtotal": "41000.00",
                      "lines": [{"id": 700, "material_code": "PARA-500", "quantity": "50.000", "unit_price": "820.0000", "line_amount": "41000.00"}],
                      "issue_snapshot": {"id": 15, "issued_by_id": 12, "currency_code_snapshot": "INR", "subtotal_snapshot": "41000.00"}},
   errors=STD_ERRORS_RW, source_files=["apps/purchasing/views.py"])

op("purchasing", "PATCH", "/api/v1/companies/<company_id>/purchase-orders/<order_id>/", "Edit a draft purchase order", "company",
   ["purchase_orders.view", "purchase_orders.edit"], "PO-03", "yes",
   "Only unit_price per line is editable, and only while DRAFT — lines cannot be added/removed/resized (copied verbatim from the source request).",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "order_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}, {"name": "expected_delivery_date", "required": False}, {"name": "lines", "required": False, "notes": "unit_price only, matched by id."}],
   request_example={"expected_version": 1, "lines": [{"id": 700, "unit_price": "825.0000"}]},
   response_example={"id": 88, "version": 2},
   errors=STD_ERRORS_MUTATE, source_files=["apps/purchasing/views.py"])

op("purchasing", "POST", "/api/v1/companies/<company_id>/purchase-orders/<order_id>/cancel/", "Cancel a draft purchase order", "company",
   ["purchase_orders.view", "purchase_orders.cancel"], "PO-03", "yes",
   "Cancels a DRAFT order, freeing the source request for a brand-new order (no reopen exists).",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "order_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}, {"name": "cancellation_reason", "required": False}],
   request_example={"expected_version": 1, "cancellation_reason": "Wrong supplier selected"},
   response_example={"id": 88, "status": "CANCELLED", "version": 2},
   errors=STD_ERRORS_MUTATE, source_files=["apps/purchasing/views.py"])

op("purchasing", "POST", "/api/v1/companies/<company_id>/purchase-orders/<order_id>/issue/", "Issue a purchase order", "company",
   ["purchase_orders.view", "purchase_orders.issue"], "PO-05", "yes",
   "DRAFT -> ISSUED (permanently terminal — no edit/cancel/reopen exists afterward). A full server-side revalidation runs inside one transaction: source request still APPROVED, every line still matches, all masters still active, delivery date present and not past, currency in the supported-issue allowlist (INR/USD/EUR/GBP), every unit_price > 0.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "order_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}],
   request_example={"expected_version": 1}, response_example={"id": 88, "status": "ISSUED", "version": 2, "issue_snapshot": {"id": 15}},
   errors=STD_ERRORS_MUTATE + [{"status": 400, "condition": "Any revalidation check fails (inactive master, expired delivery date, unsupported currency, zero/negative price, source request no longer APPROVED)."}],
   side_effects="Retry at the same version while already ISSUED -> 200 unchanged, no re-snapshot. Newly-issued orders become immediately eligible for goods receiving.",
   source_files=["apps/purchasing/views.py", "apps/purchasing/services.py"])

# ===========================================================================
# apps.receiving — Goods Receipts. Store-scoped (S), plus purchase_orders.view
# in the source order's own company (C) — dual access, "never 403 on the
# company axis" is the one deliberate exception to the fold-to-404 rule.
# ===========================================================================
op("receiving", "GET", "/api/v1/stores/<store_id>/goods-receipts/", "List goods receipts", "store + company",
   ["receiving.view (store)"], "GR-01", "not applicable", "Lists receipts, scoped to companies the caller can also see.",
   path_params=[{"name": "store_id", "type": "int"}],
   response_example={"count": 1, "next": None, "previous": None, "results": [{"id": 12, "reference": "GR-20260210-f6a7b8c9d0", "status": "POSTED"}]},
   errors=STD_ERRORS_RW, source_files=["apps/receiving/views.py"])

op("receiving", "POST", "/api/v1/stores/<store_id>/goods-receipts/", "Create a goods receipt", "store + company",
   ["receiving.view", "receiving.create (store)", "purchase_orders.view (source order's company)"], "GR-02", "not applicable (uses idempotency_key instead)",
   "Creates a DRAFT receipt against an ISSUED purchase order. The ONLY resource in this codebase with a create-idempotency key.",
   path_params=[{"name": "store_id", "type": "int"}],
   request_fields=[{"name": "source_purchase_order_id", "required": True}, {"name": "arrived_at", "required": True}, {"name": "delivery_note_reference", "required": False},
                    {"name": "idempotency_key", "required": True, "notes": "Generate a fresh UUID once per Create form session, not per HTTP attempt."},
                    {"name": "lines", "required": True, "notes": "Each: source_po_line_id, received_quantity, optional lot_reference. Multiple lines may target the same PO line (multiple lots)."}],
   request_example={"source_purchase_order_id": 88, "arrived_at": "2026-02-10T09:00:00Z", "delivery_note_reference": "DN-4471",
                     "idempotency_key": "gr-web-2026-02-10-0001", "lines": [{"source_po_line_id": 60, "received_quantity": "60.000", "lot_reference": "LOT-A"}]},
   response_example={"id": 12, "reference": "GR-20260210-f6a7b8c9d0", "status": "DRAFT", "version": 1},
   response_status=201,
   errors=STD_ERRORS_RW + [{"status": 409, "condition": "Same idempotency_key + DIFFERENT body content — use a new key or refetch the existing one."}],
   side_effects="Same idempotency_key + IDENTICAL content on retry returns the existing receipt, still 201 (safe to treat 201 as 'here is your receipt' either way).",
   source_files=["apps/receiving/views.py", "apps/receiving/serializers.py"])

op("receiving", "GET", "/api/v1/stores/<store_id>/goods-receipts/eligible-purchase-orders/", "Eligible orders for receiving", "store + company",
   ["receiving.view (store)"], "GR-06", "not applicable",
   "Lookup for the create screen: ISSUED orders with remaining delivery quantity, with per-line delivery_progress. No price/currency/subtotal field appears anywhere in this response — receiving is a physical-arrival record only.",
   path_params=[{"name": "store_id", "type": "int"}],
   response_example={"count": 1, "next": None, "previous": None, "results": [{"id": 88, "reference": "PO-20260123-f6a7b8c9d0", "supplier_code": "ACME",
       "delivery_progress": [{"source_po_line_id": 60, "material_code_snapshot": "PARA-500", "ordered_quantity": "50.000", "received_quantity": "0.000", "remaining_quantity": "50.000", "delivery_status": "NOT_RECEIVED"}]}]},
   errors=STD_ERRORS_RW, source_files=["apps/receiving/views.py"])

op("receiving", "GET", "/api/v1/stores/<store_id>/goods-receipts/<receipt_id>/", "Goods receipt detail", "store + company",
   ["receiving.view (store)", "purchase_orders.view (company)"], "GR-03", "not applicable", "Full receipt detail with lines.",
   path_params=[{"name": "store_id", "type": "int"}, {"name": "receipt_id", "type": "int"}],
   response_example={"id": 12, "reference": "GR-20260210-f6a7b8c9d0", "status": "DRAFT", "version": 1,
                      "lines": [{"id": 60, "source_po_line_id": 60, "received_quantity": "60.000", "lot_reference": "LOT-A"}]},
   errors=[{"status": 401, "condition": "Missing/invalid access token."}, {"status": 403, "condition": "Store membership present but missing the specific receiving.* permission."},
           {"status": 404, "condition": "No store/inactive/no membership at all; OR store access OK but the caller lacks purchase_orders.view in the source order's own company — this specific case is ALWAYS 404, never 403, by deliberate design (the one exception to the fold-to-404-vs-403 rule elsewhere in this API)."}],
   source_files=["apps/receiving/views.py"])

op("receiving", "PATCH", "/api/v1/stores/<store_id>/goods-receipts/<receipt_id>/", "Edit a draft goods receipt", "store + company",
   ["receiving.view", "receiving.edit (store)", "purchase_orders.view (company)"], "GR-03", "yes",
   "Full line-replace on a DRAFT receipt (same convention as create). arrived_at, delivery_note_reference, notes and lines are all writable.",
   path_params=[{"name": "store_id", "type": "int"}, {"name": "receipt_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}, {"name": "arrived_at", "required": False}, {"name": "lines", "required": False, "notes": "Full replace when present."}],
   request_example={"expected_version": 1, "lines": [{"source_po_line_id": 60, "received_quantity": "65.000", "lot_reference": "LOT-A"}]},
   response_example={"id": 12, "version": 2},
   errors=STD_ERRORS_MUTATE, source_files=["apps/receiving/views.py"])

op("receiving", "POST", "/api/v1/stores/<store_id>/goods-receipts/<receipt_id>/post/", "Post a goods receipt", "store + company",
   ["receiving.view", "receiving.post (store)", "purchase_orders.view (company)"], "GR-05", "yes",
   "DRAFT -> POSTED (permanently immutable — no edit, cancel or reversal exists afterward). Requires >=1 line and arrived_at not in the future; for each line, sums every OTHER posted receipt's quantity against the same PO line (across every store) and rejects if the new total would exceed the ordered quantity, even by a fraction. No over-delivery tolerance.",
   path_params=[{"name": "store_id", "type": "int"}, {"name": "receipt_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}],
   request_example={"expected_version": 2}, response_example={"id": 12, "status": "POSTED", "version": 3},
   errors=STD_ERRORS_MUTATE + [{"status": 400, "condition": "No lines, arrived_at in the future, or a line's total posted quantity across all stores would exceed the ordered quantity."}],
   side_effects="Locks the source order. This is the only place 'received' status becomes permanent — confirms physical arrival, never a stock-ledger posting (no stock-ledger entity exists anywhere in this codebase).",
   source_files=["apps/receiving/views.py", "apps/receiving/services.py"])

op("receiving", "POST", "/api/v1/stores/<store_id>/goods-receipts/<receipt_id>/cancel/", "Cancel a draft goods receipt", "store + company",
   ["receiving.view", "receiving.cancel (store)", "purchase_orders.view (company)"], "GR-07", "yes",
   "Cancels a DRAFT receipt (only ever reachable from DRAFT, never from POSTED).",
   path_params=[{"name": "store_id", "type": "int"}, {"name": "receipt_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}, {"name": "cancellation_reason", "required": False}],
   request_example={"expected_version": 1}, response_example={"id": 12, "status": "CANCELLED", "version": 2},
   errors=STD_ERRORS_MUTATE, source_files=["apps/receiving/views.py"])

# ===========================================================================
# apps.stock_movements — Physical Receipt Ledger Foundation (Task 13C).
# Read-only, append-only. Exactly one movement type exists (RECEIPT_IN),
# created automatically inside apps.receiving.services.post_goods_receipt
# when a GoodsReceipt is posted. NOT a stock-availability system: no
# ownership, QC-release, reservation, issue, consumption or return
# concept exists anywhere here. source_company is receiving/purchasing
# context only, never a legal-ownership claim. release_status is always
# the literal string "Not tracked". Company access mirrors
# apps.receiving exactly (purchase_orders.view in the movement's own
# source_company) — deliberately NOT formulas.view, since receipt
# quantities are not formula-derived data.
# ===========================================================================
op("stock_movements", "GET", "/api/v1/stores/<store_id>/stock-movements/", "List recorded stock movements", "store + company",
   ["stock.view (store)", "purchase_orders.view (company)"], "STK-01", "not applicable",
   "Lists RECEIPT_IN movements, scoped to companies the caller holds purchase_orders.view in — filtered BEFORE listing, so a total can never include an inaccessible company.",
   path_params=[{"name": "store_id", "type": "int"}],
   query_params=[{"name": "material", "type": "int", "notes": "Filter to one material. Unknown query parameters are rejected (400), never silently ignored."}],
   response_example={"count": 1, "next": None, "previous": None,
       "results": [{"id": 12, "movement_type": "RECEIPT_IN", "source_goods_receipt_id": 12, "source_goods_receipt_reference": "GR-20260210-f6a7b8c9d0",
                     "source_receipt_line_id": 60, "store_id": 4, "source_company_id": 3, "source_company_code": "CMHP-A",
                     "material_id": 44, "material_code_snapshot": "PARA-500", "unit_code_snapshot": "KG", "quantity": "60.000",
                     "lot_reference": "LOT-A", "release_status": "Not tracked", "posted_by_id": 12, "posted_at": "2026-02-10T12:00:00Z"}],
       "coverage": {"historical_receipts_backfilled": False, "opening_stock_included": False, "issues_returns_release_tracked": False, "release_status": "Not tracked",
                     "notice": "This total reflects only RECEIPT_IN movements recorded since this feature was installed. Historical receipts posted before this feature existed are not backfilled. Opening stock is not included. Issues, returns, reservations and QC release are not tracked anywhere in this system yet. This is NOT complete physical stock."}},
   errors=STD_ERRORS_RW,
   notes="No create/edit/delete endpoint exists anywhere in this app — every movement is created only as a side effect of apps.receiving.services.post_goods_receipt. A previously-POSTED receipt (from before this feature existed) is never backfilled, and repeating POST .../post/ on one never creates a movement for it (verified by test).",
   source_files=["apps/stock_movements/views.py", "apps/stock_movements/services.py", "apps/receiving/services.py"])

op("stock_movements", "GET", "/api/v1/stores/<store_id>/stock-balances/", "Recorded receipt quantity balances", "store + company",
   ["stock.view (store)", "purchase_orders.view (company)"], "STK-01", "not applicable",
   "Recorded-receipt totals grouped by (material, unit, source_company) — NEVER just (material), so two recorded quantities in different units, or belonging to different companies, are never summed into one number. Company filtering happens INSIDE the aggregation query, before SUM runs.",
   path_params=[{"name": "store_id", "type": "int"}],
   query_params=[{"name": "material", "type": "int"}],
   response_example={"count": 1, "next": None, "previous": None,
       "results": [{"material_id": 44, "material_code": "PARA-500", "material_name": "Paracetamol 500mg (bulk)", "unit_id": 1, "unit_code": "KG", "unit_name": "Kilogram",
                     "source_company_id": 3, "source_company_code": "CMHP-A", "recorded_receipt_quantity": "60.000", "release_status": "Not tracked"}],
       "coverage": {"historical_receipts_backfilled": False, "opening_stock_included": False, "issues_returns_release_tracked": False, "release_status": "Not tracked", "notice": "..."}},
   errors=STD_ERRORS_RW,
   notes="Deliberately never named available_stock/usable_stock/on_hand anywhere — always recorded_receipt_quantity, always paired with the coverage block above.",
   source_files=["apps/stock_movements/views.py", "apps/stock_movements/services.py"])

# ===========================================================================
# apps.quality — Material Specifications (global, superuser-only) +
# Incoming QC Inspections (store-scoped draft-observation recording,
# NO accept/reject/release action exists anywhere in this module)
# ===========================================================================
op("quality", "GET", "/api/v1/material-specifications/", "List material specifications", "configuration",
   ["active superuser"], "SPEC-01", "not applicable",
   "Global specification list — not scoped to any company or store.",
   query_params=[{"name": "search", "type": "string", "notes": "code/name"}, {"name": "material", "type": "int"}],
   response_example={"count": 1, "next": None, "previous": None, "results": [{"id": 12, "code": "SPEC-PARA500", "name": "Paracetamol 500mg Incoming Specification", "latest_revision_number": 2, "version": 2}]},
   errors=STD_ERRORS_RW, source_files=["apps/quality/views.py"])

op("quality", "POST", "/api/v1/material-specifications/", "Create a material specification", "configuration",
   ["active superuser"], "SPEC-04", "no (creates row; PATCH later needs expected_version)",
   "Creates the specification AND its empty revision-1 draft version, atomically. reference_document/notes/tests are NOT accepted here — the first version is always strictly empty.",
   request_fields=[{"name": "material_id", "required": True, "notes": "Must be an active material."}, {"name": "code", "required": True, "immutable": True}, {"name": "name", "required": True}, {"name": "description", "required": False}],
   request_example={"material_id": 44, "code": "SPEC-PARA500", "name": "Paracetamol 500mg Incoming Specification"},
   response_example={"id": 12, "code": "SPEC-PARA500", "version": 1, "latest_revision_number": 1, "versions": [{"id": 30, "revision_number": 1, "status": "DRAFT", "tests": []}]},
   response_status=201,
   errors=STD_ERRORS_RW + [{"status": 409, "condition": "Duplicate code — a genuine identity conflict, search for the existing one instead."}],
   source_files=["apps/quality/views.py", "apps/quality/serializers.py"])

op("quality", "GET", "/api/v1/material-specifications/<specification_id>/", "Specification detail", "configuration",
   ["active superuser"], "SPEC-02", "not applicable", "Full detail with nested versions (each with its own nested tests).",
   path_params=[{"name": "specification_id", "type": "int"}],
   response_example={"id": 12, "code": "SPEC-PARA500", "latest_revision_number": 2, "version": 2,
       "versions": [{"id": 31, "revision_number": 2, "status": "DRAFT", "version": 2, "tests": [{"parameter_name": "Moisture content", "result_type": "NUMERIC", "unit_label": "%"}]}]},
   errors=STD_ERRORS_RW, source_files=["apps/quality/views.py"])

op("quality", "PATCH", "/api/v1/material-specifications/<specification_id>/", "Edit specification metadata", "configuration",
   ["active superuser"], "SPEC-02", "yes",
   "Edits name/description only. This is one of THREE distinct version-like fields on this resource — see the module notes for the full distinction (specification.version vs latest_revision_number vs version.revision_number vs version.version).",
   path_params=[{"name": "specification_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}, {"name": "name", "required": False}, {"name": "description", "required": False}],
   request_example={"expected_version": 1, "name": "Updated name"},
   response_example={"id": 12, "version": 2},
   errors=STD_ERRORS_MUTATE,
   notes="Corrected mid-project (Task 09B-3B.1): the first implementation gave this resource no concurrency token at all, reasoning it was unversioned shared master-data like Material/Supplier. That was wrong given this feature's own requirement, and was fixed the same session — PATCH now requires expected_version like every other mutation in this API.",
   source_files=["apps/quality/views.py"])

op("quality", "GET", "/api/v1/material-specifications/<specification_id>/versions/", "List a specification's versions", "configuration",
   ["active superuser"], "SPEC-03", "not applicable", "Lists all draft versions of one specification.",
   path_params=[{"name": "specification_id", "type": "int"}],
   response_example={"count": 2, "next": None, "previous": None, "results": [{"id": 30, "revision_number": 1, "status": "DRAFT", "version": 1}, {"id": 31, "revision_number": 2, "status": "DRAFT", "version": 2}]},
   errors=STD_ERRORS_RW, source_files=["apps/quality/views.py"])

op("quality", "POST", "/api/v1/material-specifications/<specification_id>/versions/", "Create a new draft version", "configuration",
   ["active superuser"], "SPEC-05", "no (creates row)",
   "Creates a new, empty (tests: []) DRAFT version numbered latest_revision_number + 1. Multiple DRAFT versions may coexist — no one-active-version restriction. Never changes MaterialSpecification.version.",
   path_params=[{"name": "specification_id", "type": "int"}],
   request_fields=[{"name": "reference_document", "required": False}, {"name": "notes", "required": False}],
   request_example={"reference_document": "DOC-2026-001", "notes": "Second revision"},
   response_example={"id": 31, "specification_id": 12, "revision_number": 2, "status": "DRAFT", "tests": [], "version": 1},
   response_status=201, errors=STD_ERRORS_RW, source_files=["apps/quality/views.py"])

op("quality", "GET", "/api/v1/material-specifications/<specification_id>/versions/<version_id>/", "Specification version detail", "configuration",
   ["active superuser"], "SPEC-03", "not applicable", "Detail of one draft version, with its tests.",
   path_params=[{"name": "specification_id", "type": "int"}, {"name": "version_id", "type": "int"}],
   response_example={"id": 31, "revision_number": 2, "status": "DRAFT", "version": 2,
                      "tests": [{"id": 56, "parameter_name": "Moisture content", "result_type": "NUMERIC", "unit_label": "%", "acceptance_criteria": "Client specification pending"}]},
   errors=STD_ERRORS_RW, source_files=["apps/quality/views.py"])

op("quality", "PATCH", "/api/v1/material-specifications/<specification_id>/versions/<version_id>/", "Edit a draft version (full-replace test rows)", "configuration",
   ["active superuser"], "SPEC-03", "yes",
   "Edits reference_document/notes/tests. tests, when present (even []), FULLY REPLACES the existing set — never a partial add/remove-one-row API. Only a DRAFT-status version can be edited. acceptance_criteria is free descriptive text only — no numeric-limit operator, no automatic pass/fail evaluation, no seeded pharmaceutical test catalog.",
   path_params=[{"name": "specification_id", "type": "int"}, {"name": "version_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}, {"name": "reference_document", "required": False}, {"name": "notes", "required": False},
                    {"name": "tests", "required": False, "notes": "Full replace. Each row: parameter_name + result_type (NUMERIC|TEXT) required; method_reference/unit_label/acceptance_criteria may be blank."}],
   request_example={"expected_version": 1, "tests": [{"parameter_name": "Appearance", "method_reference": "Visual", "result_type": "TEXT", "acceptance_criteria": "Off-white powder"},
                                                       {"parameter_name": "Moisture content", "result_type": "NUMERIC", "unit_label": "%", "acceptance_criteria": "Client specification pending"}]},
   response_example={"id": 31, "version": 2, "tests": [{"id": 55, "parameter_name": "Appearance"}, {"id": 56, "parameter_name": "Moisture content"}]},
   errors=STD_ERRORS_MUTATE + [{"status": 400, "condition": "Version is not DRAFT (no reachable path produces this today, but the check exists defensively)."}],
   notes="Distinguish this version's own 'version' (concurrency token for THIS draft's content) from MaterialSpecification.version (the parent row's own metadata token) and revision_number (a plain sequential label, never sent as expected_version) — these are three separate counters that never invalidate one another.",
   source_files=["apps/quality/views.py"])

op("quality", "GET", "/api/v1/stores/<store_id>/incoming-inspections/", "List incoming QC inspections", "store + company",
   ["incoming_qc.view (store)"], "QC-01", "not applicable", "Lists inspection drafts/submissions for this store.",
   path_params=[{"name": "store_id", "type": "int"}],
   query_params=[{"name": "status", "type": "enum DRAFT|SUBMITTED|CANCELLED"}, {"name": "receipt", "type": "int"}, {"name": "material", "type": "int"}],
   response_example={"count": 1, "next": None, "previous": None, "results": [{"id": 5, "reference": "QC-20260211-a1b2c3d4e5", "status": "DRAFT"}]},
   errors=STD_ERRORS_RW, source_files=["apps/quality/views.py"])

op("quality", "POST", "/api/v1/stores/<store_id>/incoming-inspections/", "Create an incoming QC inspection draft", "store + company",
   ["incoming_qc.view", "incoming_qc.create (store)"], "QC-03", "no",
   "Creates a DRAFT inspection against a POSTED receipt line. There is NO accept/reject/release action anywhere in this module — it only records observations. At most one active (non-cancelled) inspection may exist per receipt line at a time.",
   path_params=[{"name": "store_id", "type": "int"}],
   request_fields=[{"name": "receipt_line_id", "required": True, "immutable": True, "notes": "Identifies the source GoodsReceiptLine; the only required field."},
                    {"name": "inspection_date", "required": False, "notes": "Cannot predate the receipt's arrival date or postdate today (both compared in UTC)."},
                    {"name": "notes", "required": False},
                    {"name": "observations", "required": False, "notes": "Full-replace list on both create and PATCH. Only parameter_name required per row."}],
   request_example={"receipt_line_id": 60, "inspection_date": "2026-02-11", "notes": "Routine incoming inspection",
                     "observations": [{"parameter_name": "Appearance", "method_reference": "Visual", "result": "Off-white powder, no foreign matter observed"}]},
   response_example={"id": 5, "reference": "QC-20260211-a1b2c3d4e5", "status": "DRAFT", "version": 1,
                      "observations": [{"id": 9, "parameter_name": "Appearance", "result": "Off-white powder, no foreign matter observed"}]},
   response_status=201,
   errors=STD_ERRORS_RW + [{"status": 400, "condition": "Source receipt is not POSTED."}, {"status": 409, "condition": "A second concurrent create against the same receipt line while one is already active."}],
   side_effects="No unit_price/line_amount/currency_code or any commercial field appears anywhere in this response.",
   source_files=["apps/quality/views.py", "apps/quality/serializers.py"])

op("quality", "GET", "/api/v1/stores/<store_id>/incoming-inspections/eligible-receipt-lines/", "Eligible receipt lines for inspection", "store + company",
   ["incoming_qc.view (store)"], "QC-04", "not applicable", "Lookup for the create screen: POSTED receipt lines without an already-active inspection.",
   path_params=[{"name": "store_id", "type": "int"}],
   response_example={"count": 1, "next": None, "previous": None, "results": [{"receipt_line_id": 60, "receipt_reference": "GR-20260210-f6a7b8c9d0", "material_code_snapshot": "PARA-500", "received_quantity_snapshot": "60.000"}]},
   errors=STD_ERRORS_RW, source_files=["apps/quality/views.py"])

op("quality", "GET", "/api/v1/stores/<store_id>/incoming-inspections/<inspection_id>/", "Incoming QC inspection detail", "store + company",
   ["incoming_qc.view (store)"], "QC-02", "not applicable", "Full detail with observations.",
   path_params=[{"name": "store_id", "type": "int"}, {"name": "inspection_id", "type": "int"}],
   response_example={"id": 5, "reference": "QC-20260211-a1b2c3d4e5", "status": "DRAFT", "version": 1,
                      "observations": [{"id": 9, "parameter_name": "Appearance", "result": "Off-white powder, no foreign matter observed"}]},
   errors=STD_ERRORS_RW, source_files=["apps/quality/views.py"])

op("quality", "PATCH", "/api/v1/stores/<store_id>/incoming-inspections/<inspection_id>/", "Edit a draft inspection", "store + company",
   ["incoming_qc.view", "incoming_qc.edit (store)"], "QC-02", "yes",
   "Only a DRAFT inspection can be edited (400 once SUBMITTED — permanently frozen, no correction/retest/un-submit path exists).",
   path_params=[{"name": "store_id", "type": "int"}, {"name": "inspection_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}, {"name": "inspection_date", "required": False}, {"name": "notes", "required": False}, {"name": "observations", "required": False, "notes": "Full replace when present."}],
   request_example={"expected_version": 1, "observations": [{"parameter_name": "Appearance", "result": "Off-white powder"}, {"parameter_name": "Odor", "result": "Characteristic"}]},
   response_example={"id": 5, "version": 2},
   errors=STD_ERRORS_MUTATE + [{"status": 400, "condition": "Inspection is not DRAFT — 'only a draft ... can be edited'."}],
   source_files=["apps/quality/views.py"])

op("quality", "POST", "/api/v1/stores/<store_id>/incoming-inspections/<inspection_id>/submit/", "Submit an inspection", "store + company",
   ["incoming_qc.view", "incoming_qc.submit (store — deliberately separate from .edit)"], "QC-02", "yes",
   "DRAFT -> SUBMITTED (permanently frozen afterward — no accept/reject/release/retest exists in this module). Requires the source receipt still POSTED and at least one observation.",
   path_params=[{"name": "store_id", "type": "int"}, {"name": "inspection_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}],
   request_example={"expected_version": 1}, response_example={"id": 5, "status": "SUBMITTED", "version": 2, "submitted_by_id": 20},
   errors=STD_ERRORS_MUTATE + [{"status": 400, "condition": "Status not DRAFT, source receipt no longer POSTED, or zero observations exist."}],
   side_effects="Idempotent retry only at the NEW (post-submit) version — retrying with the original stale version is a normal 409, not a silent no-op.",
   source_files=["apps/quality/views.py"])

op("quality", "POST", "/api/v1/stores/<store_id>/incoming-inspections/<inspection_id>/cancel/", "Cancel a draft inspection", "store + company",
   ["incoming_qc.view", "incoming_qc.cancel (store)"], "QC-05", "yes",
   "Cancels a DRAFT inspection only (400 once SUBMITTED — 'only a draft ... can be cancelled'). A cancelled draft is permanently read-only; a new draft may be created against the same receipt line afterward.",
   path_params=[{"name": "store_id", "type": "int"}, {"name": "inspection_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}, {"name": "cancellation_reason", "required": False}],
   request_example={"expected_version": 1}, response_example={"id": 5, "status": "CANCELLED", "version": 2},
   errors=STD_ERRORS_MUTATE, source_files=["apps/quality/views.py"])
