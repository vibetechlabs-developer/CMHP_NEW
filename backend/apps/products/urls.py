from django.urls import path

from apps.products.views import (
    ProductActivateView,
    ProductDeactivateView,
    ProductDetailView,
    ProductListCreateView,
)

urlpatterns = [
    path(
        "<int:company_id>/products/",
        ProductListCreateView.as_view(),
        name="product-list-create",
    ),
    path(
        "<int:company_id>/products/<int:product_id>/",
        ProductDetailView.as_view(),
        name="product-detail",
    ),
    path(
        "<int:company_id>/products/<int:product_id>/activate/",
        ProductActivateView.as_view(),
        name="product-activate",
    ),
    path(
        "<int:company_id>/products/<int:product_id>/deactivate/",
        ProductDeactivateView.as_view(),
        name="product-deactivate",
    ),
]
