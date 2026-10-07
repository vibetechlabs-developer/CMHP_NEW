import {
  getActiveCompanyId,
  getUserCompanyIds,
} from '../../utils/workspace'


/*
 * HRMS PERMISSIONS
 * -------------------------------------------------------------------------
 * Mirrors the same MATRIX + helper-function pattern used in
 * features/companies/permissions.js, so it behaves consistently with
 * the rest of the ERP.
 *
 * Roles:
 *
 * SUPER_ADMIN
 * MANAGEMENT
 * HR_ADMINISTRATOR
 * HR_MANAGER
 * DEPARTMENT_MANAGER
 * STORES_MANAGER
 * STORES_USER
 * EMPLOYEE
 * VIEWER
 *
 *
 * HRMS permissions:
 *
 * Super Admin
 * -> Company A + Company B
 * -> Full HRMS
 *
 * HR Administrator
 * -> Full HRMS
 * -> Scoped to assigned companies
 *
 * HR Manager
 * -> Manage employees / attendance / leave
 * -> Scoped to assigned companies
 *
 * Department Manager
 * -> View + approve leave for own team
 *
 * Everyone else
 * -> Employee Self Service
 */


/* =========================================================
   PERMISSION MATRIX
   ========================================================= */

const MATRIX = {

  SUPER_ADMIN: [
    'view_all',
    'manage_employees',
    'manage_attendance',
    'manage_leave',
    'approve_leave',
    'manage_masters',
    'manage_payroll',
    'view_reports',
  ],


  HR_ADMINISTRATOR: [
    'view_all',
    'manage_employees',
    'manage_attendance',
    'manage_leave',
    'approve_leave',
    'manage_masters',
    'manage_payroll',
    'view_reports',
  ],


  HR_MANAGER: [
    'view_all',
    'manage_employees',
    'manage_attendance',
    'manage_leave',
    'approve_leave',
    'view_reports',
  ],


  MANAGEMENT: [
    'view_all',
    'view_reports',
  ],


  DEPARTMENT_MANAGER: [
    'view_team',
    'approve_leave',
  ],

}


/* =========================================================
   GENERIC PERMISSION CHECK
   ========================================================= */

function hasPermission(
  user,
  permission
) {

  return (
    user?.is_superuser ||
    (
      MATRIX[user?.profile?.role] || []
    ).includes(permission)
  )
}


/* =========================================================
   EMPLOYEES
   ========================================================= */

export function canManageEmployees(user) {

  return hasPermission(
    user,
    'manage_employees'
  )

}


/* =========================================================
   ATTENDANCE
   ========================================================= */

export function canManageAttendance(user) {

  return hasPermission(
    user,
    'manage_attendance'
  )

}


/* =========================================================
   LEAVE
   ========================================================= */

export function canManageLeave(user) {

  return hasPermission(
    user,
    'manage_leave'
  )

}


/* =========================================================
   APPROVE LEAVE
   ========================================================= */

export function canApproveLeave(user) {

  return hasPermission(
    user,
    'approve_leave'
  )

}


/* =========================================================
   HRMS MASTERS
   ========================================================= */

export function canManageMasters(user) {

  return hasPermission(
    user,
    'manage_masters'
  )

}


/* =========================================================
   PAYROLL
   ========================================================= */

export function canManagePayroll(user) {

  return hasPermission(
    user,
    'manage_payroll'
  )

}


/* =========================================================
   HR REPORTS
   ========================================================= */

export function canViewHrReports(user) {

  return hasPermission(
    user,
    'view_reports'
  )

}


/* =========================================================
   VIEW ALL COMPANIES
   ========================================================= */

/*
 * true:
 *   User can view every company's HRMS data.
 *
 * false:
 *   Restrict to assigned companies.
 */

export function canViewAllCompanies(user) {

  return (
    user?.is_superuser ||
    hasPermission(
      user,
      'view_all'
    )
  )

}


/* =========================================================
   ALLOWED COMPANY IDS
   ========================================================= */

/*
 * Returns company IDs which the current HRMS view
 * should be restricted to.
 *
 * Empty array = no restriction.
 *
 * When Company A or Company B is selected in the
 * header switcher, that company becomes the active
 * HRMS scope.
 */

export function allowedCompanyIds(user) {

  const activeCompanyId =
    getActiveCompanyId(user)


  /*
   * Company switcher has selected
   * a specific company.
   */
  if (activeCompanyId) {

    return [
      activeCompanyId,
    ]

  }


  /*
   * User has permission to see all companies.
   */
  if (canViewAllCompanies(user)) {

    return []

  }


  /*
   * Otherwise use assigned companies.
   */
  return getUserCompanyIds(user)
}