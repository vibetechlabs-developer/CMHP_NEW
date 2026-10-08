import { useEffect, useState } from 'react'

import { Link } from 'react-router-dom'
import Modal from '../inventory/components/Modal'
import Button from '../../components/Button'
import Alert from '../../components/Alert'
import { LoadingState } from '../../components/Spinner'
import AsyncSearchSelect from './AsyncSearchSelect'

import { activateProduct, createProduct, deactivateProduct, getProduct, updateProduct } from './productsService'
import { searchActiveUnits } from './unitsLookupService'
import { listProductTypes } from './productTypesService'
import { getErrorMessage } from '../../utils/errors'
import './ProductFormModal.css'

function emptyForm() {
  return { code: '', name: '', product_type: '', description: '' }
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

  const [loadingDetail, setLoadingDetail] = useState(isEditMode)
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [salesUom, setSalesUom] = useState(null)
  const [salesUomLabel, setSalesUomLabel] = useState('')
  const [expectedVersion, setExpectedVersion] = useState(null)
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [typeOptions, setTypeOptions] = useState([])
  // The sales unit is only needed to create a product (it is immutable after
  // creation). The lookup is probed up front so a blocked unit list is shown
  // clearly instead of appearing as an empty dropdown.
  const [unitsChecked, setUnitsChecked] = useState(isEditMode)
  const [unitsBlockedMessage, setUnitsBlockedMessage] = useState('')

  const typeChoices = (current) => {
    const names = typeOptions.map((item) => item.name)
    return current && !names.includes(current) ? [...names, current] : names
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
    if (isEditMode) return
    let cancelled = false
    searchActiveUnits('')
      .then(() => {
        if (cancelled) return
        setUnitsChecked(true)
      })
      .catch((error) => {
        if (cancelled) return
        const status = error?.response?.status
        if (status === 403) {
          setUnitsBlockedMessage(
            error.response?.data?.detail ||
              "The 'shared_catalog.view' permission (in at least one active store) is required."
          )
        } else {
          setUnitsBlockedMessage(getErrorMessage(error))
        }
        setUnitsChecked(true)
      })
    return () => {
      cancelled = true
    }
  }, [isEditMode])

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
          name: form.name,
          product_type: form.product_type,
          description: form.description,
        })
      } else {
        saved = await createProduct(realCompanyId, {
          code: form.code,
          name: form.name,
          product_type: form.product_type,
          description: form.description,
          sales_uom_id: salesUom ? Number(salesUom.id) : undefined,
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
  const unitsBlocked = !isEditMode && unitsChecked && Boolean(unitsBlockedMessage)

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
        <Button onClick={handleSubmit} loading={saving} disabled={saving || unitsBlocked || (!isEditMode && !unitsChecked)}>
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
      {unitsBlocked && (
        <Alert type="error">
          Sales units cannot be loaded for your account, so a product cannot be created here. Needed: shared_catalog.view in an active store. Server message: {unitsBlockedMessage}
        </Alert>
      )}
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
            <label className="field-label" htmlFor="pf-code">Code *</label>
            <input
              id="pf-code"
              className="field-input"
              value={form.code}
              onChange={(event) => updateField('code', event.target.value)}
              disabled={isEditMode || readOnly}
              required
            />
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

          {isEditMode ? (
            <div className="field">
              <span className="field-label">Sales unit</span>
              <div className="field-input field-readonly">{salesUomLabel || '—'}</div>
              <span className="pf-hint">Fixed after the product is created.</span>
            </div>
          ) : (
            <div className="field">
              <label className="field-label" htmlFor="pf-unit">Sales unit *</label>
              {unitsBlocked ? (
                <div className="field-input field-readonly is-muted">Unavailable</div>
              ) : (
                <AsyncSearchSelect
                  id="pf-unit"
                  value={salesUom?.id || ''}
                  selected={salesUom}
                  onChange={setSalesUom}
                  fetchOptions={searchActiveUnits}
                  getOptionLabel={(o) => o.label}
                  getOptionMeta={(o) => o.meta}
                  placeholder="Search unit by code or name…"
                  disabled={readOnly || !unitsChecked}
                  required
                />
              )}
              {fieldErrors.sales_uom_id && <span className="field-error">{fieldErrors.sales_uom_id}</span>}
            </div>
          )}

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
