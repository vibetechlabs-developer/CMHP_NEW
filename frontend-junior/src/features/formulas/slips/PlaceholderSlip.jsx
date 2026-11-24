import React from 'react'
import './TabletSlip.css'

export default function PlaceholderSlip({
  productType = 'this Product Type',
  tabType = 'RM',
  customMessage = '',
}) {
  const message = customMessage || (tabType === 'RM'
    ? `RM Slip (Attachment - 1) for ${productType} will be attached soon.`
    : `PM Slip (Attachment - 4) for ${productType} will be attached soon.`)

  return (
    <div className="placeholder-slip-container">
      <div className="placeholder-slip-icon">📋</div>
      <div className="placeholder-slip-message">{message}</div>
      <div className="placeholder-slip-sub">
        Standard requisition document templates for {productType} products are currently being finalized.
      </div>
    </div>
  )
}
