import React from 'react'

function formatQty(q) {
  if (q === null || q === undefined || q === '') return ''
  const n = Number(q)
  if (isNaN(n)) return q
  return n % 1 === 0 ? n.toString() : parseFloat(n.toFixed(3)).toString()
}

export function getInitialDropsRmData(product = {}, formula = {}, revision = {}) {
  return {
    batch_no: product?.bmr_no ? `${product.code}-01` : 'AH2602',
    effective_date: '12-04-2024',
    supersedes_no: '00',
    mfg_for: 'APEX ANIMAL HEALTH PRODUCTS',
  }
}

export default function DropsRmSlip({
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

  const getLinePart = (l) => {
    if (!l) return 1
    if (l.part) return Number(l.part)
    if (l.notes) {
      const match = l.notes.match(/PART:(\d+)/)
      if (match) return Number(match[1])
    }
    return 1
  }

  const isTwoPart = Boolean(
    (revision?.notes && (revision.notes.includes('FORMULA_PARTS:2') || revision.notes.includes('TWO_PART:true'))) ||
    lines.some((l) => getLinePart(l) === 2)
  )
  const part2UsesPart1 = isTwoPart && Boolean(
    revision?.notes && revision.notes.includes('PART2_USES_PART1:true')
  )

  const rawMaterials = lines.filter((l) => l.material_type === 'RAW_MATERIAL')
  const rawPart1 = rawMaterials.filter((l) => getLinePart(l) === 1)
  const rawPart2 = rawMaterials.filter((l) => getLinePart(l) === 2)
  const excipients = lines.filter(
    (l) =>
      l.material_type === 'EXCIPIENT' ||
      (l.notes && l.notes.toLowerCase().includes('excipient')) ||
      (l.special_value && l.special_value.toUpperCase().includes('Q.S.'))
  )

  const displayRaw = [...rawMaterials]
  while (displayRaw.length < 9) {
    displayRaw.push(null)
  }

  const renderRmRow = (line, idx, offset = 0) => {
    if (!line) {
      return (
        <tr key={`empty-raw-${offset}-${idx}`} className="bmr-exact-row-empty">
          <td>{offset + idx + 1}</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
      )
    }

    const matCode = line.material?.code || line.material_code || ''
    const baseName = line.material?.name || line.material_name || ''
    const fullMatName = line.potency && !baseName.includes(line.potency)
      ? `${baseName} ${line.potency}`
      : baseName

    const isFormula = line.calculation_mode === 'AS_PER_FORMULA'
    let labelClaim = isFormula
      ? '—'
      : (line.label_claim ||
        (line.calculation_mode === 'AS_PER_LABEL_CLAIM'
          ? `${line.label_claim_quantity || ''} ${line.label_claim_uom?.code || ''}`
          : line.special_value || '—'))

    if (labelClaim === '0.00' || labelClaim === '0' || labelClaim === '0 ML' || !labelClaim) {
      labelClaim = '—'
    }

    return (
      <tr key={line.id ?? `rm-${offset}-${idx}`}>
        <td>{offset + idx + 1}</td>
        <td>{matCode}</td>
        <td style={{ textAlign: 'left', paddingLeft: '8px', fontWeight: 'normal', textTransform: 'uppercase' }}>
          {fullMatName}
        </td>
        <td>{labelClaim}</td>
        <td>{formatQty(line.quantity)}</td>
        <td>{line.unit || line.unit_code || '—'}</td>
        <td>{line.ar_no || ''}</td>
      </tr>
    )
  }

  // Page 1 excipients (rows 1 & 2)
  const displayExcP1 = excipients.slice(0, 2)
  while (displayExcP1.length < 2) {
    displayExcP1.push(null)
  }

  // Page 2 excipients (rows 3 & 4)
  const displayExcP2 = excipients.slice(2, 4)
  while (displayExcP2.length < 2) {
    displayExcP2.push(null)
  }

  return (
    <>
      {/* PAGE 1 (EXACT MATCH TO PDF PAGE 1) */}
      <div className="bmr-exact-page bmr-exact-page-1">
        <div className="bmr-exact-page-top">
          {renderHeader && renderHeader()}

          {/* ATTACHMENT TITLES */}
          <div className="bmr-exact-attachment-block">
            <div className="bmr-exact-att-num">ATTACHMENT - 1</div>
            <div className="bmr-exact-att-title">RAW MATERIAL REQUISITION SLIP</div>
            <div className="bmr-exact-batch-title">BATCH FORMULA:</div>
          </div>

          {/* RAW MATERIAL REQUISITION TABLE (EXACT 7 COLUMNS) */}
          <table className="bmr-exact-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>Sr.<br />No.</th>
                <th style={{ width: '70px' }}>RM<br />Code</th>
                <th>RAW MATERIAL NAME</th>
                <th style={{ width: '90px' }}>Label<br />Claim</th>
                <th style={{ width: '70px' }}>Qty. Req</th>
                <th style={{ width: '45px' }}>Unit</th>
                <th style={{ width: '80px' }}>AR.No.</th>
              </tr>
            </thead>
            <tbody>
              {isTwoPart ? (
                <>
                  <tr className="bmr-exact-part-span-row">
                    <td colSpan={7} style={{ fontWeight: 800, textAlign: 'left', background: '#eff6ff', color: '#1d4ed8', padding: '5px 8px', fontSize: '11px', borderBottom: '1px solid #bfdbfe' }}>
                      🔹 PART - I (ACTIVE INGREDIENTS / PREPARATION - 1)
                    </td>
                  </tr>
                  {rawPart1.length === 0 ? (
                    <tr className="bmr-exact-row-empty">
                      <td>1</td>
                      <td colSpan={6} style={{ color: '#94a3b8', fontStyle: 'italic', textAlign: 'left', paddingLeft: 10 }}>No ingredients in Part-1</td>
                    </tr>
                  ) : (
                    rawPart1.map((line, idx) => renderRmRow(line, idx, 0))
                  )}
                  <tr className="bmr-exact-part-span-row">
                    <td colSpan={7} style={{ fontWeight: 800, textAlign: 'left', background: '#faf5ff', color: '#7e22ce', padding: '5px 8px', fontSize: '11px', borderBottom: '1px solid #e9d5ff' }}>
                      🔹 PART - II (SECONDARY MIX / PREPARATION - 2)
                    </td>
                  </tr>
                  {part2UsesPart1 && (
                    <tr style={{ background: '#f0fdf4', borderBottom: '1px dashed #86efac' }}>
                      <td style={{ fontWeight: 700, color: '#166534', textAlign: 'center' }}>{rawPart1.length + 1}</td>
                      <td style={{ fontWeight: 700, color: '#166534', textAlign: 'center' }}>P-I</td>
                      <td style={{ fontWeight: 700, color: '#166534', fontStyle: 'italic', textAlign: 'left', paddingLeft: 8 }}>
                        Part-I Preparation (Intermediate) — As prepared in Part-I
                      </td>
                      <td style={{ color: '#166534', textAlign: 'center' }}>—</td>
                      <td style={{ fontWeight: 700, color: '#166534', textAlign: 'center' }}>Q.S.</td>
                      <td style={{ color: '#166534', textAlign: 'center' }}>—</td>
                      <td style={{ color: '#166534', textAlign: 'center' }}>—</td>
                    </tr>
                  )}
                  {rawPart2.length === 0 ? (
                    <tr className="bmr-exact-row-empty">
                      <td>{rawPart1.length + (part2UsesPart1 ? 2 : 1)}</td>
                      <td colSpan={6} style={{ color: '#94a3b8', fontStyle: 'italic', textAlign: 'left', paddingLeft: 10 }}>No ingredients in Part-2</td>
                    </tr>
                  ) : (
                    rawPart2.map((line, idx) => renderRmRow(line, idx, 0))
                  )}
                </>
              ) : (
                displayRaw.map((line, idx) => renderRmRow(line, idx, 0))
              )}

              {/* REPEATED HEADER FOR EXCIPIENTS (7 COLUMNS) */}
              <tr className="bmr-exact-repeat-header">
                <th style={{ width: '40px' }}>Sr.<br />No.</th>
                <th style={{ width: '70px' }}>RM<br />Code</th>
                <th>RAW MATERIAL NAME</th>
                <th style={{ width: '90px' }}>Label<br />Claim</th>
                <th style={{ width: '70px' }}>Qty. Req</th>
                <th style={{ width: '45px' }}>Unit</th>
                <th style={{ width: '80px' }}>AR.No.</th>
              </tr>

              {/* EXCIPIENTS ROW SPANNING ALL COLUMNS */}
              <tr className="bmr-exact-excipients-span-row">
                <td colSpan={7}>EXCIPIENTS</td>
              </tr>

              {/* EXCIPIENTS ROWS 1 & 2 */}
              {displayExcP1.map((line, idx) => {
                const srNo = idx + 1
                if (!line) {
                  return (
                    <tr key={`empty-exc-p1-${idx}`} className="bmr-exact-row-empty">
                      <td>{srNo}</td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                    </tr>
                  )
                }

                return (
                  <tr key={`exc-p1-${line.id ?? idx}`}>
                    <td>{srNo}</td>
                    <td>{line.material?.code || line.material_code || ''}</td>
                    <td style={{ textAlign: 'left', paddingLeft: '8px', fontWeight: 'normal', textTransform: 'uppercase' }}>
                      {line.material?.name || line.material_name || ''}
                    </td>
                    <td>{line.label_claim || line.special_value || 'Q.S.'}</td>
                    <td>{formatQty(line.quantity)}</td>
                    <td>{line.unit || line.unit_code || ''}</td>
                    <td>{line.ar_no || ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
        <span>PAGE 2 (ATTACHMENT - 1 CONTINUATION)</span>
      </div>

      {/* PAGE 2 (EXACT MATCH TO PDF PAGE 2) */}
      <div className="bmr-exact-page bmr-exact-page-2">
        <div className="bmr-exact-page-top">
          {renderHeader && renderHeader()}

          {/* EXCIPIENTS CONTINUATION TABLE (ROWS 3 & 4) */}
          <table className="bmr-exact-table bmr-exact-table-p2">
            <tbody>
              {displayExcP2.map((line, idx) => {
                const srNo = idx + 3
                if (!line) {
                  return (
                    <tr key={`empty-exc-p2-${idx}`} className="bmr-exact-row-empty">
                      <td style={{ width: '40px' }}>{srNo}</td>
                      <td style={{ width: '70px' }}></td>
                      <td></td>
                      <td style={{ width: '90px' }}></td>
                      <td style={{ width: '70px' }}></td>
                      <td style={{ width: '45px' }}></td>
                      <td style={{ width: '80px' }}></td>
                    </tr>
                  )
                }
                return (
                  <tr key={`exc-p2-${line.id ?? idx}`}>
                    <td style={{ width: '40px' }}>{srNo}</td>
                    <td style={{ width: '70px' }}>{line.material?.code || line.material_code || ''}</td>
                    <td style={{ textAlign: 'left', paddingLeft: '8px', fontWeight: 'normal', textTransform: 'uppercase' }}>
                      {line.material?.name || line.material_name || ''}
                    </td>
                    <td>{line.label_claim || line.special_value || 'Q.S.'}</td>
                    <td style={{ width: '70px' }}>{formatQty(line.quantity)}</td>
                    <td style={{ width: '45px' }}>{line.unit || line.unit_code || ''}</td>
                    <td style={{ width: '80px' }}>{line.ar_no || ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {renderBatchAllocation && renderBatchAllocation()}

          <div className="bmr-exact-verifications">
            <div>Weight by/Date (Warehouse) :</div>
            <div>Checked by / Date (Production) :</div>
            <div>Checked by / Date (QA) :</div>
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
