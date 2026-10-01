from django.urls import path

from apps.quality.views import (
    EligibleReceiptLinesView,
    IncomingInspectionCancelView,
    IncomingInspectionDetailView,
    IncomingInspectionListCreateView,
    IncomingInspectionSubmitView,
)

urlpatterns = [
    path(
        "<int:store_id>/incoming-inspections/",
        IncomingInspectionListCreateView.as_view(),
        name="incoming-inspection-list-create",
    ),
    path(
        "<int:store_id>/incoming-inspections/eligible-receipt-lines/",
        EligibleReceiptLinesView.as_view(),
        name="incoming-inspection-eligible-receipt-lines",
    ),
    path(
        "<int:store_id>/incoming-inspections/<int:inspection_id>/",
        IncomingInspectionDetailView.as_view(),
        name="incoming-inspection-detail",
    ),
    path(
        "<int:store_id>/incoming-inspections/<int:inspection_id>/submit/",
        IncomingInspectionSubmitView.as_view(),
        name="incoming-inspection-submit",
    ),
    path(
        "<int:store_id>/incoming-inspections/<int:inspection_id>/cancel/",
        IncomingInspectionCancelView.as_view(),
        name="incoming-inspection-cancel",
    ),
]
