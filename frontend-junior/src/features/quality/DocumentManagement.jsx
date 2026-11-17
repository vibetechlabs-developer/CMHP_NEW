import { useState, useEffect, useCallback } from 'react'
import Alert from '../../components/Alert'
import Button from '../../components/Button'
import BmrDocumentTab from './BmrDocumentTab'
import CoaDocumentTab from './CoaDocumentTab'
import BmrUploadModal from './BmrUploadModal'
import CoaUploadModal from './CoaUploadModal'
import DocumentPreviewModal from './DocumentPreviewModal'
import DocumentVersionsModal from './DocumentVersionsModal'
import { documentsService } from './documentsService'
import './DocumentManagement.css'

export default function DocumentManagement({ companyId }) {
  const [activeSubTab, setActiveSubTab] = useState('bmr')
  const [summary, setSummary] = useState(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [bannerNotice, setBannerNotice] = useState('')
  const [bannerError, setBannerError] = useState('')

  // Modal states
  const [bmrUploadOpen, setBmrUploadOpen] = useState(false)
  const [coaUploadOpen, setCoaUploadOpen] = useState(false)
  const [previewModal, setPreviewModal] = useState({ isOpen: false, docType: null, doc: null })
  const [versionsModal, setVersionsModal] = useState({ isOpen: false, docType: null, doc: null })

  // Refresh trigger for child tables
  const [refreshKey, setRefreshKey] = useState(0)

  const loadSummary = useCallback(async () => {
    if (!companyId) return
    setLoadingSummary(true)
    try {
      const data = await documentsService.getSummary(companyId)
      setSummary(data)
    } catch (err) {
      console.error('Failed to load document summary:', err)
    } finally {
      setLoadingSummary(false)
    }
  }, [companyId])

  useEffect(() => {
    loadSummary()
  }, [loadSummary, refreshKey])

  const handleSuccess = (msg) => {
    setBannerNotice(msg)
    setBannerError('')
    setRefreshKey((k) => k + 1)
    setTimeout(() => setBannerNotice(''), 6000)
  }

  const handlePreview = (docType, doc) => {
    setPreviewModal({ isOpen: true, docType, doc })
  }

  const handleVersions = (docType, doc) => {
    setVersionsModal({ isOpen: true, docType, doc })
  }

  const bmrCount = summary?.bmr?.total_bmr_documents || 0
  const coaCount = summary?.coa?.total_coa_records || 0

  return (
    <div className="doc-mgmt-container">
      {/* Alert Banners */}
      {bannerNotice && (
        <Alert tone="success" onClose={() => setBannerNotice('')}>
          {bannerNotice}
        </Alert>
      )}
      {bannerError && (
        <Alert tone="danger" onClose={() => setBannerError('')}>
          {bannerError}
        </Alert>
      )}

      {/* Summary KPI Cards */}
      <div className="doc-summary-grid">
        <div className="doc-kpi-card">
          <div className="doc-kpi-icon blue">📋</div>
          <div className="doc-kpi-content">
            <span className="doc-kpi-label">Total Batches</span>
            <span className="doc-kpi-value">{summary?.bmr?.total_batches ?? '-'}</span>
            <span className="doc-kpi-sub">Active batch plans</span>
          </div>
        </div>

        <div className="doc-kpi-card">
          <div className="doc-kpi-icon green">📁</div>
          <div className="doc-kpi-content">
            <span className="doc-kpi-label">BMRs Attached</span>
            <span className="doc-kpi-value">{summary?.bmr?.fully_attached_batches ?? '-'}</span>
            <span className="doc-kpi-sub">
              {summary?.bmr?.missing_bmr_batches ?? 0} batch(es) missing BMR
            </span>
          </div>
        </div>

        <div className="doc-kpi-card">
          <div className="doc-kpi-icon orange">🧪</div>
          <div className="doc-kpi-content">
            <span className="doc-kpi-label">COA QA Pending</span>
            <span className="doc-kpi-value">{summary?.coa?.pending_qa_approval ?? '-'}</span>
            <span className="doc-kpi-sub">Awaiting QA sign-off</span>
          </div>
        </div>

        <div className="doc-kpi-card">
          <div className="doc-kpi-icon green">✅</div>
          <div className="doc-kpi-content">
            <span className="doc-kpi-label">Approved COAs</span>
            <span className="doc-kpi-value">{summary?.coa?.approved_coas ?? '-'}</span>
            <span className="doc-kpi-sub">
              {summary?.coa?.rejected_coas ?? 0} rejected COA(s)
            </span>
          </div>
        </div>

        <div className="doc-kpi-card">
          <div className="doc-kpi-icon purple">📊</div>
          <div className="doc-kpi-content">
            <span className="doc-kpi-label">Documentation</span>
            <span className="doc-kpi-value">{summary?.overall_completion_percentage ?? 0}%</span>
            <span className="doc-kpi-sub">Compliance rate</span>
          </div>
        </div>
      </div>

      {/* Subtabs Bar */}
      <div className="doc-subtabs-bar">
        <div className="doc-subtabs-group">
          <button
            type="button"
            className={`doc-subtab-btn ${activeSubTab === 'bmr' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('bmr')}
          >
            📑 BMR Documents
            <span className="doc-subtab-count">{bmrCount}</span>
          </button>
          <button
            type="button"
            className={`doc-subtab-btn ${activeSubTab === 'coa' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('coa')}
          >
            📜 COA Documents
            <span className="doc-subtab-count">{coaCount}</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Button
            variant="secondary"
            onClick={() => {
              loadSummary()
              setRefreshKey((k) => k + 1)
            }}
            disabled={loadingSummary}
          >
            ⟳ Refresh
          </Button>
        </div>
      </div>

      {/* Tab Panels */}
      {activeSubTab === 'bmr' && (
        <BmrDocumentTab
          key={`bmr-${refreshKey}`}
          companyId={companyId}
          onUploadClick={() => setBmrUploadOpen(true)}
          onPreviewClick={(doc) => handlePreview('BMR', doc)}
          onVersionsClick={(doc) => handleVersions('BMR', doc)}
        />
      )}

      {activeSubTab === 'coa' && (
        <CoaDocumentTab
          key={`coa-${refreshKey}`}
          companyId={companyId}
          onUploadClick={() => setCoaUploadOpen(true)}
          onPreviewClick={(doc) => handlePreview('COA', doc)}
          onVersionsClick={(doc) => handleVersions('COA', doc)}
        />
      )}

      {/* Modals */}
      <BmrUploadModal
        isOpen={bmrUploadOpen}
        onClose={() => setBmrUploadOpen(false)}
        companyId={companyId}
        onSuccess={handleSuccess}
      />

      <CoaUploadModal
        isOpen={coaUploadOpen}
        onClose={() => setCoaUploadOpen(false)}
        companyId={companyId}
        onSuccess={handleSuccess}
      />

      <DocumentPreviewModal
        isOpen={previewModal.isOpen}
        onClose={() => setPreviewModal({ isOpen: false, docType: null, doc: null })}
        docType={previewModal.docType}
        doc={previewModal.doc}
        companyId={companyId}
      />

      <DocumentVersionsModal
        isOpen={versionsModal.isOpen}
        onClose={() => setVersionsModal({ isOpen: false, docType: null, doc: null })}
        docType={versionsModal.docType}
        doc={versionsModal.doc}
        companyId={companyId}
      />
    </div>
  )
}

