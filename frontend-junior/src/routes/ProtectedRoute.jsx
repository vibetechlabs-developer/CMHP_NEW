import {
  Navigate,
  Outlet,
  useLocation,
} from 'react-router-dom'

import useAuth from '../hooks/useAuth'

import {
  getCurrentWorkspace,
  requiresWorkspaceSelection,
  WORKSPACES,
} from '../utils/workspace'


const normalizeRole = (user) =>
  String(
    user?.profile?.role ||
    user?.role ||
    ''
  )
    .trim()
    .toUpperCase()


const isSuperAdmin = (user) =>
  Boolean(
    user?.is_superuser ||
    normalizeRole(user) ===
      'SUPER_ADMIN'
  )


/*
 * Route-level permission guard.
 * Sidebar visibility is only navigation control;
 * this component also protects direct URL access.
 */
export function RoleRoute({
  roles = [],
  adminOnly = false,
  nonAdminOnly = false,
  children,
}) {

  const {
    user,
  } = useAuth()

  const location =
    useLocation()

  const role =
    normalizeRole(user)

  const admin =
    isSuperAdmin(user)

  if (adminOnly && !admin) {
    return (
      <Navigate
        to="/dashboard"
        state={{
          from: location,
        }}
        replace
      />
    )
  }

  if (nonAdminOnly && admin) {
    return (
      <Navigate
        to="/dashboard"
        state={{
          from: location,
        }}
        replace
      />
    )
  }

  if (
    roles.length > 0 &&
    !admin &&
    !roles.includes(role)
  ) {
    return (
      <Navigate
        to="/dashboard"
        state={{
          from: location,
        }}
        replace
      />
    )
  }

  return children
}


export default function ProtectedRoute() {

  const {
    isAuthenticated,
    user,
  } = useAuth()

  const location =
    useLocation()

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        state={{
          from: location,
        }}
        replace
      />
    )
  }

  if (
    location.pathname ===
    '/workspace-select'
  ) {
    return <Outlet />
  }

  const workspace =
    getCurrentWorkspace(user)

  if (
    requiresWorkspaceSelection(user) &&
    !workspace
  ) {
    return (
      <Navigate
        to="/workspace-select"
        replace
      />
    )
  }

  if (
    location.pathname ===
    '/profile'
  ) {
    return <Outlet />
  }

  /*
   * Common Inventory workspace can only
   * access Inventory routes.
   */
  if (
    workspace ===
    WORKSPACES.COMMON
  ) {

    if (
      !location.pathname.startsWith(
        '/inventory'
      )
    ) {
      return (
        <Navigate
          to="/inventory"
          replace
        />
      )
    }
  }

  /*
   * Company workspaces cannot access
   * Common Inventory routes.
   */
  if (
    workspace === WORKSPACES.COMPANY_A ||
    workspace === WORKSPACES.COMPANY_B
  ) {

    if (
      location.pathname.startsWith(
        '/inventory'
      )
    ) {
      return (
        <Navigate
          to="/dashboard"
          replace
        />
      )
    }
  }

  return <Outlet />
}
