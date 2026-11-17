import hashlib
import mimetypes
import os
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.batch_plans.models import BatchPlan
from apps.bmr.models import BMRDocumentAttachment
from apps.quality.models import BatchQualityCase, BatchQualityDecision, COADocumentAttachment


def calculate_file_hash_and_size(file_obj):
    sha = hashlib.sha256()
    size = 0
    # Store initial position
    initial_pos = file_obj.tell() if hasattr(file_obj, "tell") else 0
    file_obj.seek(0)
    for chunk in file_obj.chunks():
        sha.update(chunk)
        size += len(chunk)
    file_obj.seek(initial_pos)
    return sha.hexdigest(), size


@transaction.atomic
def upload_bmr_document(user, company, batch_plan_id, document_type, document_name, bmr_number, file_obj, remarks=""):
    try:
        plan = BatchPlan.objects.select_related("company").get(pk=batch_plan_id, company=company)
    except BatchPlan.DoesNotExist:
        raise ValidationError({"batch_plan_id": "Batch plan not found for this company."})

    # Resolve batch number
    batch_number = ""
    if hasattr(plan, "number_allocation") and plan.number_allocation:
        batch_number = plan.number_allocation.number
    elif hasattr(plan, "quality_case") and plan.quality_case:
        batch_number = plan.quality_case.batch_number_snapshot
    if not batch_number:
        batch_number = f"BP-{plan.id}"

    # Calculate checksum and size
    checksum, size = calculate_file_hash_and_size(file_obj)

    # Detect duplicate
    duplicate = BMRDocumentAttachment.objects.filter(
        company=company,
        batch_plan=plan,
        sha256_checksum=checksum,
        status=BMRDocumentAttachment.Status.ATTACHED,
    ).first()
    if duplicate:
        raise ValidationError({
            "file": f"This identical file was already attached to batch {batch_number} as '{duplicate.document_name}' (ID: {duplicate.id})."
        })

    # Version tracking per document type for this plan
    existing_same_type = BMRDocumentAttachment.objects.filter(
        company=company,
        batch_plan=plan,
        document_type=document_type,
    ).order_by("-version").first()

    next_version = (existing_same_type.version + 1) if existing_same_type else 1

    doc_name = (document_name or file_obj.name or f"BMR_{batch_number}_{document_type}").strip()
    mime_type, _ = mimetypes.guess_type(file_obj.name)
    mime_type = mime_type or "application/octet-stream"

    attachment = BMRDocumentAttachment(
        company=company,
        batch_plan=plan,
        batch_number=batch_number,
        product_name_snapshot=plan.product_name_snapshot,
        product_code_snapshot=plan.product_code_snapshot,
        bmr_number=bmr_number or getattr(plan, "packing_size_note", "") or "",
        document_name=doc_name,
        document_type=document_type,
        file=file_obj,
        file_size=size,
        mime_type=mime_type,
        sha256_checksum=checksum,
        version=next_version,
        status=BMRDocumentAttachment.Status.ATTACHED,
        remarks=remarks or "",
        uploaded_by=user,
    )
    attachment.save()
    return attachment


@transaction.atomic
def upload_coa_document(
    user,
    company,
    batch_plan_id=None,
    quality_case_id=None,
    batch_number=None,
    coa_number="",
    document_name="",
    qc_reference="",
    mfg_date=None,
    expiry_date=None,
    file_obj=None,
    remarks="",
):
    plan = None
    case = None

    if quality_case_id:
        try:
            case = BatchQualityCase.objects.select_related("batch_plan").get(pk=quality_case_id, company=company)
            plan = case.batch_plan
        except BatchQualityCase.DoesNotExist:
            raise ValidationError({"quality_case_id": "Quality case not found for this company."})
    elif batch_plan_id:
        try:
            plan = BatchPlan.objects.get(pk=batch_plan_id, company=company)
            case = getattr(plan, "quality_case", None)
        except BatchPlan.DoesNotExist:
            raise ValidationError({"batch_plan_id": "Batch plan not found for this company."})

    resolved_batch_number = batch_number or ""
    if case and case.batch_number_snapshot:
        resolved_batch_number = case.batch_number_snapshot
    elif plan and hasattr(plan, "number_allocation") and plan.number_allocation:
        resolved_batch_number = plan.number_allocation.number
    elif plan:
        resolved_batch_number = f"BP-{plan.id}"

    if not resolved_batch_number:
        raise ValidationError({"batch_number": "Batch number is required."})

    product_name = plan.product_name_snapshot if plan else (case.product_name_snapshot if case else "Pharmaceutical Product")
    product_code = plan.product_code_snapshot if plan else (case.product_code_snapshot if case else "")

    checksum, size = calculate_file_hash_and_size(file_obj)

    # Duplicate check
    duplicate = COADocumentAttachment.objects.filter(
        company=company,
        batch_number=resolved_batch_number,
        sha256_checksum=checksum,
    ).exclude(status=COADocumentAttachment.Status.ARCHIVED).first()

    if duplicate:
        raise ValidationError({
            "file": f"This identical COA file was already uploaded for batch {resolved_batch_number} (COA #{duplicate.coa_number})."
        })

    # Version tracking for COA of this batch
    last_coa = COADocumentAttachment.objects.filter(
        company=company,
        batch_number=resolved_batch_number,
    ).order_by("-version").first()

    next_version = (last_coa.version + 1) if last_coa else 1

    doc_name = (document_name or file_obj.name or f"COA_{resolved_batch_number}").strip()
    mime_type, _ = mimetypes.guess_type(file_obj.name)
    mime_type = mime_type or "application/pdf"

    # Mandatory rule: COA upload NEVER automatically approves
    coa = COADocumentAttachment(
        company=company,
        batch_plan=plan,
        quality_case=case,
        batch_number=resolved_batch_number,
        product_name_snapshot=product_name,
        product_code_snapshot=product_code,
        coa_number=coa_number.strip(),
        document_name=doc_name,
        qc_reference=qc_reference or "",
        mfg_date=mfg_date,
        expiry_date=expiry_date,
        file=file_obj,
        file_size=size,
        mime_type=mime_type,
        sha256_checksum=checksum,
        version=next_version,
        status=COADocumentAttachment.Status.PENDING_APPROVAL,
        qc_status="PASSED",
        qa_status="PENDING",
        remarks=remarks or "",
        uploaded_by=user,
    )
    coa.save()

    # If linked to quality case, update coa_document_reference so existing screens see the reference
    if case:
        case.coa_document_reference = coa.coa_number
        case.save(update_fields=["coa_document_reference", "updated_at"])

    return coa


@transaction.atomic
def approve_coa_document(user, company, coa_id, remarks=""):
    try:
        coa = COADocumentAttachment.objects.select_for_update().get(pk=coa_id, company=company)
    except COADocumentAttachment.DoesNotExist:
        raise ValidationError({"detail": "COA document not found."})

    if coa.status == COADocumentAttachment.Status.APPROVED:
        raise ValidationError({"detail": "This COA document is already approved."})

    now = timezone.now()
    coa.status = COADocumentAttachment.Status.APPROVED
    coa.qa_status = "APPROVED"
    coa.approved_by = user
    coa.approved_at = now
    coa.approval_remarks = remarks or ""
    coa.save()

    # Sync with BatchQualityCase and immutable BatchQualityDecision
    case = coa.quality_case
    if not case and coa.batch_plan_id:
        case = BatchQualityCase.objects.filter(batch_plan_id=coa.batch_plan_id, company=company).first()

    if case:
        case.coa_status = BatchQualityCase.DecisionOutcome.APPROVED
        case.coa_document_reference = coa.coa_number
        case.version += 1
        case.save(update_fields=["coa_status", "coa_document_reference", "version", "updated_at"])

        BatchQualityDecision.objects.create(
            quality_case=case,
            decision_type=BatchQualityDecision.DecisionType.COA,
            outcome=BatchQualityDecision.Outcome.APPROVED,
            previous_status="PENDING",
            new_status="APPROVED",
            decided_by=user,
            remarks=remarks or f"Approved physical COA {coa.coa_number}",
            document_reference=coa.coa_number,
        )

    return coa


@transaction.atomic
def reject_coa_document(user, company, coa_id, reason):
    if not (reason or "").strip():
        raise ValidationError({"reason": "Rejection reason is required."})

    try:
        coa = COADocumentAttachment.objects.select_for_update().get(pk=coa_id, company=company)
    except COADocumentAttachment.DoesNotExist:
        raise ValidationError({"detail": "COA document not found."})

    if coa.status == COADocumentAttachment.Status.APPROVED:
        raise ValidationError({"detail": "An already approved COA document cannot be rejected directly. Upload a superseding revision."})

    coa.status = COADocumentAttachment.Status.REJECTED
    coa.qa_status = "REJECTED"
    coa.rejection_reason = reason.strip()
    coa.save()

    case = coa.quality_case
    if not case and coa.batch_plan_id:
        case = BatchQualityCase.objects.filter(batch_plan_id=coa.batch_plan_id, company=company).first()

    if case:
        case.coa_status = BatchQualityCase.DecisionOutcome.REJECTED
        case.version += 1
        case.save(update_fields=["coa_status", "version", "updated_at"])

        BatchQualityDecision.objects.create(
            quality_case=case,
            decision_type=BatchQualityDecision.DecisionType.COA,
            outcome=BatchQualityDecision.Outcome.REJECTED,
            previous_status="PENDING",
            new_status="REJECTED",
            decided_by=user,
            remarks=reason,
            document_reference=coa.coa_number,
        )

    return coa


def get_document_register_summary(company):
    plans = BatchPlan.objects.filter(company=company)
    total_batches = plans.count()

    bmr_attachments = list(BMRDocumentAttachment.objects.filter(company=company, status=BMRDocumentAttachment.Status.ATTACHED))
    total_bmr_documents = len(bmr_attachments)

    # Group BMR attachments by batch_plan_id and verify physical file
    bmr_by_plan = {}
    missing_files_bmr = 0
    for att in bmr_attachments:
        if att.is_physically_attached:
            bmr_by_plan.setdefault(att.batch_plan_id, []).append(att)
        else:
            missing_files_bmr += 1

    fully_attached_batches = 0
    partially_attached_batches = 0
    for pid, atts in bmr_by_plan.items():
        # Has master BMR or multiple slips
        has_master = any(a.document_type == BMRDocumentAttachment.DocumentType.MASTER_BMR for a in atts)
        if has_master or len(atts) >= 2:
            fully_attached_batches += 1
        elif len(atts) > 0:
            partially_attached_batches += 1

    missing_bmr_batches = max(0, total_batches - (fully_attached_batches + partially_attached_batches))

    # COA summary
    coas = list(COADocumentAttachment.objects.filter(company=company))
    total_coa_records = len(coas)
    actual_coa_files_attached = sum(1 for c in coas if c.is_physically_attached)
    pending_qa_approval = sum(1 for c in coas if c.status == COADocumentAttachment.Status.PENDING_APPROVAL)
    approved_coas = sum(1 for c in coas if c.status == COADocumentAttachment.Status.APPROVED and c.is_physically_attached)
    rejected_coas = sum(1 for c in coas if c.status == COADocumentAttachment.Status.REJECTED)
    missing_coa_files = sum(1 for c in coas if not c.is_physically_attached)

    # Completion calculation
    total_required = total_batches * 2  # 1 BMR + 1 COA per batch
    total_completed = fully_attached_batches + approved_coas
    completion_percentage = round((total_completed / total_required) * 100, 1) if total_required > 0 else 0

    return {
        "bmr": {
            "total_batches": total_batches,
            "total_bmr_documents": total_bmr_documents,
            "fully_attached_batches": fully_attached_batches,
            "partially_attached_batches": partially_attached_batches,
            "missing_bmr_batches": missing_bmr_batches,
            "missing_physical_files": missing_files_bmr,
        },
        "coa": {
            "total_eligible_batches": total_batches,
            "total_coa_records": total_coa_records,
            "actual_coa_files_attached": actual_coa_files_attached,
            "pending_qa_approval": pending_qa_approval,
            "approved_coas": approved_coas,
            "rejected_coas": rejected_coas,
            "missing_coa_files": missing_coa_files,
        },
        "overall_completion_percentage": completion_percentage,
    }


def get_eligible_batches_for_documents(company):
    plans = BatchPlan.objects.filter(company=company).select_related(
        "quality_case"
    ).order_by("-created_at")

    results = []
    for plan in plans:
        # Determine batch number
        batch_number = ""
        if hasattr(plan, "number_allocation") and plan.number_allocation:
            batch_number = plan.number_allocation.number
        elif hasattr(plan, "quality_case") and plan.quality_case:
            batch_number = plan.quality_case.batch_number_snapshot
        if not batch_number:
            batch_number = f"BP-{plan.id}"

        results.append({
            "batch_plan_id": plan.id,
            "quality_case_id": plan.quality_case.id if hasattr(plan, "quality_case") and plan.quality_case else None,
            "batch_number": batch_number,
            "product_name": plan.product_name_snapshot,
            "product_code": plan.product_code_snapshot,
            "created_at": plan.created_at,
        })
    return results

