import React from 'react'
import { useNavigate } from 'react-router-dom'
import './QcViewPage.css'

export default function ComingSoonCoA({
  orderId,
  currentOrder,
  dosageForm,
  onBack,
}) {
  const navigate = useNavigate()
  const handleBack = () => {
    if (onBack) onBack()
    else navigate('/qc')
  }

  const orderTitle = currentOrder?.product_name || currentOrder?.product || 'Order'
  const orderNumber = currentOrder?.number || currentOrder?.order_number || currentOrder?.id || orderId
  const displayDosage = dosageForm || currentOrder?.dosage_form || currentOrder?.dosageForm || currentOrder?.product_type || 'Dosage Form'

  return (
    <div className="qc-view-wrapper">
      {/* Top Bar with Back Navigation */}
      <div className="qc-topbar no-print">
        <div className="qc-topbar-left">
          <button
            type="button"
            className="qc-back-btn"
            onClick={handleBack}
          >
            ← Back to QC
          </button>

          {currentOrder && (
            <div className="qc-order-pill">
              Order #{orderNumber} • {orderTitle}
              {currentOrder.batch_no ? ` (Batch: ${currentOrder.batch_no})` : ''}
            </div>
          )}

          <span className="qc-dosage-pill" style={{ background: '#f1f5f9', color: '#475569' }}>
            {displayDosage}
          </span>
        </div>
      </div>

      {/* Centered Placeholder Card */}
      <div
        className="qc-coming-soon-container"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 'calc(100vh - 120px)',
          padding: '40px 20px',
        }}
      >
        <div
          className="qc-coming-soon-card"
          style={{
            maxWidth: '520px',
            width: '100%',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06)',
            padding: '48px 36px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              marginBottom: '20px',
            }}
          >
            📋
          </div>

          <div style={{ marginBottom: '12px' }}>
            <span
              style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: '16px',
                backgroundColor: '#eff6ff',
                color: '#2563eb',
                fontSize: '12.5px',
                fontWeight: 600,
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
              }}
            >
              {displayDosage}
            </span>
          </div>

          <h2
            style={{
              fontSize: '22px',
              fontWeight: 700,
              color: '#0f172a',
              margin: '0 0 10px 0',
            }}
          >
            COA will be attached soon
          </h2>

          <p
            style={{
              fontSize: '14px',
              color: '#64748b',
              lineHeight: 1.6,
              margin: '0 0 24px 0',
            }}
          >
            Certificate of Analysis for this dosage form is under preparation and will be available soon.
          </p>

          <button
            type="button"
            className="qc-btn-secondary"
            onClick={handleBack}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 18px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            ← Back to Register
          </button>
        </div>
      </div>
    </div>
  )
}
