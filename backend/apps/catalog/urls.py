from django.urls import path

from apps.catalog.views import (
    ProductTypeDetailView,
    ProductTypeListCreateView,
    MaterialActivateView,
    MaterialCategoryActivateView,
    MaterialCategoryDeactivateView,
    MaterialCategoryDetailView,
    MaterialCategoryListCreateView,
    MaterialDeactivateView,
    MaterialDetailView,
    MaterialListCreateView,
    MaterialSupplierOptionsView,
    UnitOfMeasureActivateView,
    UnitOfMeasureDeactivateView,
    UnitOfMeasureDetailView,
    UnitOfMeasureListCreateView,
)

urlpatterns = [
    path("units/", UnitOfMeasureListCreateView.as_view(), name="unit-list-create"),
    path("product-types/", ProductTypeListCreateView.as_view(), name="product-type-list-create"),
    path("product-types/<int:product_type_id>/", ProductTypeDetailView.as_view(), name="product-type-detail"),
    path("units/<int:unit_id>/", UnitOfMeasureDetailView.as_view(), name="unit-detail"),
    path("units/<int:unit_id>/activate/", UnitOfMeasureActivateView.as_view(), name="unit-activate"),
    path("units/<int:unit_id>/deactivate/", UnitOfMeasureDeactivateView.as_view(), name="unit-deactivate"),
    path(
        "material-categories/",
        MaterialCategoryListCreateView.as_view(),
        name="material-category-list-create",
    ),
    path(
        "material-categories/<int:category_id>/",
        MaterialCategoryDetailView.as_view(),
        name="material-category-detail",
    ),
    path(
        "material-categories/<int:category_id>/activate/",
        MaterialCategoryActivateView.as_view(),
        name="material-category-activate",
    ),
    path(
        "material-categories/<int:category_id>/deactivate/",
        MaterialCategoryDeactivateView.as_view(),
        name="material-category-deactivate",
    ),
    path("materials/", MaterialListCreateView.as_view(), name="material-list-create"),
    path("materials/suppliers/", MaterialSupplierOptionsView.as_view(), name="material-supplier-options"),
    path("materials/<int:material_id>/", MaterialDetailView.as_view(), name="material-detail"),
    path(
        "materials/<int:material_id>/activate/",
        MaterialActivateView.as_view(),
        name="material-activate",
    ),
    path(
        "materials/<int:material_id>/deactivate/",
        MaterialDeactivateView.as_view(),
        name="material-deactivate",
    ),
]
