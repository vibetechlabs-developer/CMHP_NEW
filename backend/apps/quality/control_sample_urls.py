from django.urls import path

from apps.quality.control_sample_views import (
    ControlSampleDetailView,
    ControlSampleDisposeView,
    ControlSampleListCreateView,
)

urlpatterns = [
    path(
        "<int:company_id>/control-samples/",
        ControlSampleListCreateView.as_view(),
        name="control-sample-list-create",
    ),
    path(
        "<int:company_id>/control-samples/<int:sample_id>/",
        ControlSampleDetailView.as_view(),
        name="control-sample-detail",
    ),
    path(
        "<int:company_id>/control-samples/<int:sample_id>/dispose/",
        ControlSampleDisposeView.as_view(),
        name="control-sample-dispose",
    ),
]
