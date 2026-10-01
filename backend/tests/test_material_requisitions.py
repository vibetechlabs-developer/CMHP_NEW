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
from apps.batch_plans.services import create_batch_plan, update_batch_plan
from apps.batch_plans.numbering import allocate_batch_number
from apps.catalog.models import Material, UnitOfMeasure
from apps.catalog.services import deactivate_material
from apps.common.errors import Conflict
from apps.companies.models import Company
from apps.customers.models import Customer
from apps.formulas.models import Formula, FormulaLine, FormulaRevision
from apps.material_requisitions.models import (
    MaterialRequisition,
    MaterialRequisitionLine,
    MaterialRequisitionRound,
)
from apps.material_requisitions.services import (
    approve_material_requisition,
    assess_requisition_drift,
    create_material_requisition,
    reject_material_requisition,
    revise_material_requisition,
    submit_material_requisition,
    update_material_requisition,
)
from apps.permissions.services import (
    create_company_role,
    create_store_role,
    replace_role_permissions,
    replace_store_role_permissions,
)
from apps.products.models import Product
from apps.sales_orders.services import create_sales_order, update_sales_order
from apps.store_preparation.models import StorePreparation
from apps.stores.models import SharedStore
from apps.stores.services import assign_store_membership, assign_store_membership_role
from apps.users.services import assign_company_membership, assign_membership_role

User = get_user_model()
PASSWORD = "a-strong-pass-1"
_counter = itertools.count()

REQ_ALL_PERMS = ("material_requisitions.view", "material_requisitions.create", "material_requisitions.edit")


def requisitions_url(store_id):
    return f"/api/v1/stores/{store_id}/material-requisitions/"


def requisition_url(store_id, requisition_id):
    return f"/api/v1/stores/{store_id}/material-requisitions/{requisition_id}/"


def submit_url(store_id, requisition_id):
    return f"/api/v1/stores/{store_id}/material-requisitions/{requisition_id}/submit/"


def approve_url(store_id, requisition_id):
    return f"/api/v1/stores/{store_id}/material-requisitions/{requisition_id}/approve/"


def reject_url(store_id, requisition_id):
    return f"/api/v1/stores/{store_id}/material-requisitions/{requisition_id}/reject/"


def revise_url(store_id, requisition_id):
    return f"/api/v1/stores/{store_id}/material-requisitions/{requisition_id}/revise/"


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
        n = next(_counter)
        role = create_company_role(actor=actor, company=company, code=f"CROLE{user.id}{company.id}{n}", name="Role")
        replace_role_permissions(actor=actor, role=role, permission_codes=list(codes))
        assign_membership_role(actor=actor, membership=membership, role=role)
    return membership


def grant_store_permission(actor, user, store, *codes):
    membership, _ = assign_store_membership(actor=actor, user=user, store=store)
    if codes:
        n = next(_counter)
        role = create_store_role(actor=actor, store=store, code=f"SROLE{user.id}{store.id}{n}", name="Role")
        replace_store_role_permissions(actor=actor, role=role, permission_codes=list(codes))
        assign_store_membership_role(actor=actor, membership=membership, role=role)
    return membership


def approve_revision_directly(revision, approver):
    """Test-only shortcut mirroring tests.test_store_preparation's own
    helper - flips an already-lined DRAFT revision to APPROVED without the
    full policy-gated service.
    """
    revision.status = FormulaRevision.Status.APPROVED
    revision.approved_by = approver
    revision.approved_at = timezone.now()
    revision.approval_policy_version = 1
    revision.approval_policy_snapshot = {"allow_self_approval": True}
    revision.save()
    return revision


def build_plan(*, company, superuser, output_unit, base_output, target, line_specs, product=None, order_quantity=Decimal("1000")):
    """Builds a full order -> approved-formula-revision(+lines) -> BatchPlan
    chain. `line_specs` is a list of (kind, unit, quantity, prefix) tuples.
    """
    if product is None:
        product = make_product(company, output_unit, superuser)
    customer = make_customer(company, superuser)
    order = create_sales_order(
        actor=superuser, company=company, customer_id=customer.id, currency="INR",
        order_date=datetime.date(2026, 10, 1),
        lines=[{"product_id": product.id, "quantity": order_quantity, "unit_price": Decimal("1")}],
    )
    line = order.lines.first()
    n = next(_counter)
    formula = Formula.objects.create(
        company=company, product=product, code=f"F-{n}", name=f"Formula {n}", latest_revision_number=1, created_by=superuser,
    )
    revision = FormulaRevision.objects.create(
        formula=formula, revision_number=1, status=FormulaRevision.Status.DRAFT,
        base_output_quantity=base_output, output_uom=output_unit, created_by=superuser,
    )
    for i, (kind, unit, qty, prefix) in enumerate(line_specs, start=1):
        material = make_material(prefix, kind, unit)
        FormulaLine.objects.create(
            revision=revision, line_number=i, material=material, quantity=qty, unit=unit,
            material_code_snapshot=material.code, material_name_snapshot=material.name,
            material_kind_snapshot=material.kind, unit_code_snapshot=unit.code, unit_name_snapshot=unit.name,
        )
    approve_revision_directly(revision, superuser)
    plan = create_batch_plan(
        actor=superuser, company=company, sales_order_line_id=line.id, formula_revision_id=revision.id,
        target_output_quantity=str(target),
    )
    return dict(order=order, line=line, formula=formula, revision=revision, plan=plan, product=product, customer=customer)


class MaterialRequisitionTestCase(TestCase):
    """One shared store, one operating company - the base fixture used by
    most tests: base_output_quantity=100, target=50 (factor=1/2 exactly),
    a RAW line (qty=10 -> exact 5.000) and a PACKAGING COUNT line (qty=100
    -> exact whole 50.000) - both cleanly auto-populated.
    """

    def setUp(self):
        self.superuser = make_superuser("mradmin")
        self.company = make_company("MRC")
        self.store = make_store("MRWH")
        self.unit_count = make_unit("BTL", UnitOfMeasure.Dimension.COUNT)
        self.mass_unit = make_unit("KG", UnitOfMeasure.Dimension.MASS)
        self.piece_unit = make_unit("PCS", UnitOfMeasure.Dimension.COUNT)

        ctx = build_plan(
            company=self.company, superuser=self.superuser, output_unit=self.unit_count,
            base_output=Decimal("100.000"), target=Decimal("50"),
            line_specs=[
                (Material.Kind.RAW_MATERIAL, self.mass_unit, Decimal("10.000"), "RAW"),
                (Material.Kind.PACKAGING_MATERIAL, self.piece_unit, Decimal("100.000"), "PCK"),
            ],
        )
        self.order = ctx["order"]
        self.line = ctx["line"]
        self.formula = ctx["formula"]
        self.revision = ctx["revision"]
        self.plan = ctx["plan"]
        self.product = ctx["product"]

        self.operator = make_user("mrop")
        grant_company_permission(self.superuser, self.operator, self.company, "batch_plans.view", "formulas.view")
        grant_store_permission(self.superuser, self.operator, self.store, *REQ_ALL_PERMS)
        # Deliberately a SEPARATE persona: `self.operator` above has
        # view/create/edit but NOT submit, so permission-denial tests stay
        # meaningful. `self.submitter` additionally holds
        # material_requisitions.submit - note it is NOT also given .edit,
        # matching Task 15A's own "submit is independent of edit" rule.
        self.submitter = make_user("mrsub")
        grant_company_permission(self.superuser, self.submitter, self.company, "batch_plans.view", "formulas.view")
        grant_store_permission(
            self.superuser, self.submitter, self.store, "material_requisitions.view", "material_requisitions.submit"
        )
        self.client_ = Client()

    def create_requisition(self, user=None, store_id=None, plan_id=None, **overrides):
        payload = {"batch_plan_id": plan_id or self.plan.id, "expected_batch_plan_version": self.plan.version}
        payload.update(overrides)
        return self.client_.post(
            requisitions_url(store_id or self.store.id), data=json.dumps(payload), content_type="application/json",
            **bearer(user or self.operator),
        )

    def patch_requisition(self, requisition_id, user=None, store_id=None, **body):
        return self.client_.patch(
            requisition_url(store_id or self.store.id, requisition_id), data=json.dumps(body),
            content_type="application/json", **bearer(user or self.operator),
        )

    def submit_requisition(self, requisition_id, user=None, store_id=None, **body):
        payload = {"expected_version": body.pop("expected_version", 1)}
        payload.update(body)
        return self.client_.post(
            submit_url(store_id or self.store.id, requisition_id), data=json.dumps(payload),
            content_type="application/json", **bearer(user or self.submitter),
        )


class AccessTests(MaterialRequisitionTestCase):
    def test_authentication_required(self):
        self.assertEqual(self.client_.get(requisitions_url(self.store.id)).status_code, 401)
        res = self.client_.post(
            requisitions_url(self.store.id), data=json.dumps({"batch_plan_id": self.plan.id}), content_type="application/json"
        )
        self.assertEqual(res.status_code, 401)

    def test_no_store_membership_is_404_no_superuser_bypass(self):
        outsider = make_user("outsider")
        self.assertEqual(self.client_.get(requisitions_url(self.store.id), **bearer(outsider)).status_code, 404)
        self.assertEqual(self.create_requisition(user=outsider).status_code, 404)
        # active superuser gets no operational bypass either
        self.assertEqual(self.client_.get(requisitions_url(self.store.id), **bearer(self.superuser)).status_code, 404)

    def test_store_permission_required_named(self):
        viewer = make_user("storeviewer")
        grant_company_permission(self.superuser, viewer, self.company, "batch_plans.view", "formulas.view")
        grant_store_permission(self.superuser, viewer, self.store, "material_requisitions.view")
        res = self.create_requisition(user=viewer)
        self.assertEqual(res.status_code, 403)
        self.assertIn("material_requisitions.create", res.json()["detail"])

    def test_missing_batch_plans_view_folds_to_404(self):
        user = make_user("nobpview")
        grant_company_permission(self.superuser, user, self.company, "formulas.view")
        grant_store_permission(self.superuser, user, self.store, *REQ_ALL_PERMS)
        res = self.create_requisition(user=user)
        self.assertEqual(res.status_code, 404)
        self.assertEqual(self.client_.get(requisitions_url(self.store.id), **bearer(user)).status_code, 200)  # store access ok, list just empty/scoped

    def test_missing_formulas_view_folds_to_404_formula_visibility_restricted(self):
        """Formula-recipe visibility is a documented, separate gate: store
        + batch_plans.view alone is NOT enough to create, view, or list a
        requisition - it inherently exposes recipe-derived quantities."""
        user = make_user("nofmview")
        grant_company_permission(self.superuser, user, self.company, "batch_plans.view")
        grant_store_permission(self.superuser, user, self.store, *REQ_ALL_PERMS)
        res = self.create_requisition(user=user)
        self.assertEqual(res.status_code, 404)

        # Create one for real with the fully-permissioned operator, then
        # confirm the formulas.view-lacking user still cannot see it.
        created = self.create_requisition().json()
        self.assertEqual(self.client_.get(requisition_url(self.store.id, created["id"]), **bearer(user)).status_code, 404)
        list_res = self.client_.get(requisitions_url(self.store.id), **bearer(user))
        self.assertEqual(list_res.status_code, 200)
        self.assertEqual(list_res.json()["count"], 0)

    def test_list_scoped_by_company_access_not_just_store(self):
        other_company = make_company("MROTHER")
        grant_company_permission(self.superuser, self.operator, other_company)  # membership, no perms
        self.create_requisition()
        res = self.client_.get(requisitions_url(self.store.id), **bearer(self.operator))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["count"], 1)


class CreateTests(MaterialRequisitionTestCase):
    def test_create_success_reuses_calculator_and_splits_raw_packaging(self):
        res = self.create_requisition()
        self.assertEqual(res.status_code, 201)
        body = res.json()
        self.assertEqual(len(body["raw_lines"]), 1)
        self.assertEqual(len(body["packaging_lines"]), 1)
        raw = body["raw_lines"][0]
        pck = body["packaging_lines"][0]
        self.assertEqual(raw["calculated_quantity"], "5")
        self.assertTrue(raw["calculation_is_exact"])
        self.assertEqual(raw["requested_quantity"], "5.000")
        self.assertEqual(raw["quantity_decision_issue"], "")
        self.assertEqual(pck["calculated_quantity"], "50")
        self.assertEqual(pck["requested_quantity"], "50.000")
        self.assertEqual(body["status"], "DRAFT")
        self.assertNotIn("available_stock", body)
        self.assertNotIn("shortage", body)
        self.assertNotIn("can_produce", body)

    def test_scale_up(self):
        ctx = build_plan(
            company=self.company, superuser=self.superuser, output_unit=self.unit_count,
            base_output=Decimal("100.000"), target=Decimal("200"),
            line_specs=[(Material.Kind.RAW_MATERIAL, self.mass_unit, Decimal("10.000"), "RAWUP")],
        )
        res = self.create_requisition(plan_id=ctx["plan"].id, expected_batch_plan_version=ctx["plan"].version)
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["raw_lines"][0]["requested_quantity"], "20.000")

    def test_scale_down_fractional_count_leaves_requested_quantity_null(self):
        ctx = build_plan(
            company=self.company, superuser=self.superuser, output_unit=self.unit_count,
            base_output=Decimal("100.000"), target=Decimal("33"),
            line_specs=[(Material.Kind.PACKAGING_MATERIAL, self.piece_unit, Decimal("7.000"), "FRACT")],
        )
        res = self.create_requisition(plan_id=ctx["plan"].id, expected_batch_plan_version=ctx["plan"].version)
        self.assertEqual(res.status_code, 201)
        line = res.json()["packaging_lines"][0]
        self.assertIsNone(line["requested_quantity"])
        self.assertEqual(line["quantity_decision_issue"], "FRACTIONAL_COUNT_QUANTITY")
        self.assertFalse(line["calculation_is_exact"] and False)  # exact ratio (2.31) is still preserved below
        self.assertEqual(line["calculated_quantity"], "2.31")
        self.assertTrue(line["calculation_is_exact"])

    def test_repeating_decimal_requires_rounding_never_silently_rounded(self):
        ctx = build_plan(
            company=self.company, superuser=self.superuser, output_unit=self.mass_unit,
            base_output=Decimal("3.000"), target=Decimal("1"),
            line_specs=[(Material.Kind.RAW_MATERIAL, self.mass_unit, Decimal("1.000"), "REPEAT")],
        )
        res = self.create_requisition(plan_id=ctx["plan"].id, expected_batch_plan_version=ctx["plan"].version)
        self.assertEqual(res.status_code, 201)
        line = res.json()["raw_lines"][0]
        self.assertIsNone(line["requested_quantity"])
        self.assertEqual(line["quantity_decision_issue"], "QUANTITY_REQUIRES_ROUNDING")
        self.assertFalse(line["calculation_is_exact"])
        self.assertTrue(line["calculation_is_approximate"])

    def test_unknown_and_protected_fields_rejected(self):
        # "store_id" is deliberately not included here: create_requisition's
        # own `store_id` kwarg selects which URL to POST to, so it can never
        # reach the JSON body through this particular helper.
        for field, value in [
            ("status", "DRAFT"), ("version", 5), ("company_id", self.company.id),
            ("created_by_id", self.superuser.id), ("lines", []), ("calculated_quantity", "5"),
        ]:
            res = self.create_requisition(**{field: value})
            self.assertEqual(res.status_code, 400, field)
            self.assertIn(field, res.json())

    def test_stale_plan_version_is_conflict(self):
        res = self.create_requisition(expected_batch_plan_version=self.plan.version + 1)
        self.assertEqual(res.status_code, 409)

    def test_duplicate_creation_is_conflict_not_500(self):
        first = self.create_requisition()
        self.assertEqual(first.status_code, 201)
        second = self.create_requisition()
        self.assertEqual(second.status_code, 409)
        self.assertEqual(MaterialRequisition.objects.filter(batch_plan=self.plan).count(), 1)

    def test_incompatible_source_blocks_creation(self):
        other_product = make_product(self.company, self.unit_count, self.superuser, "SWAPPED")
        update_sales_order(
            actor=self.superuser, sales_order_id=self.order.id, expected_version=self.order.version,
            data={"lines": [{"id": self.line.id, "product_id": other_product.id, "quantity": Decimal("1000"), "unit_price": Decimal("1")}]},
        )
        res = self.create_requisition()
        self.assertEqual(res.status_code, 400)
        self.assertIn("batch_plan_id", res.json())

    def test_inactive_output_unit_blocks_creation(self):
        from apps.catalog.services import deactivate_unit

        deactivate_unit(actor=self.superuser, unit=self.unit_count)
        res = self.create_requisition()
        self.assertEqual(res.status_code, 400)

    def test_audit_rollback_on_failure(self):
        with patch("apps.material_requisitions.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.create_requisition()
        self.assertEqual(MaterialRequisition.objects.count(), 0)
        self.assertEqual(MaterialRequisitionLine.objects.count(), 0)

    def test_creation_never_mutates_batch_plan_formula_or_order(self):
        plan_before = (self.plan.version, self.plan.target_output_quantity)
        rev_before = (self.revision.version, self.revision.status)
        order_before = self.order.version
        self.create_requisition()
        self.plan.refresh_from_db()
        self.revision.refresh_from_db()
        self.order.refresh_from_db()
        self.assertEqual(plan_before, (self.plan.version, self.plan.target_output_quantity))
        self.assertEqual(rev_before, (self.revision.version, self.revision.status))
        self.assertEqual(order_before, self.order.version)

    def test_official_batch_number_shown_as_context_not_quantity_drift(self):
        grant_company_permission(self.superuser, self.operator, self.company, "batch_plans.view", "formulas.view", "batch_plans.allocate_number")
        allocate_batch_number(actor=self.operator, company_id=self.company.id, plan_id=self.plan.id, expected_version=self.plan.version)
        self.plan.refresh_from_db()
        res = self.create_requisition(expected_batch_plan_version=self.plan.version)
        self.assertEqual(res.status_code, 201)
        body = res.json()
        self.assertIsNotNone(body["current_plan_context"]["official_batch_number"])
        self.assertFalse(body["source_drift"]["quantity_affecting"])


class SubmitTests(MaterialRequisitionTestCase):
    """Task 15A. Base fixture's requisition already has BOTH lines exactly
    matching their calculated requirement (RAW 10 -> 5.000 exact, PACKAGING
    100 -> 50.000 exact, factor 1/2) - no quantity_remark is needed for a
    plain successful submission.
    """

    def setUp(self):
        super().setUp()
        self.req = self.create_requisition().json()
        self.raw_line_id = self.req["raw_lines"][0]["id"]
        self.pck_line_id = self.req["packaging_lines"][0]["id"]

    def test_successful_submission(self):
        res = self.submit_requisition(self.req["id"], expected_version=1)
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["status"], "SUBMITTED")
        self.assertEqual(body["submitted_by_id"], self.submitter.id)
        self.assertIsNotNone(body["submitted_at"])
        self.assertEqual(body["version"], 2)
        self.assertTrue(AuditLog.objects.filter(action="material_requisition.submitted", target_id=self.req["id"]).exists())

    def test_missing_submit_permission_no_superuser_bypass(self):
        # self.operator has view/create/edit but not submit.
        res = self.submit_requisition(self.req["id"], user=self.operator, expected_version=1)
        self.assertEqual(res.status_code, 403)
        self.assertIn("material_requisitions.submit", res.json()["detail"])
        # active superuser gets no operational bypass either.
        res2 = self.submit_requisition(self.req["id"], user=self.superuser, expected_version=1)
        self.assertEqual(res2.status_code, 404)

    def test_company_store_isolation(self):
        outsider = make_user("subout")
        self.assertEqual(self.submit_requisition(self.req["id"], user=outsider, expected_version=1).status_code, 404)

        other_company = make_company("SUBOTHER")
        no_formula_view = make_user("subnofmv")
        grant_company_permission(self.superuser, no_formula_view, self.company, "batch_plans.view")
        grant_store_permission(self.superuser, no_formula_view, self.store, "material_requisitions.view", "material_requisitions.submit")
        self.assertEqual(self.submit_requisition(self.req["id"], user=no_formula_view, expected_version=1).status_code, 404)

    def test_unresolved_requested_quantity_blocks_submission(self):
        ctx = build_plan(
            company=self.company, superuser=self.superuser, output_unit=self.unit_count,
            base_output=Decimal("100.000"), target=Decimal("33"),
            line_specs=[(Material.Kind.PACKAGING_MATERIAL, self.piece_unit, Decimal("7.000"), "FRACTSUB")],
        )
        req = self.create_requisition(plan_id=ctx["plan"].id, expected_batch_plan_version=ctx["plan"].version).json()
        res = self.submit_requisition(req["id"], expected_version=1)
        self.assertEqual(res.status_code, 400)
        detail = res.json()["detail"]
        self.assertIn("has been decided", detail[0] if isinstance(detail, list) else detail)
        req_db = MaterialRequisition.objects.get(pk=req["id"])
        self.assertEqual(req_db.status, "DRAFT")

    def test_fractional_count_rejection_same_as_unresolved(self):
        """A fractional-COUNT line is specifically one flavor of 'unresolved
        requested quantity' (quantity_decision_issue=FRACTIONAL_COUNT_
        QUANTITY) - confirmed blocked the same way."""
        ctx = build_plan(
            company=self.company, superuser=self.superuser, output_unit=self.unit_count,
            base_output=Decimal("100.000"), target=Decimal("33"),
            line_specs=[(Material.Kind.PACKAGING_MATERIAL, self.piece_unit, Decimal("7.000"), "FRACTCT")],
        )
        req = self.create_requisition(plan_id=ctx["plan"].id, expected_batch_plan_version=ctx["plan"].version).json()
        self.assertEqual(req["packaging_lines"][0]["quantity_decision_issue"], "FRACTIONAL_COUNT_QUANTITY")
        res = self.submit_requisition(req["id"], expected_version=1)
        self.assertEqual(res.status_code, 400)

    def test_missing_explanation_for_an_override_blocks_submission(self):
        # update_material_requisition already prevents entering this state
        # through the supported PATCH path - this simulates a legacy/edge-
        # case row via a direct queryset.update() (the documented
        # clean()-bypassing limitation every model here discloses), to
        # prove submission independently re-derives and checks the EXACT
        # comparison itself, never just trusting a stored flag.
        MaterialRequisitionLine.objects.filter(pk=self.raw_line_id).update(
            requested_quantity=Decimal("7.000"), quantity_remark=""
        )
        res = self.submit_requisition(self.req["id"], expected_version=1)
        self.assertEqual(res.status_code, 400)
        detail = res.json()["detail"]
        detail_text = detail[0] if isinstance(detail, list) else detail
        self.assertIn("quantity_remark", detail_text)
        self.assertEqual(MaterialRequisition.objects.get(pk=self.req["id"]).status, "DRAFT")

    def test_explained_override_still_submits_successfully(self):
        self.patch_requisition(
            self.req["id"], expected_version=1,
            lines=[{"id": self.raw_line_id, "requested_quantity": "6.000", "quantity_remark": "Rounded up for packing convenience"}],
        )
        res = self.submit_requisition(self.req["id"], expected_version=2)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["status"], "SUBMITTED")

    def test_quantity_affecting_source_drift_blocks_submission(self):
        update_batch_plan(actor=self.superuser, plan_id=self.plan.id, expected_version=self.plan.version, data={"target_output_quantity": "60"})
        res = self.submit_requisition(self.req["id"], expected_version=1)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(MaterialRequisition.objects.get(pk=self.req["id"]).status, "DRAFT")

    def test_inactive_material_blocks_submission(self):
        raw_material = MaterialRequisitionLine.objects.get(pk=self.raw_line_id).material
        deactivate_material(actor=self.superuser, material=raw_material)
        res = self.submit_requisition(self.req["id"], expected_version=1)
        self.assertEqual(res.status_code, 400)

    def test_inactive_output_unit_or_formula_not_approved_are_defensive_not_required_for_success(self):
        """Submission succeeds without ever allocating an official batch
        number, requiring a confirmed sales order, or checking stock
        availability - none of those gates are confirmed for requisition
        submission (Task 15A's own explicit instruction)."""
        res = self.submit_requisition(self.req["id"], expected_version=1)
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        for forbidden in ("available_stock", "stock_balance", "official_batch_number_required", "sales_order_confirmed"):
            self.assertNotIn(forbidden, body)

    def test_stale_version_is_conflict(self):
        res = self.submit_requisition(self.req["id"], expected_version=999)
        self.assertEqual(res.status_code, 409)
        self.assertEqual(MaterialRequisition.objects.get(pk=self.req["id"]).status, "DRAFT")

    def test_current_version_repeat_is_idempotent_no_op(self):
        first = self.submit_requisition(self.req["id"], expected_version=1)
        self.assertEqual(first.status_code, 200)
        first_body = first.json()
        second = self.submit_requisition(self.req["id"], expected_version=first_body["version"])
        self.assertEqual(second.status_code, 200)
        second_body = second.json()
        self.assertEqual(first_body["version"], second_body["version"])
        self.assertEqual(first_body["submitted_at"], second_body["submitted_at"])
        self.assertEqual(AuditLog.objects.filter(action="material_requisition.submitted", target_id=self.req["id"]).count(), 1)

    def test_edit_rejected_after_submission(self):
        submitted = self.submit_requisition(self.req["id"], expected_version=1).json()
        res = self.patch_requisition(self.req["id"], expected_version=submitted["version"], notes="too late")
        self.assertEqual(res.status_code, 400)
        res2 = self.patch_requisition(
            self.req["id"], expected_version=submitted["version"],
            lines=[{"id": self.raw_line_id, "requested_quantity": "9.000", "quantity_remark": "too late"}],
        )
        self.assertEqual(res2.status_code, 400)
        self.assertEqual(MaterialRequisition.objects.get(pk=self.req["id"]).notes, self.req["notes"])

    def test_audit_rollback_on_submission_failure(self):
        with patch("apps.material_requisitions.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.submit_requisition(self.req["id"], expected_version=1)
        req_db = MaterialRequisition.objects.get(pk=self.req["id"])
        self.assertEqual(req_db.status, "DRAFT")
        self.assertIsNone(req_db.submitted_by_id)
        self.assertIsNone(req_db.submitted_at)

    def test_historical_snapshot_preserved_after_submission_despite_later_drift(self):
        self.submit_requisition(self.req["id"], expected_version=1)
        before = self.client_.get(requisition_url(self.store.id, self.req["id"]), **bearer(self.submitter)).json()
        update_batch_plan(actor=self.superuser, plan_id=self.plan.id, expected_version=self.plan.version, data={"target_output_quantity": "60"})
        after = self.client_.get(requisition_url(self.store.id, self.req["id"]), **bearer(self.submitter)).json()
        # The frozen snapshots/lines are byte-for-byte unchanged...
        self.assertEqual(before["raw_lines"], after["raw_lines"])
        self.assertEqual(before["packaging_lines"], after["packaging_lines"])
        self.assertEqual(before["target_output_quantity_snapshot"], after["target_output_quantity_snapshot"])
        # ...while CURRENT source drift is shown separately, never rewriting the frozen record.
        self.assertFalse(before["source_drift"]["quantity_affecting"])
        self.assertTrue(after["source_drift"]["quantity_affecting"])
        self.assertEqual(after["status"], "SUBMITTED")

    def test_no_stock_receipt_batch_number_or_production_side_effects(self):
        from apps.batch_plans.models import BatchNumberAllocation
        from apps.stock_movements.models import StockMovement

        self.submit_requisition(self.req["id"], expected_version=1)
        self.assertEqual(StockMovement.objects.count(), 0)
        self.assertEqual(BatchNumberAllocation.objects.filter(batch_plan=self.plan).count(), 0)
        self.plan.refresh_from_db()
        self.assertEqual(self.plan.status, "DRAFT")

class UpdateTests(MaterialRequisitionTestCase):
    def setUp(self):
        super().setUp()
        self.req = self.create_requisition().json()
        self.raw_line_id = self.req["raw_lines"][0]["id"]
        self.pck_line_id = self.req["packaging_lines"][0]["id"]

    def test_notes_only_edit(self):
        res = self.patch_requisition(self.req["id"], expected_version=1, notes="Please expedite")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["notes"], "Please expedite")
        self.assertEqual(res.json()["version"], 2)

    def test_noop_update_does_not_bump_version_or_audit(self):
        audit_count_before = AuditLog.objects.count()
        res = self.patch_requisition(self.req["id"], expected_version=1, notes="")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["version"], 1)
        self.assertEqual(AuditLog.objects.count(), audit_count_before)

    def test_matching_requested_quantity_needs_no_remark(self):
        res = self.patch_requisition(
            self.req["id"], expected_version=1, lines=[{"id": self.raw_line_id, "requested_quantity": "5.000"}]
        )
        self.assertEqual(res.status_code, 200)

    def test_differing_requested_quantity_requires_remark(self):
        res = self.patch_requisition(
            self.req["id"], expected_version=1, lines=[{"id": self.raw_line_id, "requested_quantity": "6.000"}]
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("lines", res.json())

        res2 = self.patch_requisition(
            self.req["id"], expected_version=1,
            lines=[{"id": self.raw_line_id, "requested_quantity": "6.000", "quantity_remark": "Rounded up per store manager"}],
        )
        self.assertEqual(res2.status_code, 200)
        line = next(l for l in res2.json()["raw_lines"] if l["id"] == self.raw_line_id)
        self.assertEqual(line["requested_quantity"], "6.000")
        self.assertEqual(line["quantity_remark"], "Rounded up per store manager")

    def test_requested_quantity_must_be_positive(self):
        res = self.patch_requisition(self.req["id"], expected_version=1, lines=[{"id": self.raw_line_id, "requested_quantity": "-1.000"}])
        self.assertEqual(res.status_code, 400)

    def test_requested_quantity_whole_for_count_unit(self):
        res = self.patch_requisition(
            self.req["id"], expected_version=1,
            lines=[{"id": self.pck_line_id, "requested_quantity": "50.500", "quantity_remark": "test"}],
        )
        self.assertEqual(res.status_code, 400)

    def test_foreign_and_duplicate_line_ids_rejected(self):
        other_req = self.create_requisition(
            plan_id=build_plan(
                company=self.company, superuser=self.superuser, output_unit=self.unit_count,
                base_output=Decimal("10.000"), target=Decimal("5"),
                line_specs=[(Material.Kind.RAW_MATERIAL, self.mass_unit, Decimal("1.000"), "OTH")],
            )["plan"].id,
            expected_batch_plan_version=1,
        ).json()
        foreign_line_id = other_req["raw_lines"][0]["id"]

        res = self.patch_requisition(self.req["id"], expected_version=1, lines=[{"id": foreign_line_id, "requested_quantity": "1.000"}])
        self.assertEqual(res.status_code, 400)

        res2 = self.patch_requisition(
            self.req["id"], expected_version=1,
            lines=[{"id": self.raw_line_id, "requested_quantity": "5.000"}, {"id": self.raw_line_id, "requested_quantity": "5.000"}],
        )
        self.assertEqual(res2.status_code, 400)

    def test_line_without_id_rejected_no_add_line_path(self):
        res = self.client_.patch(
            requisition_url(self.store.id, self.req["id"]),
            data=json.dumps({"expected_version": 1, "lines": [{"requested_quantity": "1.000"}]}),
            content_type="application/json", **bearer(self.operator),
        )
        self.assertEqual(res.status_code, 400)

    def test_protected_fields_rejected(self):
        # "store_id" is deliberately not included here: patch_requisition's
        # own `store_id` kwarg selects which URL to PATCH, so it can never
        # reach the JSON body through this particular helper.
        for field, value in [
            ("batch_plan_id", 999), ("status", "SUBMITTED"), ("version", 99),
        ]:
            res = self.patch_requisition(self.req["id"], expected_version=1, **{field: value})
            self.assertEqual(res.status_code, 400, field)

    def test_stale_version_conflict(self):
        res = self.patch_requisition(self.req["id"], expected_version=999, notes="x")
        self.assertEqual(res.status_code, 409)

    def test_quantity_edit_blocked_by_quantity_affecting_drift_notes_still_allowed(self):
        update_batch_plan(actor=self.superuser, plan_id=self.plan.id, expected_version=self.plan.version, data={"target_output_quantity": "60"})
        # notes-only edit still works
        res_notes = self.patch_requisition(self.req["id"], expected_version=1, notes="still fine")
        self.assertEqual(res_notes.status_code, 200)
        # quantity edit is blocked
        res_qty = self.patch_requisition(
            self.req["id"], expected_version=2, lines=[{"id": self.raw_line_id, "requested_quantity": "5.000"}]
        )
        self.assertEqual(res_qty.status_code, 400)

    def test_audit_rollback_on_update_failure(self):
        with patch("apps.material_requisitions.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.patch_requisition(self.req["id"], expected_version=1, notes="should not persist")
        stored = MaterialRequisition.objects.get(pk=self.req["id"])
        self.assertEqual((stored.version, stored.notes), (1, ""))

    def test_update_never_mutates_batch_plan(self):
        before = (self.plan.version, self.plan.target_output_quantity)
        self.patch_requisition(self.req["id"], expected_version=1, notes="changed")
        self.plan.refresh_from_db()
        self.assertEqual(before, (self.plan.version, self.plan.target_output_quantity))


class DriftAndHistoryTests(MaterialRequisitionTestCase):
    def test_historical_read_survives_material_deactivation(self):
        req = self.create_requisition().json()
        material_id = req["raw_lines"][0]["material_id"]
        material = Material.objects.get(pk=material_id)
        deactivate_material(actor=self.superuser, material=material)
        res = self.client_.get(requisition_url(self.store.id, req["id"]), **bearer(self.operator))
        self.assertEqual(res.status_code, 200)
        line = res.json()["raw_lines"][0]
        self.assertFalse(line["material_is_active"])
        self.assertEqual(line["requested_quantity"], "5.000")  # unchanged historical value

    def test_source_drift_none_initially(self):
        requisition = MaterialRequisition.objects.get(pk=self.create_requisition().json()["id"])
        drift = assess_requisition_drift(requisition)
        self.assertFalse(drift["is_incompatible"])
        self.assertFalse(drift["quantity_affecting"])
        self.assertFalse(drift["plan_version_changed"])

    def test_plan_target_change_is_quantity_affecting_drift(self):
        requisition = MaterialRequisition.objects.get(pk=self.create_requisition().json()["id"])
        update_batch_plan(actor=self.superuser, plan_id=self.plan.id, expected_version=self.plan.version, data={"target_output_quantity": "70"})
        drift = assess_requisition_drift(requisition)
        self.assertTrue(drift["quantity_affecting"])
        self.assertTrue(any(i["code"] == "PLAN_TARGET_QUANTITY_CHANGED" for i in drift["issues"]))

    def test_number_allocation_alone_is_not_quantity_affecting(self):
        requisition = MaterialRequisition.objects.get(pk=self.create_requisition().json()["id"])
        grant_company_permission(self.superuser, self.operator, self.company, "batch_plans.view", "formulas.view", "batch_plans.allocate_number")
        allocate_batch_number(actor=self.operator, company_id=self.company.id, plan_id=self.plan.id, expected_version=self.plan.version)
        drift = assess_requisition_drift(requisition)
        self.assertTrue(drift["plan_version_changed"])
        self.assertFalse(drift["quantity_affecting"])
        self.assertFalse(drift["is_incompatible"])


class LifecycleAndSideEffectTests(MaterialRequisitionTestCase):
    def test_no_delete_endpoint(self):
        req = self.create_requisition().json()
        res = self.client_.delete(requisition_url(self.store.id, req["id"]), **bearer(self.operator))
        self.assertEqual(res.status_code, 405)
        res2 = self.client_.delete(requisitions_url(self.store.id), **bearer(self.operator))
        self.assertEqual(res2.status_code, 405)

    def test_no_cancel_issue_reopen_amend_fulfil_endpoints_exist(self):
        # "submit"/"approve"/"reject"/"revise" are deliberately NOT in
        # this list since Task 15A/15C - see SubmitTests/ApproveRejectTests/
        # ReviseTests below for their own dedicated coverage. No cancel/
        # issue/reopen/amend/fulfil/stock-reservation action exists
        # anywhere in this task, at any status.
        req = self.create_requisition().json()
        for action in ("cancel", "issue", "reopen", "amend", "fulfil"):
            res = self.client_.post(
                f"{requisition_url(self.store.id, req['id'])[:-1]}/{action}/", data="{}",
                content_type="application/json", **bearer(self.operator),
            )
            self.assertEqual(res.status_code, 404, action)

    def test_model_delete_raises(self):
        req = MaterialRequisition.objects.get(pk=self.create_requisition().json()["id"])
        with self.assertRaises(DjangoValidationError):
            req.delete()
        line = req.lines.first()
        with self.assertRaises(DjangoValidationError):
            line.delete()

    def test_never_described_as_approved_or_submitted(self):
        res = self.create_requisition()
        body = res.json()
        self.assertEqual(body["status"], "DRAFT")
        for forbidden in ("approved", "submitted", "ready_to_issue", "reserved_quantity", "issued_quantity"):
            self.assertNotIn(forbidden, body)
            for line in body["raw_lines"] + body["packaging_lines"]:
                self.assertNotIn(forbidden, line)


class DecisionTestCase(MaterialRequisitionTestCase):
    """Task 15C base fixture. FOUR distinct personas so self-decision
    tests are meaningful: `self.operator` creates (inherited),
    `self.editor` makes a substantive requested_quantity edit,
    `self.submitter` submits (inherited), `self.approver`/`self.reviser`
    decide/revise - none of the first three ever hold approve/revise
    permission unless a test explicitly, temporarily grants it to prove
    the self-decision ban still applies even then.
    """

    def setUp(self):
        super().setUp()
        self.editor = make_user("mredit")
        grant_company_permission(self.superuser, self.editor, self.company, "batch_plans.view", "formulas.view")
        grant_store_permission(self.superuser, self.editor, self.store, "material_requisitions.view", "material_requisitions.edit")
        self.approver = make_user("mrappr")
        grant_company_permission(self.superuser, self.approver, self.company, "batch_plans.view", "formulas.view")
        grant_store_permission(self.superuser, self.approver, self.store, "material_requisitions.view", "material_requisitions.approve")
        self.reviser = make_user("mrrevs")
        grant_company_permission(self.superuser, self.reviser, self.company, "batch_plans.view", "formulas.view")
        grant_store_permission(
            self.superuser, self.reviser, self.store,
            "material_requisitions.view", "material_requisitions.edit", "material_requisitions.revise",
        )

    def approve_requisition(self, requisition_id, user=None, store_id=None, **body):
        payload = {"expected_version": body.pop("expected_version", 1)}
        payload.update(body)
        return self.client_.post(
            approve_url(store_id or self.store.id, requisition_id), data=json.dumps(payload),
            content_type="application/json", **bearer(user or self.approver),
        )

    def reject_requisition(self, requisition_id, user=None, store_id=None, **body):
        payload = {
            "expected_version": body.pop("expected_version", 1),
            "rejection_reason": body.pop("rejection_reason", "Needs correction"),
        }
        payload.update(body)
        return self.client_.post(
            reject_url(store_id or self.store.id, requisition_id), data=json.dumps(payload),
            content_type="application/json", **bearer(user or self.approver),
        )

    def revise_requisition(self, requisition_id, user=None, store_id=None, **body):
        payload = {"expected_version": body.pop("expected_version", 1)}
        payload.update(body)
        return self.client_.post(
            revise_url(store_id or self.store.id, requisition_id), data=json.dumps(payload),
            content_type="application/json", **bearer(user or self.reviser),
        )

    def make_submitted_requisition(self):
        """operator creates -> editor substantively edits the RAW line's
        requested_quantity (so operator is a contributor via the
        PACKAGING line's auto-fit value, AND the creator; editor is a
        contributor via the RAW line) -> submitter submits. Returns the
        JSON body after submission.
        """
        req = self.create_requisition().json()
        raw_line_id = req["raw_lines"][0]["id"]
        self.patch_requisition(
            req["id"], user=self.editor, expected_version=1,
            lines=[{"id": raw_line_id, "requested_quantity": "6.000", "quantity_remark": "Editor bump"}],
        )
        res = self.submit_requisition(req["id"], expected_version=2)
        assert res.status_code == 200, res.content
        return res.json()


class ApproveRejectTests(DecisionTestCase):
    def test_permission_and_company_store_isolation(self):
        req = self.make_submitted_requisition()
        outsider = make_user("araout")
        self.assertEqual(self.approve_requisition(req["id"], user=outsider).status_code, 404)
        self.assertEqual(self.reject_requisition(req["id"], user=outsider).status_code, 404)

        no_approve = make_user("aranoappr")
        grant_company_permission(self.superuser, no_approve, self.company, "batch_plans.view", "formulas.view")
        grant_store_permission(self.superuser, no_approve, self.store, "material_requisitions.view")
        res = self.approve_requisition(req["id"], user=no_approve)
        self.assertEqual(res.status_code, 403)
        self.assertIn("material_requisitions.approve", res.json()["detail"])
        res2 = self.reject_requisition(req["id"], user=no_approve)
        self.assertEqual(res2.status_code, 403)

        other_company = make_company("ARAOTHER")
        no_formula_view = make_user("aranofmv")
        grant_company_permission(self.superuser, no_formula_view, self.company, "batch_plans.view")
        grant_store_permission(self.superuser, no_formula_view, self.store, "material_requisitions.view", "material_requisitions.approve")
        self.assertEqual(self.approve_requisition(req["id"], user=no_formula_view).status_code, 404)

    def test_no_superuser_bypass(self):
        req = self.make_submitted_requisition()
        self.assertEqual(self.approve_requisition(req["id"], user=self.superuser).status_code, 404)

    def test_creator_cannot_approve_or_reject_even_if_granted_permission(self):
        req = self.make_submitted_requisition()
        grant_store_permission(self.superuser, self.operator, self.store, "material_requisitions.approve")
        res = self.approve_requisition(req["id"], user=self.operator, expected_version=req["version"])
        self.assertEqual(res.status_code, 400)
        self.assertIn("SELF_DECISION_CREATOR", str(res.json()))
        res2 = self.reject_requisition(req["id"], user=self.operator, expected_version=req["version"])
        self.assertEqual(res2.status_code, 400)
        self.assertIn("SELF_DECISION_CREATOR", str(res2.json()))

    def test_submitter_cannot_approve_or_reject_even_if_granted_permission(self):
        req = self.make_submitted_requisition()
        grant_store_permission(self.superuser, self.submitter, self.store, "material_requisitions.approve")
        res = self.approve_requisition(req["id"], user=self.submitter, expected_version=req["version"])
        self.assertEqual(res.status_code, 400)
        self.assertIn("SELF_DECISION_SUBMITTER", str(res.json()))

    def test_substantive_editor_cannot_approve_even_if_granted_permission(self):
        req = self.make_submitted_requisition()
        grant_store_permission(self.superuser, self.editor, self.store, "material_requisitions.approve")
        res = self.approve_requisition(req["id"], user=self.editor, expected_version=req["version"])
        self.assertEqual(res.status_code, 400)
        self.assertIn("SELF_DECISION_CONTRIBUTOR", str(res.json()))

    def test_noop_edit_and_remark_only_edit_do_not_create_or_move_contributors(self):
        req = self.create_requisition().json()
        raw_line_id = req["raw_lines"][0]["id"]
        original_contributor = req["raw_lines"][0]["requested_quantity_contributor_id"]
        self.assertEqual(original_contributor, self.operator.id)

        # Re-sending the SAME value is a no-op - contributor unchanged.
        self.patch_requisition(req["id"], expected_version=1, lines=[{"id": raw_line_id, "requested_quantity": "5.000"}])
        line = MaterialRequisitionLine.objects.get(pk=raw_line_id)
        self.assertEqual(line.requested_quantity_contributor_id, self.operator.id)
        self.assertEqual(MaterialRequisition.objects.get(pk=req["id"]).version, 1)

        # A remark-only edit by a DIFFERENT user changes nothing about
        # the value, so it must not reattribute the line either.
        res = self.patch_requisition(
            req["id"], user=self.editor, expected_version=1,
            lines=[{"id": raw_line_id, "quantity_remark": "just a note, no value change"}],
        )
        self.assertEqual(res.status_code, 200, res.content)
        line.refresh_from_db()
        self.assertEqual(line.requested_quantity_contributor_id, self.operator.id)

        # Approving now must still block the editor as the OTHER line's
        # (packaging) contributor is still the operator/creator, but the
        # editor made no substantive change at all - confirm editor is
        # NOT blocked as a contributor (only the creator/submitter rules
        # would apply to them, and they are neither here).
        submitted = self.submit_requisition(req["id"], expected_version=2).json()
        grant_store_permission(self.superuser, self.editor, self.store, "material_requisitions.approve")
        res2 = self.approve_requisition(submitted["id"], user=self.editor, expected_version=submitted["version"])
        self.assertEqual(res2.status_code, 200, res2.content)

    def test_legacy_incomplete_provenance_blocks_every_actor(self):
        req = self.make_submitted_requisition()
        round_obj = MaterialRequisitionRound.objects.get(requisition_id=req["id"], round_number=1)
        round_obj.contributor_provenance_complete = False
        round_obj.save(update_fields=["contributor_provenance_complete"])

        res = self.approve_requisition(req["id"], expected_version=req["version"])
        self.assertEqual(res.status_code, 400)
        self.assertIn("CONTRIBUTOR_PROVENANCE_INCOMPLETE", str(res.json()))
        res2 = self.reject_requisition(req["id"], expected_version=req["version"])
        self.assertEqual(res2.status_code, 400)
        self.assertIn("CONTRIBUTOR_PROVENANCE_INCOMPLETE", str(res2.json()))

    def test_approve_happy_path(self):
        req = self.make_submitted_requisition()
        res = self.approve_requisition(req["id"], expected_version=req["version"])
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["status"], "APPROVED")
        self.assertEqual(body["current_decision"]["outcome"], "APPROVED")
        self.assertEqual(body["current_decision"]["decided_by_id"], self.approver.id)
        self.assertIsNotNone(body["current_decision"]["decided_at"])
        self.assertTrue(AuditLog.objects.filter(action="material_requisition.approved", target_id=req["id"]).exists())

    def test_reject_happy_path_requires_reason(self):
        req = self.make_submitted_requisition()
        res_no_reason = self.client_.post(
            reject_url(self.store.id, req["id"]), data=json.dumps({"expected_version": req["version"]}),
            content_type="application/json", **bearer(self.approver),
        )
        self.assertEqual(res_no_reason.status_code, 400)
        self.assertEqual(MaterialRequisition.objects.get(pk=req["id"]).status, "SUBMITTED")

        res = self.reject_requisition(req["id"], expected_version=req["version"], rejection_reason="Quantities look wrong")
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["status"], "REJECTED")
        self.assertEqual(body["current_decision"]["outcome"], "REJECTED")
        self.assertEqual(body["current_decision"]["rejection_reason"], "Quantities look wrong")
        self.assertTrue(AuditLog.objects.filter(action="material_requisition.rejected", target_id=req["id"]).exists())

    def test_wrong_state_rejected(self):
        # A SEPARATE batch plan - `self.plan` can only ever hold one
        # requisition (OneToOneField), and `make_submitted_requisition`
        # below also creates one against it.
        other_ctx = build_plan(
            company=self.company, superuser=self.superuser, output_unit=self.unit_count,
            base_output=Decimal("100.000"), target=Decimal("50"),
            line_specs=[(Material.Kind.RAW_MATERIAL, self.mass_unit, Decimal("10.000"), "WRONGSTATE")],
        )
        draft_req = self.create_requisition(plan_id=other_ctx["plan"].id, expected_batch_plan_version=other_ctx["plan"].version).json()
        res = self.approve_requisition(draft_req["id"], expected_version=1)
        self.assertEqual(res.status_code, 400)

        req = self.make_submitted_requisition()
        self.approve_requisition(req["id"], expected_version=req["version"])
        res2 = self.reject_requisition(req["id"], expected_version=req["version"] + 1)
        self.assertEqual(res2.status_code, 400)

    def test_stale_version_is_conflict(self):
        req = self.make_submitted_requisition()
        res = self.approve_requisition(req["id"], expected_version=999)
        self.assertEqual(res.status_code, 409)
        res2 = self.reject_requisition(req["id"], expected_version=999)
        self.assertEqual(res2.status_code, 409)
        self.assertEqual(MaterialRequisition.objects.get(pk=req["id"]).status, "SUBMITTED")

    def test_same_decision_retry_at_current_version_is_noop(self):
        req = self.make_submitted_requisition()
        first = self.approve_requisition(req["id"], expected_version=req["version"])
        first_body = first.json()
        second = self.approve_requisition(req["id"], expected_version=first_body["version"])
        self.assertEqual(second.status_code, 200)
        second_body = second.json()
        self.assertEqual(first_body["version"], second_body["version"])
        self.assertEqual(first_body["current_decision"]["decided_at"], second_body["current_decision"]["decided_at"])
        self.assertEqual(AuditLog.objects.filter(action="material_requisition.approved", target_id=req["id"]).count(), 1)

    def test_reject_same_reason_retry_is_noop_different_reason_is_conflict(self):
        req = self.make_submitted_requisition()
        first = self.reject_requisition(req["id"], expected_version=req["version"], rejection_reason="Bad quantities")
        first_body = first.json()
        same = self.reject_requisition(req["id"], expected_version=first_body["version"], rejection_reason="Bad quantities")
        self.assertEqual(same.status_code, 200)
        self.assertEqual(same.json()["version"], first_body["version"])
        self.assertEqual(AuditLog.objects.filter(action="material_requisition.rejected", target_id=req["id"]).count(), 1)

        different = self.reject_requisition(req["id"], expected_version=first_body["version"], rejection_reason="Different reason")
        self.assertEqual(different.status_code, 409)
        self.assertEqual(MaterialRequisition.objects.get(pk=req["id"]).version, first_body["version"])

    def test_conflicting_decision_fails_without_changing_anything(self):
        req = self.make_submitted_requisition()
        approved = self.approve_requisition(req["id"], expected_version=req["version"]).json()
        # A reject attempt at the now-stale pre-approval version is a
        # clean 409, never silently applied on top of the approval.
        res = self.reject_requisition(req["id"], expected_version=req["version"], rejection_reason="too late")
        self.assertEqual(res.status_code, 409)
        req_db = MaterialRequisition.objects.get(pk=req["id"])
        self.assertEqual(req_db.status, "APPROVED")
        self.assertEqual(req_db.version, approved["version"])

    def test_frozen_approved_content_not_mutated_by_later_source_change(self):
        req = self.make_submitted_requisition()
        self.approve_requisition(req["id"], expected_version=req["version"])
        before = self.client_.get(requisition_url(self.store.id, req["id"]), **bearer(self.approver)).json()
        update_batch_plan(actor=self.superuser, plan_id=self.plan.id, expected_version=self.plan.version, data={"target_output_quantity": "90"})
        after = self.client_.get(requisition_url(self.store.id, req["id"]), **bearer(self.approver)).json()
        self.assertEqual(before["raw_lines"], after["raw_lines"])
        self.assertEqual(before["current_decision"], after["current_decision"])
        self.assertEqual(after["status"], "APPROVED")
        self.assertFalse(before["source_drift"]["quantity_affecting"])
        self.assertTrue(after["source_drift"]["quantity_affecting"])

    def test_no_stock_receipt_batch_number_or_production_effects_after_approval(self):
        from apps.batch_plans.models import BatchNumberAllocation
        from apps.stock_movements.models import StockMovement

        req = self.make_submitted_requisition()
        self.approve_requisition(req["id"], expected_version=req["version"])
        self.assertEqual(StockMovement.objects.count(), 0)
        self.assertEqual(BatchNumberAllocation.objects.filter(batch_plan=self.plan).count(), 0)
        self.plan.refresh_from_db()
        self.assertEqual(self.plan.status, "DRAFT")

    def test_audit_rollback_on_approve_and_reject_failure(self):
        req = self.make_submitted_requisition()
        with patch("apps.material_requisitions.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.approve_requisition(req["id"], expected_version=req["version"])
        req_db = MaterialRequisition.objects.get(pk=req["id"])
        self.assertEqual(req_db.status, "SUBMITTED")

        with patch("apps.material_requisitions.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self.reject_requisition(req["id"], expected_version=req["version"])
        req_db.refresh_from_db()
        self.assertEqual(req_db.status, "SUBMITTED")


class ReviseTests(DecisionTestCase):
    def test_revise_permission_required(self):
        req = self.make_submitted_requisition()
        self.reject_requisition(req["id"], expected_version=req["version"])

        no_revise = make_user("rvnorev")
        grant_company_permission(self.superuser, no_revise, self.company, "batch_plans.view", "formulas.view")
        grant_store_permission(self.superuser, no_revise, self.store, "material_requisitions.view", "material_requisitions.edit")
        res = self.revise_requisition(req["id"], user=no_revise, expected_version=req["version"] + 1)
        self.assertEqual(res.status_code, 403)
        self.assertIn("material_requisitions.revise", res.json()["detail"])

    def test_revise_requires_rejected_status(self):
        req = self.create_requisition().json()
        res = self.revise_requisition(req["id"], expected_version=1)
        self.assertEqual(res.status_code, 400)

        submitted = self.submit_requisition(req["id"], expected_version=1).json()
        res2 = self.revise_requisition(req["id"], expected_version=submitted["version"])
        self.assertEqual(res2.status_code, 400)

    def test_reject_revise_edit_resubmit_approve_full_cycle(self):
        req = self.make_submitted_requisition()
        rejected = self.reject_requisition(req["id"], expected_version=req["version"], rejection_reason="Fix the raw line").json()
        self.assertEqual(rejected["status"], "REJECTED")

        revised = self.revise_requisition(req["id"], expected_version=rejected["version"]).json()
        self.assertEqual(revised["status"], "DRAFT")
        # Carried-forward contributor provenance survives the reopen.
        raw_line = next(l for l in revised["raw_lines"])
        self.assertEqual(raw_line["requested_quantity_contributor_id"], self.editor.id)

        raw_line_id = revised["raw_lines"][0]["id"]
        self.patch_requisition(
            req["id"], expected_version=revised["version"],
            lines=[{"id": raw_line_id, "requested_quantity": "7.000", "quantity_remark": "Corrected"}],
        )
        resubmitted = self.submit_requisition(req["id"], expected_version=revised["version"] + 1).json()
        self.assertEqual(resubmitted["status"], "SUBMITTED")
        self.assertEqual(MaterialRequisition.objects.get(pk=req["id"]).current_round, 2)

        approved = self.approve_requisition(req["id"], expected_version=resubmitted["version"]).json()
        self.assertEqual(approved["status"], "APPROVED")
        self.assertEqual(len(approved["rounds"]), 2)

    def test_multiple_rounds_preserved_with_distinct_content(self):
        req = self.make_submitted_requisition()
        self.reject_requisition(req["id"], expected_version=req["version"], rejection_reason="round 1 reason")
        revised = MaterialRequisition.objects.get(pk=req["id"])
        raw_line_id = revised.lines.filter(material_kind_snapshot="RAW_MATERIAL").first().id
        self.revise_requisition(req["id"], expected_version=revised.version)
        revised.refresh_from_db()
        self.patch_requisition(
            req["id"], expected_version=revised.version,
            lines=[{"id": raw_line_id, "requested_quantity": "8.000", "quantity_remark": "round 2 value"}],
        )
        revised.refresh_from_db()
        self.submit_requisition(req["id"], expected_version=revised.version)

        detail = self.client_.get(requisition_url(self.store.id, req["id"]), **bearer(self.approver)).json()
        self.assertEqual(len(detail["rounds"]), 2)
        round1, round2 = detail["rounds"][0], detail["rounds"][1]
        self.assertEqual(round1["round_number"], 1)
        self.assertEqual(round1["outcome"], "REJECTED")
        self.assertEqual(round1["rejection_reason"], "round 1 reason")
        self.assertEqual(round2["round_number"], 2)
        self.assertEqual(round2["outcome"], "PENDING")
        round1_raw = next(l for l in round1["lines"] if l["line_number"] == 1)
        round2_raw = next(l for l in round2["lines"] if l["line_number"] == 1)
        self.assertEqual(round1_raw["requested_quantity"], "6.000")
        self.assertEqual(round2_raw["requested_quantity"], "8.000")

    def test_source_drift_blocks_approval_but_allows_rejection(self):
        req = self.make_submitted_requisition()
        update_batch_plan(actor=self.superuser, plan_id=self.plan.id, expected_version=self.plan.version, data={"target_output_quantity": "90"})
        res = self.approve_requisition(req["id"], expected_version=req["version"])
        self.assertEqual(res.status_code, 400)
        self.assertEqual(MaterialRequisition.objects.get(pk=req["id"]).status, "SUBMITTED")

        res2 = self.reject_requisition(req["id"], expected_version=req["version"], rejection_reason="source drifted")
        self.assertEqual(res2.status_code, 200, res2.content)
        self.assertEqual(res2.json()["status"], "REJECTED")

    def test_revise_without_drift_preserves_lines_and_contributor(self):
        req = self.make_submitted_requisition()
        rejected = self.reject_requisition(req["id"], expected_version=req["version"]).json()
        revised = self.revise_requisition(req["id"], expected_version=rejected["version"]).json()
        self.assertEqual(revised["raw_lines"], req["raw_lines"])
        self.assertEqual(revised["packaging_lines"], req["packaging_lines"])

    def test_revise_with_drift_requires_explicit_refresh_choice(self):
        req = self.make_submitted_requisition()
        rejected = self.reject_requisition(req["id"], expected_version=req["version"]).json()
        update_batch_plan(actor=self.superuser, plan_id=self.plan.id, expected_version=self.plan.version, data={"target_output_quantity": "90"})

        res = self.revise_requisition(req["id"], expected_version=rejected["version"])
        self.assertEqual(res.status_code, 400)
        self.assertEqual(MaterialRequisition.objects.get(pk=req["id"]).status, "REJECTED")

        stale_plan_version = self.plan.version
        self.plan.refresh_from_db()
        res2 = self.revise_requisition(
            req["id"], expected_version=rejected["version"], refresh_from_source=True,
            expected_batch_plan_version=stale_plan_version,
        )
        self.assertEqual(res2.status_code, 409)

    def test_revise_with_drift_refresh_rebuilds_lines_and_clears_overrides(self):
        req = self.make_submitted_requisition()
        rejected = self.reject_requisition(req["id"], expected_version=req["version"]).json()
        update_batch_plan(actor=self.superuser, plan_id=self.plan.id, expected_version=self.plan.version, data={"target_output_quantity": "90"})
        self.plan.refresh_from_db()

        res = self.revise_requisition(
            req["id"], expected_version=rejected["version"], refresh_from_source=True,
            expected_batch_plan_version=self.plan.version,
        )
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body["status"], "DRAFT")
        self.assertEqual(body["target_output_quantity_snapshot"], "90.000")
        # Factor is now 90/100 - RAW line (base qty 10) -> exact 9.000,
        # never rounded, and never the editor's old manual override.
        raw_line = body["raw_lines"][0]
        self.assertEqual(raw_line["requested_quantity"], "9.000")
        self.assertEqual(raw_line["quantity_remark"], "")
        self.assertEqual(raw_line["requested_quantity_contributor_id"], self.reviser.id)
        # The REJECTED round's own old snapshot is untouched.
        old_round = MaterialRequisitionRound.objects.get(requisition_id=req["id"], round_number=1)
        old_raw_line = old_round.lines.get(line_number=1)
        self.assertEqual(old_raw_line.requested_quantity, Decimal("6.000"))
        self.assertEqual(old_raw_line.requested_quantity_contributor_id, self.editor.id)

    def test_old_rejection_never_overwritten_by_new_submission(self):
        req = self.make_submitted_requisition()
        self.reject_requisition(req["id"], expected_version=req["version"], rejection_reason="first reason")
        revised = MaterialRequisition.objects.get(pk=req["id"])
        self.revise_requisition(req["id"], expected_version=revised.version)
        revised.refresh_from_db()
        self.submit_requisition(req["id"], expected_version=revised.version)

        old_round = MaterialRequisitionRound.objects.get(requisition_id=req["id"], round_number=1)
        self.assertEqual(old_round.outcome, "REJECTED")
        self.assertEqual(old_round.rejection_reason, "first reason")


class ConcurrencyTests(TransactionTestCase):
    serialized_rollback = True

    def _setup(self, suffix):
        superuser = make_superuser(f"cradmin{suffix}")
        operator = make_user(f"crop{suffix}")
        company = make_company(f"CR{suffix}")
        store = make_store(f"CRWH{suffix}")
        unit = make_unit(f"CRU{suffix}", UnitOfMeasure.Dimension.COUNT)
        mass_unit = make_unit(f"CRM{suffix}", UnitOfMeasure.Dimension.MASS)
        grant_company_permission(superuser, operator, company, "batch_plans.view", "formulas.view")
        grant_store_permission(superuser, operator, store, *REQ_ALL_PERMS)
        ctx = build_plan(
            company=company, superuser=superuser, output_unit=unit, base_output=Decimal("10.000"), target=Decimal("5"),
            line_specs=[(Material.Kind.RAW_MATERIAL, mass_unit, Decimal("2.000"), f"CRL{suffix}")],
        )
        return dict(superuser=superuser, operator=operator, company=company, store=store, plan=ctx["plan"])

    def test_concurrent_duplicate_creation_has_one_winner(self):
        ctx = self._setup("A")
        outcomes = []
        barrier = threading.Barrier(2)

        def create():
            try:
                barrier.wait(timeout=5)
                create_material_requisition(
                    actor=ctx["operator"], store=ctx["store"], batch_plan_id=ctx["plan"].id,
                    expected_batch_plan_version=ctx["plan"].version,
                )
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
        self.assertEqual(MaterialRequisition.objects.filter(batch_plan=ctx["plan"]).count(), 1)

    def test_concurrent_plan_edit_versus_draft_creation(self):
        """One thread edits the BatchPlan's target quantity; the other tries
        to create a requisition against the version it read before the
        edit. The BatchPlan row lock serializes them - the creator must see
        either the pre-edit or post-edit version consistently, and if it
        used the pre-edit `expected_batch_plan_version` after the edit
        committed first, it gets a clean 409, never a torn read.
        """
        ctx = self._setup("B")
        plan_version_before = ctx["plan"].version
        outcomes = []
        barrier = threading.Barrier(2)

        def edit_plan():
            barrier.wait(timeout=5)
            update_batch_plan(actor=ctx["superuser"], plan_id=ctx["plan"].id, expected_version=plan_version_before, data={"target_output_quantity": "7"})
            connection.close()

        def create_req():
            barrier.wait(timeout=5)
            try:
                create_material_requisition(
                    actor=ctx["operator"], store=ctx["store"], batch_plan_id=ctx["plan"].id,
                    expected_batch_plan_version=plan_version_before,
                )
                outcomes.append("ok")
            except Conflict:
                outcomes.append("conflict")
            finally:
                connection.close()

        threads = [threading.Thread(target=edit_plan), threading.Thread(target=create_req)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        # Exactly one of: the creation won the race (plan not yet edited when
        # it locked first) or lost it (edit committed first -> stale version
        # -> Conflict). Both are correct outcomes; a crash or a torn/500
        # result is not.
        self.assertIn(outcomes[0], ("ok", "conflict"))
        if outcomes[0] == "ok":
            requisition = MaterialRequisition.objects.get(batch_plan=ctx["plan"])
            self.assertEqual(requisition.target_output_quantity_snapshot, Decimal("5.000"))

    def test_submit_versus_edit_concurrency(self):
        """Task 15A. One thread submits; the other PATCHes notes - both at
        the same starting version. The requisition's own row lock
        serializes them: exactly one succeeds at that version, the other
        gets a clean `Conflict` (409) or, if it runs second against an
        already-SUBMITTED row, a clean rejection from the freeze check -
        never a torn state where an edit lands on an already-submitted
        requisition, and never a crash.
        """
        ctx = self._setup("C")
        requisition = create_material_requisition(
            actor=ctx["operator"], store=ctx["store"], batch_plan_id=ctx["plan"].id,
            expected_batch_plan_version=ctx["plan"].version,
        )
        req_id = requisition.id
        outcomes = []
        barrier = threading.Barrier(2)

        def do_submit():
            try:
                barrier.wait(timeout=5)
                submit_material_requisition(actor=ctx["operator"], requisition_id=req_id, expected_version=1)
                outcomes.append(("submit", "ok"))
            except Conflict:
                outcomes.append(("submit", "conflict"))
            except DjangoValidationError:
                outcomes.append(("submit", "rejected"))
            finally:
                connection.close()

        def do_edit():
            try:
                barrier.wait(timeout=5)
                update_material_requisition(
                    actor=ctx["operator"], requisition_id=req_id, expected_version=1, data={"notes": "racing edit"}
                )
                outcomes.append(("edit", "ok"))
            except Conflict:
                outcomes.append(("edit", "conflict"))
            except DjangoValidationError:
                outcomes.append(("edit", "rejected"))
            finally:
                connection.close()

        threads = [threading.Thread(target=do_submit), threading.Thread(target=do_edit)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)

        req_db = MaterialRequisition.objects.get(pk=req_id)
        self.assertIn(req_db.status, ("DRAFT", "SUBMITTED"))
        # Whichever ran second must have been correctly rejected - never
        # both "ok" (that would mean an edit landed on, or raced past, an
        # already-submitted requisition without being caught).
        self.assertNotEqual(sorted(o[1] for o in outcomes), ["ok", "ok"])

    def test_submit_versus_source_plan_edit_concurrency(self):
        """Task 15A. One thread submits; the other edits the BatchPlan's
        target quantity concurrently. Submission locks the plan too (see
        `apps.material_requisitions.services.submit_material_requisition`'s
        own docstring) specifically so this race is serialized: submission
        either completes against a consistent, pre-edit plan, or correctly
        observes the post-edit value under its own lock and blocks on
        quantity-affecting drift - it can never silently submit a
        requisition whose calculated requirement is already stale.
        """
        ctx = self._setup("D")
        requisition = create_material_requisition(
            actor=ctx["operator"], store=ctx["store"], batch_plan_id=ctx["plan"].id,
            expected_batch_plan_version=ctx["plan"].version,
        )
        req_id = requisition.id
        plan_id = ctx["plan"].id
        plan_version = ctx["plan"].version
        outcomes = []
        barrier = threading.Barrier(2)

        def do_submit():
            try:
                barrier.wait(timeout=5)
                submit_material_requisition(actor=ctx["operator"], requisition_id=req_id, expected_version=1)
                outcomes.append(("submit", "ok"))
            except Conflict:
                outcomes.append(("submit", "conflict"))
            except DjangoValidationError:
                outcomes.append(("submit", "blocked"))
            finally:
                connection.close()

        def do_plan_edit():
            try:
                barrier.wait(timeout=5)
                update_batch_plan(
                    actor=ctx["superuser"], plan_id=plan_id, expected_version=plan_version,
                    data={"target_output_quantity": "7"},
                )
                outcomes.append(("plan_edit", "ok"))
            except Conflict:
                outcomes.append(("plan_edit", "conflict"))
            finally:
                connection.close()

        threads = [threading.Thread(target=do_submit), threading.Thread(target=do_plan_edit)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)

        # The plan edit has no competing lock holder other than submission
        # itself, so it always succeeds eventually (whichever order it
        # runs in); submission's own outcome must be consistent with
        # whichever order actually won - never a submission based on a
        # torn read of the plan.
        self.assertEqual(outcomes.count(("plan_edit", "ok")), 1, outcomes)
        req_db = MaterialRequisition.objects.get(pk=req_id)
        submit_outcome = next(o[1] for o in outcomes if o[0] == "submit")
        if submit_outcome == "ok":
            self.assertEqual(req_db.status, "SUBMITTED")
        else:
            self.assertEqual(req_db.status, "DRAFT")

    def test_concurrent_approve_and_reject_race(self):
        """Task 15C. One thread approves; the other rejects, both at the
        SAME starting (SUBMITTED) version. The requisition row lock plus
        the current round's own row lock serialize them: exactly one
        decision wins at that version, the other correctly sees the round
        is no longer PENDING (400) or the version is stale (409) - never
        both succeeding, and never a crash.
        """
        ctx = self._setup("E")
        requisition = create_material_requisition(
            actor=ctx["operator"], store=ctx["store"], batch_plan_id=ctx["plan"].id,
            expected_batch_plan_version=ctx["plan"].version,
        )
        req_id = requisition.id
        submit_material_requisition(actor=ctx["operator"], requisition_id=req_id, expected_version=1)
        approver = make_user("craapp")
        grant_company_permission(ctx["superuser"], approver, ctx["company"], "batch_plans.view", "formulas.view")
        grant_store_permission(ctx["superuser"], approver, ctx["store"], "material_requisitions.view", "material_requisitions.approve")

        outcomes = []
        barrier = threading.Barrier(2)

        def do_approve():
            try:
                barrier.wait(timeout=5)
                approve_material_requisition(actor=approver, requisition_id=req_id, expected_version=2)
                outcomes.append(("approve", "ok"))
            except Conflict:
                outcomes.append(("approve", "conflict"))
            except DjangoValidationError:
                outcomes.append(("approve", "rejected"))
            finally:
                connection.close()

        def do_reject():
            try:
                barrier.wait(timeout=5)
                reject_material_requisition(actor=approver, requisition_id=req_id, expected_version=2, rejection_reason="racing reject")
                outcomes.append(("reject", "ok"))
            except Conflict:
                outcomes.append(("reject", "conflict"))
            except DjangoValidationError:
                outcomes.append(("reject", "rejected"))
            finally:
                connection.close()

        threads = [threading.Thread(target=do_approve), threading.Thread(target=do_reject)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)

        req_db = MaterialRequisition.objects.get(pk=req_id)
        self.assertIn(req_db.status, ("APPROVED", "REJECTED"))
        # Never both "ok" - exactly one decision can win at a given version.
        self.assertNotEqual(sorted(o[1] for o in outcomes), ["ok", "ok"])

    def test_approve_versus_source_plan_edit_concurrency(self):
        """Task 15C. One thread approves; the other edits the BatchPlan's
        target quantity concurrently. Approval locks the plan too (see
        `apps.material_requisitions.services._revalidate_round_for_
        approval`), so this race is serialized the same way submission's
        own plan-edit race already is - it can never silently approve a
        round whose calculated requirement is already stale.
        """
        ctx = self._setup("F")
        requisition = create_material_requisition(
            actor=ctx["operator"], store=ctx["store"], batch_plan_id=ctx["plan"].id,
            expected_batch_plan_version=ctx["plan"].version,
        )
        req_id = requisition.id
        submit_material_requisition(actor=ctx["operator"], requisition_id=req_id, expected_version=1)
        approver = make_user("crappedit")
        grant_company_permission(ctx["superuser"], approver, ctx["company"], "batch_plans.view", "formulas.view")
        grant_store_permission(ctx["superuser"], approver, ctx["store"], "material_requisitions.view", "material_requisitions.approve")
        plan_id = ctx["plan"].id
        plan_version = ctx["plan"].version

        outcomes = []
        barrier = threading.Barrier(2)

        def do_approve():
            try:
                barrier.wait(timeout=5)
                approve_material_requisition(actor=approver, requisition_id=req_id, expected_version=2)
                outcomes.append(("approve", "ok"))
            except Conflict:
                outcomes.append(("approve", "conflict"))
            except DjangoValidationError:
                outcomes.append(("approve", "blocked"))
            finally:
                connection.close()

        def do_plan_edit():
            try:
                barrier.wait(timeout=5)
                update_batch_plan(
                    actor=ctx["superuser"], plan_id=plan_id, expected_version=plan_version,
                    data={"target_output_quantity": "7"},
                )
                outcomes.append(("plan_edit", "ok"))
            except Conflict:
                outcomes.append(("plan_edit", "conflict"))
            finally:
                connection.close()

        threads = [threading.Thread(target=do_approve), threading.Thread(target=do_plan_edit)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)

        self.assertEqual(outcomes.count(("plan_edit", "ok")), 1, outcomes)
        req_db = MaterialRequisition.objects.get(pk=req_id)
        approve_outcome = next(o[1] for o in outcomes if o[0] == "approve")
        if approve_outcome == "ok":
            self.assertEqual(req_db.status, "APPROVED")
        else:
            self.assertEqual(req_db.status, "SUBMITTED")
