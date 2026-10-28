import { useEffect, useState } from 'react'

import { Link } from 'react-router-dom'
import Modal from '../inventory/components/Modal'
import Button from '../../components/Button'
import Alert from '../../components/Alert'
import { LoadingState } from '../../components/Spinner'

import { activateProduct, createProduct, deactivateProduct, getProduct, updateProduct } from './productsService'
import { listProductTypes } from './productTypesService'
import { getErrorMessage } from '../../utils/errors'
import useAuth from '../../hooks/useAuth'
import './ProductFormModal.css'

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

export default function ProductFormModal({ realCompanyId, productId, canEdit, canActivate, canDeactivate, onClose, onSaved }) {
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
  // Only ever populated in edit mode, from the server's own response - the
  // create form no longer asks for a sales unit at all (the server picks
  // one automatically; see apps.products.services.resolve_default_sales_uom).
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
    let cancelled = false
    listProductTypes()
      .then((rows) => !cancelled && setTypeOptions(rows))
      .catch(() => !cancelled && setTypeOptions([]))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isEditMode) return
    let cancelled = false
    setLoadingDetail(true)
    getProduct(realCompanyId, productId)
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
    return () => {
      cancelled = true
    }
  }, [isEditMode, realCompanyId, productId])

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
        // Only these fields can change; code, company and sales unit are immutable.
        saved = await updateProduct(realCompanyId, productId, {
          expected_version: expectedVersion,
          code: form.code,
          name: form.name,
          product_type: form.product_type,
          pack_size: form.pack_size,
          bmr_no: form.bmr_no,
          description: form.description,
        })
      } else {
        // No sales_uom_id - the form no longer asks for one. The server
        // picks it automatically (resolve_default_sales_uom).
        saved = await createProduct(realCompanyId, {
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
        ? await deactivateProduct(realCompanyId, productId, expectedVersion)
        : await activateProduct(realCompanyId, productId, expectedVersion)
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
        <Button variant="secondary" onClick={handleToggleActive} loading={saving} disabled={isActive ? !canDeactivate : !canActivate}>
          {isActive ? 'Deactivate' : 'Activate'}
        </Button>
      )}
      <Button variant="secondary" onClick={onClose} disabled={saving}>
        Cancel
      </Button>
      {!readOnly && (
        <Button onClick={handleSubmit} loading={saving} disabled={saving}>
          {isEditMode ? 'Save product' : 'Create product'}
        </Button>
      )}
    </>
  )

  if (loadingDetail) {
    return (
      <Modal title={title} onClose={onClose} size="md">
        <LoadingState label="Loading product…" compact />
      </Modal>
    )
  }
  if (loadError) {
    return (
      <Modal title={title} onClose={onClose} size="md">
        <Alert type="error">{loadError}</Alert>
      </Modal>
    )
  }

  return (
    <Modal title={title} onClose={onClose} size="lg" footer={footer}>
      {readOnly && <Alert type="error">View only. You can see this product but not change it.</Alert>}
      {formError && <Alert type="error">{formError}</Alert>}
      {conflict && (
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Reload page
        </Button>
      )}

      {isEditMode && (
        <p className="pf-formula-link">
          <Link to={`/formulas?product=${productId}`}>View formulas for this product</Link>
        </p>
      )}

      <form id="product-form" className="pf-form" onSubmit={handleSubmit}>
        <div className="inv-form-grid">
          <div className="field">
            <label className="field-label" htmlFor="pf-code">
              Code * {isEditMode && (isAdmin ? <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 'bold' }}>(Admin only)</span> : <span style={{ fontSize: '11px', color: '#64748b' }}>(Locked)</span>)}
            </label>
            <input
              id="pf-code"
              className="field-input"
              value={form.code}
              onChange={(event) => updateField('code', event.target.value)}
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
            <input
              id="pf-name"
              className="field-input"
              value={form.name}
              onChange={(event) => updateField('name', event.target.value)}
              disabled={readOnly}
              required
            />
            {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="pf-type">Product type</label>
            <select
              id="pf-type"
              className="field-input"
              value={form.product_type}
              onChange={(event) => updateField('product_type', event.target.value)}
              disabled={readOnly}
            >
              <option value="">Not specified</option>
              {typeChoices(form.product_type).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
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
              onChange={(event) => updateField('pack_size', event.target.value)}
              disabled={readOnly}
              placeholder="e.g. 10x10 Tablets, 100 ml, 30 ml Bottle"
            />
            {fieldErrors.pack_size && <span className="field-error">{fieldErrors.pack_size}</span>}
          </div>

          {/* Sales unit is no longer asked for on create - the server picks
              one automatically (see createProduct's call site above). It is
              still shown, read only, once a product exists: it's real,
              immutable data on the record, just not something this form
              collects itself. */}
          {isEditMode && (
            <div className="field">
              <span className="field-label">Sales unit</span>
              <div className="field-input field-readonly">{salesUomLabel || '—'}</div>
              <span className="pf-hint">Fixed after the product is created.</span>
            </div>
          )}

          <div className="field">
            <label className="field-label" htmlFor="pf-bmr-no">BMR No.</label>
            <input
              id="pf-bmr-no"
              className="field-input"
              value={form.bmr_no}
              onChange={(event) => updateField('bmr_no', event.target.value)}
              disabled={readOnly}
              placeholder="e.g. BMR-0042"
            />
            {fieldErrors.bmr_no && <span className="field-error">{fieldErrors.bmr_no}</span>}
          </div>

          <div className="field field-full">
            <label className="field-label" htmlFor="pf-description">Description</label>
            <textarea
              id="pf-description"
              className="field-input pf-textarea"
              rows={3}
              value={form.description}
              onChange={(event) => updateField('description', event.target.value)}
              disabled={readOnly}
            />
            {fieldErrors.description && <span className="field-error">{fieldErrors.description}</span>}
          </div>
        </div>
      </form>
    </Modal>
  )
}
