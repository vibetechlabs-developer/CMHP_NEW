from django.urls import path

from apps.customers.views import (
    CustomerImportCommitView,
    CustomerImportPreviewView,
    CustomerActivateView,
    CustomerDeactivateView,
    CustomerDetailView,
    CustomerListCreateView,
)

urlpatterns = [
    path(
        "<int:company_id>/customers/import-preview/",
        CustomerImportPreviewView.as_view(),
        name="customer-import-preview",
    ),
    path(
        "<int:company_id>/customers/import-commit/",
        CustomerImportCommitView.as_view(),
        name="customer-import-commit",
    ),
    path(
        "<int:company_id>/customers/",
        CustomerListCreateView.as_view(),
        name="customer-list-create",
    ),
    path(
        "<int:company_id>/customers/<int:customer_id>/",
        CustomerDetailView.as_view(),
        name="customer-detail",
    ),
    path(
        "<int:company_id>/customers/<int:customer_id>/activate/",
        CustomerActivateView.as_view(),
        name="customer-activate",
    ),
    path(
        "<int:company_id>/customers/<int:customer_id>/deactivate/",
        CustomerDeactivateView.as_view(),
        name="customer-deactivate",
    ),
]
