import { useState } from 'react'

import Alert from '../../components/Alert'
import Button from '../../components/Button'
import Modal from '../inventory/components/Modal'
import { parseCsv } from '../../utils/csv'
import { getErrorMessage } from '../../utils/errors'
import { commitCustomerImport, previewCustomerImport } from './customersService'

const REQUIRED = ['code', 'name']
const TEMPLATE = 'code,name,contact_person,email,phone,city,gst_number,billing_address,shipping_address,notes\nEXAMPLE1,Example Customer,Contact Name,contact@example.test,9000000000,Mumbai,24AAAAA0000A1Z5,,,\n'

// Import customers from a CSV file. Nothing is saved until the file has been
// checked and every row is valid; the import itself is all-or-nothing.
export default function CustomerImportModal({ realCompanyId, onClose, onImported }) {
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState(null)
  const [report, setReport] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const readFile = async (file) => {
    setError('')
    setReport(null)
    setParsed(null)
    setFileName(file ? file.name : '')
    if (!file) return
    const text = await file.text()
    const result = parseCsv(text)
    const missing = REQUIRED.filter((column) => !result.headers.includes(column))
    if (missing.length) {
      setError(`The file needs these columns: ${REQUIRED.join(', ')}. Missing: ${missing.join(', ')}.`)
      return
    }
    if (result.rows.length === 0) {
      setError('The file has no customer rows below the header.')
      return
    }
    setParsed(result.rows)
  }

  const check = async () => {
    setBusy(true)
    setError('')
    try {
      setReport(await previewCustomerImport(realCompanyId, parsed))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const importNow = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await commitCustomerImport(realCompanyId, parsed)
      onImported(result.created)
    } catch (err) {
      setError(getErrorMessage(err))
      // The file may have changed since it was checked. Ask for a fresh check.
      setReport(null)
    } finally {
      setBusy(false)
    }
  }

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'customers-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const eligible = Boolean(report?.summary?.eligible_for_commit)

  return (
    <Modal
      title="Import customers from CSV"
      onClose={busy ? () => {} : onClose}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {!report && (
            <Button onClick={check} loading={busy} disabled={!parsed || busy}>
              Check file
            </Button>
          )}
          {report && (
            <Button onClick={importNow} loading={busy} disabled={!eligible || busy}>
              Import {report.summary.valid} customer{report.summary.valid === 1 ? '' : 's'}
            </Button>
          )}
        </>
      }
    >
      <p className="field-muted" style={{ margin: 0 }}>
        Columns: code and name are required. Also accepted: contact_person, email, phone, billing_address, shipping_address, notes.
        Nothing is saved until every row is valid.
      </p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0' }}>
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="Choose CSV file"
          onChange={(event) => readFile(event.target.files?.[0] || null)}
          disabled={busy}
        />
        <Button variant="secondary" onClick={downloadTemplate} type="button">
          Download template
        </Button>
        {fileName && <span className="field-muted">{fileName}</span>}
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {report && (
        <>
          <p style={{ margin: '8px 0' }}>
            {report.summary.total} row{report.summary.total === 1 ? '' : 's'} checked: {report.summary.valid} valid,{' '}
            {report.summary.invalid} with problems.
          </p>
          {!eligible && (
            <Alert type="error">Fix the rows marked below, choose the file again and check it. Nothing has been imported.</Alert>
          )}
          <div style={{ maxHeight: 280, overflow: 'auto', border: '1px solid #dce7ee', borderRadius: 8 }}>
            <table className="inv-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.row_number}>
                    <td>{row.row_number}</td>
                    <td>{row.code || '—'}</td>
                    <td>{row.name || '—'}</td>
                    <td>{row.status === 'ok' ? 'Ready' : row.errors.join(' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  )
}
