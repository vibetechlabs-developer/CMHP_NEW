from django.urls import path

from apps.purchasing.store_views import (
    StorePurchaseOrderCancelView,
    StorePurchaseOrderDetailView,
    StorePurchaseOrderIssueView,
    StorePurchaseOrderListCreateView,
    StorePurchasingSupplierListView,
)

urlpatterns = [
    path(
        "<int:store_id>/purchase-orders/",
        StorePurchaseOrderListCreateView.as_view(),
        name="store-purchase-order-list-create",
    ),
    path(
        "<int:store_id>/purchase-orders/<int:order_id>/",
        StorePurchaseOrderDetailView.as_view(),
        name="store-purchase-order-detail",
    ),
    path(
        "<int:store_id>/purchase-orders/<int:order_id>/issue/",
        StorePurchaseOrderIssueView.as_view(),
        name="store-purchase-order-issue",
    ),
    path(
        "<int:store_id>/purchase-orders/<int:order_id>/cancel/",
        StorePurchaseOrderCancelView.as_view(),
        name="store-purchase-order-cancel",
    ),
    path(
        "<int:store_id>/purchasing-suppliers/",
        StorePurchasingSupplierListView.as_view(),
        name="store-purchasing-suppliers",
    ),
]
