import json
import threading
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.test import Client, TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from apps.audit.models import AuditLog
from apps.catalog.models import Material, MaterialCategory, UnitOfMeasure
from apps.common.errors import Conflict
from apps.companies.models import Company
from apps.permissions.services import create_company_role, replace_role_permissions
from apps.purchasing.admin import PurchaseOrderAdmin
from apps.purchasing.models import (
    PurchaseOrder,
    PurchaseOrderIssueLineSnapshot,
    PurchaseOrderIssueSnapshot,
    PurchaseOrderLine,
    PurchaseRequest,
)
from apps.purchasing.services import (
    _SUPPORTED_ISSUE_CURRENCIES,
    approve_purchase_request,
    cancel_purchase_order,
    create_purchase_order,
    create_purchase_request,
    issue_purchase_order,
    submit_purchase_request,
    update_purchase_order,
)
from apps.suppliers.models import Supplier
from apps.users.services import assign_company_membership, assign_membership_role

User = get_user_model()
PASSWORD = "a-strong-pass-1"


def purchase_orders_url(company_id):
    return f"/api/v1/companies/{company_id}/purchase-orders/"


def purchase_order_url(company_id, order_id):
    return f"/api/v1/companies/{company_id}/purchase-orders/{order_id}/"


def po_cancel_url(company_id, order_id):
    return f"/api/v1/companies/{company_id}/purchase-orders/{order_id}/cancel/"


def po_issue_url(company_id, order_id):
    return f"/api/v1/companies/{company_id}/purchase-orders/{order_id}/issue/"


def make_user(username, password=PASSWORD, **kwargs):
    return User.objects.create_user(
        username=username, email=f"{username}@example.com", password=password, **kwargs
    )


def make_superuser(username, password=PASSWORD):
    return User.objects.create_superuser(
        username=username, email=f"{username}@example.com", password=password
    )


def make_company(code, **kwargs):
    return Company.objects.create(code=code, legal_name=f"{code} Legal Name Pvt Ltd", **kwargs)


def make_unit(code, dimension="MASS", **kwargs):
    return UnitOfMeasure.objects.create(code=code, name=code, dimension=dimension, **kwargs)


def make_category(code, **kwargs):
    return MaterialCategory.objects.create(code=code, name=code, **kwargs)


def make_material(code, base_unit, kind="RAW_MATERIAL", category=None, name=None, **kwargs):
    return Material.objects.create(
        code=code, name=name or code, kind=kind, base_unit=base_unit, category=category, **kwargs
    )


def make_supplier(code, legal_name=None, **kwargs):
    return Supplier.objects.create(code=code, legal_name=legal_name or f"{code} Legal Name", **kwargs)


def access_token_for(user):
    return str(AccessToken.for_user(user))


def bearer(token):
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


def get_json(client, url, token, **extra):
    return client.get(url, **bearer(token), **extra)


def post_json(client, url, payload, token):
    return client.post(url, data=json.dumps(payload), content_type="application/json", **bearer(token))


def patch_json(client, url, payload, token):
    return client.patch(url, data=json.dumps(payload), content_type="application/json", **bearer(token))


def grant_company_permission(actor, user, company, *permission_codes):
    """Mirrors tests.test_purchase_requests.grant_company_permission
    exactly - gives `user` an active CompanyMembership in `company` and a
    CompanyRole holding exactly `permission_codes`, via the real service
    layer (never a raw ORM shortcut).
    """
    membership, _ = assign_company_membership(actor=actor, user=user, company=company)
    role = create_company_role(actor=actor, company=company, code=f"ROLE{user.id}", name="Role")
    role, _ = replace_role_permissions(actor=actor, role=role, permission_codes=list(permission_codes))
    assign_membership_role(actor=actor, membership=membership, role=role)
    return membership, role


PR_ALL_PERMS = (
    "purchase_requests.view",
    "purchase_requests.create",
    "purchase_requests.edit",
    "purchase_requests.submit",
    "purchase_requests.cancel",
    "purchase_requests.cancel_pending",
)

PO_ALL_PERMS = (
    "purchase_orders.view",
    "purchase_orders.create",
    "purchase_orders.edit",
    "purchase_orders.cancel",
    "purchase_orders.issue",
)

ALL_PERMS = PR_ALL_PERMS + PO_ALL_PERMS


class PurchaseOrderTestCase(TestCase):
    def setUp(self):
        self.superuser = make_superuser("admin")
        self.company = make_company("ACME")
        self.other_company = make_company("BETA")
        self.client_ = Client()
        self.unit = make_unit("KG")
        self.category = make_category("HERB")
        self.material = make_material("MAT1", base_unit=self.unit, category=self.category)
        self.supplier = make_supplier("SUP1")
        self.user = make_user("staffuser")
        grant_company_permission(self.superuser, self.user, self.company, *ALL_PERMS)
        self.token = access_token_for(self.user)

    def _approver(self, name, company=None):
        approver = make_user(name)
        grant_company_permission(
            self.superuser, approver, company or self.company, "purchase_requests.view", "purchase_requests.approve"
        )
        return approver

    def _approved_pr(self, company=None, requester=None, quantity=Decimal("5"), material=None):
        """Builds a real, fully-APPROVED PurchaseRequest end to end
        (create -> submit -> approve x3 by 3 distinct admins, per Task
        08B-2's provisional distinct-approver-per-step restriction) -
        used as the fixture every Purchase Order test needs, since a PO
        can only ever be created from an already-APPROVED request.
        """
        company = company or self.company
        requester = requester or self.user
        material = material or self.material
        pr = create_purchase_request(
            actor=requester, company=company, lines=[{"material_id": material.id, "quantity": quantity}]
        )
        pr = submit_purchase_request(actor=requester, purchase_request_id=pr.id, expected_version=1)
        for i in range(3):
            approver = self._approver(f"approver_{company.code}_{pr.id}_{i}", company=company)
            pr = approve_purchase_request(
                actor=approver, purchase_request_id=pr.id, expected_version=pr.version,
                expected_round=pr.current_round, expected_step=pr.current_step,
            )
        pr.refresh_from_db()
        return pr

    def _create_po(self, source_purchase_request_id, supplier_id=None, currency_code="INR", token=None, **extra):
        payload = {
            "source_purchase_request_id": source_purchase_request_id,
            "supplier_id": supplier_id or self.supplier.id,
            "currency_code": currency_code,
            **extra,
        }
        return post_json(self.client_, purchase_orders_url(self.company.id), payload, token or self.token)

    def _issue_ready_po(self, quantity=Decimal("5"), unit_price=Decimal("10.0000"), company=None):
        """Builds a DRAFT PurchaseOrder that satisfies every one of
        issue_purchase_order's revalidation checks: a real APPROVED
        source request, a future expected_delivery_date, a supported
        currency (INR, already the default), and a non-zero line price -
        the "happy path" fixture every issue test starts from, then
        deliberately breaks one condition at a time.
        """
        company = company or self.company
        pr = self._approved_pr(company=company, quantity=quantity)
        po = create_purchase_order(
            actor=self.user, company=company, source_purchase_request_id=pr.id,
            supplier_id=self.supplier.id, currency_code="INR",
            expected_delivery_date=timezone.now().date() + timedelta(days=14),
        )
        line = po.lines.get()
        po = update_purchase_order(
            actor=self.user, purchase_order_id=po.id, expected_version=po.version,
            data={"lines": [{"id": line.id, "unit_price": unit_price}]},
        )
        return po


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class PurchaseOrderModelTests(PurchaseOrderTestCase):
    def test_reference_is_unique(self):
        pr = self._approved_pr()
        po = create_purchase_order(
            actor=self.user, company=self.company, source_purchase_request_id=pr.id,
            supplier_id=self.supplier.id, currency_code="INR",
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                PurchaseOrder.objects.create(
                    company=self.company, reference=po.reference, source_purchase_request=pr,
                    supplier=self.supplier, currency_code="INR", created_by=self.user,
                )

    def test_company_immutable_after_creation(self):
        pr = self._approved_pr()
        po = create_purchase_order(
            actor=self.user, company=self.company, source_purchase_request_id=pr.id,
            supplier_id=self.supplier.id, currency_code="INR",
        )
        po.company = self.other_company
        with self.assertRaises(Exception):
            po.save()

    def test_source_purchase_request_immutable_after_creation(self):
        pr = self._approved_pr()
        other_pr = self._approved_pr(quantity=Decimal("1"))
        po = create_purchase_order(
            actor=self.user, company=self.company, source_purchase_request_id=pr.id,
            supplier_id=self.supplier.id, currency_code="INR",
        )
        po.source_purchase_request = other_pr
        with self.assertRaises(Exception):
            po.save()

    def test_currency_code_immutable_after_creation(self):
        pr = self._approved_pr()
        po = create_purchase_order(
            actor=self.user, company=self.company, source_purchase_request_id=pr.id,
            supplier_id=self.supplier.id, currency_code="INR",
        )
        po.currency_code = "USD"
        with self.assertRaises(Exception):
            po.save()

    def test_currency_code_must_be_three_letters(self):
        pr = self._approved_pr()
        po = PurchaseOrder(
            company=self.company, reference="PO-BAD", source_purchase_request=pr, supplier=self.supplier,
            currency_code="INRX", created_by=self.user,
        )
        with self.assertRaises(Exception):
            po.save()

    def test_version_starts_at_one(self):
        pr = self._approved_pr()
        po = create_purchase_order(
            actor=self.user, company=self.company, source_purchase_request_id=pr.id,
            supplier_id=self.supplier.id, currency_code="INR",
        )
        self.assertEqual(po.version, 1)

    def test_starts_draft(self):
        pr = self._approved_pr()
        po = create_purchase_order(
            actor=self.user, company=self.company, source_purchase_request_id=pr.id,
            supplier_id=self.supplier.id, currency_code="INR",
        )
        self.assertEqual(po.status, PurchaseOrder.Status.DRAFT)

    def test_line_quantity_positive_db_constraint_backstops_bulk_create(self):
        pr = self._approved_pr()
        po = create_purchase_order(
            actor=self.user, company=self.company, source_purchase_request_id=pr.id,
            supplier_id=self.supplier.id, currency_code="INR",
        )
        source_round_line = po.lines.get().source_round_line
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                PurchaseOrderLine.objects.bulk_create(
                    [
                        PurchaseOrderLine(
                            purchase_order=po, line_number=99, source_round_line=source_round_line,
                            material=self.material, unit=self.unit, quantity=Decimal("0"),
                        )
                    ]
                )

    def test_line_unit_price_negative_db_constraint_backstops_bulk_create(self):
        pr = self._approved_pr()
        po = create_purchase_order(
            actor=self.user, company=self.company, source_purchase_request_id=pr.id,
            supplier_id=self.supplier.id, currency_code="INR",
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                PurchaseOrderLine.objects.filter(pk=po.lines.get().pk).update(unit_price=Decimal("-1"))

    def test_one_active_po_per_request_db_constraint(self):
        pr = self._approved_pr()
        create_purchase_order(
            actor=self.user, company=self.company, source_purchase_request_id=pr.id,
            supplier_id=self.supplier.id, currency_code="INR",
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                PurchaseOrder.objects.create(
                    company=self.company, reference="PO-DUP", source_purchase_request=pr,
                    supplier=self.supplier, currency_code="INR", created_by=self.user,
                )


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------


class PurchaseOrderAdminAccessRestrictionTests(TestCase):
    def setUp(self):
        from django.test import RequestFactory

        self.factory = RequestFactory()
        self.admin = PurchaseOrderAdmin(PurchaseOrder, admin_site=None)

    def _request_as(self, user):
        request = self.factory.get("/admin/")
        request.user = user
        return request

    def test_active_superuser_can_view_but_not_add_or_change(self):
        superuser = make_superuser("admin")
        request = self._request_as(superuser)
        self.assertTrue(self.admin.has_view_permission(request))
        self.assertFalse(self.admin.has_add_permission(request))
        self.assertFalse(self.admin.has_change_permission(request))
        self.assertFalse(self.admin.has_delete_permission(request))

    def test_ordinary_staff_cannot_view(self):
        staff_user = make_user("staffer", is_staff=True)
        request = self._request_as(staff_user)
        self.assertFalse(self.admin.has_view_permission(request))


# ---------------------------------------------------------------------------
# Authorization
# ---------------------------------------------------------------------------


class PurchaseOrderAuthorizationTests(PurchaseOrderTestCase):
    def test_anonymous_401(self):
        self.assertEqual(self.client_.get(purchase_orders_url(self.company.id)).status_code, 401)

    def test_member_without_permission_403(self):
        user = make_user("noperm")
        grant_company_permission(self.superuser, user, self.company)
        response = get_json(self.client_, purchase_orders_url(self.company.id), access_token_for(user))
        self.assertEqual(response.status_code, 403)

    def test_member_with_view_permission_200(self):
        user = make_user("viewer")
        grant_company_permission(self.superuser, user, self.company, "purchase_orders.view")
        response = get_json(self.client_, purchase_orders_url(self.company.id), access_token_for(user))
        self.assertEqual(response.status_code, 200)

    def test_create_requires_view_and_create_and_pr_view(self):
        pr = self._approved_pr()
        user = make_user("nopr_view")
        grant_company_permission(self.superuser, user, self.company, "purchase_orders.view", "purchase_orders.create")
        response = self._create_po(pr.id, token=access_token_for(user))
        self.assertEqual(response.status_code, 403)

    def test_create_succeeds_with_all_three_permissions(self):
        pr = self._approved_pr()
        user = make_user("hasall")
        grant_company_permission(
            self.superuser, user, self.company,
            "purchase_orders.view", "purchase_orders.create", "purchase_requests.view",
        )
        response = self._create_po(pr.id, token=access_token_for(user))
        self.assertEqual(response.status_code, 201)

    def test_cross_company_source_request_404_not_403(self):
        pr = self._approved_pr(company=self.other_company)
        response = self._create_po(pr.id)
        self.assertEqual(response.status_code, 404)

    def test_nonexistent_source_request_404(self):
        response = self._create_po(999999)
        self.assertEqual(response.status_code, 404)

    def test_list_company_isolation(self):
        pr = self._approved_pr()
        create_purchase_order(
            actor=self.user, company=self.company, source_purchase_request_id=pr.id,
            supplier_id=self.supplier.id, currency_code="INR",
        )
        other_user = make_user("otherviewer")
        grant_company_permission(self.superuser, other_user, self.other_company, "purchase_orders.view")
        response = get_json(self.client_, purchase_orders_url(self.other_company.id), access_token_for(other_user))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["results"], [])

    def test_superuser_without_membership_no_access(self):
        pr = self._approved_pr()
        po = create_purchase_order(
            actor=self.user, company=self.company, source_purchase_request_id=pr.id,
            supplier_id=self.supplier.id, currency_code="INR",
        )
        response = get_json(self.client_, purchase_order_url(self.company.id, po.id), access_token_for(self.superuser))
        self.assertEqual(response.status_code, 404)


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


class PurchaseOrderCreateTests(PurchaseOrderTestCase):
    def test_create_success_copies_approved_snapshot(self):
        pr = self._approved_pr(quantity=Decimal("7.500"))
        response = self._create_po(pr.id)
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["status"], "DRAFT")
        self.assertEqual(body["source_purchase_request_id"], pr.id)
        self.assertEqual(body["currency_code"], "INR")
        self.assertEqual(len(body["lines"]), 1)
        line = body["lines"][0]
        self.assertEqual(line["quantity"], "7.500")
        self.assertEqual(line["material_code_snapshot"], "MAT1")
        self.assertEqual(line["unit_code_snapshot"], "KG")
        self.assertEqual(line["unit_price"], "0.0000")
        self.assertEqual(line["line_amount"], "0.00")
        self.assertEqual(body["subtotal"], "0.00")

    def test_create_requires_approved_source_draft_rejected(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        response = self._create_po(pr.id)
        self.assertEqual(response.status_code, 400)

    def test_create_requires_approved_source_submitted_rejected(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        pr = submit_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=1)
        response = self._create_po(pr.id)
        self.assertEqual(response.status_code, 400)

    def test_duplicate_active_po_rejected(self):
        pr = self._approved_pr()
        first = self._create_po(pr.id)
        self.assertEqual(first.status_code, 201)
        second = self._create_po(pr.id)
        self.assertEqual(second.status_code, 400)

    def test_replacement_po_allowed_after_cancellation(self):
        pr = self._approved_pr()
        first = self._create_po(pr.id)
        po_id = first.json()["id"]
        cancel_purchase_order(
            actor=self.user, purchase_order_id=po_id, expected_version=1, reason="wrong supplier"
        )
        second = self._create_po(pr.id)
        self.assertEqual(second.status_code, 201)
        self.assertNotEqual(second.json()["id"], po_id)

    def test_inactive_supplier_rejected(self):
        pr = self._approved_pr()
        self.supplier.is_active = False
        self.supplier.save(update_fields=["is_active", "updated_at"])
        response = self._create_po(pr.id)
        self.assertEqual(response.status_code, 400)

    def test_inactive_material_rejected(self):
        pr = self._approved_pr()
        self.material.is_active = False
        self.material.save(update_fields=["is_active", "updated_at"])
        response = self._create_po(pr.id)
        self.assertEqual(response.status_code, 400)

    def test_inactive_unit_rejected(self):
        pr = self._approved_pr()
        self.unit.is_active = False
        self.unit.save(update_fields=["is_active", "updated_at"])
        response = self._create_po(pr.id)
        self.assertEqual(response.status_code, 400)

    def test_inactive_category_rejected(self):
        pr = self._approved_pr()
        self.category.is_active = False
        self.category.save(update_fields=["is_active", "updated_at"])
        response = self._create_po(pr.id)
        self.assertEqual(response.status_code, 400)

    def test_missing_currency_code_rejected(self):
        pr = self._approved_pr()
        response = post_json(
            self.client_, purchase_orders_url(self.company.id),
            {"source_purchase_request_id": pr.id, "supplier_id": self.supplier.id}, self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_malformed_currency_code_rejected(self):
        pr = self._approved_pr()
        response = self._create_po(pr.id, currency_code="RS")
        self.assertEqual(response.status_code, 400)

    def test_lowercase_currency_code_normalized(self):
        pr = self._approved_pr()
        response = self._create_po(pr.id, currency_code="inr")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["currency_code"], "INR")

    def test_nonexistent_supplier_404(self):
        pr = self._approved_pr()
        response = self._create_po(pr.id, supplier_id=999999)
        self.assertEqual(response.status_code, 404)

    def test_prohibited_fields_rejected(self):
        pr = self._approved_pr()
        response = post_json(
            self.client_, purchase_orders_url(self.company.id),
            {
                "source_purchase_request_id": pr.id, "supplier_id": self.supplier.id, "currency_code": "INR",
                "status": "CANCELLED",
            },
            self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_lines_in_body_rejected(self):
        pr = self._approved_pr()
        response = post_json(
            self.client_, purchase_orders_url(self.company.id),
            {
                "source_purchase_request_id": pr.id, "supplier_id": self.supplier.id, "currency_code": "INR",
                "lines": [{"material_id": self.material.id, "quantity": "99"}],
            },
            self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_multi_line_request_copies_every_line(self):
        material2 = make_material("MAT2", base_unit=self.unit)
        pr = create_purchase_request(
            actor=self.user, company=self.company,
            lines=[
                {"material_id": self.material.id, "quantity": Decimal("3")},
                {"material_id": material2.id, "quantity": Decimal("4")},
            ],
        )
        pr = submit_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=1)
        for i in range(3):
            approver = self._approver(f"multiapprover{i}")
            pr = approve_purchase_request(
                actor=approver, purchase_request_id=pr.id, expected_version=pr.version,
                expected_round=pr.current_round, expected_step=pr.current_step,
            )
        response = self._create_po(pr.id)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(response.json()["lines"]), 2)

    def test_does_not_mutate_source_purchase_request(self):
        pr = self._approved_pr()
        before_version = pr.version
        self._create_po(pr.id)
        pr.refresh_from_db()
        self.assertEqual(pr.status, "APPROVED")
        self.assertEqual(pr.version, before_version)


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


class PurchaseOrderUpdateTests(PurchaseOrderTestCase):
    def setUp(self):
        super().setUp()
        self.pr = self._approved_pr(quantity=Decimal("10"))
        self.po = create_purchase_order(
            actor=self.user, company=self.company, source_purchase_request_id=self.pr.id,
            supplier_id=self.supplier.id, currency_code="INR",
        )
        self.line = self.po.lines.get()

    def test_update_notes(self):
        response = patch_json(
            self.client_, purchase_order_url(self.company.id, self.po.id),
            {"expected_version": 1, "notes": "call supplier first"}, self.token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["notes"], "call supplier first")
        self.assertEqual(response.json()["version"], 2)

    def test_update_supplier(self):
        other_supplier = make_supplier("SUP2")
        response = patch_json(
            self.client_, purchase_order_url(self.company.id, self.po.id),
            {"expected_version": 1, "supplier_id": other_supplier.id}, self.token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["supplier_id"], other_supplier.id)

    def test_update_supplier_inactive_rejected(self):
        other_supplier = make_supplier("SUP3", is_active=False)
        response = patch_json(
            self.client_, purchase_order_url(self.company.id, self.po.id),
            {"expected_version": 1, "supplier_id": other_supplier.id}, self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_update_expected_delivery_date(self):
        response = patch_json(
            self.client_, purchase_order_url(self.company.id, self.po.id),
            {"expected_version": 1, "expected_delivery_date": "2030-06-01"}, self.token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["expected_delivery_date"], "2030-06-01")

    def test_update_line_price_recomputes_amount(self):
        response = patch_json(
            self.client_, purchase_order_url(self.company.id, self.po.id),
            {"expected_version": 1, "lines": [{"id": self.line.id, "unit_price": "12.5000"}]}, self.token,
        )
        self.assertEqual(response.status_code, 200)
        line = response.json()["lines"][0]
        self.assertEqual(line["unit_price"], "12.5000")
        self.assertEqual(line["line_amount"], "125.00")
        self.assertEqual(response.json()["subtotal"], "125.00")

    def test_update_line_price_rounds_half_up(self):
        # 3.335 * 3 = 10.005 -> rounds to 10.01 (half up), not 10.00
        response = patch_json(
            self.client_, purchase_order_url(self.company.id, self.po.id),
            {"expected_version": 1, "lines": [{"id": self.line.id, "unit_price": "1.0005"}]}, self.token,
        )
        self.assertEqual(response.status_code, 200)
        expected = (Decimal("10") * Decimal("1.0005")).quantize(Decimal("0.01"), rounding="ROUND_HALF_UP")
        self.assertEqual(response.json()["lines"][0]["line_amount"], str(expected))

    def test_update_unknown_line_id_rejected(self):
        response = patch_json(
            self.client_, purchase_order_url(self.company.id, self.po.id),
            {"expected_version": 1, "lines": [{"id": 999999, "unit_price": "5"}]}, self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_update_duplicate_line_id_rejected(self):
        response = patch_json(
            self.client_, purchase_order_url(self.company.id, self.po.id),
            {
                "expected_version": 1,
                "lines": [{"id": self.line.id, "unit_price": "5"}, {"id": self.line.id, "unit_price": "6"}],
            },
            self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_update_negative_unit_price_rejected(self):
        response = patch_json(
            self.client_, purchase_order_url(self.company.id, self.po.id),
            {"expected_version": 1, "lines": [{"id": self.line.id, "unit_price": "-1"}]}, self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_quantity_field_rejected(self):
        response = patch_json(
            self.client_, purchase_order_url(self.company.id, self.po.id),
            {"expected_version": 1, "lines": [{"id": self.line.id, "unit_price": "5", "quantity": "99"}]}, self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_material_field_rejected(self):
        response = patch_json(
            self.client_, purchase_order_url(self.company.id, self.po.id),
            {"expected_version": 1, "lines": [{"id": self.line.id, "unit_price": "5", "material_id": 1}]}, self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_currency_code_immutable_via_patch(self):
        response = patch_json(
            self.client_, purchase_order_url(self.company.id, self.po.id),
            {"expected_version": 1, "currency_code": "USD"}, self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_no_op_patch_does_not_bump_version(self):
        response = patch_json(
            self.client_, purchase_order_url(self.company.id, self.po.id),
            {"expected_version": 1, "notes": ""}, self.token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["version"], 1)

    def test_stale_version_409(self):
        response = patch_json(
            self.client_, purchase_order_url(self.company.id, self.po.id),
            {"expected_version": 999, "notes": "x"}, self.token,
        )
        self.assertEqual(response.status_code, 409)

    def test_cancelled_cannot_be_edited(self):
        cancel_purchase_order(actor=self.user, purchase_order_id=self.po.id, expected_version=1, reason="x")
        response = patch_json(
            self.client_, purchase_order_url(self.company.id, self.po.id),
            {"expected_version": 2, "notes": "y"}, self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_update_requires_permission_403(self):
        user = make_user("noeditpo")
        grant_company_permission(self.superuser, user, self.company, "purchase_orders.view")
        response = patch_json(
            self.client_, purchase_order_url(self.company.id, self.po.id),
            {"expected_version": 1, "notes": "x"}, access_token_for(user),
        )
        self.assertEqual(response.status_code, 403)


# ---------------------------------------------------------------------------
# Cancel
# ---------------------------------------------------------------------------


class PurchaseOrderCancelTests(PurchaseOrderTestCase):
    def setUp(self):
        super().setUp()
        self.pr = self._approved_pr()
        self.po = create_purchase_order(
            actor=self.user, company=self.company, source_purchase_request_id=self.pr.id,
            supplier_id=self.supplier.id, currency_code="INR",
        )

    def test_cancel_success(self):
        response = post_json(
            self.client_, po_cancel_url(self.company.id, self.po.id),
            {"expected_version": 1, "cancellation_reason": "no longer needed"}, self.token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "CANCELLED")

    def test_cancel_requires_nonblank_reason(self):
        response = post_json(
            self.client_, po_cancel_url(self.company.id, self.po.id),
            {"expected_version": 1, "cancellation_reason": "   "}, self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_cancel_idempotent_same_reason(self):
        first = post_json(
            self.client_, po_cancel_url(self.company.id, self.po.id),
            {"expected_version": 1, "cancellation_reason": "dup"}, self.token,
        )
        new_version = first.json()["version"]
        AuditLog.objects.filter(target_type="purchase_order", action="purchase_order.cancelled").delete()
        second = post_json(
            self.client_, po_cancel_url(self.company.id, self.po.id),
            {"expected_version": new_version, "cancellation_reason": "dup"}, self.token,
        )
        self.assertEqual(second.status_code, 200)
        self.assertEqual(
            AuditLog.objects.filter(target_type="purchase_order", action="purchase_order.cancelled").count(), 0
        )

    def test_cancel_different_reason_while_cancelled_409(self):
        first = post_json(
            self.client_, po_cancel_url(self.company.id, self.po.id),
            {"expected_version": 1, "cancellation_reason": "reason A"}, self.token,
        )
        new_version = first.json()["version"]
        response = post_json(
            self.client_, po_cancel_url(self.company.id, self.po.id),
            {"expected_version": new_version, "cancellation_reason": "reason B"}, self.token,
        )
        self.assertEqual(response.status_code, 409)

    def test_cancel_stale_version_409(self):
        response = post_json(
            self.client_, po_cancel_url(self.company.id, self.po.id),
            {"expected_version": 999, "cancellation_reason": "x"}, self.token,
        )
        self.assertEqual(response.status_code, 409)

    def test_cancel_preserves_lines(self):
        post_json(
            self.client_, po_cancel_url(self.company.id, self.po.id),
            {"expected_version": 1, "cancellation_reason": "x"}, self.token,
        )
        self.po.refresh_from_db()
        self.assertEqual(self.po.lines.count(), 1)

    def test_cancel_does_not_mutate_source_purchase_request(self):
        before_version = self.pr.version
        post_json(
            self.client_, po_cancel_url(self.company.id, self.po.id),
            {"expected_version": 1, "cancellation_reason": "x"}, self.token,
        )
        self.pr.refresh_from_db()
        self.assertEqual(self.pr.status, "APPROVED")
        self.assertEqual(self.pr.version, before_version)

    def test_cancel_requires_permission_403(self):
        user = make_user("nocancelpo")
        grant_company_permission(self.superuser, user, self.company, "purchase_orders.view")
        response = post_json(
            self.client_, po_cancel_url(self.company.id, self.po.id),
            {"expected_version": 1, "cancellation_reason": "x"}, access_token_for(user),
        )
        self.assertEqual(response.status_code, 403)

    def test_issued_cannot_be_cancelled(self):
        po = self._issue_ready_po()
        po = issue_purchase_order(actor=self.user, purchase_order_id=po.id, expected_version=po.version)
        response = post_json(
            self.client_, po_cancel_url(self.company.id, po.id),
            {"expected_version": po.version, "cancellation_reason": "too late"}, self.token,
        )
        self.assertEqual(response.status_code, 400)
        po.refresh_from_db()
        self.assertEqual(po.status, "ISSUED")


# ---------------------------------------------------------------------------
# Issue
# ---------------------------------------------------------------------------


class PurchaseOrderIssueTests(PurchaseOrderTestCase):
    def test_issue_success(self):
        po = self._issue_ready_po()
        response = post_json(
            self.client_, po_issue_url(self.company.id, po.id), {"expected_version": po.version}, self.token
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "ISSUED")
        self.assertEqual(body["version"], po.version + 1)
        self.assertIsNotNone(body["issued_at"])
        self.assertEqual(body["issued_by_id"], self.user.id)

    def test_issue_creates_snapshot_with_correct_content(self):
        po = self._issue_ready_po(quantity=Decimal("3"), unit_price=Decimal("20.0000"))
        response = post_json(
            self.client_, po_issue_url(self.company.id, po.id), {"expected_version": po.version}, self.token
        )
        self.assertEqual(response.status_code, 200)
        snapshot = response.json()["issue_snapshot"]
        self.assertIsNotNone(snapshot)
        self.assertEqual(snapshot["company_code_snapshot"], self.company.code)
        self.assertEqual(snapshot["supplier_code_snapshot"], self.supplier.code)
        self.assertEqual(snapshot["supplier_legal_name_snapshot"], self.supplier.legal_name)
        self.assertEqual(snapshot["currency_code_snapshot"], "INR")
        self.assertEqual(snapshot["subtotal_snapshot"], "60.00")
        self.assertEqual(len(snapshot["lines"]), 1)
        line = snapshot["lines"][0]
        self.assertEqual(line["quantity_snapshot"], "3.000")
        self.assertEqual(line["unit_price_snapshot"], "20.0000")
        self.assertEqual(line["line_amount_snapshot"], "60.00")
        self.assertEqual(line["material_code_snapshot"], "MAT1")

    def test_issue_does_not_create_stock_or_send_anything(self):
        # No stock/receipt/email-sending model or call exists anywhere in
        # this codebase - this documents that issuing mutates only the
        # one PurchaseOrder and its own new snapshot rows.
        po = self._issue_ready_po()
        issue_purchase_order(actor=self.user, purchase_order_id=po.id, expected_version=po.version)
        self.assertEqual(PurchaseOrder.objects.count(), 1)
        self.assertEqual(PurchaseOrderIssueSnapshot.objects.count(), 1)

    def test_only_draft_can_be_issued_cancelled_rejected(self):
        po = self._issue_ready_po()
        cancel_purchase_order(actor=self.user, purchase_order_id=po.id, expected_version=po.version, reason="x")
        po.refresh_from_db()
        response = post_json(
            self.client_, po_issue_url(self.company.id, po.id), {"expected_version": po.version}, self.token
        )
        self.assertEqual(response.status_code, 400)

    def test_repeat_issue_at_current_version_is_idempotent_no_op(self):
        po = self._issue_ready_po()
        first = post_json(
            self.client_, po_issue_url(self.company.id, po.id), {"expected_version": po.version}, self.token
        )
        new_version = first.json()["version"]
        AuditLog.objects.filter(target_type="purchase_order", action="purchase_order.issued").delete()
        snapshot_count_before = PurchaseOrderIssueSnapshot.objects.count()
        second = post_json(
            self.client_, po_issue_url(self.company.id, po.id), {"expected_version": new_version}, self.token
        )
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json()["version"], new_version)
        self.assertEqual(
            AuditLog.objects.filter(target_type="purchase_order", action="purchase_order.issued").count(), 0
        )
        self.assertEqual(PurchaseOrderIssueSnapshot.objects.count(), snapshot_count_before)

    def test_stale_version_409(self):
        po = self._issue_ready_po()
        response = post_json(
            self.client_, po_issue_url(self.company.id, po.id), {"expected_version": 999}, self.token
        )
        self.assertEqual(response.status_code, 409)

    def test_zero_price_line_rejected(self):
        pr = self._approved_pr()
        po = create_purchase_order(
            actor=self.user, company=self.company, source_purchase_request_id=pr.id,
            supplier_id=self.supplier.id, currency_code="INR",
            expected_delivery_date=timezone.now().date() + timedelta(days=14),
        )
        # unit_price left at its DRAFT default of 0 - never issuable.
        response = post_json(
            self.client_, po_issue_url(self.company.id, po.id), {"expected_version": po.version}, self.token
        )
        self.assertEqual(response.status_code, 400)
        po.refresh_from_db()
        self.assertEqual(po.status, "DRAFT")

    def test_missing_expected_delivery_date_rejected(self):
        pr = self._approved_pr()
        po = create_purchase_order(
            actor=self.user, company=self.company, source_purchase_request_id=pr.id,
            supplier_id=self.supplier.id, currency_code="INR",
        )
        line = po.lines.get()
        po = update_purchase_order(
            actor=self.user, purchase_order_id=po.id, expected_version=po.version,
            data={"lines": [{"id": line.id, "unit_price": Decimal("5")}]},
        )
        response = post_json(
            self.client_, po_issue_url(self.company.id, po.id), {"expected_version": po.version}, self.token
        )
        self.assertEqual(response.status_code, 400)

    def test_past_expected_delivery_date_rejected(self):
        pr = self._approved_pr()
        po = create_purchase_order(
            actor=self.user, company=self.company, source_purchase_request_id=pr.id,
            supplier_id=self.supplier.id, currency_code="INR",
            expected_delivery_date=timezone.now().date() - timedelta(days=1),
        )
        line = po.lines.get()
        po = update_purchase_order(
            actor=self.user, purchase_order_id=po.id, expected_version=po.version,
            data={"lines": [{"id": line.id, "unit_price": Decimal("5")}]},
        )
        response = post_json(
            self.client_, po_issue_url(self.company.id, po.id), {"expected_version": po.version}, self.token
        )
        self.assertEqual(response.status_code, 400)

    def test_unsupported_currency_rejected(self):
        self.assertNotIn("JPY", _SUPPORTED_ISSUE_CURRENCIES)
        pr = self._approved_pr()
        po = create_purchase_order(
            actor=self.user, company=self.company, source_purchase_request_id=pr.id,
            supplier_id=self.supplier.id, currency_code="JPY",
            expected_delivery_date=timezone.now().date() + timedelta(days=14),
        )
        line = po.lines.get()
        po = update_purchase_order(
            actor=self.user, purchase_order_id=po.id, expected_version=po.version,
            data={"lines": [{"id": line.id, "unit_price": Decimal("5")}]},
        )
        response = post_json(
            self.client_, po_issue_url(self.company.id, po.id), {"expected_version": po.version}, self.token
        )
        self.assertEqual(response.status_code, 400)

    def test_supported_currencies_are_issuable(self):
        for currency in sorted(_SUPPORTED_ISSUE_CURRENCIES):
            pr = self._approved_pr(quantity=Decimal("1"))
            po = create_purchase_order(
                actor=self.user, company=self.company, source_purchase_request_id=pr.id,
                supplier_id=self.supplier.id, currency_code=currency,
                expected_delivery_date=timezone.now().date() + timedelta(days=14),
            )
            line = po.lines.get()
            po = update_purchase_order(
                actor=self.user, purchase_order_id=po.id, expected_version=po.version,
                data={"lines": [{"id": line.id, "unit_price": Decimal("5")}]},
            )
            po = issue_purchase_order(actor=self.user, purchase_order_id=po.id, expected_version=po.version)
            self.assertEqual(po.status, "ISSUED", currency)

    def test_inactive_supplier_rejected(self):
        po = self._issue_ready_po()
        self.supplier.is_active = False
        self.supplier.save(update_fields=["is_active", "updated_at"])
        response = post_json(
            self.client_, po_issue_url(self.company.id, po.id), {"expected_version": po.version}, self.token
        )
        self.assertEqual(response.status_code, 400)

    def test_inactive_material_rejected(self):
        po = self._issue_ready_po()
        self.material.is_active = False
        self.material.save(update_fields=["is_active", "updated_at"])
        response = post_json(
            self.client_, po_issue_url(self.company.id, po.id), {"expected_version": po.version}, self.token
        )
        self.assertEqual(response.status_code, 400)

    def test_inactive_unit_rejected(self):
        po = self._issue_ready_po()
        self.unit.is_active = False
        self.unit.save(update_fields=["is_active", "updated_at"])
        response = post_json(
            self.client_, po_issue_url(self.company.id, po.id), {"expected_version": po.version}, self.token
        )
        self.assertEqual(response.status_code, 400)

    def test_inactive_category_rejected(self):
        po = self._issue_ready_po()
        self.category.is_active = False
        self.category.save(update_fields=["is_active", "updated_at"])
        response = post_json(
            self.client_, po_issue_url(self.company.id, po.id), {"expected_version": po.version}, self.token
        )
        self.assertEqual(response.status_code, 400)

    def test_source_request_no_longer_approved_rejected(self):
        # Defensive-only path: APPROVED is terminal in this codebase, so
        # this simulates the scenario directly rather than trying (and
        # failing) to reach it through the real API.
        po = self._issue_ready_po()
        PurchaseRequest.objects.filter(pk=po.source_purchase_request_id).update(status="REJECTED")
        response = post_json(
            self.client_, po_issue_url(self.company.id, po.id), {"expected_version": po.version}, self.token
        )
        self.assertEqual(response.status_code, 400)

    def test_line_mismatched_with_approved_round_rejected(self):
        # Defensive-only path: PurchaseOrderLine.quantity is immutable
        # through every real API, so this simulates a hypothetical drift
        # directly at the DB layer to prove the revalidation actually
        # fires rather than assuming it would.
        po = self._issue_ready_po()
        PurchaseOrderLine.objects.filter(pk=po.lines.get().pk).update(quantity=Decimal("999"))
        response = post_json(
            self.client_, po_issue_url(self.company.id, po.id), {"expected_version": po.version}, self.token
        )
        self.assertEqual(response.status_code, 400)

    def test_issue_requires_permission_403(self):
        po = self._issue_ready_po()
        user = make_user("noissuepo")
        grant_company_permission(self.superuser, user, self.company, "purchase_orders.view")
        response = post_json(
            self.client_, po_issue_url(self.company.id, po.id), {"expected_version": po.version},
            access_token_for(user),
        )
        self.assertEqual(response.status_code, 403)
        po.refresh_from_db()
        self.assertEqual(po.status, "DRAFT")

    def test_cross_company_404(self):
        po = self._issue_ready_po()
        other_user = make_user("othercompanyissuer")
        grant_company_permission(
            self.superuser, other_user, self.other_company, "purchase_orders.view", "purchase_orders.issue"
        )
        response = post_json(
            self.client_, po_issue_url(self.other_company.id, po.id), {"expected_version": po.version},
            access_token_for(other_user),
        )
        self.assertEqual(response.status_code, 404)

    def test_issued_cannot_be_edited(self):
        po = self._issue_ready_po()
        po = issue_purchase_order(actor=self.user, purchase_order_id=po.id, expected_version=po.version)
        response = patch_json(
            self.client_, purchase_order_url(self.company.id, po.id),
            {"expected_version": po.version, "notes": "too late"}, self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_master_data_change_after_issue_does_not_rewrite_snapshot(self):
        po = self._issue_ready_po()
        po = issue_purchase_order(actor=self.user, purchase_order_id=po.id, expected_version=po.version)
        self.supplier.legal_name = "Renamed Supplier Pvt Ltd"
        self.supplier.address_line_1 = "New address that did not exist at issue time"
        self.supplier.save(update_fields=["legal_name", "address_line_1", "updated_at"])
        self.company.display_name = "Renamed Company Display Name"
        self.company.save(update_fields=["display_name", "updated_at"])

        response = get_json(self.client_, purchase_order_url(self.company.id, po.id), self.token)
        snapshot = response.json()["issue_snapshot"]
        self.assertNotEqual(snapshot["supplier_legal_name_snapshot"], "Renamed Supplier Pvt Ltd")
        self.assertNotEqual(snapshot["supplier_address_line_1_snapshot"], "New address that did not exist at issue time")
        self.assertNotEqual(snapshot["company_display_name_snapshot"], "Renamed Company Display Name")
        # Live, non-snapshotted fields DO reflect the rename - only the
        # issue-time record is protected.
        self.assertEqual(response.json()["supplier_code"], self.supplier.code)

    def test_one_active_po_rule_still_holds_after_issue(self):
        po = self._issue_ready_po()
        po = issue_purchase_order(actor=self.user, purchase_order_id=po.id, expected_version=po.version)
        response = self._create_po(po.source_purchase_request_id)
        self.assertEqual(response.status_code, 400)


# ---------------------------------------------------------------------------
# List / search / pagination
# ---------------------------------------------------------------------------


class PurchaseOrderListTests(PurchaseOrderTestCase):
    def test_search_matches_reference(self):
        pr = self._approved_pr()
        po = create_purchase_order(
            actor=self.user, company=self.company, source_purchase_request_id=pr.id,
            supplier_id=self.supplier.id, currency_code="INR",
        )
        response = get_json(
            self.client_, purchase_orders_url(self.company.id) + f"?search={po.reference}", self.token
        )
        self.assertEqual(response.json()["count"], 1)

    def test_status_filter(self):
        pr = self._approved_pr()
        po = create_purchase_order(
            actor=self.user, company=self.company, source_purchase_request_id=pr.id,
            supplier_id=self.supplier.id, currency_code="INR",
        )
        cancel_purchase_order(actor=self.user, purchase_order_id=po.id, expected_version=1, reason="x")
        response = get_json(self.client_, purchase_orders_url(self.company.id) + "?status=DRAFT", self.token)
        self.assertEqual(response.json()["count"], 0)
        response = get_json(self.client_, purchase_orders_url(self.company.id) + "?status=CANCELLED", self.token)
        self.assertEqual(response.json()["count"], 1)

    def test_status_filter_rejects_invalid_value(self):
        response = get_json(self.client_, purchase_orders_url(self.company.id) + "?status=BOGUS", self.token)
        self.assertEqual(response.status_code, 400)

    def test_pagination_bounded(self):
        response = get_json(self.client_, purchase_orders_url(self.company.id), self.token)
        self.assertEqual(response.status_code, 200)
        self.assertIn("results", response.json())


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------


class PurchaseOrderAuditTests(PurchaseOrderTestCase):
    def test_create_audit_has_company_context(self):
        pr = self._approved_pr()
        response = self._create_po(pr.id)
        po_id = response.json()["id"]
        entry = AuditLog.objects.filter(
            target_type="purchase_order", target_id=po_id, action="purchase_order.created"
        ).get()
        self.assertEqual(entry.company_id, self.company.id)
        self.assertIsNone(entry.store_id)

    def test_create_audit_rollback_on_failure(self):
        pr = self._approved_pr()
        with patch("apps.purchasing.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                self._create_po(pr.id)
        self.assertEqual(PurchaseOrder.objects.count(), 0)

    def test_update_audit_rollback_on_failure(self):
        pr = self._approved_pr()
        po = create_purchase_order(
            actor=self.user, company=self.company, source_purchase_request_id=pr.id,
            supplier_id=self.supplier.id, currency_code="INR",
        )
        with patch("apps.purchasing.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                patch_json(
                    self.client_, purchase_order_url(self.company.id, po.id),
                    {"expected_version": 1, "notes": "changed"}, self.token,
                )
        po.refresh_from_db()
        self.assertEqual(po.notes, "")
        self.assertEqual(po.version, 1)

    def test_cancel_audit_rollback_on_failure(self):
        pr = self._approved_pr()
        po = create_purchase_order(
            actor=self.user, company=self.company, source_purchase_request_id=pr.id,
            supplier_id=self.supplier.id, currency_code="INR",
        )
        with patch("apps.purchasing.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(
                    self.client_, po_cancel_url(self.company.id, po.id),
                    {"expected_version": 1, "cancellation_reason": "x"}, self.token,
                )
        po.refresh_from_db()
        self.assertEqual(po.status, "DRAFT")
        self.assertEqual(po.version, 1)

    def test_issue_audit_rollback_on_failure(self):
        po = self._issue_ready_po()
        version_before = po.version  # already 2: _issue_ready_po's own price PATCH bumped it once
        with patch("apps.purchasing.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(
                    self.client_, po_issue_url(self.company.id, po.id), {"expected_version": po.version}, self.token
                )
        po.refresh_from_db()
        self.assertEqual(po.status, "DRAFT")
        self.assertEqual(po.version, version_before)
        self.assertIsNone(po.issued_at)
        self.assertEqual(PurchaseOrderIssueSnapshot.objects.count(), 0)
        self.assertEqual(PurchaseOrderIssueLineSnapshot.objects.count(), 0)


# ---------------------------------------------------------------------------
# Concurrency
# ---------------------------------------------------------------------------


class ConcurrentPurchaseOrderCreationTests(TransactionTestCase):
    serialized_rollback = True

    def test_concurrent_create_produces_exactly_one_po(self):
        from django.db import connection

        superuser = make_superuser("concurrentpoadmin")
        company = make_company("CONCURPO")
        user = make_user("concurrentpouser")
        grant_company_permission(superuser, user, company, *ALL_PERMS)
        unit = make_unit("KGPO")
        material = make_material("MATPO", base_unit=unit)
        supplier = make_supplier("SUPPO")

        pr = create_purchase_request(
            actor=user, company=company, lines=[{"material_id": material.id, "quantity": Decimal("1")}]
        )
        pr = submit_purchase_request(actor=user, purchase_request_id=pr.id, expected_version=1)
        for i in range(3):
            approver = make_user(f"concurrentpoapprover{i}")
            grant_company_permission(superuser, approver, company, "purchase_requests.view", "purchase_requests.approve")
            pr = approve_purchase_request(
                actor=approver, purchase_request_id=pr.id, expected_version=pr.version,
                expected_round=pr.current_round, expected_step=pr.current_step,
            )

        results = []
        barrier = threading.Barrier(2)

        def worker():
            try:
                barrier.wait(timeout=5)
                create_purchase_order(
                    actor=user, company=company, source_purchase_request_id=pr.id,
                    supplier_id=supplier.id, currency_code="INR",
                )
                results.append("ok")
            except DjangoValidationError:
                results.append("rejected")
            except Conflict:
                results.append("conflict")
            finally:
                connection.close()

        threads = [threading.Thread(target=worker) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        self.assertEqual(results.count("ok"), 1, results)
        self.assertEqual(PurchaseOrder.objects.filter(source_purchase_request=pr).count(), 1)


class ConcurrentIssueVersusCancelTests(TransactionTestCase):
    serialized_rollback = True

    def test_concurrent_issue_and_cancel_produce_exactly_one_winner(self):
        """Issue and cancel both lock the same PurchaseOrder row
        (`select_for_update()`), so they must serialize against each
        other exactly like any other pair of mutations on this app's
        documents - one succeeds, the other's `expected_version` is now
        stale and gets a clean `409`, never a torn/partial result (e.g.
        both a snapshot AND a cancellation reason on the same order).
        """
        from django.db import connection

        superuser = make_superuser("concurrentissueadmin")
        company = make_company("CONCURISSUE")
        user = make_user("concurrentissueuser")
        grant_company_permission(
            superuser, user, company,
            "purchase_requests.view", "purchase_requests.create", "purchase_requests.submit",
            "purchase_orders.view", "purchase_orders.create", "purchase_orders.edit",
            "purchase_orders.cancel", "purchase_orders.issue",
        )
        unit = make_unit("KGISSUE")
        material = make_material("MATISSUE", base_unit=unit)
        supplier = make_supplier("SUPISSUE")

        pr = create_purchase_request(
            actor=user, company=company, lines=[{"material_id": material.id, "quantity": Decimal("1")}]
        )
        pr = submit_purchase_request(actor=user, purchase_request_id=pr.id, expected_version=1)
        for i in range(3):
            approver = make_user(f"concurrentissueapprover{i}")
            grant_company_permission(
                superuser, approver, company, "purchase_requests.view", "purchase_requests.approve"
            )
            pr = approve_purchase_request(
                actor=approver, purchase_request_id=pr.id, expected_version=pr.version,
                expected_round=pr.current_round, expected_step=pr.current_step,
            )

        po = create_purchase_order(
            actor=user, company=company, source_purchase_request_id=pr.id, supplier_id=supplier.id,
            currency_code="INR", expected_delivery_date=timezone.now().date() + timedelta(days=14),
        )
        line = po.lines.get()
        po = update_purchase_order(
            actor=user, purchase_order_id=po.id, expected_version=po.version,
            data={"lines": [{"id": line.id, "unit_price": Decimal("5")}]},
        )

        results = []
        barrier = threading.Barrier(2)

        def issue_worker():
            try:
                barrier.wait(timeout=5)
                issue_purchase_order(actor=user, purchase_order_id=po.id, expected_version=po.version)
                results.append(("issue", "ok"))
            except Conflict:
                results.append(("issue", "conflict"))
            except DjangoValidationError:
                results.append(("issue", "rejected"))
            finally:
                connection.close()

        def cancel_worker():
            try:
                barrier.wait(timeout=5)
                cancel_purchase_order(
                    actor=user, purchase_order_id=po.id, expected_version=po.version, reason="race test"
                )
                results.append(("cancel", "ok"))
            except Conflict:
                results.append(("cancel", "conflict"))
            except DjangoValidationError:
                results.append(("cancel", "rejected"))
            finally:
                connection.close()

        threads = [threading.Thread(target=issue_worker), threading.Thread(target=cancel_worker)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        outcomes = [r[1] for r in results]
        self.assertEqual(outcomes.count("ok"), 1, results)
        self.assertEqual(outcomes.count("conflict"), 1, results)

        po.refresh_from_db()
        self.assertIn(po.status, ("ISSUED", "CANCELLED"))
        if po.status == "ISSUED":
            self.assertEqual(PurchaseOrderIssueSnapshot.objects.count(), 1)
            self.assertIsNone(po.cancelled_at)
        else:
            self.assertEqual(PurchaseOrderIssueSnapshot.objects.count(), 0)
            self.assertIsNotNone(po.cancelled_at)
