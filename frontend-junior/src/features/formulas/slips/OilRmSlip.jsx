import React from 'react'
import TabletSlipHeader from './TabletSlipHeader'
import { QcAutoCell } from '../../qc/qcSharedComponents'
import './TabletSlip.css'

function formatQty(q) {
  if (q === null || q === undefined || q === '') return ''
  const n = Number(q)
  if (isNaN(n)) return q
  return n % 1 === 0 ? n.toString() : parseFloat(n.toFixed(3)).toString()
}

export function getInitialOilRmData(product = {}, formula = {}, revision = {}, activeLines = null, company = {}) {
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

  // Rows 1 to 10 for Oil RM
  const rows = []
  for (let i = 0; i < 10; i++) {
    rows.push(mapLineToRow(rawMaterials[i] || null, i))
  }

  const isTej = Boolean(company?.code && String(company.code).toUpperCase().includes('TEJ'))

  return {
    header: {
      product: product?.name || '',
      bmr_no: product?.bmr_no || '',
      product_code: product?.code || '',
      effective_date: '12-04-2024',
      company_code: isTej ? 'TEJ' : (company?.code || 'CMHP'),
      supersedes_no: '00',
      batch_no: product?.code ? `${product.code}-01` : 'AH2602',
      version_no: String(revision?.revision_number || 1).padStart(2, '0'),
      mfg_for: 'APEX ANIMAL HEALTH PRODUCTS',
      master_formula_no: formula?.code || '',
    },
    rows,
    signoff: {
      weight_by_warehouse: '',
      weight_check_by_warehouse: '',
      checked_by_production: '',
      checked_by_qa: '',
    },
    approval: {
      prep_name: '',
      prep_sign: '',
      prep_date: '',
      rev_name: '',
      rev_sign: '',
      rev_date: '',
      app_name: '',
      app_sign: '',
      app_date: '',
    },
  }
}

export default function OilRmSlip({
  data = {},
  onChange,
  company = {},
}) {
  const header = data.header || {}
  const rows = data.rows || []
  const signoff = data.signoff || {}
  const approval = data.approval || {}

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

  const handleRowChange = (idx, field, val) => {
    if (onChange) {
      const list = [...(data.rows || [])]
      list[idx] = {
        ...list[idx],
        [field]: val,
      }
      onChange({
        ...data,
        rows: list,
      })
    }
  }

  const handleSignoffChange = (field, val) => {
    if (onChange) {
      onChange({
        ...data,
        signoff: {
          ...signoff,
          [field]: val,
        },
      })
    }
  }

  const handleApprovalChange = (field, val) => {
    if (onChange) {
      onChange({
        ...data,
        approval: {
          ...approval,
          [field]: val,
        },
      })
    }
  }

  return (
    <div className="tablet-slip-sheet cmhp-printable-slip">
      {/* HEADER BLOCK */}
      <TabletSlipHeader
        headerData={header}
        onHeaderChange={handleHeaderChange}
        company={company}
        department="PRODUCTION ( EXTERNAL PREPERATION DEPARTMENT)"
        masterFormulaLabel="MASTER FORMULA NO. :"
      />

      {/* TITLES - Exact match to OIL_RM_Requistion_ATTACHMENT_1.docx */}
      <div className="tablet-slip-title-block">
        <div className="tablet-slip-u-bold tablet-slip-att-num">ATTACHMENT - 1</div>
        <div className="tablet-slip-u-bold tablet-slip-att-title">RAW MATERIAL REQUISITION SLIP</div>
        <div className="tablet-slip-u-bold tablet-slip-att-batch">BATCH FORMULA:</div>
      </div>

      {/* TABLE (Rows 1 to 10 only; NO EXCIPIENTS section) */}
      <table className="tablet-slip-table">
        <thead>
          <tr>
            <th style={{ width: '45px' }}>Sr. No.</th>
            <th style={{ width: '80px' }}>RM Code</th>
            <th>RAW MATERIAL NAME</th>
            <th style={{ width: '95px' }}>Label Claim</th>
            <th style={{ width: '75px' }}>Qty. Req</th>
            <th style={{ width: '55px' }}>Unit</th>
            <th style={{ width: '90px' }}>AR.No.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`oil-rm-row-${idx}`}>
              <td className="cell-center">
                <QcAutoCell
                  value={row.sr_no || String(idx + 1)}
                  align="center"
                  onChange={(e) => handleRowChange(idx, 'sr_no', e.target.value)}
                />
              </td>
              <td className="cell-center">
                <QcAutoCell
                  value={row.rm_code || ''}
                  align="center"
                  onChange={(e) => handleRowChange(idx, 'rm_code', e.target.value)}
                />
              </td>
              <td className="cell-left">
                <QcAutoCell
                  value={row.name || ''}
                  align="left"
                  style={{ textTransform: 'uppercase' }}
                  onChange={(e) => handleRowChange(idx, 'name', e.target.value)}
                />
              </td>
              <td className="cell-center">
                <QcAutoCell
                  value={row.label_claim || ''}
                  align="center"
                  onChange={(e) => handleRowChange(idx, 'label_claim', e.target.value)}
                />
              </td>
              <td className="cell-center">
                <QcAutoCell
                  value={row.qty_req || ''}
                  align="center"
                  onChange={(e) => handleRowChange(idx, 'qty_req', e.target.value)}
                />
              </td>
              <td className="cell-center">
                <QcAutoCell
                  value={row.unit || ''}
                  align="center"
                  onChange={(e) => handleRowChange(idx, 'unit', e.target.value)}
                />
              </td>
              <td className="cell-center">
                <QcAutoCell
                  value={row.ar_no || ''}
                  align="center"
                  onChange={(e) => handleRowChange(idx, 'ar_no', e.target.value)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* SIGN-OFF (Exact layout from OIL_RM_Requistion_ATTACHMENT_1.docx) */}
      <div className="tablet-rm-footer">
        <div className="tablet-rm-footer-row">
          <div className="tablet-rm-footer-col">
            <span className="tablet-rm-footer-label">Weight by/Date (Warehouse)</span>
            <div className="tablet-rm-footer-input">
              <QcAutoCell
                value={signoff.weight_by_warehouse || ''}
                placeholder=""
                onChange={(e) => handleSignoffChange('weight_by_warehouse', e.target.value)}
              />
            </div>
          </div>
          <div className="tablet-rm-footer-col">
            <span className="tablet-rm-footer-label">Weight check by/Date (Warehouse) :</span>
            <div className="tablet-rm-footer-input">
              <QcAutoCell
                value={signoff.weight_check_by_warehouse || ''}
                placeholder=""
                onChange={(e) => handleSignoffChange('weight_check_by_warehouse', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="tablet-rm-footer-row" style={{ marginBottom: 0 }}>
          <div className="tablet-rm-footer-col">
            <span className="tablet-rm-footer-label">Checked by / Date (Production) :</span>
            <div className="tablet-rm-footer-input">
              <QcAutoCell
                value={signoff.checked_by_production || ''}
                placeholder=""
                onChange={(e) => handleSignoffChange('checked_by_production', e.target.value)}
              />
            </div>
          </div>
          <div className="tablet-rm-footer-col">
            <span className="tablet-rm-footer-label">Checked by / Date (QA) :</span>
            <div className="tablet-rm-footer-input">
              <QcAutoCell
                value={signoff.checked_by_qa || ''}
                placeholder=""
                onChange={(e) => handleSignoffChange('checked_by_qa', e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* APPROVAL TABLE (Exact replica of docx footer) */}
      <div className="slip-approval-box">
        <table className="slip-approval-table">
          <thead>
            <tr>
              <th style={{ width: '85px' }}></th>
              <th style={{ width: '30%' }}>
                Prepared By<br />Production Chemist
              </th>
              <th style={{ width: '30%' }}>
                Reviewed By<br />Production In-Charge
              </th>
              <th style={{ width: '30%' }}>
                Approved By<br />QA Manager
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="slip-approval-lbl">Name</td>
              <td>
                <QcAutoCell
                  value={approval.prep_name || ''}
                  align="center"
                  onChange={(e) => handleApprovalChange('prep_name', e.target.value)}
                />
              </td>
              <td>
                <QcAutoCell
                  value={approval.rev_name || ''}
                  align="center"
                  onChange={(e) => handleApprovalChange('rev_name', e.target.value)}
                />
              </td>
              <td>
                <QcAutoCell
                  value={approval.app_name || ''}
                  align="center"
                  onChange={(e) => handleApprovalChange('app_name', e.target.value)}
                />
              </td>
            </tr>
            <tr>
              <td className="slip-approval-lbl">Signature</td>
              <td>
                <QcAutoCell
                  value={approval.prep_sign || ''}
                  align="center"
                  onChange={(e) => handleApprovalChange('prep_sign', e.target.value)}
                />
              </td>
              <td>
                <QcAutoCell
                  value={approval.rev_sign || ''}
                  align="center"
                  onChange={(e) => handleApprovalChange('rev_sign', e.target.value)}
                />
              </td>
              <td>
                <QcAutoCell
                  value={approval.app_sign || ''}
                  align="center"
                  onChange={(e) => handleApprovalChange('app_sign', e.target.value)}
                />
              </td>
            </tr>
            <tr>
              <td className="slip-approval-lbl">Date</td>
              <td>
                <QcAutoCell
                  value={approval.prep_date || ''}
                  align="center"
                  onChange={(e) => handleApprovalChange('prep_date', e.target.value)}
                />
              </td>
              <td>
                <QcAutoCell
                  value={approval.rev_date || ''}
                  align="center"
                  onChange={(e) => handleApprovalChange('rev_date', e.target.value)}
                />
              </td>
              <td>
                <QcAutoCell
                  value={approval.app_date || ''}
                  align="center"
                  onChange={(e) => handleApprovalChange('app_date', e.target.value)}
                />
              </td>
            </tr>
          </tbody>
        </table>

        {/* BOTTOM FOOTER LINE */}
        <div className="slip-footer-bottom-line">
          <div>FORM NO. SOP/QA/04/F-04/00</div>
          <div>Page 1 of 1</div>
        </div>
      </div>
    </div>
  )
}
