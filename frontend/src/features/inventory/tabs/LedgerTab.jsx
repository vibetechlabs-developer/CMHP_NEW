import { useEffect, useState } from 'react'
import { inventoryService } from '../inventoryService'
import { getErrorMessage } from '../../../utils/errors'
import Alert from '../../../components/Alert'

export default function LedgerTab() {
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    inventoryService.getConsumptionLedger()
      .then((res) => setRows(res.data))
      .catch((err) => setError(getErrorMessage(err)))
  }, [])

  return (
    <div className="inv-panel">
      <div className="inv-toolbar">
        <h3>Company-wise material consumption ledger</h3>
      </div>
      <Alert type="error">{error}</Alert>

      <div className="inv-table-scroll">
        <table className="inv-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Opening (receipts)</th>
              {rows[0]?.companies.map((c) => (
                <th key={c.company_id}>{c.company_name} issued / returned</th>
              ))}
              <th>Total consumption</th>
              <th>Adjustments</th>
              <th>Remaining common stock</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.item_id}>
                <td className="cell-strong">{row.item_code} — {row.item_name}</td>
                <td>{row.opening_quantity} {row.uom}</td>
                {row.companies.map((c) => (
                  <td key={c.company_id}>{c.issued} / {c.returned} {row.uom}</td>
                ))}
                <td>{row.total_consumption} {row.uom}</td>
                <td>{row.adjustments} {row.uom}</td>
                <td className="cell-strong">{row.remaining_common_stock} {row.uom}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="inv-empty">No consumption activity yet.</p>}
      </div>
    </div>
  )
}