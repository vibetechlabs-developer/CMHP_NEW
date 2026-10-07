import { useRef, useState } from 'react'

import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Modal from '../inventory/components/Modal'
import { getErrorMessage } from '../../utils/errors'
import { commitMaterialImport, getMaterialImportPreview, previewMaterialImport } from './storeService'

// Columns the server's material import accepts (apps.material_imports.services).
const TEMPLATE = 'code,name,material_type,base_unit_code,description\nSYNTH-RAW-001,Example raw material,RAW,KG,Example description\n'
const PAGE_SIZE = 50

export default function MaterialImportModal({ onClose, onImported }) {
  const [file, setFile] = useState(null)
  const [batch, setBatch] = useState(null)
  const [rows, setRows] = useState({ count: 0, results: [] })
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const committingRef = useRef(false)

  const upload = async () => {
    if (!file || busy) return
    setBusy(true)
    setError('')
    try {
      const created = await previewMaterialImport(file)
      setBatch(created)
      setRows(created.rows || { count: 0, results: [] })
      setPage(1)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const changePage = async (nextPage) => {
    if (!batch) return
    setBusy(true)
    try {
      const data = await getMaterialImportPreview(batch.id, { page: nextPage, pageSize: PAGE_SIZE })
      setRows(data.rows || { count: 0, results: [] })
      setPage(nextPage)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const commit = async () => {
    // One commit per click; a double click or a retry while in flight is ignored.
    if (committingRef.current || !batch) return
    committingRef.current = true
    setBusy(true)
    setError('')
    try {
      const result = await commitMaterialImport(batch.id, batch.version)
      onImported((result.created_material_ids || []).length)
    } catch (err) {
      // A stale or expired preview is refused by the server: ask for a fresh upload.
      setError(`${getErrorMessage(err)} The file was not imported. Choose the file again to check it.`)
      setBatch(null)
      setRows({ count: 0, results: [] })
    } finally {
      committingRef.current = false
      setBusy(false)
    }
  }

  const eligible = Boolean(batch?.eligible_for_commit) && batch?.status !== 'COMMITTED'
  const totalPages = Math.max(1, Math.ceil(rows.count / PAGE_SIZE))

  return (
    <Modal
      title="Import materials from CSV"
      onClose={busy ? () => {} : onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {!batch && (
            <Button onClick={upload} loading={busy} disabled={!file || busy}>
              Check file
            </Button>
          )}
          {batch && (
            <Button onClick={commit} loading={busy} disabled={!eligible || busy}>
              Import {batch.valid_rows} material{batch.valid_rows === 1 ? '' : 's'}
            </Button>
          )}
        </>
      }
    >
      <p style={{ margin: '0 0 10px', fontSize: 14 }}>
        <strong>This imports material definitions only. It does not add stock.</strong>
      </p>
      <p className="field-muted" style={{ margin: '0 0 12px' }}>
        Columns: code, name, material_type (RAW or PACKAGING), base_unit_code (an existing active unit), and optional description.
        Units are not created by the import.
      </p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <Button
          variant="secondary"
          type="button"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }))
            const a = document.createElement('a')
            a.href = url
            a.download = 'materials-template.csv'
            a.click()
            URL.revokeObjectURL(url)
          }}
        >
          Download template
        </Button>
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="Choose material CSV file"
          disabled={busy}
          onChange={(event) => {
            setFile(event.target.files?.[0] || null)
            setBatch(null)
            setError('')
          }}
        />
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {batch && (
        <>
          <p style={{ margin: '6px 0', fontSize: 14 }}>
            {batch.total_rows} row{batch.total_rows === 1 ? '' : 's'} checked: {batch.valid_rows} valid, {batch.invalid_rows} with problems.
          </p>
          {batch.file_errors?.length > 0 && (
            <Alert type="error">{batch.file_errors.map((e) => e.message || e.code).join(' ')}</Alert>
          )}
          {!batch.eligible_for_commit && (
            <Alert type="error">Fix the rows marked below, choose the file again and check it. Nothing has been imported.</Alert>
          )}
          <div className="inv-table-scroll" style={{ maxHeight: 300 }}>
            <table className="inv-table" style={{ fontSize: 14 }}>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Unit</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.results.map((row) => (
                  <tr key={row.id ?? row.row_number}>
                    <td>{row.row_number}</td>
                    <td>{row.code || '—'}</td>
                    <td>{row.name || '—'}</td>
                    <td>{row.material_type || '—'}</td>
                    <td>{row.base_unit_code || '—'}</td>
                    <td>{row.is_valid ? 'Ready' : (row.errors || []).map((e) => e.message).join(' ') || 'Problem'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.count > PAGE_SIZE && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', marginTop: 8 }}>
              <Button variant="secondary" disabled={page <= 1 || busy} onClick={() => changePage(page - 1)}>
                Previous
              </Button>
              <span className="field-muted">
                Page {page} of {totalPages}
              </span>
              <Button variant="secondary" disabled={page >= totalPages || busy} onClick={() => changePage(page + 1)}>
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
