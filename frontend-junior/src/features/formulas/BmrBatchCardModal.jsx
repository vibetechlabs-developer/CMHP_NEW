import { useRef, useState } from 'react'
import cmhpLogo from '../../assets/cmhp_bmr_logo.png'
import './BmrBatchCardModal.css'

function formatNum(val, decimals = 2) {
  if (val === null || val === undefined || val === '') return '0'
  const n = Number(val)
  if (isNaN(n)) return '0'
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export default function BmrBatchCardModal({
  isOpen,
  onClose,
  companyName = 'SVL HOMOEO VET',
  companyCode = 'SVL',
  productName = 'PREGACURE DROP',
  productCode = 'SVL/08',
  packSizeMl = '30',
  batchNo = '',
  issueDate = '',
  baseBatchLtr = '30',
  targetVolumeLtr = '180',
  scaleMultiplier = 6,
  grossAlcoholRequiredLtr = 151.579,
  waterRequiredLtr = 28.421,
  targetAlcoholPct = '80.00',
  compositions = [],
  preservatives = [],
  specialNotes = '',
}) {
  const cardRef = useRef(null)
  const [localBatchNo, setLocalBatchNo] = useState(batchNo || '')
  const [localNotes, setLocalNotes] = useState(
    specialNotes ||
      '* Borex 6x Powder disolve in warm water 900 gms in 9 liters\n* Borex 6x Powder disolve in warm water 900 gms in 9 liters'
  )

  if (!isOpen) return null

  const handlePrint = () => {
    window.print()
  }

  // Format today's date if not provided
  const formattedDate = issueDate || (() => {
    const d = new Date()
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    return `${dd}/${mm}/${yyyy}`
  })()

  return (
    <div className="batch-card-modal-overlay" onClick={onClose}>
      <div className="batch-card-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* MODAL TOOLBAR (HIDDEN ON PRINT) */}
        <div className="batch-card-modal-header">
          <div className="batch-card-modal-title">
            <span>📋</span>
            <span>Batch Card Preview & Export ({targetVolumeLtr} LTR)</span>
          </div>
          <div className="batch-card-modal-actions">
            <button
              type="button"
              className="batch-card-btn batch-card-btn-print"
              onClick={handlePrint}
              title="Print directly or save to system PDF"
            >
              🖨️ Print Batch Card
            </button>
            <button type="button" className="batch-card-btn batch-card-btn-close" onClick={onClose}>
              ✕ Close
            </button>
          </div>
        </div>

        {/* MODAL BODY WITH THE EXACT EXCEL BATCH CARD */}
        <div className="batch-card-modal-body">
          <div className="batch-card-sheet" ref={cardRef}>
            {/* ROW 1: LOGO & COMPANY NAME */}
            <table className="bc-header-table">
              <tbody>
                <tr>
                  <td className="bc-logo-cell">
                    <img
                      src={cmhpLogo}
                      alt="CMHP"
                      className="bc-logo-img"
                      onError={(e) => {
                        e.target.style.display = 'none'
                        e.target.nextElementSibling.style.display = 'block'
                      }}
                    />
                    <span className="bc-logo-fallback" style={{ display: 'none' }}>
                      CMHP
                    </span>
                  </td>
                  <td className="bc-company-title">
                    CMHP PRIVATE LIMITED
                  </td>
                </tr>

                {/* ROW 2: PRODUCT NAME & PACK SIZE */}
                <tr className="bc-product-row">
                  <td colSpan={2} style={{ padding: 0 }}>
                    <div className="bc-product-flex">
                      <div className="bc-product-name">{productName}</div>
                      <div className="bc-pack-size">{packSizeMl}ML</div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* METADATA GRID: 3 ROWS × 2 COLUMNS */}
            <table className="bc-meta-table">
              <tbody>
                <tr>
                  <td style={{ width: '60%' }}>
                    <span className="bc-meta-label">Company Name: </span>
                    <span className="bc-meta-value">{companyName || 'SVL HOMOEO VET'}</span>
                  </td>
                  <td style={{ width: '40%' }}>
                    <span className="bc-meta-label">Product Code: </span>
                    <span className="bc-meta-value">{productCode || 'SVL/08'}</span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <span className="bc-meta-label">Company Code: </span>
                    <span className="bc-meta-value">{companyCode || 'SVL'}</span>
                  </td>
                  <td>
                    <span className="bc-meta-label">Issue Date : </span>
                    <span className="bc-meta-value">{formattedDate}</span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <span className="bc-meta-label">BATCH NO: </span>
                    <span className="bc-meta-value">
                      {localBatchNo ? (
                        <strong>{localBatchNo}</strong>
                      ) : (
                        <input
                          type="text"
                          placeholder="[Enter Batch No]"
                          value={localBatchNo}
                          onChange={(e) => setLocalBatchNo(e.target.value)}
                          style={{
                            border: 'none',
                            borderBottom: '1px solid #000',
                            fontFamily: 'inherit',
                            fontWeight: 700,
                            padding: '1px 4px',
                            width: 140,
                          }}
                        />
                      )}
                    </span>
                  </td>
                  <td>
                    <span className="bc-meta-label">BATCH SIZE: </span>
                    <span className="bc-meta-value" style={{ fontWeight: 800 }}>
                      {targetVolumeLtr} LTR
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* VEHICLE ALCOHOL & WATER SUMMARY BLOCK (TOP RIGHT MATCHING IMAGE 3) */}
            <table className="bc-vehicle-block">
              <tbody>
                <tr>
                  <td className="bc-vehicle-empty-col"></td>
                  <td className="bc-vehicle-info-col">
                    <div className="bc-veh-row">
                      <span>Alcohol required =</span>
                      <span className="bc-veh-val">{formatNum(grossAlcoholRequiredLtr, 3)} litres</span>
                    </div>
                    <div className="bc-veh-row">
                      <span>Water required =</span>
                      <span className="bc-veh-val">{formatNum(waterRequiredLtr, 3)} litres</span>
                    </div>
                    <div className="bc-veh-row" style={{ marginTop: 4 }}>
                      <span className="bc-alc-banner">
                        Alcohol Percentage {Number(targetAlcoholPct).toFixed(2)}%
                      </span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* MAIN COMPOSITION TABLE */}
            <table className="bc-comp-table">
              <thead>
                <tr>
                  <th className="bc-th-comp" rowSpan={2}>Composition</th>
                  <th className="bc-th-pot" rowSpan={2}>Potency</th>
                  <th className="bc-th-base" colSpan={2}>QTY LTR ({baseBatchLtr})</th>
                  <th className="bc-th-target" colSpan={2}>QTY LTR ({targetVolumeLtr})</th>
                </tr>
              </thead>
              <tbody>
                {/* ACTIVE COMPOSITION INGREDIENTS */}
                {compositions.map((row, idx) => {
                  const baseNum = Number(row.baseQty) || 0
                  const targetNum = baseNum * scaleMultiplier
                  const unit = row.unit || 'Lit'

                  return (
                    <tr key={row.id || `c-${idx}`}>
                      <td className="bc-td-comp">{row.name}</td>
                      <td className="bc-td-pot">{row.potency || '—'}</td>
                      <td className="bc-td-qty" style={{ width: '12%', borderRight: 'none' }}>
                        {formatNum(baseNum, 2)}
                      </td>
                      <td style={{ width: '8%', borderLeft: 'none', fontSize: 11.5, color: '#334155' }}>
                        {unit}
                      </td>
                      <td className="bc-td-qty" style={{ width: '12%', borderRight: 'none' }}>
                        {formatNum(targetNum, 2)}
                      </td>
                      <td style={{ width: '8%', borderLeft: 'none', fontSize: 11.5, color: '#334155' }}>
                        {unit}
                      </td>
                    </tr>
                  )
                })}

                {/* EXCIPIENTS & PRESERVATIVES */}
                {preservatives.map((row, idx) => {
                  const baseNum = Number(row.baseQty) || 0
                  const targetNum = baseNum * scaleMultiplier
                  const unit = row.unit || 'Gm'

                  return (
                    <tr key={row.id || `p-${idx}`}>
                      <td className="bc-td-comp">{row.name}</td>
                      <td className="bc-td-pot">{row.potency || ''}</td>
                      <td className="bc-td-qty" style={{ width: '12%', borderRight: 'none' }}>
                        {formatNum(baseNum, baseNum % 1 === 0 ? 0 : 2)}
                      </td>
                      <td style={{ width: '8%', borderLeft: 'none', fontSize: 11.5, color: '#334155' }}>
                        {unit}
                      </td>
                      <td className="bc-td-qty" style={{ width: '12%', borderRight: 'none' }}>
                        {formatNum(targetNum, targetNum % 1 === 0 ? 0 : 2)}
                      </td>
                      <td style={{ width: '8%', borderLeft: 'none', fontSize: 11.5, color: '#334155' }}>
                        {unit}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* SPECIAL INSTRUCTIONS / NOTES BLOCK */}
            <div className="bc-notes-block">
              <textarea
                className="bc-notes-textarea"
                value={localNotes}
                onChange={(e) => setLocalNotes(e.target.value)}
                placeholder="Enter special compounding / dissolving instructions..."
              />
            </div>

            {/* SIGNATURES BLOCK */}
            <table className="bc-sig-table">
              <thead>
                <tr>
                  <th className="bc-sig-label-col"></th>
                  <th className="bc-sig-person-col">Prepared By</th>
                  <th className="bc-sig-person-col">Reviewed By</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="bc-sig-label-col" style={{ fontWeight: 700 }}>
                    Name
                  </td>
                  <td className="bc-sig-person-col"></td>
                  <td className="bc-sig-person-col"></td>
                </tr>
                <tr>
                  <td className="bc-sig-label-col" style={{ fontWeight: 700 }}>
                    Signature
                  </td>
                  <td className="bc-sig-person-col" style={{ height: 42 }}></td>
                  <td className="bc-sig-person-col" style={{ height: 42 }}></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
