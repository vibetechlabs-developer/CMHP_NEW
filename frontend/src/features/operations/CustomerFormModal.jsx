import { useEffect, useState } from 'react'

import Modal from '../inventory/components/Modal'
import Button from '../../components/Button'
import Input from '../../components/Input'
import Alert from '../../components/Alert'
import { LoadingState } from '../../components/Spinner'

import { activateCustomer, createCustomer, deactivateCustomer, getCustomer, updateCustomer } from './customersService'
import { getErrorMessage } from '../../utils/errors'

function emptyForm() {
  return { code: '', name: '', contact_person: '', email: '', phone: '', billing_address: '', shipping_address: '', notes: '' }
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

export default function CustomerFormModal({ realCompanyId, customerId, canEdit, canActivate, canDeactivate, onClose, onSaved }) {
  const isEditMode = Boolean(customerId)

  const [loadingDetail, setLoadingDetail] = useState(isEditMode)
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [expectedVersion, setExpectedVersion] = useState(null)
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [conflict, setConflict] = useState(false)

  useEffect(() => {
    if (!isEditMode) return
    let cancelled = false
    setLoadingDetail(true)
    getCustomer(realCompanyId, customerId)
      .then((customer) => {
        if (cancelled) return
        setForm({
          code: customer.code,
          name: customer.name,
          contact_person: customer.contact_person || '',
          email: customer.email || '',
          phone: customer.phone || '',
          billing_address: customer.billing_address || '',
          shipping_address: customer.shipping_address || '',
          notes: customer.notes || '',
        })
        setExpectedVersion(customer.version)
        setIsActive(customer.is_active)
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
  }, [isEditMode, realCompanyId, customerId])

  const updateField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setFieldErrors({})
    setFormError('')
    setConflict(false)
    try {
      let saved
      if (isEditMode) {
        // code is immutable - never sent on update.
        const { code: _code, ...editable } = form
        saved = await updateCustomer(realCompanyId, customerId, { expected_version: expectedVersion, ...editable })
      } else {
        saved = await createCustomer(realCompanyId, form)
      }
      onSaved(saved)
    } catch (error) {
      if (error?.response?.status === 409) {
        setConflict(true)
        setFormError('This customer changed since you last loaded it. Your entries are preserved — reload to see the latest version before trying again.')
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
        ? await deactivateCustomer(realCompanyId, customerId, expectedVersion)
        : await activateCustomer(realCompanyId, customerId, expectedVersion)
      onSaved(saved)
    } catch (error) {
      if (error?.response?.status === 409) {
        setConflict(true)
        setFormError('This customer changed since you last loaded it. Reload to see the latest version before trying again.')
      } else {
        setFormError(getErrorMessage(error))
      }
    } finally {
      setSaving(false)
    }
  }

  const title = isEditMode ? `Edit Customer ${form.code}` : 'Create Customer'

  if (loadingDetail) {
    return (
      <Modal title={title} onClose={onClose}>
        <LoadingState label="Loading customer…" compact />
      </Modal>
    )
  }
  if (loadError) {
    return (
      <Modal title={title} onClose={onClose}>
        <Alert type="error">{loadError}</Alert>
      </Modal>
    )
  }

  const readOnly = isEditMode && !canEdit

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
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
            <Button onClick={handleSubmit} loading={saving}>
              {isEditMode ? 'Save Changes' : 'Create Customer'}
            </Button>
          )}
        </>
      }
    >
      {readOnly && <Alert type="error">View only. You can see this customer but not change it.</Alert>}
      {formError && <Alert type="error">{formError}</Alert>}
      {conflict && (
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Reload page
        </Button>
      )}
      <form onSubmit={handleSubmit}>
        <Input label="Customer code *" value={form.code} onChange={(e) => updateField('code', e.target.value)} disabled={isEditMode || readOnly} required error={fieldErrors.code} />
        <Input label="Customer name *" value={form.name} onChange={(e) => updateField('name', e.target.value)} disabled={readOnly} required error={fieldErrors.name} />
        <Input label="Contact Person" value={form.contact_person} onChange={(e) => updateField('contact_person', e.target.value)} disabled={readOnly} error={fieldErrors.contact_person} />
        <Input label="Email" type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} disabled={readOnly} error={fieldErrors.email} />
        <Input label="Phone" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} disabled={readOnly} error={fieldErrors.phone} />
        <div className="field">
          <label className="field-label">Billing Address</label>
          <textarea className="field-input" rows={2} value={form.billing_address} onChange={(e) => updateField('billing_address', e.target.value)} disabled={readOnly} />
          {fieldErrors.billing_address && <span className="field-error">{fieldErrors.billing_address}</span>}
        </div>
        <div className="field">
          <label className="field-label">Shipping Address (independent of billing — never auto-copied)</label>
          <textarea className="field-input" rows={2} value={form.shipping_address} onChange={(e) => updateField('shipping_address', e.target.value)} disabled={readOnly} />
          {fieldErrors.shipping_address && <span className="field-error">{fieldErrors.shipping_address}</span>}
        </div>
        <div className="field">
          <label className="field-label">Notes</label>
          <textarea className="field-input" rows={2} value={form.notes} onChange={(e) => updateField('notes', e.target.value)} disabled={readOnly} />
        </div>
      </form>
    </Modal>
  )
}
