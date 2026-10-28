// Real, unbounded company selection for company-owned screens (Products,
// Formulas, Batch Planning) - GET /v1/companies/mine/, never the fixed
// Company A/B workspace-bridge slots. Mirrors the store-selection pattern
// already used for the material register (Inventory.jsx): remembered per
// signed-in username in localStorage as a convenience only, and always
// re-validated against this account's own real company list before being
// trusted - a stale or foreign value is rejected exactly like a stale
// workspace selection, never silently kept.
import { useEffect, useRef, useState } from 'react'
import useAuth from './useAuth'
import { listMyCompanies } from '../features/store/storeService'
import { getErrorMessage } from '../utils/errors'

export default function useSelectedCompany() {
  const { user } = useAuth()
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

  useEffect(() => {
    const requestId = ++requestRef.current
    setCompanies({ state: 'loading', list: [], error: '' })
    listMyCompanies()
      .then((list) => {
        if (requestRef.current !== requestId) return
        setCompanies({ state: 'ready', list, error: '' })
        setCompanyIdState((current) => {
          const next = list.some((c) => c.id === current) ? current : list.length === 1 ? list[0].id : null
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

  return {
    companies: companies.list,
    companiesReady: companies.state === 'ready',
    companiesError: companies.error,
    companyId,
    setCompanyId,
  }
}
