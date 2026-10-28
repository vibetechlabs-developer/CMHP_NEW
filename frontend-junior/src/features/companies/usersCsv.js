// CSV handling for the user import. Parsing and validation run in the
// browser; each valid row is then created through the normal user endpoints.
export const USER_CSV_COLUMNS = [
  'username',
  'email',
  'first_name',
  'last_name',
  'initial_password',
  'employee_id',
  'department',
  'designation',
  'joining_date',
  'employment_status',
  'company_code',
  'role_code',
]

export const USER_CSV_TEMPLATE = `${USER_CSV_COLUMNS.join(',')}
jdoe,jdoe@example.com,John,Doe,TempPass123,EMP-001,Store,Store Manager,2026-01-15,probation,CMHP,STORE_MANAGER
`

const EMPLOYMENT_STATUSES = ['active', 'probation', 'notice', 'resigned', 'terminated']
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// Minimal RFC 4180 parser: quoted fields, doubled quotes, commas and newlines
// inside quotes. Blank lines are skipped.
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      if (row.some((cell) => cell.trim() !== '')) rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  row.push(field)
  if (row.some((cell) => cell.trim() !== '')) rows.push(row)
  return rows
}

// Returns { rows, fileErrors }. Each row: { lineNumber, data, errors }.
export function buildUserImportRows(text) {
  const parsed = parseCsv(text.replace(/^﻿/, ''))
  if (parsed.length === 0) return { rows: [], fileErrors: ['The file is empty.'] }

  const header = parsed[0].map((h) => h.trim().toLowerCase())
  const missing = ['username', 'email', 'first_name', 'initial_password'].filter((c) => !header.includes(c))
  if (missing.length) {
    return { rows: [], fileErrors: [`Missing required column(s): ${missing.join(', ')}.`] }
  }
  const unknown = header.filter((c) => c && !USER_CSV_COLUMNS.includes(c))
  const fileErrors = unknown.length ? [`Unknown column(s) ignored: ${unknown.join(', ')}.`] : []

  const seenUsernames = new Set()
  const seenEmails = new Set()
  const rows = parsed.slice(1).map((cells, index) => {
    const data = {}
    USER_CSV_COLUMNS.forEach((column) => {
      const at = header.indexOf(column)
      data[column] = at >= 0 ? (cells[at] || '').trim() : ''
    })
    const errors = []
    if (!data.username) errors.push('Username is required.')
    if (!data.email) errors.push('Email is required.')
    if (!data.first_name) errors.push('First name is required.')
    if (data.initial_password.length < 8) errors.push('Temporary password must be at least 8 characters.')
    if (data.joining_date && !DATE_PATTERN.test(data.joining_date)) errors.push('Joining date must be YYYY-MM-DD.')
    if (data.employment_status && !EMPLOYMENT_STATUSES.includes(data.employment_status)) {
      errors.push(`Employment status must be one of ${EMPLOYMENT_STATUSES.join(', ')}.`)
    }
    if (data.role_code && !data.company_code) errors.push('A role needs a company_code.')

    const userKey = data.username.toLowerCase()
    if (userKey && seenUsernames.has(userKey)) errors.push('Duplicate username in this file.')
    seenUsernames.add(userKey)
    const emailKey = data.email.toLowerCase()
    if (emailKey && seenEmails.has(emailKey)) errors.push('Duplicate email in this file.')
    seenEmails.add(emailKey)

    return { lineNumber: index + 2, data, errors }
  })
  return { rows, fileErrors }
}
