import React from 'react'

function formatQty(q) {
  if (q === null || q === undefined || q === '') return ''
  const n = Number(q)
  if (isNaN(n)) return q
  return n % 1 === 0 ? n.toString() : parseFloat(n.toFixed(3)).toString()
}

const DEFAULT_PACKING_ITEMS = [
  'Label',
  'Mono Box',
  'Insert',
  'Hall Mark',
  'Bottle',
  'Plug',
  'Cap',
  'Inner',
  'Outer',
  'Measuring Cap',
  'Droper',
]

export function getInitialDropsPmData(product = {}, formula = {}, revision = {}) {
  return {
    batch_no: product?.bmr_no ? `${product.code}-01` : 'AH2602',
    effective_date: '12-04-2024',
    supersedes_no: '00',
    mfg_for: 'APEX ANIMAL HEALTH PRODUCTS',
  }
}

export default function DropsPmSlip({
  product = {},
  formula = {},
  revision = {},
  activeLines = null,
  company = {},
  batchAllocation = null,
  renderHeader,
  renderSignatures,
  renderBatchAllocation,
}) {
  const lines = (activeLines && activeLines.length > 0) ? activeLines : (revision?.lines || [])
  const packagingMaterials = lines.filter(
    (l) => l.material_type === 'PACKAGING_MATERIAL' || l.material_type === 'PACKAGING'
  )

  const displayPkg = [...packagingMaterials]
  if (displayPkg.length === 0) {
    DEFAULT_PACKING_ITEMS.forEach((name, idx) => {
      displayPkg.push({
        id: `def-pm-${idx}`,
        material_name: name,
        material_code: '',
        quantity: '',
        quantity_received: '',
        ar_no: '',
      })
    })
  } else {
    while (displayPkg.length < 11) {
      displayPkg.push(null)
    }
  }

  return (
    <>
      {/* PAGE 1 (EXACT MATCH TO ATTACHMENT 4 PDF PAGE 1) */}
      <div className="bmr-exact-page bmr-exact-page-1">
        <div className="bmr-exact-page-top">
          {renderHeader && renderHeader()}

          {/* ATTACHMENT TITLES */}
          <div className="bmr-exact-attachment-block">
            <div className="bmr-exact-att-num">ATTACHMENT - 4</div>
            <div className="bmr-exact-att-title" style={{ marginTop: '8px' }}>
              PACKING MATERIAL REQUIREMENT:
            </div>
          </div>

          {/* PACKING MATERIAL TABLE (EXACT 6 COLUMNS MATCHING ATTACHMENT 4) */}
          <table className="bmr-exact-table bmr-exact-pm-table">
            <thead>
              <tr>
                <th style={{ width: '42px' }}>Sr.<br />No.</th>
                <th style={{ width: '90px' }}>Material<br />Code</th>
                <th>Material</th>
                <th style={{ width: '120px' }}>Quantity<br />Required<br />Nos.</th>
                <th style={{ width: '120px' }}>Quantity<br />Received<br />Nos.</th>
                <th style={{ width: '80px' }}>AR No.</th>
              </tr>
            </thead>
            <tbody>
              {displayPkg.map((line, idx) => {
                if (!line) {
                  return (
                    <tr key={`empty-pm-${idx}`} className="bmr-exact-row-empty">
                      <td>{idx + 1}</td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                    </tr>
                  )
                }

                const matCode = line.material?.code || line.material_code || ''
                const matName = line.material?.name || line.material_name || ''
                let qtyTextFromNotes = ''
                let recvFromNotes = ''
                if (line.notes) {
                  const parts = line.notes.split('|').map((s) => s.trim())
                  for (const p of parts) {
                    if (p.startsWith('QTY_TEXT:')) qtyTextFromNotes = p.replace('QTY_TEXT:', '').trim()
                    if (p.startsWith('RECV:')) recvFromNotes = p.replace('RECV:', '').trim()
                  }
                }
                const qtyReq = qtyTextFromNotes || formatQty(line.quantity) || ''
                const qtyRecv = line.quantity_received || recvFromNotes || ''
                const arNo = line.ar_no || ''

                return (
                  <tr key={line.id ?? `pm-${idx}`}>
                    <td>{idx + 1}</td>
                    <td>{matCode}</td>
                    <td style={{ textAlign: 'left', paddingLeft: '8px', fontWeight: 'normal' }}>
                      {matName}
                    </td>
                    <td>{qtyReq}</td>
                    <td>{qtyRecv}</td>
                    <td>{arNo}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* CHECKED BY (WAREHOUSE) */}
          <div className="bmr-exact-pm-checked">
            Checked By (Warehouse)
          </div>
        </div>

        <div className="bmr-exact-page-bottom">
          {renderSignatures && renderSignatures()}

          <div className="bmr-exact-footer-row">
            <span className="bmr-exact-form-no">FORM NO. SOP/QA/04/F-02/00</span>
            <span className="bmr-exact-page-no">Page 1 of 2</span>
          </div>
        </div>
      </div>

      {/* SCREEN PAGE SEPARATOR */}
      <div className="bmr-screen-page-divider no-print">
        <span>PAGE 2 (ATTACHMENT - 4 CONTINUATION)</span>
      </div>

      {/* PAGE 2 (EXACT MATCH TO ATTACHMENT 4 PDF PAGE 2) */}
      <div className="bmr-exact-page bmr-exact-page-2">
        <div className="bmr-exact-page-top">
          {renderHeader && renderHeader()}

          {renderBatchAllocation && renderBatchAllocation()}

          {/* RECEIVED BY / VERIFIED BY LINES */}
          <div className="bmr-exact-pm-p2-verifications">
            <div>Received By (Production)</div>
            <div>Verified by ( QA)</div>
          </div>
        </div>

        <div className="bmr-exact-page-bottom">
          {renderSignatures && renderSignatures()}

          <div className="bmr-exact-footer-row">
            <span className="bmr-exact-form-no">FORM NO. SOP/QA/04/F-02/00</span>
            <span className="bmr-exact-page-no">Page 2 of 2</span>
          </div>
        </div>
      </div>
    </>
  )
}
