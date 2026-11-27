import React from 'react'
import DropsSlipHeader from './DropsSlipHeader'
import './DropsSlip.css'

function formatQty(q) {
  if (q === null || q === undefined || q === '') return ''
  const n = Number(q)
  if (isNaN(n)) return q
  return n % 1 === 0 ? n.toString() : parseFloat(n.toFixed(3)).toString()
}

export function getInitialDropsRmData(product = {}, formula = {}, revision = {}, activeLines = null, company = {}) {
  const lines = (activeLines && activeLines.length > 0) ? activeLines : (revision?.lines || [])
  const rawMaterials = lines.filter((l) => l.material_type === 'RAW_MATERIAL' || l.material_kind_snapshot === 'RAW_MATERIAL' || !l.material_type)

  const mapLineToRow = (l, idx) => {
    if (!l) {
      return {
        sr_no: String(idx + 1),
        rm_code: '',
        name: '',
        label_claim: '',
        qty_req: '',
        unit: '',
        ar_no: '',
      }
    }
    const matCode = l.material?.code || l.material_code || l.material_code_snapshot || ''
    const baseName = l.material?.name || l.material_name || l.material_name_snapshot || ''
    const fullMatName = l.potency && !baseName.includes(l.potency)
      ? `${baseName} ${l.potency}`
      : baseName

    const isFormula = l.calculation_mode === 'AS_PER_FORMULA'
    let labelClaim = isFormula
      ? '—'
      : (l.label_claim ||
        (l.calculation_mode === 'AS_PER_LABEL_CLAIM'
          ? `${l.label_claim_quantity || ''} ${l.label_claim_uom?.code || ''}`
          : l.special_value || '—'))

    if (labelClaim === '0.00' || labelClaim === '0' || labelClaim === '0 ML' || !labelClaim) {
      labelClaim = '—'
    }

    return {
      sr_no: String(idx + 1),
      rm_code: matCode,
      name: fullMatName,
      label_claim: labelClaim,
      qty_req: formatQty(l.quantity),
      unit: l.unit || l.unit_code || l.unit_code_snapshot || (l.unit?.code) || '—',
      ar_no: l.ar_no || '',
    }
  }

  // 9 Main rows per master docx format:
  // First rows are batch formula materials, then EXCIPIENTS (Q.S.), then ALCOHOL CONTENT (45%V/V), then blank
  const main_rows = []
  const formulaActiveCount = Math.min(rawMaterials.length, 4)

  for (let i = 0; i < formulaActiveCount; i++) {
    main_rows.push(mapLineToRow(rawMaterials[i], i))
  }

  // Row index 4 (5th row): EXCIPIENTS Q.S.
  if (main_rows.length < 5) {
    while (main_rows.length < 4) {
      main_rows.push(mapLineToRow(null, main_rows.length))
    }
    main_rows.push({
      sr_no: '5',
      rm_code: '',
      name: 'EXCIPIENTS',
      label_claim: 'Q.S.',
      qty_req: '',
      unit: '',
      ar_no: '',
    })
  }

  // Row index 5 (6th row): ALCOHOL CONTENT 45%V/V
  if (main_rows.length < 6) {
    main_rows.push({
      sr_no: '6',
      rm_code: '',
      name: 'ALCOHOL CONTENT',
      label_claim: '45%V/V',
      qty_req: '',
      unit: '',
      ar_no: '',
    })
  }

  // Fill up to 9 rows
  while (main_rows.length < 9) {
    main_rows.push(mapLineToRow(null, main_rows.length))
  }

  // 4 Excipient numbered blank rows
  const excipient_rows = [
    { sr_no: '1', rm_code: '', name: '', label_claim: '', qty_req: '', unit: '', ar_no: '' },
    { sr_no: '2', rm_code: '', name: '', label_claim: '', qty_req: '', unit: '', ar_no: '' },
    { sr_no: '3', rm_code: '', name: '', label_claim: '', qty_req: '', unit: '', ar_no: '' },
    { sr_no: '4', rm_code: '', name: '', label_claim: '', qty_req: '', unit: '', ar_no: '' },
  ]

  const isTej = Boolean(company?.code && String(company.code).toUpperCase().includes('TEJ'))

  return {
    header: {
      product: product?.name || '',
      bmr_no: product?.bmr_no || '',
      product_code: product?.code || '',
      effective_date: revision?.effective_date || '12-04-2024',
      company_code: isTej ? 'TEJ' : (company?.code || 'AAHP'),
      supersedes_no: '00',
      batch_no: product?.code ? `${product.code}-01` : 'AH2602',
      version_no: String(revision?.revision_number || 1).padStart(2, '0'),
      mfg_for: 'APEX ANIMAL HEALTH PRODUCTS',
      master_formula_no: formula?.code || '',
    },
    main_rows,
    excipient_rows,
    verifications: {
      weight_by_warehouse: '',
      checked_by_production: '',
      checked_by_qa: '',
    },
    signatures: {
      name_prepared: '',
      name_reviewed: '',
      name_approved: '',
      sign_prepared: '',
      sign_reviewed: '',
      sign_approved: '',
      date_prepared: '',
      date_reviewed: '',
      date_approved: '',
    },
  }
}

export default function DropsRmSlip({
  data = {},
  onChange = () => {},
  readOnly = false,
  company = {},
}) {
  const d = data || {}
  const header = d.header || {}
  const main_rows = d.main_rows || []
  const excipient_rows = d.excipient_rows || []
  const verifications = d.verifications || {}
  const signatures = d.signatures || {}

  const updateHeader = (field, val) => {
    if (readOnly) return
    onChange({
      ...d,
      header: { ...header, [field]: val },
    })
  }

  const updateMainRow = (idx, field, val) => {
    if (readOnly) return
    const next = [...main_rows]
    next[idx] = { ...next[idx], [field]: val }
    onChange({ ...d, main_rows: next })
  }

  const updateExcipientRow = (idx, field, val) => {
    if (readOnly) return
    const next = [...excipient_rows]
    next[idx] = { ...next[idx], [field]: val }
    onChange({ ...d, excipient_rows: next })
  }

  const updateVerification = (field, val) => {
    if (readOnly) return
    onChange({
      ...d,
      verifications: { ...verifications, [field]: val },
    })
  }

  const updateSignature = (field, val) => {
    if (readOnly) return
    onChange({
      ...d,
      signatures: { ...signatures, [field]: val },
    })
  }

  return (
    <div className="drops-slip-page drops-att1-page cmhp-printable-slip">
      {/* ── TOP BLOCK: HEADER + TITLES + TABLE ── */}
      <div>
        {/* Header Block (BMR Table) */}
        <DropsSlipHeader
          header={header}
          onHeaderChange={updateHeader}
          readOnly={readOnly}
          company={company}
        />

        {/* Headings in exact docx order */}
        <div className="drops-att-title">
          <u>ATTACHMENT - 1</u>
        </div>
        <div className="drops-att-subtitle">
          <u>RAW MATERIAL REQUISITION SLIP</u>
        </div>
        <div className="drops-section-heading">
          <u>BATCH FORMULA:</u>
        </div>

        {/* ── BATCH FORMULA TABLE ── */}
        <table className="drops-data-table">
          <colgroup>
            <col style={{ width: '7%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '32%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '15%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ width: '7%' }}>Sr. No.</th>
              <th style={{ width: '13%' }}>RM Code</th>
              <th style={{ width: '32%' }}>RAW MATERIAL NAME</th>
              <th style={{ width: '14%' }}>Label Claim</th>
              <th style={{ width: '11%' }}>Qty. Req</th>
              <th style={{ width: '8%' }}>Unit</th>
              <th style={{ width: '15%' }}>AR.No.</th>
            </tr>
          </thead>
          <tbody>
            {main_rows.map((row, idx) => (
              <tr key={`main-${idx}`}>
                <td className="drops-cell-center">{row.sr_no || idx + 1}</td>
                <td className="drops-cell-center">
                  <input
                    className="drops-input drops-input-screen"
                    style={{ textAlign: 'center', width: '100%' }}
                    value={row.rm_code || ''}
                    disabled={readOnly}
                    onChange={(e) => updateMainRow(idx, 'rm_code', e.target.value)}
                  />
                </td>
                <td className="drops-cell-left">
                  <input
                    className="drops-input drops-input-screen"
                    style={{ width: '100%', fontWeight: (idx === 4 || idx === 5) ? 700 : 400 }}
                    value={row.name || ''}
                    disabled={readOnly}
                    onChange={(e) => updateMainRow(idx, 'name', e.target.value)}
                  />
                </td>
                <td className="drops-cell-center">
                  <input
                    className="drops-input drops-input-screen"
                    style={{ textAlign: 'center', width: '100%' }}
                    value={row.label_claim || ''}
                    disabled={readOnly}
                    onChange={(e) => updateMainRow(idx, 'label_claim', e.target.value)}
                  />
                </td>
                <td className="drops-cell-right">
                  <input
                    className="drops-input drops-input-screen"
                    style={{ textAlign: 'right', width: '100%' }}
                    value={row.qty_req || ''}
                    disabled={readOnly}
                    onChange={(e) => updateMainRow(idx, 'qty_req', e.target.value)}
                  />
                </td>
                <td className="drops-cell-center">
                  <input
                    className="drops-input drops-input-screen"
                    style={{ textAlign: 'center', width: '100%' }}
                    value={row.unit || ''}
                    disabled={readOnly}
                    onChange={(e) => updateMainRow(idx, 'unit', e.target.value)}
                  />
                </td>
                <td className="drops-cell-center">
                  <input
                    className="drops-input drops-input-screen"
                    style={{ textAlign: 'center', width: '100%' }}
                    value={row.ar_no || ''}
                    disabled={readOnly}
                    onChange={(e) => updateMainRow(idx, 'ar_no', e.target.value)}
                  />
                </td>
              </tr>
            ))}

            {/* Repeated Header Row */}
            <tr>
              <th>Sr. No.</th>
              <th>RM Code</th>
              <th>RAW MATERIAL NAME</th>
              <th>Label Claim</th>
              <th>Qty. Req</th>
              <th>Unit</th>
              <th>AR.No.</th>
            </tr>

            {/* Full-width merged EXCIPIENTS Row */}
            <tr>
              <td colSpan={7} className="drops-merged-excipients">
                EXCIPIENTS
              </td>
            </tr>

            {/* 4 Excipient Numbered Blank Rows */}
            {excipient_rows.map((row, idx) => (
              <tr key={`excipient-${idx}`}>
                <td className="drops-cell-center">{row.sr_no || idx + 1}</td>
                <td className="drops-cell-center">
                  <input
                    className="drops-input drops-input-screen"
                    style={{ textAlign: 'center', width: '100%' }}
                    value={row.rm_code || ''}
                    disabled={readOnly}
                    onChange={(e) => updateExcipientRow(idx, 'rm_code', e.target.value)}
                  />
                </td>
                <td className="drops-cell-left">
                  <input
                    className="drops-input drops-input-screen"
                    style={{ width: '100%' }}
                    value={row.name || ''}
                    disabled={readOnly}
                    onChange={(e) => updateExcipientRow(idx, 'name', e.target.value)}
                  />
                </td>
                <td className="drops-cell-center">
                  <input
                    className="drops-input drops-input-screen"
                    style={{ textAlign: 'center', width: '100%' }}
                    value={row.label_claim || ''}
                    disabled={readOnly}
                    onChange={(e) => updateExcipientRow(idx, 'label_claim', e.target.value)}
                  />
                </td>
                <td className="drops-cell-right">
                  <input
                    className="drops-input drops-input-screen"
                    style={{ textAlign: 'right', width: '100%' }}
                    value={row.qty_req || ''}
                    disabled={readOnly}
                    onChange={(e) => updateExcipientRow(idx, 'qty_req', e.target.value)}
                  />
                </td>
                <td className="drops-cell-center">
                  <input
                    className="drops-input drops-input-screen"
                    style={{ textAlign: 'center', width: '100%' }}
                    value={row.unit || ''}
                    disabled={readOnly}
                    onChange={(e) => updateExcipientRow(idx, 'unit', e.target.value)}
                  />
                </td>
                <td className="drops-cell-center">
                  <input
                    className="drops-input drops-input-screen"
                    style={{ textAlign: 'center', width: '100%' }}
                    value={row.ar_no || ''}
                    disabled={readOnly}
                    onChange={(e) => updateExcipientRow(idx, 'ar_no', e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── VERIFICATION LINES ── */}
        <div className="drops-verification-group">
          <div className="drops-verification-line">
            <span className="drops-verification-lbl">Weight by/Date (Warehouse) :&nbsp;</span>
            <input
              className="drops-input drops-input-screen"
              style={{ flex: 1 }}
              value={verifications.weight_by_warehouse || ''}
              disabled={readOnly}
              onChange={(e) => updateVerification('weight_by_warehouse', e.target.value)}
            />
          </div>
          <div className="drops-verification-line">
            <span className="drops-verification-lbl">Checked by / Date (Production) :&nbsp;</span>
            <input
              className="drops-input drops-input-screen"
              style={{ flex: 1 }}
              value={verifications.checked_by_production || ''}
              disabled={readOnly}
              onChange={(e) => updateVerification('checked_by_production', e.target.value)}
            />
          </div>
          <div className="drops-verification-line">
            <span className="drops-verification-lbl">Checked by / Date (QA) :&nbsp;</span>
            <input
              className="drops-input drops-input-screen"
              style={{ flex: 1 }}
              value={verifications.checked_by_qa || ''}
              disabled={readOnly}
              onChange={(e) => updateVerification('checked_by_qa', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── BOTTOM BLOCK: SIGNATURE GRID + FOOTER ── */}
      <div>
        <table className="drops-sig-grid">
          <colgroup>
            <col style={{ width: '16%' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: '28%' }} />
          </colgroup>
          <thead>
            <tr>
              <th></th>
              <th>Prepared By<br />Production Chemist</th>
              <th>Reviewed By<br />Production In-Charge</th>
              <th>Approved By<br />QA Manager</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="drops-sig-lbl-col">Name</td>
              <td>
                <input
                  className="drops-input drops-input-screen"
                  style={{ width: '100%', textAlign: 'center' }}
                  value={signatures.name_prepared || ''}
                  disabled={readOnly}
                  onChange={(e) => updateSignature('name_prepared', e.target.value)}
                />
              </td>
              <td>
                <input
                  className="drops-input drops-input-screen"
                  style={{ width: '100%', textAlign: 'center' }}
                  value={signatures.name_reviewed || ''}
                  disabled={readOnly}
                  onChange={(e) => updateSignature('name_reviewed', e.target.value)}
                />
              </td>
              <td>
                <input
                  className="drops-input drops-input-screen"
                  style={{ width: '100%', textAlign: 'center' }}
                  value={signatures.name_approved || ''}
                  disabled={readOnly}
                  onChange={(e) => updateSignature('name_approved', e.target.value)}
                />
              </td>
            </tr>
            <tr>
              <td className="drops-sig-lbl-col">Signature</td>
              <td>
                <input
                  className="drops-input drops-input-screen"
                  style={{ width: '100%', textAlign: 'center' }}
                  value={signatures.sign_prepared || ''}
                  disabled={readOnly}
                  onChange={(e) => updateSignature('sign_prepared', e.target.value)}
                />
              </td>
              <td>
                <input
                  className="drops-input drops-input-screen"
                  style={{ width: '100%', textAlign: 'center' }}
                  value={signatures.sign_reviewed || ''}
                  disabled={readOnly}
                  onChange={(e) => updateSignature('sign_reviewed', e.target.value)}
                />
              </td>
              <td>
                <input
                  className="drops-input drops-input-screen"
                  style={{ width: '100%', textAlign: 'center' }}
                  value={signatures.sign_approved || ''}
                  disabled={readOnly}
                  onChange={(e) => updateSignature('sign_approved', e.target.value)}
                />
              </td>
            </tr>
            <tr>
              <td className="drops-sig-lbl-col">Date</td>
              <td>
                <input
                  className="drops-input drops-input-screen"
                  style={{ width: '100%', textAlign: 'center' }}
                  value={signatures.date_prepared || ''}
                  disabled={readOnly}
                  onChange={(e) => updateSignature('date_prepared', e.target.value)}
                />
              </td>
              <td>
                <input
                  className="drops-input drops-input-screen"
                  style={{ width: '100%', textAlign: 'center' }}
                  value={signatures.date_reviewed || ''}
                  disabled={readOnly}
                  onChange={(e) => updateSignature('date_reviewed', e.target.value)}
                />
              </td>
              <td>
                <input
                  className="drops-input drops-input-screen"
                  style={{ width: '100%', textAlign: 'center' }}
                  value={signatures.date_approved || ''}
                  disabled={readOnly}
                  onChange={(e) => updateSignature('date_approved', e.target.value)}
                />
              </td>
            </tr>
          </tbody>
        </table>

        {/* Footer */}
        <div className="drops-footer-row">
          <span>FORM NO. SOP/QA/04/F-02/00</span>
          <span>Page 1 of 1</span>
        </div>
      </div>
    </div>
  )
}
