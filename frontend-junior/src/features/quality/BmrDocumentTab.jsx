import { useState, useEffect, useCallback } from 'react'
import Button from '../../components/Button'
import { documentsService } from './documentsService'

const DOC_TYPE_LABELS = {
  MASTER_BMR: 'Master BMR',
  RAW_MATERIAL_SLIP: 'Raw Material Issue Slip',
  WEIGHING_SLIP: 'Weighing Slip',
  MANUFACTURING_RECORD: 'Manufacturing Record',
  IN_PROCESS_QC: 'In-Process QC Record',
  PACKAGING_RECORD: 'Packaging Record',
  RECONCILIATION: 'Yield & Reconciliation Record',
  FINAL_APPROVAL: 'Final BMR Approval',
  OTHER: 'Other BMR Attachment',
}

export default function BmrDocumentTab({
  companyId,
  onUploadClick,
  onPreviewClick,
  onVersionsClick,
}) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [docTypeFilter, setDocTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const loadDocuments = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (search.trim()) params.search = search.trim()
      if (docTypeFilter) params.document_type = docTypeFilter
      if (statusFilter) params.status = statusFilter

      const res = await documentsService.listBmrDocuments(companyId, params)
      const list = Array.isArray(res) ? res : res.results || []
      setDocuments(list)
    } catch (err) {
      console.error('Failed to load BMR documents:', err)
      setError('Failed to fetch BMR documents.')
    } finally {
      setLoading(false)
    }
  }, [companyId, search, docTypeFilter, statusFilter])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  const formatSize = (bytes) => {
    if (!bytes) return '0 KB'
    const kb = bytes / 1024
    if (kb >= 1024) return `${(kb / 1024).toFixed(2)} MB`
    return `${kb.toFixed(1)} KB`
  }

  return (
    <div>
      <div className="doc-table-toolbar">
        <div className="doc-search-filters">
          <input
            type="text"
            className="doc-input"
            placeholder="Search batch, product, BMR..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 220 }}
          />

          <select
            className="doc-select"
            value={docTypeFilter}
            onChange={(e) => setDocTypeFilter(e.target.value)}
          >
            <option value="">All Document Types</option>
            {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>

          <select
            className="doc-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="ATTACHED">Attached</option>
            <option value="ARCHIVED">Archived</option>
          </select>

          <Button variant="secondary" onClick={loadDocuments} disabled={loading}>
            Refresh
          </Button>
        </div>

        <div>
          <Button variant="primary" onClick={onUploadClick}>
            + Upload BMR Document
          </Button>
        </div>
      </div>

      {error && <div className="doc-alert-warning">{error}</div>}

      <div className="doc-table-wrapper">
        <table className="doc-table">
          <thead>
            <tr>
              <th style={{ width: 45 }}>Sr.</th>
              <th>Batch Number</th>
              <th>Product Name</th>
              <th>Product Code</th>
              <th>BMR Number</th>
              <th>Document Name</th>
              <th>Type</th>
              <th>Status</th>
              <th>File Size</th>
              <th>Uploaded Date</th>
              <th>Uploaded By</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="12" style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
                  Loading BMR documents...
                </td>
              </tr>
            ) : documents.length === 0 ? (
              <tr>
                <td colSpan="12" style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
                  No BMR documents found for this company. Click <strong>"+ Upload BMR Document"</strong> to attach records.
                </td>
              </tr>
            ) : (
              documents.map((doc, idx) => {
                const isAttached = doc.is_physically_attached && doc.status === 'ATTACHED'
                return (
                  <tr key={doc.id}>
                    <td>{idx + 1}</td>
                    <td>
                      <strong style={{ color: '#0f172a' }}>{doc.batch_number}</strong>
                    </td>
                    <td>{doc.product_name_snapshot}</td>
                    <td>
                      <code>{doc.product_code_snapshot || '-'}</code>
                    </td>
                    <td>{doc.bmr_number || '-'}</td>
                    <td>
                      <span title={doc.document_name} style={{ fontWeight: 500 }}>
                        {doc.document_name}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: '#475569' }}>
                        {DOC_TYPE_LABELS[doc.document_type] || doc.document_type}
                      </span>
                    </td>
                    <td>
                      {isAttached ? (
                        <span className="doc-badge attached">Attached (v{doc.version})</span>
                      ) : (
                        <span className="doc-badge missing">File Missing</span>
                      )}
                    </td>
                    <td>{formatSize(doc.file_size)}</td>
                    <td>{doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : '-'}</td>
                    <td>{doc.uploaded_by_name || 'System'}</td>
                    <td>
                      <div className="doc-actions-cell" style={{ justifyContent: 'center' }}>
                        <button
                          type="button"
                          className="doc-btn-icon"
                          title="Preview Document"
                          onClick={() => onPreviewClick(doc)}
                        >
                          👁 Preview
                        </button>
                        <button
                          type="button"
                          className="doc-btn-icon"
                          title="View Version History"
                          onClick={() => onVersionsClick(doc)}
                        >
                          📜 Versions
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

