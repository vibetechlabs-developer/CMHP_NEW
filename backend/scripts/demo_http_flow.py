"""Development-only, read-the-source-and-trust-it demo of the real,
implemented procurement -> receiving -> QC-draft flow, run entirely over
HTTP against a local `python manage.py runserver` - the same way a real
frontend would call this API. Uses only the Python standard library
(no `requests`, which is not a project dependency).

Requires:
  - The dev server running at http://127.0.0.1:8001 (see docs/demo-runbook.md).
  - `python manage.py seed_demo_data --yes` already run once.
  - The demo credentials file it wrote (default:
    backend/.demo_credentials.local.json) still present and unmodified.

Every step of the demonstrated flow itself is a real HTTP request using
the same API contract a frontend must use - including CSRF, Bearer
tokens, and `expected_version` optimistic-concurrency fields read from
the previous response - never a direct service call or a database
shortcut. The one exception is at startup only: it reads (never writes)
the demo company/store/material/supplier ids straight from the ORM,
purely so this script does not need those ids hardcoded or pasted in by
hand; a real frontend would instead get them from its own UI selection
or the `/mine/` endpoints.

Run: python scripts/demo_http_flow.py
"""

import http.cookiejar
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

BASE_URL = "http://127.0.0.1:8001"
CREDENTIALS_PATH = Path(__file__).resolve().parent.parent / ".demo_credentials.local.json"
OUTPUT_PATH = Path(__file__).resolve().parent.parent / ".demo_flow_result.local.json"


def _load_credentials():
    if not CREDENTIALS_PATH.exists():
        sys.exit(
            f"Credentials file not found: {CREDENTIALS_PATH}\n"
            "Run 'python manage.py seed_demo_data --yes' first (see docs/demo-runbook.md)."
        )
    payload = json.loads(CREDENTIALS_PATH.read_text(encoding="utf-8"))
    return {row["username"]: row["password"] for row in payload["users"]}


class Session:
    """One cookie jar (csrftoken + HttpOnly refresh_token) plus the
    current in-memory access token, exactly mirroring how a real
    frontend session works - the access token is never persisted to
    disk here either, only held in this object for the script's
    lifetime.
    """

    def __init__(self, label):
        self.label = label
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.access_token = None
        self.csrf_token = None

    def _request(self, method, path, body=None, auth=True, extra_headers=None):
        url = f"{BASE_URL}{path}"
        data = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {"Content-Type": "application/json"}
        if auth and self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"
        if self.csrf_token and method in ("POST", "PATCH", "PUT", "DELETE"):
            headers["X-CSRFToken"] = self.csrf_token
        if extra_headers:
            headers.update(extra_headers)
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with self.opener.open(req) as resp:
                status = resp.status
                raw = resp.read()
        except urllib.error.HTTPError as exc:
            status = exc.code
            raw = exc.read()
        try:
            parsed = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            parsed = raw.decode("utf-8", errors="replace")
        return status, parsed

    def bootstrap_csrf(self):
        status, body = self._request("GET", "/api/v1/auth/csrf/", auth=False)
        assert status == 200, (status, body)
        self.csrf_token = body["csrfToken"]

    def login(self, username, password):
        """This project's login endpoint is genuinely rate-limited (5/min
        per client IP by default, `AUTH_LOGIN_THROTTLE_RATE`) - a real,
        intentional security control, not a bug to work around by
        changing settings. Seven distinct demo users logging in from the
        same localhost IP in quick succession will legitimately hit it,
        so this waits out the server's own hinted retry time (from the
        429 body) and tries again, exactly as a well-behaved frontend
        should - it never bypasses the throttle or edits its own retry
        budget.
        """
        import re
        import time

        for attempt in range(5):
            self.bootstrap_csrf()
            status, body = self._request(
                "POST", "/api/v1/auth/login/", {"username": username, "password": password}, auth=False
            )
            if status == 200:
                self.access_token = body["access"]
                return
            if status == 429:
                match = re.search(r"available in (\d+) seconds", str(body.get("detail", "")))
                wait_seconds = int(match.group(1)) + 2 if match else 15
                print(f"  (login throttled for {username}, waiting {wait_seconds}s before retrying - "
                      "this is the real rate limit, not simulated)")
                time.sleep(wait_seconds)
                continue
            raise RuntimeError(f"Login failed for {username}: {status} {body}")
        raise RuntimeError(f"Login for {username} still throttled after several retries.")

    def get(self, path):
        return self._request("GET", path)

    def post(self, path, body):
        return self._request("POST", path, body)

    def patch(self, path, body):
        return self._request("PATCH", path, body)


def step(label):
    print(f"\n=== {label} ===")


def expect(status, body, expected):
    if status != expected:
        raise RuntimeError(f"Expected HTTP {expected}, got {status}: {json.dumps(body)}")
    return body


def main():
    passwords = _load_credentials()

    def creds(username):
        if username not in passwords:
            sys.exit(
                f"No recorded password for '{username}' in {CREDENTIALS_PATH}.\n"
                "That user already existed before the last seed_demo_data run and its "
                "password was never recorded by this tooling. Reset it locally with "
                "'python manage.py changepassword <username>' and re-run seed_demo_data, "
                "or edit the credentials file by hand for a one-off local run."
            )
        return passwords[username]

    result = {"generated_at": datetime.now(timezone.utc).isoformat()}

    # --- discover demo entity ids (never hardcode - always read the
    # current dev DB, so a fresh seed_demo_data run just works) --------
    import os
    import django

    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")
    django.setup()
    from apps.catalog.models import Material
    from apps.companies.models import Company
    from apps.stores.models import SharedStore
    from apps.suppliers.models import Supplier

    company_a = Company.objects.get(code="DEMOA")
    store = SharedStore.objects.get(code="DEMOWH")
    material = Material.objects.get(code="DEMOMAT1")
    supplier = Supplier.objects.get(code="DEMOSUP")
    result["company_id"] = company_a.id
    result["store_id"] = store.id
    result["material_id"] = material.id
    result["supplier_id"] = supplier.id

    # --- 1. requester: create + submit ---------------------------------
    step("Login as demo_requester, create a 100-unit material request")
    requester = Session("requester")
    requester.login("demo_requester", creds("demo_requester"))

    status, pr = requester.post(
        f"/api/v1/companies/{company_a.id}/purchase-requests/",
        {"required_by": (datetime.now(timezone.utc).date() + timedelta(days=21)).isoformat(),
         "notes": "Demo flow - synthetic material request", "lines": [{"material_id": material.id, "quantity": "100"}]},
    )
    pr = expect(status, pr, 201)
    print(f"PurchaseRequest {pr['reference']} created (id={pr['id']}, version={pr['version']})")
    result["purchase_request_id"] = pr["id"]
    result["purchase_request_reference"] = pr["reference"]

    step("Submit the purchase request")
    status, pr = requester.post(
        f"/api/v1/companies/{company_a.id}/purchase-requests/{pr['id']}/submit/", {"expected_version": pr["version"]}
    )
    pr = expect(status, pr, 200)
    print(f"Status now {pr['status']}, round={pr['current_round']}, step={pr['current_step']}")

    # --- 2. three distinct approvers ------------------------------------
    for approver_username in ("demo_approver1", "demo_approver2", "demo_approver3"):
        step(f"Login as {approver_username}, approve step {pr['current_step']}")
        approver = Session(approver_username)
        approver.login(approver_username, creds(approver_username))
        status, pr = approver.post(
            f"/api/v1/companies/{company_a.id}/purchase-requests/{pr['id']}/approve/",
            {"expected_version": pr["version"], "expected_round": pr["current_round"], "expected_step": pr["current_step"]},
        )
        pr = expect(status, pr, 200)
        print(f"Status now {pr['status']}, round={pr['current_round']}, step={pr['current_step']}")

    assert pr["status"] == "APPROVED", pr
    result["purchase_request_final_status"] = pr["status"]

    # --- 3. buyer: create PO, price it, issue ---------------------------
    step("Login as demo_buyer, create the purchase order from the approved request")
    buyer = Session("buyer")
    buyer.login("demo_buyer", creds("demo_buyer"))
    delivery_date = (datetime.now(timezone.utc).date() + timedelta(days=14)).isoformat()
    status, po = buyer.post(
        f"/api/v1/companies/{company_a.id}/purchase-orders/",
        {"source_purchase_request_id": pr["id"], "supplier_id": supplier.id, "currency_code": "INR",
         "expected_delivery_date": delivery_date, "notes": "Demo flow - synthetic purchase order"},
    )
    po = expect(status, po, 201)
    print(f"PurchaseOrder {po['reference']} created (id={po['id']}, version={po['version']})")
    result["purchase_order_id"] = po["id"]
    result["purchase_order_reference"] = po["reference"]
    line_id = po["lines"][0]["id"]

    step("Set a valid unit price on the purchase order line")
    status, po = buyer.patch(
        f"/api/v1/companies/{company_a.id}/purchase-orders/{po['id']}/",
        {"expected_version": po["version"], "lines": [{"id": line_id, "unit_price": "250.0000"}]},
    )
    po = expect(status, po, 200)
    print(f"Subtotal now {po['subtotal']} {po['currency_code']}")

    step("Issue the purchase order")
    status, po = buyer.post(
        f"/api/v1/companies/{company_a.id}/purchase-orders/{po['id']}/issue/", {"expected_version": po["version"]}
    )
    po = expect(status, po, 200)
    print(f"Status now {po['status']}, issued_at={po['issue_snapshot']['issued_at']}")
    po_line_id = po["issue_snapshot"]["lines"][0]["id"]
    result["purchase_order_final_status"] = po["status"]
    result["issued_po_line_id"] = po_line_id

    # --- 4. receiver: two partial deliveries ----------------------------
    step("Login as demo_receiver, receive 60 of 100 units")
    receiver = Session("receiver")
    receiver.login("demo_receiver", creds("demo_receiver"))
    arrived_at_1 = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    status, gr1 = receiver.post(
        f"/api/v1/stores/{store.id}/goods-receipts/",
        {"source_purchase_order_id": po["id"], "arrived_at": arrived_at_1,
         "delivery_note_reference": "DEMO-DN-001", "idempotency_key": f"demo-flow-first-{po['id']}",
         "lines": [{"source_po_line_id": po_line_id, "received_quantity": "60", "lot_reference": "DEMO-LOT-A"}]},
    )
    gr1 = expect(status, gr1, 201)
    print(f"GoodsReceipt {gr1['reference']} created (id={gr1['id']})")
    status, gr1 = receiver.post(
        f"/api/v1/stores/{store.id}/goods-receipts/{gr1['id']}/post/", {"expected_version": gr1["version"]}
    )
    gr1 = expect(status, gr1, 200)
    print(f"Posted - status={gr1['status']}")
    result["goods_receipt_1_id"] = gr1["id"]
    result["goods_receipt_1_reference"] = gr1["reference"]

    step("Confirm 40 units remain outstanding (delivery progress)")
    status, eligible = receiver.get(f"/api/v1/stores/{store.id}/goods-receipts/eligible-purchase-orders/")
    expect(status, eligible, 200)
    progress = next(row for row in eligible["results"] if row["id"] == po["id"])["delivery_progress"][0]
    print(f"ordered={progress['ordered_quantity']} received={progress['received_quantity']} "
          f"remaining={progress['remaining_quantity']} status={progress['delivery_status']}")
    assert progress["delivery_status"] == "PARTIALLY_RECEIVED", progress
    assert progress["remaining_quantity"] == "40.000", progress

    step("Receive the remaining 40 units")
    arrived_at_2 = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    status, gr2 = receiver.post(
        f"/api/v1/stores/{store.id}/goods-receipts/",
        {"source_purchase_order_id": po["id"], "arrived_at": arrived_at_2,
         "delivery_note_reference": "DEMO-DN-002", "idempotency_key": f"demo-flow-second-{po['id']}",
         "lines": [{"source_po_line_id": po_line_id, "received_quantity": "40", "lot_reference": "DEMO-LOT-B"}]},
    )
    gr2 = expect(status, gr2, 201)
    status, gr2 = receiver.post(
        f"/api/v1/stores/{store.id}/goods-receipts/{gr2['id']}/post/", {"expected_version": gr2["version"]}
    )
    gr2 = expect(status, gr2, 200)
    print(f"Posted - status={gr2['status']}")
    result["goods_receipt_2_id"] = gr2["id"]
    result["goods_receipt_2_reference"] = gr2["reference"]

    step("Confirm the order is now physically fully received")
    # Fully-received lines still appear in "eligible" (there is no rule
    # against receiving even more, only against exceeding the ordered
    # quantity) - the same HTTP lookup used above still shows it, now
    # with updated progress.
    status, eligible = receiver.get(f"/api/v1/stores/{store.id}/goods-receipts/eligible-purchase-orders/")
    expect(status, eligible, 200)
    progress = next(row for row in eligible["results"] if row["id"] == po["id"])["delivery_progress"][0]
    print(f"ordered={progress['ordered_quantity']} received={progress['received_quantity']} "
          f"remaining={progress['remaining_quantity']} status={progress['delivery_status']}")
    assert progress["delivery_status"] == "FULLY_RECEIVED", progress
    assert progress["remaining_quantity"] == "0.000", progress

    # --- 5. QC: draft inspection + observation --------------------------
    step("Login as demo_qc, list eligible receipt lines")
    qc = Session("qc")
    qc.login("demo_qc", creds("demo_qc"))
    status, eligible_lines = qc.get(f"/api/v1/stores/{store.id}/incoming-inspections/eligible-receipt-lines/")
    expect(status, eligible_lines, 200)
    target_line = next(row for row in eligible_lines["results"] if row["receipt_id"] == gr1["id"])
    print(f"Eligible receipt line found: id={target_line['id']}, material={target_line['material_code']}, "
          f"received_quantity={target_line['received_quantity']}, lot={target_line['lot_reference']}")

    step("Create a QC inspection draft against that receipt line")
    status, inspection = qc.post(
        f"/api/v1/stores/{store.id}/incoming-inspections/",
        {"receipt_line_id": target_line["id"], "inspection_date": datetime.now(timezone.utc).date().isoformat(),
         "notes": "Demo flow - synthetic inspection draft, no disposition recorded"},
    )
    inspection = expect(status, inspection, 201)
    print(f"IncomingInspection {inspection['reference']} created (id={inspection['id']}, status={inspection['status']})")
    result["incoming_inspection_id"] = inspection["id"]
    result["incoming_inspection_reference"] = inspection["reference"]

    step("Record one synthetic observation")
    status, inspection = qc.patch(
        f"/api/v1/stores/{store.id}/incoming-inspections/{inspection['id']}/",
        {"expected_version": inspection["version"],
         "observations": [{"parameter_name": "Appearance (synthetic)", "method_reference": "Visual (demo only)",
                            "result": "Off-white powder, no foreign matter observed (synthetic result)",
                            "remarks": "Recorded for demo purposes only - not a real QC specification or release decision"}]},
    )
    inspection = expect(status, inspection, 200)
    print(f"Observation recorded, version now {inspection['version']}")

    step("Retrieve the inspection to confirm the observation persisted")
    status, inspection = qc.get(f"/api/v1/stores/{store.id}/incoming-inspections/{inspection['id']}/")
    inspection = expect(status, inspection, 200)
    print(json.dumps(inspection["observations"], indent=2))
    assert len(inspection["observations"]) == 1
    result["incoming_inspection_observation_count"] = len(inspection["observations"])
    result["incoming_inspection_final_status"] = inspection["status"]

    OUTPUT_PATH.write_text(json.dumps(result, indent=2), encoding="utf-8")
    step("Done")
    print(f"No credentials or tokens are in this summary. Reference ids written to: {OUTPUT_PATH}")
    print("Reminder: this only proves physical receipt + a QC draft observation were recorded.")
    print("Nothing here was accepted, released, or counted as available stock.")


if __name__ == "__main__":
    main()
