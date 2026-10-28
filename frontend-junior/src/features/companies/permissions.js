/* =========================================================
   CMHP ERP - 5-LEVEL COMPANY-WISE PERMISSIONS MATRIX
   Specification: Section 04 Company-Wise Permission Structure
   Level 1: User Authentication & Account Status
   Level 2: Company Access (CMHP Pharma / Tej Biocare)
   Level 3: Department Access
   Level 4: Module Access
   Level 5: Action Authorization (View, Create, Edit, Approve, Delete, Export)
   ========================================================= */

const MODULE_PERMISSIONS = {
  SUPER_ADMIN: {
    companies: ['view', 'create', 'edit', 'approve', 'delete', 'export'],
    departments: ['view', 'create', 'edit', 'approve', 'delete', 'export'],
    users: ['view', 'create', 'edit', 'approve', 'delete', 'export'],
    inventory: ['view', 'create', 'edit', 'approve', 'delete', 'export'],
    operations: ['view', 'create', 'edit', 'approve', 'delete', 'export'],
    orders: ['view', 'create', 'edit', 'approve', 'delete', 'export'],
    quality: ['view', 'create', 'edit', 'approve', 'delete', 'export'],
    invoices: ['view', 'create', 'edit', 'approve', 'delete', 'export'],
    supply_chain: ['view', 'create', 'edit', 'approve', 'delete', 'export'],
    hrms: ['view', 'create', 'edit', 'approve', 'delete', 'export'],
    payroll: ['view', 'create', 'edit', 'approve', 'delete', 'export'],
    reports: ['view', 'create', 'edit', 'approve', 'delete', 'export'],
    accounts: ['view', 'create', 'edit', 'approve', 'delete', 'export'],
    audit: ['view', 'export'],
  },

  MANAGEMENT: {
    companies: ['view', 'edit', 'export'],
    departments: ['view', 'export'],
    users: ['view', 'export'],
    inventory: ['view', 'export'],
    operations: ['view', 'approve', 'export'],
    orders: ['view', 'approve', 'export'],
    quality: ['view', 'approve', 'export'],
    invoices: ['view', 'approve', 'export'],
    supply_chain: ['view', 'approve', 'export'],
    hrms: ['view', 'approve', 'export'],
    payroll: ['view', 'approve', 'export'],
    reports: ['view', 'export'],
    accounts: ['view', 'export'],
    audit: ['view', 'export'],
  },

  HR_ADMINISTRATOR: {
    companies: ['view'],
    departments: ['view', 'create', 'edit', 'export'],
    users: ['view', 'create', 'edit', 'export'],
    hrms: ['view', 'create', 'edit', 'approve', 'delete', 'export'],
    payroll: ['view', 'create', 'edit', 'approve', 'export'],
    reports: ['view', 'export'],
    audit: ['view', 'export'],
  },

  HR_MANAGER: {
    companies: ['view'],
    departments: ['view'],
    users: ['view'],
    hrms: ['view', 'create', 'edit', 'approve', 'export'],
    payroll: ['view', 'export'],
    reports: ['view', 'export'],
    audit: ['view'],
  },

  DEPARTMENT_MANAGER: {
    operations: ['view', 'create', 'edit', 'approve', 'export'],
    orders: ['view', 'create', 'edit', 'export'],
    inventory: ['view', 'export'],
    hrms: ['view'],
    reports: ['view'],
  },

  STORES_MANAGER: {
    inventory: ['view', 'create', 'edit', 'approve', 'export'],
    supply_chain: ['view', 'create', 'edit', 'approve', 'export'],
    reports: ['view', 'export'],
  },

  STORES_USER: {
    inventory: ['view', 'create', 'edit'],
    supply_chain: ['view', 'create'],
  },

  EMPLOYEE: {
    hrms: ['view', 'create'],
  },

  VIEWER: {
    companies: ['view'],
    inventory: ['view'],
    operations: ['view'],
    reports: ['view'],
  },
}

/* =========================================================
   LEVEL 1: USER AUTHENTICATION
   ========================================================= */

export function isUserActive(user) {
  return Boolean(user && user.is_active !== false)
}

/* =========================================================
   LEVEL 2: COMPANY ACCESS
   ========================================================= */

export function canAccessCompany(user, companyId) {
  if (!user) return false
  if (user.is_superuser || user.profile?.role === 'SUPER_ADMIN') return true

  const assigned = Array.isArray(user.profile?.companies)
    ? user.profile.companies.map(Number)
    : []

  if (assigned.includes(Number(companyId))) return true
  return Number(user.profile?.primary_company) === Number(companyId)
}

/* =========================================================
   LEVEL 4 & 5: MODULE & ACTION ACCESS
   ========================================================= */

export function checkPermission(user, moduleName, action = 'view') {
  if (!user || user.is_active === false) return false
  if (user.is_superuser || user.profile?.role === 'SUPER_ADMIN') return true

  const role = user.profile?.role || 'EMPLOYEE'
  const roleRules = MODULE_PERMISSIONS[role] || {}
  const moduleActions = roleRules[moduleName] || []

  return moduleActions.includes(action)
}

/* =========================================================
   MODULE LEVEL SHORTCUTS
   ========================================================= */

export function canManageCompanies(user) {
  return (
    Boolean(user?.is_superuser) ||
    ['SUPER_ADMIN', 'MANAGEMENT'].includes(user?.profile?.role)
  )
}

export function canManageAccess(user) {
  return (
    Boolean(user?.is_superuser) ||
    ['SUPER_ADMIN', 'MANAGEMENT', 'HR_ADMINISTRATOR', 'HR_MANAGER'].includes(
      user?.profile?.role
    )
  )
}

export function canManageDepartments(user) {
  return (
    Boolean(user?.is_superuser) ||
    ['SUPER_ADMIN', 'HR_ADMINISTRATOR', 'MANAGEMENT'].includes(
      user?.profile?.role
    )
  )
}

export function canManageDesignation(user) {
  return (
    Boolean(user?.is_superuser) ||
    ['SUPER_ADMIN', 'HR_ADMINISTRATOR'].includes(user?.profile?.role)
  )
}

export function canViewCompanies(user) {
  return (
    Boolean(user?.is_superuser) ||
    [
      'SUPER_ADMIN',
      'MANAGEMENT',
      'HR_ADMINISTRATOR',
      'HR_MANAGER',
      'DEPARTMENT_MANAGER',
      'VIEWER',
    ].includes(user?.profile?.role)
  )
}

export function canExportData(user, moduleName) {
  return checkPermission(user, moduleName, 'export')
}