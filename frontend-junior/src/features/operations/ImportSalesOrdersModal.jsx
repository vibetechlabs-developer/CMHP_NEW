import React, { useState, useRef } from 'react'
import Modal from '../inventory/components/Modal'
import Button from '../../components/Button'
import Alert from '../../components/Alert'
import { createSalesOrder } from './salesOrdersService'
import { searchCustomers, searchProducts } from './catalogLookupService'
import { getErrorMessage } from '../../utils/errors'

export default function ImportSalesOrdersModal({ realCompanyId, onClose, onImported }) {
  const [file, setFile] = useState(null)
  const [parsedRows, setParsedRows] = useState([])
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
  const fileInputRef = useRef(null)

  // Download sample CSV template
  const downloadSampleTemplate = () => {
    const headers = [
      'order_number',
      'customer_name',
      'product_name',
      'product_code',
      'product_type',
      'quantity',
      'sales_uom',
      'unit_price',
      'order_date',
      'planned_mfg_date',
      'batch_no',
      'status',
    ]

    const sampleRows = [
      [
        'ORD-2026-039',
        'Fortis Healthcare Network',
        'Azithromycin 500mg',
        'PRD-0001',
        'Tablet',
        '200',
        'BOX',
        '95.00',
        '2026-09-15',
        '2026-10-05',
        'BAT-2026-0001',
        'PACKAGING',
      ],
      [
        'ORD-2026-044',
        'MedPlus Healthcare',
        'Amoxicillin 250mg',
        'PRD-0002',
        'Capsule',
        '500',
        'BOX',
        '65.00',
        '2026-09-28',
        '2026-10-12',
        'QA-2026-0001',
        'Ready to Invoice',
      ],
      [
        'ORD-2026-045',
        'Apollo Pharmacy Ltd',
        'CURE RENOL',
        'HML/05',
        'Drops',
        '3024',
        'BOX',
        '110.00',
        '2026-10-21',
        '2026-10-21',
        'BAT-2026-0002',
        'PACKED',
      ],
    ]

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...sampleRows.map((r) => r.join(','))].join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', 'sales_orders_template.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Parse CSV text into array of objects
  const handleFileChange = async (e) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setParsing(true)
    setError('')
    setSuccessMsg('')

    try {
      const text = await selectedFile.text()
      const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)

      if (lines.length < 2) {
        throw new Error('CSV must contain a header row and at least one data row.')
      }

      const headerCells = lines[0]
        .split(',')
        .map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, ''))

      const rows = []
      for (let i = 1; i < lines.length; i++) {
        const rawLine = lines[i]
        // Basic CSV regex split supporting quoted commas
        const cells = []
        let current = ''
        let inQuotes = false

        for (let c = 0; c < rawLine.length; c++) {
          const char = rawLine[c]
          if (char === '"' || char === "'") {
            inQuotes = !inQuotes
          } else if (char === ',' && !inQuotes) {
            cells.push(current.trim().replace(/^["']|["']$/g, ''))
            current = ''
          } else {
            current += char
          }
        }
        cells.push(current.trim().replace(/^["']|["']$/g, ''))

        if (cells.every((c) => !c)) continue // skip empty row

        const rowObj = {}
        headerCells.forEach((header, idx) => {
          rowObj[header] = cells[idx] || ''
        })

        // Standardize common aliases
        const orderNumber =
          rowObj['order_number'] ||
          rowObj['order_no'] ||
          rowObj['order #'] ||
          rowObj['order#'] ||
          rowObj['orderno'] ||
          `ORD-${new Date().getFullYear()}-${String(i).padStart(3, '0')}`

        const customerName =
          rowObj['customer_name'] ||
          rowObj['customer'] ||
          rowObj['client'] ||
          'Valued Customer'

        const productName =
          rowObj['product_name'] ||
          rowObj['product'] ||
          rowObj['item_name'] ||
          'Pharmaceutical Product'

        const productCode =
          rowObj['product_code'] ||
          rowObj['code'] ||
          rowObj['item_code'] ||
          ''

        const productType =
          rowObj['product_type'] ||
          rowObj['type'] ||
          'Tablet'

        const quantity = parseFloat(rowObj['quantity'] || rowObj['qty'] || '100') || 100
        const salesUom = rowObj['sales_uom'] || rowObj['uom'] || rowObj['unit'] || 'BOX'
        const unitPrice = parseFloat(rowObj['unit_price'] || rowObj['price'] || '0') || 0
        const orderDate =
          rowObj['order_date'] ||
          rowObj['date'] ||
          new Date().toISOString().split('T')[0]
        const plannedMfgDate =
          rowObj['planned_mfg_date'] ||
          rowObj['mfg_date'] ||
          orderDate
        const batchNo =
          rowObj['batch_no'] ||
          rowObj['batch'] ||
          `BAT-${new Date().getFullYear()}-${String(i).padStart(4, '0')}`
        const status =
          rowObj['status'] ||
          rowObj['order_status'] ||
          'DRAFT'

        rows.push({
          rawId: i,
          orderNumber,
          customerName,
          productName,
          productCode,
          productType,
          quantity,
          salesUom,
          unitPrice,
          orderDate,
          plannedMfgDate,
          batchNo,
          status,
          totalAmount: quantity * unitPrice,
        })
      }

      setParsedRows(rows)
    } catch (err) {
      setError(getErrorMessage(err))
      setParsedRows([])
    } finally {
      setParsing(false)
    }
  }

  // Import confirmed parsed rows into system
  const handleImport = async () => {
    if (!parsedRows.length || importing) return
    setImporting(true)
    setError('')
    setSuccessMsg('')
    setImportProgress({ current: 0, total: parsedRows.length })

    let successCount = 0
    let failedCount = 0

    try {
      // 1. Fetch available customers & products for mapping
      let customers = []
      let products = []
      if (realCompanyId) {
        try {
          customers = await searchCustomers(realCompanyId, '')
          products = await searchProducts(realCompanyId, '')
        } catch {
          // fallback
        }
      }

      for (let i = 0; i < parsedRows.length; i++) {
        const row = parsedRows[i]
        setImportProgress({ current: i + 1, total: parsedRows.length })

        try {
          // Find matching customer or use first available
          let matchedCust = customers.find(
            (c) =>
              c.label?.toLowerCase() === row.customerName.toLowerCase() ||
              c.code?.toLowerCase() === row.customerName.toLowerCase()
          )
          const customerId = matchedCust?.id || customers[0]?.id || 1

          // Find matching product
          let matchedProd = products.find(
            (p) =>
              p.label?.toLowerCase() === row.productName.toLowerCase() ||
              (row.productCode && p.code?.toLowerCase() === row.productCode.toLowerCase())
          )
          const productId = matchedProd?.id || products[0]?.id || 1

          if (realCompanyId) {
            await createSalesOrder(realCompanyId, {
              customer_id: customerId,
              order_date: row.orderDate,
              planned_manufacturing_date: row.plannedMfgDate || row.orderDate,
              customer_order_reference: row.orderNumber,
              currency: 'INR',
              notes: `Batch: ${row.batchNo} | Type: ${row.productType}`,
              lines: [
                {
                  product_id: productId,
                  quantity: row.quantity,
                  unit_price: row.unitPrice,
                  description: `${row.productName} (${row.productType || 'Standard'})`,
                  product_type_snapshot: row.productType,
                },
              ],
            })
          }
          successCount++
        } catch (err) {
          console.warn('Failed to import row:', row, err)
          failedCount++
        }
      }

      if (successCount > 0) {
        setSuccessMsg(
          `🎉 Successfully imported ${successCount} sales order${successCount > 1 ? 's' : ''}!${
            failedCount > 0 ? ` (${failedCount} skipped due to validation)` : ''
          }`
        )
        setTimeout(() => {
          onImported?.()
          onClose()
        }, 1200)
      } else {
        setError(`Failed to import orders. Please check your data format.`)
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal title="Import Sales Orders (CSV)" onClose={onClose} width={840}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Template helper info banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: 8,
            padding: '12px 16px',
            fontSize: 13,
            color: '#0369a1',
          }}
        >
          <div>
            <strong>Upload standard sales order CSV.</strong>
            <div style={{ fontSize: 12, color: '#0284c7', marginTop: 2 }}>
              Supported columns: Order #, Customer, Product, Product Type, Quantity, UOM, Price, Dates, Batch No.
            </div>
          </div>
          <button
            type="button"
            onClick={downloadSampleTemplate}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#ffffff',
              border: '1px solid #0284c7',
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 700,
              color: '#0284c7',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            📄 Sample CSV Template
          </button>
        </div>

        {/* File drop zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: '2px dashed #cbd5e1',
            borderRadius: 10,
            padding: '24px 16px',
            textAlign: 'center',
            cursor: 'pointer',
            background: file ? '#f8fafc' : '#ffffff',
            transition: 'all 0.15s ease',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
          {file ? (
            <div>
              <strong style={{ fontSize: 14, color: '#0f172a' }}>{file.name}</strong>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                {(file.size / 1024).toFixed(1)} KB · Click to choose a different file
              </div>
            </div>
          ) : (
            <div>
              <strong style={{ fontSize: 14, color: '#0f172a' }}>Click to select CSV file</strong>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                or drag & drop your sales orders spreadsheet here
              </div>
            </div>
          )}
        </div>

        {error && <Alert type="error">{error}</Alert>}
        {successMsg && <Alert type="success">{successMsg}</Alert>}

        {/* Preview table of parsed rows */}
        {parsedRows.length > 0 && (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                Preview: {parsedRows.length} order{parsedRows.length === 1 ? '' : 's'} ready to import
              </span>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                Total Batch Quantity: {parsedRows.reduce((sum, r) => sum + r.quantity, 0).toLocaleString()}
              </span>
            </div>

            <div
              style={{
                maxHeight: 240,
                overflowY: 'auto',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px', color: '#475569' }}>Order #</th>
                    <th style={{ padding: '8px 10px', color: '#475569' }}>Customer</th>
                    <th style={{ padding: '8px 10px', color: '#475569' }}>Product</th>
                    <th style={{ padding: '8px 10px', color: '#475569' }}>Type</th>
                    <th style={{ padding: '8px 10px', color: '#475569' }}>Qty</th>
                    <th style={{ padding: '8px 10px', color: '#475569' }}>Order Date</th>
                    <th style={{ padding: '8px 10px', color: '#475569' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((r, idx) => (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        background: idx % 2 === 0 ? '#ffffff' : '#fbfcfd',
                      }}
                    >
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0f172a' }}>
                        {r.orderNumber}
                      </td>
                      <td style={{ padding: '8px 10px', color: '#334155' }}>{r.customerName}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: '#0284c7' }}>
                        {r.productName}
                      </td>
                      <td style={{ padding: '8px 10px', color: '#64748b' }}>{r.productType}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700 }}>
                        {r.quantity.toLocaleString()} {r.salesUom}
                      </td>
                      <td style={{ padding: '8px 10px', color: '#64748b' }}>{r.orderDate}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span
                          style={{
                            background: '#f1f5f9',
                            color: '#475569',
                            padding: '2px 8px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal footer actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
            paddingTop: 12,
            borderTop: '1px solid #f1f5f9',
          }}
        >
          <Button variant="secondary" onClick={onClose} disabled={importing}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!parsedRows.length || importing || parsing}
          >
            {importing
              ? `Importing (${importProgress.current}/${importProgress.total})…`
              : `Import ${parsedRows.length || ''} Orders`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
