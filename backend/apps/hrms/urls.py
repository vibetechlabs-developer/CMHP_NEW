from django.urls import path

from apps.hrms.views import (
    DashboardSummaryView,
    EmployeeListCreateView,
    EmployeeDetailView,
    EmployeeActivateView,
    EmployeeDeactivateView,
    DepartmentListCreateView,
    DepartmentDetailView,
    DesignationListCreateView,
    DesignationDetailView,
    ShiftListCreateView,
    ShiftDetailView,
    HolidayListCreateView,
    HolidayDetailView,
    LeaveTypeListCreateView,
    LeaveTypeDetailView,
    AttendanceListCreateView,
    AttendanceDetailView,
    AttendanceCheckInView,
    AttendanceCheckOutView,
    AttendanceRegularizationListCreateView,
    AttendanceRegularizationDecisionView,
    LeaveRequestListCreateView,
    LeaveRequestDecisionView,
    LeaveRequestCancelView,
    SalaryStructureListCreateView,
    SalaryStructureDetailView,
    PayrollRecordListView,
    PayrollProcessView,
    PayrollMarkPaidView,
    PayrollMarkUnpaidView,
)

urlpatterns = [
    # Dashboard
    path("<int:company_id>/hrms/dashboard/summary/", DashboardSummaryView.as_view(), name="hrms-dashboard-summary"),

    # Employees
    path("<int:company_id>/hrms/employees/", EmployeeListCreateView.as_view(), name="hrms-employee-list-create"),
    path("<int:company_id>/hrms/employees/<int:user_id>/", EmployeeDetailView.as_view(), name="hrms-employee-detail"),
    path("<int:company_id>/hrms/employees/<int:user_id>/activate/", EmployeeActivateView.as_view(), name="hrms-employee-activate"),
    path("<int:company_id>/hrms/employees/<int:user_id>/deactivate/", EmployeeDeactivateView.as_view(), name="hrms-employee-deactivate"),

    # Departments
    path("<int:company_id>/hrms/departments/", DepartmentListCreateView.as_view(), name="hrms-department-list-create"),
    path("<int:company_id>/hrms/departments/<int:pk>/", DepartmentDetailView.as_view(), name="hrms-department-detail"),

    # Designations
    path("<int:company_id>/hrms/designations/", DesignationListCreateView.as_view(), name="hrms-designation-list-create"),
    path("<int:company_id>/hrms/designations/<int:pk>/", DesignationDetailView.as_view(), name="hrms-designation-detail"),

    # Shifts
    path("<int:company_id>/hrms/shifts/", ShiftListCreateView.as_view(), name="hrms-shift-list-create"),
    path("<int:company_id>/hrms/shifts/<int:pk>/", ShiftDetailView.as_view(), name="hrms-shift-detail"),

    # Holidays
    path("<int:company_id>/hrms/holidays/", HolidayListCreateView.as_view(), name="hrms-holiday-list-create"),
    path("<int:company_id>/hrms/holidays/<int:pk>/", HolidayDetailView.as_view(), name="hrms-holiday-detail"),

    # Leave Types
    path("<int:company_id>/hrms/leave-types/", LeaveTypeListCreateView.as_view(), name="hrms-leavetype-list-create"),
    path("<int:company_id>/hrms/leave-types/<int:pk>/", LeaveTypeDetailView.as_view(), name="hrms-leavetype-detail"),

    # Attendance
    path("<int:company_id>/hrms/attendance/", AttendanceListCreateView.as_view(), name="hrms-attendance-list-create"),
    path("<int:company_id>/hrms/attendance/<int:pk>/", AttendanceDetailView.as_view(), name="hrms-attendance-detail"),
    path("<int:company_id>/hrms/attendance/check-in/", AttendanceCheckInView.as_view(), name="hrms-attendance-check-in"),
    path("<int:company_id>/hrms/attendance/check-out/", AttendanceCheckOutView.as_view(), name="hrms-attendance-check-out"),
    path("<int:company_id>/hrms/attendance/regularizations/", AttendanceRegularizationListCreateView.as_view(), name="hrms-regularization-list-create"),
    path("<int:company_id>/hrms/attendance/regularizations/<int:reg_id>/decision/", AttendanceRegularizationDecisionView.as_view(), name="hrms-regularization-decision"),

    # Leave Requests
    path("<int:company_id>/hrms/leave-requests/", LeaveRequestListCreateView.as_view(), name="hrms-leaverequest-list-create"),
    path("<int:company_id>/hrms/leave-requests/<int:request_id>/decision/", LeaveRequestDecisionView.as_view(), name="hrms-leaverequest-decision"),
    path("<int:company_id>/hrms/leave-requests/<int:request_id>/cancel/", LeaveRequestCancelView.as_view(), name="hrms-leaverequest-cancel"),

    # Salary Structures
    path("<int:company_id>/hrms/salary-structures/", SalaryStructureListCreateView.as_view(), name="hrms-salarystructure-list-create"),
    path("<int:company_id>/hrms/salary-structures/<int:pk>/", SalaryStructureDetailView.as_view(), name="hrms-salarystructure-detail"),

    # Payroll
    path("<int:company_id>/hrms/payroll/records/", PayrollRecordListView.as_view(), name="hrms-payroll-record-list"),
    path("<int:company_id>/hrms/payroll/process/", PayrollProcessView.as_view(), name="hrms-payroll-process"),
    path("<int:company_id>/hrms/payroll/mark-paid/", PayrollMarkPaidView.as_view(), name="hrms-payroll-mark-paid"),
    path("<int:company_id>/hrms/payroll/mark-unpaid/", PayrollMarkUnpaidView.as_view(), name="hrms-payroll-mark-unpaid"),
]
