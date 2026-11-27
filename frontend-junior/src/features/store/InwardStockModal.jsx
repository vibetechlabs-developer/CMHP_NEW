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
  const [poSearch, setPoSearch] = useState('')
  const [poPage, setPoPage] = useState(1)
  const [showAllPos, setShowAllPos] = useState(false)
  const [selectedPo, setSelectedPo] = useState(null)
  const [selectedLineId, setSelectedLineId] = useState(null)
  const [poLines, setPoLines] = useState({}) // { [source_po_line_id]: { selected: boolean, received_quantity: string, lot_reference: string } }
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

  const selectPo = (po) => {
    setSelectedPo(po)
    markDirty()
    if (po && po.delivery_progress && po.delivery_progress.length > 0) {
      const match = materialCode
        ? po.delivery_progress.find((l) => l.material_code_snapshot === materialCode)
        : null
      const defaultLine = match || po.delivery_progress[0]
      setSelectedLineId(defaultLine?.source_po_line_id || null)

      // Auto-select all lines that have remaining_quantity > 0 and prefill quantity
      const initial = {}
      po.delivery_progress.forEach((l) => {
        const rem = Number(l.remaining_quantity) || 0
        const isPending = rem > 0
        initial[l.source_po_line_id] = {
          selected: isPending,
          received_quantity: isPending ? String(rem) : '0',
          lot_reference: '',
        }
      })
      setPoLines(initial)
      if (defaultLine) {
        setReceivedQuantity(String(Number(defaultLine.remaining_quantity) || 0))
      }
    } else {
      setSelectedLineId(null)
      setPoLines({})
      setReceivedQuantity('')
    }
  }

  const handleToggleSelectAll = (checked) => {
    if (!selectedPo || !Array.isArray(selectedPo.delivery_progress)) return
    setPoLines((prev) => {
      const next = { ...prev }
      selectedPo.delivery_progress.forEach((l) => {
        const rem = Number(l.remaining_quantity) || 0
        if (rem > 0) {
          next[l.source_po_line_id] = {
            ...(next[l.source_po_line_id] || {}),
            selected: checked,
            received_quantity: checked
              ? (next[l.source_po_line_id]?.received_quantity && Number(next[l.source_po_line_id]?.received_quantity) > 0
                  ? next[l.source_po_line_id].received_quantity
                  : String(rem))
              : '',
          }
        }
      })
      return next
    })
    markDirty()
  }

  const handleSelectAllRemaining = () => {
    if (!selectedPo || !Array.isArray(selectedPo.delivery_progress)) return
    setPoLines((prev) => {
      const next = { ...prev }
      selectedPo.delivery_progress.forEach((l) => {
        const rem = Number(l.remaining_quantity) || 0
        if (rem > 0) {
          next[l.source_po_line_id] = {
            ...(next[l.source_po_line_id] || {}),
            selected: true,
            received_quantity: String(rem),
          }
        }
      })
      return next
    })
    markDirty()
  }

  const handleClearAll = () => {
    if (!selectedPo || !Array.isArray(selectedPo.delivery_progress)) return
    setPoLines((prev) => {
      const next = { ...prev }
      selectedPo.delivery_progress.forEach((l) => {
        next[l.source_po_line_id] = {
          ...(next[l.source_po_line_id] || {}),
          selected: false,
          received_quantity: '',
        }
      })
      return next
    })
    markDirty()
  }

  const handleUpdateLine = (lineId, field, val) => {
    setPoLines((prev) => ({
      ...prev,
      [lineId]: {
        ...(prev[lineId] || {}),
        [field]: val,
      },
    }))
    markDirty()
  }

  const targetPoId = prefillPoId || prefillPo?.id || initialDraft?.source_purchase_order_id ||
    (editReceiptId ? draft?.source_purchase_order_id : null)
  const draftSourceId = initialDraft?.source_purchase_order_id || (editReceiptId ? draft?.source_purchase_order_id : null)

  useEffect(() => {
    if (!storeId || !targetPoId) return
    let cancelled = false
    listEligiblePurchaseOrders(storeId, { orderId: targetPoId, pageSize: 1 })
      .then((data) => {
        if (cancelled) return
        const po = data.results.find((item) => String(item.id) === String(targetPoId)) || prefillPo
        if (po?.delivery_progress) {
          if (draftSourceId) setSelectedPo(po)
          else selectPo(po)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err))
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, targetPoId, draftSourceId, prefillPo])

  useEffect(() => {
    if (!storeId || mode !== 'po') return
    let cancelled = false
    setPos({ loading: true, results: [], error: '' })
    const search = poSearch.trim()
    const timer = setTimeout(() => {
      listEligiblePurchaseOrders(storeId, {
        page: poPage,
        pageSize: 20,
        search,
        materialCode: showAllPos ? undefined : materialCode,
      })
        .then((data) => {
          if (cancelled) return
          const results = data.results || []
          setPos({ loading: false, results, next: data.next, error: '' })
          if (!targetPoId && !selectedPo && materialCode && !showAllPos && !search &&
              poPage === 1 && results.length === 1 && !data.next) {
            selectPo(results[0])
          }
        })
        .catch((err) => {
          if (!cancelled) setPos({ loading: false, results: [], error: getErrorMessage(err) })
        })
    }, search ? 300 : 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, mode, poSearch, poPage, showAllPos, materialCode, targetPoId])

  useEffect(() => {
    if (initialDraft) {
      setDraft(initialDraft)
      if (initialDraft.arrived_at) setArrivedAt(toLocalDateTimeInput(initialDraft.arrived_at))
      if (initialDraft.supplier_invoice_reference) setSupplierInvoiceReference(initialDraft.supplier_invoice_reference)
      if (initialDraft.delivery_note_reference) setDeliveryNoteReference(initialDraft.delivery_note_reference)
      if (initialDraft.notes) setNotes(initialDraft.notes)
      if (Array.isArray(initialDraft.lines) && initialDraft.lines.length > 0) {
        const populated = {}
        initialDraft.lines.forEach((l) => {
          if (l.source_po_line_id) {
            populated[l.source_po_line_id] = {
              selected: true,
              received_quantity: String(l.received_quantity || ''),
              lot_reference: l.lot_reference || '',
              container_type_id: l.container_type_id ? String(l.container_type_id) : '',
              container_quantity: l.container_quantity ? String(l.container_quantity) : '',
            }
          }
        })
        setPoLines(populated)
        const line = initialDraft.lines[0]
        if (line.received_quantity) setReceivedQuantity(String(line.received_quantity))
        if (line.lot_reference) setLotReference(line.lot_reference || '')
        if (line.container_type_id) setContainerTypeId(String(line.container_type_id))
        if (line.container_quantity) setContainerQuantity(String(line.container_quantity))
        if (line.source_po_line_id) setSelectedLineId(line.source_po_line_id)
      }
    }
  }, [initialDraft])

  const visiblePos = selectedPo && !pos.results.some((po) => po.id === selectedPo.id)
    ? [selectedPo, ...pos.results]
    : pos.results

  const activeLine = selectedPo?.delivery_progress?.find(
    (l) => l.source_po_line_id === selectedLineId
  ) || selectedPo?.delivery_progress?.[0]

  const unitCode = mode === 'po' ? (activeLine?.unit_code_snapshot || '') : (materialBaseUnitCode || 'L')
  const remainingQty = activeLine?.remaining_quantity != null ? Number(activeLine.remaining_quantity) : null
  const exceedsRemaining = mode === 'po' && remainingQty != null && Number(receivedQuantity) > remainingQty

  const isMultiLine = mode === 'po' && selectedPo && Array.isArray(selectedPo.delivery_progress) && selectedPo.delivery_progress.length > 1

  const eligibleLines = selectedPo?.delivery_progress?.filter((l) => Number(l.remaining_quantity) > 0) || []
  const selectedCount = eligibleLines.filter((l) => poLines[l.source_po_line_id]?.selected).length
  const isAllSelected = eligibleLines.length > 0 && selectedCount === eligibleLines.length
  const isPartiallySelected = selectedCount > 0 && selectedCount < eligibleLines.length

  const buildLines = () => {
    if (mode === 'po') {
      if (!selectedPo || !Array.isArray(selectedPo.delivery_progress)) return []
      if (isMultiLine) {
        const result = []
        selectedPo.delivery_progress.forEach((line) => {
          const lState = poLines[line.source_po_line_id]
          if (lState?.selected && Number(lState.received_quantity) > 0) {
            result.push({
              source_po_line_id: line.source_po_line_id,
              received_quantity: String(lState.received_quantity),
              lot_reference: (lState.lot_reference || lotReference || '').trim(),
              container_type_id: containerTypeId ? Number(containerTypeId) : null,
              container_quantity: containerQuantity ? Number(containerQuantity) : null,
            })
          }
        })
        return result
      }

      // Single line PO mode
      const line = activeLine || selectedPo.delivery_progress[0]
      const lState = line ? poLines[line.source_po_line_id] : null
      const qty = receivedQuantity || lState?.received_quantity || ''
      if (!line || !qty || Number(qty) <= 0) return []
      return [
        {
          source_po_line_id: line.source_po_line_id,
          received_quantity: String(qty),
          lot_reference: ((lState?.lot_reference) || lotReference || '').trim(),
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

  const saveDraft = async ({ suppressOnCreated = false } = {}) => {
    if (savingRef.current) return null
    const lines = buildLines()
    if (mode === 'po' && (!selectedPo || lines.length === 0 || !arrivedAt)) {
      setError('Select a purchase order, enter a positive received quantity, and confirm the receipt date.')
      return null
    }
    if (mode === 'direct' && (lines.length === 0 || !arrivedAt)) {
      setError('Enter a positive received quantity and confirm the receipt date.')
      return null
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
      if (!suppressOnCreated && onCreated) onCreated(receipt)
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
      setError(`Receipt ${rcpt.reference} was created, but posting failed: ${getErrorMessage(err)}`)
    } finally {
      postingRef.current = false
      setPosting(false)
    }
  }

  const handleSaveAndPost = async () => {
    const saved = await saveDraft({ suppressOnCreated: true })
    if (saved?.id) {
      await doPost(saved)
    }
  }

  const saving_or_posting = saving || posting
  const title = draft
    ? `📥 Receipt Draft · ${draft.reference}${materialCode ? ` — ${materialCode}` : ''}`
    : `📥 New Inward Receipt${materialCode ? ` — ${materialCode}` : ''}`

  const selectedLinesCount = isMultiLine
    ? (selectedPo?.delivery_progress || []).filter((line) => {
        const lState = poLines[line.source_po_line_id]
        return lState?.selected && Number(lState?.received_quantity) > 0
      }).length
    : (Number(receivedQuantity) > 0 ? 1 : 0)

  const hasOverReceipt = mode === 'po' && selectedPo?.delivery_progress?.some((line) => {
    if (isMultiLine) {
      const lState = poLines[line.source_po_line_id]
      if (!lState || !lState.selected) return false
      const rem = Number(line.remaining_quantity) || 0
      return Number(lState.received_quantity) > rem
    }
    return exceedsRemaining
  })

  const isFormValid =
    !saving_or_posting &&
    Boolean(arrivedAt) &&
    (draft == null || draft.status === 'DRAFT') &&
    (mode === 'direct'
      ? Boolean(receivedQuantity) && Number(receivedQuantity) > 0
      : Boolean(selectedPo) && (isMultiLine ? selectedLinesCount > 0 : Boolean(receivedQuantity) && Number(receivedQuantity) > 0))

  return (
    <Modal
      title={title}
      onClose={saving_or_posting ? () => {} : requestClose}
      maxWidth={isMultiLine ? '880px' : '680px'}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={requestClose} disabled={saving_or_posting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => saveDraft()}
            disabled={!isFormValid || (draft != null && draft.status !== 'DRAFT')}
            loading={saving}
          >
            {draft ? 'Update Draft' : 'Save Draft'}
          </Button>
          {!draft && (
            <button
              type="button"
              className="btn btn-primary"
              style={{
                background: '#16a34a',
                borderColor: '#15803d',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: 13,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 16px',
                borderRadius: 6,
                cursor: !isFormValid || hasOverReceipt ? 'not-allowed' : 'pointer',
                opacity: !isFormValid || hasOverReceipt ? 0.6 : 1,
              }}
              onClick={handleSaveAndPost}
              disabled={!isFormValid || hasOverReceipt || saving_or_posting}
            >
              <span>✅</span> {posting ? 'Posting to Stock…' : saving ? 'Saving…' : 'Save & Post to Stock'}
            </button>
          )}
          {draft && draft.status === 'DRAFT' && (
            <Button
              type="button"
              onClick={() => doPost(draft)}
              disabled={saving_or_posting || !canPost || hasOverReceipt}
              loading={posting}
              title={
                !canPost
                  ? 'You need receiving.post permission — ask your administrator.'
                  : hasOverReceipt
                    ? 'Quantity exceeds remaining order quantity.'
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
          {!draft && (
            <div className="stock-form-full" style={{ marginBottom: 12 }}>
              <input
                type="search"
                className="company-input"
                aria-label="Search eligible purchase orders"
                placeholder="Search PO reference or supplier code"
                value={poSearch}
                onChange={(e) => { setPoSearch(e.target.value); setPoPage(1) }}
              />
              {materialCode && (
                <Button type="button" variant="secondary" onClick={() => {
                  setShowAllPos(!showAllPos)
                  setPoPage(1)
                }}>
                  {showAllPos ? 'Show orders for this material' : 'Show all orders'}
                </Button>
              )}
              {(poPage > 1 || pos.next) && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                  <Button type="button" variant="secondary" disabled={poPage === 1 || pos.loading} onClick={() => setPoPage(poPage - 1)}>Previous</Button>
                  <span>Page {poPage}</span>
                  <Button type="button" variant="secondary" disabled={!pos.next || pos.loading} onClick={() => setPoPage(poPage + 1)}>Next</Button>
                </div>
              )}
            </div>
          )}
          {pos.error && <Alert type="error">{pos.error}</Alert>}
          {pos.loading && !selectedPo ? (
            <LoadingState label="Loading eligible purchase orders…" compact />
          ) : visiblePos.length === 0 ? (
            <div style={{ padding: '20px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📦</div>
              <h4 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: 15, fontWeight: 700 }}>
                No Matching Purchase Order
              </h4>
              <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13, lineHeight: 1.5 }}>
                No issued purchase orders match the current filters.
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
                </div>
                <select
                  id="recv-po"
                  className="company-input"
                  style={{ width: '100%', height: 40 }}
                  value={selectedPo?.id || ''}
                  onChange={(e) => {
                    const po = visiblePos.find((p) => String(p.id) === e.target.value)
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
                  {isMultiLine ? (
                    <>
                      {/* Header Grid: Supplier, Company, Receipt Date, Invoice Reference */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                        gap: 10,
                        background: '#f8fafc',
                        padding: '12px 14px',
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                      }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 3 }}>
                            Supplier
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                            {selectedPo.supplier_code || '—'}
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 3 }}>
                            Source Company
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                            {selectedPo.company_code || '—'}
                          </div>
                        </div>

                        <div>
                          <label htmlFor="recv-arrived-po" style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 3 }}>
                            Receipt Date *
                          </label>
                          <input
                            id="recv-arrived-po"
                            type="datetime-local"
                            className="company-input"
                            style={{ height: 32, fontSize: 12, width: '100%' }}
                            value={arrivedAt}
                            onChange={(e) => { setArrivedAt(e.target.value); markDirty(); }}
                            disabled={draft?.status === 'POSTED'}
                            required
                          />
                        </div>

                        <div>
                          <label htmlFor="recv-invoice" style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 3 }}>
                            Invoice / Challan Ref
                          </label>
                          <input
                            id="recv-invoice"
                            type="text"
                            className="company-input"
                            style={{ height: 32, fontSize: 12, width: '100%' }}
                            placeholder="e.g. GST/2026/01"
                            value={supplierInvoiceReference}
                            onChange={(e) => { setSupplierInvoiceReference(e.target.value); markDirty(); }}
                            disabled={draft?.status === 'POSTED'}
                          />
                        </div>
                      </div>

                      {/* Multi-line Inward Table */}
                      <div style={{ border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden', background: '#ffffff' }}>
                        {/* Toolbar */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          background: '#f1f5f9',
                          borderBottom: '1px solid #e2e8f0',
                          flexWrap: 'wrap',
                          gap: 8,
                        }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#0f172a', margin: 0 }}>
                            <input
                              type="checkbox"
                              style={{ width: 17, height: 17, cursor: 'pointer', accentColor: '#2563eb' }}
                              checked={isAllSelected}
                              ref={(el) => { if (el) el.indeterminate = isPartiallySelected }}
                              onChange={(e) => handleToggleSelectAll(e.target.checked)}
                              disabled={draft?.status === 'POSTED' || eligibleLines.length === 0}
                            />
                            <span>Select All Lines ({selectedLinesCount} of {selectedPo.delivery_progress.length} selected)</span>
                          </label>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '4px 10px', fontSize: 11.5, height: 28, background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe', fontWeight: 700 }}
                              onClick={handleSelectAllRemaining}
                              disabled={draft?.status === 'POSTED' || eligibleLines.length === 0}
                            >
                              ⚡ Select All Remaining
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: 11.5, height: 28, background: '#ffffff', color: '#64748b' }}
                              onClick={handleClearAll}
                              disabled={draft?.status === 'POSTED' || selectedLinesCount === 0}
                            >
                              Clear All
                            </button>
                          </div>
                        </div>

                        {/* Table */}
                        <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
                            <thead>
                              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: 11.5 }}>
                                <th style={{ width: 44, padding: '8px 10px', textAlign: 'center' }}>✓</th>
                                <th style={{ padding: '8px 10px' }}>Item / Raw Material</th>
                                <th style={{ width: 130, padding: '8px 10px', textAlign: 'right' }}>Remaining Qty</th>
                                <th style={{ width: 160, padding: '8px 10px' }}>Receive Qty *</th>
                                <th style={{ width: 200, padding: '8px 10px' }}>Supplier Lot / Batch</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedPo.delivery_progress.map((line, idx) => {
                                const lineId = line.source_po_line_id
                                const lineState = poLines[lineId] || {}
                                const isSelected = Boolean(lineState.selected)
                                const rem = Number(line.remaining_quantity) || 0
                                const isFullyReceived = rem <= 0
                                const recQty = lineState.received_quantity ?? ''
                                const isOver = isSelected && Number(recQty) > rem

                                return (
                                  <tr
                                    key={lineId || idx}
                                    style={{
                                      borderBottom: '1px solid #f1f5f9',
                                      background: isSelected ? '#f0fdf4' : isFullyReceived ? '#f8fafc' : '#ffffff',
                                      opacity: isFullyReceived ? 0.6 : 1,
                                      transition: 'background 0.15s ease',
                                    }}
                                  >
                                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                      <input
                                        type="checkbox"
                                        style={{ width: 16, height: 16, cursor: isFullyReceived ? 'not-allowed' : 'pointer', accentColor: '#16a34a' }}
                                        checked={isSelected}
                                        disabled={isFullyReceived || draft?.status === 'POSTED'}
                                        onChange={(e) => {
                                          const checked = e.target.checked
                                          handleUpdateLine(lineId, 'selected', checked)
                                          if (checked && (!lineState.received_quantity || Number(lineState.received_quantity) <= 0)) {
                                            handleUpdateLine(lineId, 'received_quantity', String(rem))
                                          }
                                        }}
                                      />
                                    </td>
                                    <td style={{ padding: '8px 10px' }}>
                                      <div style={{ fontWeight: 700, color: '#0f172a' }}>
                                        {line.material_code_snapshot}
                                      </div>
                                      <div style={{ fontSize: 11.5, color: '#475569' }}>
                                        {line.material_name_snapshot}
                                      </div>
                                    </td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                      {isFullyReceived ? (
                                        <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '2px 6px', borderRadius: 4 }}>
                                          Received
                                        </span>
                                      ) : (
                                        <span style={{ fontWeight: 700, color: '#0f172a' }}>
                                          {rem} <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>{line.unit_code_snapshot}</span>
                                        </span>
                                      )}
                                    </td>
                                    <td style={{ padding: '8px 10px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <input
                                          type="number"
                                          step="any"
                                          min="0"
                                          className="company-input"
                                          style={{
                                            width: '100%',
                                            height: 32,
                                            fontSize: 12.5,
                                            fontWeight: 600,
                                            borderColor: isOver ? '#ef4444' : isSelected ? '#16a34a' : '#cbd5e1',
                                            background: isSelected ? '#ffffff' : '#f8fafc',
                                          }}
                                          value={recQty}
                                          placeholder="0"
                                          disabled={!isSelected || isFullyReceived || draft?.status === 'POSTED'}
                                          onChange={(e) => handleUpdateLine(lineId, 'received_quantity', e.target.value)}
                                        />
                                        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, minWidth: 20 }}>
                                          {line.unit_code_snapshot}
                                        </span>
                                      </div>
                                      {isOver && (
                                        <div style={{ fontSize: 10.5, color: '#ef4444', fontWeight: 600, marginTop: 2 }}>
                                          Max: {rem} {line.unit_code_snapshot}
                                        </div>
                                      )}
                                    </td>
                                    <td style={{ padding: '8px 10px' }}>
                                      <input
                                        type="text"
                                        className="company-input"
                                        style={{
                                          width: '100%',
                                          height: 32,
                                          fontSize: 12,
                                          background: isSelected ? '#ffffff' : '#f8fafc',
                                        }}
                                        placeholder="e.g. LOT-2026/01"
                                        value={lineState.lot_reference || ''}
                                        disabled={!isSelected || isFullyReceived || draft?.status === 'POSTED'}
                                        onChange={(e) => handleUpdateLine(lineId, 'lot_reference', e.target.value)}
                                      />
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Delivery note & Remarks */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <label htmlFor="recv-delivery-note" style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>
                            Delivery Note Ref (optional)
                          </label>
                          <input
                            id="recv-delivery-note"
                            className="company-input"
                            style={{ height: 34, fontSize: 12, width: '100%' }}
                            placeholder="Challan / LR number"
                            maxLength={100}
                            value={deliveryNoteReference}
                            onChange={(e) => { setDeliveryNoteReference(e.target.value); markDirty(); }}
                            disabled={draft?.status === 'POSTED'}
                          />
                        </div>
                        <div>
                          <label htmlFor="recv-notes" style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>
                            Remarks / Notes (optional)
                          </label>
                          <input
                            id="recv-notes"
                            className="company-input"
                            style={{ height: 34, fontSize: 12, width: '100%' }}
                            placeholder="e.g. Received in sound condition"
                            maxLength={2000}
                            value={notes}
                            onChange={(e) => { setNotes(e.target.value); markDirty(); }}
                            disabled={draft?.status === 'POSTED'}
                          />
                        </div>
                      </div>

                      {/* Selected count info & Over-receipt alert */}
                      {selectedLinesCount > 0 && !hasOverReceipt && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          background: '#f0fdf4',
                          border: '1px solid #bbf7d0',
                          borderRadius: 6,
                          color: '#166534',
                          fontSize: 12.5,
                          fontWeight: 600,
                        }}>
                          <span>✓ {selectedLinesCount} line(s) selected and ready for inwarding.</span>
                          <span>Click <strong>Save Draft</strong> or <strong>Save & Post to Stock</strong> below.</span>
                        </div>
                      )}

                      {hasOverReceipt && (
                        <div style={{
                          padding: '8px 12px',
                          background: '#fef2f2',
                          border: '1px solid #fecaca',
                          borderRadius: 6,
                          color: '#991b1b',
                          fontSize: 12.5,
                          fontWeight: 600,
                        }}>
                          ⚠️ One or more items exceed their remaining order quantity. Over-receipt is rejected by server policy.
                        </div>
                      )}
                    </>
                  ) : (
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
                            onChange={(e) => { setArrivedAt(e.target.value); markDirty(); }}
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
                            aria-label="Received quantity"
                            className="company-input"
                            type="number"
                            step="any"
                            min="0"
                            placeholder={activeLine?.delivery_status === 'FULLY_RECEIVED' ? 'Fully received' : 'e.g. 25'}
                            value={receivedQuantity}
                            onChange={(e) => {
                              const val = e.target.value
                              setReceivedQuantity(val)
                              if (activeLine?.source_po_line_id) {
                                handleUpdateLine(activeLine.source_po_line_id, 'received_quantity', val)
                              }
                              markDirty()
                            }}
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
                            onChange={(e) => { setSupplierInvoiceReference(e.target.value); markDirty(); }}
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
                            onChange={(e) => { setDeliveryNoteReference(e.target.value); markDirty(); }}
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
                            onChange={(e) => {
                              const val = e.target.value
                              setLotReference(val)
                              if (activeLine?.source_po_line_id) {
                                handleUpdateLine(activeLine.source_po_line_id, 'lot_reference', val)
                              }
                              markDirty()
                            }}
                            disabled={draft?.status === 'POSTED'}
                            style={{ width: '100%', height: 38 }}
                          />
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
                            onChange={(e) => { setNotes(e.target.value); markDirty(); }}
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
