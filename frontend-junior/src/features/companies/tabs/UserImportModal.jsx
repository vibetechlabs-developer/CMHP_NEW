import { useState } from 'react'

import Alert from '../../../components/Alert'
import Button from '../../../components/Button'
import FileInputButton from '../../../components/FileInputButton'
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
// defaultCompanyId: if the row has no company_code, the user is still
// assigned to this company so they appear in the company's member list.
export default function UserImportModal({ onClose, onImported, defaultCompanyId = null }) {
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

  const downloadTemplate = async () => {
    try {
      const companies = await listCompanies()
      let sampleCompany = 'CMHP'
      let sampleRole = ''
      if (companies && companies.length > 0) {
        const defaultComp = defaultCompanyId
          ? companies.find((c) => c.id === defaultCompanyId) || companies[0]
          : companies[0]
        sampleCompany = defaultComp.code
        const roles = await listCompanyRoles(defaultComp.id)
        if (roles && roles.length > 0) {
          sampleRole = roles[0].code
        }
      }
      const header = USER_CSV_COLUMNS.join(',')
      const sample = `jdoe,jdoe@example.com,John,Doe,TempPass123,EMP-001,QA,Executive,Morning,2026-01-15,active,${sampleCompany},${sampleRole}`
      const content = `${header}\n${sample}\n`
      const url = URL.createObjectURL(new Blob([content], { type: 'text/csv' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'users-import-template.csv'
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      const url = URL.createObjectURL(new Blob([USER_CSV_TEMPLATE], { type: 'text/csv' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'users-import-template.csv'
      link.click()
      URL.revokeObjectURL(url)
    }
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
      const clean = String(code || '').trim()
      if (!clean || ['-', 'na', 'n/a', 'none'].includes(clean.toLowerCase())) {
        return null
      }
      if (!rolesByCompany[company.id]) {
        const roles = await listCompanyRoles(company.id)
        rolesByCompany[company.id] = roles || []
      }
      const rolesList = rolesByCompany[company.id]
      // 1. Direct code match (case-insensitive)
      let role = rolesList.find((r) => (r.code || '').toLowerCase() === clean.toLowerCase())
      // 2. Direct name match (case-insensitive)
      if (!role) {
        role = rolesList.find((r) => (r.name || '').toLowerCase() === clean.toLowerCase())
      }
      // 3. Normalized match (ignoring underscores/spaces/hyphens)
      if (!role) {
        const norm = clean.toLowerCase().replace(/[^a-z0-9]/g, '')
        role = rolesList.find(
          (r) =>
            (r.code || '').toLowerCase().replace(/[^a-z0-9]/g, '') === norm ||
            (r.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === norm
        )
      }
      if (!role) {
        const validRoles = rolesList.map((r) => `${r.code} (${r.name})`).join(', ')
        throw new Error(
          `Role "${code}" was not found in company ${company.code}. Valid roles are: ${validRoles || 'None'}`
        )
      }
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
          shift: d.shift || '',
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
            if (role) {
              await assignUserRole(user.id, membership.id, role.id)
              access = ` Assigned to ${company.code} as ${role.name || role.code}.`
            }
          }
        } else if (defaultCompanyId) {
          // Auto-assign to the current workspace company so the user appears
          // in this company's member list even without a company_code column.
          await assignUserMembership(user.id, defaultCompanyId)
          access = ' Assigned to current company.'
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
    const successCount = outcomes.filter((o) => o.ok).length
    const failCount = outcomes.filter((o) => !o.ok).length
    if (successCount > 0) onImported()
    if (failCount === 0 && successCount > 0) {
      setTimeout(() => {
        onClose()
      }, 600)
    }
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
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={downloadTemplate} disabled={importing}>
              📥 Download template
            </Button>
          </div>
          <div className="field" style={{ marginTop: 8 }}>
            <label className="field-label" htmlFor="user-import-file">CSV file</label>
            <FileInputButton
              id="user-import-file"
              accept=".csv,text/csv"
              onChange={handleFile}
              disabled={importing}
              fileName={fileName}
              label="📂 Choose CSV File"
            />
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
