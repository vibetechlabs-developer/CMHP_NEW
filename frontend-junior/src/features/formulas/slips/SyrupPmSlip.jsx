import React from 'react'
import SyrupSlipHeader from './SyrupSlipHeader'
import { QcAutoCell } from '../../qc/qcSharedComponents'
import './SyrupSlip.css'

export const DEFAULT_SYRUP_PM_ITEMS = [
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
  'Dropper',
]

export function getInitialSyrupPmData(product = {}, formula = {}, revision = {}, activeLines = null, company = {}) {
  const isTej = Boolean(company?.code && String(company.code).toUpperCase().includes('TEJ'))

  const rows = DEFAULT_SYRUP_PM_ITEMS.map((name, idx) => ({
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
      effective_date: revision?.effective_date || '12-04-2024',
      company_code: isTej ? 'TEJ' : (company?.code || 'CMHP'),
      supersedes_no: '00',
      batch_no: product?.code ? `${product.code}-01` : 'AH2602',
      version_no: String(revision?.revision_number || 1).padStart(2, '0'),
      mfg_for: 'APEX ANIMAL HEALTH PRODUCTS',
      master_formula_no: formula?.code || '',
    },
    rows,
    footer: {
      checked_by_warehouse: '',
      received_by_production: '',
      verified_by_qa: '',
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

export default function SyrupPmSlip({
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
  const rows = data.rows || []
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
          <div className="syrup-slip-u-bold syrup-slip-att-num">ATTACHMENT - 4</div>
          <div className="syrup-slip-u-bold syrup-slip-att-batch" style={{ textAlign: 'left', marginTop: 4 }}>
            PACKING MATERIAL REQUIREMENT:
          </div>
        </div>

        {/* PM TABLE (Exact columns matching Word Document) */}
        <table className="syrup-slip-table">
          <thead>
            <tr>
              <th style={{ width: '45px' }}>Sr. No.</th>
              <th style={{ width: '90px' }}>Material Code</th>
              <th>Material</th>
              <th style={{ width: '120px' }}>Quantity Required Nos.</th>
              <th style={{ width: '120px' }}>Quantity Received  Nos.</th>
              <th style={{ width: '80px' }}>AR No.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={`pm-row-${idx}`}>
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

        {/* FOOTER - Three stacked lines matching Word Document layout */}
        <div className="syrup-pm-footer">
          <div className="syrup-pm-footer-stack">
            <div className="syrup-pm-footer-line">
              <span className="syrup-pm-footer-label">Checked By (Warehouse)</span>
              <div className="syrup-pm-footer-field">
                <QcAutoCell
                  value={footer.checked_by_warehouse || ''}
                  placeholder=""
                  onChange={(e) => handleFooterChange('checked_by_warehouse', e.target.value)}
                />
              </div>
            </div>
            <div className="syrup-pm-footer-line">
              <span className="syrup-pm-footer-label">Received By (Production)</span>
              <div className="syrup-pm-footer-field">
                <QcAutoCell
                  value={footer.received_by_production || ''}
                  placeholder=""
                  onChange={(e) => handleFooterChange('received_by_production', e.target.value)}
                />
              </div>
            </div>
            <div className="syrup-pm-footer-line">
              <span className="syrup-pm-footer-label">Verified by ( QA)</span>
              <div className="syrup-pm-footer-field">
                <QcAutoCell
                  value={footer.verified_by_qa || ''}
                  placeholder=""
                  onChange={(e) => handleFooterChange('verified_by_qa', e.target.value)}
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
