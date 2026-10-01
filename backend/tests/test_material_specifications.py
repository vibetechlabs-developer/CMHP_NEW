import itertools
import json
import threading
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, connection, transaction
from django.test import Client, TestCase, TransactionTestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.audit.models import AuditLog
from apps.catalog.models import Material, MaterialCategory, UnitOfMeasure
from apps.common.errors import Conflict
from apps.quality.admin import MaterialSpecificationAdmin, MaterialSpecificationVersionAdmin
from apps.quality.models import MaterialSpecification, MaterialSpecificationVersion, SpecificationTest
from apps.quality.services import (
    create_material_specification,
    create_specification_version,
    update_material_specification,
    update_specification_version,
)

User = get_user_model()
PASSWORD = "a-strong-pass-1"


def specifications_url():
    return "/api/v1/material-specifications/"


def specification_url(specification_id):
    return f"/api/v1/material-specifications/{specification_id}/"


def versions_url(specification_id):
    return f"/api/v1/material-specifications/{specification_id}/versions/"


def version_url(specification_id, version_id):
    return f"/api/v1/material-specifications/{specification_id}/versions/{version_id}/"


def make_user(username, password=PASSWORD, **kwargs):
    return User.objects.create_user(username=username, email=f"{username}@example.com", password=password, **kwargs)


def make_superuser(username, password=PASSWORD):
    return User.objects.create_superuser(username=username, email=f"{username}@example.com", password=password)


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


_unique_suffix = itertools.count()


def _unique(prefix):
    return f"{prefix}{next(_unique_suffix)}"


class MaterialSpecificationTestCase(TestCase):
    def setUp(self):
        self.superuser = make_superuser("specadmin")
        self.ordinary_user = make_user("specordinary")
        self.client_ = Client()
        self.unit = make_unit("KG")
        self.category = make_category("HERB")
        self.material = make_material("MAT1", base_unit=self.unit, category=self.category)
        self.token = access_token_for(self.superuser)

    def _create_spec(self, **extra):
        payload = {
            "material_id": self.material.id,
            "code": _unique("SPEC"),
            "name": "Test Specification",
            **extra,
        }
        return post_json(self.client_, specifications_url(), payload, self.token)

    def _create_spec_object(self, **extra):
        response = self._create_spec(**extra)
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class MaterialSpecificationModelTests(MaterialSpecificationTestCase):
    def test_code_is_unique(self):
        spec = create_material_specification(
            actor=self.superuser, material_id=self.material.id, code=_unique("DUP"), name="A"
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                MaterialSpecification.objects.create(
                    material=self.material, code=spec.code, name="B", created_by=self.superuser
                )

    def test_material_immutable_after_creation(self):
        other_material = make_material(_unique("MATB"), base_unit=self.unit)
        spec = create_material_specification(
            actor=self.superuser, material_id=self.material.id, code=_unique("IMMUT"), name="A"
        )
        spec.material = other_material
        with self.assertRaises(Exception):
            spec.save()

    def test_code_immutable_after_creation(self):
        spec = create_material_specification(
            actor=self.superuser, material_id=self.material.id, code=_unique("IMMUT2"), name="A"
        )
        spec.code = _unique("CHANGED")
        with self.assertRaises(Exception):
            spec.save()

    def test_code_normalized_like_other_master_data(self):
        response = self._create_spec(code=" lower-code ")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["code"], "LOWER-CODE")

    def test_revision_number_unique_per_specification(self):
        spec = create_material_specification(
            actor=self.superuser, material_id=self.material.id, code=_unique("REV"), name="A"
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                MaterialSpecificationVersion.objects.create(
                    specification=spec, revision_number=1, created_by=self.superuser
                )

    def test_version_specification_immutable_after_creation(self):
        spec_a = create_material_specification(
            actor=self.superuser, material_id=self.material.id, code=_unique("VA"), name="A"
        )
        spec_b = create_material_specification(
            actor=self.superuser, material_id=self.material.id, code=_unique("VB"), name="B"
        )
        version = spec_a.versions.get()
        version.specification = spec_b
        with self.assertRaises(Exception):
            version.save()

    def test_version_revision_number_immutable_after_creation(self):
        spec = create_material_specification(
            actor=self.superuser, material_id=self.material.id, code=_unique("RN"), name="A"
        )
        version = spec.versions.get()
        version.revision_number = 99
        with self.assertRaises(Exception):
            version.save()

    def test_test_row_requires_parameter_name(self):
        spec = create_material_specification(
            actor=self.superuser, material_id=self.material.id, code=_unique("TR"), name="A"
        )
        version = spec.versions.get()
        with self.assertRaises(DjangoValidationError):
            SpecificationTest.objects.create(version=version, line_number=1, parameter_name="", result_type="TEXT")

    def test_test_row_requires_valid_result_type(self):
        spec = create_material_specification(
            actor=self.superuser, material_id=self.material.id, code=_unique("RT"), name="A"
        )
        version = spec.versions.get()
        with self.assertRaises(DjangoValidationError):
            SpecificationTest.objects.create(
                version=version, line_number=1, parameter_name="Appearance", result_type="BOGUS"
            )


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------


class MaterialSpecificationAdminAccessRestrictionTests(MaterialSpecificationTestCase):
    def setUp(self):
        super().setUp()
        from django.test import RequestFactory

        self.factory = RequestFactory()
        self.spec_admin = MaterialSpecificationAdmin(MaterialSpecification, admin_site=None)
        self.version_admin = MaterialSpecificationVersionAdmin(MaterialSpecificationVersion, admin_site=None)

    def _request_as(self, user):
        request = self.factory.get("/admin/")
        request.user = user
        return request

    def test_superuser_can_view_but_not_add_or_change(self):
        request = self._request_as(self.superuser)
        self.assertTrue(self.spec_admin.has_view_permission(request))
        self.assertFalse(self.spec_admin.has_add_permission(request))
        self.assertFalse(self.spec_admin.has_change_permission(request))
        self.assertTrue(self.version_admin.has_view_permission(request))
        self.assertFalse(self.version_admin.has_add_permission(request))
        self.assertFalse(self.version_admin.has_change_permission(request))

    def test_ordinary_user_cannot_view(self):
        request = self._request_as(self.ordinary_user)
        self.assertFalse(self.spec_admin.has_view_permission(request))
        self.assertFalse(self.version_admin.has_view_permission(request))


# ---------------------------------------------------------------------------
# Authorization
# ---------------------------------------------------------------------------


class MaterialSpecificationAuthorizationTests(MaterialSpecificationTestCase):
    def test_anonymous_401_on_list(self):
        response = self.client_.get(specifications_url())
        self.assertEqual(response.status_code, 401)

    def test_ordinary_user_403_on_list(self):
        response = get_json(self.client_, specifications_url(), access_token_for(self.ordinary_user))
        self.assertEqual(response.status_code, 403)

    def test_ordinary_user_403_on_create(self):
        response = post_json(
            self.client_, specifications_url(),
            {"material_id": self.material.id, "code": "X", "name": "X"}, access_token_for(self.ordinary_user),
        )
        self.assertEqual(response.status_code, 403)

    def test_ordinary_user_403_on_versions(self):
        spec = self._create_spec_object()
        response = get_json(
            self.client_, versions_url(spec["id"]), access_token_for(self.ordinary_user)
        )
        self.assertEqual(response.status_code, 403)

    def test_superuser_succeeds(self):
        response = get_json(self.client_, specifications_url(), self.token)
        self.assertEqual(response.status_code, 200)


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


class MaterialSpecificationCreateTests(MaterialSpecificationTestCase):
    def test_create_success_with_atomic_first_version(self):
        response = self._create_spec()
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["material_id"], self.material.id)
        self.assertEqual(body["latest_revision_number"], 1)
        self.assertEqual(len(body["versions"]), 1)
        first_version = body["versions"][0]
        self.assertEqual(first_version["revision_number"], 1)
        self.assertEqual(first_version["status"], "DRAFT")
        self.assertEqual(first_version["version"], 1)
        self.assertEqual(first_version["tests"], [])

        self.assertEqual(MaterialSpecification.objects.count(), 1)
        self.assertEqual(MaterialSpecificationVersion.objects.count(), 1)
        self.assertEqual(SpecificationTest.objects.count(), 0)

    def test_duplicate_code_returns_409(self):
        first = self._create_spec_object()
        response = self._create_spec(code=first["code"])
        self.assertEqual(response.status_code, 409)

    def test_inactive_material_rejected(self):
        self.material.is_active = False
        self.material.save(update_fields=["is_active"])
        response = self._create_spec()
        self.assertEqual(response.status_code, 400)

    def test_unknown_material_404(self):
        response = self._create_spec(material_id=999999)
        self.assertEqual(response.status_code, 404)

    def test_prohibited_fields_rejected(self):
        for field, value in [
            ("latest_revision_number", 5), ("created_by_id", self.superuser.id), ("versions", []),
        ]:
            response = self._create_spec(**{field: value})
            self.assertEqual(response.status_code, 400, field)

    def test_no_tests_or_reference_accepted_at_spec_create(self):
        """The first version is strictly empty - reference_document/
        notes/tests are not even accepted fields on this endpoint.
        """
        response = self._create_spec(reference_document="should be rejected")
        self.assertEqual(response.status_code, 400)


# ---------------------------------------------------------------------------
# Update specification metadata (unversioned)
# ---------------------------------------------------------------------------


class MaterialSpecificationUpdateTests(MaterialSpecificationTestCase):
    def test_update_name_and_description(self):
        spec = self._create_spec_object()
        response = patch_json(
            self.client_, specification_url(spec["id"]),
            {"expected_version": spec["version"], "name": "New name", "description": "New description"},
            self.token,
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["name"], "New name")
        self.assertEqual(response.json()["version"], spec["version"] + 1)

    def test_missing_expected_version_rejected(self):
        spec = self._create_spec_object()
        response = patch_json(self.client_, specification_url(spec["id"]), {"name": "New name"}, self.token)
        self.assertEqual(response.status_code, 400)

    def test_stale_expected_version_conflict(self):
        spec = self._create_spec_object()
        response = patch_json(
            self.client_, specification_url(spec["id"]),
            {"expected_version": spec["version"] + 5, "name": "New name"}, self.token,
        )
        self.assertEqual(response.status_code, 409)
        specification = MaterialSpecification.objects.get(pk=spec["id"])
        self.assertEqual(specification.name, spec["name"])
        self.assertEqual(specification.version, spec["version"])

    def test_material_id_immutable_via_api(self):
        spec = self._create_spec_object()
        other_material = make_material(_unique("MATC"), base_unit=self.unit)
        response = patch_json(
            self.client_, specification_url(spec["id"]),
            {"expected_version": spec["version"], "material_id": other_material.id}, self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_code_immutable_via_api(self):
        spec = self._create_spec_object()
        response = patch_json(
            self.client_, specification_url(spec["id"]),
            {"expected_version": spec["version"], "code": "CHANGED"}, self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_noop_update_does_not_write_audit_entry_or_bump_version(self):
        spec = self._create_spec_object()
        response = patch_json(
            self.client_, specification_url(spec["id"]),
            {"expected_version": spec["version"], "name": spec["name"]}, self.token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["version"], spec["version"])
        count = AuditLog.objects.filter(
            target_type="material_specification", target_id=spec["id"], action="material_specification.updated"
        ).count()
        self.assertEqual(count, 0)

    def test_metadata_update_audit_failure_rolls_back(self):
        spec = self._create_spec_object()
        with patch("apps.quality.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                update_material_specification(
                    actor=self.superuser, specification_id=spec["id"], expected_version=spec["version"],
                    data={"name": "should not persist"},
                )
        specification = MaterialSpecification.objects.get(pk=spec["id"])
        self.assertEqual(specification.name, spec["name"])
        self.assertEqual(specification.version, spec["version"])

    def test_revision_allocation_unaffected_by_metadata_updates(self):
        """Editing metadata (bumping MaterialSpecification.version) has no
        effect on latest_revision_number, and creating a new revision has
        no effect on MaterialSpecification.version - the two counters are
        independent, per the task's own documentation requirement.
        """
        spec = self._create_spec_object()
        updated = patch_json(
            self.client_, specification_url(spec["id"]),
            {"expected_version": spec["version"], "name": "Renamed"}, self.token,
        ).json()
        self.assertEqual(updated["latest_revision_number"], 1)

        new_version = post_json(self.client_, versions_url(spec["id"]), {}, self.token).json()
        self.assertEqual(new_version["revision_number"], 2)

        specification = MaterialSpecification.objects.get(pk=spec["id"])
        self.assertEqual(specification.version, updated["version"])
        self.assertEqual(specification.latest_revision_number, 2)


# ---------------------------------------------------------------------------
# Version create
# ---------------------------------------------------------------------------


class SpecificationVersionCreateTests(MaterialSpecificationTestCase):
    def test_create_new_version_increments_revision_number(self):
        spec = self._create_spec_object()
        response = post_json(
            self.client_, versions_url(spec["id"]), {"reference_document": "DOC-1", "notes": "n"}, self.token
        )
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["revision_number"], 2)
        self.assertEqual(body["status"], "DRAFT")

        specification = MaterialSpecification.objects.get(pk=spec["id"])
        self.assertEqual(specification.latest_revision_number, 2)

    def test_multiple_draft_versions_coexist(self):
        spec = self._create_spec_object()
        post_json(self.client_, versions_url(spec["id"]), {}, self.token)
        post_json(self.client_, versions_url(spec["id"]), {}, self.token)
        response = get_json(self.client_, versions_url(spec["id"]), self.token)
        self.assertEqual(response.json()["count"], 3)

    def test_unknown_specification_404(self):
        response = post_json(self.client_, versions_url(999999), {}, self.token)
        self.assertEqual(response.status_code, 404)

    def test_prohibited_fields_rejected(self):
        spec = self._create_spec_object()
        response = post_json(self.client_, versions_url(spec["id"]), {"revision_number": 99}, self.token)
        self.assertEqual(response.status_code, 400)
        response = post_json(self.client_, versions_url(spec["id"]), {"tests": []}, self.token)
        self.assertEqual(response.status_code, 400)


class ConcurrentRevisionCreationTests(TransactionTestCase):
    serialized_rollback = True

    def test_concurrent_version_creation_allocates_distinct_revisions(self):
        superuser = make_superuser("concurrentspecadmin")
        unit = make_unit("KGSPEC")
        material = make_material("MATSPEC", base_unit=unit)
        specification = create_material_specification(
            actor=superuser, material_id=material.id, code="CONCURSPEC", name="Concurrent Spec"
        )
        self.assertEqual(specification.latest_revision_number, 1)

        results = []
        barrier = threading.Barrier(2)

        def worker():
            try:
                barrier.wait(timeout=5)
                version = create_specification_version(actor=superuser, specification_id=specification.id)
                results.append(("ok", version.revision_number))
            except Exception as exc:  # pragma: no cover - failure path only
                results.append(("error", str(exc)))
            finally:
                connection.close()

        threads = [threading.Thread(target=worker), threading.Thread(target=worker)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        self.assertEqual(len(results), 2, results)
        outcomes = [r for r in results if r[0] == "ok"]
        self.assertEqual(len(outcomes), 2, results)
        revisions = sorted(r[1] for r in outcomes)
        self.assertEqual(revisions, [2, 3], results)

        final_specification = MaterialSpecification.objects.get(pk=specification.id)
        self.assertEqual(final_specification.latest_revision_number, 3)
        self.assertEqual(final_specification.versions.count(), 3)


# ---------------------------------------------------------------------------
# Version update (draft editing + test rows)
# ---------------------------------------------------------------------------


class SpecificationVersionUpdateTests(MaterialSpecificationTestCase):
    def _spec_and_first_version(self):
        spec = self._create_spec_object()
        version = spec["versions"][0]
        return spec, version

    def test_edit_header_fields(self):
        spec, version = self._spec_and_first_version()
        response = patch_json(
            self.client_, version_url(spec["id"], version["id"]),
            {"expected_version": version["version"], "reference_document": "DOC-42", "notes": "n"}, self.token,
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["reference_document"], "DOC-42")
        self.assertEqual(response.json()["version"], version["version"] + 1)

    def test_add_tests(self):
        spec, version = self._spec_and_first_version()
        response = patch_json(
            self.client_, version_url(spec["id"], version["id"]),
            {
                "expected_version": version["version"],
                "tests": [
                    {"parameter_name": "Appearance", "method_reference": "Visual", "result_type": "TEXT"},
                    {"parameter_name": "Moisture", "result_type": "NUMERIC", "unit_label": "%"},
                ],
            },
            self.token,
        )
        self.assertEqual(response.status_code, 200, response.content)
        tests = response.json()["tests"]
        self.assertEqual(len(tests), 2)
        self.assertEqual(tests[0]["parameter_name"], "Appearance")
        self.assertEqual(tests[1]["result_type"], "NUMERIC")

    def test_test_row_missing_parameter_name_rejected(self):
        spec, version = self._spec_and_first_version()
        response = patch_json(
            self.client_, version_url(spec["id"], version["id"]),
            {"expected_version": version["version"], "tests": [{"parameter_name": "", "result_type": "TEXT"}]},
            self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_test_row_missing_result_type_rejected(self):
        spec, version = self._spec_and_first_version()
        response = patch_json(
            self.client_, version_url(spec["id"], version["id"]),
            {"expected_version": version["version"], "tests": [{"parameter_name": "Appearance"}]},
            self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_test_row_incomplete_method_and_criteria_allowed(self):
        spec, version = self._spec_and_first_version()
        response = patch_json(
            self.client_, version_url(spec["id"], version["id"]),
            {"expected_version": version["version"], "tests": [{"parameter_name": "Appearance", "result_type": "TEXT"}]},
            self.token,
        )
        self.assertEqual(response.status_code, 200, response.content)
        test_row = response.json()["tests"][0]
        self.assertEqual(test_row["method_reference"], "")
        self.assertEqual(test_row["acceptance_criteria"], "")

    def test_empty_tests_list_clears_existing(self):
        spec, version = self._spec_and_first_version()
        first = patch_json(
            self.client_, version_url(spec["id"], version["id"]),
            {"expected_version": version["version"], "tests": [{"parameter_name": "A", "result_type": "TEXT"}]},
            self.token,
        ).json()
        response = patch_json(
            self.client_, version_url(spec["id"], version["id"]),
            {"expected_version": first["version"], "tests": []}, self.token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["tests"], [])

    def test_omitted_tests_leaves_existing_unchanged(self):
        spec, version = self._spec_and_first_version()
        first = patch_json(
            self.client_, version_url(spec["id"], version["id"]),
            {"expected_version": version["version"], "tests": [{"parameter_name": "A", "result_type": "TEXT"}]},
            self.token,
        ).json()
        response = patch_json(
            self.client_, version_url(spec["id"], version["id"]),
            {"expected_version": first["version"], "notes": "unrelated change"}, self.token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["tests"]), 1)

    def test_prohibited_test_field_rejected(self):
        spec, version = self._spec_and_first_version()
        response = patch_json(
            self.client_, version_url(spec["id"], version["id"]),
            {
                "expected_version": version["version"],
                "tests": [{"parameter_name": "A", "result_type": "TEXT", "line_number": 99}],
            },
            self.token,
        )
        self.assertEqual(response.status_code, 400)

    def test_stale_version_conflict(self):
        spec, version = self._spec_and_first_version()
        response = patch_json(
            self.client_, version_url(spec["id"], version["id"]),
            {"expected_version": version["version"] + 5, "notes": "x"}, self.token,
        )
        self.assertEqual(response.status_code, 409)

    def test_noop_update_does_not_bump_version_or_audit(self):
        spec, version = self._spec_and_first_version()
        count_before = AuditLog.objects.filter(
            target_type="material_specification_version", target_id=version["id"],
            action="material_specification_version.updated",
        ).count()
        response = patch_json(
            self.client_, version_url(spec["id"], version["id"]),
            {"expected_version": version["version"], "notes": ""}, self.token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["version"], version["version"])
        count_after = AuditLog.objects.filter(
            target_type="material_specification_version", target_id=version["id"],
            action="material_specification_version.updated",
        ).count()
        self.assertEqual(count_before, count_after)

    def test_version_from_different_specification_404(self):
        spec_a = self._create_spec_object()
        spec_b = self._create_spec_object()
        version_a = spec_a["versions"][0]
        response = patch_json(
            self.client_, version_url(spec_b["id"], version_a["id"]),
            {"expected_version": version_a["version"], "notes": "x"}, self.token,
        )
        self.assertEqual(response.status_code, 404)

    def test_non_draft_status_rejected_defensively(self):
        """Service-level defensive check: no reachable API path today ever
        produces a non-DRAFT version, but update_specification_version
        still guards against it explicitly (see the model's own docstring
        for why, citing the cancel_incoming_inspection precedent).
        """
        spec, version = self._spec_and_first_version()
        MaterialSpecificationVersion.objects.filter(pk=version["id"]).update(status="RETIRED")
        with self.assertRaises(DjangoValidationError):
            update_specification_version(
                actor=self.superuser, version_id=version["id"], expected_version=version["version"],
                data={"notes": "should fail"},
            )


# ---------------------------------------------------------------------------
# Audit and rollback
# ---------------------------------------------------------------------------


class MaterialSpecificationAuditTests(MaterialSpecificationTestCase):
    def test_create_audit_entry_has_no_company_or_store(self):
        spec = self._create_spec_object()
        entry = AuditLog.objects.get(
            target_type="material_specification", target_id=spec["id"], action="material_specification.created"
        )
        self.assertIsNone(entry.company_id)
        self.assertIsNone(entry.store_id)

    def test_create_rollback_on_audit_failure(self):
        code = _unique("ROLLBACK")
        with patch("apps.quality.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                create_material_specification(
                    actor=self.superuser, material_id=self.material.id, code=code, name="Should not persist"
                )
        self.assertFalse(MaterialSpecification.objects.filter(code=code).exists())

    def test_version_update_rollback_on_audit_failure(self):
        spec = self._create_spec_object()
        version = spec["versions"][0]
        with patch("apps.quality.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                update_specification_version(
                    actor=self.superuser, version_id=version["id"], expected_version=version["version"],
                    data={"notes": "should roll back"},
                )
        persisted = MaterialSpecificationVersion.objects.get(pk=version["id"])
        self.assertEqual(persisted.notes, "")
        self.assertEqual(persisted.version, version["version"])

    def test_version_create_rollback_on_audit_failure(self):
        spec = self._create_spec_object()
        with patch("apps.quality.services.record", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                create_specification_version(actor=self.superuser, specification_id=spec["id"])
        specification = MaterialSpecification.objects.get(pk=spec["id"])
        self.assertEqual(specification.latest_revision_number, 1)
        self.assertEqual(specification.versions.count(), 1)


# ---------------------------------------------------------------------------
# Existing QC compatibility (lightweight - the authoritative check is a
# full rerun of tests.test_incoming_inspections, see the task's own
# verification instructions)
# ---------------------------------------------------------------------------


class ExistingQCCompatibilityTests(MaterialSpecificationTestCase):
    def test_incoming_inspection_model_unaffected_by_specifications(self):
        from apps.quality.models import IncomingInspection

        field_names = {f.name for f in IncomingInspection._meta.get_fields()}
        self.assertNotIn("specification", field_names)
        self.assertNotIn("specification_version", field_names)
