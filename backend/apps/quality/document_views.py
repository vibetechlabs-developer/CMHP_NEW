import os
from django.db import models
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.bmr.models import BMRDocumentAttachment
from apps.common.errors import translate_django_validation_error
from apps.common.pagination import BoundedPageNumberPagination
from apps.companies.services import active_companies_for_user
from apps.permissions.services import user_has_permission
from apps.quality.document_serializers import (
    BMRDocumentAttachmentSerializer,
    BMRDocumentUploadSerializer,
    COAApprovalActionSerializer,
    COADocumentAttachmentSerializer,
    COADocumentUploadSerializer,
    COARejectionActionSerializer,
)
from apps.quality.document_services import (
    approve_coa_document,
    get_document_register_summary,
    get_eligible_batches_for_documents,
    reject_coa_document,
    upload_bmr_document,
    upload_coa_document,
)
from apps.quality.models import COADocumentAttachment

BATCH_QUALITY_VIEW = "batch_quality.view"
BATCH_QUALITY_COA_APPROVE = "batch_quality.coa_approve"
BMR_VIEW = "bmr.view"
BATCH_PLANS_VIEW = "batch_plans.view"


def _get_company_for_read(request, company_id):
    company = active_companies_for_user(request.user).filter(pk=company_id).first()
    if company is None:
        raise exceptions.NotFound("Company not found or access denied.")
    return company


def _get_company_for_approval(request, company_id):
    company = _get_company_for_read(request, company_id)
    if not (user_has_permission(request.user, company, BATCH_QUALITY_COA_APPROVE) or request.user.is_superuser):
        raise exceptions.PermissionDenied("You do not have permission to approve or reject COA documents.")
    return company


@method_decorator(never_cache, name="dispatch")
class DocumentSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        company = _get_company_for_read(request, company_id)
        summary = get_document_register_summary(company)
        return Response(summary)


@method_decorator(never_cache, name="dispatch")
class EligibleBatchesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        company = _get_company_for_read(request, company_id)
        batches = get_eligible_batches_for_documents(company)
        return Response(batches)


@method_decorator(never_cache, name="dispatch")
class BMRDocumentListView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, company_id):
        company = _get_company_for_read(request, company_id)
        qs = BMRDocumentAttachment.objects.filter(company=company)

        # Filters
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                models.Q(batch_number__icontains=search)
                | models.Q(document_name__icontains=search)
                | models.Q(product_name_snapshot__icontains=search)
                | models.Q(bmr_number__icontains=search)
            )

        doc_type = (request.query_params.get("document_type") or "").strip()
        if doc_type:
            qs = qs.filter(document_type=doc_type)

        batch_number = (request.query_params.get("batch_number") or "").strip()
        if batch_number:
            qs = qs.filter(batch_number__icontains=batch_number)

        status_val = (request.query_params.get("status") or "").strip()
        if status_val:
            qs = qs.filter(status=status_val)

        paginator = BoundedPageNumberPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        if page is not None:
            serializer = BMRDocumentAttachmentSerializer(page, many=True)
            return paginator.get_paginated_response(serializer.data)

        serializer = BMRDocumentAttachmentSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request, company_id):
        company = _get_company_for_read(request, company_id)
        serializer = BMRDocumentUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            attachment = upload_bmr_document(
                user=request.user,
                company=company,
                batch_plan_id=serializer.validated_data["batch_plan_id"],
                document_type=serializer.validated_data["document_type"],
                document_name=serializer.validated_data.get("document_name", ""),
                bmr_number=serializer.validated_data.get("bmr_number", ""),
                file_obj=serializer.validated_data["file"],
                remarks=serializer.validated_data.get("remarks", ""),
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc)

        return Response(BMRDocumentAttachmentSerializer(attachment).data, status=status.HTTP_201_CREATED)


@method_decorator(never_cache, name="dispatch")
class BMRDocumentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, attachment_id):
        company = _get_company_for_read(request, company_id)
        attachment = get_object_or_404(BMRDocumentAttachment, pk=attachment_id, company=company)
        return Response(BMRDocumentAttachmentSerializer(attachment).data)


@method_decorator(never_cache, name="dispatch")
class BMRDocumentDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, attachment_id):
        company = _get_company_for_read(request, company_id)
        attachment = get_object_or_404(BMRDocumentAttachment, pk=attachment_id, company=company)

        if not attachment.file or not os.path.exists(attachment.file.path):
            raise Http404("Document file does not exist on storage.")

        inline = request.query_params.get("inline", "false").lower() == "true"
        content_type = attachment.mime_type or "application/octet-stream"

        response = FileResponse(
            open(attachment.file.path, "rb"),
            content_type=content_type,
            as_attachment=not inline,
            filename=os.path.basename(attachment.file.name),
        )
        return response


@method_decorator(never_cache, name="dispatch")
class BMRDocumentVersionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, attachment_id):
        company = _get_company_for_read(request, company_id)
        attachment = get_object_or_404(BMRDocumentAttachment, pk=attachment_id, company=company)
        versions = BMRDocumentAttachment.objects.filter(
            company=company,
            batch_plan_id=attachment.batch_plan_id,
            document_type=attachment.document_type,
        ).order_by("-version")
        serializer = BMRDocumentAttachmentSerializer(versions, many=True)
        return Response(serializer.data)


@method_decorator(never_cache, name="dispatch")
class COADocumentListView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, company_id):
        company = _get_company_for_read(request, company_id)
        qs = COADocumentAttachment.objects.filter(company=company)

        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                models.Q(batch_number__icontains=search)
                | models.Q(coa_number__icontains=search)
                | models.Q(document_name__icontains=search)
                | models.Q(product_name_snapshot__icontains=search)
            )

        status_val = (request.query_params.get("status") or "").strip()
        if status_val:
            qs = qs.filter(status=status_val)

        batch_number = (request.query_params.get("batch_number") or "").strip()
        if batch_number:
            qs = qs.filter(batch_number__icontains=batch_number)

        paginator = BoundedPageNumberPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        if page is not None:
            serializer = COADocumentAttachmentSerializer(page, many=True)
            return paginator.get_paginated_response(serializer.data)

        serializer = COADocumentAttachmentSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request, company_id):
        company = _get_company_for_read(request, company_id)
        serializer = COADocumentUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            coa = upload_coa_document(
                user=request.user,
                company=company,
                batch_plan_id=serializer.validated_data.get("batch_plan_id"),
                quality_case_id=serializer.validated_data.get("quality_case_id"),
                batch_number=serializer.validated_data.get("batch_number"),
                coa_number=serializer.validated_data["coa_number"],
                document_name=serializer.validated_data.get("document_name", ""),
                qc_reference=serializer.validated_data.get("qc_reference", ""),
                mfg_date=serializer.validated_data.get("mfg_date"),
                expiry_date=serializer.validated_data.get("expiry_date"),
                file_obj=serializer.validated_data["file"],
                remarks=serializer.validated_data.get("remarks", ""),
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc)

        return Response(COADocumentAttachmentSerializer(coa).data, status=status.HTTP_201_CREATED)


@method_decorator(never_cache, name="dispatch")
class COADocumentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, coa_id):
        company = _get_company_for_read(request, company_id)
        coa = get_object_or_404(COADocumentAttachment, pk=coa_id, company=company)
        return Response(COADocumentAttachmentSerializer(coa).data)


@method_decorator(never_cache, name="dispatch")
class COADocumentDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, coa_id):
        company = _get_company_for_read(request, company_id)
        coa = get_object_or_404(COADocumentAttachment, pk=coa_id, company=company)

        if not coa.file or not os.path.exists(coa.file.path):
            raise Http404("COA file does not exist on storage.")

        inline = request.query_params.get("inline", "false").lower() == "true"
        content_type = coa.mime_type or "application/pdf"

        response = FileResponse(
            open(coa.file.path, "rb"),
            content_type=content_type,
            as_attachment=not inline,
            filename=os.path.basename(coa.file.name),
        )
        return response


@method_decorator(never_cache, name="dispatch")
class COADocumentApproveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, coa_id):
        company = _get_company_for_approval(request, company_id)
        serializer = COAApprovalActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            coa = approve_coa_document(
                user=request.user,
                company=company,
                coa_id=coa_id,
                remarks=serializer.validated_data.get("remarks", ""),
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc)

        return Response(COADocumentAttachmentSerializer(coa).data)


@method_decorator(never_cache, name="dispatch")
class COADocumentRejectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, coa_id):
        company = _get_company_for_approval(request, company_id)
        serializer = COARejectionActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            coa = reject_coa_document(
                user=request.user,
                company=company,
                coa_id=coa_id,
                reason=serializer.validated_data["reason"],
            )
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc)

        return Response(COADocumentAttachmentSerializer(coa).data)


@method_decorator(never_cache, name="dispatch")
class COADocumentVersionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, coa_id):
        company = _get_company_for_read(request, company_id)
        coa = get_object_or_404(COADocumentAttachment, pk=coa_id, company=company)
        versions = COADocumentAttachment.objects.filter(
            company=company,
            batch_number=coa.batch_number,
        ).order_by("-version")
        serializer = COADocumentAttachmentSerializer(versions, many=True)
        return Response(serializer.data)
