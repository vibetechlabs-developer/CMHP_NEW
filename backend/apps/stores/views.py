from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions, generics
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.errors import translate_django_validation_error
from apps.common.pagination import BoundedPageNumberPagination
from apps.common.permissions import IsActiveSuperuser
from apps.common.validation import parse_strict_bool
from apps.permissions.models import StoreRole, StoreRoleAssignment
from apps.permissions.services import store_user_has_permission
from apps.stores.models import SharedStore, StorageLocation, StoreMembership
from apps.stores.serializers import (
    StorageLocationCreateSerializer,
    StorageLocationSerializer,
    StorageLocationUpdateSerializer,
    StoreCreateSerializer,
    StoreDetailSerializer,
    StoreMembershipCreateSerializer,
    StoreMembershipSerializer,
    StoreRoleAssignmentCreateSerializer,
    StoreRoleAssignmentSerializer,
    StoreSerializer,
    StoreUpdateSerializer,
)
from apps.stores.services import (
    active_stores_for_user,
    activate_location,
    activate_store,
    assign_store_membership,
    assign_store_membership_role,
    create_location,
    create_store,
    deactivate_location,
    deactivate_store,
    deactivate_store_membership,
    deactivate_store_membership_role,
    update_location,
    update_store,
)

User = get_user_model()

STORE_OVERVIEW_PERMISSION = "shared_store.view"
STORAGE_LOCATIONS_VIEW_PERMISSION = "storage_locations.view"


@method_decorator(never_cache, name="dispatch")
class MyStoresView(APIView):
    """GET /api/v1/stores/mine/ - Bearer access token required. Reuses
    active_stores_for_user() as-is, mirroring MyCompaniesView. Does not
    require or accept a company id - store access is independent of
    company membership entirely.
    """

    def get(self, request):
        stores = active_stores_for_user(request.user)
        return Response({"stores": StoreSerializer(stores, many=True).data})


@method_decorator(never_cache, name="dispatch")
class StoreOverviewView(APIView):
    """GET /api/v1/stores/<store_id>/overview/ - requires active store
    membership AND the `shared_store.view` permission - a deliberately
    stricter, and separate, authorization check from `/my-permissions/`
    (which only requires membership, to let a caller discover their own
    permission list even when it is empty) and from the superuser-only
    management endpoints below. Returns identity fields only - no stock/
    quantity/valuation metrics exist yet and none are invented here.
    """

    def get(self, request, store_id):
        store = active_stores_for_user(request.user).filter(pk=store_id).first()
        if store is None:
            raise NotFound("Store not found.")
        if not store_user_has_permission(request.user, store, STORE_OVERVIEW_PERMISSION):
            raise exceptions.PermissionDenied(
                f"The '{STORE_OVERVIEW_PERMISSION}' permission is required."
            )
        return Response({"id": store.id, "code": store.code, "name": store.name})


@method_decorator(never_cache, name="dispatch")
class StoreSummaryView(APIView):
    """GET /api/v1/stores/<store_id>/summary/ - returns aggregated store metrics
    for Common Inventory: active materials counts, posted/draft goods receipts,
    posted/draft issues, pending requisitions, and active ledger stock balances.
    All aggregations respect the caller's active store membership and company permissions.
    """

    def get(self, request, store_id):
        import datetime
        from decimal import Decimal
        from zoneinfo import ZoneInfo
        from django.conf import settings
        from django.utils import timezone
        from apps.catalog.models import Material, MaterialReorderSetting
        from apps.receiving.models import GoodsReceipt
        from apps.stock_movements.models import MaterialIssue, StockMovement, MaterialIssueMovement
        from apps.material_requisitions.models import MaterialRequisition
        from apps.stock_movements.services import (
            companies_with_receipt_view_access,
            compute_stock_balances,
            compute_issued_balances,
        )
        from apps.permissions.services import effective_store_permission_codes

        store = active_stores_for_user(request.user).filter(pk=store_id).first()
        if store is None:
            raise NotFound("Store not found.")
        if not store_user_has_permission(request.user, store, STORE_OVERVIEW_PERMISSION):
            raise exceptions.PermissionDenied(
                f"The '{STORE_OVERVIEW_PERMISSION}' permission is required."
            )

        business_tz = getattr(settings, "BUSINESS_TIME_ZONE", "Asia/Kolkata")
        today_business_date = timezone.now().astimezone(ZoneInfo(business_tz)).date()

        # Date range filters: ?date_from=YYYY-MM-DD & ?date_to=YYYY-MM-DD (or ?posted_from / ?posted_to)
        raw_from = request.query_params.get("date_from") or request.query_params.get("posted_from")
        raw_to = request.query_params.get("date_to") or request.query_params.get("posted_to")
        date_from = None
        date_to = None
        if raw_from:
            try:
                date_from = datetime.date.fromisoformat(raw_from.strip())
            except ValueError:
                raise exceptions.ValidationError({"date_from": "Must be a date in YYYY-MM-DD format."})
        if raw_to:
            try:
                date_to = datetime.date.fromisoformat(raw_to.strip())
            except ValueError:
                raise exceptions.ValidationError({"date_to": "Must be a date in YYYY-MM-DD format."})
        if date_from is not None and date_to is not None and date_from > date_to:
            raise exceptions.ValidationError({"date_from": "Must not be after date_to."})

        accessible_companies = companies_with_receipt_view_access(request.user)

        # Materials count in shared catalog
        active_materials = Material.objects.filter(is_active=True)
        raw_count = active_materials.filter(kind=Material.Kind.RAW_MATERIAL).count()
        pack_count = active_materials.filter(kind=Material.Kind.PACKAGING_MATERIAL).count()
        mt_count = active_materials.filter(kind=Material.Kind.MOTHER_TINCTURE).count()

        # Receipts in this store for accessible companies
        receipts_qs = GoodsReceipt.objects.filter(store=store, company__in=accessible_companies)
        all_time_posted_receipts = receipts_qs.filter(status=GoodsReceipt.Status.POSTED).count()
        draft_receipts = receipts_qs.filter(status=GoodsReceipt.Status.DRAFT).count()

        period_posted_receipts_qs = receipts_qs.filter(status=GoodsReceipt.Status.POSTED)
        if date_from is not None:
            period_posted_receipts_qs = period_posted_receipts_qs.filter(posted_at__date__gte=date_from)
        if date_to is not None:
            period_posted_receipts_qs = period_posted_receipts_qs.filter(posted_at__date__lte=date_to)
        period_posted_receipts = period_posted_receipts_qs.count()

        # Material issues in this store for accessible companies
        issues_qs = MaterialIssue.objects.filter(store=store, source_company__in=accessible_companies)
        all_time_posted_issues = issues_qs.filter(status=MaterialIssue.Status.POSTED).count()
        draft_issues = issues_qs.filter(status=MaterialIssue.Status.DRAFT).count()

        period_posted_issues_qs = issues_qs.filter(status=MaterialIssue.Status.POSTED)
        if date_from is not None:
            period_posted_issues_qs = period_posted_issues_qs.filter(posted_at__date__gte=date_from)
        if date_to is not None:
            period_posted_issues_qs = period_posted_issues_qs.filter(posted_at__date__lte=date_to)
        period_posted_issues = period_posted_issues_qs.count()

        # Material requisitions in this store
        try:
            from apps.material_requisitions.views import companies_with_requisition_source_access
            req_companies = companies_with_requisition_source_access(request.user)
            requisitions_qs = MaterialRequisition.objects.filter(store=store, company__in=req_companies)
        except Exception:
            requisitions_qs = MaterialRequisition.objects.filter(store=store)

        submitted_reqs = requisitions_qs.filter(status=MaterialRequisition.Status.SUBMITTED).count()
        approved_reqs = requisitions_qs.filter(status=MaterialRequisition.Status.APPROVED).count()
        draft_reqs = requisitions_qs.filter(status=MaterialRequisition.Status.DRAFT).count()

        # Ledger stock balances up to date_to cutoff
        receipt_balances = list(compute_stock_balances(
            store=store, accessible_companies=accessible_companies, posted_to=date_to,
        ))
        issued_totals = {
            (row["unit_id"], row["source_company_id"]): row["recorded_issued_quantity"]
            for row in compute_issued_balances(
                store=store, accessible_companies=accessible_companies, posted_to=date_to,
            )
        }
        active_stock_lines = 0
        materials_with_positive_balance = set()
        stock_overview_rows = []
        # Summed across every company/unit row for the same material - a
        # reorder level is configured per (store, material), never per
        # company, so "current quantity" for that comparison has to be
        # this material's full store-wide total, not one company's slice.
        material_net_totals = {}
        for row in receipt_balances:
            issued_qty = issued_totals.get((row["unit_id"], row["source_company_id"]), Decimal("0"))
            net = row["recorded_receipt_quantity"] - issued_qty
            material_net_totals[row["material_id"]] = material_net_totals.get(row["material_id"], Decimal("0")) + net
            if net > 0:
                active_stock_lines += 1
                materials_with_positive_balance.add(row["material_id"])
            stock_overview_rows.append({
                "material_id": row["material_id"],
                "material_code": row["material_code_snapshot"],
                "material_name": row["material_name_snapshot"],
                "unit_id": row["unit_id"],
                "unit_code": row["unit_code_snapshot"],
                "unit_name": row["unit_name_snapshot"],
                "source_company_id": row["source_company_id"],
                "source_company_code": row["source_company__code"],
                "recorded_receipt_quantity": str(row["recorded_receipt_quantity"]),
                "recorded_issued_quantity": str(issued_qty),
                "closing_book_quantity": str(net),
            })

        # Low stock: compare each configured MaterialReorderSetting for
        # this store (apps.catalog.MaterialReorderSetting - an admin-set,
        # store-scoped threshold; see that model's own docstring) against
        # this material's real, authoritative current quantity computed
        # above. A material with NO stock_overview_rows at all (never
        # received, or fully issued out) has a current quantity of zero,
        # which still counts - "configured but no stock" is the clearest
        # low-stock case there is, not an absence to skip silently.
        low_stock_items = []
        reorder_settings = (
            MaterialReorderSetting.objects.filter(store=store)
            .select_related("material", "material__base_unit")
        )
        for setting in reorder_settings:
            if not setting.material.is_active:
                continue
            current_qty = material_net_totals.get(setting.material_id, Decimal("0"))
            if current_qty <= setting.reorder_level:
                low_stock_items.append({
                    "material_id": setting.material_id,
                    "material_code": setting.material.code,
                    "material_name": setting.material.name,
                    "unit_code": setting.material.base_unit.code,
                    "current_quantity": str(current_qty),
                    "reorder_level": str(setting.reorder_level),
                    "severity": "critical" if current_qty <= 0 else "warning",
                })
        low_stock_items.sort(key=lambda item: Decimal(item["current_quantity"]))

        # Pending work preview: real receipt drafts, issue drafts, submitted & approved requisitions
        pending_work_items = []
        for gr in receipts_qs.filter(status=GoodsReceipt.Status.DRAFT).select_related("company").prefetch_related("lines").order_by("-created_at")[:10]:
            pending_work_items.append({
                "id": gr.id,
                "document_type": "Goods Receipt",
                "type_code": "RECEIPT",
                "reference": gr.reference or f"GR-DRAFT-{gr.id}",
                "company_id": gr.company_id,
                "company_code": gr.company.code,
                "line_count": gr.lines.count(),
                "date": gr.arrived_at.isoformat() if gr.arrived_at else gr.created_at.date().isoformat(),
                "created_at": gr.created_at.isoformat(),
                "status": "DRAFT",
                "action": "Review & Post",
            })

        for mi in issues_qs.filter(status=MaterialIssue.Status.DRAFT).select_related("source_company").order_by("-created_at")[:10]:
            pending_work_items.append({
                "id": mi.id,
                "document_type": "Material Issue",
                "type_code": "ISSUE",
                "reference": mi.reference or f"MI-DRAFT-{mi.id}",
                "company_id": mi.source_company_id,
                "company_code": mi.source_company.code,
                "line_count": 1,
                "date": mi.issued_at.isoformat() if mi.issued_at else mi.created_at.date().isoformat(),
                "created_at": mi.created_at.isoformat(),
                "status": "DRAFT",
                "action": "Review & Post",
            })

        for req in requisitions_qs.filter(status__in=[MaterialRequisition.Status.SUBMITTED, MaterialRequisition.Status.APPROVED]).select_related("company", "batch_plan").prefetch_related("lines").order_by("-created_at")[:10]:
            plan_ref = ""
            if req.batch_plan_id:
                alloc = getattr(req.batch_plan, "number_allocation", None)
                plan_ref = alloc.batch_number if alloc else f"Plan #{req.batch_plan_id}"
            pending_work_items.append({
                "id": req.id,
                "document_type": "Material Requisition",
                "type_code": "REQUISITION",
                "reference": f"MR-{req.id}" + (f" ({plan_ref})" if plan_ref else ""),
                "company_id": req.company_id,
                "company_code": req.company.code,
                "line_count": req.lines.count(),
                "date": req.created_at.date().isoformat(),
                "created_at": req.created_at.isoformat(),
                "status": req.status,
                "action": "Approve / Review" if req.status == MaterialRequisition.Status.SUBMITTED else "Fulfill / Issue",
            })

        pending_work_items.sort(key=lambda x: x["created_at"], reverse=True)

        # Recent Stock Activity: latest 10 posted movements across StockMovement & MaterialIssueMovement
        recent_activity_items = []
        sm_qs = StockMovement.objects.filter(store=store, source_company__in=accessible_companies).select_related(
            "material", "unit", "source_company", "source_goods_receipt"
        )
        if date_from is not None:
            sm_qs = sm_qs.filter(posted_at__date__gte=date_from)
        if date_to is not None:
            sm_qs = sm_qs.filter(posted_at__date__lte=date_to)
        for sm in sm_qs.order_by("-posted_at", "-id")[:10]:
            recent_activity_items.append({
                "id": f"sm-{sm.id}",
                "movement_id": sm.id,
                "source_id": sm.source_goods_receipt_id,
                "source_type": "RECEIPT",
                "movement_type": "RECEIPT_IN",
                "movement_label": "Receipt Inward",
                "posted_at": sm.posted_at.isoformat() if sm.posted_at else sm.created_at.isoformat(),
                "material_id": sm.material_id,
                "material_code": sm.material_code_snapshot,
                "material_name": sm.material_name_snapshot,
                "quantity": str(sm.quantity),
                "unit_code": sm.unit_code_snapshot,
                "source_company_id": sm.source_company_id,
                "source_company_code": sm.source_company.code,
                "batch_lot": sm.lot_reference or (sm.source_goods_receipt.reference if sm.source_goods_receipt else ""),
                "reference": sm.source_goods_receipt.reference if sm.source_goods_receipt else f"GR-{sm.source_goods_receipt_id}",
            })

        mim_qs = MaterialIssueMovement.objects.filter(store=store, source_company__in=accessible_companies).select_related(
            "material", "unit", "source_company", "source_material_issue"
        )
        if date_from is not None:
            mim_qs = mim_qs.filter(posted_at__date__gte=date_from)
        if date_to is not None:
            mim_qs = mim_qs.filter(posted_at__date__lte=date_to)
        for mim in mim_qs.order_by("-posted_at", "-id")[:10]:
            recent_activity_items.append({
                "id": f"mim-{mim.id}",
                "movement_id": mim.id,
                "source_id": mim.source_material_issue_id,
                "source_type": "ISSUE",
                "movement_type": "ISSUE_OUT",
                "movement_label": "Issue Outward",
                "posted_at": mim.posted_at.isoformat() if mim.posted_at else mim.created_at.isoformat(),
                "material_id": mim.material_id,
                "material_code": mim.material_code_snapshot,
                "material_name": mim.material_name_snapshot,
                "quantity": str(mim.quantity),
                "unit_code": mim.unit_code_snapshot,
                "source_company_id": mim.source_company_id,
                "source_company_code": mim.source_company.code,
                "batch_lot": mim.batch_reference or (mim.source_material_issue.reference if mim.source_material_issue else ""),
                "reference": mim.source_material_issue.reference if mim.source_material_issue else f"MI-{mim.source_material_issue_id}",
            })

        recent_activity_items.sort(key=lambda x: (x["posted_at"], x["id"]), reverse=True)
        recent_activity_items = recent_activity_items[:10]

        # User permissions in this store
        user_perms = sorted(effective_store_permission_codes(request.user, store))

        # Operational alerts
        alerts = []
        if draft_receipts > 0:
            alerts.append({
                "id": "draft-receipts",
                "type": "PENDING_RECEIPTS",
                "severity": "info",
                "message": f"{draft_receipts} goods receipt draft(s) awaiting review and posting.",
            })
        if submitted_reqs > 0:
            alerts.append({
                "id": "submitted-reqs",
                "type": "SUBMITTED_REQUISITIONS",
                "severity": "warning",
                "message": f"{submitted_reqs} material requisition(s) submitted and awaiting approval.",
            })
        if approved_reqs > 0:
            alerts.append({
                "id": "approved-reqs",
                "type": "APPROVED_REQUISITIONS",
                "severity": "info",
                "message": f"{approved_reqs} approved material requisition(s) pending fulfillment.",
            })
        if draft_issues > 0:
            alerts.append({
                "id": "draft-issues",
                "type": "PENDING_ISSUES",
                "severity": "info",
                "message": f"{draft_issues} material issue draft(s) awaiting review and posting.",
            })
        for item in low_stock_items:
            alerts.append({
                "id": f"low-stock-{item['material_id']}",
                "type": "LOW_STOCK",
                "severity": item["severity"],
                "message": (
                    f"{item['material_code']} ({item['material_name']}) is "
                    f"{'out of stock' if item['severity'] == 'critical' else 'low on stock'}: "
                    f"{item['current_quantity']} {item['unit_code']} on hand, reorder level is "
                    f"{item['reorder_level']} {item['unit_code']}."
                ),
                "material_id": item["material_id"],
            })

        return Response({
            "store": {
                "id": store.id,
                "code": store.code,
                "name": store.name,
            },
            "business_time_zone": business_tz,
            "business_date": today_business_date.isoformat(),
            "filter_period": {
                "date_from": date_from.isoformat() if date_from else None,
                "date_to": date_to.isoformat() if date_to else None,
            },
            "materials": {
                "total_active": raw_count + pack_count + mt_count,
                "raw_materials": raw_count,
                "packaging_materials": pack_count,
                "mother_tinctures": mt_count,
            },
            "receipts": {
                "posted": period_posted_receipts if (date_from or date_to) else all_time_posted_receipts,
                "all_time_posted": all_time_posted_receipts,
                "period_posted": period_posted_receipts,
                "draft": draft_receipts,
            },
            "issues": {
                "posted": period_posted_issues if (date_from or date_to) else all_time_posted_issues,
                "all_time_posted": all_time_posted_issues,
                "period_posted": period_posted_issues,
                "draft": draft_issues,
            },
            "requisitions": {
                "submitted": submitted_reqs,
                "approved": approved_reqs,
                "draft": draft_reqs,
                "pending_fulfillment": approved_reqs,
                "total_pending": submitted_reqs + approved_reqs,
            },
            "ledger": {
                "active_stock_lines": active_stock_lines,
                "materials_with_stock": len(materials_with_positive_balance),
                "balances": stock_overview_rows[:50],
                "total_balances_count": len(stock_overview_rows),
            },
            "pending_work": {
                "items": pending_work_items[:20],
                "total_count": len(pending_work_items),
            },
            "recent_activity": {
                "items": recent_activity_items,
                "total_count": len(recent_activity_items),
            },
            "alerts": {
                "items": alerts,
            },
            "features": {
                "low_stock": {
                    "configured": reorder_settings.exists(),
                    "status": "OK" if reorder_settings.exists() else "NOT_CONFIGURED",
                    "reason": (
                        f"{len(low_stock_items)} of {reorder_settings.count()} material(s) with a "
                        f"store reorder level set are at or below it."
                        if reorder_settings.exists()
                        else "No material in this store has a reorder level set yet - configure one from "
                        "Material Master > Edit Material to enable low-stock alerts."
                    ),
                    "low_stock_count": len(low_stock_items),
                },
                "quality_disposition": {
                    "configured": False,
                    "status": "UNAVAILABLE",
                    "reason": "Authoritative quality disposition (release/reject/hold) is not supported in the current incoming QC lifecycle.",
                },
                "expiry_tracking": {
                    "configured": False,
                    "status": "NOT_CONFIGURED",
                    "reason": "Retest dates and expiry alerting thresholds are not configured for common store stock.",
                },
            },
            "coverage": {
                "accessible_companies": [
                    {"id": c.id, "code": c.code, "name": c.display_name}
                    for c in accessible_companies
                ]
            },
            "user_permissions": user_perms,
        })


def _duplicate_store_code_error():
    return exceptions.ValidationError({"code": "A store with this code already exists."})


@method_decorator(never_cache, name="dispatch")
class StoreListCreateView(generics.ListCreateAPIView):
    """Mirrors apps.companies.views.CompanyListCreateView exactly, for
    SharedStore (no owning-company concept applies here at all).
    """

    permission_classes = [IsActiveSuperuser]
    pagination_class = BoundedPageNumberPagination

    def get_serializer_class(self):
        return StoreCreateSerializer if self.request.method == "POST" else StoreDetailSerializer

    def get_queryset(self):
        queryset = SharedStore.objects.all()

        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(Q(code__icontains=search) | Q(name__icontains=search))

        is_active_param = self.request.query_params.get("is_active")
        if is_active_param is not None:
            queryset = queryset.filter(is_active=parse_strict_bool(is_active_param))

        return queryset.order_by("code", "id")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            store = create_store(actor=request.user, **serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        except IntegrityError:
            raise _duplicate_store_code_error()
        return Response(StoreDetailSerializer(store).data, status=201)


@method_decorator(never_cache, name="dispatch")
class StoreDetailView(APIView):
    """GET: full management detail. PATCH: name/description only - code
    is immutable, allowed regardless of the store's own is_active state
    (see docs/backend-decisions.md, Task 07A, for why this mirrors the
    same company-level asymmetry from Task 06).
    """

    permission_classes = [IsActiveSuperuser]

    def get(self, request, store_id):
        store = get_object_or_404(SharedStore, pk=store_id)
        return Response(StoreDetailSerializer(store).data)

    def patch(self, request, store_id):
        store = get_object_or_404(SharedStore, pk=store_id)
        serializer = StoreUpdateSerializer(store, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            store = update_store(actor=request.user, store=store, data=serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(StoreDetailSerializer(store).data)


@method_decorator(never_cache, name="dispatch")
class StoreActivateView(APIView):
    permission_classes = [IsActiveSuperuser]

    def post(self, request, store_id):
        store = get_object_or_404(SharedStore, pk=store_id)
        store = activate_store(actor=request.user, store=store)
        return Response(StoreDetailSerializer(store).data)


@method_decorator(never_cache, name="dispatch")
class StoreDeactivateView(APIView):
    """Idempotent. Never cascades - memberships/roles/role assignments
    keep whatever is_active state they already had.
    """

    permission_classes = [IsActiveSuperuser]

    def post(self, request, store_id):
        store = get_object_or_404(SharedStore, pk=store_id)
        store = deactivate_store(actor=request.user, store=store)
        return Response(StoreDetailSerializer(store).data)


@method_decorator(never_cache, name="dispatch")
class StoreMembershipListCreateView(APIView):
    """GET: every membership (active and inactive) in this store. POST:
    assign/reactivate an existing, active user - mirrors
    apps.users.views.MembershipListCreateView, keyed by store instead of
    by user.
    """

    permission_classes = [IsActiveSuperuser]

    def get(self, request, store_id):
        store = get_object_or_404(SharedStore, pk=store_id)
        memberships = StoreMembership.objects.filter(store=store).select_related("user")
        return Response(StoreMembershipSerializer(memberships, many=True).data)

    def post(self, request, store_id):
        store = get_object_or_404(SharedStore, pk=store_id)
        serializer = StoreMembershipCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = get_object_or_404(User, pk=serializer.validated_data["user_id"])

        if not user.is_active:
            raise exceptions.ValidationError({"detail": "User is inactive."})
        if not store.is_active:
            raise exceptions.ValidationError({"detail": "Store is inactive."})

        membership, created = assign_store_membership(actor=request.user, user=user, store=store)
        return Response(StoreMembershipSerializer(membership).data, status=201 if created else 200)


@method_decorator(never_cache, name="dispatch")
class StoreMembershipDeactivateView(APIView):
    """Idempotent; works even if the user/store is already inactive -
    revoking access is always allowed.
    """

    permission_classes = [IsActiveSuperuser]

    def post(self, request, store_id, membership_id):
        store = get_object_or_404(SharedStore, pk=store_id)
        membership = get_object_or_404(StoreMembership, pk=membership_id, store=store)
        membership = deactivate_store_membership(actor=request.user, membership=membership)
        return Response(StoreMembershipSerializer(membership).data)


@method_decorator(never_cache, name="dispatch")
class StoreRoleAssignmentListCreateView(APIView):
    """GET: every role assignment (active and inactive) for this
    membership. POST: assign/reactivate an existing StoreRole that
    belongs to the same store as the membership.
    """

    permission_classes = [IsActiveSuperuser]

    def _get_membership(self, store_id, membership_id):
        store = get_object_or_404(SharedStore, pk=store_id)
        return get_object_or_404(StoreMembership, pk=membership_id, store=store)

    def get(self, request, store_id, membership_id):
        membership = self._get_membership(store_id, membership_id)
        assignments = StoreRoleAssignment.objects.filter(membership=membership).select_related("role")
        return Response(StoreRoleAssignmentSerializer(assignments, many=True).data)

    def post(self, request, store_id, membership_id):
        membership = self._get_membership(store_id, membership_id)
        serializer = StoreRoleAssignmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role = get_object_or_404(StoreRole, pk=serializer.validated_data["role_id"])

        if not membership.user.is_active:
            raise exceptions.ValidationError({"detail": "User is inactive."})
        if not membership.store.is_active:
            raise exceptions.ValidationError({"detail": "Store is inactive."})
        if not membership.is_active:
            raise exceptions.ValidationError({"detail": "Membership is inactive."})
        if not role.is_active:
            raise exceptions.ValidationError({"detail": "Role is inactive."})
        if membership.store_id != role.store_id:
            raise exceptions.ValidationError(
                {"detail": "Role and membership must belong to the same store."}
            )

        assignment, created = assign_store_membership_role(actor=request.user, membership=membership, role=role)
        return Response(StoreRoleAssignmentSerializer(assignment).data, status=201 if created else 200)


@method_decorator(never_cache, name="dispatch")
class StoreRoleAssignmentDeactivateView(APIView):
    """Idempotent; works even if the user/store/membership/role is already
    inactive - revoking is always allowed.
    """

    permission_classes = [IsActiveSuperuser]

    def post(self, request, store_id, membership_id, assignment_id):
        store = get_object_or_404(SharedStore, pk=store_id)
        membership = get_object_or_404(StoreMembership, pk=membership_id, store=store)
        assignment = get_object_or_404(StoreRoleAssignment, pk=assignment_id, membership=membership)
        assignment = deactivate_store_membership_role(
            actor=request.user, membership=membership, role=assignment.role
        )
        return Response(StoreRoleAssignmentSerializer(assignment).data)


def _get_store_for_location_read(request, store_id):
    """Resolves the store for a locations-read endpoint under the rules
    in docs/backend-tasks.md, Task 07B: an active superuser may read
    locations for administration without any membership (and regardless
    of the store's own active state - consistent with every other
    superuser management-detail read in this project); anyone else needs
    an active membership in this specific, active store *and*
    `storage_locations.view` there. Inaccessible/inactive/nonexistent
    stores all produce the same 404 for a non-superuser - membership
    without the permission is a 403, not folded into the same 404,
    because at that point the store itself is not in question, only the
    permission is.
    """
    user = request.user
    if user.is_authenticated and user.is_active and user.is_superuser:
        return get_object_or_404(SharedStore, pk=store_id)

    store = active_stores_for_user(user).filter(pk=store_id).first()
    if store is None:
        raise NotFound("Store not found.")
    if not store_user_has_permission(user, store, STORAGE_LOCATIONS_VIEW_PERMISSION):
        raise exceptions.PermissionDenied(
            f"The '{STORAGE_LOCATIONS_VIEW_PERMISSION}' permission is required."
        )
    return store


def _duplicate_location_code_error():
    return exceptions.ValidationError({"code": "A location with this code already exists in this store."})


@method_decorator(never_cache, name="dispatch")
class StorageLocationListCreateView(generics.ListCreateAPIView):
    """GET: active superuser (any store, any state), or an active user
    with active membership in *this* store and `storage_locations.view`
    there. POST: active superuser only, rejected if the store is
    inactive. This admin/operational split mirrors
    apps.catalog.permissions.CanReadSharedCatalog's reasoning, applied at
    a single-store scope instead of "any store".
    """

    pagination_class = BoundedPageNumberPagination

    def get_permissions(self):
        return [IsAuthenticated()] if self.request.method == "GET" else [IsActiveSuperuser()]

    def get_serializer_class(self):
        return (
            StorageLocationCreateSerializer
            if self.request.method == "POST"
            else StorageLocationSerializer
        )

    def get_queryset(self):
        store = _get_store_for_location_read(self.request, self.kwargs["store_id"])
        queryset = StorageLocation.objects.filter(store=store).select_related("store")

        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(Q(code__icontains=search) | Q(name__icontains=search))

        is_active_param = self.request.query_params.get("is_active")
        if is_active_param is not None:
            queryset = queryset.filter(is_active=parse_strict_bool(is_active_param))

        return queryset.order_by("code", "id")

    def create(self, request, *args, **kwargs):
        store = get_object_or_404(SharedStore, pk=self.kwargs["store_id"])
        if not store.is_active:
            raise exceptions.ValidationError({"detail": "Store is inactive."})

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            location = create_location(actor=request.user, store=store, **serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        except IntegrityError:
            raise _duplicate_location_code_error()
        return Response(StorageLocationSerializer(location).data, status=201)


@method_decorator(never_cache, name="dispatch")
class StorageLocationDetailView(APIView):
    """Every lookup is scoped to the store in the URL - a location id
    belonging to a different store is a 404, identical to one that does
    not exist at all.
    """

    def get_permissions(self):
        return [IsAuthenticated()] if self.request.method == "GET" else [IsActiveSuperuser()]

    def get(self, request, store_id, location_id):
        store = _get_store_for_location_read(request, store_id)
        location = get_object_or_404(StorageLocation, pk=location_id, store=store)
        return Response(StorageLocationSerializer(location).data)

    def patch(self, request, store_id, location_id):
        store = get_object_or_404(SharedStore, pk=store_id)
        location = get_object_or_404(StorageLocation, pk=location_id, store=store)
        if not store.is_active:
            raise exceptions.ValidationError({"detail": "Store is inactive."})

        serializer = StorageLocationUpdateSerializer(location, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            location = update_location(actor=request.user, location=location, data=serializer.validated_data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(StorageLocationSerializer(location).data)


@method_decorator(never_cache, name="dispatch")
class StorageLocationActivateView(APIView):
    """Rejected under an inactive store - a location cannot become usable
    again while its own store is still inactive.
    """

    permission_classes = [IsActiveSuperuser]

    def post(self, request, store_id, location_id):
        store = get_object_or_404(SharedStore, pk=store_id)
        location = get_object_or_404(StorageLocation, pk=location_id, store=store)
        if not store.is_active:
            raise exceptions.ValidationError({"detail": "Store is inactive."})
        location = activate_location(actor=request.user, location=location)
        return Response(StorageLocationSerializer(location).data)


@method_decorator(never_cache, name="dispatch")
class StorageLocationDeactivateView(APIView):
    """Idempotent, allowed even under an inactive store - cleanup/
    revocation must always be possible.
    """

    permission_classes = [IsActiveSuperuser]

    def post(self, request, store_id, location_id):
        store = get_object_or_404(SharedStore, pk=store_id)
        location = get_object_or_404(StorageLocation, pk=location_id, store=store)
        location = deactivate_location(actor=request.user, location=location)
        return Response(StorageLocationSerializer(location).data)
