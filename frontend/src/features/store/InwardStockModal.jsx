import { useEffect, useRef, useState } from 'react'

import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Modal from '../inventory/components/Modal'
import { confirmAction } from '../../components/ConfirmProvider'
import { LoadingState } from '../../components/Spinner'
import AsyncSearchSelect from '../operations/AsyncSearchSelect'
import { getStorePermissionCodes } from '../operations/storePreparationService'
import { getErrorMessage } from '../../utils/errors'
import { listContainerTypes, listMaterials, listMyCompanies } from './storeService'
import { createGoodsReceipt, postGoodsReceipt, updateGoodsReceipt, listEligiblePurchaseOrders } from './receivingService'
import './RegisterModalTheme.css'

function toLocalDateTimeInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// Real goods-receipt workflow (apps.receiving.services.
// create_goods_receipt/update_goods_receipt/post_goods_receipt) - shared
// by the Receiving tab's own "+ New receipt" and the Material Register's
// "+ Inward Stock". Save Draft and Post are two separate, explicit
// actions in this one modal (Post only appears once a draft exists and
// only when the caller holds receiving.post in this store - the server
// stays authoritative regardless); editing/cancelling a receipt after
// this modal closes still happens on the existing, already-built
// /inventory/receiving/:id screen, this component does not duplicate
// that screen's full edit/cancel UI.
//
// `materialCode`, when given, filters the eligible-PO list down to
// orders that actually have a line for that material (never silently
// forces an ineligible material onto an unrelated PO) - with an
// explicit way to see every eligible order instead, never a dead end.
export default function InwardStockModal({
  storeId, materialId, materialCode, materialName, materialBaseUnitCode, onClose, onCreated, onPosted,
}) {
  // 'po' (the original path) or 'manual' (no purchase order - added
  // after Task 09A at the user's explicit request, matching the
  // client's own real inward-entry flow). Locked once a draft exists -
  // a receipt's mode is fixed at creation (see GoodsReceipt.clean()'s
  // "source purchase order cannot be changed" rule).
  const [mode, setMode] = useState('po')
  const [pos, setPos] = useState({ loading: true, results: [], error: '' })
  const [showAllPos, setShowAllPos] = useState(false)
  const [selectedPo, setSelectedPo] = useState(null)
  const [showOtherLines, setShowOtherLines] = useState(false)
  const [arrivedAt, setArrivedAt] = useState(() => toLocalDateTimeInput(new Date().toISOString()))
  const [supplierInvoiceReference, setSupplierInvoiceReference] = useState('')
  const [deliveryNoteReference, setDeliveryNoteReference] = useState('')
  const [notes, setNotes] = useState('')
  const [quantities, setQuantities] = useState({})
  const [containerTypes, setContainerTypes] = useState([])
  const [codes, setCodes] = useState([])
  const [draft, setDraft] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const savingRef = useRef(false)
  const postingRef = useRef(false)
  const idempotencyKeyRef = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`)

  // MANUAL ENTRY MODE state - a free-text supplier (never claimed to
  // exist in the real Supplier catalog, same convention batch_
  // reference/product_reference already use on MaterialIssue), a real
  // Company the caller must hold purchase_orders.view in (server-
  // enforced regardless of what this UI shows), a real Material (pre-
  // filled and locked when this modal already knows which one, e.g.
  // opened from the register - otherwise searched for directly), and
  // an optional, directly-entered price - the only place this app ever
  // accepts a caller-supplied price.
  const [companies, setCompanies] = useState([])
  const [manualCompanyId, setManualCompanyId] = useState('')
  const [manualSupplierName, setManualSupplierName] = useState('')
  const [manualMaterial, setManualMaterial] = useState(
    materialId ? { id: materialId, code: materialCode, name: materialName, base_unit_code: materialBaseUnitCode } : null
  )
  const [manualQuantity, setManualQuantity] = useState('')
  const [manualPrice, setManualPrice] = useState('')
  const [manualCurrency, setManualCurrency] = useState('INR')
  const [manualLot, setManualLot] = useState('')
  const [manualContainerTypeId, setManualContainerTypeId] = useState('')
  const [manualContainerQty, setManualContainerQty] = useState('')

  useEffect(() => {
    getStorePermissionCodes(storeId).then(setCodes).catch(() => setCodes([]))
    listMyCompanies()
      .then((list) => {
        setCompanies(list)
        if (list.length === 1) setManualCompanyId(String(list[0].id))
      })
      .catch(() => setCompanies([]))
  }, [storeId])

  const switchMode = (next) => {
    if (next === mode || draft) return
    setMode(next)
    setSelectedPo(null)
    setQuantities({})
    setShowOtherLines(false)
    markDirty()
  }

  const canPost = codes.includes('receiving.post')

  // Any change after the modal opens (or after the last successful
  // save) marks it dirty, so closing with real edits unsaved prompts a
  // confirmation instead of silently discarding them - a persisted
  // draft is never "discarded" by Cancel, only unsaved field edits are.
  const markDirty = () => setDirty(true)

  const requestClose = async () => {
    if (saving || posting) return
    if (dirty) {
      const discard = await confirmAction(
        'You have unsaved changes to this inward entry. Close without saving?',
        { confirmLabel: 'Discard changes', title: 'Discard unsaved changes?', danger: true }
      )
      if (!discard) return
    }
    onClose()
  }

  const matchesMaterial = (po) =>
    !materialCode || po.delivery_progress.some((line) => line.material_code_snapshot === materialCode)

  const selectPo = (po) => {
    setSelectedPo(po)
    setQuantities({})
    markDirty()
  }

  useEffect(() => {
    listEligiblePurchaseOrders(storeId, { pageSize: 50 })
      .then((data) => {
        setPos({ loading: false, results: data.results, error: '' })
        // Skip the picking step entirely when there is exactly one
        // eligible order for this material - the common case - so
        // recording a delivery feels like one short form, not a
        // two-screen search, while still only ever using a real,
        // already-issued purchase order underneath.
        if (materialCode) {
          const onlyMatch = data.results.filter(matchesMaterial)
          if (onlyMatch.length === 1) selectPo(onlyMatch[0])
        }
      })
      .catch((err) => setPos({ loading: false, results: [], error: getErrorMessage(err) }))
    listContainerTypes().then(setContainerTypes).catch(() => setContainerTypes([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId])

  const visiblePos = showAllPos || !materialCode ? pos.results : pos.results.filter(matchesMaterial)
  const hiddenCount = pos.results.length - visiblePos.length

  const setLineValue = (lineId, field, value) => {
    setQuantities((prev) => ({ ...prev, [lineId]: { ...prev[lineId], [field]: value } }))
    markDirty()
  }

  const buildLines = () =>
    selectedPo.delivery_progress
      .map((line) => {
        const entry = quantities[line.source_po_line_id]
        const qty = entry?.received_quantity
        if (!qty || Number(qty) <= 0) return null
        return {
          source_po_line_id: line.source_po_line_id,
          received_quantity: qty,
          lot_reference: entry?.lot_reference || '',
          container_type_id: entry?.container_type_id ? Number(entry.container_type_id) : null,
          container_quantity: entry?.container_quantity ? Number(entry.container_quantity) : null,
        }
      })
      .filter(Boolean)

  // MANUAL ENTRY MODE - a real material_id (never free text), an
  // optional directly-entered unit_price/currency_code (the only place
  // this app ever accepts a caller-supplied price - see
  // apps.receiving.services.create_goods_receipt's own docstring).
  const buildManualLines = () => {
    if (!manualMaterial || !manualQuantity || Number(manualQuantity) <= 0) return []
    return [
      {
        material_id: manualMaterial.id,
        received_quantity: manualQuantity,
        lot_reference: manualLot.trim(),
        container_type_id: manualContainerTypeId ? Number(manualContainerTypeId) : null,
        container_quantity: manualContainerQty ? Number(manualContainerQty) : null,
        unit_price: manualPrice ? manualPrice : null,
        currency_code: manualPrice ? manualCurrency.trim().toUpperCase() : '',
      },
    ]
  }

  // Creates the draft on the first save, then UPDATES that same draft on
  // every later save - never a second receipt from clicking Save Draft
  // twice. Stays a draft either way; Post is the only action that ever
  // creates a real stock movement (see doPost below).
  const saveDraft = async () => {
    if (savingRef.current) return
    if (mode === 'po' && !selectedPo) return
    if (mode === 'manual' && (!manualCompanyId || !manualMaterial)) return
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      const basePayload = {
        arrived_at: new Date(arrivedAt).toISOString(),
        supplier_invoice_reference: supplierInvoiceReference.trim(),
        delivery_note_reference: deliveryNoteReference.trim(),
        notes: notes.trim(),
      }
      let receipt
      if (draft) {
        const payload =
          mode === 'po'
            ? { ...basePayload, lines: buildLines() }
            : { ...basePayload, supplier_name: manualSupplierName.trim(), lines: buildManualLines() }
        receipt = await updateGoodsReceipt(storeId, draft.id, { ...payload, expected_version: draft.version })
      } else if (mode === 'po') {
        receipt = await createGoodsReceipt(storeId, {
          ...basePayload,
          source_purchase_order_id: selectedPo.id,
          idempotency_key: idempotencyKeyRef.current,
          lines: buildLines(),
        })
      } else {
        receipt = await createGoodsReceipt(storeId, {
          ...basePayload,
          company_id: Number(manualCompanyId),
          supplier_name: manualSupplierName.trim(),
          idempotency_key: idempotencyKeyRef.current,
          lines: buildManualLines(),
        })
      }
      setDraft(receipt)
      setDirty(false)
      onCreated(receipt)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  // Explicit, separate action - only reachable once a draft exists and
  // only enabled when the caller holds receiving.post in this store
  // (the server re-checks regardless; this is just the same
  // established UI convention ReceivingTab's own ReceiptDetail uses).
  const doPost = async () => {
    if (postingRef.current || !draft) return
    postingRef.current = true
    setPosting(true)
    setError('')
    try {
      const posted = await postGoodsReceipt(storeId, draft.id, draft.version)
      setDraft(posted)
      if (onPosted) onPosted(posted)
      else onCreated(posted)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      postingRef.current = false
      setPosting(false)
    }
  }

  const saving_or_posting = saving || posting

  // The common case - a PO with exactly one line for this material, not
  // expanded to show the rest - gets the reference's simple two-field
  // layout (Received Quantity | Price) instead of the dense multi-line
  // table, which only ever appears when it is actually needed (several
  // lines, or the user explicitly asks to see them).
  const matchingLines = selectedPo
    ? selectedPo.delivery_progress.filter((line) => !materialCode || line.material_code_snapshot === materialCode)
    : []
  const singleLine = selectedPo && !showOtherLines && matchingLines.length === 1 ? matchingLines[0] : null

  return (
    <Modal
      className="reg-modal-themed"
      title={materialCode ? `+ Add Inward Stock: ${materialCode}${materialName ? ` — ${materialName}` : ''}` : 'New goods receipt'}
      size="lg"
      onClose={saving_or_posting ? undefined : requestClose}
      footer={
        <>
          <Button variant="secondary" onClick={requestClose} disabled={saving_or_posting}>Cancel</Button>
          <Button
            variant="secondary"
            onClick={saveDraft}
            disabled={
              saving_or_posting || !arrivedAt || (draft != null && draft.status !== 'DRAFT') ||
              (mode === 'po' ? !selectedPo : !manualCompanyId || !manualMaterial || !manualQuantity)
            }
            loading={saving}
          >
            {draft ? 'Update Draft' : 'Save Draft'}
          </Button>
          {draft && draft.status === 'DRAFT' && (
            <Button
              onClick={doPost}
              disabled={saving_or_posting || !canPost}
              loading={posting}
              title={canPost ? undefined : 'You do not hold receiving.post in this store - ask an administrator for access.'}
            >
              Post Receipt
            </Button>
          )}
        </>
      }
    >
      {error && <Alert type="error">{error}</Alert>}
      {draft && draft.status === 'DRAFT' && (
        <Alert type="success">
          Draft {draft.reference} saved. It has no stock effect yet - click Post Receipt
          {canPost ? '' : ' (you do not hold receiving.post in this store)'} to record the movement.
        </Alert>
      )}
      {draft && draft.status === 'POSTED' && (
        <Alert type="success">Receipt {draft.reference} posted. The register now reflects this delivery.</Alert>
      )}

      {!draft && (
        <div className="inv-mode-toggle">
          <button type="button" className={mode === 'po' ? 'active' : ''} onClick={() => switchMode('po')}>
            From Purchase Order
          </button>
          <button type="button" className={mode === 'manual' ? 'active' : ''} onClick={() => switchMode('manual')}>
            Manual Entry (no PO)
          </button>
        </div>
      )}

      {mode === 'manual' ? (
        <>
          <div className="field" style={{ marginBottom: 14 }}>
            <label className="field-label" htmlFor="recv-manual-supplier">Supplier / Vendor</label>
            <input
              id="recv-manual-supplier"
              className="field-input"
              value={manualSupplierName}
              onChange={(e) => { setManualSupplierName(e.target.value); markDirty() }}
              maxLength={255}
              placeholder="e.g. Nenshi Healthcare"
              disabled={draft != null}
            />
            <p className="field-muted" style={{ margin: '4px 0 0' }}>
              Free text, not linked to the Supplier catalog - this delivery has no purchase order, so no
              over-receipt check applies to it.
            </p>
          </div>

          {companies.length > 1 && (
            <div className="field" style={{ marginBottom: 14 }}>
              <label className="field-label" htmlFor="recv-manual-company">Company *</label>
              <select
                id="recv-manual-company"
                className="field-input"
                value={manualCompanyId}
                onChange={(e) => { setManualCompanyId(e.target.value); markDirty() }}
                disabled={draft != null}
              >
                <option value="">Choose…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} - {c.legal_name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="inv-form-grid">
            <div className="field">
              <label className="field-label" htmlFor="recv-arrived-manual">Receipt date *</label>
              <input
                id="recv-arrived-manual" className="field-input" type="datetime-local" value={arrivedAt}
                onChange={(e) => { setArrivedAt(e.target.value); markDirty() }} required
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="recv-invoice-ref-manual">Invoice number</label>
              <input
                id="recv-invoice-ref-manual" className="field-input" value={supplierInvoiceReference}
                onChange={(e) => { setSupplierInvoiceReference(e.target.value); markDirty() }}
                maxLength={100} placeholder="If the invoice is already available"
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="recv-delivery-note-manual">Delivery note reference</label>
              <input
                id="recv-delivery-note-manual" className="field-input" value={deliveryNoteReference}
                onChange={(e) => { setDeliveryNoteReference(e.target.value); markDirty() }}
                maxLength={100} placeholder="If no invoice yet"
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="recv-notes-manual">Notes</label>
              <input
                id="recv-notes-manual" className="field-input" value={notes}
                onChange={(e) => { setNotes(e.target.value); markDirty() }} maxLength={2000}
              />
            </div>
          </div>

          {!materialId && (
            <div className="field" style={{ marginBottom: 14 }}>
              <label className="field-label" htmlFor="recv-manual-material">Material *</label>
              <AsyncSearchSelect
                id="recv-manual-material"
                value={manualMaterial?.id || ''}
                selected={manualMaterial}
                disabled={draft != null}
                fetchOptions={async (term) => {
                  const data = await listMaterials({ search: term, pageSize: 20 })
                  return (data.results || []).map((m) => ({
                    id: m.id, label: `${m.code} - ${m.name}`, meta: m.base_unit_code,
                    code: m.code, name: m.name, base_unit_code: m.base_unit_code,
                  }))
                }}
                getOptionLabel={(o) => o.label || (o.code ? `${o.code} - ${o.name}` : '')}
                getOptionMeta={(o) => o.meta || o.base_unit_code || ''}
                onChange={(o) => { setManualMaterial(o); markDirty() }}
                placeholder="Search material code or name…"
              />
            </div>
          )}

          <div className="inv-form-grid">
            <div className="field">
              <label className="field-label" htmlFor="recv-manual-qty">
                Received quantity{manualMaterial ? ` (${manualMaterial.base_unit_code})` : ''} *
              </label>
              <input
                id="recv-manual-qty" className="field-input" type="number" step="any" min="0"
                value={manualQuantity} onChange={(e) => { setManualQuantity(e.target.value); markDirty() }}
                placeholder="e.g. 225" disabled={!manualMaterial}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="recv-manual-price">
                Price per {manualMaterial?.base_unit_code || 'unit'} (optional)
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="recv-manual-price" className="field-input" type="number" step="any" min="0"
                  value={manualPrice} onChange={(e) => { setManualPrice(e.target.value); markDirty() }}
                  placeholder="e.g. 270"
                />
                <input
                  className="field-input" style={{ maxWidth: 80 }} value={manualCurrency}
                  onChange={(e) => { setManualCurrency(e.target.value.toUpperCase()); markDirty() }}
                  maxLength={3} placeholder="INR"
                />
              </div>
              <p className="field-muted" style={{ margin: '4px 0 0' }}>
                Entered directly - this delivery has no purchase order to derive a price from.
              </p>
            </div>
          </div>

          <div className="inv-form-grid">
            <div className="field">
              <label className="field-label" htmlFor="recv-manual-lot">Lot reference (optional)</label>
              <input
                id="recv-manual-lot" className="field-input" value={manualLot}
                onChange={(e) => { setManualLot(e.target.value); markDirty() }} maxLength={100}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="recv-manual-container">Container (optional)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  id="recv-manual-container" className="field-input" value={manualContainerTypeId}
                  onChange={(e) => { setManualContainerTypeId(e.target.value); markDirty() }}
                >
                  <option value="">—</option>
                  {containerTypes.map((ct) => (
                    <option key={ct.id} value={ct.id}>{ct.name}</option>
                  ))}
                </select>
                <input
                  className="field-input" type="number" step="1" min="1" style={{ maxWidth: 110 }}
                  value={manualContainerQty} onChange={(e) => { setManualContainerQty(e.target.value); markDirty() }}
                  placeholder="Count"
                />
              </div>
            </div>
          </div>

          {/* A recap of what was entered, never a fabricated pack-size
              conversion - ContainerType carries no nominal/pack-size
              field in this schema by design. */}
          {manualQuantity && manualMaterial && (
            <div className="inv-computed-box">
              <span>Recorded as:</span>
              <strong>
                {manualQuantity} {manualMaterial.base_unit_code}
                {manualContainerTypeId && manualContainerQty
                  ? ` (${containerTypes.find((ct) => String(ct.id) === String(manualContainerTypeId))?.name || ''} × ${manualContainerQty})`
                  : ''}
              </strong>
            </div>
          )}

          <p className="field-muted" style={{ marginTop: 10 }}>
            Manual entry mode: no purchase order exists for this delivery, so no over-receipt check applies and
            price is entered directly rather than derived from an order. This still goes through the same Save
            Draft / Post Receipt review before it affects stock.
          </p>
        </>
      ) : !selectedPo ? (
        <>
          <p className="field-muted">
            {materialCode
              ? `Pick the purchase order this delivery of ${materialCode} is against.`
              : 'Pick the purchase order this delivery is against.'}
          </p>
          {pos.error && <Alert type="error">{pos.error}</Alert>}
          {pos.loading ? (
            <LoadingState label="Loading eligible purchase orders…" compact />
          ) : pos.results.length === 0 ? (
            <p className="field-muted">No eligible purchase order found - it must be ISSUED and visible to you.</p>
          ) : visiblePos.length === 0 ? (
            <div className="field-muted">
              <p style={{ margin: '0 0 8px' }}>
                No eligible purchase order currently has a line for {materialCode}. This does not force an
                unrelated line onto this material - you can still record a delivery against any other eligible
                order instead.
              </p>
              <Button variant="secondary" onClick={() => setShowAllPos(true)}>Show all eligible purchase orders</Button>
            </div>
          ) : (
            <>
              {materialCode && !showAllPos && hiddenCount > 0 && (
                <p className="field-muted" style={{ margin: '0 0 8px' }}>
                  Showing only orders with a line for {materialCode}.{' '}
                  <button type="button" className="table-edit" onClick={() => setShowAllPos(true)}>
                    Show all {pos.results.length} eligible orders
                  </button>
                </p>
              )}
              <div className="inv-table-scroll">
                <table className="inv-table">
                  <thead><tr><th>Reference</th><th>Company</th><th>Supplier</th><th>Expected delivery</th><th></th></tr></thead>
                  <tbody>
                    {visiblePos.map((po) => (
                      <tr key={po.id}>
                        <td className="cell-strong">
                          {po.reference}
                          {materialCode && matchesMaterial(po) && (
                            <span
                              style={{
                                marginLeft: 8, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                                background: '#eaf7ef', color: '#1d7a3d', border: '1px solid #bfe3cb',
                              }}
                            >
                              Has {materialCode}
                            </span>
                          )}
                        </td>
                        <td>{po.company_code}</td>
                        <td>{po.supplier_code}</td>
                        <td>{po.expected_delivery_date || '—'}</td>
                        <td><button type="button" className="table-edit" onClick={() => selectPo(po)}>Select</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="field" style={{ marginBottom: 14 }}>
            <label className="field-label">Supplier / Vendor (from purchase order {selectedPo.reference})</label>
            <input className="field-input" value={`${selectedPo.supplier_code} · ${selectedPo.company_code}`} disabled />
            <p className="field-muted" style={{ margin: '4px 0 0' }}>
              Derived from the selected purchase order - never an unrelated supplier override.{' '}
              <button type="button" className="table-edit" onClick={() => { setSelectedPo(null); markDirty() }}>Change purchase order</button>
            </p>
          </div>
          <div className="inv-form-grid">
            <div className="field">
              <label className="field-label" htmlFor="recv-arrived">Receipt date *</label>
              <input id="recv-arrived" className="field-input" type="datetime-local" value={arrivedAt} onChange={(e) => { setArrivedAt(e.target.value); markDirty() }} required />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="recv-invoice-ref">Invoice number</label>
              <input id="recv-invoice-ref" className="field-input" value={supplierInvoiceReference} onChange={(e) => { setSupplierInvoiceReference(e.target.value); markDirty() }} maxLength={100} placeholder="If the invoice is already available" />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="recv-delivery-note">Delivery note reference</label>
              <input id="recv-delivery-note" className="field-input" value={deliveryNoteReference} onChange={(e) => { setDeliveryNoteReference(e.target.value); markDirty() }} maxLength={100} placeholder="If no invoice yet" />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="recv-notes">Notes</label>
              <input id="recv-notes" className="field-input" value={notes} onChange={(e) => { setNotes(e.target.value); markDirty() }} maxLength={2000} />
            </div>
          </div>

          {singleLine ? (
            <>
              <div className="inv-form-grid">
                <div className="field">
                  <label className="field-label" htmlFor="recv-qty-single">
                    Received quantity ({singleLine.unit_code_snapshot}) *
                  </label>
                  <input
                    id="recv-qty-single"
                    className="field-input"
                    type="number"
                    step="any"
                    min="0"
                    value={quantities[singleLine.source_po_line_id]?.received_quantity || ''}
                    onChange={(e) => setLineValue(singleLine.source_po_line_id, 'received_quantity', e.target.value)}
                    disabled={singleLine.delivery_status === 'FULLY_RECEIVED'}
                    placeholder={singleLine.delivery_status === 'FULLY_RECEIVED' ? 'Fully received' : 'e.g. 225'}
                  />
                  <p className="field-muted" style={{ margin: '4px 0 0' }}>
                    Remaining on this order: {singleLine.remaining_quantity} {singleLine.unit_code_snapshot}. Over-receipt
                    beyond this is rejected when you post.
                  </p>
                </div>
                <div className="field">
                  <label className="field-label">
                    Price ({singleLine.pricing_unit_code || singleLine.unit_code_snapshot})
                  </label>
                  <input
                    className="field-input"
                    value={singleLine.unit_price != null ? `${singleLine.currency_code || ''} ${singleLine.unit_price}` : 'Not set on this order line'}
                    disabled
                  />
                  <p className="field-muted" style={{ margin: '4px 0 0' }}>
                    The purchase order's own price at issue time - read-only, never editable here.
                  </p>
                </div>
              </div>

              <div className="inv-form-grid">
                <div className="field">
                  <label className="field-label" htmlFor="recv-lot-single">Lot reference (optional)</label>
                  <input
                    id="recv-lot-single"
                    className="field-input"
                    value={quantities[singleLine.source_po_line_id]?.lot_reference || ''}
                    onChange={(e) => setLineValue(singleLine.source_po_line_id, 'lot_reference', e.target.value)}
                    maxLength={100}
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="recv-container-single">Container (optional)</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      id="recv-container-single"
                      className="field-input"
                      value={quantities[singleLine.source_po_line_id]?.container_type_id || ''}
                      onChange={(e) => setLineValue(singleLine.source_po_line_id, 'container_type_id', e.target.value)}
                    >
                      <option value="">—</option>
                      {containerTypes.map((ct) => (
                        <option key={ct.id} value={ct.id}>{ct.name}</option>
                      ))}
                    </select>
                    <input
                      className="field-input"
                      type="number"
                      step="1"
                      min="1"
                      style={{ maxWidth: 110 }}
                      value={quantities[singleLine.source_po_line_id]?.container_quantity || ''}
                      onChange={(e) => setLineValue(singleLine.source_po_line_id, 'container_quantity', e.target.value)}
                      placeholder="Count"
                    />
                  </div>
                </div>
              </div>

              {/* A recap of what was entered, never a fabricated pack-size
                  conversion - ContainerType deliberately carries no
                  nominal/pack-size field in this schema (see its own
                  model docstring), so there is no real quantity ÷ pack
                  size to show here. */}
              {quantities[singleLine.source_po_line_id]?.received_quantity && (
                <div className="inv-computed-box">
                  <span>Recorded as:</span>
                  <strong>
                    {quantities[singleLine.source_po_line_id].received_quantity} {singleLine.unit_code_snapshot}
                    {quantities[singleLine.source_po_line_id]?.container_type_id && quantities[singleLine.source_po_line_id]?.container_quantity
                      ? ` (${containerTypes.find((ct) => String(ct.id) === String(quantities[singleLine.source_po_line_id].container_type_id))?.name || ''} × ${quantities[singleLine.source_po_line_id].container_quantity})`
                      : ''}
                  </strong>
                </div>
              )}

              {selectedPo.delivery_progress.length > 1 && (
                <p className="field-muted" style={{ margin: '4px 0 0' }}>
                  <button type="button" className="table-edit" onClick={() => setShowOtherLines(true)}>
                    This order also has {selectedPo.delivery_progress.length - 1} other line{selectedPo.delivery_progress.length - 1 === 1 ? '' : 's'} - show them
                  </button>
                </p>
              )}
            </>
          ) : (
            <>
              <div className="inv-section-label">
                {materialCode ? `${materialCode} - enter the actual received quantity` : 'Lines - enter the actual received quantity for each line you are recording now; leave the rest blank'}
              </div>
              {materialCode && !showOtherLines && (
                <p className="field-muted" style={{ margin: '-6px 0 8px' }}>
                  <button type="button" className="table-edit" onClick={() => setShowOtherLines(true)}>
                    Show every line on this order
                  </button>
                </p>
              )}
              <div className="inv-table-scroll">
                <table className="inv-table">
                  <thead>
                    <tr>
                      <th>Material</th><th>Unit</th><th>Ordered</th><th>Remaining</th>
                      <th style={{ textAlign: 'right' }}>Price</th>
                      <th>Received now</th><th>Lot reference</th><th>Container</th><th>Container qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPo.delivery_progress
                      .filter((line) => showOtherLines || !materialCode || line.material_code_snapshot === materialCode)
                      .map((line) => (
                      <tr key={line.source_po_line_id} style={materialCode && line.material_code_snapshot === materialCode ? { background: '#eaf7ef' } : undefined}>
                        <td>{line.material_code_snapshot} · {line.material_name_snapshot}</td>
                        <td>{line.unit_code_snapshot}</td>
                        <td style={{ textAlign: 'right' }}>{line.ordered_quantity}</td>
                        <td style={{ textAlign: 'right' }}>{line.remaining_quantity}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {line.unit_price != null ? `${line.currency_code || ''} ${line.unit_price}/${line.pricing_unit_code}` : '—'}
                        </td>
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
                        <td>
                          <select
                            className="field-input"
                            value={quantities[line.source_po_line_id]?.container_type_id || ''}
                            onChange={(e) => setLineValue(line.source_po_line_id, 'container_type_id', e.target.value)}
                          >
                            <option value="">—</option>
                            {containerTypes.map((ct) => (
                              <option key={ct.id} value={ct.id}>{ct.name}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            className="field-input"
                            type="number"
                            step="1"
                            min="1"
                            value={quantities[line.source_po_line_id]?.container_quantity || ''}
                            onChange={(e) => setLineValue(line.source_po_line_id, 'container_quantity', e.target.value)}
                            placeholder="Count"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="field-muted">
                Price is the purchase order's own price at issue time (read-only, never editable here, never a
                per-container price). Over-receipt beyond what remains outstanding is rejected when you post - verify
                quantities carefully. A line left blank here can still be added later while the receipt is a draft.
              </p>
            </>
          )}
        </>
      )}
    </Modal>
  )
}
