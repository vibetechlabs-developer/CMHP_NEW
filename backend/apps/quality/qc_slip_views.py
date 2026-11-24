from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.companies.models import Company
from apps.companies.services import active_companies_for_user
from apps.quality.models import QcSlipRecord
from apps.quality.qc_slip_serializers import QcSlipRecordSerializer


class QcSlipRecordListCreateView(APIView):
    """GET and POST endpoints for order-wise, type-wise QC slip records.
    Persists slip data (Bulk Release, Test Request) independently per order.
    """

    permission_classes = [IsAuthenticated]

    def _resolve_company(self, request, company_id=None):
        if company_id:
            return Company.objects.filter(pk=company_id).first()
        user_companies = active_companies_for_user(request.user)
        return user_companies.first()

    def get(self, request, company_id=None):
        company = self._resolve_company(request, company_id)
        qs = QcSlipRecord.objects.all()
        if company:
            qs = qs.filter(company=company)

        order_id = request.query_params.get("order_id") or request.query_params.get("orderId")
        slip_kind = request.query_params.get("slip_kind") or request.query_params.get("slipKind")
        product_type = request.query_params.get("product_type") or request.query_params.get("productType")
        sub_kind = request.query_params.get("sub_kind") or request.query_params.get("subKind")
        slip_status = request.query_params.get("status")

        if order_id:
            qs = qs.filter(order_id=str(order_id))
        if slip_kind:
            qs = qs.filter(slip_kind=str(slip_kind))
        if product_type:
            qs = qs.filter(product_type=str(product_type))
        if sub_kind is not None:
            qs = qs.filter(sub_kind=str(sub_kind))
        if slip_status:
            qs = qs.filter(status=str(slip_status).upper())

        # If specific order & slip_kind queried, return detailed object
        if order_id and slip_kind:
            records = list(qs)
            if records:
                # If sub_kind requested or single record
                primary = records[0]
                return Response({
                    "found": True,
                    "data": primary.data,
                    "status": primary.status,
                    "record": QcSlipRecordSerializer(primary).data,
                    "records": QcSlipRecordSerializer(records, many=True).data,
                })
            return Response({"found": False, "data": None, "record": None, "records": []})

        serializer = QcSlipRecordSerializer(qs, many=True)
        return Response({
            "count": qs.count(),
            "results": serializer.data,
        })

    def post(self, request, company_id=None):
        company = self._resolve_company(request, company_id)
        payload = request.data or {}

        order_id = str(payload.get("order_id") or payload.get("orderId") or "").strip()
        slip_kind = str(payload.get("slip_kind") or payload.get("slipKind") or "").strip()
        product_type = str(payload.get("product_type") or payload.get("productType") or "").strip()
        sub_kind = str(payload.get("sub_kind") or payload.get("subKind") or "").strip()
        batch_no = str(payload.get("batch_no") or payload.get("batchNo") or "").strip()
        new_status = str(payload.get("status") or "SAVED").upper()
        data = payload.get("data") or {}

        if not order_id:
            return Response({"error": "order_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not slip_kind:
            return Response({"error": "slip_kind is required (bulk_release or test_request)"}, status=status.HTTP_400_BAD_REQUEST)

        from apps.bmr.models import ProductionOrderStatus
        pos = ProductionOrderStatus.objects.filter(company=company, order_id=order_id).first()
        if pos and pos.dispatch_status == ProductionOrderStatus.DispatchStatus.YES and pos.is_locked:
            if not pos.coa_returned:
                return Response(
                    {"error": "This order is dispatched and its QC slips are locked. Use 'Back to COA' in Records to unlock and make edits."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        defaults = {
            "batch_no": batch_no,
            "product_type": product_type,
            "data": data,
            "status": new_status,
        }
        if new_status == QcSlipRecord.Status.COMPLETED:
            defaults["completed_at"] = timezone.now()
        elif new_status == QcSlipRecord.Status.PENDING:
            defaults["completed_at"] = None

        record, created = QcSlipRecord.objects.update_or_create(
            company=company,
            order_id=order_id,
            product_type=product_type,
            slip_kind=slip_kind,
            sub_kind=sub_kind,
            defaults=defaults,
        )

        if pos and pos.coa_returned and new_status == QcSlipRecord.Status.COMPLETED:
            pos.coa_returned = False
            pos.save(update_fields=["coa_returned", "updated_at"])

        return Response({
            "success": True,
            "created": created,
            "record": QcSlipRecordSerializer(record).data,
        }, status=status.HTTP_200_OK if not created else status.HTTP_201_CREATED)


class QcSlipStatusUpdateView(APIView):
    """Endpoint to update status (COMPLETED / PENDING) for an order's QC slip."""

    permission_classes = [IsAuthenticated]

    def _resolve_company(self, request, company_id=None):
        if company_id:
            return Company.objects.filter(pk=company_id).first()
        user_companies = active_companies_for_user(request.user)
        return user_companies.first()

    def post(self, request, order_id=None, company_id=None):
        company = self._resolve_company(request, company_id)
        payload = request.data or {}

        target_order_id = str(order_id or payload.get("order_id") or payload.get("orderId") or "").strip()
        slip_kind = str(payload.get("slip_kind") or payload.get("slipKind") or "").strip()
        product_type = str(payload.get("product_type") or payload.get("productType") or "").strip()
        sub_kind = str(payload.get("sub_kind") or payload.get("subKind") or "").strip()
        target_status = str(payload.get("status") or "COMPLETED").upper()

        if not target_order_id or not slip_kind:
            return Response({"error": "order_id and slip_kind are required"}, status=status.HTTP_400_BAD_REQUEST)

        from apps.bmr.models import ProductionOrderStatus
        pos = ProductionOrderStatus.objects.filter(company=company, order_id=target_order_id).first()
        if pos and pos.dispatch_status == ProductionOrderStatus.DispatchStatus.YES and pos.is_locked:
            if not pos.coa_returned:
                return Response(
                    {"error": "This order is dispatched and its QC slips are locked. Use 'Back to COA' in Records to unlock and make edits."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        defaults = {
            "status": target_status,
            "batch_no": str(payload.get("batch_no") or payload.get("batchNo") or "").strip(),
        }
        if target_status == QcSlipRecord.Status.COMPLETED:
            defaults["completed_at"] = timezone.now()
        else:
            defaults["completed_at"] = None

        record, _ = QcSlipRecord.objects.update_or_create(
            company=company,
            order_id=target_order_id,
            product_type=product_type,
            slip_kind=slip_kind,
            sub_kind=sub_kind,
            defaults=defaults,
        )

        if pos and pos.coa_returned and target_status == QcSlipRecord.Status.COMPLETED:
            pos.coa_returned = False
            pos.save(update_fields=["coa_returned", "updated_at"])

        return Response({
            "success": True,
            "order_id": target_order_id,
            "slip_kind": slip_kind,
            "status": record.status,
            "completed_at": record.completed_at,
            "record": QcSlipRecordSerializer(record).data,
        })
