import { useState, useEffect } from 'react'
import Modal from '../inventory/components/Modal'
import Button from '../../components/Button'
import Alert from '../../components/Alert'
import { documentsService } from './documentsService'

const DOCUMENT_TYPES = [
  { value: 'MASTER_BMR', label: 'Master BMR Document' },
  { value: 'RAW_MATERIAL_SLIP', label: 'Raw Material Issue Slip' },
  { value: 'WEIGHING_SLIP', label: 'Weighing Slip' },
  { value: 'MANUFACTURING_RECORD', label: 'Manufacturing Record' },
  { value: 'IN_PROCESS_QC', label: 'In-Process QC Record' },
  { value: 'PACKAGING_RECORD', label: 'Packaging Record' },
  { value: 'RECONCILIATION', label: 'Yield & Reconciliation Record' },
  { value: 'FINAL_APPROVAL', label: 'Final BMR Approval' },
  { value: 'OTHER', label: 'Other BMR Attachment' },
]

export default function BmrUploadModal({ isOpen, onClose, companyId, onSuccess }) {
  const [batches, setBatches] = useState([])
  const [loadingBatches, setLoadingBatches] = useState(false)
  const [selectedBatchPlanId, setSelectedBatchPlanId] = useState('')
  const [documentType, setDocumentType] = useState('MASTER_BMR')
  const [documentName, setDocumentName] = useState('')
  const [bmrNumber, setBmrNumber] = useState('')
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
      setError('Please select a batch plan.')
      return
    }
    if (!file) {
      setError('Please select a document file to upload.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('batch_plan_id', selectedBatchPlanId)
      formData.append('document_type', documentType)
      if (documentName.trim()) formData.append('document_name', documentName.trim())
      if (bmrNumber.trim()) formData.append('bmr_number', bmrNumber.trim())
      if (remarks.trim()) formData.append('remarks', remarks.trim())
      formData.append('file', file)

      await documentsService.uploadBmrDocument(companyId, formData)
      onSuccess?.('BMR document uploaded successfully.')
      onClose()
    } catch (err) {
      console.error('Upload failed:', err)
      const msg = err.response?.data?.file?.[0] || err.response?.data?.detail || err.message || 'Failed to upload document.'
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
      title="Upload BMR Document"
      subheader="Attach official Batch Manufacturing Record or technical slips directly to a batch."
      size="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting || !file}>
            {submitting ? 'Uploading...' : 'Upload Document'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexFlow: 'column', gap: 14 }}>
        {error && <Alert tone="danger">{error}</Alert>}

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
              Product: <strong>{selectedBatch.product_name}</strong> | Batch No:{' '}
              <strong>{selectedBatch.batch_number}</strong>
            </div>
          )}
        </div>

        <div className="doc-form-group">
          <label className="doc-form-label">Document Type *</label>
          <select
            className="doc-form-input doc-select"
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            disabled={submitting}
            required
          >
            {DOCUMENT_TYPES.map((dt) => (
              <option key={dt.value} value={dt.value}>
                {dt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="doc-form-group">
          <label className="doc-form-label">Document Title / Name</label>
          <input
            type="text"
            className="doc-form-input"
            placeholder="e.g. Master BMR Paracetamol 500mg Batch 12"
            value={documentName}
            onChange={(e) => setDocumentName(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="doc-form-group">
          <label className="doc-form-label">BMR Number / Identifier</label>
          <input
            type="text"
            className="doc-form-input"
            placeholder="e.g. BMR-2026-0042"
            value={bmrNumber}
            onChange={(e) => setBmrNumber(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="doc-form-group">
          <label className="doc-form-label">Physical Document File (PDF / DOC / DOCX) *</label>
          <input
            type="file"
            className="doc-form-input"
            accept=".pdf,.doc,.docx"
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
          <label className="doc-form-label">Remarks / Notes</label>
          <textarea
            className="doc-form-input"
            rows="2"
            placeholder="Optional revision notes, operator observations, or remarks..."
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            disabled={submitting}
          />
        </div>
      </form>
    </Modal>
  )
}

