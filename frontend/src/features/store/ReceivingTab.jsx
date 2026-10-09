import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Spinner, { LoadingState } from '../../components/Spinner'
import Modal from '../inventory/components/Modal'
import { confirmAction } from '../../components/ConfirmProvider'
import { getErrorMessage } from '../../utils/errors'
import { getStorePermissionCodes } from '../operations/storePreparationService'
import './ReceivingTab.css'
import {
  cancelGoodsReceipt,
  createGoodsReceipt,
  getGoodsReceipt,
  listEligiblePurchaseOrders,
  listGoodsReceipts,
  postGoodsReceipt,
  updateGoodsReceipt,
} from './receivingService'

const PAGE_SIZE = 20

function toLocalDateTimeInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// Reachable with `receiptId` for the detail/edit/post/cancel screen, or
// without it for the list - mirrors StoreMaterialsWorkspace's own
// manual-pathname-matching convention (see MATERIAL_DETAIL_PATTERN there).
export default function ReceivingTab({ storeId, receiptId }) {
  const [codes, setCodes] = useState(null)
  const [codesError, setCodesError] = useState('')

  useEffect(() => {
    setCodes(null)
    setCodesError('')
    getStorePermissionCodes(storeId)
      .then(setCodes)
      .catch((err) => setCodesError(getErrorMessage(err)))
  }, [storeId])

  if (codesError) return <Alert type="error">{codesError}</Alert>
  if (codes === null) return <LoadingState label="Checking your access…" compact />
  if (!codes.includes('receiving.view')) {
    return (
      <Alert type="error">
        Access unavailable. You cannot view goods receipts for this store. Ask an administrator for access.
      </Alert>
    )
  }

  return receiptId ? (
    <ReceiptDetail storeId={storeId} receiptId={receiptId} codes={codes} />
  ) : (
    <ReceivingList storeId={storeId} codes={codes} />
  )
}

function ReceivingList({ storeId, codes }) {
  const navigate = useNavigate()
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ count: 0, results: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const requestRef = useRef(0)

  const load = async () => {
    const id = ++requestRef.current
    setLoading(true)
    setError('')
    try {
      const result = await listGoodsReceipts(storeId, { status, page, pageSize: PAGE_SIZE })
      if (requestRef.current !== id) return
      setData(result)
    } catch (err) {
      if (requestRef.current !== id) return
      setError(getErrorMessage(err))
    } finally {
      if (requestRef.current === id) setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, status, page])

  useEffect(() => setPage(1), [status, storeId])

  const totalPages = Math.max(1, Math.ceil(data.count / PAGE_SIZE))

  return (
    <div className="inv-panel">
      <div className="inv-toolbar">
        <div>
          <h3 style={{ margin: 0 }}>Goods receipts</h3>
          <p className="field-muted" style={{ margin: '4px 0 0' }}>
            {data.count} receipt{data.count === 1 ? '' : 's'} in this store. Only a posted receipt affects the
            recorded-receipt register.
          </p>
        </div>
        {codes.includes('receiving.create') && <Button onClick={() => setCreating(true)}>+ New receipt</Button>}
      </div>

      <div className="inv-toolbar">
        <select className="field-input" style={{ maxWidth: 200 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="POSTED">Posted</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {error && <Alert type="error">{error} <button type="button" className="table-edit" onClick={load}>Retry</button></Alert>}

      <div className="inv-table-scroll">
        <table className="inv-table">
          <thead>
            <tr><th>Reference</th><th>Company</th><th>Source PO</th><th>Arrived</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24 }}><Spinner tone="brand" label="Loading…" /></td></tr>
            ) : data.results.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24 }}>No goods receipts found.</td></tr>
            ) : (
              data.results.map((r) => (
                <tr key={r.id}>
                  <td className="cell-strong">{r.reference}</td>
                  <td>{r.company_code}</td>
                  <td>{r.source_purchase_order_reference}</td>
                  <td>{(r.arrived_at || '').slice(0, 10) || '—'}</td>
                  <td>{r.status}</td>
                  <td>
                    <button type="button" className="table-edit" onClick={() => navigate(`/inventory/receiving/${r.id}`)}>
                      {r.status === 'DRAFT' ? 'Open draft' : 'View'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="inv-toolbar">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Previous</Button>
          <span>Page {page} of {totalPages}</span>
          <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</Button>
        </div>
      )}

      {creating && (
        <NewReceiptModal
          storeId={storeId}
          onClose={() => setCreating(false)}
          onCreated={(receipt) => {
            setCreating(false)
            navigate(`/inventory/receiving/${receipt.id}`)
          }}
        />
      )}
    </div>
  )
}

function NewReceiptModal({ storeId, onClose, onCreated }) {
  const [pos, setPos] = useState({ loading: true, results: [], error: '' })
  const [selectedPo, setSelectedPo] = useState(null)
  const [arrivedAt, setArrivedAt] = useState(() => toLocalDateTimeInput(new Date().toISOString()))
  const [deliveryNoteReference, setDeliveryNoteReference] = useState('')
  const [notes, setNotes] = useState('')
  const [quantities, setQuantities] = useState({}) // {source_po_line_id: {received_quantity, lot_reference}}
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const savingRef = useRef(false)
  // Generated once per modal instance, reused on every retry of the same
  // submission - a double-click or a network retry of the same create
  // call is then a safe no-op server-side (see apps.receiving.services.
  // create_goods_receipt's idempotency_key handling) instead of creating
  // two receipts for one delivery.
  const idempotencyKeyRef = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`)

  useEffect(() => {
    listEligiblePurchaseOrders(storeId, { pageSize: 50 })
      .then((data) => setPos({ loading: false, results: data.results, error: '' }))
      .catch((err) => setPos({ loading: false, results: [], error: getErrorMessage(err) }))
  }, [storeId])

  const selectPo = (po) => {
    setSelectedPo(po)
    setQuantities({})
  }

  const setLineValue = (lineId, field, value) => {
    setQuantities((prev) => ({ ...prev, [lineId]: { ...prev[lineId], [field]: value } }))
  }

  const create = async () => {
    if (savingRef.current || !selectedPo) return
    savingRef.current = true
    const lines = selectedPo.delivery_progress
      .map((line) => {
        const entry = quantities[line.source_po_line_id]
        const qty = entry?.received_quantity
        if (!qty || Number(qty) <= 0) return null
        return {
          source_po_line_id: line.source_po_line_id,
          received_quantity: qty,
          lot_reference: entry?.lot_reference || '',
        }
      })
      .filter(Boolean)

    setSaving(true)
    setError('')
    try {
      const receipt = await createGoodsReceipt(storeId, {
        source_purchase_order_id: selectedPo.id,
        arrived_at: new Date(arrivedAt).toISOString(),
        delivery_note_reference: deliveryNoteReference.trim(),
        notes: notes.trim(),
        idempotency_key: idempotencyKeyRef.current,
        lines,
      })
      onCreated(receipt)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <Modal
      title="New goods receipt"
      size="lg"
      onClose={saving ? undefined : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={create} disabled={saving || !selectedPo || !arrivedAt} loading={saving}>
            Create draft
          </Button>
        </>
      }
    >
      {error && <Alert type="error">{error}</Alert>}

      {!selectedPo ? (
        <>
          <p className="field-muted">Pick the purchase order this delivery is against.</p>
          {pos.error && <Alert type="error">{pos.error}</Alert>}
          {pos.loading ? (
            <LoadingState label="Loading eligible purchase orders…" compact />
          ) : pos.results.length === 0 ? (
            <p className="field-muted">No eligible purchase order found - it must be ISSUED and visible to you.</p>
          ) : (
            <div className="inv-table-scroll">
              <table className="inv-table">
                <thead><tr><th>Reference</th><th>Company</th><th>Supplier</th><th>Expected delivery</th><th></th></tr></thead>
                <tbody>
                  {pos.results.map((po) => (
                    <tr key={po.id}>
                      <td className="cell-strong">{po.reference}</td>
                      <td>{po.company_code}</td>
                      <td>{po.supplier_code}</td>
                      <td>{po.expected_delivery_date || '—'}</td>
                      <td><button type="button" className="table-edit" onClick={() => selectPo(po)}>Select</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="field-muted">
            <strong>{selectedPo.reference}</strong> · {selectedPo.company_code} · {selectedPo.supplier_code}{' '}
            <button type="button" className="table-edit" onClick={() => setSelectedPo(null)}>Change purchase order</button>
          </p>
          <div className="inv-form-grid">
            <div className="field">
              <label className="field-label" htmlFor="recv-arrived">Arrived at *</label>
              <input id="recv-arrived" className="field-input" type="datetime-local" value={arrivedAt} onChange={(e) => setArrivedAt(e.target.value)} required />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="recv-delivery-note">Delivery note reference</label>
              <input id="recv-delivery-note" className="field-input" value={deliveryNoteReference} onChange={(e) => setDeliveryNoteReference(e.target.value)} maxLength={100} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="recv-notes">Notes</label>
              <input id="recv-notes" className="field-input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
            </div>
          </div>

          <div className="inv-section-label">Lines - enter the actual received quantity for each line you are recording now; leave the rest blank</div>
          <div className="inv-table-scroll">
            <table className="inv-table">
              <thead>
                <tr><th>Material</th><th>Unit</th><th>Ordered</th><th>Remaining</th><th>Received now</th><th>Lot reference</th></tr>
              </thead>
              <tbody>
                {selectedPo.delivery_progress.map((line) => (
                  <tr key={line.source_po_line_id}>
                    <td>{line.material_code_snapshot} · {line.material_name_snapshot}</td>
                    <td>{line.unit_code_snapshot}</td>
                    <td style={{ textAlign: 'right' }}>{line.ordered_quantity}</td>
                    <td style={{ textAlign: 'right' }}>{line.remaining_quantity}</td>
                    <td>
                      <input
                        className="field-input"
                        type="number"
                        step="any"
                        min="0"
                        value={quantities[line.source_po_line_id]?.received_quantity || ''}
                        onChange={(e) => setLineValue(line.source_po_line_id, 'received_quantity', e.target.value)}
                        disabled={line.delivery_status === 'FULLY_RECEIVED'}
                        placeholder={line.delivery_status === 'FULLY_RECEIVED' ? 'Fully received' : '0'}
                      />
                    </td>
                    <td>
                      <input
                        className="field-input"
                        value={quantities[line.source_po_line_id]?.lot_reference || ''}
                        onChange={(e) => setLineValue(line.source_po_line_id, 'lot_reference', e.target.value)}
                        maxLength={100}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="field-muted">
            Over-receipt beyond what remains outstanding is rejected when you post - verify quantities carefully.
            A line left blank here can still be added later while the receipt is a draft.
          </p>
        </>
      )}
    </Modal>
  )
}

function ReceiptDetail({ storeId, receiptId, codes }) {
  const navigate = useNavigate()
  const [receipt, setReceipt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [posting, setPosting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [showCancelForm, setShowCancelForm] = useState(false)
  const [notice, setNotice] = useState('')
  const savingRef = useRef(false)
  const postingRef = useRef(false)
  const cancellingRef = useRef(false)

  const load = async () => {
    setLoading(true)
    setError('')
    setConflict(false)
    try {
      const data = await getGoodsReceipt(storeId, receiptId)
      setReceipt(data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, receiptId])

  const startEdit = () => {
    setForm({
      arrived_at: toLocalDateTimeInput(receipt.arrived_at),
      delivery_note_reference: receipt.delivery_note_reference,
      notes: receipt.notes,
      lines: receipt.lines.map((l) => ({
        source_po_line_id: l.source_po_line_id,
        received_quantity: l.received_quantity,
        lot_reference: l.lot_reference || '',
        material_code: l.material_code,
        material_name: l.material_name,
        unit_code: l.unit_code,
      })),
    })
    setEditing(true)
    setNotice('')
  }

  const saveEdit = async () => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError('')
    setConflict(false)
    try {
      const updated = await updateGoodsReceipt(storeId, receiptId, {
        expected_version: receipt.version,
        arrived_at: new Date(form.arrived_at).toISOString(),
        delivery_note_reference: form.delivery_note_reference.trim(),
        notes: form.notes.trim(),
        lines: form.lines.map((l) => ({
          source_po_line_id: l.source_po_line_id,
          received_quantity: l.received_quantity,
          lot_reference: l.lot_reference,
        })),
      })
      setReceipt(updated)
      setEditing(false)
      setNotice('Draft saved.')
    } catch (err) {
      if (err?.response?.status === 409) {
        setConflict(true)
        setError('This receipt changed since it was last loaded. Reload before saving again.')
      } else {
        setError(getErrorMessage(err))
      }
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const doPost = async () => {
    // Guarded before the (async) confirmation dialog, not after it
    // resolves - otherwise rapid repeat clicks can all pass this check
    // before any of them sets it.
    if (postingRef.current) return
    postingRef.current = true
    try {
      const proceed = await confirmAction(
        `Post receipt ${receipt.reference}? This records the physical arrival and increases the recorded-receipt quantity for ${receipt.company_code}. It does not release, reserve or issue material.`,
        { confirmLabel: 'Post receipt', title: 'Post this goods receipt?', danger: false }
      )
      if (!proceed) return
    } finally {
      postingRef.current = false
    }
    postingRef.current = true
    setPosting(true)
    setError('')
    setConflict(false)
    try {
      const updated = await postGoodsReceipt(storeId, receiptId, receipt.version)
      setReceipt(updated)
      setNotice('Receipt posted. It now appears in Recorded Receipts for this store.')
    } catch (err) {
      if (err?.response?.status === 409) {
        setConflict(true)
        setError('This receipt changed since it was last loaded, so it was not posted. Reload and try again.')
      } else {
        setError(getErrorMessage(err))
      }
    } finally {
      postingRef.current = false
      setPosting(false)
    }
  }

  const doCancel = async () => {
    if (cancellingRef.current || !cancelReason.trim()) return
    cancellingRef.current = true
    setCancelling(true)
    setError('')
    setConflict(false)
    try {
      const updated = await cancelGoodsReceipt(storeId, receiptId, receipt.version, cancelReason.trim())
      setReceipt(updated)
      setShowCancelForm(false)
      setCancelReason('')
      setNotice('Draft receipt cancelled.')
    } catch (err) {
      if (err?.response?.status === 409) {
        setConflict(true)
        setError('This receipt changed since it was last loaded, so it was not cancelled. Reload and try again.')
      } else {
        setError(getErrorMessage(err))
      }
    } finally {
      cancellingRef.current = false
      setCancelling(false)
    }
  }

  if (loading) return <LoadingState label="Loading receipt…" compact />
  if (error && !receipt) return <Alert type="error">{error} <button type="button" className="table-edit" onClick={load}>Retry</button></Alert>
  if (!receipt) return null

  const isDraft = receipt.status === 'DRAFT'
  const canEdit = isDraft && codes.includes('receiving.edit')
  const canPost = isDraft && codes.includes('receiving.post')
  const canCancel = isDraft && codes.includes('receiving.cancel')

  return (
    <div className="inv-panel">
      <button type="button" className="table-edit" onClick={() => navigate('/inventory/receiving')}>← Back to goods receipts</button>

      <div className="inv-toolbar">
        <div>
          <h3 style={{ margin: 0 }}>{receipt.reference}</h3>
          <p className="field-muted" style={{ margin: '4px 0 0' }}>
            {receipt.company_code} · from {receipt.source_purchase_order_reference} · status {receipt.status}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {canEdit && !editing && <Button variant="secondary" onClick={startEdit}>Edit draft</Button>}
          {canPost && !editing && <Button onClick={doPost} loading={posting} disabled={posting}>Post receipt</Button>}
          {canCancel && !editing && <Button variant="secondary" onClick={() => setShowCancelForm(true)} disabled={showCancelForm}>Cancel receipt</Button>}
        </div>
      </div>

      {notice && <Alert type="success">{notice}</Alert>}
      {error && (
        <Alert type="error">
          {error}
          {conflict && <> <button type="button" className="table-edit" onClick={load}>Reload</button></>}
        </Alert>
      )}

      {receipt.status === 'POSTED' && (
        <p className="field-muted">
          Posted {new Date(receipt.posted_at).toLocaleString()}. See the{' '}
          <button type="button" className="table-edit" onClick={() => navigate('/inventory/receipts')}>Recorded Receipts</button> tab for the resulting ledger entries.
        </p>
      )}
      {receipt.status === 'CANCELLED' && (
        <p className="field-muted">Cancelled{receipt.cancellation_reason ? `: ${receipt.cancellation_reason}` : '.'}</p>
      )}

      {showCancelForm && (
        <div className="inv-panel" style={{ background: '#fff8ec' }}>
          <label className="field-label" htmlFor="recv-cancel-reason">Cancellation reason *</label>
          <input id="recv-cancel-reason" className="field-input" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={1000} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Button variant="danger" onClick={doCancel} disabled={cancelling || !cancelReason.trim()} loading={cancelling}>Confirm cancellation</Button>
            <Button variant="secondary" onClick={() => { setShowCancelForm(false); setCancelReason('') }} disabled={cancelling}>Back</Button>
          </div>
        </div>
      )}

      {editing ? (
        <>
          <div className="inv-form-grid">
            <div className="field">
              <label className="field-label" htmlFor="recv-edit-arrived">Arrived at *</label>
              <input id="recv-edit-arrived" className="field-input" type="datetime-local" value={form.arrived_at} onChange={(e) => setForm({ ...form, arrived_at: e.target.value })} required />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="recv-edit-note">Delivery note reference</label>
              <input id="recv-edit-note" className="field-input" value={form.delivery_note_reference} onChange={(e) => setForm({ ...form, delivery_note_reference: e.target.value })} maxLength={100} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="recv-edit-notes">Notes</label>
              <input id="recv-edit-notes" className="field-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={2000} />
            </div>
          </div>
          <div className="inv-table-scroll">
            <table className="inv-table">
              <thead><tr><th>Material</th><th>Unit</th><th>Received quantity</th><th>Lot reference</th></tr></thead>
              <tbody>
                {form.lines.map((line, index) => (
                  <tr key={line.source_po_line_id}>
                    <td>{line.material_code} · {line.material_name}</td>
                    <td>{line.unit_code}</td>
                    <td>
                      <input
                        className="field-input"
                        type="number"
                        step="any"
                        min="0.001"
                        value={line.received_quantity}
                        onChange={(e) => {
                          const next = [...form.lines]
                          next[index] = { ...line, received_quantity: e.target.value }
                          setForm({ ...form, lines: next })
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="field-input"
                        value={line.lot_reference}
                        onChange={(e) => {
                          const next = [...form.lines]
                          next[index] = { ...line, lot_reference: e.target.value }
                          setForm({ ...form, lines: next })
                        }}
                        maxLength={100}
                      />
                    </td>
                  </tr>
                ))}
                {form.lines.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center' }}>No lines yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={saveEdit} loading={saving} disabled={saving}>Save draft</Button>
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>Cancel editing</Button>
          </div>
        </>
      ) : (
        <>
          <div className="inv-form-grid">
            <div className="field"><span className="field-label">Arrived at</span><div className="field-input field-readonly">{receipt.arrived_at ? new Date(receipt.arrived_at).toLocaleString() : '—'}</div></div>
            <div className="field"><span className="field-label">Delivery note reference</span><div className="field-input field-readonly">{receipt.delivery_note_reference || '—'}</div></div>
            <div className="field"><span className="field-label">Notes</span><div className="field-input field-readonly">{receipt.notes || '—'}</div></div>
          </div>
          <div className="inv-table-scroll">
            <table className="inv-table">
              <thead><tr><th>Material</th><th>Unit</th><th style={{ textAlign: 'right' }}>Received quantity</th><th>Lot reference</th></tr></thead>
              <tbody>
                {receipt.lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.material_code} · {line.material_name}</td>
                    <td>{line.unit_code}</td>
                    <td style={{ textAlign: 'right' }}>{line.received_quantity}</td>
                    <td>{line.lot_reference || '—'}</td>
                  </tr>
                ))}
                {receipt.lines.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center' }}>No lines recorded.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
