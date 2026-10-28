// Real Stock & Lots Module - Material Stock Summary & Receipt Source Traceability
// Integrated with real backend stock-balances, stock-movements, material master, and issue outward workflow.
//
// Adheres strictly to business rules:
// - Common physical inventory for shared store.
// - Honest disclosure of unreconciled historical source allocations.
// - Real Inward and Outward integration with IssueOutwardModal.
// - No mock Redux / localStorage state mutations.
import { useEffect, useState, useMemo, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../../../components/Button'
import Alert from '../../../components/Alert'
import { LoadingState } from '../../../components/Spinner'
import Modal from '../components/Modal'
import { getErrorMessage } from '../../../utils/errors'
import {
  getMyStores,
  listStockBalances,
  listStockMovements,
  listMaterials,
  listMaterialSuppliers,
} from '../../store/storeService'
import { getAvailableToIssue } from '../../store/materialIssueService'
import IssueOutwardModal from '../../store/IssueOutwardModal'
import './StockTab.css'
import './CommonInventory.css'

export default function StockTab({ storeId: propStoreId, stores: propStores, onSelectStore }) {
  const navigate = useNavigate()

  // Store resolution
  const [storeId, setStoreId] = useState(propStoreId || null)
  const [stores, setStores] = useState(propStores || [])

  // Subtab navigation: 'SUMMARY' (Tab 1: Material Stock Summary) | 'SOURCES' (Tab 2: Receipt Sources)
  const [activeSubtab, setActiveSubtab] = useState('SUMMARY')

  // Shared Reference Data
  const [materialsCatalog, setMaterialsCatalog] = useState([])
  const [suppliersList, setSuppliersList] = useState([])

  // Tab 1: Material Stock Balances
  const [balances, setBalances] = useState({ loading: true, rows: [], error: '' })
  const [availableToIssueMap, setAvailableToIssueMap] = useState({})
  const [availLoading, setAvailLoading] = useState(false)

  // Tab 2: Receipt Sources (Stock Movements)
  const [movements, setMovements] = useState({
    loading: true,
    results: [],
    count: 0,
    coverage: null,
    error: '',
  })
  const [movementsPage, setMovementsPage] = useState(1)
  const pageSize = 20

  // Filters
  const [search, setSearch] = useState('')
  const [materialTypeFilter, setMaterialTypeFilter] = useState('ALL') // 'ALL' | 'RAW_MATERIAL' | 'PACKAGING_MATERIAL' | 'MOTHER_TINCTURE'
  const [selectedMaterialFilter, setSelectedMaterialFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [companyFilter, setCompanyFilter] = useState('ALL')

  // Modals & Drawers
  const [selectedSource, setSelectedSource] = useState(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [issueModalTarget, setIssueModalTarget] = useState(null) // { materialId, materialCode, materialName, companyId, initialRemarks }

  // Load stores if not provided
  useEffect(() => {
    if (!propStoreId) {
      getMyStores()
        .then((list) => {
          setStores(list || [])
          if (list && list.length > 0) {
            setStoreId(list[0].id)
            if (onSelectStore) onSelectStore(list[0].id)
          }
        })
        .catch(() => {})
    } else {
      setStoreId(propStoreId)
    }
  }, [propStoreId, onSelectStore])

  useEffect(() => {
    if (propStores && propStores.length > 0) {
      setStores(propStores)
    }
  }, [propStores])

  // Load materials catalog and suppliers reference data
  useEffect(() => {
    listMaterials({ pageSize: 500 })
      .then((res) => setMaterialsCatalog(res.results || []))
      .catch(() => setMaterialsCatalog([]))

    listMaterialSuppliers()
      .then((sups) => setSuppliersList(sups || []))
      .catch(() => setSuppliersList([]))
  }, [])

  // Create lookup dictionary for material metadata (kind, base_unit, etc.)
  const materialsMap = useMemo(() => {
    const map = new Map()
    materialsCatalog.forEach((m) => {
      map.set(m.id, m)
    })
    return map
  }, [materialsCatalog])

  // 1. Fetch Balances (Tab 1)
  const loadBalances = useCallback(() => {
    if (!storeId) return
    setBalances((prev) => ({ ...prev, loading: true, error: '' }))
    listStockBalances(storeId, {
      materialId: selectedMaterialFilter ? Number(selectedMaterialFilter) : undefined,
    })
      .then((rows) => {
        setBalances({ loading: false, rows: rows || [], error: '' })
      })
      .catch((err) => {
        setBalances({ loading: false, rows: [], error: getErrorMessage(err) })
      })
  }, [storeId, selectedMaterialFilter])

  // 2. Fetch Movements / Receipt Sources (Tab 2)
  const loadMovements = useCallback(() => {
    if (!storeId) return
    setMovements((prev) => ({ ...prev, loading: true, error: '' }))
    listStockMovements(storeId, {
      materialId: selectedMaterialFilter ? Number(selectedMaterialFilter) : undefined,
      page: movementsPage,
      pageSize,
    })
      .then((res) => {
        setMovements({
          loading: false,
          results: res.results || [],
          count: res.count || 0,
          coverage: res.coverage || null,
          error: '',
        })
      })
      .catch((err) => {
        setMovements({
          loading: false,
          results: [],
          count: 0,
          coverage: null,
          error: getErrorMessage(err),
        })
      })
  }, [storeId, selectedMaterialFilter, movementsPage])

  // Load data on store or page change
  useEffect(() => {
    loadBalances()
  }, [loadBalances])

  useEffect(() => {
    loadMovements()
  }, [loadMovements])

  // Fetch Available-to-Issue for materials present in balances
  useEffect(() => {
    if (!storeId || balances.rows.length === 0) return
    const uniqueMatIds = Array.from(new Set(balances.rows.map((r) => r.material_id)))
    setAvailLoading(true)

    Promise.all(
      uniqueMatIds.map((matId) =>
        getAvailableToIssue(storeId, matId)
          .then((res) => ({ matId, data: res }))
          .catch(() => ({ matId, data: [] }))
      )
    )
      .then((results) => {
        const nextMap = {}
        results.forEach(({ matId, data }) => {
          nextMap[matId] = data
        })
        setAvailableToIssueMap(nextMap)
      })
      .finally(() => setAvailLoading(false))
  }, [storeId, balances.rows])

  // Reset page when material filter changes
  const handleMaterialFilterChange = (val) => {
    setSelectedMaterialFilter(val)
    setMovementsPage(1)
  }

  // Clear all filters
  const handleClearFilters = () => {
    setSearch('')
    setMaterialTypeFilter('ALL')
    setSelectedMaterialFilter('')
    setSupplierFilter('')
    setCompanyFilter('ALL')
    setMovementsPage(1)
  }

  // Refresh all data
  const handleRefresh = () => {
    loadBalances()
    loadMovements()
  }

  // Available owning companies derived from balances and movements
  const availableCompanies = useMemo(() => {
    const set = new Set()
    balances.rows.forEach((r) => {
      if (r.source_company_code) set.add(r.source_company_code)
    })
    movements.results.forEach((r) => {
      if (r.source_company_code) set.add(r.source_company_code)
    })
    return Array.from(set).sort()
  }, [balances.rows, movements.results])

  // TAB 1 FILTERED ROWS (Material Stock Summary)
  const filteredBalances = useMemo(() => {
    return balances.rows.filter((row) => {
      const matMeta = materialsMap.get(row.material_id)

      // Material Type Filter
      if (materialTypeFilter !== 'ALL') {
        const kind = matMeta?.kind || ''
        if (kind !== materialTypeFilter) return false
      }

      // Owning Company Filter
      if (companyFilter !== 'ALL' && row.source_company_code !== companyFilter) {
        return false
      }

      // Search Filter
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const matchCode = (row.material_code || '').toLowerCase().includes(q)
        const matchName = (row.material_name || '').toLowerCase().includes(q)
        const matchCompany = (row.source_company_code || '').toLowerCase().includes(q)
        if (!matchCode && !matchName && !matchCompany) return false
      }

      return true
    })
  }, [balances.rows, materialsMap, materialTypeFilter, companyFilter, search])

  // TAB 2 FILTERED ROWS (Lots / Receipt Sources)
  const filteredMovements = useMemo(() => {
    return movements.results.filter((row) => {
      const matMeta = materialsMap.get(row.material_id)

      // Material Type Filter
      if (materialTypeFilter !== 'ALL') {
        const kind = matMeta?.kind || ''
        if (kind !== materialTypeFilter) return false
      }

      // Owning Company Filter
      if (companyFilter !== 'ALL' && row.source_company_code !== companyFilter) {
        return false
      }

      // Supplier Filter
      if (supplierFilter) {
        const matchSup = String(row.supplier_id || '') === String(supplierFilter) ||
          (row.supplier_code || '') === supplierFilter ||
          (row.supplier_name || '').toLowerCase().includes(supplierFilter.toLowerCase())
        if (!matchSup) return false
      }

      // Search Filter
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const matchCode = (row.material_code_snapshot || '').toLowerCase().includes(q)
        const matchName = (row.material_name_snapshot || '').toLowerCase().includes(q)
        const matchLot = (row.lot_reference || '').toLowerCase().includes(q)
        const matchGr = (row.source_goods_receipt_reference || '').toLowerCase().includes(q)
        const matchInvoice = (row.source_invoice_reference || '').toLowerCase().includes(q)
        const matchDelivery = (row.source_delivery_note_reference || '').toLowerCase().includes(q)
        const matchSup = (row.supplier_name || '').toLowerCase().includes(q) || (row.supplier_code || '').toLowerCase().includes(q)
        if (!matchCode && !matchName && !matchLot && !matchGr && !matchInvoice && !matchDelivery && !matchSup) {
          return false
        }
      }

      return true
    })
  }, [movements.results, materialsMap, materialTypeFilter, companyFilter, supplierFilter, search])

  // Safe CSV Value Escaping
  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '""'
    const str = String(val).replace(/"/g, '""')
    return `"${str}"`
  }

  // Export CSV handler
  const handleExportCsv = () => {
    if (activeSubtab === 'SUMMARY') {
      const headers = [
        'Material Code',
        'Material Name',
        'Type',
        'Base Unit',
        'Owning Company',
        'Closing Book Quantity',
        'Held Quantity',
        'Available to Issue',
      ]
      const rows = filteredBalances.map((r) => {
        const matMeta = materialsMap.get(r.material_id)
        const kindLabel = matMeta?.kind === 'RAW_MATERIAL' ? 'Raw Material' : matMeta?.kind === 'PACKAGING_MATERIAL' ? 'Packaging Material' : matMeta?.kind === 'MOTHER_TINCTURE' ? 'Mother Tincture' : 'Material'
        const availRows = availableToIssueMap[r.material_id] || []
        const matchAvail = availRows.find((a) => a.unit_id === r.unit_id && a.source_company_id === r.source_company_id)
        const availQty = matchAvail ? matchAvail.net_quantity : r.recorded_receipt_quantity
        return [
          escapeCsv(r.material_code),
          escapeCsv(r.material_name),
          escapeCsv(kindLabel),
          escapeCsv(r.unit_code),
          escapeCsv(r.source_company_code),
          escapeCsv(r.recorded_receipt_quantity),
          escapeCsv('Not tracked'),
          escapeCsv(availQty),
        ].join(',')
      })
      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n')
      const encodedUri = encodeURI(csvContent)
      const link = document.createElement('a')
      link.setAttribute('href', encodedUri)
      link.setAttribute('download', `material_stock_summary_${new Date().toISOString().slice(0, 10)}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } else {
      const headers = [
        'Material Code',
        'Material Name',
        'Internal Source Ref',
        'Supplier Lot Ref',
        'Goods Receipt Ref',
        'Arrived Date',
        'Supplier',
        'Owning Company',
        'Received Quantity',
        'Unit',
        'Container Type',
        'Container Qty',
        'Remaining Quantity Status',
        'Quality Status',
      ]
      const rows = filteredMovements.map((r) => [
        escapeCsv(r.material_code_snapshot),
        escapeCsv(r.material_name_snapshot),
        escapeCsv(`SM-#${r.id}`),
        escapeCsv(r.lot_reference || 'Not recorded'),
        escapeCsv(r.source_goods_receipt_reference || `GR-#${r.source_goods_receipt_id}`),
        escapeCsv((r.source_goods_receipt_arrived_at || r.posted_at || '').slice(0, 10)),
        escapeCsv(r.supplier_name || r.supplier_code || 'Recorded on PO'),
        escapeCsv(r.source_company_code),
        escapeCsv(r.quantity),
        escapeCsv(r.unit_code_snapshot),
        escapeCsv(r.container_type_code || 'Standard'),
        escapeCsv(r.container_quantity || 1),
        escapeCsv('Unallocated per receipt (tracked at material level)'),
        escapeCsv('Not tracked'),
      ].join(','))
      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n')
      const encodedUri = encodeURI(csvContent)
      const link = document.createElement('a')
      link.setAttribute('href', encodedUri)
      link.setAttribute('download', `receipt_sources_traceability_${new Date().toISOString().slice(0, 10)}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  // Open Details Drawer for a receipt source
  const handleOpenDetails = (movementRow) => {
    setSelectedSource(movementRow)
    setIsDrawerOpen(true)
  }

  // Open Outward Issue Modal from a row
  const handleOpenIssue = (materialId, materialCode, materialName, companyId, sourceRemarks = '') => {
    setIssueModalTarget({
      materialId,
      materialCode,
      materialName,
      companyId,
      initialRemarks: sourceRemarks,
    })
  }

  // Switch to Tab 2 and filter by material
  const handleViewSourcesForMaterial = (matId) => {
    setSelectedMaterialFilter(String(matId))
    setActiveSubtab('SOURCES')
    setMovementsPage(1)
  }

  return (
    <div className="ci-container stocks-container">
      {/* 1. Header & Store Context */}
      <div className="ci-header stocks-header">
        <div className="ci-header-titles stocks-header-titles">
          <h2>Stock &amp; Lots</h2>
          <p>View material stock, receipt sources, and lot traceability.</p>
        </div>

        <div className="ci-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {stores.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Store:</span>
              <select
                className="ci-select"
                value={storeId || ''}
                onChange={(e) => {
                  const newStoreId = Number(e.target.value)
                  setStoreId(newStoreId)
                  if (onSelectStore) onSelectStore(newStoreId)
                }}
                style={{ fontSize: 13, padding: '5px 10px', minWidth: 140 }}
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || s.code || `Store #${s.id}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Link to="/inventory/materials" className="ci-quick-link" style={{ padding: '7px 12px', fontSize: 12 }}>
            Open Material Master &rarr;
          </Link>

          <Button
            size="sm"
            variant="secondary"
            onClick={handleExportCsv}
            disabled={balances.loading && movements.loading}
          >
            📥 Export CSV
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={handleRefresh}
            disabled={balances.loading || movements.loading}
          >
            {balances.loading || movements.loading ? 'Refreshing...' : '🔄 Refresh'}
          </Button>
        </div>
      </div>

      {/* 2. Top Summary KPI Cards */}
      <div className="ci-summary-grid stocks-summary-grid">
        <div className="ci-card stocks-card">
          <div className="ci-card-icon stocks-card-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
            🧪
          </div>
          <div className="ci-card-info stocks-card-info">
            <span className="ci-card-label stocks-card-label">Active Stock Groups</span>
            <span className="ci-card-value stocks-card-value">{balances.rows.length}</span>
            <span className="ci-card-subtext stocks-card-subtext">Material &times; Unit &times; Company</span>
          </div>
        </div>

        <div className="ci-card stocks-card">
          <div className="ci-card-icon stocks-card-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
            📦
          </div>
          <div className="ci-card-info stocks-card-info">
            <span className="ci-card-label stocks-card-label">Recorded Receipt Lots</span>
            <span className="ci-card-value stocks-card-value">{movements.count}</span>
            <span className="ci-card-subtext stocks-card-subtext">Physical arrival lines in store</span>
          </div>
        </div>

        <div className="ci-card stocks-card">
          <div className="ci-card-icon stocks-card-icon" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
            🏛️
          </div>
          <div className="ci-card-info stocks-card-info">
            <span className="ci-card-label stocks-card-label">Billing Entities</span>
            <span className="ci-card-value stocks-card-value">{availableCompanies.length || 1}</span>
            <span className="ci-card-subtext stocks-card-subtext">Segregated ownership context</span>
          </div>
        </div>

        <div className="ci-card stocks-card">
          <div className="ci-card-icon stocks-card-icon" style={{ background: '#fefce8', color: '#ca8a04' }}>
            🛡️
          </div>
          <div className="ci-card-info stocks-card-info">
            <span className="ci-card-label stocks-card-label">Quality Status</span>
            <span className="ci-card-value stocks-card-value" style={{ fontSize: 15, color: '#ca8a04', marginTop: 4 }}>
              Not Tracked
            </span>
            <span className="ci-card-subtext stocks-card-subtext">QC holds not posted to store ledger</span>
          </div>
        </div>
      </div>

      {/* 3. Subtabs Navigation: Tab 1 vs Tab 2 */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          background: '#f1f5f9',
          padding: 4,
          borderRadius: 10,
          border: '1px solid #e2e8f0',
          alignSelf: 'flex-start',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveSubtab('SUMMARY')}
          style={{
            padding: '8px 18px',
            borderRadius: 7,
            border: 'none',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            background: activeSubtab === 'SUMMARY' ? '#ffffff' : 'transparent',
            color: activeSubtab === 'SUMMARY' ? '#0f172a' : '#64748b',
            boxShadow: activeSubtab === 'SUMMARY' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          }}
        >
          📊 Tab 1: Material Stock Summary ({filteredBalances.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveSubtab('SOURCES')}
          style={{
            padding: '8px 18px',
            borderRadius: 7,
            border: 'none',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            background: activeSubtab === 'SOURCES' ? '#ffffff' : 'transparent',
            color: activeSubtab === 'SOURCES' ? '#0f172a' : '#64748b',
            boxShadow: activeSubtab === 'SOURCES' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
          }}
        >
          🏷️ Tab 2: Lots &amp; Receipt Sources ({filteredMovements.length})
        </button>
      </div>

      {/* 4. Filters Toolbar */}
      <div
        className="ci-filters stocks-filter-card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: '14px 16px',
          background: '#f8fafc',
          borderRadius: 10,
          border: '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Search */}
          <input
            type="text"
            className="ci-input stocks-search-input"
            placeholder={
              activeSubtab === 'SUMMARY'
                ? 'Search material code, chemical name, or billing company...'
                : 'Search material, internal lot, supplier lot, receipt ref, supplier...'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: 260, flex: 1.5, padding: '6px 10px', fontSize: 13 }}
          />

          {/* Material Type: All / Raw Material / Packaging Material */}
          <select
            className="ci-select stocks-select-input"
            value={materialTypeFilter}
            onChange={(e) => setMaterialTypeFilter(e.target.value)}
            style={{ minWidth: 160, padding: '6px 10px', fontSize: 13 }}
          >
            <option value="ALL">All Material Types</option>
            <option value="RAW_MATERIAL">Raw Materials</option>
            <option value="PACKAGING_MATERIAL">Packaging Materials</option>
            <option value="MOTHER_TINCTURE">Mother Tincture</option>
          </select>

          {/* Specific Material */}
          <select
            className="ci-select stocks-select-input"
            value={selectedMaterialFilter}
            onChange={(e) => handleMaterialFilterChange(e.target.value)}
            style={{ minWidth: 180, padding: '6px 10px', fontSize: 13 }}
          >
            <option value="">All Materials</option>
            {materialsCatalog.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} - {m.name}
              </option>
            ))}
          </select>

          {/* Supplier Filter (Tab 2) */}
          {activeSubtab === 'SOURCES' && (
            <select
              className="ci-select stocks-select-input"
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              style={{ minWidth: 160, padding: '6px 10px', fontSize: 13 }}
            >
              <option value="">All Suppliers</option>
              {suppliersList.map((sup) => (
                <option key={sup.id || sup.code} value={sup.code || sup.id}>
                  {sup.name || sup.display_name || sup.code}
                </option>
              ))}
            </select>
          )}

          {/* Owning Company */}
          {availableCompanies.length > 1 && (
            <select
              className="ci-select stocks-select-input"
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              style={{ minWidth: 140, padding: '6px 10px', fontSize: 13 }}
            >
              <option value="ALL">All Companies</option>
              {availableCompanies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}

          {/* Clear Filters */}
          {(search || materialTypeFilter !== 'ALL' || selectedMaterialFilter || supplierFilter || companyFilter !== 'ALL') && (
            <Button size="sm" variant="secondary" onClick={handleClearFilters}>
              Clear Filters
            </Button>
          )}
        </div>

        {/* Boundary Notice Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12,
            color: '#64748b',
            background: '#ffffff',
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid #e2e8f0',
          }}
        >
          <div>
            <strong>Warehouse Ledger Boundary:</strong> Closing Book Quantity reflects recorded physical receipts and posted issues. Storage locations are not configured; QC release holds are tracked via incoming inspection rather than store ledger exclusion.
          </div>
          {availLoading && <span style={{ fontSize: 11, color: '#0369a1' }}>Checking issue availability...</span>}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: MATERIAL STOCK SUMMARY                                              */}
      {/* ========================================================================= */}
      {activeSubtab === 'SUMMARY' && (
        <div>
          {balances.loading ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <LoadingState label="Loading material stock balances..." />
            </div>
          ) : balances.error ? (
            <Alert type="error">{balances.error}</Alert>
          ) : filteredBalances.length === 0 ? (
            <div
              className="ci-empty"
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                background: '#ffffff',
                borderRadius: 12,
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>🧪</div>
              <h3>No Material Stock Found</h3>
              <p style={{ color: '#64748b', fontSize: 13, maxWidth: 440, margin: '0 auto 16px' }}>
                Post a goods receipt from Orders or Materials to record incoming stock for this shared store.
              </p>
            </div>
          ) : (
            <div className="ci-table-wrap">
              <table className="ci-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 150 }}>Material Code</th>
                    <th style={{ minWidth: 200 }}>Material Name</th>
                    <th style={{ minWidth: 120 }}>Type</th>
                    <th style={{ minWidth: 80 }}>Base Unit</th>
                    <th style={{ minWidth: 110 }}>Billing Entity</th>
                    <th style={{ minWidth: 140, textAlign: 'right' }}>Closing Book Qty</th>
                    <th style={{ minWidth: 110 }}>Held Qty</th>
                    <th style={{ minWidth: 140, textAlign: 'right' }}>Available to Issue</th>
                    <th className="ci-actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBalances.map((row, idx) => {
                    const matMeta = materialsMap.get(row.material_id)
                    const kindLabel =
                      matMeta?.kind === 'RAW_MATERIAL'
                        ? 'Raw Material'
                        : matMeta?.kind === 'PACKAGING_MATERIAL'
                        ? 'Packaging'
                        : matMeta?.kind === 'MOTHER_TINCTURE'
                        ? 'Mother Tincture'
                        : 'Material'

                    const availRows = availableToIssueMap[row.material_id] || []
                    const matchAvail = availRows.find(
                      (a) => a.unit_id === row.unit_id && a.source_company_id === row.source_company_id
                    )
                    const netQty = matchAvail ? Number(matchAvail.net_quantity) : Number(row.recorded_receipt_quantity)
                    const isDepleted = netQty <= 0

                    return (
                      <tr key={`${row.material_id}-${row.unit_id}-${row.source_company_id}-${idx}`}>
                        <td>
                          <strong>{row.material_code}</strong>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{row.material_name}</div>
                          {matMeta?.description && (
                            <div style={{ fontSize: 11, color: '#64748b', maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {matMeta.description}
                            </div>
                          )}
                        </td>
                        <td>
                          <span
                            className="stock-badge"
                            style={{
                              background: matMeta?.kind === 'RAW_MATERIAL' ? '#e0f2fe' : '#fef3c7',
                              color: matMeta?.kind === 'RAW_MATERIAL' ? '#0369a1' : '#b45309',
                              border: 'none',
                            }}
                          >
                            {kindLabel}
                          </span>
                        </td>
                        <td>{row.unit_code}</td>
                        <td>
                          <span className="stock-badge" style={{ background: '#f1f5f9', color: '#334155', border: 'none' }}>
                            {row.source_company_code}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <strong style={{ fontSize: 13 }}>{row.recorded_receipt_quantity}</strong>{' '}
                          <span style={{ fontSize: 11, color: '#64748b' }}>{row.unit_code}</span>
                        </td>
                        <td>
                          <span
                            className="stock-badge"
                            title="Incoming QC hold is not recorded in store physical ledger"
                            style={{ background: '#f8fafc', color: '#94a3b8', border: '1px solid #e2e8f0', cursor: 'help' }}
                          >
                            Not tracked
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span
                            style={{
                              fontWeight: 700,
                              color: isDepleted ? '#dc2626' : '#16a34a',
                              fontSize: 13,
                            }}
                          >
                            {matchAvail ? matchAvail.net_quantity : row.recorded_receipt_quantity}
                          </span>{' '}
                          <span style={{ fontSize: 11, color: '#64748b' }}>{row.unit_code}</span>
                          {isDepleted && (
                            <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }}>Depleted</div>
                          )}
                        </td>
                        <td className="ci-actions-col">
                          <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleViewSourcesForMaterial(row.material_id)}
                              title="View individual receipt sources for this material"
                            >
                              🔍 View Sources
                            </Button>

                            <Link
                              to={`/inventory/materials/${row.material_id}`}
                              className="ci-quick-link"
                              style={{ padding: '4px 8px', fontSize: 12 }}
                            >
                              📋 Register
                            </Link>

                            <Button
                              size="sm"
                              variant="primary"
                              disabled={isDepleted}
                              onClick={() =>
                                handleOpenIssue(
                                  row.material_id,
                                  row.material_code,
                                  row.material_name,
                                  row.source_company_id,
                                  `Outward issue for ${row.material_code}`
                                )
                              }
                              title="Issue material from store to production"
                            >
                              📤 Issue
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: LOTS & RECEIPT SOURCES                                              */}
      {/* ========================================================================= */}
      {activeSubtab === 'SOURCES' && (
        <div>
          {movements.loading ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <LoadingState label="Loading receipt sources and lot traceability..." />
            </div>
          ) : movements.error ? (
            <Alert type="error">{movements.error}</Alert>
          ) : filteredMovements.length === 0 ? (
            <div
              className="ci-empty"
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                background: '#ffffff',
                borderRadius: 12,
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
              <h3>No Receipt Sources Recorded</h3>
              <p style={{ color: '#64748b', fontSize: 13, maxWidth: 440, margin: '0 auto 16px' }}>
                Every posted goods receipt creates an append-only receipt source row here.
              </p>
            </div>
          ) : (
            <>
              <div className="ci-table-wrap">
                <table className="ci-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 140 }}>Chemical / Material</th>
                      <th style={{ minWidth: 110 }}>Source Ref</th>
                      <th style={{ minWidth: 120 }}>Supplier Lot Ref</th>
                      <th style={{ minWidth: 130 }}>Goods Receipt</th>
                      <th style={{ minWidth: 95 }}>Receipt Date</th>
                      <th style={{ minWidth: 140 }}>Supplier</th>
                      <th style={{ minWidth: 90 }}>Location</th>
                      <th style={{ minWidth: 110, textAlign: 'right' }}>Received Qty</th>
                      <th style={{ minWidth: 140, textAlign: 'right' }}>Remaining Store Qty</th>
                      <th style={{ minWidth: 80 }}>Quality Status</th>
                      <th className="ci-actions-col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMovements.map((row) => {
                      const dateStr = row.source_goods_receipt_arrived_at
                        ? row.source_goods_receipt_arrived_at.slice(0, 10)
                        : (row.posted_at || '').slice(0, 10)
                      const supplier = row.supplier_name || row.supplier_code || 'Recorded on PO'

                      // Check if there are material-level issues recorded
                      const availRows = availableToIssueMap[row.material_id] || []
                      const matchAvail = availRows.find(
                        (a) => a.unit_id === row.unit_id && a.source_company_id === row.source_company_id
                      )
                      const totalIssuedForMat = matchAvail ? Number(matchAvail.recorded_issued_quantity) : 0

                      return (
                        <tr key={row.id}>
                          <td>
                            <strong>{row.material_code_snapshot}</strong>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{row.material_name_snapshot}</div>
                          </td>
                          <td>
                            <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#475569' }}>
                              SM-#{row.id}
                            </span>
                            <div style={{ fontSize: 10, color: '#94a3b8' }}>
                              Line #{row.source_receipt_line_id}
                            </div>
                          </td>
                          <td>
                            {row.lot_reference ? (
                              <span className="stock-badge stock-badge-available">
                                {row.lot_reference}
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: 12 }}>Not recorded</span>
                            )}
                          </td>
                          <td>
                            <div>
                              <strong>{row.source_goods_receipt_reference || `GR-#${row.source_goods_receipt_id}`}</strong>
                            </div>
                            <span className="stock-badge" style={{ background: '#f1f5f9', color: '#475569', fontSize: 10, border: 'none' }}>
                              {row.source_company_code}
                            </span>
                          </td>
                          <td>{dateStr}</td>
                          <td>
                            <div style={{ fontSize: 12, fontWeight: 500 }}>{supplier}</div>
                          </td>
                          <td>
                            <span style={{ color: '#94a3b8', fontSize: 12 }}>Not recorded</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <strong style={{ fontSize: 13 }}>{row.quantity}</strong>{' '}
                            <span style={{ fontSize: 11, color: '#64748b' }}>{row.unit_code_snapshot}</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {totalIssuedForMat === 0 ? (
                              <div>
                                <strong style={{ color: '#16a34a', fontSize: 13 }}>{row.quantity}</strong>{' '}
                                <span style={{ fontSize: 11, color: '#64748b' }}>{row.unit_code_snapshot}</span>
                              </div>
                            ) : (
                              <div
                                title="Individual receipt line allocation is unreconciled. Material has issues deducted from its collective net balance."
                                style={{ cursor: 'help' }}
                              >
                                <span style={{ fontSize: 11, color: '#b45309', fontWeight: 600 }}>
                                  Unallocated
                                </span>
                                <div style={{ fontSize: 10, color: '#64748b' }}>
                                  Net: {matchAvail?.net_quantity} {row.unit_code_snapshot}
                                </div>
                              </div>
                            )}
                          </td>
                          <td>
                            <span
                              className="stock-badge"
                              title="QC release holds are not posted to store ledger"
                              style={{ background: '#f8fafc', color: '#94a3b8', border: '1px solid #e2e8f0', cursor: 'help' }}
                            >
                              Not tracked
                            </span>
                          </td>
                          <td className="ci-actions-col">
                            <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                              <Button size="sm" variant="secondary" onClick={() => handleOpenDetails(row)}>
                                Details
                              </Button>

                              <Link
                                to={`/inventory/materials/${row.material_id}`}
                                className="ci-quick-link"
                                style={{ padding: '4px 8px', fontSize: 12 }}
                              >
                                Register
                              </Link>

                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() =>
                                  handleOpenIssue(
                                    row.material_id,
                                    row.material_code_snapshot,
                                    row.material_name_snapshot,
                                    row.source_company_id,
                                    `Source: ${row.source_goods_receipt_reference || `GR-#${row.source_goods_receipt_id}`} | Lot: ${row.lot_reference || 'Unspecified'}`
                                  )
                                }
                              >
                                Issue
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {movements.count > 0 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 14,
                    padding: '8px 12px',
                    background: '#f8fafc',
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: '#64748b' }}>
                    Showing {(movementsPage - 1) * pageSize + 1} &ndash;{' '}
                    {Math.min(movementsPage * pageSize, movements.count)} of {movements.count} receipt sources
                  </span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={movementsPage <= 1 || movements.loading}
                      onClick={() => setMovementsPage((p) => Math.max(1, p - 1))}
                    >
                      &larr; Previous
                    </Button>
                    <span style={{ padding: '0 8px', fontWeight: 600 }}>
                      Page {movementsPage} of {Math.ceil(movements.count / pageSize) || 1}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={movementsPage * pageSize >= movements.count || movements.loading}
                      onClick={() => setMovementsPage((p) => p + 1)}
                    >
                      Next &rarr;
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* LOT / SOURCE DETAILS DRAWER MODAL                                         */}
      {/* ========================================================================= */}
      {isDrawerOpen && selectedSource && (
        <Modal
          isOpen={true}
          onClose={() => setIsDrawerOpen(false)}
          title={`Receipt Source Details: SM-#${selectedSource.id}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Section 1: Material */}
            <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
                1. Material Specification
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                <div><strong>Code:</strong> {selectedSource.material_code_snapshot}</div>
                <div><strong>Name:</strong> {selectedSource.material_name_snapshot}</div>
                <div>
                  <strong>Category / Type:</strong>{' '}
                  {materialsMap.get(selectedSource.material_id)?.kind === 'RAW_MATERIAL' ? 'Raw Material' : 'Packaging Material'}
                </div>
                <div><strong>Base Unit:</strong> {selectedSource.unit_code_snapshot}</div>
              </div>
            </div>

            {/* Section 2: Source Provenance */}
            <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
                2. Source &amp; Provenance
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                <div><strong>Internal Reference:</strong> SM-#{selectedSource.id} (Receipt Line #{selectedSource.source_receipt_line_id})</div>
                <div><strong>Supplier Lot / Batch:</strong> {selectedSource.lot_reference || 'Not recorded'}</div>
                <div><strong>Goods Receipt:</strong> {selectedSource.source_goods_receipt_reference || `GR-#${selectedSource.source_goods_receipt_id}`}</div>
                <div><strong>Arrival Date:</strong> {selectedSource.source_goods_receipt_arrived_at?.slice(0, 10) || 'Not recorded'}</div>
                <div><strong>Supplier:</strong> {selectedSource.supplier_name || selectedSource.supplier_code || 'Recorded on PO'}</div>
                <div><strong>Owning / Billing Entity:</strong> {selectedSource.source_company_code}</div>
                <div><strong>Supplier Invoice:</strong> {selectedSource.source_invoice_reference || 'Not recorded'}</div>
                <div><strong>Delivery Note:</strong> {selectedSource.source_delivery_note_reference || 'Not recorded'}</div>
              </div>
            </div>

            {/* Section 3: Packaging & Containers */}
            <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
                3. Packaging &amp; Receiving
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                <div><strong>Container Type:</strong> {selectedSource.container_type_code || 'Standard'}</div>
                <div><strong>Container Quantity:</strong> {selectedSource.container_quantity || 1}</div>
                <div><strong>Actual Received Quantity:</strong> {selectedSource.quantity} {selectedSource.unit_code_snapshot}</div>
                <div><strong>Price Reference:</strong> {selectedSource.currency_code ? `${selectedSource.currency_code} ${selectedSource.unit_price}` : 'Restricted / Derived'}</div>
              </div>
            </div>

            {/* Section 4: Storage & Quality */}
            <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
                4. Storage &amp; Quality
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                <div><strong>Physical Storage Location:</strong> <span style={{ color: '#94a3b8' }}>Not recorded</span></div>
                <div><strong>Quality Release Status:</strong> <span style={{ color: '#94a3b8' }}>Not tracked</span></div>
                <div><strong>Expiry / Retest Date:</strong> <span style={{ color: '#94a3b8' }}>Not recorded</span></div>
                <div><strong>Inspection Protocol:</strong> Standard Physical Receiving</div>
              </div>
            </div>

            {/* Section 5: Quantities & Allocation */}
            <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
                5. Quantities &amp; Allocation Coverage
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                <div><strong>Original Received Quantity:</strong> {selectedSource.quantity} {selectedSource.unit_code_snapshot}</div>
                <div><strong>Issued From This Specific Line:</strong> <span style={{ color: '#64748b' }}>Unallocated</span></div>
                <div>
                  <strong>Material Collective Net Balance:</strong>{' '}
                  <span style={{ color: '#16a34a', fontWeight: 700 }}>
                    {availableToIssueMap[selectedSource.material_id]?.find(
                      (a) => a.unit_id === selectedSource.unit_id && a.source_company_id === selectedSource.source_company_id
                    )?.net_quantity ?? selectedSource.quantity}{' '}
                    {selectedSource.unit_code_snapshot}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 8, fontStyle: 'italic' }}>
                Note: In accordance with current ledger governance, outward issues reduce the collective material-level balance. Individual receipt line allocation is not stored in the transaction ledger.
              </div>
            </div>

            {/* Section 6: Action Links */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <Button
                variant="secondary"
                onClick={() => {
                  setIsDrawerOpen(false)
                  navigate('/inventory/orders')
                }}
              >
                View in Orders
              </Button>

              <Button
                variant="secondary"
                onClick={() => {
                  setIsDrawerOpen(false)
                  navigate(`/inventory/materials/${selectedSource.material_id}`)
                }}
              >
                Open Material Register
              </Button>

              <Button
                variant="primary"
                onClick={() => {
                  setIsDrawerOpen(false)
                  handleOpenIssue(
                    selectedSource.material_id,
                    selectedSource.material_code_snapshot,
                    selectedSource.material_name_snapshot,
                    selectedSource.source_company_id,
                    `Source: ${selectedSource.source_goods_receipt_reference || `GR-#${selectedSource.source_goods_receipt_id}`} | Lot: ${selectedSource.lot_reference || 'Unspecified'}`
                  )
                }}
              >
                📤 Issue Material
              </Button>

              <Button variant="secondary" onClick={() => setIsDrawerOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* OUTWARD ISSUE MODAL INTEGRATION                                           */}
      {/* ========================================================================= */}
      {issueModalTarget && (
        <IssueOutwardModal
          storeId={storeId}
          materialId={issueModalTarget.materialId}
          materialCode={issueModalTarget.materialCode}
          materialName={issueModalTarget.materialName}
          initialCompanyId={issueModalTarget.companyId}
          initialRemarks={issueModalTarget.initialRemarks}
          onClose={() => setIssueModalTarget(null)}
          onPosted={() => {
            setIssueModalTarget(null)
            handleRefresh()
          }}
          onIssued={() => {
            setIssueModalTarget(null)
            handleRefresh()
          }}
        />
      )}
    </div>
  )
}