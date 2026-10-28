import json
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.test import Client, RequestFactory, TestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.audit.models import AuditLog
from apps.catalog.admin import MaterialAdmin, MaterialCategoryAdmin, UnitOfMeasureAdmin
from apps.catalog.models import Material, MaterialCategory, UnitOfMeasure
from apps.companies.models import Company, CompanyMembership
from apps.permissions.models import CompanyRole, PermissionDefinition, StoreRole
from apps.permissions.services import assign_role, assign_store_role
from apps.stores.models import SharedStore, StoreMembership

User = get_user_model()
PASSWORD = "a-strong-pass-1"

UNITS_URL = "/api/v1/units/"
CATEGORIES_URL = "/api/v1/material-categories/"
MATERIALS_URL = "/api/v1/materials/"


def unit_url(unit_id):
    return f"/api/v1/units/{unit_id}/"


def unit_activate_url(unit_id):
    return f"/api/v1/units/{unit_id}/activate/"


def unit_deactivate_url(unit_id):
    return f"/api/v1/units/{unit_id}/deactivate/"


def category_url(category_id):
    return f"/api/v1/material-categories/{category_id}/"


def category_activate_url(category_id):
    return f"/api/v1/material-categories/{category_id}/activate/"


def category_deactivate_url(category_id):
    return f"/api/v1/material-categories/{category_id}/deactivate/"


def material_url(material_id):
    return f"/api/v1/materials/{material_id}/"


def material_activate_url(material_id):
    return f"/api/v1/materials/{material_id}/activate/"


def material_deactivate_url(material_id):
    return f"/api/v1/materials/{material_id}/deactivate/"


def make_user(username, password=PASSWORD, **kwargs):
    return User.objects.create_user(
        username=username, email=f"{username}@example.com", password=password, **kwargs
    )


def make_superuser(username, password=PASSWORD):
    return User.objects.create_superuser(
        username=username, email=f"{username}@example.com", password=password
    )


def make_store(code, **kwargs):
    return SharedStore.objects.create(code=code, name=f"{code} Store", **kwargs)


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


def grant_store_permission(actor, user, store, *permission_codes):
    """Test helper: gives `user` an active StoreMembership in `store` and
    a StoreRole holding exactly `permission_codes`, via the real service
    layer (never a raw ORM shortcut), so tests exercise the same path
    production code does.
    """
    from apps.stores.services import assign_store_membership
    from apps.permissions.services import create_store_role, replace_store_role_permissions

    membership, _ = assign_store_membership(actor=actor, user=user, store=store)
    role = create_store_role(actor=actor, store=store, code=f"ROLE{user.id}", name="Role")
    role, _ = replace_store_role_permissions(actor=actor, role=role, permission_codes=list(permission_codes))
    assign_store_role(membership, role)
    return membership, role


class CatalogTestCase(TestCase):
    def setUp(self):
        self.superuser = make_superuser("admin")
        self.superuser_token = access_token_for(self.superuser)
        self.client_ = Client()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class UnitOfMeasureModelTests(TestCase):
    def test_code_required(self):
        with self.assertRaises(Exception):
            UnitOfMeasure.objects.create(code="", name="Kilogram", dimension="MASS")

    def test_code_normalised(self):
        unit = UnitOfMeasure.objects.create(code="  kg  ", name="Kilogram", dimension="MASS")
        self.assertEqual(unit.code, "KG")

    def test_invalid_dimension_rejected(self):
        with self.assertRaises(Exception):
            UnitOfMeasure.objects.create(code="KG", name="Kilogram", dimension="BOGUS")

    def test_code_uniqueness_enforced(self):
        make_unit("KG")
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                UnitOfMeasure.objects.create(code="KG", name="Dup", dimension="MASS")

    def test_code_immutable_after_creation(self):
        unit = make_unit("KG")
        unit.code = "OTHER"
        with self.assertRaises(Exception):
            unit.save()

    def test_dimension_immutable_after_creation(self):
        unit = make_unit("KG", dimension="MASS")
        unit.dimension = "VOLUME"
        with self.assertRaises(Exception):
            unit.save()

    def test_material_protected_from_deletion_while_referenced(self):
        unit = make_unit("KG")
        make_material("M1", base_unit=unit)
        with transaction.atomic():
            with self.assertRaises(ProtectedError):
                unit.delete()


class MaterialCategoryModelTests(TestCase):
    def test_code_required(self):
        with self.assertRaises(Exception):
            MaterialCategory.objects.create(code="", name="Herbs")

    def test_code_normalised(self):
        category = MaterialCategory.objects.create(code="  herb  ", name="Herbs")
        self.assertEqual(category.code, "HERB")

    def test_code_immutable_after_creation(self):
        category = make_category("HERB")
        category.code = "OTHER"
        with self.assertRaises(Exception):
            category.save()

    def test_flat_no_parent_field(self):
        self.assertFalse(hasattr(MaterialCategory(), "parent"))
        self.assertFalse(hasattr(MaterialCategory(), "parent_id"))


class MaterialModelTests(TestCase):
    def setUp(self):
        self.unit = make_unit("KG")
        self.category = make_category("HERB")

    def test_code_required(self):
        with self.assertRaises(Exception):
            Material.objects.create(code="", name="Test", kind="RAW_MATERIAL", base_unit=self.unit)

    def test_code_normalised(self):
        material = Material.objects.create(
            code="  mat1  ", name="Test", kind="RAW_MATERIAL", base_unit=self.unit
        )
        self.assertEqual(material.code, "MAT1")

    def test_invalid_kind_rejected(self):
        with self.assertRaises(Exception):
            Material.objects.create(code="MAT1", name="Test", kind="BOGUS", base_unit=self.unit)

    def test_base_unit_required(self):
        with self.assertRaises(Exception):
            Material.objects.create(code="MAT1", name="Test", kind="RAW_MATERIAL")

    def test_category_optional(self):
        material = make_material("MAT1", base_unit=self.unit)
        self.assertIsNone(material.category)

    def test_code_can_be_changed_after_creation(self):
        material = make_material("MAT1", base_unit=self.unit)
        material.code = "OTHER"
        material.save()
        material.refresh_from_db()
        self.assertEqual(material.code, "OTHER")

    def test_kind_can_be_changed_after_creation(self):
        material = make_material("MAT1", base_unit=self.unit, kind="RAW_MATERIAL")
        material.kind = "PACKAGING_MATERIAL"
        material.save()
        material.refresh_from_db()
        self.assertEqual(material.kind, "PACKAGING_MATERIAL")

    def test_base_unit_can_be_changed_after_creation(self):
        other_unit = make_unit("L", dimension="VOLUME")
        material = make_material("MAT1", base_unit=self.unit)
        material.base_unit = other_unit
        material.save()
        material.refresh_from_db()
        self.assertEqual(material.base_unit_id, other_unit.id)

    def test_category_can_be_changed(self):
        other_category = make_category("MOTHER_TINCTURE")
        material = make_material("MAT1", base_unit=self.unit, category=self.category)
        material.category = other_category
        material.save()
        material.refresh_from_db()
        self.assertEqual(material.category, other_category)

    def test_no_company_field(self):
        self.assertFalse(hasattr(Material(), "company"))
        self.assertFalse(hasattr(Material(), "company_id"))

    def test_no_quantity_field(self):
        self.assertFalse(hasattr(Material(), "quantity"))
        self.assertFalse(hasattr(Material(), "stock"))


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------


class CatalogAdminAccessRestrictionTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.unit_admin = UnitOfMeasureAdmin(UnitOfMeasure, admin_site=None)
        self.category_admin = MaterialCategoryAdmin(MaterialCategory, admin_site=None)
        self.material_admin = MaterialAdmin(Material, admin_site=None)

    def _request_as(self, user):
        request = self.factory.get("/admin/")
        request.user = user
        return request

    def test_active_superuser_can_view_but_not_add_or_change(self):
        superuser = make_superuser("admin")
        request = self._request_as(superuser)
        for admin_instance in (self.unit_admin, self.category_admin, self.material_admin):
            self.assertTrue(admin_instance.has_view_permission(request))
            self.assertFalse(admin_instance.has_add_permission(request))
            self.assertFalse(admin_instance.has_change_permission(request))
            self.assertFalse(admin_instance.has_delete_permission(request))

    def test_ordinary_staff_cannot_view(self):
        staff_user = make_user("staffer", is_staff=True)
        request = self._request_as(staff_user)
        for admin_instance in (self.unit_admin, self.category_admin, self.material_admin):
            self.assertFalse(admin_instance.has_view_permission(request))


# ---------------------------------------------------------------------------
# Authorization
# ---------------------------------------------------------------------------


class CatalogAuthorizationTests(CatalogTestCase):
    def test_anonymous_401_on_units(self):
        self.assertEqual(self.client_.get(UNITS_URL).status_code, 401)

    def test_anonymous_401_on_categories(self):
        self.assertEqual(self.client_.get(CATEGORIES_URL).status_code, 401)

    def test_anonymous_401_on_materials(self):
        self.assertEqual(self.client_.get(MATERIALS_URL).status_code, 401)

    def test_ordinary_user_no_store_access_403_on_read(self):
        user = make_user("plain")
        response = get_json(self.client_, UNITS_URL, access_token_for(user))
        self.assertEqual(response.status_code, 403)

    def test_ordinary_staff_no_bypass(self):
        staff = make_user("staffer", is_staff=True)
        response = get_json(self.client_, UNITS_URL, access_token_for(staff))
        self.assertEqual(response.status_code, 403)

    def test_superuser_can_read_without_store_membership(self):
        response = get_json(self.client_, UNITS_URL, self.superuser_token)
        self.assertEqual(response.status_code, 200)

    def test_superuser_read_does_not_grant_store_operational_access(self):
        """Explicit exception scoping: the superuser catalog-read bypass
        must not leak into store business access - the superuser still
        has zero StoreMembership rows and zero effective store
        permissions unless separately assigned, exactly like every other
        superuser exception in this project.
        """
        from apps.stores.services import active_stores_for_user

        store = make_store("MAIN")
        get_json(self.client_, UNITS_URL, self.superuser_token)
        self.assertEqual(list(active_stores_for_user(self.superuser)), [])

    def test_store_member_with_permission_can_read(self):
        user = make_user("storeuser")
        store = make_store("MAIN")
        grant_store_permission(self.superuser, user, store, "shared_catalog.view")
        response = get_json(self.client_, UNITS_URL, access_token_for(user))
        self.assertEqual(response.status_code, 200)

    def test_store_member_without_permission_403(self):
        user = make_user("storeuser")
        store = make_store("MAIN")
        grant_store_permission(self.superuser, user, store, "shared_store.view")
        response = get_json(self.client_, UNITS_URL, access_token_for(user))
        self.assertEqual(response.status_code, 403)

    def test_company_membership_never_grants_catalog_access(self):
        user = make_user("companyuser")
        company = make_company("ACME")
        CompanyMembership.objects.create(user=user, company=company)
        response = get_json(self.client_, UNITS_URL, access_token_for(user))
        self.assertEqual(response.status_code, 403)

    def test_company_role_with_matching_permission_name_never_grants_access(self):
        """Even a COMPANY-scope permission that happens to be named
        `shared_catalog.view` (created deliberately here to prove the
        point) must not satisfy the STORE-scope check.
        """
        user = make_user("companyuser")
        company = make_company("ACME")
        membership = CompanyMembership.objects.create(user=user, company=company)
        role = CompanyRole.objects.create(company=company, code="MANAGER", name="Manager")
        company_perm = PermissionDefinition.objects.create(
            code="fake.shared_catalog.view", name="x", module="orders", scope="COMPANY"
        )
        role.permissions.set([company_perm])
        assign_role(membership, role)
        response = get_json(self.client_, UNITS_URL, access_token_for(user))
        self.assertEqual(response.status_code, 403)

    def test_deactivating_store_revokes_catalog_access(self):
        user = make_user("storeuser")
        store = make_store("MAIN")
        grant_store_permission(self.superuser, user, store, "shared_catalog.view")
        self.assertEqual(get_json(self.client_, UNITS_URL, access_token_for(user)).status_code, 200)

        store.is_active = False
        store.save(update_fields=["is_active", "updated_at"])

        self.assertEqual(get_json(self.client_, UNITS_URL, access_token_for(user)).status_code, 403)

    def test_deactivating_membership_revokes_catalog_access(self):
        user = make_user("storeuser")
        store = make_store("MAIN")
        membership, role = grant_store_permission(self.superuser, user, store, "shared_catalog.view")
        self.assertEqual(get_json(self.client_, UNITS_URL, access_token_for(user)).status_code, 200)

        membership.is_active = False
        membership.save(update_fields=["is_active", "updated_at"])

        self.assertEqual(get_json(self.client_, UNITS_URL, access_token_for(user)).status_code, 403)

    def test_deactivating_role_revokes_catalog_access(self):
        user = make_user("storeuser")
        store = make_store("MAIN")
        membership, role = grant_store_permission(self.superuser, user, store, "shared_catalog.view")
        self.assertEqual(get_json(self.client_, UNITS_URL, access_token_for(user)).status_code, 200)

        role.is_active = False
        role.save(update_fields=["is_active", "updated_at"])

        self.assertEqual(get_json(self.client_, UNITS_URL, access_token_for(user)).status_code, 403)

    def test_write_endpoints_require_superuser_even_with_catalog_permission(self):
        user = make_user("storeuser")
        store = make_store("MAIN")
        grant_store_permission(self.superuser, user, store, "shared_catalog.view")
        response = post_json(
            self.client_, UNITS_URL, {"code": "KG", "name": "Kilogram", "dimension": "MASS"}, access_token_for(user)
        )
        self.assertEqual(response.status_code, 403)

    def test_delete_not_allowed_units(self):
        unit = make_unit("KG")
        response = self.client_.delete(unit_url(unit.id), **bearer(self.superuser_token))
        self.assertEqual(response.status_code, 405)

    def test_delete_not_allowed_materials(self):
        unit = make_unit("KG")
        material = make_material("MAT1", base_unit=unit)
        response = self.client_.delete(material_url(material.id), **bearer(self.superuser_token))
        self.assertEqual(response.status_code, 405)


# ---------------------------------------------------------------------------
# UnitOfMeasure API
# ---------------------------------------------------------------------------


class UnitApiTests(CatalogTestCase):
    def test_create_success(self):
        response = post_json(
            self.client_, UNITS_URL, {"code": "kg", "name": "Kilogram", "dimension": "MASS"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["code"], "KG")

    def test_create_invalid_dimension_400(self):
        response = post_json(
            self.client_, UNITS_URL, {"code": "KG", "name": "Kilogram", "dimension": "BOGUS"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)

    def test_duplicate_code_400(self):
        make_unit("KG")
        response = post_json(
            self.client_, UNITS_URL, {"code": "KG", "name": "Dup", "dimension": "MASS"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)

    def test_create_rejects_is_active(self):
        response = post_json(
            self.client_,
            UNITS_URL,
            {"code": "KG", "name": "Kilogram", "dimension": "MASS", "is_active": False},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_create_rejects_quantity_and_owner_fields(self):
        for field in ("quantity", "stock", "company_id", "owner_id"):
            response = post_json(
                self.client_,
                UNITS_URL,
                {"code": "KG", "name": "Kilogram", "dimension": "MASS", field: "x"},
                self.superuser_token,
            )
            self.assertEqual(response.status_code, 400, field)

    def test_patch_updates_name(self):
        unit = make_unit("KG")
        response = patch_json(self.client_, unit_url(unit.id), {"name": "Kilo"}, self.superuser_token)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["name"], "Kilo")

    def test_patch_rejects_code(self):
        unit = make_unit("KG")
        response = patch_json(self.client_, unit_url(unit.id), {"code": "OTHER"}, self.superuser_token)
        self.assertEqual(response.status_code, 400)

    def test_patch_rejects_dimension(self):
        unit = make_unit("KG")
        response = patch_json(self.client_, unit_url(unit.id), {"dimension": "VOLUME"}, self.superuser_token)
        self.assertEqual(response.status_code, 400)

    def test_create_with_canonical_factor(self):
        """Task 12B-2: optional, never defaulted."""
        response = post_json(
            self.client_, UNITS_URL,
            {"code": "GRM", "name": "Gram", "dimension": "MASS", "canonical_factor": "1"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["canonical_factor"], "1.0000000000")

        no_factor = post_json(
            self.client_, UNITS_URL, {"code": "OZW", "name": "Ounce", "dimension": "MASS"}, self.superuser_token
        )
        self.assertEqual(no_factor.status_code, 201)
        self.assertIsNone(no_factor.json()["canonical_factor"])

    def test_canonical_factor_rejected_for_count_unit(self):
        response = post_json(
            self.client_, UNITS_URL,
            {"code": "BTLX", "name": "Bottle", "dimension": "COUNT", "canonical_factor": "1"},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("canonical_factor", response.json())

    def test_canonical_factor_must_be_positive(self):
        for value in ("0", "-1"):
            response = post_json(
                self.client_, UNITS_URL,
                {"code": "GRM2", "name": "Gram", "dimension": "MASS", "canonical_factor": value},
                self.superuser_token,
            )
            self.assertEqual(response.status_code, 400, value)

    def test_canonical_factor_immutable_after_creation(self):
        unit = make_unit("GRMI", dimension="MASS", canonical_factor=Decimal("1"))
        response = patch_json(self.client_, unit_url(unit.id), {"canonical_factor": "2"}, self.superuser_token)
        self.assertEqual(response.status_code, 400)
        self.assertIn("canonical_factor", response.json())
        unit.refresh_from_db()
        self.assertEqual(unit.canonical_factor, 1)

    def test_canonical_factor_model_immutability_enforced_directly(self):
        from django.core.exceptions import ValidationError

        unit = make_unit("GRMD", dimension="MASS", canonical_factor=Decimal("1"))
        unit.canonical_factor = Decimal("2")
        with self.assertRaises(ValidationError):
            unit.save()

    def test_search_by_code(self):
        make_unit("KG")
        make_unit("L", dimension="VOLUME")
        response = get_json(self.client_, f"{UNITS_URL}?search=kg", self.superuser_token)
        codes = {row["code"] for row in response.json()["results"]}
        self.assertEqual(codes, {"KG"})

    def test_is_active_filter(self):
        make_unit("KG")
        make_unit("L", dimension="VOLUME", is_active=False)
        response = get_json(self.client_, f"{UNITS_URL}?is_active=false", self.superuser_token)
        codes = {row["code"] for row in response.json()["results"]}
        self.assertEqual(codes, {"L"})

    def test_is_active_filter_rejects_invalid(self):
        response = get_json(self.client_, f"{UNITS_URL}?is_active=nope", self.superuser_token)
        self.assertEqual(response.status_code, 400)

    def test_activate_deactivate_round_trip(self):
        unit = make_unit("KG")
        response = post_json(self.client_, unit_deactivate_url(unit.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["is_active"])

        response = post_json(self.client_, unit_activate_url(unit.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["is_active"])

    def test_deactivate_idempotent_no_duplicate_audit(self):
        unit = make_unit("KG")
        post_json(self.client_, unit_deactivate_url(unit.id), {}, self.superuser_token)
        AuditLog.objects.all().delete()
        response = post_json(self.client_, unit_deactivate_url(unit.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(AuditLog.objects.filter(target_type="unit_of_measure").count(), 0)

    def test_deactivate_blocked_while_active_material_references_it(self):
        unit = make_unit("KG")
        make_material("MAT1", base_unit=unit)
        response = post_json(self.client_, unit_deactivate_url(unit.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 400)
        unit.refresh_from_db()
        self.assertTrue(unit.is_active)

    def test_deactivate_allowed_once_material_inactive(self):
        unit = make_unit("KG")
        material = make_material("MAT1", base_unit=unit)
        material.is_active = False
        material.save(update_fields=["is_active", "updated_at"])
        response = post_json(self.client_, unit_deactivate_url(unit.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 200)

    def test_create_writes_audit_with_no_company_or_store(self):
        response = post_json(
            self.client_, UNITS_URL, {"code": "KG", "name": "Kilogram", "dimension": "MASS"}, self.superuser_token
        )
        unit_id = response.json()["id"]
        entry = AuditLog.objects.filter(target_type="unit_of_measure", target_id=unit_id).get()
        self.assertEqual(entry.action, "unit.created")
        self.assertIsNone(entry.company_id)
        self.assertIsNone(entry.store_id)

    def test_audit_rollback_on_failure(self):
        with patch("apps.catalog.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(
                    self.client_,
                    UNITS_URL,
                    {"code": "KG", "name": "Kilogram", "dimension": "MASS"},
                    self.superuser_token,
                )
        self.assertFalse(UnitOfMeasure.objects.filter(code="KG").exists())


# ---------------------------------------------------------------------------
# MaterialCategory API
# ---------------------------------------------------------------------------


class CategoryApiTests(CatalogTestCase):
    def test_create_success(self):
        response = post_json(self.client_, CATEGORIES_URL, {"code": "herb", "name": "Herbs"}, self.superuser_token)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["code"], "HERB")

    def test_duplicate_code_400(self):
        make_category("HERB")
        response = post_json(self.client_, CATEGORIES_URL, {"code": "HERB", "name": "Dup"}, self.superuser_token)
        self.assertEqual(response.status_code, 400)

    def test_patch_rejects_code(self):
        category = make_category("HERB")
        response = patch_json(self.client_, category_url(category.id), {"code": "OTHER"}, self.superuser_token)
        self.assertEqual(response.status_code, 400)

    def test_deactivate_blocked_while_active_material_references_it(self):
        unit = make_unit("KG")
        category = make_category("HERB")
        make_material("MAT1", base_unit=unit, category=category)
        response = post_json(self.client_, category_deactivate_url(category.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 400)

    def test_deactivate_allowed_once_material_uncategorised_or_inactive(self):
        unit = make_unit("KG")
        category = make_category("HERB")
        material = make_material("MAT1", base_unit=unit, category=category)
        material.category = None
        material.save()
        response = post_json(self.client_, category_deactivate_url(category.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 200)

    def test_activate_round_trip(self):
        category = make_category("HERB", is_active=False)
        response = post_json(self.client_, category_activate_url(category.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["is_active"])


# ---------------------------------------------------------------------------
# Material API
# ---------------------------------------------------------------------------


class MaterialApiTests(CatalogTestCase):
    def setUp(self):
        super().setUp()
        self.unit = make_unit("KG")
        self.category = make_category("HERB")

    def test_create_success(self):
        response = post_json(
            self.client_,
            MATERIALS_URL,
            {"code": "mat1", "name": "Herb", "kind": "RAW_MATERIAL", "base_unit_id": self.unit.id},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["code"], "MAT1")
        self.assertIsNone(body["category_id"])
        self.assertEqual(body["base_unit_id"], self.unit.id)

    def test_create_with_category(self):
        response = post_json(
            self.client_,
            MATERIALS_URL,
            {
                "code": "mat1",
                "name": "Herb",
                "kind": "RAW_MATERIAL",
                "base_unit_id": self.unit.id,
                "category_id": self.category.id,
            },
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["category_id"], self.category.id)

    def test_create_invalid_kind_400(self):
        response = post_json(
            self.client_,
            MATERIALS_URL,
            {"code": "mat1", "name": "Herb", "kind": "BOGUS", "base_unit_id": self.unit.id},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_create_unknown_base_unit_404(self):
        response = post_json(
            self.client_,
            MATERIALS_URL,
            {"code": "mat1", "name": "Herb", "kind": "RAW_MATERIAL", "base_unit_id": 999999},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 404)

    def test_create_rejected_when_base_unit_inactive(self):
        self.unit.is_active = False
        self.unit.save(update_fields=["is_active", "updated_at"])
        response = post_json(
            self.client_,
            MATERIALS_URL,
            {"code": "mat1", "name": "Herb", "kind": "RAW_MATERIAL", "base_unit_id": self.unit.id},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Material.objects.filter(code="MAT1").exists())

    def test_create_rejected_when_category_inactive(self):
        self.category.is_active = False
        self.category.save(update_fields=["is_active", "updated_at"])
        response = post_json(
            self.client_,
            MATERIALS_URL,
            {
                "code": "mat1",
                "name": "Herb",
                "kind": "RAW_MATERIAL",
                "base_unit_id": self.unit.id,
                "category_id": self.category.id,
            },
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_duplicate_code_400(self):
        make_material("MAT1", base_unit=self.unit)
        response = post_json(
            self.client_,
            MATERIALS_URL,
            {"code": "MAT1", "name": "Dup", "kind": "RAW_MATERIAL", "base_unit_id": self.unit.id},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_create_rejects_quantity_and_owner_fields(self):
        for field in ("quantity", "stock", "company_id", "owner_id"):
            response = post_json(
                self.client_,
                MATERIALS_URL,
                {
                    "code": "mat1",
                    "name": "Herb",
                    "kind": "RAW_MATERIAL",
                    "base_unit_id": self.unit.id,
                    field: "x",
                },
                self.superuser_token,
            )
            self.assertEqual(response.status_code, 400, field)

    def test_patch_updates_code_kind_base_unit(self):
        material = make_material("MAT1", base_unit=self.unit)
        other_unit = make_unit("L", dimension="VOLUME")
        for field, value in (("code", "OTHER"), ("kind", "PACKAGING_MATERIAL"), ("base_unit_id", other_unit.id)):
            response = patch_json(self.client_, material_url(material.id), {field: value}, self.superuser_token)
            self.assertEqual(response.status_code, 200, field)

    def test_patch_updates_name_and_description(self):
        material = make_material("MAT1", base_unit=self.unit)
        response = patch_json(
            self.client_, material_url(material.id), {"name": "New name", "description": "desc"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["name"], "New name")

    def test_patch_reassign_category(self):
        material = make_material("MAT1", base_unit=self.unit)
        response = patch_json(
            self.client_, material_url(material.id), {"category_id": self.category.id}, self.superuser_token
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["category_id"], self.category.id)

    def test_patch_clear_category(self):
        material = make_material("MAT1", base_unit=self.unit, category=self.category)
        response = patch_json(self.client_, material_url(material.id), {"category_id": None}, self.superuser_token)
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["category_id"])

    def test_patch_rejects_newly_assigning_inactive_category(self):
        self.category.is_active = False
        self.category.save(update_fields=["is_active", "updated_at"])
        material = make_material("MAT1", base_unit=self.unit)
        response = patch_json(
            self.client_, material_url(material.id), {"category_id": self.category.id}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)

    def test_patch_noop_creates_no_audit_entry(self):
        material = make_material("MAT1", base_unit=self.unit, name="Herb")
        AuditLog.objects.all().delete()
        response = patch_json(self.client_, material_url(material.id), {"name": "Herb"}, self.superuser_token)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(AuditLog.objects.filter(target_type="material").count(), 0)

    def test_kind_filter(self):
        make_material("MAT1", base_unit=self.unit, kind="RAW_MATERIAL")
        make_material("MAT2", base_unit=self.unit, kind="PACKAGING_MATERIAL")
        response = get_json(self.client_, f"{MATERIALS_URL}?kind=RAW_MATERIAL", self.superuser_token)
        codes = {row["code"] for row in response.json()["results"]}
        self.assertEqual(codes, {"MAT1"})

    def test_kind_filter_rejects_invalid(self):
        response = get_json(self.client_, f"{MATERIALS_URL}?kind=BOGUS", self.superuser_token)
        self.assertEqual(response.status_code, 400)

    def test_category_filter(self):
        other_category = make_category("MOTHER_TINCTURE")
        make_material("MAT1", base_unit=self.unit, category=self.category)
        make_material("MAT2", base_unit=self.unit, category=other_category)
        response = get_json(self.client_, f"{MATERIALS_URL}?category={self.category.id}", self.superuser_token)
        codes = {row["code"] for row in response.json()["results"]}
        self.assertEqual(codes, {"MAT1"})

    def test_category_filter_rejects_non_integer(self):
        response = get_json(self.client_, f"{MATERIALS_URL}?category=abc", self.superuser_token)
        self.assertEqual(response.status_code, 400)

    def test_base_unit_filter(self):
        other_unit = make_unit("L", dimension="VOLUME")
        make_material("MAT1", base_unit=self.unit)
        make_material("MAT2", base_unit=other_unit)
        response = get_json(self.client_, f"{MATERIALS_URL}?base_unit={self.unit.id}", self.superuser_token)
        codes = {row["code"] for row in response.json()["results"]}
        self.assertEqual(codes, {"MAT1"})

    def test_base_unit_filter_rejects_non_integer(self):
        response = get_json(self.client_, f"{MATERIALS_URL}?base_unit=xyz", self.superuser_token)
        self.assertEqual(response.status_code, 400)

    def test_list_has_no_n_plus_one_queries(self):
        for i in range(5):
            make_material(f"MAT{i}", base_unit=self.unit, category=self.category)
        with self.assertNumQueries(3):
            # JWT-auth user lookup (1) + pagination count (1) + the page's
            # own select_related JOIN (1, regardless of row count) -
            # confirmed no additional per-row query for category/base_unit.
            response = get_json(self.client_, MATERIALS_URL, self.superuser_token)
        self.assertEqual(response.status_code, 200)

    def test_deactivate_preserves_identity(self):
        material = make_material("MAT1", base_unit=self.unit, category=self.category)
        response = post_json(self.client_, material_deactivate_url(material.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 200)
        material.refresh_from_db()
        self.assertFalse(material.is_active)
        self.assertEqual(material.code, "MAT1")
        self.assertEqual(material.category_id, self.category.id)
        self.assertEqual(material.base_unit_id, self.unit.id)

    def test_reactivate_rejected_if_base_unit_now_inactive(self):
        material = make_material("MAT1", base_unit=self.unit)
        material.is_active = False
        material.save(update_fields=["is_active", "updated_at"])
        self.unit.is_active = False
        self.unit.save(update_fields=["is_active", "updated_at"])

        response = post_json(self.client_, material_activate_url(material.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 400)

    def test_reactivate_rejected_if_category_now_inactive(self):
        material = make_material("MAT1", base_unit=self.unit, category=self.category)
        material.is_active = False
        material.save(update_fields=["is_active", "updated_at"])
        self.category.is_active = False
        self.category.save(update_fields=["is_active", "updated_at"])

        response = post_json(self.client_, material_activate_url(material.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 400)

    def test_reactivate_idempotent(self):
        material = make_material("MAT1", base_unit=self.unit)
        response = post_json(self.client_, material_activate_url(material.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["is_active"])

    def test_audit_snapshot_before_after(self):
        material = make_material("MAT1", base_unit=self.unit, name="Herb")
        AuditLog.objects.all().delete()
        patch_json(self.client_, material_url(material.id), {"name": "Renamed Herb"}, self.superuser_token)
        entry = AuditLog.objects.filter(target_type="material", target_id=material.id).get()
        self.assertEqual(entry.before["name"], "Herb")
        self.assertEqual(entry.after["name"], "Renamed Herb")
        self.assertIsNone(entry.company_id)
        self.assertIsNone(entry.store_id)
