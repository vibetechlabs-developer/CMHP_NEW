import React from 'react'
import cmhpLogo from '../../../assets/cmhp_invoice_logo.png'
import { QcSlipInput, QcSlipText } from './QcSlipEditable'
import './TabletQcSlip.css'

export function getInitialTabletTestRequestBulkData(rec = {}, defaults = {}) {
  return {
    header_title: defaults.header_title || 'CMHP PRIVATE LIMITED',
    header_subtitle: defaults.header_subtitle || 'PRODUCTION  (ATTACHMENT - 2)',
    slip_name: defaults.slip_name || 'TEST REQUEST (BULK )',
    tr_no_label: 'TR NO :',
    tr_no: rec.tr_no || rec.ar_no || '',
    date_label: 'DATE:',
    date: rec.date || rec.test_date || new Date().toISOString().split('T')[0],
    department_label: 'DEPARTMENT :',
    department: rec.department || 'TABLET',
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
    tests_line_1: '1) BULK : Description / Avg. weight of tablet / Weight of 20 tablets / Diameter/ Thickness /',
    tests_line_2: 'Loss on Drying / Total Ash',
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

function TabletTrTable({ data, onChange, isEditable = true, branding = {} }) {
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

        {/* ROW 2: PRODUCTION  (ATTACHMENT - 2) */}
        <tr>
          <td colSpan={4} className="tablet-tr-center-cell" style={{ fontWeight: 700, fontSize: '11.5pt' }}>
            <QcSlipText
              value={data.header_subtitle || 'PRODUCTION  (ATTACHMENT - 2)'}
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
                      style={{ width: 'calc(100% - 75px)' }}
                      readOnly={!isEditable}
                    />
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '3px 8px', fontWeight: 700, fontSize: '10.5pt' }}>
                    <QcSlipText
                      value={data.date_label || 'DATE:'}
                      onChange={(v) => update('date_label', v)}
                      readOnly={!isEditable}
                      style={{ width: '60px', fontWeight: 700 }}
                    />
                    <QcSlipInput
                      value={data.date || ''}
                      onChange={(v) => update('date', v)}
                      style={{ width: 'calc(100% - 65px)' }}
                      readOnly={!isEditable}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>

        {/* ROW 4: DEPARTMENT : | FORM NO.: SOP/QA/04/F-03/00 */}
        <tr>
          <td className="tablet-tr-lbl-cell" style={{ borderRight: 'none' }}>
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
              style={{ width: '100%' }}
              readOnly={!isEditable}
            />
          </td>
          <td colSpan={2} className="tablet-tr-lbl-cell" style={{ fontSize: '10pt', fontWeight: 700 }}>
            <QcSlipText
              value={data.form_no || 'FORM NO.: SOP/QA/04/F-03/00'}
              onChange={(v) => update('form_no', v)}
              readOnly={!isEditable}
              style={{ fontWeight: 700, width: '100%' }}
            />
          </td>
        </tr>

        {/* ROW 5: PRODUCT : */}
        <tr>
          <td className="tablet-tr-lbl-cell" style={{ borderRight: 'none' }}>
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
              style={{ width: '100%' }}
              readOnly={!isEditable}
            />
          </td>
        </tr>

        {/* ROW 6: PRODUCT CODE : | BATCH NO. : */}
        <tr>
          <td className="tablet-tr-lbl-cell" style={{ borderRight: 'none' }}>
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
              style={{ width: '100%' }}
              readOnly={!isEditable}
            />
          </td>
          <td className="tablet-tr-lbl-cell" style={{ borderRight: 'none' }}>
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
              style={{ width: '100%' }}
              readOnly={!isEditable}
            />
          </td>
        </tr>

        {/* ROW 7: BATCH SIZE : | SAMPLED QTY. : */}
        <tr>
          <td className="tablet-tr-lbl-cell" style={{ borderRight: 'none' }}>
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
              style={{ width: '100%' }}
              readOnly={!isEditable}
            />
          </td>
          <td className="tablet-tr-lbl-cell" style={{ borderRight: 'none' }}>
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
              style={{ width: '100%' }}
              readOnly={!isEditable}
            />
          </td>
        </tr>

        {/* ROW 8: MFG. DATE : | EXP. DATE/BEST BEFORE : */}
        <tr>
          <td className="tablet-tr-lbl-cell" style={{ borderRight: 'none' }}>
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
              style={{ width: '100%' }}
              readOnly={!isEditable}
            />
          </td>
          <td colSpan={2} className="tablet-tr-lbl-cell" style={{ display: 'flex', alignItems: 'center' }}>
            <QcSlipText
              value={data.exp_date_label || 'EXP. DATE/BEST BEFORE :'}
              onChange={(v) => update('exp_date_label', v)}
              readOnly={!isEditable}
              style={{ fontWeight: 700, marginRight: 4 }}
            />
            <QcSlipInput
              value={data.exp_best_before || ''}
              onChange={(v) => update('exp_best_before', v)}
              style={{ flex: 1, minWidth: 40 }}
              readOnly={!isEditable}
            />
          </td>
        </tr>

        {/* ROW 9: TEST TO BE PERFORMED : */}
        <tr>
          <td colSpan={4} className="tablet-tr-center-cell" style={{ fontWeight: 700, fontSize: '11pt', padding: '4px 8px' }}>
            <QcSlipText
              value={data.test_heading || 'TEST TO BE PERFORMED :'}
              onChange={(v) => update('test_heading', v)}
              readOnly={!isEditable}
              style={{ textAlign: 'center', fontWeight: 700, width: '100%' }}
            />
          </td>
        </tr>

        {/* ROW 10: Tests text */}
        <tr>
          <td colSpan={4} className="tablet-tr-tests-cell">
            <div>
              <QcSlipText
                value={data.tests_line_1 || '1) BULK : Description / Avg. weight of tablet / Weight of 20 tablets / Diameter/ Thickness /'}
                onChange={(v) => update('tests_line_1', v)}
                readOnly={!isEditable}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ paddingLeft: '56px' }}>
              <QcSlipText
                value={data.tests_line_2 || 'Loss on Drying / Total Ash'}
                onChange={(v) => update('tests_line_2', v)}
                readOnly={!isEditable}
                style={{ width: '60%' }}
              />
            </div>
          </td>
        </tr>

        {/* ROW 11: Sign By / Date (Production) : | Received By / Date (QA) */}
        <tr>
          <td colSpan={2} className="tablet-tr-sign-cell" style={{ borderRight: '1px solid #000' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <QcSlipText
                value={data.sign_production_label || 'Sign By / Date (Production) :'}
                onChange={(v) => update('sign_production_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, marginRight: 4 }}
              />
              <QcSlipInput
                value={data.sign_production || ''}
                onChange={(v) => update('sign_production', v)}
                style={{ flex: 1 }}
                readOnly={!isEditable}
              />
            </div>
          </td>
          <td colSpan={2} className="tablet-tr-sign-cell">
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <QcSlipText
                value={data.received_qa_label || 'Received By / Date (QA)'}
                onChange={(v) => update('received_qa_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, marginRight: 4 }}
              />
              <QcSlipInput
                value={data.received_qa || ''}
                onChange={(v) => update('received_qa', v)}
                style={{ flex: 1 }}
                readOnly={!isEditable}
              />
            </div>
          </td>
        </tr>

        {/* ROW 12: Sampled By / Date (QA) : | Received By / Date (QC) */}
        <tr>
          <td colSpan={2} className="tablet-tr-sign-cell" style={{ borderRight: '1px solid #000' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <QcSlipText
                value={data.sampled_qa_label || 'Sampled By / Date (QA) :'}
                onChange={(v) => update('sampled_qa_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, marginRight: 4 }}
              />
              <QcSlipInput
                value={data.sampled_qa || ''}
                onChange={(v) => update('sampled_qa', v)}
                style={{ flex: 1 }}
                readOnly={!isEditable}
              />
            </div>
          </td>
          <td colSpan={2} className="tablet-tr-sign-cell">
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <QcSlipText
                value={data.received_qc_label || 'Received By / Date (QC)'}
                onChange={(v) => update('received_qc_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, marginRight: 4 }}
              />
              <QcSlipInput
                value={data.received_qc || ''}
                onChange={(v) => update('received_qc', v)}
                style={{ flex: 1 }}
                readOnly={!isEditable}
              />
            </div>
          </td>
        </tr>

        {/* ROW 13: BULK bottom label */}
        <tr>
          <td colSpan={4} className="tablet-tr-center-cell" style={{ fontWeight: 700, fontSize: '12pt', letterSpacing: '1px' }}>
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

export default function TabletTestRequestBulkSlip({
  data = {},
  onChange,
  branding = {},
}) {
  return (
    <div className="tablet-tr-page cmhp-printable-slip">
      {/* Copy 1: Shown on screen (Editable) & in print/PDF */}
      <div className="tablet-tr-sheet">
        <TabletTrTable data={data} onChange={onChange} isEditable={true} branding={branding} />
      </div>

      {/* Copy 2: Hidden on screen, shown in print / PDF (Mirror with same values) */}
      <div className="tablet-tr-copy-gap print-only-copy" />
      <div className="tablet-tr-sheet print-only-copy">
        <TabletTrTable data={data} onChange={onChange} isEditable={false} branding={branding} />
      </div>
    </div>
  )
}
