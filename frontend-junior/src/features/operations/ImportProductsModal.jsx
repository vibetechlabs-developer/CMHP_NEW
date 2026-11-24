import { useState } from 'react'

import Modal from '../inventory/components/Modal'
import Button from '../../components/Button'
import Alert from '../../components/Alert'
import FileInputButton from '../../components/FileInputButton'
import { commitProductImport, previewProductImport } from './productImportService'
import { getErrorMessage } from '../../utils/errors'

import './ImportProductsModal.css'

const PRODUCT_CSV_TEMPLATE = `code,name,product_type,pack_size,bmr_no,sales_uom_code,description
PRD-001,Flexicare,Tablet,10x10 Tablets,BMR/GER/006,TAB,Anti-inflammatory tablet formulation
PRD-002,CURE RENOL,Drops,30ml,BMR/HM/25/05,BTL,Oral drops liquid formulation
PRD-003,Amoxicillin 500,Capsule,10x10 Capsules,BMR/CAP/012,CAP,Antibiotic capsules
`

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
      setTimeout(() => {
        onClose?.()
      }, 600)
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

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([PRODUCT_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'products-template.csv'
    a.click()
    URL.revokeObjectURL(url)
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
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <FileInputButton
                id="imp-file"
                accept=".csv,text/csv"
                fileName={file ? file.name : ''}
                label="📂 Choose CSV File"
                onChange={(event) => {
                  setFile(event.target.files?.[0] || null)
                  setBatch(null)
                  setError('')
                }}
              />
              <Button variant="secondary" onClick={downloadTemplate} type="button">
                📥 Download sample template
              </Button>
            </div>
            <p className="imp-muted" style={{ marginTop: 8 }}>
              Required columns: <strong>code</strong>, <strong>name</strong>, <strong>sales_uom_code</strong>.
              Optional: <strong>product_type</strong>, <strong>pack_size</strong>, <strong>bmr_no</strong>, <strong>description</strong>. Use UTF-8.
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
                    {(batch.rows?.results || batch.rows || []).map((row) => (
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
