"""Development-only real-HTTP demonstration of the implemented COMMERCIAL
drafting (quotation + direct sales order) and FORMULA drafting journeys,
run as ordinary permission-assigned demo users (never a superuser) against
a local `python manage.py runserver` at 127.0.0.1:8001.

Requires `python manage.py seed_demo_data --yes` (Task 11B extended) and
the demo credentials file it maintains. Reuses the `Session` helper of
`scripts/demo_http_flow.py`. The only ORM read is at startup (demo record
ids by code); every demonstrated step is real HTTP with CSRF, Bearer
tokens and `expected_version` values read from previous responses.

Nothing here confirms an order, approves a formula, creates a batch, or
touches stock - none of those exist. Passwords are never printed.

Run: python scripts/demo_http_commercial_formula.py
"""

import json
import os
import sys
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import demo_http_flow as base  # noqa: E402

OUTPUT_PATH = Path(__file__).resolve().parent.parent / ".demo_commercial_formula_result.local.json"
CHECKS = []


def check(label, status, expected, body=None):
    ok = status == expected
    CHECKS.append({"check": label, "status": status, "expected": expected, "ok": ok})
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}: HTTP {status} (expected {expected})")
    if not ok:
        raise RuntimeError(f"{label}: expected {expected}, got {status}: {json.dumps(body)[:400]}")
    return body


def assert_true(label, condition, detail=""):
    CHECKS.append({"check": label, "status": None, "expected": None, "ok": bool(condition)})
    print(f"  [{'PASS' if condition else 'FAIL'}] {label} {detail}")
    if not condition:
        raise RuntimeError(f"Assertion failed: {label} {detail}")


def line_amount(quantity, unit_price):
    return (Decimal(quantity) * Decimal(unit_price)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def find(items, key, value):
    return next(item for item in items if item.get(key) == value)


def rows(body):
    return body["results"] if isinstance(body, dict) and "results" in body else body


def main():
    passwords = base._load_credentials()
    for needed in ("demo_sales", "demo_formula", "demo_formula_nocatalog", "demo_companyb_user"):
        if needed not in passwords:
            sys.exit(f"No recorded password for '{needed}' - see docs/demo-runbook.md (credentials file).")

    import django

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")
    django.setup()
    from apps.companies.models import Company

    company_a = Company.objects.get(code="DEMOA")
    company_b = Company.objects.get(code="DEMOB")
    A, B = company_a.id, company_b.id
    today = date.today()
    result = {"generated_at": datetime.now(timezone.utc).isoformat(), "company_a_id": A}

    sales = base.Session("demo_sales")
    formula = base.Session("demo_formula")
    nocat = base.Session("demo_formula_nocatalog")
    other = base.Session("demo_companyb_user")

    # ------------------------------------------------------------------
    base.step("A. Commercial drafting as demo_sales (company permissions only)")
    sales.login("demo_sales", passwords["demo_sales"])
    status, body = sales.get("/api/v1/companies/mine/")
    check("select accessible company (companies/mine)", status, 200, body)
    companies = body["companies"] if isinstance(body, dict) else body
    assert_true("DEMOA is in the user's accessible companies", any(c["id"] == A for c in companies))

    status, body = sales.get(f"/api/v1/companies/{A}/customers/?is_active=true")
    check("customer picker (customers.view)", status, 200, body)
    customer = find(rows(body), "code", "DEMOCUST1")
    status, body = sales.get(f"/api/v1/companies/{A}/products/?is_active=true")
    check("product picker (products.view)", status, 200, body)
    p_count = find(rows(body), "code", "DEMOPROD1")
    p_mass = find(rows(body), "code", "DEMOPROD2")

    lines = [
        {"product_id": p_count["id"], "quantity": "12", "unit_price": "45.5000", "description": "Demo bottles"},
        {"product_id": p_mass["id"], "quantity": "2.500", "unit_price": "1000.3333"},
    ]
    status, quote = sales.post(
        f"/api/v1/companies/{A}/quotations/",
        {"customer_id": customer["id"], "quotation_date": today.isoformat(),
         "valid_until": (today + timedelta(days=30)).isoformat(), "currency": "inr",
         "notes": "Synthetic demo quotation", "lines": lines},
    )
    check("create quotation draft", status, 201, quote)
    expected = [line_amount("12", "45.5000"), line_amount("2.500", "1000.3333")]
    assert_true("quotation status is DRAFT, version 1", quote["status"] == "DRAFT" and quote["version"] == 1)
    assert_true("line amounts are Decimal ROUND_HALF_UP", [Decimal(l["line_amount"]) for l in quote["lines"]] == expected,
                f"{[l['line_amount'] for l in quote['lines']]}")
    assert_true("subtotal is the pre-tax Decimal sum, no grand total",
                Decimal(quote["subtotal"]) == sum(expected) and "grand_total" not in quote, quote["subtotal"])
    assert_true("snapshots captured from the product and its sales unit",
                quote["lines"][0]["product_code"] == "DEMOPROD1" and quote["lines"][0]["sales_uom_code"] == "DEMOBTL")

    first, second = quote["lines"]
    status, quote2 = sales.patch(
        f"/api/v1/companies/{A}/quotations/{quote['id']}/",
        {"expected_version": quote["version"], "notes": "Edited using returned version",
         "lines": [
             {"id": first["id"], "product_id": p_count["id"], "quantity": "10", "unit_price": "45.5000",
              "description": "Demo bottles"},
             {"id": second["id"], "product_id": p_mass["id"], "quantity": "2.500", "unit_price": "1000.3333"},
         ]},
    )
    check("edit quotation with its returned version", status, 200, quote2)
    expected2 = [line_amount("10", "45.5000"), line_amount("2.500", "1000.3333")]
    assert_true("version bumped to 2 and subtotal recomputed",
                quote2["version"] == 2 and Decimal(quote2["subtotal"]) == sum(expected2), quote2["subtotal"])
    status, detail = sales.get(f"/api/v1/companies/{A}/quotations/{quote['id']}/")
    check("quotation detail", status, 200, detail)

    status, order = sales.post(
        f"/api/v1/companies/{A}/sales-orders/",
        {"customer_id": customer["id"], "order_date": today.isoformat(),
         "requested_delivery_date": (today + timedelta(days=14)).isoformat(),
         "customer_order_reference": "DEMO-CUST-PO-001", "currency": "INR", "notes": "Separate direct order",
         "lines": [{"product_id": p_count["id"], "quantity": "24", "unit_price": "44.0000"}]},
    )
    check("create SEPARATE direct sales-order draft", status, 201, order)
    assert_true("order is DRAFT with SO- reference and no quotation link",
                order["status"] == "DRAFT" and order["reference"].startswith("SO-") and "quotation_id" not in order
                and "quotation" not in json.dumps(order).lower())
    assert_true("order subtotal is Decimal, pre-tax", Decimal(order["subtotal"]) == line_amount("24", "44.0000"))
    status, quote_after = sales.get(f"/api/v1/companies/{A}/quotations/{quote['id']}/")
    check("quotation untouched by the order (not converted)", status, 200, quote_after)
    assert_true("quotation still version 2 and DRAFT", quote_after["version"] == 2 and quote_after["status"] == "DRAFT")
    forbidden_keys = {"reserved_quantity", "dispatched_quantity", "stock", "confirmed", "invoice_id"}
    assert_true("no stock/reservation/confirmation fields exist on either draft",
                not (forbidden_keys & set(order)) and not (forbidden_keys & set(quote_after)))
    result.update(quotation_id=quote["id"], quotation_reference=quote["reference"], sales_order_id=order["id"],
                  sales_order_reference=order["reference"])

    # ------------------------------------------------------------------
    base.step("B. Formula drafting as demo_formula (company perms + separate store perm)")
    formula.login("demo_formula", passwords["demo_formula"])
    status, body = formula.get("/api/v1/companies/mine/")
    check("select accessible company", status, 200, body)
    status, body = formula.get("/api/v1/stores/mine/")
    check("store membership visible (stores/mine)", status, 200, body)
    status, body = formula.get(f"/api/v1/companies/{A}/products/?is_active=true")
    check("product picker (products.view)", status, 200, body)
    product = find(rows(body), "code", "DEMOPROD1")
    status, body = formula.get("/api/v1/materials/?is_active=true&kind=RAW_MATERIAL")
    check("raw material picker (shared_catalog.view via store)", status, 200, body)
    raw = find(rows(body), "code", "DEMOMAT1")
    status, body = formula.get("/api/v1/materials/?is_active=true&kind=PACKAGING_MATERIAL")
    check("packaging material picker (shared_catalog.view via store)", status, 200, body)
    pack = find(rows(body), "code", "DEMOPACK1")

    status, f = formula.post(
        f"/api/v1/companies/{A}/formulas/",
        {"product_id": product["id"], "code": f"DEMOF{datetime.now().strftime('%H%M%S')}",
         "name": "Synthetic demo formula", "base_output_quantity": "100"},
    )
    check("create formula (with revision 1)", status, 201, f)
    rev1 = f["revisions"][0]
    assert_true("revision 1 is DRAFT, empty, output unit derived from the product",
                rev1["revision_number"] == 1 and rev1["status"] == "DRAFT" and rev1["line_count"] == 0
                and rev1["output_uom_code"] == "DEMOBTL")
    base_path = f"/api/v1/companies/{A}/formulas/{f['id']}"
    status, r1 = formula.patch(
        f"{base_path}/revisions/{rev1['id']}/",
        {"expected_version": rev1["version"], "notes": "Synthetic draft",
         "lines": [{"material_id": raw["id"], "quantity": "5.500", "notes": "raw"},
                   {"material_id": pack["id"], "quantity": "100", "notes": "packaging"}]},
    )
    check("save raw + packaging lines in ONE revision PATCH", status, 200, r1)
    assert_true("both types saved together, types derived from materials",
                [l["material_type"] for l in r1["lines"]] == ["RAW_MATERIAL", "PACKAGING_MATERIAL"] and r1["version"] == 2)
    status, r2 = formula.post(f"{base_path}/revisions/", {"base_output_quantity": "200", "notes": "Second draft"})
    check("create revision 2", status, 201, r2)
    assert_true("revision 2 starts empty", r2["revision_number"] == 2 and r2["lines"] == [] and r2["version"] == 1)
    status, r1_again = formula.get(f"{base_path}/revisions/{rev1['id']}/")
    check("re-read revision 1", status, 200, r1_again)
    assert_true("revision 1 unchanged by creating revision 2",
                r1_again["version"] == 2 and [l["id"] for l in r1_again["lines"]] == [l["id"] for l in r1["lines"]])
    status, r1_scaled = formula.patch(
        f"{base_path}/revisions/{rev1['id']}/", {"expected_version": 2, "base_output_quantity": "500"}
    )
    check("edit base output of revision 1", status, 200, r1_scaled)
    assert_true("base output changed but line quantities NOT scaled",
                r1_scaled["base_output_quantity"] == "500.000"
                and [l["quantity"] for l in r1_scaled["lines"]] == ["5.500", "100.000"])
    status, f_after = formula.get(f"{base_path}/")
    check("formula detail", status, 200, f_after)
    assert_true("formula version and latest_revision_number are independent counters",
                f_after["version"] == 1 and f_after["latest_revision_number"] == 2)
    result.update(formula_id=f["id"], formula_code=f["code"], revision_1_id=rev1["id"], revision_2_id=r2["id"])

    # ------------------------------------------------------------------
    base.step("C. Access and conflict checks")
    nocat.login("demo_formula_nocatalog", passwords["demo_formula_nocatalog"])
    status, body = nocat.get("/api/v1/materials/?is_active=true")
    check("company-only formula user is DENIED the material lookup (needs shared_catalog.view via store)",
          status, 403, body)
    assert_true("denial names the store-level permission", "shared_catalog.view" in json.dumps(body))
    status, body = nocat.get(f"/api/v1/companies/{A}/products/")
    check("same user can still read products (company permission)", status, 200, body)

    other.login("demo_companyb_user", passwords["demo_companyb_user"])
    status, body = other.get(f"/api/v1/companies/{A}/quotations/{quote['id']}/")
    check("Company B user reading Company A quotation (cross-company)", status, 404, body)
    status, body = other.get(f"/api/v1/companies/{A}/formulas/{f['id']}/")
    check("Company B user reading Company A formula", status, 404, body)
    status, body = sales.get(f"/api/v1/companies/{B}/quotations/")
    check("Company A sales user listing Company B quotations", status, 404, body)

    status, body = sales.patch(
        f"/api/v1/companies/{A}/quotations/{quote['id']}/", {"expected_version": 1, "notes": "stale"}
    )
    check("stale quotation expected_version", status, 409, body)
    status, body = formula.patch(
        f"{base_path}/revisions/{rev1['id']}/", {"expected_version": 1, "notes": "stale"}
    )
    check("stale formula-revision expected_version", status, 409, body)

    status, body = sales.post(f"/api/v1/companies/{A}/formulas/", {})
    check("sales user (no formulas.*) creating a formula", status, 403, body)
    status, body = formula.post(f"/api/v1/companies/{A}/quotations/", {})
    check("formula user (no quotations.*) creating a quotation", status, 403, body)
    status, body = sales.get("/api/v1/materials/")
    check("sales user (no store membership) reading the material catalog", status, 403, body)
    status, body = other.post(f"/api/v1/companies/{A}/quotations/", {})
    check("Company B user creating in Company A", status, 404, body)
    anonymous = base.Session("anonymous")
    status, body = anonymous.get(f"/api/v1/companies/{A}/quotations/")
    check("unauthenticated request", status, 401, body)

    status, body = sales._request("DELETE", f"/api/v1/companies/{A}/quotations/{quote['id']}/")
    check("DELETE quotation is not allowed", status, 405, body)
    status, body = sales.post(f"/api/v1/companies/{A}/quotations/{quote['id']}/approve/", {})
    check("no quotation approve endpoint exists", status, 404, body)
    status, body = sales.post(
        f"/api/v1/companies/{A}/sales-orders/{order['id']}/confirm/", {"expected_version": order["version"]}
    )
    check("demo_sales (no sales_orders.confirm) cannot confirm; demo never configures a policy", status, 403, body)
    status, body = formula.post(f"{base_path}/revisions/{rev1['id']}/approve/", {})
    check("no formula-revision approve endpoint exists", status, 404, body)

    result["checks_passed"] = sum(1 for c in CHECKS if c["ok"])
    result["checks_total"] = len(CHECKS)
    OUTPUT_PATH.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"\nALL {len(CHECKS)} CHECKS PASSED. Ids written to {OUTPUT_PATH.name} (no secrets).")


if __name__ == "__main__":
    main()
