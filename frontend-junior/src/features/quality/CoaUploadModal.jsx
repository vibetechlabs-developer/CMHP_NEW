import { useState, useEffect } from 'react'
import Modal from '../inventory/components/Modal'
import Button from '../../components/Button'
import Alert from '../../components/Alert'
import { documentsService } from './documentsService'

export default function CoaUploadModal({ isOpen, onClose, companyId, onSuccess }) {
  const [batches, setBatches] = useState([])
  const [loadingBatches, setLoadingBatches] = useState(false)
  const [selectedBatchPlanId, setSelectedBatchPlanId] = useState('')
  const [coaNumber, setCoaNumber] = useState('')
  const [documentName, setDocumentName] = useState('')
  const [qcReference, setQcReference] = useState('')
  const [mfgDate, setMfgDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [remarks, setRemarks] = useState('')
  const [file, setFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen || !companyId) return
    const fetchBatches = async () => {
      setLoadingBatches(true)
      try {
        const list = await documentsService.getEligibleBatches(companyId)
        setBatches(list)
        if (list.length > 0 && !selectedBatchPlanId) {
          setSelectedBatchPlanId(list[0].batch_plan_id)
        }
      } catch (err) {
        console.error('Failed to load eligible batches:', err)
      } finally {
        setLoadingBatches(false)
      }
    }
    fetchBatches()
  }, [isOpen, companyId])

  const selectedBatch = batches.find((b) => b.batch_plan_id === Number(selectedBatchPlanId))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedBatchPlanId) {
      setError('Please select a batch.')
      return
    }
    if (!coaNumber.trim()) {
      setError('Certificate of Analysis (COA) number is required.')
      return
    }
    if (!file) {
      setError('Please select the official COA document (PDF).')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('batch_plan_id', selectedBatchPlanId)
      if (selectedBatch?.quality_case_id) {
        formData.append('quality_case_id', selectedBatch.quality_case_id)
      }
      formData.append('coa_number', coaNumber.trim())
      if (documentName.trim()) formData.append('document_name', documentName.trim())
      if (qcReference.trim()) formData.append('qc_reference', qcReference.trim())
      if (mfgDate) formData.append('mfg_date', mfgDate)
      if (expiryDate) formData.append('expiry_date', expiryDate)
      if (remarks.trim()) formData.append('remarks', remarks.trim())
      formData.append('file', file)

      await documentsService.uploadCoaDocument(companyId, formData)
      onSuccess?.('COA document uploaded successfully in PENDING QA APPROVAL state.')
      onClose()
    } catch (err) {
      console.error('Upload failed:', err)
      const msg = err.response?.data?.file?.[0] || err.response?.data?.detail || err.message || 'Failed to upload COA document.'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Upload Certificate of Analysis (COA)"
      subheader="Upload laboratory analytical certificate for batch quality compliance."
      size="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting || !file}>
            {submitting ? 'Uploading...' : 'Upload COA'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexFlow: 'column', gap: 14 }}>
        {error && <Alert tone="danger">{error}</Alert>}

        <div className="doc-alert-warning">
          <strong>GMP Notice:</strong> Uploading will <em>NOT</em> automatically approve this Certificate of Analysis. In
          strict compliance with pharmaceutical quality governance, all uploaded COAs start in{' '}
          <strong>PENDING QA APPROVAL</strong> status and require authorized QA officer electronic sign-off.
        </div>

        <div className="doc-form-group">
          <label className="doc-form-label">Batch Selection *</label>
          <select
            className="doc-form-input doc-select"
            value={selectedBatchPlanId}
            onChange={(e) => setSelectedBatchPlanId(e.target.value)}
            disabled={loadingBatches || submitting}
            required
          >
            {batches.map((b) => (
              <option key={b.batch_plan_id} value={b.batch_plan_id}>
                Batch {b.batch_number} — {b.product_name} ({b.product_code})
              </option>
            ))}
          </select>
          {selectedBatch && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              Batch: <strong>{selectedBatch.batch_number}</strong> | Product: <strong>{selectedBatch.product_name}</strong>
            </div>
          )}
        </div>

        <div className="doc-form-group">
          <label className="doc-form-label">COA Number / Reference *</label>
          <input
            type="text"
            className="doc-form-input"
            placeholder="e.g. COA-2026-0988"
            value={coaNumber}
            onChange={(e) => setCoaNumber(e.target.value)}
            disabled={submitting}
            required
          />
        </div>

        <div className="doc-form-group">
          <label className="doc-form-label">Document Title</label>
          <input
            type="text"
            className="doc-form-input"
            placeholder="e.g. Certificate of Analysis - Finished Product"
            value={documentName}
            onChange={(e) => setDocumentName(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="doc-form-group">
          <label className="doc-form-label">QC Lab Reference / Sample Notebook ID</label>
          <input
            type="text"
            className="doc-form-input"
            placeholder="e.g. QC-ANL-2026-04"
            value={qcReference}
            onChange={(e) => setQcReference(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="doc-form-group">
            <label className="doc-form-label">Mfg. Date</label>
            <input
              type="date"
              className="doc-form-input"
              value={mfgDate}
              onChange={(e) => setMfgDate(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="doc-form-group">
            <label className="doc-form-label">Expiry Date</label>
            <input
              type="date"
              className="doc-form-input"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>

        <div className="doc-form-group">
          <label className="doc-form-label">COA Document File (PDF) *</label>
          <input
            type="file"
            className="doc-form-input"
            accept=".pdf"
            onChange={(e) => setFile(e.target.files[0] || null)}
            disabled={submitting}
            required
          />
          {file && (
            <div style={{ fontSize: 11, color: '#16a34a', marginTop: 3 }}>
              Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </div>
          )}
        </div>

        <div className="doc-form-group">
          <label className="doc-form-label">Remarks / Analytical Notes</label>
          <textarea
            className="doc-form-input"
            rows="2"
            placeholder="Assay, dissolution, microbial purity remarks..."
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            disabled={submitting}
          />
        </div>
      </form>
    </Modal>
  )
}

