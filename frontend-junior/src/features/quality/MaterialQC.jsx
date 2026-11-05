/**
 * Material Incoming Quality Control
 * Flow: Purchase Order received → QC Check → Approve / Reject → Goes to Store
 *
 * This page shows all inward goods receipts (GRN) pending QC check,
 * allows QC chemist to fill test parameters, give decision (Approve/Reject),
 * and generate Attachment 3 (Bulk Release Note PDF).
 */
import { useCallback, useEffect, useState, useMemo } from 'react'
import PageHeader from '../../components/PageHeader'
import HeroBanner from '../../components/HeroBanner'
import Button from '../../components/Button'
import Modal from '../inventory/components/Modal'
import Alert from '../../components/Alert'
import StatusPill from '../../components/StatusPill'
import { getErrorMessage } from '../../utils/errors'
import { getCurrentWorkspaceObject } from '../../utils/workspace'
import useAuth from '../../hooks/useAuth'
import { printBulkReleaseNote, downloadBulkReleaseNotePdf } from './bulkReleasePrint'
import BulkReleaseSlipEditor from './BulkReleaseSlipEditor'
import TestRequestSlipEditor from './TestRequestSlipEditor'
import { getMyStores, listStockMovements } from '../store/storeService'
import { setLotQualityStatus } from '../store/materialIssueService'
import '../inventory/tabs/CommonInventory.css'
import './Quality.css'

/* ─── QC Status helpers ─── */
const QC_STATUSES = ['ALL', 'PENDING', 'APPROVED', 'REJECTED']
const QC_STORAGE_KEY = 'cmhp_material_qc_records_v1'

function loadQcRecords() {
  try { return JSON.parse(localStorage.getItem(QC_STORAGE_KEY) || '[]') } catch { return [] }
}
function saveQcRecords(records) {
  try { localStorage.setItem(QC_STORAGE_KEY, JSON.stringify(records)) } catch {}
}

function statusTone(s) {
  if (s === 'APPROVED') return 'success'
  if (s === 'REJECTED') return 'danger'
  return 'warning'
}

const DEFAULT_TESTS = [
  { key: 'appearance', name: 'Appearance', spec: '', observed: '', result: '' },
  { key: 'odor', name: 'Odor', spec: '', observed: '', result: '' },
  { key: 'wt_ml', name: 'Wt/ml', spec: '', observed: '', result: '', unit: 'gm/ml' },
  { key: 'viscosity', name: 'Viscosity', spec: '', observed: '', result: '', unit: 'mPa.S' },
  { key: 'acid_value', name: 'Acid Value', spec: '', observed: '', result: '' },
  { key: 'peroxide_value', name: 'Peroxide Value', spec: '', observed: '', result: '' },
  { key: 'iodine_value', name: 'Iodine Value', spec: '', observed: '', result: '' },
  { key: 'saponification', name: 'Saponification Value', spec: '', observed: '', result: '' },
]

function mapApiQcStatus(movement) {
  const raw = String(movement.quality_status || movement.release_status || '').toUpperCase()
  if (raw === 'APPROVED') return 'APPROVED'
  if (raw === 'REJECTED') return 'REJECTED'
  if (raw === 'ON_HOLD' || raw === 'UNDER_TEST') return 'PENDING'
  // Historical lots with no QC row are already issue-eligible.
  if (!raw || raw === 'NOT TRACKED') return 'APPROVED'
  return 'PENDING'
}

function movementToRecord(movement, storeId, overlay = {}) {
  const overlayRow = overlay[String(movement.id)] || {}
  return {
    id: movement.id,
    storeId,
    movementId: movement.id,
    grn_no: movement.source_goods_receipt_reference || `GR-#${movement.source_goods_receipt_id || movement.id}`,
    material_name: movement.material_name_snapshot || 'Material',
    material_code: movement.material_code_snapshot || '',
    batch_no: movement.lot_reference || overlayRow.batch_no || '—',
    batch_size: String(movement.quantity || ''),
    batch_unit: movement.unit_code_snapshot || '',
    mfg_date: overlayRow.mfg_date || '',
    expiry_date: overlayRow.expiry_date || '',
    ar_no: overlayRow.ar_no || movement.quality_ar_no || '',
    test_date: overlayRow.test_date || '',
    supplier: movement.supplier_name || '',
    received_date: (movement.source_goods_receipt_arrived_at || movement.posted_at || '').slice(0, 10),
    status: mapApiQcStatus(movement),
    tests: overlayRow.tests || DEFAULT_TESTS.map((t) => ({ ...t })),
    remarks: overlayRow.remarks || movement.quality_remarks || '',
    decision: mapApiQcStatus(movement),
    chemist_name: overlayRow.chemist_name || movement.quality_chemist || '',
    qc_head_name: overlayRow.qc_head_name || '',
    qa_name: overlayRow.qa_name || '',
    release_date: overlayRow.release_date || '',
  }
}

/* ─── Component ─── */
export default function MaterialQC() {
  const { user } = useAuth()
  const workspace = getCurrentWorkspaceObject(user)
  const companyName = workspace?.shortName || workspace?.name || 'Company'

  const [records, setRecords] = useState([])
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('inward_qc') // 'inward_qc' | 'bulk_slip' | 'test_request'
  const [slipInitialData, setSlipInitialData] = useState(null)
  const [testReqInitialData, setTestReqInitialData] = useState(null)
  const [selectedRecord, setSelectedRecord] = useState(null)  // for QC modal
  const [addModal, setAddModal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadIncomingLots = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const stores = await getMyStores()
      const overlay = loadQcRecords().reduce((acc, row) => {
        if (row.movementId || Number.isFinite(Number(row.id))) acc[String(row.movementId || row.id)] = row
        return acc
      }, {})
      const all = []
      for (const store of stores) {
        const data = await listStockMovements(store.id, { page: 1, pageSize: 100 })
        const rows = (data.results || []).filter((m) => (m.movement_type || 'RECEIPT_IN') === 'RECEIPT_IN')
        rows.forEach((m) => all.push(movementToRecord(m, store.id, overlay)))
      }
      setRecords(all)
    } catch (err) {
      setError(getErrorMessage(err) || 'Could not load incoming lots for QC.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadIncomingLots()
  }, [loadIncomingLots])

  const openSlipEditorForRecord = (rec) => {
    setSlipInitialData({
      to_department: 'PRODUCTION',
      product: rec.material_name || '',
      tr_no: rec.ar_no || '',
      batch_no: rec.batch_no || '',
      mfg_date: rec.mfg_date || '',
      exp_years: rec.expiry_date || '5',
      batch_size: rec.batch_size ? `${rec.batch_size} ${rec.batch_unit || ''}`.trim() : '',
      no_of_bottles: '',
      appearance_obs: rec.tests?.[0]?.observed || '',
      odor_obs: rec.tests?.[1]?.observed || '',
      wt_ml_obs: rec.tests?.[2]?.observed || '',
      viscosity_obs: rec.tests?.[3]?.observed || '',
      acid_value_obs: rec.tests?.[4]?.observed || '',
      peroxide_value_obs: rec.tests?.[5]?.observed || '',
      iodine_value_obs: rec.tests?.[6]?.observed || '',
      saponification_obs: rec.tests?.[7]?.observed || '',
      sign_qc: rec.chemist_name || '',
      received_qa: rec.qc_head_name || '',
      sign_qa: rec.qa_name || '',
      received_production: '',
    })
    setActiveTab('bulk_slip')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openTestReqForRecord = (rec) => {
    setTestReqInitialData({
      to_department: 'QUALITY CONTROL',
      product: rec.material_name || '',
      product_code: rec.material_code || '',
      batch_no: rec.batch_no || '',
      batch_size: rec.batch_size ? `${rec.batch_size} ${rec.batch_unit || ''}`.trim() : '',
      sampled_qty: '',
      mfg_date: rec.mfg_date || '',
      exp_years: rec.expiry_date || '5',
      date: new Date().toISOString().split('T')[0],
      tr_no: rec.ar_no || '',
      sign_production: rec.chemist_name || '',
      received_qc: '',
      test_appearance: true,
      test_odor: true,
      test_wt_ml: true,
      test_viscosity: true,
      test_acid_value: true,
      test_peroxide_value: true,
      test_iodine_value: true,
      test_saponification: true,
    })
    setActiveTab('test_request')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Add new QC record form state
  const [newForm, setNewForm] = useState({
    grn_no: '',
    material_name: '',
    material_code: '',
    batch_no: '',
    batch_size: '',
    batch_unit: 'KG',
    mfg_date: '',
    expiry_date: '',
    ar_no: '',
    supplier: '',
    received_date: new Date().toISOString().split('T')[0],
  })

  const persistRecords = useCallback((updated) => {
    setRecords(updated)
    saveQcRecords(updated)
  }, [])

  /* Filtered rows */
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          r.grn_no?.toLowerCase().includes(q) ||
          r.material_name?.toLowerCase().includes(q) ||
          r.material_code?.toLowerCase().includes(q) ||
          r.batch_no?.toLowerCase().includes(q) ||
          r.supplier?.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [records, statusFilter, search])

  const kpi = useMemo(() => ({
    total: records.length,
    pending: records.filter((r) => r.status === 'PENDING').length,
    approved: records.filter((r) => r.status === 'APPROVED').length,
    rejected: records.filter((r) => r.status === 'REJECTED').length,
  }), [records])

  /* Open QC check modal */
  const openQcModal = (rec) => {
    setSelectedRecord(JSON.parse(JSON.stringify(rec)))
    setError('')
  }

  /* Update test field */
  const updateTest = (idx, field, value) => {
    setSelectedRecord((prev) => {
      const tests = [...prev.tests]
      tests[idx] = { ...tests[idx], [field]: value }
      return { ...prev, tests }
    })
  }

  /* Add extra test row */
  const addTestRow = () => {
    setSelectedRecord((prev) => ({
      ...prev,
      tests: [...prev.tests, { key: `extra_${Date.now()}`, name: '', spec: '', observed: '', result: '' }],
    }))
  }

  /* Save QC decision */
  const saveDecision = async (decision) => {
    if (!selectedRecord) return
    if (!selectedRecord.storeId || !selectedRecord.movementId) {
      setError('This lot is not linked to a posted goods receipt, so it cannot be released to store.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const apiStatus = decision === 'APPROVED' ? 'APPROVED' : 'REJECTED'
      await setLotQualityStatus(selectedRecord.storeId, selectedRecord.movementId, {
        status: apiStatus,
        arNo: selectedRecord.ar_no || '',
        chemist: selectedRecord.chemist_name || '',
        remarks: selectedRecord.remarks || '',
      })
      const updated = {
        ...selectedRecord,
        decision,
        status: decision,
        release_date: decision === 'APPROVED' ? new Date().toISOString().split('T')[0] : '',
      }
      const newRecords = records.map((r) => r.id === updated.id ? updated : r)
      persistRecords(newRecords)
      setSelectedRecord(null)
      setSuccess(
        decision === 'APPROVED'
          ? `Material "${updated.material_name}" approved — now issue-eligible in store.`
          : `Material "${updated.material_name}" rejected — remains quarantined.`
      )
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /* Save without decision */
  const saveDraft = () => {
    if (!selectedRecord) return
    const newRecords = records.map((r) => r.id === selectedRecord.id ? selectedRecord : r)
    persistRecords(newRecords)
    setSelectedRecord(null)
    setSuccess('QC data saved as draft.')
    setTimeout(() => setSuccess(''), 3000)
  }

  /* Print Attachment 3 */
  const buildAtt3Data = (rec) => ({
    to_department: 'PRODUCTION',
    product_name: rec.material_name || '',
    tr_no: rec.ar_no || '',
    batch_no: rec.batch_no || '',
    mfg_date: rec.mfg_date || '',
    exp_date: '',
    exp_years: rec.expiry_date || '',
    batch_size: rec.batch_size ? `${rec.batch_size} ${rec.batch_unit || ''}`.trim() : '',
    no_of_bottles: '',
    // Map tests by index to the fixed fields
    appearance: {
      observed: rec.tests[0]?.observed || '',
      limit_low: rec.tests[0]?.spec ? rec.tests[0].spec.split(/[-–to]+/)[0]?.trim() : '',
      limit_high: rec.tests[0]?.spec ? rec.tests[0].spec.split(/[-–to]+/)[1]?.trim() : '',
      unit: '',
    },
    odor: {
      observed: rec.tests[1]?.observed || '',
      limit_low: rec.tests[1]?.spec ? rec.tests[1].spec.split(/[-–to]+/)[0]?.trim() : '',
      limit_high: '',
      unit: '',
    },
    wt_ml: {
      observed: rec.tests[2]?.observed || '',
      limit_low: rec.tests[2]?.spec ? rec.tests[2].spec.split(/[-–to]+/)[0]?.trim() : '',
      limit_high: rec.tests[2]?.spec ? rec.tests[2].spec.split(/[-–to]+/)[1]?.trim() : '',
      unit: 'gm/ml',
    },
    viscosity: {
      observed: rec.tests[3]?.observed || '',
      limit_low: rec.tests[3]?.spec ? rec.tests[3].spec.split(/[-–to]+/)[0]?.trim() : '',
      limit_high: rec.tests[3]?.spec ? rec.tests[3].spec.split(/[-–to]+/)[1]?.trim() : '',
      unit: 'mPa.S',
    },
    acid_value: {
      observed: rec.tests[4]?.observed || '',
      limit_low: rec.tests[4]?.spec ? rec.tests[4].spec.split(/[-–to]+/)[0]?.trim() : '',
      limit_high: rec.tests[4]?.spec ? rec.tests[4].spec.split(/[-–to]+/)[1]?.trim() : '',
      unit: '',
    },
    peroxide: {
      observed: rec.tests[5]?.observed || '',
      limit_low: rec.tests[5]?.spec ? rec.tests[5].spec.split(/[-–to]+/)[0]?.trim() : '',
      limit_high: rec.tests[5]?.spec ? rec.tests[5].spec.split(/[-–to]+/)[1]?.trim() : '',
      unit: '',
    },
    iodine: {
      observed: rec.tests[6]?.observed || '',
      limit_low: rec.tests[6]?.spec ? rec.tests[6].spec.split(/[-–to]+/)[0]?.trim() : '',
      limit_high: rec.tests[6]?.spec ? rec.tests[6].spec.split(/[-–to]+/)[1]?.trim() : '',
      unit: '',
    },
    saponification: {
      observed: rec.tests[7]?.observed || '',
      limit_low: rec.tests[7]?.spec ? rec.tests[7].spec.split(/[-–to]+/)[0]?.trim() : '',
      limit_high: rec.tests[7]?.spec ? rec.tests[7].spec.split(/[-–to]+/)[1]?.trim() : '',
      unit: '',
    },
    sign_qc: rec.chemist_name || '',
    date_qc: rec.test_date || '',
    received_qa: rec.qc_head_name || '',
    date_qa_recv: '',
    sign_qa: rec.qa_name || '',
    date_qa: rec.release_date || '',
    received_production: '',
    date_production: '',
  })

  const printAtt3 = async (rec) => {
    printBulkReleaseNote(buildAtt3Data(rec))
  }

  const downloadAtt3 = async (rec) => {
    try {
      await downloadBulkReleaseNotePdf(buildAtt3Data(rec))
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  /* Add new QC record */
  const handleAddRecord = () => {
    if (!newForm.material_name || !newForm.batch_no) {
      setError('Material name and batch number required.')
      return
    }
    const rec = {
      id: `mqc-${Date.now()}`,
      ...newForm,
      status: 'PENDING',
      tests: DEFAULT_TESTS.map((t) => ({ ...t })),
      remarks: '',
      decision: 'PENDING',
      chemist_name: '',
      qc_head_name: '',
      qa_name: '',
      release_date: '',
    }
    const updated = [rec, ...records]
    persistRecords(updated)
    setAddModal(false)
    setNewForm({
      grn_no: '', material_name: '', material_code: '', batch_no: '',
      batch_size: '', batch_unit: 'KG', mfg_date: '', expiry_date: '',
      ar_no: '', supplier: '', received_date: new Date().toISOString().split('T')[0],
    })
    setSuccess('New QC record added.')
    setTimeout(() => setSuccess(''), 3000)
  }

  return (
    <div className="inv">
      <HeroBanner
        eyebrow="Material Incoming QC"
        title="Quality Control — Material Check"
        subtitle="Posted GRNs stay in QC quarantine. Approve here to make them issue-eligible in store."
      />

      <PageHeader
        breadcrumbs={['Workspace', companyName, 'Quality Control']}
        title="Material Quality Control"
        subtitle="Purchase → GRN posted (quarantine) → QC Check → Approved → Store issue-eligible"
        pill="Incoming QC Gate"
        primaryAction={{ label: '🔄 Refresh', onClick: () => { loadIncomingLots(); setError('') } }}
      />

      {/* ── View Switcher Tabs ── */}
      <div className="qc-filter-group no-print" style={{ marginBottom: 18, borderBottom: '1px solid #e2e8f0', paddingBottom: 10 }}>
        <button
          type="button"
          className={`qc-filter${activeTab === 'inward_qc' ? ' active' : ''}`}
          onClick={() => setActiveTab('inward_qc')}
          style={{ fontSize: 13, padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <span>📦 Inward Material QC</span>
          <span style={{ background: activeTab === 'inward_qc' ? 'rgba(255,255,255,0.25)' : '#e2e8f0', padding: '1px 6px', borderRadius: 999, fontSize: 11 }}>
            {kpi.total}
          </span>
        </button>
        <button
          type="button"
          className={`qc-filter${activeTab === 'bulk_slip' ? ' active' : ''}`}
          onClick={() => setActiveTab('bulk_slip')}
          style={{ fontSize: 13, padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <span>📝 Bulk Release Slip (Attachment-3)</span>
          <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '1px 6px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
            BMR Style Editor
          </span>
        </button>
        <button
          type="button"
          className={`qc-filter${activeTab === 'test_request' ? ' active' : ''}`}
          onClick={() => setActiveTab('test_request')}
          style={{ fontSize: 13, padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <span>🧪 Test Request Slip (Attachment-2)</span>
          <span style={{ background: '#fef9c3', color: '#854d0e', padding: '1px 6px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
            BMR Style Editor
          </span>
        </button>
      </div>

      {activeTab === 'bulk_slip' ? (
        <div style={{ marginTop: 10 }}>
          {/* Quick Auto-fill Selector */}
          <div className="no-print" style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 10, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>📋 Auto-fill from Inward Lot:</span>
              <select
                className="company-input"
                style={{ minWidth: 260, fontSize: 12 }}
                onChange={(e) => {
                  const found = records.find((r) => String(r.id) === e.target.value);
                  if (found) openSlipEditorForRecord(found);
                }}
                defaultValue=""
              >
                <option value="" disabled>Choose material lot...</option>
                {records.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.material_name} ({r.batch_no || r.grn_no})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '5px 12px' }}
              onClick={() => setActiveTab('inward_qc')}
            >
              ← Back to Inward QC List
            </button>
          </div>

          <BulkReleaseSlipEditor initialData={slipInitialData} />
        </div>
      ) : activeTab === 'test_request' ? (
        <div style={{ marginTop: 10 }}>
          {/* Quick Auto-fill Selector for Test Request */}
          <div className="no-print" style={{ background: '#fefce8', border: '1px solid #fde047', borderRadius: 10, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#713f12' }}>🧪 Auto-fill from Inward Lot:</span>
              <select
                className="company-input"
                style={{ minWidth: 260, fontSize: 12 }}
                onChange={(e) => {
                  const found = records.find((r) => String(r.id) === e.target.value);
                  if (found) openTestReqForRecord(found);
                }}
                defaultValue=""
              >
                <option value="" disabled>Choose material lot...</option>
                {records.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.material_name} ({r.batch_no || r.grn_no})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '5px 12px' }}
              onClick={() => setActiveTab('inward_qc')}
            >
              ← Back to Inward QC List
            </button>
          </div>

          <TestRequestSlipEditor initialData={testReqInitialData} />
        </div>
      ) : (
        <>

      {/* Flow diagram */}
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 20px', margin: '0 0 18px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, fontWeight: 600, color: '#166534' }}>
        <span>📦 Purchase Order</span>
        <span style={{ color: '#94a3b8' }}>→</span>
        <span>🚚 GRN / Goods Receipt</span>
        <span style={{ color: '#94a3b8' }}>→</span>
        <span style={{ color: '#7c3aed' }}>🔬 QC Check (this page)</span>
        <span style={{ color: '#94a3b8' }}>→</span>
        <span>✅ Approved → Store</span>
        <span style={{ color: '#94a3b8' }}>|</span>
        <span style={{ color: '#dc2626' }}>❌ Rejected → Quarantine</span>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}
      {loading && <p style={{ color: '#64748b', fontSize: 13 }}>Loading posted inward lots…</p>}

      {/* KPI Cards */}
      <div className="ci-summary-grid" style={{ marginBottom: 18 }}>
        {[
          { label: 'Total Records', value: kpi.total, icon: '📋', color: '#2563eb', bg: '#eff6ff' },
          { label: 'Pending QC', value: kpi.pending, icon: '⏳', color: '#ca8a04', bg: '#fefce8' },
          { label: 'Approved', value: kpi.approved, icon: '✅', color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Rejected', value: kpi.rejected, icon: '❌', color: '#dc2626', bg: '#fef2f2' },
        ].map((k) => (
          <div className="ci-card" key={k.label}>
            <div className="ci-card-icon" style={{ background: k.bg, color: k.color }}>{k.icon}</div>
            <div className="ci-card-info">
              <span className="ci-card-label">{k.label}</span>
              <span className="ci-card-value" style={{ color: k.color }}>{k.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="company-input"
          style={{ maxWidth: 260 }}
          placeholder="Search material, GRN, batch…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="qc-filter-group">
          {QC_STATUSES.map((s) => (
            <button
              key={s}
              className={`qc-filter${statusFilter === s ? ' active' : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Records Table */}
      <div className="ci-table-wrap">
        <table className="ci-table">
          <thead>
            <tr>
              <th>GRN No.</th>
              <th>Material</th>
              <th>Code</th>
              <th>Batch No.</th>
              <th>Supplier</th>
              <th>Received</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>
                  {loading ? 'Loading…' : 'No posted inward lots found. Post a GRN first — it will appear here as Pending QC.'}
                </td>
              </tr>
            ) : filteredRecords.map((rec) => (
              <tr key={rec.id}>
                <td style={{ fontWeight: 700, fontSize: 12 }}>{rec.grn_no || '—'}</td>
                <td style={{ fontWeight: 600 }}>{rec.material_name}</td>
                <td style={{ fontSize: 11, color: '#64748b' }}>{rec.material_code}</td>
                <td style={{ fontSize: 12 }}>{rec.batch_no}</td>
                <td style={{ fontSize: 12 }}>{rec.supplier || '—'}</td>
                <td style={{ fontSize: 12 }}>{rec.received_date || '—'}</td>
                <td><StatusPill tone={statusTone(rec.status)}>{rec.status}</StatusPill></td>
                <td>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    <Button size="xs" variant="primary" onClick={() => openQcModal(rec)}>
                      🔬 QC Check
                    </Button>
                    <Button size="xs" variant="secondary" onClick={() => openSlipEditorForRecord(rec)}>
                      📝 Edit Slip (Att-3)
                    </Button>
                    <Button size="xs" variant="secondary" onClick={() => openTestReqForRecord(rec)}>
                      🧪 Test Req (Att-2)
                    </Button>
                    <Button size="xs" variant="secondary" onClick={() => printAtt3(rec)}>
                      🖨 Print ATT-3
                    </Button>
                    <Button size="xs" variant="secondary" onClick={() => downloadAtt3(rec)}>
                      ⬇️ PDF
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
        </>
      )}

      {/* ── QC Check Modal ── */}
      {selectedRecord && (
        <Modal title={`QC Check — ${selectedRecord.material_name}`} onClose={() => setSelectedRecord(null)} size="lg">
          <div style={{ padding: '0 2px' }}>
            {/* Material Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {[
                ['GRN No.', selectedRecord.grn_no],
                ['Batch No.', selectedRecord.batch_no],
                ['Batch Size', `${selectedRecord.batch_size} ${selectedRecord.batch_unit}`],
                ['Mfg. Date', selectedRecord.mfg_date],
                ['Expiry', selectedRecord.expiry_date],
                ['AR No.', selectedRecord.ar_no],
              ].map(([lbl, val]) => (
                <div key={lbl}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>{lbl}</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{val || '—'}</div>
                </div>
              ))}
            </div>

            {/* Test Date + AR No editable */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label className="inv-modal-field-label">Date of Testing</label>
                <input type="date" className="company-input" value={selectedRecord.test_date || ''}
                  onChange={(e) => setSelectedRecord((p) => ({ ...p, test_date: e.target.value }))} />
              </div>
              <div>
                <label className="inv-modal-field-label">AR No.</label>
                <input className="company-input" value={selectedRecord.ar_no || ''}
                  onChange={(e) => setSelectedRecord((p) => ({ ...p, ar_no: e.target.value }))} />
              </div>
            </div>

            {/* Test Parameters */}
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: '#1e293b' }}>🧪 Test Parameters &amp; Results</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  {['#', 'Parameter', 'Specification', 'Observed Value', 'Result'].map((h) => (
                    <th key={h} style={{ border: '1px solid #e2e8f0', padding: '5px 6px', fontSize: 11, fontWeight: 700, textAlign: 'center' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedRecord.tests.map((t, idx) => (
                  <tr key={t.key}>
                    <td style={{ border: '1px solid #e2e8f0', textAlign: 'center', fontSize: 11, padding: '3px 4px', width: 28 }}>{idx + 1}</td>
                    <td style={{ border: '1px solid #e2e8f0', padding: '2px 4px' }}>
                      <input className="company-input" style={{ fontSize: 11 }} value={t.name}
                        onChange={(e) => updateTest(idx, 'name', e.target.value)} />
                    </td>
                    <td style={{ border: '1px solid #e2e8f0', padding: '2px 4px' }}>
                      <input className="company-input" style={{ fontSize: 11 }} value={t.spec} placeholder="e.g. 5.5–7.5"
                        onChange={(e) => updateTest(idx, 'spec', e.target.value)} />
                    </td>
                    <td style={{ border: '1px solid #e2e8f0', padding: '2px 4px' }}>
                      <input className="company-input" style={{ fontSize: 11 }} value={t.observed}
                        onChange={(e) => updateTest(idx, 'observed', e.target.value)} />
                    </td>
                    <td style={{ border: '1px solid #e2e8f0', padding: '2px 4px' }}>
                      <select className="company-input" style={{ fontSize: 11 }} value={t.result}
                        onChange={(e) => updateTest(idx, 'result', e.target.value)}>
                        <option value="">—</option>
                        <option value="PASS">PASS</option>
                        <option value="FAIL">FAIL</option>
                        <option value="PENDING">PENDING</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button size="xs" variant="secondary" onClick={addTestRow}>+ Add Test Parameter</Button>

            {/* Remarks */}
            <div style={{ marginTop: 14 }}>
              <label className="inv-modal-field-label">Remarks</label>
              <textarea className="company-input" rows={2} style={{ resize: 'vertical' }}
                value={selectedRecord.remarks || ''}
                onChange={(e) => setSelectedRecord((p) => ({ ...p, remarks: e.target.value }))} />
            </div>

            {/* Signatories */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 14 }}>
              {[
                ['chemist_name', 'QC Chemist Name'],
                ['qc_head_name', 'QC Head / In-Charge'],
                ['qa_name', 'QA Officer / Manager'],
              ].map(([key, lbl]) => (
                <div key={key}>
                  <label className="inv-modal-field-label">{lbl}</label>
                  <input className="company-input" value={selectedRecord[key] || ''}
                    onChange={(e) => setSelectedRecord((p) => ({ ...p, [key]: e.target.value }))} />
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={saveDraft} disabled={busy}>💾 Save Draft</Button>
              <Button variant="secondary" onClick={() => printAtt3(selectedRecord)} disabled={busy}>🖨 Print ATT-3</Button>
              <Button
                variant="danger"
                onClick={() => saveDecision('REJECTED')}
                disabled={busy}
              >
                ❌ Reject
              </Button>
              <Button
                variant="primary"
                onClick={() => saveDecision('APPROVED')}
                disabled={busy}
              >
                ✅ Approve &amp; Release to Store
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Add New QC Record Modal ── */}
      {addModal && (
        <Modal title="Add New QC Record" onClose={() => setAddModal(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              ['grn_no', 'GRN No.', 'text', 'e.g. GRN-2026-005'],
              ['material_name', 'Material Name *', 'text', 'Full material name'],
              ['material_code', 'Material Code', 'text', 'e.g. RM-ALC-01'],
              ['batch_no', 'Batch No. *', 'text', 'e.g. GER-2026-0005'],
              ['batch_size', 'Batch Size', 'number', 'e.g. 500'],
              ['batch_unit', 'Unit', 'text', 'KG / L / GM'],
              ['ar_no', 'AR No.', 'text', 'Analytical Report No.'],
              ['supplier', 'Supplier', 'text', 'Supplier name'],
              ['mfg_date', 'Mfg. Date', 'date', ''],
              ['received_date', 'Received Date', 'date', ''],
            ].map(([key, label, type, placeholder]) => (
              <div key={key}>
                <label className="inv-modal-field-label">{label}</label>
                <input
                  type={type}
                  className="company-input"
                  placeholder={placeholder}
                  value={newForm[key] || ''}
                  onChange={(e) => setNewForm((p) => ({ ...p, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <label className="inv-modal-field-label">Expiry Date / Best Use Before</label>
            <input className="company-input" placeholder="e.g. 5 YEARS or 2029-12-31"
              value={newForm.expiry_date || ''}
              onChange={(e) => setNewForm((p) => ({ ...p, expiry_date: e.target.value }))} />
          </div>
          {error && <p style={{ color: '#dc2626', fontSize: 12, marginTop: 8 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setAddModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleAddRecord}>Add QC Record</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

