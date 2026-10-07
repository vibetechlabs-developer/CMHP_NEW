import { useEffect, useState } from 'react'
import { inventoryService } from '../inventoryService'
import { getErrorMessage } from '../../../utils/errors'
import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import Input from '../../../components/Input'

const emptyForm = { lot: '', company: '', quantity: '', reference_note: '' }

export default function IssueReturnTab() {
  const [mode, setMode] = useState('issue')
  const [lots, setLots] = useState([])
  const [companies, setCompanies] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)
  const [recent, setRecent] = useState([])

  const loadRecent = () => {
    inventoryService.getTransactions().then((res) => setRecent(res.data.slice(0, 15))).catch(() => {})
  }

  useEffect(() => {
    inventoryService.getLots({ qc_status: 'APPROVED' }).then((res) => setLots(res.data)).catch(() => {})
    inventoryService.getCompanies().then((res) => setCompanies(res.data)).catch(() => {})
    loadRecent()
  }, [])

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const action = mode === 'issue' ? inventoryService.issueStock : inventoryService.returnStock
      await action(form)
      setSuccess(mode === 'issue' ? 'Material issued to company (demo data only, not saved to the server).' : 'Material returned to common stock (demo data only, not saved to the server).')
      setForm(emptyForm)
      loadRecent()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="inv-panel">
      <div className="inv-toolbar">
        <h3>Company-wise material issue &amp; return</h3>
        <div className="inv-tabs" style={{ borderBottom: 'none' }}>
          <button type="button" className={mode === 'issue' ? 'inv-tab active' : 'inv-tab'} onClick={() => setMode('issue')}>Issue</button>
          <button type="button" className={mode === 'return' ? 'inv-tab active' : 'inv-tab'} onClick={() => setMode('return')}>Return</button>
        </div>
      </div>

      <Alert type="error">{error}</Alert>
      <Alert type="success">{success}</Alert>

      <form onSubmit={submit}>
        <div className="inv-form-grid">
          <div className="field">
            <label className="field-label">Lot (approved stock only)</label>
            <select className="field-input" value={form.lot} onChange={(e) => setForm({ ...form, lot: e.target.value })} required>
              <option value="">Select lot</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.item_code}/{l.lot_number} — {l.available_quantity} {l.uom_code} available
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Company</label>
            <select className="field-input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} required>
              <option value="">Select company</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <Input label="Quantity" type="number" step="0.001" value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
          <div className="field field-full">
            <label className="field-label">Reference note</label>
            <input className="field-input" value={form.reference_note}
              onChange={(e) => setForm({ ...form, reference_note: e.target.value })} />
          </div>
        </div>
        <Button type="submit" variant="primary" loading={saving}>
          {mode === 'issue' ? 'Issue to company' : 'Return to common stock'}
        </Button>
      </form>

      <h3 style={{ marginTop: 28 }}>Recent transactions</h3>
      <div className="inv-table-scroll">
        <table className="inv-table">
          <thead>
            <tr><th>Type</th><th>Item</th><th>Lot</th><th>Qty</th><th>Company</th><th>By</th><th>When</th></tr>
          </thead>
          <tbody>
            {recent.map((t) => (
              <tr key={t.id}>
                <td>{t.transaction_type}</td>
                <td>{t.item_code}</td>
                <td>{t.lot_number}</td>
                <td>{t.quantity}</td>
                <td>{t.company_name || '—'}</td>
                <td>{t.created_by_name || '—'}</td>
                <td>{new Date(t.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {recent.length === 0 && <p className="inv-empty">No transactions yet.</p>}
      </div>
    </div>
  )
}