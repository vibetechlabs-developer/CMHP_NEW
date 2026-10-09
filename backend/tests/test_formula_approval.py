"""Task 11C: policy-gated formula revision approval.

Fixtures are synthetic. Where a test needs a "who is allowed to approve"
answer it grants explicit company permissions; nothing here reflects a
confirmed client policy.
"""

import importlib
import itertools
import threading
from decimal import Decimal
from unittest.mock import patch

from django.apps import apps as django_apps
from django.contrib import admin as django_admin
from django.core.exceptions import ValidationError
from django.db import connection
from django.db.models import F
from django.test import RequestFactory, TransactionTestCase
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.catalog.models import Material, UnitOfMeasure
from apps.common.errors import Conflict
from apps.formulas import approval, services
from apps.formulas.admin import FormulaApprovalPolicyAdmin, FormulaRevisionAdmin, FormulaRevisionContributorAdmin
from apps.formulas.approval import (
    ApprovalBlocked,
    approve_formula_revision,
    submit_formula_revision,
    update_approval_policy,
)
from apps.formulas.models import (
    Formula,
    FormulaApprovalPolicy,
    FormulaLine,
    FormulaRevision,
    FormulaRevisionContributor,
)
from apps.products.models import Product
from tests import test_formulas as tf

_n = itertools.count()


def policy_url(company_id):
    return f"/api/v1/companies/{company_id}/formula-approval-policy/"


class ApprovalBase(tf.Base):
    def setUp(self):
        super().setUp()
        n = next(_n)
        self.approver = tf.make_user(f"approver{n}")
        tf.grant(self.superuser, self.approver, self.company, "formulas.view", "formulas.approve")
        self.approver_token = tf.token_for(self.approver)

    # -- helpers ------------------------------------------------------------
    def extend_grant(self, user, *codes):
        """Add permissions to the role `tf.grant` created for `user`."""
        from apps.permissions.models import CompanyRole
        from apps.permissions.services import replace_role_permissions

        role = CompanyRole.objects.get(company=self.company, code=f"ROLE{user.id}")
        existing = list(role.permissions.values_list("code", flat=True))
        replace_role_permissions(actor=self.superuser, role=role, permission_codes=[*existing, *codes])

    def set_policy(self, allow_self_approval=False, company=None):
        company = company or self.company
        return FormulaApprovalPolicy.objects.update_or_create(
            company=company,
            defaults=dict(allow_self_approval=allow_self_approval, created_by=self.superuser, updated_by=self.superuser),
        )[0]

    def rev_url(self, formula, revision, suffix, company_id=None):
        return tf.revision_url(company_id or self.company.id, formula["id"], revision["id"]) + suffix

    def approve(self, formula, revision, version=None, token=None, payload=None, company_id=None):
        body = payload if payload is not None else {"expected_version": version if version is not None else revision["version"]}
        return tf.post_json(self.client_, self.rev_url(formula, revision, "approve/", company_id), body, token or self.approver_token)

    def review(self, formula, revision, token=None, company_id=None):
        return tf.get_json(self.client_, self.rev_url(formula, revision, "approval-preview/", company_id), token or self.approver_token)

    def fetch(self, formula, revision):
        return tf.get_json(self.client_, self.rev_url(formula, revision, ""), self.token).json()

    def ready_formula(self, **kw):
        """A formula with lines, submitted for QA review (SUBMITTED) and
        the company policy set - i.e. actually ready for an approve/reject
        attempt, not just a draft with content. Submitted by self.user (tf.
        Base's ALL_PERMS now includes formulas.submit), mirroring the real
        workflow where the creator submits their own work.
        """
        formula, revision = self.formula_with_lines()
        self.set_policy(**kw)
        submitted = self.submit_rev(formula, revision)
        self.assertEqual(submitted.status_code, 200, submitted.content)
        return formula, submitted.json()

    def codes(self, response):
        return [r["code"] for r in response.json()["blocking_reasons"]]

    def audit_count(self, action, target_id=None):
        qs = AuditLog.objects.filter(action=action)
        if target_id is not None:
            qs = qs.filter(target_id=target_id)
        return qs.count()


class PolicyEndpointTests(ApprovalBase):
    def test_only_an_active_superuser_may_use_the_policy_endpoint(self):
        url = policy_url(self.company.id)
        self.assertEqual(self.client_.get(url).status_code, 401)
        # a user with every formula permission (including approve) is still not an administrator
        self.extend_grant(self.user, "formulas.approve")
        self.assertEqual(tf.get_json(self.client_, url, self.token).status_code, 403)
        self.assertEqual(tf.patch_json(self.client_, url, {"expected_version": 0, "allow_self_approval": True}, self.token).status_code, 403)
        self.assertEqual(tf.get_json(self.client_, url, tf.token_for(self.superuser)).status_code, 200)

    def test_unconfigured_shell_then_create_then_update(self):
        token = tf.token_for(self.superuser)
        url = policy_url(self.company.id)
        body = tf.get_json(self.client_, url, token).json()
        self.assertEqual((body["status"], body["version"], body["allow_self_approval"]), ("NOT_CONFIGURED", 0, None))
        created = tf.patch_json(self.client_, url, {"expected_version": 0, "allow_self_approval": False}, token)
        self.assertEqual(created.status_code, 200, created.content)
        self.assertEqual(
            (created.json()["status"], created.json()["version"], created.json()["allow_self_approval"]),
            ("CONFIGURED", 1, False),
        )
        self.assertEqual(self.audit_count("formula_approval_policy.created"), 1)
        updated = tf.patch_json(self.client_, url, {"expected_version": 1, "allow_self_approval": True}, token)
        self.assertEqual((updated.json()["version"], updated.json()["allow_self_approval"]), (2, True))
        self.assertEqual(self.audit_count("formula_approval_policy.updated"), 1)

    def test_stale_versions_conflict_and_noop_writes_nothing(self):
        token = tf.token_for(self.superuser)
        url = policy_url(self.company.id)
        self.assertEqual(tf.patch_json(self.client_, url, {"expected_version": 3, "allow_self_approval": True}, token).status_code, 409)
        tf.patch_json(self.client_, url, {"expected_version": 0, "allow_self_approval": True}, token)
        self.assertEqual(tf.patch_json(self.client_, url, {"expected_version": 0, "allow_self_approval": False}, token).status_code, 409)
        events = AuditLog.objects.count()
        noop = tf.patch_json(self.client_, url, {"expected_version": 1, "allow_self_approval": True}, token)
        self.assertEqual((noop.status_code, noop.json()["version"]), (200, 1))
        self.assertEqual(AuditLog.objects.count(), events)

    def test_nulls_unknown_fields_and_missing_version_are_rejected(self):
        token = tf.token_for(self.superuser)
        url = policy_url(self.company.id)
        self.assertEqual(tf.patch_json(self.client_, url, {"expected_version": 0, "allow_self_approval": None}, token).status_code, 400)
        self.assertEqual(tf.patch_json(self.client_, url, {"expected_version": 0, "allow_self_approval": True, "company": 1}, token).status_code, 400)
        self.assertEqual(tf.patch_json(self.client_, url, {"allow_self_approval": True}, token).status_code, 400)
        self.assertEqual(tf.patch_json(self.client_, url, {"expected_version": 0}, token).status_code, 400)
        self.assertFalse(FormulaApprovalPolicy.objects.exists())

    def test_unknown_company_is_404(self):
        self.assertEqual(tf.get_json(self.client_, policy_url(999999), tf.token_for(self.superuser)).status_code, 404)

    def test_policy_is_per_company(self):
        token = tf.token_for(self.superuser)
        tf.patch_json(self.client_, policy_url(self.company.id), {"expected_version": 0, "allow_self_approval": True}, token)
        other = tf.get_json(self.client_, policy_url(self.other_company.id), token).json()
        self.assertEqual(other["status"], "NOT_CONFIGURED")

    def test_configuring_the_policy_grants_no_approval_authority(self):
        formula, revision = self.formula_with_lines()
        token = tf.token_for(self.superuser)
        tf.patch_json(self.client_, policy_url(self.company.id), {"expected_version": 0, "allow_self_approval": True}, token)
        response = self.approve(formula, revision, token=token)
        self.assertIn(response.status_code, (403, 404))
        self.assertEqual(FormulaRevision.objects.get(pk=revision["id"]).status, "DRAFT")

    def test_admin_models_are_read_only(self):
        request = RequestFactory().get("/")
        request.user = self.superuser
        for model, admin_class in (
            (FormulaApprovalPolicy, FormulaApprovalPolicyAdmin),
            (FormulaRevisionContributor, FormulaRevisionContributorAdmin),
            (FormulaRevision, FormulaRevisionAdmin),
        ):
            model_admin = admin_class(model, django_admin.site)
            self.assertFalse(model_admin.has_add_permission(request))
            self.assertFalse(model_admin.has_change_permission(request))
            self.assertFalse(model_admin.has_delete_permission(request))


class ApprovalAccessTests(ApprovalBase):
    def test_anonymous_outsider_and_missing_permissions(self):
        formula, revision = self.ready_formula()
        url = self.rev_url(formula, revision, "approve/")
        self.assertEqual(self.client_.post(url, data="{}", content_type="application/json").status_code, 401)
        outsider = tf.make_user("aoutsider")
        self.assertEqual(self.approve(formula, revision, token=tf.token_for(outsider)).status_code, 404)
        # editors (view/create/edit) without approve
        response = self.approve(formula, revision, token=self.token)
        self.assertEqual(response.status_code, 403)
        self.assertIn("formulas.approve", response.json()["detail"])
        # approve without view
        approve_only = tf.make_user("approveonly")
        tf.grant(self.superuser, approve_only, self.company, "formulas.approve")
        response = self.approve(formula, revision, token=tf.token_for(approve_only))
        self.assertEqual(response.status_code, 403)
        self.assertIn("formulas.view", response.json()["detail"])
        self.assertEqual(FormulaRevision.objects.get(pk=revision["id"]).status, "SUBMITTED")

    def test_no_superuser_bypass_and_company_scoping(self):
        formula, revision = self.ready_formula()
        self.assertIn(self.approve(formula, revision, token=tf.token_for(self.superuser)).status_code, (403, 404))
        # approve rights in another company do not carry over
        tf.grant(self.superuser, self.approver, self.other_company, "formulas.view", "formulas.approve")
        self.assertEqual(self.approve(formula, revision, company_id=self.other_company.id).status_code, 404)
        other_formula = self.make_formula(code="OTHER")
        cross = tf.post_json(
            self.client_,
            tf.revision_url(self.company.id, formula["id"], other_formula["revisions"][0]["id"]) + "approve/",
            {"expected_version": 1},
            self.approver_token,
        )
        self.assertEqual(cross.status_code, 404)
        self.company.is_active = False
        self.company.save(update_fields=["is_active"])
        self.assertEqual(self.approve(formula, revision).status_code, 404)

    def test_inactive_user_is_rejected(self):
        formula, revision = self.ready_formula()
        self.approver.is_active = False
        self.approver.save(update_fields=["is_active"])
        self.assertEqual(self.approve(formula, revision).status_code, 401)

    def test_permission_is_seeded_and_assigned_to_nobody(self):
        from apps.permissions.models import CompanyRole, PermissionDefinition

        permission = PermissionDefinition.objects.get(code="formulas.approve")
        self.assertEqual(permission.scope, "COMPANY")
        # the only holder is the role this test's setUp created explicitly
        holders = CompanyRole.objects.filter(permissions__code="formulas.approve")
        self.assertEqual([r.code for r in holders], [f"ROLE{self.approver.id}"])

    def test_method_and_input_validation(self):
        formula, revision = self.ready_formula()
        url = self.rev_url(formula, revision, "approve/")
        self.assertEqual(self.client_.get(url, **tf.bearer(self.approver_token)).status_code, 405)
        self.assertEqual(self.approve(formula, revision, payload={}).status_code, 400)
        self.assertEqual(self.approve(formula, revision, payload={"expected_version": 0}).status_code, 400)
        self.assertEqual(self.approve(formula, revision, payload={"expected_version": "x"}).status_code, 400)
        for extra in ("status", "approved_by", "approved_at", "policy", "lines", "version", "company"):
            response = self.approve(formula, revision, payload={"expected_version": revision["version"], extra: 1})
            self.assertEqual(response.status_code, 400, extra)
        self.assertEqual(FormulaRevision.objects.get(pk=revision["id"]).status, "SUBMITTED")


class ApprovalCommandTests(ApprovalBase):
    def test_successful_approval_records_everything_atomically(self):
        formula, revision = self.ready_formula(allow_self_approval=False)
        lines_before = list(FormulaLine.objects.filter(revision_id=revision["id"]).order_by("id").values())
        response = self.approve(formula, revision)
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(body["status"], "APPROVED")
        self.assertEqual(body["version"], revision["version"] + 1)
        self.assertEqual(body["approved_by_id"], self.approver.id)
        self.assertIsNotNone(body["approved_at"])
        self.assertEqual(body["approval_policy_version"], 1)
        self.assertFalse(body["approval_policy_snapshot"]["allow_self_approval"])
        self.assertEqual(body["approved_identity_snapshot"]["formula_code"], "F-001")
        self.assertEqual(body["approved_identity_snapshot"]["product_code"], "P1")
        self.assertEqual(len(body["lines"]), 2)
        stored = FormulaRevision.objects.get(pk=revision["id"])
        self.assertEqual(stored.status, "APPROVED")
        self.assertEqual(list(FormulaLine.objects.filter(revision_id=revision["id"]).order_by("id").values()), lines_before)
        self.assertEqual(self.audit_count("formula_revision.approved", revision["id"]), 1)
        # approval never touches the formula master or creates other revisions
        self.assertEqual(Formula.objects.get(pk=formula["id"]).version, 1)
        self.assertEqual(FormulaRevision.objects.filter(formula_id=formula["id"]).count(), 1)

    def test_stale_expected_version_is_409_and_changes_nothing(self):
        formula, revision = self.ready_formula()
        response = self.approve(formula, revision, version=revision["version"] - 1)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(FormulaRevision.objects.get(pk=revision["id"]).status, "SUBMITTED")
        self.assertEqual(self.audit_count("formula_revision.approved"), 0)

    def test_repeat_at_the_current_version_is_a_noop(self):
        formula, revision = self.ready_formula()
        first = self.approve(formula, revision).json()
        events = AuditLog.objects.count()
        again = self.approve(formula, revision, version=first["version"])
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.json()["approved_at"], first["approved_at"])
        self.assertEqual(again.json()["version"], first["version"])
        self.assertEqual(AuditLog.objects.count(), events)
        # the original (now stale) version conflicts
        self.assertEqual(self.approve(formula, revision, version=revision["version"]).status_code, 409)

    def test_repeat_is_not_reassessed_under_a_later_policy_or_master_change(self):
        formula, revision = self.ready_formula()
        first = self.approve(formula, revision).json()
        FormulaApprovalPolicy.objects.filter(company=self.company).update(allow_self_approval=None)
        Material.objects.filter(pk=self.raw.pk).update(is_active=False)
        again = self.approve(formula, revision, version=first["version"])
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.json()["approval_policy_version"], 1)

    def test_repeat_still_requires_authority(self):
        formula, revision = self.ready_formula()
        first = self.approve(formula, revision).json()
        response = self.approve(formula, revision, version=first["version"], token=self.token)
        self.assertEqual(response.status_code, 403)

    def test_policy_missing_or_unanswered_blocks_with_the_named_code(self):
        formula, revision = self.formula_with_lines()
        revision = self.submit_rev(formula, revision).json()
        for setup in (lambda: None, lambda: self.set_policy(allow_self_approval=None)):
            setup()
            response = self.approve(formula, revision)
            self.assertEqual(response.status_code, 400, response.content)
            self.assertEqual(response.json()["code"], "formula_approval_policy_not_configured")
            self.assertEqual(response.json()["blocking_reasons"][0]["category"], "POLICY_NOT_CONFIGURED")
        self.assertEqual(FormulaRevision.objects.get(pk=revision["id"]).status, "SUBMITTED")
        self.assertEqual(self.audit_count("formula_revision.approved"), 0)

    def test_self_approval_prohibited_by_policy(self):
        formula, revision = self.ready_formula(allow_self_approval=False)
        self.extend_grant(self.user, "formulas.approve")
        response = self.approve(formula, revision, token=self.token)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.codes(response), ["SELF_APPROVAL_NOT_ALLOWED"])
        self.assertEqual(response.json()["blocking_reasons"][0]["category"], "POLICY_RULE")
        # somebody who never touched it can approve
        self.assertEqual(self.approve(formula, revision).status_code, 200)

    def test_self_approval_allowed_by_policy(self):
        formula, revision = self.ready_formula(allow_self_approval=True)
        self.extend_grant(self.user, "formulas.approve")
        response = self.approve(formula, revision, token=self.token)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(response.json()["approval_policy_snapshot"]["allow_self_approval"])

    def test_an_editor_becomes_a_contributor_but_metadata_and_noops_do_not(self):
        formula, revision = self.formula_with_lines()
        self.set_policy(allow_self_approval=False)
        editor = tf.make_user("substantive")
        tf.grant(self.superuser, editor, self.company, "formulas.view", "formulas.edit", "formulas.approve")
        meta_only = tf.make_user("metaonly")
        tf.grant(self.superuser, meta_only, self.company, "formulas.view", "formulas.edit", "formulas.approve")
        noop_editor = tf.make_user("noopeditor")
        tf.grant(self.superuser, noop_editor, self.company, "formulas.view", "formulas.edit", "formulas.approve")

        # formula-master metadata is not a content edit
        response = tf.patch_json(
            self.client_, tf.formula_url(self.company.id, formula["id"]),
            {"expected_version": 1, "name": "Renamed"}, tf.token_for(meta_only),
        )
        self.assertEqual(response.status_code, 200)
        # a no-op revision update adds nobody
        response = tf.patch_json(
            self.client_, tf.revision_url(self.company.id, formula["id"], revision["id"]),
            {"expected_version": revision["version"], "notes": revision["notes"]}, tf.token_for(noop_editor),
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["version"], revision["version"])
        # a real notes change makes the editor a contributor
        response = tf.patch_json(
            self.client_, tf.revision_url(self.company.id, formula["id"], revision["id"]),
            {"expected_version": revision["version"], "notes": "changed"}, tf.token_for(editor),
        )
        self.assertEqual(response.status_code, 200, response.content)
        new_version = response.json()["version"]
        contributors = set(FormulaRevisionContributor.objects.filter(revision_id=revision["id"]).values_list("user__username", flat=True))
        self.assertEqual(contributors, {self.user.username, "substantive"})
        submitted = self.submit_rev(formula, revision, version=new_version)
        self.assertEqual(submitted.status_code, 200, submitted.content)
        new_version = submitted.json()["version"]
        for user in (meta_only, noop_editor):
            ok = self.approve(formula, revision, version=new_version, token=tf.token_for(user))
            self.assertEqual(ok.status_code, 200, ok.content)
            break
        formula2, revision2 = self.formula_with_lines_named("g-002")
        edited2 = tf.patch_json(
            self.client_, tf.revision_url(self.company.id, formula2["id"], revision2["id"]),
            {"expected_version": revision2["version"], "notes": "x"}, tf.token_for(editor),
        )
        submitted2 = self.submit_rev(formula2, revision2, version=edited2.json()["version"])
        self.assertEqual(submitted2.status_code, 200, submitted2.content)
        blocked = self.approve(formula2, revision2, version=submitted2.json()["version"], token=tf.token_for(editor))
        self.assertEqual(self.codes(blocked), ["SELF_APPROVAL_NOT_ALLOWED"])

    def formula_with_lines_named(self, code):
        formula = self.make_formula(code=code)
        revision = formula["revisions"][0]
        response = self.edit_rev(formula, revision, {"expected_version": 1, "lines": [self.line(), self.line(self.pack, "10")]})
        return formula, response.json()

    def test_every_kind_of_content_edit_registers_the_editor(self):
        for label, payload in (
            ("base", {"base_output_quantity": "250"}),
            ("notes", {"notes": "n"}),
            ("lines", {"lines": [self.line(self.raw2, "3")]}),
        ):
            formula = self.make_formula(code=f"c-{label}")
            revision = formula["revisions"][0]
            editor = tf.make_user(f"ed{label}")
            tf.grant(self.superuser, editor, self.company, "formulas.view", "formulas.edit")
            response = tf.patch_json(
                self.client_, tf.revision_url(self.company.id, formula["id"], revision["id"]),
                {"expected_version": 1, **payload}, tf.token_for(editor),
            )
            self.assertEqual(response.status_code, 200, (label, response.content))
            self.assertTrue(FormulaRevisionContributor.objects.filter(revision_id=revision["id"], user=editor).exists(), label)

    def test_new_revisions_track_their_creator_and_are_empty_drafts(self):
        formula, revision = self.ready_formula()
        creator2 = tf.make_user("rev2creator")
        tf.grant(self.superuser, creator2, self.company, "formulas.view", "formulas.create")
        response = tf.post_json(
            self.client_, tf.revisions_url(self.company.id, formula["id"]), {"base_output_quantity": "10"}, tf.token_for(creator2)
        )
        self.assertEqual(response.status_code, 201)
        new = response.json()
        self.assertEqual((new["status"], new["lines"]), ("DRAFT", []))
        stored = FormulaRevision.objects.get(pk=new["id"])
        self.assertTrue(stored.contributor_history_complete)
        self.assertEqual(
            list(FormulaRevisionContributor.objects.filter(revision=stored).values_list("user_id", flat=True)), [creator2.id]
        )

    def test_legacy_incomplete_history_fails_closed_only_when_self_approval_is_prohibited(self):
        formula, revision = self.formula_with_lines()
        revision = self.submit_rev(formula, revision).json()
        FormulaRevision.objects.filter(pk=revision["id"]).update(contributor_history_complete=False)
        self.set_policy(allow_self_approval=False)
        response = self.approve(formula, revision)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.codes(response), ["CONTRIBUTOR_HISTORY_INCOMPLETE"])
        self.set_policy(allow_self_approval=True)
        self.assertEqual(self.approve(formula, revision).status_code, 200)

    def test_eligibility_blockers(self):
        self.set_policy()
        empty = self.make_formula(code="empty")
        # An empty revision can never even be submitted (submit_formula_revision
        # itself requires at least one line), so it always also carries
        # REVISION_NOT_SUBMITTED alongside EMPTY_REVISION - there is no way to
        # isolate EMPTY_REVISION on its own anymore.
        response = self.approve(empty, empty["revisions"][0])
        self.assertEqual(sorted(self.codes(response)), ["EMPTY_REVISION", "REVISION_NOT_SUBMITTED"])
        self.assertEqual(
            {r["code"]: r["category"] for r in response.json()["blocking_reasons"]}["EMPTY_REVISION"], "ELIGIBILITY"
        )

        formula, revision = self.formula_with_lines()
        revision = self.submit_rev(formula, revision).json()
        Material.objects.filter(pk=self.raw.pk).update(is_active=False)
        self.assertEqual(self.codes(self.approve(formula, revision)), ["INACTIVE_MATERIAL"])
        Material.objects.filter(pk=self.raw.pk).update(is_active=True)
        Product.objects.filter(pk=self.product.pk).update(is_active=False)
        self.assertEqual(self.codes(self.approve(formula, revision)), ["INACTIVE_PRODUCT"])
        Product.objects.filter(pk=self.product.pk).update(is_active=True)
        UnitOfMeasure.objects.filter(pk=self.count_unit.pk).update(is_active=False)
        self.assertEqual(
            sorted(self.codes(self.approve(formula, revision))), ["INACTIVE_OUTPUT_UNIT", "INACTIVE_UNIT"]
        )
        UnitOfMeasure.objects.filter(pk=self.count_unit.pk).update(is_active=True)
        self.assertEqual(self.approve(formula, revision).status_code, 200)

    def test_output_unit_independent_of_product_sales_unit_is_approvable(self):
        """Task 12B-2: approval no longer requires `output_uom == product.
        sales_uom` - a product sold in bottles (self.count_unit, COUNT) with
        a formula manufactured in kilograms (self.mass_unit, MASS) is a
        legitimate, approvable combination now.
        """
        self.set_policy()
        formula = self.make_formula(code="INDEPUNIT", output_uom_id=self.mass_unit.id)
        revision = self.edit_rev(
            formula, formula["revisions"][0], {"expected_version": 1, "lines": [self.line(self.raw, "4")]}
        ).json()
        self.assertNotEqual(revision["output_uom_id"], self.product.sales_uom_id)
        revision = self.submit_rev(formula, revision).json()
        response = self.approve(formula, revision)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["output_uom_id"], self.mass_unit.id)

    def test_inconsistent_product_company_still_blocks_approval(self):
        """The remaining half of the old combined check - product/formula
        company consistency - is unaffected by the unit relaxation.
        """
        formula, revision = self.formula_with_lines()
        revision = self.submit_rev(formula, revision).json()
        self.set_policy()
        other_company_product = tf.make_product(self.other_company, "OTHERCO", self.count_unit, self.superuser)
        # Force an inconsistent state directly (never reachable through the
        # ordinary API, which keeps formula.product fixed at creation) to
        # verify the service-layer safeguard still fires.
        from apps.formulas.models import Formula as FormulaModel

        FormulaModel.objects.filter(pk=formula["id"]).update(product_id=other_company_product.id)
        response = self.approve(formula, revision)
        self.assertEqual(self.codes(response), ["INCONSISTENT_PRODUCT_COMPANY"])

    def test_raw_only_and_packaging_only_revisions_are_eligible(self):
        self.set_policy()
        for code, lines in (("rawonly", [self.line(self.raw, "4")]), ("packonly", [self.line(self.pack, "3")])):
            formula = self.make_formula(code=code)
            revision = self.edit_rev(formula, formula["revisions"][0], {"expected_version": 1, "lines": lines}).json()
            revision = self.submit_rev(formula, revision).json()
            self.assertEqual(self.approve(formula, revision).status_code, 200, code)

    def test_fractional_count_or_nonpositive_rows_are_blocked_by_the_shared_assessment(self):
        formula, revision = self.formula_with_lines()
        stored = FormulaRevision.objects.select_related("formula__product", "output_uom").get(pk=revision["id"])
        lines = list(FormulaLine.objects.filter(revision=stored).select_related("material__base_unit", "unit").order_by("line_number"))
        from decimal import Decimal

        lines[1].quantity = Decimal("2.5")  # COUNT unit
        lines[0].quantity = Decimal("0")
        policy = self.set_policy()
        # In-memory only (not saved) - assess_approval is a pure function over
        # whatever status it's handed, and this test is specifically about the
        # quantity-eligibility checks, isolated from the submission gate.
        stored.status = FormulaRevision.Status.SUBMITTED
        result = approval.assess_approval(
            stored, stored.formula, stored.formula.product, stored.output_uom, lines, policy,
            actor_is_contributor=False, actor_known=True,
        )
        self.assertEqual([r["code"] for r in result["blocking_reasons"]], ["INVALID_QUANTITY", "INVALID_QUANTITY"])
        stored.base_output_quantity = Decimal("0")
        result = approval.assess_approval(
            stored, stored.formula, stored.formula.product, stored.output_uom, [], policy,
            actor_is_contributor=False, actor_known=True,
        )
        self.assertEqual(sorted(r["code"] for r in result["blocking_reasons"]), ["EMPTY_REVISION", "INVALID_BASE_OUTPUT"])

    def test_multiple_approved_revisions_coexist_and_nothing_is_auto_selected(self):
        formula, revision = self.ready_formula()
        self.assertEqual(self.approve(formula, revision).status_code, 200)
        new = tf.post_json(self.client_, tf.revisions_url(self.company.id, formula["id"]), {"base_output_quantity": "50"}, self.token).json()
        self.assertEqual(new["status"], "DRAFT")
        edited = self.edit_rev(formula, new, {"expected_version": new["version"], "lines": [self.line(self.raw, "1")]}).json()
        edited = self.submit_rev(formula, edited).json()
        self.assertEqual(self.approve(formula, edited).status_code, 200)
        statuses = list(FormulaRevision.objects.filter(formula_id=formula["id"]).order_by("revision_number").values_list("status", flat=True))
        self.assertEqual(statuses, ["APPROVED", "APPROVED"])
        detail = tf.get_json(self.client_, tf.formula_url(self.company.id, formula["id"]), self.token).json()
        self.assertNotIn("current_revision", detail)
        self.assertNotIn("active_revision_id", detail)

    def test_audit_failure_rolls_back_the_whole_approval(self):
        formula, revision = self.ready_formula()
        with patch("apps.formulas.approval.record", side_effect=RuntimeError("audit down")):
            with self.assertRaises(RuntimeError):
                approve_formula_revision(
                    actor=self.approver, company_id=self.company.id, formula_id=formula["id"],
                    revision_id=revision["id"], expected_version=revision["version"],
                )
        stored = FormulaRevision.objects.get(pk=revision["id"])
        self.assertEqual((stored.status, stored.version, stored.approved_by_id, stored.approved_at), ("SUBMITTED", revision["version"], None, None))
        self.assertEqual(stored.approved_identity_snapshot, None)


class ImmutabilityTests(ApprovalBase):
    def approved(self):
        formula, revision = self.ready_formula()
        approved = self.approve(formula, revision).json()
        return formula, approved

    def test_api_edits_of_an_approved_revision_are_rejected(self):
        formula, approved = self.approved()
        for payload in (
            {"notes": "new"},
            {"base_output_quantity": "999"},
            {"lines": [self.line(self.raw, "1")]},
            {"lines": []},
        ):
            response = self.edit_rev(formula, approved, {"expected_version": approved["version"], **payload})
            self.assertEqual(response.status_code, 400, payload)
        for protected in ("status", "approved_by_id", "approved_at", "approval_policy_version"):
            self.assertEqual(self.edit_rev(formula, approved, {"expected_version": approved["version"], protected: "x"}).status_code, 400)
        self.assertEqual(self.fetch(formula, approved)["version"], approved["version"])

    def test_model_and_queryset_paths_are_guarded(self):
        formula, approved = self.approved()
        revision = FormulaRevision.objects.get(pk=approved["id"])
        revision.notes = "tamper"
        with self.assertRaises(ValidationError):
            revision.save()
        revision.refresh_from_db()
        revision.status = "DRAFT"
        with self.assertRaises(ValidationError):
            revision.save()
        with self.assertRaises(ValidationError):
            FormulaRevision.objects.get(pk=approved["id"]).delete()
        line = FormulaLine.objects.filter(revision_id=approved["id"]).first()
        line.quantity = line.quantity + 1
        with self.assertRaises(ValidationError):
            line.save()
        with self.assertRaises(ValidationError):
            FormulaLine.objects.get(pk=line.pk).delete()
        with self.assertRaises(ValidationError):
            Formula.objects.get(pk=formula["id"]).delete()
        with self.assertRaises(Exception):
            services.update_formula_revision(
                actor=self.user, revision_id=approved["id"], expected_version=approved["version"], data={"notes": "x"}
            )

    def test_formula_master_metadata_stays_editable_but_the_approved_identity_is_frozen(self):
        formula, approved = self.approved()
        response = tf.patch_json(
            self.client_, tf.formula_url(self.company.id, formula["id"]),
            {"expected_version": 1, "name": "Renamed later", "notes": "later"}, self.token,
        )
        self.assertEqual(response.status_code, 200, response.content)
        Product.objects.filter(pk=self.product.pk).update(name="Renamed product")
        detail = self.fetch(formula, approved)
        self.assertEqual(detail["approved_identity_snapshot"]["formula_name"], "Tonic formula")
        self.assertEqual(detail["approved_identity_snapshot"]["product_name"], "P1 Product")
        self.assertEqual(detail["status"], "APPROVED")

    def test_approved_revision_can_still_be_read_and_listed(self):
        formula, approved = self.approved()
        listing = tf.get_json(self.client_, tf.revisions_url(self.company.id, formula["id"]), self.token).json()
        self.assertEqual(listing[0]["status"], "APPROVED")
        self.assertEqual(listing[0]["approved_by_id"], self.approver.id)


class ApprovalPreviewTests(ApprovalBase):
    def test_access_and_read_only(self):
        formula, revision = self.ready_formula()
        url = self.rev_url(formula, revision, "approval-preview/")
        self.assertEqual(self.client_.get(url).status_code, 401)
        outsider = tf.make_user("poutsider2")
        self.assertEqual(self.review(formula, revision, token=tf.token_for(outsider)).status_code, 404)
        no_view = tf.make_user("noview")
        tf.grant(self.superuser, no_view, self.company, "formulas.approve")
        self.assertEqual(self.review(formula, revision, token=tf.token_for(no_view)).status_code, 403)
        self.assertEqual(self.review(formula, revision, token=tf.token_for(self.superuser)).status_code, 404)
        self.assertEqual(self.review(formula, revision, company_id=self.other_company.id).status_code, 404)
        self.assertEqual(tf.post_json(self.client_, url, {}, self.token).status_code, 405)
        self.assertEqual(self.review(formula, revision, token=self.token).status_code, 200)  # view is enough

    def test_preview_writes_nothing(self):
        formula, revision = self.ready_formula()
        before = (
            AuditLog.objects.count(),
            list(FormulaRevision.objects.filter(pk=revision["id"]).values()),
            FormulaRevisionContributor.objects.count(),
            FormulaApprovalPolicy.objects.count(),
        )
        self.assertEqual(self.review(formula, revision).status_code, 200)
        after = (
            AuditLog.objects.count(),
            list(FormulaRevision.objects.filter(pk=revision["id"]).values()),
            FormulaRevisionContributor.objects.count(),
            FormulaApprovalPolicy.objects.count(),
        )
        self.assertEqual(before, after)

    def test_ready_shape_and_eligibility_is_not_permission(self):
        formula, revision = self.ready_formula()
        body = self.review(formula, revision).json()
        self.assertTrue(body["eligibility"]["ready_to_attempt"])
        self.assertTrue(body["eligibility"]["actor_has_approve_permission"])
        self.assertEqual(body["eligibility"]["blocking_reasons"], [])
        # eligibility is not permission: the creator (no formulas.approve) sees the same eligibility
        # verdict shape but reports no approve permission, and being the contributor blocks under this policy
        creator_view = self.review(formula, revision, token=self.token).json()
        self.assertFalse(creator_view["eligibility"]["actor_has_approve_permission"])
        self.assertTrue(creator_view["contributors"]["requesting_user_is_contributor"])
        self.assertEqual([r["code"] for r in creator_view["eligibility"]["blocking_reasons"]], ["SELF_APPROVAL_NOT_ALLOWED"])
        self.assertEqual(body["eligibility"]["policy"]["status"], "CONFIGURED")
        self.assertTrue(body["preview"]["informational"])
        self.assertIn("does not guarantee", body["preview"]["notice"])
        self.assertEqual(len(body["lines"]), 2)
        self.assertEqual(set(body["contributors"]), {"requesting_user_is_contributor", "history_complete"})
        self.assertFalse(body["contributors"]["requesting_user_is_contributor"])
        # only the requester's own flag: no contributor list or other users' identities
        self.assertNotIn(self.approver.username, str(body))

    def test_preview_uses_the_same_reasons_as_the_command(self):
        formula, revision = self.formula_with_lines()
        revision = self.submit_rev(formula, revision).json()
        body = self.review(formula, revision).json()
        self.assertFalse(body["eligibility"]["ready_to_attempt"])
        self.assertEqual(body["eligibility"]["policy"]["status"], "NOT_CONFIGURED")
        self.assertTrue(body["eligibility"]["policy_message"])
        preview_codes = [r["code"] for r in body["eligibility"]["blocking_reasons"]]
        self.assertEqual(preview_codes, self.codes(self.approve(formula, revision)))

        self.set_policy(allow_self_approval=False)
        self.extend_grant(self.user, "formulas.approve")
        mine = self.review(formula, revision, token=self.token).json()
        self.assertTrue(mine["contributors"]["requesting_user_is_contributor"])
        self.assertEqual(
            [r["code"] for r in mine["eligibility"]["blocking_reasons"]], self.codes(self.approve(formula, revision, token=self.token))
        )
        FormulaRevision.objects.filter(pk=revision["id"]).update(contributor_history_complete=False)
        theirs = self.review(formula, revision).json()
        self.assertEqual([r["code"] for r in theirs["eligibility"]["blocking_reasons"]], ["CONTRIBUTOR_HISTORY_INCOMPLETE"])
        self.assertFalse(theirs["contributors"]["history_complete"])

    def test_approved_revision_preview(self):
        formula, revision = self.ready_formula()
        approved = self.approve(formula, revision).json()
        body = self.review(formula, approved).json()
        self.assertTrue(body["approval"]["already_approved"])
        self.assertFalse(body["eligibility"]["ready_to_attempt"])
        self.assertEqual(body["approval"]["approved_identity"]["formula_code"], "F-001")
        self.assertEqual([r["code"] for r in body["eligibility"]["blocking_reasons"]], ["REVISION_ALREADY_APPROVED"])

    def test_inconsistent_reads_yield_409_rather_than_a_torn_mix(self):
        formula, revision = self.ready_formula()
        real = approval._load_lines_with_masters

        def racing(revision_id):
            FormulaRevision.objects.filter(pk=revision_id).update(version=F("version") + 1)
            return real(revision_id)

        with patch.object(approval, "_load_lines_with_masters", side_effect=racing):
            self.assertEqual(self.review(formula, revision).status_code, 409)


class RequirementPreviewCompatibilityTests(ApprovalBase):
    def preview(self, formula, revision):
        return tf.get_json(self.client_, self.rev_url(formula, revision, "requirement-preview/?target_output_quantity=200"), self.token)

    def test_draft_and_approved_revisions_have_accurate_notices_and_identity(self):
        formula, revision = self.ready_formula()
        draft = self.preview(formula, revision).json()
        text = " ".join(draft["preview"]["notices"]).lower()
        self.assertIn("not approved", text)
        self.assertIsNone(draft["approval"]["approved_by_id"])
        self.assertIsNone(draft["approval"]["approved_identity"])
        approved = self.approve(formula, revision).json()
        tf.patch_json(self.client_, tf.formula_url(self.company.id, formula["id"]), {"expected_version": 1, "name": "Changed"}, self.token)
        body = self.preview(formula, approved).json()
        text = " ".join(body["preview"]["notices"]).lower()
        self.assertIn("approved formula revision", text)
        self.assertIn("does not authorize production", text)
        self.assertNotIn("not implemented", text)
        self.assertNotIn("draft formula revision", text)
        self.assertEqual(body["approval"]["approved_by_id"], self.approver.id)
        self.assertEqual(body["approval"]["approved_identity"]["formula_name"], "Tonic formula")
        self.assertEqual(body["formula"]["name"], "Changed")
        # arithmetic unchanged by approval: base 100, target 200 -> raw 5 => 10
        quantities = {r["material_code"]: r["required_quantity"]["value"] for r in body["lines"]}
        self.assertEqual(quantities[self.raw.code], "10")
        self.assertEqual(quantities[self.pack.code], "20")


class BackfillMigrationTests(ApprovalBase):
    """Runs the real migration function against real rows."""

    def run_backfill(self):
        module = importlib.import_module("apps.formulas.migrations.0003_backfill_revision_contributors")
        module.backfill_contributors(django_apps, None)

    def test_reliable_history_is_backfilled_and_marked_complete(self):
        formula, revision = self.formula_with_lines()
        editor = tf.make_user("legacyeditor")
        tf.grant(self.superuser, editor, self.company, "formulas.view", "formulas.edit")
        tf.patch_json(
            self.client_, tf.revision_url(self.company.id, formula["id"], revision["id"]),
            {"expected_version": revision["version"], "notes": "legacy edit"}, tf.token_for(editor),
        )
        FormulaRevisionContributor.objects.all().delete()
        FormulaRevision.objects.update(contributor_history_complete=False)
        self.run_backfill()
        users = set(FormulaRevisionContributor.objects.filter(revision_id=revision["id"]).values_list("user_id", flat=True))
        self.assertEqual(users, {self.user.id, editor.id})
        self.assertTrue(FormulaRevision.objects.get(pk=revision["id"]).contributor_history_complete)
        self.run_backfill()  # idempotent
        self.assertEqual(FormulaRevisionContributor.objects.filter(revision_id=revision["id"]).count(), 2)

    def test_unaccounted_history_stays_incomplete(self):
        formula, revision = self.formula_with_lines()
        FormulaRevisionContributor.objects.all().delete()
        # an edit whose audit event is missing: version advanced with no matching update event
        FormulaRevision.objects.filter(pk=revision["id"]).update(version=revision["version"] + 1, contributor_history_complete=True)
        self.run_backfill()
        stored = FormulaRevision.objects.get(pk=revision["id"])
        self.assertFalse(stored.contributor_history_complete)
        # the creator is still registered, but nobody is ever inferred as "complete"
        self.assertTrue(FormulaRevisionContributor.objects.filter(revision=stored, user=self.user).exists())

    def test_missing_creation_event_stays_incomplete(self):
        formula, revision = self.formula_with_lines()
        AuditLog.objects.filter(action="formula.created", target_id=formula["id"]).delete()
        self.run_backfill()
        self.assertFalse(FormulaRevision.objects.get(pk=revision["id"]).contributor_history_complete)

    def test_backfill_does_not_change_content_or_audit(self):
        formula, revision = self.formula_with_lines()
        before_lines = list(FormulaLine.objects.filter(revision_id=revision["id"]).order_by("id").values())
        events = AuditLog.objects.count()
        self.run_backfill()
        self.assertEqual(list(FormulaLine.objects.filter(revision_id=revision["id"]).order_by("id").values()), before_lines)
        self.assertEqual(AuditLog.objects.count(), events)
        self.assertEqual(FormulaRevision.objects.get(pk=revision["id"]).status, "DRAFT")


class ApprovalConcurrencyTests(TransactionTestCase):
    serialized_rollback = True

    def _setup(self, suffix):
        superuser = tf.make_superuser(f"apadmin{suffix}")
        creator = tf.make_user(f"apcreator{suffix}")
        approver = tf.make_user(f"apapprover{suffix}")
        company = tf.make_company(f"AP{suffix}")
        count_unit = tf.make_unit(f"APB{suffix}", "COUNT")
        mass_unit = tf.make_unit(f"APK{suffix}", "MASS")
        product = tf.make_product(company, "P1", count_unit, superuser)
        raw = tf.make_material(f"APR{suffix}", "RAW_MATERIAL", mass_unit)
        tf.grant(superuser, creator, company, "formulas.view", "formulas.create", "formulas.edit", "formulas.submit")
        tf.grant(superuser, approver, company, "formulas.view", "formulas.approve")
        FormulaApprovalPolicy.objects.create(company=company, allow_self_approval=False, created_by=superuser, updated_by=superuser)
        formula = services.create_formula(
            actor=creator, company=company, product_id=product.id, code="F1", name="F", base_output_quantity=Decimal("10")
        )
        revision = formula.revisions.get()
        services.update_formula_revision(
            actor=creator, revision_id=revision.id, expected_version=1,
            data={"lines": [{"material_id": raw.id, "quantity": Decimal("2")}]},
        )
        # Direct ORM shortcut straight to SUBMITTED (skips the real submit
        # endpoint/permission on purpose) - these tests are about locking/
        # race behaviour around approve_formula_revision itself, not the
        # submit step, and every test in this class already hardcodes
        # expected_version=2 (the version right after the line update
        # above); going through the real submit call would bump it to 3
        # and require rewriting every one of those. Deliberately does NOT
        # bump version, so expected_version=2 stays correct everywhere.
        FormulaRevision.objects.filter(pk=revision.id).update(
            status=FormulaRevision.Status.SUBMITTED, submitted_by=creator, submitted_at=timezone.now()
        )
        return dict(superuser=superuser, creator=creator, approver=approver, company=company, product=product,
                    raw=raw, mass_unit=mass_unit, count_unit=count_unit, formula=formula, revision_id=revision.id)

    def _submit_call(self, ctx, results, key="submit", version=2):
        def run():
            try:
                submit_formula_revision(
                    actor=ctx["creator"], company_id=ctx["company"].id, formula_id=ctx["formula"].id,
                    revision_id=ctx["revision_id"], expected_version=version,
                )
                results[key] = "ok"
            except Conflict:
                results[key] = "conflict"
            except Exception as exc:  # noqa: BLE001 - reported through the assertion
                results[key] = exc
            finally:
                connection.close()

        return run

    def _approve_call(self, ctx, results, key="approve", version=2):
        def run():
            try:
                approve_formula_revision(
                    actor=ctx["approver"], company_id=ctx["company"].id, formula_id=ctx["formula"].id,
                    revision_id=ctx["revision_id"], expected_version=version,
                )
                results[key] = "ok"
            except Conflict:
                results[key] = "conflict"
            except Exception as exc:  # noqa: BLE001 - reported through the assertion
                results[key] = exc
            finally:
                connection.close()

        return run

    def _paused_approve(self, ctx, inside, release, results):
        original = approval.assess_approval

        def slow(*args, **kwargs):
            inside.set()
            release.wait(timeout=20)
            return original(*args, **kwargs)

        inner = self._approve_call(ctx, results)

        def run():
            with patch.object(approval, "assess_approval", side_effect=slow):
                inner()

        return run

    def test_concurrent_approvals_produce_one_transition(self):
        ctx = self._setup("A")
        results = {}
        barrier = threading.Barrier(2)

        def caller(key):
            body = self._approve_call(ctx, results, key)

            def run():
                barrier.wait(timeout=5)
                body()

            return run

        threads = [threading.Thread(target=caller("a")), threading.Thread(target=caller("b"))]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        # the loser either conflicts (arrived at the stale version) or is an idempotent repeat: never two transitions
        self.assertTrue(all(v in ("ok", "conflict") for v in results.values()), results)
        self.assertEqual(AuditLog.objects.filter(action="formula_revision.approved").count(), 1)
        stored = FormulaRevision.objects.get(pk=ctx["revision_id"])
        self.assertEqual((stored.status, stored.version), ("APPROVED", 3))

    def test_submit_versus_edit_race_has_one_winner_and_no_partial_update(self):
        # _setup() pre-submits the revision (SUBMITTED) so every other
        # ApprovalConcurrencyTests method can call approve_formula_revision
        # directly at expected_version=2. This test is about the EARLIER
        # race - an edit versus a submit, both still against a DRAFT
        # revision at version 2 - so it reverts that one setup step
        # without touching the version, keeping expected_version=2 valid
        # for both sides of the race below.
        ctx = self._setup("B")
        FormulaRevision.objects.filter(pk=ctx["revision_id"]).update(
            status=FormulaRevision.Status.DRAFT, submitted_by=None, submitted_at=None
        )
        results = {}
        barrier = threading.Barrier(2)
        submit = self._submit_call(ctx, results, key="submit")

        def edit():
            try:
                barrier.wait(timeout=5)
                services.update_formula_revision(
                    actor=ctx["creator"], revision_id=ctx["revision_id"], expected_version=2, data={"notes": "edited"}
                )
                results["edit"] = "ok"
            except Conflict:
                results["edit"] = "conflict"
            except Exception as exc:  # noqa: BLE001
                results["edit"] = exc
            finally:
                connection.close()

        def submit_after_barrier():
            barrier.wait(timeout=5)
            submit()

        threads = [threading.Thread(target=edit), threading.Thread(target=submit_after_barrier)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        self.assertEqual(sorted(results.values(), key=str), ["conflict", "ok"], results)
        stored = FormulaRevision.objects.get(pk=ctx["revision_id"])
        self.assertEqual(stored.version, 3)
        if results["submit"] == "ok":
            self.assertEqual((stored.status, stored.notes), ("SUBMITTED", ""))
        else:
            self.assertEqual((stored.status, stored.notes), ("DRAFT", "edited"))
            self.assertIsNone(stored.submitted_by_id)

    def test_product_deactivation_waits_for_an_in_flight_approval(self):
        ctx = self._setup("C")
        inside, release, results = threading.Event(), threading.Event(), {}
        approving = threading.Thread(target=self._paused_approve(ctx, inside, release, results))
        approving.start()
        self.assertTrue(inside.wait(timeout=20))

        def deactivate():
            try:
                Product.objects.filter(pk=ctx["product"].id).update(is_active=False)
                results["deactivate"] = "ok"
            finally:
                connection.close()

        thread = threading.Thread(target=deactivate)
        thread.start()
        thread.join(timeout=1.5)
        self.assertTrue(thread.is_alive(), "a product UPDATE must wait for the approving transaction")
        release.set()
        approving.join(timeout=30)
        thread.join(timeout=30)
        self.assertEqual(results, {"approve": "ok", "deactivate": "ok"})
        self.assertEqual(FormulaRevision.objects.get(pk=ctx["revision_id"]).status, "APPROVED")

    def test_material_and_unit_changes_wait_for_an_in_flight_approval(self):
        ctx = self._setup("D")
        inside, release, results = threading.Event(), threading.Event(), {}
        approving = threading.Thread(target=self._paused_approve(ctx, inside, release, results))
        approving.start()
        self.assertTrue(inside.wait(timeout=20))
        threads = []

        def change(model, pk, key):
            def run():
                try:
                    model.objects.filter(pk=pk).update(is_active=False)
                    results[key] = "ok"
                finally:
                    connection.close()

            return run

        for model, pk, key in ((Material, ctx["raw"].id, "material"), (UnitOfMeasure, ctx["mass_unit"].id, "unit")):
            t = threading.Thread(target=change(model, pk, key))
            t.start()
            threads.append(t)
        for t in threads:
            t.join(timeout=1.5)
            self.assertTrue(t.is_alive(), "master-data changes must wait for the approving transaction")
        release.set()
        approving.join(timeout=30)
        for t in threads:
            t.join(timeout=30)
        self.assertEqual(results, {"approve": "ok", "material": "ok", "unit": "ok"})

    def test_policy_change_waits_and_the_revision_records_the_policy_it_used(self):
        ctx = self._setup("E")
        inside, release, results = threading.Event(), threading.Event(), {}
        approving = threading.Thread(target=self._paused_approve(ctx, inside, release, results))
        approving.start()
        self.assertTrue(inside.wait(timeout=20))

        def change():
            try:
                update_approval_policy(
                    actor=ctx["superuser"], company=ctx["company"], expected_version=1, data={"allow_self_approval": True}
                )
                results["policy"] = "ok"
            except Exception as exc:  # noqa: BLE001
                results["policy"] = exc
            finally:
                connection.close()

        thread = threading.Thread(target=change)
        thread.start()
        thread.join(timeout=1.5)
        self.assertTrue(thread.is_alive(), "a policy update must wait for the in-flight approval")
        release.set()
        approving.join(timeout=30)
        thread.join(timeout=30)
        self.assertEqual(results, {"approve": "ok", "policy": "ok"})
        stored = FormulaRevision.objects.get(pk=ctx["revision_id"])
        self.assertEqual(stored.approval_policy_version, 1)
        self.assertFalse(stored.approval_policy_snapshot["allow_self_approval"])
        self.assertEqual(FormulaApprovalPolicy.objects.get(company=ctx["company"]).version, 2)

    def test_a_committed_deactivation_is_seen_by_the_next_approval(self):
        ctx = self._setup("F")
        Material.objects.filter(pk=ctx["raw"].id).update(is_active=False)
        with self.assertRaises(ApprovalBlocked) as raised:
            approve_formula_revision(
                actor=ctx["approver"], company_id=ctx["company"].id, formula_id=ctx["formula"].id,
                revision_id=ctx["revision_id"], expected_version=2,
            )
        self.assertEqual([r["code"] for r in raised.exception.detail["blocking_reasons"]], ["INACTIVE_MATERIAL"])

    def test_concurrent_policy_creation_has_one_winner(self):
        ctx = self._setup("G")
        FormulaApprovalPolicy.objects.all().delete()
        outcomes = []
        barrier = threading.Barrier(2)

        def create():
            try:
                barrier.wait(timeout=5)
                update_approval_policy(
                    actor=ctx["superuser"], company=ctx["company"], expected_version=0, data={"allow_self_approval": True}
                )
                outcomes.append("ok")
            except Conflict:
                outcomes.append("conflict")
            finally:
                connection.close()

        threads = [threading.Thread(target=create), threading.Thread(target=create)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        self.assertEqual(sorted(outcomes), ["conflict", "ok"])
        self.assertEqual(FormulaApprovalPolicy.objects.filter(company=ctx["company"]).count(), 1)
