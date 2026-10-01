from django.urls import path

from apps.batch_plans.views import (
    BatchPlanAllocateNumberView,
    BatchPlanDetailView,
    BatchPlanListCreateView,
    BatchPlanRequirementPreviewView,
)

urlpatterns = [
    path("<int:company_id>/batch-plans/", BatchPlanListCreateView.as_view(), name="batch-plan-list-create"),
    path("<int:company_id>/batch-plans/<int:plan_id>/", BatchPlanDetailView.as_view(), name="batch-plan-detail"),
    path(
        "<int:company_id>/batch-plans/<int:plan_id>/requirement-preview/",
        BatchPlanRequirementPreviewView.as_view(),
        name="batch-plan-requirement-preview",
    ),
    path(
        "<int:company_id>/batch-plans/<int:plan_id>/allocate-number/",
        BatchPlanAllocateNumberView.as_view(),
        name="batch-plan-allocate-number",
    ),
]
