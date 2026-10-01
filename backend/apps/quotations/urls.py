from django.urls import path

from apps.quotations.views import QuotationDetailView, QuotationListCreateView

urlpatterns = [
    path("<int:company_id>/quotations/", QuotationListCreateView.as_view(), name="quotation-list-create"),
    path(
        "<int:company_id>/quotations/<int:quotation_id>/",
        QuotationDetailView.as_view(),
        name="quotation-detail",
    ),
]
