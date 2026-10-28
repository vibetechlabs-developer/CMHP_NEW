// Real BMR panel for one batch plan. Ported verbatim from frontend/src/
// features/bmr/BmrPanel.jsx. Required quantities are the backend's exact
// answers and are shown read only. Label Claim, AR No, the special value
// and qty received are free-text entries kept per line, with their
// version. `canView`/`canCreate`/`canEdit` must come from the real
// bmr.view/bmr.create/bmr.edit permission codes (a standalone module,
// distinct from batch_plans.*/formulas.* - holding batch_plans.view does
// NOT grant bmr.view) - see this component's caller for where those are
// checked; this component renders nothing at all when !canView.
import { useEffect, useState } from 'react'

import Alert from '../../components/Alert'
import Button from '../../components/Button'
import { LoadingState } from '../../components/Spinner'
import { getErrorMessage } from '../../utils/errors'
import { createBmrForPlan, getBmrForPlan, updateBmrLine } from './bmrService'
import './BmrPanel.css'

const SIGNOFFS = [
  ['Prepared by', 'Production Chemist'],
  ['Reviewed by', 'Production In-Charge'],
  ['Approved by', 'QA Manager'],
  ['Checked by', 'Warehouse'],
]

export default function BmrPanel({ companyId, planId, plan = null, canView = true, canCreate = false, canEdit = false }) {
  const [bmr, setBmr] = useState(null)
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!canView || typeof planId !== 'number') return
    let cancelled = false
    setState('loading')
    getBmrForPlan(companyId, planId)
      .then((data) => {
        if (cancelled) return
        setBmr(data)
        setState(data ? 'ready' : 'none')
      })
      .catch((err) => {
        if (cancelled) return
        setError(getErrorMessage(err))
        setState('error')
      })
    return () => { cancelled = true }
  }, [companyId, planId, canView])

  if (!canView) return null

  const create = async () => {
    setBusy(true)
    setError('')
    try {
      setBmr(await createBmrForPlan(companyId, planId))
      setState('ready')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const saveLine = async (line, patch) => {
    setError('')
    try {
      const saved = await updateBmrLine(companyId, bmr.id, line.id, { expected_version: line.version, ...patch })
      setBmr((prev) => ({ ...prev, lines: prev.lines.map((l) => (l.id === saved.id ? saved : l)) }))
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <section className="bmr-panel" aria-label="Batch manufacturing record">
      <div className="bmr-head">
        <h4 className="bmr-title">Batch manufacturing record</h4>
        <div className="bmr-head-actions">
          {state === 'none' && canCreate && (
            <Button type="button" onClick={create} loading={busy} disabled={busy}>Create record</Button>
          )}
          <Button type="button" variant="secondary" onClick={() => window.print()} disabled={state !== 'ready'}>Print</Button>
        </div>
      </div>

      {state === 'loading' && <LoadingState label="Loading record…" compact />}
      {state === 'none' && (
        <p className="bmr-muted">
          {canCreate
            ? 'No batch manufacturing record has been created for this batch yet.'
            : 'No batch manufacturing record has been created for this batch yet. Ask a user with BMR create access to create it.'}
        </p>
      )}
      {state === 'error' && <Alert type="error">{error}</Alert>}
      {error && state === 'ready' && <Alert type="error">{error}</Alert>}

      {state === 'ready' && bmr && (
        <div className="bmr-print" id="bmr-print">
          {plan && (
            <div className="bmr-doc-header" style={{
              border: '1.5px solid #0f172a',
              borderRadius: 6,
              padding: '12px 16px',
              marginBottom: 16,
              background: '#f8fafc',
            }}>
              <div style={{ textAlign: 'center', borderBottom: '1px solid #cbd5e1', paddingBottom: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '0.5px', color: '#0f172a' }}>
                  CMHP PRIVATE LIMITED
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', marginTop: 2 }}>
                  PRODUCTION (ORAL LIQUID DEPARTMENT) · BATCH MANUFACTURING RECORD (BMR)
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: '#64748b', marginTop: 2 }}>
                  ATTACHMENT - 1 · RAW MATERIAL REQUISITION SLIP
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '6px 16px', fontSize: 12.5 }}>
                <div><strong>PRODUCT:</strong> {plan.product_name || plan.source_snapshots?.product_name || '—'}</div>
                <div><strong>PRODUCT CODE:</strong> {plan.product_code || plan.source_snapshots?.product_code || '—'}</div>
                <div><strong>BATCH NO.:</strong> <span style={{ fontWeight: 700, color: '#0284c7' }}>{plan.official_batch_number || 'Not numbered'}</span></div>
                <div><strong>TARGET OUTPUT:</strong> {plan.target_output_quantity} {plan.output_uom_code || plan.source_snapshots?.output_uom_code || ''}</div>
                <div><strong>MASTER FORMULA:</strong> {plan.formula_code || plan.source_snapshots?.formula_code || '—'} (Rev {plan.formula_revision_number ?? plan.source_snapshots?.formula_revision_number ?? '1'})</div>
                <div><strong>MFG DATE:</strong> {plan.planned_manufacturing_date || '—'}</div>
              </div>
            </div>
          )}
          <SlipTable title="Raw material requisition slip" slip="RAW" lines={bmr.lines} canEdit={canEdit} onSave={saveLine} />
          <SlipTable title="Packing material requirement slip" slip="PACKING" lines={bmr.lines} canEdit={canEdit} onSave={saveLine} />
          <SignoffBlock />
        </div>
      )}
    </section>
  )
}

function SlipTable({ title, slip, lines, canEdit, onSave }) {
  const rows = lines.filter((line) => line.slip === slip)
  const isRaw = slip === 'RAW'
  return (
    <div className="bmr-slip">
      <h5 className="bmr-slip-title">{title}</h5>
      {rows.length === 0 ? (
        <p className="bmr-muted">No lines in this slip.</p>
      ) : (
        <div className="bmr-table-wrap">
          <table className="bmr-table">
            <thead>
              <tr>
                <th className="num">Sr. No.</th>
                <th>{isRaw ? 'RM code' : 'Material code'}</th>
                <th>{isRaw ? 'Raw material name' : 'Material'}</th>
                {isRaw && <th>Special value</th>}
                {isRaw && <th>Label claim</th>}
                <th className="num">Qty required</th>
                {!isRaw && <th className="num">Qty received</th>}
                <th>Unit</th>
                <th>AR No.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((line) => (
                <tr key={line.id}>
                  <td className="num">{line.line_number}</td>
                  <td>{line.material_code}</td>
                  <td className="bmr-name" title={line.material_name}>{line.material_name}</td>
                  {isRaw && (
                    <td>
                      <TextCell value={line.special_value} label="Special value" disabled={!canEdit} onSave={(v) => onSave(line, { special_value: v })} />
                    </td>
                  )}
                  {isRaw && (
                    <td>
                      <TextCell value={line.label_claim} label="Label claim" disabled={!canEdit} onSave={(v) => onSave(line, { label_claim: v })} />
                    </td>
                  )}
                  <td className="num">{line.display_required}</td>
                  {!isRaw && (
                    <td className="num">
                      <TextCell value={line.qty_received} label="Qty received" disabled={!canEdit} align="right" onSave={(v) => onSave(line, { qty_received: v })} />
                    </td>
                  )}
                  <td>{line.unit_code}</td>
                  <td>
                    <TextCell value={line.ar_no} label="AR No." disabled={!canEdit} onSave={(v) => onSave(line, { ar_no: v })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TextCell({ value, label, disabled, align, onSave }) {
  const [draft, setDraft] = useState(value || '')
  useEffect(() => setDraft(value || ''), [value])
  if (disabled) return <span>{value || '—'}</span>
  return (
    <input
      className="field-input bmr-input"
      aria-label={label}
      value={draft}
      style={align === 'right' ? { textAlign: 'right' } : undefined}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== (value || '')) onSave(draft)
      }}
    />
  )
}

function SignoffBlock() {
  return (
    <div className="bmr-signoff">
      {SIGNOFFS.map(([role, title]) => (
        <div key={role} className="bmr-signoff-cell">
          <span className="bmr-signoff-role">{role}</span>
          <span className="bmr-signoff-title">{title}</span>
          <span className="bmr-signoff-line">Name</span>
          <span className="bmr-signoff-line">Signature</span>
          <span className="bmr-signoff-line">Date</span>
        </div>
      ))}
    </div>
  )
}
