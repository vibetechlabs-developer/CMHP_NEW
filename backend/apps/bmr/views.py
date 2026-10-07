from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import exceptions
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.batch_plans.models import BatchPlan
from apps.batch_plans.views import _get_company_for_action
from apps.bmr.models import BatchManufacturingRecord, BMRLine
from apps.bmr.serializers import BMRLineSerializer, BMRLineUpdateSerializer, BMRSerializer
from apps.bmr.services import create_bmr, update_bmr_line
from apps.common.errors import translate_django_validation_error

BMR_VIEW = "bmr.view"
BMR_CREATE = "bmr.create"
BMR_EDIT = "bmr.edit"
BATCH_PLANS_VIEW = "batch_plans.view"
FORMULAS_VIEW = "formulas.view"


@method_decorator(never_cache, name="dispatch")
class BMRForPlanView(APIView):
    """GET: the BMR of a batch plan (404 if none yet) - `bmr.view`.
    POST: create it from the requirement preview - `bmr.create` plus
    `batch_plans.view` and `formulas.view` (the preview reads the pinned revision).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, plan_id):
        company = _get_company_for_action(request, company_id, BMR_VIEW, BATCH_PLANS_VIEW)
        plan = get_object_or_404(BatchPlan, pk=plan_id, company=company)
        bmr = BatchManufacturingRecord.objects.filter(batch_plan=plan).first()
        if bmr is None:
            raise exceptions.NotFound("No batch manufacturing record has been created for this batch plan yet.")
        return Response(BMRSerializer(bmr).data)

    def post(self, request, company_id, plan_id):
        company = _get_company_for_action(request, company_id, BMR_CREATE, BATCH_PLANS_VIEW, FORMULAS_VIEW)
        try:
            bmr = create_bmr(actor=request.user, company=company, batch_plan_id=plan_id)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(BMRSerializer(BatchManufacturingRecord.objects.get(pk=bmr.pk)).data, status=201)


@method_decorator(never_cache, name="dispatch")
class BMRLineDetailView(APIView):
    """PATCH one slip line's free-text fields - `bmr.view` and `bmr.edit`.
    Required quantities cannot be changed through this endpoint.
    """

    permission_classes = [IsAuthenticated]

    def patch(self, request, company_id, bmr_id, line_id):
        company = _get_company_for_action(request, company_id, BMR_VIEW, BMR_EDIT)
        bmr = get_object_or_404(BatchManufacturingRecord, pk=bmr_id, company=company)
        serializer = BMRLineUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        expected_version = data.pop("expected_version")
        try:
            line = update_bmr_line(actor=request.user, bmr=bmr, line_id=line_id, expected_version=expected_version, data=data)
        except DjangoValidationError as exc:
            raise translate_django_validation_error(exc) from exc
        return Response(BMRLineSerializer(BMRLine.objects.get(pk=line.pk)).data)
