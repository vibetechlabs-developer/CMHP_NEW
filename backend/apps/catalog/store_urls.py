from django.urls import path

from apps.catalog.views import MaterialReorderSettingView

# Mounted at /api/v1/stores/ (see config/urls.py), same pattern as
# apps.receiving.container_type_urls - MaterialReorderSetting is a
# store-scoped operational setting, kept as its own small urls module
# physically alongside the model/views/services it routes to in
# apps.catalog, rather than bundled into apps.catalog.urls (which is
# mounted at the bare /api/v1/ prefix for shared, store-independent
# catalog data - this endpoint is the one exception that needs a store
# id in its path).
urlpatterns = [
    path(
        "<int:store_id>/materials/<int:material_id>/reorder-setting/",
        MaterialReorderSettingView.as_view(),
        name="material-reorder-setting",
    ),
]
