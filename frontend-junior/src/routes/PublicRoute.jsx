import {
  Navigate,
  Outlet,
  useLocation,
} from 'react-router-dom'

import useAuth from '../hooks/useAuth'

import {
  getCurrentWorkspace,
  requiresWorkspaceSelection,
} from '../utils/workspace'


export default function PublicRoute() {

  const {
    isAuthenticated,
    user,
  } = useAuth()


  const location =
    useLocation()


  /* =======================================================
     NOT LOGGED IN
     ======================================================= */

  if (
    !isAuthenticated
  ) {

    return <Outlet />

  }


  /* =======================================================
     MULTI-COMPANY USER
     ======================================================= */

  if (
    requiresWorkspaceSelection(
      user
    )
  ) {

    const workspace =
      getCurrentWorkspace(
        user
      )


    /*
     * Admin / multi-company user
     * hasn't selected workspace.
     */

    if (!workspace) {

      return (

        <Navigate
          to="/workspace-select"
          replace
        />

      )

    }


    /*
     * A workspace was already selected.
     * Go to the appropriate destination.
     */

    if (
      workspace ===
      'common_inventory'
    ) {

      return (

        <Navigate
          to="/inventory"
          replace
        />

      )

    }


    return (

      <Navigate
        to={
          location.state?.from
            ?.pathname ||
          '/dashboard'
        }
        replace
      />

    )

  }


  /* =======================================================
     ONE-COMPANY USER
     ======================================================= */

  const workspace =
    getCurrentWorkspace(
      user
    )


  if (
    workspace ===
    'common_inventory'
  ) {

    return (

      <Navigate
        to="/inventory"
        replace
      />

    )

  }


  return (

    <Navigate
      to={
        location.state?.from
          ?.pathname ||
        '/dashboard'
      }
      replace
    />

  )

}