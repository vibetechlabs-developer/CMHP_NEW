from django.urls import path

from apps.permissions.views import (
    MyStorePermissionsView,
    StoreRoleActivateView,
    StoreRoleDeactivateView,
    StoreRoleDetailView,
    StoreRoleListCreateView,
    StoreRolePermissionsView,
)
from apps.stores.views import (
    MyStoresView,
    StorageLocationActivateView,
    StorageLocationDeactivateView,
    StorageLocationDetailView,
    StorageLocationListCreateView,
    StoreActivateView,
    StoreDeactivateView,
    StoreDetailView,
    StoreListCreateView,
    StoreMembershipDeactivateView,
    StoreMembershipListCreateView,
    StoreOverviewView,
    StoreRoleAssignmentDeactivateView,
    StoreRoleAssignmentListCreateView,
)

urlpatterns = [
    # Literal/explicit paths first, so they can never be shadowed by the
    # <int:store_id>/ detail route below - same convention as
    # apps.companies.urls.
    path("", StoreListCreateView.as_view(), name="store-list-create"),
    path("mine/", MyStoresView.as_view(), name="stores-mine"),
    path("<int:store_id>/", StoreDetailView.as_view(), name="store-detail"),
    path("<int:store_id>/activate/", StoreActivateView.as_view(), name="store-activate"),
    path("<int:store_id>/deactivate/", StoreDeactivateView.as_view(), name="store-deactivate"),
    path(
        "<int:store_id>/my-permissions/",
        MyStorePermissionsView.as_view(),
        name="store-my-permissions",
    ),
    path("<int:store_id>/overview/", StoreOverviewView.as_view(), name="store-overview"),
    path(
        "<int:store_id>/roles/",
        StoreRoleListCreateView.as_view(),
        name="store-role-list-create",
    ),
    path(
        "<int:store_id>/roles/<int:role_id>/",
        StoreRoleDetailView.as_view(),
        name="store-role-detail",
    ),
    path(
        "<int:store_id>/roles/<int:role_id>/activate/",
        StoreRoleActivateView.as_view(),
        name="store-role-activate",
    ),
    path(
        "<int:store_id>/roles/<int:role_id>/deactivate/",
        StoreRoleDeactivateView.as_view(),
        name="store-role-deactivate",
    ),
    path(
        "<int:store_id>/roles/<int:role_id>/permissions/",
        StoreRolePermissionsView.as_view(),
        name="store-role-permissions",
    ),
    path(
        "<int:store_id>/memberships/",
        StoreMembershipListCreateView.as_view(),
        name="store-membership-list-create",
    ),
    path(
        "<int:store_id>/memberships/<int:membership_id>/deactivate/",
        StoreMembershipDeactivateView.as_view(),
        name="store-membership-deactivate",
    ),
    path(
        "<int:store_id>/memberships/<int:membership_id>/roles/",
        StoreRoleAssignmentListCreateView.as_view(),
        name="store-membership-roles",
    ),
    path(
        "<int:store_id>/memberships/<int:membership_id>/roles/<int:assignment_id>/deactivate/",
        StoreRoleAssignmentDeactivateView.as_view(),
        name="store-membership-role-deactivate",
    ),
    path(
        "<int:store_id>/locations/",
        StorageLocationListCreateView.as_view(),
        name="store-location-list-create",
    ),
    path(
        "<int:store_id>/locations/<int:location_id>/",
        StorageLocationDetailView.as_view(),
        name="store-location-detail",
    ),
    path(
        "<int:store_id>/locations/<int:location_id>/activate/",
        StorageLocationActivateView.as_view(),
        name="store-location-activate",
    ),
    path(
        "<int:store_id>/locations/<int:location_id>/deactivate/",
        StorageLocationDeactivateView.as_view(),
        name="store-location-deactivate",
    ),
]
