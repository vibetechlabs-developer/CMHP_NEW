import React, { useEffect } from 'react'
import './IssueToProductionModal.css'

export default function IssueToProductionModal({
  isOpen,
  onClose,
  onConfirm,
  items = [],
  storeName = 'Selected Warehouse',
  batchNo = '',
  productName = '',
  productCode = '',
  targetVolumeLtr = '',
  totalBottles = 0,
  isIssuing = false,
  progress = { current: 0, total: 0, currentItem: '' },
  results = null,
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
              <span className="itp-meta-val itp-meta-val--store" title={storeName}>
                🏬 {storeName}
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

          {/* 2. Warning Callout (only before / during issuing) */}
          {!isCompleted && (
            <div className="itp-warning-banner">
              <span className="itp-wb-icon">⚠️</span>
              <div className="itp-wb-text">
                <strong>Inventory Deduction Notice:</strong> Confirming will immediately deduct the required quantities of <strong>{items.length} raw materials</strong> from <strong>{storeName}</strong> and generate posted material issues. <em>This action cannot be undone.</em>
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

                    let statusPill = (
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
                disabled={isIssuing}
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
