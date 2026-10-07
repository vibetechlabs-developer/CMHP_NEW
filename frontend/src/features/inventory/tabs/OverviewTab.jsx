import { useEffect, useState } from 'react'
import { inventoryService } from '../inventoryService'
import { getErrorMessage } from '../../../utils/errors'
import Alert from '../../../components/Alert'

const CARDS = [
  { key: 'total_items', label: 'Active materials' },
  { key: 'low_stock_items', label: 'Low / at reorder level' },
  { key: 'lots_pending_qc', label: 'Lots pending QC' },
  { key: 'lots_rejected_or_quarantine', label: 'Rejected / quarantine lots' },
  { key: 'lots_expiring_30_days', label: 'Expiring within 30 days' },
]

export default function OverviewTab() {
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    inventoryService
      .getDashboardSummary()
      .then((res) => setSummary(res.data))
      .catch((err) => setError(getErrorMessage(err)))
  }, [])

  return (
    <div className="inv-panel">
      <Alert type="error">{error}</Alert>
      {!summary && !error && <p className="inv-empty">Loading overview…</p>}
      {summary && (
        <div className="inv-kpis">
          {CARDS.map((card) => (
            <div className="inv-kpi" key={card.key}>
              <div className="inv-kpi-value">{summary[card.key]}</div>
              <div className="inv-kpi-label">{card.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}