export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  MANAGEMENT: 'MANAGEMENT',
  HR_ADMINISTRATOR: 'HR_ADMINISTRATOR',
  HR_MANAGER: 'HR_MANAGER',
  DEPARTMENT_MANAGER: 'DEPARTMENT_MANAGER',
  STORES_MANAGER: 'STORES_MANAGER',
  STORES_USER: 'STORES_USER',
  EMPLOYEE: 'EMPLOYEE',
  VIEWER: 'VIEWER',
}


export function normalizeRole(
  userOrRole
) {

  const rawRole =
    typeof userOrRole === 'string'
      ? userOrRole
      : (
          userOrRole?.profile?.role ||
          userOrRole?.role ||
          ''
        )


  return String(rawRole)
    .trim()
    .toUpperCase()

}


export function isSuperAdmin(
  user
) {

  return Boolean(
    user?.is_superuser ||
    normalizeRole(user) ===
      ROLES.SUPER_ADMIN
  )

}


export function isManagement(
  user
) {

  return (
    normalizeRole(user) ===
    ROLES.MANAGEMENT
  )

}


export function isHrAdministrator(
  user
) {

  return (
    normalizeRole(user) ===
    ROLES.HR_ADMINISTRATOR
  )

}


export function isHrManager(
  user
) {

  return (
    normalizeRole(user) ===
    ROLES.HR_MANAGER
  )

}


export function isStoresManager(
  user
) {

  return (
    normalizeRole(user) ===
    ROLES.STORES_MANAGER
  )

}


export function isStoresUser(
  user
) {

  return (
    normalizeRole(user) ===
    ROLES.STORES_USER
  )

}


export function isViewer(
  user
) {

  return (
    normalizeRole(user) ===
    ROLES.VIEWER
  )

}


export function canManageUsers(
  user
) {

  return Boolean(
    user?.is_superuser ||
    [
      ROLES.SUPER_ADMIN,
      ROLES.HR_ADMINISTRATOR,
      ROLES.HR_MANAGER,
    ].includes(
      normalizeRole(user)
    )
  )

}


export function canManageDepartments(
  user
) {

  return Boolean(
    user?.is_superuser ||
    [
      ROLES.SUPER_ADMIN,
      ROLES.HR_ADMINISTRATOR,
      ROLES.HR_MANAGER,
    ].includes(
      normalizeRole(user)
    )
  )

}


export function canManageHr(
  user
) {

  return Boolean(
    user?.is_superuser ||
    [
      ROLES.SUPER_ADMIN,
      ROLES.HR_ADMINISTRATOR,
      ROLES.HR_MANAGER,
    ].includes(
      normalizeRole(user)
    )
  )

}


export function canManageHrMasters(
  user
) {

  return Boolean(
    user?.is_superuser ||
    [
      ROLES.SUPER_ADMIN,
      ROLES.HR_ADMINISTRATOR,
    ].includes(
      normalizeRole(user)
    )
  )

}


export function canManagePayroll(
  user
) {

  return Boolean(
    user?.is_superuser ||
    normalizeRole(user) ===
      ROLES.SUPER_ADMIN
  )

}