// Real product CSV import (preview -> commit) - adapted from frontend/
// src/features/operations/ImportProductsModal.jsx for this app's own
// Modal/field CSS. Fixes a bug found in that reference: its preview
// response's `rows` field is a PAGINATED object ({count, results}, see
// apps/product_imports/views.py), not a flat array, so the reference's
// `(batch.rows || []).map(...)` would throw at runtime on a real
// response. This reads `batch.rows.results` instead, the same correct
// pattern already used by this app's MaterialImportModal.jsx.
import { useState } from 'react'

import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Modal from '../inventory/components/Modal'
import { getErrorMessage } from '../../utils/errors'
import { commitProductImport, previewProductImport } from './productsService'

export default function ImportProductsModal({ companyId, onClose, onImported }) {
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
      setBatch(await previewProductImport(companyId, file))
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
      const committed = await commitProductImport(companyId, batch.id, batch.version)
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

  const rows = batch?.rows?.results || []

  const footer = (
    <>
      <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
        {result ? 'Close' : 'Cancel'}
      </Button>
      {!result && !batch && (
        <Button type="button" onClick={check} loading={busy} disabled={!file || busy}>Check file</Button>
      )}
      {!result && batch && (
        <Button type="button" onClick={importNow} loading={busy} disabled={!batch.eligible_for_commit || busy}>
          Import {batch.valid_rows} product{batch.valid_rows === 1 ? '' : 's'}
        </Button>
      )}
    </>
  )

  return (
    <Modal title="Import products from CSV" onClose={onClose} maxWidth="760px" footer={footer}>
      {error && <Alert type="error">{error}</Alert>}

      {result ? (
        <div>
          <p style={{ fontSize: 14, margin: '0 0 6px' }}>
            {result.created_product_ids?.length || 0} product{(result.created_product_ids?.length || 0) === 1 ? '' : 's'} were added to this company.
          </p>
          <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Products appear in the list straight away. Nothing else was changed.</p>
        </div>
      ) : (
        <>
          <div className="field" style={{ marginBottom: 12 }}>
            <label className="field-label" htmlFor="imp-file">CSV file</label>
            <input
              id="imp-file"
              className="field-input"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null)
                setBatch(null)
                setError('')
              }}
            />
            <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>
              Required columns: <strong>code</strong>, <strong>name</strong>, <strong>sales_uom_code</strong>.
              Optional: <strong>product_type</strong>, <strong>description</strong>. UTF-8 only.
            </p>
          </div>

          {batch && (
            <div>
              <p style={{ fontSize: 14, margin: '0 0 8px' }}>
                {batch.total_rows} row{batch.total_rows === 1 ? '' : 's'}: <strong>{batch.valid_rows}</strong> valid,{' '}
                <span style={{ color: batch.invalid_rows ? '#b91c1c' : '#64748b' }}><strong>{batch.invalid_rows}</strong> with errors</span>
              </p>

              {batch.file_errors?.length > 0 && (
                <Alert type="error">{batch.file_errors.map((e) => e.message).join(' ')}</Alert>
              )}
              {!batch.eligible_for_commit && batch.file_errors?.length === 0 && (
                <Alert type="error">Fix the rows marked below, then choose the file again. Nothing is imported until every row is valid.</Alert>
              )}

              <div className="inv-table-scroll" style={{ maxHeight: 300 }}>
                <table className="inv-table" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Row</th><th>Code</th><th>Name</th><th>Type</th><th>Unit</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
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
