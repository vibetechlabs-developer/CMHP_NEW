"""The current-user capability `can_manage_material_catalog` is read-only UI
information derived from the SAME rule as the server's catalog write check.
It grants nothing: the write endpoints still enforce authorization themselves.

Synthetic users and fixtures only, in the isolated test database.
"""

import json

from django.test import Client, TestCase

from apps.catalog.models import Material, UnitOfMeasure
from apps.common.permissions import IsActiveSuperuser, is_active_superuser
from tests.test_store_preparation import (
    bearer,
    grant_company_permission,
    make_company,
    make_superuser,
    make_user,
)

ME_URL = "/api/v1/auth/me/"


class MaterialCatalogCapabilityTests(TestCase):
    def setUp(self):
        self.client_ = Client()
        self.superuser = make_superuser("capsuper")
        self.business_admin = make_user("capbizadmin")
        self.company = make_company("CAPCO")
        # A business Admin: every company permission, but NOT a superuser.
        from apps.permissions.models import PermissionDefinition

        codes = list(PermissionDefinition.objects.filter(scope="COMPANY", is_active=True).values_list("code", flat=True))
        grant_company_permission(self.superuser, self.business_admin, self.company, *codes)
        self.plain = make_user("capplain")
        self.unit = UnitOfMeasure.objects.create(code="CAPKG", name="Capability kilogram", dimension=UnitOfMeasure.Dimension.MASS)

    def me(self, user=None, query=""):
        return self.client_.get(ME_URL + query, **bearer(user or self.superuser))

    def test_active_superuser_gets_the_capability(self):
        res = self.me(self.superuser)
        self.assertEqual(res.status_code, 200, res.content[:200])
        self.assertEqual(res.json()["capabilities"], {"can_manage_material_catalog": True})

    def test_business_admin_does_not_gain_catalog_authority(self):
        res = self.me(self.business_admin)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["capabilities"], {"can_manage_material_catalog": False})

    def test_ordinary_user_gets_false(self):
        self.assertEqual(self.me(self.plain).json()["capabilities"], {"can_manage_material_catalog": False})

    def test_anonymous_access_is_blocked(self):
        self.assertEqual(self.client_.get(ME_URL).status_code, 401)

    def test_client_cannot_set_the_capability(self):
        res = self.me(self.business_admin, query="?capabilities=%7B%22can_manage_material_catalog%22%3Atrue%7D&can_manage_material_catalog=true")
        self.assertEqual(res.json()["capabilities"], {"can_manage_material_catalog": False})

    def test_capability_matches_the_server_write_rule_for_every_account(self):
        for user in (self.superuser, self.business_admin, self.plain):
            ui = self.me(user).json()["capabilities"]["can_manage_material_catalog"]
            self.assertEqual(ui, is_active_superuser(user))
            self.assertEqual(ui, IsActiveSuperuser().has_permission(type("R", (), {"user": user})(), None))

    def test_response_exposes_no_other_admin_flags(self):
        body = self.me(self.superuser).json()
        self.assertEqual(set(body.keys()), {"id", "username", "email", "first_name", "last_name", "capabilities"})
        self.assertNotIn("is_superuser", json.dumps(body))

    def test_server_still_refuses_a_catalog_write_from_a_non_superuser(self):
        # Even with the UI showing controls, the write endpoint decides.
        payload = {"code": "CAP-FORGED", "name": "Forged", "kind": "RAW_MATERIAL", "base_unit_id": self.unit.id}
        for user in (self.business_admin, self.plain):
            res = self.client_.post("/api/v1/materials/", data=json.dumps(payload), content_type="application/json", **bearer(user))
            self.assertEqual(res.status_code, 403, res.content[:200])
        self.assertFalse(Material.objects.filter(code="CAP-FORGED").exists())

    def test_server_still_refuses_material_import_from_a_non_superuser(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        upload = SimpleUploadedFile("m.csv", b"code,name,material_type,base_unit_code\nCAP-X,X,RAW,CAPKG\n", content_type="text/csv")
        res = self.client_.post("/api/v1/materials/import-preview/", data={"file": upload}, **bearer(self.business_admin))
        self.assertEqual(res.status_code, 403, res.content[:200])
