from django.urls import path

from apps.stock_movements.views import StockBalanceListView, StockMovementListView

urlpatterns = [
    path(
        "<int:store_id>/stock-movements/",
        StockMovementListView.as_view(),
        name="stock-movement-list",
    ),
    path(
        "<int:store_id>/stock-balances/",
        StockBalanceListView.as_view(),
        name="stock-balance-list",
    ),
]
