import { useRef, useState } from 'react'

import Button from '../../components/Button'
import { getErrorMessage } from '../../utils/errors'
import { getBatchPlanRequirementPreview } from '../operations/batchPlansService'
import { getRequirementPreview } from './formulasService'

// The server sends some quantities as objects ({ value, is_exact, ... }) and
// others as plain strings. Show the string value either way.
const decimalText = (quantity) => (quantity && typeof quantity === 'object' ? quantity.value : quantity ?? '')

// Shows the backend's requirement calculation. No arithmetic happens here:
// every quantity, scale factor and warning is the server's answer, shown as
// returned (decimal strings and exactness flags are preserved).
//
// Two sources:
// - `planId` set: the SAVED batch plan's preview.
// - otherwise: a DRAFT preview of the selected revision at the typed target.
export default function RequirementCalculator({ companyId, formulaId, revisionId, planId = null, initialTarget = '', unitCode = '' }) {
  const [target, setTarget] = useState(initialTarget)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const requestRef = useRef(0)

  const source = planId ? 'saved' : 'draft'

  const calculate = async () => {
    const trimmed = String(target).trim()
    if (!trimmed) {
      setError('Enter a target batch output quantity.')
      return
    }
    const requestId = ++requestRef.current
    setLoading(true)
    setError('')
    try {
      const data = planId
        ? await getBatchPlanRequirementPreview(companyId, planId, trimmed)
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

  // Changing the target makes any shown result stale. In-flight answers for
  // the old target are ignored.
  const changeTarget = (value) => {
    requestRef.current += 1
    setTarget(value)
    setLoading(false)
    setResult((previous) => previous && { ...previous, stale: true })
  }

  // The output unit comes from the revision (shown before any calculation) or the result.
  const outputCode = result?.revision?.output_unit?.code || unitCode || ''
  const rows = result?.lines || []
  const raw = rows.filter((row) => row.material_type === 'RAW_MATERIAL')
  const packaging = rows.filter((row) => row.material_type === 'PACKAGING_MATERIAL')
  const warnings = result?.warnings || []
  const issues = result?.calculation_issues || []

  const warningFor = (row) =>
    warnings.filter((w) => w.line_id === row.id || w.line_number === row.line_number).map((w) => w.message)

  return (
    <section className="rc-panel" aria-label="Material requirements">
      <div className="rc-head">
        <span className="field-label">Material requirements</span>
        <span className="rc-source">{source === 'saved' ? 'Saved batch plan' : 'Draft preview (not saved)'}</span>
      </div>

      <div className="rc-target">
        <label className="field-label" htmlFor="rc-target">
          Target batch output{outputCode ? ` (${outputCode})` : ''}
        </label>
        <div className="rc-target-row">
          <input
            id="rc-target"
            className="field-input"
            inputMode="decimal"
            value={target}
            onChange={(event) => changeTarget(event.target.value)}
            placeholder="e.g. 50"
          />
          {outputCode && <span className="rc-unit">{outputCode}</span>}
          <Button variant="secondary" onClick={calculate} loading={loading} disabled={loading}>
            Calculate
          </Button>
        </div>
      </div>

      {error && <p className="field-error">{error}</p>}
      {loading && <p className="field-muted">Calculating…</p>}
      {result?.stale && <p className="field-muted">The target changed. Calculate again to update these figures.</p>}

      {result && !result.stale && (
        <>
          <dl className="rc-summary">
            <div>
              <dt>Base output</dt>
              <dd>
                {decimalText(result.revision?.base_output_quantity)} {outputCode}
              </dd>
            </div>
            <div>
              <dt>Target output</dt>
              <dd>
                {decimalText(result.target_output_quantity)} {outputCode}
              </dd>
            </div>
            <div>
              <dt>Scale factor</dt>
              <dd>
                <Quantity value={decimalText(result.scale_factor)} />
              </dd>
            </div>
          </dl>

          {issues.length > 0 && (
            <div className="rc-notice rc-blocker">
              {issues.map((issue) => (
                <p key={issue.message}>{issue.message}</p>
              ))}
            </div>
          )}

          {warnings
            .filter((w) => !w.line_id && !w.line_number)
            .map((w) => (
              <div key={w.message} className="rc-notice">
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
    <div className="rc-table-block">
      <h4>{title}</h4>
      {rows.length === 0 ? (
        <p className="field-muted">No {title.toLowerCase()} in this revision.</p>
      ) : (
        <table className="rc-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Unit</th>
              <th>Base quantity</th>
              <th>Calculated requirement</th>
              <th>Warning</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const messages = warningFor(row)
              return (
                <tr key={row.id}>
                  <td>
                    {row.material_code} · {row.material_name}
                  </td>
                  <td>{row.unit_code}</td>
                  <td>{row.base_line_quantity || '—'}</td>
                  <td>
                    {row.required_quantity?.value ? (
                      <>
                        <Quantity value={row.required_quantity.value} />
                        {row.required_quantity.is_approximate && <span className="rc-approx"> (approximate)</span>}
                      </>
                    ) : (
                      <span className="field-muted">Not calculated</span>
                    )}
                  </td>
                  <td>{messages.length ? messages.join(' ') : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

// A long repeating decimal is shown compactly with the full API string one click
// away. The text is never rounded here: the full value is always the server's string.
function Quantity({ value }) {
  const [full, setFull] = useState(false)
  if (value.length <= 14) return <span>{value}</span>
  return (
    <span className="rc-qty">
      <span title={value}>{full ? value : `${value.slice(0, 12)}…`}</span>
      <button type="button" className="rc-view-full" aria-expanded={full} onClick={() => setFull((v) => !v)}>
        {full ? 'Show less' : 'View full value'}
      </button>
    </span>
  )
}
