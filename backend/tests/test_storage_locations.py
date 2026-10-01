import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import Client, TestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.audit.models import AuditLog
from apps.companies.models import Company, CompanyMembership
from apps.permissions.models import CompanyRole, PermissionDefinition
from apps.permissions.services import assign_role, assign_store_role, create_store_role, replace_store_role_permissions
from apps.stores.models import SharedStore, StorageLocation
from apps.stores.services import assign_store_membership

User = get_user_model()
PASSWORD = "a-strong-pass-1"


def locations_url(store_id):
    return f"/api/v1/stores/{store_id}/locations/"


def location_url(store_id, location_id):
    return f"/api/v1/stores/{store_id}/locations/{location_id}/"


def location_activate_url(store_id, location_id):
    return f"/api/v1/stores/{store_id}/locations/{location_id}/activate/"


def location_deactivate_url(store_id, location_id):
    return f"/api/v1/stores/{store_id}/locations/{location_id}/deactivate/"


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


def make_location(store, code, name=None, **kwargs):
    return StorageLocation.objects.create(store=store, code=code, name=name or code, **kwargs)


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
    membership, _ = assign_store_membership(actor=actor, user=user, store=store)
    role = create_store_role(actor=actor, store=store, code=f"ROLE{user.id}", name="Role")
    role, _ = replace_store_role_permissions(actor=actor, role=role, permission_codes=list(permission_codes))
    assign_store_role(membership, role)
    return membership, role


class LocationTestCase(TestCase):
    def setUp(self):
        self.superuser = make_superuser("admin")
        self.superuser_token = access_token_for(self.superuser)
        self.client_ = Client()
        self.store = make_store("MAIN")
        self.other_store = make_store("BACKUP")


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------


class StorageLocationModelTests(TestCase):
    def setUp(self):
        self.store_a = make_store("MAIN")
        self.store_b = make_store("BACKUP")

    def test_code_and_name_required(self):
        with self.assertRaises(Exception):
            StorageLocation.objects.create(store=self.store_a, code="", name="Aisle 1")

    def test_code_normalised(self):
        location = StorageLocation.objects.create(store=self.store_a, code="  a1  ", name="Aisle 1")
        self.assertEqual(location.code, "A1")

    def test_same_code_allowed_in_different_stores(self):
        loc_a = make_location(self.store_a, "A1")
        loc_b = make_location(self.store_b, "A1")
        self.assertNotEqual(loc_a.pk, loc_b.pk)

    def test_duplicate_code_within_same_store_rejected(self):
        make_location(self.store_a, "A1")
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                StorageLocation.objects.create(store=self.store_a, code="A1", name="Dup")

    def test_store_immutable_after_creation(self):
        location = make_location(self.store_a, "A1")
        location.store = self.store_b
        with self.assertRaises(Exception):
            location.save()

    def test_no_company_field(self):
        self.assertFalse(hasattr(StorageLocation(), "company"))

    def test_no_quantity_or_qc_field(self):
        self.assertFalse(hasattr(StorageLocation(), "quantity"))
        self.assertFalse(hasattr(StorageLocation(), "qc_status"))
        self.assertFalse(hasattr(StorageLocation(), "approved"))

    def test_name_is_free_text_not_a_qc_verdict(self):
        """A location literally named "Approved" carries no special
        meaning - nothing reads this field to decide material usability.
        This test exists to keep that guarantee visible, not to prove
        anything Django-specific.
        """
        location = StorageLocation.objects.create(store=self.store_a, code="X1", name="Approved")
        self.assertEqual(location.name, "Approved")
        # No QC-related attribute exists anywhere on this model to check.
        self.assertFalse(hasattr(location, "is_approved"))


# ---------------------------------------------------------------------------
# Authorization
# ---------------------------------------------------------------------------


class LocationAuthorizationTests(LocationTestCase):
    def test_anonymous_401(self):
        response = self.client_.get(locations_url(self.store.id))
        self.assertEqual(response.status_code, 401)

    def test_ordinary_user_no_membership_404(self):
        """Inaccessible/inactive/nonexistent stores return the same 404
        for a non-superuser."""
        user = make_user("plain")
        response = get_json(self.client_, locations_url(self.store.id), access_token_for(user))
        self.assertEqual(response.status_code, 404)

    def test_nonexistent_store_404_for_ordinary_user(self):
        user = make_user("plain")
        response = get_json(self.client_, locations_url(999999), access_token_for(user))
        self.assertEqual(response.status_code, 404)

    def test_inactive_store_404_for_ordinary_user_even_with_membership(self):
        user = make_user("plain")
        membership, role = grant_store_permission(self.superuser, user, self.store, "storage_locations.view")
        self.store.is_active = False
        self.store.save(update_fields=["is_active", "updated_at"])
        response = get_json(self.client_, locations_url(self.store.id), access_token_for(user))
        self.assertEqual(response.status_code, 404)

    def test_membership_without_permission_403(self):
        user = make_user("plain")
        grant_store_permission(self.superuser, user, self.store, "shared_store.view")
        response = get_json(self.client_, locations_url(self.store.id), access_token_for(user))
        self.assertEqual(response.status_code, 403)

    def test_membership_with_permission_200(self):
        user = make_user("plain")
        grant_store_permission(self.superuser, user, self.store, "storage_locations.view")
        response = get_json(self.client_, locations_url(self.store.id), access_token_for(user))
        self.assertEqual(response.status_code, 200)

    def test_membership_in_wrong_store_does_not_grant_access(self):
        user = make_user("plain")
        grant_store_permission(self.superuser, user, self.other_store, "storage_locations.view")
        response = get_json(self.client_, locations_url(self.store.id), access_token_for(user))
        self.assertEqual(response.status_code, 404)

    def test_superuser_can_read_without_membership(self):
        response = get_json(self.client_, locations_url(self.store.id), self.superuser_token)
        self.assertEqual(response.status_code, 200)

    def test_superuser_can_read_even_if_store_inactive(self):
        self.store.is_active = False
        self.store.save(update_fields=["is_active", "updated_at"])
        response = get_json(self.client_, locations_url(self.store.id), self.superuser_token)
        self.assertEqual(response.status_code, 200)

    def test_superuser_read_does_not_grant_store_operational_access(self):
        from apps.stores.services import active_stores_for_user

        get_json(self.client_, locations_url(self.store.id), self.superuser_token)
        self.assertEqual(list(active_stores_for_user(self.superuser)), [])

    def test_company_membership_never_grants_location_access(self):
        user = make_user("companyuser")
        company = make_company("ACME")
        CompanyMembership.objects.create(user=user, company=company)
        response = get_json(self.client_, locations_url(self.store.id), access_token_for(user))
        self.assertEqual(response.status_code, 404)

    def test_write_requires_superuser_even_with_membership_permission(self):
        user = make_user("plain")
        grant_store_permission(self.superuser, user, self.store, "storage_locations.view")
        response = post_json(
            self.client_, locations_url(self.store.id), {"code": "A1", "name": "Aisle 1"}, access_token_for(user)
        )
        self.assertEqual(response.status_code, 403)

    def test_ordinary_staff_no_bypass(self):
        staff = make_user("staffer", is_staff=True)
        response = get_json(self.client_, locations_url(self.store.id), access_token_for(staff))
        self.assertEqual(response.status_code, 404)

    def test_delete_not_allowed(self):
        location = make_location(self.store, "A1")
        response = self.client_.delete(location_url(self.store.id, location.id), **bearer(self.superuser_token))
        self.assertEqual(response.status_code, 405)


# ---------------------------------------------------------------------------
# CRUD / lifecycle
# ---------------------------------------------------------------------------


class LocationCreateTests(LocationTestCase):
    def test_create_success(self):
        response = post_json(
            self.client_, locations_url(self.store.id), {"code": "a1", "name": "Aisle 1"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["code"], "A1")
        self.assertEqual(body["store_id"], self.store.id)

    def test_same_code_allowed_in_different_store(self):
        post_json(self.client_, locations_url(self.store.id), {"code": "A1", "name": "Aisle 1"}, self.superuser_token)
        response = post_json(
            self.client_, locations_url(self.other_store.id), {"code": "A1", "name": "Aisle 1"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 201)

    def test_duplicate_code_within_store_400(self):
        post_json(self.client_, locations_url(self.store.id), {"code": "A1", "name": "Aisle 1"}, self.superuser_token)
        response = post_json(
            self.client_, locations_url(self.store.id), {"code": "A1", "name": "Dup"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)

    def test_create_rejected_when_store_inactive(self):
        self.store.is_active = False
        self.store.save(update_fields=["is_active", "updated_at"])
        response = post_json(
            self.client_, locations_url(self.store.id), {"code": "A1", "name": "Aisle 1"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(StorageLocation.objects.filter(store=self.store, code="A1").exists())

    def test_create_rejects_store_field_in_body(self):
        response = post_json(
            self.client_,
            locations_url(self.store.id),
            {"code": "A1", "name": "Aisle 1", "store": self.other_store.id},
            self.superuser_token,
        )
        self.assertEqual(response.status_code, 400)

    def test_create_rejects_quantity_and_owner_fields(self):
        for field in ("quantity", "stock", "company_id", "owner_id"):
            response = post_json(
                self.client_,
                locations_url(self.store.id),
                {"code": "A1", "name": "Aisle 1", field: "x"},
                self.superuser_token,
            )
            self.assertEqual(response.status_code, 400, field)

    def test_create_writes_audit_with_store_context(self):
        response = post_json(
            self.client_, locations_url(self.store.id), {"code": "A1", "name": "Aisle 1"}, self.superuser_token
        )
        location_id = response.json()["id"]
        entry = AuditLog.objects.filter(target_type="storage_location", target_id=location_id).get()
        self.assertEqual(entry.action, "storage_location.created")
        self.assertEqual(entry.store_id, self.store.id)
        self.assertIsNone(entry.company_id)


class LocationDetailTests(LocationTestCase):
    def test_cross_store_location_lookup_404(self):
        location = make_location(self.other_store, "A1")
        response = get_json(self.client_, location_url(self.store.id, location.id), self.superuser_token)
        self.assertEqual(response.status_code, 404)

    def test_cross_store_location_lookup_404_no_mutation(self):
        location = make_location(self.other_store, "A1")
        response = patch_json(
            self.client_, location_url(self.store.id, location.id), {"name": "Hacked"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 404)
        location.refresh_from_db()
        self.assertEqual(location.name, "A1")

    def test_patch_updates_name(self):
        location = make_location(self.store, "A1")
        response = patch_json(
            self.client_, location_url(self.store.id, location.id), {"name": "Renamed"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["name"], "Renamed")

    def test_patch_rejects_code(self):
        location = make_location(self.store, "A1")
        response = patch_json(
            self.client_, location_url(self.store.id, location.id), {"code": "OTHER"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)

    def test_patch_rejected_when_store_inactive(self):
        location = make_location(self.store, "A1")
        self.store.is_active = False
        self.store.save(update_fields=["is_active", "updated_at"])
        response = patch_json(
            self.client_, location_url(self.store.id, location.id), {"name": "Renamed"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 400)

    def test_patch_noop_no_duplicate_audit(self):
        location = make_location(self.store, "A1", name="Aisle 1")
        AuditLog.objects.all().delete()
        response = patch_json(
            self.client_, location_url(self.store.id, location.id), {"name": "Aisle 1"}, self.superuser_token
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(AuditLog.objects.filter(target_type="storage_location").count(), 0)


class LocationActivateDeactivateTests(LocationTestCase):
    def test_round_trip(self):
        location = make_location(self.store, "A1")
        response = post_json(self.client_, location_deactivate_url(self.store.id, location.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["is_active"])

        response = post_json(self.client_, location_activate_url(self.store.id, location.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["is_active"])

    def test_activate_rejected_when_store_inactive(self):
        location = make_location(self.store, "A1", is_active=False)
        self.store.is_active = False
        self.store.save(update_fields=["is_active", "updated_at"])
        response = post_json(self.client_, location_activate_url(self.store.id, location.id), {}, self.superuser_token)
        self.assertEqual(response.status_code, 400)

    def test_deactivate_allowed_even_when_store_inactive(self):
        location = make_location(self.store, "A1")
        self.store.is_active = False
        self.store.save(update_fields=["is_active", "updated_at"])
        response = post_json(
            self.client_, location_deactivate_url(self.store.id, location.id), {}, self.superuser_token
        )
        self.assertEqual(response.status_code, 200)

    def test_deactivate_idempotent_no_duplicate_audit(self):
        location = make_location(self.store, "A1")
        post_json(self.client_, location_deactivate_url(self.store.id, location.id), {}, self.superuser_token)
        AuditLog.objects.all().delete()
        response = post_json(
            self.client_, location_deactivate_url(self.store.id, location.id), {}, self.superuser_token
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(AuditLog.objects.filter(target_type="storage_location").count(), 0)

    def test_deactivate_preserves_row_when_store_deactivated_later(self):
        location = make_location(self.store, "A1")
        self.store.is_active = False
        self.store.save(update_fields=["is_active", "updated_at"])
        location.refresh_from_db()
        self.assertTrue(location.is_active)
        self.assertTrue(StorageLocation.objects.filter(pk=location.pk).exists())


class LocationSearchAndFilterTests(LocationTestCase):
    def test_search_by_code(self):
        make_location(self.store, "A1")
        make_location(self.store, "B2")
        response = get_json(self.client_, f"{locations_url(self.store.id)}?search=a1", self.superuser_token)
        codes = {row["code"] for row in response.json()["results"]}
        self.assertEqual(codes, {"A1"})

    def test_is_active_filter(self):
        make_location(self.store, "A1")
        make_location(self.store, "B2", is_active=False)
        response = get_json(self.client_, f"{locations_url(self.store.id)}?is_active=false", self.superuser_token)
        codes = {row["code"] for row in response.json()["results"]}
        self.assertEqual(codes, {"B2"})

    def test_is_active_filter_rejects_invalid(self):
        response = get_json(self.client_, f"{locations_url(self.store.id)}?is_active=nope", self.superuser_token)
        self.assertEqual(response.status_code, 400)

    def test_list_scoped_to_store_only(self):
        make_location(self.store, "A1")
        make_location(self.other_store, "A1")
        response = get_json(self.client_, locations_url(self.store.id), self.superuser_token)
        self.assertEqual(len(response.json()["results"]), 1)


class LocationAuditRollbackTests(LocationTestCase):
    def test_create_rolls_back_if_audit_write_fails(self):
        with patch("apps.stores.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(
                    self.client_,
                    locations_url(self.store.id),
                    {"code": "A1", "name": "Aisle 1"},
                    self.superuser_token,
                )
        self.assertFalse(StorageLocation.objects.filter(store=self.store, code="A1").exists())

    def test_deactivate_rolls_back_if_audit_write_fails(self):
        location = make_location(self.store, "A1")
        with patch("apps.stores.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                post_json(
                    self.client_, location_deactivate_url(self.store.id, location.id), {}, self.superuser_token
                )
        location.refresh_from_db()
        self.assertTrue(location.is_active)
