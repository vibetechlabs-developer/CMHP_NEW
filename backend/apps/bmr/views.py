from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import models, transaction
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from django.utils import timezone
from apps.audit.services import record
from apps.batch_plans.models import BatchPlan
from apps.batch_plans.views import _get_company_for_action
from apps.bmr.models import (
    BatchManufacturingRecord,
    BMRLine,
    BMRDocument,
    ProductionOrderStatus,
    OrderDocumentRecord,
    OrderDispatchAuditLog,
    DispatchRecord,
)
from apps.bmr.serializers import (
    BMRLineSerializer,
    BMRLineUpdateSerializer,
    BMRSerializer,
    BMRDocumentSerializer,
    ProductionOrderStatusSerializer,
    OrderDocumentRecordSerializer,
    OrderDispatchAuditLogSerializer,
    DispatchRecordSerializer,
)
from apps.bmr.services import create_bmr, update_bmr_line
from apps.common.errors import translate_django_validation_error
from apps.companies.models import Company
from apps.companies.services import active_companies_for_user
from apps.permissions.services import user_has_permission
from apps.quality.models import BatchQualityCase, BatchQualityDecision, QcSlipRecord, COADocumentAttachment
from apps.sales_orders.models import SalesOrder
from apps.formulas.models import ProductFormulaSlip, Product

BMR_VIEW = "bmr.view"
BMR_CREATE = "bmr.create"
BMR_EDIT = "bmr.edit"
BATCH_PLANS_VIEW = "batch_plans.view"
BATCH_PLANS_EDIT = "batch_plans.edit"
FORMULAS_VIEW = "formulas.view"
BATCH_QUALITY_QA_RELEASE = "batch_quality.qa_release"
BATCH_QUALITY_VIEW = "batch_quality.view"


def _get_company_for_action_any(request, company_id, *permitted_codes):
    """Unknown/inactive company or no active membership -> 404;
    membership present but none of the permitted codes held -> 403 naming them.
    Superusers holding company membership or active staff are permitted.
    """
    user = request.user
    if not user or not user.is_authenticated:
        raise exceptions.NotAuthenticated("Authentication credentials were not provided.")
    company = active_companies_for_user(user).filter(pk=company_id).first()
    if company is None and (user.is_superuser or user.is_staff):
        company = Company.objects.filter(pk=company_id, is_active=True).first()
    if company is None:
        raise exceptions.NotFound("Company not found.")
    if user.is_superuser:
        return company
    if permitted_codes:
        if not any(user_has_permission(user, company, code) for code in permitted_codes):
            raise exceptions.PermissionDenied(
                f"One of the following permission(s) is required: {', '.join(permitted_codes)}."
            )
    return company


@method_decorator(never_cache, name="dispatch")
class BMRForPlanView(APIView):
    """GET: the BMR of a batch plan (404 if none yet) - `bmr.view`.
    POST: create it from the requirement preview - `bmr.create` plus
    `batch_plans.view` and `formulas.view` (the preview reads the pinned revision).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, plan_id):
        company = _get_company_for_action(request, company_id, BMR_VIEW, BATCH_PLANS_VIEW)
        plan = get_object_or_404(BatchPlan, pk=plan_id, company=company)
        bmr = BatchManufacturingRecord.objects.filter(batch_plan=plan).first()
        if bmr is None:
            raise exceptions.NotFound("No batch manufacturing record has been created for this batch plan yet.")
        return Response(BMRSerializer(bmr).data)

    def post(self, request, company_id, plan_id):
        company = _get_company_for_action(request, company_id, BMR_CREATE, BATCH_PLANS_VIEW, FORMULAS_VIEW)
        try:
            bmr = create_bmr(actor=request.user, company=company, batch_plan_id=plan_id)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(BMRSerializer(BatchManufacturingRecord.objects.get(pk=bmr.pk)).data, status=201)


@method_decorator(never_cache, name="dispatch")
class BMRLineDetailView(APIView):
    """PATCH one slip line's free-text fields - `bmr.view` and `bmr.edit`.
    Required quantities cannot be changed through this endpoint.
    """

    permission_classes = [IsAuthenticated]

    def patch(self, request, company_id, bmr_id, line_id):
        company = _get_company_for_action(request, company_id, BMR_VIEW, BMR_EDIT)
        bmr = get_object_or_404(BatchManufacturingRecord, pk=bmr_id, company=company)
        serializer = BMRLineUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        expected_version = data.pop("expected_version")
        try:
            line = update_bmr_line(actor=request.user, bmr=bmr, line_id=line_id, expected_version=expected_version, data=data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(BMRLineSerializer(BMRLine.objects.get(pk=line.pk)).data)


@method_decorator(never_cache, name="dispatch")
class BMRDocumentListCreateView(APIView):
    """GET / POST endpoints for full persistent BMR documents in PostgreSQL DB.
    Enforces authentication, company membership, and role-based permissions.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, company_id=None):
        user = request.user
        if company_id:
            company = _get_company_for_action_any(request, company_id, BMR_VIEW, BATCH_PLANS_VIEW)
            qs = BMRDocument.objects.filter(company=company)
        else:
            user_companies = active_companies_for_user(user)
            if not user_companies.exists():
                return Response({"found": False, "data": None, "document": None})
            qs = BMRDocument.objects.filter(company__in=user_companies)

        order_id = request.query_params.get("orderId") or request.query_params.get("order_id")
        batch_no = request.query_params.get("batchNo") or request.query_params.get("batch_no")
        bmr_type = (request.query_params.get("type") or request.query_params.get("bmrType") or "").lower()

        if order_id:
            qs = qs.filter(order_id=str(order_id))
        elif batch_no:
            qs = qs.filter(batch_no=str(batch_no))

        if bmr_type:
            qs = qs.filter(bmr_type=bmr_type)

        doc = qs.first()
        if doc:
            return Response({"found": True, "data": doc.data, "document": BMRDocumentSerializer(doc).data})
        return Response({"found": False, "data": None, "document": None})

    def post(self, request, company_id=None):
        payload = request.data or {}
        order_id = str(payload.get("orderId") or payload.get("order_id") or "")
        batch_no = str(payload.get("batchNo") or payload.get("batch_no") or "")
        bmr_type = str(payload.get("bmrType") or payload.get("type") or "drops").lower()
        data = payload.get("data") or {}
        is_draft = bool(payload.get("isDraft") or payload.get("is_draft", True))

        if not order_id and not batch_no:
            return Response({"error": "orderId or batchNo is required"}, status=400)

        cid = company_id or payload.get("companyId") or payload.get("company_id")
        if not cid:
            user_companies = active_companies_for_user(request.user)
            if user_companies.count() == 1:
                cid = user_companies.first().id
            else:
                return Response({"error": "companyId is required for BMR document persistence"}, status=400)

        company = _get_company_for_action_any(request, cid, BMR_EDIT, BMR_CREATE, BATCH_PLANS_EDIT)

        if order_id and ProductionOrderStatus.objects.filter(
            company=company, order_id=str(order_id), dispatch_status="YES", is_locked=True
        ).exists():
            return Response(
                {"error": "This order has been dispatched and its BMR is locked in Records. Return to Production to edit."},
                status=403,
            )

        with transaction.atomic():
            doc = None
            if order_id:
                doc = BMRDocument.objects.select_for_update().filter(company=company, order_id=order_id, bmr_type=bmr_type).first()
            if not doc and batch_no:
                doc = BMRDocument.objects.select_for_update().filter(company=company, batch_no=batch_no, bmr_type=bmr_type).first()

            if doc:
                doc.data = data
                doc.batch_no = batch_no or doc.batch_no
                doc.order_id = order_id or doc.order_id
                doc.is_draft = is_draft
                doc.company = company
                doc.save()
            else:
                doc = BMRDocument.objects.create(
                    company=company,
                    order_id=order_id,
                    batch_no=batch_no,
                    bmr_type=bmr_type,
                    data=data,
                    is_draft=is_draft,
                )

            record(
                actor=request.user,
                action="bmr_document.saved",
                target_type="BMRDocument",
                target_id=doc.id,
                company=company,
                after={"order_id": order_id, "batch_no": batch_no, "is_draft": is_draft, "bmr_type": bmr_type},
            )

        return Response(
            {
                "success": True,
                "savedAt": doc.updated_at.isoformat(),
                "document": BMRDocumentSerializer(doc).data,
            },
            status=200,
        )


@method_decorator(never_cache, name="dispatch")
class BMRDocumentDetailView(APIView):
    """GET / PUT / DELETE for specific order BMR document."""

    permission_classes = [IsAuthenticated]

    def get(self, request, order_id, company_id=None):
        user = request.user
        if company_id:
            company = _get_company_for_action_any(request, company_id, BMR_VIEW, BATCH_PLANS_VIEW)
            qs = BMRDocument.objects.filter(company=company, order_id=str(order_id))
        else:
            user_companies = active_companies_for_user(user)
            if not user_companies.exists():
                return Response({"found": False, "data": None, "document": None})
            qs = BMRDocument.objects.filter(company__in=user_companies, order_id=str(order_id))

        bmr_type = (request.query_params.get("type") or request.query_params.get("bmrType") or "").lower()
        batch_no = request.query_params.get("batchNo") or request.query_params.get("batch_no")

        if bmr_type:
            qs = qs.filter(bmr_type=bmr_type)

        doc = qs.first()
        if not doc and batch_no:
            qs_batch = BMRDocument.objects.filter(batch_no=str(batch_no))
            if company_id:
                qs_batch = qs_batch.filter(company=company)
            else:
                qs_batch = qs_batch.filter(company__in=user_companies)
            if bmr_type:
                qs_batch = qs_batch.filter(bmr_type=bmr_type)
            doc = qs_batch.first()

        if doc:
            return Response({"found": True, "data": doc.data, "document": BMRDocumentSerializer(doc).data})
        return Response({"found": False, "data": None, "document": None})


@method_decorator(never_cache, name="dispatch")
class ProductionOrderStatusListCreateView(APIView):
    """GET: list all production statuses for a company.
    POST: upsert the production status for an order.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, company_id=None):
        user = request.user
        if company_id:
            company = _get_company_for_action_any(request, company_id, BMR_VIEW, BATCH_PLANS_VIEW)
            qs = ProductionOrderStatus.objects.filter(company=company)
        else:
            user_companies = active_companies_for_user(user)
            qs = ProductionOrderStatus.objects.filter(company__in=user_companies)

        order_id = request.query_params.get("order_id") or request.query_params.get("orderId")
        if order_id:
            qs = qs.filter(order_id=str(order_id))
        return Response(ProductionOrderStatusSerializer(qs, many=True).data)

    def post(self, request, company_id=None):
        payload = request.data or {}
        order_id = str(payload.get("order_id") or payload.get("orderId") or "")
        if not order_id:
            return Response({"error": "order_id is required"}, status=400)

        # SECURITY RULE: Block direct qa_status modification via generic creation endpoint
        if "qa_status" in payload:
            raise exceptions.ValidationError(
                {"qa_status": "Direct modification of qa_status via production status endpoints is prohibited. QA batch release must be performed via the dedicated QA release workflow."}
            )

        cid = company_id or payload.get("company_id") or payload.get("companyId")
        if not cid:
            user_companies = active_companies_for_user(request.user)
            if user_companies.count() == 1:
                cid = user_companies.first().id
            else:
                return Response({"error": "company_id is required"}, status=400)

        company = _get_company_for_action_any(request, cid, BMR_EDIT, BATCH_PLANS_EDIT)

        with transaction.atomic():
            obj, _ = ProductionOrderStatus.objects.update_or_create(
                company=company,
                order_id=order_id,
                defaults={
                    "order_reference": str(payload.get("order_reference") or payload.get("orderReference") or ""),
                    "batch_no": str(payload.get("batch_no") or ""),
                    "bmr_status": str(payload.get("bmr_status") or "NO"),
                    "production_status": str(payload.get("production_status") or "In Planning"),
                    "production_remark": str(payload.get("production_remark") or payload.get("remark") or ""),
                    "packaging_status": str(payload.get("packaging_status") or "Pending"),
                    "dispatch_status": str(payload.get("dispatch_status") or payload.get("dispatch") or "NO"),
                    "qa_remark": str(payload.get("qa_remark") or ""),
                },
            )
            record(
                actor=request.user,
                action="production_order.status_updated",
                target_type="ProductionOrderStatus",
                target_id=obj.id,
                company=company,
                after={"order_id": order_id, "production_status": obj.production_status, "packaging_status": obj.packaging_status},
            )
        return Response(ProductionOrderStatusSerializer(obj).data, status=200)


@method_decorator(never_cache, name="dispatch")
class ProductionOrderStatusDetailView(APIView):
    """PATCH: partially update one order's production status."""

    permission_classes = [IsAuthenticated]

    def get(self, request, order_id, company_id=None):
        user = request.user
        if company_id:
            company = _get_company_for_action_any(request, company_id, BMR_VIEW, BATCH_PLANS_VIEW)
            qs = ProductionOrderStatus.objects.filter(company=company, order_id=str(order_id))
        else:
            user_companies = active_companies_for_user(user)
            qs = ProductionOrderStatus.objects.filter(company__in=user_companies, order_id=str(order_id))

        obj = qs.first()
        if not obj:
            return Response({"found": False}, status=404)
        return Response({"found": True, "data": ProductionOrderStatusSerializer(obj).data})

    def patch(self, request, order_id, company_id=None):
        payload = request.data or {}

        # CRITICAL SECURITY RULE: Block direct qa_status modification via generic PATCH
        if "qa_status" in payload:
            raise exceptions.ValidationError(
                {"qa_status": "Direct modification of qa_status via generic PATCH is prohibited. QA batch release must be performed via the dedicated QA release workflow."}
            )

        cid = company_id or payload.get("company_id") or payload.get("companyId")
        if cid:
            company = _get_company_for_action_any(request, cid, BMR_EDIT, BATCH_PLANS_EDIT)
        else:
            user_companies = active_companies_for_user(request.user)
            if user_companies.count() == 1:
                company = user_companies.first()
            else:
                return Response({"error": "company_id is required"}, status=400)

        with transaction.atomic():
            qs = ProductionOrderStatus.objects.select_for_update().filter(company=company, order_id=str(order_id))
            obj = qs.first()
            if obj and obj.dispatch_status == ProductionOrderStatus.DispatchStatus.YES and obj.is_locked:
                return Response(
                    {"error": "This order is dispatched and locked in Records. Return to Production to edit."},
                    status=403,
                )
            if not obj:
                obj = ProductionOrderStatus(
                    company=company,
                    order_id=str(order_id),
                )

            # Prevent dispatch without QA release
            dispatch_val = payload.get("dispatch_status") or payload.get("dispatch")
            if dispatch_val == "YES" and obj.qa_status != "RELEASED":
                raise exceptions.ValidationError(
                    {"dispatch_status": "Cannot dispatch order before QA release approval is granted."}
                )

            FIELD_MAP = {
                "bmr_status": "bmr_status",
                "production_status": "production_status",
                "production_remark": "production_remark",
                "remark": "production_remark",
                "packaging_status": "packaging_status",
                "dispatch_status": "dispatch_status",
                "dispatch": "dispatch_status",
                "batch_no": "batch_no",
                "order_reference": "order_reference",
            }
            before_snapshot = {
                "production_status": obj.production_status,
                "packaging_status": obj.packaging_status,
                "dispatch_status": obj.dispatch_status,
                "bmr_status": obj.bmr_status,
            }
            for src, dest in FIELD_MAP.items():
                if src in payload:
                    setattr(obj, dest, str(payload[src]))

            obj.save()
            after_snapshot = {
                "production_status": obj.production_status,
                "packaging_status": obj.packaging_status,
                "dispatch_status": obj.dispatch_status,
                "bmr_status": obj.bmr_status,
            }
            record(
                actor=request.user,
                action="production_order.patched",
                target_type="ProductionOrderStatus",
                target_id=obj.id,
                company=company,
                before=before_snapshot,
                after=after_snapshot,
            )

        return Response(ProductionOrderStatusSerializer(obj).data)


@method_decorator(never_cache, name="dispatch")
class ProductionOrderQaReleaseView(APIView):
    """Dedicated endpoint to execute authorized QA release for a production order.
    Requires BATCH_QUALITY_QA_RELEASE permission in the company.
    Validates QC approval before QA release.
    Records immutable audit log.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, order_id):
        company = _get_company_for_action_any(request, company_id, BATCH_QUALITY_QA_RELEASE)
        payload = request.data or {}
        outcome = str(payload.get("outcome") or payload.get("decision") or "RELEASED").upper()
        remarks = str(payload.get("remarks") or payload.get("reason") or "").strip()

        if outcome in ("REJECTED", "HOLD") and not remarks:
            raise exceptions.ValidationError({"remarks": "Remarks are mandatory for a rejection or hold decision."})

        if outcome not in ("RELEASED", "APPROVED", "REJECTED", "HOLD"):
            raise exceptions.ValidationError({"outcome": "Outcome must be one of RELEASED, APPROVED, REJECTED, HOLD."})

        normalized_outcome = "RELEASED" if outcome in ("RELEASED", "APPROVED") else ("REJECTED" if outcome == "REJECTED" else "HOLD")

        with transaction.atomic():
            obj, _ = ProductionOrderStatus.objects.select_for_update().get_or_create(
                company=company,
                order_id=str(order_id),
                defaults={
                    "order_reference": str(payload.get("order_reference") or ""),
                    "batch_no": str(payload.get("batch_no") or ""),
                },
            )

            # Validate that if releasing, QC is not rejected
            if normalized_outcome == "RELEASED":
                q_filters = models.Q()
                if obj.batch_no:
                    q_filters |= models.Q(batch_number_snapshot=obj.batch_no)
                if str(order_id).isdigit():
                    q_filters |= models.Q(batch_plan__sales_order_line__sales_order__id=int(order_id))
                elif obj.order_reference:
                    q_filters |= models.Q(batch_plan__sales_order_line__sales_order__reference=obj.order_reference)

                batch_case = BatchQualityCase.objects.filter(company=company).filter(q_filters).first() if q_filters else None
                if batch_case:
                    latest_qc = batch_case.decisions.filter(
                        decision_type=BatchQualityDecision.DecisionType.BATCH_QC
                    ).order_by("-decided_at", "-id").first()
                    if latest_qc and latest_qc.outcome != BatchQualityDecision.Outcome.APPROVED:
                        raise exceptions.ValidationError(
                            {"detail": f"QA release is allowed only when Batch QC is APPROVED. Current QC status: {latest_qc.outcome}."}
                        )

            prev_qa_status = obj.qa_status
            obj.qa_status = normalized_outcome
            obj.qa_remark = remarks
            obj.save()

            record(
                actor=request.user,
                action="production_order.qa_release",
                target_type="ProductionOrderStatus",
                target_id=obj.id,
                company=company,
                before={"qa_status": prev_qa_status},
                after={"qa_status": obj.qa_status, "outcome": normalized_outcome, "remarks": remarks},
            )

        return Response(ProductionOrderStatusSerializer(obj).data, status=200)


@method_decorator(never_cache, name="dispatch")
class OrderSendToRecordsActionView(APIView):
    """POST: Atomically move an order to Records.
    Validates that BMR and QC/COA are completed.
    Marks in_records=True, locks the order and all its production/QC documents,
    removes it from active Production, QC, QA and Orders list,
    and logs the action in the audit log.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, order_id, company_id=None):
        cid = company_id or request.data.get("company_id") or request.data.get("companyId")
        if cid:
            company = _get_company_for_action_any(request, cid, BMR_EDIT, BATCH_PLANS_EDIT)
        else:
            user_companies = active_companies_for_user(request.user)
            if user_companies.count() == 1:
                company = user_companies.first()
            else:
                return Response({"error": "company_id is required"}, status=400)

        str_order_id = str(order_id).strip()
        pos = ProductionOrderStatus.objects.filter(company=company, order_id=str_order_id).first()

        # Idempotence: If already in records, succeed cleanly without duplicate actions
        if pos and (pos.in_records or pos.dispatch_status == ProductionOrderStatus.DispatchStatus.YES):
            return Response({
                "success": True,
                "message": f"Order #{str_order_id} is already in Records.",
                "sent_to_records_at": pos.sent_to_records_at.isoformat() if pos.sent_to_records_at else (pos.dispatched_at.isoformat() if pos.dispatched_at else None),
            }, status=200)

        # Look up sales order details
        so = None
        if str_order_id.isdigit():
            so = SalesOrder.objects.filter(company=company, id=int(str_order_id)).prefetch_related("lines").first()
        if not so and pos and pos.order_reference:
            so = SalesOrder.objects.filter(company=company, reference=pos.order_reference).prefetch_related("lines").first()

        product_type = "tablet"
        if so and so.lines.exists():
            first_line = so.lines.first()
            product_type = first_line.product_type_snapshot or "tablet"

        norm_type = product_type.lower().replace("-", "").replace(" ", "")
        requires_bmr = not any(k in norm_type for k in ["kit", "pill", "capsule"])

        pending = []

        # 1. Check BMR complete
        bmr_done = False
        if pos and pos.bmr_status == ProductionOrderStatus.BmrStatus.YES:
            bmr_done = True
        elif BMRDocument.objects.filter(company=company, order_id=str_order_id, is_draft=False).exists():
            bmr_done = True
        elif BMRDocument.objects.filter(company=company, order_id=str_order_id).exists():
            bmr_done = True
        elif OrderDocumentRecord.objects.filter(company=company, order_id=str_order_id, doc_type=OrderDocumentRecord.DocType.BMR).exists():
            bmr_done = True

        if requires_bmr and not bmr_done:
            pending.append("BMR not completed")

        # 2. Check QC / COA complete
        qc_done = False
        if pos and pos.qa_status in ("RELEASED", "APPROVED") and not pos.coa_returned:
            qc_done = True
        elif QcSlipRecord.objects.filter(company=company, order_id=str_order_id, status=QcSlipRecord.Status.COMPLETED).exists():
            qc_done = True
        elif OrderDocumentRecord.objects.filter(company=company, order_id=str_order_id, doc_type__in=[OrderDocumentRecord.DocType.COA, OrderDocumentRecord.DocType.ATTACHMENT_3], status=OrderDocumentRecord.Status.COMPLETED).exists():
            qc_done = True

        if not qc_done:
            pending.append("COA pending")

        if pending:
            return Response({
                "error": f"Cannot move order to Records. Pending: {', '.join(pending)}.",
                "pending": pending,
            }, status=400)

        with transaction.atomic():
            now = timezone.now()
            batch_no = pos.batch_no if pos and pos.batch_no else (getattr(so.lines.first(), 'batch_number_snapshot', getattr(so.lines.first(), 'batch_no', '')) if so and so.lines.exists() else "")
            order_ref = pos.order_reference if pos and pos.order_reference else (so.reference if so else f"SO-{str_order_id}")

            if not pos:
                pos = ProductionOrderStatus.objects.create(
                    company=company,
                    order_id=str_order_id,
                    order_reference=order_ref,
                    batch_no=batch_no,
                    bmr_status=ProductionOrderStatus.BmrStatus.YES,
                    production_status="Completed",
                    packaging_status="Completed",
                    dispatch_status=ProductionOrderStatus.DispatchStatus.YES,
                    in_records=True,
                    sent_to_records_at=now,
                    sent_to_records_by=request.user,
                    dispatched_at=now,
                    dispatched_by=request.user,
                    is_locked=True,
                    coa_returned=False,
                    production_returned=False,
                )
            else:
                pos.in_records = True
                pos.sent_to_records_at = now
                pos.sent_to_records_by = request.user
                pos.dispatch_status = ProductionOrderStatus.DispatchStatus.YES
                pos.production_status = "Completed"
                pos.packaging_status = "Completed"
                pos.dispatched_at = now
                pos.dispatched_by = request.user
                pos.is_locked = True
                pos.coa_returned = False
                pos.production_returned = False
                pos.save()

            # Update sales order stage
            if so:
                so.workflow_stage = "READY_TO_INVOICE"
                so.save(update_fields=["workflow_stage"])

            # Lock all documents for this order except invoice (which can be created later)
            OrderDocumentRecord.objects.filter(company=company, order_id=str_order_id).exclude(doc_type=OrderDocumentRecord.DocType.INVOICE).update(is_locked=True)
            QcSlipRecord.objects.filter(company=company, order_id=str_order_id).update(status=QcSlipRecord.Status.COMPLETED)
            BMRDocument.objects.filter(company=company, order_id=str_order_id).update(is_draft=False)

            # Create Audit Log
            OrderDispatchAuditLog.objects.create(
                company=company,
                order_id=str_order_id,
                order_reference=order_ref,
                action=OrderDispatchAuditLog.Action.SEND_TO_RECORDS,
                actor=request.user,
                actor_username=request.user.username,
                reason=request.data.get("reason") or "Order moved to Records dossier",
                metadata={"product_type": product_type, "batch_no": batch_no},
            )

        return Response({
            "success": True,
            "message": f"Order #{str_order_id} moved to Records successfully.",
            "sent_to_records_at": pos.sent_to_records_at.isoformat() if pos.sent_to_records_at else None,
            "dispatched_at": pos.dispatched_at.isoformat() if pos.dispatched_at else None,
        }, status=200)


@method_decorator(never_cache, name="dispatch")
class OrderDispatchActionView(OrderSendToRecordsActionView):
    """Backward-compatible alias for OrderSendToRecordsActionView."""
    pass


@method_decorator(never_cache, name="dispatch")
class OrderReturnToProductionActionView(APIView):
    """POST: Return an order from Records back to active Production.
    Unlocks BMR and production documents, marks order as in planning,
    and removes it from Records and Dispatch until re-dispatched.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, order_id, company_id=None):
        cid = company_id or request.data.get("company_id") or request.data.get("companyId")
        if cid:
            company = _get_company_for_action_any(request, cid, BMR_EDIT, BATCH_PLANS_EDIT)
        else:
            user_companies = active_companies_for_user(request.user)
            if user_companies.count() == 1:
                company = user_companies.first()
            else:
                return Response({"error": "company_id is required"}, status=400)

        str_order_id = str(order_id).strip()
        pos = ProductionOrderStatus.objects.filter(company=company, order_id=str_order_id).first()
        if not pos:
            return Response({"error": f"Production order #{str_order_id} not found."}, status=404)

        if pos.physically_dispatched:
            return Response({
                "error": "This order has already been physically dispatched from the facility and cannot be returned to production."
            }, status=400)

        reason = request.data.get("reason") or "Returned to production for modifications"

        with transaction.atomic():
            now = timezone.now()
            pos.in_records = False
            pos.dispatch_status = ProductionOrderStatus.DispatchStatus.NO
            pos.production_status = "In Planning"
            pos.is_locked = False
            pos.production_returned = True
            pos.production_returned_at = now
            pos.production_returned_by = request.user
            pos.production_return_reason = reason
            pos.save()

            # Also update sales order if present
            so = None
            if str_order_id.isdigit():
                so = SalesOrder.objects.filter(company=company, id=int(str_order_id)).first()
            if not so and pos.order_reference:
                so = SalesOrder.objects.filter(company=company, reference=pos.order_reference).first()
            if so:
                so.workflow_stage = "PRODUCTION"
                so.save(update_fields=["workflow_stage"])

            # Unlock documents for editing
            OrderDocumentRecord.objects.filter(company=company, order_id=str_order_id).update(is_locked=False)
            BMRDocument.objects.filter(company=company, order_id=str_order_id).update(is_draft=True)

            OrderDispatchAuditLog.objects.create(
                company=company,
                order_id=str_order_id,
                order_reference=pos.order_reference,
                action=OrderDispatchAuditLog.Action.RETURN_TO_PRODUCTION,
                actor=request.user,
                actor_username=request.user.username,
                reason=reason,
                metadata={"previous_dispatch_at": pos.dispatched_at.isoformat() if pos.dispatched_at else None},
            )

        return Response({
            "success": True,
            "message": f"Order #{str_order_id} returned to Production successfully.",
        }, status=200)


@method_decorator(never_cache, name="dispatch")
class OrderBackToCoaActionView(APIView):
    """POST: Send an order's COA back to QC for revision.
    Unlocks QC/COA documents while keeping BMR and other attachments locked.
    Shows 'COA returned to QC' badge in Records until re-completed in QC.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, order_id, company_id=None):
        cid = company_id or request.data.get("company_id") or request.data.get("companyId")
        if cid:
            company = _get_company_for_action_any(request, cid, BMR_EDIT, BATCH_PLANS_EDIT, BATCH_QUALITY_VIEW)
        else:
            user_companies = active_companies_for_user(request.user)
            if user_companies.count() == 1:
                company = user_companies.first()
            else:
                return Response({"error": "company_id is required"}, status=400)

        str_order_id = str(order_id).strip()
        pos = ProductionOrderStatus.objects.filter(company=company, order_id=str_order_id).first()
        if not pos:
            return Response({"error": f"Production order #{str_order_id} not found."}, status=404)

        reason = request.data.get("reason") or "Returned to QC for COA revision"

        with transaction.atomic():
            now = timezone.now()
            pos.coa_returned = True
            pos.coa_returned_at = now
            pos.coa_returned_by = request.user
            pos.coa_return_reason = reason
            pos.qa_status = "Pending"
            pos.save()

            so = None
            if str_order_id.isdigit():
                so = SalesOrder.objects.filter(company=company, id=int(str_order_id)).first()
            if not so and pos.order_reference:
                so = SalesOrder.objects.filter(company=company, reference=pos.order_reference).first()
            if so:
                so.workflow_stage = "QC_PENDING"
                so.save(update_fields=["workflow_stage"])

            # Unlock QC/COA documents
            OrderDocumentRecord.objects.filter(
                company=company, order_id=str_order_id, doc_type__in=["COA", "ATTACHMENT_2", "ATTACHMENT_3", "ATTACHMENT_5"]
            ).update(is_locked=False, status=OrderDocumentRecord.Status.PENDING)

            QcSlipRecord.objects.filter(company=company, order_id=str_order_id).update(status=QcSlipRecord.Status.PENDING)

            OrderDispatchAuditLog.objects.create(
                company=company,
                order_id=str_order_id,
                order_reference=pos.order_reference,
                action=OrderDispatchAuditLog.Action.BACK_TO_COA,
                actor=request.user,
                actor_username=request.user.username,
                reason=reason,
                metadata={"batch_no": pos.batch_no},
            )

        return Response({
            "success": True,
            "message": f"Order #{str_order_id} COA sent back to QC successfully.",
        }, status=200)


@method_decorator(never_cache, name="dispatch")
class RecordsOrderListView(APIView):
    """GET: List dispatched orders with complete metadata about Attachments 1-6, BMR, COA, Invoice.
    Optimized for fast performance with single-query prefetching and pagination.
    Shared by both Records and Dispatch pages.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, company_id=None):
        user = request.user
        cid = company_id or request.query_params.get("company_id")
        if cid:
            try:
                company = _get_company_for_action_any(
                    request,
                    cid,
                    BMR_VIEW,
                    BATCH_PLANS_VIEW,
                    "sales_orders.view",
                    "batch_quality.view",
                )
                comp_filter = models.Q(company=company)
            except (exceptions.NotFound, exceptions.PermissionDenied):
                user_companies = active_companies_for_user(user)
                if user.is_superuser and not user_companies.exists():
                    comp_filter = models.Q()
                else:
                    comp_filter = models.Q(company__in=user_companies)
        else:
            user_companies = active_companies_for_user(user)
            if user.is_superuser and not user_companies.exists():
                comp_filter = models.Q()
            else:
                comp_filter = models.Q(company__in=user_companies)

        # Base queryset: orders in records
        qs = ProductionOrderStatus.objects.filter(
            comp_filter,
        ).filter(
            models.Q(in_records=True) | models.Q(dispatch_status=ProductionOrderStatus.DispatchStatus.YES)
        ).select_related("company", "dispatched_by", "sent_to_records_by").order_by(
            models.F("sent_to_records_at").desc(nulls_last=True),
            models.F("dispatched_at").desc(nulls_last=True),
            models.F("updated_at").desc(),
            "-id",
        )

        # Query Filters
        search = (request.query_params.get("search") or "").strip().lower()
        product_type_filter = (request.query_params.get("product_type") or request.query_params.get("type") or "ALL").strip().lower()
        coa_status_filter = (request.query_params.get("coa_status") or "").strip()
        date_from = request.query_params.get("date_from") or request.query_params.get("from_date") or request.query_params.get("dateFrom")
        date_to = request.query_params.get("date_to") or request.query_params.get("to_date") or request.query_params.get("dateTo")

            if coa_status_filter == "coa_returned":
                qs = qs.filter(coa_returned=True)

        if date_from:
            qs = qs.filter(
                models.Q(sent_to_records_at__gte=f"{date_from} 00:00:00") |
                models.Q(dispatched_at__gte=f"{date_from} 00:00:00")
            )
        if date_to:
            qs = qs.filter(
                models.Q(sent_to_records_at__lte=f"{date_to} 23:59:59") |
                models.Q(dispatched_at__lte=f"{date_to} 23:59:59")
            )

            # Materialize orders list to merge with SalesOrders and documents
            pos_list = list(qs)
        except Exception as e:
            import logging
            logging.getLogger(__name__).exception("Failed to query dispatched ProductionOrderStatus: %s", e)
            return Response({"count": 0, "results": []})
        if not pos_list:
            return Response({"count": 0, "results": []})

        try:
            order_ids = [p.order_id for p in pos_list]

            # Prefetch SalesOrders for order details
            int_ids = [int(oid) for oid in order_ids if oid.isdigit()]
            so_by_id = {}
            so_by_ref = {}
            if int_ids:
                for so in SalesOrder.objects.filter(id__in=int_ids).select_related("customer", "company").prefetch_related("lines__product"):
                    so_by_id[str(so.id)] = so
                    if so.reference:
                        so_by_ref[so.reference] = so

            # Prefetch OrderDocumentRecord metadata
            docs_by_order = {}
            for doc in OrderDocumentRecord.objects.filter(order_id__in=order_ids).only(
                "id", "order_id", "doc_type", "sub_type", "title", "status", "is_locked"
            ):
                docs_by_order.setdefault(doc.order_id, []).append(doc)

            # Prefetch QcSlipRecord metadata
            qc_slips_by_order = {}
            for slip in QcSlipRecord.objects.filter(order_id__in=order_ids).only(
                "id", "order_id", "slip_kind", "sub_kind", "status"
            ):
                qc_slips_by_order.setdefault(slip.order_id, []).append(slip)

            # Prefetch BMRDocument metadata
            bmr_by_order = {}
            for bmr in BMRDocument.objects.filter(order_id__in=order_ids).only(
                "id", "order_id", "batch_no", "bmr_type", "is_draft"
            ):
                bmr_by_order[bmr.order_id] = bmr

            results = []
            for p in pos_list:
                so = so_by_id.get(p.order_id) or so_by_ref.get(p.order_reference)
                lines = list(so.lines.all()) if so else []
                first_line = lines[0] if lines else None

                # Product info
                product_name = first_line.product_name_snapshot if first_line and first_line.product_name_snapshot else (first_line.product.name if first_line and first_line.product else "Standard Pharmaceutical")
                product_code = first_line.product_code_snapshot if first_line and first_line.product_code_snapshot else (first_line.product.code if first_line and first_line.product else "")
                product_type = first_line.product_type_snapshot if first_line and first_line.product_type_snapshot else "tablet"
                batch_size = f"{first_line.quantity} {getattr(first_line, 'sales_uom_name_snapshot', '') or getattr(first_line, 'sales_uom_code_snapshot', '') or ''}".strip() if first_line else "1000 Units"
                company_name = getattr(p.company, 'display_name', getattr(p.company, 'name', getattr(p.company, 'code', 'CMHP'))) if p.company else (getattr(so.company, 'display_name', getattr(so.company, 'name', getattr(so.company, 'code', 'CMHP'))) if so and so.company else "CMHP")

                norm_type = product_type.lower().replace("-", "").replace(" ", "")
                norm_filter = product_type_filter.replace("-", "").replace(" ", "")
                if product_type_filter != "all" and norm_filter not in norm_type:
                    continue

                if search:
                    text = f"{p.order_reference} {p.order_id} {product_name} {product_code} {p.batch_no}".lower()
                    if search not in text:
                        continue

                # Determine documents presence
                order_docs = docs_by_order.get(p.order_id, [])
                order_qc_slips = qc_slips_by_order.get(p.order_id, [])
                bmr_doc = bmr_by_order.get(p.order_id)

                # Attachment 1 (RM Requisition Slip)
                att1 = next((d for d in order_docs if d.doc_type == OrderDocumentRecord.DocType.ATTACHMENT_1), None)
                att1_data = {
                    "exists": bool(att1) or True,  # Available for all products with formula
                    "id": att1.id if att1 else None,
                    "title": att1.title if att1 and att1.title else "RM Requisition Slip",
                    "doc_type": "ATTACHMENT_1",
                }

                # Attachment 2 (Test Request / Receipt)
                # Checks both OrderDocumentRecord and QcSlipRecord
                att2_docs = [d for d in order_docs if d.doc_type == OrderDocumentRecord.DocType.ATTACHMENT_2]
                att2_slips = [s for s in order_qc_slips if s.slip_kind == "test_request" and s.sub_kind in ("bulk", "before_filter", "")]

            is_mt = "mothertincture" in norm_type or "mt" in norm_type
            if is_mt:
                # Mother Tincture has two variants: Before Filter and After Filter
                items = [
                    {"title": "Test Request (Before Filter)", "sub_type": "before_filter", "doc_type": "ATTACHMENT_2", "exists": True},
                    {"title": "Test Request (After Filter)", "sub_type": "after_filter", "doc_type": "ATTACHMENT_5", "exists": True},
                ]
                att2_data = {
                    "exists": True,
                    "has_multiple": True,
                    "items": items,
                    "title": "Test Request (Before / After Filter)",
                }
            else:
                att2_exists = bool(att2_docs) or bool(att2_slips) or ("tablet" in norm_type or "syrup" in norm_type or "oil" in norm_type or "drops" in norm_type)
                att2_data = {
                    "exists": att2_exists,
                    "id": att2_docs[0].id if att2_docs else (att2_slips[0].id if att2_slips else None),
                    "title": "Test Request (Bulk)",
                    "doc_type": "ATTACHMENT_2",
                    "sub_type": "bulk",
                }

            # Attachment 3 (Bulk Release Slip)
            att3_doc = next((d for d in order_docs if d.doc_type == OrderDocumentRecord.DocType.ATTACHMENT_3), None)
            att3_slip = next((s for s in order_qc_slips if s.slip_kind == "bulk_release"), None)
            att3_exists = bool(att3_doc) or bool(att3_slip) or ("tablet" in norm_type or "syrup" in norm_type or "oil" in norm_type or is_mt or "drops" in norm_type)
            att3_data = {
                "exists": att3_exists,
                "id": att3_doc.id if att3_doc else (att3_slip.id if att3_slip else None),
                "title": "Bulk Release Slip",
                "doc_type": "ATTACHMENT_3",
            }

                # Attachment 4 (PM Requisition Slip)
                att4 = next((d for d in order_docs if d.doc_type == OrderDocumentRecord.DocType.ATTACHMENT_4), None)
                att4_data = {
                    "exists": bool(att4) or ("tablet" in norm_type or "syrup" in norm_type or "drops" in norm_type or "oil" in norm_type),
                    "id": att4.id if att4 else None,
                    "title": att4.title if att4 and att4.title else "PM Requisition Slip",
                    "doc_type": "ATTACHMENT_4",
                }

                # Attachment 5 (After Test / FP Slip)
                att5_doc = next((d for d in order_docs if d.doc_type == OrderDocumentRecord.DocType.ATTACHMENT_5), None)
                att5_slip = next((s for s in order_qc_slips if s.slip_kind == "test_request" and s.sub_kind in ("fp", "after_filter")), None)
                att5_exists = bool(att5_doc) or bool(att5_slip) or ("tablet" in norm_type or is_mt)
                att5_data = {
                    "exists": att5_exists,
                    "id": att5_doc.id if att5_doc else (att5_slip.id if att5_slip else None),
                    "title": "Test Request (MT/FP)" if not is_mt else "Test Request (After Filter)",
                    "doc_type": "ATTACHMENT_5",
                    "sub_type": "fp" if not is_mt else "after_filter",
                }

                # Attachment 6 (Finish Product Transfer Slip)
                att6 = next((d for d in order_docs if d.doc_type == OrderDocumentRecord.DocType.ATTACHMENT_6), None)
                att6_data = {
                    "exists": bool(att6),
                    "id": att6.id if att6 else None,
                    "title": "Finish Product Transfer Slip",
                    "doc_type": "ATTACHMENT_6",
                }

                # BMR
                has_bmr_type = not any(k in norm_type for k in ["kit", "pill", "capsule"])
                bmr_data = {
                    "exists": bool(bmr_doc) or (p.bmr_status == ProductionOrderStatus.BmrStatus.YES),
                    "has_bmr": has_bmr_type,
                    "id": bmr_doc.id if bmr_doc else None,
                    "title": "Batch Manufacturing Record",
                    "doc_type": "BMR",
                }

                # COA
                coa_doc = next((d for d in order_docs if d.doc_type == OrderDocumentRecord.DocType.COA), None)
                if p.coa_returned:
                    coa_data = {
                        "exists": False,
                        "coa_returned": True,
                        "title": "Certificate of Analysis",
                        "badge": "COA returned to QC",
                        "doc_type": "COA",
                    }
                else:
                    coa_data = {
                        "exists": bool(coa_doc) or True,
                        "coa_returned": False,
                        "id": coa_doc.id if coa_doc else None,
                        "title": "Certificate of Analysis",
                        "doc_type": "COA",
                    }

                # Invoice
                inv_doc = next((d for d in order_docs if d.doc_type == OrderDocumentRecord.DocType.INVOICE), None)
                invoice_data = {
                    "exists": bool(inv_doc),
                    "id": inv_doc.id if inv_doc else None,
                    "title": "Tax Invoice",
                    "doc_type": "INVOICE",
                }

            results.append({
                "id": p.order_id,
                "order_id": p.order_id,
                "order_number": p.order_reference or (so.reference if so else f"ORD-{p.order_id}"),
                "company_id": p.company_id,
                "company_name": company_name,
                "product_name": product_name,
                "product_code": product_code,
                "product_type": product_type,
                "product_type_display": product_type.title(),
                "batch_no": p.batch_no or (getattr(so.lines.first(), 'batch_number_snapshot', getattr(so.lines.first(), 'batch_no', '')) if so and so.lines.exists() else "—") or "—",
                "batch_size": batch_size,
                "sent_to_records_at": p.sent_to_records_at.isoformat() if p.sent_to_records_at else (p.dispatched_at.isoformat() if p.dispatched_at else p.updated_at.isoformat()),
                "sent_to_records_by": p.sent_to_records_by.username if p.sent_to_records_by else (p.dispatched_by.username if p.dispatched_by else "System"),
                "in_records": bool(p.in_records),
                "dispatched_at": p.dispatched_at.isoformat() if p.dispatched_at else p.updated_at.isoformat(),
                "dispatched_by": p.dispatched_by.username if p.dispatched_by else "System",
                "is_locked": p.is_locked,
                "physically_dispatched": p.physically_dispatched,
                "coa_returned": p.coa_returned,
                "production_returned": p.production_returned,
                "documents": {
                    "attachment_1": att1_data,
                    "attachment_2": att2_data,
                    "attachment_3": att3_data,
                    "attachment_4": att4_data,
                    "attachment_5": att5_data,
                    "attachment_6": att6_data,
                    "bmr": bmr_data,
                    "coa": coa_data,
                    "invoice": invoice_data,
                },
            })

            # Pagination
            try:
                page = max(1, int(request.query_params.get("page", 1)))
            except (ValueError, TypeError):
                page = 1
            try:
                page_size = max(1, min(100, int(request.query_params.get("page_size", 10))))
            except (ValueError, TypeError):
                page_size = 10

            total = len(results)
            start = (page - 1) * page_size
            end = start + page_size
            paginated_results = results[start:end]

            return Response({
                "count": total,
                "page": page,
                "page_size": page_size,
                "results": paginated_results,
            })
        except Exception as e:
            import logging
            logging.getLogger(__name__).exception("Failed to build records list: %s", e)
            return Response({"count": 0, "results": []})


@method_decorator(never_cache, name="dispatch")
class OrderDocumentDetailView(APIView):
    """GET-only: Fetch the complete content of a document (for read-only viewing and printing).
    Returns the JSON payload, title, file url, and locking metadata.
    POST, PUT, PATCH, DELETE are rejected with 405 Method Not Allowed.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, order_id, doc_type, company_id=None):
        cid = company_id or request.query_params.get("company_id")
        user = request.user
        if cid:
            company = _get_company_for_action_any(request, cid, BMR_VIEW, BATCH_PLANS_VIEW)
        else:
            user_companies = active_companies_for_user(user)
            company = user_companies.first()

        str_order_id = str(order_id).strip()
        sub_type = request.query_params.get("sub_type", "").strip()

        # Check OrderDocumentRecord first
        doc_qs = OrderDocumentRecord.objects.filter(
            order_id=str_order_id,
            doc_type=doc_type.upper(),
        )
        if company:
            doc_qs = doc_qs.filter(company=company)
        if sub_type:
            doc_qs = doc_qs.filter(sub_type=sub_type)

        doc = doc_qs.first()
        if doc and doc.data:
            return Response({
                "found": True,
                "order_id": str_order_id,
                "doc_type": doc.doc_type,
                "sub_type": doc.sub_type,
                "title": doc.title,
                "data": doc.data,
                "file_url": doc.file.url if doc.file else None,
                "is_locked": doc.is_locked,
                "updated_at": doc.updated_at.isoformat(),
            })

        # Fallback to specialized tables
        # 1. BMR
        if doc_type.upper() == "BMR":
            bmr = BMRDocument.objects.filter(order_id=str_order_id)
            if company:
                bmr = bmr.filter(company=company)
            bmr_obj = bmr.first()
            if bmr_obj and bmr_obj.data:
                return Response({
                    "found": True,
                    "order_id": str_order_id,
                    "doc_type": "BMR",
                    "sub_type": bmr_obj.bmr_type,
                    "title": f"{bmr_obj.bmr_type.title()} Batch Manufacturing Record",
                    "data": bmr_obj.data,
                    "file_url": None,
                    "is_locked": not bmr_obj.is_draft,
                    "updated_at": bmr_obj.updated_at.isoformat(),
                })

        # 2. QC Slips (Attachment 2, 3, 5)
        qc_kind_map = {
            "ATTACHMENT_2": ("test_request", "bulk"),
            "ATTACHMENT_3": ("bulk_release", ""),
            "ATTACHMENT_5": ("test_request", "fp"),
        }
        if doc_type.upper() in qc_kind_map:
            kind, default_sub = qc_kind_map[doc_type.upper()]
            target_sub = sub_type or default_sub
            slips = QcSlipRecord.objects.filter(order_id=str_order_id, slip_kind=kind)
            if company:
                slips = slips.filter(company=company)
            if target_sub:
                slip_obj = slips.filter(sub_kind=target_sub).first() or slips.first()
            else:
                slip_obj = slips.first()

            if slip_obj and slip_obj.data:
                return Response({
                    "found": True,
                    "order_id": str_order_id,
                    "doc_type": doc_type.upper(),
                    "sub_type": slip_obj.sub_kind,
                    "title": f"QC {kind.replace('_', ' ').title()}",
                    "data": slip_obj.data,
                    "file_url": None,
                    "is_locked": slip_obj.status == QcSlipRecord.Status.COMPLETED,
                    "updated_at": slip_obj.updated_at.isoformat(),
                })

        # 3. Formula slips fallback (Attachment 1 RM, Attachment 4 PM)
        formula_type_map = {
            "ATTACHMENT_1": ProductFormulaSlip.SlipType.RM,
            "ATTACHMENT_4": ProductFormulaSlip.SlipType.PM,
        }
        if doc_type.upper() in formula_type_map:
            stype = formula_type_map[doc_type.upper()]
            f_slip = ProductFormulaSlip.objects.filter(slip_type=stype)
            if company:
                f_slip = f_slip.filter(company=company)
            f_obj = f_slip.first()
            if f_obj and f_obj.data:
                return Response({
                    "found": True,
                    "order_id": str_order_id,
                    "doc_type": doc_type.upper(),
                    "sub_type": "",
                    "title": f"{stype} Requisition Slip",
                    "data": f_obj.data,
                    "file_url": None,
                    "is_locked": True,
                    "updated_at": f_obj.updated_at.isoformat(),
                })

        return Response({
            "found": False,
            "order_id": str_order_id,
            "doc_type": doc_type.upper(),
            "data": None,
        })

    def post(self, request, *args, **kwargs):
        return Response({"error": "Records documents are view-only. Modifications must be made via Return to Production or Back to COA."}, status=405)

    def put(self, request, *args, **kwargs):
        return Response({"error": "Records documents are view-only. Modifications must be made via Return to Production or Back to COA."}, status=405)

    def patch(self, request, *args, **kwargs):
        return Response({"error": "Records documents are view-only. Modifications must be made via Return to Production or Back to COA."}, status=405)

    def delete(self, request, *args, **kwargs):
        return Response({"error": "Records documents are view-only. Modifications must be made via Return to Production or Back to COA."}, status=405)


@method_decorator(never_cache, name="dispatch")
class OrderDocumentSaveView(APIView):
    """POST: Save or update an order document (Invoice, COA, Attachment 1-6).
    Enforces document lock: if the order is dispatched, rejects updates with 403 Forbidden
    unless the document is COA and coa_returned is True.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, order_id, company_id=None):
        payload = request.data or {}
        cid = company_id or payload.get("company_id") or payload.get("companyId")
        if cid:
            company = _get_company_for_action_any(request, cid, BMR_EDIT, BATCH_PLANS_EDIT, BATCH_QUALITY_VIEW)
        else:
            user_companies = active_companies_for_user(request.user)
            if user_companies.count() == 1:
                company = user_companies.first()
            else:
                return Response({"error": "company_id is required"}, status=400)

        str_order_id = str(order_id).strip()
        doc_type = str(payload.get("doc_type") or payload.get("docType") or "").strip().upper()
        sub_type = str(payload.get("sub_type") or payload.get("subType") or "").strip()
        title = str(payload.get("title") or "")
        data = payload.get("data") or {}
        batch_no = str(payload.get("batch_no") or payload.get("batchNo") or "")
        product_type = str(payload.get("product_type") or payload.get("productType") or "tablet")
        doc_status = str(payload.get("status") or OrderDocumentRecord.Status.COMPLETED).upper()

        if not doc_type:
            return Response({"error": "doc_type is required"}, status=400)

        # Enforce lock (allow COA if coa_returned, and always allow INVOICE)
        pos = ProductionOrderStatus.objects.filter(company=company, order_id=str_order_id).first()
        if pos and (pos.in_records or pos.dispatch_status == ProductionOrderStatus.DispatchStatus.YES) and pos.is_locked:
            is_coa_type = doc_type in ("COA", "ATTACHMENT_2", "ATTACHMENT_3", "ATTACHMENT_5")
            is_invoice_type = doc_type == "INVOICE"
            if not ((is_coa_type and pos.coa_returned) or is_invoice_type):
                return Response(
                    {"error": "This order is in Records and its production documents are locked. Use 'Return to Production' or 'Back to COA' to unlock."},
                    status=403,
                )

        record, created = OrderDocumentRecord.objects.update_or_create(
            company=company,
            order_id=str_order_id,
            doc_type=doc_type,
            sub_type=sub_type,
            defaults={
                "batch_no": batch_no or (pos.batch_no if pos else ""),
                "product_type": product_type,
                "title": title,
                "data": data,
                "status": doc_status,
                "is_locked": False if (pos and pos.coa_returned) else (pos.is_locked if pos else False),
            },
        )

        return Response({
            "success": True,
            "created": created,
            "document": OrderDocumentRecordSerializer(record).data,
        }, status=200 if not created else 201)


@method_decorator(never_cache, name="dispatch")
class OrderDocumentUploadView(APIView):
    """POST: Upload a file (carton/label specimen photo, signed slip, etc.) for an order document."""

    permission_classes = [IsAuthenticated]

    def post(self, request, order_id, company_id=None):
        file_obj = request.FILES.get("file") or request.FILES.get("image")
        if not file_obj:
            return Response({"error": "No file uploaded"}, status=400)

        cid = company_id or request.POST.get("company_id")
        if cid:
            company = _get_company_for_action_any(request, cid, BMR_EDIT, BATCH_PLANS_EDIT)
        else:
            company = active_companies_for_user(request.user).first()

        str_order_id = str(order_id).strip()
        doc_type = request.POST.get("doc_type", "SPECIMEN").upper()
        sub_type = request.POST.get("sub_type", "").strip()

        record, _ = OrderDocumentRecord.objects.update_or_create(
            company=company,
            order_id=str_order_id,
            doc_type=doc_type,
            sub_type=sub_type,
            defaults={
                "file": file_obj,
                "title": request.POST.get("title", file_obj.name),
                "status": OrderDocumentRecord.Status.COMPLETED,
            },
        )

        return Response({
            "success": True,
            "file_url": record.file.url,
            "id": record.id,
            "document": OrderDocumentRecordSerializer(record).data,
        }, status=200)


@method_decorator(never_cache, name="dispatch")
class DispatchTrackingListView(APIView):
    """GET: Real-time Live Order Tracking across manufacturing stages.
    Returns every order from creation until Dispatch Confirm (including after Records click).
    Computes live stage status from module data:
    Order Created -> QA -> Production (BMR) -> QC -> Invoice
    Colors: GREEN (completed), YELLOW (in progress), WHITE (not started/pending).
    Every stage before current one is green.
    """

    permission_classes = [IsAuthenticated]

    def _compute_stages(self, order_id, so, pos, docs, slips, bmr):
        # 1. Order Created: always green
        stage_order = "green"

        # 2. QA stage
        qa_approved = bool(pos and pos.qa_status in ("RELEASED", "APPROVED"))
        has_bmr = bool(bmr or (pos and pos.bmr_status == ProductionOrderStatus.BmrStatus.YES))
        prod_running = bool(pos and pos.production_status in ("In Progress", "Completed")) or bool(pos and pos.in_records)
        so_advanced = bool(so and so.workflow_stage in ("PRODUCTION", "QC_PENDING", "PACKAGING", "READY_TO_INVOICE", "PACKED", "DISPATCHED", "COMPLETED"))
        qa_completed = qa_approved or has_bmr or prod_running or so_advanced
        stage_qa = "green" if qa_completed else "yellow"

        # 3. Production (BMR) stage
        prod_completed = False
        if pos and (pos.bmr_status == ProductionOrderStatus.BmrStatus.YES or pos.production_status == "Completed" or pos.in_records):
            prod_completed = True
        elif bmr and not bmr.is_draft:
            prod_completed = True
        elif so and so.workflow_stage in ("QC_PENDING", "PACKAGING", "READY_TO_INVOICE", "PACKED", "DISPATCHED", "COMPLETED"):
            prod_completed = True

        prod_in_progress = (
            not prod_completed and (
                (pos and pos.production_status == "In Progress") or
                (bmr is not None) or
                (so and so.workflow_stage == "PRODUCTION") or
                (stage_qa == "green")
            )
        )
        stage_prod = "green" if prod_completed else ("yellow" if prod_in_progress else "white")

        # 4. QC stage
        qc_slip_done = any(s.status == QcSlipRecord.Status.COMPLETED for s in slips)
        qc_doc_done = any(d.doc_type in ("COA", "ATTACHMENT_3") and d.status == OrderDocumentRecord.Status.COMPLETED for d in docs)
        qc_returned = bool(pos and pos.coa_returned)

        qc_completed = not qc_returned and (qc_slip_done or qc_doc_done or (pos and pos.qa_status in ("RELEASED", "APPROVED") and prod_completed))
        qc_in_progress = not qc_completed and (
            qc_returned or
            (prod_completed and not qc_completed) or
            len(slips) > 0 or
            any(d.doc_type in ("COA", "ATTACHMENT_2", "ATTACHMENT_3", "ATTACHMENT_5") for d in docs)
        )
        stage_qc = "green" if qc_completed else ("yellow" if qc_in_progress else "white")

        # 5. Invoice stage
        has_inv_doc = any(d.doc_type == OrderDocumentRecord.DocType.INVOICE for d in docs)
        so_invoiced = bool(so and so.workflow_stage in ("PACKED", "DISPATCHED", "COMPLETED"))
        stage_invoice = "green" if (has_inv_doc or so_invoiced) else "white"

        # Strict sequential rule: every stage before the current one is green
        if stage_invoice == "green":
            stage_order = "green"
            stage_qa = "green"
            stage_prod = "green"
            stage_qc = "green"
        elif stage_qc in ("green", "yellow"):
            stage_order = "green"
            stage_qa = "green"
            stage_prod = "green"
        elif stage_prod in ("green", "yellow"):
            stage_order = "green"
            stage_qa = "green"
        elif stage_qa in ("green", "yellow"):
            stage_order = "green"

        stages = [
            {"key": "order_created", "label": "Order Created", "status": stage_order},
            {"key": "qa", "label": "QA", "status": stage_qa},
            {"key": "production", "label": "Production (BMR)", "status": stage_prod},
            {"key": "qc", "label": "QC", "status": stage_qc},
            {"key": "invoice", "label": "Invoice", "status": stage_invoice},
        ]

        done_count = sum(1 for s in stages if s["status"] == "green")
        blocking_stage = ""
        if done_count < 5:
            for s in stages:
                if s["status"] != "green":
                    st_desc = "in progress" if s["status"] == "yellow" else "pending"
                    blocking_stage = f"Cannot confirm dispatch: {s['label']} is {st_desc}."
                    break

        return stages, done_count, blocking_stage

    def get(self, request, company_id=None):
        user = request.user
        cid = company_id or request.query_params.get("company_id")
        if cid:
            company = _get_company_for_action_any(request, cid, BMR_VIEW, BATCH_PLANS_VIEW)
            comp_filter = models.Q(company=company)
        else:
            user_companies = active_companies_for_user(user)
            comp_filter = models.Q(company__in=user_companies)

        search = (request.query_params.get("search") or "").strip().lower()
        type_filter = (request.query_params.get("type") or request.query_params.get("product_type") or "ALL").strip().lower()
        company_filter = (request.query_params.get("company") or "ALL").strip().upper()
        date_from = request.query_params.get("date_from") or request.query_params.get("from_date") or request.query_params.get("dateFrom")
        date_to = request.query_params.get("date_to") or request.query_params.get("to_date") or request.query_params.get("dateTo")

        # Exclude confirmed dispatched orders from live tracking
        confirmed_order_ids = set(DispatchRecord.objects.filter(comp_filter).values_list("order_id", flat=True))

        # Query SalesOrders
        so_qs = SalesOrder.objects.filter(comp_filter).select_related("company", "customer").prefetch_related("lines__product").order_by("-order_date", "-id")
        so_list = [so for so in so_qs if str(so.id) not in confirmed_order_ids and (not so.reference or so.reference not in confirmed_order_ids)]

        pos_qs = ProductionOrderStatus.objects.filter(comp_filter).exclude(is_dispatch_confirmed=True).select_related("company", "dispatched_by")
        pos_by_order_id = {p.order_id: p for p in pos_qs if not p.is_dispatch_confirmed and p.order_id not in confirmed_order_ids}
        pos_by_ref = {p.order_reference: p for p in pos_qs if p.order_reference and not p.is_dispatch_confirmed and p.order_reference not in confirmed_order_ids}

        all_order_ids = set([str(so.id) for so in so_list] + list(pos_by_order_id.keys()))
        docs_by_order = {}
        for doc in OrderDocumentRecord.objects.filter(order_id__in=all_order_ids).only("id", "order_id", "doc_type", "sub_type", "status"):
            docs_by_order.setdefault(doc.order_id, []).append(doc)

        qc_slips_by_order = {}
        for slip in QcSlipRecord.objects.filter(order_id__in=all_order_ids).only("id", "order_id", "slip_kind", "status"):
            qc_slips_by_order.setdefault(slip.order_id, []).append(slip)

        bmrs_by_order = {}
        for bmr in BMRDocument.objects.filter(order_id__in=all_order_ids).only("id", "order_id", "is_draft"):
            bmrs_by_order[bmr.order_id] = bmr

        items = []
        seen_order_ids = set()

        for so in so_list:
            str_id = str(so.id)
            seen_order_ids.add(str_id)
            if so.reference:
                seen_order_ids.add(so.reference)

            pos = pos_by_order_id.get(str_id) or pos_by_ref.get(so.reference)
            if pos and pos.is_dispatch_confirmed:
                continue

            first_line = so.lines.first() if so.lines.exists() else None
            product_name = first_line.product_name_snapshot if first_line and first_line.product_name_snapshot else (first_line.product.name if first_line and first_line.product else "Standard Pharmaceutical")
            product_type = first_line.product_type_snapshot if first_line and first_line.product_type_snapshot else "tablet"
            batch_no = pos.batch_no if pos and pos.batch_no else (getattr(first_line, 'batch_number_snapshot', getattr(first_line, 'batch_no', '')) if first_line else "")
            company_name = getattr(so.company, 'display_name', getattr(so.company, 'name', 'CMHP'))

            stages, done_count, blocking_stage = self._compute_stages(str_id, so, pos, docs_by_order.get(str_id, []), qc_slips_by_order.get(str_id, []), bmrs_by_order.get(str_id))

            items.append({
                "order_id": str_id,
                "order_number": so.reference or f"#{str_id}",
                "company_id": so.company_id,
                "company_name": company_name,
                "product_name": product_name,
                "product_type": product_type,
                "product_type_display": product_type.title(),
                "batch_no": batch_no or "—",
                "order_date": so.order_date.strftime("%d-%m-%Y") if so.order_date else "—",
                "raw_order_date": so.order_date.isoformat() if so.order_date else None,
                "in_records": bool(pos and pos.in_records),
                "stages": stages,
                "done_count": done_count,
                "total_stages": 5,
                "can_confirm_dispatch": done_count == 5,
                "blocking_stage": blocking_stage,
            })

        for order_id, pos in pos_by_order_id.items():
            if order_id in seen_order_ids or pos.order_reference in seen_order_ids:
                continue
            if pos.is_dispatch_confirmed or order_id in confirmed_order_ids:
                continue
            seen_order_ids.add(order_id)

            company_name = getattr(pos.company, 'display_name', getattr(pos.company, 'name', 'CMHP')) if pos.company else 'CMHP'
            stages, done_count, blocking_stage = self._compute_stages(order_id, None, pos, docs_by_order.get(order_id, []), qc_slips_by_order.get(order_id, []), bmrs_by_order.get(order_id))

            items.append({
                "order_id": order_id,
                "order_number": pos.order_reference or f"#{order_id}",
                "company_id": pos.company_id or 2,
                "company_name": company_name,
                "product_name": "Pharmaceutical Formulation",
                "product_type": "tablet",
                "product_type_display": "Tablet",
                "batch_no": pos.batch_no or "—",
                "order_date": pos.created_at.strftime("%d-%m-%Y") if pos.created_at else "—",
                "raw_order_date": pos.created_at.strftime("%Y-%m-%d") if pos.created_at else None,
                "in_records": bool(pos.in_records),
                "stages": stages,
                "done_count": done_count,
                "total_stages": 5,
                "can_confirm_dispatch": done_count == 5,
                "blocking_stage": blocking_stage,
            })

        filtered = []
        for it in items:
            if company_filter != "ALL":
                if company_filter == "CMHP" and "cmhp" not in it["company_name"].lower():
                    continue
                if company_filter == "TEJ" and "tej" not in it["company_name"].lower():
                    continue
            if type_filter != "all" and type_filter not in it["product_type"].lower():
                continue
            if search:
                haystack = f"{it['order_number']} {it['order_id']} {it['product_name']} {it['batch_no']}".lower()
                if search not in haystack:
                    continue
            if date_from and it["raw_order_date"] and it["raw_order_date"] < date_from:
                continue
            if date_to and it["raw_order_date"] and it["raw_order_date"] > date_to:
                continue
            filtered.append(it)

        return Response({"count": len(filtered), "results": filtered})


@method_decorator(never_cache, name="dispatch")
class OrderDispatchConfirmActionView(APIView):
    """POST: Final Dispatch Confirmation.
    Validates that all 5 stages are GREEN (Order Created, QA, Production, QC, Invoice).
    Saves a permanent DispatchRecord, marks is_dispatch_confirmed=True,
    and removes the order from Live Tracking immediately while staying in Records.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, order_id, company_id=None):
        cid = company_id or request.data.get("company_id") or request.data.get("companyId")
        if cid:
            company = _get_company_for_action_any(request, cid, BMR_EDIT, BATCH_PLANS_EDIT)
        else:
            user_companies = active_companies_for_user(request.user)
            if user_companies.count() == 1:
                company = user_companies.first()
            else:
                return Response({"error": "company_id is required"}, status=400)

        str_order_id = str(order_id).strip()
        pos = ProductionOrderStatus.objects.filter(company=company, order_id=str_order_id).first()

        if pos and pos.is_dispatch_confirmed:
            return Response({"success": True, "message": f"Order #{str_order_id} dispatch has already been confirmed."}, status=200)

        so = None
        if str_order_id.isdigit():
            so = SalesOrder.objects.filter(company=company, id=int(str_order_id)).prefetch_related("lines").first()
        if not so and pos and pos.order_reference:
            so = SalesOrder.objects.filter(company=company, reference=pos.order_reference).prefetch_related("lines").first()

        docs = list(OrderDocumentRecord.objects.filter(company=company, order_id=str_order_id))
        slips = list(QcSlipRecord.objects.filter(company=company, order_id=str_order_id))
        bmr = BMRDocument.objects.filter(company=company, order_id=str_order_id).first()

        tracking_view = DispatchTrackingListView()
        stages, done_count, blocking = tracking_view._compute_stages(str_order_id, so, pos, docs, slips, bmr)

        # Allow saving invoice data passed in payload if not already in docs
        has_inv = any(d.doc_type == OrderDocumentRecord.DocType.INVOICE for d in docs)
        if not has_inv and request.data.get("invoice_data"):
            OrderDocumentRecord.objects.create(
                company=company,
                order_id=str_order_id,
                doc_type=OrderDocumentRecord.DocType.INVOICE,
                title="Tax Invoice",
                data=request.data.get("invoice_data"),
                status=OrderDocumentRecord.Status.COMPLETED,
            )
            done_count = 5

        if done_count < 5:
            return Response({"error": blocking or "Cannot confirm dispatch. All stages must be completed."}, status=400)

        with transaction.atomic():
            now = timezone.now()
            first_line = so.lines.first() if so and so.lines.exists() else None
            product_name = first_line.product_name_snapshot if first_line and first_line.product_name_snapshot else (first_line.product.name if first_line and first_line.product else "Standard Pharmaceutical")
            product_type = first_line.product_type_snapshot if first_line and first_line.product_type_snapshot else (pos.product_type if hasattr(pos, 'product_type') else "tablet")
            batch_no = pos.batch_no if pos and pos.batch_no else (getattr(first_line, 'batch_number_snapshot', getattr(first_line, 'batch_no', '')) if first_line else "")
            order_ref = pos.order_reference if pos and pos.order_reference else (so.reference if so else f"SO-{str_order_id}")
            order_date = so.order_date if so else (pos.created_at.date() if pos and pos.created_at else now.date())

            if not pos:
                pos = ProductionOrderStatus.objects.create(
                    company=company,
                    order_id=str_order_id,
                    order_reference=order_ref,
                    batch_no=batch_no,
                    bmr_status=ProductionOrderStatus.BmrStatus.YES,
                    production_status="Completed",
                    packaging_status="Completed",
                    dispatch_status=ProductionOrderStatus.DispatchStatus.YES,
                    in_records=True,
                    is_dispatch_confirmed=True,
                    physically_dispatched=True,
                    dispatched_at=now,
                    dispatched_by=request.user,
                )
            else:
                pos.is_dispatch_confirmed = True
                pos.physically_dispatched = True
                pos.dispatched_at = now
                pos.dispatched_by = request.user
                pos.save()

            if so:
                so.workflow_stage = "DISPATCHED"
                so.save(update_fields=["workflow_stage"])

            disp_rec = DispatchRecord.objects.create(
                company=company,
                order_id=str_order_id,
                order_reference=order_ref,
                product_name=product_name,
                product_type=product_type,
                batch_no=batch_no,
                order_date=order_date,
                dispatched_by=request.user,
                dispatched_by_username=request.user.username,
                notes=request.data.get("notes") or "Dispatch confirmed from Live Tracking",
            )

            OrderDispatchAuditLog.objects.create(
                company=company,
                order_id=str_order_id,
                order_reference=order_ref,
                action=OrderDispatchAuditLog.Action.DISPATCH_CONFIRM,
                actor=request.user,
                actor_username=request.user.username,
                reason=request.data.get("notes") or "Dispatch confirmed from Live Tracking",
                metadata={"product_name": product_name, "batch_no": batch_no},
            )

        return Response({
            "success": True,
            "message": f"Order #{str_order_id} dispatch confirmed successfully.",
            "dispatch_record": DispatchRecordSerializer(disp_rec).data,
        }, status=200)


@method_decorator(never_cache, name="dispatch")
class DispatchRecordListView(APIView):
    """GET: List confirmed dispatched orders.
    Shows Order No, Product, Order Date, Dispatch Date (dd-mm-yyyy), newest dispatch first.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, company_id=None):
        user = request.user
        cid = company_id or request.query_params.get("company_id")
        if cid:
            company = _get_company_for_action_any(request, cid, BMR_VIEW, BATCH_PLANS_VIEW)
            comp_filter = models.Q(company=company)
        else:
            user_companies = active_companies_for_user(user)
            comp_filter = models.Q(company__in=user_companies)

        qs = DispatchRecord.objects.filter(comp_filter).order_by("-dispatched_at", "-id")

        search = (request.query_params.get("search") or "").strip().lower()
        type_filter = (request.query_params.get("type") or request.query_params.get("product_type") or "ALL").strip().lower()
        company_filter = (request.query_params.get("company") or "ALL").strip().upper()
        date_from = request.query_params.get("date_from") or request.query_params.get("from_date") or request.query_params.get("dateFrom")
        date_to = request.query_params.get("date_to") or request.query_params.get("to_date") or request.query_params.get("dateTo")

        if type_filter != "all":
            qs = qs.filter(product_type__icontains=type_filter)
        if search:
            qs = qs.filter(
                models.Q(order_id__icontains=search) |
                models.Q(order_reference__icontains=search) |
                models.Q(product_name__icontains=search) |
                models.Q(batch_no__icontains=search)
            )
        if date_from:
            qs = qs.filter(dispatched_at__gte=f"{date_from} 00:00:00")
        if date_to:
            qs = qs.filter(dispatched_at__lte=f"{date_to} 23:59:59")

        results = []
        for r in qs:
            company_name = getattr(r.company, 'display_name', getattr(r.company, 'name', 'CMHP')) if r.company else 'CMHP'
            if company_filter != "ALL":
                if company_filter == "CMHP" and "cmhp" not in company_name.lower():
                    continue
                if company_filter == "TEJ" and "tej" not in company_name.lower():
                    continue

            results.append({
                "id": r.id,
                "order_id": r.order_id,
                "order_number": r.order_reference or f"#{r.order_id}",
                "company_id": r.company_id,
                "company_name": company_name,
                "product_name": r.product_name or "—",
                "product_type": r.product_type or "tablet",
                "product_type_display": (r.product_type or "tablet").title(),
                "batch_no": r.batch_no or "—",
                "order_date": r.order_date.strftime("%d-%m-%Y") if r.order_date else "—",
                "dispatch_date": r.dispatched_at.strftime("%d-%m-%Y") if r.dispatched_at else "—",
                "dispatched_at": r.dispatched_at.isoformat() if r.dispatched_at else None,
                "dispatched_by": r.dispatched_by_username or (r.dispatched_by.username if r.dispatched_by else "System"),
            })

        return Response({"count": len(results), "results": results})


