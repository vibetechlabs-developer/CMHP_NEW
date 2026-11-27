import React, { useEffect } from 'react'
import BatchPlanSearchSelect from '../manufacturing/BatchPlanSearchSelect'
import './IssueToProductionModal.css'

export default function IssueToProductionModal({
  isOpen,
  onClose,
  onConfirm,
  items = [],
  storeName = 'Central Warehouse',
  batchNo = '',
  productName = '',
  productCode = '',
  targetVolumeLtr = '',
  totalBottles = 0,
  isIssuing = false,
  progress = { current: 0, total: 0, currentItem: '' },
  results = null,
  // Batch plan / sales order binding (required by backend GMP rules)
  companyId,
  selectedBatchPlan = null,
  onBatchPlanChange = null,
  salesOrderId = null,
  isAlreadyIssued = false,
}) {
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isIssuing) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [isOpen, isIssuing, onClose])

  if (!isOpen) return null

  const cleanStoreName = (storeName || '')
    .replace(/demo\s+shared\s+warehouse/gi, 'Central Warehouse')
    .replace(/demo\s+warehouse/gi, 'Central Warehouse') || 'Central Warehouse'

  const itemsWithShortage = items.filter((it) => (Number(it.avail) || 0) < Number(it.targetQty))
  const hasShortage = itemsWithShortage.length > 0

  const canConfirm =
    !isIssuing &&
    !hasShortage &&
    !isAlreadyIssued &&
    Boolean(selectedBatchPlan || salesOrderId)

  const pct =
    progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0

  const isCompleted = results !== null

  return (
    <div
      className="itp-overlay"
      role="dialog"
      aria-modal="true"
      onClick={isIssuing ? undefined : onClose}
    >
      <div className="itp-modal" onClick={(e) => e.stopPropagation()}>
        {/* MODAL HEADER */}
        <div className="itp-header">
          <div className="itp-header-left">
            <div className="itp-icon-badge">🚀</div>
            <div className="itp-title-wrap">
              <h3>Confirm Issue to Production</h3>
              <p>Verify raw material deduction for Batch #{batchNo || '—'}</p>
            </div>
          </div>
          <button
            type="button"
            className="itp-close-btn"
            onClick={onClose}
            disabled={isIssuing}
            title="Close dialog"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="itp-body">
          {/* 1. Context Meta Card */}
          <div className="itp-meta-grid">
            <div className="itp-meta-item">
              <span className="itp-meta-label">Source Warehouse</span>
              <span className="itp-meta-val itp-meta-val--store" title={cleanStoreName}>
                🏬 {cleanStoreName}
              </span>
            </div>
            <div className="itp-meta-item">
              <span className="itp-meta-label">Batch Reference</span>
              <span className="itp-meta-val itp-meta-val--batch">
                🏷️ {batchNo || 'N/A'}
              </span>
            </div>
            <div className="itp-meta-item">
              <span className="itp-meta-label">Product Name</span>
              <span className="itp-meta-val" title={productName}>
                💊 {productName} {productCode ? `(${productCode})` : ''}
              </span>
            </div>
            <div className="itp-meta-item">
              <span className="itp-meta-label">Batch Output</span>
              <span className="itp-meta-val">
                📏 {targetVolumeLtr} LTR {totalBottles ? `(${totalBottles.toLocaleString()} btls)` : ''}
              </span>
            </div>
          </div>

          {/* 2. Batch Plan / Sales Order Binding (GMP requirement) */}
          {!isCompleted && (
            <div style={{
              background: '#f0f9ff',
              border: '1.5px solid #bae6fd',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 12,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0369a1', marginBottom: 6 }}>
                🏷️ Batch Plan / Sales Order Link (Required for GMP Compliance)
              </div>
              <BatchPlanSearchSelect
                companyId={companyId}
                value={selectedBatchPlan?.id || ''}
                selected={selectedBatchPlan}
                onChange={onBatchPlanChange}
                disabled={isIssuing}
              />
              {!selectedBatchPlan && salesOrderId && <small>Linked to Sales Order #{salesOrderId}</small>}
            </div>
          )}

          {/* 3. Status and Warning Callout */}
          {!isCompleted && isAlreadyIssued && (
            <div style={{
              background: '#ecfdf5',
              border: '1.5px solid #a7f3d0',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 12,
              display: 'flex',
              gap: 10,
              alignItems: 'center',
            }}>
              <span style={{ fontSize: 20 }}>✅</span>
              <div>
                <strong style={{ color: '#065f46', fontSize: 13 }}>Batch Materials Already Issued</strong>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#047857' }}>
                  Materials for Batch <strong>#{batchNo || selectedBatchPlan?.id || '—'}</strong> have already been deducted from {cleanStoreName} and posted to the ledger. Duplicate deduction is blocked to protect inventory accuracy.
                </p>
              </div>
            </div>
          )}

          {!isCompleted && !isAlreadyIssued && hasShortage && (
            <div style={{
              background: '#fef2f2',
              border: '1.5px solid #fecaca',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 12,
              display: 'flex',
              gap: 10,
              alignItems: 'center',
            }}>
              <span style={{ fontSize: 20 }}>🛑</span>
              <div>
                <strong style={{ color: '#991b1b', fontSize: 13 }}>Cannot Deduct: Insufficient Stock Available</strong>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#b91c1c' }}>
                  {itemsWithShortage.length} item(s) do not have enough stock in {cleanStoreName}. Deduction can only be executed when all materials are fully in stock.
                </p>
              </div>
            </div>
          )}

          {!isCompleted && !isAlreadyIssued && !hasShortage && (
            <div className="itp-warning-banner">
              <span className="itp-wb-icon">⚠️</span>
              <div className="itp-wb-text">
                <strong>Inventory Deduction Notice:</strong> Confirming will immediately deduct the required quantities of <strong>{items.length} raw materials</strong> from <strong>{cleanStoreName}</strong> and generate posted material issues. <em>This action cannot be undone.</em>
              </div>
            </div>
          )}

          {/* 3. Materials Deduction Table */}
          <div className="itp-table-card">
            <div className="itp-table-header-title">
              <span>📋 Raw Materials to be Deducted</span>
              <span className="itp-count-pill">{items.length} Materials</span>
            </div>

            <div className="itp-table-scroll">
              <table className="itp-table">
                <thead>
                  <tr>
                    <th style={{ width: 40, textAlign: 'center' }}>Sr.</th>
                    <th>Material Name</th>
                    <th style={{ textAlign: 'right', width: 110 }}>Deduct Qty</th>
                    <th style={{ textAlign: 'right', width: 110 }}>Current Stock</th>
                    <th style={{ textAlign: 'right', width: 110 }}>Remaining</th>
                    <th style={{ width: 100, textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const isCurrent = isIssuing && progress.currentItem === item.name
                    const isSuccess = results?.success?.some((s) => s.name === item.name)
                    const isFailed = results?.failed?.some((f) => f.name === item.name)

                    const remain = Math.max(0, (item.avail || 0) - item.targetQty)

                    const isShort = (Number(item.avail || 0)) < Number(item.targetQty)

                    let statusPill = isShort ? (
                      <span className="itp-pill-status itp-pill-failed" style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }}>
                        ❌ Shortage
                      </span>
                    ) : (
                      <span className="itp-pill-status itp-pill-ready">
                        ✓ In Stock
                      </span>
                    )
                    if (isCurrent) {
                      statusPill = (
                        <span className="itp-pill-status itp-pill-issuing">
                          ⏳ Issuing…
                        </span>
                      )
                    } else if (isSuccess) {
                      statusPill = (
                        <span className="itp-pill-status itp-pill-done">
                          ✅ Deducted
                        </span>
                      )
                    } else if (isFailed) {
                      statusPill = (
                        <span className="itp-pill-status itp-pill-failed">
                          ❌ Failed
                        </span>
                      )
                    }

                    return (
                      <tr
                        key={item.id || idx}
                        className={isCurrent ? 'itp-row--active' : undefined}
                      >
                        <td style={{ textAlign: 'center', color: '#64748b' }}>
                          {idx + 1}
                        </td>
                        <td>
                          <span className="itp-mat-name">{item.name}</span>
                          {item.materialCode && (
                            <span className="itp-mat-code">({item.materialCode})</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="itp-qty-bold">
                            {Number(item.targetQty).toFixed(2)} {item.unit}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', color: '#64748b' }}>
                          {Number(item.avail || 0).toFixed(2)} {item.unit}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="itp-qty-after">
                            {remain.toFixed(2)} {item.unit}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {statusPill}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. Live Progress Bar during execution */}
          {isIssuing && (
            <div className="itp-progress-box">
              <div className="itp-progress-top">
                <span>Deducting inventory from store…</span>
                <span>{progress.current} of {progress.total} ({pct}%)</span>
              </div>
              <div className="itp-progress-bar-bg">
                <div
                  className="itp-progress-bar-fill"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="itp-progress-item-text">
                <span>🔄</span>
                <span>Currently processing: <strong>{progress.currentItem}</strong></span>
              </div>
            </div>
          )}

          {/* 5. Results Banner */}
          {results && (
            <>
              {results.failed.length === 0 ? (
                <div className="itp-success-banner">
                  <div className="itp-sb-icon">🎉</div>
                  <div className="itp-sb-content">
                    <h4>All {results.success.length} Materials Issued Successfully!</h4>
                    <p>
                      Inventory has been permanently deducted from <strong>{storeName}</strong> under Batch <strong>{batchNo}</strong>.
                    </p>
                    {results.success.length > 0 && (
                      <div className="itp-sb-refs">
                        Voucher Refs: {results.success.map((s) => s.reference).filter(Boolean).join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="itp-error-banner">
                  <span>⚠️</span>
                  <div>
                    <strong>Partial Issue Completed:</strong> {results.success.length} succeeded, {results.failed.length} failed.
                    <br />
                    Failed items: {results.failed.map((f) => `${f.name} (${f.error})`).join('; ')}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="itp-footer">
          {isCompleted ? (
            <button
              type="button"
              className="itp-btn itp-btn--done"
              onClick={onClose}
            >
              ✓ Done & Close
            </button>
          ) : (
            <>
              <button
                type="button"
                className="itp-btn itp-btn--cancel"
                onClick={onClose}
                disabled={isIssuing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="itp-btn itp-btn--confirm"
                onClick={onConfirm}
                disabled={!canConfirm}
                title={
                  isAlreadyIssued
                    ? 'Materials already issued for this batch plan'
                    : hasShortage
                    ? 'Cannot issue: resolve stock shortages first'
                    : !selectedBatchPlan && !salesOrderId
                    ? 'Select a batch plan before issuing'
                    : undefined
                }
                style={
                  !canConfirm
                    ? { opacity: 0.6, cursor: 'not-allowed', filter: 'grayscale(30%)' }
                    : undefined
                }
              >
                {isIssuing ? (
                  <>
                    <span className="itp-spinner-dot">⏳</span> Issuing to Production…
                  </>
                ) : (
                  <>
                    <span>🚀</span> Confirm & Deduct {items.length} Materials
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
