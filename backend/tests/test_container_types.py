"""ContainerType - shared, company/store-independent packaging reference
data (Bag, Drum, Tin, Bottle, Box, Other...), and Material.
default_container_type's write path. Mirrors apps.catalog's
UnitOfMeasure/Material test conventions exactly - synthetic data only, in
the isolated test database.
"""

import json

from django.test import Client, TestCase

from apps.catalog.models import Material
from apps.receiving.models import ContainerType
from tests.test_receiving import (
    access_token_for,
    bearer,
    grant_store_permission,
    make_category,
    make_material,
    make_store,
    make_superuser,
    make_unit,
    make_user,
    patch_json,
    post_json,
)

CONTAINER_TYPES_URL = "/api/v1/container-types/"


def container_type_url(container_type_id):
    return f"/api/v1/container-types/{container_type_id}/"


def container_type_activate_url(container_type_id):
    return f"/api/v1/container-types/{container_type_id}/activate/"


def container_type_deactivate_url(container_type_id):
    return f"/api/v1/container-types/{container_type_id}/deactivate/"


class ContainerTypeSeedDataTests(TestCase):
    def test_the_six_example_container_types_are_seeded(self):
        codes = set(ContainerType.objects.values_list("code", flat=True))
        self.assertEqual(codes, {"BAG", "DRUM", "TIN", "BOTTLE", "BOX", "OTHER"})
        self.assertTrue(ContainerType.objects.filter(code="BAG", is_active=True).exists())


class ContainerTypeApiTests(TestCase):
    def setUp(self):
        self.client_ = Client()
        self.superuser = make_superuser("ctsuper")
        self.store = make_store("CTWH")
        self.catalog_viewer = make_user("ctviewer")
        grant_store_permission(self.superuser, self.catalog_viewer, self.store, "shared_catalog.view")
        self.plain = make_user("ctplain")

    def test_active_superuser_can_create_a_container_type(self):
        res = post_json(
            self.client_, CONTAINER_TYPES_URL, {"code": "jerrycan", "name": "Jerry can"}, access_token_for(self.superuser)
        )
        self.assertEqual(res.status_code, 201, res.content[:300])
        body = res.json()
        self.assertEqual(body["code"], "JERRYCAN")
        self.assertTrue(body["is_active"])

    def test_non_superuser_cannot_create_even_with_catalog_view(self):
        res = post_json(
            self.client_, CONTAINER_TYPES_URL, {"code": "PAIL", "name": "Pail"}, access_token_for(self.catalog_viewer)
        )
        self.assertEqual(res.status_code, 403)

    def test_duplicate_code_is_rejected(self):
        post_json(self.client_, CONTAINER_TYPES_URL, {"code": "SACK", "name": "Sack"}, access_token_for(self.superuser))
        res = post_json(self.client_, CONTAINER_TYPES_URL, {"code": "sack", "name": "Sack again"}, access_token_for(self.superuser))
        self.assertEqual(res.status_code, 400)
        self.assertIn("code", res.json())

    def test_catalog_viewer_can_list_but_plain_user_cannot(self):
        res = self.client_.get(CONTAINER_TYPES_URL, **bearer(access_token_for(self.catalog_viewer)))
        self.assertEqual(res.status_code, 200)
        res2 = self.client_.get(CONTAINER_TYPES_URL, **bearer(access_token_for(self.plain)))
        self.assertEqual(res2.status_code, 403)

    def test_code_is_immutable_after_creation(self):
        created = post_json(self.client_, CONTAINER_TYPES_URL, {"code": "CRATE", "name": "Crate"}, access_token_for(self.superuser)).json()
        res = patch_json(self.client_, container_type_url(created["id"]), {"code": "CHANGED"}, access_token_for(self.superuser))
        self.assertEqual(res.status_code, 400)
        self.assertIn("code", res.json())

    def test_activate_and_deactivate_lifecycle(self):
        created = post_json(self.client_, CONTAINER_TYPES_URL, {"code": "PALLET", "name": "Pallet"}, access_token_for(self.superuser)).json()
        token = access_token_for(self.superuser)
        deactivated = post_json(self.client_, container_type_deactivate_url(created["id"]), {}, token)
        self.assertEqual(deactivated.status_code, 200)
        self.assertFalse(deactivated.json()["is_active"])
        activated = post_json(self.client_, container_type_activate_url(created["id"]), {}, token)
        self.assertEqual(activated.status_code, 200)
        self.assertTrue(activated.json()["is_active"])

    def test_deactivate_is_rejected_while_an_active_material_uses_it_as_default(self):
        container_type = ContainerType.objects.get(code="BAG")
        unit = make_unit("CTKG")
        Material.objects.create(code="CTMAT1", name="Container Material", base_unit=unit, kind="RAW_MATERIAL", default_container_type=container_type)
        res = post_json(self.client_, container_type_deactivate_url(container_type.id), {}, access_token_for(self.superuser))
        self.assertEqual(res.status_code, 400)
        container_type.refresh_from_db()
        self.assertTrue(container_type.is_active)


class MaterialDefaultContainerTypeTests(TestCase):
    """The write path a prior, in-progress change left half-built: the
    field existed and was readable, but nothing could ever set it. These
    tests cover the completed create/update path end to end.
    """

    def setUp(self):
        self.client_ = Client()
        self.superuser = make_superuser("mdctsuper")
        self.unit = make_unit("MDCTKG")
        self.category = make_category("MDCTCAT")
        self.bag = ContainerType.objects.get(code="BAG")
        self.drum = ContainerType.objects.get(code="DRUM")

    def test_create_material_with_a_default_container_type(self):
        res = post_json(
            self.client_,
            "/api/v1/materials/",
            {"code": "MDCT1", "name": "Mat 1", "kind": "RAW_MATERIAL", "base_unit_id": self.unit.id, "default_container_type_id": self.bag.id},
            access_token_for(self.superuser),
        )
        self.assertEqual(res.status_code, 201, res.content[:300])
        body = res.json()
        self.assertEqual(body["default_container_type_id"], self.bag.id)
        self.assertEqual(body["default_container_type_code"], "BAG")

    def test_create_material_without_a_default_container_type_never_errors(self):
        # Regression for the exact bug this task caught: a plain
        # source="default_container_type.id" raises AttributeError for
        # every material with none set.
        res = post_json(
            self.client_,
            "/api/v1/materials/",
            {"code": "MDCT2", "name": "Mat 2", "kind": "RAW_MATERIAL", "base_unit_id": self.unit.id},
            access_token_for(self.superuser),
        )
        self.assertEqual(res.status_code, 201, res.content[:300])
        body = res.json()
        self.assertIsNone(body["default_container_type_id"])
        self.assertIsNone(body["default_container_type_code"])

    def test_create_material_rejects_an_inactive_default_container_type(self):
        inactive = ContainerType.objects.create(code="MDCTINACTIVE", name="Inactive", is_active=False)
        res = post_json(
            self.client_,
            "/api/v1/materials/",
            {"code": "MDCT3", "name": "Mat 3", "kind": "RAW_MATERIAL", "base_unit_id": self.unit.id, "default_container_type_id": inactive.id},
            access_token_for(self.superuser),
        )
        self.assertEqual(res.status_code, 400)

    def test_update_material_can_newly_assign_and_clear_the_default_container_type(self):
        material = make_material("MDCT4", base_unit=self.unit, category=self.category)
        token = access_token_for(self.superuser)

        assign_res = patch_json(self.client_, f"/api/v1/materials/{material.id}/", {"default_container_type_id": self.drum.id}, token)
        self.assertEqual(assign_res.status_code, 200, assign_res.content[:300])
        self.assertEqual(assign_res.json()["default_container_type_id"], self.drum.id)

        clear_res = patch_json(self.client_, f"/api/v1/materials/{material.id}/", {"default_container_type_id": None}, token)
        self.assertEqual(clear_res.status_code, 200)
        self.assertIsNone(clear_res.json()["default_container_type_id"])

    def test_update_rejects_newly_assigning_an_inactive_container_type_but_keeps_an_existing_one(self):
        material = Material.objects.create(
            code="MDCT5", name="Mat 5", kind="RAW_MATERIAL", base_unit=self.unit, default_container_type=self.bag
        )
        self.bag.is_active = False
        self.bag.save(update_fields=["is_active"])
        token = access_token_for(self.superuser)

        # A PATCH that does not touch default_container_type_id at all must
        # not be rejected just because the already-assigned one is now inactive.
        unrelated_res = patch_json(self.client_, f"/api/v1/materials/{material.id}/", {"name": "Mat 5 renamed"}, token)
        self.assertEqual(unrelated_res.status_code, 200, unrelated_res.content[:300])
        self.assertEqual(unrelated_res.json()["default_container_type_id"], self.bag.id)

        # But newly assigning a *different*, inactive one is rejected.
        other_inactive = ContainerType.objects.create(code="MDCTINACTIVE2", name="Inactive 2", is_active=False)
        reject_res = patch_json(self.client_, f"/api/v1/materials/{material.id}/", {"default_container_type_id": other_inactive.id}, token)
        self.assertEqual(reject_res.status_code, 400)
