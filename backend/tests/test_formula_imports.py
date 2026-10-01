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
from apps.catalog.models import Material, UnitOfMeasure
from apps.companies.models import Company
from apps.formula_imports.models import FormulaImportBatch
from apps.formulas.approval import assess_approval
from apps.formulas.models import Formula, FormulaRevision, FormulaRevisionContributor
from apps.formulas.requirement_preview import build_requirement_preview
from apps.permissions.services import create_company_role, create_store_role, replace_role_permissions, replace_store_role_permissions
from apps.products.models import Product
from apps.stores.models import SharedStore
from apps.stores.services import assign_store_membership, assign_store_membership_role
from apps.users.services import assign_company_membership, assign_membership_role

User = get_user_model()
PASSWORD = "a-strong-pass-1"
_counter = itertools.count()

FULL_COMPANY_PERMS = ("formulas.view", "formulas.create", "formulas.import")
CATALOG_PERMS = ("shared_catalog.view",)

HEADER = "formula_code,formula_name,product_code,base_output_quantity,output_uom_code,material_code,material_quantity,formula_notes,revision_notes"


def _unique(prefix):
    return f"{prefix}{next(_counter)}"


def preview_url(company_id):
    return f"/api/v1/companies/{company_id}/formulas/import-preview/"


def preview_detail_url(company_id, batch_id):
    return f"/api/v1/companies/{company_id}/formulas/import-preview/{batch_id}/"


def commit_url(company_id):
    return f"/api/v1/companies/{company_id}/formulas/import-commit/"


def make_user(prefix="user"):
    return User.objects.create_user(username=_unique(prefix), email=f"{_unique('e')}@example.com", password=PASSWORD)


def make_superuser(prefix="admin"):
    return User.objects.create_superuser(username=_unique(prefix), email=f"{_unique('e')}@example.com", password=PASSWORD)


def make_company(prefix="CMP"):
    code = _unique(prefix)
    return Company.objects.create(code=code, legal_name=f"{code} Pvt Ltd")


def make_store(prefix="WH"):
    code = _unique(prefix)
    return SharedStore.objects.create(code=code, name=f"{code} Store")


def make_unit(prefix="UOM", dimension=UnitOfMeasure.Dimension.COUNT, is_active=True):
    code = _unique(prefix)
    return UnitOfMeasure.objects.create(code=code, name=f"{code} Name", dimension=dimension, is_active=is_active)


def make_material(prefix="MAT", kind=Material.Kind.RAW_MATERIAL, unit=None, is_active=True):
    if unit is None:
        unit = make_unit("KG", UnitOfMeasure.Dimension.MASS)
    code = _unique(prefix)
    return Material.objects.create(code=code, name=f"{code} Name", kind=kind, base_unit=unit, is_active=is_active)


def make_product(company, unit, actor, prefix="PRD", is_active=True):
    code = _unique(prefix)
    return Product.objects.create(company=company, code=code, name=f"{code} Product", sales_uom=unit, created_by=actor, is_active=is_active)


def bearer(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


def grant_company_permission(actor, user, company, *codes):
    membership, _ = assign_company_membership(actor=actor, user=user, company=company)
    if codes:
        role = create_company_role(actor=actor, company=company, code=_unique(f"ROLE{user.id}{company.id}"), name="Role")
        replace_role_permissions(actor=actor, role=role, permission_codes=list(codes))
        assign_membership_role(actor=actor, membership=membership, role=role)
    return membership


def grant_store_permission(actor, user, store, *codes):
    membership, _ = assign_store_membership(actor=actor, user=user, store=store)
    if codes:
        role = create_store_role(actor=actor, store=store, code=_unique(f"SROLE{user.id}{store.id}"), name="Role")
        replace_store_role_permissions(actor=actor, role=role, permission_codes=list(codes))
        assign_store_membership_role(actor=actor, membership=membership, role=role)
    return membership


def csv_text(rows, header=HEADER):
    return "\r\n".join([header, *rows]) + "\r\n"


def csv_bytes(rows, header=HEADER, bom=False):
    data = csv_text(rows, header).encode("utf-8")
    return (b"\xef\xbb\xbf" + data) if bom else data


def upload(data, filename="import.csv"):
    return SimpleUploadedFile(filename, data, content_type="text/csv")


def line(formula_code, formula_name, product_code, base_output_quantity, output_uom_code, material_code,
          material_quantity, formula_notes="", revision_notes=""):
    return (
        f"{formula_code},{formula_name},{product_code},{base_output_quantity},{output_uom_code},"
        f"{material_code},{material_quantity},{formula_notes},{revision_notes}"
    )


class FormulaImportTestCase(TestCase):
    def setUp(self):
        self.superuser = make_superuser("fiadmin")
        self.company = make_company("FIC")
        self.other_company = make_company("FIC2")
        self.store = make_store("FIWH")

        self.mass_unit = make_unit("KG", UnitOfMeasure.Dimension.MASS)
        self.count_unit = make_unit("BTL", UnitOfMeasure.Dimension.COUNT)
        self.inactive_unit = make_unit("OLDU", UnitOfMeasure.Dimension.MASS, is_active=False)

        self.raw_material = make_material("RAW", Material.Kind.RAW_MATERIAL, self.mass_unit)
        self.packaging_material = make_material("PACK", Material.Kind.PACKAGING_MATERIAL, self.count_unit)
        self.inactive_material = make_material("OLDM", Material.Kind.RAW_MATERIAL, self.mass_unit, is_active=False)

        self.product = make_product(self.company, self.count_unit, self.superuser)
        self.inactive_product = make_product(self.company, self.count_unit, self.superuser, is_active=False)
        self.other_company_product = make_product(self.other_company, self.count_unit, self.superuser)

        self.importer = make_user("importer")
        grant_company_permission(self.superuser, self.importer, self.company, *FULL_COMPANY_PERMS)
        grant_store_permission(self.superuser, self.importer, self.store, *CATALOG_PERMS)

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


class PreviewValidationTests(FormulaImportTestCase):
    def test_valid_two_line_formula_previews_cleanly_and_creates_no_records(self):
        data = csv_bytes([
            line("FIA001", "Formula A", self.product.code, "100", self.mass_unit.code, self.raw_material.code, "5.5"),
            line("FIA001", "Formula A", self.product.code, "100", self.mass_unit.code, self.packaging_material.code, "24"),
        ])
        response = self.preview(data)
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["total_rows"], 2)
        self.assertEqual(body["total_groups"], 1)
        self.assertEqual(body["valid_groups"], 1)
        self.assertTrue(body["eligible_for_commit"])
        self.assertEqual(Formula.objects.filter(company=self.company).count(), 0)

    def test_raw_only_and_packaging_only_formulas(self):
        data = csv_bytes([
            line("FIB001", "Raw only", self.product.code, "100", self.mass_unit.code, self.raw_material.code, "5"),
            line("FIB002", "Packaging only", self.product.code, "100", self.mass_unit.code, self.packaging_material.code, "10"),
        ])
        response = self.preview(data)
        body = response.json()
        self.assertEqual(body["total_groups"], 2)
        self.assertTrue(body["eligible_for_commit"])

    def test_multiple_formulas_for_one_product_allowed(self):
        data = csv_bytes([
            line("FIC001", "First recipe", self.product.code, "100", self.mass_unit.code, self.raw_material.code, "5"),
            line("FIC002", "Second recipe", self.product.code, "200", self.mass_unit.code, self.raw_material.code, "9"),
        ])
        response = self.preview(data)
        body = response.json()
        self.assertEqual(body["total_groups"], 2)
        self.assertTrue(body["eligible_for_commit"])

    def test_group_and_line_order_preserved_even_when_interleaved(self):
        data = csv_bytes([
            line("FID001", "First", self.product.code, "100", self.mass_unit.code, self.raw_material.code, "1"),
            line("FID002", "Second", self.product.code, "100", self.mass_unit.code, self.raw_material.code, "2"),
            line("FID001", "First", self.product.code, "100", self.mass_unit.code, self.packaging_material.code, "3"),
        ])
        response = self.preview(data)
        body = response.json()
        groups = body["groups"]["results"]
        self.assertEqual(groups[0]["formula_code"], "FID001")
        self.assertEqual(groups[1]["formula_code"], "FID002")
        first_lines = groups[0]["lines"]
        self.assertEqual([l["line_number"] for l in first_lines], [1, 2])
        self.assertEqual([l["material_code"] for l in first_lines], [self.raw_material.code, self.packaging_material.code])
        self.assertEqual([l["file_row_number"] for l in first_lines], [1, 3])

    def test_utf8_bom_is_accepted(self):
        data = csv_bytes([line("FIE001", "Bom formula", self.product.code, "10", self.mass_unit.code, self.raw_material.code, "1")], bom=True)
        response = self.preview(data)
        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(response.json()["eligible_for_commit"])

    def test_duplicate_csv_header_is_a_file_error(self):
        data = (HEADER + ",formula_code\r\nX,Y,Z,1,K,M,1,,,X\r\n").encode("utf-8")
        response = self.preview(data)
        body = response.json()
        self.assertEqual(body["file_errors"][0]["code"], "DUPLICATE_HEADER")

    def test_unsupported_column_is_rejected_not_dropped(self):
        data = (HEADER + ",unit_price\r\nX,Y,Z,1,K,M,1,,,9.99\r\n").encode("utf-8")
        response = self.preview(data)
        body = response.json()
        self.assertEqual(body["file_errors"][0]["code"], "UNSUPPORTED_COLUMN")

    def test_missing_required_column_is_a_file_error(self):
        data = "formula_code,formula_name,product_code\r\nX,Y,Z\r\n".encode("utf-8")
        response = self.preview(data)
        body = response.json()
        self.assertEqual(body["file_errors"][0]["code"], "MISSING_REQUIRED_COLUMN")

    def test_conflicting_group_header_values_are_a_group_error(self):
        data = csv_bytes([
            line("FIF001", "Name A", self.product.code, "100", self.mass_unit.code, self.raw_material.code, "1"),
            line("FIF001", "Name B (conflict)", self.product.code, "100", self.mass_unit.code, self.packaging_material.code, "2"),
        ])
        response = self.preview(data)
        body = response.json()
        group = body["groups"]["results"][0]
        self.assertFalse(group["is_valid"])
        self.assertTrue(any(e["column"] == "formula_name" for e in group["errors"]))

    def test_conflicting_base_output_quantity_is_a_group_error_but_equal_decimals_are_not(self):
        data = csv_bytes([
            line("FIG001", "Formula", self.product.code, "100", self.mass_unit.code, self.raw_material.code, "1"),
            line("FIG001", "Formula", self.product.code, "100.000", self.mass_unit.code, self.packaging_material.code, "2"),
        ])
        response = self.preview(data)
        body = response.json()
        group = body["groups"]["results"][0]
        self.assertTrue(group["is_valid"])

    def test_existing_formula_code_rejects_the_group(self):
        Formula.objects.create(company=self.company, product=self.product, code="FIH001", name="Existing draft",
                                latest_revision_number=0, created_by=self.superuser)
        data = csv_bytes([line("FIH001", "New attempt", self.product.code, "10", self.mass_unit.code, self.raw_material.code, "1")])
        response = self.preview(data)
        body = response.json()
        self.assertFalse(body["eligible_for_commit"])
        self.assertFalse(body["groups"]["results"][0]["is_valid"])

    def test_unknown_product_is_a_group_error(self):
        data = csv_bytes([line("FII001", "x", "NOSUCHPRODUCT", "10", self.mass_unit.code, self.raw_material.code, "1")])
        response = self.preview(data)
        self.assertFalse(response.json()["groups"]["results"][0]["is_valid"])

    def test_cross_company_product_is_treated_as_unknown(self):
        data = csv_bytes([line("FIJ001", "x", self.other_company_product.code, "10", self.mass_unit.code, self.raw_material.code, "1")])
        response = self.preview(data)
        group = response.json()["groups"]["results"][0]
        self.assertFalse(group["is_valid"])
        self.assertIn("does not exist", group["errors"][0]["message"])

    def test_inactive_product_is_a_group_error(self):
        data = csv_bytes([line("FIK001", "x", self.inactive_product.code, "10", self.mass_unit.code, self.raw_material.code, "1")])
        response = self.preview(data)
        self.assertFalse(response.json()["groups"]["results"][0]["is_valid"])

    def test_unknown_output_unit_is_a_group_error(self):
        data = csv_bytes([line("FIL001", "x", self.product.code, "10", "NOSUCHUNIT", self.raw_material.code, "1")])
        response = self.preview(data)
        self.assertFalse(response.json()["groups"]["results"][0]["is_valid"])

    def test_oversized_formula_code_and_material_code_are_row_errors_not_a_database_crash(self):
        # Same class of bug found and fixed during Task 14C - an
        # over-length cell must never reach bulk_create() untruncated
        # (see docs/backend-decisions.md, Task 14C).
        data = csv_bytes([line("F" * 40, "x", self.product.code, "10", self.mass_unit.code, "M" * 40, "1")])
        response = self.preview(data)
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        group = body["groups"]["results"][0]
        self.assertFalse(group["is_valid"])
        # formula_code/material_code length is validated per-ROW (it is a
        # field of the CSV row, checked before grouping), so the error
        # lands on the line, not the group's own header-consistency list.
        line_errors = group["lines"][0]["errors"]
        self.assertTrue(any(e["column"] == "formula_code" for e in line_errors))
        self.assertTrue(any(e["column"] == "material_code" for e in line_errors))

    def test_inactive_output_unit_is_a_group_error(self):
        data = csv_bytes([line("FIM001", "x", self.product.code, "10", self.inactive_unit.code, self.raw_material.code, "1")])
        response = self.preview(data)
        self.assertFalse(response.json()["groups"]["results"][0]["is_valid"])

    def test_unknown_material_is_a_line_error(self):
        data = csv_bytes([line("FIN001", "x", self.product.code, "10", self.mass_unit.code, "NOSUCHMATERIAL", "1")])
        response = self.preview(data)
        group = response.json()["groups"]["results"][0]
        self.assertFalse(group["is_valid"])
        self.assertFalse(group["lines"][0]["is_valid"])

    def test_inactive_material_is_a_line_error(self):
        data = csv_bytes([line("FIO001", "x", self.product.code, "10", self.mass_unit.code, self.inactive_material.code, "1")])
        response = self.preview(data)
        self.assertFalse(response.json()["groups"]["results"][0]["is_valid"])

    def test_count_output_unit_requires_whole_base_output_quantity(self):
        data = csv_bytes([line("FIP001", "x", self.product.code, "10.5", self.count_unit.code, self.raw_material.code, "1")])
        response = self.preview(data)
        group = response.json()["groups"]["results"][0]
        self.assertFalse(group["is_valid"])
        self.assertTrue(any("whole" in e["message"].lower() for e in group["errors"]))

    def test_count_material_unit_requires_whole_quantity(self):
        data = csv_bytes([line("FIQ001", "x", self.product.code, "10", self.mass_unit.code, self.packaging_material.code, "1.5")])
        response = self.preview(data)
        group = response.json()["groups"]["results"][0]
        self.assertFalse(group["lines"][0]["is_valid"])

    def test_output_unit_independent_of_product_sales_unit(self):
        # product.sales_uom is self.count_unit (COUNT); output unit here is
        # self.mass_unit (MASS) - explicitly independent, per Task 12B-2.
        data = csv_bytes([line("FIR001", "x", self.product.code, "10", self.mass_unit.code, self.raw_material.code, "1")])
        response = self.preview(data)
        self.assertTrue(response.json()["groups"]["results"][0]["is_valid"])

    def test_repeated_material_within_a_group_is_not_merged(self):
        data = csv_bytes([
            line("FIS001", "x", self.product.code, "10", self.mass_unit.code, self.raw_material.code, "1"),
            line("FIS001", "x", self.product.code, "10", self.mass_unit.code, self.raw_material.code, "2"),
        ])
        response = self.preview(data)
        body = response.json()
        group = body["groups"]["results"][0]
        self.assertTrue(group["is_valid"])
        self.assertEqual(len(group["lines"]), 2)
        self.assertEqual([l["material_quantity"] for l in group["lines"]], ["1.000", "2.000"])

    def test_too_many_header_columns_is_rejected(self):
        header = ",".join([f"col{i}" for i in range(25)])
        response = self.preview(f"{header}\r\n".encode("utf-8"))
        self.assertEqual(response.json()["file_errors"][0]["code"], "TOO_MANY_COLUMNS")

    def test_file_too_large_is_rejected(self):
        with patch("apps.formula_imports.services.MAX_FILE_SIZE_BYTES", 10):
            response = self.preview(csv_bytes([line("FIT001", "x", self.product.code, "1", self.mass_unit.code, self.raw_material.code, "1")]))
        self.assertEqual(response.json()["file_errors"][0]["code"], "FILE_TOO_LARGE")

    def test_too_many_rows_is_rejected(self):
        with patch("apps.formula_imports.services.MAX_ROWS", 2):
            rows = [line(f"FIU{i:03d}", "x", self.product.code, "1", self.mass_unit.code, self.raw_material.code, "1") for i in range(5)]
            response = self.preview(csv_bytes(rows))
        self.assertEqual(response.json()["file_errors"][0]["code"], "TOO_MANY_ROWS")

    def test_too_many_groups_is_rejected(self):
        with patch("apps.formula_imports.services.MAX_GROUPS", 2):
            rows = [line(f"FIV{i:03d}", "x", self.product.code, "1", self.mass_unit.code, self.raw_material.code, "1") for i in range(5)]
            response = self.preview(csv_bytes(rows))
        self.assertEqual(response.json()["file_errors"][0]["code"], "TOO_MANY_GROUPS")

    def test_too_many_lines_per_group_is_rejected(self):
        with patch("apps.formula_imports.services.MAX_LINES_PER_GROUP", 2):
            rows = [line("FIW001", "x", self.product.code, "1", self.mass_unit.code, self.raw_material.code, "1") for _ in range(5)]
            response = self.preview(csv_bytes(rows))
        group = response.json()["groups"]["results"][0]
        self.assertFalse(group["is_valid"])


# ---------------------------------------------------------------------------
# Commit
# ---------------------------------------------------------------------------


class CommitTests(FormulaImportTestCase):
    def test_happy_path_creates_formula_revision_lines_and_contributor(self):
        data = csv_bytes([
            line("FJA001", "Happy Path", self.product.code, "100", self.mass_unit.code, self.raw_material.code, "5.500", "F notes", "R notes"),
            line("FJA001", "Happy Path", self.product.code, "100", self.mass_unit.code, self.packaging_material.code, "24", "F notes", "R notes"),
        ])
        preview = self.preview(data).json()
        response = self.commit(preview["id"], preview["version"])
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(body["status"], "COMMITTED")
        self.assertEqual(len(body["created_formulas"]), 1)

        formula = Formula.objects.get(company=self.company, code="FJA001")
        self.assertEqual(formula.name, "Happy Path")
        self.assertEqual(formula.notes, "F notes")
        self.assertEqual(formula.latest_revision_number, 1)
        self.assertEqual(formula.version, 1)
        self.assertEqual(formula.created_by_id, self.importer.id)

        revision = formula.revisions.get(revision_number=1)
        self.assertEqual(revision.status, FormulaRevision.Status.DRAFT)
        self.assertEqual(str(revision.base_output_quantity), "100.000")
        self.assertEqual(revision.output_uom_id, self.mass_unit.id)
        self.assertEqual(revision.notes, "R notes")
        self.assertTrue(revision.contributor_history_complete)

        contributors = set(revision.contributors.values_list("user_id", flat=True))
        self.assertEqual(contributors, {self.importer.id})

        lines = list(revision.lines.order_by("line_number"))
        self.assertEqual(len(lines), 2)
        self.assertEqual(lines[0].material_id, self.raw_material.id)
        self.assertEqual(lines[0].unit_id, self.raw_material.base_unit_id)
        self.assertEqual(lines[0].material_kind_snapshot, Material.Kind.RAW_MATERIAL)
        self.assertEqual(lines[0].material_code_snapshot, self.raw_material.code)
        self.assertEqual(lines[1].material_id, self.packaging_material.id)
        self.assertEqual(lines[1].material_kind_snapshot, Material.Kind.PACKAGING_MATERIAL)

        self.assertTrue(AuditLog.objects.filter(action="formula_import.committed", target_id=preview["id"]).exists())

    def test_ineligible_preview_cannot_be_committed(self):
        data = csv_bytes([line("FJB001", "", self.product.code, "10", self.mass_unit.code, self.raw_material.code, "1")])
        preview = self.preview(data).json()
        self.assertFalse(preview["eligible_for_commit"])
        response = self.commit(preview["id"], preview["version"])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Formula.objects.filter(company=self.company).count(), 0)

    def test_code_taken_since_preview_blocks_the_whole_commit(self):
        data = csv_bytes([
            line("FJC001", "First", self.product.code, "10", self.mass_unit.code, self.raw_material.code, "1"),
            line("FJC002", "Second", self.product.code, "10", self.mass_unit.code, self.raw_material.code, "1"),
        ])
        preview = self.preview(data).json()
        self.assertTrue(preview["eligible_for_commit"])
        Formula.objects.create(company=self.company, product=self.product, code="FJC002", name="Raced",
                                latest_revision_number=0, created_by=self.superuser)

        response = self.commit(preview["id"], preview["version"])
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(Formula.objects.filter(company=self.company, code="FJC001").count(), 0)
        batch = FormulaImportBatch.objects.get(pk=preview["id"])
        self.assertEqual(batch.status, "PREVIEWED")

    def test_product_deactivated_since_preview_blocks_commit(self):
        toggle_product = make_product(self.company, self.count_unit, self.superuser)
        data = csv_bytes([line("FJD001", "x", toggle_product.code, "10", self.mass_unit.code, self.raw_material.code, "1")])
        preview = self.preview(data).json()
        self.assertTrue(preview["eligible_for_commit"])
        toggle_product.is_active = False
        toggle_product.save(update_fields=["is_active"])

        response = self.commit(preview["id"], preview["version"])
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(Formula.objects.filter(company=self.company).count(), 0)

    def test_material_deactivated_since_preview_blocks_commit(self):
        toggle_material = make_material("TOG", Material.Kind.RAW_MATERIAL, self.mass_unit)
        data = csv_bytes([line("FJE001", "x", self.product.code, "10", self.mass_unit.code, toggle_material.code, "1")])
        preview = self.preview(data).json()
        self.assertTrue(preview["eligible_for_commit"])
        toggle_material.is_active = False
        toggle_material.save(update_fields=["is_active"])

        response = self.commit(preview["id"], preview["version"])
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(Formula.objects.filter(company=self.company).count(), 0)

    def test_output_unit_deactivated_since_preview_blocks_commit(self):
        toggle_unit = make_unit("TOGU", UnitOfMeasure.Dimension.MASS)
        data = csv_bytes([line("FJF001", "x", self.product.code, "10", toggle_unit.code, self.raw_material.code, "1")])
        preview = self.preview(data).json()
        self.assertTrue(preview["eligible_for_commit"])
        toggle_unit.is_active = False
        toggle_unit.save(update_fields=["is_active"])

        response = self.commit(preview["id"], preview["version"])
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(Formula.objects.filter(company=self.company).count(), 0)

    def test_expired_preview_cannot_be_committed(self):
        data = csv_bytes([line("FJG001", "x", self.product.code, "10", self.mass_unit.code, self.raw_material.code, "1")])
        preview = self.preview(data).json()
        FormulaImportBatch.objects.filter(pk=preview["id"]).update(expires_at=timezone.now() - timedelta(seconds=1))
        response = self.commit(preview["id"], preview["version"])
        self.assertEqual(response.status_code, 400, response.content)

    def test_repeated_commit_returns_original_result_without_duplicating(self):
        data = csv_bytes([line("FJH001", "x", self.product.code, "10", self.mass_unit.code, self.raw_material.code, "1")])
        preview = self.preview(data).json()
        first = self.commit(preview["id"], preview["version"])
        second = self.commit(preview["id"], preview["version"])
        self.assertEqual(first.status_code, 200, first.content)
        self.assertEqual(second.status_code, 200, second.content)
        self.assertEqual(first.json()["created_formulas"], second.json()["created_formulas"])
        self.assertEqual(Formula.objects.filter(company=self.company, code="FJH001").count(), 1)

    def test_wrong_concurrency_token_is_a_conflict(self):
        data = csv_bytes([line("FJI001", "x", self.product.code, "10", self.mass_unit.code, self.raw_material.code, "1")])
        preview = self.preview(data).json()
        response = self.commit(preview["id"], expected_version=999)
        self.assertEqual(response.status_code, 409, response.content)

    def test_audit_failure_rolls_back_everything(self):
        data = csv_bytes([
            line("FJJ001", "x", self.product.code, "10", self.mass_unit.code, self.raw_material.code, "1"),
            line("FJJ001", "x", self.product.code, "10", self.mass_unit.code, self.packaging_material.code, "2"),
        ])
        preview = self.preview(data).json()

        with patch("apps.formula_imports.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.commit(preview["id"], preview["version"])

        self.assertEqual(Formula.objects.filter(company=self.company, code="FJJ001").count(), 0)
        batch = FormulaImportBatch.objects.get(pk=preview["id"])
        self.assertEqual(batch.status, "PREVIEWED")

    def test_commit_body_rejects_a_replacement_formula_list(self):
        data = csv_bytes([line("FJK001", "x", self.product.code, "10", self.mass_unit.code, self.raw_material.code, "1")])
        preview = self.preview(data).json()
        response = self.client.post(
            commit_url(self.company.id),
            data=json.dumps({"preview_id": preview["id"], "expected_version": preview["version"], "formulas": []}),
            content_type="application/json",
            **bearer(self.importer),
        )
        self.assertEqual(response.status_code, 400)

    def test_imported_formula_works_with_requirement_preview_and_approval_assessment(self):
        data = csv_bytes([
            line("FJL001", "Real usage", self.product.code, "100", self.mass_unit.code, self.raw_material.code, "10"),
        ])
        preview = self.preview(data).json()
        self.commit(preview["id"], preview["version"])
        revision = FormulaRevision.objects.select_related("formula__product", "output_uom").get(
            formula__company=self.company, formula__code="FJL001"
        )
        lines = list(revision.lines.select_related("material__base_unit", "unit"))

        result = build_requirement_preview(revision, lines, revision.base_output_quantity * 2)
        self.assertTrue(result["calculation_complete"])
        self.assertEqual(result["lines"][0]["required_quantity"]["value"], "20")

        assessment = assess_approval(
            revision, revision.formula, revision.formula.product, revision.output_uom, lines, policy=None,
            actor_is_contributor=True, actor_known=True,
        )
        blocking_codes = {b["code"] for b in assessment["blocking_reasons"]}
        self.assertIn("APPROVAL_POLICY_NOT_CONFIGURED", blocking_codes)
        self.assertNotIn("EMPTY_REVISION", blocking_codes)
        self.assertNotIn("INVALID_BASE_OUTPUT", blocking_codes)
        self.assertNotIn("INCONSISTENT_LINE", blocking_codes)


# ---------------------------------------------------------------------------
# Access / isolation
# ---------------------------------------------------------------------------


class AccessTests(FormulaImportTestCase):
    def test_missing_company_permission_is_named_in_403(self):
        weak_user = make_user("weak")
        grant_company_permission(self.superuser, weak_user, self.company, "formulas.view")
        grant_store_permission(self.superuser, weak_user, self.store, *CATALOG_PERMS)
        data = csv_bytes([line("FKA001", "x", self.product.code, "10", self.mass_unit.code, self.raw_material.code, "1")])
        response = self.preview(data, user=weak_user)
        self.assertEqual(response.status_code, 403)
        self.assertIn("formulas.create", response.json()["detail"])
        self.assertIn("formulas.import", response.json()["detail"])

    def test_missing_shared_catalog_access_is_403(self):
        no_catalog_user = make_user("nocat")
        grant_company_permission(self.superuser, no_catalog_user, self.company, *FULL_COMPANY_PERMS)
        data = csv_bytes([line("FKB001", "x", self.product.code, "10", self.mass_unit.code, self.raw_material.code, "1")])
        response = self.preview(data, user=no_catalog_user)
        self.assertEqual(response.status_code, 403)
        self.assertIn("shared_catalog.view", response.json()["detail"])

    def test_unknown_company_is_404(self):
        data = csv_bytes([line("FKC001", "x", self.product.code, "10", self.mass_unit.code, self.raw_material.code, "1")])
        response = self.client.post(preview_url(999999), {"file": upload(data)}, **bearer(self.importer))
        self.assertEqual(response.status_code, 404)

    def test_superuser_without_explicit_permissions_gets_403_not_a_bypass(self):
        bare_superuser = make_superuser("baresu")
        assign_company_membership(actor=self.superuser, user=bare_superuser, company=self.company)
        data = csv_bytes([line("FKD001", "x", self.product.code, "10", self.mass_unit.code, self.raw_material.code, "1")])
        response = self.preview(data, user=bare_superuser)
        self.assertEqual(response.status_code, 403)

    def test_other_company_cannot_read_or_commit_a_preview(self):
        other_user = make_user("otherco")
        grant_company_permission(self.superuser, other_user, self.other_company, *FULL_COMPANY_PERMS)
        grant_store_permission(self.superuser, other_user, self.store, *CATALOG_PERMS)
        data = csv_bytes([line("FKE001", "x", self.product.code, "10", self.mass_unit.code, self.raw_material.code, "1")])
        preview = self.preview(data).json()

        response = self.detail(preview["id"], user=other_user, company=self.other_company)
        self.assertEqual(response.status_code, 404)
        response = self.commit(preview["id"], preview["version"], user=other_user, company=self.other_company)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(Formula.objects.filter(code="FKE001").count(), 0)

    def test_other_user_in_the_same_company_cannot_read_or_commit_a_preview(self):
        other_user = make_user("sameco")
        grant_company_permission(self.superuser, other_user, self.company, *FULL_COMPANY_PERMS)
        grant_store_permission(self.superuser, other_user, self.store, *CATALOG_PERMS)
        data = csv_bytes([line("FKF001", "x", self.product.code, "10", self.mass_unit.code, self.raw_material.code, "1")])
        preview = self.preview(data).json()

        response = self.detail(preview["id"], user=other_user)
        self.assertEqual(response.status_code, 404)
        response = self.commit(preview["id"], preview["version"], user=other_user)
        self.assertEqual(response.status_code, 404)


# ---------------------------------------------------------------------------
# Concurrency
# ---------------------------------------------------------------------------


class ConcurrentCommitTests(TransactionTestCase):
    serialized_rollback = True

    def _setup_fixture(self):
        superuser = make_superuser("ccadmin")
        company = make_company("CCF")
        store = make_store("CCFWH")
        unit = make_unit("CCU", UnitOfMeasure.Dimension.MASS)
        material = make_material("CCM", Material.Kind.RAW_MATERIAL, unit)
        product = make_product(company, unit, superuser)
        importer = make_user("ccimporter")
        grant_company_permission(superuser, importer, company, *FULL_COMPANY_PERMS)
        grant_store_permission(superuser, importer, store, *CATALOG_PERMS)
        return company, unit, material, product, importer

    def test_concurrent_commit_of_the_same_batch_never_duplicates_formulas(self):
        company, unit, material, product, importer = self._setup_fixture()
        data = csv_bytes([line("CCF001", "x", product.code, "10", unit.code, material.code, "1")])
        preview = self.client_class().post(preview_url(company.id), {"file": upload(data)}, **bearer(importer)).json()

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
        self.assertEqual(Formula.objects.filter(company=company, code="CCF001").count(), 1)

    def test_two_different_batches_racing_on_the_same_code_produce_one_winner_and_a_clean_conflict(self):
        company, unit, material, product, importer = self._setup_fixture()
        data_a = csv_bytes([line("RACE001", "A", product.code, "10", unit.code, material.code, "1")])
        data_b = csv_bytes([line("RACE001", "B", product.code, "20", unit.code, material.code, "2")])
        preview_a = self.client_class().post(preview_url(company.id), {"file": upload(data_a)}, **bearer(importer)).json()
        preview_b = self.client_class().post(preview_url(company.id), {"file": upload(data_b)}, **bearer(importer)).json()

        results = []
        barrier = threading.Barrier(2)

        def worker(preview_id, version):
            client = self.client_class()
            try:
                barrier.wait(timeout=5)
                response = client.post(
                    commit_url(company.id),
                    data=json.dumps({"preview_id": preview_id, "expected_version": version}),
                    content_type="application/json",
                    **bearer(importer),
                )
                results.append(response.status_code)
            finally:
                connection.close()

        threads = [
            threading.Thread(target=worker, args=(preview_a["id"], preview_a["version"])),
            threading.Thread(target=worker, args=(preview_b["id"], preview_b["version"])),
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        # The loser is caught by whichever path the race actually hits:
        # the pre-check (a structured 400, if it runs before the winner's
        # commit is visible) or the database's own unique constraint at
        # bulk_create() (translated to a clean 409) - both are correct,
        # "never an unhandled 500" outcomes; which one wins is a genuine
        # timing race, not something this test should assume either way.
        self.assertEqual(results.count(200), 1, results)
        self.assertEqual(len(results), 2, results)
        loser = [code for code in results if code != 200][0]
        self.assertIn(loser, (400, 409), results)
        self.assertEqual(Formula.objects.filter(company=company, code="RACE001").count(), 1)


# ---------------------------------------------------------------------------
# Performance (Task 14B §8: bounded representative multi-formula test)
# ---------------------------------------------------------------------------


class RepresentativePerformanceTests(FormulaImportTestCase):
    def test_100_formulas_of_5_lines_each_preview_and_commit(self):
        materials = [make_material(f"PERFMAT{i}", Material.Kind.RAW_MATERIAL, self.mass_unit) for i in range(5)]
        rows = []
        for f in range(100):
            for m in materials:
                rows.append(line(f"PERF{f:04d}", f"Perf formula {f}", self.product.code, "100", self.mass_unit.code, m.code, "1"))
        data = csv_bytes(rows)

        started = time.perf_counter()
        with CaptureQueriesContext(connection) as preview_queries:
            preview_response = self.preview(data)
        preview_elapsed = time.perf_counter() - started
        self.assertEqual(preview_response.status_code, 201, preview_response.content[:500])
        preview = preview_response.json()
        self.assertEqual(preview["total_rows"], 500)
        self.assertEqual(preview["total_groups"], 100)
        self.assertTrue(preview["eligible_for_commit"])

        started = time.perf_counter()
        with CaptureQueriesContext(connection) as commit_queries:
            commit_response = self.commit(preview["id"], preview["version"])
        commit_elapsed = time.perf_counter() - started
        self.assertEqual(commit_response.status_code, 200, commit_response.content[:500])
        self.assertEqual(Formula.objects.filter(company=self.company).count(), 100)
        self.assertEqual(FormulaRevisionContributor.objects.filter(revision__formula__company=self.company).count(), 100)

        print(
            f"\n[Task 14B perf] 100 formulas x 5 lines (500 rows) - "
            f"preview: {len(preview_queries)} total queries, {preview_elapsed:.3f}s; "
            f"commit: {len(commit_queries)} total queries, {commit_elapsed:.3f}s "
            f"(actual totals, not the 4-query lookup-only claim; measured in this test run's own "
            f"environment, not a general performance claim)."
        )
