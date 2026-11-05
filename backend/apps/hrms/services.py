from datetime import date, datetime, timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from apps.companies.models import Company, CompanyMembership
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


def get_dashboard_summary(company_id):
    """Dynamically calculate live HRMS statistics and KPIs from the database."""
    today = timezone.localdate()
    today_str = today.isoformat()
    current_month_prefix = today_str[:7]

    # Active company users
    company_users_qs = User.objects.filter(
        company_memberships__company_id=company_id,
        company_memberships__is_active=True,
        is_active=True,
    ).distinct()
    user_ids = list(company_users_qs.values_list("id", flat=True))
    total_employees = len(user_ids)

    # Attendance today
    today_attendance = AttendanceRecord.objects.filter(
        company_id=company_id,
        user_id__in=user_ids,
        date=today,
    )
    present_count = today_attendance.filter(
        status__in=["PRESENT", "LATE", "HALF_DAY", "WFH"]
    ).count()

    # Leaves today
    on_leave_count = LeaveRequest.objects.filter(
        company_id=company_id,
        user_id__in=user_ids,
        status="APPROVED",
        from_date__lte=today,
        to_date__gte=today,
    ).count()

    absent_count = today_attendance.filter(status="ABSENT").count()
    if absent_count == 0 and total_employees > (present_count + on_leave_count):
        # Employees who haven't punched in yet or are absent
        absent_count = max(0, total_employees - present_count - on_leave_count)

    # New joiners this month
    new_joiners = company_users_qs.filter(
        joining_date__startswith=current_month_prefix
    ).count()

    # Pending leave requests
    pending_leaves_qs = LeaveRequest.objects.filter(
        company_id=company_id,
        status="PENDING",
    ).select_related("user", "leave_type")
    pending_leaves_count = pending_leaves_qs.count()

    # Attendance Trend (Last 7 Days)
    attendance_trend = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        count = AttendanceRecord.objects.filter(
            company_id=company_id,
            user_id__in=user_ids,
            date=d,
            status__in=["PRESENT", "LATE", "HALF_DAY", "WFH"],
        ).count()
        label = d.strftime("%a, %d %b")
        attendance_trend.append({"label": label, "value": count, "date": d.isoformat()})

    # Department-wise headcount
    dept_counts = (
        Department.objects.filter(Q(company_id=company_id) | Q(company__isnull=True), is_active=True)
        .annotate(
            count=Count(
                "employees",
                filter=Q(employees__user__id__in=user_ids),
            )
        )
        .values("id", "name", "count")
    )
    # Also handle employees whose User.department is a string
    dept_headcount = []
    colors = ["#0284c7", "#0d9488", "#8b5cf6", "#f59e0b", "#ec4899", "#10b981"]
    for i, d in enumerate(dept_counts):
        dept_headcount.append({
            "id": d["id"],
            "label": d["name"],
            "name": d["name"],
            "value": d["count"],
            "count": d["count"],
            "color": colors[i % len(colors)],
        })

    # Leave distribution by type
    leave_types = LeaveType.objects.filter(Q(company_id=company_id) | Q(company__isnull=True), is_active=True)
    leave_distribution = []
    for lt in leave_types:
        count = LeaveRequest.objects.filter(
            company_id=company_id,
            user_id__in=user_ids,
            leave_type=lt,
            status="APPROVED",
            from_date__startswith=current_month_prefix,
        ).count()
        leave_distribution.append({
            "code": lt.code,
            "label": lt.name,
            "value": count,
            "color": "#0284c7" if lt.code == "CASUAL" else "#f59e0b" if lt.code == "SICK" else "#10b981",
        })

    # Upcoming holidays (next 5)
    upcoming_holidays = list(
        Holiday.objects.filter(
            Q(company_id=company_id) | Q(company__isnull=True),
            date__gte=today,
        )
        .order_by("date")[:5]
        .values("id", "name", "date", "description", "is_optional")
    )

    # Celebrations (Birthdays & Work Anniversaries in current month)
    celebrations = []
    current_month_num = today.month
    current_year = today.year
    for u in company_users_qs:
        profile = getattr(u, "employee_profile", None)
        emp_name = f"{u.first_name} {u.last_name}".strip() or u.username
        if profile and profile.dob and profile.dob.month == current_month_num:
            celebrations.append({
                "type": "BIRTHDAY",
                "name": emp_name,
                "date": profile.dob.strftime("%d %b"),
                "avatar": "🎂",
            })
        if u.joining_date and u.joining_date.month == current_month_num:
            years = current_year - u.joining_date.year
            if years > 0:
                celebrations.append({
                    "type": "ANNIVERSARY",
                    "name": emp_name,
                    "date": f"{years} yr{'s' if years > 1 else ''}",
                    "avatar": "🎉",
                })

    # Pending approvals summary
    pending_approvals = []
    for req in pending_leaves_qs.order_by("-created_at")[:5]:
        emp_name = f"{req.user.first_name} {req.user.last_name}".strip() or req.user.username
        pending_approvals.append({
            "id": req.id,
            "user_id": req.user_id,
            "employee_name": emp_name,
            "leave_type": req.leave_type.name if req.leave_type else "Leave",
            "from_date": req.from_date.isoformat(),
            "to_date": req.to_date.isoformat(),
            "days": float(req.days),
            "reason": req.reason,
        })

    return {
        "kpis": {
            "totalEmployees": total_employees,
            "presentToday": present_count,
            "onLeaveToday": on_leave_count,
            "absentToday": absent_count,
            "newJoiners": new_joiners,
            "pendingLeaveRequests": pending_leaves_count,
        },
        "attendanceTrend": attendance_trend,
        "departmentHeadcount": dept_headcount,
        "leaveDistribution": leave_distribution,
        "upcomingHolidays": upcoming_holidays,
        "celebrations": celebrations[:6],
        "pendingApprovals": pending_approvals,
    }


def do_check_in(*, user, company_id):
    """Mark check-in for the employee today."""
    today = timezone.localdate()
    now = timezone.now()

    record, created = AttendanceRecord.objects.get_or_create(
        user=user,
        date=today,
        defaults={
            "company_id": company_id,
            "check_in": now,
            "status": "PRESENT",
            "working_hours": Decimal("0.0"),
            "is_manual": False,
        },
    )

    if not created and not record.check_in:
        record.check_in = now
        if record.status in ["ABSENT", "HOLIDAY", "WEEKLY_OFF"]:
            record.status = "PRESENT"
        record.save(update_fields=["check_in", "status", "updated_at"])

    # Determine shift and late status
    profile = getattr(user, "employee_profile", None)
    shift = profile.shift if profile else None
    if shift and record.check_in:
        local_check_in_time = timezone.localtime(record.check_in).time()
        # Check grace period
        shift_start = shift.start_time
        grace_limit = (
            datetime.combine(today, shift_start) + timedelta(minutes=shift.grace_period_mins)
        ).time()
        if local_check_in_time > grace_limit:
            record.status = "LATE"
            record.shift = shift
            record.save(update_fields=["status", "shift", "updated_at"])

    return record


def do_check_out(*, user, company_id):
    """Mark check-out for the employee today and calculate working hours."""
    today = timezone.localdate()
    now = timezone.now()

    record = AttendanceRecord.objects.filter(user=user, date=today).first()
    if not record or not record.check_in:
        # Create check-in and check-out together if missed
        record = AttendanceRecord.objects.create(
            user=user,
            company_id=company_id,
            date=today,
            check_in=now - timedelta(hours=8),
            check_out=now,
            status="PRESENT",
            working_hours=Decimal("8.0"),
            is_manual=False,
        )
        return record

    record.check_out = now
    duration_hours = (record.check_out - record.check_in).total_seconds() / 3600.0
    record.working_hours = Decimal(f"{duration_hours:.2f}")

    profile = getattr(user, "employee_profile", None)
    shift = profile.shift if profile else None
    half_day_thresh = shift.half_day_hours if shift else Decimal("4.0")

    if record.working_hours < half_day_thresh and record.status not in ["LEAVE", "HOLIDAY"]:
        record.status = "HALF_DAY"

    record.save(update_fields=["check_out", "working_hours", "status", "updated_at"])
    return record


@transaction.atomic
def decide_leave_request(*, leave_request, decision, actioned_by, rejection_reason=""):
    """Approve or reject leave request and update attendance records."""
    if decision not in ["APPROVED", "REJECTED"]:
        raise ValidationError("Decision must be APPROVED or REJECTED.")

    leave_request.status = decision
    leave_request.actioned_by = actioned_by
    leave_request.actioned_at = timezone.now()
    if decision == "REJECTED":
        leave_request.rejection_reason = rejection_reason
    leave_request.save()

    # If approved, automatically mark attendance as LEAVE for the date range
    if decision == "APPROVED":
        curr = leave_request.from_date
        while curr <= leave_request.to_date:
            AttendanceRecord.objects.update_or_create(
                user=leave_request.user,
                date=curr,
                defaults={
                    "company": leave_request.company,
                    "status": "LEAVE",
                    "notes": f"Approved {leave_request.leave_type.name if leave_request.leave_type else 'Leave'}: {leave_request.reason}",
                    "is_manual": True,
                },
            )
            curr += timedelta(days=1)

    return leave_request


@transaction.atomic
def process_monthly_payroll(*, company_id, month, actor):
    """Compute and upsert payroll records for all company employees for the month."""
    # month is "YYYY-MM"
    year, month_num = map(int, month.split("-"))
    start_date = date(year, month_num, 1)
    if month_num == 12:
        end_date = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end_date = date(year, month_num + 1, 1) - timedelta(days=1)

    total_days = Decimal((end_date - start_date).days + 1)

    users = User.objects.filter(
        company_memberships__company_id=company_id,
        company_memberships__is_active=True,
        is_active=True,
    ).distinct()

    records = []
    for u in users:
        # Find latest active salary structure
        salary = SalaryStructure.objects.filter(
            company_id=company_id,
            user=u,
            is_active=True,
            effective_from__lte=end_date,
        ).order_by("-effective_from", "-id").first()

        basic = salary.basic if salary else Decimal("0.0")
        allowances = salary.allowances if salary else Decimal("0.0")
        deductions = salary.deductions if salary else Decimal("0.0")

        # Attendance calculation
        attendance_records = AttendanceRecord.objects.filter(
            user=u,
            date__gte=start_date,
            date__lte=end_date,
        )
        present_days = Decimal(
            attendance_records.filter(status__in=["PRESENT", "LATE", "WFH"]).count()
        )
        half_days = Decimal(attendance_records.filter(status="HALF_DAY").count())
        present_days += half_days * Decimal("0.5")

        paid_leaves = Decimal(attendance_records.filter(status="LEAVE").count())
        absent_days = Decimal(attendance_records.filter(status="ABSENT").count())

        # If no attendance records at all, assume full presence if active
        if attendance_records.count() == 0:
            present_days = total_days
            absent_days = Decimal("0.0")

        gross = basic + allowances
        net = max(Decimal("0.0"), gross - deductions)

        # Pro-rate if significant absence
        if total_days > 0 and (present_days + paid_leaves) < total_days:
            working_factor = (present_days + paid_leaves) / total_days
            gross = (gross * working_factor).quantize(Decimal("0.01"))
            net = max(Decimal("0.0"), gross - deductions).quantize(Decimal("0.01"))

        record, _ = PayrollRecord.objects.update_or_create(
            company_id=company_id,
            user=u,
            month=month,
            defaults={
                "basic": basic,
                "allowances": allowances,
                "deductions": deductions,
                "gross_salary": gross,
                "net_salary": net,
                "present_days": present_days,
                "absent_days": absent_days,
                "paid_leave_days": paid_leaves,
                "total_working_days": total_days,
                "status": "PROCESSED",
            },
        )
        records.append(record)

    return records
