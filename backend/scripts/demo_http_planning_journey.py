"""Development-only real-HTTP demonstration of the CONNECTED PLANNING
journey (Task 13E): Login -> Company -> Customer/Product -> Sales-order
draft -> approved formula selection -> Batch plan (with an explicit
packing relationship) -> Requirement preview/packing assessment ->
official Batch number -> Store Preparation -> Material Requisition draft.

No new business modules or lifecycle rules are exercised: every endpoint
called here already exists (Tasks 10F, 11C, 12A-12D, 13A). This script
only connects them into one reproducible journey, run entirely over real
HTTP (CSRF, Bearer tokens, `expected_version` read from the previous
response) as two ordinary permission-assigned users - `demo_planner` and
`demo_store_planner` - never a superuser. Nothing here approves a formula
(that happens once, idempotently, in `seed_demo_data`'s own Task 13E
extension) or touches stock (no goods receipt exists in this journey at
all, so `apps.stock_movements` has nothing to record).

Requires `python manage.py seed_demo_data --yes` (Task 13E extension) and
its credentials file. Reuses `scripts/demo_http_flow.py`'s `Session`/
`step`/`_load_credentials` helpers.

REPEAT SAFETY: this script is safe to run more than once. The sales order
and batch plan it creates have no database-enforced uniqueness of their
own, so this script tracks their ids in a local, gitignored run-state file
(`backend/.demo_planning_journey_result.local.json`) and reuses them,
after re-validating their context over HTTP, rather than creating a new
one every run. Store Preparation and Material Requisition ARE database-
uniqueness-protected (one each per batch plan) - this script always
attempts to create them and treats a `409` as confirmation that the
existing one is correct, never as a successful new creation, then reads
the existing record back. Batch number allocation is itself idempotent at
the plan's current version (Task 12D) - this script always calls it and
asserts the returned number is unchanged on a repeat.

Run: python scripts/demo_http_planning_journey.py
"""

import json
import os
import sys
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import demo_http_flow as base  # noqa: E402

OUTPUT_PATH = Path(__file__).resolve().parent.parent / ".demo_planning_journey_result.local.json"
CHECKS = []

FORBIDDEN_KEYS = {
    "available_stock", "usable_stock", "unqualified_on_hand", "shortage",
    "reserved_quantity", "issued_quantity", "consumed_quantity", "can_produce",
    "approved", "ready_to_issue", "qc_status", "released", "release_status",
    "produced_quantity", "production_status",
}


def check(label, status, expected, body=None):
    ok = status == expected
    CHECKS.append({"check": label, "status": status, "expected": expected, "ok": ok})
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}: HTTP {status} (expected {expected})")
    if not ok:
        raise RuntimeError(f"{label}: expected {expected}, got {status}: {json.dumps(body)[:500]}")
    return body


def assert_true(label, condition, detail=""):
    CHECKS.append({"check": label, "status": None, "expected": None, "ok": bool(condition)})
    print(f"  [{'PASS' if condition else 'FAIL'}] {label} {detail}")
    if not condition:
        raise RuntimeError(f"Assertion failed: {label} {detail}")


def find(items, key, value):
    return next(item for item in items if item.get(key) == value)


def rows(body):
    return body["results"] if isinstance(body, dict) and "results" in body else body


def _assert_no_forbidden_keys(label, obj):
    present = FORBIDDEN_KEYS & set(json.loads(json.dumps(obj)).keys()) if isinstance(obj, dict) else set()
    assert_true(f"{label}: no stock/QC/production fields invented", not present, str(present))


def _load_state():
    if OUTPUT_PATH.exists():
        try:
            return json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
        except ValueError:
            return {}
    return {}


def _save_state(result):
    """Written after each resource that has no database-uniqueness
    protection of its own (sales order, batch plan) is created or
    confirmed, not only at the very end - so an interrupted run still
    leaves an accurate, reusable record for the next run, rather than
    risking a duplicate order/plan on retry.
    """
    OUTPUT_PATH.write_text(json.dumps(result, indent=2), encoding="utf-8")


def main():
    passwords = base._load_credentials()
    for needed in ("demo_planner", "demo_store_planner"):
        if needed not in passwords:
            sys.exit(
                f"No recorded password for '{needed}' - run "
                "'python manage.py seed_demo_data --yes' first (Task 13E extension), see docs/demo-runbook.md §4.4."
            )

    import django

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")
    django.setup()
    from apps.catalog.models import UnitOfMeasure
    from apps.companies.models import Company
    from apps.customers.models import Customer
    from apps.formulas.models import FormulaRevision
    from apps.products.models import Product
    from apps.stock_movements.models import StockMovement
    from apps.stores.models import SharedStore

    company_a = Company.objects.get(code="DEMOA")
    store = SharedStore.objects.get(code="DEMOWH")
    customer = Customer.objects.get(company=company_a, code="DEMOCUST1")
    product = Product.objects.get(company=company_a, code="DEMOPROD1")
    mass_g_unit = UnitOfMeasure.objects.get(code="DEMOMG")
    revision = FormulaRevision.objects.select_related("formula", "output_uom").get(
        formula__code="DEMOFPACK13E", revision_number=1
    )
    if revision.status != FormulaRevision.Status.APPROVED:
        sys.exit(
            "Formula 'DEMOFPACK13E' revision 1 is not APPROVED - run "
            "'python manage.py seed_demo_data --yes' first (Task 13E extension)."
        )
    # ORM-only assertion (not a persona action - see module docstring):
    # this journey never creates a GoodsReceipt, so it must never create a
    # StockMovement either. Read before and after, never just after.
    movements_before = StockMovement.objects.filter(store=store).count()

    A, STORE = company_a.id, store.id
    state = _load_state()
    result = {"generated_at": datetime.now(timezone.utc).isoformat(), "company_id": A, "store_id": STORE}

    planner = base.Session("demo_planner")
    store_user = base.Session("demo_store_planner")

    # ------------------------------------------------------------------
    base.step("1. Login as demo_planner, GET current user")
    planner.login("demo_planner", passwords["demo_planner"])
    status, me = planner.get("/api/v1/auth/me/")
    check("current user (planner)", status, 200, me)
    assert_true("session belongs to demo_planner", me["username"] == "demo_planner")

    # ------------------------------------------------------------------
    base.step("2. Accessible company + permission lookup (planner)")
    status, companies = planner.get("/api/v1/companies/mine/")
    check("companies/mine (planner)", status, 200, companies)
    assert_true("DEMOA visible to planner", any(c["id"] == A for c in companies["companies"]))
    status, perms = planner.get(f"/api/v1/companies/{A}/my-permissions/")
    check("my-permissions (planner, company)", status, 200, perms)
    perm_codes = perms["permissions"] if isinstance(perms, dict) else perms
    assert_true(
        "planner holds exactly the permissions this journey exercises",
        {"sales_orders.create", "formulas.view", "batch_plans.create", "batch_plans.allocate_number"} <= set(perm_codes),
    )

    # ------------------------------------------------------------------
    base.step("3. Customer/product lookup (planner)")
    status, body = planner.get(f"/api/v1/companies/{A}/customers/?is_active=true")
    check("customer lookup", status, 200, body)
    cust = find(rows(body), "code", "DEMOCUST1")
    assert_true("customer id matches the ORM-read DEMOCUST1", cust["id"] == customer.id)
    status, body = planner.get(f"/api/v1/companies/{A}/products/?is_active=true")
    check("product lookup", status, 200, body)
    prod = find(rows(body), "code", "DEMOPROD1")
    assert_true("product id matches the ORM-read DEMOPROD1", prod["id"] == product.id)

    # ------------------------------------------------------------------
    base.step("4. Create or retrieve the sales-order draft (3024 bottles)")
    order = None
    if state.get("sales_order_id"):
        status, existing = planner.get(f"/api/v1/companies/{A}/sales-orders/{state['sales_order_id']}/")
        if (
            status == 200
            and existing.get("status") == "DRAFT"
            and len(existing.get("lines", [])) == 1
            and existing["lines"][0]["product_id"] == prod["id"]
            and existing["lines"][0]["quantity"] == "3024.000"
        ):
            order = existing
            print(f"  Reusing existing sales-order draft {order['reference']} (id={order['id']}) - not re-created")
        else:
            print("  Recorded sales_order_id no longer matches the expected context - creating a fresh one")
    if order is None:
        status, order = planner.post(
            f"/api/v1/companies/{A}/sales-orders/",
            {
                "customer_id": cust["id"],
                "order_date": date.today().isoformat(),
                "requested_delivery_date": (date.today() + timedelta(days=14)).isoformat(),
                "customer_order_reference": "DEMO-PLANNING-13E",
                "currency": "INR",
                "notes": "Task 13E connected planning demo - synthetic, not a real order",
                "lines": [{"product_id": prod["id"], "quantity": "3024", "unit_price": "45.5000"}],
            },
        )
        check("create sales-order draft", status, 201, order)
    assert_true("order is DRAFT with one 3024-bottle line", order["status"] == "DRAFT" and len(order["lines"]) == 1)
    line = order["lines"][0]
    _assert_no_forbidden_keys("sales order", order)
    result.update(sales_order_id=order["id"], sales_order_reference=order["reference"], sales_order_line_id=line["id"])
    _save_state(result)

    # ------------------------------------------------------------------
    base.step("5. Retrieve the explicitly selected approved formula revision")
    status, rev_body = planner.get(f"/api/v1/companies/{A}/formulas/{revision.formula_id}/revisions/{revision.id}/")
    check("GET approved formula revision", status, 200, rev_body)
    assert_true("revision is APPROVED", rev_body["status"] == "APPROVED")
    assert_true("output unit is the mass-kg conversion unit", rev_body["output_uom_code"] == "DEMOMKG")
    assert_true("base output quantity is 76.000 kg-equivalent", rev_body["base_output_quantity"] == "76.000")
    formula_version_at_step5 = rev_body["version"]
    formula_lines_at_step5 = rev_body["lines"]
    result.update(formula_id=revision.formula_id, formula_revision_id=revision.id)

    # ------------------------------------------------------------------
    base.step("6. Create or retrieve the batch plan (explicit packing relationship)")
    plan = None
    if state.get("batch_plan_id"):
        status, existing = planner.get(f"/api/v1/companies/{A}/batch-plans/{state['batch_plan_id']}/")
        if (
            status == 200
            and existing["sales_order_line_id"] == line["id"]
            and existing["formula_revision_id"] == revision.id
            and existing["packing_content_uom_id"] is not None
        ):
            plan = existing
            print(f"  Reusing existing batch plan (id={plan['id']}) - not re-created")
        else:
            print("  Recorded batch_plan_id no longer matches the expected context - creating a fresh one")
    if plan is None:
        status, plan = planner.post(
            f"/api/v1/companies/{A}/batch-plans/",
            {
                "sales_order_line_id": line["id"],
                "formula_revision_id": revision.id,
                "target_output_quantity": "76.000",
                "planned_pack_quantity": "3024",
                "packing_content_quantity": "25",
                "packing_content_uom_id": mass_g_unit.id,
                "packing_size_note": "3024 bottles x 25g packing content (Task 13E demo)",
                "notes": "Task 13E connected planning demo",
            },
        )
        check("create batch plan with packing relationship", status, 201, plan)
    assert_true("plan status is DRAFT", plan["status"] == "DRAFT")
    _assert_no_forbidden_keys("batch plan", plan)
    result.update(batch_plan_id=plan["id"])
    _save_state(result)

    # ------------------------------------------------------------------
    base.step("7. Retrieve requirement preview and packing assessment")
    status, preview = planner.get(f"/api/v1/companies/{A}/batch-plans/{plan['id']}/requirement-preview/")
    check("GET requirement preview", status, 200, preview)
    assert_true("calculation is complete (no rounding needed)", preview["calculation_complete"] is True)
    packing = preview["packing_assessment"]
    assert_true("packing assessment is present", packing is not None)
    assert_true("expected packed content is 75.6 kg-equivalent", packing["expected_packed_content"]["value"] == "75.6")
    assert_true(
        "planning quantity difference is +0.4 (never called waste/loss/allowance)",
        packing["difference"]["value"] == "0.4" and packing["difference"]["label"] == "Planning quantity difference",
    )
    for row in preview["lines"]:
        assert_true(
            f"line {row['line_number']} required quantity is exact (factor 1, no rounding)",
            row["required_quantity"]["is_exact"] is True,
        )

    # ------------------------------------------------------------------
    base.step("8. Allocate the synthetic official batch number")
    status, plan_before = planner.get(f"/api/v1/companies/{A}/batch-plans/{plan['id']}/")
    check("re-read plan before allocation", status, 200, plan_before)
    status, numbered = planner.post(
        f"/api/v1/companies/{A}/batch-plans/{plan['id']}/allocate-number/",
        {"expected_version": plan_before["version"]},
    )
    check("allocate batch number", status, 200, numbered)
    batch_number = numbered["official_batch_number"]
    assert_true("batch number uses the synthetic DEMOCUST1 customer code", batch_number.startswith("DEMOCUST1"))
    assert_true("plan status is still DRAFT (numbering authorizes nothing)", numbered["status"] == "DRAFT")
    if state.get("batch_number"):
        assert_true(
            "repeated allocation returns the SAME permanent number",
            batch_number == state["batch_number"],
            f"{batch_number} vs {state['batch_number']}",
        )
    result.update(batch_number=batch_number)
    _save_state(result)

    # ------------------------------------------------------------------
    base.step("2b. Login as demo_store_planner, accessible store + permission lookup")
    store_user.login("demo_store_planner", passwords["demo_store_planner"])
    status, stores = store_user.get("/api/v1/stores/mine/")
    check("stores/mine (store planner)", status, 200, stores)
    assert_true("DEMOWH visible to store planner", any(s["id"] == STORE for s in stores["stores"]))
    status, store_perms = store_user.get(f"/api/v1/stores/{STORE}/my-permissions/")
    check("my-permissions (store planner, store)", status, 200, store_perms)

    # ------------------------------------------------------------------
    base.step("9. Create or retrieve Store Preparation")
    status, prep = store_user.post(
        f"/api/v1/stores/{STORE}/preparations/",
        {"batch_plan_id": plan["id"], "packing_type": "Amber bottle, 200ml (Task 13E demo)", "insert_required": True},
    )
    preparation_duplicate_409_confirmed = False
    if status == 409:
        preparation_duplicate_409_confirmed = True
        print("  409 as expected (already exists) - NOT counted as a new creation; retrieving the existing record")
        status, listing = store_user.get(f"/api/v1/stores/{STORE}/preparations/?batch_plan={plan['id']}")
        check("list existing store preparation after 409", status, 200, listing)
        prep = rows(listing)[0]
        status, prep = store_user.get(f"/api/v1/stores/{STORE}/preparations/{prep['id']}/")
        check("GET the existing store preparation", status, 200, prep)
    else:
        check("create store preparation", status, 201, prep)
    assert_true("preparation references this batch plan", prep["batch_plan_id"] == plan["id"])
    _assert_no_forbidden_keys("store preparation", prep)

    # ------------------------------------------------------------------
    base.step("10. Create or retrieve Material Requisition Draft")
    status, plan_current = planner.get(f"/api/v1/companies/{A}/batch-plans/{plan['id']}/")
    check("re-read plan for its current version", status, 200, plan_current)
    status, req = store_user.post(
        f"/api/v1/stores/{STORE}/material-requisitions/",
        {
            "batch_plan_id": plan["id"],
            "expected_batch_plan_version": plan_current["version"],
            "notes": "Task 13E connected planning demo",
        },
    )
    requisition_duplicate_409_confirmed = False
    if status == 409:
        requisition_duplicate_409_confirmed = True
        print("  409 as expected (already exists) - NOT counted as a new creation; retrieving the existing record")
        status, listing = store_user.get(f"/api/v1/stores/{STORE}/material-requisitions/?batch_plan={plan['id']}")
        check("list existing material requisition after 409", status, 200, listing)
        req = rows(listing)[0]
        status, req = store_user.get(f"/api/v1/stores/{STORE}/material-requisitions/{req['id']}/")
        check("GET the existing material requisition", status, 200, req)
    else:
        check("create material requisition", status, 201, req)
    assert_true("requisition is DRAFT and references this batch plan", req["status"] == "DRAFT" and req["batch_plan_id"] == plan["id"])
    _assert_no_forbidden_keys("material requisition", req)

    all_lines = req["raw_lines"] + req["packaging_lines"]
    for row in all_lines:
        # `calculated_quantity` is the requirement preview's own trimmed
        # display string (e.g. "15.2"); `requested_quantity` is the fixed
        # 3-decimal-place field (e.g. "15.200") auto-populated from it -
        # compare numerically, not as strings.
        assert_true(
            f"requisition line {row['line_number']} requested_quantity matches its saved calculated requirement",
            Decimal(row["requested_quantity"]) == Decimal(row["calculated_quantity"]),
            f"{row['requested_quantity']} vs {row['calculated_quantity']}",
        )
    assert_true("requisition has 2 lines (1 raw + 1 packaging)", len(req["raw_lines"]) == 1 and len(req["packaging_lines"]) == 1)
    if state.get("requisition_id"):
        assert_true("no duplicate requisition id was created on rerun", req["id"] == state["requisition_id"])
    result.update(
        requisition_id=req["id"],
        preparation_id=prep["id"],
        requisition_duplicate_409_confirmed_this_run=requisition_duplicate_409_confirmed,
        preparation_duplicate_409_confirmed_this_run=preparation_duplicate_409_confirmed,
    )

    # ------------------------------------------------------------------
    base.step("Final verification (source formula unchanged; no stock movement created)")
    status, rev_after = planner.get(f"/api/v1/companies/{A}/formulas/{revision.formula_id}/revisions/{revision.id}/")
    check("re-GET approved formula revision", status, 200, rev_after)
    assert_true(
        "source formula content is unchanged by any planning step",
        rev_after["version"] == formula_version_at_step5 and rev_after["lines"] == formula_lines_at_step5,
    )
    movements_after = StockMovement.objects.filter(store=store).count()
    assert_true(
        "no StockMovement was created by any planning step (ORM check, not a persona action)",
        movements_after == movements_before,
        f"{movements_before} -> {movements_after}",
    )

    result["checks_passed"] = sum(1 for c in CHECKS if c["ok"])
    result["checks_total"] = len(CHECKS)
    _save_state(result)
    print(f"\nALL {len(CHECKS)} CHECKS PASSED. Ids written to {OUTPUT_PATH.name} (no secrets).")


if __name__ == "__main__":
    main()
