import { useEffect, useMemo, useState } from 'react'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import StatusPill from '../../components/StatusPill'
import Modal from '../inventory/components/Modal'
import { getErrorMessage } from '../../utils/errors'
import { operationsService } from '../operations/operationsService'
import { qualityService } from './qualityService'
import './Quality.css'

const TABS = [
  { key: 'qc', label: 'QC Review' },
  { key: 'qa', label: 'QA Release' },
  { key: 'trace', label: 'Batch Traceability' },
]

const QC_FILTERS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED']
const QA_FILTERS = ['ALL', 'PENDING', 'RELEASED', 'REJECTED']

const listData = (response) =>
  Array.isArray(response.data) ? response.data : response.data?.results || []

function qcTone(status) {
  if (status === 'APPROVED') return 'success'
  if (status === 'REJECTED') return 'danger'
  if (status === 'PENDING') return 'warning'
  return 'neutral'
}

function qaTone(status) {
  if (status === 'RELEASED') return 'success'
  if (status === 'REJECTED' || status === 'HOLD') return 'danger'
  if (status === 'PENDING') return 'warning'
  return 'neutral'
}

export default function Quality() {
  const [tab, setTab] = useState('qc')
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [qcFilter, setQcFilter] = useState('PENDING')
  const [qaFilter, setQaFilter] = useState('PENDING')

  // QC / QA decision modal
  const [decisionModal, setDecisionModal] = useState(null) // { type: 'qc' | 'qa', batch }
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving] = useState(false)

  // Traceability
  const [traceBatchId, setTraceBatchId] = useState('')
  const [trace, setTrace] = useState(null)
  const [traceLoading, setTraceLoading] = useState(false)
  const [traceError, setTraceError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await operationsService.getBatches()
      setBatches(listData(response))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const qcRows = useMemo(
    () =>
      batches.filter(
        (batch) => qcFilter === 'ALL' || batch.qc_status === qcFilter
      ),
    [batches, qcFilter]
  )

  const qaRows = useMemo(
    () =>
      batches.filter(
        (batch) => qaFilter === 'ALL' || batch.qa_status === qaFilter
      ),
    [batches, qaFilter]
  )

  const openDecision = (type, batch) => {
    setError('')
    setSuccess('')
    setRemarks('')
    setDecisionModal({ type, batch })
  }

  const closeDecision = () => {
    if (!saving) setDecisionModal(null)
  }

  const submitDecision = async (decision) => {
    if (!decisionModal) return
    setSaving(true)
    setError('')

    try {
      const { type, batch } = decisionModal

      if (type === 'qc') {
        await qualityService.qcDecision(batch.id, { decision, remarks })
        setSuccess(
          `Batch ${batch.number} QC ${decision === 'APPROVE' ? 'approved' : 'rejected'} (demo data only, not saved to the server).`
        )
      } else {
        await qualityService.qaDecision(batch.id, { decision, remarks })
        setSuccess(
          `Batch ${batch.number} QA ${decision === 'RELEASE' ? 'released' : 'put on hold'} (demo data only, not saved to the server).`
        )
      }

      setDecisionModal(null)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const loadTrace = async (batchId) => {
    setTraceBatchId(batchId)
    setTrace(null)
    setTraceError('')

    if (!batchId) return

    setTraceLoading(true)
    try {
      const response = await qualityService.getBatchTraceability(batchId)
      setTrace(response.data)
    } catch (err) {
      setTraceError(getErrorMessage(err))
    } finally {
      setTraceLoading(false)
    }
  }

  const selectedTraceBatch = batches.find(
    (batch) => String(batch.id) === String(traceBatchId)
  )

  return (
    <div className="inv">
      <div className="inv-header">
        <div>
          <h1>Quality Control &amp; QA</h1>
          <p>
            Review production batches, release finished goods, and trace a
            batch end-to-end.
          </p>
        </div>
      </div>

      <div className="inv-tabs">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={tab === item.key ? 'inv-tab active' : 'inv-tab'}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && !decisionModal && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      {tab === 'qc' && (
        <div className="inv-panel">
          <div className="inv-toolbar">
            <h3>Batches awaiting quality control</h3>
            <div className="qc-filter-group">
              {QC_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={qcFilter === f ? 'qc-filter active' : 'qc-filter'}
                  onClick={() => setQcFilter(f)}
                >
                  {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="inv-table-scroll">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Company</th>
                  <th>Product</th>
                  <th>Formula</th>
                  <th>Planned</th>
                  <th>Produced</th>
                  <th>QC Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {qcRows.map((batch) => (
                  <tr key={batch.id}>
                    <td className="cell-strong">{batch.number}</td>
                    <td>{batch.company_name}</td>
                    <td>{batch.product_name}</td>
                    <td>{batch.formula_name}</td>
                    <td>{batch.planned_quantity}</td>
                    <td>{batch.produced_quantity}</td>
                    <td>
                      <StatusPill tone={qcTone(batch.qc_status)}>
                        {batch.qc_status || 'PENDING'}
                      </StatusPill>
                    </td>
                    <td>
                      <Button
                        variant="secondary"
                        onClick={() => openDecision('qc', batch)}
                      >
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && qcRows.length === 0 && (
              <p className="inv-empty">No batches in this filter.</p>
            )}
          </div>
        </div>
      )}

      {tab === 'qa' && (
        <div className="inv-panel">
          <div className="inv-toolbar">
            <h3>Batches awaiting QA release</h3>
            <div className="qc-filter-group">
              {QA_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={qaFilter === f ? 'qc-filter active' : 'qc-filter'}
                  onClick={() => setQaFilter(f)}
                >
                  {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="inv-table-scroll">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Company</th>
                  <th>Product</th>
                  <th>QC Status</th>
                  <th>QA Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {qaRows.map((batch) => {
                  const qcCleared = batch.qc_status === 'APPROVED'
                  return (
                    <tr key={batch.id}>
                      <td className="cell-strong">{batch.number}</td>
                      <td>{batch.company_name}</td>
                      <td>{batch.product_name}</td>
                      <td>
                        <StatusPill tone={qcTone(batch.qc_status)}>
                          {batch.qc_status || 'PENDING'}
                        </StatusPill>
                      </td>
                      <td>
                        <StatusPill tone={qaTone(batch.qa_status)}>
                          {batch.qa_status || 'PENDING'}
                        </StatusPill>
                      </td>
                      <td>
                        <Button
                          variant="secondary"
                          disabled={!qcCleared}
                          title={qcCleared ? undefined : 'Awaiting QC approval'}
                          onClick={() => openDecision('qa', batch)}
                        >
                          Release
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!loading && qaRows.length === 0 && (
              <p className="inv-empty">No batches in this filter.</p>
            )}
          </div>
        </div>
      )}

      {tab === 'trace' && (
        <div className="inv-panel">
          <div className="inv-toolbar">
            <h3>Batch traceability</h3>
          </div>

          <div className="field qc-trace-picker">
            <label className="field-label">Select a batch</label>
            <select
              className="field-input"
              value={traceBatchId}
              onChange={(e) => loadTrace(e.target.value)}
            >
              <option value="">Select batch to trace</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.number} — {batch.company_name} — {batch.product_name}
                </option>
              ))}
            </select>
          </div>

          {traceLoading && <p className="inv-empty">Loading traceability…</p>}
          {traceError && <Alert type="error">{traceError}</Alert>}

          {!traceLoading && !traceError && selectedTraceBatch && (
            <div className="qc-trace-grid">
              <div className="qc-trace-block">
                <h4>Batch summary</h4>
                <dl>
                  <div>
                    <dt>Batch</dt>
                    <dd>{selectedTraceBatch.number}</dd>
                  </div>
                  <div>
                    <dt>Company</dt>
                    <dd>{selectedTraceBatch.company_name}</dd>
                  </div>
                  <div>
                    <dt>Product</dt>
                    <dd>{selectedTraceBatch.product_name}</dd>
                  </div>
                  <div>
                    <dt>Formula</dt>
                    <dd>{selectedTraceBatch.formula_name}</dd>
                  </div>
                  <div>
                    <dt>Order</dt>
                    <dd>{selectedTraceBatch.order_number || '—'}</dd>
                  </div>
                  <div>
                    <dt>Planned / Produced</dt>
                    <dd>
                      {selectedTraceBatch.planned_quantity} / {selectedTraceBatch.produced_quantity}
                    </dd>
                  </div>
                  <div>
                    <dt>QC / QA</dt>
                    <dd>
                      <StatusPill tone={qcTone(selectedTraceBatch.qc_status)}>
                        {selectedTraceBatch.qc_status || 'PENDING'}
                      </StatusPill>{' '}
                      <StatusPill tone={qaTone(selectedTraceBatch.qa_status)}>
                        {selectedTraceBatch.qa_status || 'PENDING'}
                      </StatusPill>
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="qc-trace-block">
                <h4>Material consumption</h4>
                {trace?.material_consumption?.length ? (
                  <table className="inv-table">
                    <thead>
                      <tr>
                        <th>Material</th>
                        <th>Lot</th>
                        <th>Qty</th>
                        <th>Issued</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trace.material_consumption.map((row, idx) => (
                        <tr key={idx}>
                          <td>{row.item_code} — {row.item_name}</td>
                          <td>{row.lot_number}</td>
                          <td>{row.quantity} {row.uom}</td>
                          <td>{row.issued_at ? new Date(row.issued_at).toLocaleString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="inv-empty">
                    No consumption data returned by the backend yet.
                  </p>
                )}
              </div>

              <div className="qc-trace-block">
                <h4>QC / QA history</h4>
                <ul className="qc-timeline">
                  {[...(trace?.qc_history || []), ...(trace?.qa_history || [])].length ? (
                    [...(trace?.qc_history || []), ...(trace?.qa_history || [])].map(
                      (event, idx) => (
                        <li key={idx}>
                          <strong>{event.decision}</strong> — {event.remarks || 'No remarks'}
                          <span>{event.by} · {event.at ? new Date(event.at).toLocaleString() : ''}</span>
                        </li>
                      )
                    )
                  ) : (
                    <p className="inv-empty">No QC/QA decisions recorded yet.</p>
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {decisionModal && (
        <Modal
          title={
            decisionModal.type === 'qc'
              ? `QC review — ${decisionModal.batch.number}`
              : `QA release — ${decisionModal.batch.number}`
          }
          onClose={closeDecision}
          footer={
            <>
              <Button variant="secondary" onClick={closeDecision} disabled={saving}>
                Cancel
              </Button>

              {decisionModal.type === 'qc' ? (
                <>
                  <Button
                    variant="secondary"
                    loading={saving}
                    onClick={() => submitDecision('REJECT')}
                  >
                    Reject
                  </Button>
                  <Button loading={saving} onClick={() => submitDecision('APPROVE')}>
                    Approve QC
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    loading={saving}
                    onClick={() => submitDecision('HOLD')}
                  >
                    Hold
                  </Button>
                  <Button loading={saving} onClick={() => submitDecision('RELEASE')}>
                    Release QA
                  </Button>
                </>
              )}
            </>
          }
        >
          {error && <Alert type="error">{error}</Alert>}

          <div className="qc-trace-block" style={{ marginBottom: 16 }}>
            <dl>
              <div>
                <dt>Company</dt>
                <dd>{decisionModal.batch.company_name}</dd>
              </div>
              <div>
                <dt>Product</dt>
                <dd>{decisionModal.batch.product_name}</dd>
              </div>
              <div>
                <dt>Produced quantity</dt>
                <dd>{decisionModal.batch.produced_quantity}</dd>
              </div>
            </dl>
          </div>

          <div className="field field-full">
            <label className="field-label">Remarks</label>
            <textarea
              className="field-input"
              rows={4}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Add QC/QA remarks (visible in batch traceability)"
            />
          </div>
        </Modal>
      )}
    </div>
  )
}