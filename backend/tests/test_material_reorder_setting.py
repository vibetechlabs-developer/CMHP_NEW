import json
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.audit.models import AuditLog
from apps.catalog.models import Material, MaterialCategory, MaterialReorderSetting, UnitOfMeasure
from apps.permissions.services import create_store_role, replace_store_role_permissions
from apps.stock_movements.models import StockMovement
from apps.stores.models import SharedStore
from apps.stores.services import assign_store_membership, assign_store_membership_role

User = get_user_model()
PASSWORD = "a-strong-pass-1"


def reorder_url(store_id, material_id):
    return f"/api/v1/stores/{store_id}/materials/{material_id}/reorder-setting/"


def make_user(username, password=PASSWORD, **kwargs):
    return User.objects.create_user(username=username, email=f"{username}@example.com", password=password, **kwargs)


def make_superuser(username, password=PASSWORD):
    return User.objects.create_superuser(username=username, email=f"{username}@example.com", password=password)


def access_token_for(user):
    return str(AccessToken.for_user(user))


def bearer(token):
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


def get_json(client, url, token):
    return client.get(url, **bearer(token))


def put_json(client, url, payload, token):
    return client.put(url, data=json.dumps(payload), content_type="application/json", **bearer(token))


def _ensure_permissions_seeded(codes):
    from apps.permissions.models import PermissionDefinition

    for code in codes:
        PermissionDefinition.objects.get_or_create(
            code=code, defaults={"name": code, "module": code.split(".")[0], "scope": "STORE", "is_active": True},
        )


def grant_store_permission(actor, user, store, *permission_codes):
    _ensure_permissions_seeded(permission_codes)
    membership, _ = assign_store_membership(actor=actor, user=user, store=store)
    role = create_store_role(actor=actor, store=store, code=f"SROLE{user.id}{store.id}", name="Role")
    role, _ = replace_store_role_permissions(actor=actor, role=role, permission_codes=list(permission_codes))
    assign_store_membership_role(actor=actor, membership=membership, role=role)
    return membership, role


class MaterialReorderSettingTestCase(TestCase):
    def setUp(self):
        self.superuser = make_superuser("admin")
        self.store = SharedStore.objects.create(code="MAINWH", name="Main Warehouse")
        self.other_store = SharedStore.objects.create(code="OTHERWH", name="Other Warehouse")
        self.client_ = Client()
        self.unit = UnitOfMeasure.objects.create(code="KG", name="KG", dimension="MASS")
        self.category = MaterialCategory.objects.create(code="HERB", name="HERB")
        self.material = Material.objects.create(
            code="MAT1", name="MAT1", kind="RAW_MATERIAL", base_unit=self.unit, category=self.category
        )
        self.viewer = make_user("storeviewer")
        grant_store_permission(self.superuser, self.viewer, self.store, "stock.view")
        self.manager = make_user("storemanager")
        grant_store_permission(self.superuser, self.manager, self.store, "stock.view", "materials.manage_reorder_level")


class GetReorderSettingTests(MaterialReorderSettingTestCase):
    def test_not_configured_returns_null_not_404(self):
        response = get_json(self.client_, reorder_url(self.store.id, self.material.id), access_token_for(self.viewer))
        self.assertEqual(response.status_code, 200, response.content)
        self.assertIsNone(response.json()["reorder_level"])

    def test_requires_stock_view_in_the_store(self):
        outsider = make_user("outsider")
        response = get_json(self.client_, reorder_url(self.store.id, self.material.id), access_token_for(outsider))
        self.assertEqual(response.status_code, 404)

    def test_anonymous_401(self):
        response = self.client_.get(reorder_url(self.store.id, self.material.id))
        self.assertEqual(response.status_code, 401)


class SetReorderSettingTests(MaterialReorderSettingTestCase):
    def test_viewer_without_manage_permission_403(self):
        response = put_json(
            self.client_, reorder_url(self.store.id, self.material.id), {"reorder_level": "10"},
            access_token_for(self.viewer),
        )
        self.assertEqual(response.status_code, 403)

    def test_manager_can_set_and_get_reads_it_back(self):
        response = put_json(
            self.client_, reorder_url(self.store.id, self.material.id), {"reorder_level": "25.500"},
            access_token_for(self.manager),
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["reorder_level"], "25.500")

        read_back = get_json(self.client_, reorder_url(self.store.id, self.material.id), access_token_for(self.viewer))
        self.assertEqual(read_back.json()["reorder_level"], "25.500")

    def test_negative_value_rejected(self):
        response = put_json(
            self.client_, reorder_url(self.store.id, self.material.id), {"reorder_level": "-5"},
            access_token_for(self.manager),
        )
        self.assertEqual(response.status_code, 400)

    def test_update_replaces_existing_value(self):
        put_json(self.client_, reorder_url(self.store.id, self.material.id), {"reorder_level": "10"}, access_token_for(self.manager))
        response = put_json(
            self.client_, reorder_url(self.store.id, self.material.id), {"reorder_level": "40"}, access_token_for(self.manager)
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["reorder_level"], "40.000")
        self.assertEqual(MaterialReorderSetting.objects.filter(store=self.store, material=self.material).count(), 1)

    def test_store_isolation_same_material_different_store(self):
        """Setting a reorder level at one store never applies to another -
        confirms it is genuinely store-scoped, never a global default."""
        grant_store_permission(self.superuser, self.manager, self.other_store, "stock.view", "materials.manage_reorder_level")
        put_json(self.client_, reorder_url(self.store.id, self.material.id), {"reorder_level": "15"}, access_token_for(self.manager))

        other_store_response = get_json(
            self.client_, reorder_url(self.other_store.id, self.material.id), access_token_for(self.manager)
        )
        self.assertIsNone(other_store_response.json()["reorder_level"])

    def test_setting_reorder_level_never_creates_a_stock_movement(self):
        count_before = StockMovement.objects.count()
        put_json(self.client_, reorder_url(self.store.id, self.material.id), {"reorder_level": "15"}, access_token_for(self.manager))
        self.assertEqual(StockMovement.objects.count(), count_before)

    def test_writes_an_audit_entry_scoped_to_the_store(self):
        put_json(self.client_, reorder_url(self.store.id, self.material.id), {"reorder_level": "15"}, access_token_for(self.manager))
        entry = AuditLog.objects.filter(target_type="material_reorder_setting", action="material_reorder_setting.created").latest("id")
        self.assertEqual(entry.store_id, self.store.id)

    def test_prohibited_field_rejected(self):
        response = put_json(
            self.client_, reorder_url(self.store.id, self.material.id),
            {"reorder_level": "15", "material_id": 999}, access_token_for(self.manager),
        )
        self.assertEqual(response.status_code, 400)
