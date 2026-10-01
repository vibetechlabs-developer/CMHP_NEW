import datetime
import itertools
import json
import threading
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import connection
from django.test import Client, TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from apps.audit.models import AuditLog
from apps.batch_plans.models import BatchPlan
from apps.batch_plans.services import create_batch_plan
from apps.catalog.models import Material, UnitOfMeasure
from apps.common.errors import Conflict
from apps.companies.models import Company
from apps.customers.models import Customer
from apps.formulas.models import Formula, FormulaLine, FormulaRevision
from apps.permissions.services import (
    create_company_role,
    create_store_role,
    replace_role_permissions,
    replace_store_role_permissions,
)
from apps.products.models import Product
from apps.sales_orders.services import create_sales_order
from apps.store_preparation.admin import StorePreparationAdmin
from apps.store_preparation.models import StorePreparation
from apps.store_preparation.services import create_store_preparation, update_store_preparation
from apps.stores.models import SharedStore
from apps.stores.services import assign_store_membership, assign_store_membership_role
from apps.users.services import assign_company_membership, assign_membership_role

User = get_user_model()
PASSWORD = "a-strong-pass-1"
_counter = itertools.count()

STORE_PREP_ALL_PERMS = ("store_preparation.view", "store_preparation.create", "store_preparation.edit")


def preparations_url(store_id):
    return f"/api/v1/stores/{store_id}/preparations/"


def preparation_url(store_id, preparation_id):
    return f"/api/v1/stores/{store_id}/preparations/{preparation_id}/"


def make_user(prefix="user"):
    n = next(_counter)
    return User.objects.create_user(username=f"{prefix}_{n}", email=f"{prefix}_{n}@example.com", password=PASSWORD)


def make_superuser(prefix="admin"):
    n = next(_counter)
    return User.objects.create_superuser(username=f"{prefix}_{n}", email=f"{prefix}_{n}@example.com", password=PASSWORD)


def make_company(prefix="CMP"):
    n = next(_counter)
    return Company.objects.create(code=f"{prefix}{n}", legal_name=f"{prefix}{n} Pvt Ltd")


def make_store(prefix="WH"):
    n = next(_counter)
    return SharedStore.objects.create(code=f"{prefix}{n}", name=f"{prefix}{n} Store")


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


def make_customer(company, actor, prefix="CUST"):
    n = next(_counter)
    return Customer.objects.create(company=company, code=f"{prefix}{n}", name=f"{prefix}{n} Customer", created_by=actor)


def bearer(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


def grant_company_permission(actor, user, company, *codes):
    membership, _ = assign_company_membership(actor=actor, user=user, company=company)
    if codes:
        role = create_company_role(actor=actor, company=company, code=f"CROLE{user.id}{company.id}", name="Role")
        replace_role_permissions(actor=actor, role=role, permission_codes=list(codes))
        assign_membership_role(actor=actor, membership=membership, role=role)
    return membership


def grant_store_permission(actor, user, store, *codes):
    membership, _ = assign_store_membership(actor=actor, user=user, store=store)
    if codes:
        role = create_store_role(actor=actor, store=store, code=f"SROLE{user.id}{store.id}", name="Role")
        replace_store_role_permissions(actor=actor, role=role, permission_codes=list(codes))
        assign_store_membership_role(actor=actor, membership=membership, role=role)
    return membership


def approve_revision_directly(revision, approver):
    """Test-only shortcut mirroring tests.test_batch_plans's own helper -
    flips an already-lined DRAFT revision to APPROVED without the full
    policy-gated service (exercised for real in tests.test_formula_approval).
    """
    revision.status = FormulaRevision.Status.APPROVED
    revision.approved_by = approver
    revision.approved_at = timezone.now()
    revision.approval_policy_version = 1
    revision.approval_policy_snapshot = {"allow_self_approval": True}
    revision.save()
    return revision


class StorePreparationTestCase(TestCase):
    """One shared store used by two operating companies - the same
    two-companies-one-store shape every prior store-scoped module (Task
    09A receiving, Task 09B QC) in this project already exercises.
    """

    def setUp(self):
        self.superuser = make_superuser("spadmin")
        self.company = make_company("ALF")
        self.other_company = make_company("BET")
        self.store = make_store("MAINWH")
        self.other_store = make_store("SIDEWH")

        self.unit_count = make_unit("BTL", UnitOfMeasure.Dimension.COUNT)
        self.mass_unit = make_unit("KG", UnitOfMeasure.Dimension.MASS)
        self.customer = make_customer(self.company, self.superuser)
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

        self.operator = make_user("prepop")
        grant_company_permission(self.superuser, self.operator, self.company, "batch_plans.view")
        grant_store_permission(self.superuser, self.operator, self.store, *STORE_PREP_ALL_PERMS)
        self.client_ = Client()

    def create_preparation(self, user=None, store_id=None, **overrides):
        payload = {"batch_plan_id": self.plan.id, "packing_type": "25 Gm G2", "insert_required": False}
        payload.update(overrides)
        return self.client_.post(
            preparations_url(store_id or self.store.id), data=json.dumps(payload), content_type="application/json",
            **bearer(user or self.operator),
        )


class AccessTests(StorePreparationTestCase):
    def test_authentication_required(self):
        self.assertEqual(self.client_.get(preparations_url(self.store.id)).status_code, 401)
        res = self.client_.post(
            preparations_url(self.store.id), data=json.dumps({"batch_plan_id": self.plan.id}), content_type="application/json"
        )
        self.assertEqual(res.status_code, 401)

    def test_no_store_membership_is_404_no_bypass(self):
        outsider = make_user("outsider")
        self.assertEqual(self.client_.get(preparations_url(self.store.id), **bearer(outsider)).status_code, 404)
        res = self.create_preparation(user=outsider)
        self.assertEqual(res.status_code, 404)
        # active superuser gets no operational bypass either
        self.assertEqual(self.client_.get(preparations_url(self.store.id), **bearer(self.superuser)).status_code, 404)

    def test_store_permission_required(self):
        viewer = make_user("storeviewer")
        grant_company_permission(self.superuser, viewer, self.company, "batch_plans.view")
        grant_store_permission(self.superuser, viewer, self.store, "store_preparation.view")
        res = self.create_preparation(user=viewer)
        self.assertEqual(res.status_code, 403)
        self.assertIn("store_preparation.create", res.json()["detail"])

        no_perms = make_user("nostoreperm")
        grant_company_permission(self.superuser, no_perms, self.company, "batch_plans.view")
        grant_store_permission(self.superuser, no_perms, self.store)
        res2 = self.client_.get(preparations_url(self.store.id), **bearer(no_perms))
        self.assertEqual(res2.status_code, 403)
        self.assertIn("store_preparation.view", res2.json()["detail"])

    def test_batch_plans_view_required_in_the_plan_company(self):
        """The dual-context rule: store access is not enough - the caller
        must ALSO hold `batch_plans.view` in the plan's own company.
        """
        store_only = make_user("storeonly")
        grant_store_permission(self.superuser, store_only, self.store, *STORE_PREP_ALL_PERMS)
        res = self.create_preparation(user=store_only)
        self.assertEqual(res.status_code, 404)
        self.assertIn("Batch plan not found", res.json()["detail"])

    def test_inactive_company_membership_blocks_access(self):
        prep = create_store_preparation(actor=self.operator, store=self.store, batch_plan=self.plan)
        from apps.companies.models import CompanyMembership

        CompanyMembership.objects.filter(user=self.operator, company=self.company).update(is_active=False)
        res = self.client_.get(preparation_url(self.store.id, prep.id), **bearer(self.operator))
        self.assertEqual(res.status_code, 404)

    def test_inactive_store_blocks_access(self):
        self.store.is_active = False
        self.store.save(update_fields=["is_active"])
        self.assertEqual(self.client_.get(preparations_url(self.store.id), **bearer(self.operator)).status_code, 404)

    def test_company_isolation_list_filtering(self):
        """A preparation in a DIFFERENT operating company sharing the same
        store must never appear to a caller without batch_plans.view there.
        """
        other_product = make_product(self.other_company, self.unit_count, self.superuser)
        other_customer = make_customer(self.other_company, self.superuser)
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
        create_store_preparation(actor=self.superuser, store=self.store, batch_plan=other_plan)
        create_store_preparation(actor=self.operator, store=self.store, batch_plan=self.plan)

        listing = self.client_.get(preparations_url(self.store.id), **bearer(self.operator))
        self.assertEqual(listing.status_code, 200)
        plan_ids = {row["batch_plan_id"] for row in listing.json()["results"]}
        self.assertEqual(plan_ids, {self.plan.id})

    def test_source_batch_plan_must_be_visible_batch_plans_view(self):
        no_view = make_user("noview")
        grant_company_permission(self.superuser, no_view, self.company)  # membership, no permission
        grant_store_permission(self.superuser, no_view, self.store, *STORE_PREP_ALL_PERMS)
        res = self.create_preparation(user=no_view)
        self.assertEqual(res.status_code, 404)


class CreateTests(StorePreparationTestCase):
    def test_create_success_and_no_formula_or_pricing_leakage(self):
        res = self.create_preparation()
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertEqual(body["batch_plan_id"], self.plan.id)
        self.assertEqual(body["company_id"], self.company.id)
        self.assertEqual(body["store_id"], self.store.id)
        self.assertEqual(body["packing_type"], "25 Gm G2")
        self.assertFalse(body["insert_required"])
        self.assertEqual(body["version"], 1)
        self.assertEqual(body["plan_context"]["planning_id"], self.plan.id)
        self.assertEqual(body["plan_context"]["order_reference"], self.order.reference)
        self.assertEqual(body["plan_context"]["product_code"], self.product.code)

        blob = json.dumps(body)
        for forbidden in ("target_output_quantity", "formula", "base_output_quantity", "unit_price", "line_amount", "material"):
            self.assertNotIn(forbidden, blob)
        self.assertNotIn("official batch", blob.lower())

    def test_create_requires_explicit_batch_plan_id_never_auto_selected(self):
        res = self.client_.post(
            preparations_url(self.store.id), data=json.dumps({"packing_type": "x"}), content_type="application/json",
            **bearer(self.operator),
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("batch_plan_id", res.json())

    def test_get_never_creates_a_record(self):
        before = StorePreparation.objects.count()
        self.client_.get(preparations_url(self.store.id), **bearer(self.operator))
        self.assertEqual(StorePreparation.objects.count(), before)

    def test_insert_required_tristate(self):
        for value, expected in ((True, True), (False, False), (None, None)):
            plan_id = self._extra_plan()
            res = self.client_.post(
                preparations_url(self.store.id),
                data=json.dumps({"batch_plan_id": plan_id, "insert_required": value}),
                content_type="application/json", **bearer(self.operator),
            )
            self.assertEqual(res.status_code, 201, (value, res.content))
            self.assertEqual(res.json()["insert_required"], expected)

    def test_insert_required_invalid_value_rejected(self):
        res = self.create_preparation(insert_required="maybe")
        self.assertEqual(res.status_code, 400)
        self.assertIn("insert_required", res.json())

    def test_packing_type_is_free_text_no_enum(self):
        res = self.create_preparation(packing_type="Whatever the store manager typed, 500ml Blister X9")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()["packing_type"], "Whatever the store manager typed, 500ml Blister X9")

    def test_duplicate_preparation_for_same_plan_rejected(self):
        first = self.create_preparation()
        self.assertEqual(first.status_code, 201)
        second = self.create_preparation()
        self.assertEqual(second.status_code, 409)
        self.assertEqual(StorePreparation.objects.filter(batch_plan=self.plan).count(), 1)

    def test_unknown_and_protected_fields_rejected(self):
        for extra in ("version", "created_by", "created_by_id", "id", "junk"):
            res = self.create_preparation(**{extra: 1})
            self.assertEqual(res.status_code, 400, extra)
        # "store_id" is deliberately NOT accepted in the body at all - the
        # store always comes from the URL (mirrors every other company/
        # store-scoped create endpoint in this project).
        payload = {"batch_plan_id": self.plan.id, "store_id": self.store.id}
        res = self.client_.post(
            preparations_url(self.store.id), data=json.dumps(payload), content_type="application/json",
            **bearer(self.operator),
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("store_id", res.json())
        self.assertEqual(StorePreparation.objects.count(), 0)

    def test_wrong_company_batch_plan_is_404(self):
        other_product = make_product(self.other_company, self.unit_count, self.superuser)
        other_customer = make_customer(self.other_company, self.superuser)
        other_order = create_sales_order(
            actor=self.superuser, company=self.other_company, customer_id=other_customer.id, currency="INR",
            order_date=datetime.date(2026, 10, 1),
            lines=[{"product_id": other_product.id, "quantity": Decimal("10"), "unit_price": Decimal("1")}],
        )
        other_line = other_order.lines.first()
        other_formula = Formula.objects.create(
            company=self.other_company, product=other_product, code="F-OTH2", name="Other2",
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
        res = self.create_preparation(batch_plan_id=other_plan.id)
        self.assertEqual(res.status_code, 404)

    def test_nonexistent_batch_plan_is_404(self):
        res = self.create_preparation(batch_plan_id=999999)
        self.assertEqual(res.status_code, 404)

    def test_audit_records_both_company_and_store_context(self):
        res = self.create_preparation()
        prep_id = res.json()["id"]
        entry = AuditLog.objects.get(target_type="store_preparation", target_id=prep_id, action="store_preparation.created")
        self.assertEqual(entry.company_id, self.company.id)
        self.assertEqual(entry.store_id, self.store.id)
        self.assertEqual(entry.after["packing_type"], "25 Gm G2")

    def test_audit_rollback_on_failure(self):
        with patch("apps.store_preparation.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.create_preparation()
        self.assertEqual(StorePreparation.objects.count(), 0)

    def test_creation_never_mutates_the_batch_plan(self):
        before = (self.plan.version, self.plan.target_output_quantity, self.plan.updated_at)
        self.create_preparation()
        self.plan.refresh_from_db()
        after = (self.plan.version, self.plan.target_output_quantity, self.plan.updated_at)
        self.assertEqual(before, after)

    def test_packing_size_note_on_batch_plan_is_unaffected(self):
        """Packing Size (BatchPlan.packing_size_note) and Packing Type
        (StorePreparation.packing_type) are separate fields."""
        self.plan.packing_size_note = "25 Gms"
        self.plan.save(update_fields=["packing_size_note"])
        self.create_preparation(packing_type="25 Gm G2")
        self.plan.refresh_from_db()
        self.assertEqual(self.plan.packing_size_note, "25 Gms")

    def _extra_plan(self):
        formula = Formula.objects.create(
            company=self.company, product=self.product, code=f"F-{next(_counter)}", name="Extra",
            latest_revision_number=1, created_by=self.superuser,
        )
        revision = FormulaRevision.objects.create(
            formula=formula, revision_number=1, status=FormulaRevision.Status.DRAFT,
            base_output_quantity=Decimal("10.000"), output_uom=self.unit_count, created_by=self.superuser,
        )
        approve_revision_directly(revision, self.superuser)
        plan = create_batch_plan(
            actor=self.superuser, company=self.company, sales_order_line_id=self.line.id,
            formula_revision_id=revision.id, target_output_quantity="5",
        )
        return plan.id


class UpdateTests(StorePreparationTestCase):
    def setUp(self):
        super().setUp()
        self.prep = create_store_preparation(actor=self.operator, store=self.store, batch_plan=self.plan)

    def test_update_success_bumps_version_and_audits(self):
        res = self.client_.patch(
            preparation_url(self.store.id, self.prep.id),
            data=json.dumps({"expected_version": 1, "packing_type": "New Type", "insert_required": True}),
            content_type="application/json", **bearer(self.operator),
        )
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual((body["packing_type"], body["insert_required"], body["version"]), ("New Type", True, 2))
        entry = AuditLog.objects.filter(target_type="store_preparation", action="store_preparation.updated").latest("id")
        self.assertEqual(entry.before["packing_type"], "")
        self.assertEqual(entry.after["packing_type"], "New Type")

    def test_requires_expected_version(self):
        res = self.client_.patch(
            preparation_url(self.store.id, self.prep.id), data=json.dumps({"packing_type": "x"}),
            content_type="application/json", **bearer(self.operator),
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("expected_version", res.json())

    def test_stale_version_409(self):
        self.client_.patch(
            preparation_url(self.store.id, self.prep.id), data=json.dumps({"expected_version": 1, "packing_type": "A"}),
            content_type="application/json", **bearer(self.operator),
        )
        res = self.client_.patch(
            preparation_url(self.store.id, self.prep.id), data=json.dumps({"expected_version": 1, "packing_type": "B"}),
            content_type="application/json", **bearer(self.operator),
        )
        self.assertEqual(res.status_code, 409)

    def test_noop_does_not_bump_version_or_audit(self):
        audit_before = AuditLog.objects.filter(action="store_preparation.updated").count()
        res = self.client_.patch(
            preparation_url(self.store.id, self.prep.id), data=json.dumps({"expected_version": 1, "packing_type": ""}),
            content_type="application/json", **bearer(self.operator),
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["version"], 1)
        self.assertEqual(AuditLog.objects.filter(action="store_preparation.updated").count(), audit_before)

    def test_whitespace_only_change_is_noop(self):
        self.client_.patch(
            preparation_url(self.store.id, self.prep.id), data=json.dumps({"expected_version": 1, "packing_type": "  Padded  "}),
            content_type="application/json", **bearer(self.operator),
        )
        audit_before = AuditLog.objects.filter(action="store_preparation.updated").count()
        res = self.client_.patch(
            preparation_url(self.store.id, self.prep.id), data=json.dumps({"expected_version": 2, "packing_type": "Padded"}),
            content_type="application/json", **bearer(self.operator),
        )
        self.assertEqual(res.json()["version"], 2)
        self.assertEqual(AuditLog.objects.filter(action="store_preparation.updated").count(), audit_before)

    def test_reset_insert_required_to_null(self):
        self.client_.patch(
            preparation_url(self.store.id, self.prep.id), data=json.dumps({"expected_version": 1, "insert_required": True}),
            content_type="application/json", **bearer(self.operator),
        )
        res = self.client_.patch(
            preparation_url(self.store.id, self.prep.id), data=json.dumps({"expected_version": 2, "insert_required": None}),
            content_type="application/json", **bearer(self.operator),
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertIsNone(res.json()["insert_required"])

    def test_invalid_insert_required_value(self):
        res = self.client_.patch(
            preparation_url(self.store.id, self.prep.id), data=json.dumps({"expected_version": 1, "insert_required": "N/A"}),
            content_type="application/json", **bearer(self.operator),
        )
        self.assertEqual(res.status_code, 400)

    def test_unknown_and_protected_fields_rejected(self):
        for field in ("batch_plan_id", "store_id", "version", "junk"):
            res = self.client_.patch(
                preparation_url(self.store.id, self.prep.id),
                data=json.dumps({"expected_version": 1, field: 1}), content_type="application/json",
                **bearer(self.operator),
            )
            self.assertEqual(res.status_code, 400, field)
        self.assertEqual(StorePreparation.objects.get(pk=self.prep.id).version, 1)

    def test_edit_permission_required_separately_from_view(self):
        viewer = make_user("editcheck")
        grant_company_permission(self.superuser, viewer, self.company, "batch_plans.view")
        grant_store_permission(self.superuser, viewer, self.store, "store_preparation.view")
        res = self.client_.patch(
            preparation_url(self.store.id, self.prep.id), data=json.dumps({"expected_version": 1, "packing_type": "x"}),
            content_type="application/json", **bearer(viewer),
        )
        self.assertEqual(res.status_code, 403)
        self.assertIn("store_preparation.edit", res.json()["detail"])

    def test_update_audit_rollback_on_failure(self):
        with patch("apps.store_preparation.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.client_.patch(
                    preparation_url(self.store.id, self.prep.id),
                    data=json.dumps({"expected_version": 1, "packing_type": "Should not persist"}),
                    content_type="application/json", **bearer(self.operator),
                )
        stored = StorePreparation.objects.get(pk=self.prep.id)
        self.assertEqual((stored.version, stored.packing_type), (1, ""))

    def test_update_never_mutates_batch_plan(self):
        before = (self.plan.version, self.plan.target_output_quantity)
        self.client_.patch(
            preparation_url(self.store.id, self.prep.id), data=json.dumps({"expected_version": 1, "packing_type": "changed"}),
            content_type="application/json", **bearer(self.operator),
        )
        self.plan.refresh_from_db()
        self.assertEqual((self.plan.version, self.plan.target_output_quantity), before)

    def test_batch_plan_and_store_are_immutable(self):
        # Passing them through the service's `data` dict is harmless - only
        # `PREPARATION_TRACKED_FIELDS` (packing_type/insert_required) are
        # ever applied; the API's own protection is the serializer's
        # allow-list (test_unknown_and_protected_fields_rejected above).
        # The model itself is the second, defended-again layer:
        prep = StorePreparation.objects.get(pk=self.prep.id)
        prep.store = self.other_store
        with self.assertRaises(DjangoValidationError):
            prep.save()
        prep.refresh_from_db()
        prep.batch_plan_id = self._extra_plan()
        with self.assertRaises(DjangoValidationError):
            prep.save()

    def _extra_plan(self):
        formula = Formula.objects.create(
            company=self.company, product=self.product, code=f"F-{next(_counter)}", name="Extra",
            latest_revision_number=1, created_by=self.superuser,
        )
        revision = FormulaRevision.objects.create(
            formula=formula, revision_number=1, status=FormulaRevision.Status.DRAFT,
            base_output_quantity=Decimal("10.000"), output_uom=self.unit_count, created_by=self.superuser,
        )
        approve_revision_directly(revision, self.superuser)
        plan = create_batch_plan(
            actor=self.superuser, company=self.company, sales_order_line_id=self.line.id,
            formula_revision_id=revision.id, target_output_quantity="5",
        )
        return plan.id


class ReadOnlyAndUnsupportedMethodTests(StorePreparationTestCase):
    def setUp(self):
        super().setUp()
        self.prep = create_store_preparation(actor=self.operator, store=self.store, batch_plan=self.plan)

    def test_get_causes_no_writes(self):
        before = (
            AuditLog.objects.count(),
            StorePreparation.objects.get(pk=self.prep.id).version,
            StorePreparation.objects.get(pk=self.prep.id).updated_at,
        )
        self.client_.get(preparation_url(self.store.id, self.prep.id), **bearer(self.operator))
        self.client_.get(preparations_url(self.store.id), **bearer(self.operator))
        after = (
            AuditLog.objects.count(),
            StorePreparation.objects.get(pk=self.prep.id).version,
            StorePreparation.objects.get(pk=self.prep.id).updated_at,
        )
        self.assertEqual(before, after)

    def test_delete_unsupported(self):
        self.assertEqual(self.client_.delete(preparation_url(self.store.id, self.prep.id), **bearer(self.operator)).status_code, 405)
        self.assertEqual(self.client_.delete(preparations_url(self.store.id), **bearer(self.operator)).status_code, 405)

    def test_no_lifecycle_routes_exist(self):
        from django.urls import NoReverseMatch, reverse

        for name in ("store-preparation-submit", "store-preparation-approve", "store-preparation-issue"):
            with self.assertRaises(NoReverseMatch):
                reverse(name, kwargs={"store_id": self.store.id, "preparation_id": 1})

    def test_model_delete_blocked(self):
        with self.assertRaises(DjangoValidationError):
            self.prep.delete()
        self.assertTrue(StorePreparation.objects.filter(pk=self.prep.id).exists())

    def test_filter_by_batch_plan(self):
        res = self.client_.get(f"{preparations_url(self.store.id)}?batch_plan={self.plan.id}", **bearer(self.operator))
        self.assertEqual(res.status_code, 200)
        self.assertEqual([r["id"] for r in res.json()["results"]], [self.prep.id])

    def test_unknown_query_param_rejected(self):
        res = self.client_.get(f"{preparations_url(self.store.id)}?bogus=1", **bearer(self.operator))
        self.assertEqual(res.status_code, 400)

    def test_pagination_envelope_and_deterministic_ordering(self):
        res = self.client_.get(preparations_url(self.store.id), **bearer(self.operator))
        body = res.json()
        self.assertIn("results", body)
        self.assertIn("count", body)

    def test_admin_read_only(self):
        from django.test import RequestFactory

        request = RequestFactory().get("/")
        request.user = self.superuser
        model_admin = StorePreparationAdmin(StorePreparation, __import__("django.contrib.admin", fromlist=["site"]).site)
        self.assertFalse(model_admin.has_add_permission(request))
        self.assertFalse(model_admin.has_change_permission(request))
        self.assertFalse(model_admin.has_delete_permission(request))


class ConcurrencyTests(TransactionTestCase):
    serialized_rollback = True

    def _setup(self, suffix):
        superuser = make_superuser(f"cadmin{suffix}")
        operator = make_user(f"coperator{suffix}")
        company = make_company(f"CC{suffix}")
        store = make_store(f"CCWH{suffix}")
        unit = make_unit(f"CCU{suffix}", UnitOfMeasure.Dimension.COUNT)
        product = make_product(company, unit, superuser)
        customer = make_customer(company, superuser)
        grant_company_permission(superuser, operator, company, "batch_plans.view")
        grant_store_permission(superuser, operator, store, *STORE_PREP_ALL_PERMS)
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
        return dict(superuser=superuser, operator=operator, company=company, store=store, plan=plan)

    def test_concurrent_duplicate_creation_has_one_winner(self):
        ctx = self._setup("A")
        outcomes = []
        barrier = threading.Barrier(2)

        def create():
            try:
                barrier.wait(timeout=5)
                create_store_preparation(actor=ctx["operator"], store=ctx["store"], batch_plan=ctx["plan"])
                outcomes.append("ok")
            except Conflict:
                outcomes.append("conflict")
            finally:
                connection.close()

        threads = [threading.Thread(target=create), threading.Thread(target=create)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        self.assertEqual(sorted(outcomes), ["conflict", "ok"])
        self.assertEqual(StorePreparation.objects.filter(batch_plan=ctx["plan"]).count(), 1)
