from django.urls import path

from apps.store_preparation.views import StorePreparationDetailView, StorePreparationListCreateView

urlpatterns = [
    path(
        "<int:store_id>/preparations/",
        StorePreparationListCreateView.as_view(),
        name="store-preparation-list-create",
    ),
    path(
        "<int:store_id>/preparations/<int:preparation_id>/",
        StorePreparationDetailView.as_view(),
        name="store-preparation-detail",
    ),
]
