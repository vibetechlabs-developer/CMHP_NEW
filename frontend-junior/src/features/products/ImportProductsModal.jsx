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
      let fileToSend = file
      try {
        const text = await file.text()
        const lines = text.split(/\r?\n/)
        if (lines.length > 0) {
          const header = lines[0]
          const cols = header.split(',').map((c) => c.trim().toLowerCase().replace(/^["']|["']$/g, ''))
          const hasUom = cols.some((c) => ['sales_uom_code', 'uom', 'unit', 'uom_code'].includes(c))
          const typeIdx = cols.findIndex((c) => c === 'type' || c === 'product_type')

          if (!hasUom) {
            const newHeader = header + ',sales_uom_code'
            const updatedLines = [newHeader]
            for (let i = 1; i < lines.length; i++) {
              const row = lines[i]
              if (!row.trim()) continue
              const rowCells = row.split(',').map((c) => c.trim().toLowerCase().replace(/^["']|["']$/g, ''))
              const rowType = typeIdx >= 0 ? (rowCells[typeIdx] || '') : ''
              let uom = 'BOX'
              if (rowType.includes('tablet') || rowType.includes('tab')) uom = 'TAB'
              else if (rowType.includes('syrup') || rowType.includes('drop') || rowType.includes('liquid') || rowType.includes('suspension') || rowType.includes('solution') || rowType.includes('oil')) uom = 'BTL'
              else if (rowType.includes('capsule')) uom = 'CAP'
              else if (rowType.includes('powder') || rowType.includes('cream') || rowType.includes('gel')) uom = 'GM'
              updatedLines.push(`${row},${uom}`)
            }
            fileToSend = new File([updatedLines.join('\n')], file.name, { type: 'text/csv' })
          }
        }
      } catch {
        fileToSend = file
      }

      setBatch(await previewProductImport(companyId, fileToSend))
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
              Required columns: <strong>code</strong>, <strong>name</strong>.
              Optional: <strong>type</strong> (or product_type), <strong>pack_size</strong>, <strong>bmr_no</strong>, <strong>sales_uom_code</strong>, <strong>description</strong>. UTF-8 only.
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
