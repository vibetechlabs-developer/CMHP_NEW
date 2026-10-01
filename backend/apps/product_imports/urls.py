from django.urls import path

from apps.product_imports.views import (
    ProductImportCommitView,
    ProductImportPreviewDetailView,
    ProductImportPreviewView,
)

urlpatterns = [
    path(
        "<int:company_id>/products/import-preview/",
        ProductImportPreviewView.as_view(),
        name="product-import-preview",
    ),
    path(
        "<int:company_id>/products/import-preview/<int:batch_id>/",
        ProductImportPreviewDetailView.as_view(),
        name="product-import-preview-detail",
    ),
    path(
        "<int:company_id>/products/import-commit/",
        ProductImportCommitView.as_view(),
        name="product-import-commit",
    ),
]
