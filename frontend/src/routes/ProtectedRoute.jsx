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


export default function ProtectedRoute() {

  const {
    isAuthenticated,
    user,
  } = useAuth()


  const location =
    useLocation()


  /* =====================================================
     AUTHENTICATION
     ===================================================== */

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


  /* =====================================================
     WORKSPACE SELECTION PAGE
     ===================================================== */

  if (
    location.pathname ===
    '/workspace-select'
  ) {

    return <Outlet />

  }


  const workspace =
    getCurrentWorkspace(user)


  /* =====================================================
     WORKSPACE MUST BE SELECTED
     ===================================================== */

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


  /* =====================================================
     PROFILE IS AVAILABLE EVERYWHERE
     ===================================================== */

  if (
    location.pathname ===
    '/profile'
  ) {

    return <Outlet />

  }


  /* =====================================================
     COMMON INVENTORY
     
     Allow:
       /inventory
       /inventory/stock
       /inventory/materials
       /inventory/locations
       /inventory/issue-return
       /inventory/ledger

     Block all other modules.
     ===================================================== */

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


  /* =====================================================
     COMPANY WORKSPACE
     
     Common Inventory is NOT available
     inside Company A / Company B.
     ===================================================== */

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