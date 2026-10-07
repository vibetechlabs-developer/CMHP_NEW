from django.urls import path

from apps.bmr.views import BMRForPlanView, BMRLineDetailView

urlpatterns = [
    path("<int:company_id>/batch-plans/<int:plan_id>/bmr/", BMRForPlanView.as_view(), name="bmr-for-plan"),
    path(
        "<int:company_id>/bmr/<int:bmr_id>/lines/<int:line_id>/",
        BMRLineDetailView.as_view(),
        name="bmr-line-detail",
    ),
]
