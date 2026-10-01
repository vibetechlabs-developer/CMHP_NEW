from django.urls import path

from apps.quality.views import (
    MaterialSpecificationDetailView,
    MaterialSpecificationListCreateView,
    SpecificationVersionDetailView,
    SpecificationVersionListCreateView,
)

urlpatterns = [
    path(
        "material-specifications/",
        MaterialSpecificationListCreateView.as_view(),
        name="material-specification-list-create",
    ),
    path(
        "material-specifications/<int:specification_id>/",
        MaterialSpecificationDetailView.as_view(),
        name="material-specification-detail",
    ),
    path(
        "material-specifications/<int:specification_id>/versions/",
        SpecificationVersionListCreateView.as_view(),
        name="material-specification-version-list-create",
    ),
    path(
        "material-specifications/<int:specification_id>/versions/<int:version_id>/",
        SpecificationVersionDetailView.as_view(),
        name="material-specification-version-detail",
    ),
]
