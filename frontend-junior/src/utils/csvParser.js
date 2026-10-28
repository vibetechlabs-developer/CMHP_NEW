/**
 * CMHP Pharmaceutical ERP - Client-Side CSV Parser & Validator
 */

/**
 * Parses raw CSV text into array of objects using the header row.
 * Handles quoted cells with embedded commas or newlines.
 */
export function parseCsvText(text) {
  if (!text || typeof text !== 'string') return []

  const lines = []
  let currentRow = []
  let currentCell = ''
  let insideQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const nextChar = text[i + 1]

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"'
        i++ // Skip escaped quote
      } else {
        insideQuotes = !insideQuotes
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentCell.trim())
      currentCell = ''
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++ // Skip CRLF
      }
      currentRow.push(currentCell.trim())
      currentCell = ''
      if (currentRow.some((c) => c.length > 0)) {
        lines.push(currentRow)
      }
      currentRow = []
    } else {
      currentCell += char
    }
  }

  // Push final cell/row if any
  currentRow.push(currentCell.trim())
  if (currentRow.some((c) => c.length > 0)) {
    lines.push(currentRow)
  }

  if (lines.length < 2) return []

  // Clean headers (lowercase, replace spaces with underscores)
  const rawHeaders = lines[0]
  const headers = rawHeaders.map((h) =>
    h.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '')
  )

  const rows = []
  for (let r = 1; r < lines.length; r++) {
    const values = lines[r]
    const obj = { _rowNumber: r + 1 }
    headers.forEach((header, index) => {
      obj[header] = values[index] !== undefined ? values[index].trim() : ''
    })
    rows.push(obj)
  }

  return rows
}

/**
 * Validates parsed Product rows.
 */
export function validateProductRows(rows, existingCodes = []) {
  const existingSet = new Set(existingCodes.map((c) => String(c).trim().toLowerCase()))
  const seenInCsv = new Set()
  const validRecords = []
  const invalidRecords = []

  rows.forEach((row) => {
    const errors = []
    const code = String(row.code || '').trim()
    const name = String(row.name || '').trim()
    const category = String(row.category || 'Tablets').trim()
    const uom = String(row.uom || 'Pack').trim()
    const reorderLevel = Number(row.reorder_level || 0)
    const unitCost = Number(row.unit_cost || 0)
    const currentStock = Number(row.current_stock || 0)
    const description = String(row.description || '').trim()

    if (!code) {
      errors.push('Product Code is required.')
    } else {
      const codeLower = code.toLowerCase()
      if (existingSet.has(codeLower)) {
        errors.push(`Code "${code}" already exists in the system.`)
      } else if (seenInCsv.has(codeLower)) {
        errors.push(`Duplicate code "${code}" within this CSV file.`)
      } else {
        seenInCsv.add(codeLower)
      }
    }

    if (!name) {
      errors.push('Product Name is required.')
    }

    if (row.reorder_level !== undefined && row.reorder_level !== '' && (Number.isNaN(reorderLevel) || reorderLevel < 0)) {
      errors.push('Reorder level must be a positive number.')
    }

    if (row.unit_cost !== undefined && row.unit_cost !== '' && (Number.isNaN(unitCost) || unitCost < 0)) {
      errors.push('Unit cost must be a positive number.')
    }

    if (row.current_stock !== undefined && row.current_stock !== '' && (Number.isNaN(currentStock) || currentStock < 0)) {
      errors.push('Current stock must be a non-negative number.')
    }

    const record = {
      _rowNumber: row._rowNumber,
      code,
      name,
      category,
      uom,
      reorder_level: Number.isNaN(reorderLevel) ? 0 : reorderLevel,
      unit_cost: Number.isNaN(unitCost) ? 0 : unitCost,
      current_stock: Number.isNaN(currentStock) ? 0 : currentStock,
      description,
      status: errors.length === 0 ? 'VALID' : 'INVALID',
      errors,
    }

    if (errors.length === 0) {
      validRecords.push(record)
    } else {
      invalidRecords.push(record)
    }
  })

  return { validRecords, invalidRecords, totalRows: rows.length }
}

/**
 * Validates parsed Raw Material rows.
 */
export function validateMaterialRows(rows, existingCodes = []) {
  const existingSet = new Set(existingCodes.map((c) => String(c).trim().toLowerCase()))
  const seenInCsv = new Set()
  const validRecords = []
  const invalidRecords = []

  rows.forEach((row) => {
    const errors = []
    const code = String(row.code || '').trim()
    const name = String(row.name || '').trim()
    const category = String(row.category || 'Raw Material').trim()
    const uom = String(row.uom || 'KG').trim()
    const currentStock = Number(row.current_stock || 0)
    const reorderLevel = Number(row.reorder_level || 0)
    const unitCost = Number(row.unit_cost || 0)
    const supplier = String(row.supplier || '').trim()
    const expiryDate = String(row.expiry_date || '').trim()

    if (!code) {
      errors.push('Material Code is required.')
    } else {
      const codeLower = code.toLowerCase()
      if (existingSet.has(codeLower)) {
        errors.push(`Code "${code}" already exists in the system.`)
      } else if (seenInCsv.has(codeLower)) {
        errors.push(`Duplicate code "${code}" within this CSV file.`)
      } else {
        seenInCsv.add(codeLower)
      }
    }

    if (!name) {
      errors.push('Material Name is required.')
    }

    if (row.current_stock !== undefined && row.current_stock !== '' && (Number.isNaN(currentStock) || currentStock < 0)) {
      errors.push('Current stock must be a non-negative number.')
    }

    if (row.reorder_level !== undefined && row.reorder_level !== '' && (Number.isNaN(reorderLevel) || reorderLevel < 0)) {
      errors.push('Reorder level must be a non-negative number.')
    }

    if (row.unit_cost !== undefined && row.unit_cost !== '' && (Number.isNaN(unitCost) || unitCost < 0)) {
      errors.push('Unit cost must be a non-negative number.')
    }

    if (expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
      errors.push('Expiry date must be in YYYY-MM-DD format.')
    }

    const record = {
      _rowNumber: row._rowNumber,
      code,
      name,
      category,
      uom,
      current_stock: Number.isNaN(currentStock) ? 0 : currentStock,
      reorder_level: Number.isNaN(reorderLevel) ? 0 : reorderLevel,
      unit_cost: Number.isNaN(unitCost) ? 0 : unitCost,
      supplier,
      expiry_date: expiryDate || null,
      status: errors.length === 0 ? 'VALID' : 'INVALID',
      errors,
    }

    if (errors.length === 0) {
      validRecords.push(record)
    } else {
      invalidRecords.push(record)
    }
  })

  return { validRecords, invalidRecords, totalRows: rows.length }
}

/**
 * Downloads a sample CSV template for products or materials.
 */
export function downloadSampleCsv(type = 'products') {
  let content = ''
  let filename = ''

  if (type === 'products') {
    content = [
      'code,name,category,uom,reorder_level,unit_cost,description',
      'PRD-1001,Paracetamol 500mg,Tablets,Pack,500,24.50,Standard 500mg blister pack',
      'PRD-1002,Amoxicillin 250mg,Capsules,Bottle,200,65.00,Broad-spectrum antibiotic bottle of 60',
    ].join('\r\n')
    filename = 'common_products_template.csv'
  } else {
    content = [
      'code,name,category,uom,current_stock,reorder_level,unit_cost,supplier,expiry_date',
      'MAT-2001,Paracetamol API Pure,Raw Material,KG,1500,300,120.00,Solchem Industries,2027-12-31',
      'MAT-2002,Microcrystalline Cellulose,Excipient,KG,800,200,45.50,Apex Chemical Co,2026-08-15',
    ].join('\r\n')
    filename = 'common_raw_materials_template.csv'
  }

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
