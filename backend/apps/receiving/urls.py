from django.urls import path

from apps.receiving.views import (
    EligiblePurchaseOrdersView,
    GoodsReceiptCancelView,
    GoodsReceiptDetailView,
    GoodsReceiptListCreateView,
    GoodsReceiptPostView,
)

urlpatterns = [
    path(
        "<int:store_id>/goods-receipts/",
        GoodsReceiptListCreateView.as_view(),
        name="goods-receipt-list-create",
    ),
    path(
        "<int:store_id>/goods-receipts/eligible-purchase-orders/",
        EligiblePurchaseOrdersView.as_view(),
        name="goods-receipt-eligible-purchase-orders",
    ),
    path(
        "<int:store_id>/goods-receipts/<int:receipt_id>/",
        GoodsReceiptDetailView.as_view(),
        name="goods-receipt-detail",
    ),
    path(
        "<int:store_id>/goods-receipts/<int:receipt_id>/post/",
        GoodsReceiptPostView.as_view(),
        name="goods-receipt-post",
    ),
    path(
        "<int:store_id>/goods-receipts/<int:receipt_id>/cancel/",
        GoodsReceiptCancelView.as_view(),
        name="goods-receipt-cancel",
    ),
]
