from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from apps.companies.models import Company


class Department(models.Model):
    """Department under a company, or shared if company is null."""
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="departments",
    )
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=50, blank=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Designation(models.Model):
    """Designation/Job Title, optionally scoped to a Department and Company."""
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="designations",
    )
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="designations",
    )
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=50, blank=True)
    level = models.CharField(max_length=50, blank=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Shift(models.Model):
    """Work shift with timings, grace period, and working days."""
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="shifts",
    )
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50, blank=True)
    start_time = models.TimeField()
    end_time = models.TimeField()
    grace_period_mins = models.IntegerField(default=15)
    half_day_hours = models.DecimalField(max_digits=4, decimal_places=2, default=4.0)
    full_day_hours = models.DecimalField(max_digits=4, decimal_places=2, default=8.0)
    working_days = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["start_time", "name"]

    def __str__(self):
        return f"{self.name} ({self.start_time.strftime('%H:%M')} - {self.end_time.strftime('%H:%M')})"


class Holiday(models.Model):
    """Company-specific or shared holiday."""
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="holidays",
    )
    name = models.CharField(max_length=150)
    date = models.DateField()
    description = models.TextField(blank=True)
    is_optional = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["date"]

    def __str__(self):
        return f"{self.name} ({self.date})"


class LeaveType(models.Model):
    """Leave policy category: CASUAL, SICK, EARNED, MATERNITY, etc."""
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="leave_types",
    )
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50)
    days_allowed = models.DecimalField(max_digits=5, decimal_places=1, default=12.0)
    is_paid = models.BooleanField(default=True)
    is_carry_forward = models.BooleanField(default=False)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.code})"


class EmployeeProfile(models.Model):
    """Comprehensive employee details linked to standard User."""
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="employee_profile",
    )
    gender = models.CharField(max_length=20, blank=True, default="MALE")
    dob = models.DateField(null=True, blank=True)
    employment_type = models.CharField(max_length=50, blank=True, default="FULL_TIME")
    reporting_manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reportees",
    )
    shift = models.ForeignKey(
        Shift,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employees",
    )
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employees",
    )
    designation = models.ForeignKey(
        Designation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employees",
    )
    emergency_contact_name = models.CharField(max_length=100, blank=True)
    emergency_contact_relation = models.CharField(max_length=50, blank=True)
    emergency_contact_phone = models.CharField(max_length=30, blank=True)
    bank_name = models.CharField(max_length=100, blank=True)
    bank_account_number = models.CharField(max_length=50, blank=True)
    bank_ifsc = models.CharField(max_length=20, blank=True)
    monthly_salary = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    pan = models.CharField(max_length=20, blank=True)
    uan = models.CharField(max_length=20, blank=True)
    aadhaar = models.CharField(max_length=20, blank=True)
    photo_url = models.TextField(blank=True)
    documents = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Profile of {self.user.username}"


class AttendanceRecord(models.Model):
    """Daily attendance punch and status for an employee."""
    STATUS_CHOICES = [
        ("PRESENT", "Present"),
        ("ABSENT", "Absent"),
        ("HALF_DAY", "Half Day"),
        ("LATE", "Late"),
        ("EARLY_EXIT", "Early Exit"),
        ("LEAVE", "On Leave"),
        ("HOLIDAY", "Holiday"),
        ("WEEKLY_OFF", "Weekly Off"),
        ("WFH", "Work From Home"),
    ]

    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name="attendance_records",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="attendance_records",
    )
    date = models.DateField()
    check_in = models.DateTimeField(null=True, blank=True)
    check_out = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PRESENT")
    working_hours = models.DecimalField(max_digits=5, decimal_places=2, default=0.0)
    shift = models.ForeignKey(
        Shift,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    notes = models.TextField(blank=True)
    is_manual = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "user__username"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "date"],
                name="unique_user_attendance_date",
            )
        ]

    def __str__(self):
        return f"{self.user.username} - {self.date}: {self.status}"


class AttendanceRegularization(models.Model):
    """Correction request for missed or inaccurate check-in/out."""
    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("APPROVED", "Approved"),
        ("REJECTED", "Rejected"),
    ]

    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name="attendance_regularizations",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="attendance_regularizations",
    )
    date = models.DateField()
    check_in = models.TimeField(null=True, blank=True)
    check_out = models.TimeField(null=True, blank=True)
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")
    actioned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="decided_regularizations",
    )
    actioned_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"Regularization {self.user.username} on {self.date} ({self.status})"


class LeaveRequest(models.Model):
    """Leave application submitted by an employee."""
    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("APPROVED", "Approved"),
        ("REJECTED", "Rejected"),
        ("CANCELLED", "Cancelled"),
    ]

    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name="leave_requests",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="leave_requests",
    )
    leave_type = models.ForeignKey(
        LeaveType,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="requests",
    )
    from_date = models.DateField()
    to_date = models.DateField()
    days = models.DecimalField(max_digits=5, decimal_places=1, default=1.0)
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")
    actioned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="decided_leaves",
    )
    actioned_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-from_date", "-created_at"]

    def __str__(self):
        return f"{self.user.username} Leave {self.from_date} to {self.to_date} ({self.status})"


class SalaryStructure(models.Model):
    """Salary breakdown and CTC structure for an employee."""
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name="salary_structures",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="salary_structures",
    )
    effective_from = models.DateField(default=timezone.now)
    basic = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    allowances = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    incentives = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    bonus = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    other = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    deductions = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    pf_deduction = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    esi_deduction = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    tax_deduction = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    net_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    note = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-effective_from", "-id"]

    def __str__(self):
        return f"Salary of {self.user.username} from {self.effective_from} (Basic: {self.basic})"

    def save(self, *args, **kwargs):
        gross = (
            (self.basic or 0)
            + (self.allowances or 0)
            + (self.incentives or 0)
            + (self.bonus or 0)
            + (self.other or 0)
        )
        total_deductions = (
            (self.deductions or 0)
            + (self.pf_deduction or 0)
            + (self.esi_deduction or 0)
            + (self.tax_deduction or 0)
        )
        self.net_salary = max(gross - total_deductions, 0)
        super().save(*args, **kwargs)


class PayrollRecord(models.Model):
    """Monthly calculated payroll and payment state."""
    STATUS_CHOICES = [
        ("DRAFT", "Draft"),
        ("PROCESSED", "Processed"),
        ("APPROVED", "Approved"),
        ("PAID", "Paid"),
    ]

    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name="payroll_records",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="payroll_records",
    )
    month = models.CharField(max_length=7)  # YYYY-MM
    basic = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    allowances = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    deductions = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    gross_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    net_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    present_days = models.DecimalField(max_digits=5, decimal_places=1, default=0.0)
    absent_days = models.DecimalField(max_digits=5, decimal_places=1, default=0.0)
    paid_leave_days = models.DecimalField(max_digits=5, decimal_places=1, default=0.0)
    unpaid_leave_days = models.DecimalField(max_digits=5, decimal_places=1, default=0.0)
    total_working_days = models.DecimalField(max_digits=5, decimal_places=1, default=30.0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="DRAFT")
    payment_date = models.DateField(null=True, blank=True)
    payment_mode = models.CharField(max_length=50, blank=True, default="BANK_TRANSFER")
    reference_number = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-month", "user__username"]
        constraints = [
            models.UniqueConstraint(
                fields=["company", "user", "month"],
                name="unique_company_user_payroll_month",
            )
        ]

    def __str__(self):
        return f"Payroll {self.user.username} {self.month} ({self.status}: Net {self.net_salary})"
