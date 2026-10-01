from django.urls import path

from apps.companies.views import (
    CompanyActivateView,
    CompanyDeactivateView,
    CompanyDetailView,
    CompanyListCreateView,
    MyCompaniesView,
)
from apps.permissions.views import (
    CompanyRoleActivateView,
    CompanyRoleDeactivateView,
    CompanyRoleDetailView,
    CompanyRoleListCreateView,
    MyCompanyPermissionsView,
    RolePermissionsView,
)

urlpatterns = [
    # Literal/explicit paths first, so they can never be shadowed by the
    # <int:company_id>/ detail route below (Django matches the first
    # pattern whose shape fits the URL - "mine/" only ever matches the
    # literal segment "mine", never an integer, so there is no actual
    # ambiguity either way, but the explicit route is still listed first
    # for clarity).
    path("", CompanyListCreateView.as_view(), name="company-list-create"),
    path("mine/", MyCompaniesView.as_view(), name="companies-mine"),
    path("<int:company_id>/", CompanyDetailView.as_view(), name="company-detail"),
    path("<int:company_id>/activate/", CompanyActivateView.as_view(), name="company-activate"),
    path("<int:company_id>/deactivate/", CompanyDeactivateView.as_view(), name="company-deactivate"),
    path(
        "<int:company_id>/my-permissions/",
        MyCompanyPermissionsView.as_view(),
        name="company-my-permissions",
    ),
    path(
        "<int:company_id>/roles/",
        CompanyRoleListCreateView.as_view(),
        name="company-role-list-create",
    ),
    path(
        "<int:company_id>/roles/<int:role_id>/",
        CompanyRoleDetailView.as_view(),
        name="company-role-detail",
    ),
    path(
        "<int:company_id>/roles/<int:role_id>/activate/",
        CompanyRoleActivateView.as_view(),
        name="company-role-activate",
    ),
    path(
        "<int:company_id>/roles/<int:role_id>/deactivate/",
        CompanyRoleDeactivateView.as_view(),
        name="company-role-deactivate",
    ),
    path(
        "<int:company_id>/roles/<int:role_id>/permissions/",
        RolePermissionsView.as_view(),
        name="company-role-permissions",
    ),
]
