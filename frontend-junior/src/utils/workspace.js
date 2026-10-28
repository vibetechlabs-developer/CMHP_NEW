// Ported from frontend/src/utils/workspace.js as part of replacing
// frontend-junior's mock auth - adds the real-company bridge
// (`user.profile.real_companies`, populated by the new authService.js)
// on top of the same fixed Company A/Company B/Common-Inventory
// workspace-slot model this file already had. `isManagementRole` is
// re-added below (frontend/'s own copy of this file no longer has it)
// since several still-mock screens in this app (companyScope.js and its
// own callers) import it directly - removing it here would have broken
// them for no reason connected to this step's actual scope.

const WORKSPACE_KEY = 'cmhp_selected_workspace'


export const WORKSPACES = {
  COMPANY_A: 'company_a',
  COMPANY_B: 'company_b',
  COMMON: 'common_inventory',
}


export const WORKSPACE_OPTIONS = {

  COMPANY_A: {
    id: WORKSPACES.COMPANY_A,
    name: 'Company A',
    shortName: 'Company A',
    label: 'Company A',
    description: 'Access Company A operations and records',
    icon: 'building',
    companyId: 1,
  },

  COMPANY_B: {
    id: WORKSPACES.COMPANY_B,
    name: 'Company B',
    shortName: 'Company B',
    label: 'Company B',
    description: 'Access Company B operations and records',
    icon: 'building',
    companyId: 2,
  },

  COMMON: {
    id: WORKSPACES.COMMON,
    name: 'Common Inventory',
    shortName: 'Common Inventory',
    label: 'Common Inventory',
    description:
      'Access shared inventory, stock, lots and locations',
    icon: 'inventory',
    companyId: null,
  },

}


/* =========================================================
   ROLE HELPERS
   ========================================================= */

export function isSuperAdmin(user) {
  return Boolean(
    user?.is_superuser ||
    user?.profile?.role === 'SUPER_ADMIN'
  )
}


// Kept from frontend-junior's own original workspace.js - still used by
// utils/companyScope.js (isManagerOrAdmin) and, through it, by several
// still-mock screens (HR, Supply Chain, Invoicing, Quality, Operations).
// Not part of the real auth/permission path itself - those always check
// the server, never this label (see authService.js's own docstring).
export function isManagementRole(user) {
  const role = user?.profile?.role || user?.role
  return Boolean(
    isSuperAdmin(user) ||
    role === 'MANAGEMENT'
  )
}


export function isHrRole(user) {

  const role =
    user?.profile?.role

  return [
    'HR_ADMINISTRATOR',
    'HR_MANAGER',
  ].includes(role)

}


/* =========================================================
   COMPANY ACCESS
   ========================================================= */

export function getUserCompanyIds(user) {

  const companies =
    user?.profile?.companies

  if (!Array.isArray(companies)) {
    return []
  }

  const assigned =
    companies
      .map(Number)
      .filter(Number.isFinite)


  /*
   * Super Admin can switch between
   * all assigned companies.
   */

  if (isSuperAdmin(user)) {

    return [
      ...new Set(assigned),
    ]

  }


  /*
   * Normal users are locked to their
   * primary company.
   */

  const primary =
    Number(
      user?.profile?.primary_company
    )

  if (
    Number.isFinite(primary) &&
    primary > 0
  ) {

    return [
      primary,
    ]

  }


  return assigned.length
    ? [assigned[0]]
    : []

}


export function hasCompanyAAccess(user) {
  return getUserCompanyIds(user).includes(1)
}


export function hasCompanyBAccess(user) {
  return getUserCompanyIds(user).includes(2)
}


export function hasBothCompanyAccess(user) {

  return (
    isSuperAdmin(user) &&
    hasCompanyAAccess(user) &&
    hasCompanyBAccess(user)
  )

}


export function hasCommonInventoryAccess(user) {

  return Boolean(
    isSuperAdmin(user) ||
    user?.profile?.can_access_common_inventory
  )

}


/* =========================================================
   AVAILABLE WORKSPACES
   ========================================================= */

// The real company behind each fixed A/B slot, read positionally from
// `user.profile.real_companies` (authService.js's `fetchRealCompanyBridge`
// - same ascending-real-id order the slot mapping itself was built from,
// so index 0 is always whichever real company is standing in for "Company
// A" and index 1 for "Company B"). Falls back to the generic slot label
// when there is no real company at that position (e.g. a mock test
// persona with no real backend membership at all).
function companyWorkspaceOption(slotOption, realCompany) {

  const realName =
    (realCompany?.display_name || '').trim() ||
    (realCompany?.legal_name || '').trim()

  if (!realName) {
    return slotOption
  }

  return {
    ...slotOption,
    name: realName,
    shortName: realName,
    label: realName,
    description: `Access ${realName} operations and records`,
  }

}


export function getAvailableWorkspaces(user) {

  const options = []

  const realCompanies =
    Array.isArray(user?.profile?.real_companies)
      ? user.profile.real_companies
      : []


  if (hasCompanyAAccess(user)) {
    options.push(
      companyWorkspaceOption(
        WORKSPACE_OPTIONS.COMPANY_A,
        realCompanies[0]
      )
    )
  }


  if (hasCompanyBAccess(user)) {
    options.push(
      companyWorkspaceOption(
        WORKSPACE_OPTIONS.COMPANY_B,
        realCompanies[1]
      )
    )
  }


  if (hasCommonInventoryAccess(user)) {
    options.push(
      WORKSPACE_OPTIONS.COMMON
    )
  }


  return options

}


/* =========================================================
   STORAGE
   ========================================================= */

export function getSelectedWorkspace() {

  try {
    return localStorage.getItem(
      WORKSPACE_KEY
    )
  } catch {
    return null
  }

}


export function setSelectedWorkspace(
  workspace
) {

  try {

    if (!workspace) {

      localStorage.removeItem(
        WORKSPACE_KEY
      )

      return

    }


    localStorage.setItem(
      WORKSPACE_KEY,
      workspace
    )

  } catch {
    // Ignore localStorage errors.
  }

}


export function clearSelectedWorkspace() {

  try {

    localStorage.removeItem(
      WORKSPACE_KEY
    )

  } catch {
    // Ignore localStorage errors.
  }

}


/* =========================================================
   CURRENT WORKSPACE
   ========================================================= */

export function hasValidSelectedWorkspace(user) {

  const selected =
    getSelectedWorkspace()

  const available =
    getAvailableWorkspaces(user)

  if (!selected) {
    return false
  }

  return available.some(
    (workspace) =>
      workspace.id === selected
  )

}


export function getCurrentWorkspace(user) {

  const selected =
    getSelectedWorkspace()

  const available =
    getAvailableWorkspaces(user)


  if (
    selected &&
    available.some(
      (workspace) =>
        workspace.id === selected
    )
  ) {

    return selected

  }


  /*
   * Automatically select when there is
   * only one workspace.
   */

  if (available.length === 1) {

    const workspace =
      available[0].id

    setSelectedWorkspace(
      workspace
    )

    return workspace

  }


  return null

}


export function getCurrentWorkspaceObject(user) {

  const current =
    getCurrentWorkspace(user)

  const available =
    getAvailableWorkspaces(user)

  return (
    available.find(
      (workspace) =>
        workspace.id === current
    ) || null
  )

}


/* =========================================================
   ACTIVE COMPANY
   ========================================================= */

// IMPORTANT: this is the company id every real, backend-connected screen
// actually sends on its API calls - it must be the REAL company id (e.g.
// 2, 3), never the fixed mock slot number (1, 2). Read it positionally
// from `user.profile.real_companies`, same order as the A/B slot mapping
// itself (see companyWorkspaceOption above). Falls back to the historic
// mock id (1/2) only when there is no real company bridge at all - the
// screens that still read the mock `erp` Redux slice tag their records
// with company id 1/2 and have no real backend company to map to.
export function getActiveCompanyId(user) {

  const current =
    getCurrentWorkspace(user)

  const realCompanies =
    Array.isArray(user?.profile?.real_companies)
      ? user.profile.real_companies
      : []


  if (
    current === WORKSPACES.COMPANY_A &&
    hasCompanyAAccess(user)
  ) {

    return realCompanies[0]?.id ?? 1

  }


  if (
    current === WORKSPACES.COMPANY_B &&
    hasCompanyBAccess(user)
  ) {

    return realCompanies[1]?.id ?? 2

  }


  return null

}


export function getActiveCompanyIds(user) {

  const companyId =
    getActiveCompanyId(user)

  return companyId
    ? [companyId]
    : []

}


/* =========================================================
   ROUTE RULES
   ========================================================= */

export function requiresWorkspaceSelection(user) {

  return (
    getAvailableWorkspaces(user).length > 1
  )

}


export function isCommonInventoryWorkspace(user) {

  return (
    getCurrentWorkspace(user) ===
    WORKSPACES.COMMON
  )

}


export function isCompanyWorkspace(user) {

  return (
    getCurrentWorkspace(user) ===
      WORKSPACES.COMPANY_A ||
    getCurrentWorkspace(user) ===
      WORKSPACES.COMPANY_B
  )

}


/* =========================================================
   BACKWARD COMPATIBILITY
   ========================================================= */

export function getActiveWorkspaceForUser(user) {
  return getCurrentWorkspace(user)
}


export function setStoredWorkspace(workspace) {
  setSelectedWorkspace(workspace)
}


export function clearStoredWorkspace() {
  clearSelectedWorkspace()
}
