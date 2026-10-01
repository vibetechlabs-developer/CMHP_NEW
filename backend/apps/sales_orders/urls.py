from django.urls import path

from apps.sales_orders.views import (
    ConfirmationPolicyView,
    SalesOrderConfirmView,
    SalesOrderConfirmationPreviewView,
    SalesOrderDetailView,
    SalesOrderListCreateView,
)

urlpatterns = [
    path("<int:company_id>/sales-orders/", SalesOrderListCreateView.as_view(), name="sales-order-list-create"),
    path(
        "<int:company_id>/sales-orders/<int:sales_order_id>/",
        SalesOrderDetailView.as_view(),
        name="sales-order-detail",
    ),
    path(
        "<int:company_id>/sales-orders/<int:sales_order_id>/confirmation-preview/",
        SalesOrderConfirmationPreviewView.as_view(),
        name="sales-order-confirmation-preview",
    ),
    path(
        "<int:company_id>/sales-orders/<int:sales_order_id>/confirm/",
        SalesOrderConfirmView.as_view(),
        name="sales-order-confirm",
    ),
    path(
        "<int:company_id>/sales-order-confirmation-policy/",
        ConfirmationPolicyView.as_view(),
        name="sales-order-confirmation-policy",
    ),
]
