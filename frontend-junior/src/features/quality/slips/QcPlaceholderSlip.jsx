import React from 'react'
import './TabletQcSlip.css'

export default function QcPlaceholderSlip({
  productType = 'this Product Type',
  slipType = 'attachment_2', // 'attachment_2' | 'attachment_3' | 'attachment_5'
  customMessage = '',
}) {
  const getMessage = () => {
    if (customMessage) return customMessage
    if (slipType === 'attachment_3' || slipType === 'bulk_release') {
      return `Attachment-3 (Bulk Release Slip) for ${productType} will be attached soon.`
    }
    if (slipType === 'attachment_5' || slipType === 'test_request_fp') {
      return `Attachment-5 (Test Request MT/FP) for ${productType} will be attached soon.`
    }
    return `Attachment-2 (Test Request Bulk) for ${productType} will be attached soon.`
  }

  return (
    <div className="qc-placeholder-box">
      <div className="qc-placeholder-icon">📋</div>
      <div className="qc-placeholder-title">{getMessage()}</div>
      <div className="qc-placeholder-sub">
        Standard Quality Control slip format for {productType} products is currently being finalized.
      </div>
    </div>
  )
}
