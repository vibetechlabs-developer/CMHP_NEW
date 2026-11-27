from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.audit.services import record
from apps.batch_plans.models import BatchPlan
from apps.bmr.models import BMRDocument
from apps.common.errors import Conflict
from apps.quality.models import BatchQualityCase, BatchQualityDecision, FinishedGoodsStock


def open_batch_quality_case(*, user, company, batch_plan_id):
    """Opens a company-scoped BatchQualityCase for a BatchPlan that already has
    an allocated official batch number.
    """
    batch_plan = (
        BatchPlan.objects.select_related("number_allocation")
        .filter(pk=batch_plan_id, company=company)
        .first()
    )
    if batch_plan is None:
        raise ValidationError({"batch_plan_id": "Batch plan not found."})

    allocation = getattr(batch_plan, "number_allocation", None)
    if allocation is None or not allocation.number:
        raise ValidationError(
            {"batch_plan_id": "Batch plan must have an allocated official batch number before opening a quality case."}
        )

    if BatchQualityCase.objects.filter(batch_plan=batch_plan).exists():
        raise ValidationError(
            {"batch_plan_id": "A batch quality case already exists for this batch plan."}
        )

    case = BatchQualityCase.objects.create(
        batch_plan=batch_plan,
        company=company,
        batch_number_snapshot=allocation.number,
        product_id_snapshot=batch_plan.product_id_snapshot,
        product_code_snapshot=batch_plan.product_code_snapshot,
        product_name_snapshot=batch_plan.product_name_snapshot,
        created_by=user,
        stage_status=BatchQualityCase.StageStatus.PENDING_QC,
        qc_status=BatchQualityCase.DecisionOutcome.PENDING,
        qa_release_status=BatchQualityCase.DecisionOutcome.PENDING,
        coa_status=BatchQualityCase.DecisionOutcome.PENDING,
        packaging_qa_status=BatchQualityCase.DecisionOutcome.PENDING,
        version=1,
    )
    return case


def record_qc_decision(*, user, quality_case_id, expected_version, outcome, remarks=""):
    """Records an append-only BATCH_QC decision and updates case QC status."""
    with transaction.atomic():
        case = BatchQualityCase.objects.select_for_update().get(pk=quality_case_id)
        if case.version != expected_version:
            raise Conflict("This batch quality case has changed since it was last read. Refetch and retry.")

        valid_outcomes = {
            BatchQualityDecision.Outcome.APPROVED,
            BatchQualityDecision.Outcome.REJECTED,
            BatchQualityDecision.Outcome.HOLD,
        }
        if outcome not in valid_outcomes:
            raise ValidationError({"outcome": f"Outcome must be one of {sorted(valid_outcomes)}."})

        prev_status = case.stage_status
        case.qc_status = outcome
        if outcome == BatchQualityDecision.Outcome.APPROVED:
            case.stage_status = BatchQualityCase.StageStatus.QC_APPROVED
        elif outcome == BatchQualityDecision.Outcome.REJECTED:
            case.stage_status = BatchQualityCase.StageStatus.QC_REJECTED
        elif outcome == BatchQualityDecision.Outcome.HOLD:
            case.stage_status = BatchQualityCase.StageStatus.QC_HOLD

        decision = BatchQualityDecision.objects.create(
            quality_case=case,
            decision_type=BatchQualityDecision.DecisionType.BATCH_QC,
            outcome=outcome,
            previous_status=prev_status,
            new_status=case.stage_status,
            decided_by=user,
            remarks=remarks,
        )
        case.version += 1
        case.save()
        return case, decision


def record_qa_release(*, user, quality_case_id, expected_version, outcome, remarks=""):
    """Authorizes QA release for a batch quality case.
    A release is allowed only when the latest BATCH_QC outcome is APPROVED
    and the case is not already released. Rejected/HOLD QC blocks release.
    """
    with transaction.atomic():
        case = BatchQualityCase.objects.select_for_update().get(pk=quality_case_id)
        if case.version != expected_version:
            raise Conflict("This batch quality case has changed since it was last read. Refetch and retry.")

        valid_outcomes = {
            BatchQualityDecision.Outcome.APPROVED,
            BatchQualityDecision.Outcome.REJECTED,
            BatchQualityDecision.Outcome.HOLD,
        }
        if outcome not in valid_outcomes:
            raise ValidationError({"outcome": f"Outcome must be one of {sorted(valid_outcomes)}."})

        latest_qc = (
            case.decisions.filter(decision_type=BatchQualityDecision.DecisionType.BATCH_QC)
            .order_by("-decided_at", "-id")
            .first()
        )
        if latest_qc is None or latest_qc.outcome != BatchQualityDecision.Outcome.APPROVED:
            raise ValidationError(
                {"detail": "QA release is allowed only when the latest Batch QC decision is APPROVED."}
            )

        if case.qa_release_status == BatchQualityCase.DecisionOutcome.APPROVED:
            raise ValidationError({"detail": "This batch quality case is already released."})

        prev_status = case.stage_status
        case.qa_release_status = outcome
        if outcome == BatchQualityDecision.Outcome.APPROVED:
            case.stage_status = BatchQualityCase.StageStatus.QA_RELEASED
        elif outcome == BatchQualityDecision.Outcome.REJECTED:
            case.stage_status = BatchQualityCase.StageStatus.QA_REJECTED
        elif outcome == BatchQualityDecision.Outcome.HOLD:
            case.stage_status = BatchQualityCase.StageStatus.QA_HOLD

        decision = BatchQualityDecision.objects.create(
            quality_case=case,
            decision_type=BatchQualityDecision.DecisionType.QA_RELEASE,
            outcome=outcome,
            previous_status=prev_status,
            new_status=case.stage_status,
            decided_by=user,
            remarks=remarks,
        )
        case.version += 1
        case.save()
        return case, decision


def open_coa_case(*, user, quality_case_id, expected_version, remarks=""):
    """Opens COA workflow as WAITING_DOCUMENT.
    Requires QA batch release to be approved first.
    """
    with transaction.atomic():
        case = BatchQualityCase.objects.select_for_update().get(pk=quality_case_id)
        if case.version != expected_version:
            raise Conflict("This batch quality case has changed since it was last read. Refetch and retry.")

        if case.qa_release_status != BatchQualityCase.DecisionOutcome.APPROVED:
            raise ValidationError(
                {"detail": f"COA workflow requires QA batch release to be approved first. Current QA release status is {case.qa_release_status}."}
            )

        if case.coa_status == BatchQualityCase.DecisionOutcome.APPROVED:
            raise ValidationError(
                {"detail": "COA has already been approved for this batch quality case."}
            )

        prev_status = case.coa_status
        case.coa_status = BatchQualityCase.DecisionOutcome.WAITING_DOCUMENT

        decision = BatchQualityDecision.objects.create(
            quality_case=case,
            decision_type=BatchQualityDecision.DecisionType.COA,
            outcome=BatchQualityDecision.Outcome.WAITING_DOCUMENT,
            previous_status=prev_status,
            new_status=case.coa_status,
            decided_by=user,
            remarks=remarks,
        )
        case.version += 1
        case.save()
        return case, decision


def record_coa_decision(*, user, quality_case_id, expected_version, outcome, document_reference, remarks=""):
    """Records a COA decision with mandatory document reference.
    Requires QA batch release to be approved first. An approved COA cannot be overwritten;
    corrections require a controlled COA revision. Duplicate document references within
    the company are prohibited.
    """
    with transaction.atomic():
        case = BatchQualityCase.objects.select_for_update().get(pk=quality_case_id)
        if case.version != expected_version:
            raise Conflict("This batch quality case has changed since it was last read. Refetch and retry.")

        if case.qa_release_status != BatchQualityCase.DecisionOutcome.APPROVED:
            raise ValidationError(
                {"detail": f"COA decision requires QA batch release to be approved first. Current QA release status is {case.qa_release_status}."}
            )

        if case.coa_status == BatchQualityCase.DecisionOutcome.APPROVED:
            raise ValidationError(
                {"detail": "An approved COA cannot be overwritten. Submit a controlled COA revision if correction is required."}
            )

        valid_outcomes = {
            BatchQualityDecision.Outcome.APPROVED,
            BatchQualityDecision.Outcome.REJECTED,
            BatchQualityDecision.Outcome.HOLD,
        }
        if outcome not in valid_outcomes:
            raise ValidationError({"outcome": f"Outcome must be one of {sorted(valid_outcomes)}."})

        doc_ref = (document_reference or "").strip()
        if not doc_ref:
            raise ValidationError({"document_reference": "Document reference is required for a COA decision."})

        # Company-scoped duplicate prevention
        if (
            BatchQualityCase.objects.filter(company=case.company, coa_document_reference=doc_ref)
            .exclude(pk=case.pk)
            .exists()
        ):
            raise ValidationError(
                {"document_reference": f"COA document reference '{doc_ref}' is already registered in this company."}
            )

        prev_status = case.coa_status
        case.coa_status = outcome
        case.coa_document_reference = doc_ref

        decision = BatchQualityDecision.objects.create(
            quality_case=case,
            decision_type=BatchQualityDecision.DecisionType.COA,
            outcome=outcome,
            previous_status=prev_status,
            new_status=case.coa_status,
            decided_by=user,
            remarks=remarks,
            document_reference=doc_ref,
        )
        case.version += 1
        case.save()
        return case, decision


def create_coa_revision(*, user, quality_case_id, expected_version, new_document_reference, revision_reason):
    """Creates a controlled COA revision for an already-approved COA.
    Preserves historical approved decisions and resets COA to WAITING_DOCUMENT with reference
    to the previous document and documented revision reason.
    """
    with transaction.atomic():
        case = BatchQualityCase.objects.select_for_update().get(pk=quality_case_id)
        if case.version != expected_version:
            raise Conflict("This batch quality case has changed since it was last read. Refetch and retry.")

        if case.coa_status != BatchQualityCase.DecisionOutcome.APPROVED:
            raise ValidationError(
                {"detail": "Only an approved COA can be revised."}
            )

        reason = (revision_reason or "").strip()
        if not reason:
            raise ValidationError({"revision_reason": "Revision reason is mandatory."})

        new_ref = (new_document_reference or "").strip()
        if not new_ref or new_ref == case.coa_document_reference:
            raise ValidationError(
                {"new_document_reference": "A distinct new document reference is required for COA revision."}
            )

        if (
            BatchQualityCase.objects.filter(company=case.company, coa_document_reference=new_ref)
            .exclude(pk=case.pk)
            .exists()
        ):
            raise ValidationError(
                {"new_document_reference": f"COA document reference '{new_ref}' is already registered in this company."}
            )

        prev_ref = case.coa_document_reference
        prev_status = case.coa_status
        case.coa_status = BatchQualityCase.DecisionOutcome.WAITING_DOCUMENT
        case.coa_document_reference = new_ref

        decision = BatchQualityDecision.objects.create(
            quality_case=case,
            decision_type=BatchQualityDecision.DecisionType.COA,
            outcome=BatchQualityDecision.Outcome.WAITING_DOCUMENT,
            previous_status=prev_status,
            new_status=case.coa_status,
            decided_by=user,
            remarks=f"COA Revision requested (superseding {prev_ref}): {reason}",
            document_reference=new_ref,
        )
        case.version += 1
        case.save()
        return case, decision


def mark_packaging_complete(*, user, quality_case_id, expected_version, remarks=""):
    """Marks batch packaging complete. Does NOT post finished-goods stock.
    Requires QA batch release to be approved first.
    """
    with transaction.atomic():
        case = BatchQualityCase.objects.select_for_update().get(pk=quality_case_id)
        if case.version != expected_version:
            raise Conflict("This batch quality case has changed since it was last read. Refetch and retry.")

        if case.qa_release_status != BatchQualityCase.DecisionOutcome.APPROVED:
            raise ValidationError(
                {"detail": f"Packaging completion requires QA batch release to be approved first. Current QA release status is {case.qa_release_status}."}
            )

        if case.packaging_complete:
            raise ValidationError({"detail": "Packaging is already marked complete."})

        case.packaging_complete = True
        case.packaging_complete_at = timezone.now()
        case.packaging_complete_by = user
        if case.stage_status == BatchQualityCase.StageStatus.QA_RELEASED:
            case.stage_status = BatchQualityCase.StageStatus.PACKAGING_COMPLETED

        case.version += 1
        case.save()
        return case


def record_packaging_decision(*, user, quality_case_id, expected_version, outcome, remarks=""):
    """Records packaging QA decision. Requires:
    1. Packaging completion to be marked first.
    2. QA batch release to be approved.
    3. COA to be approved.
    Never posts finished-goods stock.
    """
    with transaction.atomic():
        case = BatchQualityCase.objects.select_for_update().get(pk=quality_case_id)
        if case.version != expected_version:
            raise Conflict("This batch quality case has changed since it was last read. Refetch and retry.")

        if not case.packaging_complete:
            raise ValidationError(
                {"detail": "Packaging QA requires the case to be marked packaging-complete first."}
            )

        if case.qa_release_status != BatchQualityCase.DecisionOutcome.APPROVED:
            raise ValidationError(
                {"detail": f"Packaging QA decision requires QA batch release to be approved first. Current QA release status is {case.qa_release_status}."}
            )

        if case.coa_status != BatchQualityCase.DecisionOutcome.APPROVED:
            raise ValidationError(
                {"detail": f"Packaging QA decision requires Certificate of Analysis (COA) to be approved first. Current COA status is {case.coa_status}."}
            )

        valid_outcomes = {
            BatchQualityDecision.Outcome.APPROVED,
            BatchQualityDecision.Outcome.REJECTED,
            BatchQualityDecision.Outcome.HOLD,
        }
        if outcome not in valid_outcomes:
            raise ValidationError({"outcome": f"Outcome must be one of {sorted(valid_outcomes)}."})

        prev_status = case.stage_status
        case.packaging_qa_status = outcome
        if outcome == BatchQualityDecision.Outcome.APPROVED:
            case.stage_status = BatchQualityCase.StageStatus.PACKAGING_APPROVED
        elif outcome == BatchQualityDecision.Outcome.REJECTED:
            case.stage_status = BatchQualityCase.StageStatus.PACKAGING_REJECTED
        elif outcome == BatchQualityDecision.Outcome.HOLD:
            case.stage_status = BatchQualityCase.StageStatus.PACKAGING_HOLD

        decision = BatchQualityDecision.objects.create(
            quality_case=case,
            decision_type=BatchQualityDecision.DecisionType.PACKAGING_QA,
            outcome=outcome,
            previous_status=prev_status,
            new_status=case.stage_status,
            decided_by=user,
            remarks=remarks,
        )
        case.version += 1
        case.save()
        return case, decision


@transaction.atomic
def post_finished_goods_stock(
    *,
    user,
    company,
    quality_case_id,
    expected_version,
    quantity=None,
    storage_location="",
    remarks="",
    tolerance_justification="",
    bmr_document_ref="",
):
    """Posts an authorized, QA-approved manufactured batch into finished goods inventory.
    Sourced from verified BMR packaging reconciliation. Planned quantity is NEVER
    silently substituted for actual packed quantity.
    """
    case = (
        BatchQualityCase.objects.select_for_update()
        .select_related("batch_plan__sales_order_line__product__sales_uom")
        .filter(pk=quality_case_id, company=company)
        .first()
    )
    if case is None:
        raise ValidationError({"detail": "Batch quality case not found in this company."})

    if case.version != expected_version:
        raise Conflict("This batch quality case has changed since it was last read. Refetch and retry.")

    if not case.packaging_complete:
        raise ValidationError({"detail": "Posting finished goods stock requires packaging to be marked complete first."})

    if case.packaging_qa_status != BatchQualityDecision.Outcome.APPROVED:
        raise ValidationError({
            "detail": f"Posting finished goods stock requires packaging QA approval. Current status is {case.packaging_qa_status}."
        })

    if case.fg_posted:
        raise Conflict("Finished goods stock has already been posted for this batch quality case.")

    if FinishedGoodsStock.objects.filter(quality_case=case, is_reversed=False).exists():
        raise Conflict("An active finished goods stock entry already exists for this case.")

    plan = case.batch_plan
    product = plan.sales_order_line.product

    # BMR Packaging Reconciliation Verification
    bmr_doc = (
        BMRDocument.objects.filter(company=company, batch_no=case.batch_number_snapshot).first()
        or BMRDocument.objects.filter(company=company, order_id=plan.source_order_reference_snapshot).first()
        or BMRDocument.objects.filter(company=company, order_id=str(plan.id)).first()
    )

    actual_packed_qty = None
    resolved_bmr_ref = (bmr_document_ref or "").strip()

    if bmr_doc is not None:
        doc_data = bmr_doc.data or {}
        p14 = doc_data.get("page14") or {}
        p15 = doc_data.get("page15") or {}
        yield_data = p15.get("yield") or doc_data.get("yield") or {}
        raw_qty = (
            p14.get("total_packed_bottles")
            or yield_data.get("qty_bsr_nos")
            or p14.get("total_packed_litres")
            or doc_data.get("total_packed_bottles")
            or doc_data.get("verified_packed_quantity")
        )
        if raw_qty:
            try:
                actual_packed_qty = Decimal(str(raw_qty))
            except Exception:
                actual_packed_qty = None
        if not resolved_bmr_ref:
            resolved_bmr_ref = f"BMR #{bmr_doc.id} ({case.batch_number_snapshot})"

    # If quantity was explicitly provided in the payload, validate it against BMR verification
    if quantity is not None:
        try:
            passed_qty = Decimal(str(quantity))
        except Exception:
            raise ValidationError({"quantity": "Must be a valid positive decimal quantity."})
        if actual_packed_qty is not None and passed_qty != actual_packed_qty:
            if not (tolerance_justification or "").strip():
                raise ValidationError({
                    "tolerance_justification": f"Quantity {passed_qty} does not match verified BMR packed quantity ({actual_packed_qty}). Authorized justification is required."
                })
        actual_packed_qty = passed_qty

    # Strict rule: Planned quantity must NOT silently become actual packed quantity!
    if actual_packed_qty is None or not resolved_bmr_ref:
        raise ValidationError({
            "detail": "Finished goods posting requires verified BMR packaging reconciliation. Planned quantity cannot be silently substituted for actual packed quantity."
        })

    if actual_packed_qty <= 0:
        raise ValidationError({"quantity": "Actual packed quantity must be greater than zero."})

    # Planned quantity baseline
    planned_qty = plan.planned_pack_quantity or plan.target_output_quantity
    if not planned_qty or planned_qty <= 0:
        planned_qty = actual_packed_qty

    # Tolerance deviation calculation
    deviation_pct = ((Decimal(str(actual_packed_qty)) - Decimal(str(planned_qty))) / Decimal(str(planned_qty))) * Decimal("100")
    deviation_pct = deviation_pct.quantize(Decimal("0.01"))

    # If deviation exceeds ±10%, tolerance justification is mandatory
    if abs(deviation_pct) > Decimal("10.00") and not (tolerance_justification or "").strip():
        raise ValidationError({
            "tolerance_justification": f"Yield deviation of {deviation_pct}% exceeds the permitted ±10% threshold. Documented and authorized tolerance justification is required."
        })

    unit = product.sales_uom
    now = timezone.now()

    stock = FinishedGoodsStock.objects.create(
        company=company,
        quality_case=case,
        batch_plan=plan,
        product=product,
        batch_number=case.batch_number_snapshot,
        product_code_snapshot=case.product_code_snapshot,
        product_name_snapshot=case.product_name_snapshot,
        quantity=actual_packed_qty,
        unit=unit,
        unit_code_snapshot=unit.code,
        verified_packed_quantity=actual_packed_qty,
        planned_pack_quantity_snapshot=planned_qty,
        reconciliation_document_ref=resolved_bmr_ref,
        tolerance_deviation_percent=deviation_pct,
        tolerance_justification=(tolerance_justification or "").strip(),
        storage_location=(storage_location or "").strip(),
        remarks=(remarks or "").strip(),
        posted_by=user,
        posted_at=now,
    )

    case.fg_posted = True
    case.version += 1
    case.save()

    record(
        actor=user,
        action="finished_goods.posted",
        target_type="finished_goods_stock",
        target_id=stock.id,
        company=company,
        after={
            "stock_id": stock.id,
            "batch_number": stock.batch_number,
            "quantity": str(stock.quantity),
            "unit": stock.unit_code_snapshot,
            "reconciliation_ref": stock.reconciliation_document_ref,
        },
    )

    return stock


@transaction.atomic
def reverse_finished_goods_stock(
    *,
    user,
    company,
    stock_id,
    reversal_reason,
):
    """Performs an authorized reversal of a FinishedGoodsStock record.
    Preserves historical record, updates fg_posted on the quality case,
    and enables a future corrected posting without deleting history.
    """
    reason = (reversal_reason or "").strip()
    if not reason:
        raise ValidationError({"reversal_reason": "A non-empty reversal reason is required."})

    stock = (
        FinishedGoodsStock.objects.select_for_update()
        .filter(pk=stock_id, company=company)
        .first()
    )
    if stock is None:
        raise ValidationError({"detail": "Finished goods stock record not found in this company."})

    if stock.is_reversed:
        raise ValidationError({"detail": "This finished goods stock record has already been reversed."})
    if stock.allocations.exists():
        raise ValidationError({"detail": "Finished goods stock with sales order allocations cannot be reversed."})

    case = BatchQualityCase.objects.select_for_update().get(pk=stock.quality_case_id)

    now = timezone.now()
    stock.is_reversed = True
    stock.reversed_by = user
    stock.reversed_at = now
    stock.reversal_reason = reason
    stock.save()

    # Reset fg_posted to False so corrected posting can be submitted
    case.fg_posted = False
    case.version += 1
    case.save()

    record(
        actor=user,
        action="finished_goods.reversed",
        target_type="finished_goods_stock",
        target_id=stock.id,
        company=company,
        after={
            "stock_id": stock.id,
            "batch_number": stock.batch_number,
            "reversal_reason": reason,
            "reversed_at": now.isoformat(),
        },
    )

    return stock
