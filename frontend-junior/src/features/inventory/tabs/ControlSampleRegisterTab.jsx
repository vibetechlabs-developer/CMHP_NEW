import { useEffect, useState, useMemo, useCallback } from 'react'
import Button from '../../../components/Button'
import Alert from '../../../components/Alert'
import Modal from '../components/Modal'
import { getErrorMessage } from '../../../utils/errors'
import useSelectedCompany from '../../../hooks/useSelectedCompany'
import { controlSamplesService } from '../controlSamplesService'
import './StockTab.css'
import './CommonInventory.css'

export default function ControlSampleRegisterTab() {
  const { companies, companiesReady, companiesError, companyId, realCompanyId, setCompanyId } = useSelectedCompany()
  const activeCompanyId = companyId || realCompanyId
  const [samples, setSamples] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Modals
  const [logModalOpen, setLogModalOpen] = useState(false)
  const [disposeModalTarget, setDisposeModalTarget] = useState(null)
  const [viewDetailsTarget, setViewDetailsTarget] = useState(null)

  // New Sample Form State
  const [newForm, setNewForm] = useState(() => ({
    batchNo: '',
    productName: '',
    productCode: '',
    packSize: '30 ml',
    sampleQty: '5',
    unit: 'Bottles',
    storageLocation: 'Control Room Rack A-01',
    arNo: '',
    mfgDate: new Date().toISOString().split('T')[0],
    expDate: new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    testedBy: 'QC Chemist In-Charge',
    notes: 'Schedule M retention sample. Stored in original secondary pack.',
    deductFg: false,
  }))

  // Load samples
  const fetchSamples = useCallback(async () => {
    if (!companiesReady) return
    if (!activeCompanyId) {
      setSamples([])
      setLoading(false)
      setError(companies.length === 0 ? 'No company is linked to your account.' : '')
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await controlSamplesService.listSamples({
        companyId: activeCompanyId,
        search,
        status: statusFilter,
      })
      setSamples(data)
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to load control samples.')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, activeCompanyId, companiesReady, companies.length])

  useEffect(() => {
    fetchSamples()
  }, [fetchSamples])

  // Summary Metrics
  const metrics = useMemo(() => {
    return {
      total: samples.length,
      active: samples.filter((s) => s.status === 'ACTIVE').length,
      dueDisposal: samples.filter((s) => s.status === 'DUE_DISPOSAL').length,
      disposed: samples.filter((s) => s.status === 'DISPOSED').length,
      totalUnits: samples.reduce((acc, s) => acc + (Number(s.sampleQty) || 0), 0),
    }
  }, [samples])

  // Handle Log Submit
  const handleSaveSample = async (e) => {
    e.preventDefault()
    if (!activeCompanyId) {
      setError('Select a company first.')
      return
    }
    if (!newForm.batchNo || !newForm.productName) {
      setError('Please provide Batch No. and Product Name.')
      return
    }
    try {
      await controlSamplesService.logSample({
        ...newForm,
        companyId: activeCompanyId,
        mfgDate: typeof newForm.mfgDate === 'function' ? newForm.mfgDate() : newForm.mfgDate,
        expDate: typeof newForm.expDate === 'function' ? newForm.expDate() : newForm.expDate,
      })
      setLogModalOpen(false)
      setNotice(`Control sample for Batch ${newForm.batchNo} successfully registered!`)
      fetchSamples()
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to log sample.')
    }
  }

  // Handle Disposal Submit
  const handleConfirmDisposal = async () => {
    if (!disposeModalTarget || !activeCompanyId) return
    try {
      await controlSamplesService.disposeSample(disposeModalTarget.id, {
        companyId: activeCompanyId,
        disposedBy: 'QA Manager',
        remarks: 'Disposed per GMP hazardous waste disposal guidelines upon expiration of shelf life.',
      })
      setDisposeModalTarget(null)
      setNotice(`Sample for Batch ${disposeModalTarget.batchNo} marked as Disposed.`)
      fetchSamples()
    } catch (err) {
      setError(err?.message || 'Failed to record disposal.')
    }
  }

  const statusBadge = (st) => {
    switch (st) {
      case 'ACTIVE':
        return (
          <span style={{ background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: 4, fontWeight: 700, fontSize: 11 }}>
            ✓ In Control Room
          </span>
        )
      case 'DUE_DISPOSAL':
        return (
          <span style={{ background: '#fef3c7', color: '#92400e', padding: '3px 8px', borderRadius: 4, fontWeight: 700, fontSize: 11 }}>
            ⚠️ Due For Disposal
          </span>
        )
      case 'DISPOSED':
        return (
          <span style={{ background: '#f1f5f9', color: '#64748b', padding: '3px 8px', borderRadius: 4, fontWeight: 700, fontSize: 11, textDecoration: 'line-through' }}>
            Disposed
          </span>
        )
      default:
        return <span>{st}</span>
    }
  }

  return (
    <div className="ci-container stocks-container">
      {/* 1. Header & Quick Actions */}
      <div className="ci-header stocks-header">
        <div className="ci-header-titles stocks-header-titles">
          <h2>Control Sample Register</h2>
          <p>Pharmaceutical retention sample library per Schedule M compliance (Shelf life + 1 year).</p>
        </div>

        <div className="ci-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button size="sm" variant="secondary" onClick={fetchSamples} disabled={loading}>
            {loading ? 'Refreshing...' : '🔄 Refresh'}
          </Button>
          <Button size="sm" variant="primary" onClick={() => setLogModalOpen(true)}>
            + Log Retention Sample
          </Button>
        </div>
      </div>

      {notice && (
        <Alert type="success" onClose={() => setNotice('')} style={{ marginBottom: 14 }}>
          {notice}
        </Alert>
      )}
      {companiesError && (
        <Alert type="error" style={{ marginBottom: 14 }}>
          Could not load your companies: {companiesError}
        </Alert>
      )}
      {error && (
        <Alert type="error" onClose={() => setError('')} style={{ marginBottom: 14 }}>
          {error}
        </Alert>
      )}

      {/* 2. Top Summary KPI Cards (Horizontal 4-column Grid matching StockTab) */}
      <div className="ci-summary-grid stocks-summary-grid">
        <div className="ci-card stocks-card">
          <div className="ci-card-icon stocks-card-icon" style={{ background: '#ecfdf5', color: '#16a34a' }}>
            🧪
          </div>
          <div className="ci-card-info stocks-card-info">
            <span className="ci-card-label stocks-card-label">Active Control Samples</span>
            <span className="ci-card-value stocks-card-value" style={{ color: '#16a34a' }}>{metrics.active}</span>
            <span className="ci-card-subtext stocks-card-subtext">Retained in Control Room library</span>
          </div>
        </div>

        <div className="ci-card stocks-card">
          <div className="ci-card-icon stocks-card-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
            📦
          </div>
          <div className="ci-card-info stocks-card-info">
            <span className="ci-card-label stocks-card-label">Total Retained Units</span>
            <span className="ci-card-value stocks-card-value">{metrics.totalUnits} <span style={{ fontSize: 13, color: '#64748b' }}>bottles</span></span>
            <span className="ci-card-subtext stocks-card-subtext">Across {metrics.total} recorded batches</span>
          </div>
        </div>

        <div className="ci-card stocks-card">
          <div className="ci-card-icon stocks-card-icon" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
            📜
          </div>
          <div className="ci-card-info stocks-card-info">
            <span className="ci-card-label stocks-card-label">Retention Standard</span>
            <span className="ci-card-value stocks-card-value" style={{ fontSize: 18, color: '#7c3aed' }}>Schedule M</span>
            <span className="ci-card-subtext stocks-card-subtext">Shelf life + 1 year storage protocol</span>
          </div>
        </div>

        <div className="ci-card stocks-card">
          <div className="ci-card-icon stocks-card-icon" style={{ background: metrics.dueDisposal > 0 ? '#fffbeb' : '#f8fafc', color: metrics.dueDisposal > 0 ? '#d97706' : '#64748b' }}>
            ⚠️
          </div>
          <div className="ci-card-info stocks-card-info">
            <span className="ci-card-label stocks-card-label">Due for Disposal</span>
            <span className="ci-card-value stocks-card-value" style={{ color: metrics.dueDisposal > 0 ? '#d97706' : '#64748b' }}>
              {metrics.dueDisposal}
            </span>
            <span className="ci-card-subtext stocks-card-subtext">Expired samples ready for destruction</span>
          </div>
        </div>
      </div>

      {/* 3. Filters Toolbar */}
      <div
        className="ci-filters stocks-filter-card"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: '#ffffff',
          borderRadius: 10,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          marginBottom: 16,
          flexWrap: 'nowrap',
        }}
      >
        {/* Inner group — keeps search + dropdown + clear button on ONE line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, flexWrap: 'nowrap', minWidth: 0 }}>
          {companiesReady && companies.length >= 1 && (
            <select
              className="company-input"
              aria-label="Select company"
              value={activeCompanyId || ''}
              onChange={(e) => setCompanyId(Number(e.target.value))}
              style={{ minWidth: 180, fontWeight: 600 }}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.legal_name || c.name || c.code}
                </option>
              ))}
            </select>
          )}
          <input
            type="text"
            className="ci-input stocks-search-input"
            placeholder="Search Batch No, Product Name, AR No, Storage Rack..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 0, padding: '7px 12px', fontSize: 13, borderRadius: 6, border: '1px solid #cbd5e1' }}
          />

          <select
            className="ci-select stocks-select-input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ flexShrink: 0, width: 190, padding: '7px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #cbd5e1' }}
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active in Control Room</option>
            <option value="DUE_DISPOSAL">Due for Disposal</option>
            <option value="DISPOSED">Disposed</option>
          </select>

          {(search || statusFilter !== 'ALL') && (
            <Button size="sm" variant="secondary" onClick={() => { setSearch(''); setStatusFilter('ALL') }}>
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      {/* 4. Data Table */}
      <div className="ci-table-wrap">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading Control Sample Register...</div>
        ) : samples.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>No control sample records found matching criteria.</div>
        ) : (
          <table className="ci-table">
            <thead>
              <tr>
                <th style={{ width: 120 }}>Batch No</th>
                <th>Product Details</th>
                <th style={{ width: 110, textAlign: 'right' }}>Sample Qty</th>
                <th style={{ width: 130 }}>AR No.</th>
                <th style={{ width: 110 }}>Mfg Date</th>
                <th style={{ width: 110 }}>Expiry Date</th>
                <th>Control Room Location</th>
                <th style={{ width: 150 }}>Status</th>
                <th className="ci-actions-col" style={{ minWidth: 150, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {samples.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong style={{ color: '#0f172a' }}>{row.batchNo}</strong>
                  </td>
                  <td>
                    <div><strong>{row.productName}</strong></div>
                    <div style={{ fontSize: 11.5, color: '#64748b' }}>{row.productCode} · {row.packSize}</div>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#7c3aed' }}>
                    {row.sampleQty} {row.unit}
                  </td>
                  <td>
                    <span style={{ fontSize: 11.5, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>
                      {row.arNo || '—'}
                    </span>
                  </td>
                  <td>{row.mfgDate}</td>
                  <td>
                    <span style={{ color: row.status === 'DUE_DISPOSAL' ? '#b91c1c' : '#334155', fontWeight: row.status === 'DUE_DISPOSAL' ? 700 : 400 }}>
                      {row.expDate}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: 12, color: '#334155' }}>📍 {row.storageLocation}</span>
                  </td>
                  <td>{statusBadge(row.status)}</td>
                  <td className="ci-actions-col">
                    <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                      <Button size="sm" variant="secondary" onClick={() => setViewDetailsTarget(row)}>
                        View
                      </Button>
                      {row.status !== 'DISPOSED' && (
                        <Button size="sm" variant="secondary" onClick={() => setDisposeModalTarget(row)}>
                          Dispose
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* LOG RETENTION SAMPLE MODAL */}
      {logModalOpen && (
        <Modal
          isOpen={logModalOpen}
          onClose={() => setLogModalOpen(false)}
          title="Register New Batch Retention / Control Sample (Schedule M)"
        >
          <form onSubmit={handleSaveSample} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Batch No *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AH2602"
                  value={newForm.batchNo}
                  onChange={(e) => setNewForm({ ...newForm, batchNo: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Product Code</label>
                <input
                  type="text"
                  placeholder="e.g. FLX-01"
                  value={newForm.productCode}
                  onChange={(e) => setNewForm({ ...newForm, productCode: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Product Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Flexicare Drops"
                value={newForm.productName}
                onChange={(e) => setNewForm({ ...newForm, productName: e.target.value })}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Sample Quantity *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={newForm.sampleQty}
                  onChange={(e) => setNewForm({ ...newForm, sampleQty: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Pack Size</label>
                <input
                  type="text"
                  value={newForm.packSize}
                  onChange={(e) => setNewForm({ ...newForm, packSize: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>AR Number</label>
                <input
                  type="text"
                  placeholder="e.g. AR-2026-0412"
                  value={newForm.arNo}
                  onChange={(e) => setNewForm({ ...newForm, arNo: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Mfg Date</label>
                <input
                  type="date"
                  value={typeof newForm.mfgDate === 'function' ? newForm.mfgDate() : newForm.mfgDate}
                  onChange={(e) => setNewForm({ ...newForm, mfgDate: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Expiry Date</label>
                <input
                  type="date"
                  value={typeof newForm.expDate === 'function' ? newForm.expDate() : newForm.expDate}
                  onChange={(e) => setNewForm({ ...newForm, expDate: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Control Room Storage Location *</label>
              <input
                type="text"
                required
                placeholder="e.g. Control Room Rack A - Shelf 2"
                value={newForm.storageLocation}
                onChange={(e) => setNewForm({ ...newForm, storageLocation: e.target.value })}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Notes / Inspection Protocol</label>
              <textarea
                rows="2"
                value={newForm.notes}
                onChange={(e) => setNewForm({ ...newForm, notes: e.target.value })}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Button variant="secondary" type="button" onClick={() => setLogModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                ✓ Register Sample
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* DISPOSE CONFIRMATION MODAL */}
      {disposeModalTarget && (
        <Modal
          isOpen={Boolean(disposeModalTarget)}
          onClose={() => setDisposeModalTarget(null)}
          title={`Confirm Destruction / Disposal of Batch ${disposeModalTarget.batchNo} Samples`}
        >
          <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
            <p>
              Are you sure you want to mark the <strong>{disposeModalTarget.sampleQty} bottles</strong> of{' '}
              <strong>{disposeModalTarget.productName}</strong> (Batch: {disposeModalTarget.batchNo}) as{' '}
              <strong>DISPOSED</strong>?
            </p>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: 6, marginTop: 10 }}>
              <p style={{ margin: 0, color: '#991b1b', fontSize: 12 }}>
                ⚠️ This records permanent compliance destruction in the audit trail per SOP hazardous waste protocols.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <Button variant="secondary" onClick={() => setDisposeModalTarget(null)}>
                Cancel
              </Button>
              <Button variant="primary" style={{ background: '#b91c1c', borderColor: '#b91c1c' }} onClick={handleConfirmDisposal}>
                Confirm Disposal
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* VIEW DETAILS MODAL */}
      {viewDetailsTarget && (
        <Modal
          isOpen={Boolean(viewDetailsTarget)}
          onClose={() => setViewDetailsTarget(null)}
          title={`Control Sample Record — Batch ${viewDetailsTarget.batchNo}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div><strong>Product:</strong> {viewDetailsTarget.productName}</div>
              <div><strong>Product Code:</strong> {viewDetailsTarget.productCode}</div>
              <div><strong>Batch No:</strong> {viewDetailsTarget.batchNo}</div>
              <div><strong>Pack Size:</strong> {viewDetailsTarget.packSize}</div>
              <div><strong>Retained Qty:</strong> {viewDetailsTarget.sampleQty} {viewDetailsTarget.unit}</div>
              <div><strong>AR No:</strong> {viewDetailsTarget.arNo}</div>
              <div><strong>Mfg Date:</strong> {viewDetailsTarget.mfgDate}</div>
              <div><strong>Exp Date:</strong> {viewDetailsTarget.expDate}</div>
              <div><strong>Storage Location:</strong> {viewDetailsTarget.storageLocation}</div>
              <div><strong>Tested By:</strong> {viewDetailsTarget.testedBy}</div>
              <div><strong>Logged At:</strong> {new Date(viewDetailsTarget.loggedAt).toLocaleString()}</div>
              <div><strong>Status:</strong> {viewDetailsTarget.status}</div>
            </div>
            {viewDetailsTarget.notes && (
              <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: 6, marginTop: 6 }}>
                <strong>Notes:</strong> {viewDetailsTarget.notes}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <Button variant="secondary" onClick={() => setViewDetailsTarget(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
