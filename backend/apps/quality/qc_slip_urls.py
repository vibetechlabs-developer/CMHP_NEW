from django.urls import path
from apps.quality.qc_slip_views import (
    QcSlipRecordListCreateView,
    QcSlipStatusUpdateView,
)

urlpatterns = [
    # Company scoped paths
    path("<int:company_id>/qc-slips/", QcSlipRecordListCreateView.as_view(), name="qc-slip-list-create-company"),
    path("<int:company_id>/qc-slips/<str:order_id>/status/", QcSlipStatusUpdateView.as_view(), name="qc-slip-status-company"),

    # Direct / general paths
    path("slips/", QcSlipRecordListCreateView.as_view(), name="qc-slip-list-create-general"),
    path("slips/<str:order_id>/status/", QcSlipStatusUpdateView.as_view(), name="qc-slip-status-general"),
]
