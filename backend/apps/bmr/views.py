from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import models, transaction
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import record
from apps.batch_plans.models import BatchPlan
from apps.batch_plans.views import _get_company_for_action
from apps.bmr.models import BatchManufacturingRecord, BMRLine, BMRDocument, ProductionOrderStatus
from apps.bmr.serializers import (
    BMRLineSerializer,
    BMRLineUpdateSerializer,
    BMRSerializer,
    BMRDocumentSerializer,
    ProductionOrderStatusSerializer,
)
from apps.bmr.services import create_bmr, update_bmr_line
from apps.common.errors import translate_django_validation_error
from apps.companies.services import active_companies_for_user
from apps.permissions.services import user_has_permission
from apps.quality.models import BatchQualityCase, BatchQualityDecision

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
    Superusers holding company membership are permitted.
    """
    user = request.user
    if not user or not user.is_authenticated:
        raise exceptions.NotAuthenticated("Authentication credentials were not provided.")
    company = active_companies_for_user(user).filter(pk=company_id).first()
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
