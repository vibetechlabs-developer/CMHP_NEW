import { confirmAction } from '../../components/ConfirmProvider'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import RequirementCalculator from '../formulas/RequirementCalculator'
import FormulasPage from '../formulas/FormulasPage'
import BmrPanel from '../bmr/BmrPanel'

import Modal from '../inventory/components/Modal'
import Button from '../../components/Button'
import Alert from '../../components/Alert'
import AsyncSearchSelect from './AsyncSearchSelect'
import CustomerFormModal from './CustomerFormModal'
import './SalesOrderFormModal.css'

import { createSalesOrder, getSalesOrder, updateSalesOrder } from './salesOrdersService'
import { searchCustomers, searchProducts } from './catalogLookupService'
import { listProductTypes } from './productTypesService'
import {
  allocateBatchNumber,
  createBatchPlan,
  getBatchPlan,
  listApprovedRevisionsForProduct,
  listBatchPlansForOrder,
  updateBatchPlan,
} from './batchPlansService'
import {
  createPreparation,
  getRequisitionStatus,
  requisitionStatusText,
  getStorePermissionCodes,
  listMyStores,
  listPreparationsForLine,
  listPreparationsForPlan,
  updatePreparation,
} from './storePreparationService'
import { listPlanningUnits } from './unitsLookupService'
import { getErrorMessage } from '../../utils/errors'

const NEW_PLAN = 'new'

const INSERT_OPTIONS = [
  { value: 'NOT_SPECIFIED', label: 'Not specified' },
  { value: 'REQUIRED', label: 'Required' },
  { value: 'NOT_REQUIRED', label: 'Not required' },
]

const insertToValue = (insertRequired) => {
  if (insertRequired === true) return 'REQUIRED'
  if (insertRequired === false) return 'NOT_REQUIRED'
  return 'NOT_SPECIFIED'
}

const valueToInsert = (value) => {
  if (value === 'REQUIRED') return true
  if (value === 'NOT_REQUIRED') return false
  return null
}

const todayIso = () => new Date().toISOString().slice(0, 10)

function emptyLine() {
  return { localId: `new-${Math.random().toString(36).slice(2)}`, id: null, product: null, productType: '', quantity: '', unit_price: '', description: '' }
}

function emptyOrderForm() {
  return {
    customer: null,
    order_date: todayIso(),
    requested_delivery_date: '',
    planned_manufacturing_date: '',
    customer_order_reference: '',
    currency: 'INR',
    notes: '',
    lines: [emptyLine()],
  }
}

function orderFormFromOrder(order) {
  return {
    customer: { id: order.customer_id, label: order.customer_name, code: order.customer_code, meta: order.customer_code },
    order_date: order.order_date,
    requested_delivery_date: order.requested_delivery_date || '',
    planned_manufacturing_date: order.planned_manufacturing_date || '',
    customer_order_reference: order.customer_order_reference || '',
    currency: order.currency,
    notes: order.notes || '',
    lines: order.lines.length
      ? order.lines.map((line) => ({
          localId: `existing-${line.id}`,
          id: line.id,
          productType: line.product_type_snapshot || '',
          product: { id: line.product_id, label: line.product_name, code: line.product_code, salesUomCode: line.sales_uom_code, meta: line.product_code },
          quantity: line.quantity,
          unit_price: line.unit_price,
          description: line.description || '',
        }))
      : [emptyLine()],
  }
}

function emptyBatchForm() {
  return {
    mrp_for_printing: '',
    printing_status_note: '',
    revisionId: '',
    target_output_quantity: '',
    planned_manufacturing_date: '',
    packing_size_note: '',
    notes: '',
    planned_pack_quantity: '',
    packing_content_quantity: '',
    packing_content_uom: null,
  }
}

function batchFormFromPlan(plan) {
  return {
    mrp_for_printing: plan.mrp_for_printing ?? '',
    printing_status_note: plan.printing_status_note || '',
    revisionId: plan.formula_revision_id,
    target_output_quantity: plan.target_output_quantity,
    planned_manufacturing_date: plan.planned_manufacturing_date || '',
    packing_size_note: plan.packing_size_note || '',
    notes: plan.notes || '',
    planned_pack_quantity: plan.planned_pack_quantity ?? '',
    packing_content_quantity: plan.packing_content_quantity ?? '',
    packing_content_uom: plan.packing_content_uom_id
      ? { id: plan.packing_content_uom_id, label: plan.packing_content_uom_code, meta: '' }
      : null,
  }
}

function emptyStoreForm() {
  return { packing_type: '', label_note: '', box_note: '', insert: 'NOT_SPECIFIED' }
}

function storeFormFromPreparation(prep) {
  return {
    packing_type: prep?.packing_type || '',
    label_note: prep?.label_note || '',
    box_note: prep?.box_note || '',
    insert: insertToValue(prep ? prep.insert_required : null),
  }
}

function parseFieldErrors(error) {
  const data = error?.response?.data
  if (!data || typeof data !== 'object') return {}
  const map = {}
  for (const [field, value] of Object.entries(data)) {
    if (field === 'detail') continue
    map[field] = Array.isArray(value) ? value.join(' ') : String(value)
  }
  return map
}

// A line with any content must be complete. Incomplete lines are rejected,
// never dropped, because the server replaces the whole line set on edit.
function validateLines(lines) {
  const problems = []
  lines.forEach((line, index) => {
    const hasContent = line.product || line.quantity !== '' || line.unit_price !== ''
    if (!hasContent) return
    if (!line.product) problems.push(`Line ${index + 1}: choose a product.`)
    if (!/^[1-9]\d*$/.test(String(line.quantity))) problems.push(`Line ${index + 1}: order quantity must be a whole number greater than 0.`)
    if (line.unit_price === '' || Number(line.unit_price) < 0) problems.push(`Line ${index + 1}: enter a unit price.`)
  })
  if (!lines.some((line) => line.product)) problems.push('Add at least one product line.')
  return problems
}

function Field({ label, htmlFor, full = false, error, action = null, children }) {
  return (
    <div className={`field${full ? ' field-full' : ''}`}>
      <div className="sof-label-row">
        <label className="field-label" htmlFor={htmlFor}>
          {label}
        </label>
        {action}
      </div>
      {children}
      {error && <span className="field-error">{error}</span>}
    </div>
  )
}

function ReadOnly({ label, value, muted = false, title }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className={`field-input field-readonly${muted ? ' is-muted' : ''}`} title={title} aria-label={label}>
        {value}
      </div>
    </div>
  )
}

export default function SalesOrderFormModal({ realCompanyId, companyCode, companyName, orderId, permissions, onClose, onSaved }) {
  // ----- Order (sales_orders) -----
  const [currentOrderId, setCurrentOrderId] = useState(orderId)
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(Boolean(orderId))
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [orderForm, setOrderForm] = useState(emptyOrderForm)
  const [orderSnapshot, setOrderSnapshot] = useState(() => JSON.stringify(orderForm))
  const [selectedLineId, setSelectedLineId] = useState(null)
  const [orderBusy, setOrderBusy] = useState(false)
  const [orderErrors, setOrderErrors] = useState({})
  const [orderConflict, setOrderConflict] = useState(false)
  const [addingCustomer, setAddingCustomer] = useState(false)
  const [lastResult, setLastResult] = useState('')
  // Why the last save was refused. Shown in the form body, never hidden by the footer status.
  const [orderProblems, setOrderProblems] = useState([])
  // Success popup shown after a successful order save.
  const [savedPopup, setSavedPopup] = useState(null)
  const [typeOptions, setTypeOptions] = useState([])

  // ----- Batch plan (batch_plans) -----
  const [plans, setPlans] = useState([])
  const [plansError, setPlansError] = useState('')
  const [planId, setPlanId] = useState(null)
  const [plan, setPlan] = useState(null)
  const [batchForm, setBatchForm] = useState(emptyBatchForm)
  const [batchSnapshot, setBatchSnapshot] = useState(() => JSON.stringify(emptyBatchForm()))
  const [revisions, setRevisions] = useState([])
  const [revisionsError, setRevisionsError] = useState('')
  const [revisionsRetry, setRevisionsRetry] = useState(0)
  const revisionScopeRef = useRef(null)
  const [formulasOpen, setFormulasOpen] = useState(false)
  // Legacy batch-specific store record for the selected plan. Read-only and
  // kept apart from the order-line store fields; never merged into them.
  const [legacyPrep, setLegacyPrep] = useState(null)
  const [unitsBlocked, setUnitsBlocked] = useState('')
  const [unitsRetry, setUnitsRetry] = useState(0)
  const [batchBusy, setBatchBusy] = useState(false)
  const [allocating, setAllocating] = useState(false)
  const [batchErrors, setBatchErrors] = useState({})
  const [batchConflict, setBatchConflict] = useState(false)
  const [batchMessage, setBatchMessage] = useState('')

  // ----- Store preparation (store_preparation) -----
  const [stores, setStores] = useState([])
  const [storesError, setStoresError] = useState('')
  const [storeId, setStoreId] = useState('')
  const [storeCodes, setStoreCodes] = useState([])
  const [storeCodesLoaded, setStoreCodesLoaded] = useState(false)
  // Derived before any effect or dependency array reads it.
  const canReadStore = storeCodes.includes('store_preparation.view')
  const [prep, setPrep] = useState(null)
  const [storeForm, setStoreForm] = useState(emptyStoreForm)
  const [storeSnapshot, setStoreSnapshot] = useState(() => JSON.stringify(emptyStoreForm()))
  const [requisition, setRequisition] = useState({ state: '', row: null })
  const [prepError, setPrepError] = useState('')
  const [storeBusy, setStoreBusy] = useState(false)
  const [storeErrors, setStoreErrors] = useState('')
  const [storeConflict, setStoreConflict] = useState(false)
  const [storeMessage, setStoreMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    listProductTypes()
      .then((rows) => !cancelled && setTypeOptions(rows))
      .catch(() => !cancelled && setTypeOptions([]))
    return () => {
      cancelled = true
    }
  }, [])

  // ----- Loading -----
  useEffect(() => {
    if (!currentOrderId) {
      setOrder(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setLoadError('')
    getSalesOrder(realCompanyId, currentOrderId)
      .then((detail) => {
        if (cancelled) return
        setOrder(detail)
        setLoading(false)
      })
      .catch((error) => {
        if (cancelled) return
        setLoadError(getErrorMessage(error))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [currentOrderId, realCompanyId, reloadKey])

  // Hydrate the order form from the server whenever the saved order changes.
  useEffect(() => {
    const next = order ? orderFormFromOrder(order) : emptyOrderForm()
    setOrderForm(next)
    setOrderSnapshot(JSON.stringify(next))
    setSelectedLineId(next.lines[0].localId)
  }, [order])

  // The plan list loads once per order id. It never depends on the whole
  // `order` object, which changes after every save and must not reset the
  // user's plan or unsaved batch edits.
  const loadedOrderId = order?.id ?? null
  const [autoPlanId, setAutoPlanId] = useState(null)
  const planIdRef = useRef(null)
  useEffect(() => {
    planIdRef.current = planId
  }, [planId])

  useEffect(() => {
    if (!loadedOrderId || !permissions.canViewBatch) return
    let cancelled = false
    listBatchPlansForOrder(realCompanyId, loadedOrderId)
      .then((rows) => {
        if (cancelled) return
        setPlans(rows)
        setPlansError('')
        // Pre-select the first plan only when the user has not chosen one yet.
        if (rows.length > 0 && planIdRef.current === null) setAutoPlanId(rows[0].id)
      })
      .catch((error) => !cancelled && setPlansError(getErrorMessage(error)))
    return () => {
      cancelled = true
    }
  }, [loadedOrderId, realCompanyId, permissions.canViewBatch])

  // Loads the auto-selected plan's detail. Runs only when that id changes, so
  // it never overwrites a plan the user picked or unsaved batch edits.
  useEffect(() => {
    if (typeof autoPlanId !== 'number') return
    let cancelled = false
    getBatchPlan(realCompanyId, autoPlanId)
      .then((detail) => {
        if (cancelled) return
        const next = batchFormFromPlan(detail)
        setPlanId(autoPlanId)
        setPlan(detail)
        setBatchForm(next)
        setBatchSnapshot(JSON.stringify(next))
      })
      .catch((error) => !cancelled && setBatchMessage(getErrorMessage(error)))
    return () => {
      cancelled = true
    }
  }, [autoPlanId, realCompanyId])

  // Units for batch planning come from the company-scoped planning lookup
  // (batch_plans.view). A failed load is shown with a Retry action.
  useEffect(() => {
    if (!realCompanyId || !permissions.canViewBatch) return
    let cancelled = false
    listPlanningUnits(realCompanyId)
      .then(() => !cancelled && setUnitsBlocked(''))
      .catch(() => !cancelled && setUnitsBlocked('failed'))
    return () => {
      cancelled = true
    }
  }, [realCompanyId, permissions.canViewBatch, unitsRetry])

  useEffect(() => {
    let cancelled = false
    listMyStores()
      .then((rows) => {
        if (cancelled) return
        setStores(rows)
        if (rows.length) setStoreId((current) => current || String(rows[0].id))
      })
      .catch((error) => !cancelled && setStoresError(getErrorMessage(error)))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!storeId) return
    let cancelled = false
    setStoreCodesLoaded(false)
    getStorePermissionCodes(storeId)
      .then((codes) => {
        if (cancelled) return
        setStoreCodes(codes)
        setStoreCodesLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        setStoreCodes([])
        setStoreCodesLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [storeId])

  const selectedLine = orderForm.lines.find((line) => line.localId === selectedLineId) || orderForm.lines[0]
  const selectedRevisionProduct = planId === NEW_PLAN && selectedLine?.product ? selectedLine.product.id : null

  useEffect(() => {
    if (!selectedRevisionProduct) return
    let cancelled = false
    const scope = `${realCompanyId}:${selectedRevisionProduct}`
    // A different company or product must never show the previous list.
    if (revisionScopeRef.current !== scope) {
      revisionScopeRef.current = scope
      setRevisions([])
    }
    setRevisionsError('')
    listApprovedRevisionsForProduct(realCompanyId, selectedRevisionProduct)
      .then((rows) => !cancelled && setRevisions(rows))
      .catch((error) => {
        // Keep the last good list and the user's selection; offer Retry.
        if (cancelled) return
        setRevisionsError(getErrorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [selectedRevisionProduct, realCompanyId, revisionsRetry])

  // Store preparation belongs to the saved ORDER LINE, not to a batch plan. It
  // loads as soon as a store and a saved line are chosen, with or without a plan.
  const savedLineId = selectedLine?.id ?? null
  useEffect(() => {
    if (!storeId || !savedLineId) {
      setPrep(null)
      setStoreForm(emptyStoreForm())
      setStoreSnapshot(JSON.stringify(emptyStoreForm()))
      return
    }
    let cancelled = false
    setPrepError('')
    listPreparationsForLine(storeId, savedLineId)
      .then((rows) => {
        if (cancelled) return
        const existing = rows[0] || null
        setPrep(existing)
        const next = storeFormFromPreparation(existing)
        setStoreForm(next)
        setStoreSnapshot(JSON.stringify(next))
      })
      .catch((error) => {
        if (cancelled) return
        setPrep(null)
        setPrepError(getErrorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [storeId, savedLineId])

  useEffect(() => {
    if (typeof planId !== 'number' || !storeId || !canReadStore) {
      setLegacyPrep(null)
      return
    }
    let cancelled = false
    listPreparationsForPlan(storeId, planId)
      .then((rows) => !cancelled && setLegacyPrep(rows[0] || null))
      .catch(() => !cancelled && setLegacyPrep(null))
    return () => {
      cancelled = true
    }
  }, [storeId, planId, canReadStore])

  // Requisition status is still tied to the batch plan: it only exists once
  // planning has produced formula-derived requirements.
  useEffect(() => {
    if (typeof planId !== 'number' || !storeId) {
      setRequisition({ state: '', row: null })
      return
    }
    let cancelled = false
    getRequisitionStatus(storeId, planId).then(
      (body) => {
        if (cancelled) return
        if (body.state === 'present') setRequisition({ state: 'present', row: body })
        else setRequisition({ state: body.state === 'none' ? 'none' : 'unavailable', row: null })
      },
      (error) => {
        if (cancelled) return
        // Refused or not visible: neutral wording, never "no requisition".
        const refused = error?.response?.status === 403 || error?.response?.status === 404
        setRequisition({ state: refused ? 'unavailable' : 'error', row: null })
      }
    )
    return () => {
      cancelled = true
    }
  }, [storeId, planId])

  // ----- Dirty state (per resource) -----
  const orderDirty = JSON.stringify(orderForm) !== orderSnapshot
  const batchDirty = planId !== null && JSON.stringify(batchForm) !== batchSnapshot
  const storeDirty = Boolean(savedLineId) && JSON.stringify(storeForm) !== storeSnapshot
  const dirtyNames = [orderDirty && 'order', batchDirty && 'batch plan', storeDirty && 'store preparation'].filter(Boolean)

  // ----- Permissions -----
  const canEditOrder = Boolean(order ? permissions.canEditOrder && order.status === 'DRAFT' : permissions.canCreateOrder)
  const canEditBatch = Boolean(order && (planId === NEW_PLAN ? permissions.canCreateBatch : permissions.canEditBatch))
  const canEditPrinting = Boolean(canEditBatch && permissions.canEditPrinting)
  const canWriteStore = Boolean(
    storeId && savedLineId && (prep ? storeCodes.includes('store_preparation.edit') : storeCodes.includes('store_preparation.create'))
  )
  // Store preparation depends only on store-scoped permissions. Order
  // (sales_orders.*) and batch-plan edit rights are deliberately not part of it.
  const canStoreManage = storeCodes.includes('store_preparation.create') || storeCodes.includes('store_preparation.edit')
  const storeAccessLabel = !storeId
    ? 'No active store'
    : !storeCodesLoaded || permissions.loading
      ? 'Loading…'
      : canStoreManage ? 'You can edit' : canReadStore ? 'View only' : 'Access unavailable'
  const batchAccessLabel = !order
    ? 'Save the order first'
    : permissions.loading
      ? 'Loading…'
      : !permissions.canViewBatch ? 'Access unavailable' : canEditBatch ? 'You can edit' : 'View only'

  // ----- Order actions -----
  const updateOrderField = (key, value) => setOrderForm((prev) => ({ ...prev, [key]: value }))
  const updateLine = (localId, patch) =>
    setOrderForm((prev) => ({ ...prev, lines: prev.lines.map((line) => (line.localId === localId ? { ...line, ...patch } : line)) }))
  const addLine = () => {
    const line = emptyLine()
    setOrderForm((prev) => ({ ...prev, lines: [...prev.lines, line] }))
    setSelectedLineId(line.localId)
  }
  const removeLine = (localId) => {
    setOrderForm((prev) => ({ ...prev, lines: prev.lines.filter((line) => line.localId !== localId) }))
    if (selectedLineId === localId) setSelectedLineId(orderForm.lines.find((line) => line.localId !== localId)?.localId ?? null)
  }

  // Type choices come from the maintained ProductType lookup. A value already
  // saved on a line stays selectable even if the lookup no longer lists it.
  const typeChoices = (current) => {
    const names = typeOptions.map((item) => item.name)
    return current && !names.includes(current) ? [...names, current] : names
  }

  const saveOrder = async () => {
    if (orderBusy || !canEditOrder) return
    setOrderErrors({})
    setOrderConflict(false)
    setOrderProblems([])
    const problems = validateLines(orderForm.lines)
    if (!orderForm.customer) problems.unshift('Choose a customer.')
    if (!order && !orderForm.currency) problems.unshift('Enter a currency (for example INR).')
    if (problems.length) {
      setOrderProblems(problems)
      setLastResult('Order not saved. Fix the items listed above the form.')
      return
    }
    const lines = orderForm.lines
      .filter((line) => line.product)
      .map((line) => {
        const base = {
          product_id: Number(line.product.id),
          quantity: line.quantity,
          unit_price: line.unit_price,
          description: line.description || undefined,
          product_type_snapshot: line.productType || '',
        }
        return order && line.id ? { id: line.id, ...base } : base
      })
    const header = {
      customer_id: Number(orderForm.customer.id),
      order_date: orderForm.order_date || undefined,
      requested_delivery_date: orderForm.requested_delivery_date || null,
      planned_manufacturing_date: orderForm.planned_manufacturing_date || null,
      customer_order_reference: orderForm.customer_order_reference || '',
      notes: orderForm.notes || '',
    }
    setOrderBusy(true)
    try {
      const saved = order
        ? await updateSalesOrder(realCompanyId, order.id, { expected_version: order.version, ...header, lines })
        : await createSalesOrder(realCompanyId, { ...header, currency: orderForm.currency, lines })
      setOrderProblems([])
      setLastResult(order ? 'Order saved.' : `Order ${saved.reference} created.`)
      setSavedPopup({
        title: order ? 'Order saved' : 'Order created',
        text: order ? `Order ${saved.reference} has been saved.` : `Order ${saved.reference} has been created.`,
        // A newly created order closes this window once the popup is acknowledged.
        closeAfter: !order,
      })
      setCurrentOrderId(saved.id)
      setReloadKey((key) => key + 1)
      onSaved?.(saved)
    } catch (error) {
      if (error?.response?.status === 409) {
        setOrderConflict(true)
        setLastResult('Order not saved: it changed elsewhere. Your entries are kept.')
      } else {
        setOrderErrors(parseFieldErrors(error))
        setOrderProblems([getErrorMessage(error)])
        setLastResult('Order not saved. See the message above the form.')
      }
    } finally {
      setOrderBusy(false)
    }
  }

  // ----- Batch actions -----
  const updateBatchField = (key, value) => setBatchForm((prev) => ({ ...prev, [key]: value }))

  const selectPlan = async (nextPlanId, { force = false } = {}) => {
    if (!force && (batchDirty || storeDirty) && !(await confirmAction('Discard unsaved batch plan or store changes?'))) return
    setBatchErrors({})
    setBatchConflict(false)
    setBatchMessage('')
    setStoreErrors('')
    setStoreConflict(false)
    setStoreMessage('')
    if (nextPlanId === null) {
      setPlanId(null)
      setPlan(null)
      setBatchForm(emptyBatchForm())
      setBatchSnapshot(JSON.stringify(emptyBatchForm()))
      return
    }
    if (nextPlanId === NEW_PLAN) {
      const fresh = { ...emptyBatchForm(), planned_manufacturing_date: orderForm.planned_manufacturing_date || '' }
      setPlanId(NEW_PLAN)
      setPlan(null)
      setBatchForm(fresh)
      setBatchSnapshot(JSON.stringify(fresh))
      return
    }
    try {
      const detail = await getBatchPlan(realCompanyId, nextPlanId)
      const next = batchFormFromPlan(detail)
      setPlanId(nextPlanId)
      setPlan(detail)
      setBatchForm(next)
      setBatchSnapshot(JSON.stringify(next))
    } catch (error) {
      setBatchMessage(getErrorMessage(error))
    }
  }

  const reloadPlanDetail = async () => {
    if (typeof planId !== 'number') return
    await selectPlan(planId, { force: true })
    setPlans(await listBatchPlansForOrder(realCompanyId, order.id))
  }

  const saveBatch = async () => {
    if (batchBusy || !canEditBatch) return
    setBatchErrors({})
    setBatchConflict(false)
    const problems = []
    if (!order) problems.push('Save the order first.')
    if (planId === NEW_PLAN) {
      if (!selectedLine?.id) problems.push('Save the order line before creating a batch plan for it.')
      if (!batchForm.revisionId) problems.push('Choose an approved formula revision. It is not selected automatically.')
    }
    if (!batchForm.target_output_quantity || Number(batchForm.target_output_quantity) <= 0) problems.push('Enter the batch size (greater than 0).')
    if ((batchForm.packing_content_quantity !== '' || batchForm.planned_pack_quantity !== '') && !batchForm.packing_content_uom) {
      problems.push('Choose the packing size unit.')
    }
    if (problems.length) {
      setBatchMessage(problems.join(' '))
      return
    }
    setBatchBusy(true)
    try {
      if (planId === NEW_PLAN) {
        const payload = {
          sales_order_line_id: selectedLine.id,
          formula_revision_id: Number(batchForm.revisionId),
          target_output_quantity: batchForm.target_output_quantity,
          planned_manufacturing_date: batchForm.planned_manufacturing_date || null,
          packing_size_note: batchForm.packing_size_note || '',
          notes: batchForm.notes || '',
        }
        if (batchForm.planned_pack_quantity !== '') payload.planned_pack_quantity = batchForm.planned_pack_quantity
        if (batchForm.packing_content_quantity !== '') payload.packing_content_quantity = batchForm.packing_content_quantity
        if (batchForm.packing_content_uom) payload.packing_content_uom_id = Number(batchForm.packing_content_uom.id)
        if (canEditPrinting) {
          payload.mrp_for_printing = batchForm.mrp_for_printing === '' ? null : batchForm.mrp_for_printing
          payload.printing_status_note = batchForm.printing_status_note || ''
        }
        const created = await createBatchPlan(realCompanyId, payload)
        setBatchMessage(`Batch plan ${created.id} created.`)
        setSavedPopup({ title: 'Batch plan created', text: `Batch plan ${created.id} has been created.`, closeAfter: true })
        setPlans(await listBatchPlansForOrder(realCompanyId, order.id))
        await selectPlan(created.id, { force: true })
      } else {
        const payload = {
          expected_version: plan.version,
          target_output_quantity: batchForm.target_output_quantity,
          planned_manufacturing_date: batchForm.planned_manufacturing_date || null,
          packing_size_note: batchForm.packing_size_note,
          notes: batchForm.notes,
          planned_pack_quantity: batchForm.planned_pack_quantity === '' ? null : batchForm.planned_pack_quantity,
          packing_content_quantity: batchForm.packing_content_quantity === '' ? null : batchForm.packing_content_quantity,
          packing_content_uom_id: batchForm.packing_content_uom ? Number(batchForm.packing_content_uom.id) : null,
          ...(canEditPrinting
            ? {
                mrp_for_printing: batchForm.mrp_for_printing === '' ? null : batchForm.mrp_for_printing,
                printing_status_note: batchForm.printing_status_note || '',
              }
            : {}),
        }
        await updateBatchPlan(realCompanyId, plan.id, payload)
        setBatchMessage('Batch details saved.')
        setSavedPopup({ title: 'Batch details saved', text: 'The batch and printing details have been saved.', closeAfter: true })
        await reloadPlanDetail()
      }
    } catch (error) {
      if (error?.response?.status === 409) {
        setBatchConflict(true)
        setBatchMessage('Batch plan not saved: it changed elsewhere. Your entries are kept. Reload to review.')
      } else {
        setBatchErrors(parseFieldErrors(error))
        setBatchMessage(`Batch plan not saved. ${getErrorMessage(error)}`)
      }
    } finally {
      setBatchBusy(false)
    }
  }

  const generateBatchNumber = async () => {
    if (!plan || allocating) return
    const confirmed = await confirmAction(
      `Generate the permanent batch number for plan ${plan.id}?\n\nIt cannot be changed afterwards. It does not authorize production, reserve stock or issue material.`
    )
    if (!confirmed) return
    setAllocating(true)
    setBatchConflict(false)
    try {
      const result = await allocateBatchNumber(realCompanyId, plan.id, plan.version)
      setBatchMessage(`Batch number ${result.official_batch_number || ''} generated.`)
      await reloadPlanDetail()
    } catch (error) {
      if (error?.response?.status === 409) {
        setBatchConflict(true)
        setBatchMessage('Not generated: the plan changed. Nothing was allocated. Reload and try again.')
      } else {
        setBatchMessage(`Not generated. ${getErrorMessage(error)}`)
      }
    } finally {
      setAllocating(false)
    }
  }

  // ----- Store preparation actions -----
  const saveStore = async () => {
    if (storeBusy || !canWriteStore || !storeId) return
    setStoreErrors('')
    setStoreConflict(false)
    setStoreBusy(true)
    try {
      const insertRequired = valueToInsert(storeForm.insert)
      const saved = prep
        ? await updatePreparation(storeId, prep.id, {
            expected_version: prep.version,
            packing_type: storeForm.packing_type,
            insert_required: insertRequired,
            label_note: storeForm.label_note,
            box_note: storeForm.box_note,
          })
        : await createPreparation(storeId, {
            sales_order_line_id: savedLineId,
            packing_type: storeForm.packing_type,
            insert_required: insertRequired,
            label_note: storeForm.label_note,
            box_note: storeForm.box_note,
          })
      setPrep(saved)
      const next = storeFormFromPreparation(saved)
      setStoreForm(next)
      setStoreSnapshot(JSON.stringify(next))
      setStoreMessage('Store details saved.')
      setSavedPopup({ title: 'Store details saved', text: 'The store preparation details have been saved.', closeAfter: true })
    } catch (error) {
      if (error?.response?.status === 409) {
        setStoreConflict(true)
        setStoreMessage('Store details not saved: they changed elsewhere. Your entries are kept. Reload to review.')
      } else {
        setStoreErrors(getErrorMessage(error))
        setStoreMessage('Store details not saved. Your entries are kept.')
      }
    } finally {
      setStoreBusy(false)
    }
  }

  // ----- Derived display values -----
  const planListRow = plans.find((row) => row.id === planId) || null
  const outputUom = planListRow?.output_uom_code || revisions.find((rev) => String(rev.id) === String(batchForm.revisionId))?.outputUomCode || ''
  const requisitionText = typeof planId !== 'number' ? 'Available after batch planning' : requisitionStatusText(requisition)
  const batchNumber = plan?.official_batch_number || null
  const assessment = plan?.packing_assessment || null


  const currencyCode = order?.currency || orderForm.currency || ''
  const title = 'Order details'
  const orderAccessLabel = permissions.loading
    ? 'Loading…'
    : !order
      ? (permissions.canCreateOrder ? 'You can edit' : 'Access unavailable')
      : canEditOrder ? 'You can edit' : 'View only'

  // Back from Manage formulas: the order and batch input are untouched. Only the
  // approved-revision list is refreshed; the selection is kept as it was.
  const closeFormulas = () => {
    setFormulasOpen(false)
    setRevisionsRetry((n) => n + 1)
  }

  const requestClose = async () => {
    if (dirtyNames.length && !(await confirmAction(`Unsaved changes in ${dirtyNames.join(', ')}. Close without saving?`))) return
    onClose()
  }

  const footer = (
    <>
      <span className="field-status" role="status" aria-live="polite">
        {orderDirty || batchDirty || storeDirty ? `Unsaved: ${dirtyNames.join(', ')}` : lastResult}
      </span>
      <button type="button" className="btn btn-secondary" onClick={requestClose}>
        Close
      </button>
    </>
  )

  return (
    <Modal
      title={title}
      subheader={
        <p className="field-muted">
          {order ? `Order ${order.reference}` : 'New order'}
          {companyCode ? ` · Operating company ${companyCode}` : ''}
        </p>
      }
      onClose={requestClose}
      size="workspace"
      footer={footer}
    >
      {loadError && <Alert type="error">{loadError}</Alert>}
      {loading && <p className="field-muted">Loading order…</p>}
      {!loading && (
        <form id="company-customer-order-form" className="sof-form" onSubmit={(event) => { event.preventDefault(); saveOrder() }}>
          {order && order.status !== 'DRAFT' && (
            <Alert type="error">This order is {order.status}. It is read-only.</Alert>
          )}
          {orderProblems.length > 0 && (
            <Alert type="error">
              {orderProblems.map((text) => (
                <span key={text} style={{ display: 'block' }}>{text}</span>
              ))}
            </Alert>
          )}
          {orderErrors.detail && <Alert type="error">{orderErrors.detail}</Alert>}
          {orderConflict && (
            <Alert type="error">
              This order changed since you loaded it. Your entries are preserved. <Button variant="secondary" onClick={() => window.location.reload()}>Reload to review</Button>
            </Alert>
          )}
          {storesError && <Alert type="error">{storesError}</Alert>}

          {batchMessage && <Alert type={batchMessage.includes('not') || batchMessage.includes('Not') ? 'error' : 'success'}>{batchMessage}</Alert>}
          {batchConflict && <Alert type="error">Batch plan changed elsewhere. Reload it to review before saving again.</Alert>}
          {batchErrors.detail && <Alert type="error">{batchErrors.detail}</Alert>}
          {plansError && <Alert type="error">{plansError}</Alert>}
          {storeMessage && <Alert type={storeMessage.includes('not') ? 'error' : 'success'}>{storeMessage}</Alert>}
          {storeConflict && (
            <Alert type="error">
              Store details changed elsewhere. Your entries are kept. <Button variant="secondary" onClick={() => window.location.reload()}>Reload to review</Button>
            </Alert>
          )}
          {storeErrors && <Alert type="error">{storeErrors}</Alert>}
          {prepError && <Alert type="error">{prepError}</Alert>}

          <section className="sof-group" aria-labelledby="sof-h-order">
            <div className="sof-group-head">
              <h4 id="sof-h-order" className="sof-group-title">
                Order details <span className="sof-group-owner">Admin</span>
              </h4>
              <span className="sof-access">{orderAccessLabel}</span>
              {canEditOrder && (
                <button type="submit" form="company-customer-order-form" className="btn btn-primary" disabled={orderBusy}>
                  Save order details
                </button>
              )}
            </div>
            <div className="inv-form-grid">
              <ReadOnly
                label="Company"
                value={orderForm.customer?.label || order?.customer_name || 'Select a customer'}
                muted={!orderForm.customer && !order}
                title={`Client company placing the order. Operating company: ${companyCode || '—'}${companyName ? ` · ${companyName}` : ''}`}
              />
              {!canEditOrder ? (
                <ReadOnly label="Customer" value={orderForm.customer?.label || order?.customer_name || ''} muted={!orderForm.customer && !order?.customer_name} />
              ) : (
              <div className="field">
                <label className="field-label" htmlFor="sof-customer">Customer</label>
                <div className="sof-customer-row">
                  <div className="sof-customer-picker">
                    <AsyncSearchSelect
                      id="sof-customer"
                      value={orderForm.customer?.id || ''}
                      selected={orderForm.customer}
                      onChange={(option) => updateOrderField('customer', option)}
                      fetchOptions={(term) => searchCustomers(realCompanyId, term)}
                      getOptionLabel={(o) => o.label}
                      getOptionMeta={(o) => o.meta}
                      placeholder="Search customer by name, code, phone..."
                      disabled={!canEditOrder}
                      required
                    />
                  </div>
                  {permissions.canAddCustomer && (
                    <button
                      type="button"
                      className="btn btn-secondary sof-add-customer"
                      onClick={() => setAddingCustomer(true)}
                      disabled={!canEditOrder}
                    >
                      + Add customer
                    </button>
                  )}
                </div>
                {orderErrors.customer_id && <span className="field-error">{orderErrors.customer_id}</span>}
              </div>
              )}

              <ReadOnly label="Order number" value={order?.reference || 'Generated after saving'} muted={!order} />
              {!canEditOrder ? (
                <ReadOnly label="Product name" value={selectedLine?.product?.label || ''} muted={!selectedLine?.product} />
              ) : (
              <Field label="Product name" htmlFor="sof-product" error={orderErrors.lines}>
                <AsyncSearchSelect
                  id="sof-product"
                  value={selectedLine?.product?.id || ''}
                  selected={selectedLine?.product}
                  onChange={(option) =>
                    selectedLine &&
                    updateLine(selectedLine.localId, {
                      product: option,
                      productType: option?.productType || '',
                    })
                  }
                  fetchOptions={(term) => searchProducts(realCompanyId, term)}
                  getOptionLabel={(o) => o.label}
                  getOptionMeta={(o) => o.meta}
                  placeholder="Search product by name or code…"
                  disabled={!canEditOrder || !selectedLine}
                />
              </Field>
              )}

              <Field label="Type" htmlFor="sof-type">
                <select
                  id="sof-type"
                  className="field-input"
                  value={selectedLine?.productType || ''}
                  onChange={(event) => selectedLine && updateLine(selectedLine.localId, { productType: event.target.value })}
                  disabled={!canEditOrder || !selectedLine?.product}
                  title="Saved on this order line. The product master is not changed."
                >
                  <option value="">{selectedLine?.product ? 'Not specified' : 'Select a product first'}</option>
                  {typeChoices(selectedLine?.productType || '').map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
              <ReadOnly
                label="Customer code"
                value={orderForm.customer?.code || order?.customer_code || '—'}
                muted={!orderForm.customer && !order?.customer_code}
                title="Customer code for the selected customer"
              />

              <Field label="Date of order" htmlFor="sof-order-date" error={orderErrors.order_date}>
                <input
                  id="sof-order-date"
                  className="field-input"
                  type="date"
                  value={orderForm.order_date}
                  onChange={(event) => updateOrderField('order_date', event.target.value)}
                  disabled={!canEditOrder}
                  required
                />
              </Field>
              <Field label="Planned Mfg Date" htmlFor="sof-order-mfg" error={orderErrors.planned_manufacturing_date}>
                <input
                  id="sof-order-mfg"
                  className="field-input"
                  type="date"
                  value={orderForm.planned_manufacturing_date}
                  onChange={(event) => updateOrderField('planned_manufacturing_date', event.target.value)}
                  disabled={!canEditOrder}
                />
              </Field>

              <ReadOnly label="Product code" value={selectedLine?.product?.code || '—'} muted={!selectedLine?.product} />
            </div>

            <div className="sof-section-label">Order lines</div>
            <div className="sof-lines">
              {orderForm.lines.map((line, index) => (
                <div key={line.localId} className={`sof-line${line.localId === selectedLine?.localId ? ' is-selected' : ''}`}>
                  <div className="sof-line-head">
                    <button type="button" className="sof-link" onClick={() => setSelectedLineId(line.localId)}>
                      Line {index + 1} · {line.product?.label || 'No product yet'}
                      {line.localId === selectedLine?.localId ? ' (selected)' : ''}
                    </button>
                    <button
                      type="button"
                      className="sof-link sof-link-danger"
                      onClick={() => removeLine(line.localId)}
                      disabled={!canEditOrder || orderForm.lines.length <= 1}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="inv-form-grid">
                    <Field label="Order quantity (whole number) *" htmlFor={`sof-qty-${index}`}>
                      <input
                        id={`sof-qty-${index}`}
                        className="field-input"
                        type="text"
                        inputMode="numeric"
                        value={line.quantity}
                        onChange={(event) => updateLine(line.localId, { quantity: event.target.value.replace(/\D/g, '') })}
                        disabled={!canEditOrder}
                      />
                    </Field>
                    <Field label="Unit price *" htmlFor={`sof-price-${index}`}>
                      <input
                        id={`sof-price-${index}`}
                        className="field-input"
                        type="text"
                        inputMode="decimal"
                        value={line.unit_price}
                        onChange={(event) => updateLine(line.localId, { unit_price: event.target.value })}
                        disabled={!canEditOrder}
                      />
                    </Field>
                    <Field label="Description" htmlFor={`sof-desc-${index}`} full>
                      <input
                        id={`sof-desc-${index}`}
                        className="field-input"
                        value={line.description}
                        onChange={(event) => updateLine(line.localId, { description: event.target.value })}
                        disabled={!canEditOrder}
                      />
                    </Field>
                  </div>
                </div>
              ))}
              <div>
                <Button variant="secondary" onClick={addLine} disabled={!canEditOrder}>
                  + Add product line
                </Button>
              </div>
            </div>

            <div className="inv-form-grid">
              {!order ? (
                <Field label="Currency * (e.g. INR)" htmlFor="sof-currency" error={orderErrors.currency}>
                  <input
                    id="sof-currency"
                    className="field-input"
                    maxLength={3}
                    value={orderForm.currency}
                    onChange={(event) => updateOrderField('currency', event.target.value.toUpperCase())}
                    disabled={!canEditOrder}
                  />
                </Field>
              ) : (
                <ReadOnly label="Currency" value={order.currency} />
              )}
              <Field label="Requested delivery date" htmlFor="sof-delivery">
                <input
                  id="sof-delivery"
                  className="field-input"
                  type="date"
                  value={orderForm.requested_delivery_date}
                  onChange={(event) => updateOrderField('requested_delivery_date', event.target.value)}
                  disabled={!canEditOrder}
                />
              </Field>
              <Field label="Customer order reference" htmlFor="sof-customer-ref">
                <input
                  id="sof-customer-ref"
                  className="field-input"
                  value={orderForm.customer_order_reference}
                  onChange={(event) => updateOrderField('customer_order_reference', event.target.value)}
                  disabled={!canEditOrder}
                />
              </Field>
              <Field label="Notes" htmlFor="sof-notes">
                <input
                  id="sof-notes"
                  className="field-input"
                  value={orderForm.notes}
                  onChange={(event) => updateOrderField('notes', event.target.value)}
                  disabled={!canEditOrder}
                />
              </Field>
            </div>
          </section>

          <section className="sof-group" aria-labelledby="sof-h-store">
            <div className="sof-group-head">
              <h4 id="sof-h-store" className="sof-group-title">
                Store preparation <span className="sof-group-owner">Store Manager</span>
              </h4>
              <span className="sof-access">{storeAccessLabel}</span>
              {storeCodesLoaded && canStoreManage && (
                <Button variant="secondary" onClick={saveStore} loading={storeBusy} disabled={!canWriteStore || !storeDirty || storeBusy}>
                  Save store details
                </Button>
              )}
            </div>
            {storeId && !storeCodesLoaded && <p className="field-muted">Checking store access…</p>}
            {storeId && storeCodesLoaded && !canStoreManage && (
              <p className="field-muted">View only for store preparation in this store.</p>
            )}
            {storeId && storeCodesLoaded && canStoreManage && !savedLineId && (
              <p className="field-muted">Save the order first. Store details are recorded per order line.</p>
            )}
            <div className="inv-form-grid">
              <Field label="Store" htmlFor="sof-store">
                <select
                  id="sof-store"
                  className="field-input"
                  value={storeId}
                  onChange={(event) => setStoreId(event.target.value)}
                  disabled={!stores.length}
                >
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.code} · {store.name}
                    </option>
                  ))}
                </select>
              </Field>
              <ReadOnly
                label="Requisition Status"
                value={requisitionText}
                muted={requisition.state !== 'present'}
                title="Changed only through the requisition workflow"
              />
              <Field label="Packing Type" htmlFor="sof-packing-type">
                <input
                  id="sof-packing-type"
                  className="field-input"
                  value={storeForm.packing_type}
                  onChange={(event) => setStoreForm((prev) => ({ ...prev, packing_type: event.target.value }))}
                  disabled={!canWriteStore}
                  maxLength={255}
                />
              </Field>
              <Field label="Insert" htmlFor="sof-insert">
                <select
                  id="sof-insert"
                  className="field-input"
                  value={storeForm.insert}
                  onChange={(event) => setStoreForm((prev) => ({ ...prev, insert: event.target.value }))}
                  disabled={!canWriteStore}
                >
                  {INSERT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Label" htmlFor="sof-label-note">
                <input
                  id="sof-label-note"
                  className="field-input"
                  value={storeForm.label_note}
                  onChange={(event) => setStoreForm((prev) => ({ ...prev, label_note: event.target.value }))}
                  disabled={!canWriteStore}
                  maxLength={255}
                  title="Unstructured note. Not used for stock or readiness."
                />
              </Field>
              <Field label="Box" htmlFor="sof-box-note">
                <input
                  id="sof-box-note"
                  className="field-input"
                  value={storeForm.box_note}
                  onChange={(event) => setStoreForm((prev) => ({ ...prev, box_note: event.target.value }))}
                  disabled={!canWriteStore}
                  maxLength={255}
                  title="Unstructured note. Not used for stock or readiness."
                />
              </Field>
            </div>
          </section>

          <section className="sof-group" aria-labelledby="sof-h-batch">
            <div className="sof-group-head">
              <h4 id="sof-h-batch" className="sof-group-title">
                Batch and printing <span className="sof-group-owner">Manager</span>
              </h4>
              <span className="sof-access">{batchAccessLabel}</span>
              {canEditBatch && planId !== null && (
                <Button variant="secondary" onClick={saveBatch} loading={batchBusy} disabled={!batchDirty || batchBusy}>
                  Save batch details
                </Button>
              )}
            </div>

            <div className="sof-batch-bar">
              <div className="field sof-batch-select">
                <label className="field-label" htmlFor="sof-plan">Batch plan (the line and plan these batch fields describe)</label>
                <select
                  id="sof-plan"
                  className="field-input"
                  value={planId === null ? '' : String(planId)}
                  disabled={!order}
                  onChange={(event) => {
                    const value = event.target.value
                    if (value === '') selectPlan(null)
                    else if (value === NEW_PLAN) selectPlan(NEW_PLAN)
                    else selectPlan(Number(value))
                  }}
                >
                  <option value="">{order ? (plans.length ? 'Select a batch plan' : 'No batch plan yet') : 'Save the order first'}</option>
                  {plans.map((row) => (
                    <option key={row.id} value={row.id}>
                      Line {row.source_line_number} · {row.product_code} · {row.official_batch_number || `plan ${row.id}`}
                    </option>
                  ))}
                  {order && permissions.canCreateBatch && <option value={NEW_PLAN}>New batch plan for the selected line</option>}
                </select>
                {order && permissions.canCreateBatch && planId !== NEW_PLAN && (
                  <button type="button" className="btn btn-secondary sof-create-plan" onClick={() => selectPlan(NEW_PLAN)}>
                    Create batch plan
                  </button>
                )}
              </div>
            </div>

            {legacyPrep && (
              <section className="sof-legacy" aria-label="Batch-specific store details (legacy, read-only)">
                <span className="field-label">Batch-specific store details (legacy, read-only)</span>
                <p className="field-muted">
                  Recorded against this batch plan before order-line preparation existed. Shown for reference only and never merged with the order line&apos;s store details.
                </p>
                <div className="inv-form-grid">
                  <ReadOnly label="Packing Type" value={legacyPrep.packing_type || '—'} />
                  <ReadOnly
                    label="Insert"
                    value={legacyPrep.insert_required === true ? 'Required' : legacyPrep.insert_required === false ? 'Not required' : 'Not specified'}
                  />
                  <ReadOnly label="Label" value={legacyPrep.label_note || '—'} />
                  <ReadOnly label="Box" value={legacyPrep.box_note || '—'} />
                </div>
              </section>
            )}

            <div className="inv-form-grid">
              <div className="field">
                <span className="field-label">Batch No.</span>
                <div className="sof-inline">
                  <div
                    className={`field-input field-readonly${batchNumber ? '' : ' is-muted'}`}
                    title="Returned by the backend. Never typed or computed here."
                  >
                    {batchNumber || (typeof planId === 'number' ? 'Not generated' : 'Select a batch plan')}
                  </div>
                  {typeof planId === 'number' && !batchNumber && permissions.canAllocateBatch && (
                    <Button variant="secondary" onClick={generateBatchNumber} loading={allocating} title="Permanent. Does not authorize production or stock reservation.">
                      Generate
                    </Button>
                  )}
                </div>
              </div>

              <Field label="Batch planned manufacturing date" htmlFor="sof-batch-mfg" error={batchErrors.planned_manufacturing_date}>
                <input
                  id="sof-batch-mfg"
                  className="field-input"
                  type="date"
                  value={batchForm.planned_manufacturing_date}
                  onChange={(event) => updateBatchField('planned_manufacturing_date', event.target.value)}
                  disabled={!canEditBatch}
                  title="Offered from the order's planned date when a plan is created. Saved on this plan only."
                />
              </Field>

              <div className="field">
                <label className="field-label" htmlFor="sof-pack-qty">Packing Size (content quantity and unit)</label>
                <div className="sof-pair">
                  <input
                    id="sof-pack-qty"
                    className="field-input"
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 25"
                    value={batchForm.packing_content_quantity}
                    onChange={(event) => updateBatchField('packing_content_quantity', event.target.value)}
                    disabled={!canEditBatch}
                  />
                  {unitsBlocked ? (
                    <div className="field-input field-readonly is-muted sof-retry">
                      Unable to load units{' '}
                      <button type="button" className="btn btn-secondary" onClick={() => setUnitsRetry((n) => n + 1)}>
                        Retry
                      </button>
                    </div>
                  ) : (
                    <AsyncSearchSelect
                      id="sof-pack-unit"
                      value={batchForm.packing_content_uom?.id || ''}
                      selected={batchForm.packing_content_uom}
                      onChange={(option) => updateBatchField('packing_content_uom', option)}
                      fetchOptions={(term) => listPlanningUnits(realCompanyId, term)}
                      getOptionLabel={(o) => o.label}
                      getOptionMeta={(o) => o.meta}
                      placeholder="Unit"
                      disabled={!canEditBatch}
                    />
                  )}
                </div>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="sof-target">Batch Size (target output and unit)</label>
                <div className="sof-pair">
                  <input
                    id="sof-target"
                    className="field-input"
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 76"
                    value={batchForm.target_output_quantity}
                    onChange={(event) => updateBatchField('target_output_quantity', event.target.value)}
                    disabled={!canEditBatch}
                  />
                  <div className={`field-input field-readonly${outputUom ? '' : ' is-muted'}`} title="Formula output unit">
                    {outputUom || 'Output unit'}
                  </div>
                </div>
              </div>

              <Field label="Planned pack quantity" htmlFor="sof-pack-count">
                <input
                  id="sof-pack-count"
                  className="field-input"
                  type="text"
                  inputMode="decimal"
                  value={batchForm.planned_pack_quantity}
                  onChange={(event) => updateBatchField('planned_pack_quantity', event.target.value)}
                  disabled={!canEditBatch}
                />
              </Field>
              {planId === NEW_PLAN ? (
                <Field label="Approved formula revision *" htmlFor="sof-revision" error={batchErrors.formula_revision_id}>
                  <select
                    id="sof-revision"
                    className="field-input"
                    value={batchForm.revisionId}
                    onChange={(event) => updateBatchField('revisionId', event.target.value)}
                    disabled={!canEditBatch}
                  >
                    <option value="">Choose an approved revision</option>
                    {revisions.map((rev) => (
                      <option key={rev.id} value={rev.id}>
                        {rev.formulaCode} · revision {rev.revisionNumber} · base {rev.baseOutputQuantity} {rev.outputUomCode}
                      </option>
                    ))}
                    {batchForm.revisionId && !revisions.some((rev) => String(rev.id) === String(batchForm.revisionId)) && (
                      <option value={batchForm.revisionId}>Selected revision (no longer listed as approved)</option>
                    )}
                  </select>
                  {permissions.canViewFormulas && selectedRevisionProduct && (
                    <button type="button" className="btn btn-secondary" onClick={() => setFormulasOpen(true)}>
                      Manage formulas
                    </button>
                  )}
                  {revisionsError && (
                    <span className="field-error">
                      Unable to load approved revisions.{' '}
                      <button type="button" className="btn btn-secondary" onClick={() => setRevisionsRetry((n) => n + 1)}>
                        Retry
                      </button>
                    </span>
                  )}
                  {!revisionsError && selectedRevisionProduct && revisions.length === 0 && (
                    <span className="field-muted">No approved formula available for this product.</span>
                  )}
                </Field>
              ) : (
                <ReadOnly
                  label="Approved formula revision"
                  value={planListRow ? `${planListRow.formula_code} · revision ${planListRow.formula_revision_number}` : '—'}
                />
              )}

              <Field label={`MRP for Printing${currencyCode ? ` (${currencyCode})` : ''}`} htmlFor="sof-mrp" error={batchErrors.mrp_for_printing}>
                <input
                  id="sof-mrp"
                  className="field-input"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={batchForm.mrp_for_printing}
                  onChange={(event) => updateBatchField('mrp_for_printing', event.target.value)}
                  disabled={!canEditPrinting}
                  title="Working value in the order currency. Not the sales unit price; no tax or stock effect."
                />
              </Field>
              <Field label="Printing Status" htmlFor="sof-printing-status">
                <input
                  id="sof-printing-status"
                  className="field-input"
                  value={batchForm.printing_status_note}
                  onChange={(event) => updateBatchField('printing_status_note', event.target.value)}
                  disabled={!canEditPrinting}
                  maxLength={255}
                  placeholder="Free text until the status list is confirmed"
                />
              </Field>

              <Field label="Batch notes" htmlFor="sof-batch-notes" full>
                <input
                  id="sof-batch-notes"
                  className="field-input"
                  value={batchForm.notes}
                  onChange={(event) => updateBatchField('notes', event.target.value)}
                  disabled={!canEditBatch}
                />
              </Field>
            </div>

            {assessment ? (
              <p className="sof-calc">
                Expected packed content <strong>{assessment.expected_packed_content?.value} {assessment.expected_packed_content?.unit_code}</strong>
                <span className="sof-sep">·</span>
                Target <strong>{assessment.manufacturing_target_quantity} {assessment.manufacturing_target_uom_code}</strong>
                <span className="sof-sep">·</span>
                Planning difference <strong>{assessment.difference?.value} {assessment.difference?.unit_code}</strong>
              </p>
            ) : (
              <p className="field-muted">The packed-content calculation appears once a packing size is saved.</p>
            )}
          {permissions.canViewFormulas && typeof planId === 'number' && (
            <RequirementCalculator
              key={`plan-${planId}`}
              companyId={realCompanyId}
              planId={planId}
              initialTarget={batchForm.target_output_quantity}
            />
          )}
          {permissions.canViewBmr && typeof planId === 'number' && (
            <BmrPanel
              key={`bmr-${planId}`}
              companyId={realCompanyId}
              planId={planId}
              canView={permissions.canViewBmr}
              canCreate={permissions.canCreateBmr}
              canEdit={permissions.canEditBmr}
            />
          )}
          {permissions.canViewFormulas && planId === NEW_PLAN && batchForm.revisionId && (() => {
            const chosen = revisions.find((rev) => String(rev.id) === String(batchForm.revisionId))
            return chosen ? (
              <RequirementCalculator
                key={`draft-${chosen.id}`}
                companyId={realCompanyId}
                formulaId={chosen.formulaId}
                revisionId={chosen.id}
                initialTarget={batchForm.target_output_quantity}
              />
            ) : null
          })()}
          </section>
        </form>
      )}

      {addingCustomer && (
        <CustomerFormModal
          realCompanyId={realCompanyId}
          customerId={null}
          canEdit
          canActivate={false}
          canDeactivate={false}
          onClose={() => setAddingCustomer(false)}
          onSaved={(customer) => {
            setAddingCustomer(false)
            updateOrderField('customer', { id: customer.id, label: customer.name, code: customer.code, meta: customer.code })
          }}
        />
      )}
      {formulasOpen && (
        <Modal
          title="Formulas"
          onClose={closeFormulas}
          size="workspace"
          footer={
            <Button variant="secondary" onClick={closeFormulas}>
              Back to batch planning
            </Button>
          }
        >
          <FormulasPage embedded productId={selectedRevisionProduct} />
        </Modal>
      )}
      {savedPopup &&
        createPortal(
          <div className="sof-popup-backdrop">
            <div className="sof-popup" role="dialog" aria-modal="true" aria-labelledby="sof-popup-title">
              <h3 id="sof-popup-title">{savedPopup.title}</h3>
              <p>{savedPopup.text}</p>
              <button
                type="button"
                className="btn btn-primary"
                autoFocus
                onClick={() => {
                  const closeAfter = savedPopup.closeAfter
                  setSavedPopup(null)
                  if (closeAfter) onClose()
                }}
              >
                OK
              </button>
            </div>
          </div>,
          document.body
        )}
    </Modal>
  )
}
