import { useEffect, useState } from 'react'
import { inventoryService } from '../inventoryService'
import { getErrorMessage } from '../../../utils/errors'
import { can } from '../permissions'
import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import Input from '../../../components/Input'
import Modal from '../components/Modal'

const QC_CHIP = {
  APPROVED: 'inv-chip-approved',
  PENDING: 'inv-chip-pending',
  REJECTED: 'inv-chip-rejected',
  QUARANTINE: 'inv-chip-quarantine',
}

const emptyReceipt = {
  item: '',
  location: '',
  lot_number: '',
  supplier_name: '',
  manufacture_date: '',
  expiry_date: '',
  received_quantity: '',
  reference_note: '',
}

const listData = (response) =>
  Array.isArray(response.data) ? response.data : response.data?.results || []

export default function StockTab({ role }) {
  const [lots, setLots] = useState([])
  const [items, setItems] = useState([])
  const [locations, setLocations] = useState([])
  const [error, setError] = useState('')
  const [showReceipt, setShowReceipt] = useState(false)
  const [receiptForm, setReceiptForm] = useState(emptyReceipt)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      const [lotsResponse, itemsResponse, locationsResponse] = await Promise.all([
        inventoryService.getLots(),
        inventoryService.getItems(),
        inventoryService.getLocations(),
      ])

      setLots(listData(lotsResponse))
      setItems(listData(itemsResponse).filter((item) => item.is_active !== false))
      setLocations(
        listData(locationsResponse).filter((location) => location.is_active !== false)
      )
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  useEffect(() => {
    load()
  }, [])

  const closeReceipt = () => {
    if (!saving) {
      setShowReceipt(false)
      setError('')
    }
  }

  const submitReceipt = async (event) => {
    event.preventDefault()

    if (!receiptForm.item || !receiptForm.location) {
      setError('Select an active item and storage location.')
      return
    }

    setSaving(true)
    setError('')

    try {
      const payload = { ...receiptForm }

      if (!payload.manufacture_date) {
        delete payload.manufacture_date
      }

      if (!payload.expiry_date) {
        delete payload.expiry_date
      }

      await inventoryService.createReceipt(payload)

      setShowReceipt(false)
      setReceiptForm(emptyReceipt)
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const runQcAction = async (lotId, toStatus) => {
    const reason = window.prompt(
      `Reason for marking this lot as ${toStatus}?`,
      ''
    )

    if (reason === null) {
      return
    }

    try {
      await inventoryService.qcAction(lotId, {
        to_status: toStatus,
        reason,
      })
      await load()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const canReceipt =
    can(role, 'create') &&
    items.length > 0 &&
    locations.length > 0

  return (
    <div className="inv-panel">
      <div className="inv-toolbar">
        <div>
          <h3>Stock &amp; lots</h3>

          {can(role, 'create') && !canReceipt && (
            <p style={{ marginTop: 4, fontSize: 12, color: '#7d92aa' }}>
              Create at least one active material and storage location before recording a receipt.
            </p>
          )}
        </div>

        {can(role, 'create') && (
          <Button
            disabled={!canReceipt}
            onClick={() => {
              setError('')
              setShowReceipt(true)
            }}
          >
            + Record receipt
          </Button>
        )}
      </div>

      {!showReceipt && error && <Alert type="error">{error}</Alert>}

      <div className="inv-table-scroll">
        <table className="inv-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Lot #</th>
              <th>Location</th>
              <th>QC status</th>
              <th>Expiry</th>
              <th>Available qty</th>
              {can(role, 'approve') && <th>QC action</th>}
            </tr>
          </thead>

          <tbody>
            {lots.map((lot) => (
              <tr key={lot.id}>
                <td className="cell-strong">
                  {lot.item_code} — {lot.item_name}
                </td>
                <td>{lot.lot_number}</td>
                <td>{lot.location_name}</td>
                <td>
                  <span className={`inv-chip ${QC_CHIP[lot.qc_status]}`}>
                    {lot.qc_status}
                  </span>
                </td>
                <td>{lot.expiry_date || '—'}</td>
                <td>{lot.available_quantity} {lot.uom_code}</td>

                {can(role, 'approve') && (
                  <td>
                    {lot.qc_status === 'PENDING' ? (
                      <>
                        <Button
                          variant="secondary"
                          onClick={() => runQcAction(lot.id, 'APPROVED')}
                          style={{ marginRight: 6 }}
                        >
                          Approve
                        </Button>

                        <Button
                          variant="secondary"
                          onClick={() => runQcAction(lot.id, 'REJECTED')}
                        >
                          Reject
                        </Button>
                      </>
                    ) : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {!lots.length && (
          <p className="inv-empty">No stock received yet.</p>
        )}
      </div>

      {showReceipt && (
        <Modal
          title="Record a stock receipt"
          onClose={closeReceipt}
          footer={
            <>
              <Button variant="secondary" disabled={saving} onClick={closeReceipt}>
                Cancel
              </Button>

              <Button loading={saving} onClick={submitReceipt}>
                Save receipt
              </Button>
            </>
          }
        >
          {error && <Alert type="error">{error}</Alert>}

          <form onSubmit={submitReceipt}>
            <div className="inv-form-grid">
              <div className="field">
                <label className="field-label">Item</label>

                <select
                  className="field-input"
                  value={receiptForm.item}
                  onChange={(event) =>
                    setReceiptForm({ ...receiptForm, item: event.target.value })
                  }
                  required
                >
                  <option value="">Select item</option>

                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} — {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="field-label">Location</label>

                <select
                  className="field-input"
                  value={receiptForm.location}
                  onChange={(event) =>
                    setReceiptForm({ ...receiptForm, location: event.target.value })
                  }
                  required
                >
                  <option value="">Select location</option>

                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.code} — {location.name}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                label="Lot / batch number"
                value={receiptForm.lot_number}
                onChange={(event) =>
                  setReceiptForm({ ...receiptForm, lot_number: event.target.value })
                }
                required
              />

              <Input
                label="Received quantity"
                type="number"
                min="0.001"
                step="0.001"
                value={receiptForm.received_quantity}
                onChange={(event) =>
                  setReceiptForm({
                    ...receiptForm,
                    received_quantity: event.target.value,
                  })
                }
                required
              />

              <Input
                label="Supplier"
                value={receiptForm.supplier_name}
                onChange={(event) =>
                  setReceiptForm({ ...receiptForm, supplier_name: event.target.value })
                }
              />

              <Input
                label="Manufacture date"
                type="date"
                value={receiptForm.manufacture_date}
                onChange={(event) =>
                  setReceiptForm({
                    ...receiptForm,
                    manufacture_date: event.target.value,
                  })
                }
              />

              <Input
                label="Expiry date"
                type="date"
                value={receiptForm.expiry_date}
                onChange={(event) =>
                  setReceiptForm({
                    ...receiptForm,
                    expiry_date: event.target.value,
                  })
                }
              />

              <div className="field field-full">
                <label className="field-label">Reference note</label>

                <input
                  className="field-input"
                  value={receiptForm.reference_note}
                  onChange={(event) =>
                    setReceiptForm({
                      ...receiptForm,
                      reference_note: event.target.value,
                    })
                  }
                />
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}