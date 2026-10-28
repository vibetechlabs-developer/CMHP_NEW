import { useEffect, useState, useMemo } from 'react'
import Modal from './Modal'
import Button from '../../../components/Button'
import Alert from '../../../components/Alert'
import { getErrorMessage } from '../../../utils/errors'
import {
  createStorePurchaseOrder,
  getStorePurchaseOrder,
  updateStorePurchaseOrder,
  createPurchaseOrder,
  getPurchaseOrder,
  updatePurchaseOrder,
  listStorePurchasingSuppliers,
  listPurchasingSuppliers,
  listActiveMaterials,
} from '../purchasingService'
import { listUnits } from '../../store/storeService'

export default function PurchaseOrderModal({
  isOpen = true,
  mode = 'create',
  storeId,
  storeName,
  companyId: initialCompanyId,
  companies = [],
  order = null,
  onClose,
  onSaved,
}) {
  const isEdit = mode === 'edit'
  const [companyId, setCompanyId] = useState(
    order?.company_id || order?.company?.id || initialCompanyId || companies[0]?.id || ''
  )
  const [supplierId, setSupplierId] = useState(order?.supplier_id || order?.supplier?.id || '')
  const [currencyCode, setCurrencyCode] = useState(order?.currency_code || 'INR')
  const [poDate, setPoDate] = useState(() => (order?.created_at ? order.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10)))
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(
    order?.expected_delivery_date || ''
  )
  const [notes, setNotes] = useState(order?.notes || '')

  // Lines
  const [lines, setLines] = useState(
    order?.lines && order.lines.length > 0
      ? order.lines.map((l) => ({
          id: l.id,
          material_id: l.material_id || l.material?.id || '',
          material_name: l.material_name || l.material?.name || '',
          material_code: l.material_code || l.material?.code || '',
          material_kind: l.material?.kind || (l.material_code?.startsWith('PKG') ? 'PACKAGING' : 'RAW'),
          unit_code: l.unit_code || l.unit?.code || '',
          unit_id: l.unit_id || l.unit?.id || null,
          quantity: l.ordered_quantity || l.quantity || 1,
          unit_price: l.unit_price || 0,
        }))
      : [
          {
            material_id: '',
            material_name: '',
            material_code: '',
            material_kind: 'RAW',
            unit_code: '',
            unit_id: null,
            quantity: 1,
            unit_price: 0,
          },
        ]
  )

  const [currentVersion, setCurrentVersion] = useState(order?.version ?? null)
  const [currentStatus, setCurrentStatus] = useState(order?.status || 'DRAFT')
  const [fetchingLatest, setFetchingLatest] = useState(false)
  const isReadOnly = isEdit && currentStatus && currentStatus !== 'DRAFT'

  const [suppliers, setSuppliers] = useState([])
  const [materials, setMaterials] = useState([])
  const [units, setUnits] = useState([])
  const [loadingLookups, setLoadingLookups] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const refetchLatestOrder = async () => {
    if (!order?.id) return
    setFetchingLatest(true)
    try {
      let fresh
      if (storeId) {
        try {
          fresh = await getStorePurchaseOrder(storeId, order.id)
        } catch (sErr) {
          if (sErr?.response?.status === 404 && (companyId || order.company_id)) {
            fresh = await getPurchaseOrder(companyId || order.company_id, order.id)
          } else {
            throw sErr
          }
        }
      } else if (companyId || order.company_id) {
        fresh = await getPurchaseOrder(companyId || order.company_id, order.id)
      }

      if (fresh) {
        if (fresh.version !== undefined) setCurrentVersion(fresh.version)
        if (fresh.status) setCurrentStatus(fresh.status)
        if (fresh.company_id || fresh.company?.id) {
          setCompanyId(fresh.company_id || fresh.company?.id)
        }
        if (fresh.supplier_id || fresh.supplier?.id) {
          setSupplierId(fresh.supplier_id || fresh.supplier?.id)
        }
        if (fresh.currency_code) setCurrencyCode(fresh.currency_code)
        if (fresh.created_at) setPoDate(fresh.created_at.slice(0, 10))
        if (fresh.expected_delivery_date) setExpectedDeliveryDate(fresh.expected_delivery_date)
        if (fresh.notes !== undefined) setNotes(fresh.notes || '')
        if (Array.isArray(fresh.lines) && fresh.lines.length > 0) {
          setLines(
            fresh.lines.map((l) => ({
              id: l.id,
              material_id: l.material_id || l.material?.id || '',
              material_name: l.material_name || l.material?.name || '',
              material_code: l.material_code || l.material?.code || '',
              material_kind: l.material?.kind || (l.material_code?.startsWith('PKG') ? 'PACKAGING' : 'RAW'),
              unit_code: l.unit_code || l.unit?.code || '',
              unit_id: l.unit_id || l.unit?.id || null,
              quantity: l.ordered_quantity || l.quantity || 1,
              unit_price: l.unit_price || 0,
            }))
          )
        }
      }
    } catch (fetchErr) {
      console.warn('Failed to fetch latest purchase order state:', fetchErr)
    } finally {
      setFetchingLatest(false)
    }
  }

  // Refetch fresh purchase order details on open in edit mode
  useEffect(() => {
    if (isOpen && isEdit && order?.id) {
      refetchLatestOrder()
    }
  }, [isOpen, isEdit, order?.id])

  // Load suppliers, materials, and units
  useEffect(() => {
    if (!isOpen) return
    setLoadingLookups(true)

    const fetchSuppliers = storeId
      ? listStorePurchasingSuppliers(storeId)
      : listPurchasingSuppliers(companyId)

    Promise.all([
      fetchSuppliers,
      listActiveMaterials(),
      listUnits({ isActive: true }).catch(() => []),
    ])
      .then(([supplierList, materialList, unitList]) => {
        setSuppliers(supplierList || [])
        setMaterials(materialList || [])
        setUnits(unitList || [])
      })
      .catch((err) => {
        console.warn('Lookup error in PurchaseOrderModal:', err)
      })
      .finally(() => {
        setLoadingLookups(false)
      })
  }, [isOpen, storeId, companyId])

  // If order changes (edit mode or prefilled create mode), initialize values
  useEffect(() => {
    if (order) {
      if (order.version !== undefined) setCurrentVersion(order.version)
      if (order.status) setCurrentStatus(order.status)
      if (order.company_id || order.company?.id) {
        setCompanyId(order.company_id || order.company?.id)
      }
      if (order.supplier_id || order.supplier?.id) {
        setSupplierId(order.supplier_id || order.supplier?.id)
      }
      if (order.currency_code) setCurrencyCode(order.currency_code)
      if (order.created_at) setPoDate(order.created_at.slice(0, 10))
      if (order.expected_delivery_date) setExpectedDeliveryDate(order.expected_delivery_date)
      if (order.notes) setNotes(order.notes)
      if (Array.isArray(order.lines) && order.lines.length > 0) {
        setLines(
          order.lines.map((l) => ({
            id: l.id,
            material_id: l.material_id || l.material?.id || '',
            material_name: l.material_name || l.material?.name || '',
            material_code: l.material_code || l.material?.code || '',
            material_kind: l.material?.kind || (l.material_code?.startsWith('PKG') ? 'PACKAGING' : 'RAW'),
            unit_code: l.unit_code || l.unit?.code || '',
            unit_id: l.unit_id || l.unit?.id || null,
            quantity: l.ordered_quantity || l.quantity || 1,
            unit_price: l.unit_price || 0,
          }))
        )
      }
    }
  }, [order, isEdit, initialCompanyId])

  // Subtotal calculation
  const subtotal = useMemo(() => {
    return lines.reduce((sum, line) => {
      const q = parseFloat(line.quantity) || 0
      const p = parseFloat(line.unit_price) || 0
      return sum + q * p
    }, 0)
  }, [lines])

  const handleAddLine = () => {
    setLines((prev) => [
      ...prev,
      {
        material_id: '',
        material_name: '',
        material_code: '',
        material_kind: 'RAW',
        unit_code: '',
        unit_id: null,
        quantity: 1,
        unit_price: 0,
      },
    ])
  }

  const handleRemoveLine = (index) => {
    if (lines.length <= 1 && !isEdit) {
      alert('A purchase order requires at least one item line.')
      return
    }
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  const handleLineChange = (index, field, value) => {
    setLines((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      if (field === 'material_id') {
        const mat = materials.find((m) => String(m.id) === String(value))
        if (mat) {
          updated[index].material_name = mat.name
          updated[index].material_code = mat.code
          const kindStr = String(mat.kind || '').toUpperCase()
          updated[index].material_kind = kindStr.includes('PACK') ? 'PACKAGING' : 'RAW'
          const defaultUnitId = mat.base_unit?.id || mat.base_unit_id || null
          const defaultCode = mat.base_unit?.code || mat.base_unit_code || ''

          // Try exact id match first, then exact code match
          let matchingUnit = units.find(
            (u) => (defaultUnitId && u.id === defaultUnitId) || (u.code && u.code === defaultCode)
          )

          // If material has a legacy demo unit (e.g. DEMOKG -> KG, DEMOBTL -> PCS), find active alternative
          if (!matchingUnit && defaultCode) {
            const cleanCode = defaultCode.replace(/^DEMO/i, '')
            matchingUnit = units.find(
              (u) => u.code?.toUpperCase() === cleanCode.toUpperCase()
            )
          }

          if (matchingUnit) {
            updated[index].unit_code = matchingUnit.code
            updated[index].unit_id = matchingUnit.id
            updated[index].unit_is_inactive = false
          } else {
            updated[index].unit_code = defaultCode || ''
            updated[index].unit_id = defaultUnitId || null
            updated[index].unit_is_inactive = !!defaultCode
          }
        }
      }
      if (field === 'unit_id') {
        const u = units.find((un) => String(un.id) === String(value))
        if (u) {
          updated[index].unit_id = u.id
          updated[index].unit_code = u.code
          updated[index].unit_is_inactive = false
        } else {
          updated[index].unit_id = value || null
          updated[index].unit_is_inactive = true
        }
      }
      return updated
    })
  }

  const validate = () => {
    const problems = {}
    if (!companyId) problems.company_id = 'Please select a legal / billing purchasing company entity.'
    if (!supplierId) problems.supplier_id = 'Please select a supplier.'

    const selectedSupplier = suppliers.find((s) => String(s.id) === String(supplierId))
    if (selectedSupplier && selectedSupplier.is_active === false) {
      problems.supplier_id = `Supplier '${selectedSupplier.code || selectedSupplier.name}' is inactive and cannot be used.`
    }

    if (!isEdit) {
      if (!lines || lines.length === 0) {
        problems.lines = 'At least one material line item is required.'
      } else {
        lines.forEach((line, idx) => {
          if (!line.material_id) {
            problems[`line_${idx}_material`] = 'Choose a material.'
          }
          if (parseFloat(line.quantity) <= 0 || isNaN(parseFloat(line.quantity))) {
            problems[`line_${idx}_quantity`] = 'Quantity must be > 0.'
          }
          if (parseFloat(line.unit_price) < 0 || isNaN(parseFloat(line.unit_price))) {
            problems[`line_${idx}_price`] = 'Unit price cannot be negative.'
          }
          // Validate unit of measure
          if (units.length > 0 && line.unit_id) {
            const isActiveUnit = units.some((u) => String(u.id) === String(line.unit_id))
            if (!isActiveUnit) {
              problems[`line_${idx}_unit`] = `Unit '${line.unit_code || 'selected'}' is inactive. Please choose an active unit (e.g. KG, GM, PCS).`
            }
          }
        })
      }
    } else {
      lines.forEach((line, idx) => {
        if (parseFloat(line.unit_price) < 0 || isNaN(parseFloat(line.unit_price))) {
          problems[`line_${idx}_price`] = 'Unit price cannot be negative.'
        }
      })
    }

    setFieldErrors(problems)
    const errKeys = Object.keys(problems)
    if (errKeys.length > 0) {
      const firstProblem = problems[errKeys[0]]
      setError(firstProblem)
      setTimeout(() => {
        const modalBody = document.querySelector('.inv-modal-body')
        if (modalBody) {
          if (typeof modalBody.scrollTo === 'function') {
            modalBody.scrollTo({ top: 0, behavior: 'smooth' })
          } else {
            modalBody.scrollTop = 0
          }
        }
      }, 50)
      return false
    }
    return true
  }

  const handleSubmit = async (e) => {
    if (e) e.preventDefault()
    if (busy) return
    setError('')
    if (!validate()) return

    setBusy(true)

    try {
      if (isEdit) {
        const payload = {
          expected_version: currentVersion ?? order.version,
          supplier_id: Number(supplierId),
          expected_delivery_date: expectedDeliveryDate || null,
          notes: notes.trim(),
        }
        const lineUpdates = lines
          .filter((l) => l.id != null)
          .map((l) => ({
            id: l.id,
            unit_price: parseFloat(l.unit_price) || 0,
          }))
        if (lineUpdates.length > 0) {
          payload.lines = lineUpdates
        }

        let res
        if (storeId) {
          try {
            res = await updateStorePurchaseOrder(storeId, order.id, payload)
          } catch (storeErr) {
            if (storeErr?.response?.status === 404) {
              res = await updatePurchaseOrder(companyId, order.id, payload)
            } else {
              throw storeErr
            }
          }
        } else {
          res = await updatePurchaseOrder(companyId, order.id, payload)
        }

        if (onSaved) onSaved(res)
        if (onClose) onClose()
      } else {
        const payload = {
          supplier_id: Number(supplierId),
          currency_code: currencyCode || 'INR',
          expected_delivery_date: expectedDeliveryDate || null,
          notes: notes.trim(),
          lines: lines.map((l) => {
            const lineObj = {
              material_id: Number(l.material_id),
              quantity: parseFloat(l.quantity) || 1,
              unit_price: parseFloat(l.unit_price) || 0,
            }
            if (l.unit_id) lineObj.unit_id = Number(l.unit_id)
            return lineObj
          }),
        }

        let res
        if (storeId) {
          try {
            res = await createStorePurchaseOrder(storeId, { ...payload, company_id: Number(companyId) })
          } catch (storeErr) {
            // Only fall back to company endpoint if store endpoint doesn't exist (404)
            if (storeErr?.response?.status === 404) {
              res = await createPurchaseOrder(companyId, payload)
            } else {
              throw storeErr
            }
          }
        } else {
          res = await createPurchaseOrder(companyId, payload)
        }

        if (onSaved) onSaved(res)
        if (onClose) onClose()
      }
    } catch (err) {
      const respData = err?.response?.data
      if (respData && typeof respData === 'object' && !Array.isArray(respData)) {
        setFieldErrors(respData)
      }
      const errMsg = getErrorMessage(err)
      setError(errMsg)
      if (isEdit && (errMsg.toLowerCase().includes('refetch') || errMsg.toLowerCase().includes('changed') || err?.response?.status === 409)) {
        refetchLatestOrder()
      }
      setTimeout(() => {
        const modalBody = document.querySelector('.inv-modal-body')
        if (modalBody) {
          if (typeof modalBody.scrollTo === 'function') {
            modalBody.scrollTo({ top: 0, behavior: 'smooth' })
          } else {
            modalBody.scrollTop = 0
          }
        }
      }, 50)
    } finally {
      setBusy(false)
    }
  }

  const resolvedStoreTitle = storeName || (storeId ? `Shared Store #${storeId}` : 'Shared Central Inventory Store')

  return (
    <Modal
      isOpen={isOpen}
      title={isEdit ? `Edit Purchase Order (${order?.reference || `#${order?.id}`})` : 'Create Purchase Order'}
      onClose={onClose}
      maxWidth="960px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            {error && (
              <span style={{ color: '#ef4444', fontSize: 12.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                ⚠️ {error}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              {isReadOnly ? 'Close' : 'Cancel'}
            </Button>
            {!isReadOnly && (
              <Button variant="primary" onClick={handleSubmit} disabled={busy || loadingLookups || fetchingLatest}>
                {busy ? 'Saving...' : isEdit ? 'Update Purchase Order' : 'Create Purchase Order'}
              </Button>
            )}
          </div>
        </div>
      }
    >
      {isReadOnly && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 16,
            color: '#991b1b',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 24 }}>🔒</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>
              Purchase Order is {currentStatus} (Read-Only)
            </div>
            <div style={{ fontSize: 12.5, marginTop: 2, color: '#7f1d1d' }}>
              This purchase order has already been issued to the supplier and cannot be modified. Only Draft purchase orders can be edited.
            </div>
          </div>
        </div>
      )}

      {error && (
        <Alert type="error" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span>{error}</span>
            {isEdit && (
              <button
                type="button"
                onClick={() => {
                  setError('')
                  refetchLatestOrder()
                }}
                disabled={fetchingLatest}
                style={{
                  background: '#b91c1c',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {fetchingLatest ? 'Refreshing...' : '🔄 Refetch Latest Data'}
              </button>
            )}
          </div>
        </Alert>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Row 1: Receiving Store & Supplier */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label className="ci-label" style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 4 }}>
              Receiving Shared Store <span style={{ color: '#0284c7' }}>(Destination)</span>
            </label>
            <input
              type="text"
              className="ci-input"
              style={{ width: '100%', background: '#f8fafc', color: '#0f172a', fontWeight: 500 }}
              value={resolvedStoreTitle}
              disabled
            />
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
              Physical raw &amp; packaging materials arrive into this common inventory store.
            </div>
          </div>

          <div>
            <label className="ci-label" style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 4 }}>
              Authorized Supplier <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              className="ci-select"
              style={{
                width: '100%',
                borderColor: fieldErrors.supplier_id ? '#ef4444' : undefined,
                background: fieldErrors.supplier_id ? '#fff5f5' : undefined,
              }}
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value)
                if (fieldErrors.supplier_id) {
                  setFieldErrors((prev) => ({ ...prev, supplier_id: undefined }))
                  if (error === fieldErrors.supplier_id) setError('')
                }
              }}
              disabled={busy || isReadOnly}
            >
              <option value="">-- Select Active Supplier (Required) --</option>
              {suppliers.map((s) => {
                const isInactive = s.is_active === false
                return (
                  <option key={s.id} value={s.id} disabled={isInactive}>
                    {s.code ? `${s.code} — ` : ''}{s.name || s.display_name || s.legal_name}
                    {isInactive ? ' (⚠️ Inactive)' : ''}
                  </option>
                )
              })}
            </select>
            {fieldErrors.supplier_id && (
              <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4, fontWeight: 500 }}>
                ⚠️ {fieldErrors.supplier_id}
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Legal/Billing Entity & Currency */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 14 }}>
          <div>
            <label className="ci-label" style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 4 }}>
              Legal / Billing Entity (Invoice To) <span style={{ color: '#ef4444' }}>*</span>
            </label>
            {companies.length > 1 && !isEdit ? (
              <select
                className="ci-select"
                style={{ width: '100%', borderColor: fieldErrors.company_id ? '#ef4444' : undefined }}
                value={companyId}
                onChange={(e) => setCompanyId(Number(e.target.value))}
                disabled={busy || isEdit}
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} &mdash; {c.legal_name || c.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                className="ci-input"
                style={{ width: '100%', background: '#f8fafc' }}
                value={companies.find((c) => c.id === Number(companyId))?.legal_name || companies.find((c) => c.id === Number(companyId))?.name || `Company #${companyId}`}
                disabled
              />
            )}
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
              Required accounting buyer for supplier billing. Consuming company is recorded in Outward / Issue.
            </div>
            {fieldErrors.company_id && (
              <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{fieldErrors.company_id}</div>
            )}
          </div>

          <div>
            <label className="ci-label" style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 4 }}>
              Currency
            </label>
            <select
              className="ci-select"
              style={{ width: '100%' }}
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value)}
              disabled={busy || isEdit}
            >
              <option value="INR">INR (₹ Indian Rupee)</option>
              <option value="USD">USD ($ US Dollar)</option>
              <option value="EUR">EUR (€ Euro)</option>
              <option value="GBP">GBP (£ British Pound)</option>
            </select>
            {fieldErrors.currency_code && (
              <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{fieldErrors.currency_code}</div>
            )}
          </div>
        </div>

        {/* Row 3: PO Date & Expected Delivery Date */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label className="ci-label" style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 4 }}>
              PO Date
            </label>
            <input
              type="date"
              className="ci-input"
              style={{ width: '100%', background: '#f8fafc' }}
              value={poDate}
              onChange={(e) => setPoDate(e.target.value)}
              disabled={isEdit}
            />
          </div>

          <div>
            <label className="ci-label" style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 4 }}>
              Expected Delivery Date
            </label>
            <input
              type="date"
              className="ci-input"
              style={{ width: '100%' }}
              value={expectedDeliveryDate}
              onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              disabled={busy || isReadOnly}
            />
            {fieldErrors.expected_delivery_date && (
              <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{fieldErrors.expected_delivery_date}</div>
            )}
          </div>
        </div>

        {/* Notes & Remarks */}
        <div>
          <label className="ci-label" style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 4 }}>
            Terms &amp; Order Remarks
          </label>
          <textarea
            className="ci-input"
            rows={2}
            style={{ width: '100%', resize: 'vertical' }}
            placeholder="Delivery terms, quote reference, packaging requirements, remarks..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={busy || isReadOnly}
          />
          {fieldErrors.notes && (
            <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{fieldErrors.notes}</div>
          )}
        </div>

        {/* Multi-line Materials Table */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                Purchase Order Lines ({lines.length})
              </h4>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Select raw or packaging materials, quantities and negotiated prices.
              </div>
            </div>
            {!isEdit && (
              <Button size="sm" variant="secondary" onClick={handleAddLine} disabled={busy}>
                + Add Material Line
              </Button>
            )}
          </div>

          {fieldErrors.lines && (
            <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 8, fontWeight: 500 }}>
              ⚠️ {fieldErrors.lines}
            </div>
          )}

          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, margin: 0 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ width: 36, padding: '10px 8px', color: '#475569', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', textAlign: 'center' }}>#</th>
                  <th style={{ padding: '10px 12px', color: '#475569', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', textAlign: 'left' }}>Material Code / Name</th>
                  <th style={{ width: 85, padding: '10px 8px', color: '#475569', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', textAlign: 'center' }}>Type</th>
                  <th style={{ width: 110, padding: '10px 8px', color: '#475569', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', textAlign: 'left' }}>Quantity</th>
                  <th style={{ width: 100, padding: '10px 8px', color: '#475569', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', textAlign: 'center' }}>Unit</th>
                  <th style={{ width: 125, padding: '10px 8px', color: '#475569', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', textAlign: 'left' }}>Unit Price ({currencyCode})</th>
                  <th style={{ width: 115, padding: '10px 12px', color: '#475569', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', textAlign: 'right' }}>Amount ({currencyCode})</th>
                  {!isEdit && <th style={{ width: 36, padding: '10px 4px', textAlign: 'center' }}></th>}
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => {
                  const q = parseFloat(line.quantity) || 0
                  const p = parseFloat(line.unit_price) || 0
                  const lineTotal = (q * p).toFixed(2)
                  const matError = fieldErrors[`line_${idx}_material`]
                  const qtyError = fieldErrors[`line_${idx}_quantity`]
                  const prcError = fieldErrors[`line_${idx}_price`]

                  const isPackaging = line.material_kind === 'PACKAGING' || line.material_code?.startsWith('PKG')

                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#fafcff' }}>
                      <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: '8px 4px' }}>{idx + 1}</td>
                      <td style={{ padding: '8px 10px' }}>
                        {isEdit ? (
                          <div>
                            <strong>{line.material_code || `Material #${line.material_id}`}</strong>
                            {line.material_name && <div style={{ fontSize: 12, color: '#64748b' }}>{line.material_name}</div>}
                          </div>
                        ) : (
                          <div>
                            <select
                              className="ci-select"
                              style={{
                                width: '100%',
                                height: 36,
                                minHeight: 36,
                                padding: '0 28px 0 10px',
                                fontSize: 12.5,
                                borderColor: matError ? '#ef4444' : '#cbd5e1',
                                background: matError ? '#fff5f5' : '#ffffff',
                              }}
                              value={line.material_id}
                              onChange={(e) => handleLineChange(idx, 'material_id', e.target.value)}
                              disabled={busy}
                            >
                              <option value="">-- Select Material --</option>
                              {materials.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.code} &mdash; {m.name} ({m.base_unit?.code || m.base_unit_code || 'UOM'})
                                </option>
                              ))}
                            </select>
                            {matError && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 2 }}>{matError}</div>}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px 6px' }}>
                        <span
                          className="stock-badge"
                          style={{
                            background: isPackaging ? '#ede9fe' : '#e0f2fe',
                            color: isPackaging ? '#6d28d9' : '#0369a1',
                            fontSize: 10.5,
                            padding: '3px 7px',
                            fontWeight: 700,
                            borderRadius: 4,
                          }}
                        >
                          {isPackaging ? 'PACKAGING' : 'RAW'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 8px' }}>
                        {isEdit ? (
                          <span>{line.quantity}</span>
                        ) : (
                          <div>
                            <input
                              type="number"
                              step="any"
                              min="0.001"
                              className="ci-input"
                              style={{
                                width: '100%',
                                height: 36,
                                minHeight: 36,
                                padding: '0 8px',
                                fontSize: 12.5,
                                borderColor: qtyError ? '#ef4444' : '#cbd5e1',
                                background: qtyError ? '#fff5f5' : '#ffffff',
                              }}
                              value={line.quantity}
                              onChange={(e) => handleLineChange(idx, 'quantity', e.target.value)}
                              disabled={busy}
                            />
                            {qtyError && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 2 }}>{qtyError}</div>}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px 6px', minWidth: 110 }}>
                        {isEdit ? (
                          <span
                            style={{
                              color: '#334155',
                              fontSize: 12,
                              fontWeight: 700,
                              background: '#f1f5f9',
                              padding: '4px 8px',
                              borderRadius: 4,
                              display: 'inline-block',
                            }}
                          >
                            {line.unit_code || '-'}
                          </span>
                        ) : (
                          <div>
                            <select
                              className="ci-select"
                              style={{
                                width: '100%',
                                height: 36,
                                minHeight: 36,
                                padding: '0 24px 0 6px',
                                fontSize: 12,
                                fontWeight: 600,
                                color: line.unit_is_inactive ? '#dc2626' : '#1e293b',
                                borderColor: (fieldErrors[`line_${idx}_unit`] || line.unit_is_inactive) ? '#ef4444' : '#cbd5e1',
                                background: (fieldErrors[`line_${idx}_unit`] || line.unit_is_inactive) ? '#fff5f5' : '#ffffff',
                              }}
                              value={line.unit_id || ''}
                              onChange={(e) => handleLineChange(idx, 'unit_id', e.target.value)}
                              disabled={busy}
                            >
                              <option value="">-- Select Unit --</option>
                              {line.unit_id && !units.some((u) => String(u.id) === String(line.unit_id)) && (
                                <option value={line.unit_id} disabled style={{ color: '#ef4444' }}>
                                  ⚠️ {line.unit_code || 'Current'} (Inactive)
                                </option>
                              )}
                              {units.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.code} {u.name && u.name !== u.code ? `(${u.name})` : ''}
                                </option>
                              ))}
                            </select>
                            {fieldErrors[`line_${idx}_unit`] ? (
                              <div style={{ color: '#ef4444', fontSize: 10.5, marginTop: 2, lineHeight: 1.2, textAlign: 'left' }}>
                                {fieldErrors[`line_${idx}_unit`]}
                              </div>
                            ) : line.unit_is_inactive ? (
                              <div style={{ color: '#dc2626', fontSize: 10.5, marginTop: 2, lineHeight: 1.2, textAlign: 'left' }}>
                                ⚠️ Please pick active unit
                              </div>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '8px 8px' }}>
                        <div>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            className="ci-input"
                            style={{
                              width: '100%',
                              height: 36,
                              minHeight: 36,
                              padding: '0 8px',
                              fontSize: 12.5,
                              borderColor: prcError ? '#ef4444' : '#cbd5e1',
                              background: prcError ? '#fff5f5' : '#ffffff',
                            }}
                            value={line.unit_price}
                            onChange={(e) => handleLineChange(idx, 'unit_price', e.target.value)}
                            disabled={busy || isReadOnly}
                          />
                          {prcError && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 2 }}>{prcError}</div>}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#0f172a', padding: '8px 12px', fontSize: 13 }}>
                        {lineTotal}
                      </td>
                      {!isEdit && (
                        <td style={{ textAlign: 'center', padding: '8px 4px' }}>
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#ef4444',
                              cursor: 'pointer',
                              fontSize: 18,
                              fontWeight: 'bold',
                              padding: '4px 8px',
                              lineHeight: 1,
                              borderRadius: 4,
                            }}
                            title="Remove line"
                            disabled={busy}
                          >
                            &times;
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0', fontWeight: 700 }}>
                  <td colSpan={isEdit ? 5 : 5} style={{ textAlign: 'right', padding: '12px 14px', color: '#475569' }}>
                    Authoritative Pre-Tax Subtotal:
                  </td>
                  <td style={{ textAlign: 'right', color: '#0284c7', fontSize: 14, fontWeight: 800, padding: '12px 14px' }}>
                    {currencyCode} {subtotal.toFixed(2)}
                  </td>
                  {!isEdit && <td></td>}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  )
}
