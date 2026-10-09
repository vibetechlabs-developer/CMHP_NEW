from django.urls import path

from apps.formulas.views import (
    ApprovalPolicyView,
    FormulaDetailView,
    FormulaListCreateView,
    RevisionApprovalPreviewView,
    RevisionApproveView,
    RevisionDetailView,
    RevisionListCreateView,
    RevisionRejectView,
    RevisionRequirementPreviewView,
    RevisionSubmitView,
)

urlpatterns = [
    path("<int:company_id>/formula-approval-policy/", ApprovalPolicyView.as_view(), name="formula-approval-policy"),
    path(
        "<int:company_id>/formulas/<int:formula_id>/revisions/<int:revision_id>/submit/",
        RevisionSubmitView.as_view(),
        name="formula-revision-submit",
    ),
    path(
        "<int:company_id>/formulas/<int:formula_id>/revisions/<int:revision_id>/reject/",
        RevisionRejectView.as_view(),
        name="formula-revision-reject",
    ),
    path(
        "<int:company_id>/formulas/<int:formula_id>/revisions/<int:revision_id>/approve/",
        RevisionApproveView.as_view(),
        name="formula-revision-approve",
    ),
    path(
        "<int:company_id>/formulas/<int:formula_id>/revisions/<int:revision_id>/approval-preview/",
        RevisionApprovalPreviewView.as_view(),
        name="formula-revision-approval-preview",
    ),
    path("<int:company_id>/formulas/", FormulaListCreateView.as_view(), name="formula-list-create"),
    path("<int:company_id>/formulas/<int:formula_id>/", FormulaDetailView.as_view(), name="formula-detail"),
    path(
        "<int:company_id>/formulas/<int:formula_id>/revisions/",
        RevisionListCreateView.as_view(),
        name="formula-revision-list-create",
    ),
    path(
        "<int:company_id>/formulas/<int:formula_id>/revisions/<int:revision_id>/",
        RevisionDetailView.as_view(),
        name="formula-revision-detail",
    ),
    path(
        "<int:company_id>/formulas/<int:formula_id>/revisions/<int:revision_id>/requirement-preview/",
        RevisionRequirementPreviewView.as_view(),
        name="formula-revision-requirement-preview",
    ),
]
