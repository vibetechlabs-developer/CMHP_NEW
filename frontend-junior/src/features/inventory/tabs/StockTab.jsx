// Real Stock & Lots Module - Material Stock Summary & Receipt Source Traceability
// Integrated with real backend stock-balances, stock-movements, material master, and issue outward workflow.
//
// Adheres strictly to business rules:
// - Common physical inventory for shared store.
// - Honest disclosure of unreconciled historical source allocations.
// - Real Inward and Outward integration with IssueOutwardModal.
// - No mock Redux / localStorage state mutations.
import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
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
  listMyCompanies,
  listMaterialSuppliers,
} from '../../store/storeService'
import { getAvailableToIssue } from '../../store/materialIssueService'
import MaterialSearchSelect from '../../store/MaterialSearchSelect'
import IssueOutwardModal from '../../store/IssueOutwardModal'
import { qualityStatusService } from '../qualityStatusService'
import { finishedGoodsService } from '../finishedGoodsService'
import './StockTab.css'
import './CommonInventory.css'

function newAllocationRequestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export default function StockTab({ storeId: propStoreId, stores: propStores, onSelectStore }) {
  const navigate = useNavigate()

  // Store resolution
  const [storeId, setStoreId] = useState(propStoreId || null)
  const [stores, setStores] = useState(propStores || [])

  // Subtab navigation: 'SUMMARY' (Tab 1: Material Stock Summary) | 'SOURCES' (Tab 2: Receipt Sources)
  const [activeSubtab, setActiveSubtab] = useState('SUMMARY')

  // Shared Reference Data
  const [companies, setCompanies] = useState([])
  const [suppliersList, setSuppliersList] = useState([])

  // Tab 1: Material Stock Balances
  const [balances, setBalances] = useState({ loading: true, rows: [], count: 0, error: '' })
  const [balancePage, setBalancePage] = useState(1)
  const balanceRequest = useRef(0)
  const movementRequest = useRef(0)
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
  const [selectedMaterial, setSelectedMaterial] = useState(null)
  const selectedMaterialFilter = selectedMaterial?.id || ''
  const [supplierFilter, setSupplierFilter] = useState('')
  const [companyFilter, setCompanyFilter] = useState('ALL')

  // Modals & Drawers
  const [selectedSource, setSelectedSource] = useState(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [issueModalTarget, setIssueModalTarget] = useState(null) // { materialId, materialCode, materialName, companyId, initialRemarks }

  // QC Release Gate Modal State
  const [qcReleaseModalTarget, setQcReleaseModalTarget] = useState(null)
  const [qcSaving, setQcSaving] = useState(false)
  const [qcSaveError, setQcSaveError] = useState('')

  // Finished Goods (FG) Warehouse & Buffer Stock State
  const [fgLoading, setFgLoading] = useState(false)
  const [allocateFgModalTarget, setAllocateFgModalTarget] = useState(null)
  const [bayEdit, setBayEdit] = useState(null)
  const [bayError, setBayError] = useState('')
  const [allocateOrderRef, setAllocateOrderRef] = useState('')
  const [fgCompanySelection, setFgCompanySelection] = useState('')
  const fgCompanyId = fgCompanySelection || companies[0]?.id
  const [fgPage, setFgPage] = useState(1)
  const [fgResult, setFgResult] = useState(null)
  const [fgError, setFgError] = useState('')
  const [fgHistory, setFgHistory] = useState(null)
  const [fgSaving, setFgSaving] = useState(false)
  const [allocateError, setAllocateError] = useState('')
  const allocationRequest = useRef(null)
  const fgRequest = useRef(0)
  const [allocateQtyInput, setAllocateQtyInput] = useState('')
  const [actionSuccessNotice, setActionSuccessNotice] = useState('')

  const fgStockList = fgResult && fgResult.companyId === fgCompanyId ? fgResult.results : []

  const loadFgStock = useCallback(async () => {
    if (!fgCompanyId) return
    const request = ++fgRequest.current
    setFgLoading(true)
    setFgError('')
    try {
      const data = await finishedGoodsService.listStock(fgCompanyId, fgPage)
      if (request === fgRequest.current) setFgResult({ ...data, companyId: fgCompanyId })
    } catch (error) {
      if (request === fgRequest.current) setFgError(getErrorMessage(error))
    } finally {
      if (request === fgRequest.current) setFgLoading(false)
    }
  }, [fgCompanyId, fgPage])

  useEffect(() => {
    if (activeSubtab === 'FG_BUFFER') loadFgStock()
    return () => { fgRequest.current++ }
  }, [activeSubtab, loadFgStock])

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

  useEffect(() => {
    listMyCompanies().then(setCompanies).catch(() => setCompanies([]))
    listMaterialSuppliers().then((suppliers) => setSuppliersList(suppliers || [])).catch(() => setSuppliersList([]))
  }, [])

  const loadBalances = useCallback(() => {
    if (!storeId) return
    const request = ++balanceRequest.current
    setBalances((prev) => ({ ...prev, loading: true, error: '' }))
    listStockBalances(storeId, {
      materialId: selectedMaterialFilter || undefined,
      page: balancePage,
      pageSize,
      search: search.trim(),
      materialKind: materialTypeFilter === 'ALL' ? undefined : materialTypeFilter,
      companyCode: companyFilter === 'ALL' ? undefined : companyFilter,
    })
      .then(({ results, count }) => {
        if (request === balanceRequest.current) setBalances({ loading: false, rows: results, count, error: '' })
      })
      .catch((err) => {
        if (request === balanceRequest.current) {
          setBalances({ loading: false, rows: [], count: 0, error: getErrorMessage(err) })
        }
      })
  }, [storeId, selectedMaterialFilter, balancePage, search, materialTypeFilter, companyFilter])

  const loadMovements = useCallback(() => {
    if (!storeId) return
    const request = ++movementRequest.current
    setMovements((prev) => ({ ...prev, loading: true, error: '' }))
    listStockMovements(storeId, {
      materialId: selectedMaterialFilter || undefined,
      page: movementsPage,
      pageSize,
      search: search.trim(),
      materialKind: materialTypeFilter === 'ALL' ? undefined : materialTypeFilter,
      companyCode: companyFilter === 'ALL' ? undefined : companyFilter,
      supplier: supplierFilter || undefined,
    })
      .then((res) => {
        if (request === movementRequest.current) setMovements({ ...res, loading: false, error: '' })
      })
      .catch((err) => {
        if (request === movementRequest.current) {
          setMovements({ loading: false, results: [], count: 0, coverage: null, error: getErrorMessage(err) })
        }
      })
  }, [storeId, selectedMaterialFilter, movementsPage, search, materialTypeFilter, companyFilter, supplierFilter])

  useEffect(() => {
    const timer = setTimeout(loadBalances, search ? 300 : 0)
    return () => {
      balanceRequest.current += 1
      clearTimeout(timer)
    }
  }, [loadBalances, search])

  useEffect(() => {
    const timer = setTimeout(loadMovements, search ? 300 : 0)
    return () => {
      movementRequest.current += 1
      clearTimeout(timer)
    }
  }, [loadMovements, search])

  // Fetch Available-to-Issue for materials present in balances
  useEffect(() => {
    if (!storeId || balances.rows.length === 0) {
      setAvailableToIssueMap({})
      setAvailLoading(false)
      return
    }
    const uniqueMatIds = Array.from(new Set(balances.rows.map((r) => r.material_id)))
    let cancelled = false
    setAvailLoading(true)

    Promise.all(
      uniqueMatIds.map((matId) =>
        getAvailableToIssue(storeId, matId)
          .then((res) => ({ matId, data: res }))
          .catch(() => ({ matId, data: [] }))
      )
    )
      .then((results) => {
        if (cancelled) return
        const nextMap = {}
        results.forEach(({ matId, data }) => {
          nextMap[matId] = data
        })
        setAvailableToIssueMap(nextMap)
      })
      .finally(() => { if (!cancelled) setAvailLoading(false) })
    return () => { cancelled = true }
  }, [storeId, balances.rows])

  // Reset page when material filter changes
  const resetStockPages = () => {
    setBalancePage(1)
    setMovementsPage(1)
  }

  const handleMaterialFilterChange = (material) => {
    setSelectedMaterial(material)
    resetStockPages()
  }

  // Clear all filters
  const handleClearFilters = () => {
    setSearch('')
    setMaterialTypeFilter('ALL')
    setSelectedMaterial(null)
    setSupplierFilter('')
    setCompanyFilter('ALL')
    resetStockPages()
  }

  // Refresh all data
  const handleRefresh = () => {
    if (activeSubtab === 'FG_BUFFER') loadFgStock()
    loadBalances()
    loadMovements()
  }

  // Available owning companies derived from balances and movements
  const availableCompanies = useMemo(() => {
    const set = new Set(companies.map((company) => company.code).filter(Boolean))
    if (companyFilter !== 'ALL') set.add(companyFilter)
    balances.rows.forEach((r) => {
      if (r.source_company_code) set.add(r.source_company_code)
    })
    movements.results.forEach((r) => {
      if (r.source_company_code) set.add(r.source_company_code)
    })
    return Array.from(set).sort()
  }, [balances.rows, movements.results, companies, companyFilter])

  // Quality Status summary metrics across lots
  const qcMetrics = useMemo(() => {
    return qualityStatusService.computeQualityMetrics(movements.results)
  }, [movements.results])

  const filteredBalances = balances.rows
  const filteredMovements = movements.results

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
        'Recorded Receipt Quantity',
        'Held Quantity',
        'Available to Issue',
      ]
      const rows = filteredBalances.map((r) => {
        const kindLabel = r.material_kind === 'RAW_MATERIAL' ? 'Raw Material' : r.material_kind === 'PACKAGING_MATERIAL' ? 'Packaging Material' : r.material_kind === 'MOTHER_TINCTURE' ? 'Mother Tincture' : 'Material'
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
        'Goods Receipt Ref',
        'Arrived Date',
        'Supplier',
        'AR No.',
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
        escapeCsv(r.source_goods_receipt_reference || `GR-#${r.source_goods_receipt_id}`),
        escapeCsv((r.source_goods_receipt_arrived_at || r.posted_at || '').slice(0, 10)),
        escapeCsv(r.supplier_name || r.supplier_code || 'Recorded on PO'),
        escapeCsv(r.quality_ar_no),
        escapeCsv(r.source_company_code),
        escapeCsv(r.quantity),
        escapeCsv(r.unit_code_snapshot),
        escapeCsv(r.container_type_code || 'Standard'),
        escapeCsv(r.container_quantity || 1),
        escapeCsv('Unallocated per receipt (tracked at material level)'),
        escapeCsv(qualityStatusService.getLotStatus(r).label),
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
  const handleViewSourcesForMaterial = (row) => {
    handleMaterialFilterChange({ id: row.material_id, code: row.material_code, name: row.material_name })
    setActiveSubtab('SOURCES')
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
            📥 Export Page CSV
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={handleRefresh}
            disabled={balances.loading || movements.loading || fgLoading}
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
            <span className="ci-card-label stocks-card-label">Stock Groups</span>
            <span className="ci-card-value stocks-card-value">{balances.count}</span>
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

        <div
          className="ci-card stocks-card"
          style={{ cursor: 'pointer', transition: 'transform 0.15s ease, box-shadow 0.15s ease' }}
          onClick={() => setActiveSubtab('SOURCES')}
          title="Click to view Lot Quality & Release Gate in Tab 2"
        >
          <div className="ci-card-icon stocks-card-icon" style={{ background: '#ecfdf5', color: '#16a34a' }}>
            🛡️
          </div>
          <div className="ci-card-info stocks-card-info">
            <span className="ci-card-label stocks-card-label">QC Release Gate</span>
            <span className="ci-card-value stocks-card-value" style={{ fontSize: 16, color: '#16a34a', marginTop: 2 }}>
              {qcMetrics.approved} Released
            </span>
            <span className="ci-card-subtext stocks-card-subtext" style={{ color: qcMetrics.underTest > 0 ? '#d97706' : '#15803d', fontWeight: 500 }}>
              {qcMetrics.underTest} quarantine · {qcMetrics.onHold} on hold · {qcMetrics.rejected} rejected
            </span>
          </div>
        </div>
      </div>

      {actionSuccessNotice && (
        <Alert type="success" onClose={() => setActionSuccessNotice('')} style={{ marginBottom: 14 }}>
          {actionSuccessNotice}
        </Alert>
      )}

      {/* 3. Subtabs Navigation: Modern Segmented Control */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          background: '#f1f5f9',
          padding: 4,
          borderRadius: 10,
          border: '1px solid #e2e8f0',
          alignSelf: 'flex-start',
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <button
          type="button"
          onClick={() => {
            if (activeSubtab !== 'SUMMARY') handleClearFilters()
            setActiveSubtab('SUMMARY')
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            borderRadius: 8,
            border: activeSubtab === 'SUMMARY' ? '1px solid #cbd5e1' : '1px solid transparent',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            background: activeSubtab === 'SUMMARY' ? '#ffffff' : 'transparent',
            color: activeSubtab === 'SUMMARY' ? '#0f172a' : '#64748b',
            boxShadow: activeSubtab === 'SUMMARY' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
          }}
        >
          <span>📊 Tab 1: Material Stock Summary</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              background: activeSubtab === 'SUMMARY' ? '#e0f2fe' : '#e2e8f0',
              color: activeSubtab === 'SUMMARY' ? '#0369a1' : '#64748b',
              padding: '1px 7px',
              borderRadius: 10,
            }}
          >
            {balances.count}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubtab('SOURCES')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            borderRadius: 8,
            border: activeSubtab === 'SOURCES' ? '1px solid #cbd5e1' : '1px solid transparent',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            background: activeSubtab === 'SOURCES' ? '#ffffff' : 'transparent',
            color: activeSubtab === 'SOURCES' ? '#0f172a' : '#64748b',
            boxShadow: activeSubtab === 'SOURCES' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
          }}
        >
          <span>🏷️ Tab 2: Lots &amp; Receipt Sources</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              background: activeSubtab === 'SOURCES' ? '#e0f2fe' : '#e2e8f0',
              color: activeSubtab === 'SOURCES' ? '#0369a1' : '#64748b',
              padding: '1px 7px',
              borderRadius: 10,
            }}
          >
            {filteredMovements.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubtab('FG_BUFFER')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            borderRadius: 8,
            border: activeSubtab === 'FG_BUFFER' ? '1px solid #86efac' : '1px solid transparent',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            background: activeSubtab === 'FG_BUFFER' ? '#f0fdf4' : 'transparent',
            color: activeSubtab === 'FG_BUFFER' ? '#166534' : '#64748b',
            boxShadow: activeSubtab === 'FG_BUFFER' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
          }}
        >
          <span>📦 Tab 3: Finished Goods Buffer Stock</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              background: activeSubtab === 'FG_BUFFER' ? '#bbf7d0' : '#e2e8f0',
              color: activeSubtab === 'FG_BUFFER' ? '#166534' : '#64748b',
              padding: '1px 7px',
              borderRadius: 10,
            }}
          >
            {fgResult && fgResult.companyId === fgCompanyId ? fgResult.count : 0}
          </span>
        </button>
      </div>

      {/* 4. Filters Toolbar */}
      {activeSubtab !== 'FG_BUFFER' && <div className="stocks-filter-card">
        <div className="stocks-inputs-row">
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
            onChange={(e) => { setSearch(e.target.value); resetStockPages() }}
            aria-label="Search stock"
          />

          {/* Material Type: All / Raw Material / Packaging Material */}
          <select
            className="ci-select stocks-select-input"
            value={materialTypeFilter}
            onChange={(e) => { setMaterialTypeFilter(e.target.value); resetStockPages() }}
            style={{ minWidth: 160, padding: '7px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #cbd5e1' }}
          >
            <option value="ALL">All Material Types</option>
            <option value="RAW_MATERIAL">Raw Materials</option>
            <option value="PACKAGING_MATERIAL">Packaging Materials</option>
            <option value="MOTHER_TINCTURE">Mother Tincture</option>
          </select>

          <div className="stocks-material-filter">
            <MaterialSearchSelect
              value={selectedMaterialFilter}
              selected={selectedMaterial}
              onChange={handleMaterialFilterChange}
              placeholder="All materials"
              includeInactive
            />
          </div>

          {/* Supplier Filter (Tab 2) */}
          {activeSubtab === 'SOURCES' && (
            <select
              className="ci-select stocks-select-input"
              value={supplierFilter}
              onChange={(e) => { setSupplierFilter(e.target.value); resetStockPages() }}
              style={{ minWidth: 160, padding: '7px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #cbd5e1' }}
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
              onChange={(e) => { setCompanyFilter(e.target.value); resetStockPages() }}
              style={{ minWidth: 140, padding: '7px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #cbd5e1' }}
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

        {availLoading && (
          <span style={{ fontSize: 12, color: '#0369a1', fontWeight: 600 }}>
            Checking store issue availability...
          </span>
        )}
      </div>}

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
                    <th style={{ minWidth: 130 }}>Material Code</th>
                    <th style={{ minWidth: 200 }}>Material Name</th>
                    <th style={{ minWidth: 120 }}>Type</th>
                    <th style={{ minWidth: 80 }}>Base Unit</th>
                    <th style={{ minWidth: 100 }}>Billing Entity</th>
                    <th style={{ minWidth: 130, textAlign: 'right' }}>Recorded Receipts</th>
                    <th style={{ minWidth: 140, textAlign: 'right' }}>Available to Issue</th>
                    <th className="ci-actions-col" style={{ minWidth: 260, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBalances.map((row, idx) => {
                    const kindLabel =
                      row.material_kind === 'RAW_MATERIAL'
                        ? 'Raw Material'
                        : row.material_kind === 'PACKAGING_MATERIAL'
                        ? 'Packaging'
                        : row.material_kind === 'MOTHER_TINCTURE'
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
                          {row.material_description && (
                            <div style={{ fontSize: 11, color: '#64748b', maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {row.material_description}
                            </div>
                          )}
                        </td>
                        <td>
                          <span
                            className="stock-badge"
                            style={{
                              background: row.material_kind === 'RAW_MATERIAL' ? '#e0f2fe' : '#fef3c7',
                              color: row.material_kind === 'RAW_MATERIAL' ? '#0369a1' : '#b45309',
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
                              onClick={() => handleViewSourcesForMaterial(row)}
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
          {balances.count > pageSize && (
            <div className="ci-pagination">
              <Button type="button" variant="secondary" disabled={balancePage <= 1 || balances.loading} onClick={() => setBalancePage(balancePage - 1)}>Previous</Button>
              <span>Page {balancePage} of {Math.ceil(balances.count / pageSize)}</span>
              <Button type="button" variant="secondary" disabled={balancePage * pageSize >= balances.count || balances.loading} onClick={() => setBalancePage(balancePage + 1)}>Next</Button>
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
                      <th style={{ minWidth: 130 }}>Goods Receipt</th>
                      <th style={{ minWidth: 95 }}>Receipt Date</th>
                      <th style={{ minWidth: 140 }}>Supplier</th>
                      <th style={{ minWidth: 105 }}>AR No.</th>
                      <th style={{ minWidth: 110, textAlign: 'right' }}>Received Qty</th>
                      <th style={{ minWidth: 140, textAlign: 'right' }}>Remaining Store Qty</th>
                      <th style={{ minWidth: 100 }}>Quality Status</th>
                      <th className="ci-actions-col" style={{ minWidth: 230, textAlign: 'right' }}>Actions</th>
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
                            {row.quality_ar_no || '—'}
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
                            {(() => {
                              const qc = qualityStatusService.getLotStatus(row)
                              return (
                                <div>
                                <button
                                  type="button"
                                  onClick={() => setQcReleaseModalTarget({ movementId: row.id, ...qc, autoAr: ['RAW_MATERIAL', 'PACKAGING_MATERIAL'].includes(row.material_kind), lotRef: row.lot_reference || `SM-#${row.id}`, matName: row.material_name_snapshot })}
                                  title="Click to change QC Release / Quarantine Status & AR No."
                                  style={{
                                    cursor: 'pointer',
                                    padding: '3px 8px',
                                    borderRadius: 4,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    background: qc.status === 'APPROVED' ? '#dcfce7' : qc.status === 'REJECTED' ? '#fee2e2' : '#fef3c7',
                                    color: qc.status === 'APPROVED' ? '#166534' : qc.status === 'REJECTED' ? '#991b1b' : '#92400e',
                                    border: `1px solid ${qc.status === 'APPROVED' ? '#86efac' : qc.status === 'REJECTED' ? '#fca5a5' : '#fde047'}`,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                  }}
                                >
                                  {qc.label}
                                </button>
                                </div>
                              )
                            })()}
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
      {/* TAB 3: FINISHED GOODS (FG) & WAREHOUSE BUFFER STOCK                       */}
      {/* ========================================================================= */}
      {activeSubtab === 'FG_BUFFER' && (
        <div>
          <div className="stocks-filter-card">
            <label>
              Company{' '}
              <select className="ci-select" value={fgCompanyId || ''} onChange={(event) => {
                setFgCompanySelection(event.target.value)
                setFgPage(1)
                setFgResult(null)
              }}>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.display_name || company.name || company.code}</option>)}
              </select>
            </label>
          </div>
          {!fgCompanyId ? <p>No company available for finished goods.</p> : fgError ? <Alert type="error">{fgError}</Alert> : fgLoading ? (
            <LoadingState label="Loading finished goods inventory..." />
          ) : fgStockList.length === 0 ? (
            <p>No finished goods posted for this company.</p>
          ) : (
            <div className="ci-table-wrapper" style={{ overflowX: 'auto' }}>
              <table className="ci-table">
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>Batch No</th>
                    <th>Product &amp; Pack Size</th>
                    <th style={{ width: 120, textAlign: 'right' }}>Posted Quantity</th>
                    <th style={{ width: 140, textAlign: 'right' }}>Free Buffer Available</th>
                    <th style={{ width: 130, textAlign: 'right' }}>Allocated to Orders</th>
                    <th style={{ width: 100 }}>Posted Date</th>
                    <th>Warehouse Bay</th>
                    <th className="ci-actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fgStockList.map((fg) => (
                    <tr key={fg.id}>
                      <td>
                        <strong style={{ color: '#0f172a' }}>{fg.batchNo}</strong>
                      </td>
                      <td>
                        <div><strong>{fg.productName}</strong></div>
                        <div style={{ fontSize: 11.5, color: '#64748b' }}>{fg.productCode} · {fg.packSize}</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {fg.postedQty} {fg.unitCode}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: fg.availableBufferQty > 0 ? '#16a34a' : '#64748b' }}>
                          {fg.availableBufferQty?.toLocaleString()}
                        </span>{' '}
                        <span style={{ fontSize: 11, color: fg.availableBufferQty > 0 ? '#15803d' : '#94a3b8' }}>{fg.unitCode}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ fontWeight: 600, color: '#0369a1' }}>{fg.allocatedQty?.toLocaleString()}</span>
                        <div>
                          <Button size="sm" variant="secondary" onClick={() => setFgHistory(fg)}>
                            Allocation History
                          </Button>
                        </div>
                      </td>
                      <td>{fg.postedAt?.slice(0, 10)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                          <span style={{ fontSize: 11.5, color: '#475569' }}>{fg.warehouseStore || 'Unassigned'}</span>
                          <Button
                            size="sm"
                            variant="secondary"
                            aria-label={`Edit bay for batch ${fg.batchNo}`}
                            onClick={() => {
                              setBayError('')
                              setBayEdit({ id: fg.id, batchNo: fg.batchNo, value: fg.warehouseStore || '' })
                            }}
                          >
                            Edit Bay
                          </Button>
                        </div>
                      </td>
                      <td className="ci-actions-col">
                        {fg.availableBufferQty > 0 ? (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => {
                              setAllocateFgModalTarget(fg)
                              setAllocateQtyInput(String(fg.availableBufferQty))
                              setAllocateOrderRef('')
                              setAllocateError('')
                              allocationRequest.current = null
                            }}
                          >
                            + Allocate to SO
                          </Button>
                        ) : (
                          <span style={{ fontSize: 11.5, color: '#94a3b8', fontStyle: 'italic' }}>Depleted</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {fgStockList.length > 0 && (fgResult.previous || fgResult.next) && (
            <div className="stock-pagination">
              <Button size="sm" variant="secondary" disabled={!fgResult.previous} onClick={() => setFgPage(fgPage - 1)}>Previous</Button>
              <span>Page {fgPage}</span>
              <Button size="sm" variant="secondary" disabled={!fgResult.next} onClick={() => setFgPage(fgPage + 1)}>Next</Button>
            </div>
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
                  {selectedSource.material_kind === 'RAW_MATERIAL' ? 'Raw Material' : selectedSource.material_kind === 'MOTHER_TINCTURE' ? 'Mother Tincture' : selectedSource.material_kind === 'PACKAGING_MATERIAL' ? 'Packaging Material' : 'Material'}
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
                <div><strong>Quality Release Status:</strong> {qualityStatusService.getLotStatus(selectedSource).label}</div>
                {selectedSource.quality_ar_no && <div><strong>AR Number:</strong> {selectedSource.quality_ar_no}</div>}
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

      {/* ========================================================================= */}
      {/* QC RELEASE GATE & AR NUMBER MODAL                                         */}
      {/* ========================================================================= */}
      {qcReleaseModalTarget && (
        <Modal
          isOpen={true}
          onClose={() => {
            if (!qcSaving) {
              setQcReleaseModalTarget(null)
              setQcSaveError('')
            }
          }}
          title={`QC Release & Analytical Inspection Gate — ${qcReleaseModalTarget.matName || `Movement #${qcReleaseModalTarget.movementId}`}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 6, fontSize: 13, border: '1px solid #e2e8f0' }}>
              <div><strong>Lot Reference:</strong> {qcReleaseModalTarget.lotRef || `SM-#${qcReleaseModalTarget.movementId}`}</div>
              <div><strong>Material:</strong> {qcReleaseModalTarget.matName || 'Store Inward Item'}</div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Quality Status Decision *
              </label>
              <select
                value={qcReleaseModalTarget.status || 'APPROVED'}
                onChange={(e) => setQcReleaseModalTarget({ ...qcReleaseModalTarget, status: e.target.value })}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontWeight: 600 }}
              >
                <option value="APPROVED">✓ APPROVED (Release for Batch Manufacturing)</option>
                <option value="UNDER_TEST">⏳ UNDER_TEST (Quarantine Hold - Lab Testing Active)</option>
                <option value="REJECTED">✕ REJECTED (Fail Specification - Locked from Issue)</option>
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Analytical Report (AR) No.
                </label>
                <input
                  type="text"
                  readOnly={qcReleaseModalTarget.autoAr}
                  value={qcReleaseModalTarget.arNo || ''}
                  onChange={(e) => setQcReleaseModalTarget({ ...qcReleaseModalTarget, arNo: e.target.value })}
                  placeholder={qcReleaseModalTarget.autoAr ? 'Assigned when QC decision is saved' : 'Enter AR number'}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Approved Analyst / Chemist
                </label>
                <input
                  type="text"
                  value={qcReleaseModalTarget.chemist || ''}
                  onChange={(e) => setQcReleaseModalTarget({ ...qcReleaseModalTarget, chemist: e.target.value })}
                  placeholder="e.g. Dr. R. K. Patel"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Inspection Remarks / Protocol
              </label>
              <textarea
                rows="2"
                value={qcReleaseModalTarget.remarks || ''}
                onChange={(e) => setQcReleaseModalTarget({ ...qcReleaseModalTarget, remarks: e.target.value })}
                placeholder="Specification testing complete. Conforms to Pharmacopoeia limits."
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
              />
            </div>

            {qcSaveError && <Alert type="error">{qcSaveError}</Alert>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <Button variant="secondary" disabled={qcSaving} onClick={() => {
                setQcReleaseModalTarget(null)
                setQcSaveError('')
              }}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={qcSaving}
                onClick={async () => {
                  setQcSaving(true)
                  setQcSaveError('')
                  try {
                    const saved = await qualityStatusService.updateLotStatus(qcReleaseModalTarget.movementId, {
                      status: qcReleaseModalTarget.status,
                      arNo: qcReleaseModalTarget.arNo,
                      chemist: qcReleaseModalTarget.chemist,
                      remarks: qcReleaseModalTarget.remarks,
                      storeId,
                    })
                    setActionSuccessNotice(`QC Release Status updated to ${qcReleaseModalTarget.status}${saved.ar_no ? ` (AR No: ${saved.ar_no})` : ''}`)
                    setQcReleaseModalTarget(null)
                    loadBalances()
                    loadMovements()
                    setTimeout(() => setActionSuccessNotice(''), 8000)
                  } catch (err) {
                    setActionSuccessNotice('')
                    setQcSaveError(getErrorMessage(err))
                  } finally {
                    setQcSaving(false)
                  }
                }}
              >
                Save QC Release Decision
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* ALLOCATE FINISHED GOODS BUFFER TO SALES ORDER MODAL                       */}
      {/* ========================================================================= */}
      {fgHistory && (
        <Modal title={`Allocation History — ${fgHistory.batchNo}`} size="lg" onClose={() => setFgHistory(null)}>
          {fgHistory.allocatedOrders.length === 0 ? <p>No sales order allocations yet.</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="stock-ledger-table">
                <thead><tr><th>Sales Order</th><th>Customer</th><th>Quantity</th><th>Allocated By</th><th>Date</th></tr></thead>
                <tbody>
                  {fgHistory.allocatedOrders.map((row) => (
                    <tr key={row.id}>
                      <td>{row.orderRef}</td><td>{row.customer}</td><td>{row.qty} {fgHistory.unitCode}</td>
                      <td>{row.actor}</td><td>{new Date(row.date).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      {bayEdit && (
        <Modal title={`Edit Warehouse Bay — ${bayEdit.batchNo}`} onClose={() => { if (!fgSaving) setBayEdit(null) }}>
          <form className="inv-modal-form" onSubmit={async (event) => {
            event.preventDefault()
            setFgSaving(true)
            setBayError('')
            try {
              await finishedGoodsService.updateWarehouseBay(fgCompanyId, bayEdit.id, bayEdit.value)
              setBayEdit(null)
              setActionSuccessNotice(`Warehouse bay updated for batch ${bayEdit.batchNo}.`)
              loadFgStock()
            } catch (error) {
              setBayError(getErrorMessage(error))
            } finally {
              setFgSaving(false)
            }
          }}>
            <label className="inv-modal-field-label" htmlFor="fg-warehouse-bay">Warehouse bay or rack</label>
            <input
              id="fg-warehouse-bay"
              className="company-input"
              placeholder="e.g. FG Warehouse · Rack FG-02"
              value={bayEdit.value}
              onChange={(event) => setBayEdit({ ...bayEdit, value: event.target.value })}
              required
            />
            {bayError && <Alert type="error">{bayError}</Alert>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="secondary" disabled={fgSaving} onClick={() => setBayEdit(null)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={fgSaving}>Save Bay</Button>
            </div>
          </form>
        </Modal>
      )}

      {allocateFgModalTarget && (
        <Modal
          isOpen={true}
          onClose={() => { if (!fgSaving) setAllocateFgModalTarget(null) }}
          title={`Allocate Finished Goods Buffer Stock — Batch ${allocateFgModalTarget.batchNo}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 14px', borderRadius: 6, fontSize: 13 }}>
              <div><strong>Product:</strong> {allocateFgModalTarget.productName} ({allocateFgModalTarget.packSize})</div>
              <div><strong>Batch No:</strong> {allocateFgModalTarget.batchNo}</div>
              <div><strong>Free Buffer Available:</strong> <span style={{ color: '#16a34a', fontWeight: 800 }}>{allocateFgModalTarget.availableBufferQty?.toLocaleString()} {allocateFgModalTarget.unitCode}</span></div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Target Sales Order Reference *
              </label>
              <input
                type="text"
                required
                placeholder="Enter the confirmed Sales Order reference"
                value={allocateOrderRef}
                onChange={(e) => setAllocateOrderRef(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                Quantity to Allocate ({allocateFgModalTarget.unitCode}) *
              </label>
              <input
                type="number"
                min="0.001"
                step="0.001"
                max={allocateFgModalTarget.availableBufferQty}
                value={allocateQtyInput}
                onChange={(e) => setAllocateQtyInput(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontWeight: 700 }}
              />
              <span style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'block' }}>
                Remaining in buffer after this allocation: {Math.max(0, allocateFgModalTarget.availableBufferQty - (Number(allocateQtyInput) || 0))} {allocateFgModalTarget.unitCode}
              </span>
            </div>

            {allocateError && <Alert type="error">{allocateError}</Alert>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <Button variant="secondary" disabled={fgSaving} onClick={() => setAllocateFgModalTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={fgSaving}
                onClick={async () => {
                  const orderRef = allocateOrderRef.trim()
                  const allocateQty = allocateQtyInput.trim()
                  if (!orderRef || !allocateQty) {
                    setAllocateError('Enter the sales order reference and quantity.')
                    return
                  }
                  const signature = JSON.stringify([orderRef, allocateQty])
                  if (allocationRequest.current?.signature !== signature) {
                    allocationRequest.current = { signature, id: newAllocationRequestId() }
                  }
                  setFgSaving(true)
                  setAllocateError('')
                  try {
                    const saved = await finishedGoodsService.allocateToSalesOrder(fgCompanyId, allocateFgModalTarget.id, {
                      orderRef, allocateQty, requestId: allocationRequest.current.id,
                    })
                    setActionSuccessNotice(`Allocated ${saved.qty} ${allocateFgModalTarget.unitCode} from batch ${allocateFgModalTarget.batchNo} to ${saved.orderRef}.`)
                    setAllocateFgModalTarget(null)
                    loadFgStock()
                  } catch (error) {
                    setAllocateError(getErrorMessage(error))
                  } finally {
                    setFgSaving(false)
                  }
                }}
              >
                ✓ Confirm Allocation to SO
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
