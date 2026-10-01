from django.urls import path

from apps.suppliers.views import (
    SupplierActivateView,
    SupplierDeactivateView,
    SupplierDetailView,
    SupplierListCreateView,
)

urlpatterns = [
    path("", SupplierListCreateView.as_view(), name="supplier-list-create"),
    path("<int:supplier_id>/", SupplierDetailView.as_view(), name="supplier-detail"),
    path("<int:supplier_id>/activate/", SupplierActivateView.as_view(), name="supplier-activate"),
    path("<int:supplier_id>/deactivate/", SupplierDeactivateView.as_view(), name="supplier-deactivate"),
]
