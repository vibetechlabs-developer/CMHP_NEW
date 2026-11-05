from datetime import date, datetime
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import exceptions, generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.companies.models import Company
from apps.companies.services import active_companies_for_user
from apps.hrms.models import (
    Department,
    Designation,
    Shift,
    Holiday,
    LeaveType,
    EmployeeProfile,
    AttendanceRecord,
    AttendanceRegularization,
    LeaveRequest,
    SalaryStructure,
    PayrollRecord,
)
from apps.hrms.serializers import (
    DepartmentSerializer,
    DesignationSerializer,
    ShiftSerializer,
    HolidaySerializer,
    LeaveTypeSerializer,
    EmployeeSerializer,
    AttendanceRecordSerializer,
    AttendanceRegularizationSerializer,
    LeaveRequestSerializer,
    SalaryStructureSerializer,
    PayrollRecordSerializer,
)
from apps.hrms.services import (
    get_dashboard_summary,
    do_check_in,
    do_check_out,
    decide_leave_request,
    process_monthly_payroll,
)

User = get_user_model()


def _get_company_for_hrms(request, company_id):
    """Ensure the user has access to this company."""
    user = request.user
    if user.is_superuser:
        company = Company.objects.filter(pk=company_id, is_active=True).first()
    else:
        company = active_companies_for_user(user).filter(pk=company_id).first()

    if company is None:
        raise exceptions.NotFound("Company not found or access denied.")
    return company


# ==============================================================================
# DASHBOARD SUMMARY
# ==============================================================================

class DashboardSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        _get_company_for_hrms(request, company_id)
        summary = get_dashboard_summary(company_id)
        return Response(summary)


# ==============================================================================
# EMPLOYEES
# ==============================================================================

class EmployeeListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        _get_company_for_hrms(request, company_id)
        users = (
            User.objects.filter(
                company_memberships__company_id=company_id,
                company_memberships__is_active=True,
            )
            .distinct()
            .select_related("employee_profile")
            .order_by("username")
        )
        serializer = EmployeeSerializer(users, many=True)
        return Response(serializer.data)

    def post(self, request, company_id):
        company = _get_company_for_hrms(request, company_id)
        data = request.data.copy()

        username = data.get("username", "").strip()
        email = data.get("email", "").strip()
        if not username or not email:
            raise exceptions.ValidationError({"detail": "Username and Email are required."})

        # Check existing user
        if User.objects.filter(username=username).exists():
            raise exceptions.ValidationError({"username": "Username already exists."})
        if User.objects.filter(email=email).exists():
            raise exceptions.ValidationError({"email": "Email already exists."})

        # Create User
        user = User(
            username=username,
            email=email,
            first_name=data.get("first_name", "").strip(),
            last_name=data.get("last_name", "").strip(),
            phone=data.get("phone", "").strip(),
            employee_id=data.get("employee_id", "").strip(),
            department=data.get("department", "").strip(),
            designation=data.get("designation", "").strip(),
            joining_date=data.get("joining_date") or None,
            employment_status=data.get("employment_status", "ACTIVE").lower(),
            is_active=True,
        )
        password = data.get("password", "").strip() or "Employee@123"
        user.set_password(password)
        user.save()

        # Add Company Membership
        company.memberships.get_or_create(user=user, defaults={"is_active": True})

        # Profile fields
        monthly_salary = data.get("monthly_salary")
        if monthly_salary is not None and monthly_salary != "":
            try:
                monthly_salary = Decimal(str(monthly_salary))
            except Exception:
                monthly_salary = None
        else:
            monthly_salary = None

        shift_id = data.get("shift")
        shift_obj = Shift.objects.filter(id=shift_id).first() if shift_id else None

        rep_mgr_id = data.get("reporting_manager")
        rep_mgr_obj = User.objects.filter(id=rep_mgr_id).first() if rep_mgr_id else None

        dept_obj = None
        if data.get("department"):
            dept_obj = Department.objects.filter(
                Q(id__in=[data.get("department")] if str(data.get("department")).isdigit() else [])
                | Q(name__iexact=str(data.get("department"))),
                Q(company=company) | Q(company__isnull=True),
            ).first()

        desig_obj = None
        if data.get("designation"):
            desig_obj = Designation.objects.filter(
                Q(id__in=[data.get("designation")] if str(data.get("designation")).isdigit() else [])
                | Q(name__iexact=str(data.get("designation"))),
                Q(company=company) | Q(company__isnull=True),
            ).first()

        EmployeeProfile.objects.create(
            user=user,
            gender=data.get("gender", "MALE"),
            dob=data.get("dob") or None,
            employment_type=data.get("employment_type", "FULL_TIME"),
            reporting_manager=rep_mgr_obj,
            shift=shift_obj,
            department=dept_obj,
            designation=desig_obj,
            emergency_contact_name=data.get("emergency_contact_name", "").strip(),
            emergency_contact_relation=data.get("emergency_contact_relation", "").strip(),
            emergency_contact_phone=data.get("emergency_contact_phone", "").strip(),
            bank_name=data.get("bank_name", "").strip(),
            bank_account_number=data.get("bank_account_number", "").strip(),
            bank_ifsc=data.get("bank_ifsc", "").strip(),
            monthly_salary=monthly_salary,
            pan=data.get("pan", "").strip(),
            uan=data.get("uan", "").strip(),
            aadhaar=data.get("aadhaar", "").strip(),
            photo_url=data.get("photo_url", "").strip(),
            documents=data.get("documents") or [],
        )

        # Automatic SalaryStructure creation if monthly_salary is provided
        if monthly_salary and monthly_salary > 0:
            SalaryStructure.objects.create(
                company=company,
                user=user,
                effective_from=data.get("joining_date") or timezone.localdate(),
                basic=monthly_salary,
                allowances=Decimal("0.0"),
                deductions=Decimal("0.0"),
                note="Auto-generated on employee creation.",
            )

        serializer = EmployeeSerializer(user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class EmployeeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, user_id):
        _get_company_for_hrms(request, company_id)
        user = get_object_or_404(User, id=user_id)
        serializer = EmployeeSerializer(user)
        return Response(serializer.data)

    def patch(self, request, company_id, user_id):
        company = _get_company_for_hrms(request, company_id)
        user = get_object_or_404(User, id=user_id)
        data = request.data

        # Update User fields
        for field in ["first_name", "last_name", "email", "phone", "employee_id", "department", "designation"]:
            if field in data:
                setattr(user, field, (data[field] or "").strip())

        if "joining_date" in data:
            user.joining_date = data["joining_date"] or None
        if "employment_status" in data:
            user.employment_status = (data["employment_status"] or "ACTIVE").lower()
        if "is_active" in data:
            user.is_active = bool(data["is_active"])

        user.save()

        # Update or create EmployeeProfile
        profile, _ = EmployeeProfile.objects.get_or_create(user=user)
        if "gender" in data:
            profile.gender = data["gender"] or "MALE"
        if "dob" in data:
            profile.dob = data["dob"] or None
        if "employment_type" in data:
            profile.employment_type = data["employment_type"] or "FULL_TIME"
        if "emergency_contact_name" in data:
            profile.emergency_contact_name = data["emergency_contact_name"] or ""
        if "emergency_contact_relation" in data:
            profile.emergency_contact_relation = data["emergency_contact_relation"] or ""
        if "emergency_contact_phone" in data:
            profile.emergency_contact_phone = data["emergency_contact_phone"] or ""
        if "bank_name" in data:
            profile.bank_name = data["bank_name"] or ""
        if "bank_account_number" in data:
            profile.bank_account_number = data["bank_account_number"] or ""
        if "bank_ifsc" in data:
            profile.bank_ifsc = data["bank_ifsc"] or ""
        if "pan" in data:
            profile.pan = data["pan"] or ""
        if "uan" in data:
            profile.uan = data["uan"] or ""
        if "aadhaar" in data:
            profile.aadhaar = data["aadhaar"] or ""
        if "photo_url" in data:
            profile.photo_url = data["photo_url"] or ""
        if "documents" in data:
            profile.documents = data["documents"] or []

        if "shift" in data:
            shift_id = data["shift"]
            profile.shift = Shift.objects.filter(id=shift_id).first() if shift_id else None
        if "reporting_manager" in data:
            mgr_id = data["reporting_manager"]
            profile.reporting_manager = User.objects.filter(id=mgr_id).first() if mgr_id else None

        if "monthly_salary" in data:
            raw_sal = data["monthly_salary"]
            if raw_sal is not None and raw_sal != "":
                profile.monthly_salary = Decimal(str(raw_sal))
                # Update latest active SalaryStructure
                latest_salary = SalaryStructure.objects.filter(
                    company=company, user=user, is_active=True
                ).order_by("-effective_from", "-id").first()
                if latest_salary:
                    latest_salary.basic = profile.monthly_salary
                    latest_salary.save()
                else:
                    SalaryStructure.objects.create(
                        company=company,
                        user=user,
                        basic=profile.monthly_salary,
                        effective_from=timezone.localdate(),
                        note="Updated from employee edit.",
                    )
            else:
                profile.monthly_salary = None

        profile.save()

        serializer = EmployeeSerializer(user)
        return Response(serializer.data)

    def delete(self, request, company_id, user_id):
        _get_company_for_hrms(request, company_id)
        user = get_object_or_404(User, id=user_id)
        user.is_active = False
        user.save(update_fields=["is_active"])
        return Response({"status": "deactivated", "id": user_id})


class EmployeeActivateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, user_id):
        _get_company_for_hrms(request, company_id)
        user = get_object_or_404(User, id=user_id)
        user.is_active = True
        user.save(update_fields=["is_active"])
        return Response({"status": "activated", "id": user_id})


class EmployeeDeactivateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, user_id):
        _get_company_for_hrms(request, company_id)
        user = get_object_or_404(User, id=user_id)
        user.is_active = False
        user.save(update_fields=["is_active"])
        return Response({"status": "deactivated", "id": user_id})


# ==============================================================================
# DEPARTMENTS
# ==============================================================================

class DepartmentListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = DepartmentSerializer

    def get_queryset(self):
        company_id = self.kwargs["company_id"]
        _get_company_for_hrms(self.request, company_id)
        return Department.objects.filter(Q(company_id=company_id) | Q(company__isnull=True)).order_by("name")

    def perform_create(self, serializer):
        company_id = self.kwargs["company_id"]
        company = _get_company_for_hrms(self.request, company_id)
        serializer.save(company=company)


class DepartmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = DepartmentSerializer

    def get_queryset(self):
        company_id = self.kwargs["company_id"]
        _get_company_for_hrms(self.request, company_id)
        return Department.objects.filter(Q(company_id=company_id) | Q(company__isnull=True))


# ==============================================================================
# DESIGNATIONS
# ==============================================================================

class DesignationListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = DesignationSerializer

    def get_queryset(self):
        company_id = self.kwargs["company_id"]
        _get_company_for_hrms(self.request, company_id)
        return Designation.objects.filter(
            Q(company_id=company_id) | Q(company__isnull=True)
        ).select_related("department").order_by("name")

    def perform_create(self, serializer):
        company_id = self.kwargs["company_id"]
        company = _get_company_for_hrms(self.request, company_id)
        serializer.save(company=company)


class DesignationDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = DesignationSerializer

    def get_queryset(self):
        company_id = self.kwargs["company_id"]
        _get_company_for_hrms(self.request, company_id)
        return Designation.objects.filter(Q(company_id=company_id) | Q(company__isnull=True))


# ==============================================================================
# SHIFTS
# ==============================================================================

class ShiftListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ShiftSerializer

    def get_queryset(self):
        company_id = self.kwargs["company_id"]
        _get_company_for_hrms(self.request, company_id)
        return Shift.objects.filter(Q(company_id=company_id) | Q(company__isnull=True)).order_by("start_time")

    def perform_create(self, serializer):
        company_id = self.kwargs["company_id"]
        company = _get_company_for_hrms(self.request, company_id)
        serializer.save(company=company)


class ShiftDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ShiftSerializer

    def get_queryset(self):
        company_id = self.kwargs["company_id"]
        _get_company_for_hrms(self.request, company_id)
        return Shift.objects.filter(Q(company_id=company_id) | Q(company__isnull=True))


# ==============================================================================
# HOLIDAYS
# ==============================================================================

class HolidayListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = HolidaySerializer

    def get_queryset(self):
        company_id = self.kwargs["company_id"]
        _get_company_for_hrms(self.request, company_id)
        return Holiday.objects.filter(Q(company_id=company_id) | Q(company__isnull=True)).order_by("date")

    def perform_create(self, serializer):
        company_id = self.kwargs["company_id"]
        company = _get_company_for_hrms(self.request, company_id)
        serializer.save(company=company)


class HolidayDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = HolidaySerializer

    def get_queryset(self):
        company_id = self.kwargs["company_id"]
        _get_company_for_hrms(self.request, company_id)
        return Holiday.objects.filter(Q(company_id=company_id) | Q(company__isnull=True))


# ==============================================================================
# LEAVE TYPES
# ==============================================================================

class LeaveTypeListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = LeaveTypeSerializer

    def get_queryset(self):
        company_id = self.kwargs["company_id"]
        _get_company_for_hrms(self.request, company_id)
        return LeaveType.objects.filter(Q(company_id=company_id) | Q(company__isnull=True)).order_by("name")

    def perform_create(self, serializer):
        company_id = self.kwargs["company_id"]
        company = _get_company_for_hrms(self.request, company_id)
        serializer.save(company=company)


class LeaveTypeDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = LeaveTypeSerializer

    def get_queryset(self):
        company_id = self.kwargs["company_id"]
        _get_company_for_hrms(self.request, company_id)
        return LeaveType.objects.filter(Q(company_id=company_id) | Q(company__isnull=True))


# ==============================================================================
# ATTENDANCE
# ==============================================================================

class AttendanceListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AttendanceRecordSerializer

    def get_queryset(self):
        company_id = self.kwargs["company_id"]
        _get_company_for_hrms(self.request, company_id)
        qs = AttendanceRecord.objects.filter(company_id=company_id).select_related("user", "shift")

        date_param = self.request.query_params.get("date")
        if date_param:
            qs = qs.filter(date=date_param)

        from_date = self.request.query_params.get("from_date")
        to_date = self.request.query_params.get("to_date")
        if from_date and to_date:
            qs = qs.filter(date__gte=from_date, date__lte=to_date)

        user_id = self.request.query_params.get("user")
        if user_id:
            qs = qs.filter(user_id=user_id)

        return qs.order_by("-date", "user__username")

    def perform_create(self, serializer):
        company_id = self.kwargs["company_id"]
        company = _get_company_for_hrms(self.request, company_id)
        serializer.save(company=company)


class AttendanceDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AttendanceRecordSerializer

    def get_queryset(self):
        company_id = self.kwargs["company_id"]
        _get_company_for_hrms(self.request, company_id)
        return AttendanceRecord.objects.filter(company_id=company_id)


class AttendanceCheckInView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id):
        _get_company_for_hrms(request, company_id)
        target_user_id = request.data.get("user_id") or request.user.id
        target_user = get_object_or_404(User, id=target_user_id)
        record = do_check_in(user=target_user, company_id=company_id)
        return Response(AttendanceRecordSerializer(record).data)


class AttendanceCheckOutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id):
        _get_company_for_hrms(request, company_id)
        target_user_id = request.data.get("user_id") or request.user.id
        target_user = get_object_or_404(User, id=target_user_id)
        record = do_check_out(user=target_user, company_id=company_id)
        return Response(AttendanceRecordSerializer(record).data)


class AttendanceRegularizationListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AttendanceRegularizationSerializer

    def get_queryset(self):
        company_id = self.kwargs["company_id"]
        _get_company_for_hrms(self.request, company_id)
        qs = AttendanceRegularization.objects.filter(company_id=company_id).select_related("user", "actioned_by")

        user_id = self.request.query_params.get("user")
        if user_id:
            qs = qs.filter(user_id=user_id)

        return qs.order_by("-date", "-created_at")

    def perform_create(self, serializer):
        company_id = self.kwargs["company_id"]
        company = _get_company_for_hrms(self.request, company_id)
        user = self.request.user
        target_user_id = self.request.data.get("user") or user.id
        target_user = get_object_or_404(User, id=target_user_id)
        serializer.save(company=company, user=target_user)


class AttendanceRegularizationDecisionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, reg_id):
        _get_company_for_hrms(request, company_id)
        reg = get_object_or_404(AttendanceRegularization, id=reg_id, company_id=company_id)
        decision = request.data.get("decision", "").upper()
        if decision not in ["APPROVED", "REJECTED"]:
            raise exceptions.ValidationError("Decision must be APPROVED or REJECTED.")

        reg.status = decision
        reg.actioned_by = request.user
        reg.actioned_at = timezone.now()
        reg.rejection_reason = request.data.get("rejection_reason", "")
        reg.save()

        # If approved, update AttendanceRecord
        if decision == "APPROVED":
            att, _ = AttendanceRecord.objects.get_or_create(
                user=reg.user,
                date=reg.date,
                defaults={"company_id": company_id, "status": "PRESENT", "is_manual": True},
            )
            if reg.check_in:
                att.check_in = timezone.make_aware(datetime.combine(reg.date, reg.check_in))
            if reg.check_out:
                att.check_out = timezone.make_aware(datetime.combine(reg.date, reg.check_out))
            if att.check_in and att.check_out:
                hours = (att.check_out - att.check_in).total_seconds() / 3600.0
                att.working_hours = Decimal(f"{hours:.2f}")
            att.status = "PRESENT"
            att.save()

        return Response(AttendanceRegularizationSerializer(reg).data)


# ==============================================================================
# LEAVE REQUESTS
# ==============================================================================

class LeaveRequestListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = LeaveRequestSerializer

    def get_queryset(self):
        company_id = self.kwargs["company_id"]
        _get_company_for_hrms(self.request, company_id)
        qs = LeaveRequest.objects.filter(company_id=company_id).select_related("user", "leave_type", "actioned_by")

        user_id = self.request.query_params.get("user")
        if user_id:
            qs = qs.filter(user_id=user_id)

        status_param = self.request.query_params.get("status")
        if status_param and status_param != "ALL":
            qs = qs.filter(status=status_param.upper())

        return qs.order_by("-from_date", "-created_at")

    def perform_create(self, serializer):
        company_id = self.kwargs["company_id"]
        company = _get_company_for_hrms(self.request, company_id)
        user = self.request.user
        target_user_id = self.request.data.get("user") or user.id
        target_user = get_object_or_404(User, id=target_user_id)
        serializer.save(company=company, user=target_user)


class LeaveRequestDecisionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, request_id):
        _get_company_for_hrms(request, company_id)
        leave_req = get_object_or_404(LeaveRequest, id=request_id, company_id=company_id)
        decision = request.data.get("decision", "").upper()
        rejection_reason = request.data.get("rejection_reason", "")

        decide_leave_request(
            leave_request=leave_req,
            decision=decision,
            actioned_by=request.user,
            rejection_reason=rejection_reason,
        )
        return Response(LeaveRequestSerializer(leave_req).data)


class LeaveRequestCancelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, request_id):
        _get_company_for_hrms(request, company_id)
        leave_req = get_object_or_404(LeaveRequest, id=request_id, company_id=company_id)
        leave_req.status = "CANCELLED"
        leave_req.save(update_fields=["status", "updated_at"])
        return Response(LeaveRequestSerializer(leave_req).data)


# ==============================================================================
# SALARY STRUCTURES
# ==============================================================================

class SalaryStructureListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = SalaryStructureSerializer

    def get_queryset(self):
        company_id = self.kwargs["company_id"]
        _get_company_for_hrms(self.request, company_id)
        qs = SalaryStructure.objects.filter(company_id=company_id).select_related("user")

        user_id = self.request.query_params.get("user")
        if user_id:
            qs = qs.filter(user_id=user_id)

        return qs.order_by("-effective_from", "-id")

    def perform_create(self, serializer):
        company_id = self.kwargs["company_id"]
        company = _get_company_for_hrms(self.request, company_id)
        serializer.save(company=company)


class SalaryStructureDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = SalaryStructureSerializer

    def get_queryset(self):
        company_id = self.kwargs["company_id"]
        _get_company_for_hrms(self.request, company_id)
        return SalaryStructure.objects.filter(company_id=company_id)


# ==============================================================================
# PAYROLL RECORDS
# ==============================================================================

class PayrollRecordListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = PayrollRecordSerializer

    def get_queryset(self):
        company_id = self.kwargs["company_id"]
        _get_company_for_hrms(self.request, company_id)
        qs = PayrollRecord.objects.filter(company_id=company_id).select_related("user")

        month = self.request.query_params.get("month")
        if month:
            qs = qs.filter(month=month)

        user_id = self.request.query_params.get("user")
        if user_id:
            qs = qs.filter(user_id=user_id)

        return qs.order_by("-month", "user__username")


class PayrollProcessView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id):
        _get_company_for_hrms(request, company_id)
        month = request.data.get("month")
        if not month:
            month = timezone.localdate().strftime("%Y-%m")

        records = process_monthly_payroll(company_id=company_id, month=month, actor=request.user)
        return Response(PayrollRecordSerializer(records, many=True).data)


class PayrollMarkPaidView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id):
        _get_company_for_hrms(request, company_id)
        month = request.data.get("month")
        user_id = request.data.get("user_id")
        amount = request.data.get("amount")

        record = PayrollRecord.objects.filter(company_id=company_id, user_id=user_id, month=month).first()
        if not record:
            user = get_object_or_404(User, id=user_id)
            record = PayrollRecord.objects.create(
                company_id=company_id,
                user=user,
                month=month,
                net_salary=Decimal(str(amount or 0)),
                gross_salary=Decimal(str(amount or 0)),
            )

        record.status = "PAID"
        record.payment_date = timezone.localdate()
        record.payment_mode = request.data.get("payment_mode", "BANK_TRANSFER")
        record.reference_number = request.data.get("reference_number", "")
        record.save()

        return Response(PayrollRecordSerializer(record).data)


class PayrollMarkUnpaidView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id):
        _get_company_for_hrms(request, company_id)
        month = request.data.get("month")
        user_id = request.data.get("user_id")

        record = PayrollRecord.objects.filter(company_id=company_id, user_id=user_id, month=month).first()
        if record:
            record.status = "PROCESSED"
            record.payment_date = None
            record.save()

        return Response({"status": "unmarked"})
