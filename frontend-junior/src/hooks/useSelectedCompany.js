// Real, unbounded company selection for company-owned screens (Products,
// Formulas, Batch Planning) - GET /v1/companies/mine/, never the fixed
// Company A/B workspace-bridge slots. Mirrors the store-selection pattern
// already used for the material register (Inventory.jsx): remembered per
// signed-in username in localStorage as a convenience only, and always
// re-validated against this account's own real company list before being
// trusted - a stale or foreign value is rejected exactly like a stale
// workspace selection, never silently kept.
import { useContext, useEffect, useRef, useState } from 'react'
import useAuth from './useAuth'
import { WorkspaceContext } from '../context/WorkspaceContext'
import { listMyCompanies } from '../features/store/storeService'
import { getErrorMessage } from '../utils/errors'

export default function useSelectedCompany() {
  const { user } = useAuth()
  const workspaceContext = useContext(WorkspaceContext)
  const activeWorkspace = workspaceContext?.activeWorkspace
  const activeOption = workspaceContext?.activeOption

  const storageKey = user?.username ? `cmhp.selectedCompanyId.${user.username}` : null

  const [companies, setCompanies] = useState({ state: 'loading', list: [], error: '' })
  const [companyId, setCompanyIdState] = useState(() => {
    if (!storageKey) return null
    const saved = Number(window.localStorage.getItem(storageKey))
    return Number.isInteger(saved) && saved > 0 ? saved : null
  })
  const requestRef = useRef(0)

  const setCompanyId = (id) => {
    setCompanyIdState(id)
    if (!storageKey) return
    if (id) window.localStorage.setItem(storageKey, String(id))
    else window.localStorage.removeItem(storageKey)
  }

  const resolveCompanyId = (list, preferredId = null) => {
    if (!list || list.length === 0) return null

    // If an explicitly requested valid id exists in list, keep it
    if (preferredId && list.some((c) => c.id === preferredId)) {
      return preferredId
    }

    // 1. Try matching active workspace option name/code
    if (activeOption?.name) {
      const targetName = String(activeOption.name).toLowerCase().trim()
      const match = list.find((c) => {
        const names = [c.code, c.display_name, c.legal_name, c.name].filter(Boolean)
        return names.some((n) => String(n).toLowerCase().trim() === targetName)
      })
      if (match) return match.id
    }

    // 2. Try matching activeOption companyId / realCompanyId
    const targetCompId = activeOption?.realCompanyId ?? activeOption?.companyId
    if (targetCompId && list.some((c) => c.id === targetCompId)) {
      return targetCompId
    }

    // 3. Positional fallback based on workspace (company_a -> index 0, company_b -> index 1)
    if (activeWorkspace === 'company_a' && list[0]) {
      return list[0].id
    }
    if (activeWorkspace === 'company_b') {
      return list[1]?.id ?? list[0].id
    }

    // 4. Fallback to localStorage saved id if valid
    const saved = storageKey ? Number(window.localStorage.getItem(storageKey)) : null
    if (saved && list.some((c) => c.id === saved)) {
      return saved
    }

    // 5. Default to the first company in the user's list
    return list[0].id
  }

  useEffect(() => {
    const requestId = ++requestRef.current
    setCompanies({ state: 'loading', list: [], error: '' })
    listMyCompanies()
      .then((list) => {
        if (requestRef.current !== requestId) return
        setCompanies({ state: 'ready', list, error: '' })
        setCompanyIdState((current) => {
          const next = resolveCompanyId(list, current)
          if (next !== current && storageKey) {
            if (next) window.localStorage.setItem(storageKey, String(next))
            else window.localStorage.removeItem(storageKey)
          }
          return next
        })
      })
      .catch((err) => {
        if (requestRef.current !== requestId) return
        setCompanies({ state: 'error', list: [], error: getErrorMessage(err) })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.username])

  // Sync companyId when the active workspace context changes
  useEffect(() => {
    if (companies.state !== 'ready' || companies.list.length === 0) return
    const resolved = resolveCompanyId(companies.list, null)
    if (resolved && resolved !== companyId) {
      setCompanyIdState(resolved)
      if (storageKey) {
        window.localStorage.setItem(storageKey, String(resolved))
      }
    }
  }, [activeWorkspace, activeOption?.name, activeOption?.companyId, companies.state, companies.list])

  return {
    companies: companies.list,
    companiesReady: companies.state === 'ready',
    companiesError: companies.error,
    companyId,
    realCompanyId: companyId,
    setCompanyId,
  }
}
