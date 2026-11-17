from django.urls import path

from apps.quality.document_views import (
    BMRDocumentDetailView,
    BMRDocumentDownloadView,
    BMRDocumentListView,
    BMRDocumentVersionsView,
    COADocumentApproveView,
    COADocumentDetailView,
    COADocumentDownloadView,
    COADocumentListView,
    COADocumentRejectView,
    COADocumentVersionsView,
    DocumentSummaryView,
    EligibleBatchesView,
)

urlpatterns = [
    path("<int:company_id>/documents/summary/", DocumentSummaryView.as_view(), name="document-summary"),
    path("<int:company_id>/documents/eligible-batches/", EligibleBatchesView.as_view(), name="document-eligible-batches"),
    path("<int:company_id>/documents/bmr/", BMRDocumentListView.as_view(), name="bmr-document-list"),
    path("<int:company_id>/documents/bmr/<int:attachment_id>/", BMRDocumentDetailView.as_view(), name="bmr-document-detail"),
    path("<int:company_id>/documents/bmr/<int:attachment_id>/download/", BMRDocumentDownloadView.as_view(), name="bmr-document-download"),
    path("<int:company_id>/documents/bmr/<int:attachment_id>/versions/", BMRDocumentVersionsView.as_view(), name="bmr-document-versions"),
    path("<int:company_id>/documents/coa/", COADocumentListView.as_view(), name="coa-document-list"),
    path("<int:company_id>/documents/coa/<int:coa_id>/", COADocumentDetailView.as_view(), name="coa-document-detail"),
    path("<int:company_id>/documents/coa/<int:coa_id>/download/", COADocumentDownloadView.as_view(), name="coa-document-download"),
    path("<int:company_id>/documents/coa/<int:coa_id>/approve/", COADocumentApproveView.as_view(), name="coa-document-approve"),
    path("<int:company_id>/documents/coa/<int:coa_id>/reject/", COADocumentRejectView.as_view(), name="coa-document-reject"),
    path("<int:company_id>/documents/coa/<int:coa_id>/versions/", COADocumentVersionsView.as_view(), name="coa-document-versions"),
]

