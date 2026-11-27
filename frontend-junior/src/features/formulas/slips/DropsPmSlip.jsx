import React from 'react'
import DropsSlipHeader from './DropsSlipHeader'
import './DropsSlip.css'

const DROPS_PM_STANDARD_ITEMS = [
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
  'Droper', // Exact spelling per master docx format
]

export function getInitialDropsPmData(product = {}, formula = {}, revision = {}, activeLines = null, company = {}) {
  const lines = (activeLines && activeLines.length > 0) ? activeLines : (revision?.lines || [])
  const pmLines = lines.filter((l) => l.material_type === 'PACKING_MATERIAL' || l.material_kind_snapshot === 'PACKING_MATERIAL')

  const rows = DROPS_PM_STANDARD_ITEMS.map((itemName, idx) => {
    // Try matching an item in formula revision lines
    const matchedLine = pmLines.find(
      (l) => {
        const n = (l.material?.name || l.material_name || l.material_name_snapshot || '').toLowerCase()
        return n.includes(itemName.toLowerCase())
      }
    )

    const matCode = matchedLine
      ? (matchedLine.material?.code || matchedLine.material_code || matchedLine.material_code_snapshot || '')
      : ''
    const qtyReq = matchedLine
      ? (matchedLine.quantity != null ? String(matchedLine.quantity) : '')
      : ''

    return {
      sr_no: String(idx + 1),
      material_code: matCode,
      material: itemName,
      qty_required: qtyReq,
      qty_received: '',
      ar_no: matchedLine?.ar_no || '',
    }
  })

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
    rows,
    verifications: {
      checked_by_warehouse: '',
      received_by_production: '',
      verified_by_qa: '',
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

export default function DropsPmSlip({
  data = {},
  onChange = () => {},
  readOnly = false,
  company = {},
}) {
  const d = data || {}
  const header = d.header || {}
  const rows = d.rows || []
  const verifications = d.verifications || {}
  const signatures = d.signatures || {}

  const updateHeader = (field, val) => {
    if (readOnly) return
    onChange({
      ...d,
      header: { ...header, [field]: val },
    })
  }

  const updateRow = (idx, field, val) => {
    if (readOnly) return
    const next = [...rows]
    next[idx] = { ...next[idx], [field]: val }
    onChange({ ...d, rows: next })
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
    <div className="drops-slip-page drops-att4-page cmhp-printable-slip">
      {/* ── TOP BLOCK: HEADER + TITLES + TABLE ── */}
      <div>
        <DropsSlipHeader
          header={header}
          onHeaderChange={updateHeader}
          readOnly={readOnly}
          company={company}
        />

        {/* Headings */}
        <div className="drops-att-title">
          <u>ATTACHMENT - 4</u>
        </div>
        <div className="drops-section-heading">
          <u>PACKING MATERIAL REQUIREMENT:</u>
        </div>

        {/* ── PM REQUIREMENT TABLE ── */}
        <table className="drops-data-table">
          <colgroup>
            <col style={{ width: '7%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '21%' }} />
            <col style={{ width: '21%' }} />
            <col style={{ width: '14%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ width: '7%' }}>Sr. No.</th>
              <th style={{ width: '15%' }}>Material Code</th>
              <th style={{ width: '22%' }}>Material</th>
              <th style={{ width: '21%' }}>Quantity<br />Required Nos.</th>
              <th style={{ width: '21%' }}>Quantity<br />Received Nos.</th>
              <th style={{ width: '14%' }}>AR No.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={`pm-${idx}`}>
                <td className="drops-cell-center">{row.sr_no || idx + 1}</td>
                <td className="drops-cell-center">
                  <input
                    className="drops-input drops-input-screen"
                    style={{ textAlign: 'center', width: '100%' }}
                    value={row.material_code || ''}
                    disabled={readOnly}
                    onChange={(e) => updateRow(idx, 'material_code', e.target.value)}
                  />
                </td>
                <td className="drops-cell-left" style={{ fontWeight: 700 }}>
                  {row.material}
                </td>
                <td className="drops-cell-right">
                  <input
                    className="drops-input drops-input-screen"
                    style={{ textAlign: 'right', width: '100%' }}
                    value={row.qty_required || ''}
                    disabled={readOnly}
                    onChange={(e) => updateRow(idx, 'qty_required', e.target.value)}
                  />
                </td>
                <td className="drops-cell-right">
                  <input
                    className="drops-input drops-input-screen"
                    style={{ textAlign: 'right', width: '100%' }}
                    value={row.qty_received || ''}
                    disabled={readOnly}
                    onChange={(e) => updateRow(idx, 'qty_received', e.target.value)}
                  />
                </td>
                <td className="drops-cell-center">
                  <input
                    className="drops-input drops-input-screen"
                    style={{ textAlign: 'center', width: '100%' }}
                    value={row.ar_no || ''}
                    disabled={readOnly}
                    onChange={(e) => updateRow(idx, 'ar_no', e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── VERIFICATION LINES ── */}
        <div className="drops-verification-group">
          <div className="drops-verification-line">
            <span className="drops-verification-lbl">Checked By (Warehouse)&nbsp;:&nbsp;</span>
            <input
              className="drops-input drops-input-screen"
              style={{ flex: 1 }}
              value={verifications.checked_by_warehouse || ''}
              disabled={readOnly}
              onChange={(e) => updateVerification('checked_by_warehouse', e.target.value)}
            />
          </div>
          <div className="drops-verification-line">
            <span className="drops-verification-lbl">Received By (Production)&nbsp;:&nbsp;</span>
            <input
              className="drops-input drops-input-screen"
              style={{ flex: 1 }}
              value={verifications.received_by_production || ''}
              disabled={readOnly}
              onChange={(e) => updateVerification('received_by_production', e.target.value)}
            />
          </div>
          <div className="drops-verification-line">
            <span className="drops-verification-lbl">Verified by ( QA)&nbsp;:&nbsp;</span>
            <input
              className="drops-input drops-input-screen"
              style={{ flex: 1 }}
              value={verifications.verified_by_qa || ''}
              disabled={readOnly}
              onChange={(e) => updateVerification('verified_by_qa', e.target.value)}
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
