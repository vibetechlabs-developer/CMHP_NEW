const MATRIX = {

  SUPER_ADMIN: [
    'view',
    'manage_companies',
    'manage_access',
    'manage_departments',
    'manage_designation',
  ],

  MANAGEMENT: [
    'view',
  ],

  HR_ADMINISTRATOR: [
    'view',
    'manage_access',
    'manage_designation',
    'manage_departments',
  ],

  HR_MANAGER: [
    'view',
    'manage_access',
    'manage_designation',
  ],

}


export function canManageCompanies(user) {

  return (
    user?.is_superuser ||
    (
      MATRIX[
        user?.profile?.role
      ] || []
    ).includes(
      'manage_companies'
    )
  )

}


export function canManageAccess(user) {

  return (
    user?.is_superuser ||
    (
      MATRIX[
        user?.profile?.role
      ] || []
    ).includes(
      'manage_access'
    )
  )

}


export function canManageDepartments(user) {

  return (
    user?.is_superuser ||
    (
      MATRIX[
        user?.profile?.role
      ] || []
    ).includes(
      'manage_departments'
    )
  )

}


export function canManageDesignation(user) {

  return (
    user?.is_superuser ||
    (
      MATRIX[
        user?.profile?.role
      ] || []
    ).includes(
      'manage_designation'
    )
  )

}


export function canViewCompanies(user) {

  return (
    user?.is_superuser ||
    (
      MATRIX[
        user?.profile?.role
      ] || []
    ).includes(
      'view'
    )
  )

}