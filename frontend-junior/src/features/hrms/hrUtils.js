/*
 * HRMS SHARED HELPERS
 * -------------------------------------------------------------------------
 * Small pure helpers used by Payroll.jsx and HrReports.jsx.
 */

export function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export function currentMonth() {
  return todayStr().slice(0, 7)
}

/* 'YYYY-MM' -> { from, to, days } */
export function monthRange(month) {
  const [year, mon] = month.split('-').map(Number)
  const days = new Date(year, mon, 0).getDate()

  return {
    from: `${month}-01`,
    to: `${month}-${String(days).padStart(2, '0')}`,
    days,
  }
}

/* 'YYYY-MM' -> ['YYYY-MM-01', 'YYYY-MM-02', ...] */
export function monthDates(month) {
  const { days } = monthRange(month)

  return Array.from(
    { length: days },
    (_, index) =>
      `${month}-${String(index + 1).padStart(2, '0')}`
  )
}

export function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

export function formatMoney(value) {
  const amount = Number(value) || 0

  return `\u20B9${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatDate(value) {
  if (!value) {
    return '\u2014'
  }

  return new Date(`${value}T00:00:00`).toLocaleDateString(
    'en-IN',
    { day: '2-digit', month: 'short', year: 'numeric' }
  )
}

export function formatTime(iso) {
  if (!iso) {
    return '\u2014'
  }

  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function csvCell(value) {
  if (value === null || value === undefined) {
    return ''
  }

  const text = String(value)

  return /[",\r\n]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text
}

/*
 * columns: [{ key, label, csv?: (row) => value }]
 * rows:    array of plain objects
 */
export function downloadCsv(filename, columns, rows) {
  const header = columns
    .map((column) => csvCell(column.label))
    .join(',')

  const lines = rows.map((row) =>
    columns
      .map((column) =>
        csvCell(
          column.csv ? column.csv(row) : row[column.key]
        )
      )
      .join(',')
  )

  const blob = new Blob(
    ['\uFEFF' + [header, ...lines].join('\r\n')],
    { type: 'text/csv;charset=utf-8;' }
  )

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}