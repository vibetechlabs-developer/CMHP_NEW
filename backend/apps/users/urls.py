from django.urls import path

from apps.users.views import (
    MembershipDeactivateView,
    MembershipListCreateView,
    RoleAssignmentDeactivateView,
    RoleAssignmentListCreateView,
    UserActivateView,
    UserDeactivateView,
    UserDetailView,
    UserListCreateView,
)

urlpatterns = [
    path("", UserListCreateView.as_view(), name="user-list-create"),
    path("<int:user_id>/", UserDetailView.as_view(), name="user-detail"),
    path("<int:user_id>/activate/", UserActivateView.as_view(), name="user-activate"),
    path("<int:user_id>/deactivate/", UserDeactivateView.as_view(), name="user-deactivate"),
    path(
        "<int:user_id>/memberships/",
        MembershipListCreateView.as_view(),
        name="user-memberships",
    ),
    path(
        "<int:user_id>/memberships/<int:membership_id>/deactivate/",
        MembershipDeactivateView.as_view(),
        name="user-membership-deactivate",
    ),
    path(
        "<int:user_id>/memberships/<int:membership_id>/roles/",
        RoleAssignmentListCreateView.as_view(),
        name="user-membership-roles",
    ),
    path(
        "<int:user_id>/memberships/<int:membership_id>/roles/<int:assignment_id>/deactivate/",
        RoleAssignmentDeactivateView.as_view(),
        name="user-membership-role-deactivate",
    ),
]
