from django.urls import path

from apps.receiving.views import (
    ContainerTypeActivateView,
    ContainerTypeDeactivateView,
    ContainerTypeDetailView,
    ContainerTypeListCreateView,
)

# Mounted at /api/v1/ directly (see config/urls.py) - ContainerType is
# shared, company/store-independent reference data, exactly like
# apps.catalog's UnitOfMeasure (mounted the same way, at /api/v1/units/).
# Kept as its own small urls module, physically alongside the model/views/
# services it routes to in apps.receiving, rather than mounted under the
# store-scoped goods-receipts paths in apps.receiving.urls (which would
# wrongly imply store-scoping that does not exist) or bundled into
# apps.catalog.urls (whose model this is not).
urlpatterns = [
    path("container-types/", ContainerTypeListCreateView.as_view(), name="container-type-list-create"),
    path("container-types/<int:container_type_id>/", ContainerTypeDetailView.as_view(), name="container-type-detail"),
    path(
        "container-types/<int:container_type_id>/activate/",
        ContainerTypeActivateView.as_view(),
        name="container-type-activate",
    ),
    path(
        "container-types/<int:container_type_id>/deactivate/",
        ContainerTypeDeactivateView.as_view(),
        name="container-type-deactivate",
    ),
]
