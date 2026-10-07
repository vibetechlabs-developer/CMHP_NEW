"""Customer CSV-style import: preview writes nothing; commit is all-or-nothing and audited.

Synthetic fixtures only, in the isolated test database.
"""

import json
from unittest.mock import patch

from django.test import Client, TestCase

from apps.audit.models import AuditLog
from apps.customers.models import Customer
from tests.test_store_preparation import bearer, grant_company_permission, make_company, make_user, make_superuser


def preview_url(company_id):
    return f"/api/v1/companies/{company_id}/customers/import-preview/"


def commit_url(company_id):
    return f"/api/v1/companies/{company_id}/customers/import-commit/"


ROW_OK_1 = {"code": "IMP-A", "name": "Synthetic Alpha", "email": "alpha@example.test", "phone": "9000000001"}
ROW_OK_2 = {"code": "IMP-B", "name": "Synthetic Beta"}


class CustomerImportTests(TestCase):
    def setUp(self):
        self.superuser = make_superuser("impsuper")
        self.company = make_company("IMPCO")
        self.other_company = make_company("IMPOTHER")
        self.importer = make_user("importer")
        grant_company_permission(self.superuser, self.importer, self.company, "customers.view", "customers.create")
        self.viewer = make_user("impviewer")
        grant_company_permission(self.superuser, self.viewer, self.company, "customers.view")
        self.client_ = Client()

    def post(self, url, body, user=None):
        return self.client_.post(url, data=json.dumps(body), content_type="application/json", **bearer(user or self.importer))

    def customers(self):
        return Customer.objects.filter(company=self.company).count()

    def test_preview_marks_valid_rows_and_writes_nothing(self):
        res = self.post(preview_url(self.company.id), {"rows": [ROW_OK_1, ROW_OK_2]})
        self.assertEqual(res.status_code, 200, res.content[:200])
        body = res.json()
        self.assertEqual(body["summary"], {"total": 2, "valid": 2, "invalid": 0, "eligible_for_commit": True})
        self.assertEqual(self.customers(), 0)

    def test_preview_flags_missing_name_bad_email_and_duplicates(self):
        Customer.objects.create(company=self.company, code="EXISTING", name="Already here", created_by=self.superuser)
        rows = [
            {"code": "", "name": "No code"},
            {"code": "NEW1", "name": "", "email": "not-an-email"},
            {"code": "EXISTING", "name": "Duplicate of existing"},
            {"code": "DUP", "name": "First in file"},
            {"code": "DUP", "name": "Second in file"},
        ]
        body = self.post(preview_url(self.company.id), {"rows": rows}).json()
        # Row 4 is the first "DUP" in the file, so it is valid; row 5 repeats it.
        self.assertEqual(body["summary"]["invalid"], 4)
        self.assertEqual(body["rows"][3]["status"], "ok")
        self.assertFalse(body["summary"]["eligible_for_commit"])
        self.assertTrue(any("already exists" in e for e in body["rows"][2]["errors"]))
        self.assertTrue(any("appears again" in e for e in body["rows"][4]["errors"]))

    def test_commit_creates_all_valid_rows_and_audits_each(self):
        res = self.post(commit_url(self.company.id), {"rows": [ROW_OK_1, ROW_OK_2]})
        self.assertEqual(res.status_code, 201, res.content[:200])
        self.assertEqual(res.json()["created"], 2)
        self.assertEqual(self.customers(), 2)
        self.assertEqual(AuditLog.objects.filter(action="customer.created", company=self.company).count(), 2)

    def test_commit_with_one_invalid_row_creates_nothing(self):
        res = self.post(commit_url(self.company.id), {"rows": [ROW_OK_1, {"code": "IMP-C", "name": ""}]})
        self.assertEqual(res.status_code, 400, res.content[:200])
        self.assertEqual(self.customers(), 0)

    def test_audit_failure_rolls_back_every_row(self):
        with patch("apps.customers.services.record", side_effect=RuntimeError("audit down")):
            with self.assertRaises(RuntimeError):
                self.post(commit_url(self.company.id), {"rows": [ROW_OK_1, ROW_OK_2]})
        self.assertEqual(self.customers(), 0)

    def test_viewer_without_create_is_refused_and_nothing_is_written(self):
        res = self.post(commit_url(self.company.id), {"rows": [ROW_OK_1]}, user=self.viewer)
        self.assertEqual(res.status_code, 403)
        self.assertEqual(self.customers(), 0)
        res = self.post(preview_url(self.company.id), {"rows": [ROW_OK_1]}, user=self.viewer)
        self.assertEqual(res.status_code, 403)

    def test_user_with_no_company_access_gets_not_found_for_another_company(self):
        res = self.post(commit_url(self.other_company.id), {"rows": [ROW_OK_1]})
        self.assertEqual(res.status_code, 404)
        self.assertEqual(Customer.objects.filter(company=self.other_company).count(), 0)

    def test_empty_or_oversized_input_is_a_structured_400(self):
        self.assertEqual(self.post(preview_url(self.company.id), {"rows": []}).status_code, 400)
        many = [{"code": f"BULK{i}", "name": f"Bulk {i}"} for i in range(501)]
        self.assertEqual(self.post(preview_url(self.company.id), {"rows": many}).status_code, 400)
