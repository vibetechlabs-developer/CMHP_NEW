import json
import tempfile
from io import StringIO
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from apps.catalog.models import Material, UnitOfMeasure
from apps.customers.models import Customer
from apps.formulas.models import Formula, FormulaApprovalPolicy, FormulaRevision
from apps.permissions.models import CompanyRole, StoreRole
from apps.products.models import Product

User = get_user_model()


def run_seed(credentials_file):
    out = StringIO()
    call_command("seed_demo_data", "--yes", "--credentials-file", str(credentials_file), stdout=out)
    return out.getvalue()


@override_settings(DEBUG=True)
class SeedDemoDataTests(TestCase):
    def setUp(self):
        User.objects.create_superuser("seedadmin", "seedadmin@example.com", "a-strong-pass-1")
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "creds.json"

    def counts(self):
        return (
            Customer.objects.count(),
            Product.objects.count(),
            Material.objects.count(),
            UnitOfMeasure.objects.count(),
            CompanyRole.objects.count(),
            StoreRole.objects.count(),
            User.objects.count(),
        )

    def test_refuses_without_yes_or_debug(self):
        with self.assertRaises(CommandError):
            call_command("seed_demo_data", "--credentials-file", str(self.path))
        with override_settings(DEBUG=False):
            with self.assertRaises(CommandError):
                run_seed(self.path)

    def test_first_run_creates_demo_records_and_personas(self):
        output = run_seed(self.path)
        self.assertIn("Records this run - created:", output)
        self.assertNotIn(json.loads(self.path.read_text())["users"][0]["password"], output)
        usernames = {row["username"] for row in json.loads(self.path.read_text())["users"]}
        self.assertTrue({"demo_sales", "demo_formula", "demo_formula_nocatalog"} <= usernames)
        self.assertEqual(Customer.objects.filter(code__startswith="DEMOCUST").count(), 2)
        self.assertEqual(Product.objects.filter(code__startswith="DEMOPROD").count(), 2)
        self.assertEqual(Material.objects.get(code="DEMOPACK1").kind, "PACKAGING_MATERIAL")

    def test_second_run_is_a_no_op_and_preserves_credentials_file(self):
        run_seed(self.path)
        before_bytes = self.path.read_bytes()
        before_counts = self.counts()
        output = run_seed(self.path)
        self.assertEqual(self.counts(), before_counts)
        self.assertEqual(self.path.read_bytes(), before_bytes)
        self.assertIn("created: 0", output)

    def test_credentials_merge_keeps_old_entries_and_never_overwrites_recorded_ones(self):
        from apps.common.management.commands.seed_demo_data import Command

        self.path.write_text(json.dumps({"users": [{"username": "demo_requester", "password": "old-secret-1"}]}))
        Command()._write_credentials_file(
            self.path, {"demo_sales": "new-secret-2", "demo_requester": "must-not-replace"}
        )
        merged = {row["username"]: row["password"] for row in json.loads(self.path.read_text())["users"]}
        self.assertEqual(merged, {"demo_requester": "old-secret-1", "demo_sales": "new-secret-2"})

    def test_unreadable_credentials_file_is_never_overwritten(self):
        from apps.common.management.commands.seed_demo_data import Command

        self.path.write_text("not json")
        with self.assertRaises(CommandError):
            Command()._write_credentials_file(self.path, {"demo_sales": "x"})
        self.assertEqual(self.path.read_text(), "not json")

    def test_existing_user_and_password_are_never_replaced(self):
        User.objects.create_user("demo_sales", "demo_sales@demo.invalid", "keep-this-pass-1")
        run_seed(self.path)
        self.assertTrue(User.objects.get(username="demo_sales").check_password("keep-this-pass-1"))
        recorded = {row["username"] for row in json.loads(self.path.read_text())["users"]}
        self.assertNotIn("demo_sales", recorded)

    def test_conflicting_real_identity_stops_the_run(self):
        User.objects.create_user("demo_formula", "someone.real@example.com", "x-strong-pass-1")
        with self.assertRaises(CommandError):
            run_seed(self.path)

    def test_company_and_store_permissions_are_kept_separate(self):
        run_seed(self.path)
        sales = CompanyRole.objects.get(code="DEMO_SALES_DRAFTER")
        codes = set(sales.permissions.values_list("code", flat=True))
        self.assertIn("quotations.create", codes)
        self.assertNotIn("shared_catalog.view", codes)
        self.assertFalse(StoreRole.objects.filter(code="DEMO_CATALOG_LOOKUP").exclude(
            permissions__code="shared_catalog.view").exists())

    # -- Task 13E: connected planning demo -----------------------------

    def test_first_run_creates_an_approved_packing_formula_with_a_non_contributing_approver(self):
        run_seed(self.path)
        usernames = {row["username"] for row in json.loads(self.path.read_text())["users"]}
        self.assertTrue({"demo_planner", "demo_formula_approver", "demo_store_planner"} <= usernames)

        kg = UnitOfMeasure.objects.get(code="DEMOMKG")
        g = UnitOfMeasure.objects.get(code="DEMOMG")
        self.assertEqual(kg.dimension, "MASS")
        self.assertEqual(str(kg.canonical_factor), "1000.0000000000")
        self.assertEqual(str(g.canonical_factor), "1.0000000000")
        # DEMOKG (created before Task 13E existed) is never touched.
        self.assertIsNone(UnitOfMeasure.objects.get(code="DEMOKG").canonical_factor)

        revision = FormulaRevision.objects.get(formula__code="DEMOFPACK13E", revision_number=1)
        self.assertEqual(revision.status, FormulaRevision.Status.APPROVED)
        self.assertEqual(revision.output_uom.code, "DEMOMKG")
        self.assertEqual(str(revision.base_output_quantity), "76.000")
        self.assertEqual(revision.approved_by.username, "demo_formula_approver")
        contributors = set(revision.contributors.values_list("user__username", flat=True))
        self.assertEqual(contributors, {"demo_planner"})
        self.assertNotIn(revision.approved_by.username, contributors)

        policy = FormulaApprovalPolicy.objects.get(company__code="DEMOA")
        self.assertFalse(policy.allow_self_approval)

    def test_second_run_reuses_the_approved_formula_without_re_approving_it(self):
        run_seed(self.path)
        revision = FormulaRevision.objects.get(formula__code="DEMOFPACK13E", revision_number=1)
        before_version, before_approved_at = revision.version, revision.approved_at

        output = run_seed(self.path)
        revision.refresh_from_db()
        self.assertEqual(revision.version, before_version)
        self.assertEqual(revision.approved_at, before_approved_at)
        self.assertEqual(Formula.objects.filter(code="DEMOFPACK13E").count(), 1)
        self.assertEqual(FormulaApprovalPolicy.objects.filter(company__code="DEMOA").count(), 1)
        self.assertIn("created: 0", output)

    def test_conflicting_pre_existing_approval_policy_stops_the_run(self):
        from apps.companies.models import Company
        from apps.formulas.approval import update_approval_policy

        run_seed(self.path)
        actor = User.objects.filter(is_superuser=True).get()
        company_a = Company.objects.get(code="DEMOA")
        policy = FormulaApprovalPolicy.objects.get(company=company_a)
        # Mutate it to a value this command's own demo shape does not
        # expect (self-approval must be False), simulating a genuine,
        # unrelated policy decision made outside this command.
        update_approval_policy(
            actor=actor, company=company_a, expected_version=policy.version, data={"allow_self_approval": True}
        )
        with self.assertRaises(CommandError):
            run_seed(self.path)
