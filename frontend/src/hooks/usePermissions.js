import { useEffect, useRef, useState } from 'react'
import useAuth from './useAuth'
import useWorkspace from './useWorkspace'
import { fetchMyPermissions } from '../utils/permissionsService'

// Real permission state for the CURRENT workspace/company only. Tracks
// its own request so a slow response for a company the user has since
// switched AWAY from can never land after the fact and populate the
// screen with the wrong company's permissions - the exact "stale
// response from the previous company" risk this was built to avoid.
export default function usePermissions() {
  const { user } = useAuth()
  const { activeWorkspace } = useWorkspace()

  const [state, setState] = useState({ loading: true, permissions: new Set(), realCompanyId: null, error: null })
  const requestIdRef = useRef(0)

  useEffect(() => {
    const thisRequestId = ++requestIdRef.current
    setState((prev) => ({ ...prev, loading: true, error: null }))

    if (!user) {
      setState({ loading: false, permissions: new Set(), realCompanyId: null, error: null })
      return
    }

    fetchMyPermissions(user)
      .then(({ realCompanyId, permissions }) => {
        // A newer request has started since this one went out (the user
        // switched company again) - discard this result, never apply it.
        if (requestIdRef.current !== thisRequestId) {
          return
        }
        setState({ loading: false, permissions, realCompanyId, error: null })
      })
      .catch((error) => {
        if (requestIdRef.current !== thisRequestId) {
          return
        }
        setState({ loading: false, permissions: new Set(), realCompanyId: null, error })
      })
  }, [user, activeWorkspace])

  return {
    loading: state.loading,
    error: state.error,
    realCompanyId: state.realCompanyId,
    hasPermission: (code) => state.permissions.has(code),
  }
}
