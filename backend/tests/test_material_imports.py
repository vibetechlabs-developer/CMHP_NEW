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
from apps.material_imports.models import MaterialImportBatch
from apps.permissions.services import create_company_role, create_store_role, replace_role_permissions, replace_store_role_permissions
from apps.products.models import Product
from apps.stores.models import SharedStore
from apps.stores.services import assign_store_membership, assign_store_membership_role
from apps.users.services import assign_company_membership, assign_membership_role

User = get_user_model()
PASSWORD = "a-strong-pass-1"
_counter = itertools.count()

HEADER = "code,name,material_type,base_unit_code,description"


def _unique(prefix):
    return f"{prefix}{next(_counter)}"


def preview_url():
    return "/api/v1/materials/import-preview/"


def preview_detail_url(batch_id):
    return f"/api/v1/materials/import-preview/{batch_id}/"


def commit_url():
    return "/api/v1/materials/import-commit/"


def make_superuser(prefix="admin"):
    return User.objects.create_superuser(username=_unique(prefix), email=f"{_unique('e')}@example.com", password=PASSWORD)


def make_user(prefix="user"):
    return User.objects.create_user(username=_unique(prefix), email=f"{_unique('e')}@example.com", password=PASSWORD)


def make_unit(prefix="UOM", dimension=UnitOfMeasure.Dimension.MASS, is_active=True):
    code = _unique(prefix)
    return UnitOfMeasure.objects.create(code=code, name=f"{code} Name", dimension=dimension, is_active=is_active)


def bearer(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


def csv_text(rows, header=HEADER):
    return "\r\n".join([header, *rows]) + "\r\n"


def csv_bytes(rows, header=HEADER, bom=False):
    data = csv_text(rows, header).encode("utf-8")
    return (b"\xef\xbb\xbf" + data) if bom else data


def upload(data, filename="import.csv"):
    return SimpleUploadedFile(filename, data, content_type="text/csv")


def row(code, name, material_type, base_unit_code, description=""):
    return f"{code},{name},{material_type},{base_unit_code},{description}"


class MaterialImportTestCase(TestCase):
    def setUp(self):
        self.superuser = make_superuser("miadmin")
        self.other_superuser = make_superuser("miother")
        self.unit = make_unit("KG", UnitOfMeasure.Dimension.MASS)
        self.count_unit = make_unit("BTL", UnitOfMeasure.Dimension.COUNT)
        self.inactive_unit = make_unit("OLDU", UnitOfMeasure.Dimension.MASS, is_active=False)

    def preview(self, data, filename="import.csv", user=None):
        user = user or self.superuser
        return self.client.post(preview_url(), {"file": upload(data, filename)}, **bearer(user))

    def commit(self, preview_id, expected_version=1, user=None):
        user = user or self.superuser
        return self.client.post(
            commit_url(),
            data=json.dumps({"preview_id": preview_id, "expected_version": expected_version}),
            content_type="application/json",
            **bearer(user),
        )

    def detail(self, batch_id, user=None, query=""):
        user = user or self.superuser
        return self.client.get(preview_detail_url(batch_id) + query, **bearer(user))


# ---------------------------------------------------------------------------
# Preview validation
# ---------------------------------------------------------------------------


class PreviewValidationTests(MaterialImportTestCase):
    def test_valid_raw_and_packaging_import_previews_cleanly_and_creates_no_materials(self):
        data = csv_bytes([
            row("MIA001", "Material A", "RAW_MATERIAL", self.unit.code, "First"),
            row("MIA002", "Material B", "PACKAGING_MATERIAL", self.count_unit.code),
        ])
        response = self.preview(data)
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["total_rows"], 2)
        self.assertEqual(body["valid_rows"], 2)
        self.assertTrue(body["eligible_for_commit"])
        self.assertEqual(Material.objects.filter(code__startswith="MIA").count(), 0)

    def test_material_type_is_normalized_for_case_but_not_invented(self):
        data = csv_bytes([row("MIB001", "x", "raw_material", self.unit.code)])
        response = self.preview(data)
        body = response.json()
        self.assertTrue(body["eligible_for_commit"])
        self.assertEqual(body["rows"]["results"][0]["material_type"], "RAW_MATERIAL")

    def test_unsupported_material_type_is_a_row_error(self):
        data = csv_bytes([row("MIC001", "x", "CONSUMABLE", self.unit.code)])
        response = self.preview(data)
        body = response.json()
        self.assertFalse(body["eligible_for_commit"])
        self.assertEqual(body["rows"]["results"][0]["errors"][0]["column"], "material_type")

    def test_utf8_bom_is_accepted(self):
        data = csv_bytes([row("MID001", "x", "RAW_MATERIAL", self.unit.code)], bom=True)
        response = self.preview(data)
        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(response.json()["eligible_for_commit"])

    def test_invalid_utf8_is_a_file_error(self):
        data = b"code,name,material_type,base_unit_code,description\r\n\xff\xfe,bad,RAW_MATERIAL,KG,\r\n"
        response = self.preview(data)
        body = response.json()
        self.assertEqual(body["file_errors"][0]["code"], "ENCODING_ERROR")

    def test_missing_required_column_is_a_file_error(self):
        data = "code,name,material_type\r\nX,Y,RAW_MATERIAL\r\n".encode("utf-8")
        response = self.preview(data)
        body = response.json()
        self.assertEqual(body["file_errors"][0]["code"], "MISSING_REQUIRED_COLUMN")

    def test_duplicate_header_is_a_file_error(self):
        data = "code,name,material_type,base_unit_code,code\r\nX,Y,RAW_MATERIAL,KG,X2\r\n".encode("utf-8")
        response = self.preview(data)
        body = response.json()
        self.assertEqual(body["file_errors"][0]["code"], "DUPLICATE_HEADER")

    def test_unsupported_column_is_rejected_not_dropped(self):
        data = "code,name,material_type,base_unit_code,supplier_lot\r\nX,Y,RAW_MATERIAL,KG,LOT1\r\n".encode("utf-8")
        response = self.preview(data)
        body = response.json()
        self.assertEqual(body["file_errors"][0]["code"], "UNSUPPORTED_COLUMN")
        self.assertIn("supplier_lot", body["file_errors"][0]["message"])

    def test_stock_or_pricing_style_columns_are_rejected(self):
        data = "code,name,material_type,base_unit_code,quantity,unit_price\r\nX,Y,RAW_MATERIAL,KG,10,5\r\n".encode("utf-8")
        response = self.preview(data)
        body = response.json()
        self.assertEqual(body["file_errors"][0]["code"], "UNSUPPORTED_COLUMN")

    def test_duplicate_code_within_file_marks_every_occurrence_invalid(self):
        data = csv_bytes([
            row("MIE001", "First", "RAW_MATERIAL", self.unit.code),
            row("MIE001", "Second", "RAW_MATERIAL", self.unit.code),
        ])
        response = self.preview(data)
        body = response.json()
        self.assertEqual(body["invalid_rows"], 2)
        for result in body["rows"]["results"]:
            self.assertFalse(result["is_valid"])

    def test_code_already_used_by_active_material_blocks_the_row(self):
        Material.objects.create(code="MIF001", name="Existing", kind=Material.Kind.RAW_MATERIAL, base_unit=self.unit)
        data = csv_bytes([row("MIF001", "New attempt", "RAW_MATERIAL", self.unit.code)])
        response = self.preview(data)
        body = response.json()
        self.assertFalse(body["eligible_for_commit"])

    def test_code_already_used_by_inactive_material_still_reserves_it(self):
        Material.objects.create(
            code="MIG001", name="Existing inactive", kind=Material.Kind.RAW_MATERIAL, base_unit=self.unit, is_active=False,
        )
        data = csv_bytes([row("MIG001", "New attempt", "RAW_MATERIAL", self.unit.code)])
        response = self.preview(data)
        body = response.json()
        self.assertFalse(body["eligible_for_commit"])

    def test_unknown_unit_code_blocks_the_row(self):
        data = csv_bytes([row("MIH001", "x", "RAW_MATERIAL", "NOSUCHUNIT")])
        response = self.preview(data)
        body = response.json()
        self.assertFalse(body["eligible_for_commit"])
        self.assertEqual(body["rows"]["results"][0]["errors"][0]["column"], "base_unit_code")

    def test_inactive_unit_code_blocks_the_row(self):
        data = csv_bytes([row("MII001", "x", "RAW_MATERIAL", self.inactive_unit.code)])
        response = self.preview(data)
        body = response.json()
        self.assertFalse(body["eligible_for_commit"])

    def test_field_length_limits_are_enforced(self):
        data = csv_bytes([row("X" * 40, "y" * 300, "RAW_MATERIAL", self.unit.code)])
        response = self.preview(data)
        body = response.json()
        errors = {e["column"] for e in body["rows"]["results"][0]["errors"]}
        self.assertIn("code", errors)
        self.assertIn("name", errors)

    def test_too_many_header_columns_is_rejected(self):
        header = ",".join([f"col{i}" for i in range(25)])
        response = self.preview(f"{header}\r\n".encode("utf-8"))
        self.assertEqual(response.json()["file_errors"][0]["code"], "TOO_MANY_COLUMNS")

    def test_file_too_large_is_rejected(self):
        with patch("apps.material_imports.services.MAX_FILE_SIZE_BYTES", 10):
            response = self.preview(csv_bytes([row("MIJ001", "x", "RAW_MATERIAL", self.unit.code)]))
        self.assertEqual(response.json()["file_errors"][0]["code"], "FILE_TOO_LARGE")

    def test_too_many_rows_is_rejected(self):
        with patch("apps.material_imports.services.MAX_ROWS", 2):
            rows = [row(f"MIK{i:03d}", "x", "RAW_MATERIAL", self.unit.code) for i in range(5)]
            response = self.preview(csv_bytes(rows))
        self.assertEqual(response.json()["file_errors"][0]["code"], "TOO_MANY_ROWS")


# ---------------------------------------------------------------------------
# Commit
# ---------------------------------------------------------------------------


class CommitTests(MaterialImportTestCase):
    def test_happy_path_creates_materials_and_marks_batch_committed(self):
        data = csv_bytes([
            row("MLA001", "Material One", "RAW_MATERIAL", self.unit.code, "Desc one"),
            row("MLA002", "Material Two", "PACKAGING_MATERIAL", self.count_unit.code),
        ])
        preview = self.preview(data).json()
        response = self.commit(preview["id"], preview["version"])
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(body["status"], "COMMITTED")
        self.assertEqual(len(body["created_material_ids"]), 2)

        materials = Material.objects.filter(code__in=["MLA001", "MLA002"]).order_by("code")
        self.assertEqual([m.code for m in materials], ["MLA001", "MLA002"])
        self.assertEqual(materials[0].kind, Material.Kind.RAW_MATERIAL)
        self.assertEqual(materials[0].base_unit_id, self.unit.id)
        self.assertEqual(materials[0].description, "Desc one")
        self.assertEqual(materials[1].kind, Material.Kind.PACKAGING_MATERIAL)
        self.assertEqual(materials[1].base_unit_id, self.count_unit.id)
        self.assertTrue(all(m.is_active for m in materials))

        self.assertTrue(AuditLog.objects.filter(action="material_import.committed", target_id=preview["id"]).exists())
        # No company/store fabricated as audit context (Task 14C §5).
        entry = AuditLog.objects.get(action="material_import.committed", target_id=preview["id"])
        self.assertIsNone(entry.company_id)
        self.assertIsNone(entry.store_id)

    def test_ineligible_preview_cannot_be_committed(self):
        data = csv_bytes([row("", "Missing code", "RAW_MATERIAL", self.unit.code)])
        preview = self.preview(data).json()
        self.assertFalse(preview["eligible_for_commit"])
        response = self.commit(preview["id"], preview["version"])
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(Material.objects.filter(code="").count(), 0)

    def test_code_taken_since_preview_blocks_the_whole_commit(self):
        data = csv_bytes([
            row("MLB001", "First", "RAW_MATERIAL", self.unit.code),
            row("MLB002", "Second", "RAW_MATERIAL", self.unit.code),
        ])
        preview = self.preview(data).json()
        self.assertTrue(preview["eligible_for_commit"])
        Material.objects.create(code="MLB002", name="Raced", kind=Material.Kind.RAW_MATERIAL, base_unit=self.unit)

        response = self.commit(preview["id"], preview["version"])
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(Material.objects.filter(code="MLB001").count(), 0)
        batch = MaterialImportBatch.objects.get(pk=preview["id"])
        self.assertEqual(batch.status, "PREVIEWED")

    def test_unit_deactivated_since_preview_blocks_the_whole_commit(self):
        toggle_unit = make_unit("TOG", UnitOfMeasure.Dimension.MASS)
        data = csv_bytes([row("MLC001", "x", "RAW_MATERIAL", toggle_unit.code)])
        preview = self.preview(data).json()
        self.assertTrue(preview["eligible_for_commit"])
        toggle_unit.is_active = False
        toggle_unit.save(update_fields=["is_active"])

        response = self.commit(preview["id"], preview["version"])
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(Material.objects.filter(code="MLC001").count(), 0)

    def test_expired_preview_cannot_be_committed(self):
        data = csv_bytes([row("MLD001", "x", "RAW_MATERIAL", self.unit.code)])
        preview = self.preview(data).json()
        MaterialImportBatch.objects.filter(pk=preview["id"]).update(expires_at=timezone.now() - timedelta(seconds=1))
        response = self.commit(preview["id"], preview["version"])
        self.assertEqual(response.status_code, 400, response.content)

    def test_repeated_commit_returns_original_result_without_duplicating(self):
        data = csv_bytes([row("MLE001", "x", "RAW_MATERIAL", self.unit.code)])
        preview = self.preview(data).json()
        first = self.commit(preview["id"], preview["version"])
        second = self.commit(preview["id"], preview["version"])
        self.assertEqual(first.status_code, 200, first.content)
        self.assertEqual(second.status_code, 200, second.content)
        self.assertEqual(first.json()["created_material_ids"], second.json()["created_material_ids"])
        self.assertEqual(Material.objects.filter(code="MLE001").count(), 1)

    def test_wrong_concurrency_token_is_a_conflict(self):
        data = csv_bytes([row("MLF001", "x", "RAW_MATERIAL", self.unit.code)])
        preview = self.preview(data).json()
        response = self.commit(preview["id"], expected_version=999)
        self.assertEqual(response.status_code, 409, response.content)

    def test_audit_failure_rolls_back_everything(self):
        data = csv_bytes([row("MLG001", "x", "RAW_MATERIAL", self.unit.code)])
        preview = self.preview(data).json()

        with patch("apps.material_imports.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.commit(preview["id"], preview["version"])

        self.assertEqual(Material.objects.filter(code="MLG001").count(), 0)
        batch = MaterialImportBatch.objects.get(pk=preview["id"])
        self.assertEqual(batch.status, "PREVIEWED")

    def test_commit_body_rejects_a_replacement_material_list(self):
        data = csv_bytes([row("MLH001", "x", "RAW_MATERIAL", self.unit.code)])
        preview = self.preview(data).json()
        response = self.client.post(
            commit_url(),
            data=json.dumps({"preview_id": preview["id"], "expected_version": preview["version"], "materials": []}),
            content_type="application/json",
            **bearer(self.superuser),
        )
        self.assertEqual(response.status_code, 400)


# ---------------------------------------------------------------------------
# Access / isolation
# ---------------------------------------------------------------------------


class AccessTests(MaterialImportTestCase):
    def test_ordinary_user_cannot_preview(self):
        ordinary_user = make_user("ordinary")
        data = csv_bytes([row("MMA001", "x", "RAW_MATERIAL", self.unit.code)])
        response = self.preview(data, user=ordinary_user)
        self.assertEqual(response.status_code, 403)

    def test_shared_catalog_view_alone_cannot_create_materials(self):
        # apps.catalog.views' own convention: shared_catalog.view is a
        # READ-only permission for ordinary lookups, never a create
        # permission - preserved here unchanged, not broadened.
        catalog_reader = make_user("catreader")
        store = SharedStore.objects.create(code=_unique("MMST"), name="Store")
        membership, _ = assign_store_membership(actor=self.superuser, user=catalog_reader, store=store)
        role = create_store_role(actor=self.superuser, store=store, code=_unique("SROLE"), name="Role")
        replace_store_role_permissions(actor=self.superuser, role=role, permission_codes=["shared_catalog.view"])
        assign_store_membership_role(actor=self.superuser, membership=membership, role=role)

        data = csv_bytes([row("MMB001", "x", "RAW_MATERIAL", self.unit.code)])
        response = self.preview(data, user=catalog_reader)
        self.assertEqual(response.status_code, 403)

    def test_unauthenticated_is_401(self):
        data = csv_bytes([row("MMC001", "x", "RAW_MATERIAL", self.unit.code)])
        response = self.client.post(preview_url(), {"file": upload(data)})
        self.assertEqual(response.status_code, 401)

    def test_other_superuser_cannot_read_or_commit_a_preview(self):
        data = csv_bytes([row("MMD001", "x", "RAW_MATERIAL", self.unit.code)])
        preview = self.preview(data).json()

        response = self.detail(preview["id"], user=self.other_superuser)
        self.assertEqual(response.status_code, 404)
        response = self.commit(preview["id"], preview["version"], user=self.other_superuser)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(Material.objects.filter(code="MMD001").count(), 0)

    def test_owner_can_read_their_own_preview(self):
        data = csv_bytes([row("MME001", "x", "RAW_MATERIAL", self.unit.code)])
        preview = self.preview(data).json()
        response = self.detail(preview["id"])
        self.assertEqual(response.status_code, 200)


# ---------------------------------------------------------------------------
# Concurrency
# ---------------------------------------------------------------------------


class ConcurrentCommitTests(TransactionTestCase):
    serialized_rollback = True

    def test_concurrent_commit_of_the_same_batch_never_duplicates_materials(self):
        superuser = make_superuser("ccmadmin")
        unit = make_unit("CCMU", UnitOfMeasure.Dimension.MASS)
        data = csv_bytes([row("CCM001", "x", "RAW_MATERIAL", unit.code)])
        preview = self.client_class().post(preview_url(), {"file": upload(data)}, **bearer(superuser)).json()

        results = []
        barrier = threading.Barrier(2)

        def worker():
            client = self.client_class()
            try:
                barrier.wait(timeout=5)
                response = client.post(
                    commit_url(),
                    data=json.dumps({"preview_id": preview["id"], "expected_version": preview["version"]}),
                    content_type="application/json",
                    **bearer(superuser),
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
        self.assertEqual(Material.objects.filter(code="CCM001").count(), 1)

    def test_two_different_previews_racing_on_the_same_code_produce_one_winner_and_a_clean_conflict(self):
        superuser = make_superuser("ccmadmin2")
        unit = make_unit("CCMU2", UnitOfMeasure.Dimension.MASS)
        data_a = csv_bytes([row("RACEM001", "A", "RAW_MATERIAL", unit.code)])
        data_b = csv_bytes([row("RACEM001", "B", "PACKAGING_MATERIAL", unit.code)])
        preview_a = self.client_class().post(preview_url(), {"file": upload(data_a)}, **bearer(superuser)).json()
        preview_b = self.client_class().post(preview_url(), {"file": upload(data_b)}, **bearer(superuser)).json()

        results = []
        barrier = threading.Barrier(2)

        def worker(preview_id, version):
            client = self.client_class()
            try:
                barrier.wait(timeout=5)
                response = client.post(
                    commit_url(),
                    data=json.dumps({"preview_id": preview_id, "expected_version": version}),
                    content_type="application/json",
                    **bearer(superuser),
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
        self.assertEqual(Material.objects.filter(code="RACEM001").count(), 1)


# ---------------------------------------------------------------------------
# Compatibility: an imported material resolves correctly in a Formula import
# ---------------------------------------------------------------------------


class MaterialToFormulaCompatibilityTests(TestCase):
    """Task 14C §6: import a synthetic material, then use its code in the
    EXISTING Formula CSV preview/commit (Task 14B), and verify the
    resulting FormulaLine's material identity/type/unit/snapshots. Does
    NOT re-run the full formula-import suite - one focused scenario only,
    since no shared behavior in apps.formula_imports changed.
    """

    def test_imported_material_resolves_correctly_in_a_formula_import(self):
        from apps.formulas.models import Formula

        superuser = make_superuser("compatadmin")
        unit = make_unit("COMPATU", UnitOfMeasure.Dimension.MASS)

        material_data = csv_bytes([row("COMPATMAT001", "Compat Material", "RAW_MATERIAL", unit.code, "For compatibility test")])
        material_preview = self.client.post(preview_url(), {"file": upload(material_data)}, **bearer(superuser)).json()
        material_commit = self.client.post(
            commit_url(),
            data=json.dumps({"preview_id": material_preview["id"], "expected_version": material_preview["version"]}),
            content_type="application/json",
            **bearer(superuser),
        ).json()
        self.assertEqual(material_commit["status"], "COMMITTED")
        material_id = material_commit["created_material_ids"][0]
        material = Material.objects.get(pk=material_id)
        self.assertEqual(material.code, "COMPATMAT001")
        self.assertEqual(material.kind, Material.Kind.RAW_MATERIAL)
        self.assertEqual(material.base_unit_id, unit.id)

        company = Company.objects.create(code=_unique("COMPATC"), legal_name="Compat Co")
        store = SharedStore.objects.create(code=_unique("COMPATWH"), name="Compat Store")
        product = Product.objects.create(company=company, code=_unique("COMPATPRD"), name="Compat Product", sales_uom=unit, created_by=superuser)
        importer = make_user("compatimporter")
        membership, _ = assign_company_membership(actor=superuser, user=importer, company=company)
        role = create_company_role(actor=superuser, company=company, code=_unique("CROLE"), name="Role")
        replace_role_permissions(actor=superuser, role=role, permission_codes=["formulas.view", "formulas.create", "formulas.import"])
        assign_membership_role(actor=superuser, membership=membership, role=role)
        store_membership, _ = assign_store_membership(actor=superuser, user=importer, store=store)
        store_role = create_store_role(actor=superuser, store=store, code=_unique("SROLE"), name="Role")
        replace_store_role_permissions(actor=superuser, role=store_role, permission_codes=["shared_catalog.view"])
        assign_store_membership_role(actor=superuser, membership=store_membership, role=store_role)

        formula_header = "formula_code,formula_name,product_code,base_output_quantity,output_uom_code,material_code,material_quantity,formula_notes,revision_notes"
        formula_row = f"COMPATF001,Compat Formula,{product.code},100,{unit.code},{material.code},5.5,,"
        formula_data = (formula_header + "\r\n" + formula_row + "\r\n").encode("utf-8")

        formula_preview = self.client.post(
            f"/api/v1/companies/{company.id}/formulas/import-preview/", {"file": upload(formula_data)}, **bearer(importer)
        ).json()
        self.assertTrue(formula_preview["eligible_for_commit"], formula_preview)
        formula_commit = self.client.post(
            f"/api/v1/companies/{company.id}/formulas/import-commit/",
            data=json.dumps({"preview_id": formula_preview["id"], "expected_version": formula_preview["version"]}),
            content_type="application/json",
            **bearer(importer),
        ).json()
        self.assertEqual(formula_commit["status"], "COMMITTED")

        formula = Formula.objects.get(company=company, code="COMPATF001")
        revision = formula.revisions.get(revision_number=1)
        line = revision.lines.get()
        self.assertEqual(line.material_id, material.id)
        self.assertEqual(line.material_code_snapshot, "COMPATMAT001")
        self.assertEqual(line.material_kind_snapshot, Material.Kind.RAW_MATERIAL)
        self.assertEqual(line.unit_id, unit.id)
        self.assertEqual(line.unit_code_snapshot, unit.code)
        self.assertEqual(str(line.quantity), "5.500")


# ---------------------------------------------------------------------------
# Performance (Task 14C §6: 2000-row isolated-database performance test)
# ---------------------------------------------------------------------------


class LargeImportPerformanceTests(MaterialImportTestCase):
    def test_2000_row_import_preview_and_commit(self):
        rows = [row(f"BIGM{i:05d}", f"Bulk Material {i}", "RAW_MATERIAL" if i % 2 == 0 else "PACKAGING_MATERIAL", self.unit.code) for i in range(2000)]
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
        self.assertEqual(Material.objects.filter(code__startswith="BIGM").count(), 2000)

        self.assertLess(len(preview_queries), 30, "preview issued too many queries - check for a per-row query")
        self.assertLess(len(commit_queries), 30, "commit issued too many queries - check for a per-row query")

        print(
            f"\n[Task 14C perf] 2000-row preview: {len(preview_queries)} queries, {preview_elapsed:.3f}s; "
            f"commit: {len(commit_queries)} queries, {commit_elapsed:.3f}s "
            f"(measured in this test run's own environment, not a general claim)."
        )
