import React from 'react'
import cmhpLogo from '../../../assets/cmhp_invoice_logo.png'
import { QcSlipInput, QcSlipText } from './QcSlipEditable'
import './TabletQcSlip.css'

export function getInitialOilTestRequestBulkData(rec = {}, defaults = {}) {
  return {
    header_title: defaults.header_title || 'CMHP PRIVATE LIMITED',
    header_subtitle: defaults.header_subtitle || 'PRODUCTION',
    slip_name: defaults.slip_name || 'TEST REQUEST (BULK )',
    tr_no_label: 'TR NO :',
    tr_no: rec.tr_no || rec.ar_no || '',
    date_label: 'DATE:',
    date: rec.date || rec.test_date || new Date().toISOString().split('T')[0],
    department_label: 'DEPARTMENT :',
    department: rec.department || 'OIL',
    form_no: defaults.form_no || 'FORM NO.: SOP/QA/04/F-03/00',
    product_label: 'PRODUCT :',
    product: rec.product || rec.material_name || '',
    product_code_label: 'PRODUCT CODE :',
    product_code: rec.product_code || rec.material_code || '',
    batch_no_label: 'BATCH NO. :',
    batch_no: rec.batch_no || '',
    batch_size_label: 'BATCH SIZE :',
    batch_size: rec.batch_size ? String(rec.batch_size) : '',
    sampled_qty_label: 'SAMPLED QTY. :',
    sampled_qty: rec.sampled_qty || '',
    mfg_date_label: 'MFG. DATE :',
    mfg_date: rec.mfg_date || '',
    exp_date_label: 'EXP. DATE/BEST BEFORE :',
    exp_best_before: rec.exp_best_before || rec.expiry_date || rec.exp_years || '',
    test_heading: 'TEST TO BE PERFORMED :',
    tests_line: '1) BULK : Appearance / Odor / Wt.per ml / % Moisture/ Viscosity / Acid Value / Peroxide Value / Saponification Value / Iodine Value',
    sign_production_label: 'Sign By / Date (Production) :',
    sign_production: rec.sign_production || rec.chemist_name || '',
    received_qa_label: 'Received By / Date (QA)',
    received_qa: rec.received_qa || rec.qc_head_name || '',
    sampled_qa_label: 'Sampled By / Date (QA) :',
    sampled_qa: rec.sampled_qa || '',
    received_qc_label: 'Received By / Date (QC)',
    received_qc: rec.received_qc || '',
    bottom_label: 'BULK',
  }
}

function OilTrTable({ data, onChange, isEditable = true, branding = {} }) {
  const update = (field, val) => {
    if (isEditable && onChange) {
      onChange({ ...data, [field]: val })
    }
  }

  const logoSrc = branding?.isTej ? branding.logoSrc : cmhpLogo
  const companyTitle = branding?.isTej ? branding.headerName : (data.header_title || 'CMHP PRIVATE LIMITED')

  return (
    <table className="tablet-tr-table">
      <colgroup>
        <col style={{ width: '27%' }} />
        <col style={{ width: '31%' }} />
        <col style={{ width: '25%' }} />
        <col style={{ width: '17%' }} />
      </colgroup>
      <tbody>
        {/* ROW 1: Header Logo + Company */}
        <tr>
          <td colSpan={4} className="tablet-tr-header-cell">
            <div className="tablet-tr-header-inner">
              <div className="tablet-tr-logo-wrap">
                <img src={logoSrc} alt="CMHP Logo" className="tablet-tr-logo-img" />
              </div>
              <div className="tablet-tr-company-title">
                <QcSlipText
                  value={companyTitle}
                  onChange={(v) => update('header_title', v)}
                  readOnly={!isEditable}
                  style={{ fontSize: '17pt', fontWeight: 700, textAlign: 'center', width: '90%' }}
                />
              </div>
            </div>
          </td>
        </tr>

        {/* ROW 2: PRODUCTION (only this word, no attachment number) */}
        <tr>
          <td colSpan={4} className="tablet-tr-center-cell" style={{ fontWeight: 700, fontSize: '11.5pt' }}>
            <QcSlipText
              value={data.header_subtitle || 'PRODUCTION'}
              onChange={(v) => update('header_subtitle', v)}
              readOnly={!isEditable}
              style={{ textAlign: 'center', fontWeight: 700, width: '100%' }}
            />
          </td>
        </tr>

        {/* ROW 3: TEST REQUEST (BULK ) | TR NO / DATE */}
        <tr>
          <td colSpan={2} className="tablet-tr-center-cell" style={{ fontWeight: 700, fontSize: '11pt', borderRight: '1px solid #000' }}>
            <QcSlipText
              value={data.slip_name || 'TEST REQUEST (BULK )'}
              onChange={(v) => update('slip_name', v)}
              readOnly={!isEditable}
              style={{ textAlign: 'center', fontWeight: 700, width: '95%' }}
            />
          </td>
          <td colSpan={2} style={{ padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '3px 8px', borderBottom: '1px solid #000', fontWeight: 700, fontSize: '10.5pt' }}>
                    <QcSlipText
                      value={data.tr_no_label || 'TR NO :'}
                      onChange={(v) => update('tr_no_label', v)}
                      readOnly={!isEditable}
                      style={{ width: '70px', fontWeight: 700 }}
                    />
                    <QcSlipInput
                      value={data.tr_no || ''}
                      onChange={(v) => update('tr_no', v)}
                      readOnly={!isEditable}
                      style={{ width: '65%' }}
                    />
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '3px 8px', fontWeight: 700, fontSize: '10.5pt' }}>
                    <QcSlipText
                      value={data.date_label || 'DATE:'}
                      onChange={(v) => update('date_label', v)}
                      readOnly={!isEditable}
                      style={{ width: '70px', fontWeight: 700 }}
                    />
                    <QcSlipInput
                      value={data.date || ''}
                      onChange={(v) => update('date', v)}
                      readOnly={!isEditable}
                      style={{ width: '65%' }}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>

        {/* ROW 4: DEPARTMENT | FORM NO */}
        <tr>
          <td className="tablet-tr-lbl-cell">
            <QcSlipText
              value={data.department_label || 'DEPARTMENT :'}
              onChange={(v) => update('department_label', v)}
              readOnly={!isEditable}
              style={{ fontWeight: 700 }}
            />
          </td>
          <td className="tablet-tr-val-cell" style={{ borderRight: '1px solid #000' }}>
            <QcSlipInput
              value={data.department || ''}
              onChange={(v) => update('department', v)}
              readOnly={!isEditable}
              style={{ width: '100%' }}
            />
          </td>
          <td colSpan={2} className="tablet-tr-lbl-cell" style={{ fontSize: '10pt', fontWeight: 700 }}>
            <QcSlipText
              value={data.form_no || 'FORM NO.: SOP/QA/04/F-03/00'}
              onChange={(v) => update('form_no', v)}
              readOnly={!isEditable}
              style={{ width: '100%', fontWeight: 700 }}
            />
          </td>
        </tr>

        {/* ROW 5: PRODUCT full width */}
        <tr>
          <td className="tablet-tr-lbl-cell">
            <QcSlipText
              value={data.product_label || 'PRODUCT :'}
              onChange={(v) => update('product_label', v)}
              readOnly={!isEditable}
              style={{ fontWeight: 700 }}
            />
          </td>
          <td colSpan={3} className="tablet-tr-val-cell">
            <QcSlipInput
              value={data.product || ''}
              onChange={(v) => update('product', v)}
              readOnly={!isEditable}
              style={{ width: '100%', fontWeight: 700 }}
            />
          </td>
        </tr>

        {/* ROW 6: PRODUCT CODE | BATCH NO */}
        <tr>
          <td className="tablet-tr-lbl-cell">
            <QcSlipText
              value={data.product_code_label || 'PRODUCT CODE :'}
              onChange={(v) => update('product_code_label', v)}
              readOnly={!isEditable}
              style={{ fontWeight: 700 }}
            />
          </td>
          <td className="tablet-tr-val-cell" style={{ borderRight: '1px solid #000' }}>
            <QcSlipInput
              value={data.product_code || ''}
              onChange={(v) => update('product_code', v)}
              readOnly={!isEditable}
              style={{ width: '100%' }}
            />
          </td>
          <td className="tablet-tr-lbl-cell">
            <QcSlipText
              value={data.batch_no_label || 'BATCH NO. :'}
              onChange={(v) => update('batch_no_label', v)}
              readOnly={!isEditable}
              style={{ fontWeight: 700 }}
            />
          </td>
          <td className="tablet-tr-val-cell">
            <QcSlipInput
              value={data.batch_no || ''}
              onChange={(v) => update('batch_no', v)}
              readOnly={!isEditable}
              style={{ width: '100%', fontWeight: 700 }}
            />
          </td>
        </tr>

        {/* ROW 7: BATCH SIZE | SAMPLED QTY */}
        <tr>
          <td className="tablet-tr-lbl-cell">
            <QcSlipText
              value={data.batch_size_label || 'BATCH SIZE :'}
              onChange={(v) => update('batch_size_label', v)}
              readOnly={!isEditable}
              style={{ fontWeight: 700 }}
            />
          </td>
          <td className="tablet-tr-val-cell" style={{ borderRight: '1px solid #000' }}>
            <QcSlipInput
              value={data.batch_size || ''}
              onChange={(v) => update('batch_size', v)}
              readOnly={!isEditable}
              style={{ width: '100%' }}
            />
          </td>
          <td className="tablet-tr-lbl-cell">
            <QcSlipText
              value={data.sampled_qty_label || 'SAMPLED QTY. :'}
              onChange={(v) => update('sampled_qty_label', v)}
              readOnly={!isEditable}
              style={{ fontWeight: 700 }}
            />
          </td>
          <td className="tablet-tr-val-cell">
            <QcSlipInput
              value={data.sampled_qty || ''}
              onChange={(v) => update('sampled_qty', v)}
              readOnly={!isEditable}
              style={{ width: '100%' }}
            />
          </td>
        </tr>

        {/* ROW 8: MFG DATE | EXP DATE */}
        <tr>
          <td className="tablet-tr-lbl-cell">
            <QcSlipText
              value={data.mfg_date_label || 'MFG. DATE :'}
              onChange={(v) => update('mfg_date_label', v)}
              readOnly={!isEditable}
              style={{ fontWeight: 700 }}
            />
          </td>
          <td className="tablet-tr-val-cell" style={{ borderRight: '1px solid #000' }}>
            <QcSlipInput
              value={data.mfg_date || ''}
              onChange={(v) => update('mfg_date', v)}
              readOnly={!isEditable}
              style={{ width: '100%' }}
            />
          </td>
          <td colSpan={2} className="tablet-tr-lbl-cell">
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <QcSlipText
                value={data.exp_date_label || 'EXP. DATE/BEST BEFORE :'}
                onChange={(v) => update('exp_date_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, whiteSpace: 'nowrap', marginRight: 4 }}
              />
              <QcSlipInput
                value={data.exp_best_before || ''}
                onChange={(v) => update('exp_best_before', v)}
                readOnly={!isEditable}
                style={{ flex: 1 }}
              />
            </div>
          </td>
        </tr>

        {/* ROW 9: TEST TO BE PERFORMED */}
        <tr>
          <td colSpan={4} className="tablet-tr-lbl-cell" style={{ padding: '4px 8px', fontWeight: 700 }}>
            <QcSlipText
              value={data.test_heading || 'TEST TO BE PERFORMED :'}
              onChange={(v) => update('test_heading', v)}
              readOnly={!isEditable}
              style={{ fontWeight: 700 }}
            />
          </td>
        </tr>

        {/* ROW 10: Oil Bulk test list */}
        <tr>
          <td colSpan={4} style={{ padding: '6px 12px', fontSize: '9pt', lineHeight: 1.35 }}>
            <QcSlipText
              value={data.tests_line || '1) BULK : Appearance / Odor / Wt.per ml / % Moisture/ Viscosity / Acid Value / Peroxide Value / Saponification Value / Iodine Value'}
              onChange={(v) => update('tests_line', v)}
              readOnly={!isEditable}
              style={{ width: '100%', fontSize: '9pt' }}
            />
          </td>
        </tr>

        {/* ROW 11: Sign Production | Received QA */}
        <tr>
          <td colSpan={2} className="tablet-tr-sign-cell" style={{ borderRight: '1px solid #000' }}>
            <QcSlipText
              value={data.sign_production_label || 'Sign By / Date (Production) :'}
              onChange={(v) => update('sign_production_label', v)}
              readOnly={!isEditable}
              style={{ fontWeight: 700, marginRight: 4, whiteSpace: 'nowrap' }}
            />
            <QcSlipInput
              value={data.sign_production || ''}
              onChange={(v) => update('sign_production', v)}
              readOnly={!isEditable}
              style={{ flex: 1 }}
            />
          </td>
          <td colSpan={2} className="tablet-tr-sign-cell">
            <QcSlipText
              value={data.received_qa_label || 'Received By / Date (QA)'}
              onChange={(v) => update('received_qa_label', v)}
              readOnly={!isEditable}
              style={{ fontWeight: 700, marginRight: 4, whiteSpace: 'nowrap' }}
            />
            <QcSlipInput
              value={data.received_qa || ''}
              onChange={(v) => update('received_qa', v)}
              readOnly={!isEditable}
              style={{ flex: 1 }}
            />
          </td>
        </tr>

        {/* ROW 12: Sampled QA | Received QC */}
        <tr>
          <td colSpan={2} className="tablet-tr-sign-cell" style={{ borderRight: '1px solid #000' }}>
            <QcSlipText
              value={data.sampled_qa_label || 'Sampled By / Date (QA) :'}
              onChange={(v) => update('sampled_qa_label', v)}
              readOnly={!isEditable}
              style={{ fontWeight: 700, marginRight: 4, whiteSpace: 'nowrap' }}
            />
            <QcSlipInput
              value={data.sampled_qa || ''}
              onChange={(v) => update('sampled_qa', v)}
              readOnly={!isEditable}
              style={{ flex: 1 }}
            />
          </td>
          <td colSpan={2} className="tablet-tr-sign-cell">
            <QcSlipText
              value={data.received_qc_label || 'Received By / Date (QC)'}
              onChange={(v) => update('received_qc_label', v)}
              readOnly={!isEditable}
              style={{ fontWeight: 700, marginRight: 4, whiteSpace: 'nowrap' }}
            />
            <QcSlipInput
              value={data.received_qc || ''}
              onChange={(v) => update('received_qc', v)}
              readOnly={!isEditable}
              style={{ flex: 1 }}
            />
          </td>
        </tr>

        {/* ROW 13: BULK bottom label */}
        <tr>
          <td colSpan={4} className="tablet-tr-center-cell" style={{ padding: '6px 10px', fontSize: '11pt', fontWeight: 700, borderBottom: 'none' }}>
            <QcSlipText
              value={data.bottom_label || 'BULK'}
              onChange={(v) => update('bottom_label', v)}
              readOnly={!isEditable}
              style={{ textAlign: 'center', fontWeight: 700, width: '100%' }}
            />
          </td>
        </tr>

      </tbody>
    </table>
  )
}

export default function OilTestRequestBulkSlip({
  data = {},
  onChange,
  branding = {},
}) {
  return (
    <div className="tablet-tr-page cmhp-printable-slip">
      {/* Copy 1: Screen & Print Top Copy */}
      <div className="tablet-tr-sheet">
        <OilTrTable
          data={data}
          onChange={onChange}
          isEditable={true}
          branding={branding}
        />
      </div>

      {/* Copy 2: Print/PDF Stacked Second Copy */}
      <div className="tablet-tr-copy-gap print-only-copy" />
      <div className="tablet-tr-sheet print-only-copy">
        <OilTrTable
          data={data}
          onChange={onChange}
          isEditable={false}
          branding={branding}
        />
      </div>
    </div>
  )
}
