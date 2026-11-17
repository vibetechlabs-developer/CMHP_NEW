import datetime
import io
import itertools
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from apps.batch_plans import numbering as bn
from apps.batch_plans.models import BatchPlan
from apps.batch_plans.services import create_batch_plan
from apps.bmr.models import BMRDocumentAttachment
from apps.catalog.models import Material, UnitOfMeasure
from apps.companies.models import Company
from apps.customers.models import Customer
from apps.formulas.models import Formula, FormulaLine, FormulaRevision
from apps.permissions.services import create_company_role, replace_role_permissions
from apps.products.models import Product
from apps.quality.models import BatchQualityCase, BatchQualityDecision, COADocumentAttachment
from apps.quality.batch_quality_services import open_batch_quality_case
from apps.sales_orders.services import create_sales_order
from apps.users.services import assign_company_membership, assign_membership_role

User = get_user_model()
PASSWORD = "a-strong-pass-1"
_counter = itertools.count()

ALL_DOCUMENT_PERMS = (
    "batch_quality.view",
    "batch_quality.qc_decide",
    "batch_quality.qa_release",
    "batch_quality.coa_record",
    "batch_quality.coa_generate",
    "batch_quality.coa_approve",
    "batch_plans.view",
    "batch_plans.create",
    "batch_plans.edit",
    "bmr.view",
    "bmr.edit",
)


def make_user(prefix="doc_user"):
    n = next(_counter)
    return User.objects.create_user(username=f"{prefix}_{n}", email=f"{prefix}_{n}@example.com", password=PASSWORD)


def make_superuser(prefix="doc_admin"):
    n = next(_counter)
    return User.objects.create_superuser(username=f"{prefix}_{n}", email=f"{prefix}_{n}@example.com", password=PASSWORD)


def make_company(prefix="DC"):
    n = next(_counter)
    return Company.objects.create(code=f"{prefix}{n}", legal_name=f"{prefix} Pharma {n}", display_name=f"{prefix} {n}")


def grant(actor, user, company, *codes):
    membership, _ = assign_company_membership(actor=actor, user=user, company=company)
    if codes:
        role = create_company_role(actor=actor, company=company, code=f"ROLE{user.id}{company.id}{next(_counter)}", name="Role")
        replace_role_permissions(actor=actor, role=role, permission_codes=list(codes))
        assign_membership_role(actor=actor, membership=membership, role=role)
    return membership


def authed_client(user):
    c = Client()
    token = str(AccessToken.for_user(user))
    c.defaults["HTTP_AUTHORIZATION"] = f"Bearer {token}"
    return c


class DocumentManagementTests(TestCase):
    def setUp(self):
        self.admin = make_superuser("admin_doc")
        self.company = make_company("DOC")
        self.other_company = make_company("OTH")

        self.qa_user = make_user("qa_officer")
        self.staff_user = make_user("plant_staff")
        self.other_user = make_user("other_co_user")

        grant(self.admin, self.admin, self.company, *ALL_DOCUMENT_PERMS, "batch_plans.allocate_number")
        grant(self.admin, self.qa_user, self.company, *ALL_DOCUMENT_PERMS)
        grant(self.admin, self.staff_user, self.company, "batch_plans.view", "batch_quality.view", "bmr.view")
        grant(self.admin, self.other_user, self.other_company, *ALL_DOCUMENT_PERMS)

        # Units and Products
        self.uom = UnitOfMeasure.objects.create(code=f"TAB_{next(_counter)}", name="Tablets", dimension=UnitOfMeasure.Dimension.COUNT)
        self.product = Product.objects.create(
            company=self.company, code=f"PRD_{next(_counter)}", name="Paracetamol 500mg", sales_uom=self.uom, created_by=self.admin
        )

        # Formula
        self.formula = Formula.objects.create(
            company=self.company, product=self.product, code=f"FOR_{next(_counter)}", name="PCM Formulation", created_by=self.admin
        )
        self.mat = Material.objects.create(code=f"MAT_{next(_counter)}", name="Paracetamol Active", kind=Material.Kind.RAW_MATERIAL, base_unit=self.uom)
        self.formula_rev = FormulaRevision.objects.create(
            formula=self.formula,
            revision_number=1,
            output_uom=self.uom,
            base_output_quantity=Decimal("1000.000"),
            status=FormulaRevision.Status.DRAFT,
            created_by=self.admin,
        )
        FormulaLine.objects.create(
            revision=self.formula_rev, line_number=1, material=self.mat, quantity=Decimal("500.000"), unit=self.uom
        )
        self.formula_rev.status = FormulaRevision.Status.APPROVED
        self.formula_rev.approved_by = self.qa_user
        self.formula_rev.approved_at = timezone.now()
        self.formula_rev.approval_policy_version = 1
        self.formula_rev.approval_policy_snapshot = {"allow_self_approval": True}
        self.formula_rev.save()

        # Sales Order
        import datetime
        self.customer = Customer.objects.create(
            company=self.company, code=f"CUST{next(_counter)}", name="Apollo Hospital", created_by=self.admin
        )
        self.order = create_sales_order(
            actor=self.admin,
            company=self.company,
            customer_id=self.customer.id,
            order_date=datetime.date(2026, 11, 1),
            currency="INR",
            lines=[{"product_id": self.product.id, "quantity": Decimal("1000.000"), "unit_price": Decimal("2.50")}],
        )
        self.order_line = self.order.lines.first()

        # Batch Plan
        self.batch_plan = create_batch_plan(
            actor=self.admin,
            company=self.company,
            sales_order_line_id=self.order_line.id,
            formula_revision_id=self.formula_rev.id,
            target_output_quantity="1000",
        )
        self.batch_plan, self.allocation = bn.allocate_batch_number(
            actor=self.admin,
            company_id=self.company.id,
            plan_id=self.batch_plan.id,
            expected_version=self.batch_plan.version,
        )

        # Quality Case
        self.quality_case = open_batch_quality_case(
            user=self.qa_user,
            company=self.company,
            batch_plan_id=self.batch_plan.id,
        )

        self.client_qa = authed_client(self.qa_user)
        self.client_staff = authed_client(self.staff_user)
        self.client_other = authed_client(self.other_user)

    def test_upload_bmr_document(self):
        pdf_content = b"%PDF-1.4 sample BMR document content for testing"
        pdf_file = SimpleUploadedFile("Master_BMR_PCM.pdf", pdf_content, content_type="application/pdf")

        response = self.client_qa.post(
            f"/api/v1/companies/{self.company.id}/documents/bmr/",
            {
                "batch_plan_id": self.batch_plan.id,
                "document_type": "MASTER_BMR",
                "document_name": "Master Manufacturing Record",
                "bmr_number": "BMR-PCM-001",
                "file": pdf_file,
                "remarks": "Initial approved BMR",
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["document_name"], "Master Manufacturing Record")
        self.assertEqual(data["document_type"], "MASTER_BMR")
        self.assertEqual(data["batch_number"], self.quality_case.batch_number_snapshot)
        self.assertEqual(data["is_physically_attached"], True)
        self.assertEqual(data["version"], 1)

        # Check DB
        att = BMRDocumentAttachment.objects.get(pk=data["id"])
        self.assertTrue(att.is_physically_attached)
        self.assertEqual(att.sha256_checksum, data["sha256_checksum"])

    def test_bmr_duplicate_file_rejection(self):
        pdf_content = b"%PDF-1.4 duplicate check content"
        pdf_file1 = SimpleUploadedFile("BMR1.pdf", pdf_content, content_type="application/pdf")
        pdf_file2 = SimpleUploadedFile("BMR2.pdf", pdf_content, content_type="application/pdf")

        # First upload succeeds
        res1 = self.client_qa.post(
            f"/api/v1/companies/{self.company.id}/documents/bmr/",
            {"batch_plan_id": self.batch_plan.id, "document_type": "MASTER_BMR", "file": pdf_file1},
            format="multipart",
        )
        self.assertEqual(res1.status_code, 201)

        # Second upload with identical file content is rejected
        res2 = self.client_qa.post(
            f"/api/v1/companies/{self.company.id}/documents/bmr/",
            {"batch_plan_id": self.batch_plan.id, "document_type": "MASTER_BMR", "file": pdf_file2},
            format="multipart",
        )
        self.assertEqual(res2.status_code, 400)
        self.assertIn("identical file was already attached", str(res2.json()))

    def test_upload_coa_document_starts_pending_approval(self):
        coa_pdf = SimpleUploadedFile("COA_Batch01.pdf", b"%PDF-1.4 test COA certificate", content_type="application/pdf")

        response = self.client_qa.post(
            f"/api/v1/companies/{self.company.id}/documents/coa/",
            {
                "quality_case_id": self.quality_case.id,
                "coa_number": "COA-2026-0042",
                "document_name": "Release Certificate of Analysis",
                "qc_reference": "QC-LAB-992",
                "file": coa_pdf,
                "remarks": "Completed laboratory analytical tests",
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["coa_number"], "COA-2026-0042")
        self.assertEqual(data["status"], "PENDING_APPROVAL")
        self.assertEqual(data["is_physically_attached"], True)

        # Ensure uploading does NOT automatically approve
        coa = COADocumentAttachment.objects.get(pk=data["id"])
        self.assertEqual(coa.status, COADocumentAttachment.Status.PENDING_APPROVAL)
        self.assertIsNone(coa.approved_by)

    def test_coa_approval_workflow_and_audit(self):
        coa_pdf = SimpleUploadedFile("COA_Approve.pdf", b"%PDF-1.4 test approve COA", content_type="application/pdf")

        # Upload
        res_upload = self.client_qa.post(
            f"/api/v1/companies/{self.company.id}/documents/coa/",
            {"quality_case_id": self.quality_case.id, "coa_number": "COA-APP-01", "file": coa_pdf},
            format="multipart",
        )
        coa_id = res_upload.json()["id"]

        # Staff without approval permission cannot approve
        res_fail = self.client_staff.post(
            f"/api/v1/companies/{self.company.id}/documents/coa/{coa_id}/approve/",
            {"remarks": "Unauthorized attempt"},
        )
        self.assertEqual(res_fail.status_code, 403)

        # Authorized QA approves
        res_approve = self.client_qa.post(
            f"/api/v1/companies/{self.company.id}/documents/coa/{coa_id}/approve/",
            {"remarks": "Verified analytical results conform to IP/BP specs"},
        )
        self.assertEqual(res_approve.status_code, 200)
        data = res_approve.json()
        self.assertEqual(data["status"], "APPROVED")
        self.assertEqual(data["approved_by_id"], self.qa_user.id)

        # Verify BatchQualityCase is updated and decision logged
        self.quality_case.refresh_from_db()
        self.assertEqual(self.quality_case.coa_status, "APPROVED")
        self.assertEqual(self.quality_case.coa_document_reference, "COA-APP-01")

        dec = BatchQualityDecision.objects.filter(
            quality_case=self.quality_case,
            decision_type=BatchQualityDecision.DecisionType.COA,
            outcome=BatchQualityDecision.Outcome.APPROVED,
        ).first()
        self.assertIsNotNone(dec)
        self.assertEqual(dec.decided_by, self.qa_user)

    def test_coa_rejection_workflow(self):
        coa_pdf = SimpleUploadedFile("COA_Reject.pdf", b"%PDF-1.4 test reject COA", content_type="application/pdf")

        res_upload = self.client_qa.post(
            f"/api/v1/companies/{self.company.id}/documents/coa/",
            {"quality_case_id": self.quality_case.id, "coa_number": "COA-REJ-01", "file": coa_pdf},
            format="multipart",
        )
        coa_id = res_upload.json()["id"]

        # Reject requires reason
        res_empty = self.client_qa.post(
            f"/api/v1/companies/{self.company.id}/documents/coa/{coa_id}/reject/",
            {"reason": ""},
        )
        self.assertEqual(res_empty.status_code, 400)

        # Reject with reason
        res_rej = self.client_qa.post(
            f"/api/v1/companies/{self.company.id}/documents/coa/{coa_id}/reject/",
            {"reason": "Assay percentage below acceptable limit (89.2% vs required 95.0%)"},
        )
        self.assertEqual(res_rej.status_code, 200)
        data = res_rej.json()
        self.assertEqual(data["status"], "REJECTED")

        # Verify BatchQualityCase
        self.quality_case.refresh_from_db()
        self.assertEqual(self.quality_case.coa_status, "REJECTED")

    def test_document_download_and_preview(self):
        pdf_content = b"%PDF-1.4 stream download test"
        pdf_file = SimpleUploadedFile("BMR_Download.pdf", pdf_content, content_type="application/pdf")

        res_upload = self.client_qa.post(
            f"/api/v1/companies/{self.company.id}/documents/bmr/",
            {"batch_plan_id": self.batch_plan.id, "document_type": "MASTER_BMR", "file": pdf_file},
            format="multipart",
        )
        att_id = res_upload.json()["id"]

        # Download attachment (as_attachment=True)
        res_dl = self.client_qa.get(f"/api/v1/companies/{self.company.id}/documents/bmr/{att_id}/download/")
        self.assertEqual(res_dl.status_code, 200)
        self.assertIn("attachment", res_dl["Content-Disposition"])

        # Preview inline (as_attachment=False)
        res_prev = self.client_qa.get(f"/api/v1/companies/{self.company.id}/documents/bmr/{att_id}/download/?inline=true")
        self.assertEqual(res_prev.status_code, 200)
        self.assertIn("inline", res_prev["Content-Disposition"])

    def test_cross_company_document_access_blocked(self):
        pdf_file = SimpleUploadedFile("BMR_Sec.pdf", b"%PDF-1.4 secret", content_type="application/pdf")
        res_upload = self.client_qa.post(
            f"/api/v1/companies/{self.company.id}/documents/bmr/",
            {"batch_plan_id": self.batch_plan.id, "document_type": "MASTER_BMR", "file": pdf_file},
            format="multipart",
        )
        att_id = res_upload.json()["id"]

        # Other company user attempts access
        res_oth = self.client_other.get(f"/api/v1/companies/{self.company.id}/documents/bmr/{att_id}/")
        self.assertEqual(res_oth.status_code, 404)

        # Other company user attempts download
        res_oth_dl = self.client_other.get(f"/api/v1/companies/{self.company.id}/documents/bmr/{att_id}/download/")
        self.assertEqual(res_oth_dl.status_code, 404)

    def test_document_register_summary(self):
        # Add a BMR document
        pdf_file = SimpleUploadedFile("BMR_Sum.pdf", b"%PDF-1.4 summary test", content_type="application/pdf")
        self.client_qa.post(
            f"/api/v1/companies/{self.company.id}/documents/bmr/",
            {"batch_plan_id": self.batch_plan.id, "document_type": "MASTER_BMR", "file": pdf_file},
            format="multipart",
        )

        # Add an approved COA
        coa_file = SimpleUploadedFile("COA_Sum.pdf", b"%PDF-1.4 coa summary", content_type="application/pdf")
        res_coa = self.client_qa.post(
            f"/api/v1/companies/{self.company.id}/documents/coa/",
            {"quality_case_id": self.quality_case.id, "coa_number": "COA-SUM-1", "file": coa_file},
            format="multipart",
        )
        coa_id = res_coa.json()["id"]
        self.client_qa.post(f"/api/v1/companies/{self.company.id}/documents/coa/{coa_id}/approve/", {"remarks": "OK"})

        # Fetch summary
        res_sum = self.client_qa.get(f"/api/v1/companies/{self.company.id}/documents/summary/")
        self.assertEqual(res_sum.status_code, 200)
        data = res_sum.json()
        self.assertEqual(data["bmr"]["total_batches"], 1)
        self.assertEqual(data["bmr"]["total_bmr_documents"], 1)
        self.assertEqual(data["bmr"]["fully_attached_batches"], 1)
        self.assertEqual(data["coa"]["approved_coas"], 1)
        self.assertEqual(data["coa"]["actual_coa_files_attached"], 1)
        self.assertEqual(data["overall_completion_percentage"], 100.0)
