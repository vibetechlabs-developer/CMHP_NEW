/**
 * bmrDateUtils.js
 * Standardized date utilities for CMHP Drops BMR.
 * Guarantees DD/MM/YYYY formatting everywhere without timezone shifts.
 */

/**
 * Converts any date value (ISO string, Date object, YYYY-MM-DD, DD-MM-YYYY)
 * into DD/MM/YYYY format with zero-padded day and month.
 * Leaves non-date strings (e.g. '5 YEARS') or empty values untouched.
 */
export function formatDateDDMMYYYY(val) {
  if (val === null || val === undefined) return ''
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if (!trimmed) return ''

    // Non-date string values (like '5 YEARS', 'N/A') should not be altered
    if (/^[A-Za-z\s]+$/.test(trimmed) || trimmed.toUpperCase().includes('YEAR')) {
      return trimmed
    }

    // Already DD/MM/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
      return trimmed
    }

    // YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss...
    const mIso = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
    if (mIso) {
      const year = mIso[1]
      const month = mIso[2].padStart(2, '0')
      const day = mIso[3].padStart(2, '0')
      return `${day}/${month}/${year}`
    }

    // DD-MM-YYYY or DD/MM/YYYY (with 1 or 2 digits)
    const mDm = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
    if (mDm) {
      const day = mDm[1].padStart(2, '0')
      const month = mDm[2].padStart(2, '0')
      const year = mDm[3]
      return `${day}/${month}/${year}`
    }

    return trimmed
  }

  if (val instanceof Date && !isNaN(val.getTime())) {
    const day = String(val.getDate()).padStart(2, '0')
    const month = String(val.getMonth() + 1).padStart(2, '0')
    const year = val.getFullYear()
    return `${day}/${month}/${year}`
  }

  return String(val)
}

/**
 * Converts any date string to YYYY-MM-DD for native <input type="date"> value.
 */
export function toIsoDate(val) {
  if (!val) return ''
  const s = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10)
  }
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
  if (m) {
    const d = m[1].padStart(2, '0')
    const mo = m[2].padStart(2, '0')
    const y = m[3]
    return `${y}-${mo}-${d}`
  }
  return ''
}
