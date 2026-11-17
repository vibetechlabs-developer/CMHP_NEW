import datetime
import itertools
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.test import Client, TestCase
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from apps.batch_plans import numbering as bn
from apps.batch_plans.models import BatchPlan
from apps.batch_plans.services import create_batch_plan
from apps.catalog.models import Material, UnitOfMeasure
from apps.common.errors import Conflict
from apps.companies.models import Company
from apps.customers.models import Customer
from apps.formulas.models import Formula, FormulaLine, FormulaRevision
from apps.permissions.services import create_company_role, replace_role_permissions
from apps.products.models import Product
from apps.quality.models import BatchQualityCase, BatchQualityDecision
from apps.quality.batch_quality_services import (
    mark_packaging_complete,
    open_batch_quality_case,
    open_coa_case,
    record_coa_decision,
    record_packaging_decision,
    record_qa_release,
    record_qc_decision,
)
from apps.sales_orders.services import create_sales_order
from apps.users.services import assign_company_membership, assign_membership_role

User = get_user_model()
PASSWORD = "a-strong-pass-1"
_counter = itertools.count()

ALL_BATCH_QUALITY_PERMS = (
    "batch_quality.view",
    "batch_quality.qc_decide",
    "batch_quality.qa_release",
    "batch_quality.coa_record",
    "batch_quality.coa_generate",
    "batch_quality.coa_approve",
    "batch_quality.packaging_qa",
    "production.packaging_complete",
)


def make_user(prefix="user"):
    n = next(_counter)
    return User.objects.create_user(username=f"{prefix}_{n}", email=f"{prefix}_{n}@example.com", password=PASSWORD)


def make_superuser(prefix="admin"):
    n = next(_counter)
    return User.objects.create_superuser(username=f"{prefix}_{n}", email=f"{prefix}_{n}@example.com", password=PASSWORD)


def make_company(prefix="CMP"):
    n = next(_counter)
    return Company.objects.create(code=f"{prefix}{n}", legal_name=f"{prefix}{n} Pvt Ltd")


def make_unit(prefix="UOM", dimension=UnitOfMeasure.Dimension.COUNT):
    n = next(_counter)
    return UnitOfMeasure.objects.create(code=f"{prefix}{n}", name=f"{prefix}{n} Name", dimension=dimension)


def make_material(prefix="MAT", kind=Material.Kind.RAW_MATERIAL, unit=None):
    n = next(_counter)
    if unit is None:
        unit = make_unit(prefix="KG", dimension=UnitOfMeasure.Dimension.MASS)
    return Material.objects.create(code=f"{prefix}{n}", name=f"{prefix}{n} Name", kind=kind, base_unit=unit)


def make_product(company, unit, actor, prefix="PRD"):
    n = next(_counter)
    return Product.objects.create(company=company, code=f"{prefix}{n}", name=f"{prefix}{n} Product", sales_uom=unit, created_by=actor)


def make_customer(company, actor, code, prefix="CUST"):
    n = next(_counter)
    return Customer.objects.create(company=company, code=code, name=f"{prefix}{n} Customer", created_by=actor)


def bearer(user):
    return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


def grant(actor, user, company, *codes):
    membership, _ = assign_company_membership(actor=actor, user=user, company=company)
    if codes:
        role = create_company_role(actor=actor, company=company, code=f"ROLE{user.id}{company.id}{next(_counter)}", name="Role")
        replace_role_permissions(actor=actor, role=role, permission_codes=list(codes))
        assign_membership_role(actor=actor, membership=membership, role=role)
    return membership


def approve_revision_directly(revision, approver):
    revision.status = FormulaRevision.Status.APPROVED
    revision.approved_by = approver
    revision.approved_at = timezone.now()
    revision.approval_policy_version = 1
    revision.approval_policy_snapshot = {"allow_self_approval": True}
    revision.save()
    return revision


class BatchQualityTestCase(TestCase):
    def setUp(self):
        self.superuser = make_superuser("badmin")
        self.company = make_company("QCO")
        self.other_company = make_company("OTHER")
        self.unit_count = make_unit("BTL", UnitOfMeasure.Dimension.COUNT)
        self.mass_unit = make_unit("KG", UnitOfMeasure.Dimension.MASS)
        self.customer = make_customer(self.company, self.superuser, "CST")
        self.product = make_product(self.company, self.unit_count, self.superuser)
        self.raw = make_material("RAW", Material.Kind.RAW_MATERIAL, self.mass_unit)

        self.order = create_sales_order(
            actor=self.superuser,
            company=self.company,
            customer_id=self.customer.id,
            currency="INR",
            order_date=datetime.date(2026, 11, 1),
            lines=[{"product_id": self.product.id, "quantity": Decimal("100"), "unit_price": Decimal("20")}],
        )
        self.line = self.order.lines.first()

        self.formula = Formula.objects.create(
            company=self.company,
            product=self.product,
            code="F-999",
            name="Quality Test Formula",
            latest_revision_number=1,
            created_by=self.superuser,
        )
        self.revision = FormulaRevision.objects.create(
            formula=self.formula,
            revision_number=1,
            status=FormulaRevision.Status.DRAFT,
            base_output_quantity=Decimal("100.000"),
            output_uom=self.unit_count,
            created_by=self.superuser,
        )
        FormulaLine.objects.create(
            revision=self.revision,
            line_number=1,
            material=self.raw,
            quantity=Decimal("10.000"),
            unit=self.mass_unit,
            material_code_snapshot=self.raw.code,
            material_name_snapshot=self.raw.name,
            material_kind_snapshot=self.raw.kind,
            unit_code_snapshot=self.mass_unit.code,
            unit_name_snapshot=self.mass_unit.name,
        )
        approve_revision_directly(self.revision, self.superuser)

        self.plan = create_batch_plan(
            actor=self.superuser,
            company=self.company,
            sales_order_line_id=self.line.id,
            formula_revision_id=self.revision.id,
            target_output_quantity="50",
        )

        grant(self.superuser, self.superuser, self.company, "batch_plans.view", "batch_plans.allocate_number")
        self.plan, self.allocation = bn.allocate_batch_number(
            actor=self.superuser,
            company_id=self.company.id,
            plan_id=self.plan.id,
            expected_version=self.plan.version,
        )

        self.operator = make_user("qcop")
        grant(self.superuser, self.operator, self.company, *ALL_BATCH_QUALITY_PERMS)

        self.unauthorized_user = make_user("noaccess")
        grant(self.superuser, self.unauthorized_user, self.company)  # member with no perms

        self.client_ = Client()

    def test_open_case_requires_allocated_batch_number(self):
        plan_without_num = create_batch_plan(
            actor=self.superuser,
            company=self.company,
            sales_order_line_id=self.line.id,
            formula_revision_id=self.revision.id,
            target_output_quantity="20",
        )
        with self.assertRaises(DjangoValidationError):
            open_batch_quality_case(user=self.operator, company=self.company, batch_plan_id=plan_without_num.id)

    def test_open_case_success_and_unique_constraint(self):
        case = open_batch_quality_case(user=self.operator, company=self.company, batch_plan_id=self.plan.id)
        self.assertEqual(case.company, self.company)
        self.assertEqual(case.batch_number_snapshot, self.allocation.number)
        self.assertEqual(case.stage_status, BatchQualityCase.StageStatus.PENDING_QC)
        self.assertEqual(case.version, 1)

        # Cannot open a second case for the same batch plan
        with self.assertRaises(DjangoValidationError):
            open_batch_quality_case(user=self.operator, company=self.company, batch_plan_id=self.plan.id)

    def test_decision_records_cannot_be_updated_or_deleted(self):
        case = open_batch_quality_case(user=self.operator, company=self.company, batch_plan_id=self.plan.id)
        case, decision = record_qc_decision(
            user=self.operator,
            quality_case_id=case.id,
            expected_version=1,
            outcome=BatchQualityDecision.Outcome.APPROVED,
            remarks="Lab passed all parameters.",
        )
        self.assertEqual(decision.outcome, BatchQualityDecision.Outcome.APPROVED)

        # Updating decision record is forbidden
        decision.remarks = "Tampered remark"
        with self.assertRaises(DjangoValidationError):
            decision.save()

        # Deleting decision record is forbidden
        with self.assertRaises(DjangoValidationError):
            decision.delete()

    def test_concurrency_safe_expected_version(self):
        case = open_batch_quality_case(user=self.operator, company=self.company, batch_plan_id=self.plan.id)
        with self.assertRaises(Conflict):
            record_qc_decision(
                user=self.operator,
                quality_case_id=case.id,
                expected_version=999,  # Stale version
                outcome=BatchQualityDecision.Outcome.APPROVED,
            )

    def test_qa_release_safeguards_rejected_and_hold_block_release(self):
        case = open_batch_quality_case(user=self.operator, company=self.company, batch_plan_id=self.plan.id)

        # QA release while QC is still PENDING -> blocked
        with self.assertRaises(DjangoValidationError):
            record_qa_release(
                user=self.operator,
                quality_case_id=case.id,
                expected_version=case.version,
                outcome=BatchQualityDecision.Outcome.APPROVED,
            )

        # QC rejected
        case, qc_dec = record_qc_decision(
            user=self.operator,
            quality_case_id=case.id,
            expected_version=case.version,
            outcome=BatchQualityDecision.Outcome.REJECTED,
            remarks="Microbial contamination",
        )
        self.assertEqual(case.stage_status, BatchQualityCase.StageStatus.QC_REJECTED)

        # QA release while QC is REJECTED -> blocked
        with self.assertRaises(DjangoValidationError):
            record_qa_release(
                user=self.operator,
                quality_case_id=case.id,
                expected_version=case.version,
                outcome=BatchQualityDecision.Outcome.APPROVED,
            )

        # Re-evaluation: QC Approved after investigation
        case, qc_re_eval = record_qc_decision(
            user=self.operator,
            quality_case_id=case.id,
            expected_version=case.version,
            outcome=BatchQualityDecision.Outcome.APPROVED,
            remarks="Retest after resampling conforms to standard",
        )
        self.assertEqual(case.stage_status, BatchQualityCase.StageStatus.QC_APPROVED)

        # QA Release now succeeds
        case, qa_rel = record_qa_release(
            user=self.operator,
            quality_case_id=case.id,
            expected_version=case.version,
            outcome=BatchQualityDecision.Outcome.APPROVED,
            remarks="Batch conforms, released for packaging",
        )
        self.assertEqual(case.qa_release_status, BatchQualityCase.DecisionOutcome.APPROVED)
        self.assertEqual(case.stage_status, BatchQualityCase.StageStatus.QA_RELEASED)

        # Second release attempt on already-released case -> blocked
        with self.assertRaises(DjangoValidationError):
            record_qa_release(
                user=self.operator,
                quality_case_id=case.id,
                expected_version=case.version,
                outcome=BatchQualityDecision.Outcome.APPROVED,
            )

    def test_coa_workflow_requires_document_reference(self):
        case = open_batch_quality_case(user=self.operator, company=self.company, batch_plan_id=self.plan.id)

        # COA blocked before QA release
        with self.assertRaises(DjangoValidationError):
            open_coa_case(user=self.operator, quality_case_id=case.id, expected_version=case.version)

        # Advance: QC approved
        case, _ = record_qc_decision(
            user=self.operator,
            quality_case_id=case.id,
            expected_version=case.version,
            outcome=BatchQualityDecision.Outcome.APPROVED,
            remarks="QC passed",
        )
        # QA release approved
        case, _ = record_qa_release(
            user=self.operator,
            quality_case_id=case.id,
            expected_version=case.version,
            outcome=BatchQualityDecision.Outcome.APPROVED,
            remarks="QA released",
        )

        case, coa_open = open_coa_case(
            user=self.operator,
            quality_case_id=case.id,
            expected_version=case.version,
            remarks="COA generation requested",
        )
        self.assertEqual(case.coa_status, BatchQualityCase.DecisionOutcome.WAITING_DOCUMENT)

        # Missing document_reference raises validation error
        with self.assertRaises(DjangoValidationError):
            record_coa_decision(
                user=self.operator,
                quality_case_id=case.id,
                expected_version=case.version,
                outcome=BatchQualityDecision.Outcome.APPROVED,
                document_reference="",
            )

        case, coa_dec = record_coa_decision(
            user=self.operator,
            quality_case_id=case.id,
            expected_version=case.version,
            outcome=BatchQualityDecision.Outcome.APPROVED,
            document_reference="COA/2026/11/001",
            remarks="Signed by chief chemist",
        )
        self.assertEqual(case.coa_status, BatchQualityCase.DecisionOutcome.APPROVED)
        self.assertEqual(case.coa_document_reference, "COA/2026/11/001")

    def test_packaging_qa_workflow_safeguards(self):
        case = open_batch_quality_case(user=self.operator, company=self.company, batch_plan_id=self.plan.id)

        # Packaging complete blocked if QA release not approved
        with self.assertRaises(DjangoValidationError):
            mark_packaging_complete(
                user=self.operator,
                quality_case_id=case.id,
                expected_version=case.version,
                remarks="Premature",
            )

        # Packaging QA decision before packaging complete -> blocked
        with self.assertRaises(DjangoValidationError):
            record_packaging_decision(
                user=self.operator,
                quality_case_id=case.id,
                expected_version=case.version,
                outcome=BatchQualityDecision.Outcome.APPROVED,
            )

        # Advance: QC approved, then QA released
        case, _ = record_qc_decision(
            user=self.operator, quality_case_id=case.id, expected_version=case.version,
            outcome=BatchQualityDecision.Outcome.APPROVED, remarks="QC passed",
        )
        case, _ = record_qa_release(
            user=self.operator, quality_case_id=case.id, expected_version=case.version,
            outcome=BatchQualityDecision.Outcome.APPROVED, remarks="QA released",
        )

        # Mark packaging complete
        case = mark_packaging_complete(
            user=self.operator,
            quality_case_id=case.id,
            expected_version=case.version,
            remarks="50 bottles packed and labeled",
        )
        self.assertTrue(case.packaging_complete)

        # Packaging QA decision blocked without COA approved
        with self.assertRaises(DjangoValidationError):
            record_packaging_decision(
                user=self.operator,
                quality_case_id=case.id,
                expected_version=case.version,
                outcome=BatchQualityDecision.Outcome.APPROVED,
            )

        # Advance: COA opened and approved
        case, _ = open_coa_case(
            user=self.operator, quality_case_id=case.id,
            expected_version=case.version, remarks="COA requested",
        )
        case, _ = record_coa_decision(
            user=self.operator, quality_case_id=case.id, expected_version=case.version,
            outcome=BatchQualityDecision.Outcome.APPROVED, document_reference="COA/PKG/001",
            remarks="COA approved",
        )

        # Packaging QA decision succeeds
        case, pack_dec = record_packaging_decision(
            user=self.operator,
            quality_case_id=case.id,
            expected_version=case.version,
            outcome=BatchQualityDecision.Outcome.APPROVED,
            remarks="Packaging integrity verified",
        )
        self.assertEqual(case.packaging_qa_status, BatchQualityCase.DecisionOutcome.APPROVED)
        self.assertEqual(case.stage_status, BatchQualityCase.StageStatus.PACKAGING_APPROVED)

    def test_api_endpoints_permissions_and_company_isolation(self):
        base_url = f"/api/v1/companies/{self.company.id}/batch-quality/"

        # 1. POST open case
        resp = self.client_.post(
            base_url,
            {"batch_plan_id": self.plan.id},
            content_type="application/json",
            **bearer(self.operator),
        )
        self.assertEqual(resp.status_code, 201)
        case_id = resp.json()["id"]

        # 2. GET list
        resp = self.client_.get(base_url, **bearer(self.operator))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()["results"]), 1)

        # 3. GET detail
        detail_url = f"{base_url}{case_id}/"
        resp = self.client_.get(detail_url, **bearer(self.operator))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["batch_number_snapshot"], self.allocation.number)

        # 4. POST qc-decision
        qc_url = f"{detail_url}qc-decisions/"
        resp = self.client_.post(
            qc_url,
            {"expected_version": 1, "outcome": "APPROVED", "remarks": "Approved"},
            content_type="application/json",
            **bearer(self.operator),
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["stage_status"], "QC_APPROVED")
        self.assertEqual(resp.json()["version"], 2)

        # 5. POST qa-release
        qa_url = f"{detail_url}qa-release/"
        resp = self.client_.post(
            qa_url,
            {"expected_version": 2, "outcome": "APPROVED", "remarks": "QA release approved"},
            content_type="application/json",
            **bearer(self.operator),
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["stage_status"], "QA_RELEASED")
        self.assertEqual(resp.json()["version"], 3)

        # 6. POST coa open
        coa_open_url = f"{detail_url}coa/"
        resp = self.client_.post(
            coa_open_url,
            {"expected_version": 3, "remarks": "Opening COA"},
            content_type="application/json",
            **bearer(self.operator),
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["coa_status"], "WAITING_DOCUMENT")
        self.assertEqual(resp.json()["version"], 4)

        # 7. POST coa-decision
        coa_dec_url = f"{detail_url}coa-decisions/"
        resp = self.client_.post(
            coa_dec_url,
            {"expected_version": 4, "outcome": "APPROVED", "document_reference": "COA-001"},
            content_type="application/json",
            **bearer(self.operator),
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["coa_status"], "APPROVED")
        self.assertEqual(resp.json()["version"], 5)

        # 8. POST packaging-complete
        pack_comp_url = f"{detail_url}packaging-complete/"
        resp = self.client_.post(
            pack_comp_url,
            {"expected_version": 5},
            content_type="application/json",
            **bearer(self.operator),
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["packaging_complete"])
        self.assertEqual(resp.json()["version"], 6)

        # 9. POST packaging-decision
        pack_dec_url = f"{detail_url}packaging-decisions/"
        resp = self.client_.post(
            pack_dec_url,
            {"expected_version": 6, "outcome": "APPROVED", "remarks": "Packaging verified"},
            content_type="application/json",
            **bearer(self.operator),
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["packaging_qa_status"], "APPROVED")
        self.assertEqual(resp.json()["version"], 7)

        # 10. Check decision history in detail view
        resp = self.client_.get(detail_url, **bearer(self.operator))
        self.assertEqual(resp.status_code, 200)
        decisions = resp.json()["decisions"]
        self.assertEqual(len(decisions), 5)  # QC, QA, COA_OPEN, COA_DEC, PACKAGING

        # 11. Company Isolation: caller from other company gets 404
        other_url = f"/api/v1/companies/{self.other_company.id}/batch-quality/{case_id}/"
        resp = self.client_.get(other_url, **bearer(self.operator))
        self.assertEqual(resp.status_code, 404)

        # 12. Unauthorized user gets 403
        resp = self.client_.get(detail_url, **bearer(self.unauthorized_user))
        self.assertEqual(resp.status_code, 403)



    # -------------------------------------------------------------------------
    # Phase 1.1 Remediation: New test cases
    # -------------------------------------------------------------------------

    def test_queryset_update_raises_validation_error(self):
        """ORM-level: QuerySet.update() must be blocked."""
        case = open_batch_quality_case(user=self.operator, company=self.company, batch_plan_id=self.plan.id)
        case, decision = record_qc_decision(
            user=self.operator,
            quality_case_id=case.id,
            expected_version=1,
            outcome=BatchQualityDecision.Outcome.APPROVED,
            remarks="Passed",
        )
        with self.assertRaises(DjangoValidationError):
            BatchQualityDecision.objects.filter(pk=decision.pk).update(remarks="TAMPERED")

    def test_queryset_delete_raises_validation_error(self):
        """ORM-level: QuerySet.delete() must be blocked."""
        case = open_batch_quality_case(user=self.operator, company=self.company, batch_plan_id=self.plan.id)
        case, decision = record_qc_decision(
            user=self.operator,
            quality_case_id=case.id,
            expected_version=1,
            outcome=BatchQualityDecision.Outcome.APPROVED,
            remarks="Passed",
        )
        with self.assertRaises(DjangoValidationError):
            BatchQualityDecision.objects.filter(pk=decision.pk).delete()

    def test_postgresql_trigger_blocks_raw_update(self):
        """DB-level: Raw SQL UPDATE on quality_batchqualitydecision must raise ProgrammingError."""
        from django.db import connection, DatabaseError
        case = open_batch_quality_case(user=self.operator, company=self.company, batch_plan_id=self.plan.id)
        case, decision = record_qc_decision(
            user=self.operator,
            quality_case_id=case.id,
            expected_version=1,
            outcome=BatchQualityDecision.Outcome.APPROVED,
            remarks="Passed",
        )
        with self.assertRaises(DatabaseError):
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE quality_batchqualitydecision SET remarks = %s WHERE id = %s",
                    ["TAMPERED", decision.pk],
                )

    def test_postgresql_trigger_blocks_raw_delete(self):
        """DB-level: Raw SQL DELETE on quality_batchqualitydecision must raise DatabaseError."""
        from django.db import connection, DatabaseError
        case = open_batch_quality_case(user=self.operator, company=self.company, batch_plan_id=self.plan.id)
        case, decision = record_qc_decision(
            user=self.operator,
            quality_case_id=case.id,
            expected_version=1,
            outcome=BatchQualityDecision.Outcome.APPROVED,
            remarks="Passed",
        )
        with self.assertRaises(DatabaseError):
            with connection.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM quality_batchqualitydecision WHERE id = %s",
                    [decision.pk],
                )

    def test_coa_blocked_before_qa_release(self):
        """COA open must fail when QA release is not yet approved."""
        case = open_batch_quality_case(user=self.operator, company=self.company, batch_plan_id=self.plan.id)
        # QC approved, but QA not released
        case, _ = record_qc_decision(
            user=self.operator, quality_case_id=case.id, expected_version=case.version,
            outcome=BatchQualityDecision.Outcome.APPROVED, remarks="QC passed",
        )
        with self.assertRaises(DjangoValidationError):
            open_coa_case(user=self.operator, quality_case_id=case.id, expected_version=case.version)

    def test_duplicate_coa_document_reference_same_company_blocked(self):
        """Same COA document reference within the same company must be rejected."""
        # Plan 1 → full workflow → COA approved with ref COA/DUP/001
        case1 = open_batch_quality_case(user=self.operator, company=self.company, batch_plan_id=self.plan.id)
        case1, _ = record_qc_decision(user=self.operator, quality_case_id=case1.id, expected_version=case1.version,
                                       outcome=BatchQualityDecision.Outcome.APPROVED)
        case1, _ = record_qa_release(user=self.operator, quality_case_id=case1.id, expected_version=case1.version,
                                      outcome=BatchQualityDecision.Outcome.APPROVED)
        case1, _ = open_coa_case(user=self.operator, quality_case_id=case1.id, expected_version=case1.version)
        case1, _ = record_coa_decision(user=self.operator, quality_case_id=case1.id, expected_version=case1.version,
                                        outcome=BatchQualityDecision.Outcome.APPROVED,
                                        document_reference="COA/DUP/001")
        self.assertEqual(case1.coa_status, BatchQualityCase.DecisionOutcome.APPROVED)

        # Plan 2 — need a second batch plan for the same company
        order2 = create_sales_order(
            actor=self.superuser, company=self.company, customer_id=self.customer.id,
            currency="INR", order_date=datetime.date(2026, 11, 2),
            lines=[{"product_id": self.product.id, "quantity": Decimal("50"), "unit_price": Decimal("20")}],
        )
        line2 = order2.lines.first()
        plan2 = create_batch_plan(
            actor=self.superuser, company=self.company,
            sales_order_line_id=line2.id, formula_revision_id=self.revision.id,
            target_output_quantity="30",
        )
        plan2, alloc2 = bn.allocate_batch_number(
            actor=self.superuser, company_id=self.company.id,
            plan_id=plan2.id, expected_version=plan2.version,
        )

        case2 = open_batch_quality_case(user=self.operator, company=self.company, batch_plan_id=plan2.id)
        case2, _ = record_qc_decision(user=self.operator, quality_case_id=case2.id, expected_version=case2.version,
                                       outcome=BatchQualityDecision.Outcome.APPROVED)
        case2, _ = record_qa_release(user=self.operator, quality_case_id=case2.id, expected_version=case2.version,
                                      outcome=BatchQualityDecision.Outcome.APPROVED)
        case2, _ = open_coa_case(user=self.operator, quality_case_id=case2.id, expected_version=case2.version)
        with self.assertRaises(DjangoValidationError):
            record_coa_decision(user=self.operator, quality_case_id=case2.id, expected_version=case2.version,
                                 outcome=BatchQualityDecision.Outcome.APPROVED,
                                 document_reference="COA/DUP/001")  # Duplicate!

    def test_approved_coa_cannot_be_overwritten(self):
        """Once COA is approved, another record_coa_decision call must be blocked."""
        case = open_batch_quality_case(user=self.operator, company=self.company, batch_plan_id=self.plan.id)
        case, _ = record_qc_decision(user=self.operator, quality_case_id=case.id, expected_version=case.version,
                                      outcome=BatchQualityDecision.Outcome.APPROVED)
        case, _ = record_qa_release(user=self.operator, quality_case_id=case.id, expected_version=case.version,
                                     outcome=BatchQualityDecision.Outcome.APPROVED)
        case, _ = open_coa_case(user=self.operator, quality_case_id=case.id, expected_version=case.version)
        case, _ = record_coa_decision(user=self.operator, quality_case_id=case.id, expected_version=case.version,
                                       outcome=BatchQualityDecision.Outcome.APPROVED,
                                       document_reference="COA/ONCE/001")
        self.assertEqual(case.coa_status, BatchQualityCase.DecisionOutcome.APPROVED)
        # Trying to overwrite an already-approved COA must fail
        with self.assertRaises(DjangoValidationError):
            record_coa_decision(user=self.operator, quality_case_id=case.id, expected_version=case.version,
                                 outcome=BatchQualityDecision.Outcome.APPROVED,
                                 document_reference="COA/ONCE/002")

    def test_packaging_complete_blocked_without_qa_release(self):
        """mark_packaging_complete must be blocked if QA release is not approved."""
        case = open_batch_quality_case(user=self.operator, company=self.company, batch_plan_id=self.plan.id)
        case, _ = record_qc_decision(user=self.operator, quality_case_id=case.id, expected_version=case.version,
                                      outcome=BatchQualityDecision.Outcome.APPROVED)
        # QA not released — packaging complete must fail
        with self.assertRaises(DjangoValidationError):
            mark_packaging_complete(user=self.operator, quality_case_id=case.id,
                                    expected_version=case.version, remarks="Too early")

    def test_packaging_qa_blocked_without_coa_approved(self):
        """record_packaging_decision must be blocked if COA is not yet approved."""
        case = open_batch_quality_case(user=self.operator, company=self.company, batch_plan_id=self.plan.id)
        case, _ = record_qc_decision(user=self.operator, quality_case_id=case.id, expected_version=case.version,
                                      outcome=BatchQualityDecision.Outcome.APPROVED)
        case, _ = record_qa_release(user=self.operator, quality_case_id=case.id, expected_version=case.version,
                                     outcome=BatchQualityDecision.Outcome.APPROVED)
        case = mark_packaging_complete(user=self.operator, quality_case_id=case.id,
                                       expected_version=case.version, remarks="Packed")
        # COA not yet approved → packaging QA must fail
        with self.assertRaises(DjangoValidationError):
            record_packaging_decision(user=self.operator, quality_case_id=case.id,
                                      expected_version=case.version,
                                      outcome=BatchQualityDecision.Outcome.APPROVED)

    def test_api_coa_decide_requires_coa_approve_permission(self):
        """API: coa-decisions endpoint must require batch_quality.coa_approve."""
        # Create a user with only coa_generate but NOT coa_approve
        coa_gen_user = make_user("coagen")
        grant(self.superuser, coa_gen_user, self.company,
              "batch_quality.view", "batch_quality.qc_decide",
              "batch_quality.qa_release", "batch_quality.coa_generate")

        # Set up a case through COA open stage via API
        base_url = f"/api/v1/companies/{self.company.id}/batch-quality/"
        resp = self.client_.post(base_url, {"batch_plan_id": self.plan.id},
                                  content_type="application/json", **bearer(coa_gen_user))
        self.assertEqual(resp.status_code, 201)
        case_id = resp.json()["id"]
        detail_url = f"{base_url}{case_id}/"

        self.client_.post(f"{detail_url}qc-decisions/",
                           {"expected_version": 1, "outcome": "APPROVED"},
                           content_type="application/json", **bearer(coa_gen_user))
        self.client_.post(f"{detail_url}qa-release/",
                           {"expected_version": 2, "outcome": "APPROVED"},
                           content_type="application/json", **bearer(coa_gen_user))
        self.client_.post(f"{detail_url}coa/",
                           {"expected_version": 3, "remarks": "COA requested"},
                           content_type="application/json", **bearer(coa_gen_user))

        # COA decision must be blocked without coa_approve
        resp = self.client_.post(
            f"{detail_url}coa-decisions/",
            {"expected_version": 4, "outcome": "APPROVED", "document_reference": "COA-PERM-001"},
            content_type="application/json",
            **bearer(coa_gen_user),
        )
        self.assertEqual(resp.status_code, 403)

    def test_api_packaging_complete_requires_production_packaging_complete_permission(self):
        """API: packaging-complete endpoint must require production.packaging_complete."""
        # User with packaging_qa but NOT production.packaging_complete
        pack_qa_user = make_user("packqa")
        grant(self.superuser, pack_qa_user, self.company,
              "batch_quality.view", "batch_quality.qc_decide",
              "batch_quality.qa_release", "batch_quality.coa_generate",
              "batch_quality.coa_approve", "batch_quality.packaging_qa")

        base_url = f"/api/v1/companies/{self.company.id}/batch-quality/"
        resp = self.client_.post(base_url, {"batch_plan_id": self.plan.id},
                                  content_type="application/json", **bearer(pack_qa_user))
        self.assertEqual(resp.status_code, 201)
        case_id = resp.json()["id"]
        detail_url = f"{base_url}{case_id}/"

        self.client_.post(f"{detail_url}qc-decisions/",
                           {"expected_version": 1, "outcome": "APPROVED"},
                           content_type="application/json", **bearer(pack_qa_user))
        self.client_.post(f"{detail_url}qa-release/",
                           {"expected_version": 2, "outcome": "APPROVED"},
                           content_type="application/json", **bearer(pack_qa_user))

        # packaging-complete must be blocked without production.packaging_complete
        resp = self.client_.post(
            f"{detail_url}packaging-complete/",
            {"expected_version": 3},
            content_type="application/json",
            **bearer(pack_qa_user),
        )
        self.assertEqual(resp.status_code, 403)
