import { useEffect, useState } from 'react'

import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import { LoadingState } from '../../../components/Spinner'
import { getErrorMessage } from '../../../utils/errors'
import { getConfirmationPolicy, listCompaniesAdmin, updateConfirmationPolicy } from '../organizationSetupService'

const FIELDS = [
  {
    key: 'allow_self_confirmation',
    label: 'Allow self-confirmation',
    help: 'If Yes, the same person who created an order is allowed to confirm it themselves. If No, someone else must confirm it.',
  },
  {
    key: 'allow_zero_price_lines',
    label: 'Allow zero-price lines',
    help: 'If Yes, an order with a line priced at 0 can still be confirmed (for example, a free sample). If No, every line must have a price above zero before the order can be confirmed.',
  },
  {
    key: 'allow_past_requested_delivery_dates',
    label: 'Allow past requested delivery dates',
    help: 'If Yes, an order can be confirmed even if its requested delivery date is already in the past. If No, confirmation is blocked until that date is today or later.',
  },
]

// Unanswered/Yes/No, tri-state: `value` is a real JS boolean or null. Once
// answered the server never accepts a value back to null again (its own
// rule, not this screen's) - so an already-answered field here can only be
// switched between Yes and No, never back to "Unanswered".
function TriStateField({ field, value, touched, onChange }) {
  const current = touched ? touched.value : value
  const selectValue = current === null || current === undefined ? '' : current ? 'yes' : 'no'
  return (
    <div className="field org-policy-field">
      <label className="field-label" htmlFor={`policy-${field.key}`}>{field.label}</label>
      <select
        id={`policy-${field.key}`}
        className="field-input"
        value={selectValue}
        onChange={(e) => {
          const next = e.target.value === '' ? null : e.target.value === 'yes'
          onChange(field.key, next)
        }}
      >
        {current === null || current === undefined ? <option value="">Unanswered</option> : null}
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
      <p className="field-muted">{field.help}</p>
    </div>
  )
}

export default function OrgConfirmationPolicyTab() {
  const [companies, setCompanies] = useState([])
  const [companyId, setCompanyId] = useState('')
  const [companiesError, setCompaniesError] = useState('')

  const [policy, setPolicy] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState({}) // {field: {value}}
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [conflict, setConflict] = useState(false)

  useEffect(() => {
    listCompaniesAdmin({ pageSize: 100 })
      .then((result) => setCompanies(result.results))
      .catch((err) => setCompaniesError(getErrorMessage(err)))
  }, [])

  const load = async () => {
    if (!companyId) return
    setLoading(true)
    setError('')
    setConflict(false)
    setTouched({})
    try {
      const data = await getConfirmationPolicy(companyId)
      setPolicy(data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setPolicy(null)
    setNotice('')
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  const setField = (key, value) => {
    setTouched((prev) => ({ ...prev, [key]: { value } }))
    setNotice('')
  }

  const dirty = Object.keys(touched).length > 0

  const save = async () => {
    if (saving || !dirty) return
    setSaving(true)
    setError('')
    setConflict(false)
    const changed = Object.fromEntries(Object.entries(touched).map(([key, { value }]) => [key, value]))
    try {
      const updated = await updateConfirmationPolicy(companyId, policy.version, changed)
      setPolicy(updated)
      setTouched({})
      setNotice(
        'Policy saved. This applies to every new order review immediately. Any order review already open in another window must be reviewed again before confirming.'
      )
    } catch (err) {
      if (err?.response?.status === 409) {
        setConflict(true)
        setError('This policy changed since it was last loaded here, so nothing was saved. Reload the latest version before trying again.')
      } else {
        setError(getErrorMessage(err))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="org-tab">
      <div className="org-tab-head">
        <div>
          <h3>Sales order confirmation policy</h3>
          <p className="field-muted">
            Decides which company-specific rules apply when a sales order is confirmed. Configuring this does not, by
            itself, let anyone confirm orders - that still requires the separate "confirm sales orders" permission.
          </p>
        </div>
      </div>

      {companiesError && <Alert type="error">{companiesError}</Alert>}

      <div className="field">
        <label className="field-label" htmlFor="org-policy-company">Company</label>
        <select id="org-policy-company" className="field-input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
          <option value="">Select a company…</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.code} · {c.display_name || c.legal_name}</option>
          ))}
        </select>
      </div>

      {companyId && (
        loading ? (
          <LoadingState label="Loading policy…" compact />
        ) : error && !policy ? (
          <Alert type="error">{error} <button type="button" className="table-edit" onClick={load}>Retry</button></Alert>
        ) : policy ? (
          <>
            <p className="field-muted">
              Status: <strong>{policy.status === 'CONFIGURED' ? 'Configured' : policy.status === 'INCOMPLETE' ? 'Incomplete - some questions unanswered' : 'Not configured'}</strong>
              {' '}(version {policy.version}).
              {policy.updated_at && <> Last changed {new Date(policy.updated_at).toLocaleString()}.</>}
            </p>

            {notice && <Alert type="success">{notice}</Alert>}
            {error && (
              <Alert type="error">
                {error}
                {conflict && <> <button type="button" className="table-edit" onClick={load}>Reload latest</button></>}
              </Alert>
            )}

            {FIELDS.map((field) => (
              <TriStateField key={field.key} field={field} value={policy[field.key]} touched={touched[field.key]} onChange={setField} />
            ))}

            <div className="org-permission-actions">
              <Button onClick={save} disabled={!dirty || saving} loading={saving}>Save changes</Button>
              {dirty && <span className="field-muted">Unsaved answers. Only the fields you changed will be sent.</span>}
            </div>
          </>
        ) : null
      )}
    </div>
  )
}
