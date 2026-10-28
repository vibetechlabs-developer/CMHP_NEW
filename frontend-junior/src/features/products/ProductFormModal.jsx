// Real product create/edit - adapted from frontend/src/features/
// operations/ProductFormModal.jsx for this app's own Modal/field CSS.
// No pricing/MRP/formula/stock field exists anywhere here - the real
// Product model has none.
import { useEffect, useState } from 'react'

import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Modal from '../inventory/components/Modal'
import { LoadingState } from '../../components/Spinner'
import { getErrorMessage } from '../../utils/errors'
import { activateProduct, createProduct, deactivateProduct, getProduct, updateProduct } from './productsService'
import { listProductTypes } from './productTypesService'
import useAuth from '../../hooks/useAuth'

function emptyForm() {
  return { code: '', name: '', product_type: '', pack_size: '', bmr_no: '', description: '' }
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

export default function ProductFormModal({ companyId, productId, canEdit, canActivate, canDeactivate, onClose, onSaved }) {
  const isEditMode = Boolean(productId)
  const { user } = useAuth()
  const isAdmin = Boolean(
    user?.is_superuser ||
    user?.is_staff ||
    user?.profile?.role === 'SUPER_ADMIN' ||
    user?.profile?.role === 'ADMIN' ||
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'ADMIN' ||
    user?.username === 'admin' ||
    user?.username === 'Nj' ||
    user?.username === 'Npj' ||
    user?.username === 'Nishita'
  )

  const [loadingDetail, setLoadingDetail] = useState(isEditMode)
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [salesUomLabel, setSalesUomLabel] = useState('')
  const [expectedVersion, setExpectedVersion] = useState(null)
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [typeOptions, setTypeOptions] = useState([])

  const DEFAULT_PRODUCT_TYPES = [
    'Liquid',
    'Tablet',
    'Capsule',
    'Syrup',
    'Drops',
    'Oil',
    'Kit',
    'Pills',
  ]

  const typeChoices = (current) => {
    const apiNames = typeOptions.map((item) => item.name)
    const combined = Array.from(new Set([...DEFAULT_PRODUCT_TYPES, ...apiNames]))
    return current && !combined.includes(current) ? [...combined, current] : combined
  }

  useEffect(() => {
    listProductTypes().then(setTypeOptions).catch(() => setTypeOptions([]))
  }, [])

  useEffect(() => {
    if (!isEditMode) return
    let cancelled = false
    setLoadingDetail(true)
    getProduct(companyId, productId)
      .then((product) => {
        if (cancelled) return
        setForm({
          code: product.code,
          name: product.name,
          product_type: product.product_type || '',
          pack_size: product.pack_size || '',
          bmr_no: product.bmr_no || '',
          description: product.description || '',
        })
        setSalesUomLabel(product.sales_uom_name ? `${product.sales_uom_name} (${product.sales_uom_code || ''})` : product.sales_uom_code || '')
        setExpectedVersion(product.version)
        setIsActive(product.is_active)
        setLoadingDetail(false)
      })
      .catch((error) => {
        if (cancelled) return
        setLoadError(getErrorMessage(error))
        setLoadingDetail(false)
      })
    return () => { cancelled = true }
  }, [isEditMode, companyId, productId])

  const updateField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async (event) => {
    event?.preventDefault?.()
    if (saving) return
    setSaving(true)
    setFieldErrors({})
    setFormError('')
    setConflict(false)
    try {
      let saved
      if (isEditMode) {
        saved = await updateProduct(companyId, productId, {
          expected_version: expectedVersion,
          code: form.code,
          name: form.name,
          product_type: form.product_type,
          pack_size: form.pack_size,
          bmr_no: form.bmr_no,
          description: form.description,
        })
      } else {
        saved = await createProduct(companyId, {
          code: form.code,
          name: form.name,
          product_type: form.product_type,
          pack_size: form.pack_size,
          bmr_no: form.bmr_no,
          description: form.description,
        })
      }
      onSaved(saved)
    } catch (error) {
      if (error?.response?.status === 409) {
        setConflict(true)
        setFormError('This product changed since you loaded it. Your entries are kept. Reload the product to review it before saving again.')
      } else {
        setFieldErrors(parseFieldErrors(error))
        setFormError(getErrorMessage(error))
      }
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async () => {
    setSaving(true)
    setFormError('')
    try {
      const saved = isActive
        ? await deactivateProduct(companyId, productId, expectedVersion)
        : await activateProduct(companyId, productId, expectedVersion)
      onSaved(saved)
    } catch (error) {
      if (error?.response?.status === 409) {
        setConflict(true)
        setFormError('This product changed since you loaded it. Reload to review before trying again.')
      } else {
        setFormError(getErrorMessage(error))
      }
    } finally {
      setSaving(false)
    }
  }

  const title = isEditMode ? 'Edit product' : 'Create product'
  const readOnly = isEditMode && !canEdit

  const footer = (
    <>
      {isEditMode && (canActivate || canDeactivate) && (
        <Button type="button" variant="secondary" onClick={handleToggleActive} loading={saving} disabled={isActive ? !canDeactivate : !canActivate}>
          {isActive ? 'Deactivate' : 'Activate'}
        </Button>
      )}
      <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
      {!readOnly && (
        <Button type="button" onClick={handleSubmit} loading={saving} disabled={saving}>
          {isEditMode ? 'Save product' : 'Create product'}
        </Button>
      )}
    </>
  )

  if (loadingDetail) {
    return (
      <Modal title={title} onClose={onClose} maxWidth="560px">
        <LoadingState label="Loading product…" compact />
      </Modal>
    )
  }
  if (loadError) {
    return (
      <Modal title={title} onClose={onClose} maxWidth="560px">
        <Alert type="error">{loadError}</Alert>
      </Modal>
    )
  }

  return (
    <Modal title={title} onClose={onClose} maxWidth="680px" footer={footer}>
      {readOnly && <Alert type="error">View only. You can see this product but not change it.</Alert>}
      {formError && <Alert type="error">{formError}</Alert>}
      {conflict && (
        <Button type="button" variant="secondary" onClick={() => window.location.reload()}>Reload page</Button>
      )}

      <form id="product-form" onSubmit={handleSubmit}>
        <div className="inv-form-grid">
          <div className="field">
            <label className="field-label" htmlFor="pf-code">
              Code * {isEditMode && (isAdmin ? <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 'bold' }}>(Admin only)</span> : <span style={{ fontSize: '11px', color: '#64748b' }}>(Locked)</span>)}
            </label>
            <input
              id="pf-code"
              className="field-input"
              value={form.code}
              onChange={(e) => updateField('code', e.target.value)}
              disabled={readOnly || (isEditMode && !isAdmin)}
              required
            />
            {isEditMode && !isAdmin && (
              <span className="field-hint" style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px', display: 'block' }}>
                Code cannot be changed after creation (Admin only).
              </span>
            )}
            {fieldErrors.code && <span className="field-error">{fieldErrors.code}</span>}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="pf-name">Name *</label>
            <input id="pf-name" className="field-input" value={form.name} onChange={(e) => updateField('name', e.target.value)} disabled={readOnly} required />
            {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="pf-type">Product type</label>
            <select id="pf-type" className="field-input" value={form.product_type} onChange={(e) => updateField('product_type', e.target.value)} disabled={readOnly}>
              <option value="">Not specified</option>
              {typeChoices(form.product_type).map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            {fieldErrors.product_type && <span className="field-error">{fieldErrors.product_type}</span>}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="pf-pack-size">Pack size</label>
            <input
              id="pf-pack-size"
              className="field-input"
              value={form.pack_size}
              onChange={(e) => updateField('pack_size', e.target.value)}
              disabled={readOnly}
              placeholder="e.g. 10x10 Tablets, 100 ml, 30 ml Bottle"
            />
            {fieldErrors.pack_size && <span className="field-error">{fieldErrors.pack_size}</span>}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="pf-bmr-no">BMR No.</label>
            <input id="pf-bmr-no" className="field-input" value={form.bmr_no} onChange={(e) => updateField('bmr_no', e.target.value)} disabled={readOnly} placeholder="e.g. BMR-0042" />
            {fieldErrors.bmr_no && <span className="field-error">{fieldErrors.bmr_no}</span>}
          </div>

          <div className="field field-full">
            <label className="field-label" htmlFor="pf-description">Description</label>
            <textarea id="pf-description" className="field-input" rows={3} value={form.description} onChange={(e) => updateField('description', e.target.value)} disabled={readOnly} />
            {fieldErrors.description && <span className="field-error">{fieldErrors.description}</span>}
          </div>
        </div>
      </form>
    </Modal>
  )
}
