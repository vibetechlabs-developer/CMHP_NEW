// Minimal CSV reader for the customer import: handles quoted fields, doubled
// quotes, CRLF/LF, a UTF-8 BOM and blank lines. Returns header-keyed objects.
export function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '')
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') {
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
      if (ch === '\r' && src[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  const nonBlank = rows.filter((r) => r.some((cell) => cell.trim() !== ''))
  if (nonBlank.length === 0) return { headers: [], rows: [] }
  const headers = nonBlank[0].map((h) => h.trim().toLowerCase())
  const objects = nonBlank.slice(1).map((cells) =>
    headers.reduce((acc, header, index) => {
      acc[header] = (cells[index] ?? '').trim()
      return acc
    }, {})
  )
  return { headers, rows: objects }
}
