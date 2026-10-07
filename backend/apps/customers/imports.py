"""CSV-style customer import: a stateless preview, then an all-or-nothing commit.

- Preview writes NOTHING. It validates each row with the same serializer the
  create form uses, flags duplicate codes (against existing customers and
  inside the file), and returns a per-row result.
- Commit re-runs the same validation. If any row is invalid, nothing is
  created. Otherwise every row is created through `create_customer`, inside
  one transaction, so each creation writes its own audit record and a failing
  audit rolls the whole import back.

Permissions are the existing customers.view and customers.create, enforced in
the views. No new permission is introduced.
"""

from django.db import transaction
from rest_framework import exceptions

from apps.customers.models import Customer
from apps.customers.serializers import CustomerCreateSerializer
from apps.customers.services import create_customer

MAX_ROWS = 500
FIELDS = ["code", "name", "contact_person", "email", "phone", "billing_address", "shipping_address", "notes"]


def _normalise_row(raw):
    if not isinstance(raw, dict):
        return {}
    return {field: ("" if raw.get(field) is None else str(raw.get(field)).strip()) for field in FIELDS}


def preview_customer_rows(company, rows):
    if not isinstance(rows, list):
        raise exceptions.ValidationError({"rows": "Send a list of customer rows."})
    if len(rows) == 0:
        raise exceptions.ValidationError({"rows": "The file has no customer rows."})
    if len(rows) > MAX_ROWS:
        raise exceptions.ValidationError({"rows": f"Import at most {MAX_ROWS} rows at a time."})

    existing_codes = set(Customer.objects.filter(company=company).values_list("code", flat=True))
    seen_in_file = {}
    results = []
    for index, raw in enumerate(rows, start=1):
        data = _normalise_row(raw)
        errors = []
        serializer = CustomerCreateSerializer(data=data)
        if not serializer.is_valid():
            for field, messages in serializer.errors.items():
                for message in messages if isinstance(messages, list) else [messages]:
                    errors.append(f"{field}: {message}")
        code = data["code"]
        if code:
            if code in existing_codes:
                errors.append("code: a customer with this code already exists in this company.")
            if code in seen_in_file:
                errors.append(f"code: the same code appears again in row {seen_in_file[code]}.")
            else:
                seen_in_file[code] = index
        results.append({
            "row_number": index,
            "status": "error" if errors else "ok",
            "code": code,
            "name": data["name"],
            "errors": errors,
        })

    summary = {
        "total": len(results),
        "valid": sum(1 for r in results if r["status"] == "ok"),
        "invalid": sum(1 for r in results if r["status"] == "error"),
    }
    summary["eligible_for_commit"] = summary["invalid"] == 0
    return {"summary": summary, "rows": results}


@transaction.atomic
def commit_customer_rows(*, actor, company, rows):
    """Creates every row or none. The same validation as preview runs first, so a
    stale file or a concurrent duplicate is refused rather than partially imported.
    """
    report = preview_customer_rows(company, rows)
    if not report["summary"]["eligible_for_commit"]:
        raise exceptions.ValidationError({"rows": "Some rows are not valid. Nothing was imported. Fix the rows and try again.", "preview": report})

    created = []
    for raw in rows:
        data = _normalise_row(raw)
        created.append(create_customer(actor=actor, company=company, **{k: v for k, v in data.items() if k != "code"}, code=data["code"]))
    return created
