from django.urls import path

from apps.formula_imports.views import (
    FormulaImportCommitView,
    FormulaImportPreviewDetailView,
    FormulaImportPreviewView,
)

urlpatterns = [
    path(
        "<int:company_id>/formulas/import-preview/",
        FormulaImportPreviewView.as_view(),
        name="formula-import-preview",
    ),
    path(
        "<int:company_id>/formulas/import-preview/<int:batch_id>/",
        FormulaImportPreviewDetailView.as_view(),
        name="formula-import-preview-detail",
    ),
    path(
        "<int:company_id>/formulas/import-commit/",
        FormulaImportCommitView.as_view(),
        name="formula-import-commit",
    ),
]
