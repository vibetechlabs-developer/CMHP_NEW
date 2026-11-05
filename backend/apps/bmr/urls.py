from django.urls import path

from apps.bmr.views import (
    BMRForPlanView,
    BMRLineDetailView,
    BMRDocumentListCreateView,
    BMRDocumentDetailView,
    ProductionOrderStatusListCreateView,
    ProductionOrderStatusDetailView,
)

urlpatterns = [
    path("<int:company_id>/batch-plans/<int:plan_id>/bmr/", BMRForPlanView.as_view(), name="bmr-for-plan"),
    path(
        "<int:company_id>/bmr/<int:bmr_id>/lines/<int:line_id>/",
        BMRLineDetailView.as_view(),
        name="bmr-line-detail",
    ),
    # BMR Documents
    path(
        "<int:company_id>/bmr-documents/",
        BMRDocumentListCreateView.as_view(),
        name="bmr-document-list-create",
    ),
    path(
        "<int:company_id>/bmr-documents/<str:order_id>/",
        BMRDocumentDetailView.as_view(),
        name="bmr-document-detail",
    ),
    path(
        "bmr-documents/",
        BMRDocumentListCreateView.as_view(),
        name="bmr-document-list-create-general",
    ),
    path(
        "bmr-documents/<str:order_id>/",
        BMRDocumentDetailView.as_view(),
        name="bmr-document-detail-general",
    ),
    # Production Order Statuses
    path(
        "<int:company_id>/production-statuses/",
        ProductionOrderStatusListCreateView.as_view(),
        name="production-status-list-create",
    ),
    path(
        "<int:company_id>/production-statuses/<str:order_id>/",
        ProductionOrderStatusDetailView.as_view(),
        name="production-status-detail",
    ),
    path(
        "production-statuses/",
        ProductionOrderStatusListCreateView.as_view(),
        name="production-status-list-create-general",
    ),
    path(
        "production-statuses/<str:order_id>/",
        ProductionOrderStatusDetailView.as_view(),
        name="production-status-detail-general",
    ),
]
