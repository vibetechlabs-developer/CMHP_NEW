import datetime
import itertools
import json
import threading
from decimal import Decimal
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import connection
from django.test import Client, TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from apps.audit.models import AuditLog
from apps.batch_plans import numbering as bn
from apps.batch_plans.models import BatchNumberAllocation, BatchNumberSequenceCounter, BatchPlan
from apps.batch_plans.services import create_batch_plan, update_batch_plan
from apps.catalog.models import Material, UnitOfMeasure
from apps.common.errors import Conflict
from apps.companies.models import Company
from apps.customers.models import Customer
from apps.formulas.models import Formula, FormulaLine, FormulaRevision
from apps.permissions.services import create_company_role, replace_role_permissions
from apps.products.models import Product
from apps.sales_orders.models import SalesOrder
from apps.sales_orders.services import create_sales_order, update_sales_order
from apps.users.services import assign_company_membership, assign_membership_role

User = get_user_model()
PASSWORD = "a-strong-pass-1"
_counter = itertools.count()

ALL_ALLOCATE_PERMS = ("batch_plans.view", "batch_plans.allocate_number")


def allocate_url(company_id, plan_id):
    return f"/api/v1/companies/{company_id}/batch-plans/{plan_id}/allocate-number/"


def plan_url(company_id, plan_id):
    return f"/api/v1/companies/{company_id}/batch-plans/{plan_id}/"


def plans_url(company_id):
    return f"/api/v1/companies/{company_id}/batch-plans/"


def make_user(prefix="user"):
    n = next(_counter)
    return User.objects.create_user(username=f"{prefix}_{n}", email=f"{prefix}_{n}@example.com", password=PASSWORD)


def make_superuser(prefix="admin"):
    n = next(_counter)
    return User.objects.create_superuser(username=f"{prefix}_{n}", email=f"{prefix}_{n}@example.com", password=PASSWORD)


def make_company(prefix="CMP"):
    n = next(_counter)
    return Company.objects.create(code=f"{prefix}{n}", legal_name=f"{prefix}{n} Pvt Ltd")


def make_unit(prefix="UOM", dimension=UnitOfMeasure.Dimension.COUNT):
    n = next(_counter)
    return UnitOfMeasure.objects.create(code=f"{prefix}{n}", name=f"{prefix}{n} Name", dimension=dimension)


def make_material(prefix="MAT", kind=Material.Kind.RAW_MATERIAL, unit=None):
    n = next(_counter)
    if unit is None:
        unit = make_unit(prefix="KG", dimension=UnitOfMeasure.Dimension.MASS)
    return Material.objects.create(code=f"{prefix}{n}", name=f"{prefix}{n} Name", kind=kind, base_unit=unit)


def make_product(company, unit, actor, prefix="PRD"):
    n = next(_counter)
    return Product.objects.create(company=company, code=f"{prefix}{n}", name=f"{prefix}{n} Product", sales_uom=unit, created_by=actor)


def make_customer(company, actor, code, prefix="CUST"):
    n = next(_counter)
    return Customer.objects.create(company=company, code=code, name=f"{prefix}{n} Customer", created_by=actor)


def bearer(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


def grant(actor, user, company, *codes):
    membership, _ = assign_company_membership(actor=actor, user=user, company=company)
    if codes:
        role = create_company_role(actor=actor, company=company, code=f"ROLE{user.id}{company.id}", name="Role")
        replace_role_permissions(actor=actor, role=role, permission_codes=list(codes))
        assign_membership_role(actor=actor, membership=membership, role=role)
    return membership


def approve_revision_directly(revision, approver):
    revision.status = FormulaRevision.Status.APPROVED
    revision.approved_by = approver
    revision.approved_at = timezone.now()
    revision.approval_policy_version = 1
    revision.approval_policy_snapshot = {"allow_self_approval": True}
    revision.save()
    return revision


class AllocationTestCase(TestCase):
    def setUp(self):
        self.superuser = make_superuser("nadmin")
        self.company = make_company("ALFCO")  # operating company code, deliberately different from client code
        self.other_company = make_company("BETCO")
        self.unit_count = make_unit("BTL", UnitOfMeasure.Dimension.COUNT)
        self.mass_unit = make_unit("KG", UnitOfMeasure.Dimension.MASS)
        self.customer = make_customer(self.company, self.superuser, "GER")
        self.product = make_product(self.company, self.unit_count, self.superuser)
        self.raw = make_material("RAW", Material.Kind.RAW_MATERIAL, self.mass_unit)

        self.order = create_sales_order(
            actor=self.superuser, company=self.company, customer_id=self.customer.id, currency="INR",
            order_date=datetime.date(2026, 10, 1),
            lines=[{"product_id": self.product.id, "quantity": Decimal("100"), "unit_price": Decimal("15")}],
        )
        self.line = self.order.lines.first()

        self.formula = Formula.objects.create(
            company=self.company, product=self.product, code="F-001", name="Tonic Formula",
            latest_revision_number=1, created_by=self.superuser,
        )
        self.revision = FormulaRevision.objects.create(
            formula=self.formula, revision_number=1, status=FormulaRevision.Status.DRAFT,
            base_output_quantity=Decimal("100.000"), output_uom=self.unit_count, created_by=self.superuser,
        )
        FormulaLine.objects.create(
            revision=self.revision, line_number=1, material=self.raw, quantity=Decimal("10.000"), unit=self.mass_unit,
            material_code_snapshot=self.raw.code, material_name_snapshot=self.raw.name,
            material_kind_snapshot=self.raw.kind, unit_code_snapshot=self.mass_unit.code, unit_name_snapshot=self.mass_unit.name,
        )
        approve_revision_directly(self.revision, self.superuser)

        self.plan = create_batch_plan(
            actor=self.superuser, company=self.company, sales_order_line_id=self.line.id,
            formula_revision_id=self.revision.id, target_output_quantity="50",
        )

        self.operator = make_user("numop")
        grant(self.superuser, self.operator, self.company, *ALL_ALLOCATE_PERMS)
        self.client_ = Client()

    def make_plan(self, target="10"):
        formula = Formula.objects.create(
            company=self.company, product=self.product, code=f"F-{next(_counter)}", name="Extra",
            latest_revision_number=1, created_by=self.superuser,
        )
        revision = FormulaRevision.objects.create(
            formula=formula, revision_number=1, status=FormulaRevision.Status.DRAFT,
            base_output_quantity=Decimal("10.000"), output_uom=self.unit_count, created_by=self.superuser,
        )
        approve_revision_directly(revision, self.superuser)
        return create_batch_plan(
            actor=self.superuser, company=self.company, sales_order_line_id=self.line.id,
            formula_revision_id=revision.id, target_output_quantity=target,
        )

    def allocate(self, plan=None, user=None, version=None, company_id=None):
        plan = plan or self.plan
        body = {"expected_version": version if version is not None else plan.version}
        return self.client_.post(
            allocate_url(company_id or self.company.id, plan.id), data=json.dumps(body), content_type="application/json",
            **bearer(user or self.operator),
        )


class AccessTests(AllocationTestCase):
    def test_authentication_required(self):
        res = self.client_.post(allocate_url(self.company.id, self.plan.id), data=json.dumps({"expected_version": 1}), content_type="application/json")
        self.assertEqual(res.status_code, 401)

    def test_no_membership_404_no_bypass(self):
        outsider = make_user("outsider")
        self.assertEqual(self.allocate(user=outsider).status_code, 404)
        self.assertEqual(self.allocate(user=self.superuser).status_code, 404)

    def test_view_only_cannot_allocate(self):
        viewer = make_user("viewer")
        grant(self.superuser, viewer, self.company, "batch_plans.view")
        res = self.allocate(user=viewer)
        self.assertEqual(res.status_code, 403)
        self.assertIn("batch_plans.allocate_number", res.json()["detail"])

    def test_allocate_only_without_view_still_needs_view(self):
        allocate_only = make_user("allocateonly")
        grant(self.superuser, allocate_only, self.company, "batch_plans.allocate_number")
        res = self.allocate(user=allocate_only)
        self.assertEqual(res.status_code, 403)
        self.assertIn("batch_plans.view", res.json()["detail"])

    def test_formulas_approve_not_required(self):
        """Allocation is a separate action from formula approval - a user
        with only batch_plans.view/allocate_number (no formulas.* at all)
        can allocate.
        """
        res = self.allocate()
        self.assertEqual(res.status_code, 200, res.content)

    def test_company_isolation(self):
        other_user = make_user("otheruser")
        grant(self.superuser, other_user, self.other_company, *ALL_ALLOCATE_PERMS)
        res = self.allocate(user=other_user, company_id=self.other_company.id)
        self.assertEqual(res.status_code, 404)

    def test_cross_company_plan_id_is_404(self):
        res = self.client_.post(
            allocate_url(self.other_company.id, self.plan.id), data=json.dumps({"expected_version": 1}),
            content_type="application/json", **bearer(self.operator),
        )
        self.assertEqual(res.status_code, 404)

    def test_only_post_is_supported(self):
        res = self.client_.get(allocate_url(self.company.id, self.plan.id), **bearer(self.operator))
        self.assertEqual(res.status_code, 405)

    def test_unknown_and_protected_fields_rejected(self):
        for extra in ("number", "sequence_value", "allocation_year", "client_code_snapshot", "numbered_by"):
            res = self.client_.post(
                allocate_url(self.company.id, self.plan.id),
                data=json.dumps({"expected_version": self.plan.version, extra: "x"}),
                content_type="application/json", **bearer(self.operator),
            )
            self.assertEqual(res.status_code, 400, extra)
        self.assertFalse(BatchNumberAllocation.objects.filter(batch_plan=self.plan).exists())


class AllocationBehaviorTests(AllocationTestCase):
    def test_uses_customer_code_not_operating_company_code(self):
        res = self.allocate()
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertTrue(body["official_batch_number"].startswith("GER"))
        self.assertFalse(body["official_batch_number"].startswith(self.company.code))
        self.assertNotEqual(self.customer.code, self.company.code)

    def test_sequential_numbers_same_namespace(self):
        year = bn.business_now().year % 100
        first = self.allocate().json()
        self.assertEqual(first["official_batch_number"], f"GER{year:02d}-001")
        second_plan = self.make_plan()
        second = self.allocate(plan=second_plan).json()
        self.assertEqual(second["official_batch_number"], f"GER{year:02d}-002")

    def test_new_business_year_restarts_sequence_at_one(self):
        with patch.object(bn, "business_now", return_value=datetime.datetime(2026, 12, 31, 12, 0, tzinfo=ZoneInfo("Asia/Kolkata"))):
            first = self.allocate().json()
        self.assertEqual(first["official_batch_number"], "GER26-001")
        second_plan = self.make_plan()
        with patch.object(bn, "business_now", return_value=datetime.datetime(2027, 1, 1, 0, 30, tzinfo=ZoneInfo("Asia/Kolkata"))):
            second = self.allocate(plan=second_plan).json()
        self.assertEqual(second["official_batch_number"], "GER27-001")

    def test_allocation_year_ignores_planned_manufacturing_date(self):
        update_batch_plan(
            actor=self.superuser, plan_id=self.plan.id, expected_version=1,
            data={"planned_manufacturing_date": datetime.date(2030, 6, 15)},
        )
        with patch.object(bn, "business_now", return_value=datetime.datetime(2026, 3, 1, tzinfo=ZoneInfo("Asia/Kolkata"))):
            res = self.allocate(version=2)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(res.json()["official_batch_number"].startswith("GER26-"))

    def test_business_timezone_year_boundary(self):
        """31-Dec 22:00 UTC is already 1-Jan 03:30 IST (UTC+5:30) - the
        allocation year must follow the BUSINESS time zone, never UTC.
        """
        utc_instant = datetime.datetime(2026, 12, 31, 22, 0, tzinfo=datetime.timezone.utc)
        with patch.object(bn.timezone, "now", return_value=utc_instant):
            res = self.allocate()
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(res.json()["official_batch_number"].startswith("GER27-"))

    def test_minimum_padding_and_overflow_past_999(self):
        year = bn.business_now().year
        BatchNumberSequenceCounter.objects.create(
            operating_company=self.company, client_code_snapshot="GER", allocation_year=year, last_sequence=999,
        )
        res = self.allocate()
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["official_batch_number"], f"GER{year % 100:02d}-1000")

    def test_invalid_customer_code_rejected(self):
        Customer.objects.filter(pk=self.customer.id).update(code="GE R")  # bypasses model validation deliberately
        res = self.allocate()
        self.assertEqual(res.status_code, 400)
        self.assertIn("cannot safely form an official batch number", str(res.json()))
        self.assertFalse(BatchNumberAllocation.objects.filter(batch_plan=self.plan).exists())

    def test_customer_code_never_silently_stripped(self):
        Customer.objects.filter(pk=self.customer.id).update(code="GE/R")
        self.allocate()
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.code, "GE/R")  # unchanged, not rewritten

    def test_existing_unnumbered_plans_unaffected(self):
        other_plan = self.make_plan()
        det = self.client_.get(plan_url(self.company.id, other_plan.id), **bearer(self.operator))
        self.assertEqual(det.status_code, 200)
        self.assertIsNone(det.json()["official_batch_number"])
        self.assertIsNone(det.json()["numbered_by_id"])
        self.assertIsNone(det.json()["numbered_at"])

    def test_list_and_detail_show_number_when_present(self):
        allocated = self.allocate().json()
        det = self.client_.get(plan_url(self.company.id, self.plan.id), **bearer(self.operator))
        self.assertEqual(det.json()["official_batch_number"], allocated["official_batch_number"])
        self.assertEqual(det.json()["numbered_by_id"], self.operator.id)
        self.assertIsNotNone(det.json()["numbered_at"])
        listing = self.client_.get(plans_url(self.company.id), **bearer(self.operator))
        row = [r for r in listing.json()["results"] if r["id"] == self.plan.id][0]
        self.assertEqual(row["official_batch_number"], allocated["official_batch_number"])

    def test_stale_expected_version_409(self):
        res = self.allocate(version=999)
        self.assertEqual(res.status_code, 409)
        self.assertFalse(BatchNumberAllocation.objects.filter(batch_plan=self.plan).exists())

    def test_authorized_repeat_at_current_version_is_a_noop(self):
        first = self.allocate().json()
        audit_before = AuditLog.objects.filter(action="batch_plan.number_allocated").count()
        second = self.allocate(version=first["version"])
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json()["official_batch_number"], first["official_batch_number"])
        self.assertEqual(second.json()["version"], first["version"])
        self.assertEqual(AuditLog.objects.filter(action="batch_plan.number_allocated").count(), audit_before)
        self.assertEqual(BatchNumberSequenceCounter.objects.get(operating_company=self.company, client_code_snapshot="GER").last_sequence, 1)

    def test_repeat_at_stale_pre_allocation_version_is_409(self):
        first = self.allocate().json()
        # the version the client read BEFORE allocation is now stale
        res = self.allocate(version=1)
        self.assertEqual(res.status_code, 409)

    def test_number_immutable_after_customer_code_change(self):
        first = self.allocate().json()
        Customer.objects.filter(pk=self.customer.id).update(code="XYZ")
        stored = BatchNumberAllocation.objects.get(batch_plan=self.plan)
        self.assertEqual(stored.number, first["official_batch_number"])
        self.assertTrue(stored.number.startswith("GER"))

    def test_number_immutable_after_planned_date_change(self):
        first = self.allocate().json()
        update_batch_plan(
            actor=self.superuser, plan_id=self.plan.id, expected_version=first["version"],
            data={"planned_manufacturing_date": datetime.date(2031, 1, 1)},
        )
        stored = BatchNumberAllocation.objects.get(batch_plan=self.plan)
        self.assertEqual(stored.number, first["official_batch_number"])

    def test_model_level_immutability_and_no_delete(self):
        self.allocate()
        allocation = BatchNumberAllocation.objects.get(batch_plan=self.plan)
        allocation.number = "HACKED-001"
        with self.assertRaises(DjangoValidationError):
            allocation.save()
        with self.assertRaises(DjangoValidationError):
            allocation.delete()

    def test_no_lifecycle_or_edit_routes_exist(self):
        from django.urls import NoReverseMatch, reverse

        for name in ("batch-plan-unnumber", "batch-plan-number-edit", "batch-plan-cancel-number"):
            with self.assertRaises(NoReverseMatch):
                reverse(name, kwargs={"company_id": self.company.id, "plan_id": self.plan.id})

    def test_different_namespace_same_client_code_across_companies_share_no_sequence(self):
        """Two DIFFERENT operating companies whose customers happen to
        share a client code get their OWN independent sequence, and can
        legitimately produce the identical displayed number.
        """
        other_customer = make_customer(self.other_company, self.superuser, "GER")
        other_product = make_product(self.other_company, self.unit_count, self.superuser)
        other_order = create_sales_order(
            actor=self.superuser, company=self.other_company, customer_id=other_customer.id, currency="INR",
            order_date=datetime.date(2026, 10, 1),
            lines=[{"product_id": other_product.id, "quantity": Decimal("10"), "unit_price": Decimal("1")}],
        )
        other_line = other_order.lines.first()
        other_formula = Formula.objects.create(
            company=self.other_company, product=other_product, code="F-OTH", name="Other",
            latest_revision_number=1, created_by=self.superuser,
        )
        other_revision = FormulaRevision.objects.create(
            formula=other_formula, revision_number=1, status=FormulaRevision.Status.DRAFT,
            base_output_quantity=Decimal("10.000"), output_uom=self.unit_count, created_by=self.superuser,
        )
        approve_revision_directly(other_revision, self.superuser)
        other_plan = create_batch_plan(
            actor=self.superuser, company=self.other_company, sales_order_line_id=other_line.id,
            formula_revision_id=other_revision.id, target_output_quantity="5",
        )
        other_operator = make_user("otherop")
        grant(self.superuser, other_operator, self.other_company, *ALL_ALLOCATE_PERMS)

        mine = self.allocate().json()
        theirs = self.allocate(plan=other_plan, user=other_operator, company_id=self.other_company.id).json()
        self.assertEqual(mine["official_batch_number"], theirs["official_batch_number"])
        self.assertEqual(
            BatchNumberSequenceCounter.objects.filter(client_code_snapshot="GER").count(), 2
        )  # one counter row PER operating company

    def test_different_customer_code_gets_own_sequence(self):
        second_plan = self.make_plan()
        update_sales_order(
            actor=self.superuser, sales_order_id=self.order.id, expected_version=self.order.version,
            data={},
        )  # no-op, just to confirm order unaffected before the real change below
        other_customer = make_customer(self.company, self.superuser, "USA")
        other_product = make_product(self.company, self.unit_count, self.superuser)
        other_order = create_sales_order(
            actor=self.superuser, company=self.company, customer_id=other_customer.id, currency="INR",
            order_date=datetime.date(2026, 10, 1),
            lines=[{"product_id": other_product.id, "quantity": Decimal("10"), "unit_price": Decimal("1")}],
        )
        other_formula = Formula.objects.create(
            company=self.company, product=other_product, code="F-USA", name="USA",
            latest_revision_number=1, created_by=self.superuser,
        )
        other_revision = FormulaRevision.objects.create(
            formula=other_formula, revision_number=1, status=FormulaRevision.Status.DRAFT,
            base_output_quantity=Decimal("10.000"), output_uom=self.unit_count, created_by=self.superuser,
        )
        approve_revision_directly(other_revision, self.superuser)
        other_plan = create_batch_plan(
            actor=self.superuser, company=self.company, sales_order_line_id=other_order.lines.first().id,
            formula_revision_id=other_revision.id, target_output_quantity="3",
        )
        first = self.allocate().json()
        other = self.allocate(plan=other_plan).json()
        self.assertTrue(first["official_batch_number"].startswith("GER"))
        self.assertTrue(other["official_batch_number"].startswith("USA"))
        self.assertTrue(other["official_batch_number"].endswith("-001"))

    def test_audit_records_number_and_context(self):
        body = self.allocate().json()
        entry = AuditLog.objects.get(action="batch_plan.number_allocated", target_id=self.plan.id)
        self.assertEqual(entry.company_id, self.company.id)
        self.assertEqual(entry.after["number"], body["official_batch_number"])
        self.assertEqual(entry.after["numbered_by_id"], self.operator.id)
        self.assertIn("allocation_timezone", entry.after)

    def test_audit_rollback_leaves_counter_and_plan_unchanged(self):
        with patch("apps.batch_plans.numbering.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.allocate()
        self.assertFalse(BatchNumberAllocation.objects.filter(batch_plan=self.plan).exists())
        self.assertFalse(BatchNumberSequenceCounter.objects.filter(operating_company=self.company).exists())
        stored = BatchPlan.objects.get(pk=self.plan.id)
        self.assertEqual(stored.version, 1)

    def test_no_stock_order_or_formula_side_effects(self):
        order_before = (self.order.version, self.order.status)
        formula_before = self.formula.version
        revision_before = (self.revision.status, self.revision.version)
        plan_before_status = self.plan.status
        self.allocate()
        self.order.refresh_from_db()
        self.formula.refresh_from_db()
        self.revision.refresh_from_db()
        stored_plan = BatchPlan.objects.get(pk=self.plan.id)
        self.assertEqual((self.order.version, self.order.status), order_before)
        self.assertEqual(self.formula.version, formula_before)
        self.assertEqual((self.revision.status, self.revision.version), revision_before)
        self.assertEqual(stored_plan.status, plan_before_status)  # still DRAFT
        self.assertEqual(stored_plan.status, "DRAFT")

    def test_plan_version_bumps_exactly_once(self):
        res = self.allocate()
        self.assertEqual(res.json()["version"], 2)
        stored = BatchPlan.objects.get(pk=self.plan.id)
        self.assertEqual(stored.version, 2)


class ConcurrencyTests(TransactionTestCase):
    serialized_rollback = True

    def _setup(self, suffix, code="GER"):
        superuser = make_superuser(f"cadmin{suffix}")
        operator = make_user(f"coperator{suffix}")
        company = make_company(f"CC{suffix}")
        unit = make_unit(f"CCU{suffix}", UnitOfMeasure.Dimension.COUNT)
        product = make_product(company, unit, superuser)
        customer = make_customer(company, superuser, code)
        grant(superuser, operator, company, *ALL_ALLOCATE_PERMS)
        order = create_sales_order(
            actor=superuser, company=company, customer_id=customer.id, currency="INR",
            order_date=datetime.date(2026, 10, 1),
            lines=[{"product_id": product.id, "quantity": Decimal("10"), "unit_price": Decimal("1")}],
        )
        line = order.lines.first()
        formula = Formula.objects.create(
            company=company, product=product, code="F1", name="F", latest_revision_number=1, created_by=superuser,
        )
        revision = FormulaRevision.objects.create(
            formula=formula, revision_number=1, status=FormulaRevision.Status.DRAFT,
            base_output_quantity=Decimal("10.000"), output_uom=unit, created_by=superuser,
        )
        approve_revision_directly(revision, superuser)
        plan = create_batch_plan(
            actor=superuser, company=company, sales_order_line_id=line.id, formula_revision_id=revision.id,
            target_output_quantity="5",
        )
        return dict(superuser=superuser, operator=operator, company=company, customer=customer, order=order, plan=plan)

    def test_two_different_plans_same_namespace_get_distinct_sequential_numbers(self):
        ctx = self._setup("A")
        plan2 = create_batch_plan(
            actor=ctx["superuser"], company=ctx["company"], sales_order_line_id=ctx["order"].lines.first().id,
            formula_revision_id=ctx["plan"].formula_revision_id, target_output_quantity="1",
        )
        results = {}
        barrier = threading.Barrier(2)

        def call(plan, key):
            from apps.batch_plans.numbering import allocate_batch_number

            def run():
                try:
                    barrier.wait(timeout=5)
                    _, allocation = allocate_batch_number(
                        actor=ctx["operator"], company_id=ctx["company"].id, plan_id=plan.id, expected_version=1,
                    )
                    results[key] = allocation.number
                finally:
                    connection.close()

            return run

        threads = [threading.Thread(target=call(ctx["plan"], "a")), threading.Thread(target=call(plan2, "b"))]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        self.assertEqual(sorted(results.values()), sorted([results["a"], results["b"]]))
        self.assertNotEqual(results["a"], results["b"])
        suffixes = {results["a"][-3:], results["b"][-3:]}
        self.assertEqual(suffixes, {"001", "002"})

    def test_concurrent_first_allocation_creates_exactly_one_counter_row(self):
        ctx = self._setup("B")
        plan2 = create_batch_plan(
            actor=ctx["superuser"], company=ctx["company"], sales_order_line_id=ctx["order"].lines.first().id,
            formula_revision_id=ctx["plan"].formula_revision_id, target_output_quantity="1",
        )
        results = {}
        barrier = threading.Barrier(2)

        def call(plan, key):
            from apps.batch_plans.numbering import allocate_batch_number

            def run():
                try:
                    barrier.wait(timeout=5)
                    allocate_batch_number(
                        actor=ctx["operator"], company_id=ctx["company"].id, plan_id=plan.id, expected_version=1,
                    )
                    results[key] = "ok"
                except Exception as exc:  # noqa: BLE001
                    results[key] = exc
                finally:
                    connection.close()

            return run

        threads = [threading.Thread(target=call(ctx["plan"], "a")), threading.Thread(target=call(plan2, "b"))]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        self.assertEqual(results, {"a": "ok", "b": "ok"})
        self.assertEqual(
            BatchNumberSequenceCounter.objects.filter(operating_company=ctx["company"], client_code_snapshot="GER").count(), 1
        )

    def test_two_callers_allocating_the_same_plan_only_one_draws_a_sequence(self):
        ctx = self._setup("C")
        results = {}
        barrier = threading.Barrier(2)

        def caller(key):
            from apps.batch_plans.numbering import allocate_batch_number

            def run():
                try:
                    barrier.wait(timeout=5)
                    _, allocation = allocate_batch_number(
                        actor=ctx["operator"], company_id=ctx["company"].id, plan_id=ctx["plan"].id, expected_version=1,
                    )
                    results[key] = allocation.number
                except Conflict:
                    results[key] = "conflict"
                except Exception as exc:  # noqa: BLE001
                    results[key] = exc
                finally:
                    connection.close()

            return run

        threads = [threading.Thread(target=caller("a")), threading.Thread(target=caller("b"))]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        outcomes = list(results.values())
        winners = [v for v in outcomes if v != "conflict" and not isinstance(v, Exception)]
        self.assertEqual(len(winners), 1, results)
        self.assertIn("conflict", outcomes, results)
        self.assertEqual(BatchNumberAllocation.objects.filter(batch_plan=ctx["plan"]).count(), 1)

    def test_order_customer_change_waits_for_in_flight_allocation(self):
        ctx = self._setup("D")
        inside, release, results = threading.Event(), threading.Event(), {}
        from apps.batch_plans import numbering as numbering_module

        original = numbering_module._validate_client_code

        def paused(code):
            inside.set()
            release.wait(timeout=20)
            return original(code)

        def allocate():
            try:
                with patch.object(numbering_module, "_validate_client_code", side_effect=paused):
                    numbering_module.allocate_batch_number(
                        actor=ctx["operator"], company_id=ctx["company"].id, plan_id=ctx["plan"].id, expected_version=1,
                    )
                results["allocate"] = "ok"
            except Exception as exc:  # noqa: BLE001
                results["allocate"] = exc
            finally:
                connection.close()

        allocating = threading.Thread(target=allocate)
        allocating.start()
        self.assertTrue(inside.wait(timeout=20))

        def change_customer():
            try:
                other_customer = make_customer(ctx["company"], ctx["superuser"], "USA")
                update_sales_order(
                    actor=ctx["superuser"], sales_order_id=ctx["order"].id, expected_version=1,
                    data={"customer_id": other_customer.id},
                )
                results["change"] = "ok"
            except Exception as exc:  # noqa: BLE001
                results["change"] = exc
            finally:
                connection.close()

        thread = threading.Thread(target=change_customer)
        thread.start()
        thread.join(timeout=1.5)
        self.assertTrue(thread.is_alive(), "an order-customer change must wait for the in-flight allocation's lock on the order")
        release.set()
        allocating.join(timeout=30)
        thread.join(timeout=30)
        self.assertEqual(results["allocate"], "ok")
        self.assertEqual(results["change"], "ok")
        allocation = BatchNumberAllocation.objects.get(batch_plan=ctx["plan"])
        self.assertTrue(allocation.number.startswith("GER"))  # the OLD customer's code, seen before the change committed
        ctx["order"].refresh_from_db()
        self.assertEqual(ctx["order"].customer.code, "USA")
