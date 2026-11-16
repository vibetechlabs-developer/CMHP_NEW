import { useState, useEffect } from 'react'
import Modal from '../inventory/components/Modal'
import Button from '../../components/Button'
import { documentsService } from './documentsService'

export default function DocumentVersionsModal({ isOpen, onClose, docType, doc, companyId }) {
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen || !doc || !companyId) return

    const fetchVersions = async () => {
      setLoading(true)
      setError('')
      try {
        let list
        if (docType === 'BMR') {
          list = await documentsService.getBmrVersions(companyId, doc.id)
        } else {
          list = await documentsService.getCoaVersions(companyId, doc.id)
        }
        setVersions(list)
      } catch (err) {
        console.error('Failed to load version history:', err)
        setError('Failed to load version history.')
      } finally {
        setLoading(false)
      }
    }

    fetchVersions()
  }, [isOpen, doc, companyId, docType])

  if (!isOpen || !doc) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Document Version History & Audit Trail"
      subheader={`Batch: ${doc.batch_number} — ${docType === 'BMR' ? doc.document_name : doc.coa_number}`}
      size="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading && <div style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>Loading versions...</div>}
        {error && <div className="doc-alert-warning">{error}</div>}

        {!loading && versions.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>No version history available.</div>
        )}

        {!loading &&
          versions.map((v) => (
            <div key={v.id} className="doc-version-row">
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>
                  Version {v.version}{' '}
                  {v.id === doc.id && (
                    <span style={{ fontSize: 11, background: '#eff6ff', color: '#1d4ed8', padding: '2px 6px', borderRadius: 4 }}>
                      Current
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  Uploaded by: <strong>{v.uploaded_by_username || 'System'}</strong> on{' '}
                  {v.uploaded_at ? new Date(v.uploaded_at).toLocaleString() : 'N/A'}
                </div>
                {v.status && (
                  <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                    Status: <strong>{v.status}</strong> | Size: {((v.file_size || 0) / 1024).toFixed(1)} KB
                  </div>
                )}
                {v.remarks && (
                  <div style={{ fontSize: 12, color: '#334155', fontStyle: 'italic', marginTop: 4 }}>
                    "{v.remarks}"
                  </div>
                )}
              </div>
              <div>
                <code style={{ fontSize: 11, color: '#64748b' }}>{v.sha256_checksum?.slice(0, 10)}...</code>
              </div>
            </div>
          ))}
      </div>
    </Modal>
  )
}

