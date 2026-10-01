from django.urls import path

from apps.batch_register.views import BatchRegisterListView

urlpatterns = [
    path("<int:company_id>/batch-register/", BatchRegisterListView.as_view(), name="batch-register-list"),
]
