import { useState } from 'react'

import Modal from '../inventory/components/Modal'
import Button from '../../components/Button'
import Alert from '../../components/Alert'
import { commitProductImport, previewProductImport } from './productImportService'
import { getErrorMessage } from '../../utils/errors'

import './ImportProductsModal.css'

export default function ImportProductsModal({ realCompanyId, onClose, onImported }) {
  const [file, setFile] = useState(null)
  const [batch, setBatch] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const check = async () => {
    if (!file || busy) return
    setBusy(true)
    setError('')
    try {
      setBatch(await previewProductImport(realCompanyId, file))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const importNow = async () => {
    if (!batch || busy || !batch.eligible_for_commit) return
    setBusy(true)
    setError('')
    try {
      const committed = await commitProductImport(realCompanyId, batch.id, batch.version)
      setResult(committed)
      onImported?.(committed)
    } catch (err) {
      if (err?.response?.status === 409) {
        setError('This import changed since it was checked. Choose the file again and check it before importing.')
      } else {
        setError(getErrorMessage(err))
      }
    } finally {
      setBusy(false)
    }
  }

  const footer = (
    <>
      <Button variant="secondary" onClick={onClose} disabled={busy}>
        {result ? 'Close' : 'Cancel'}
      </Button>
      {!result && !batch && (
        <Button onClick={check} loading={busy} disabled={!file || busy}>
          Check file
        </Button>
      )}
      {!result && batch && (
        <Button onClick={importNow} loading={busy} disabled={!batch.eligible_for_commit || busy}>
          Import {batch.valid_rows} products
        </Button>
      )}
    </>
  )

  return (
    <Modal title="Import products from CSV" onClose={onClose} size="lg" footer={footer}>
      {error && <Alert type="error">{error}</Alert>}

      {result ? (
        <div className="imp-result">
          <p className="imp-lead">
            {result.created_product_ids?.length || 0} products were added to this company.
          </p>
          <p className="imp-muted">Products appear in the list straight away. Nothing else was changed.</p>
        </div>
      ) : (
        <>
          <div className="imp-step">
            <label className="field-label" htmlFor="imp-file">CSV file</label>
            <input
              id="imp-file"
              className="field-input"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                setFile(event.target.files?.[0] || null)
                setBatch(null)
                setError('')
              }}
            />
            <p className="imp-muted">
              Required columns: <strong>code</strong>, <strong>name</strong>, <strong>sales_uom_code</strong>.
              Optional: <strong>product_type</strong>, <strong>description</strong>. Use UTF-8.
            </p>
          </div>

          {batch && (
            <div className="imp-preview">
              <div className="imp-summary">
                <span><strong>{batch.total_rows}</strong> rows</span>
                <span className="imp-ok"><strong>{batch.valid_rows}</strong> valid</span>
                <span className={batch.invalid_rows ? 'imp-bad' : 'imp-muted'}><strong>{batch.invalid_rows}</strong> with errors</span>
              </div>

              {batch.file_errors?.length > 0 && (
                <Alert type="error">
                  {batch.file_errors.map((item) => (
                    <div key={item.message}>{item.message}</div>
                  ))}
                </Alert>
              )}

              {!batch.eligible_for_commit && batch.file_errors?.length === 0 && (
                <Alert type="error">Fix the rows marked below, then choose the file again. Nothing is imported until every row is valid.</Alert>
              )}

              <div className="imp-table-wrap">
                <table className="imp-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Code</th>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Unit</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(batch.rows || []).map((row) => (
                      <tr key={row.id} className={row.is_valid ? '' : 'is-invalid'}>
                        <td>{row.row_number}</td>
                        <td>{row.code}</td>
                        <td>{row.name}</td>
                        <td>{row.product_type || '—'}</td>
                        <td>{row.sales_uom_code}</td>
                        <td>{row.is_valid ? 'Valid' : (row.errors || []).map((e) => e.message).join(' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
