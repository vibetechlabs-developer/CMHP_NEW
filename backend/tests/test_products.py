import itertools
import json
import threading
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import Client, TestCase, TransactionTestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.audit.models import AuditLog
from apps.catalog.models import UnitOfMeasure
from apps.common.errors import Conflict
from apps.companies.models import Company
from apps.permissions.services import create_company_role, replace_role_permissions
from apps.products.admin import ProductAdmin
from apps.products.models import Product
from apps.products.services import (
    activate_product,
    create_product,
    deactivate_product,
    update_product,
)
from apps.users.services import assign_company_membership, assign_membership_role

User = get_user_model()
PASSWORD = "a-strong-pass-1"

ALL_PERMS = [
    "products.view",
    "products.create",
    "products.edit",
    "products.activate",
    "products.deactivate",
]


def products_url(company_id):
    return f"/api/v1/companies/{company_id}/products/"


def product_url(company_id, product_id):
    return f"/api/v1/companies/{company_id}/products/{product_id}/"


def activate_url(company_id, product_id):
    return f"/api/v1/companies/{company_id}/products/{product_id}/activate/"


def deactivate_url(company_id, product_id):
    return f"/api/v1/companies/{company_id}/products/{product_id}/deactivate/"


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


def make_unit(code, dimension="COUNT", **kwargs):
    return UnitOfMeasure.objects.create(code=code, name=code, dimension=dimension, **kwargs)


_creator_counter = itertools.count()


def make_product(company, code, sales_uom, name=None, actor=None, **kwargs):
    if actor is None:
        actor = make_user(f"productcreator{next(_creator_counter)}")
    return Product.objects.create(
        company=company, code=code, name=name or code, sales_uom=sales_uom, created_by=actor, **kwargs
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
    membership, _ = assign_company_membership(actor=actor, user=user, company=company)
    role = create_company_role(actor=actor, company=company, code=f"ROLE{user.id}", name="Role")
    role, _ = replace_role_permissions(actor=actor, role=role, permission_codes=list(permission_codes))
    assign_membership_role(actor=actor, membership=membership, role=role)
    return membership, role


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------


class ProductModelTests(TestCase):
    def setUp(self):
        self.superuser = make_superuser("modeladmin")
        self.company_a = make_company("PCOMPA")
        self.company_b = make_company("PCOMPB")
        self.unit = make_unit("PCS")

    def test_code_is_normalized(self):
        product = make_product(self.company_a, "  widget ", self.unit, name="Widget")
        self.assertEqual(product.code, "WIDGET")

    def test_blank_code_rejected(self):
        with self.assertRaises(Exception):
            make_product(self.company_a, "   ", self.unit, name="X")

    def test_blank_name_rejected(self):
        with self.assertRaises(Exception):
            make_product(self.company_a, "P1", self.unit, name="   ")

    def test_sales_uom_required(self):
        with self.assertRaises(Exception):
            make_product(self.company_a, "P1", None, name="X")

    def test_same_code_allowed_across_different_companies(self):
        make_product(self.company_a, "SAME", self.unit, name="A")
        make_product(self.company_b, "SAME", self.unit, name="B")
        self.assertEqual(Product.objects.filter(code="SAME").count(), 2)

    def test_duplicate_code_within_same_company_rejected(self):
        make_product(self.company_a, "DUP", self.unit, name="First")
        with self.assertRaises(Exception):
            make_product(self.company_a, "DUP", self.unit, name="Second")

    def test_inactive_product_still_reserves_its_code(self):
        product = make_product(self.company_a, "RESV", self.unit, name="Original")
        product.is_active = False
        product.save(update_fields=["is_active"])
        with self.assertRaises(Exception):
            make_product(self.company_a, "RESV", self.unit, name="New Product")

    def test_company_immutable_after_creation(self):
        product = make_product(self.company_a, "IMMC", self.unit, name="X")
        product.company = self.company_b
        with self.assertRaises(Exception):
            product.save()

    def test_code_immutable_after_creation(self):
        product = make_product(self.company_a, "IMMK", self.unit, name="X")
        product.code = "CHANGED"
        with self.assertRaises(Exception):
            product.save()

    def test_sales_uom_immutable_after_creation(self):
        other_unit = make_unit("KG")
        product = make_product(self.company_a, "IMMU", self.unit, name="X")
        product.sales_uom = other_unit
        with self.assertRaises(Exception):
            product.save()


# ---------------------------------------------------------------------------
# Access control
# ---------------------------------------------------------------------------


class ProductAccessTestCase(TestCase):
    def setUp(self):
        self.superuser = make_superuser("accessadmin")
        self.company = make_company("PACCESSCO")
        self.other_company = make_company("POTHERCO")
        self.user = make_user("paccessuser")
        self.unit = make_unit("EA")
        self.client_ = Client()


class ProductAccessTests(ProductAccessTestCase):
    def test_anonymous_request_is_rejected(self):
        response = self.client_.get(products_url(self.company.id))
        self.assertEqual(response.status_code, 401)

    def test_inactive_user_is_rejected(self):
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        token = access_token_for(self.user)
        response = get_json(self.client_, products_url(self.company.id), token)
        self.assertEqual(response.status_code, 401)

    def test_user_without_membership_gets_404(self):
        token = access_token_for(self.user)
        response = get_json(self.client_, products_url(self.company.id), token)
        self.assertEqual(response.status_code, 404)

    def test_membership_in_inactive_company_gets_404(self):
        grant_company_permission(self.superuser, self.user, self.company, "products.view")
        self.company.is_active = False
        self.company.save(update_fields=["is_active"])
        token = access_token_for(self.user)
        response = get_json(self.client_, products_url(self.company.id), token)
        self.assertEqual(response.status_code, 404)

    def test_nonexistent_company_gets_404(self):
        grant_company_permission(self.superuser, self.user, self.company, "products.view")
        token = access_token_for(self.user)
        response = get_json(self.client_, products_url(999999), token)
        self.assertEqual(response.status_code, 404)

    def test_membership_without_permission_gets_403_naming_missing_permission(self):
        assign_company_membership(actor=self.superuser, user=self.user, company=self.company)
        token = access_token_for(self.user)
        response = get_json(self.client_, products_url(self.company.id), token)
        self.assertEqual(response.status_code, 403)
        self.assertIn("products.view", response.json()["detail"])

    def test_view_permission_does_not_grant_create(self):
        grant_company_permission(self.superuser, self.user, self.company, "products.view")
        token = access_token_for(self.user)
        response = post_json(
            self.client_, products_url(self.company.id), {"code": "P1", "name": "X", "sales_uom_id": self.unit.id}, token
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn("products.create", response.json()["detail"])

    def test_superuser_has_no_implicit_bypass(self):
        token = access_token_for(self.superuser)
        response = get_json(self.client_, products_url(self.company.id), token)
        self.assertEqual(response.status_code, 404)

    def test_company_isolation_on_detail_endpoint(self):
        grant_company_permission(self.superuser, self.user, self.company, "products.view")
        grant_company_permission(self.superuser, self.user, self.other_company, "products.view")
        product = make_product(self.other_company, "ISOL", self.unit, name="X")
        token = access_token_for(self.user)
        response = get_json(self.client_, product_url(self.company.id, product.id), token)
        self.assertEqual(response.status_code, 404)

    def test_delete_method_not_allowed(self):
        grant_company_permission(self.superuser, self.user, self.company, *ALL_PERMS)
        product = make_product(self.company, "NODEL", self.unit, name="X")
        token = access_token_for(self.user)
        response = self.client_.delete(product_url(self.company.id, product.id), **bearer(token))
        self.assertEqual(response.status_code, 405)


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


class ProductCreateTests(ProductAccessTestCase):
    def setUp(self):
        super().setUp()
        grant_company_permission(self.superuser, self.user, self.company, *ALL_PERMS)
        self.token = access_token_for(self.user)

    def test_create_success(self):
        response = post_json(
            self.client_,
            products_url(self.company.id),
            {"code": "prod1", "name": "Herbal Tonic 200ml", "sales_uom_id": self.unit.id},
            self.token,
        )
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["code"], "PROD1")
        self.assertEqual(body["company_id"], self.company.id)
        self.assertEqual(body["sales_uom_id"], self.unit.id)
        self.assertEqual(body["sales_uom_code"], "EA")
        self.assertTrue(body["sales_uom_is_active"])
        self.assertTrue(body["is_active"])
        self.assertEqual(body["version"], 1)
        # Task 12B-1: optional, defaults to blank when not supplied
        self.assertEqual(body["product_type"], "")

    def test_create_with_product_type(self):
        """`product_type` is free text (Task 12B-1) - the client's own
        register gives "Tablets" as one example value, not an exhaustive
        list, so no fixed choice set is enforced here.
        """
        response = post_json(
            self.client_,
            products_url(self.company.id),
            {"code": "PT1", "name": "Flexicare", "product_type": "Tablets", "sales_uom_id": self.unit.id},
            self.token,
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["product_type"], "Tablets")
        # an arbitrary, unlisted value is accepted too - there is no enum
        response2 = post_json(
            self.client_,
            products_url(self.company.id),
            {"code": "PT2", "name": "Cough Drops", "product_type": "Homeopathic Globules", "sales_uom_id": self.unit.id},
            self.token,
        )
        self.assertEqual(response2.status_code, 201, response2.content)
        self.assertEqual(response2.json()["product_type"], "Homeopathic Globules")

    def test_create_records_audit_entry(self):
        response = post_json(
            self.client_,
            products_url(self.company.id),
            {"code": "AUD1", "name": "X", "sales_uom_id": self.unit.id},
            self.token,
        )
        product_id = response.json()["id"]
        entry = AuditLog.objects.get(target_type="product", target_id=product_id, action="product.created")
        self.assertEqual(entry.company_id, self.company.id)
        self.assertEqual(entry.after["code"], "AUD1")
        self.assertEqual(entry.after["sales_uom_id"], self.unit.id)

    def test_create_rejects_company_id_in_body(self):
        response = post_json(
            self.client_,
            products_url(self.company.id),
            {"code": "REJ1", "name": "X", "sales_uom_id": self.unit.id, "company_id": self.company.id},
            self.token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("company_id", response.json())

    def test_create_rejects_is_active_in_body(self):
        response = post_json(
            self.client_,
            products_url(self.company.id),
            {"code": "REJ2", "name": "X", "sales_uom_id": self.unit.id, "is_active": False},
            self.token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("is_active", response.json())

    def test_create_rejects_version_in_body(self):
        response = post_json(
            self.client_,
            products_url(self.company.id),
            {"code": "REJ3", "name": "X", "sales_uom_id": self.unit.id, "version": 5},
            self.token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("version", response.json())

    def test_create_requires_name(self):
        response = post_json(
            self.client_, products_url(self.company.id), {"code": "REJ5", "sales_uom_id": self.unit.id}, self.token
        )
        self.assertEqual(response.status_code, 400)

    def test_create_requires_sales_uom_id(self):
        response = post_json(self.client_, products_url(self.company.id), {"code": "REJ6", "name": "X"}, self.token)
        self.assertEqual(response.status_code, 400)

    def test_create_unknown_sales_uom_returns_404(self):
        response = post_json(
            self.client_, products_url(self.company.id), {"code": "REJ7", "name": "X", "sales_uom_id": 999999}, self.token
        )
        self.assertEqual(response.status_code, 404)

    def test_create_rejects_inactive_sales_uom(self):
        inactive_unit = make_unit("INACT")
        inactive_unit.is_active = False
        inactive_unit.save(update_fields=["is_active"])
        response = post_json(
            self.client_,
            products_url(self.company.id),
            {"code": "REJ8", "name": "X", "sales_uom_id": inactive_unit.id},
            self.token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("sales_uom", response.json())

    def test_duplicate_code_same_company_returns_409(self):
        post_json(
            self.client_, products_url(self.company.id), {"code": "DUP1", "name": "First", "sales_uom_id": self.unit.id}, self.token
        )
        response = post_json(
            self.client_, products_url(self.company.id), {"code": "dup1", "name": "Second", "sales_uom_id": self.unit.id}, self.token
        )
        self.assertEqual(response.status_code, 409)

    def test_same_code_allowed_in_different_company(self):
        grant_company_permission(self.superuser, self.user, self.other_company, *ALL_PERMS)
        post_json(self.client_, products_url(self.company.id), {"code": "XC", "name": "A", "sales_uom_id": self.unit.id}, self.token)
        response = post_json(
            self.client_, products_url(self.other_company.id), {"code": "XC", "name": "B", "sales_uom_id": self.unit.id}, self.token
        )
        self.assertEqual(response.status_code, 201, response.content)

    def test_create_audit_rollback_on_failure(self):
        with patch("apps.products.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(
                    self.client_, products_url(self.company.id), {"code": "RB1", "name": "X", "sales_uom_id": self.unit.id}, self.token
                )
        self.assertEqual(Product.objects.filter(company=self.company, code="RB1").count(), 0)


# ---------------------------------------------------------------------------
# List / search / filter
# ---------------------------------------------------------------------------


class ProductListTests(ProductAccessTestCase):
    def setUp(self):
        super().setUp()
        grant_company_permission(self.superuser, self.user, self.company, "products.view")
        self.token = access_token_for(self.user)
        self.p1 = make_product(self.company, "ALPHA", self.unit, name="Alpha Tonic")
        self.p2 = make_product(self.company, "BETA", self.unit, name="Beta Syrup")
        self.p3 = make_product(self.company, "GAMMA", self.unit, name="Gamma Capsules")
        self.p3.is_active = False
        self.p3.save(update_fields=["is_active"])

    def test_list_default_ordering_and_pagination_envelope(self):
        response = get_json(self.client_, products_url(self.company.id), self.token)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("results", body)
        self.assertIn("count", body)
        codes = [row["code"] for row in body["results"]]
        self.assertEqual(codes, sorted(codes))

    def test_search_by_code(self):
        response = get_json(self.client_, products_url(self.company.id) + "?search=ALPHA", self.token)
        codes = [row["code"] for row in response.json()["results"]]
        self.assertEqual(codes, ["ALPHA"])

    def test_search_by_name(self):
        response = get_json(self.client_, products_url(self.company.id) + "?search=Syrup", self.token)
        codes = [row["code"] for row in response.json()["results"]]
        self.assertEqual(codes, ["BETA"])

    def test_is_active_filter_true(self):
        response = get_json(self.client_, products_url(self.company.id) + "?is_active=true", self.token)
        codes = {row["code"] for row in response.json()["results"]}
        self.assertEqual(codes, {"ALPHA", "BETA"})

    def test_is_active_filter_false(self):
        response = get_json(self.client_, products_url(self.company.id) + "?is_active=false", self.token)
        codes = {row["code"] for row in response.json()["results"]}
        self.assertEqual(codes, {"GAMMA"})

    def test_is_active_filter_rejects_non_strict_value(self):
        response = get_json(self.client_, products_url(self.company.id) + "?is_active=yes", self.token)
        self.assertEqual(response.status_code, 400)


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


class ProductUpdateTests(ProductAccessTestCase):
    def setUp(self):
        super().setUp()
        grant_company_permission(self.superuser, self.user, self.company, *ALL_PERMS)
        self.token = access_token_for(self.user)
        self.product = make_product(self.company, "UPD1", self.unit, name="Original Name")

    def test_update_requires_expected_version(self):
        response = patch_json(
            self.client_, product_url(self.company.id, self.product.id), {"name": "New Name"}, self.token
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("expected_version", response.json())

    def test_update_success_bumps_version(self):
        response = patch_json(
            self.client_,
            product_url(self.company.id, self.product.id),
            {"expected_version": 1, "name": "New Name"},
            self.token,
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["name"], "New Name")
        self.assertEqual(response.json()["version"], 2)

    def test_stale_version_returns_409(self):
        patch_json(
            self.client_, product_url(self.company.id, self.product.id), {"expected_version": 1, "name": "First"}, self.token
        )
        response = patch_json(
            self.client_, product_url(self.company.id, self.product.id), {"expected_version": 1, "name": "Second"}, self.token
        )
        self.assertEqual(response.status_code, 409)

    def test_update_rejects_code(self):
        response = patch_json(
            self.client_, product_url(self.company.id, self.product.id), {"expected_version": 1, "code": "NEWCODE"}, self.token
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("code", response.json())

    def test_update_rejects_company_id(self):
        response = patch_json(
            self.client_,
            product_url(self.company.id, self.product.id),
            {"expected_version": 1, "company_id": self.other_company.id},
            self.token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("company_id", response.json())

    def test_update_rejects_sales_uom_id(self):
        other_unit = make_unit("OTHERUOM")
        response = patch_json(
            self.client_,
            product_url(self.company.id, self.product.id),
            {"expected_version": 1, "sales_uom_id": other_unit.id},
            self.token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("sales_uom_id", response.json())

    def test_no_op_update_does_not_bump_version_or_audit(self):
        AuditLog.objects.all().delete()
        response = patch_json(
            self.client_,
            product_url(self.company.id, self.product.id),
            {"expected_version": 1, "name": "Original Name"},
            self.token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["version"], 1)
        self.assertEqual(AuditLog.objects.filter(target_type="product", action="product.updated").count(), 0)

    def test_whitespace_only_change_treated_as_no_op(self):
        AuditLog.objects.all().delete()
        response = patch_json(
            self.client_,
            product_url(self.company.id, self.product.id),
            {"expected_version": 1, "name": "  Original Name  "},
            self.token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["version"], 1)
        self.assertEqual(AuditLog.objects.filter(target_type="product", action="product.updated").count(), 0)

    def test_can_clear_description_with_empty_string(self):
        product = make_product(self.company, "CLR1", self.unit, name="X", description="some notes")
        response = patch_json(
            self.client_, product_url(self.company.id, product.id), {"expected_version": 1, "description": ""}, self.token
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["description"], "")

    def test_update_product_type_bumps_version_and_is_editable_anytime(self):
        response = patch_json(
            self.client_,
            product_url(self.company.id, self.product.id),
            {"expected_version": 1, "product_type": "Tablets"},
            self.token,
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["product_type"], "Tablets")
        self.assertEqual(response.json()["version"], 2)

    def test_product_type_no_op_and_whitespace_only_change_do_not_bump_version_or_audit(self):
        product = make_product(self.company, "PT3", self.unit, name="X", product_type="Tablets")
        AuditLog.objects.all().delete()
        same = patch_json(
            self.client_, product_url(self.company.id, product.id), {"expected_version": 1, "product_type": "Tablets"}, self.token
        )
        self.assertEqual((same.status_code, same.json()["version"]), (200, 1))
        whitespace = patch_json(
            self.client_, product_url(self.company.id, product.id), {"expected_version": 1, "product_type": "  Tablets  "}, self.token
        )
        self.assertEqual((whitespace.status_code, whitespace.json()["version"]), (200, 1))
        self.assertEqual(AuditLog.objects.filter(target_type="product", action="product.updated").count(), 0)

    def test_can_clear_product_type_with_empty_string(self):
        product = make_product(self.company, "PT4", self.unit, name="X", product_type="Tablets")
        response = patch_json(
            self.client_, product_url(self.company.id, product.id), {"expected_version": 1, "product_type": ""}, self.token
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["product_type"], "")

    def test_metadata_update_allowed_on_inactive_product_when_company_active(self):
        deactivate_product(actor=self.user, product_id=self.product.id, expected_version=1)
        response = patch_json(
            self.client_,
            product_url(self.company.id, self.product.id),
            {"expected_version": 2, "name": "Updated While Inactive"},
            self.token,
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["name"], "Updated While Inactive")
        self.assertFalse(response.json()["is_active"])

    def test_update_audit_before_after(self):
        patch_json(
            self.client_,
            product_url(self.company.id, self.product.id),
            {"expected_version": 1, "name": "Changed", "description": "new description", "product_type": "Tablets"},
            self.token,
        )
        entry = AuditLog.objects.filter(target_type="product", action="product.updated").latest("id")
        self.assertEqual(entry.before["name"], "Original Name")
        self.assertEqual(entry.before["product_type"], "")
        self.assertEqual(entry.after["name"], "Changed")
        self.assertEqual(entry.after["description"], "new description")
        self.assertEqual(entry.after["product_type"], "Tablets")

    def test_update_audit_rollback_on_failure(self):
        with patch("apps.products.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                patch_json(
                    self.client_,
                    product_url(self.company.id, self.product.id),
                    {"expected_version": 1, "name": "Should Not Persist"},
                    self.token,
                )
        self.product.refresh_from_db()
        self.assertEqual(self.product.name, "Original Name")
        self.assertEqual(self.product.version, 1)


# ---------------------------------------------------------------------------
# Lifecycle (activate / deactivate)
# ---------------------------------------------------------------------------


class ProductLifecycleTests(ProductAccessTestCase):
    def setUp(self):
        super().setUp()
        grant_company_permission(self.superuser, self.user, self.company, *ALL_PERMS)
        self.token = access_token_for(self.user)
        self.product = make_product(self.company, "LIFE1", self.unit, name="X")

    def test_deactivate_requires_expected_version(self):
        response = post_json(self.client_, deactivate_url(self.company.id, self.product.id), {}, self.token)
        self.assertEqual(response.status_code, 400)

    def test_deactivate_success(self):
        response = post_json(
            self.client_, deactivate_url(self.company.id, self.product.id), {"expected_version": 1}, self.token
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(response.json()["is_active"])
        self.assertEqual(response.json()["version"], 2)

    def test_deactivate_never_deletes_the_row(self):
        post_json(self.client_, deactivate_url(self.company.id, self.product.id), {"expected_version": 1}, self.token)
        self.assertTrue(Product.objects.filter(pk=self.product.id).exists())

    def test_deactivate_idempotent_no_op_on_current_version(self):
        deactivate_product(actor=self.user, product_id=self.product.id, expected_version=1)
        AuditLog.objects.all().delete()
        self.product.refresh_from_db()
        response = post_json(
            self.client_,
            deactivate_url(self.company.id, self.product.id),
            {"expected_version": self.product.version},
            self.token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["version"], self.product.version)
        self.assertEqual(AuditLog.objects.filter(action="product.deactivated").count(), 0)

    def test_deactivate_stale_version_returns_409(self):
        deactivate_product(actor=self.user, product_id=self.product.id, expected_version=1)
        response = post_json(
            self.client_, deactivate_url(self.company.id, self.product.id), {"expected_version": 1}, self.token
        )
        self.assertEqual(response.status_code, 409)

    def test_activate_success(self):
        deactivate_product(actor=self.user, product_id=self.product.id, expected_version=1)
        self.product.refresh_from_db()
        response = post_json(
            self.client_,
            activate_url(self.company.id, self.product.id),
            {"expected_version": self.product.version},
            self.token,
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(response.json()["is_active"])

    def test_activate_idempotent_no_op_when_already_active(self):
        response = post_json(
            self.client_, activate_url(self.company.id, self.product.id), {"expected_version": 1}, self.token
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["version"], 1)

    def test_activate_rejected_when_sales_uom_has_become_inactive(self):
        deactivate_product(actor=self.user, product_id=self.product.id, expected_version=1)
        self.unit.is_active = False
        self.unit.save(update_fields=["is_active"])
        self.product.refresh_from_db()
        response = post_json(
            self.client_,
            activate_url(self.company.id, self.product.id),
            {"expected_version": self.product.version},
            self.token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("sales_uom", response.json())

    def test_inactive_sales_uom_still_displayed_on_detail(self):
        self.unit.is_active = False
        self.unit.save(update_fields=["is_active"])
        response = get_json(self.client_, product_url(self.company.id, self.product.id), self.token)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["sales_uom_code"], "EA")
        self.assertFalse(body["sales_uom_is_active"])

    def test_deactivate_audit_before_after(self):
        post_json(self.client_, deactivate_url(self.company.id, self.product.id), {"expected_version": 1}, self.token)
        entry = AuditLog.objects.get(target_type="product", target_id=self.product.id, action="product.deactivated")
        self.assertEqual(entry.before, {"is_active": True})
        self.assertEqual(entry.after, {"is_active": False})
        self.assertEqual(entry.company_id, self.company.id)

    def test_deactivate_audit_rollback_on_failure(self):
        with patch("apps.products.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(
                    self.client_, deactivate_url(self.company.id, self.product.id), {"expected_version": 1}, self.token
                )
        self.product.refresh_from_db()
        self.assertTrue(self.product.is_active)
        self.assertEqual(self.product.version, 1)

    def test_activate_requires_activate_permission_not_just_edit(self):
        limited_user = make_user("plimitededituser")
        grant_company_permission(self.superuser, limited_user, self.company, "products.view", "products.edit")
        token = access_token_for(limited_user)
        deactivate_product(actor=self.user, product_id=self.product.id, expected_version=1)
        self.product.refresh_from_db()
        response = post_json(
            self.client_,
            activate_url(self.company.id, self.product.id),
            {"expected_version": self.product.version},
            token,
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn("products.activate", response.json()["detail"])


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------


class ProductAdminTests(TestCase):
    def test_admin_is_read_only(self):
        admin_instance = ProductAdmin(Product, None)
        self.assertFalse(admin_instance.has_add_permission(None))
        self.assertFalse(admin_instance.has_change_permission(None))


# ---------------------------------------------------------------------------
# Concurrency
# ---------------------------------------------------------------------------


class ConcurrentProductTests(TransactionTestCase):
    serialized_rollback = True

    def test_concurrent_update_produces_exactly_one_winner(self):
        superuser = make_superuser("concurrentprodadmin")
        company = make_company("PCONCUR")
        user = make_user("concurrentproduser")
        unit = make_unit("PCUNIT")
        grant_company_permission(superuser, user, company, *ALL_PERMS)
        product = create_product(actor=user, company=company, code="CONC1", name="Original", sales_uom=unit)

        results = []
        barrier = threading.Barrier(2)

        def worker():
            try:
                barrier.wait(timeout=5)
                result = update_product(
                    actor=user, product_id=product.id, expected_version=1, data={"name": "Changed"}
                )
                results.append(("ok", result.version))
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

        product.refresh_from_db()
        self.assertEqual(product.version, 2)

    def test_concurrent_create_with_same_code_produces_exactly_one_winner(self):
        superuser = make_superuser("concurrentprodcreateadmin")
        company = make_company("PCONCURCREATE")
        user = make_user("concurrentprodcreateuser")
        unit = make_unit("PCCUNIT")
        grant_company_permission(superuser, user, company, *ALL_PERMS)

        results = []
        barrier = threading.Barrier(2)

        def worker():
            try:
                barrier.wait(timeout=5)
                create_product(actor=user, company=company, code="RACE1", name="Racer", sales_uom=unit)
                results.append(("ok", None))
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
        self.assertEqual(Product.objects.filter(company=company, code="RACE1").count(), 1)
