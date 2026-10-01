from django.urls import path

from apps.material_imports.views import (
    MaterialImportCommitView,
    MaterialImportPreviewDetailView,
    MaterialImportPreviewView,
)

urlpatterns = [
    path("materials/import-preview/", MaterialImportPreviewView.as_view(), name="material-import-preview"),
    path(
        "materials/import-preview/<int:batch_id>/",
        MaterialImportPreviewDetailView.as_view(),
        name="material-import-preview-detail",
    ),
    path("materials/import-commit/", MaterialImportCommitView.as_view(), name="material-import-commit"),
]
