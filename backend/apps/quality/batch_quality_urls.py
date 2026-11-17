from django.urls import path

from apps.quality.batch_quality_views import (
    BatchQualityCaseDetailView,
    BatchQualityCaseListCreateView,
    BatchQualityCoaDecisionView,
    BatchQualityCoaView,
    BatchQualityPackagingCompleteView,
    BatchQualityPackagingDecisionView,
    BatchQualityQaReleaseView,
    BatchQualityQcDecisionView,
)

urlpatterns = [
    path(
        "<int:company_id>/batch-quality/",
        BatchQualityCaseListCreateView.as_view(),
        name="batch-quality-list-create",
    ),
    path(
        "<int:company_id>/batch-quality/<int:case_id>/",
        BatchQualityCaseDetailView.as_view(),
        name="batch-quality-detail",
    ),
    path(
        "<int:company_id>/batch-quality/<int:case_id>/qc-decisions/",
        BatchQualityQcDecisionView.as_view(),
        name="batch-quality-qc-decision",
    ),
    path(
        "<int:company_id>/batch-quality/<int:case_id>/qa-release/",
        BatchQualityQaReleaseView.as_view(),
        name="batch-quality-qa-release",
    ),
    path(
        "<int:company_id>/batch-quality/<int:case_id>/coa/",
        BatchQualityCoaView.as_view(),
        name="batch-quality-coa-open",
    ),
    path(
        "<int:company_id>/batch-quality/<int:case_id>/coa-decisions/",
        BatchQualityCoaDecisionView.as_view(),
        name="batch-quality-coa-decision",
    ),
    path(
        "<int:company_id>/batch-quality/<int:case_id>/packaging-complete/",
        BatchQualityPackagingCompleteView.as_view(),
        name="batch-quality-packaging-complete",
    ),
    path(
        "<int:company_id>/batch-quality/<int:case_id>/packaging-decisions/",
        BatchQualityPackagingDecisionView.as_view(),
        name="batch-quality-packaging-decision",
    ),
]

