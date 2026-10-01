import itertools
import json
import threading
import time
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test import TestCase, TransactionTestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from apps.audit.models import AuditLog
from apps.catalog.models import UnitOfMeasure
from apps.companies.models import Company
from apps.permissions.services import create_company_role, replace_role_permissions
from apps.product_imports.models import ProductImportBatch
from apps.products.models import Product
from apps.users.services import assign_company_membership, assign_membership_role

User = get_user_model()
PASSWORD = "a-strong-pass-1"
_counter = itertools.count()

FULL_PERMS = ("products.view", "products.create", "products.import")


def _unique(prefix):
    return f"{prefix}{next(_counter)}"


def preview_url(company_id):
    return f"/api/v1/companies/{company_id}/products/import-preview/"


def preview_detail_url(company_id, batch_id):
    return f"/api/v1/companies/{company_id}/products/import-preview/{batch_id}/"


def commit_url(company_id):
    return f"/api/v1/companies/{company_id}/products/import-commit/"


def make_user(prefix="user"):
    return User.objects.create_user(username=_unique(prefix), email=f"{_unique('e')}@example.com", password=PASSWORD)


def make_superuser(prefix="admin"):
    return User.objects.create_superuser(username=_unique(prefix), email=f"{_unique('e')}@example.com", password=PASSWORD)


def make_company(prefix="CMP"):
    code = _unique(prefix)
    return Company.objects.create(code=code, legal_name=f"{code} Pvt Ltd")


def make_unit(prefix="UOM", dimension=UnitOfMeasure.Dimension.COUNT, is_active=True):
    code = _unique(prefix)
    return UnitOfMeasure.objects.create(code=code, name=f"{code} Name", dimension=dimension, is_active=is_active)


def bearer(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


def grant_company_permission(actor, user, company, *codes):
    membership, _ = assign_company_membership(actor=actor, user=user, company=company)
    if codes:
        role = create_company_role(actor=actor, company=company, code=_unique(f"ROLE{user.id}{company.id}"), name="Role")
        replace_role_permissions(actor=actor, role=role, permission_codes=list(codes))
        assign_membership_role(actor=actor, membership=membership, role=role)
    return membership


def csv_text(rows, header="code,name,product_type,description,sales_uom_code"):
    return "\r\n".join([header, *rows]) + "\r\n"


def csv_bytes(rows, header="code,name,product_type,description,sales_uom_code", bom=False):
    data = csv_text(rows, header).encode("utf-8")
    return (b"\xef\xbb\xbf" + data) if bom else data


def upload(data, filename="import.csv"):
    return SimpleUploadedFile(filename, data, content_type="text/csv")


def row(code, name, product_type="", description="", sales_uom_code="BTL"):
    return f"{code},{name},{product_type},{description},{sales_uom_code}"


class ProductImportTestCase(TestCase):
    def setUp(self):
        self.superuser = make_superuser("piadmin")
        self.company = make_company("PIC")
        self.other_company = make_company("PIC2")
        self.unit = make_unit("BTL", UnitOfMeasure.Dimension.COUNT)
        self.inactive_unit = make_unit("OLDU", UnitOfMeasure.Dimension.COUNT, is_active=False)
        self.importer = make_user("importer")
        grant_company_permission(self.superuser, self.importer, self.company, *FULL_PERMS)

    def preview(self, data, filename="import.csv", user=None, company=None):
        user = user or self.importer
        company = company or self.company
        return self.client.post(preview_url(company.id), {"file": upload(data, filename)}, **bearer(user))

    def commit(self, preview_id, expected_version=1, user=None, company=None):
        user = user or self.importer
        company = company or self.company
        return self.client.post(
            commit_url(company.id),
            data=json.dumps({"preview_id": preview_id, "expected_version": expected_version}),
            content_type="application/json",
            **bearer(user),
        )

    def detail(self, batch_id, user=None, company=None, query=""):
        user = user or self.importer
        company = company or self.company
        return self.client.get(preview_detail_url(company.id, batch_id) + query, **bearer(user))


# ---------------------------------------------------------------------------
# Preview validation
# ---------------------------------------------------------------------------


class PreviewValidationTests(ProductImportTestCase):
    def test_valid_file_previews_cleanly_and_creates_no_products(self):
        data = csv_bytes([
            row("PIA001", "Product A", "Tablets", "First", self.unit.code),
            row("PIA002", "Product B", sales_uom_code=self.unit.code),
        ])
        response = self.preview(data)
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["status"], "PREVIEWED")
        self.assertEqual(body["total_rows"], 2)
        self.assertEqual(body["valid_rows"], 2)
        self.assertEqual(body["invalid_rows"], 0)
        self.assertTrue(body["eligible_for_commit"])
        self.assertEqual(body["file_errors"], [])
        self.assertEqual(body["rows"]["count"], 2)
        self.assertEqual(Product.objects.filter(company=self.company).count(), 0)

    def test_utf8_bom_is_accepted(self):
        data = csv_bytes([row("PIB001", "Product BOM", sales_uom_code=self.unit.code)], bom=True)
        response = self.preview(data)
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["valid_rows"], 1)
        self.assertEqual(body["rows"]["results"][0]["code"], "PIB001")

    def test_invalid_utf8_is_a_file_error(self):
        data = b"code,name,product_type,description,sales_uom_code\r\n\xff\xfe,bad,,,BTL\r\n"
        response = self.preview(data)
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertFalse(body["eligible_for_commit"])
        self.assertEqual(body["total_rows"], 0)
        self.assertEqual(body["file_errors"][0]["code"], "ENCODING_ERROR")

    def test_missing_required_column_is_a_file_error(self):
        data = "code,name,product_type,description\r\nX,Y,,\r\n".encode("utf-8")
        response = self.preview(data)
        body = response.json()
        self.assertFalse(body["eligible_for_commit"])
        self.assertEqual(body["file_errors"][0]["code"], "MISSING_REQUIRED_COLUMN")
        self.assertIn("sales_uom_code", body["file_errors"][0]["message"])

    def test_unsupported_column_is_rejected_not_dropped(self):
        data = "code,name,sales_uom_code,unit_price\r\nX,Y,BTL,9.99\r\n".encode("utf-8")
        response = self.preview(data)
        body = response.json()
        self.assertFalse(body["eligible_for_commit"])
        self.assertEqual(body["file_errors"][0]["code"], "UNSUPPORTED_COLUMN")
        self.assertIn("unit_price", body["file_errors"][0]["message"])

    def test_duplicate_header_is_a_file_error(self):
        data = "code,name,sales_uom_code,code\r\nX,Y,BTL,X2\r\n".encode("utf-8")
        response = self.preview(data)
        body = response.json()
        self.assertFalse(body["eligible_for_commit"])
        self.assertEqual(body["file_errors"][0]["code"], "DUPLICATE_HEADER")

    def test_duplicate_code_within_file_marks_every_occurrence_invalid(self):
        data = csv_bytes([
            row("PID001", "First", sales_uom_code=self.unit.code),
            row("PID001", "Second", sales_uom_code=self.unit.code),
        ])
        response = self.preview(data)
        body = response.json()
        self.assertEqual(body["invalid_rows"], 2)
        self.assertFalse(body["eligible_for_commit"])
        for result in body["rows"]["results"]:
            self.assertFalse(result["is_valid"])
            self.assertTrue(any(e["column"] == "code" for e in result["errors"]))

    def test_code_already_used_by_active_product_blocks_the_row(self):
        Product.objects.create(company=self.company, code="PIE001", name="Existing", sales_uom=self.unit, created_by=self.superuser)
        data = csv_bytes([row("PIE001", "New attempt", sales_uom_code=self.unit.code)])
        response = self.preview(data)
        body = response.json()
        self.assertEqual(body["invalid_rows"], 1)
        self.assertFalse(body["eligible_for_commit"])

    def test_code_already_used_by_inactive_product_still_reserves_it(self):
        Product.objects.create(
            company=self.company, code="PIF001", name="Existing inactive", sales_uom=self.unit,
            created_by=self.superuser, is_active=False,
        )
        data = csv_bytes([row("PIF001", "New attempt", sales_uom_code=self.unit.code)])
        response = self.preview(data)
        body = response.json()
        self.assertEqual(body["invalid_rows"], 1)
        self.assertFalse(body["eligible_for_commit"])

    def test_unknown_unit_code_blocks_the_row(self):
        data = csv_bytes([row("PIG001", "No such unit", sales_uom_code="NOPE")])
        response = self.preview(data)
        body = response.json()
        self.assertEqual(body["invalid_rows"], 1)
        self.assertEqual(body["rows"]["results"][0]["errors"][0]["column"], "sales_uom_code")

    def test_oversized_code_is_a_row_error_not_a_database_crash(self):
        # A cell exceeding the staging column's own width (== Product's
        # real field width) must never reach bulk_create() untruncated -
        # found as a real bug in this exact shape during Task 14C and
        # fixed here too (see docs/backend-decisions.md, Task 14C).
        data = csv_bytes([row("X" * 40, "y" * 300, sales_uom_code=self.unit.code)])
        response = self.preview(data)
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        errors = {e["column"] for e in body["rows"]["results"][0]["errors"]}
        self.assertIn("code", errors)
        self.assertIn("name", errors)

    def test_inactive_unit_code_blocks_the_row(self):
        data = csv_bytes([row("PIH001", "Inactive unit", sales_uom_code=self.inactive_unit.code)])
        response = self.preview(data)
        body = response.json()
        self.assertEqual(body["invalid_rows"], 1)
        self.assertIn("inactive", body["rows"]["results"][0]["errors"][0]["message"])

    def test_too_many_header_columns_is_rejected(self):
        header = ",".join([f"col{i}" for i in range(25)])
        data = f"{header}\r\n".encode("utf-8")
        response = self.preview(data)
        body = response.json()
        self.assertEqual(body["file_errors"][0]["code"], "TOO_MANY_COLUMNS")

    def test_file_too_large_is_rejected(self):
        with patch("apps.product_imports.services.MAX_FILE_SIZE_BYTES", 10):
            data = csv_bytes([row("PII001", "x", sales_uom_code=self.unit.code)])
            response = self.preview(data)
        body = response.json()
        self.assertEqual(body["file_errors"][0]["code"], "FILE_TOO_LARGE")

    def test_too_many_rows_is_rejected(self):
        with patch("apps.product_imports.services.MAX_ROWS", 2):
            data = csv_bytes([row(f"PIJ{i:03d}", "x", sales_uom_code=self.unit.code) for i in range(5)])
            response = self.preview(data)
        body = response.json()
        self.assertEqual(body["file_errors"][0]["code"], "TOO_MANY_ROWS")

    def test_missing_file_is_a_400(self):
        response = self.client.post(preview_url(self.company.id), {}, **bearer(self.importer))
        self.assertEqual(response.status_code, 400)

    def test_row_number_skips_blank_lines(self):
        data = csv_bytes([
            row("PIK001", "First", sales_uom_code=self.unit.code),
            "",
            row("PIK002", "Second", sales_uom_code=self.unit.code),
        ])
        response = self.preview(data)
        body = response.json()
        self.assertEqual(body["total_rows"], 2)
        self.assertEqual([r["row_number"] for r in body["rows"]["results"]], [1, 2])


# ---------------------------------------------------------------------------
# Commit
# ---------------------------------------------------------------------------


class CommitTests(ProductImportTestCase):
    def test_happy_path_creates_products_and_marks_batch_committed(self):
        data = csv_bytes([
            row("PIC001", "Product One", "Tablets", "Desc one", self.unit.code),
            row("PIC002", "Product Two", sales_uom_code=self.unit.code),
        ])
        preview = self.preview(data).json()
        response = self.commit(preview["id"], preview["version"])
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(body["status"], "COMMITTED")
        self.assertEqual(len(body["created_product_ids"]), 2)

        products = Product.objects.filter(company=self.company).order_by("code")
        self.assertEqual([p.code for p in products], ["PIC001", "PIC002"])
        self.assertEqual(products[0].name, "Product One")
        self.assertEqual(products[0].product_type, "Tablets")
        self.assertEqual(products[0].description, "Desc one")
        self.assertEqual(products[0].sales_uom_id, self.unit.id)
        self.assertEqual(products[0].created_by_id, self.importer.id)

        self.assertTrue(AuditLog.objects.filter(action="product_import.committed", target_id=preview["id"]).exists())

    def test_ineligible_preview_cannot_be_committed(self):
        data = csv_bytes([row("", "Missing code", sales_uom_code=self.unit.code)])
        preview = self.preview(data).json()
        self.assertFalse(preview["eligible_for_commit"])
        response = self.commit(preview["id"], preview["version"])
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(Product.objects.filter(company=self.company).count(), 0)

    def test_code_taken_since_preview_blocks_the_whole_commit(self):
        data = csv_bytes([
            row("PIL001", "First", sales_uom_code=self.unit.code),
            row("PIL002", "Second", sales_uom_code=self.unit.code),
        ])
        preview = self.preview(data).json()
        self.assertTrue(preview["eligible_for_commit"])
        # Someone else creates PIL002 in the meantime.
        Product.objects.create(company=self.company, code="PIL002", name="Raced", sales_uom=self.unit, created_by=self.superuser)

        response = self.commit(preview["id"], preview["version"])
        self.assertEqual(response.status_code, 400, response.content)
        # ALL-OR-NOTHING: not even PIL001 was created.
        self.assertEqual(Product.objects.filter(company=self.company, code="PIL001").count(), 0)
        batch = ProductImportBatch.objects.get(pk=preview["id"])
        self.assertEqual(batch.status, "PREVIEWED")

    def test_unit_deactivated_since_preview_blocks_the_whole_commit(self):
        toggle_unit = make_unit("TOG", UnitOfMeasure.Dimension.COUNT, is_active=True)
        data = csv_bytes([row("PIM001", "Uses toggled unit", sales_uom_code=toggle_unit.code)])
        preview = self.preview(data).json()
        self.assertTrue(preview["eligible_for_commit"])
        toggle_unit.is_active = False
        toggle_unit.save(update_fields=["is_active"])

        response = self.commit(preview["id"], preview["version"])
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(Product.objects.filter(company=self.company).count(), 0)

    def test_expired_preview_cannot_be_committed(self):
        data = csv_bytes([row("PIN001", "x", sales_uom_code=self.unit.code)])
        preview = self.preview(data).json()
        batch = ProductImportBatch.objects.get(pk=preview["id"])
        ProductImportBatch.objects.filter(pk=batch.pk).update(expires_at=timezone.now() - timedelta(seconds=1))

        response = self.commit(preview["id"], preview["version"])
        self.assertEqual(response.status_code, 400, response.content)
        detail = response.json()["detail"]
        detail_text = detail[0] if isinstance(detail, list) else detail
        self.assertIn("expired", detail_text.lower())

    def test_repeated_commit_returns_original_result_without_duplicating(self):
        data = csv_bytes([row("PIO001", "x", sales_uom_code=self.unit.code)])
        preview = self.preview(data).json()

        first = self.commit(preview["id"], preview["version"])
        second = self.commit(preview["id"], preview["version"])
        self.assertEqual(first.status_code, 200, first.content)
        self.assertEqual(second.status_code, 200, second.content)
        self.assertEqual(first.json()["created_product_ids"], second.json()["created_product_ids"])
        self.assertEqual(Product.objects.filter(company=self.company, code="PIO001").count(), 1)

    def test_wrong_concurrency_token_is_a_conflict(self):
        data = csv_bytes([row("PIP001", "x", sales_uom_code=self.unit.code)])
        preview = self.preview(data).json()
        response = self.commit(preview["id"], expected_version=999)
        self.assertEqual(response.status_code, 409, response.content)

    def test_audit_failure_rolls_back_products_and_completion_status(self):
        data = csv_bytes([row("PIQ001", "x", sales_uom_code=self.unit.code)])
        preview = self.preview(data).json()

        with patch("apps.product_imports.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.commit(preview["id"], preview["version"])

        self.assertEqual(Product.objects.filter(company=self.company, code="PIQ001").count(), 0)
        batch = ProductImportBatch.objects.get(pk=preview["id"])
        self.assertEqual(batch.status, "PREVIEWED")

    def test_commit_body_rejects_a_replacement_product_list(self):
        data = csv_bytes([row("PIR001", "x", sales_uom_code=self.unit.code)])
        preview = self.preview(data).json()
        response = self.client.post(
            commit_url(self.company.id),
            data=json.dumps({"preview_id": preview["id"], "expected_version": preview["version"], "products": []}),
            content_type="application/json",
            **bearer(self.importer),
        )
        self.assertEqual(response.status_code, 400)


# ---------------------------------------------------------------------------
# Access / isolation
# ---------------------------------------------------------------------------


class AccessTests(ProductImportTestCase):
    def test_missing_permission_is_named_in_403(self):
        weak_user = make_user("weak")
        grant_company_permission(self.superuser, weak_user, self.company, "products.view")
        data = csv_bytes([row("PIS001", "x", sales_uom_code=self.unit.code)])
        response = self.preview(data, user=weak_user)
        self.assertEqual(response.status_code, 403)
        self.assertIn("products.create", response.json()["detail"])
        self.assertIn("products.import", response.json()["detail"])

    def test_unknown_company_is_404(self):
        data = csv_bytes([row("PIT001", "x", sales_uom_code=self.unit.code)])
        response = self.client.post(preview_url(999999), {"file": upload(data)}, **bearer(self.importer))
        self.assertEqual(response.status_code, 404)

    def test_superuser_without_explicit_permissions_gets_403_not_a_bypass(self):
        bare_superuser = make_superuser("baresu")
        # Active membership but no role/permissions granted at all.
        assign_company_membership(actor=self.superuser, user=bare_superuser, company=self.company)
        data = csv_bytes([row("PIU001", "x", sales_uom_code=self.unit.code)])
        response = self.preview(data, user=bare_superuser)
        self.assertEqual(response.status_code, 403)

    def test_other_company_cannot_read_or_commit_a_preview(self):
        other_user = make_user("otherco")
        grant_company_permission(self.superuser, other_user, self.other_company, *FULL_PERMS)
        data = csv_bytes([row("PIV001", "x", sales_uom_code=self.unit.code)])
        preview = self.preview(data).json()

        response = self.detail(preview["id"], user=other_user, company=self.other_company)
        self.assertEqual(response.status_code, 404)
        response = self.commit(preview["id"], preview["version"], user=other_user, company=self.other_company)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(Product.objects.filter(code="PIV001").count(), 0)

    def test_other_user_in_the_same_company_cannot_read_or_commit_a_preview(self):
        other_user = make_user("sameco")
        grant_company_permission(self.superuser, other_user, self.company, *FULL_PERMS)
        data = csv_bytes([row("PIW001", "x", sales_uom_code=self.unit.code)])
        preview = self.preview(data).json()

        response = self.detail(preview["id"], user=other_user)
        self.assertEqual(response.status_code, 404)
        response = self.commit(preview["id"], preview["version"], user=other_user)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(Product.objects.filter(code="PIW001").count(), 0)

    def test_owner_can_read_their_own_preview(self):
        data = csv_bytes([row("PIX001", "x", sales_uom_code=self.unit.code)])
        preview = self.preview(data).json()
        response = self.detail(preview["id"])
        self.assertEqual(response.status_code, 200)


# ---------------------------------------------------------------------------
# Concurrency
# ---------------------------------------------------------------------------


class ConcurrentCommitTests(TransactionTestCase):
    serialized_rollback = True

    def test_concurrent_commit_of_the_same_batch_never_duplicates_products(self):
        superuser = make_superuser("ccadmin")
        company = make_company("CCC")
        unit = make_unit("CCU", UnitOfMeasure.Dimension.COUNT)
        importer = make_user("ccimporter")
        grant_company_permission(superuser, importer, company, *FULL_PERMS)

        client_for_preview = self.client_class()
        data = csv_bytes([row("CC001", "x", sales_uom_code=unit.code)])
        preview = client_for_preview.post(
            preview_url(company.id), {"file": upload(data)}, **bearer(importer)
        ).json()

        results = []
        barrier = threading.Barrier(2)

        def worker():
            client = self.client_class()
            try:
                barrier.wait(timeout=5)
                response = client.post(
                    commit_url(company.id),
                    data=json.dumps({"preview_id": preview["id"], "expected_version": preview["version"]}),
                    content_type="application/json",
                    **bearer(importer),
                )
                results.append(response.status_code)
            finally:
                connection.close()

        threads = [threading.Thread(target=worker), threading.Thread(target=worker)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        self.assertEqual(results, [200, 200], results)
        self.assertEqual(Product.objects.filter(company=company, code="CC001").count(), 1)


# ---------------------------------------------------------------------------
# Performance (Task 14A §8: at least one 2000-row test)
# ---------------------------------------------------------------------------


class LargeImportPerformanceTests(ProductImportTestCase):
    def test_2000_row_import_preview_and_commit(self):
        rows = [row(f"BIG{i:05d}", f"Bulk Product {i}", sales_uom_code=self.unit.code) for i in range(2000)]
        data = csv_bytes(rows)

        started = time.perf_counter()
        with CaptureQueriesContext(connection) as preview_queries:
            preview_response = self.preview(data)
        preview_elapsed = time.perf_counter() - started
        self.assertEqual(preview_response.status_code, 201, preview_response.content[:500])
        preview = preview_response.json()
        self.assertEqual(preview["total_rows"], 2000)
        self.assertEqual(preview["valid_rows"], 2000)
        self.assertTrue(preview["eligible_for_commit"])

        started = time.perf_counter()
        with CaptureQueriesContext(connection) as commit_queries:
            commit_response = self.commit(preview["id"], preview["version"])
        commit_elapsed = time.perf_counter() - started
        self.assertEqual(commit_response.status_code, 200, commit_response.content[:500])
        self.assertEqual(Product.objects.filter(company=self.company).count(), 2000)

        # Bounded, constant-ish query count regardless of row count - never
        # "one query per row" (2000 rows would blow past this bound by two
        # orders of magnitude if that regressed).
        self.assertLess(len(preview_queries), 30, "preview issued too many queries - check for a per-row query")
        self.assertLess(len(commit_queries), 30, "commit issued too many queries - check for a per-row query")

        print(
            f"\n[Task 14A perf] 2000-row preview: {len(preview_queries)} queries, {preview_elapsed:.3f}s; "
            f"commit: {len(commit_queries)} queries, {commit_elapsed:.3f}s "
            f"(measured in this test run's own environment, not a general claim)."
        )
