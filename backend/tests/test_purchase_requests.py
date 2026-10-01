import json
import threading
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
from apps.purchasing.admin import PurchaseRequestAdmin
from apps.purchasing.models import (
    PurchaseRequest,
    PurchaseRequestApproval,
    PurchaseRequestApprovalRound,
    PurchaseRequestLine,
)
from apps.purchasing.services import (
    approve_purchase_request,
    cancel_purchase_request,
    create_purchase_request,
    reject_purchase_request,
    revise_purchase_request,
    submit_purchase_request,
    update_purchase_request,
)
from apps.stores.models import SharedStore
from apps.stores.services import assign_store_membership
from apps.permissions.services import assign_store_role, create_store_role, replace_store_role_permissions
from apps.users.services import assign_company_membership, assign_membership_role

User = get_user_model()
PASSWORD = "a-strong-pass-1"


def purchase_requests_url(company_id):
    return f"/api/v1/companies/{company_id}/purchase-requests/"


def purchase_request_url(company_id, request_id):
    return f"/api/v1/companies/{company_id}/purchase-requests/{request_id}/"


def submit_url(company_id, request_id):
    return f"/api/v1/companies/{company_id}/purchase-requests/{request_id}/submit/"


def cancel_url(company_id, request_id):
    return f"/api/v1/companies/{company_id}/purchase-requests/{request_id}/cancel/"


def approve_url(company_id, request_id):
    return f"/api/v1/companies/{company_id}/purchase-requests/{request_id}/approve/"


def reject_url(company_id, request_id):
    return f"/api/v1/companies/{company_id}/purchase-requests/{request_id}/reject/"


def revise_url(company_id, request_id):
    return f"/api/v1/companies/{company_id}/purchase-requests/{request_id}/revise/"


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
    """Test helper: gives `user` an active CompanyMembership in `company`
    and a CompanyRole holding exactly `permission_codes`, via the real
    service layer (never a raw ORM shortcut) - mirrors
    tests.test_catalog.grant_store_permission exactly, for COMPANY scope.
    """
    membership, _ = assign_company_membership(actor=actor, user=user, company=company)
    role = create_company_role(actor=actor, company=company, code=f"ROLE{user.id}", name="Role")
    role, _ = replace_role_permissions(actor=actor, role=role, permission_codes=list(permission_codes))
    assign_membership_role(actor=actor, membership=membership, role=role)
    return membership, role


def grant_store_permission_for(actor, user, store, *permission_codes):
    membership, _ = assign_store_membership(actor=actor, user=user, store=store)
    role = create_store_role(actor=actor, store=store, code=f"SROLE{user.id}", name="Role")
    role, _ = replace_store_role_permissions(actor=actor, role=role, permission_codes=list(permission_codes))
    assign_store_role(membership, role)
    return membership, role


ALL_PERMS = (
    "purchase_requests.view",
    "purchase_requests.create",
    "purchase_requests.edit",
    "purchase_requests.submit",
    "purchase_requests.cancel",
    "purchase_requests.cancel_pending",
    "purchase_requests.approve",
)


class PurchaseRequestTestCase(TestCase):
    def setUp(self):
        self.superuser = make_superuser("admin")
        self.company = make_company("ACME")
        self.other_company = make_company("BETA")
        self.client_ = Client()
        self.unit = make_unit("KG")
        self.count_unit = make_unit("PC", dimension="COUNT")
        self.category = make_category("HERB")
        self.material = make_material("MAT1", base_unit=self.unit)
        self.count_material = make_material("MAT2", base_unit=self.count_unit)
        self.user = make_user("staffuser")
        grant_company_permission(self.superuser, self.user, self.company, *ALL_PERMS)
        self.token = access_token_for(self.user)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class PurchaseRequestModelTests(PurchaseRequestTestCase):
    def test_reference_is_unique(self):
        pr = create_purchase_request(actor=self.user, company=self.company)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                PurchaseRequest.objects.create(
                    company=self.company, reference=pr.reference, created_by=self.user
                )

    def test_company_immutable_after_creation(self):
        pr = create_purchase_request(actor=self.user, company=self.company)
        pr.company = self.other_company
        with self.assertRaises(Exception):
            pr.save()

    def test_reference_immutable_after_creation(self):
        pr = create_purchase_request(actor=self.user, company=self.company)
        pr.reference = "PR-OTHER"
        with self.assertRaises(Exception):
            pr.save()

    def test_version_starts_at_one(self):
        pr = create_purchase_request(actor=self.user, company=self.company)
        self.assertEqual(pr.version, 1)

    def test_starts_draft(self):
        pr = create_purchase_request(actor=self.user, company=self.company)
        self.assertEqual(pr.status, PurchaseRequest.Status.DRAFT)

    def test_no_supplier_price_or_store_field(self):
        pr = PurchaseRequest()
        for field in ("supplier", "supplier_id", "price", "unit_price", "store", "store_id", "quantity"):
            self.assertFalse(hasattr(pr, field), field)

    def test_line_quantity_positive_enforced_by_clean(self):
        pr = create_purchase_request(actor=self.user, company=self.company)
        with self.assertRaises(Exception):
            PurchaseRequestLine.objects.create(
                purchase_request=pr, line_number=1, material=self.material, unit=self.unit,
                quantity=Decimal("0"),
            )

    def test_line_quantity_positive_db_constraint_backstops_bulk_create(self):
        """`bulk_create()` bypasses clean()/save() entirely (the same
        known limitation documented on every clean()-based model in this
        codebase) - the DB CheckConstraint is what still stops a
        non-positive quantity from ever being written that way.
        """
        pr = create_purchase_request(actor=self.user, company=self.company)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                PurchaseRequestLine.objects.bulk_create(
                    [
                        PurchaseRequestLine(
                            purchase_request=pr, line_number=1, material=self.material, unit=self.unit,
                            quantity=Decimal("0"),
                        )
                    ]
                )

    def test_unique_material_per_request_db_constraint(self):
        pr = create_purchase_request(actor=self.user, company=self.company)
        PurchaseRequestLine.objects.create(
            purchase_request=pr, line_number=1, material=self.material, unit=self.unit, quantity=Decimal("5")
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                PurchaseRequestLine.objects.create(
                    purchase_request=pr, line_number=2, material=self.material, unit=self.unit,
                    quantity=Decimal("1"),
                )


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------


class PurchaseRequestAdminAccessRestrictionTests(TestCase):
    def setUp(self):
        from django.test import RequestFactory

        self.factory = RequestFactory()
        self.admin = PurchaseRequestAdmin(PurchaseRequest, admin_site=None)

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


class PurchaseRequestAuthorizationTests(PurchaseRequestTestCase):
    def test_anonymous_401(self):
        self.assertEqual(self.client_.get(purchase_requests_url(self.company.id)).status_code, 401)

    def test_member_without_permission_403(self):
        user = make_user("noperm")
        grant_company_permission(self.superuser, user, self.company)
        response = get_json(self.client_, purchase_requests_url(self.company.id), access_token_for(user))
        self.assertEqual(response.status_code, 403)

    def test_member_with_view_permission_200(self):
        user = make_user("viewer")
        grant_company_permission(self.superuser, user, self.company, "purchase_requests.view")
        response = get_json(self.client_, purchase_requests_url(self.company.id), access_token_for(user))
        self.assertEqual(response.status_code, 200)

    def test_create_requires_view_and_create(self):
        user = make_user("creatoronly")
        grant_company_permission(self.superuser, user, self.company, "purchase_requests.create")
        response = post_json(self.client_, purchase_requests_url(self.company.id), {}, access_token_for(user))
        self.assertEqual(response.status_code, 403)

    def test_non_member_404(self):
        user = make_user("outsider")
        response = get_json(self.client_, purchase_requests_url(self.company.id), access_token_for(user))
        self.assertEqual(response.status_code, 404)

    def test_superuser_without_membership_denied(self):
        response = get_json(self.client_, purchase_requests_url(self.company.id), access_token_for(self.superuser))
        self.assertEqual(response.status_code, 404)

    def test_inactive_company_404(self):
        self.company.is_active = False
        self.company.save(update_fields=["is_active", "updated_at"])
        response = get_json(self.client_, purchase_requests_url(self.company.id), self.token)
        self.assertEqual(response.status_code, 404)

    def test_deactivated_membership_revokes_access(self):
        from apps.companies.models import CompanyMembership

        membership = CompanyMembership.objects.get(user=self.user, company=self.company)
        membership.is_active = False
        membership.save(update_fields=["is_active", "updated_at"])
        response = get_json(self.client_, purchase_requests_url(self.company.id), self.token)
        self.assertEqual(response.status_code, 404)

    def test_store_permission_grants_nothing(self):
        user = make_user("storeuser")
        store = SharedStore.objects.create(code="MAIN", name="Main Store")
        grant_store_permission_for(self.superuser, user, store, "shared_catalog.view")
        response = get_json(self.client_, purchase_requests_url(self.company.id), access_token_for(user))
        self.assertEqual(response.status_code, 404)

    def test_cross_company_detail_404(self):
        pr = create_purchase_request(actor=self.user, company=self.other_company)
        response = get_json(self.client_, purchase_request_url(self.company.id, pr.id), self.token)
        self.assertEqual(response.status_code, 404)

    def test_cross_company_list_isolation(self):
        create_purchase_request(actor=self.user, company=self.other_company)
        own = create_purchase_request(actor=self.user, company=self.company)
        response = get_json(self.client_, purchase_requests_url(self.company.id), self.token)
        ids = [row["id"] for row in response.json()["results"]]
        self.assertEqual(ids, [own.id])

    def test_delete_not_allowed_on_list(self):
        response = self.client_.delete(purchase_requests_url(self.company.id), **bearer(self.token))
        self.assertEqual(response.status_code, 405)

    def test_delete_not_allowed_on_detail(self):
        pr = create_purchase_request(actor=self.user, company=self.company)
        response = self.client_.delete(purchase_request_url(self.company.id, pr.id), **bearer(self.token))
        self.assertEqual(response.status_code, 405)


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


class PurchaseRequestCreateTests(PurchaseRequestTestCase):
    def test_empty_draft_allowed(self):
        response = post_json(self.client_, purchase_requests_url(self.company.id), {}, self.token)
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["status"], "DRAFT")
        self.assertEqual(body["version"], 1)
        self.assertEqual(body["lines"], [])
        self.assertTrue(body["reference"].startswith("PR-"))

    def test_create_with_lines(self):
        payload = {"lines": [{"material_id": self.material.id, "quantity": "5.5"}]}
        response = post_json(self.client_, purchase_requests_url(self.company.id), payload, self.token)
        self.assertEqual(response.status_code, 201)
        lines = response.json()["lines"]
        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0]["material_id"], self.material.id)
        self.assertEqual(Decimal(lines[0]["quantity"]), Decimal("5.5"))

    def test_reject_zero_and_negative_quantity(self):
        for qty in ("0", "-1"):
            response = post_json(
                self.client_,
                purchase_requests_url(self.company.id),
                {"lines": [{"material_id": self.material.id, "quantity": qty}]},
                self.token,
            )
            self.assertEqual(response.status_code, 400, qty)

    def test_reject_excessive_precision(self):
        response = post_json(
            self.client_,
            purchase_requests_url(self.company.id),
            {"lines": [{"material_id": self.material.id, "quantity": "1.2345"}]},
            self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_reject_fractional_count_quantity(self):
        response = post_json(
            self.client_,
            purchase_requests_url(self.company.id),
            {"lines": [{"material_id": self.count_material.id, "quantity": "2.5"}]},
            self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_whole_count_quantity_allowed(self):
        response = post_json(
            self.client_,
            purchase_requests_url(self.company.id),
            {"lines": [{"material_id": self.count_material.id, "quantity": "3"}]},
            self.token,
        )
        self.assertEqual(response.status_code, 201)

    def test_reject_duplicate_material_in_same_request(self):
        payload = {
            "lines": [
                {"material_id": self.material.id, "quantity": "1"},
                {"material_id": self.material.id, "quantity": "2"},
            ]
        }
        response = post_json(self.client_, purchase_requests_url(self.company.id), payload, self.token)
        self.assertEqual(response.status_code, 400)

    def test_unknown_material_404(self):
        response = post_json(
            self.client_,
            purchase_requests_url(self.company.id),
            {"lines": [{"material_id": 999999, "quantity": "1"}]},
            self.token,
        )
        self.assertEqual(response.status_code, 404)

    def test_unit_is_derived_from_material(self):
        response = post_json(
            self.client_,
            purchase_requests_url(self.company.id),
            {"lines": [{"material_id": self.material.id, "quantity": "1"}]},
            self.token,
        )
        self.assertEqual(response.json()["lines"][0]["unit_code"], "KG")

    def test_reject_protected_header_fields(self):
        for field, value in (
            ("status", "SUBMITTED"),
            ("reference", "PR-FAKE"),
            ("version", 5),
            ("company", self.company.id),
            ("company_id", self.company.id),
            ("created_by_id", self.superuser.id),
            ("cancellation_reason", "x"),
        ):
            response = post_json(
                self.client_, purchase_requests_url(self.company.id), {field: value}, self.token
            )
            self.assertEqual(response.status_code, 400, field)

    def test_reject_line_level_protected_fields(self):
        for field, value in (("unit_id", self.unit.id), ("price", "10"), ("supplier_id", 1)):
            response = post_json(
                self.client_,
                purchase_requests_url(self.company.id),
                {"lines": [{"material_id": self.material.id, "quantity": "1", field: value}]},
                self.token,
            )
            self.assertEqual(response.status_code, 400, field)

    def test_company_comes_from_url_not_body(self):
        response = post_json(
            self.client_, purchase_requests_url(self.other_company.id), {}, self.token
        )
        self.assertEqual(response.status_code, 404)  # no permission in other_company at all

    def test_created_by_is_authenticated_user(self):
        response = post_json(self.client_, purchase_requests_url(self.company.id), {}, self.token)
        self.assertEqual(response.json()["created_by_id"], self.user.id)


# ---------------------------------------------------------------------------
# PATCH
# ---------------------------------------------------------------------------


class PurchaseRequestUpdateTests(PurchaseRequestTestCase):
    def test_patch_updates_notes_and_required_by(self):
        pr = create_purchase_request(actor=self.user, company=self.company)
        response = patch_json(
            self.client_,
            purchase_request_url(self.company.id, pr.id),
            {"expected_version": 1, "notes": "urgent", "required_by": "2030-01-01"},
            self.token,
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["notes"], "urgent")
        self.assertEqual(body["version"], 2)

    def test_patch_omitted_fields_unchanged(self):
        pr = create_purchase_request(actor=self.user, company=self.company, notes="keep me")
        response = patch_json(
            self.client_,
            purchase_request_url(self.company.id, pr.id),
            {"expected_version": 1, "required_by": "2030-01-01"},
            self.token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["notes"], "keep me")

    def test_patch_empty_lines_list_clears_lines(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        response = patch_json(
            self.client_, purchase_request_url(self.company.id, pr.id), {"expected_version": 1, "lines": []}, self.token
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["lines"], [])

    def test_patch_missing_lines_key_leaves_lines_untouched(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        response = patch_json(
            self.client_, purchase_request_url(self.company.id, pr.id), {"expected_version": 1, "notes": "x"}, self.token
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["lines"]), 1)

    def test_patch_full_line_replacement(self):
        other_material = make_material("MAT3", base_unit=self.unit)
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        response = patch_json(
            self.client_,
            purchase_request_url(self.company.id, pr.id),
            {"expected_version": 1, "lines": [{"material_id": other_material.id, "quantity": "9"}]},
            self.token,
        )
        self.assertEqual(response.status_code, 200)
        lines = response.json()["lines"]
        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0]["material_id"], other_material.id)

    def test_patch_invalid_line_replacement_changes_nothing(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        response = patch_json(
            self.client_,
            purchase_request_url(self.company.id, pr.id),
            {"expected_version": 1, "lines": [{"material_id": 999999, "quantity": "1"}]},
            self.token,
        )
        self.assertEqual(response.status_code, 404)
        pr.refresh_from_db()
        self.assertEqual(pr.version, 1)
        self.assertEqual(pr.lines.count(), 1)
        self.assertEqual(pr.lines.first().material_id, self.material.id)

    def test_patch_noop_does_not_increment_version_or_audit(self):
        pr = create_purchase_request(actor=self.user, company=self.company, notes="same")
        AuditLog.objects.all().delete()
        response = patch_json(
            self.client_, purchase_request_url(self.company.id, pr.id), {"expected_version": 1, "notes": "same"}, self.token
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["version"], 1)
        self.assertEqual(AuditLog.objects.filter(target_type="purchase_request").count(), 0)

    def test_patch_stale_version_409_no_changes(self):
        pr = create_purchase_request(actor=self.user, company=self.company, notes="original")
        response = patch_json(
            self.client_, purchase_request_url(self.company.id, pr.id), {"expected_version": 999, "notes": "changed"}, self.token
        )
        self.assertEqual(response.status_code, 409)
        pr.refresh_from_db()
        self.assertEqual(pr.notes, "original")

    def test_patch_rejects_non_draft(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        submit_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=1)
        response = patch_json(
            self.client_, purchase_request_url(self.company.id, pr.id), {"expected_version": 2, "notes": "x"}, self.token
        )
        self.assertEqual(response.status_code, 400)

    def test_patch_rejects_protected_fields(self):
        pr = create_purchase_request(actor=self.user, company=self.company)
        response = patch_json(
            self.client_,
            purchase_request_url(self.company.id, pr.id),
            {"expected_version": 1, "status": "SUBMITTED"},
            self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_patch_requires_expected_version(self):
        pr = create_purchase_request(actor=self.user, company=self.company)
        response = patch_json(
            self.client_, purchase_request_url(self.company.id, pr.id), {"notes": "x"}, self.token
        )
        self.assertEqual(response.status_code, 400)


# ---------------------------------------------------------------------------
# Submit
# ---------------------------------------------------------------------------


class PurchaseRequestSubmitTests(PurchaseRequestTestCase):
    def test_submit_success(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        response = post_json(self.client_, submit_url(self.company.id, pr.id), {"expected_version": 1}, self.token)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "SUBMITTED")
        self.assertEqual(body["version"], 2)
        self.assertIsNotNone(body["submitted_at"])

    def test_submit_empty_request_rejected(self):
        pr = create_purchase_request(actor=self.user, company=self.company)
        response = post_json(self.client_, submit_url(self.company.id, pr.id), {"expected_version": 1}, self.token)
        self.assertEqual(response.status_code, 400)

    def test_submit_rejects_inactive_material(self):
        self.material.is_active = False
        self.material.save(update_fields=["is_active", "updated_at"])
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        response = post_json(self.client_, submit_url(self.company.id, pr.id), {"expected_version": 1}, self.token)
        self.assertEqual(response.status_code, 400)

    def test_submit_rejects_inactive_unit(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        self.unit.is_active = False
        self.unit.save(update_fields=["is_active", "updated_at"])
        response = post_json(self.client_, submit_url(self.company.id, pr.id), {"expected_version": 1}, self.token)
        self.assertEqual(response.status_code, 400)

    def test_submit_rejects_inactive_category(self):
        material_with_category = make_material("MATC", base_unit=self.unit, category=self.category)
        pr = create_purchase_request(
            actor=self.user, company=self.company,
            lines=[{"material_id": material_with_category.id, "quantity": Decimal("1")}],
        )
        self.category.is_active = False
        self.category.save(update_fields=["is_active", "updated_at"])
        response = post_json(self.client_, submit_url(self.company.id, pr.id), {"expected_version": 1}, self.token)
        self.assertEqual(response.status_code, 400)

    def test_submit_rejects_past_required_by(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, required_by=timezone.now().date().replace(year=2000),
            lines=[{"material_id": self.material.id, "quantity": Decimal("1")}],
        )
        response = post_json(self.client_, submit_url(self.company.id, pr.id), {"expected_version": 1}, self.token)
        self.assertEqual(response.status_code, 400)

    def test_submit_captures_snapshot(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        response = post_json(self.client_, submit_url(self.company.id, pr.id), {"expected_version": 1}, self.token)
        line = response.json()["lines"][0]
        self.assertEqual(line["material_code_snapshot"], "MAT1")
        self.assertEqual(line["unit_code_snapshot"], "KG")

    def test_snapshot_preserved_after_later_material_rename(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        submit_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=1)
        self.material.name = "Renamed Material"
        self.material.save(update_fields=["name", "updated_at"])
        response = get_json(self.client_, purchase_request_url(self.company.id, pr.id), self.token)
        line = response.json()["lines"][0]
        self.assertEqual(line["material_name_snapshot"], "MAT1")
        self.assertEqual(line["material_name"], "Renamed Material")

    def test_submit_idempotent_retry_same_version_no_new_audit(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        first = post_json(self.client_, submit_url(self.company.id, pr.id), {"expected_version": 1}, self.token)
        new_version = first.json()["version"]
        AuditLog.objects.filter(target_type="purchase_request", action="purchase_request.submitted").delete()
        second = post_json(
            self.client_, submit_url(self.company.id, pr.id), {"expected_version": new_version}, self.token
        )
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json()["version"], new_version)
        self.assertEqual(
            AuditLog.objects.filter(target_type="purchase_request", action="purchase_request.submitted").count(), 0
        )

    def test_submit_stale_version_409(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        response = post_json(self.client_, submit_url(self.company.id, pr.id), {"expected_version": 999}, self.token)
        self.assertEqual(response.status_code, 409)

    def test_submit_cancelled_rejected(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        cancel_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=1, reason="no longer needed")
        response = post_json(self.client_, submit_url(self.company.id, pr.id), {"expected_version": 2}, self.token)
        self.assertEqual(response.status_code, 400)

    def test_submit_does_not_create_unrelated_rows(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        post_json(self.client_, submit_url(self.company.id, pr.id), {"expected_version": 1}, self.token)
        self.assertEqual(PurchaseRequest.objects.count(), 1)


# ---------------------------------------------------------------------------
# Cancel
# ---------------------------------------------------------------------------


class PurchaseRequestCancelTests(PurchaseRequestTestCase):
    def test_cancel_draft_success(self):
        pr = create_purchase_request(actor=self.user, company=self.company)
        response = post_json(
            self.client_, cancel_url(self.company.id, pr.id), {"expected_version": 1, "cancellation_reason": "no longer needed"}, self.token
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "CANCELLED")

    def test_cancel_submitted_success(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        submit_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=1)
        response = post_json(
            self.client_, cancel_url(self.company.id, pr.id), {"expected_version": 2, "cancellation_reason": "changed plans"}, self.token
        )
        self.assertEqual(response.status_code, 200)

    def test_cancel_requires_nonblank_reason(self):
        pr = create_purchase_request(actor=self.user, company=self.company)
        response = post_json(
            self.client_, cancel_url(self.company.id, pr.id), {"expected_version": 1, "cancellation_reason": "   "}, self.token
        )
        self.assertEqual(response.status_code, 400)

    def test_cancel_missing_reason_400(self):
        pr = create_purchase_request(actor=self.user, company=self.company)
        response = post_json(self.client_, cancel_url(self.company.id, pr.id), {"expected_version": 1}, self.token)
        self.assertEqual(response.status_code, 400)

    def test_cancel_idempotent_same_reason(self):
        pr = create_purchase_request(actor=self.user, company=self.company)
        first = post_json(
            self.client_, cancel_url(self.company.id, pr.id), {"expected_version": 1, "cancellation_reason": "dup"}, self.token
        )
        new_version = first.json()["version"]
        AuditLog.objects.filter(target_type="purchase_request", action="purchase_request.cancelled").delete()
        second = post_json(
            self.client_, cancel_url(self.company.id, pr.id), {"expected_version": new_version, "cancellation_reason": "dup"}, self.token
        )
        self.assertEqual(second.status_code, 200)
        self.assertEqual(
            AuditLog.objects.filter(target_type="purchase_request", action="purchase_request.cancelled").count(), 0
        )

    def test_cancel_different_reason_while_cancelled_409(self):
        pr = create_purchase_request(actor=self.user, company=self.company)
        first = post_json(
            self.client_, cancel_url(self.company.id, pr.id), {"expected_version": 1, "cancellation_reason": "reason A"}, self.token
        )
        new_version = first.json()["version"]
        response = post_json(
            self.client_, cancel_url(self.company.id, pr.id), {"expected_version": new_version, "cancellation_reason": "reason B"}, self.token
        )
        self.assertEqual(response.status_code, 409)

    def test_cancel_stale_version_409(self):
        pr = create_purchase_request(actor=self.user, company=self.company)
        response = post_json(
            self.client_, cancel_url(self.company.id, pr.id), {"expected_version": 999, "cancellation_reason": "x"}, self.token
        )
        self.assertEqual(response.status_code, 409)

    def test_cancelled_cannot_be_edited(self):
        pr = create_purchase_request(actor=self.user, company=self.company)
        post_json(
            self.client_, cancel_url(self.company.id, pr.id), {"expected_version": 1, "cancellation_reason": "x"}, self.token
        )
        response = patch_json(
            self.client_, purchase_request_url(self.company.id, pr.id), {"expected_version": 2, "notes": "y"}, self.token
        )
        self.assertEqual(response.status_code, 400)

    def test_cancelled_cannot_be_submitted(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        post_json(
            self.client_, cancel_url(self.company.id, pr.id), {"expected_version": 1, "cancellation_reason": "x"}, self.token
        )
        response = post_json(self.client_, submit_url(self.company.id, pr.id), {"expected_version": 2}, self.token)
        self.assertEqual(response.status_code, 400)

    def test_cancel_preserves_lines(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        post_json(
            self.client_, cancel_url(self.company.id, pr.id), {"expected_version": 1, "cancellation_reason": "x"}, self.token
        )
        pr.refresh_from_db()
        self.assertEqual(pr.lines.count(), 1)

    # -----------------------------------------------------------------
    # Task 08B-2: cancelling a SUBMITTED (pending) request now needs a
    # DIFFERENT permission than cancelling a DRAFT - this is the fix for
    # the authorization gap documented in
    # docs/purchase-workflow-proposal.md ("purchase_requests.cancel alone
    # must no longer permit cancelling SUBMITTED").
    # -----------------------------------------------------------------

    def test_cancel_only_permission_cannot_cancel_submitted_403(self):
        user = make_user("canceldraftonly")
        grant_company_permission(
            self.superuser, user, self.company,
            "purchase_requests.view", "purchase_requests.create", "purchase_requests.submit",
            "purchase_requests.cancel",
        )
        token = access_token_for(user)
        pr = create_purchase_request(
            actor=user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        submit_purchase_request(actor=user, purchase_request_id=pr.id, expected_version=1)
        response = post_json(
            self.client_, cancel_url(self.company.id, pr.id),
            {"expected_version": 2, "cancellation_reason": "trying anyway"}, token,
        )
        self.assertEqual(response.status_code, 403)
        pr.refresh_from_db()
        self.assertEqual(pr.status, "SUBMITTED")

    def test_cancel_pending_only_permission_cannot_cancel_draft_403(self):
        user = make_user("cancelpendingonly")
        grant_company_permission(
            self.superuser, user, self.company,
            "purchase_requests.view", "purchase_requests.create", "purchase_requests.cancel_pending",
        )
        token = access_token_for(user)
        pr = create_purchase_request(actor=user, company=self.company)
        response = post_json(
            self.client_, cancel_url(self.company.id, pr.id),
            {"expected_version": 1, "cancellation_reason": "trying anyway"}, token,
        )
        self.assertEqual(response.status_code, 403)
        pr.refresh_from_db()
        self.assertEqual(pr.status, "DRAFT")

    def test_cancel_pending_permission_can_cancel_submitted(self):
        user = make_user("cancelpendingholder")
        grant_company_permission(
            self.superuser, user, self.company,
            "purchase_requests.view", "purchase_requests.create", "purchase_requests.submit",
            "purchase_requests.cancel_pending",
        )
        token = access_token_for(user)
        pr = create_purchase_request(
            actor=user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        submit_purchase_request(actor=user, purchase_request_id=pr.id, expected_version=1)
        response = post_json(
            self.client_, cancel_url(self.company.id, pr.id),
            {"expected_version": 2, "cancellation_reason": "cancel while pending"}, token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "CANCELLED")

    def test_cancel_with_neither_permission_403_at_view_layer(self):
        user = make_user("noneperm")
        grant_company_permission(self.superuser, user, self.company, "purchase_requests.view")
        token = access_token_for(user)
        pr = create_purchase_request(actor=self.user, company=self.company)
        response = post_json(
            self.client_, cancel_url(self.company.id, pr.id), {"expected_version": 1, "cancellation_reason": "x"}, token
        )
        self.assertEqual(response.status_code, 403)

    def test_pending_cancel_closes_round_and_records_decision(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        submit_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=1)
        cancel_purchase_request(
            actor=self.user, purchase_request_id=pr.id, expected_version=2, reason="stopping this round"
        )
        pr.refresh_from_db()
        self.assertIsNone(pr.current_step)
        round_obj = pr.approval_rounds.get(round_number=1)
        self.assertEqual(round_obj.outcome, "CANCELLED")
        self.assertIsNotNone(round_obj.closed_at)
        decision = round_obj.decisions.get()
        self.assertEqual(decision.decision, "CANCELLED")
        self.assertEqual(decision.step, 1)
        self.assertEqual(decision.reason, "stopping this round")

    def test_approved_cannot_be_cancelled(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        pr = submit_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=1)
        for i in range(3):
            approver = make_user(f"approver_for_cancel_test_{i}")
            grant_company_permission(
                self.superuser, approver, self.company, "purchase_requests.view", "purchase_requests.approve"
            )
            pr = approve_purchase_request(
                actor=approver, purchase_request_id=pr.id, expected_version=pr.version,
                expected_round=pr.current_round, expected_step=pr.current_step,
            )
        pr.refresh_from_db()
        self.assertEqual(pr.status, "APPROVED")
        response = post_json(
            self.client_, cancel_url(self.company.id, pr.id),
            {"expected_version": pr.version, "cancellation_reason": "too late"}, self.token,
        )
        self.assertEqual(response.status_code, 400)


# ---------------------------------------------------------------------------
# Approve
# ---------------------------------------------------------------------------


class PurchaseRequestApproveTests(PurchaseRequestTestCase):
    def _submitted_pr(self, requester=None):
        requester = requester or self.user
        pr = create_purchase_request(
            actor=requester, company=self.company,
            lines=[{"material_id": self.material.id, "quantity": Decimal("1")}],
        )
        return submit_purchase_request(actor=requester, purchase_request_id=pr.id, expected_version=1)

    def _admin(self, name):
        user = make_user(name)
        grant_company_permission(
            self.superuser, user, self.company, "purchase_requests.view", "purchase_requests.approve"
        )
        return user, access_token_for(user)

    def test_approve_advances_one_step(self):
        pr = self._submitted_pr()
        _, token = self._admin("admin1")
        response = post_json(
            self.client_, approve_url(self.company.id, pr.id),
            {"expected_version": pr.version, "expected_round": 1, "expected_step": 1}, token,
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "SUBMITTED")
        self.assertEqual(body["current_round"], 1)
        self.assertEqual(body["current_step"], 2)
        self.assertEqual(body["version"], pr.version + 1)

    def test_third_approval_moves_to_approved_and_closes_round(self):
        pr = self._submitted_pr()
        body = None
        for i in range(3):
            _, token = self._admin(f"seqadmin{i}")
            response = post_json(
                self.client_, approve_url(self.company.id, pr.id),
                {"expected_version": pr.version, "expected_round": pr.current_round, "expected_step": pr.current_step},
                token,
            )
            self.assertEqual(response.status_code, 200)
            body = response.json()
            pr.refresh_from_db()
        self.assertEqual(body["status"], "APPROVED")
        self.assertIsNone(body["current_step"])
        self.assertEqual(body["approval_rounds"][0]["outcome"], "APPROVED")
        self.assertIsNotNone(body["approval_rounds"][0]["closed_at"])

    def test_approve_creates_no_purchase_order_or_stock_row(self):
        # No PO/stock model exists in this codebase - this documents that
        # approving mutates only the one PurchaseRequest and its own
        # history rows, nothing else.
        pr = self._submitted_pr()
        _, token = self._admin("nosideeffectadmin")
        post_json(
            self.client_, approve_url(self.company.id, pr.id),
            {"expected_version": pr.version, "expected_round": 1, "expected_step": 1}, token,
        )
        self.assertEqual(PurchaseRequest.objects.count(), 1)

    def test_requester_cannot_approve_own_request(self):
        pr = self._submitted_pr()
        response = post_json(
            self.client_, approve_url(self.company.id, pr.id),
            {"expected_version": pr.version, "expected_round": 1, "expected_step": 1}, self.token,
        )
        self.assertEqual(response.status_code, 400)
        pr.refresh_from_db()
        self.assertEqual(pr.current_step, 1)

    def test_requester_cannot_approve_own_request_even_as_superuser(self):
        superuser_requester = self.superuser
        pr = create_purchase_request(
            actor=superuser_requester, company=self.company,
            lines=[{"material_id": self.material.id, "quantity": Decimal("1")}],
        )
        grant_company_permission(
            self.superuser, superuser_requester, self.company,
            "purchase_requests.view", "purchase_requests.submit", "purchase_requests.approve",
        )
        pr = submit_purchase_request(actor=superuser_requester, purchase_request_id=pr.id, expected_version=1)
        with self.assertRaises(DjangoValidationError):
            approve_purchase_request(
                actor=superuser_requester, purchase_request_id=pr.id, expected_version=pr.version,
                expected_round=1, expected_step=1,
            )

    def test_alternate_admin_can_approve_when_requester_is_admin(self):
        requester = make_user("adminrequester")
        grant_company_permission(
            self.superuser, requester, self.company,
            "purchase_requests.view", "purchase_requests.create", "purchase_requests.submit",
            "purchase_requests.approve",
        )
        pr = self._submitted_pr(requester=requester)
        _, token = self._admin("otheradmin")
        response = post_json(
            self.client_, approve_url(self.company.id, pr.id),
            {"expected_version": pr.version, "expected_round": 1, "expected_step": 1}, token,
        )
        self.assertEqual(response.status_code, 200)

    def test_same_admin_cannot_decide_two_steps_in_same_round(self):
        pr = self._submitted_pr()
        _, token = self._admin("repeatadmin")
        first = post_json(
            self.client_, approve_url(self.company.id, pr.id),
            {"expected_version": pr.version, "expected_round": 1, "expected_step": 1}, token,
        )
        self.assertEqual(first.status_code, 200)
        new_version = first.json()["version"]
        second = post_json(
            self.client_, approve_url(self.company.id, pr.id),
            {"expected_version": new_version, "expected_round": 1, "expected_step": 2}, token,
        )
        self.assertEqual(second.status_code, 400)
        pr.refresh_from_db()
        self.assertEqual(pr.current_step, 2)

    def test_stale_version_409(self):
        pr = self._submitted_pr()
        _, token = self._admin("staleadmin")
        response = post_json(
            self.client_, approve_url(self.company.id, pr.id),
            {"expected_version": 999, "expected_round": 1, "expected_step": 1}, token,
        )
        self.assertEqual(response.status_code, 409)

    def test_wrong_step_409(self):
        pr = self._submitted_pr()
        _, token = self._admin("wrongstepadmin")
        response = post_json(
            self.client_, approve_url(self.company.id, pr.id),
            {"expected_version": pr.version, "expected_round": 1, "expected_step": 2}, token,
        )
        self.assertEqual(response.status_code, 409)

    def test_wrong_round_409(self):
        pr = self._submitted_pr()
        _, token = self._admin("wrongroundadmin")
        response = post_json(
            self.client_, approve_url(self.company.id, pr.id),
            {"expected_version": pr.version, "expected_round": 2, "expected_step": 1}, token,
        )
        self.assertEqual(response.status_code, 409)

    def test_cannot_approve_draft(self):
        pr = create_purchase_request(actor=self.user, company=self.company)
        _, token = self._admin("draftapproveadmin")
        response = post_json(
            self.client_, approve_url(self.company.id, pr.id),
            {"expected_version": 1, "expected_round": 1, "expected_step": 1}, token,
        )
        self.assertEqual(response.status_code, 400)

    def test_approve_requires_permission_403(self):
        pr = self._submitted_pr()
        user = make_user("noapprove")
        grant_company_permission(self.superuser, user, self.company, "purchase_requests.view")
        token = access_token_for(user)
        response = post_json(
            self.client_, approve_url(self.company.id, pr.id),
            {"expected_version": pr.version, "expected_round": 1, "expected_step": 1}, token,
        )
        self.assertEqual(response.status_code, 403)

    def test_company_isolation_other_companys_admin_404(self):
        pr = self._submitted_pr()
        other_admin = make_user("othercompanyadmin")
        grant_company_permission(
            self.superuser, other_admin, self.other_company,
            "purchase_requests.view", "purchase_requests.approve",
        )
        token = access_token_for(other_admin)
        response = post_json(
            self.client_, approve_url(self.other_company.id, pr.id),
            {"expected_version": pr.version, "expected_round": 1, "expected_step": 1}, token,
        )
        self.assertEqual(response.status_code, 404)


# ---------------------------------------------------------------------------
# Reject
# ---------------------------------------------------------------------------


class PurchaseRequestRejectTests(PurchaseRequestTestCase):
    def _submitted_pr(self, requester=None):
        requester = requester or self.user
        pr = create_purchase_request(
            actor=requester, company=self.company,
            lines=[{"material_id": self.material.id, "quantity": Decimal("1")}],
        )
        return submit_purchase_request(actor=requester, purchase_request_id=pr.id, expected_version=1)

    def _admin(self, name):
        user = make_user(name)
        grant_company_permission(
            self.superuser, user, self.company, "purchase_requests.view", "purchase_requests.approve"
        )
        return user, access_token_for(user)

    def test_reject_requires_reason(self):
        pr = self._submitted_pr()
        _, token = self._admin("rejectnoreason")
        response = post_json(
            self.client_, reject_url(self.company.id, pr.id),
            {"expected_version": pr.version, "expected_round": 1, "expected_step": 1, "rejection_reason": "   "},
            token,
        )
        self.assertEqual(response.status_code, 400)

    def test_reject_at_step_two_stops_round_immediately(self):
        pr = self._submitted_pr()
        _, token1 = self._admin("rejectadmin1")
        first = post_json(
            self.client_, approve_url(self.company.id, pr.id),
            {"expected_version": pr.version, "expected_round": 1, "expected_step": 1}, token1,
        )
        body = first.json()
        _, token2 = self._admin("rejectadmin2")
        second = post_json(
            self.client_, reject_url(self.company.id, pr.id),
            {
                "expected_version": body["version"], "expected_round": 1, "expected_step": 2,
                "rejection_reason": "not needed after all",
            },
            token2,
        )
        self.assertEqual(second.status_code, 200)
        body2 = second.json()
        self.assertEqual(body2["status"], "REJECTED")
        self.assertIsNone(body2["current_step"])
        round_data = body2["approval_rounds"][0]
        self.assertEqual(round_data["outcome"], "REJECTED")
        decisions = round_data["decisions"]
        self.assertEqual(len(decisions), 2)
        self.assertEqual(decisions[0]["decision"], "APPROVED")
        self.assertEqual(decisions[1]["decision"], "REJECTED")
        self.assertEqual(decisions[1]["reason"], "not needed after all")

    def test_requester_cannot_reject_own_request(self):
        pr = self._submitted_pr()
        response = post_json(
            self.client_, reject_url(self.company.id, pr.id),
            {"expected_version": pr.version, "expected_round": 1, "expected_step": 1, "rejection_reason": "self reject"},
            self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_reject_stale_round_step_409(self):
        pr = self._submitted_pr()
        _, token = self._admin("stalerejectadmin")
        response = post_json(
            self.client_, reject_url(self.company.id, pr.id),
            {"expected_version": pr.version, "expected_round": 1, "expected_step": 2, "rejection_reason": "no"}, token,
        )
        self.assertEqual(response.status_code, 409)

    def test_reject_requires_permission_403(self):
        pr = self._submitted_pr()
        user = make_user("noreject")
        grant_company_permission(self.superuser, user, self.company, "purchase_requests.view")
        token = access_token_for(user)
        response = post_json(
            self.client_, reject_url(self.company.id, pr.id),
            {"expected_version": pr.version, "expected_round": 1, "expected_step": 1, "rejection_reason": "no"}, token,
        )
        self.assertEqual(response.status_code, 403)

    def test_cannot_reject_draft(self):
        pr = create_purchase_request(actor=self.user, company=self.company)
        _, token = self._admin("draftrejectadmin")
        response = post_json(
            self.client_, reject_url(self.company.id, pr.id),
            {"expected_version": 1, "expected_round": 1, "expected_step": 1, "rejection_reason": "no"}, token,
        )
        self.assertEqual(response.status_code, 400)


# ---------------------------------------------------------------------------
# Revise
# ---------------------------------------------------------------------------


class PurchaseRequestReviseTests(PurchaseRequestTestCase):
    def _rejected_pr(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company,
            lines=[{"material_id": self.material.id, "quantity": Decimal("1")}],
        )
        pr = submit_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=1)
        admin = make_user("reviseadmin")
        grant_company_permission(
            self.superuser, admin, self.company, "purchase_requests.view", "purchase_requests.approve"
        )
        return reject_purchase_request(
            actor=admin, purchase_request_id=pr.id, expected_version=pr.version,
            expected_round=1, expected_step=1, reason="needs changes",
        )

    def test_revise_moves_rejected_to_draft(self):
        pr = self._rejected_pr()
        response = post_json(
            self.client_, revise_url(self.company.id, pr.id), {"expected_version": pr.version}, self.token
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "DRAFT")

    def test_revise_then_resubmit_restarts_at_step_one_new_round(self):
        pr = self._rejected_pr()
        pr = revise_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=pr.version)
        pr = submit_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=pr.version)
        self.assertEqual(pr.current_round, 2)
        self.assertEqual(pr.current_step, 1)
        self.assertEqual(pr.approval_rounds.count(), 2)

    def test_revise_never_submitted_draft_400(self):
        # A fresh DRAFT that was never submitted (current_round == 0) has
        # nothing to revise - this is NOT the same situation as retrying
        # revise against a DRAFT that really did come from a REJECTED ->
        # DRAFT transition (see test_revise_idempotent_on_already_draft
        # below, which legitimately gets 200). Collapsing "status is
        # DRAFT" into one idempotent branch, regardless of how that DRAFT
        # was reached, would silently accept a nonsensical call as a
        # harmless retry - it is a genuine error instead.
        pr = create_purchase_request(actor=self.user, company=self.company)
        self.assertEqual(pr.current_round, 0)
        response = post_json(
            self.client_, revise_url(self.company.id, pr.id), {"expected_version": 1}, self.token
        )
        self.assertEqual(response.status_code, 400)
        pr.refresh_from_db()
        self.assertEqual(pr.status, "DRAFT")
        self.assertEqual(pr.version, 1)

    def test_revise_rejected_from_submitted_400(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        pr = submit_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=1)
        response = post_json(
            self.client_, revise_url(self.company.id, pr.id), {"expected_version": pr.version}, self.token
        )
        self.assertEqual(response.status_code, 400)

    def test_revise_preserves_created_by(self):
        pr = self._rejected_pr()
        original_creator_id = pr.created_by_id
        revised = revise_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=pr.version)
        self.assertEqual(revised.created_by_id, original_creator_id)

    def test_revise_idempotent_on_already_draft(self):
        # Genuine retry: this DRAFT was really reached via a REJECTED ->
        # DRAFT transition (current_round > 0 after _rejected_pr() +
        # submit), so calling revise again at the now-current version is
        # a safe no-op - contrast with test_revise_never_submitted_draft_400.
        pr = self._rejected_pr()
        self.assertGreater(pr.current_round, 0)
        first = revise_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=pr.version)
        second = revise_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=first.version)
        self.assertEqual(second.version, first.version)

    def test_revise_requires_edit_permission_403(self):
        pr = self._rejected_pr()
        user = make_user("noeditrevise")
        grant_company_permission(self.superuser, user, self.company, "purchase_requests.view")
        token = access_token_for(user)
        response = post_json(
            self.client_, revise_url(self.company.id, pr.id), {"expected_version": pr.version}, token
        )
        self.assertEqual(response.status_code, 403)


# ---------------------------------------------------------------------------
# Approval round/decision history preservation across reject-revise-resubmit
# ---------------------------------------------------------------------------


class PurchaseRequestApprovalHistoryTests(PurchaseRequestTestCase):
    def _admin(self, name):
        user = make_user(name)
        grant_company_permission(
            self.superuser, user, self.company, "purchase_requests.view", "purchase_requests.approve"
        )
        return user

    def test_round_snapshot_preserved_after_edit_and_resubmit(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company,
            lines=[{"material_id": self.material.id, "quantity": Decimal("5")}],
        )
        pr = submit_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=1)
        admin = self._admin("historyadmin1")
        pr = reject_purchase_request(
            actor=admin, purchase_request_id=pr.id, expected_version=pr.version,
            expected_round=1, expected_step=1, reason="wrong quantity",
        )
        pr = revise_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=pr.version)
        pr = update_purchase_request(
            actor=self.user, purchase_request_id=pr.id, expected_version=pr.version,
            data={"lines": [{"material_id": self.material.id, "quantity": Decimal("9"), "notes": ""}]},
        )
        pr = submit_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=pr.version)

        round1 = pr.approval_rounds.get(round_number=1)
        round2 = pr.approval_rounds.get(round_number=2)
        self.assertEqual(round1.lines.get().quantity, Decimal("5.000"))
        self.assertEqual(round2.lines.get().quantity, Decimal("9.000"))
        self.assertEqual(round1.outcome, "REJECTED")
        self.assertEqual(round2.outcome, "PENDING")
        # The live PurchaseRequestLine row was replaced wholesale by the
        # edit - only the two PurchaseRequestApprovalRoundLine copies
        # still remember what round 1 actually contained.
        self.assertEqual(pr.lines.get().quantity, Decimal("9.000"))

    def test_all_decisions_and_actors_recorded_in_order(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company,
            lines=[{"material_id": self.material.id, "quantity": Decimal("1")}],
        )
        pr = submit_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=1)
        admin1 = self._admin("recadmin1")
        admin2 = self._admin("recadmin2")
        admin3 = self._admin("recadmin3")
        pr = approve_purchase_request(
            actor=admin1, purchase_request_id=pr.id, expected_version=pr.version, expected_round=1, expected_step=1
        )
        pr = approve_purchase_request(
            actor=admin2, purchase_request_id=pr.id, expected_version=pr.version, expected_round=1, expected_step=2
        )
        pr = approve_purchase_request(
            actor=admin3, purchase_request_id=pr.id, expected_version=pr.version, expected_round=1, expected_step=3
        )
        self.assertEqual(pr.status, "APPROVED")
        decisions = list(
            PurchaseRequestApproval.objects.filter(round__purchase_request=pr).order_by("step")
        )
        self.assertEqual(len(decisions), 3)
        self.assertEqual([d.actor_id for d in decisions], [admin1.id, admin2.id, admin3.id])
        self.assertTrue(all(d.decision == "APPROVED" for d in decisions))
        self.assertTrue(all(d.reason == "" for d in decisions))

    def test_earlier_round_history_untouched_by_later_round(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company,
            lines=[{"material_id": self.material.id, "quantity": Decimal("2")}],
        )
        pr = submit_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=1)
        admin = self._admin("untouchedadmin")
        pr = reject_purchase_request(
            actor=admin, purchase_request_id=pr.id, expected_version=pr.version,
            expected_round=1, expected_step=1, reason="first round reject",
        )
        round1_before = list(
            PurchaseRequestApproval.objects.filter(round__purchase_request=pr, round__round_number=1).values(
                "id", "decision", "reason", "step"
            )
        )
        pr = revise_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=pr.version)
        pr = submit_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=pr.version)
        for i in range(3):
            decider = self._admin(f"untouchedextra{i}")
            pr = approve_purchase_request(
                actor=decider, purchase_request_id=pr.id, expected_version=pr.version,
                expected_round=pr.current_round, expected_step=pr.current_step,
            )
        round1_after = list(
            PurchaseRequestApproval.objects.filter(round__purchase_request=pr, round__round_number=1).values(
                "id", "decision", "reason", "step"
            )
        )
        self.assertEqual(round1_before, round1_after)
        round1 = pr.approval_rounds.get(round_number=1)
        self.assertEqual(round1.outcome, "REJECTED")
        self.assertEqual(pr.status, "APPROVED")
        self.assertEqual(pr.approval_rounds.count(), 2)


# ---------------------------------------------------------------------------
# List / search / pagination
# ---------------------------------------------------------------------------


class PurchaseRequestListTests(PurchaseRequestTestCase):
    def test_search_matches_reference(self):
        pr = create_purchase_request(actor=self.user, company=self.company)
        create_purchase_request(actor=self.user, company=self.company)
        response = get_json(self.client_, f"{purchase_requests_url(self.company.id)}?search={pr.reference}", self.token)
        ids = [row["id"] for row in response.json()["results"]]
        self.assertEqual(ids, [pr.id])

    def test_status_filter(self):
        draft = create_purchase_request(actor=self.user, company=self.company)
        submitted = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        submit_purchase_request(actor=self.user, purchase_request_id=submitted.id, expected_version=1)

        response = get_json(self.client_, f"{purchase_requests_url(self.company.id)}?status=DRAFT", self.token)
        ids = [row["id"] for row in response.json()["results"]]
        self.assertEqual(ids, [draft.id])

    def test_status_filter_rejects_invalid_value(self):
        response = get_json(self.client_, f"{purchase_requests_url(self.company.id)}?status=BOGUS", self.token)
        self.assertEqual(response.status_code, 400)

    def test_pagination_bounded(self):
        for _ in range(5):
            create_purchase_request(actor=self.user, company=self.company)
        response = get_json(self.client_, f"{purchase_requests_url(self.company.id)}?page_size=2", self.token)
        self.assertEqual(len(response.json()["results"]), 2)

    def test_list_has_no_n_plus_one_queries(self):
        # Budget: auth user lookup, active-company resolution, permission
        # check, pagination count, main select (joined to
        # company/created_by/submitted_by/cancelled_by), one batched
        # prefetch each for lines/materials/units (3), and one batched
        # prefetch for approval_rounds (1) - 9 total, fixed regardless of
        # how many requests or lines exist, since every prefetch is a
        # single IN(...)-batched query, never one per row. None of these
        # requests were ever submitted, so approval_rounds comes back
        # empty for all of them and Django's prefetch machinery skips the
        # further nested approval_rounds__submitted_by/lines/decisions
        # queries entirely (nothing to fetch related rows for) - see
        # test_list_has_no_n_plus_one_queries_with_approval_history below
        # for the budget once a round actually exists.
        for i in range(3):
            create_purchase_request(
                actor=self.user, company=self.company,
                lines=[{"material_id": self.material.id, "quantity": Decimal("1")}] if i == 0 else [],
            )
        with self.assertNumQueries(9):
            response = get_json(self.client_, purchase_requests_url(self.company.id), self.token)
            response.json()

    def test_list_has_no_n_plus_one_queries_with_approval_history(self):
        # Once at least one request has an approval round, the nested
        # approval_rounds__submitted_by/lines__material/lines__unit/
        # decisions__actor prefetches actually fire - still one batched
        # query each (5 more: submitted_by, lines, material, unit,
        # decisions - actor is empty here since nothing has been decided
        # yet, so it is skipped the same way approval_rounds was above),
        # never one per request or per round.
        for i in range(3):
            pr = create_purchase_request(
                actor=self.user, company=self.company,
                lines=[{"material_id": self.material.id, "quantity": Decimal("1")}],
            )
            if i == 0:
                submit_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=1)
        with self.assertNumQueries(14):
            response = get_json(self.client_, purchase_requests_url(self.company.id), self.token)
            response.json()


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------


class PurchaseRequestAuditTests(PurchaseRequestTestCase):
    def test_create_audit_has_company_context(self):
        response = post_json(self.client_, purchase_requests_url(self.company.id), {}, self.token)
        pr_id = response.json()["id"]
        entry = AuditLog.objects.filter(target_type="purchase_request", target_id=pr_id, action="purchase_request.created").get()
        self.assertEqual(entry.company_id, self.company.id)
        self.assertIsNone(entry.store_id)

    def test_update_audit_before_after_includes_lines(self):
        pr = create_purchase_request(actor=self.user, company=self.company)
        AuditLog.objects.all().delete()
        patch_json(
            self.client_,
            purchase_request_url(self.company.id, pr.id),
            {"expected_version": 1, "lines": [{"material_id": self.material.id, "quantity": "2"}]},
            self.token,
        )
        entry = AuditLog.objects.filter(target_type="purchase_request", action="purchase_request.updated").get()
        self.assertEqual(entry.before["lines"], [])
        self.assertEqual(len(entry.after["lines"]), 1)

    def test_create_audit_rollback_on_failure(self):
        with patch("apps.purchasing.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(self.client_, purchase_requests_url(self.company.id), {}, self.token)
        self.assertEqual(PurchaseRequest.objects.count(), 0)

    def test_update_audit_rollback_on_failure(self):
        pr = create_purchase_request(actor=self.user, company=self.company, notes="original")
        with patch("apps.purchasing.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                patch_json(
                    self.client_, purchase_request_url(self.company.id, pr.id), {"expected_version": 1, "notes": "changed"}, self.token
                )
        pr.refresh_from_db()
        self.assertEqual(pr.notes, "original")
        self.assertEqual(pr.version, 1)

    def test_submit_audit_rollback_on_failure(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        with patch("apps.purchasing.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(self.client_, submit_url(self.company.id, pr.id), {"expected_version": 1}, self.token)
        pr.refresh_from_db()
        self.assertEqual(pr.status, "DRAFT")
        self.assertEqual(pr.version, 1)
        self.assertEqual(pr.lines.first().material_code_snapshot, "")

    def test_cancel_audit_rollback_on_failure(self):
        pr = create_purchase_request(actor=self.user, company=self.company)
        with patch("apps.purchasing.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(
                    self.client_, cancel_url(self.company.id, pr.id), {"expected_version": 1, "cancellation_reason": "x"}, self.token
                )
        pr.refresh_from_db()
        self.assertEqual(pr.status, "DRAFT")
        self.assertEqual(pr.version, 1)

    def test_pending_cancel_audit_rollback_on_failure_leaves_round_open(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        pr = submit_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=1)
        with patch("apps.purchasing.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(
                    self.client_, cancel_url(self.company.id, pr.id),
                    {"expected_version": pr.version, "cancellation_reason": "x"}, self.token,
                )
        pr.refresh_from_db()
        self.assertEqual(pr.status, "SUBMITTED")
        self.assertEqual(pr.current_step, 1)
        self.assertEqual(pr.approval_rounds.get(round_number=1).outcome, "PENDING")
        self.assertEqual(PurchaseRequestApproval.objects.filter(round__purchase_request=pr).count(), 0)

    def test_approve_audit_rollback_on_failure(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        pr = submit_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=1)
        admin = make_user("approverollbackadmin")
        grant_company_permission(
            self.superuser, admin, self.company, "purchase_requests.view", "purchase_requests.approve"
        )
        token = access_token_for(admin)
        with patch("apps.purchasing.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(
                    self.client_, approve_url(self.company.id, pr.id),
                    {"expected_version": pr.version, "expected_round": 1, "expected_step": 1}, token,
                )
        pr.refresh_from_db()
        self.assertEqual(pr.status, "SUBMITTED")
        self.assertEqual(pr.current_step, 1)
        self.assertEqual(PurchaseRequestApproval.objects.filter(round__purchase_request=pr).count(), 0)

    def test_reject_audit_rollback_on_failure(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        pr = submit_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=1)
        admin = make_user("rejectrollbackadmin")
        grant_company_permission(
            self.superuser, admin, self.company, "purchase_requests.view", "purchase_requests.approve"
        )
        token = access_token_for(admin)
        with patch("apps.purchasing.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(
                    self.client_, reject_url(self.company.id, pr.id),
                    {"expected_version": pr.version, "expected_round": 1, "expected_step": 1, "rejection_reason": "x"},
                    token,
                )
        pr.refresh_from_db()
        self.assertEqual(pr.status, "SUBMITTED")
        self.assertEqual(pr.approval_rounds.get(round_number=1).outcome, "PENDING")
        self.assertEqual(PurchaseRequestApproval.objects.filter(round__purchase_request=pr).count(), 0)

    def test_revise_audit_rollback_on_failure(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        pr = submit_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=1)
        admin = make_user("reviserollbackadmin")
        grant_company_permission(
            self.superuser, admin, self.company, "purchase_requests.view", "purchase_requests.approve"
        )
        pr = reject_purchase_request(
            actor=admin, purchase_request_id=pr.id, expected_version=pr.version,
            expected_round=1, expected_step=1, reason="needs changes",
        )
        with patch("apps.purchasing.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(
                    self.client_, revise_url(self.company.id, pr.id), {"expected_version": pr.version}, self.token
                )
        pr.refresh_from_db()
        self.assertEqual(pr.status, "REJECTED")


# ---------------------------------------------------------------------------
# Concurrency (real row locking, needs a real transaction/connection per
# thread - TestCase's implicit wrapping transaction cannot exhibit this)
# ---------------------------------------------------------------------------


class ConcurrentTransitionTests(TransactionTestCase):
    # TransactionTestCase flushes the whole database after every test
    # method (not just this test's own rows) unless told to restore the
    # migration-seeded data first - this class now has more than one test
    # method, and the seeded purchase_requests.* PermissionDefinition rows
    # (from the permissions app's data migrations) must still be present
    # for the second method to run, or every grant_company_permission()
    # call in it fails with "Unknown permission code(s)".
    serialized_rollback = True


    def test_concurrent_submit_produces_exactly_one_transition(self):
        from django.db import connection

        superuser = make_superuser("admin")
        company = make_company("ACME")
        user = make_user("staffuser")
        grant_company_permission(superuser, user, company, *ALL_PERMS)
        unit = make_unit("KG")
        material = make_material("MAT1", base_unit=unit)
        pr = create_purchase_request(
            actor=user, company=company, lines=[{"material_id": material.id, "quantity": Decimal("1")}]
        )

        results = []
        barrier = threading.Barrier(2)

        def worker():
            try:
                barrier.wait(timeout=5)
                result = submit_purchase_request(actor=user, purchase_request_id=pr.id, expected_version=1)
                results.append(("ok", result.status))
            except Conflict:
                results.append(("conflict", None))
            finally:
                connection.close()

        threads = [threading.Thread(target=worker) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        outcomes = [r[0] for r in results]
        self.assertEqual(outcomes.count("ok"), 1, outcomes)
        self.assertEqual(outcomes.count("conflict"), 1, outcomes)

        pr.refresh_from_db()
        self.assertEqual(pr.status, "SUBMITTED")
        self.assertEqual(pr.version, 2)

    def test_concurrent_approve_by_two_admins_produces_exactly_one_advance(self):
        """Two different, both-eligible admins race to approve the same
        pending step at once. Only one may win - the loser must see a
        `409 Conflict` (from the round/step-match check, same as a stale
        version would), never a silently-lost decision and never two
        PurchaseRequestApproval rows for the same (round, step) - that is
        also what the model's unique_decision_per_round_step constraint
        would refuse at the database level if the lock were ever somehow
        bypassed.
        """
        from django.db import connection

        superuser = make_superuser("concurrentapproveadmin")
        company = make_company("CONCUR")
        requester = make_user("concurrentrequester")
        admin_a = make_user("concurrentadmina")
        admin_b = make_user("concurrentadminb")
        grant_company_permission(superuser, requester, company, *ALL_PERMS)
        grant_company_permission(
            superuser, admin_a, company, "purchase_requests.view", "purchase_requests.approve"
        )
        grant_company_permission(
            superuser, admin_b, company, "purchase_requests.view", "purchase_requests.approve"
        )
        unit = make_unit("KGC")
        material = make_material("MATCONC", base_unit=unit)
        pr = create_purchase_request(
            actor=requester, company=company, lines=[{"material_id": material.id, "quantity": Decimal("1")}]
        )
        pr = submit_purchase_request(actor=requester, purchase_request_id=pr.id, expected_version=1)

        results = []
        barrier = threading.Barrier(2)

        def worker(admin):
            try:
                barrier.wait(timeout=5)
                result = approve_purchase_request(
                    actor=admin, purchase_request_id=pr.id, expected_version=pr.version,
                    expected_round=1, expected_step=1,
                )
                results.append(("ok", result.current_step))
            except Conflict:
                results.append(("conflict", None))
            finally:
                connection.close()

        threads = [
            threading.Thread(target=worker, args=(admin_a,)),
            threading.Thread(target=worker, args=(admin_b,)),
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        outcomes = [r[0] for r in results]
        self.assertEqual(outcomes.count("ok"), 1, outcomes)
        self.assertEqual(outcomes.count("conflict"), 1, outcomes)

        pr.refresh_from_db()
        self.assertEqual(pr.current_step, 2)
        self.assertEqual(PurchaseRequestApproval.objects.filter(round__purchase_request=pr).count(), 1)


# ---------------------------------------------------------------------------
# Migration compatibility: existing SUBMITTED requests -> round 1
# ---------------------------------------------------------------------------


class PurchaseRequestExistingSubmittedMigrationCompatibilityTests(TestCase):
    """Exercises the RunPython functions in purchasing.migrations.
    0003_migrate_existing_submitted_requests_to_round_one directly against
    the current model classes, rather than pulling in a third-party
    migration-testing package (none is a dependency of this project) or
    hand-rolling a historical-app-registry harness for one small,
    self-contained data migration. This still calls the exact same
    function the real migration runs - only the mechanism for obtaining
    `apps` (the live app registry vs. a frozen historical one) differs,
    and nothing in that function depends on any field this project has
    since removed or renamed.
    """

    def setUp(self):
        from django.apps import apps as live_apps

        self.live_apps = live_apps
        self.superuser = make_superuser("migrationadmin")
        self.company = make_company("MIGCO")
        self.user = make_user("miguser")
        grant_company_permission(self.superuser, self.user, self.company, *ALL_PERMS)
        self.unit = make_unit("MIGKG")
        self.material = make_material("MIGMAT", base_unit=self.unit)

    @staticmethod
    def _migration_module():
        # Migration filenames start with a digit, so they cannot be
        # imported with a normal `from package import name` statement -
        # Django's own migration loader reaches them the same way, via
        # importlib.import_module() with the literal dotted path.
        import importlib

        return importlib.import_module(
            "apps.purchasing.migrations.0003_migrate_existing_submitted_requests_to_round_one"
        )

    def _run_forward_migration(self):
        self._migration_module().migrate_submitted_requests_to_round_one(self.live_apps, None)

    def test_pre_existing_submitted_request_gets_backfilled_into_round_one(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("3")}]
        )
        pr = submit_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=1)
        # Simulate "this row existed before the approval workflow shipped":
        # the real migration only ever sees rows with current_round=0 -
        # every request submitted through today's submit_purchase_request
        # already sets current_round=1 itself, so this test forces the
        # pre-migration shape back onto an already-submitted request
        # without touching the round rows submit_purchase_request itself
        # already created (deleted below, exactly as if they had never
        # existed).
        pr.approval_rounds.all().delete()
        pr.current_round = 0
        pr.current_step = None
        pr.save(update_fields=["current_round", "current_step"])

        self._run_forward_migration()

        pr.refresh_from_db()
        self.assertEqual(pr.current_round, 1)
        self.assertEqual(pr.current_step, 1)
        round1 = pr.approval_rounds.get(round_number=1)
        self.assertEqual(round1.outcome, "PENDING")
        self.assertEqual(round1.submitted_by_id, self.user.id)
        line = round1.lines.get()
        self.assertEqual(line.quantity, Decimal("3.000"))
        self.assertEqual(line.material_code_snapshot, "MIGMAT")

    def test_draft_request_untouched_by_migration(self):
        pr = create_purchase_request(actor=self.user, company=self.company)
        self._run_forward_migration()
        pr.refresh_from_db()
        self.assertEqual(pr.current_round, 0)
        self.assertIsNone(pr.current_step)
        self.assertEqual(pr.approval_rounds.count(), 0)

    def test_already_migrated_request_is_not_touched_again(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        pr = submit_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=1)
        # submit_purchase_request already created round 1 itself (current
        # code path, not the migration) - current_round is already 1, so
        # the migration's own current_round=0 filter must skip this row.
        round_count_before = pr.approval_rounds.count()
        self._run_forward_migration()
        self.assertEqual(pr.approval_rounds.count(), round_count_before)

    def test_reverse_migration_removes_only_untouched_backfilled_rounds(self):
        pr = create_purchase_request(
            actor=self.user, company=self.company, lines=[{"material_id": self.material.id, "quantity": Decimal("1")}]
        )
        pr = submit_purchase_request(actor=self.user, purchase_request_id=pr.id, expected_version=1)
        pr.approval_rounds.all().delete()
        pr.current_round = 0
        pr.current_step = None
        pr.save(update_fields=["current_round", "current_step"])
        self._run_forward_migration()
        self._migration_module().revert_round_one_backfill(self.live_apps, None)

        pr.refresh_from_db()
        self.assertEqual(pr.current_round, 0)
        self.assertIsNone(pr.current_step)
        self.assertEqual(pr.approval_rounds.count(), 0)
