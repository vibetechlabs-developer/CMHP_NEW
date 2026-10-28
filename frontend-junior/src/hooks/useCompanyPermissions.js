// Real permission state for an EXPLICIT, caller-chosen real company id -
// the company-scoped counterpart of usePermissions() (which is tied to
// the mock workspace's fixed Company A/B bridge slots). Used by the
// company-owned screens (Products/Formulas/Batch Planning) built on top
// of useSelectedCompany.js's own unbounded, real company list. Same
// stale-response guard as usePermissions(): a slow response for a
// company the user has since switched away from can never land after the
// fact and populate the screen with the wrong company's permissions.
import { useEffect, useRef, useState } from 'react'
import useAuth from './useAuth'
import { fetchCompanyPermissions } from '../utils/permissionsService'

export default function useCompanyPermissions(companyId) {
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, permissions: new Set(), error: null })
  const requestRef = useRef(0)

  useEffect(() => {
    const requestId = ++requestRef.current
    if (!companyId) {
      setState({ loading: false, permissions: new Set(), error: null })
      return
    }
    setState((prev) => ({ ...prev, loading: true, error: null }))
    fetchCompanyPermissions(companyId, user)
      .then((permissions) => {
        if (requestRef.current !== requestId) return
        setState({ loading: false, permissions, error: null })
      })
      .catch((error) => {
        if (requestRef.current !== requestId) return
        setState({ loading: false, permissions: new Set(), error })
      })
  }, [companyId, user])

  return {
    loading: state.loading,
    error: state.error,
    hasPermission: (code) => state.permissions.has(code),
  }
}
