from django.urls import path

from apps.material_requisitions.views import (
    BatchPlanRequisitionStatusView,
    MaterialRequisitionApproveView,
    MaterialRequisitionDetailView,
    MaterialRequisitionListCreateView,
    MaterialRequisitionRejectView,
    MaterialRequisitionReviseView,
    MaterialRequisitionSubmitView,
)

urlpatterns = [
    path(
        "<int:store_id>/material-requisitions/",
        MaterialRequisitionListCreateView.as_view(),
        name="material-requisition-list-create",
    ),
    path(
        "<int:store_id>/material-requisitions/<int:requisition_id>/",
        MaterialRequisitionDetailView.as_view(),
        name="material-requisition-detail",
    ),
    path(
        "<int:store_id>/material-requisitions/<int:requisition_id>/submit/",
        MaterialRequisitionSubmitView.as_view(),
        name="material-requisition-submit",
    ),
    path(
        "<int:store_id>/batch-plans/<int:plan_id>/requisition-status/",
        BatchPlanRequisitionStatusView.as_view(),
        name="batch-plan-requisition-status",
    ),
    path(
        "<int:store_id>/material-requisitions/<int:requisition_id>/approve/",
        MaterialRequisitionApproveView.as_view(),
        name="material-requisition-approve",
    ),
    path(
        "<int:store_id>/material-requisitions/<int:requisition_id>/reject/",
        MaterialRequisitionRejectView.as_view(),
        name="material-requisition-reject",
    ),
    path(
        "<int:store_id>/material-requisitions/<int:requisition_id>/revise/",
        MaterialRequisitionReviseView.as_view(),
        name="material-requisition-revise",
    ),
]
