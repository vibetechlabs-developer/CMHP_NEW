import datetime
import itertools
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import Client, TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.batch_plans.models import BatchPlan
from apps.batch_plans.numbering import allocate_batch_number
from apps.batch_plans.services import create_batch_plan
from apps.catalog.models import Material, UnitOfMeasure
from apps.companies.models import Company
from apps.customers.models import Customer
from apps.formulas.models import Formula, FormulaLine, FormulaRevision
from apps.material_requisitions.services import create_material_requisition, submit_material_requisition
from apps.permissions.services import (
    create_company_role,
    create_store_role,
    replace_role_permissions,
    replace_store_role_permissions,
)
from apps.products.models import Product
from apps.sales_orders.services import create_sales_order
from apps.store_preparation.services import create_store_preparation
from apps.stores.models import SharedStore
from apps.stores.services import (
    assign_store_membership,
    assign_store_membership_role,
    deactivate_store,
    deactivate_store_membership,
)
from apps.users.services import assign_company_membership, assign_membership_role
from rest_framework_simplejwt.tokens import AccessToken

User = get_user_model()
PASSWORD = "a-strong-pass-1"
_counter = itertools.count()


def _unique(prefix):
    return f"{prefix}{next(_counter)}"


def register_url(company_id):
    return f"/api/v1/companies/{company_id}/batch-register/"


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


def make_unit(prefix="UOM", dimension=UnitOfMeasure.Dimension.COUNT, is_active=True, canonical_factor=None):
    code = _unique(prefix)
    return UnitOfMeasure.objects.create(
        code=code, name=f"{code} Name", dimension=dimension, is_active=is_active, canonical_factor=canonical_factor
    )


def make_material(prefix="MAT", kind=Material.Kind.RAW_MATERIAL, unit=None):
    if unit is None:
        unit = make_unit("KG", UnitOfMeasure.Dimension.MASS)
    code = _unique(prefix)
    return Material.objects.create(code=code, name=f"{code} Name", kind=kind, base_unit=unit)


def make_product(company, unit, actor, prefix="PRD"):
    code = _unique(prefix)
    return Product.objects.create(company=company, code=code, name=f"{code} Product", sales_uom=unit, created_by=actor)


def make_customer(company, actor, prefix="CUST"):
    code = _unique(prefix)
    return Customer.objects.create(company=company, code=code, name=f"{code} Customer Ltd", created_by=actor)


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


def approve_revision_directly(revision, approver):
    revision.status = FormulaRevision.Status.APPROVED
    revision.approved_by = approver
    revision.approved_at = timezone.now()
    revision.approval_policy_version = 1
    revision.approval_policy_snapshot = {"allow_self_approval": True}
    revision.save()
    return revision


def build_plan(*, company, superuser, output_unit, base_output, target, line_specs, product=None,
                order_quantity=Decimal("1000"), customer=None, order_date=None,
                planned_pack_quantity=None, packing_content_quantity=None, packing_content_uom=None):
    if product is None:
        product = make_product(company, output_unit, superuser)
    if customer is None:
        customer = make_customer(company, superuser)
    order = create_sales_order(
        actor=superuser, company=company, customer_id=customer.id, currency="INR",
        order_date=order_date or datetime.date(2026, 7, 15),
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
        planned_pack_quantity=planned_pack_quantity, packing_content_quantity=packing_content_quantity,
        packing_content_uom_id=packing_content_uom.id if packing_content_uom else None,
    )
    return dict(order=order, line=line, formula=formula, revision=revision, plan=plan, product=product, customer=customer)


class BatchRegisterTestCase(TestCase):
    def setUp(self):
        self.superuser = make_superuser("bradmin")
        self.company = make_company("BRC")
        self.other_company = make_company("BRC2")
        self.store = make_store("BRWH")
        self.unit = make_unit("BRU", UnitOfMeasure.Dimension.COUNT)
        self.mass_unit = make_unit("BRM", UnitOfMeasure.Dimension.MASS)

        ctx = build_plan(
            company=self.company, superuser=self.superuser, output_unit=self.unit,
            base_output=Decimal("100.000"), target=Decimal("50"),
            line_specs=[(Material.Kind.RAW_MATERIAL, self.mass_unit, Decimal("10.000"), "RAW")],
        )
        self.order = ctx["order"]
        self.line = ctx["line"]
        self.plan = ctx["plan"]
        self.product = ctx["product"]
        self.customer = ctx["customer"]

        # Full-access persona: company (batch_plans/sales_orders/customers/
        # products/formulas.view) + store (store_preparation/material_
        # requisitions.view).
        self.full_user = make_user("brfull")
        grant_company_permission(
            self.superuser, self.full_user, self.company,
            "batch_plans.view", "sales_orders.view", "customers.view", "products.view", "formulas.view",
        )
        grant_store_permission(
            self.superuser, self.full_user, self.store, "store_preparation.view", "material_requisitions.view"
        )

        # Bare-minimum persona: ONLY batch_plans.view in the company, no
        # store membership at all.
        self.bare_user = make_user("brbare")
        grant_company_permission(self.superuser, self.bare_user, self.company, "batch_plans.view")

        self.client_ = Client()

    def get_register(self, user=None, company_id=None, query=""):
        return self.client_.get(register_url(company_id or self.company.id) + query, **bearer(user or self.full_user))

    def row_for(self, body, plan_id):
        return next(r for r in body["results"] if r["batch_plan_id"] == plan_id)


class AccessAndIsolationTests(BatchRegisterTestCase):
    def test_authentication_required(self):
        self.assertEqual(self.client_.get(register_url(self.company.id)).status_code, 401)

    def test_no_company_membership_is_404_no_superuser_bypass(self):
        outsider = make_user("brout")
        self.assertEqual(self.get_register(user=outsider).status_code, 404)
        self.assertEqual(self.get_register(user=self.superuser).status_code, 404)

    def test_missing_batch_plans_view_is_403_named(self):
        user = make_user("brnoview")
        grant_company_permission(self.superuser, user, self.company)  # bare membership only
        res = self.get_register(user=user)
        self.assertEqual(res.status_code, 403)
        self.assertIn("batch_plans.view", res.json()["detail"])

    def test_other_company_rows_never_appear(self):
        other_ctx = build_plan(
            company=self.other_company, superuser=self.superuser, output_unit=self.unit,
            base_output=Decimal("10.000"), target=Decimal("5"),
            line_specs=[(Material.Kind.RAW_MATERIAL, self.mass_unit, Decimal("1.000"), "OTH")],
        )
        res = self.get_register()
        self.assertEqual(res.status_code, 200)
        ids = [r["batch_plan_id"] for r in res.json()["results"]]
        self.assertIn(self.plan.id, ids)
        self.assertNotIn(other_ctx["plan"].id, ids)

        other_user = make_user("brothco")
        grant_company_permission(self.superuser, other_user, self.other_company, "batch_plans.view")
        res2 = self.get_register(user=other_user, company_id=self.other_company.id)
        self.assertEqual(res2.status_code, 200)
        self.assertEqual([r["batch_plan_id"] for r in res2.json()["results"]], [other_ctx["plan"].id])

    def test_unsupported_methods_are_405(self):
        for method in ("post", "patch", "put", "delete"):
            res = getattr(self.client_, method)(register_url(self.company.id), **bearer(self.full_user))
            self.assertEqual(res.status_code, 405, method)


class RowShapeTests(BatchRegisterTestCase):
    def test_multiple_plans_for_one_order_line_each_get_their_own_row(self):
        second_ctx = build_plan(
            company=self.company, superuser=self.superuser, output_unit=self.unit,
            base_output=Decimal("100.000"), target=Decimal("20"),
            line_specs=[(Material.Kind.RAW_MATERIAL, self.mass_unit, Decimal("1.000"), "SECOND")],
            product=self.product, customer=self.customer,
        )
        # Force the SAME order line by creating the second plan against it directly.
        second_plan = create_batch_plan(
            actor=self.superuser, company=self.company, sales_order_line_id=self.line.id,
            formula_revision_id=second_ctx["revision"].id, target_output_quantity="20",
        )
        res = self.get_register()
        body = res.json()
        ids = [r["batch_plan_id"] for r in body["results"]]
        self.assertIn(self.plan.id, ids)
        self.assertIn(second_plan.id, ids)
        for r in body["results"]:
            if r["batch_plan_id"] in (self.plan.id, second_plan.id):
                self.assertEqual(r["sales_order_line_id"], self.line.id)

    def test_snapshot_vs_current_product_fields(self):
        from apps.products.services import update_product

        original_name = self.product.name
        update_product(actor=self.superuser, product_id=self.product.id, expected_version=1, data={"name": "Renamed Later"})
        res = self.get_register()
        row = self.row_for(res.json(), self.plan.id)
        # The SNAPSHOT is frozen at plan-creation time - it never reflects
        # the rename that happened afterward.
        self.assertEqual(row["product_name_snapshot"], original_name)
        self.assertNotEqual(row["product_name_snapshot"], "Renamed Later")
        # ...product_type_current is explicitly live/current, never frozen -
        # it would reflect a product_type change immediately, unlike the
        # snapshot above.
        self.assertEqual(row["product_type_current"]["access"], "accessible")
        self.assertIn("value", row["product_type_current"])

    def test_packing_quantity_and_unit_mapping(self):
        gram_unit = make_unit("BRG", UnitOfMeasure.Dimension.MASS, canonical_factor=Decimal("1"))
        output_kg_unit = make_unit("BRKG", UnitOfMeasure.Dimension.MASS, canonical_factor=Decimal("1000"))
        bottle_product = make_product(self.company, self.unit, self.superuser, "BRBTL")
        ctx = build_plan(
            company=self.company, superuser=self.superuser, output_unit=output_kg_unit,
            base_output=Decimal("76.000"), target=Decimal("76"),
            line_specs=[(Material.Kind.RAW_MATERIAL, self.mass_unit, Decimal("1.000"), "PACK")],
            product=bottle_product, customer=self.customer,
            planned_pack_quantity=Decimal("3024"), packing_content_quantity=Decimal("25"),
            packing_content_uom=gram_unit,
        )
        res = self.get_register()
        row = self.row_for(res.json(), ctx["plan"].id)
        self.assertEqual(row["packing_content_quantity"], "25.000")
        self.assertEqual(row["packing_content_uom_code"], gram_unit.code)
        self.assertEqual(row["target_output_quantity"], "76.000")
        self.assertEqual(row["output_uom_code"], output_kg_unit.code)

    def test_optional_batch_number_absent_then_present(self):
        res = self.get_register()
        row = self.row_for(res.json(), self.plan.id)
        self.assertIsNone(row["official_batch_number"])

        grant_company_permission(self.superuser, self.full_user, self.company, "batch_plans.view", "batch_plans.allocate_number")
        allocate_batch_number(actor=self.full_user, company_id=self.company.id, plan_id=self.plan.id, expected_version=self.plan.version)

        res2 = self.get_register()
        row2 = self.row_for(res2.json(), self.plan.id)
        self.assertIsNotNone(row2["official_batch_number"])
        self.assertTrue(row2["official_batch_number"].startswith(self.customer.code))

    def test_no_recipe_price_or_invented_status_fields_anywhere(self):
        res = self.get_register()
        row = self.row_for(res.json(), self.plan.id)
        forbidden = (
            "lines", "material_lines", "unit_price", "price", "mrp", "printing_status", "bmr_status",
            "production_status", "packaging_status", "dispatch_status", "available_stock", "approval_status",
        )
        flat = str(row)
        for word in forbidden:
            self.assertNotIn(f'"{word}"', flat, word)


class RestrictedSectionTests(BatchRegisterTestCase):
    def test_bare_user_sees_restricted_or_unavailable_for_every_optional_section(self):
        res = self.get_register(user=self.bare_user)
        row = self.row_for(res.json(), self.plan.id)
        self.assertEqual(row["order_context"], {"access": "restricted"})
        self.assertEqual(row["customer"], {"access": "restricted"})
        self.assertEqual(row["product_type_current"], {"access": "restricted"})
        # store_preparation/material_requisition use the distinct
        # "unavailable" contract (Task 15B.1) - a flat permission denial
        # is just one of several states that collapse to this same shape.
        self.assertEqual(row["store_preparation"], {"access": "unavailable"})
        self.assertEqual(row["material_requisition"], {"access": "unavailable"})

    def test_no_existence_leak_for_bare_user_across_a_row_with_and_without_preparation(self):
        create_store_preparation(actor=self.full_user, store=self.store, batch_plan=self.plan, packing_type="X")
        other_ctx = build_plan(
            company=self.company, superuser=self.superuser, output_unit=self.unit,
            base_output=Decimal("10.000"), target=Decimal("5"),
            line_specs=[(Material.Kind.RAW_MATERIAL, self.mass_unit, Decimal("1.000"), "NOPRE"),],
            customer=self.customer,
        )
        res = self.get_register(user=self.bare_user)
        body = res.json()
        row_with = self.row_for(body, self.plan.id)
        row_without = self.row_for(body, other_ctx["plan"].id)
        # Identical representation either way - never "exists: true/false"
        # leaking through to a caller with zero store access at all.
        self.assertEqual(row_with["store_preparation"], row_without["store_preparation"])
        self.assertEqual(row_with["store_preparation"], {"access": "unavailable"})

    def test_formulas_view_alone_without_store_access_still_marks_requisition_unavailable(self):
        formulas_only_user = make_user("brfmonly")
        grant_company_permission(self.superuser, formulas_only_user, self.company, "batch_plans.view", "formulas.view")
        res = self.get_register(user=formulas_only_user)
        row = self.row_for(res.json(), self.plan.id)
        self.assertEqual(row["material_requisition"], {"access": "unavailable"})

    def test_store_access_without_formulas_view_still_marks_requisition_unavailable(self):
        store_only_user = make_user("brstonly")
        grant_company_permission(self.superuser, store_only_user, self.company, "batch_plans.view")
        grant_store_permission(self.superuser, store_only_user, self.store, "material_requisitions.view")
        res = self.get_register(user=store_only_user)
        row = self.row_for(res.json(), self.plan.id)
        self.assertEqual(row["material_requisition"], {"access": "unavailable"})


class PartialStoreAccessDisclosureTests(BatchRegisterTestCase):
    """Task 15B.1/15B.2: a caller who holds store_preparation.view/
    material_requisitions.view in SOME stores, but not the SPECIFIC store
    a hidden related record happens to live in (or in NO store at all for
    that record). Task 15B.1 first closed this for records hidden in an
    inaccessible ACTIVE store via a "full coverage of every active store"
    exception; Task 15B.2 found that exception itself could be fooled by
    a store that was deactivated AFTER a record was created in it (a
    StorePreparation/MaterialRequisition row survives its store's
    deactivation - the FK is PROTECT, not CASCADE), so it was removed
    entirely. These tests pin the CURRENT, simpler behavior: ANY related
    record this caller cannot currently see - absent, hidden in an
    inaccessible active store, or hidden in a now-inactive store - always
    renders identically as `{"access": "unavailable"}`; only a record in
    a store the caller currently holds the permission in shows full
    detail.
    """

    def setUp(self):
        super().setUp()
        # A second store, never granted to partial_user - this is what
        # makes partial_user's access a PROPER SUBSET of all active
        # stores, the exact condition the fix's full-coverage check must
        # catch.
        self.second_store = make_store("BRWH2")
        self.partial_user = make_user("brpartial")
        grant_company_permission(
            self.superuser, self.partial_user, self.company, "batch_plans.view", "formulas.view",
        )
        self.partial_membership = grant_store_permission(
            self.superuser, self.partial_user, self.store, "store_preparation.view", "material_requisitions.view",
        )

    def get_partial(self, query=""):
        return self.get_register(user=self.partial_user, query=query)

    def test_no_related_record_is_unavailable_not_exists_false(self):
        res = self.get_partial()
        row = self.row_for(res.json(), self.plan.id)
        self.assertEqual(row["store_preparation"], {"access": "unavailable"})
        self.assertEqual(row["material_requisition"], {"access": "unavailable"})

    def test_related_record_in_inaccessible_store_is_unavailable(self):
        create_store_preparation(actor=self.full_user, store=self.second_store, batch_plan=self.plan, packing_type="HIDDEN")
        create_material_requisition(
            actor=self.full_user, store=self.second_store, batch_plan_id=self.plan.id,
            expected_batch_plan_version=BatchPlan.objects.get(pk=self.plan.id).version,
        )
        res = self.get_partial()
        row = self.row_for(res.json(), self.plan.id)
        self.assertEqual(row["store_preparation"], {"access": "unavailable"})
        self.assertEqual(row["material_requisition"], {"access": "unavailable"})

    def test_absent_and_hidden_in_other_store_render_identically(self):
        """The core assertion: an ABSENT record and a record HIDDEN in an
        inaccessible store must be indistinguishable to this caller.
        """
        other_ctx = build_plan(
            company=self.company, superuser=self.superuser, output_unit=self.unit,
            base_output=Decimal("10.000"), target=Decimal("5"),
            line_specs=[(Material.Kind.RAW_MATERIAL, self.mass_unit, Decimal("1.000"), "ABSENT")],
            customer=self.customer,
        )
        create_store_preparation(actor=self.full_user, store=self.second_store, batch_plan=self.plan, packing_type="HIDDEN")
        res = self.get_partial()
        body = res.json()
        row_absent = self.row_for(body, other_ctx["plan"].id)
        row_hidden = self.row_for(body, self.plan.id)
        self.assertEqual(row_absent["store_preparation"], row_hidden["store_preparation"])
        self.assertEqual(row_absent["store_preparation"], {"access": "unavailable"})

    def test_related_record_in_accessible_store_still_shows_full_detail(self):
        """Partial access must not degrade authorized detail - the caller
        still sees everything for a record in a store they DO have
        access to.
        """
        prep = create_store_preparation(actor=self.full_user, store=self.store, batch_plan=self.plan, packing_type="VISIBLE", insert_required=True)
        requisition = create_material_requisition(
            actor=self.full_user, store=self.store, batch_plan_id=self.plan.id,
            expected_batch_plan_version=BatchPlan.objects.get(pk=self.plan.id).version,
        )
        res = self.get_partial()
        row = self.row_for(res.json(), self.plan.id)
        self.assertEqual(row["store_preparation"], {
            "access": "accessible", "exists": True, "id": prep.id,
            "packing_type": "VISIBLE", "insert_required": True, "version": prep.version,
        })
        self.assertEqual(row["material_requisition"], {
            "access": "accessible", "exists": True, "id": requisition.id,
            "status": "DRAFT", "version": requisition.version,
        })

    def test_revoked_store_membership_flips_accessible_to_unavailable(self):
        prep = create_store_preparation(actor=self.full_user, store=self.store, batch_plan=self.plan, packing_type="X")
        res_before = self.get_partial()
        row_before = self.row_for(res_before.json(), self.plan.id)
        self.assertTrue(row_before["store_preparation"]["exists"])

        deactivate_store_membership(actor=self.superuser, membership=self.partial_membership)
        res_after = self.get_partial()
        row_after = self.row_for(res_after.json(), self.plan.id)
        self.assertEqual(row_after["store_preparation"], {"access": "unavailable"})
        # Never a 403/404 for the row itself - batch_plans.view in the
        # company is untouched; only this one section's visibility changed.
        self.assertEqual(res_after.status_code, 200)

    def test_missing_formulas_view_marks_requisition_unavailable_even_with_full_store_coverage(self):
        """formulas.view is a flat, non-existence-dependent gate - full
        store coverage must not bypass it.
        """
        full_store_no_formulas_user = make_user("brfullnoform")
        grant_company_permission(self.superuser, full_store_no_formulas_user, self.company, "batch_plans.view")
        grant_store_permission(self.superuser, full_store_no_formulas_user, self.store, "material_requisitions.view")
        grant_store_permission(self.superuser, full_store_no_formulas_user, self.second_store, "material_requisitions.view")
        requisition = create_material_requisition(
            actor=self.full_user, store=self.store, batch_plan_id=self.plan.id,
            expected_batch_plan_version=BatchPlan.objects.get(pk=self.plan.id).version,
        )
        res = self.get_register(user=full_store_no_formulas_user)
        row = self.row_for(res.json(), self.plan.id)
        self.assertEqual(row["material_requisition"], {"access": "unavailable"})

    def test_filters_and_counts_do_not_reveal_hidden_related_records(self):
        """No filter exists to probe store_preparation/material_requisition
        existence, and result counts must not shrink/grow based on a
        section this caller cannot see - confirms there is no secondary
        disclosure path through pagination/counting.
        """
        create_store_preparation(actor=self.full_user, store=self.second_store, batch_plan=self.plan, packing_type="HIDDEN")
        res_full = self.get_register(user=self.full_user)
        res_partial = self.get_partial()
        self.assertEqual(res_full.json()["count"], res_partial.json()["count"])
        ids_full = {r["batch_plan_id"] for r in res_full.json()["results"]}
        ids_partial = {r["batch_plan_id"] for r in res_partial.json()["results"]}
        self.assertEqual(ids_full, ids_partial)

    def test_source_drift_product_detail_unavailable_without_products_view(self):
        """Task 15B.2: redacting only the issue MESSAGE was insufficient,
        since the bare CODE ("INACTIVE_PRODUCT") already names the
        protected live fact. The product-gated codes must not appear at
        all - neither code, message, nor any other metadata - inside
        `issues` for a caller lacking products.view; the whole product
        assessment collapses to `product_detail: {"access":
        "unavailable"}` instead. `is_incompatible` (the generic,
        already-authorized signal) and any non-product issue remain
        visible either way.
        """
        from apps.products.services import deactivate_product

        deactivate_product(actor=self.superuser, product_id=self.product.id, expected_version=1)
        res = self.get_partial()
        row = self.row_for(res.json(), self.plan.id)
        codes = {issue["code"] for issue in row["source_drift"]["issues"]}
        self.assertNotIn("INACTIVE_PRODUCT", codes)
        self.assertNotIn(self.product.code, str(row["source_drift"]))
        self.assertEqual(row["source_drift"]["product_detail"], {"access": "unavailable"})

        res_full = self.get_register(user=self.full_user)
        row_full = self.row_for(res_full.json(), self.plan.id)
        self.assertEqual(row_full["source_drift"]["product_detail"]["access"], "accessible")
        full_codes = {issue["code"] for issue in row_full["source_drift"]["product_detail"]["issues"]}
        self.assertIn("INACTIVE_PRODUCT", full_codes)
        for issue in row_full["source_drift"]["product_detail"]["issues"]:
            if issue["code"] == "INACTIVE_PRODUCT":
                self.assertIn(self.product.code, issue["message"])

    def test_source_drift_is_incompatible_signal_remains_visible_without_products_view(self):
        """`is_incompatible` is already part of the existing authorized
        BatchPlan contract (apps.batch_plans.serializers.
        BatchPlanDetailSerializer exposes it to any batch_plans.view
        holder, ungated by products.view) - it must stay visible here
        too, even when the drift is itself product-related, since it
        names no specific current-master fact by itself.
        """
        other_product = make_product(self.company, self.mass_unit, self.superuser, "BRINCOMP")
        # Swap the order line onto a different product than the formula's own, to force is_incompatible True.
        self.line.product = other_product
        self.line.save(update_fields=["product"])
        res = self.get_partial()
        row = self.row_for(res.json(), self.plan.id)
        self.assertTrue(row["source_drift"]["is_incompatible"])
        self.assertEqual(row["source_drift"]["product_detail"], {"access": "unavailable"})

    def test_absent_vs_hidden_inactive_store_equivalence(self):
        """Task 15B.2, part 1: a record that exists but lives in a store
        which has SINCE been deactivated must render identically to a
        plan with no record at all - the Task 15B.1 "full coverage of
        every ACTIVE store" exception could be fooled by exactly this,
        since a deactivated store drops out of "every active store"
        while still holding a real row.
        """
        third_store = make_store("BRWH3")
        third_ctx = build_plan(
            company=self.company, superuser=self.superuser, output_unit=self.unit,
            base_output=Decimal("10.000"), target=Decimal("5"),
            line_specs=[(Material.Kind.RAW_MATERIAL, self.mass_unit, Decimal("1.000"), "WASACTIVE")],
            customer=self.customer,
        )
        create_store_preparation(actor=self.full_user, store=third_store, batch_plan=third_ctx["plan"], packing_type="WAS_ACTIVE")
        deactivate_store(actor=self.superuser, store=third_store)

        res = self.get_partial()
        body = res.json()
        row_absent = self.row_for(body, self.plan.id)
        row_inactive_store = self.row_for(body, third_ctx["plan"].id)
        self.assertEqual(row_absent["store_preparation"], {"access": "unavailable"})
        self.assertEqual(row_inactive_store["store_preparation"], row_absent["store_preparation"])

    def test_inaccessible_active_absent_and_inactive_store_all_equivalent_for_one_caller(self):
        """The full three-way comparison this task asks for, for the SAME
        caller in one request: no related record, a record in an
        inaccessible ACTIVE store, and a record in an INACTIVE store all
        render identically.
        """
        active_other_ctx = build_plan(
            company=self.company, superuser=self.superuser, output_unit=self.unit,
            base_output=Decimal("10.000"), target=Decimal("5"),
            line_specs=[(Material.Kind.RAW_MATERIAL, self.mass_unit, Decimal("1.000"), "ACTIVEHID")],
            customer=self.customer,
        )
        create_store_preparation(actor=self.full_user, store=self.second_store, batch_plan=active_other_ctx["plan"], packing_type="ACTIVE_HIDDEN")

        third_store = make_store("BRWH4")
        inactive_ctx = build_plan(
            company=self.company, superuser=self.superuser, output_unit=self.unit,
            base_output=Decimal("10.000"), target=Decimal("5"),
            line_specs=[(Material.Kind.RAW_MATERIAL, self.mass_unit, Decimal("1.000"), "WASACTIVE2")],
            customer=self.customer,
        )
        create_store_preparation(actor=self.full_user, store=third_store, batch_plan=inactive_ctx["plan"], packing_type="WAS_ACTIVE")
        deactivate_store(actor=self.superuser, store=third_store)

        res = self.get_partial()
        body = res.json()
        shapes = {
            "absent": self.row_for(body, self.plan.id)["store_preparation"],
            "inaccessible_active": self.row_for(body, active_other_ctx["plan"].id)["store_preparation"],
            "inactive_store": self.row_for(body, inactive_ctx["plan"].id)["store_preparation"],
        }
        self.assertEqual(len(set(map(str, shapes.values()))), 1, shapes)
        self.assertEqual(shapes["absent"], {"access": "unavailable"})


class MissingAndPresentRelatedRecordTests(BatchRegisterTestCase):
    def test_missing_store_preparation_and_requisition_are_unavailable_not_exists_false(self):
        """Task 15B.2: `exists: false` for an absent record was removed
        entirely, even for a caller with full access to every store that
        currently exists - a store can be deactivated after a record was
        created in it, so no caller can ever safely be told "no record
        exists anywhere", only "none is visible to you right now".
        """
        res = self.get_register()
        row = self.row_for(res.json(), self.plan.id)
        self.assertEqual(row["store_preparation"], {"access": "unavailable"})
        self.assertEqual(row["material_requisition"], {"access": "unavailable"})

    def test_present_store_preparation_summary(self):
        prep = create_store_preparation(actor=self.full_user, store=self.store, batch_plan=self.plan, packing_type="25 Gm G2", insert_required=True)
        res = self.get_register()
        row = self.row_for(res.json(), self.plan.id)
        self.assertEqual(row["store_preparation"]["access"], "accessible")
        self.assertTrue(row["store_preparation"]["exists"])
        self.assertEqual(row["store_preparation"]["id"], prep.id)
        self.assertEqual(row["store_preparation"]["packing_type"], "25 Gm G2")
        self.assertTrue(row["store_preparation"]["insert_required"])

    def test_requisition_draft_versus_submitted_status(self):
        requisition = create_material_requisition(
            actor=self.full_user, store=self.store, batch_plan_id=self.plan.id, expected_batch_plan_version=self.plan.version,
        )
        res = self.get_register()
        row = self.row_for(res.json(), self.plan.id)
        self.assertEqual(row["material_requisition"]["status"], "DRAFT")

        grant_store_permission(self.superuser, self.full_user, self.store, "material_requisitions.view", "material_requisitions.submit")
        submit_material_requisition(actor=self.full_user, requisition_id=requisition.id, expected_version=requisition.version)
        res2 = self.get_register()
        row2 = self.row_for(res2.json(), self.plan.id)
        self.assertEqual(row2["material_requisition"]["status"], "SUBMITTED")


class FilterSearchOrderingTests(BatchRegisterTestCase):
    def test_unknown_query_param_rejected(self):
        res = self.get_register(query="?bogus=1")
        self.assertEqual(res.status_code, 400)
        self.assertIn("bogus", res.json())

    def test_customer_filter_requires_customers_view(self):
        limited_user = make_user("brlimited")
        grant_company_permission(self.superuser, limited_user, self.company, "batch_plans.view")
        res = self.get_register(user=limited_user, query=f"?customer={self.customer.id}")
        self.assertEqual(res.status_code, 403)

    def test_order_date_filter_requires_sales_orders_view(self):
        limited_user = make_user("brlimited2")
        grant_company_permission(self.superuser, limited_user, self.company, "batch_plans.view")
        res = self.get_register(user=limited_user, query="?order_date_from=2026-01-01")
        self.assertEqual(res.status_code, 403)

    def test_product_filter_works(self):
        res = self.get_register(query=f"?product={self.product.id}")
        self.assertEqual(res.status_code, 200)
        ids = [r["batch_plan_id"] for r in res.json()["results"]]
        self.assertIn(self.plan.id, ids)

    def test_has_batch_number_filter(self):
        grant_company_permission(self.superuser, self.full_user, self.company, "batch_plans.view", "batch_plans.allocate_number")
        allocate_batch_number(actor=self.full_user, company_id=self.company.id, plan_id=self.plan.id, expected_version=self.plan.version)
        res_true = self.get_register(query="?has_batch_number=true")
        self.assertIn(self.plan.id, [r["batch_plan_id"] for r in res_true.json()["results"]])
        res_false = self.get_register(query="?has_batch_number=false")
        self.assertNotIn(self.plan.id, [r["batch_plan_id"] for r in res_false.json()["results"]])

    def test_search_by_batch_number(self):
        grant_company_permission(self.superuser, self.full_user, self.company, "batch_plans.view", "batch_plans.allocate_number")
        allocation_plan = BatchPlan.objects.get(pk=self.plan.id)
        _, allocation = allocate_batch_number(actor=self.full_user, company_id=self.company.id, plan_id=self.plan.id, expected_version=allocation_plan.version)
        res = self.get_register(query=f"?search={allocation.number}")
        self.assertEqual([r["batch_plan_id"] for r in res.json()["results"]], [self.plan.id])

    def test_invalid_order_value_rejected(self):
        res = self.get_register(query="?order=product_code_snapshot")
        self.assertEqual(res.status_code, 400)

    def test_deterministic_ordering_stable_across_repeated_calls(self):
        for i in range(3):
            build_plan(
                company=self.company, superuser=self.superuser, output_unit=self.unit,
                base_output=Decimal("10.000"), target=Decimal("5"),
                line_specs=[(Material.Kind.RAW_MATERIAL, self.mass_unit, Decimal("1.000"), f"ORD{i}")],
                customer=self.customer,
            )
        first = [r["batch_plan_id"] for r in self.get_register().json()["results"]]
        second = [r["batch_plan_id"] for r in self.get_register().json()["results"]]
        self.assertEqual(first, second)

    def test_pagination_bounded(self):
        res = self.get_register(query="?page_size=1000")
        self.assertEqual(res.status_code, 200)
        self.assertLessEqual(len(res.json()["results"]), 100)


class PerformanceTests(BatchRegisterTestCase):
    def test_bounded_query_count_across_multiple_rows(self):
        for i in range(10):
            ctx = build_plan(
                company=self.company, superuser=self.superuser, output_unit=self.unit,
                base_output=Decimal("10.000"), target=Decimal("5"),
                line_specs=[(Material.Kind.RAW_MATERIAL, self.mass_unit, Decimal("1.000"), f"PERF{i}")],
                customer=self.customer,
            )
            create_store_preparation(actor=self.full_user, store=self.store, batch_plan=ctx["plan"], packing_type="X")
            create_material_requisition(
                actor=self.full_user, store=self.store, batch_plan_id=ctx["plan"].id,
                expected_batch_plan_version=ctx["plan"].version,
            )
        with CaptureQueriesContext(connection) as queries:
            res = self.get_register(query="?page_size=50")
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(len(res.json()["results"]), 10)
        self.assertLess(len(queries), 30, f"{len(queries)} queries for a page of rows - check for a per-row query")


class AuditAndWriteTests(BatchRegisterTestCase):
    def test_get_writes_no_audit_event_and_bumps_no_version(self):
        from apps.audit.models import AuditLog

        before_count = AuditLog.objects.count()
        before_version = BatchPlan.objects.get(pk=self.plan.id).version
        self.get_register()
        self.get_register()
        self.assertEqual(AuditLog.objects.count(), before_count)
        self.assertEqual(BatchPlan.objects.get(pk=self.plan.id).version, before_version)
