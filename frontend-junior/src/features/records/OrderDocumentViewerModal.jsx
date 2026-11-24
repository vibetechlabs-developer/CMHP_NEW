import React, { useState, useEffect } from 'react'
import BmrRequisitionSlipModal from '../formulas/BmrRequisitionSlipModal'
import TestRequestSlipEditor from '../quality/TestRequestSlipEditor'
import BulkReleaseSlipEditor from '../quality/BulkReleaseSlipEditor'
import BmrForm from '../production/BmrForm'
import QcViewPage from '../qc/QcViewPage'
import ProductionInvoice from '../production/ProductionInvoice'
import Button from '../../components/Button'
import { triggerSlipPrint } from '../../utils/slipPrintService'

/**
 * OrderDocumentViewerModal
 * True read-only document viewer modal for Records and Dispatch modules.
 * Renders Attachments 1-6, BMR, COA, and Invoice with zero enabled input fields,
 * no Save/Submit/Add/Delete buttons, and exact existing print layouts.
 */
export default function OrderDocumentViewerModal({
  isOpen,
  onClose,
  order = {},
  docType = '',
  subType = '',
  title = '',
}) {
  if (!isOpen || !order) return null

  const orderId = order.id || order.order_id
  const productType = (order.product_type || order.dosage_form || 'tablet').toLowerCase()
  const company = {
    id: order.company_id || order.company || 2,
    name: order.company_name || 'CMHP Pharma',
  }
  const product = {
    id: order.product_id,
    name: order.product_name,
    code: order.product_code,
    type: productType,
    dosage_form: order.product_type,
    bmr_no: order.batch_no,
  }

  // 1. Attachment 1 & 4 (RM & PM Requisition Slips)
  if (docType === 'ATTACHMENT_1' || docType === 'ATTACHMENT_4') {
    const tab = docType === 'ATTACHMENT_1' ? 'RM' : 'PM'
    return (
      <BmrRequisitionSlipModal
        isOpen={isOpen}
        onClose={onClose}
        product={product}
        formula={{ code: order.product_code }}
        revision={{ revision_number: 1 }}
        company={company}
        initialTab={tab}
        readOnly={true}
      />
    )
  }

  // 2. BMR (Batch Manufacturing Record)
  if (docType === 'BMR') {
    return (
      <div
        className="records-modal-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(3px)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
        }}
      >
        <div style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
          <BmrForm
            readOnly={true}
            initialOrderId={orderId}
            onBack={onClose}
          />
        </div>
      </div>
    )
  }

  // 3. COA (Certificate of Analysis)
  if (docType === 'COA') {
    return (
      <div
        className="records-modal-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(3px)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
        }}
      >
        <div style={{ flex: 1, backgroundColor: '#ffffff' }}>
          <QcViewPage
            orderId={orderId}
            readOnly={true}
            onBack={onClose}
          />
        </div>
      </div>
    )
  }

  // 4. Invoice (Tax Invoice)
  if (docType === 'INVOICE') {
    return (
      <div
        className="records-modal-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(3px)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
        }}
      >
        <div style={{ flex: 1, backgroundColor: '#f8fafc' }}>
          <ProductionInvoice
            initialOrderId={orderId}
            readOnly={true}
            onBack={onClose}
          />
        </div>
      </div>
    )
  }

  // 5. Attachment 2 & 5 (Test Request Slip / After Test)
  if (docType === 'ATTACHMENT_2' || docType === 'ATTACHMENT_5') {
    const isFp = docType === 'ATTACHMENT_5' || subType === 'fp' || subType === 'after_filter'
    const slipInitialData = {
      product: order.product_name,
      product_code: order.product_code,
      batch_no: order.batch_no,
      batch_size: order.batch_size,
      tr_no: `TR-${order.batch_no || orderId}`,
      department: 'Production',
      date: new Date().toLocaleDateString('en-GB').replace(/\//g, '-'),
    }

    return (
      <div
        className="records-modal-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(3px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
        onClick={onClose}
      >
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            maxWidth: '1000px',
            width: '100%',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div
            className="no-print"
            style={{
              padding: '14px 20px',
              backgroundColor: '#1e293b',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #334155',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '18px' }}>📄</span>
              <div>
                <strong style={{ fontSize: '15px' }}>
                  {title || (docType === 'ATTACHMENT_5' ? 'Test Request (After Test / FP)' : 'Test Request Slip')}
                </strong>
                <span style={{ marginLeft: '10px', fontSize: '12px', color: '#94a3b8' }}>
                  Order #{order.order_number || orderId} • {order.product_name}
                </span>
              </div>
              <span style={{ fontSize: '11px', background: '#334155', color: '#cbd5e1', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                🔒 Read-Only
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => triggerSlipPrint()}
                style={{
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                🖨️ Print
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  backgroundColor: '#475569',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ✕ Close
              </button>
            </div>
          </div>

          {/* Modal Content */}
          <div
            style={{
              padding: '20px',
              overflowY: 'auto',
              flex: 1,
              backgroundColor: '#f8fafc',
            }}
          >
            <div style={{ pointerEvents: 'none', userSelect: 'text' }}>
              <TestRequestSlipEditor
                initialData={slipInitialData}
                productType={productType}
                readOnly={true}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 6. Attachment 3 (Bulk Release Slip)
  if (docType === 'ATTACHMENT_3') {
    const slipInitialData = {
      product: order.product_name,
      product_code: order.product_code,
      batch_no: order.batch_no,
      batch_size: order.batch_size,
      tr_no: `BR-${order.batch_no || orderId}`,
      to_department: 'Packaging / Stores',
      mfg_date: new Date().toLocaleDateString('en-GB').replace(/\//g, '-'),
    }

    return (
      <div
        className="records-modal-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(3px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
        onClick={onClose}
      >
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            maxWidth: '1000px',
            width: '100%',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div
            className="no-print"
            style={{
              padding: '14px 20px',
              backgroundColor: '#1e293b',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #334155',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '18px' }}>📄</span>
              <div>
                <strong style={{ fontSize: '15px' }}>
                  {title || 'Bulk Release Slip (Attachment 3)'}
                </strong>
                <span style={{ marginLeft: '10px', fontSize: '12px', color: '#94a3b8' }}>
                  Order #{order.order_number || orderId} • {order.product_name}
                </span>
              </div>
              <span style={{ fontSize: '11px', background: '#334155', color: '#cbd5e1', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                🔒 Read-Only
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => triggerSlipPrint()}
                style={{
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                🖨️ Print
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  backgroundColor: '#475569',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ✕ Close
              </button>
            </div>
          </div>

          {/* Modal Content */}
          <div
            style={{
              padding: '20px',
              overflowY: 'auto',
              flex: 1,
              backgroundColor: '#f8fafc',
            }}
          >
            <div style={{ pointerEvents: 'none', userSelect: 'text' }}>
              <BulkReleaseSlipEditor
                initialData={slipInitialData}
                productType={productType}
                readOnly={true}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 7. Attachment 6 (Finish Product Transfer Slip) or Generic Fallback
  return (
    <div
      className="records-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          maxWidth: '700px',
          width: '100%',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#1e293b',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <strong style={{ fontSize: '15px' }}>{title || 'Document Record'}</strong>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: '30px', textAlign: 'center' }}>
          <p style={{ color: '#475569', fontSize: '14px' }}>
            Document: <strong>{title}</strong> for Order #{order.order_number || orderId} ({order.product_name}).
          </p>
          <p style={{ color: '#64748b', fontSize: '13px' }}>
            Batch: {order.batch_no || '—'} | Type: {order.product_type}
          </p>
          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={() => window.print()}
              style={{
                backgroundColor: '#059669',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 18px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🖨️ Print
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                backgroundColor: '#e2e8f0',
                color: '#334155',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 18px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
