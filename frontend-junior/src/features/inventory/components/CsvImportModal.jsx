import { useState, useRef } from 'react'
import Modal from './Modal'
import Button from '../../../components/Button'
import Alert from '../../../components/Alert'
import {
  parseCsvText,
  validateProductRows,
  validateMaterialRows,
  downloadSampleCsv,
} from '../../../utils/csvParser'
import { logAudit } from '../../../utils/audit'
import './CsvImportModal.css'

export default function CsvImportModal({
  isOpen,
  onClose,
  type = 'products', // 'products' | 'materials'
  existingCodes = [],
  onImport,
}) {
  const [file, setFile] = useState(null)
  const [parseResult, setParseResult] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)

  const isProducts = type === 'products'
  const title = isProducts ? 'Import Common Products via CSV' : 'Import Common Raw Materials via CSV'

  const reset = () => {
    setFile(null)
    setParseResult(null)
    setError('')
    setSuccess('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const processFile = (selectedFile) => {
    setError('')
    setSuccess('')

    if (!selectedFile) return

    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      setError('Please select a valid CSV (.csv) file.')
      return
    }

    setFile(selectedFile)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target.result
        const rows = parseCsvText(text)
        if (!rows || rows.length === 0) {
          setError('The uploaded CSV file is empty or missing data rows.')
          setParseResult(null)
          return
        }

        const result = isProducts
          ? validateProductRows(rows, existingCodes)
          : validateMaterialRows(rows, existingCodes)

        setParseResult(result)
      } catch (err) {
        setError(`Failed to read or parse file: ${err.message}`)
        setParseResult(null)
      }
    }
    reader.onerror = () => {
      setError('An error occurred while reading the file.')
    }
    reader.readAsText(selectedFile)
  }

  const handleFileChange = (e) => {
    const files = e.target.files
    if (files && files.length > 0) {
      processFile(files[0])
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      processFile(files[0])
    }
  }

  const handleImport = () => {
    if (!parseResult || !parseResult.validRecords.length) return

    const recordsToImport = parseResult.validRecords.map((r) => {
      const clean = { ...r }
      delete clean._rowNumber
      delete clean.status
      delete clean.errors
      return clean
    })

    onImport(recordsToImport)

    logAudit({
      module: 'INVENTORY',
      entity_type: isProducts ? 'Common Product' : 'Common Raw Material',
      action: isProducts ? 'CSV_IMPORT_PRODUCTS' : 'CSV_IMPORT_RAW_MATERIALS',
      description: `Imported ${recordsToImport.length} valid records from CSV file ${file?.name || ''}`,
      remarks: `Total rows parsed: ${parseResult.totalRows}, valid: ${recordsToImport.length}, invalid: ${parseResult.invalidRecords.length}`,
    })

    setSuccess(
      `Successfully imported ${recordsToImport.length} ${
        isProducts ? 'products' : 'raw materials'
      }.`
    )

    setTimeout(() => {
      handleClose()
    }, 1200)
  }

  if (!isOpen) return null

  const previewRows = parseResult
    ? [...parseResult.validRecords, ...parseResult.invalidRecords]
        .sort((a, b) => a._rowNumber - b._rowNumber)
        .slice(0, 5)
    : []

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title}>
      <div className="csv-modal-content">
        <div className="csv-modal-top-bar">
          <p className="csv-modal-hint">
            Upload a <code>.csv</code> file to bulk add {isProducts ? 'products' : 'raw materials'} into Common Inventory.
          </p>
          <Button
            type="button"
            variant="secondary"
            className="csv-template-btn"
            onClick={() => downloadSampleCsv(type)}
          >
            Download Sample CSV Template
          </Button>
        </div>

        {error && <Alert type="error" message={error} />}
        {success && <Alert type="success" message={success} />}

        {/* Upload drop zone */}
        <div
          className={`csv-dropzone ${isDragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <div className="csv-dropzone-icon">📄</div>
          {file ? (
            <div>
              <strong>{file.name}</strong>
              <p className="csv-file-meta">
                {(file.size / 1024).toFixed(1)} KB — Click or drag to replace
              </p>
            </div>
          ) : (
            <div>
              <p>
                <strong>Click to browse</strong> or drag and drop a <code>.csv</code> file here
              </p>
              <span className="csv-dropzone-sub">Only comma-delimited (.csv) files are supported</span>
            </div>
          )}
        </div>

        {/* Validation and Preview */}
        {parseResult && (
          <div className="csv-results-section">
            <div className="csv-summary-badges">
              <span className="csv-badge csv-badge-total">
                Total Rows: <strong>{parseResult.totalRows}</strong>
              </span>
              <span className="csv-badge csv-badge-valid">
                Valid: <strong>{parseResult.validRecords.length}</strong>
              </span>
              <span className="csv-badge csv-badge-invalid">
                Invalid: <strong>{parseResult.invalidRecords.length}</strong>
              </span>
            </div>

            {parseResult.invalidRecords.length > 0 && (
              <div className="csv-errors-box">
                <h4>Row Validation Issues:</h4>
                <ul>
                  {parseResult.invalidRecords.map((inv) => (
                    <li key={inv._rowNumber}>
                      <strong>Row {inv._rowNumber} ({inv.code || 'No Code'}):</strong>{' '}
                      {inv.errors.join('; ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="csv-preview-table-wrap">
              <h4>Preview (First 5 Rows):</h4>
              <table className="csv-preview-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>UOM</th>
                    {isProducts ? <th>Unit Cost</th> : <th>Stock</th>}
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r) => (
                    <tr key={r._rowNumber} className={r.status === 'VALID' ? 'row-valid' : 'row-invalid'}>
                      <td>{r._rowNumber}</td>
                      <td><strong>{r.code}</strong></td>
                      <td>{r.name}</td>
                      <td>{r.category}</td>
                      <td>{r.uom}</td>
                      <td>{isProducts ? `₹${r.unit_cost}` : r.current_stock}</td>
                      <td>
                        <span className={`status-pill pill-${r.status.toLowerCase()}`}>
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

        <div className="csv-modal-actions">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!parseResult || parseResult.validRecords.length === 0}
            onClick={handleImport}
          >
            Import {parseResult?.validRecords?.length || 0} Valid Records
          </Button>
        </div>
      </div>
    </Modal>
  )
}
