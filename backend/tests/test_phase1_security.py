import json
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.audit.models import AuditLog
from apps.bmr.models import BMRDocument, ProductionOrderStatus
from apps.companies.models import Company
from apps.permissions.services import create_company_role, replace_role_permissions
from apps.quality.models import BatchQualityCase, BatchQualityDecision
from apps.users.services import assign_company_membership, assign_membership_role

User = get_user_model()
PASSWORD = "TestPassword@123"


def bearer(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


class Phase1SecurityAndIsolationTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.admin = User.objects.create_superuser(
            username="phase1_admin", email="admin@example.com", password=PASSWORD
        )

        # Company 1: CMHP (Simulated)
        self.cmhp = Company.objects.create(code="CMHP_TEST", legal_name="CMHP Pvt Ltd")
        # Company 2: Tej Biocare (Simulated)
        self.tej = Company.objects.create(code="TEJ_TEST", legal_name="Tej Biocare")
        # Company 3: Unrelated Company
        self.other = Company.objects.create(code="OTHER_CO", legal_name="Other Pharma")

        # Users
        self.cmhp_prod_user = User.objects.create_user(
            username="cmhp_prod", email="cmhp_prod@example.com", password=PASSWORD
        )
        self.cmhp_qa_user = User.objects.create_user(
            username="cmhp_qa", email="cmhp_qa@example.com", password=PASSWORD
        )
        self.tej_user = User.objects.create_user(
            username="tej_user", email="tej@example.com", password=PASSWORD
        )
        self.unauthorized_user = User.objects.create_user(
            username="outsider", email="outsider@example.com", password=PASSWORD
        )

        # Assign CMHP memberships and roles
        m1, _ = assign_company_membership(actor=self.admin, user=self.cmhp_prod_user, company=self.cmhp)
        role_prod = create_company_role(actor=self.admin, company=self.cmhp, code="PROD_ROLE", name="Production Role")
        replace_role_permissions(actor=self.admin, role=role_prod, permission_codes=["bmr.view", "bmr.edit", "bmr.create", "batch_plans.view", "batch_plans.edit"])
        assign_membership_role(actor=self.admin, membership=m1, role=role_prod)

        m2, _ = assign_company_membership(actor=self.admin, user=self.cmhp_qa_user, company=self.cmhp)
        role_qa = create_company_role(actor=self.admin, company=self.cmhp, code="QA_ROLE", name="QA Role")
        replace_role_permissions(actor=self.admin, role=role_qa, permission_codes=["batch_quality.qa_release", "batch_quality.view", "bmr.view"])
        assign_membership_role(actor=self.admin, membership=m2, role=role_qa)

        # Assign Tej membership
        m3, _ = assign_company_membership(actor=self.admin, user=self.tej_user, company=self.tej)
        role_tej = create_company_role(actor=self.admin, company=self.tej, code="TEJ_ROLE", name="Tej Full Role")
        replace_role_permissions(actor=self.admin, role=role_tej, permission_codes=["bmr.view", "bmr.edit", "bmr.create", "batch_plans.view", "batch_plans.edit"])
        assign_membership_role(actor=self.admin, membership=m3, role=role_tej)

        # Pre-seed records
        self.cmhp_bmr = BMRDocument.objects.create(
            company=self.cmhp,
            order_id="ORD-CMHP-101",
            batch_no="BAT-CMHP-001",
            bmr_type="drops",
            data={"sections": ["data_cmhp"]},
            is_draft=False,
        )
        self.tej_bmr = BMRDocument.objects.create(
            company=self.tej,
            order_id="ORD-TEJ-202",
            batch_no="BAT-TEJ-002",
            bmr_type="syrup",
            data={"sections": ["data_tej"]},
            is_draft=False,
        )

        self.cmhp_status = ProductionOrderStatus.objects.create(
            company=self.cmhp,
            order_id="ORD-CMHP-101",
            order_reference="SO-CMHP-101",
            batch_no="BAT-CMHP-001",
            bmr_status="YES",
            production_status="In Progress",
            packaging_status="Pending",
            dispatch_status="NO",
            qa_status="Pending",
        )

    # =========================================================================
    # STEP 2 & 5: AUTHENTICATION & PERMISSIONS ENFORCEMENT
    # =========================================================================

    def test_unauthenticated_bmr_document_list_returns_401(self):
        """Unauthenticated requests to BMR document endpoints must be rejected."""
        url = f"/api/v1/companies/{self.cmhp.id}/bmr-documents/"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 401)

    def test_unauthenticated_bmr_document_detail_returns_401(self):
        url = f"/api/v1/companies/{self.cmhp.id}/bmr-documents/ORD-CMHP-101/"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 401)

    def test_unauthenticated_production_status_list_returns_401(self):
        """Unauthenticated requests to production status list must be rejected."""
        url = f"/api/v1/companies/{self.cmhp.id}/production-statuses/"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 401)

    def test_unauthenticated_production_status_patch_returns_401(self):
        url = f"/api/v1/companies/{self.cmhp.id}/production-statuses/ORD-CMHP-101/"
        resp = self.client.patch(url, data=json.dumps({"production_status": "Completed"}), content_type="application/json")
        self.assertEqual(resp.status_code, 401)

    def test_user_without_bmr_view_permission_is_denied_403(self):
        """A user belonging to the company but without bmr.view is rejected with 403."""
        no_perm_user = User.objects.create_user(username="no_perm", email="no_perm@example.com", password=PASSWORD)
        assign_company_membership(actor=self.admin, user=no_perm_user, company=self.cmhp)
        url = f"/api/v1/companies/{self.cmhp.id}/bmr-documents/"
        resp = self.client.get(url, **bearer(no_perm_user))
        self.assertEqual(resp.status_code, 403)

    # =========================================================================
    # STEP 3: SECURE QA BATCH RELEASE
    # =========================================================================

    def test_direct_generic_patch_of_qa_status_is_strictly_blocked(self):
        """Generic PATCH cannot directly modify qa_status (Vulnerability SEC-02 remediation)."""
        url = f"/api/v1/companies/{self.cmhp.id}/production-statuses/ORD-CMHP-101/"
        payload = {"qa_status": "RELEASED"}
        resp = self.client.patch(
            url,
            data=json.dumps(payload),
            content_type="application/json",
            **bearer(self.cmhp_prod_user),
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("qa_status", resp.json())
        self.cmhp_status.refresh_from_db()
        self.assertEqual(self.cmhp_status.qa_status, "Pending")

    def test_direct_generic_post_of_qa_status_is_strictly_blocked(self):
        """Creation / upsert endpoint also blocks direct qa_status injection."""
        url = f"/api/v1/companies/{self.cmhp.id}/production-statuses/"
        payload = {"order_id": "ORD-NEW-999", "qa_status": "RELEASED"}
        resp = self.client.post(
            url,
            data=json.dumps(payload),
            content_type="application/json",
            **bearer(self.cmhp_prod_user),
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("qa_status", resp.json())

    def test_dispatch_blocked_before_qa_release(self):
        """Setting dispatch_status to YES without prior QA release is blocked."""
        url = f"/api/v1/companies/{self.cmhp.id}/production-statuses/ORD-CMHP-101/"
        payload = {"dispatch_status": "YES"}
        resp = self.client.patch(
            url,
            data=json.dumps(payload),
            content_type="application/json",
            **bearer(self.cmhp_prod_user),
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("dispatch_status", resp.json())

    def test_unauthorized_user_cannot_call_dedicated_qa_release(self):
        """A production user lacking batch_quality.qa_release cannot perform QA release."""
        url = f"/api/v1/companies/{self.cmhp.id}/production-statuses/ORD-CMHP-101/qa-release/"
        payload = {"outcome": "RELEASED", "remarks": "Trying to bypass QA"}
        resp = self.client.post(
            url,
            data=json.dumps(payload),
            content_type="application/json",
            **bearer(self.cmhp_prod_user),
        )
        self.assertEqual(resp.status_code, 403)
        self.cmhp_status.refresh_from_db()
        self.assertEqual(self.cmhp_status.qa_status, "Pending")

    def test_authorized_qa_release_succeeds_and_creates_audit_log(self):
        """Authorized QA user successfully releases batch with audit trail."""
        url = f"/api/v1/companies/{self.cmhp.id}/production-statuses/ORD-CMHP-101/qa-release/"
        payload = {"outcome": "RELEASED", "remarks": "All release specs met"}
        resp = self.client.post(
            url,
            data=json.dumps(payload),
            content_type="application/json",
            **bearer(self.cmhp_qa_user),
        )
        self.assertEqual(resp.status_code, 200)
        self.cmhp_status.refresh_from_db()
        self.assertEqual(self.cmhp_status.qa_status, "RELEASED")
        self.assertEqual(self.cmhp_status.qa_remark, "All release specs met")

        # Verify Audit Log entry
        audit_entry = AuditLog.objects.filter(
            target_type="ProductionOrderStatus",
            target_id=self.cmhp_status.id,
            action="production_order.qa_release",
        ).first()
        self.assertIsNotNone(audit_entry)
        self.assertEqual(audit_entry.actor_id, self.cmhp_qa_user.id)
        self.assertEqual(audit_entry.after["outcome"], "RELEASED")

    # =========================================================================
    # STEP 4: MULTI-TENANT COMPANY DATA ISOLATION
    # =========================================================================

    def test_cmhp_user_can_access_cmhp_bmr_document(self):
        url = f"/api/v1/companies/{self.cmhp.id}/bmr-documents/ORD-CMHP-101/"
        resp = self.client.get(url, **bearer(self.cmhp_prod_user))
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["found"])

    def test_cmhp_user_cannot_access_tej_bmr_document_returns_404(self):
        """Cross-company isolation: CMHP user cannot read Tej Biocare BMRs by altering company_id."""
        url = f"/api/v1/companies/{self.tej.id}/bmr-documents/ORD-TEJ-202/"
        resp = self.client.get(url, **bearer(self.cmhp_prod_user))
        # Denied with 404 to prevent company enumeration
        self.assertEqual(resp.status_code, 404)

    def test_tej_user_cannot_access_cmhp_bmr_document_returns_404(self):
        """Tej user cannot read CMHP records."""
        url = f"/api/v1/companies/{self.cmhp.id}/bmr-documents/ORD-CMHP-101/"
        resp = self.client.get(url, **bearer(self.tej_user))
        self.assertEqual(resp.status_code, 404)

    def test_cmhp_user_cannot_patch_tej_production_status(self):
        """Cross-company tamper attempt rejected."""
        url = f"/api/v1/companies/{self.tej.id}/production-statuses/ORD-TEJ-202/"
        resp = self.client.patch(
            url,
            data=json.dumps({"production_status": "Malicious Change"}),
            content_type="application/json",
            **bearer(self.cmhp_prod_user),
        )
        self.assertEqual(resp.status_code, 404)

    def test_invalid_company_id_is_safely_rejected(self):
        """Non-existent company ID returns 404 without server errors."""
        url = "/api/v1/companies/999999/bmr-documents/"
        resp = self.client.get(url, **bearer(self.cmhp_prod_user))
        self.assertEqual(resp.status_code, 404)

