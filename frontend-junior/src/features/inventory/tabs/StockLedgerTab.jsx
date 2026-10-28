// /inventory/ledger - this used to be a self-contained mock ledger
// (its own Redux-backed inward/outward/opening-stock/physical-audit
// writes, fabricated pack-size-to-bag math, and a localStorage-only
// stockLedgerEntries array that was never a real stock record). That mock
// UI is removed entirely - it must never stay reachable as if it were
// the operational stock register, and this app does not keep two
// separate registers. What is left is a real material search that opens
// the one real register (/inventory/materials/:id, MaterialRegisterPage)
// for the chosen material, reusing this screen's own searchable-combobox
// look (StockLedger.css's stock-select-* classes) with real data instead
// of the mock catalog.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import Alert from '../../../components/Alert'
import { LoadingState } from '../../../components/Spinner'
import { getErrorMessage } from '../../../utils/errors'
import { listMaterials } from '../../store/storeService'
import './StockLedger.css'

export default function StockLedgerTab() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [state, setState] = useState({ loading: true, results: [], error: '' })
  const dropdownRef = useRef(null)
  const requestRef = useRef(0)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const requestId = ++requestRef.current
    setState((prev) => ({ ...prev, loading: true, error: '' }))
    listMaterials({ search: query, isActive: 'true', pageSize: 20 })
      .then((data) => {
        if (requestRef.current !== requestId) return
        setState({ loading: false, results: data.results, error: '' })
      })
      .catch((err) => {
        if (requestRef.current !== requestId) return
        setState({ loading: false, results: [], error: getErrorMessage(err) })
      })
  }, [query])

  const selectMaterial = (material) => {
    setOpen(false)
    setQuery('')
    navigate(`/inventory/materials/${material.id}`)
  }

  return (
    <div className="stock-ledger-wrap">
      <Alert type="success">
        This page opens the real material register (the same one "View Register" on the Materials list opens) -
        it no longer keeps its own separate mock ledger.
      </Alert>

      <div className="stock-toolbar">
        <div className="stock-toolbar-left">
          <div className="stock-searchable-select-wrap" ref={dropdownRef}>
            <button
              type="button"
              className={`stock-select-trigger ${open ? 'open' : ''}`}
              onClick={() => setOpen((prev) => !prev)}
            >
              <div className="stock-trigger-content">
                <span className="stock-trigger-placeholder">Search a material to open its register…</span>
              </div>
              <span className="stock-trigger-arrow">{open ? '▴' : '▾'}</span>
            </button>

            {open && (
              <div className="stock-select-dropdown">
                <div className="stock-select-search-box">
                  <span className="stock-search-icon">🔍</span>
                  <input
                    type="text"
                    className="stock-select-search-input"
                    placeholder="Search material code or name…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                  {query && (
                    <button type="button" className="stock-search-clear-btn" onClick={(e) => { e.stopPropagation(); setQuery('') }}>✕</button>
                  )}
                </div>

                <div className="stock-select-options-list">
                  {state.error && <div className="stock-select-no-results">{state.error}</div>}
                  {!state.error && state.loading && <div className="stock-select-no-results"><LoadingState label="Searching…" compact /></div>}
                  {!state.error && !state.loading && state.results.length === 0 && (
                    <div className="stock-select-no-results">
                      <span>No active material found{query ? ` for "${query}"` : ''}.</span>
                    </div>
                  )}
                  {!state.error && !state.loading && state.results.map((material) => (
                    <div key={material.id} className="stock-select-option" onClick={() => selectMaterial(material)}>
                      <span className="stock-option-code">{material.code}</span>
                      <div className="stock-option-info">
                        <span className="stock-option-name">{material.name}</span>
                        <span className="stock-option-meta">Base unit: {material.base_unit_code}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
