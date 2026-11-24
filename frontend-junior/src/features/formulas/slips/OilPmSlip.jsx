import React from 'react'
import TabletSlipHeader from './TabletSlipHeader'
import { QcAutoCell } from '../../qc/qcSharedComponents'
import './TabletSlip.css'

const DEFAULT_OIL_PM_ITEMS = [
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

export function getInitialOilPmData(product = {}, formula = {}, revision = {}, activeLines = null, company = {}) {
  const isTej = Boolean(company?.code && String(company.code).toUpperCase().includes('TEJ'))

  const rows = DEFAULT_OIL_PM_ITEMS.map((name, idx) => ({
    sr_no: String(idx + 1),
    material_code: '',
    material: name,
    quantity_required: '',
    quantity_received: '',
    ar_no: '',
  }))

  return {
    header: {
      product: product?.name || '',
      bmr_no: product?.bmr_no || '',
      product_code: product?.code || '',
      effective_date: '12-04-2024',
      company_code: isTej ? 'TEJ' : (company?.code || 'CMHP'),
      supersedes_no: '00',
      batch_no: product?.code ? `${product.code}-01` : 'AH2602',
      version_no: '01',
      mfg_for: 'APEX ANIMAL HEALTH PRODUCTS',
      master_formula_no: formula?.code || '',
    },
    meta: {
      pm_requisition_slip_no: '',
      date: '',
    },
    rows,
    signoff: {
      checked_by_warehouse: '',
      received_by_production: '',
      verified_by_qa: '',
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

export default function OilPmSlip({
  data = {},
  onChange,
  company = {},
}) {
  const header = data.header || {}
  const meta = data.meta || {}
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

  const handleMetaChange = (field, val) => {
    if (onChange) {
      onChange({
        ...data,
        meta: {
          ...meta,
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
        department="PRODUCTION ( ORAL LIQUID DEPARTMENT)"
        masterFormulaLabel="MASTER FORMULA NO. :"
      />

      {/* TITLES - Exact match to OIL_PM_Requistion_ATTACHMENT_4.docx */}
      <div className="tablet-slip-title-block">
        <div className="tablet-slip-u-bold tablet-slip-att-num">ATTACHMENT - 4</div>
        <div className="tablet-slip-u-bold tablet-slip-att-batch" style={{ textAlign: 'left', marginTop: 8 }}>
          PACKING MATERIAL REQUIREMENT:
        </div>
      </div>

      {/* TWO FIELDS ABOVE TABLE: PM Requisition Slip No. & Date */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: '10.5pt' }}>
        <div style={{ display: 'flex', alignItems: 'center', flex: 1, marginRight: 24 }}>
          <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap', marginRight: 6 }}>PM Requisition Slip No.</span>
          <div style={{ flex: 1, borderBottom: '1px solid #000' }}>
            <QcAutoCell
              value={meta.pm_requisition_slip_no || ''}
              placeholder=""
              onChange={(e) => handleMetaChange('pm_requisition_slip_no', e.target.value)}
            />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', width: 220 }}>
          <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap', marginRight: 6 }}>Date</span>
          <div style={{ flex: 1, borderBottom: '1px solid #000' }}>
            <QcAutoCell
              value={meta.date || ''}
              placeholder=""
              onChange={(e) => handleMetaChange('date', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* PM TABLE (11 Fixed Rows matching Word Document) */}
      <table className="tablet-slip-table">
        <thead>
          <tr>
            <th style={{ width: '45px' }}>Sr. No.</th>
            <th style={{ width: '100px' }}>Material Code</th>
            <th>Material</th>
            <th style={{ width: '130px' }}>Quantity Required Nos.</th>
            <th style={{ width: '130px' }}>Quantity Received  Nos.</th>
            <th style={{ width: '90px' }}>AR No.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`oil-pm-row-${idx}`}>
              <td className="cell-center">
                <QcAutoCell
                  value={row.sr_no || String(idx + 1)}
                  align="center"
                  onChange={(e) => handleRowChange(idx, 'sr_no', e.target.value)}
                />
              </td>
              <td className="cell-center">
                <QcAutoCell
                  value={row.material_code || ''}
                  align="center"
                  onChange={(e) => handleRowChange(idx, 'material_code', e.target.value)}
                />
              </td>
              <td className="cell-left">
                <QcAutoCell
                  value={row.material || ''}
                  align="left"
                  className="qc-cell-input bold-text"
                  style={{ fontWeight: 'bold' }}
                  onChange={(e) => handleRowChange(idx, 'material', e.target.value)}
                />
              </td>
              <td className="cell-center">
                <QcAutoCell
                  value={row.quantity_required || ''}
                  align="center"
                  onChange={(e) => handleRowChange(idx, 'quantity_required', e.target.value)}
                />
              </td>
              <td className="cell-center">
                <QcAutoCell
                  value={row.quantity_received || ''}
                  align="center"
                  onChange={(e) => handleRowChange(idx, 'quantity_received', e.target.value)}
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

      {/* SIGN-OFF (Stacked 3 lines from OIL_PM_Requistion_ATTACHMENT_4.docx) */}
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ minWidth: 200, fontSize: '10.5pt', fontWeight: 'normal' }}>Checked By (Warehouse)</span>
          <div style={{ width: 280, borderBottom: '1px dotted #000' }}>
            <QcAutoCell
              value={signoff.checked_by_warehouse || ''}
              placeholder=""
              onChange={(e) => handleSignoffChange('checked_by_warehouse', e.target.value)}
            />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ minWidth: 200, fontSize: '10.5pt', fontWeight: 'normal' }}>Received By (Production)</span>
          <div style={{ width: 280, borderBottom: '1px dotted #000' }}>
            <QcAutoCell
              value={signoff.received_by_production || ''}
              placeholder=""
              onChange={(e) => handleSignoffChange('received_by_production', e.target.value)}
            />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ minWidth: 200, fontSize: '10.5pt', fontWeight: 'normal' }}>Verified by ( QA)</span>
          <div style={{ width: 280, borderBottom: '1px dotted #000' }}>
            <QcAutoCell
              value={signoff.verified_by_qa || ''}
              placeholder=""
              onChange={(e) => handleSignoffChange('verified_by_qa', e.target.value)}
            />
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
