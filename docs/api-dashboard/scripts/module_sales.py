# -*- coding: utf-8 -*-
"""apps.customers, apps.products, apps.quotations, apps.sales_orders."""
from common import op, STD_ERRORS_RW, STD_ERRORS_MUTATE

# ===========================================================================
# apps.customers — company-scoped identity/contact directory only
# ===========================================================================
op("customers", "GET", "/api/v1/companies/<company_id>/customers/", "List customers", "company",
   ["customers.view"], "CUST-01", "not applicable",
   "Lists this company's customers. This is an identity/contact directory only — no quotation, sales order, invoice, GST/PAN, credit-limit or payment-terms concept exists on this resource.",
   path_params=[{"name": "company_id", "type": "int"}],
   query_params=[{"name": "search", "type": "string", "notes": "code/name/contact_person/email/phone, one param searches all five."}, {"name": "is_active", "type": "strict bool"}],
   response_example={"count": 1, "next": None, "previous": None, "results": [{"id": 17, "code": "CUST-001", "name": "Rajesh Pharma Distributors", "is_active": True, "version": 1}]},
   errors=STD_ERRORS_RW, frontend_usage="Customer lookup for quotation/order creation (Start Here step 4).",
   source_files=["apps/customers/views.py"])

op("customers", "POST", "/api/v1/companies/<company_id>/customers/", "Create customer", "company",
   ["customers.view", "customers.create"], "CUST-02", "no (new resource; server assigns version=1)",
   "Creates a customer contact record.",
   path_params=[{"name": "company_id", "type": "int"}],
   request_fields=[{"name": "code", "required": True, "immutable": True, "notes": "Normalized (trimmed, upper-cased)."}, {"name": "name", "required": True},
                    {"name": "contact_person", "required": False}, {"name": "email", "required": False, "notes": "Validated as well-formed if supplied."},
                    {"name": "phone", "required": False, "notes": "Free text, no format validation."},
                    {"name": "billing_address", "required": False}, {"name": "shipping_address", "required": False, "notes": "Never defaulted from billing_address."}, {"name": "notes", "required": False}],
   request_example={"code": "cust-001", "name": "Rajesh Pharma Distributors", "contact_person": "Rajesh Kumar",
                     "email": "rajesh@example.test", "phone": "+91 98765 43210", "billing_address": "12 MG Road, Pune, MH 411001"},
   response_example={"id": 17, "company_id": 42, "code": "CUST-001", "name": "Rajesh Pharma Distributors", "is_active": True, "version": 1},
   response_status=201,
   errors=STD_ERRORS_RW + [{"status": 409, "condition": "Duplicate code within the same company (a code used by a DIFFERENT company succeeds — uniqueness is per-company only)."}],
   source_files=["apps/customers/views.py", "apps/customers/serializers.py"])

op("customers", "GET", "/api/v1/companies/<company_id>/customers/<customer_id>/", "Customer detail", "company",
   ["customers.view"], "CUST-03", "not applicable", "Full customer detail.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "customer_id", "type": "int"}],
   response_example={"id": 17, "company_id": 42, "code": "CUST-001", "name": "Rajesh Pharma Distributors", "email": "rajesh@example.test", "is_active": True, "version": 1},
   errors=STD_ERRORS_RW, source_files=["apps/customers/views.py"])

op("customers", "PATCH", "/api/v1/companies/<company_id>/customers/<customer_id>/", "Edit customer metadata", "company",
   ["customers.view", "customers.edit"], "CUST-03", "yes",
   "Edits contact fields. code/company_id are immutable. Can still be edited while the customer is inactive, as long as the company itself is active.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "customer_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}, {"name": "name", "required": False}, {"name": "shipping_address", "required": False, "notes": "Omitting leaves unchanged; sending \"\" explicitly clears it."}],
   request_example={"expected_version": 1, "name": "Rajesh Pharma Distributors Pvt Ltd", "shipping_address": ""},
   response_example={"id": 17, "name": "Rajesh Pharma Distributors Pvt Ltd", "version": 2},
   errors=STD_ERRORS_MUTATE,
   side_effects="A no-op body (identical values, including after whitespace normalization) returns 200 unchanged — version does not increment, no audit entry.",
   source_files=["apps/customers/views.py"])

op("customers", "POST", "/api/v1/companies/<company_id>/customers/<customer_id>/activate/", "Reactivate customer", "company",
   ["customers.view", "customers.activate"], "CUST-04", "yes",
   "Reactivates a deactivated customer. Idempotent no-op at the current version if already active.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "customer_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}], request_example={"expected_version": 2},
   response_example={"id": 17, "is_active": True, "version": 3},
   errors=STD_ERRORS_MUTATE, source_files=["apps/customers/views.py"])

op("customers", "POST", "/api/v1/companies/<company_id>/customers/<customer_id>/deactivate/", "Deactivate customer", "company",
   ["customers.view", "customers.deactivate"], "CUST-04", "yes",
   "Deactivates a customer. Never deletes the record or any of its data, never cascades — no DELETE endpoint exists anywhere in this module.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "customer_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}], request_example={"expected_version": 2},
   response_example={"id": 17, "is_active": False, "version": 3},
   errors=STD_ERRORS_MUTATE, source_files=["apps/customers/views.py"])

# ===========================================================================
# apps.products — company-scoped product master
# ===========================================================================
op("products", "GET", "/api/v1/companies/<company_id>/products/", "List products", "company",
   ["products.view"], "PROD-01", "not applicable", "Lists this company's products, including sales_uom_code/name and its live is_active flag.",
   path_params=[{"name": "company_id", "type": "int"}],
   query_params=[{"name": "search", "type": "string"}, {"name": "is_active", "type": "strict bool"}],
   response_example={"count": 1, "next": None, "previous": None, "results": [{"id": 5, "code": "PROD-001", "name": "Herbal Tonic 200ml", "sales_uom_code": "BTL", "sales_uom_is_active": True, "is_active": True, "version": 1}]},
   errors=STD_ERRORS_RW, frontend_usage="Product lookup for quotation/order/formula creation (Start Here step 4).",
   source_files=["apps/products/views.py"])

op("products", "POST", "/api/v1/companies/<company_id>/products/", "Create product", "company",
   ["products.view", "products.create"], "PROD-02", "no (new resource; server assigns version=1)",
   "Creates a product master record, including an optional product_type classification.",
   path_params=[{"name": "company_id", "type": "int"}],
   request_fields=[{"name": "code", "required": True, "immutable": True}, {"name": "name", "required": True}, {"name": "sales_uom_id", "required": True, "notes": "Must reference an active unit."}, {"name": "product_type", "required": False}],
   request_example={"code": "PROD-001", "name": "Herbal Tonic 200ml", "sales_uom_id": 3, "product_type": "FINISHED_GOOD"},
   response_example={"id": 5, "code": "PROD-001", "name": "Herbal Tonic 200ml", "sales_uom_id": 3, "is_active": True, "version": 1},
   response_status=201, errors=STD_ERRORS_RW + [{"status": 409, "condition": "Duplicate code within the same company."}],
   source_files=["apps/products/views.py", "apps/products/serializers.py"])

op("products", "GET", "/api/v1/companies/<company_id>/products/<product_id>/", "Product detail", "company",
   ["products.view"], "PROD-03", "not applicable", "Full product detail.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "product_id", "type": "int"}],
   response_example={"id": 5, "code": "PROD-001", "name": "Herbal Tonic 200ml", "sales_uom_id": 3, "sales_uom_code": "BTL", "is_active": True, "version": 1},
   errors=STD_ERRORS_RW, source_files=["apps/products/views.py"])

op("products", "PATCH", "/api/v1/companies/<company_id>/products/<product_id>/", "Edit product metadata", "company",
   ["products.view", "products.edit"], "PROD-03", "yes",
   "Edits name/product_type. code/company_id/sales_uom_id are immutable. The sales unit itself can become inactive later — the frontend must display that live flag, never hide or substitute the unit.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "product_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}, {"name": "name", "required": False}],
   request_example={"expected_version": 1, "name": "Herbal Tonic 200ml (Reformulated)"},
   response_example={"id": 5, "name": "Herbal Tonic 200ml (Reformulated)", "version": 2},
   errors=STD_ERRORS_MUTATE, source_files=["apps/products/views.py"])

op("products", "POST", "/api/v1/companies/<company_id>/products/<product_id>/activate/", "Reactivate product", "company",
   ["products.view", "products.activate"], "PROD-04", "yes", "Reactivates a deactivated product.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "product_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}], request_example={"expected_version": 2},
   response_example={"id": 5, "is_active": True, "version": 3}, errors=STD_ERRORS_MUTATE, source_files=["apps/products/views.py"])

op("products", "POST", "/api/v1/companies/<company_id>/products/<product_id>/deactivate/", "Deactivate product", "company",
   ["products.view", "products.deactivate"], "PROD-04", "yes", "Deactivates a product. Existing quotation/order lines referencing it keep their captured snapshot and simply show the live inactive flag.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "product_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}], request_example={"expected_version": 2},
   response_example={"id": 5, "is_active": False, "version": 3}, errors=STD_ERRORS_MUTATE, source_files=["apps/products/views.py"])

# ===========================================================================
# apps.product_imports — Company-Scoped Product CSV Import (Task 14A).
# Create-only: never updates, reactivates or overwrites an existing
# product. No frontend screen built yet — backend only.
# ===========================================================================
op("product_imports", "POST", "/api/v1/companies/<company_id>/products/import-preview/", "Preview a product CSV import", "company",
   ["products.view", "products.create", "products.import"], "none yet (backend only)", "no (new resource each call; the SAME file re-uploaded gets a new preview id)",
   "Multipart upload (field 'file'), UTF-8 or UTF-8-with-BOM CSV. Parses and validates completely in memory; NEVER creates a Product. Raw bytes are never persisted anywhere (only a sha256 checksum is kept). Always 201, even for a file it cannot parse at all (file_errors explains why, eligible_for_commit is false).",
   path_params=[{"name": "company_id", "type": "int"}],
   request_fields=[{"name": "file", "required": True, "notes": "multipart/form-data field. Supported columns: code, name, sales_uom_code (required), product_type, description (optional). Any other column name is rejected, not dropped."}],
   response_example={"id": 42, "status": "PREVIEWED", "total_rows": 2, "valid_rows": 2, "invalid_rows": 0, "eligible_for_commit": True, "file_errors": [], "version": 1, "expires_at": "2026-09-30T13:00:00Z", "rows": {"count": 2, "results": [{"row_number": 1, "code": "PROD001", "is_valid": True, "errors": []}]}},
   response_status=201, errors=STD_ERRORS_RW,
   side_effects="Persists a ProductImportBatch + its normalized ProductImportRow rows only — no Product row is ever created by this endpoint.",
   source_files=["apps/product_imports/views.py", "apps/product_imports/services.py", "apps/product_imports/models.py"])

op("product_imports", "GET", "/api/v1/companies/<company_id>/products/import-preview/<batch_id>/", "Get import preview detail (paginated rows)", "company",
   ["products.view", "products.create", "products.import"], "none yet (backend only)", "not applicable",
   "Same shape as the preview response; ?page=/?page_size= over the row list. Ownership-scoped: the batch's own company AND created_by must both match the caller, or this folds into the same 404 as a nonexistent id — a different user in the same company cannot read another user's preview.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "batch_id", "type": "int"}],
   query_params=[{"name": "page", "type": "int"}, {"name": "page_size", "type": "int", "notes": "max 100"}],
   response_example={"id": 42, "status": "PREVIEWED", "rows": {"count": 2, "next": None, "previous": None, "results": []}},
   errors=STD_ERRORS_RW, source_files=["apps/product_imports/views.py"])

op("product_imports", "POST", "/api/v1/companies/<company_id>/products/import-commit/", "Commit a product CSV import", "company",
   ["products.view", "products.create", "products.import"], "none yet (backend only)", "yes (see notes — the SAME token repeated after success returns the ORIGINAL result, not a 409)",
   "All-or-nothing: any invalid row, or any row whose validity changed since preview (its code was taken, or its unit deactivated, in the meantime) blocks the ENTIRE commit — zero products created. Body references the server-issued preview id only, never a replacement product/row list.",
   path_params=[{"name": "company_id", "type": "int"}],
   request_fields=[{"name": "preview_id", "required": True}, {"name": "expected_version", "required": True, "notes": "Always the value the preview response reported — this resource's version never changes, so resending the identical token after a lost response safely repeats the same success."}],
   request_example={"preview_id": 42, "expected_version": 1},
   response_example={"id": 42, "status": "COMMITTED", "created_product_ids": [501, 502]},
   errors=STD_ERRORS_MUTATE + [{"status": 400, "condition": "Preview expired, ineligible, or a row's code/unit changed since preview — no products created."}],
   notes="version is fixed at 1 for the resource's whole life; the concurrency guard is the row lock + status field, not an incrementing counter — see docs/backend-decisions.md, Task 14A.",
   source_files=["apps/product_imports/views.py", "apps/product_imports/services.py"])

# ===========================================================================
# apps.quotations — drafting only, no approval/sending/acceptance/conversion
# ===========================================================================
op("quotations", "GET", "/api/v1/companies/<company_id>/quotations/", "List quotations", "company",
   ["quotations.view"], "QUOT-01", "not applicable",
   "Lists quotation drafts, newest first. No approval, sending, acceptance, sales-order conversion, tax, discount or grand total exists on this resource.",
   path_params=[{"name": "company_id", "type": "int"}],
   query_params=[{"name": "search", "type": "string", "notes": "reference or customer name"}, {"name": "customer", "type": "int"}, {"name": "quotation_date_from", "type": "date YYYY-MM-DD"}, {"name": "quotation_date_to", "type": "date YYYY-MM-DD"}],
   response_example={"count": 1, "next": None, "previous": None, "results": [{"id": 9, "reference": "QT-20260924-3F9A1C22BE", "status": "DRAFT", "subtotal": "21.00"}]},
   errors=STD_ERRORS_RW, source_files=["apps/quotations/views.py"])

op("quotations", "POST", "/api/v1/companies/<company_id>/quotations/", "Create a quotation draft", "company",
   ["quotations.view", "quotations.create"], "QUOT-02", "no (new resource; server assigns version=1)",
   "Creates a DRAFT quotation with customer/product lines. currency is immutable after creation; no sum is ever taken across currencies.",
   path_params=[{"name": "company_id", "type": "int"}],
   request_fields=[{"name": "customer_id", "required": True, "notes": "Active customer of this company."}, {"name": "quotation_date", "required": True}, {"name": "currency", "required": True, "immutable": True, "notes": "3 letters, upper-cased."},
                    {"name": "valid_until", "required": False, "notes": "Not before quotation_date."}, {"name": "lines", "required": False, "notes": "Omitted/[] = empty draft."}],
   request_example={"customer_id": 17, "quotation_date": "2026-09-24", "valid_until": "2026-10-24", "currency": "inr",
                     "lines": [{"product_id": 5, "quantity": "2", "unit_price": "10.5000", "description": "Optional"}]},
   response_example={"id": 9, "reference": "QT-20260924-3F9A1C22BE", "status": "DRAFT", "version": 1, "subtotal": "21.00"},
   response_status=201,
   errors=STD_ERRORS_RW + [{"status": 400, "condition": "subtotal/total/grand_total/line_amount/reference/status/version/company_id/line_number/snapshot fields/audit fields/id-on-create-line/any unknown key — all rejected, never silently ignored."}],
   source_files=["apps/quotations/views.py", "apps/quotations/serializers.py"])

op("quotations", "GET", "/api/v1/companies/<company_id>/quotations/<quotation_id>/", "Quotation detail", "company",
   ["quotations.view"], "QUOT-03", "not applicable", "Full quotation detail with lines, snapshots and live *_is_active flags.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "quotation_id", "type": "int"}],
   response_example={"id": 9, "reference": "QT-20260924-3F9A1C22BE", "customer_id": 17, "status": "DRAFT",
                      "lines": [{"id": 31, "product_code": "PROD-001", "quantity": "2.000", "unit_price": "10.5000", "line_amount": "21.00"}], "subtotal": "21.00", "version": 1},
   errors=STD_ERRORS_RW, source_files=["apps/quotations/views.py"])

op("quotations", "PATCH", "/api/v1/companies/<company_id>/quotations/<quotation_id>/", "Edit a quotation draft", "company",
   ["quotations.view", "quotations.edit"], "QUOT-02", "yes",
   "Edits header + lines. lines, when present (even []), fully replaces the collection — id updates, no-id creates, unlisted lines removed. customer_id may change while DRAFT. currency/company/reference/status never editable.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "quotation_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}, {"name": "notes", "required": False}, {"name": "valid_until", "required": False, "notes": "null clears it."},
                    {"name": "lines", "required": False, "notes": "Full replace when present. Unchanged lines referencing a since-deactivated product/unit are preserved."}],
   request_example={"expected_version": 1, "notes": "Updated", "lines": [{"id": 31, "product_id": 5, "quantity": "3", "unit_price": "10.5000"}, {"product_id": 6, "quantity": "1.250", "unit_price": "0"}]},
   response_example={"id": 9, "version": 2, "subtotal": "31.50"},
   errors=STD_ERRORS_MUTATE,
   side_effects="A PATCH that changes nothing (including whitespace-only note changes) returns 200 with version unchanged, no audit entry.",
   source_files=["apps/quotations/views.py"])

# ===========================================================================
# apps.sales_orders — Direct Sales Order drafts + confirmation (Task 10F)
# ===========================================================================
op("sales_orders", "GET", "/api/v1/companies/<company_id>/sales-orders/", "List sales orders", "company",
   ["sales_orders.view"], "SO-01", "not applicable",
   "Lists sales orders, newest first. A DRAFT authorizes nothing; a CONFIRMED order authorizes nothing either — no manufacturing, stock reservation or invoice is ever created by this resource.",
   path_params=[{"name": "company_id", "type": "int"}],
   query_params=[{"name": "search", "type": "string", "notes": "order reference, customer name, or customer_order_reference"}, {"name": "customer", "type": "int"}, {"name": "order_date_from", "type": "date"}, {"name": "order_date_to", "type": "date"}],
   response_example={"count": 1, "next": None, "previous": None, "results": [{"id": 9, "reference": "SO-20260924-3F9A1C22BE", "status": "DRAFT", "subtotal": "21.00"}]},
   errors=STD_ERRORS_RW, frontend_usage="Start Here step 5 (list the saved order).", source_files=["apps/sales_orders/views.py"])

op("sales_orders", "POST", "/api/v1/companies/<company_id>/sales-orders/", "Create a sales order draft", "company",
   ["sales_orders.view", "sales_orders.create"], "SO-02", "no (new resource; server assigns version=1)",
   "Creates a DRAFT sales order. requested_delivery_date cannot precede order_date (400, working rule pending client review).",
   path_params=[{"name": "company_id", "type": "int"}],
   request_fields=[{"name": "customer_id", "required": True}, {"name": "order_date", "required": True}, {"name": "currency", "required": True, "immutable": True},
                    {"name": "requested_delivery_date", "required": False}, {"name": "customer_order_reference", "required": False, "notes": "Free text, not unique."}, {"name": "lines", "required": False}],
   request_example={"customer_id": 17, "order_date": "2026-09-29", "requested_delivery_date": "2026-10-15", "currency": "INR",
                     "lines": [{"product_id": 5, "quantity": "2", "unit_price": "10.50"}]},
   response_example={"id": 9, "reference": "SO-20260929-3F9A1C22BE", "status": "DRAFT", "version": 1, "subtotal": "21.00"},
   response_status=201, errors=STD_ERRORS_RW, frontend_usage="Start Here step 5 (create the sales-order draft).",
   source_files=["apps/sales_orders/views.py", "apps/sales_orders/serializers.py"])

op("sales_orders", "GET", "/api/v1/companies/<company_id>/sales-orders/<sales_order_id>/", "Sales order detail", "company",
   ["sales_orders.view"], "SO-03", "not applicable", "Full detail. status may be DRAFT or CONFIRMED; confirmed_by_id/confirmed_at/confirmation_policy_version/confirmation_policy are null for a draft.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "sales_order_id", "type": "int"}],
   response_example={"id": 9, "reference": "SO-20260924-3F9A1C22BE", "status": "DRAFT", "customer_id": 17,
                      "lines": [{"id": 31, "product_code": "PROD-001", "quantity": "2.000", "unit_price": "10.5000", "line_amount": "21.00"}],
                      "subtotal": "21.00", "version": 1, "confirmed_by_id": None, "confirmed_at": None},
   errors=STD_ERRORS_RW, frontend_usage="Start Here step 5 (retrieve the saved order).", source_files=["apps/sales_orders/views.py"])

op("sales_orders", "PATCH", "/api/v1/companies/<company_id>/sales-orders/<sales_order_id>/", "Edit a draft sales order", "company",
   ["sales_orders.view", "sales_orders.edit"], "SO-02", "yes",
   "DRAFT only — a CONFIRMED order rejects every edit (400 at current version, 409 at a stale one; no unconfirm/cancel/amend exists). lines, when present, fully replaces the collection.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "sales_order_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True}, {"name": "customer_order_reference", "required": False},
                    {"name": "lines", "required": False, "notes": "Full replace when present."}],
   request_example={"expected_version": 1, "customer_order_reference": "CUST-PO-002", "lines": [{"id": 31, "product_id": 5, "quantity": "3", "unit_price": "10.5000"}]},
   response_example={"id": 9, "version": 2, "subtotal": "31.50"},
   errors=STD_ERRORS_MUTATE + [{"status": 400, "condition": "\"Only a draft sales order can be edited\" — the order is already CONFIRMED."}],
   source_files=["apps/sales_orders/views.py"])

op("sales_orders", "GET", "/api/v1/companies/<company_id>/sales-orders/<sales_order_id>/confirmation-preview/", "Confirmation eligibility preview", "company",
   ["sales_orders.view"], "SO-04", "not applicable (order.version returned for use in the confirm call)",
   "Read-only, informational. Calls the SAME assessment function the confirm command uses, so the reasons shown are the reasons enforced — but it can be stale immediately and does not guarantee a later confirmation will succeed.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "sales_order_id", "type": "int"}],
   response_example={"preview": {"informational": True, "business_date": "2026-09-24"},
       "order": {"id": 9, "status": "DRAFT", "version": 3},
       "confirmation": {"workflow_implemented": True, "policy": {"status": "CONFIGURED", "allow_self_confirmation": False},
                         "blocking_reasons": [{"code": "INACTIVE_PRODUCT", "category": "ELIGIBILITY", "message": "Product 'PROD-001' is inactive.", "line_id": 31}],
                         "informational_observations": [], "actor_has_confirm_permission": True, "ready_to_attempt": False}},
   errors=STD_ERRORS_RW,
   side_effects="Strictly read-only: no status/version change, no audit event, no locks, no stock/batch/production effect.",
   frontend_usage="Start Here step 6 (review before confirming).", source_files=["apps/sales_orders/views.py"])

op("sales_orders", "POST", "/api/v1/companies/<company_id>/sales-orders/<sales_order_id>/confirm/", "Confirm a sales order (DRAFT -> CONFIRMED)", "company",
   ["sales_orders.view", "sales_orders.confirm"], "SO-05", "yes",
   "Locks the order, re-reads the company policy and every referenced customer/product/unit, re-assesses with the preview's own function, then sets CONFIRMED + confirmed_by_id/confirmed_at/confirmation_policy_version/confirmation_policy, or changes nothing. Permission is seeded and assigned to nobody by default.",
   path_params=[{"name": "company_id", "type": "int"}, {"name": "sales_order_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True, "notes": "The order.version the user reviewed via the preview; nothing else is accepted."}],
   request_example={"expected_version": 3},
   response_example={"id": 9, "status": "CONFIRMED", "version": 4, "confirmed_by_id": 8, "confirmed_at": "2026-09-24T10:05:00Z", "confirmation_policy_version": 2},
   errors=STD_ERRORS_MUTATE + [
       {"status": 400, "condition": "code=confirmation_policy_not_configured (policy missing/incomplete) OR code=confirmation_blocked (other blocking_reasons) — nothing written either way."},
   ],
   side_effects="Reserves no stock, creates no batch/invoice/production record, is not linked to any quotation. Lock order is fixed: order -> policy -> customer -> products (by id) -> units (by id), so no deadlock cycle exists against any other locking service in this API.",
   frontend_usage="Start Here step 6 (confirm where policy and permissions allow).", source_files=["apps/sales_orders/views.py", "apps/sales_orders/services.py"])

op("sales_orders", "GET", "/api/v1/companies/<company_id>/sales-order-confirmation-policy/", "Read confirmation policy", "configuration",
   ["active superuser"], "SO-06", "not applicable",
   "Reads the company's confirmation policy. Three explicit values, each true/false or null (= unanswered, never defaulted) — a missing row or any null blocks confirmation for everyone.",
   path_params=[{"name": "company_id", "type": "int"}],
   response_example={"company_id": 3, "status": "CONFIGURED", "version": 2, "allow_self_confirmation": False, "allow_zero_price_lines": True, "allow_past_requested_delivery_dates": False},
   errors=STD_ERRORS_RW, source_files=["apps/sales_orders/views.py"])

op("sales_orders", "PATCH", "/api/v1/companies/<company_id>/sales-order-confirmation-policy/", "Configure confirmation policy", "configuration",
   ["active superuser"], "SO-06", "yes (0 = no row yet, creates it)",
   "Configures the company's confirmation policy. Configuring it grants NO confirmation authority and no company access by itself.",
   path_params=[{"name": "company_id", "type": "int"}],
   request_fields=[{"name": "expected_version", "required": True, "notes": "0 when no row exists yet."}, {"name": "allow_self_confirmation", "required": False, "notes": "true/false only — null/strings rejected."},
                    {"name": "allow_zero_price_lines", "required": False}, {"name": "allow_past_requested_delivery_dates", "required": False}],
   request_example={"expected_version": 0, "allow_zero_price_lines": False},
   response_example={"company_id": 3, "status": "INCOMPLETE", "version": 1, "allow_zero_price_lines": False, "allow_self_confirmation": None},
   errors=STD_ERRORS_MUTATE, side_effects="Every change is audited with before/after; a no-op keeps the version and writes no audit entry.",
   source_files=["apps/sales_orders/views.py"])
