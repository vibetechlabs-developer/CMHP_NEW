import { useState } from 'react'

import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import Modal from '../../inventory/components/Modal'
import { getErrorMessage } from '../../../utils/errors'
import {
  assignUserMembership,
  assignUserRole,
  createUser,
  listCompanies,
  listCompanyRoles,
} from '../usersApiService'
import { USER_CSV_TEMPLATE, buildUserImportRows } from '../usersCsv'

function serverErrorText(error) {
  const data = error?.response?.data
  if (data && typeof data === 'object') {
    return Object.entries(data)
      .map(([field, value]) => `${field === 'detail' ? '' : `${field}: `}${Array.isArray(value) ? value.join(' ') : value}`)
      .join(' ')
  }
  return getErrorMessage(error)
}

// Rows are created one at a time through the normal user endpoints. There is
// no all-or-nothing transaction: a row that fails is reported and the rest
// still run. Company and role on each row are optional, but must be given
// together.
export default function UserImportModal({ onClose, onImported }) {
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState(null)
  const [readError, setReadError] = useState('')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [results, setResults] = useState(null)

  const eligibleRows = parsed ? parsed.rows.filter((row) => row.errors.length === 0) : []

  const handleFile = (event) => {
    const file = event.target.files?.[0]
    setResults(null)
    setReadError('')
    setParsed(null)
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => setParsed(buildUserImportRows(String(reader.result || '')))
    reader.onerror = () => setReadError('The file could not be read.')
    reader.readAsText(file)
  }

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([USER_CSV_TEMPLATE], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'users-import-template.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const runImport = async () => {
    if (importing || eligibleRows.length === 0) return
    setImporting(true)
    setResults(null)
    setProgress({ done: 0, total: eligibleRows.length })

    const outcomes = []
    let companyByCode = null
    const rolesByCompany = {}

    const resolveCompany = async (code) => {
      if (!companyByCode) {
        const companies = await listCompanies()
        companyByCode = Object.fromEntries(companies.map((c) => [c.code.toLowerCase(), c]))
      }
      const company = companyByCode[code.toLowerCase()]
      if (!company) throw new Error(`Company code "${code}" was not found or is inactive.`)
      return company
    }

    const resolveRole = async (company, code) => {
      if (!rolesByCompany[company.id]) {
        const roles = await listCompanyRoles(company.id)
        rolesByCompany[company.id] = Object.fromEntries(roles.map((r) => [r.code.toLowerCase(), r]))
      }
      const role = rolesByCompany[company.id][code.toLowerCase()]
      if (!role) throw new Error(`Role "${code}" was not found in company ${company.code}.`)
      return role
    }

    for (const row of eligibleRows) {
      const d = row.data
      try {
        const user = await createUser({
          username: d.username,
          email: d.email,
          first_name: d.first_name,
          last_name: d.last_name,
          initial_password: d.initial_password,
          employee_id: d.employee_id,
          department: d.department,
          designation: d.designation,
          joining_date: d.joining_date || null,
          employment_status: d.employment_status || 'active',
        })
        let access = ''
        if (d.company_code) {
          const company = await resolveCompany(d.company_code)
          const membership = await assignUserMembership(user.id, company.id)
          access = ` Assigned to ${company.code}.`
          if (d.role_code) {
            const role = await resolveRole(company, d.role_code)
            await assignUserRole(user.id, membership.id, role.id)
            access = ` Assigned to ${company.code} as ${role.code}.`
          }
        }
        outcomes.push({ lineNumber: row.lineNumber, username: d.username, ok: true, message: `Created.${access}` })
      } catch (error) {
        const text = error.message && !error.response ? error.message : serverErrorText(error)
        outcomes.push({ lineNumber: row.lineNumber, username: d.username, ok: false, message: text })
      }
      setProgress({ done: outcomes.length, total: eligibleRows.length })
    }

    setResults(outcomes)
    setImporting(false)
    if (outcomes.some((o) => o.ok)) onImported()
  }

  const footer = (
    <>
      <Button variant="secondary" onClick={onClose} disabled={importing}>
        {results ? 'Close' : 'Cancel'}
      </Button>
      {parsed && !results && (
        <Button onClick={runImport} loading={importing} disabled={importing || eligibleRows.length === 0}>
          Import {eligibleRows.length} user{eligibleRows.length === 1 ? '' : 's'}
        </Button>
      )}
    </>
  )

  return (
    <Modal title="Import users from CSV" onClose={onClose} size="lg" footer={footer}>
      <div className="uf-form">
        <section className="uf-group">
          <p className="uf-help">
            One row per user. Required: username, email, first_name, initial_password (at least 8 characters). Optional:
            last_name, employee_id, department, designation, joining_date (YYYY-MM-DD), employment_status (active,
            probation, notice, resigned, terminated), company_code and role_code (both must be given together).
          </p>
          <div>
            <Button variant="secondary" onClick={downloadTemplate} disabled={importing}>
              Download template
            </Button>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="user-import-file">CSV file</label>
            <input id="user-import-file" className="field-input" type="file" accept=".csv,text/csv" onChange={handleFile} disabled={importing} />
            {fileName && <span className="uf-help">{fileName}</span>}
          </div>
        </section>

        {readError && <Alert type="error">{readError}</Alert>}

        {parsed && (
          <section className="uf-group">
            {parsed.fileErrors.map((message) => (
              <Alert key={message} type="error">{message}</Alert>
            ))}
            <p className="uf-help">
              {parsed.rows.length} row(s): {eligibleRows.length} ready, {parsed.rows.length - eligibleRows.length} with errors.
              Rows with errors are skipped.
            </p>
            {importing && <p className="uf-help">Creating {progress.done} of {progress.total}…</p>}
            <div className="company-table-wrap">
              <table className="company-table">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Username</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Company / role</th>
                    <th>Check</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.map((row) => (
                    <tr key={row.lineNumber}>
                      <td>{row.lineNumber}</td>
                      <td>{row.data.username || '—'}</td>
                      <td>{[row.data.first_name, row.data.last_name].filter(Boolean).join(' ') || '—'}</td>
                      <td>{row.data.email || '—'}</td>
                      <td>{row.data.company_code ? `${row.data.company_code}${row.data.role_code ? ` / ${row.data.role_code}` : ''}` : '—'}</td>
                      <td>{row.errors.length ? row.errors.join(' ') : 'OK'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {results && (
          <section className="uf-group">
            <Alert type={results.every((o) => o.ok) ? 'success' : 'error'}>
              {results.filter((o) => o.ok).length} created, {results.filter((o) => !o.ok).length} failed. Each row was saved on its own; a failed row did not stop the others.
            </Alert>
            <div className="company-table-wrap">
              <table className="company-table">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Username</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((o) => (
                    <tr key={o.lineNumber}>
                      <td>{o.lineNumber}</td>
                      <td>{o.username}</td>
                      <td>{o.ok ? o.message : `Failed: ${o.message}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </Modal>
  )
}
