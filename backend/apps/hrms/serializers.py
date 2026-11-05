from rest_framework import serializers
from django.contrib.auth import get_user_model

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

User = get_user_model()


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = [
            "id",
            "company",
            "name",
            "code",
            "description",
            "is_active",
            "created_at",
            "updated_at",
        ]


class DesignationSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source="department.name", read_only=True)

    class Meta:
        model = Designation
        fields = [
            "id",
            "company",
            "department",
            "department_name",
            "name",
            "code",
            "level",
            "description",
            "is_active",
            "created_at",
            "updated_at",
        ]


class ShiftSerializer(serializers.ModelSerializer):
    start_time = serializers.TimeField(format="%H:%M")
    end_time = serializers.TimeField(format="%H:%M")

    class Meta:
        model = Shift
        fields = [
            "id",
            "company",
            "name",
            "code",
            "start_time",
            "end_time",
            "grace_period_mins",
            "half_day_hours",
            "full_day_hours",
            "working_days",
            "is_active",
            "created_at",
            "updated_at",
        ]


class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = [
            "id",
            "company",
            "name",
            "date",
            "description",
            "is_optional",
            "created_at",
            "updated_at",
        ]


class LeaveTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveType
        fields = [
            "id",
            "company",
            "name",
            "code",
            "days_allowed",
            "is_paid",
            "is_carry_forward",
            "description",
            "is_active",
            "created_at",
            "updated_at",
        ]


class AttendanceRecordSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_code = serializers.CharField(source="user.employee_id", read_only=True)
    shift_name = serializers.CharField(source="shift.name", read_only=True)

    class Meta:
        model = AttendanceRecord
        fields = [
            "id",
            "company",
            "user",
            "employee_name",
            "employee_code",
            "date",
            "check_in",
            "check_out",
            "status",
            "working_hours",
            "shift",
            "shift_name",
            "notes",
            "is_manual",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["company"]

    def get_employee_name(self, obj):
        name = f"{obj.user.first_name} {obj.user.last_name}".strip()
        return name or obj.user.username


class AttendanceRegularizationSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_code = serializers.CharField(source="user.employee_id", read_only=True)
    actioned_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AttendanceRegularization
        fields = [
            "id",
            "company",
            "user",
            "employee_name",
            "employee_code",
            "date",
            "check_in",
            "check_out",
            "reason",
            "status",
            "actioned_by",
            "actioned_by_name",
            "actioned_at",
            "rejection_reason",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["company"]

    def get_employee_name(self, obj):
        name = f"{obj.user.first_name} {obj.user.last_name}".strip()
        return name or obj.user.username

    def get_actioned_by_name(self, obj):
        if not obj.actioned_by:
            return None
        name = f"{obj.actioned_by.first_name} {obj.actioned_by.last_name}".strip()
        return name or obj.actioned_by.username


class LeaveRequestSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_code = serializers.CharField(source="user.employee_id", read_only=True)
    leave_type_name = serializers.CharField(source="leave_type.name", read_only=True)
    leave_type_code = serializers.CharField(source="leave_type.code", read_only=True)
    actioned_by_name = serializers.SerializerMethodField()

    class Meta:
        model = LeaveRequest
        fields = [
            "id",
            "company",
            "user",
            "employee_name",
            "employee_code",
            "leave_type",
            "leave_type_name",
            "leave_type_code",
            "from_date",
            "to_date",
            "days",
            "reason",
            "status",
            "actioned_by",
            "actioned_by_name",
            "actioned_at",
            "rejection_reason",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["company"]

    def get_employee_name(self, obj):
        name = f"{obj.user.first_name} {obj.user.last_name}".strip()
        return name or obj.user.username

    def get_actioned_by_name(self, obj):
        if not obj.actioned_by:
            return None
        name = f"{obj.actioned_by.first_name} {obj.actioned_by.last_name}".strip()
        return name or obj.actioned_by.username


class SalaryStructureSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_code = serializers.CharField(source="user.employee_id", read_only=True)

    class Meta:
        model = SalaryStructure
        fields = [
            "id",
            "company",
            "user",
            "employee_name",
            "employee_code",
            "effective_from",
            "basic",
            "allowances",
            "incentives",
            "bonus",
            "other",
            "deductions",
            "pf_deduction",
            "esi_deduction",
            "tax_deduction",
            "net_salary",
            "note",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["company"]

    def get_employee_name(self, obj):
        name = f"{obj.user.first_name} {obj.user.last_name}".strip()
        return name or obj.user.username


class PayrollRecordSerializer(serializers.ModelSerializer):
    employee_name = serializers.SerializerMethodField()
    employee_code = serializers.CharField(source="user.employee_id", read_only=True)
    department_name = serializers.CharField(source="user.department", read_only=True)
    designation_name = serializers.CharField(source="user.designation", read_only=True)

    class Meta:
        model = PayrollRecord
        fields = [
            "id",
            "company",
            "user",
            "employee_name",
            "employee_code",
            "department_name",
            "designation_name",
            "month",
            "basic",
            "allowances",
            "deductions",
            "gross_salary",
            "net_salary",
            "present_days",
            "absent_days",
            "paid_leave_days",
            "unpaid_leave_days",
            "total_working_days",
            "status",
            "payment_date",
            "payment_mode",
            "reference_number",
            "notes",
            "created_at",
            "updated_at",
        ]

    def get_employee_name(self, obj):
        name = f"{obj.user.first_name} {obj.user.last_name}".strip()
        return name or obj.user.username


class EmployeeSerializer(serializers.ModelSerializer):
    """Rich Employee representation combining User + EmployeeProfile."""
    # Profile fields
    gender = serializers.CharField(source="employee_profile.gender", required=False, allow_blank=True, default="MALE")
    dob = serializers.DateField(source="employee_profile.dob", required=False, allow_null=True)
    employment_type = serializers.CharField(source="employee_profile.employment_type", required=False, allow_blank=True, default="FULL_TIME")
    reporting_manager = serializers.PrimaryKeyRelatedField(
        source="employee_profile.reporting_manager",
        queryset=User.objects.all(),
        required=False,
        allow_null=True,
    )
    reporting_manager_name = serializers.SerializerMethodField()
    shift = serializers.PrimaryKeyRelatedField(
        source="employee_profile.shift",
        queryset=Shift.objects.all(),
        required=False,
        allow_null=True,
    )
    emergency_contact_name = serializers.CharField(source="employee_profile.emergency_contact_name", required=False, allow_blank=True, default="")
    emergency_contact_relation = serializers.CharField(source="employee_profile.emergency_contact_relation", required=False, allow_blank=True, default="")
    emergency_contact_phone = serializers.CharField(source="employee_profile.emergency_contact_phone", required=False, allow_blank=True, default="")
    bank_name = serializers.CharField(source="employee_profile.bank_name", required=False, allow_blank=True, default="")
    bank_account_number = serializers.CharField(source="employee_profile.bank_account_number", required=False, allow_blank=True, default="")
    bank_ifsc = serializers.CharField(source="employee_profile.bank_ifsc", required=False, allow_blank=True, default="")
    monthly_salary = serializers.DecimalField(source="employee_profile.monthly_salary", max_digits=12, decimal_places=2, required=False, allow_null=True)
    pan = serializers.CharField(source="employee_profile.pan", required=False, allow_blank=True, default="")
    uan = serializers.CharField(source="employee_profile.uan", required=False, allow_blank=True, default="")
    aadhaar = serializers.CharField(source="employee_profile.aadhaar", required=False, allow_blank=True, default="")
    photo_url = serializers.CharField(source="employee_profile.photo_url", required=False, allow_blank=True, default="")
    documents = serializers.JSONField(source="employee_profile.documents", required=False, default=list)

    # Scoped company info
    primary_company = serializers.SerializerMethodField()
    companies = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()
    role_label = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "display_name",
            "email",
            "phone",
            "employee_id",
            "department",
            "designation",
            "joining_date",
            "employment_status",
            "is_active",
            "primary_company",
            "companies",
            "role",
            "role_label",
            # Profile fields
            "gender",
            "dob",
            "employment_type",
            "reporting_manager",
            "reporting_manager_name",
            "shift",
            "emergency_contact_name",
            "emergency_contact_relation",
            "emergency_contact_phone",
            "bank_name",
            "bank_account_number",
            "bank_ifsc",
            "monthly_salary",
            "pan",
            "uan",
            "aadhaar",
            "photo_url",
            "documents",
        ]

    def get_display_name(self, obj):
        name = f"{obj.first_name} {obj.last_name}".strip()
        return name or obj.username

    def get_reporting_manager_name(self, obj):
        profile = getattr(obj, "employee_profile", None)
        if profile and profile.reporting_manager:
            mgr = profile.reporting_manager
            name = f"{mgr.first_name} {mgr.last_name}".strip()
            return name or mgr.username
        return None

    def get_primary_company(self, obj):
        first_m = obj.company_memberships.filter(is_active=True).first()
        return first_m.company_id if first_m else None

    def get_companies(self, obj):
        return list(obj.company_memberships.filter(is_active=True).values_list("company_id", flat=True))

    def get_role(self, obj):
        if obj.is_superuser:
            return "SUPER_ADMIN"
        first_m = obj.company_memberships.filter(is_active=True).first()
        if first_m:
            r = first_m.role_assignments.filter(is_active=True).first()
            if r and r.role:
                return r.role.code
        return "EMPLOYEE"

    def get_role_label(self, obj):
        code = self.get_role(obj)
        role_map = {
            "SUPER_ADMIN": "Super Admin",
            "MANAGEMENT": "Management",
            "HR_ADMINISTRATOR": "HR Administrator",
            "HR_MANAGER": "HR Manager",
            "DEPARTMENT_MANAGER": "Department Manager",
            "STORES_MANAGER": "Stores Manager",
            "STORES_USER": "Stores User",
            "EMPLOYEE": "Employee",
            "VIEWER": "Viewer",
        }
        return role_map.get(code, code)
