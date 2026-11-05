from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import models
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

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

BMR_VIEW = "bmr.view"
BMR_CREATE = "bmr.create"
BMR_EDIT = "bmr.edit"
BATCH_PLANS_VIEW = "batch_plans.view"
FORMULAS_VIEW = "formulas.view"


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
    """GET / POST endpoints for full persistent BMR documents in PostgreSQL DB."""

    permission_classes = [AllowAny]

    def get(self, request, company_id=None):
        order_id = request.query_params.get("orderId") or request.query_params.get("order_id")
        batch_no = request.query_params.get("batchNo") or request.query_params.get("batch_no")
        bmr_type = (request.query_params.get("type") or request.query_params.get("bmrType") or "").lower()

        qs = BMRDocument.objects.all()
        if company_id:
            qs = qs.filter(models.Q(company_id=company_id) | models.Q(company__isnull=True))

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

        # Look up existing doc to update or create new
        doc = None
        if order_id:
            doc = BMRDocument.objects.filter(order_id=order_id, bmr_type=bmr_type).first()
        if not doc and batch_no:
            doc = BMRDocument.objects.filter(batch_no=batch_no, bmr_type=bmr_type).first()

        if doc:
            doc.data = data
            doc.batch_no = batch_no or doc.batch_no
            doc.order_id = order_id or doc.order_id
            doc.is_draft = is_draft
            if company_id and not doc.company_id:
                doc.company_id = company_id
            doc.save()
        else:
            doc = BMRDocument.objects.create(
                company_id=company_id if company_id else None,
                order_id=order_id,
                batch_no=batch_no,
                bmr_type=bmr_type,
                data=data,
                is_draft=is_draft,
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

    permission_classes = [AllowAny]

    def get(self, request, order_id, company_id=None):
        bmr_type = (request.query_params.get("type") or request.query_params.get("bmrType") or "").lower()
        batch_no = request.query_params.get("batchNo") or request.query_params.get("batch_no")

        qs = BMRDocument.objects.filter(order_id=str(order_id))
        if bmr_type:
            qs = qs.filter(bmr_type=bmr_type)

        doc = qs.first()
        if not doc and batch_no:
            doc = BMRDocument.objects.filter(batch_no=str(batch_no)).first()

        if doc:
            return Response({"found": True, "data": doc.data, "document": BMRDocumentSerializer(doc).data})
        return Response({"found": False, "data": None, "document": None})



@method_decorator(never_cache, name="dispatch")
class ProductionOrderStatusListCreateView(APIView):
    """GET: list all production statuses for a company.
    POST: upsert the production status for an order.
    """

    permission_classes = [AllowAny]

    def get(self, request, company_id=None):
        qs = ProductionOrderStatus.objects.all()
        if company_id:
            qs = qs.filter(models.Q(company_id=company_id) | models.Q(company__isnull=True))
        order_id = request.query_params.get("order_id") or request.query_params.get("orderId")
        if order_id:
            qs = qs.filter(order_id=str(order_id))
        return Response(ProductionOrderStatusSerializer(qs, many=True).data)

    def post(self, request, company_id=None):
        payload = request.data or {}
        order_id = str(payload.get("order_id") or payload.get("orderId") or "")
        if not order_id:
            return Response({"error": "order_id is required"}, status=400)

        obj, _ = ProductionOrderStatus.objects.update_or_create(
            company_id=company_id if company_id else None,
            order_id=order_id,
            defaults={
                "order_reference": str(payload.get("order_reference") or payload.get("orderReference") or ""),
                "batch_no": str(payload.get("batch_no") or ""),
                "bmr_status": str(payload.get("bmr_status") or "NO"),
                "production_status": str(payload.get("production_status") or "In Planning"),
                "production_remark": str(payload.get("production_remark") or payload.get("remark") or ""),
                "packaging_status": str(payload.get("packaging_status") or "Pending"),
                "dispatch_status": str(payload.get("dispatch_status") or payload.get("dispatch") or "NO"),
                "qa_status": str(payload.get("qa_status") or "Pending"),
                "qa_remark": str(payload.get("qa_remark") or ""),
            },
        )
        return Response(ProductionOrderStatusSerializer(obj).data, status=200)


@method_decorator(never_cache, name="dispatch")
class ProductionOrderStatusDetailView(APIView):
    """PATCH: partially update one order's production status."""

    permission_classes = [AllowAny]

    def get(self, request, order_id, company_id=None):
        qs = ProductionOrderStatus.objects.filter(order_id=str(order_id))
        if company_id:
            qs = qs.filter(company_id=company_id)
        obj = qs.first()
        if not obj:
            return Response({"found": False}, status=404)
        return Response({"found": True, "data": ProductionOrderStatusSerializer(obj).data})

    def patch(self, request, order_id, company_id=None):
        payload = request.data or {}
        qs = ProductionOrderStatus.objects.filter(order_id=str(order_id))
        if company_id:
            qs = qs.filter(company_id=company_id)
        obj = qs.first()
        if not obj:
            obj = ProductionOrderStatus(
                company_id=company_id if company_id else None,
                order_id=str(order_id),
            )

        FIELD_MAP = {
            "bmr_status": "bmr_status",
            "production_status": "production_status",
            "production_remark": "production_remark",
            "remark": "production_remark",
            "packaging_status": "packaging_status",
            "dispatch_status": "dispatch_status",
            "dispatch": "dispatch_status",
            "qa_status": "qa_status",
            "qa_remark": "qa_remark",
            "batch_no": "batch_no",
            "order_reference": "order_reference",
        }
        for src, dest in FIELD_MAP.items():
            if src in payload:
                setattr(obj, dest, str(payload[src]))

        obj.save()
        return Response(ProductionOrderStatusSerializer(obj).data)
