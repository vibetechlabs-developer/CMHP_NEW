from django.urls import path

from apps.permissions.views import PermissionCatalogView

urlpatterns = [
    path("", PermissionCatalogView.as_view(), name="permission-catalog"),
]
