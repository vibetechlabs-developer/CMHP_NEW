// Real goods-receipt workflow (apps.receiving.services.create_goods_receipt/
// update_goods_receipt/post_goods_receipt) - restored to junior's clean
// modal presentation, pale-blue header, rounded corners, compact field
// layout, and .stock-computed-box calculation panel.
//
// PO-based only: supplier and operating company are derived consistently
// from the purchase order. Real dynamic units and authorized prices come
// from the PO line snapshot. Save Draft and Post are two separate, explicit
// actions (Post only appears once a draft exists and caller holds receiving.post).
import { useEffect, useRef, useState } from 'react'

import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Modal from '../inventory/components/Modal'
import { LoadingState } from '../../components/Spinner'
import { useConfirmDialog } from '../inventory/components/ConfirmDialog'
import { getStorePermissionCodes } from '../operations/storePreparationService'
import { getErrorMessage } from '../../utils/errors'
import { listContainerTypes, listMaterialSuppliers, listMyCompanies } from './storeService'
import { createGoodsReceipt, getGoodsReceipt, listEligiblePurchaseOrders, postGoodsReceipt, updateGoodsReceipt } from './receivingService'
import '../inventory/tabs/StockLedger.css'
import '../inventory/tabs/CommonInventory.css'

function toLocalDateTimeInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function InwardStockModal({
  storeId, materialId, materialCode, materialName, materialBaseUnitCode, prefillPo, prefillPoId, initialDraft, editReceiptId, onClose, onCreated, onPosted,
  allowDirectMode = true,
}) {
  const { confirm, ConfirmNode } = useConfirmDialog()
  const [mode, setMode] = useState('po') // 'po' | 'direct'
  const [pos, setPos] = useState({ loading: true, results: [], error: '' })
  const [showAllPos, setShowAllPos] = useState(false)
  const [selectedPo, setSelectedPo] = useState(null)
  const [selectedLineId, setSelectedLineId] = useState(null)
  const [arrivedAt, setArrivedAt] = useState(() => toLocalDateTimeInput(new Date().toISOString()))
  const [supplierInvoiceReference, setSupplierInvoiceReference] = useState('')
  const [deliveryNoteReference, setDeliveryNoteReference] = useState('')
  const [notes, setNotes] = useState('')
  const [receivedQuantity, setReceivedQuantity] = useState('')
  const [lotReference, setLotReference] = useState('')
  const [containerTypeId, setContainerTypeId] = useState('')
  const [containerQuantity, setContainerQuantity] = useState('')
  const [containerTypes, setContainerTypes] = useState([])
  const [companies, setCompanies] = useState([])
  const [manualCompanyId, setManualCompanyId] = useState('')
  const [manualSupplierName, setManualSupplierName] = useState('')
  const [isCustomSupplier, setIsCustomSupplier] = useState(false)
  const [manualPrice, setManualPrice] = useState('')
  const [suppliers, setSuppliers] = useState([])
  const [codes, setCodes] = useState([])
  const [draft, setDraft] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const savingRef = useRef(false)
  const postingRef = useRef(false)
  const idempotencyKeyRef = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`)

  // Load existing receipt if editing
  useEffect(() => {
    if (!editReceiptId || !storeId) return
    getGoodsReceipt(storeId, editReceiptId)
      .then((rcpt) => {
        setDraft(rcpt)
        if (rcpt.arrived_at) setArrivedAt(toLocalDateTimeInput(rcpt.arrived_at))
        if (rcpt.supplier_invoice_reference) setSupplierInvoiceReference(rcpt.supplier_invoice_reference)
        if (rcpt.delivery_note_reference) setDeliveryNoteReference(rcpt.delivery_note_reference)
        if (rcpt.notes) setNotes(rcpt.notes)
        if (rcpt.is_manual_entry) {
          setMode('direct')
          if (rcpt.manual_company_id) setManualCompanyId(String(rcpt.manual_company_id))
          if (rcpt.manual_supplier_name) setManualSupplierName(rcpt.manual_supplier_name)
          if (rcpt.manual_price) setManualPrice(String(rcpt.manual_price))
          if (rcpt.manual_quantity) setReceivedQuantity(String(rcpt.manual_quantity))
          if (rcpt.manual_container_type_id) setContainerTypeId(String(rcpt.manual_container_type_id))
          if (rcpt.manual_container_quantity) setContainerQuantity(String(rcpt.manual_container_quantity))
        } else if (rcpt.lines && rcpt.lines.length > 0) {
          setMode('po')
          const firstLine = rcpt.lines[0]
          setReceivedQuantity(String(firstLine.received_quantity || ''))
          setLotReference(firstLine.lot_reference || '')
          if (firstLine.container_type_id) setContainerTypeId(String(firstLine.container_type_id))
          if (firstLine.container_quantity) setContainerQuantity(String(firstLine.container_quantity))
        }
      })
      .catch((err) => setError(getErrorMessage(err)))
  }, [storeId, editReceiptId])

  useEffect(() => {
    getStorePermissionCodes(storeId).then(setCodes).catch(() => setCodes([]))
    if (typeof listContainerTypes === 'function') {
      listContainerTypes().then(setContainerTypes).catch(() => setContainerTypes([]))
    }
    if (typeof listMyCompanies === 'function') {
      listMyCompanies().then((comps) => {
        setCompanies(comps || [])
        if (comps && comps.length > 0) setManualCompanyId(String(comps[0].id))
      }).catch(() => setCompanies([]))
    }
    if (typeof listMaterialSuppliers === 'function') {
      listMaterialSuppliers().then(setSuppliers).catch(() => setSuppliers([]))
    }
  }, [storeId])

  const canPost = codes.includes('receiving.post')
  const markDirty = () => setDirty(true)

  // Defense in depth: even if something else ever sets mode to 'direct',
  // never let a caller that disallows non-PO receiving submit one.
  useEffect(() => {
    if (!allowDirectMode && mode === 'direct' && !draft && !initialDraft) {
      setMode('po')
    }
  }, [allowDirectMode, mode, draft, initialDraft])

  const requestClose = async () => {
    if (saving || posting) return
    if (dirty) {
      const ok = await confirm({
        title: 'Discard Changes?',
        message: 'You have unsaved changes in this inward entry. Close without saving?',
        confirmLabel: 'Yes, Discard',
        cancelLabel: 'Go Back',
        variant: 'warning',
        icon: '⚠️',
      })
      if (!ok) return
    }
    onClose()
  }

  const matchesMaterial = (po) =>
    !materialCode || po.delivery_progress.some((line) => line.material_code_snapshot === materialCode)

  const selectPo = (po) => {
    setSelectedPo(po)
    markDirty()
    if (po && po.delivery_progress && po.delivery_progress.length > 0) {
      const match = materialCode
        ? po.delivery_progress.find((l) => l.material_code_snapshot === materialCode)
        : null
      const defaultLine = match || po.delivery_progress[0]
      setSelectedLineId(defaultLine?.source_po_line_id || null)
    } else {
      setSelectedLineId(null)
    }
  }

  useEffect(() => {
    listEligiblePurchaseOrders(storeId, { pageSize: 50 })
      .then((data) => {
        setPos({ loading: false, results: data.results, error: '' })
        const targetPoId = prefillPoId || prefillPo?.id || initialDraft?.source_purchase_order_id
        if (targetPoId) {
          const matched = data.results.find((p) => p.id === targetPoId)
          if (matched) selectPo(matched)
          else if (prefillPo) selectPo(prefillPo)
        } else if (materialCode) {
          const onlyMatch = data.results.filter(matchesMaterial)
          if (onlyMatch.length === 1) selectPo(onlyMatch[0])
        }
      })
      .catch((err) => {
        setPos({
          loading: false,
          results: [],
          error: `Could not load eligible purchase orders: ${getErrorMessage(err)}`,
        })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, prefillPoId, prefillPo, initialDraft])

  useEffect(() => {
    if (initialDraft) {
      setDraft(initialDraft)
      if (initialDraft.arrived_at) setArrivedAt(toLocalDateTimeInput(initialDraft.arrived_at))
      if (initialDraft.supplier_invoice_reference) setSupplierInvoiceReference(initialDraft.supplier_invoice_reference)
      if (initialDraft.delivery_note_reference) setDeliveryNoteReference(initialDraft.delivery_note_reference)
      if (initialDraft.notes) setNotes(initialDraft.notes)
      if (Array.isArray(initialDraft.lines) && initialDraft.lines.length > 0) {
        const line = initialDraft.lines[0]
        if (line.received_quantity) setReceivedQuantity(String(line.received_quantity))
        if (line.lot_reference) setLotReference(line.lot_reference || '')
        if (line.container_type_id) setContainerTypeId(String(line.container_type_id))
        if (line.container_quantity) setContainerQuantity(String(line.container_quantity))
        if (line.source_po_line_id) setSelectedLineId(line.source_po_line_id)
      }
    }
  }, [initialDraft])

  const visiblePos = showAllPos || !materialCode ? pos.results : pos.results.filter(matchesMaterial)
  const hiddenCount = pos.results.length - visiblePos.length

  const activeLine = selectedPo?.delivery_progress?.find(
    (l) => l.source_po_line_id === selectedLineId
  ) || selectedPo?.delivery_progress?.[0]

  const unitCode = mode === 'po' ? (activeLine?.unit_code_snapshot || '') : (materialBaseUnitCode || 'L')
  const remainingQty = activeLine?.remaining_quantity != null ? Number(activeLine.remaining_quantity) : null
  const exceedsRemaining = mode === 'po' && remainingQty != null && Number(receivedQuantity) > remainingQty

  const buildLines = () => {
    if (mode === 'po') {
      if (!activeLine || !receivedQuantity || Number(receivedQuantity) <= 0) return []
      return [
        {
          source_po_line_id: activeLine.source_po_line_id,
          received_quantity: receivedQuantity,
          lot_reference: lotReference.trim(),
          container_type_id: containerTypeId ? Number(containerTypeId) : null,
          container_quantity: containerQuantity ? Number(containerQuantity) : null,
        },
      ]
    }
    // Direct mode manual lines
    if (!receivedQuantity || Number(receivedQuantity) <= 0) return []
    return [
      {
        material_id: materialId,
        received_quantity: receivedQuantity,
        lot_reference: lotReference.trim(),
        container_type_id: containerTypeId ? Number(containerTypeId) : null,
        container_quantity: containerQuantity ? Number(containerQuantity) : null,
        unit_price: manualPrice ? Number(manualPrice) : null,
        currency_code: 'INR',
      },
    ]
  }

  const saveDraft = async () => {
    if (savingRef.current) return
    const lines = buildLines()
    if (mode === 'po' && (!selectedPo || lines.length === 0 || !arrivedAt)) {
      setError('Select a purchase order, enter a positive received quantity, and confirm the receipt date.')
      return
    }
    if (mode === 'direct' && (lines.length === 0 || !arrivedAt)) {
      setError('Enter a positive received quantity and confirm the receipt date.')
      return
    }

    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      let receipt
      if (draft) {
        receipt = await updateGoodsReceipt(storeId, draft.id, {
          expected_version: draft.version,
          arrived_at: new Date(arrivedAt).toISOString(),
          supplier_invoice_reference: supplierInvoiceReference.trim(),
          delivery_note_reference: deliveryNoteReference.trim(),
          notes: notes.trim(),
          lines,
        })
      } else if (mode === 'po') {
        receipt = await createGoodsReceipt(storeId, {
          source_purchase_order_id: selectedPo.id,
          arrived_at: new Date(arrivedAt).toISOString(),
          supplier_invoice_reference: supplierInvoiceReference.trim(),
          delivery_note_reference: deliveryNoteReference.trim(),
          notes: notes.trim(),
          lines,
          idempotency_key: idempotencyKeyRef.current,
        })
      } else {
        const compId = manualCompanyId ? Number(manualCompanyId) : (companies[0]?.id || 1)
        receipt = await createGoodsReceipt(storeId, {
          company_id: compId,
          supplier_name: manualSupplierName.trim() || 'Direct Supplier',
          arrived_at: new Date(arrivedAt).toISOString(),
          supplier_invoice_reference: supplierInvoiceReference.trim(),
          delivery_note_reference: deliveryNoteReference.trim(),
          notes: notes.trim(),
          lines,
          idempotency_key: idempotencyKeyRef.current,
        })
      }
      setDraft(receipt)
      setDirty(false)
      if (onCreated) onCreated(receipt)
      return receipt
    } catch (err) {
      setError(getErrorMessage(err))
      return null
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const doPost = async (targetDraft) => {
    const rcpt = targetDraft || draft
    if (postingRef.current || !rcpt) return
    postingRef.current = true
    setPosting(true)
    setError('')
    try {
      const posted = await postGoodsReceipt(storeId, rcpt.id, rcpt.version)
      setDraft(posted)
      if (onPosted) onPosted(posted)
    } catch (err) {
      setError(`Receipt ${rcpt.reference} could not be posted: ${getErrorMessage(err)}`)
    } finally {
      postingRef.current = false
      setPosting(false)
    }
  }

  const handleSaveAndPost = async () => {
    const saved = await saveDraft()
    if (saved?.id) {
      await doPost(saved)
    }
  }

  const saving_or_posting = saving || posting
  const title = draft
    ? `📥 Receipt Draft · ${draft.reference}${materialCode ? ` — ${materialCode}` : ''}`
    : `📥 New Inward Receipt${materialCode ? ` — ${materialCode}` : ''}`

  const isFormValid =
    !saving_or_posting &&
    Boolean(arrivedAt) &&
    Boolean(receivedQuantity) &&
    Number(receivedQuantity) > 0 &&
    (mode === 'direct' || Boolean(selectedPo)) &&
    (draft == null || draft.status === 'DRAFT')

  return (
    <Modal
      title={title}
      onClose={saving_or_posting ? () => {} : requestClose}
      maxWidth="680px"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={requestClose} disabled={saving_or_posting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={saveDraft}
            disabled={!isFormValid || (draft != null && draft.status !== 'DRAFT')}
            loading={saving}
          >
            {draft ? 'Update Draft' : 'Save Draft'}
          </Button>
          {!draft && (
            <button
              type="button"
              className="mreg-btn mreg-btn-inward"
              onClick={handleSaveAndPost}
              disabled={!isFormValid}
            >
              <span>✅</span> {saving_or_posting ? 'Posting…' : 'Save & Post to Stock'}
            </button>
          )}
          {draft && draft.status === 'DRAFT' && (
            <Button
              type="button"
              onClick={() => doPost(draft)}
              disabled={saving_or_posting || !canPost || exceedsRemaining}
              loading={posting}
              title={
                !canPost
                  ? 'You need receiving.post permission — ask your administrator.'
                  : exceedsRemaining
                    ? `Quantity exceeds remaining ${remainingQty} ${unitCode} on this order line.`
                    : 'Post this receipt to record stock permanently'
              }
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
          Draft {draft.reference} saved — no stock effect yet.
          {canPost
            ? ' Click "Post Receipt" to permanently record stock.'
            : ' You need receiving.post permission to post — contact your administrator.'}
        </Alert>
      )}
      {draft && draft.status === 'POSTED' && (
        <Alert type="success">🎉 Receipt <strong>{draft.reference}</strong> posted — stock has been updated in the shared store.</Alert>
      )}

      {/* Mode Switcher Tabs - non-PO direct entry is only offered where it has been
          explicitly authorized by the caller (allowDirectMode); Common Material
          Purchasing restricts Inward to PO-based receipts only until a distinct
          non-PO receiving permission/policy exists. */}
      {!draft && allowDirectMode && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            className={`btn ${mode === 'direct' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ height: 38, fontSize: 12.5, fontWeight: 700 }}
            onClick={() => { setMode('direct'); markDirty(); }}
          >
            📝 Direct Inward (Invoice / Sheet)
          </button>
          <button
            type="button"
            className={`btn ${mode === 'po' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ height: 38, fontSize: 12.5, fontWeight: 700 }}
            onClick={() => { setMode('po'); markDirty(); }}
          >
            📄 Link to Purchase Order
          </button>
        </div>
      )}

      {/* DIRECT INWARD MODE (Matches Excel Sheet columns: Date, Invoice, Supplier, Qty, Containers, Price) */}
      {mode === 'direct' && (
        <div className="inv-modal-form">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
            <div>
              <strong style={{ color: '#166534', fontSize: 13.5 }}>{materialCode} — {materialName}</strong>
              <div style={{ fontSize: 12, color: '#15803d', marginTop: 2 }}>
                Base unit: <strong>{unitCode}</strong> · Direct Inward Entry
              </div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: 5 }}>
              INWARD
            </span>
          </div>

          {/* Row 1: Date & Invoice No */}
          <div className="inv-modal-form-row">
            <div className="company-field">
              <label className="inv-modal-field-label" htmlFor="recv-arrived">
                Receipt Date <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                id="recv-arrived"
                type="date"
                className="company-input"
                value={arrivedAt.slice(0, 10)}
                onChange={(e) => {
                  setArrivedAt(`${e.target.value}T${new Date().toTimeString().slice(0, 5)}`)
                  markDirty()
                }}
                disabled={draft?.status === 'POSTED'}
                required
              />
            </div>

            <div className="company-field">
              <label className="inv-modal-field-label" htmlFor="recv-invoice">
                Invoice / Delivery Ref <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                id="recv-invoice"
                type="text"
                className="company-input"
                placeholder="e.g. GST/T-631 or Challan Ref"
                value={supplierInvoiceReference}
                onChange={(e) => { setSupplierInvoiceReference(e.target.value); markDirty() }}
                disabled={draft?.status === 'POSTED'}
                required
              />
            </div>
          </div>

          {/* Row 2: Supplier & Received Quantity */}
          <div className="inv-modal-form-row">
            <div className="company-field">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="inv-modal-field-label">
                  Supplier Name
                </label>
                {isCustomSupplier && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomSupplier(false)
                      setManualSupplierName('STOCK')
                      markDirty()
                    }}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: '#2563eb',
                      fontSize: 12,
                      cursor: 'pointer',
                      padding: 0,
                      fontWeight: 500,
                    }}
                  >
                    ← Select from list
                  </button>
                )}
              </div>
              {isCustomSupplier ? (
                <input
                  type="text"
                  className="company-input"
                  placeholder="e.g. M/S NARVAN ENT. or STOCK"
                  value={manualSupplierName}
                  onChange={(e) => { setManualSupplierName(e.target.value); markDirty() }}
                  disabled={draft?.status === 'POSTED'}
                  autoFocus
                />
              ) : (
                <select
                  className="company-input"
                  aria-label="Supplier Name"
                  value={
                    manualSupplierName === 'STOCK' || suppliers.some((s) => s.name === manualSupplierName)
                      ? manualSupplierName
                      : manualSupplierName ? manualSupplierName : ''
                  }
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === '__custom__') {
                      setIsCustomSupplier(true)
                      setManualSupplierName('')
                    } else {
                      setManualSupplierName(val)
                    }
                    markDirty()
                  }}
                  disabled={draft?.status === 'POSTED'}
                >
                  <option value="">Select Supplier…</option>
                  <option value="STOCK">STOCK (Internal / Opening Stock)</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name} {s.code && s.code !== s.name ? `(${s.code})` : ''}
                    </option>
                  ))}
                  {manualSupplierName && manualSupplierName !== 'STOCK' && !suppliers.some((s) => s.name === manualSupplierName) && (
                    <option value={manualSupplierName}>{manualSupplierName}</option>
                  )}
                  <option value="__custom__">➕ Other / Custom Supplier…</option>
                </select>
              )}
            </div>

            <div className="company-field">
              <label className="inv-modal-field-label" htmlFor="recv-qty">
                Received quantity ({unitCode}) <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                id="recv-qty"
                type="number"
                step="0.001"
                min="0.001"
                className="company-input"
                placeholder="e.g. 210"
                value={receivedQuantity}
                onChange={(e) => { setReceivedQuantity(e.target.value); markDirty() }}
                disabled={draft?.status === 'POSTED'}
                required
              />
            </div>
          </div>

          {/* Row 3: Containers & Price */}
          <div className="inv-modal-form-row">
            <div className="company-field">
              <label className="inv-modal-field-label">
                No. of Containers &amp; Type
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 8 }}>
                <input
                  type="number"
                  min="1"
                  className="company-input"
                  placeholder="Count (e.g. 1)"
                  value={containerQuantity}
                  onChange={(e) => { setContainerQuantity(e.target.value); markDirty() }}
                  disabled={draft?.status === 'POSTED'}
                />
                <select
                  className="company-input"
                  value={containerTypeId}
                  onChange={(e) => { setContainerTypeId(e.target.value); markDirty() }}
                  disabled={draft?.status === 'POSTED'}
                >
                  <option value="">Container type…</option>
                  {containerTypes.map((ct) => (
                    <option key={ct.id} value={ct.id}>{ct.name || ct.code}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="company-field">
              <label className="inv-modal-field-label">
                Price (per {unitCode})
              </label>
              <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, color: '#64748b', fontWeight: 700, fontSize: 13 }}>₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  style={{ paddingLeft: 28 }}
                  className="company-input"
                  placeholder="e.g. 135"
                  value={manualPrice}
                  onChange={(e) => { setManualPrice(e.target.value); markDirty() }}
                  disabled={draft?.status === 'POSTED'}
                />
              </div>
            </div>
          </div>

          {/* Row 4: Company & Remarks */}
          <div className="inv-modal-form-row">
            {companies.length > 1 && (
              <div className="company-field">
                <label className="inv-modal-field-label">Receiving Company</label>
                <select
                  className="company-input"
                  value={manualCompanyId}
                  onChange={(e) => { setManualCompanyId(e.target.value); markDirty() }}
                  disabled={draft?.status === 'POSTED'}
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.display_name || c.legal_name || c.code}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="company-field" style={companies.length <= 1 ? { gridColumn: '1 / -1' } : undefined}>
              <label className="inv-modal-field-label" htmlFor="recv-notes">
                Remarks / Notes (optional)
              </label>
              <input
                id="recv-notes"
                type="text"
                className="company-input"
                placeholder="e.g. Delivery received in good condition"
                value={notes}
                onChange={(e) => { setNotes(e.target.value); markDirty() }}
                disabled={draft?.status === 'POSTED'}
              />
            </div>
          </div>

          {receivedQuantity && Number(receivedQuantity) > 0 && (
            <div className="stock-computed-box" style={{ margin: '4px 0 0' }}>
              <span>Recorded as:</span>
              <strong>
                {receivedQuantity} {unitCode}
                {containerQuantity ? ` (${containerQuantity} container${containerQuantity > 1 ? 's' : ''})` : ''}
                {manualPrice ? ` @ ₹${manualPrice}/${unitCode}` : ''}
              </strong>
            </div>
          )}
        </div>
      )}

      {/* PURCHASE ORDER MODE */}
      {mode === 'po' && (
        <>
          {pos.loading ? (
            <LoadingState label="Loading eligible purchase orders…" compact />
          ) : visiblePos.length === 0 ? (
            <div style={{ padding: '20px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📦</div>
              <h4 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: 15, fontWeight: 700 }}>
                No Matching Purchase Order
              </h4>
              <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13, lineHeight: 1.5 }}>
                There is currently no issued purchase order for <strong>{materialCode}</strong>.
                {allowDirectMode
                  ? ' You can record this inward delivery directly using the supplier\'s invoice or delivery challan.'
                  : ' Common Material Purchasing only accepts receipts against an issued purchase order. Issue a purchase order for this material first.'}
              </p>
              {allowDirectMode && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '8px 18px', fontSize: 13 }}
                  onClick={() => setMode('direct')}
                >
                  📝 Switch to Direct Inward Entry
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Purchase Order selection */}
              <div className="stock-form-full">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <label className="field-label" htmlFor="recv-po" style={{ margin: 0, fontWeight: 700, fontSize: 12 }}>
                    Purchase Order *
                  </label>
                  {materialCode && hiddenCount > 0 && !showAllPos && (
                    <button
                      type="button"
                      style={{
                        background: 'none', border: 'none', color: '#1478c9', fontSize: 11.5,
                        cursor: 'pointer', padding: 0, fontWeight: 600,
                      }}
                      onClick={() => setShowAllPos(true)}
                    >
                      Show all {pos.results.length} orders
                    </button>
                  )}
                </div>
                <select
                  id="recv-po"
                  className="company-input"
                  style={{ width: '100%', height: 40 }}
                  value={selectedPo?.id || ''}
                  onChange={(e) => {
                    const po = pos.results.find((p) => String(p.id) === e.target.value)
                    if (po) selectPo(po)
                    else setSelectedPo(null)
                  }}
                  disabled={draft != null}
                >
                  <option value="">
                    {visiblePos.length === 0 ? 'No matching order for this material' : 'Choose Purchase Order…'}
                  </option>
                  {visiblePos.map((po) => (
                    <option key={po.id} value={po.id}>
                      {po.reference} — {po.supplier_code} ({po.company_code})
                      {po.expected_delivery_date ? ` · Due: ${po.expected_delivery_date}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {selectedPo && (
                <>
                  <div className="stock-form-grid" style={{ marginBottom: 0 }}>
                    <div>
                      <label className="field-label" style={{ marginBottom: 5, fontSize: 11.5, color: '#64748b' }}>
                        Supplier (derived from order)
                      </label>
                      <input
                        className="company-input"
                        value={selectedPo.supplier_code || '—'}
                        disabled
                        style={{ width: '100%', height: 38, background: '#f8fafc', color: '#334155', fontWeight: 600 }}
                      />
                    </div>
                    <div>
                      <label className="field-label" style={{ marginBottom: 5, fontSize: 11.5, color: '#64748b' }}>
                        Source Company (derived from order)
                      </label>
                      <input
                        className="company-input"
                        value={selectedPo.company_code || '—'}
                        disabled
                        style={{ width: '100%', height: 38, background: '#f8fafc', color: '#334155', fontWeight: 600 }}
                      />
                    </div>
                  </div>

                  {selectedPo.delivery_progress && selectedPo.delivery_progress.length > 1 && (
                    <div>
                      <label className="field-label" htmlFor="recv-line" style={{ marginBottom: 5, fontSize: 12 }}>
                        Order Line *
                      </label>
                      <select
                        id="recv-line"
                        className="company-input"
                        style={{ width: '100%', height: 38 }}
                        value={activeLine?.source_po_line_id || ''}
                        onChange={(e) => {
                          setSelectedLineId(Number(e.target.value))
                          markDirty()
                        }}
                        disabled={draft != null}
                      >
                        {selectedPo.delivery_progress.map((line) => (
                          <option key={line.source_po_line_id} value={line.source_po_line_id}>
                            {line.material_code_snapshot} — {line.material_name_snapshot} ({line.remaining_quantity} {line.unit_code_snapshot} remaining)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="stock-form-grid" style={{ marginBottom: 0 }}>
                    <div>
                      <label className="field-label" htmlFor="recv-arrived-po" style={{ marginBottom: 5, fontSize: 12 }}>
                        Receipt date *
                      </label>
                      <input
                        id="recv-arrived-po"
                        className="company-input"
                        type="datetime-local"
                        value={arrivedAt}
                        onChange={(e) => { setArrivedAt(e.target.value); markDirty() }}
                        disabled={draft?.status === 'POSTED'}
                        style={{ width: '100%', height: 38 }}
                        required
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="recv-qty" style={{ marginBottom: 5, fontSize: 12 }}>
                        Received quantity{unitCode ? ` (${unitCode})` : ''} *
                      </label>
                      <input
                        id="recv-qty"
                        className="company-input"
                        type="number"
                        step="any"
                        min="0"
                        placeholder={activeLine?.delivery_status === 'FULLY_RECEIVED' ? 'Fully received' : 'e.g. 25'}
                        value={receivedQuantity}
                        onChange={(e) => { setReceivedQuantity(e.target.value); markDirty() }}
                        disabled={draft?.status === 'POSTED' || activeLine?.delivery_status === 'FULLY_RECEIVED'}
                        style={{ width: '100%', height: 38 }}
                        required
                      />
                      {activeLine && (
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                          Remaining on order: <strong>{activeLine.remaining_quantity} {unitCode}</strong>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="field-label" htmlFor="recv-invoice" style={{ marginBottom: 5, fontSize: 12 }}>
                        Invoice number
                      </label>
                      <input
                        id="recv-invoice"
                        className="company-input"
                        placeholder="If invoice is available"
                        maxLength={100}
                        value={supplierInvoiceReference}
                        onChange={(e) => { setSupplierInvoiceReference(e.target.value); markDirty() }}
                        disabled={draft?.status === 'POSTED'}
                        style={{ width: '100%', height: 38 }}
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="recv-delivery-note" style={{ marginBottom: 5, fontSize: 12 }}>
                        Delivery note reference
                      </label>
                      <input
                        id="recv-delivery-note"
                        className="company-input"
                        placeholder="If no invoice yet"
                        maxLength={100}
                        value={deliveryNoteReference}
                        onChange={(e) => { setDeliveryNoteReference(e.target.value); markDirty() }}
                        disabled={draft?.status === 'POSTED'}
                        style={{ width: '100%', height: 38 }}
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="recv-lot" style={{ marginBottom: 5, fontSize: 12 }}>
                        Supplier lot reference (optional)
                      </label>
                      <input
                        id="recv-lot"
                        className="company-input"
                        placeholder="e.g. BATCH-7721"
                        maxLength={100}
                        value={lotReference}
                        onChange={(e) => { setLotReference(e.target.value); markDirty() }}
                        disabled={draft?.status === 'POSTED'}
                        style={{ width: '100%', height: 38 }}
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="recv-container" style={{ marginBottom: 5, fontSize: 12 }}>
                        Container (optional)
                      </label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <select
                          id="recv-container"
                          className="company-input"
                          style={{ flex: 1, height: 38 }}
                          value={containerTypeId}
                          onChange={(e) => { setContainerTypeId(e.target.value); markDirty() }}
                          disabled={draft?.status === 'POSTED'}
                        >
                          <option value="">— Container type —</option>
                          {containerTypes.map((ct) => (
                            <option key={ct.id} value={ct.id}>{ct.name || ct.code}</option>
                          ))}
                        </select>
                        <input
                          id="recv-container-qty"
                          className="company-input"
                          type="number"
                          step="1"
                          min="1"
                          style={{ width: 85, height: 38 }}
                          placeholder="Count"
                          value={containerQuantity}
                          onChange={(e) => { setContainerQuantity(e.target.value); markDirty() }}
                          disabled={draft?.status === 'POSTED'}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="field-label" style={{ marginBottom: 5, fontSize: 12 }}>
                        Authorized price (from order)
                      </label>
                      <input
                        className="company-input"
                        value={
                          activeLine?.unit_price != null
                            ? `${activeLine.currency_code || ''} ${activeLine.unit_price} / ${activeLine.pricing_unit_code || unitCode}`
                            : 'Not set on this order line'
                        }
                        disabled
                        style={{ width: '100%', height: 38, background: '#f8fafc', color: '#334155' }}
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="recv-notes" style={{ marginBottom: 5, fontSize: 12 }}>
                        Remarks (optional)
                      </label>
                      <input
                        id="recv-notes"
                        className="company-input"
                        placeholder="Optional remarks"
                        maxLength={2000}
                        value={notes}
                        onChange={(e) => { setNotes(e.target.value); markDirty() }}
                        disabled={draft?.status === 'POSTED'}
                        style={{ width: '100%', height: 38 }}
                      />
                    </div>
                  </div>

                  {receivedQuantity && Number(receivedQuantity) > 0 && (
                    <div className="stock-computed-box" style={{ margin: '8px 0 0' }}>
                      <span>Recorded as:</span>
                      <strong>
                        {receivedQuantity} {unitCode}
                        {containerQuantity ? ` (${containerQuantity} container${containerQuantity > 1 ? 's' : ''})` : ''}
                      </strong>
                    </div>
                  )}

                  {exceedsRemaining && (
                    <div className="stock-alert-insufficient" style={{ margin: '8px 0 0' }}>
                      <span>⚠️</span>
                      <span>Exceeds remaining quantity on this order line ({remainingQty} {unitCode}). Over-receipt is rejected by server policy.</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Themed close-guard dialog */}
      {ConfirmNode}
    </Modal>
  )
}
