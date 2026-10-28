// Shows the backend's requirement calculation. No arithmetic happens
// here: every quantity, scale factor and warning is the server's answer,
// shown as returned (decimal strings and exactness flags are preserved).
// Ported from frontend/src/features/formulas/RequirementCalculator.jsx.
//
// Two sources:
// - `planId` set: the SAVED batch plan's preview.
// - otherwise: a DRAFT preview of the selected revision at the typed target.
import { useEffect, useRef, useState } from 'react'

import Button from '../../components/Button'
import { getErrorMessage } from '../../utils/errors'
import { getBatchPlanRequirementPreview } from '../manufacturing/batchPlansService'
import { getRequirementPreview } from './formulasService'

const decimalText = (quantity) => (quantity && typeof quantity === 'object' ? quantity.value : quantity ?? '')

export default function RequirementCalculator({ companyId, formulaId, revisionId, planId = null, initialTarget = '', unitCode = '' }) {
  const [target, setTarget] = useState(initialTarget)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const requestRef = useRef(0)

  const source = planId ? 'saved' : 'draft'

  const calculate = async () => {
    const trimmed = String(target).trim()
    if (!planId && !trimmed) {
      setError('Enter a target batch output quantity.')
      return
    }
    const requestId = ++requestRef.current
    setLoading(true)
    setError('')
    try {
      const data = planId
        ? await getBatchPlanRequirementPreview(companyId, planId)
        : await getRequirementPreview(companyId, formulaId, revisionId, trimmed)
      if (requestRef.current === requestId) setResult(data)
    } catch (err) {
      if (requestRef.current === requestId) {
        setResult(null)
        setError(getErrorMessage(err))
      }
    } finally {
      if (requestRef.current === requestId) setLoading(false)
    }
  }

  useEffect(() => {
    if (initialTarget && initialTarget !== target) {
      setTarget(initialTarget)
    }
  }, [initialTarget])

  useEffect(() => {
    if (planId && companyId) {
      calculate()
    }
  }, [planId, companyId])

  const changeTarget = (value) => {
    requestRef.current += 1
    setTarget(value)
    setLoading(false)
    setResult((previous) => previous && { ...previous, stale: true })
  }

  const outputCode = result?.revision?.output_unit?.code || unitCode || ''
  const rows = result?.lines || []
  const raw = rows.filter((row) => row.material_type === 'RAW_MATERIAL')
  const packaging = rows.filter((row) => row.material_type === 'PACKAGING_MATERIAL')
  const warnings = result?.warnings || []
  const issues = result?.calculation_issues || []

  const warningFor = (row) =>
    warnings.filter((w) => w.line_id === row.id || w.line_number === row.line_number).map((w) => w.message)

  return (
    <section aria-label="Material requirements" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span className="field-label">Material requirements</span>
        <span style={{ fontSize: 12, color: '#64748b' }}>{source === 'saved' ? 'Saved batch plan' : 'Draft preview (not saved)'}</span>
      </div>

      {!planId && (
        <div className="field" style={{ marginBottom: 10 }}>
          <label className="field-label" htmlFor="rc-target">
            Target batch output{outputCode ? ` (${outputCode})` : ''}
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input id="rc-target" className="field-input" inputMode="decimal" value={target} onChange={(e) => changeTarget(e.target.value)} placeholder="e.g. 50" />
            {outputCode && <span style={{ fontSize: 13, color: '#64748b' }}>{outputCode}</span>}
            <Button type="button" variant="secondary" onClick={calculate} loading={loading} disabled={loading}>Calculate</Button>
          </div>
        </div>
      )}
      {planId && (
        <div style={{ marginBottom: 10 }}>
          <Button type="button" variant="secondary" onClick={calculate} loading={loading} disabled={loading}>Calculate requirements</Button>
        </div>
      )}

      {error && <p className="field-error">{error}</p>}
      {result?.stale && <p style={{ fontSize: 12, color: '#64748b' }}>The target changed. Calculate again to update these figures.</p>}

      {result && !result.stale && (
        <>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', margin: '10px 0' }}>
            <div>
              <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Base output</div>
              <strong>{decimalText(result.revision?.base_output_quantity)} {outputCode}</strong>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Target output</div>
              <strong>{decimalText(result.target_output_quantity)} {outputCode}</strong>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Scale factor</div>
              <Quantity value={decimalText(result.scale_factor)} />
            </div>
          </div>

          {issues.length > 0 && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: '#fef2f2', color: '#b91c1c', fontSize: 13, marginBottom: 8 }}>
              {issues.map((issue) => <p key={issue.message} style={{ margin: '2px 0' }}>{issue.message}</p>)}
            </div>
          )}
          {warnings.filter((w) => !w.line_id && !w.line_number).map((w) => (
            <div key={w.message} style={{ padding: '8px 12px', borderRadius: 8, background: '#eaf5fc', color: '#163b59', fontSize: 13, marginBottom: 8 }}>
              {w.message}
            </div>
          ))}

          <RequirementTable title="Raw materials" rows={raw} warningFor={warningFor} />
          <RequirementTable title="Packaging materials" rows={packaging} warningFor={warningFor} />
        </>
      )}
    </section>
  )
}

function RequirementTable({ title, rows, warningFor }) {
  return (
    <div style={{ marginTop: 10 }}>
      <h4 style={{ fontSize: 13, margin: '0 0 6px' }}>{title}</h4>
      {rows.length === 0 ? (
        <p style={{ fontSize: 12, color: '#64748b' }}>No {title.toLowerCase()} in this revision.</p>
      ) : (
        <div className="inv-table-scroll">
          <table className="inv-table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>Material</th><th>Unit</th><th>Requisite</th><th>Base quantity</th><th>Calculated requirement</th><th>Warning</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const messages = warningFor(row)
                const isLabelClaim = row.calculation_mode === 'AS_PER_LABEL_CLAIM'
                return (
                  <tr key={row.id}>
                    <td>{row.material_code} · {row.material_name}</td>
                    <td>{row.unit_code}</td>
                    <td>{isLabelClaim ? `As per label claim (${row.label_claim_quantity} ${row.label_claim_uom_code})` : 'As per formula'}</td>
                    <td>{isLabelClaim ? '—' : row.base_line_quantity || '—'}</td>
                    <td>
                      {row.required_quantity?.value ? (
                        <>
                          <Quantity value={row.required_quantity.value} />
                          {row.required_quantity.is_approximate && <span style={{ color: '#94a3b8' }}> (approximate)</span>}
                        </>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>Not calculated</span>
                      )}
                    </td>
                    <td>{messages.length ? messages.join(' ') : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Quantity({ value }) {
  const [full, setFull] = useState(false)
  if (value.length <= 14) return <span>{value}</span>
  return (
    <span>
      <span title={value}>{full ? value : `${value.slice(0, 12)}…`}</span>
      <button type="button" className="table-edit" style={{ marginLeft: 6 }} aria-expanded={full} onClick={() => setFull((v) => !v)}>
        {full ? 'Show less' : 'View full value'}
      </button>
    </span>
  )
}
