import React from 'react'
import SyrupSlipHeader from './SyrupSlipHeader'
import { QcAutoCell } from '../../qc/qcSharedComponents'
import './SyrupSlip.css'

function formatQty(q) {
  if (q === null || q === undefined || q === '') return ''
  const n = Number(q)
  if (isNaN(n)) return q
  return n % 1 === 0 ? n.toString() : parseFloat(n.toFixed(3)).toString()
}

export function getInitialSyrupRmData(product = {}, formula = {}, revision = {}, activeLines = null, company = {}) {
  const lines = (activeLines && activeLines.length > 0) ? activeLines : (revision?.lines || [])
  const rawMaterials = lines.filter((l) => l.material_type === 'RAW_MATERIAL' || l.material_kind_snapshot === 'RAW_MATERIAL' || !l.material_type)

  // Check if any formula lines mark an excipient
  const excipientLines = rawMaterials.filter(
    (l) =>
      l.material_type === 'EXCIPIENT' ||
      (l.notes && l.notes.toLowerCase().includes('excipient')) ||
      (l.special_value && l.special_value.toUpperCase().includes('Q.S.'))
  )
  const activeMainLines = excipientLines.length > 0
    ? rawMaterials.filter((l) => !excipientLines.includes(l))
    : rawMaterials

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

  const main_rows = []
  for (let i = 0; i < 10; i++) {
    main_rows.push(mapLineToRow(activeMainLines[i] || null, i))
  }

  const excipient_rows = []
  for (let i = 0; i < 5; i++) {
    excipient_rows.push(mapLineToRow(excipientLines[i] || null, i))
  }

  const isTej = Boolean(company?.code && String(company.code).toUpperCase().includes('TEJ'))

  return {
    header: {
      product: product?.name || '',
      bmr_no: product?.bmr_no || '',
      product_code: product?.code || '',
      effective_date: revision?.effective_date || '12-04-2024',
      company_code: isTej ? 'TEJ' : (company?.code || 'CMHP'),
      supersedes_no: '00',
      batch_no: product?.code ? `${product.code}-01` : 'AH2602',
      version_no: String(revision?.revision_number || 1).padStart(2, '0'),
      mfg_for: 'APEX ANIMAL HEALTH PRODUCTS',
      master_formula_no: formula?.code || '',
    },
    main_rows,
    excipient_rows,
    footer: {
      weight_by_warehouse: '',
      weight_check_by_warehouse: '',
      checked_by_production: '',
      checked_by_qa: '',
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

export default function SyrupRmSlip({
  data: dataProp,
  slipData: slipDataProp,
  onChange,
  company = {},
  product = {},
  formula = {},
  revision = {},
}) {
  const data = dataProp || slipDataProp || {}
  const header = data.header || {}
  const main_rows = data.main_rows || []
  const excipient_rows = data.excipient_rows || []
  const footer = data.footer || {}

  const handleHeaderChange = (field, val) => {
    if (onChange) {
      onChange({
        ...data,
        header: {
          ...header,
          [field]: val,
        },
      })
    }
  }

  const handleRowChange = (section, idx, field, val) => {
    if (onChange) {
      const list = [...(data[section] || [])]
      list[idx] = {
        ...list[idx],
        [field]: val,
      }
      onChange({
        ...data,
        [section]: list,
      })
    }
  }

  const handleFooterChange = (field, val) => {
    if (onChange) {
      onChange({
        ...data,
        footer: {
          ...footer,
          [field]: val,
        },
      })
    }
  }

  return (
    <div className="syrup-slip-sheet cmhp-printable-slip">
      <div className="syrup-slip-content-body">
        <SyrupSlipHeader
          headerData={header}
          onHeaderChange={handleHeaderChange}
          company={company}
          department="PRODUCTION ( ORAL LIQUID DEPARTMENT)"
        />

        {/* TITLES - Exact match to Word Document */}
        <div className="syrup-slip-title-block">
          <div className="syrup-slip-u-bold syrup-slip-att-num">ATTACHMENT - 1</div>
          <div className="syrup-slip-u-bold syrup-slip-att-title">RAW MATERIAL REQUISITION SLIP</div>
          <div className="syrup-slip-u-bold syrup-slip-att-batch" style={{ textAlign: 'left', marginTop: 4 }}>
            BATCH FORMULA:
          </div>
        </div>

        {/* RM TABLE */}
        <table className="syrup-slip-table">
          <thead>
            <tr>
              <th style={{ width: '38px' }}>Sr. No.</th>
              <th style={{ width: '65px' }}>RM Code</th>
              <th>RAW MATERIAL NAME</th>
              <th style={{ width: '70px' }}>Label Claim</th>
              <th style={{ width: '60px' }}>Qty. Req</th>
              <th style={{ width: '50px' }}>Unit</th>
              <th style={{ width: '68px' }}>AR. No.</th>
            </tr>
          </thead>
          <tbody>
            {/* Rows 1 to 10 */}
            {main_rows.map((row, idx) => (
              <tr key={`main-row-${idx}`}>
                <td className="cell-center">
                  <QcAutoCell
                    value={row.sr_no || String(idx + 1)}
                    align="center"
                    onChange={(e) => handleRowChange('main_rows', idx, 'sr_no', e.target.value)}
                  />
                </td>
                <td className="cell-center">
                  <QcAutoCell
                    value={row.rm_code || ''}
                    align="center"
                    onChange={(e) => handleRowChange('main_rows', idx, 'rm_code', e.target.value)}
                  />
                </td>
                <td className="cell-left">
                  <QcAutoCell
                    value={row.name || ''}
                    align="left"
                    style={{ textTransform: 'uppercase' }}
                    onChange={(e) => handleRowChange('main_rows', idx, 'name', e.target.value)}
                  />
                </td>
                <td className="cell-center">
                  <QcAutoCell
                    value={row.label_claim || ''}
                    align="center"
                    onChange={(e) => handleRowChange('main_rows', idx, 'label_claim', e.target.value)}
                  />
                </td>
                <td className="cell-center">
                  <QcAutoCell
                    value={row.qty_req || ''}
                    align="center"
                    onChange={(e) => handleRowChange('main_rows', idx, 'qty_req', e.target.value)}
                  />
                </td>
                <td className="cell-center">
                  <QcAutoCell
                    value={row.unit || ''}
                    align="center"
                    onChange={(e) => handleRowChange('main_rows', idx, 'unit', e.target.value)}
                  />
                </td>
                <td className="cell-center">
                  <QcAutoCell
                    value={row.ar_no || ''}
                    align="center"
                    onChange={(e) => handleRowChange('main_rows', idx, 'ar_no', e.target.value)}
                  />
                </td>
              </tr>
            ))}

            {/* Repeated Header Row */}
            <tr>
              <th style={{ width: '38px' }}>Sr. No.</th>
              <th style={{ width: '65px' }}>RM Code</th>
              <th>RAW MATERIAL NAME</th>
              <th style={{ width: '70px' }}>Label Claim</th>
              <th style={{ width: '60px' }}>Qty. Req</th>
              <th style={{ width: '50px' }}>Unit</th>
              <th style={{ width: '68px' }}>AR. No.</th>
            </tr>

            {/* EXCIPIENTS Header Row (centered bold) */}
            <tr className="syrup-slip-excipients-row">
              <td colSpan={7}>
                <strong>EXCIPIENTS</strong>
              </td>
            </tr>

            {/* Excipients 5 Rows (Numbering restarts at 1; Label Claim is grey shaded) */}
            {excipient_rows.map((row, idx) => (
              <tr key={`exc-row-${idx}`}>
                <td className="cell-center">
                  <QcAutoCell
                    value={row.sr_no || String(idx + 1)}
                    align="center"
                    onChange={(e) => handleRowChange('excipient_rows', idx, 'sr_no', e.target.value)}
                  />
                </td>
                <td className="cell-center">
                  <QcAutoCell
                    value={row.rm_code || ''}
                    align="center"
                    onChange={(e) => handleRowChange('excipient_rows', idx, 'rm_code', e.target.value)}
                  />
                </td>
                <td className="cell-left">
                  <QcAutoCell
                    value={row.name || ''}
                    align="left"
                    style={{ textTransform: 'uppercase' }}
                    onChange={(e) => handleRowChange('excipient_rows', idx, 'name', e.target.value)}
                  />
                </td>
                <td className="cell-center syrup-shaded-claim-cell">
                  <QcAutoCell
                    value={row.label_claim || ''}
                    align="center"
                    onChange={(e) => handleRowChange('excipient_rows', idx, 'label_claim', e.target.value)}
                  />
                </td>
                <td className="cell-center">
                  <QcAutoCell
                    value={row.qty_req || ''}
                    align="center"
                    onChange={(e) => handleRowChange('excipient_rows', idx, 'qty_req', e.target.value)}
                  />
                </td>
                <td className="cell-center">
                  <QcAutoCell
                    value={row.unit || ''}
                    align="center"
                    onChange={(e) => handleRowChange('excipient_rows', idx, 'unit', e.target.value)}
                  />
                </td>
                <td className="cell-center">
                  <QcAutoCell
                    value={row.ar_no || ''}
                    align="center"
                    onChange={(e) => handleRowChange('excipient_rows', idx, 'ar_no', e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* CHECKS BLOCK - Exact match to Word Document layout */}
        <div className="syrup-rm-footer">
          <div className="syrup-rm-footer-row">
            <div className="syrup-rm-footer-col">
              <span className="syrup-rm-footer-label">Weight by/Date (Warehouse)</span>
              <div className="syrup-rm-footer-input">
                <QcAutoCell
                  value={footer.weight_by_warehouse || ''}
                  placeholder=""
                  onChange={(e) => handleFooterChange('weight_by_warehouse', e.target.value)}
                />
              </div>
            </div>
            <div className="syrup-rm-footer-col">
              <span className="syrup-rm-footer-label">Weight check by/Date (Warehouse) :</span>
              <div className="syrup-rm-footer-input">
                <QcAutoCell
                  value={footer.weight_check_by_warehouse || ''}
                  placeholder=""
                  onChange={(e) => handleFooterChange('weight_check_by_warehouse', e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="syrup-rm-footer-row" style={{ marginBottom: 0 }}>
            <div className="syrup-rm-footer-col">
              <span className="syrup-rm-footer-label">Checked by / Date (Production) :</span>
              <div className="syrup-rm-footer-input">
                <QcAutoCell
                  value={footer.checked_by_production || ''}
                  placeholder=""
                  onChange={(e) => handleFooterChange('checked_by_production', e.target.value)}
                />
              </div>
            </div>
            <div className="syrup-rm-footer-col">
              <span className="syrup-rm-footer-label">Checked by / Date (QA) :</span>
              <div className="syrup-rm-footer-input">
                <QcAutoCell
                  value={footer.checked_by_qa || ''}
                  placeholder=""
                  onChange={(e) => handleFooterChange('checked_by_qa', e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* APPROVAL FOOTER BLOCK - Positioned at bottom like docx footer */}
      <div className="syrup-approval-box">
        <table className="syrup-approval-table">
          <thead>
            <tr>
              <th className="syrup-approval-corner-th" style={{ width: '16%' }}></th>
              <th style={{ width: '31%' }}>
                Prepared By<br />
                <span style={{ fontWeight: 'normal', fontSize: '9pt' }}>Production Chemist</span>
              </th>
              <th style={{ width: '27%' }}>
                Reviewed By<br />
                <span style={{ fontWeight: 'normal', fontSize: '9pt' }}>Production In-Charge</span>
              </th>
              <th style={{ width: '26%' }}>
                Approved By<br />
                <span style={{ fontWeight: 'normal', fontSize: '9pt' }}>QA Manager</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="syrup-approval-lbl">Name</td>
              <td>
                <QcAutoCell
                  value={footer.name_prepared || ''}
                  align="center"
                  onChange={(e) => handleFooterChange('name_prepared', e.target.value)}
                />
              </td>
              <td>
                <QcAutoCell
                  value={footer.name_reviewed || ''}
                  align="center"
                  onChange={(e) => handleFooterChange('name_reviewed', e.target.value)}
                />
              </td>
              <td>
                <QcAutoCell
                  value={footer.name_approved || ''}
                  align="center"
                  onChange={(e) => handleFooterChange('name_approved', e.target.value)}
                />
              </td>
            </tr>
            <tr>
              <td className="syrup-approval-lbl">Signature</td>
              <td>
                <QcAutoCell
                  value={footer.sign_prepared || ''}
                  align="center"
                  onChange={(e) => handleFooterChange('sign_prepared', e.target.value)}
                />
              </td>
              <td>
                <QcAutoCell
                  value={footer.sign_reviewed || ''}
                  align="center"
                  onChange={(e) => handleFooterChange('sign_reviewed', e.target.value)}
                />
              </td>
              <td>
                <QcAutoCell
                  value={footer.sign_approved || ''}
                  align="center"
                  onChange={(e) => handleFooterChange('sign_approved', e.target.value)}
                />
              </td>
            </tr>
            <tr>
              <td className="syrup-approval-lbl">Date</td>
              <td>
                <QcAutoCell
                  value={footer.date_prepared || ''}
                  align="center"
                  onChange={(e) => handleFooterChange('date_prepared', e.target.value)}
                />
              </td>
              <td>
                <QcAutoCell
                  value={footer.date_reviewed || ''}
                  align="center"
                  onChange={(e) => handleFooterChange('date_reviewed', e.target.value)}
                />
              </td>
              <td>
                <QcAutoCell
                  value={footer.date_approved || ''}
                  align="center"
                  onChange={(e) => handleFooterChange('date_approved', e.target.value)}
                />
              </td>
            </tr>
          </tbody>
        </table>

        <div className="syrup-footer-bottom-line">
          <div>FORM NO.  SOP/QA/04/F-03/00</div>
          <div>Page 1 of 1</div>
        </div>
      </div>
    </div>
  )
}
