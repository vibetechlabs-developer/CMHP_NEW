import React from 'react'
import cmhpLogo from '../../../assets/cmhp_invoice_logo.png'
import { QcSlipInput, QcSlipText } from './QcSlipEditable'
import './TabletQcSlip.css'

export function getInitialSyrupBulkReleaseData(rec = {}, defaults = {}) {
  return {
    header_title: defaults.header_title || 'CMHP PRIVATE LIMITED',
    qc_heading: defaults.qc_heading || 'QUALITY CONTROL',
    slip_name: defaults.slip_name || 'BULK  RELEASE SLIP',
    attachment_label: defaults.attachment_label || 'Attachment-3',
    to_department_label: 'TO DEPARTMENT               :',
    to_department: rec.to_department || 'PRODUCTION',
    form_no: defaults.form_no || 'FORM NO.: SOP/QC/03/F-02/00',
    product_label: 'PRODUCT                               :',
    product: rec.product || rec.material_name || '',
    tr_no_label: 'T.R. No.:',
    tr_no: rec.tr_no || rec.ar_no || '',
    batch_no_label: 'BATCH NO.                             :',
    batch_no: rec.batch_no || '',
    mfg_date_label: 'MFG. DATE                            :',
    mfg_date: rec.mfg_date || '',
    exp_date_label: 'EXP. DATE/BEST BEFORE :',
    exp_years: rec.exp_years ? (String(rec.exp_years).length === 1 ? `0${rec.exp_years}` : String(rec.exp_years)) : (rec.expiry_date ? (String(rec.expiry_date).length === 1 ? `0${rec.expiry_date}` : String(rec.expiry_date)) : '05'),
    exp_years_suffix: 'Years',
    batch_size_label: 'BATCH SIZE                          :',
    batch_size: rec.batch_size ? String(rec.batch_size) : '',
    batch_qty_label: 'BATCH QTY.   :',
    batch_qty: rec.batch_qty || '',
    batch_qty_unit: 'LTR',
    no_of_cont_label: 'NO. OF CONT.                       :',
    no_of_cont: rec.no_of_cont || '',
    test_heading: 'TEST RESULTS',

    // 4 Syrup tests from ATTACHMENT_3__3_.docx
    test_desc_name: '•  Description:',
    test_desc_obs: rec.appearance_obs || rec.test_desc_obs || '',
    test_desc_limit_lbl: '(Limit:',
    test_desc_limit: rec.appearance_limit || rec.test_desc_limit || '',

    test_ph_name: '•  pH:',
    test_ph_obs: rec.test_ph_obs || '',
    test_ph_limit_lbl: '(Limit:',
    test_ph_low: rec.test_ph_low || '',
    test_ph_to: 'to',
    test_ph_high: rec.test_ph_high || '',

    test_wt_ml_name: '• Wt/ml :',
    test_wt_ml_obs: rec.wt_ml_obs || rec.test_wt_ml_obs || '',
    test_wt_ml_limit_lbl: '(Limit:',
    test_wt_ml_low: rec.test_wt_ml_low || '',
    test_wt_ml_to: 'to',
    test_wt_ml_high: rec.test_wt_ml_high || '',
    test_wt_ml_unit: 'gm/ml',

    test_alcohol_name: '• Alcohol :',
    test_alcohol_obs: rec.test_alcohol_obs || '',
    test_alcohol_limit_lbl: '(Limit:',
    test_alcohol_low: rec.test_alcohol_low || '',
    test_alcohol_to: 'to',
    test_alcohol_high: rec.test_alcohol_high || '',
    test_alcohol_unit: '%',

    sign_qc_label: 'Sign By / Date (QC)   :',
    sign_qc: rec.sign_qc || rec.chemist_name || '',
    received_qa_label: 'Recieved By / Date (QA)         :',
    received_qa: rec.received_qa || rec.qc_head_name || '',

    status_line: 'Status : The above batch of Bulk sample is released for filling / compression.',

    sign_qa_label: 'Sign By./ Date (QA) :',
    sign_qa: rec.sign_qa || rec.qa_name || '',
    received_production_label: 'Received By / Date ( Production)',
    received_production: rec.received_production || '',
  }
}

export default function SyrupBulkReleaseSlip({
  data = {},
  onChange,
  branding = {},
}) {
  const update = (field, val) => {
    if (onChange) {
      onChange({ ...data, [field]: val })
    }
  }

  const logoSrc = branding?.isTej ? branding.logoSrc : cmhpLogo
  const companyTitle = branding?.isTej ? branding.headerName : (data.header_title || 'CMHP PRIVATE LIMITED')

  return (
    <div className="tablet-br-sheet cmhp-printable-slip">

      {/* 1. Header Box: Logo at top left, Company centered */}
      <div className="tablet-br-top-box">
        <div className="tablet-br-header-row">
          <div className="tablet-br-logo-wrap">
            <img src={logoSrc} alt="CMHP Logo" className="tablet-br-logo-img" />
          </div>
          <div className="tablet-br-company-title">
            <QcSlipText
              value={companyTitle}
              onChange={(v) => update('header_title', v)}
              style={{ fontSize: '18pt', fontWeight: 700, textAlign: 'center', width: '90%' }}
            />
          </div>
        </div>
      </div>

      {/* 2. QUALITY CONTROL */}
      <div className="tablet-br-qc-row">
        <QcSlipText
          value={data.qc_heading || 'QUALITY CONTROL'}
          onChange={(v) => update('qc_heading', v)}
          style={{ textAlign: 'center', fontWeight: 700, width: '100%' }}
        />
      </div>

      {/* 3. BULK  RELEASE SLIP | Attachment-3 */}
      <div className="tablet-br-title-row">
        <div className="tablet-br-title-center">
          <QcSlipText
            value={data.slip_name || 'BULK  RELEASE SLIP'}
            onChange={(v) => update('slip_name', v)}
            style={{ textAlign: 'center', fontWeight: 700, width: '90%' }}
          />
        </div>
        <div className="tablet-br-title-right">
          <QcSlipText
            value={data.attachment_label || 'Attachment-3'}
            onChange={(v) => update('attachment_label', v)}
            style={{ fontWeight: 700, width: '140px', textAlign: 'right' }}
          />
        </div>
      </div>

      {/* 4. TO DEPARTMENT : | FORM NO.: SOP/QC/03/F-02/00 */}
      <div className="tablet-br-todep-row">
        <div className="tablet-br-todep-left">
          <QcSlipText
            value={data.to_department_label || 'TO DEPARTMENT               :'}
            onChange={(v) => update('to_department_label', v)}
            style={{ fontWeight: 700, minWidth: '185px' }}
          />
          <QcSlipInput
            value={data.to_department || ''}
            onChange={(v) => update('to_department', v)}
            style={{ flex: 1 }}
          />
        </div>
        <div className="tablet-br-todep-right">
          <QcSlipText
            value={data.form_no || 'FORM NO.: SOP/QC/03/F-02/00'}
            onChange={(v) => update('form_no', v)}
            style={{ fontWeight: 700, width: '100%' }}
          />
        </div>
      </div>

      {/* 5. PRODUCT : | T.R. No.: */}
      <div className="tablet-br-open-row">
        <QcSlipText
          value={data.product_label || 'PRODUCT                               :'}
          onChange={(v) => update('product_label', v)}
          style={{ fontWeight: 700, minWidth: '185px' }}
        />
        <QcSlipInput
          value={data.product || ''}
          onChange={(v) => update('product', v)}
          style={{ flex: 1, marginRight: 16 }}
        />
        <QcSlipText
          value={data.tr_no_label || 'T.R. No.:'}
          onChange={(v) => update('tr_no_label', v)}
          style={{ fontWeight: 700, width: '70px' }}
        />
        <QcSlipInput
          value={data.tr_no || ''}
          onChange={(v) => update('tr_no', v)}
          style={{ width: 140 }}
        />
      </div>

      {/* 6. BATCH NO. : */}
      <div className="tablet-br-open-row">
        <QcSlipText
          value={data.batch_no_label || 'BATCH NO.                             :'}
          onChange={(v) => update('batch_no_label', v)}
          style={{ fontWeight: 700, minWidth: '185px' }}
        />
        <QcSlipInput
          value={data.batch_no || ''}
          onChange={(v) => update('batch_no', v)}
          style={{ flex: 1 }}
        />
      </div>

      {/* 7. MFG. DATE : | EXP. DATE/BEST BEFORE : 05 Years */}
      <div className="tablet-br-open-row">
        <QcSlipText
          value={data.mfg_date_label || 'MFG. DATE                            :'}
          onChange={(v) => update('mfg_date_label', v)}
          style={{ fontWeight: 700, minWidth: '185px' }}
        />
        <QcSlipInput
          value={data.mfg_date || ''}
          onChange={(v) => update('mfg_date', v)}
          style={{ flex: 1, marginRight: 16 }}
        />
        <QcSlipText
          value={data.exp_date_label || 'EXP. DATE/BEST BEFORE :'}
          onChange={(v) => update('exp_date_label', v)}
          style={{ fontWeight: 700, width: '185px' }}
        />
        <QcSlipInput
          value={data.exp_years || ''}
          onChange={(v) => update('exp_years', v)}
          style={{ width: 50, textAlign: 'center', marginLeft: 4 }}
        />
        <QcSlipText
          value={data.exp_years_suffix || 'Years'}
          onChange={(v) => update('exp_years_suffix', v)}
          style={{ width: 50, marginLeft: 6, fontWeight: 700 }}
        />
      </div>

      {/* 8. BATCH SIZE : | BATCH QTY. : ___ LTR */}
      <div className="tablet-br-open-row">
        <QcSlipText
          value={data.batch_size_label || 'BATCH SIZE                          :'}
          onChange={(v) => update('batch_size_label', v)}
          style={{ fontWeight: 700, minWidth: '185px' }}
        />
        <QcSlipInput
          value={data.batch_size || ''}
          onChange={(v) => update('batch_size', v)}
          style={{ flex: 1, marginRight: 16 }}
        />
        <QcSlipText
          value={data.batch_qty_label || 'BATCH QTY.   :'}
          onChange={(v) => update('batch_qty_label', v)}
          style={{ fontWeight: 700, width: '110px' }}
        />
        <QcSlipInput
          value={data.batch_qty || ''}
          onChange={(v) => update('batch_qty', v)}
          style={{ width: 100, textAlign: 'center', marginLeft: 4 }}
        />
        <QcSlipText
          value={data.batch_qty_unit || 'LTR'}
          onChange={(v) => update('batch_qty_unit', v)}
          style={{ width: 45, marginLeft: 6, fontWeight: 700 }}
        />
      </div>

      {/* 9. NO. OF CONT. : */}
      <div className="tablet-br-open-row">
        <QcSlipText
          value={data.no_of_cont_label || 'NO. OF CONT.                       :'}
          onChange={(v) => update('no_of_cont_label', v)}
          style={{ fontWeight: 700, minWidth: '185px' }}
        />
        <QcSlipInput
          value={data.no_of_cont || ''}
          onChange={(v) => update('no_of_cont', v)}
          style={{ flex: 1 }}
        />
      </div>

      {/* 10. TEST RESULTS (4 SYRUP TESTS) */}
      <div className="tablet-br-tests-box">
        <div className="tablet-br-tests-head">
          <QcSlipText
            value={data.test_heading || 'TEST RESULTS'}
            onChange={(v) => update('test_heading', v)}
            style={{ fontWeight: 700, width: '180px' }}
          />
        </div>

        {/* 1. Description */}
        <div className="tablet-br-test-item">
          <div className="tablet-br-test-name">
            <QcSlipText
              value={data.test_desc_name || '•  Description:'}
              onChange={(v) => update('test_desc_name', v)}
              style={{ fontWeight: 700, width: '100%' }}
            />
          </div>
          <div className="tablet-br-test-obs-wrap">
            <QcSlipInput
              value={data.test_desc_obs || ''}
              onChange={(v) => update('test_desc_obs', v)}
              style={{ width: '90%' }}
            />
          </div>
          <div className="tablet-br-test-limit-wrap">
            <QcSlipText
              value={data.test_desc_limit_lbl || '(Limit:'}
              onChange={(v) => update('test_desc_limit_lbl', v)}
              style={{ fontWeight: 700, width: '50px' }}
            />
            <QcSlipInput
              value={data.test_desc_limit || ''}
              onChange={(v) => update('test_desc_limit', v)}
              style={{ flex: 1, marginLeft: 4 }}
            />
            <span style={{ fontWeight: 700, marginLeft: 4 }}>)</span>
          </div>
        </div>

        {/* 2. pH */}
        <div className="tablet-br-test-item">
          <div className="tablet-br-test-name">
            <QcSlipText
              value={data.test_ph_name || '•  pH:'}
              onChange={(v) => update('test_ph_name', v)}
              style={{ fontWeight: 700, width: '100%' }}
            />
          </div>
          <div className="tablet-br-test-obs-wrap">
            <QcSlipInput
              value={data.test_ph_obs || ''}
              onChange={(v) => update('test_ph_obs', v)}
              style={{ width: '90%' }}
            />
          </div>
          <div className="tablet-br-test-limit-wrap">
            <QcSlipText
              value={data.test_ph_limit_lbl || '(Limit:'}
              onChange={(v) => update('test_ph_limit_lbl', v)}
              style={{ fontWeight: 700, width: '50px' }}
            />
            <QcSlipInput
              value={data.test_ph_low || ''}
              onChange={(v) => update('test_ph_low', v)}
              style={{ width: 55, textAlign: 'center', marginLeft: 4 }}
            />
            <QcSlipText
              value={data.test_ph_to || 'to'}
              onChange={(v) => update('test_ph_to', v)}
              style={{ width: 25, textAlign: 'center', margin: '0 4px', fontWeight: 700 }}
            />
            <QcSlipInput
              value={data.test_ph_high || ''}
              onChange={(v) => update('test_ph_high', v)}
              style={{ width: 55, textAlign: 'center' }}
            />
            <span style={{ fontWeight: 700, marginLeft: 4 }}>)</span>
          </div>
        </div>

        {/* 3. Wt/ml */}
        <div className="tablet-br-test-item">
          <div className="tablet-br-test-name">
            <QcSlipText
              value={data.test_wt_ml_name || '• Wt/ml :'}
              onChange={(v) => update('test_wt_ml_name', v)}
              style={{ fontWeight: 700, width: '100%' }}
            />
          </div>
          <div className="tablet-br-test-obs-wrap">
            <QcSlipInput
              value={data.test_wt_ml_obs || ''}
              onChange={(v) => update('test_wt_ml_obs', v)}
              style={{ width: '90%' }}
            />
          </div>
          <div className="tablet-br-test-limit-wrap">
            <QcSlipText
              value={data.test_wt_ml_limit_lbl || '(Limit:'}
              onChange={(v) => update('test_wt_ml_limit_lbl', v)}
              style={{ fontWeight: 700, width: '50px' }}
            />
            <QcSlipInput
              value={data.test_wt_ml_low || ''}
              onChange={(v) => update('test_wt_ml_low', v)}
              style={{ width: 55, textAlign: 'center', marginLeft: 4 }}
            />
            <QcSlipText
              value={data.test_wt_ml_to || 'to'}
              onChange={(v) => update('test_wt_ml_to', v)}
              style={{ width: 25, textAlign: 'center', margin: '0 4px', fontWeight: 700 }}
            />
            <QcSlipInput
              value={data.test_wt_ml_high || ''}
              onChange={(v) => update('test_wt_ml_high', v)}
              style={{ width: 55, textAlign: 'center' }}
            />
            <QcSlipText
              value={data.test_wt_ml_unit || 'gm/ml'}
              onChange={(v) => update('test_wt_ml_unit', v)}
              style={{ width: 55, marginLeft: 6, fontWeight: 700 }}
            />
            <span style={{ fontWeight: 700, marginLeft: 4 }}>)</span>
          </div>
        </div>

        {/* 4. Alcohol */}
        <div className="tablet-br-test-item">
          <div className="tablet-br-test-name">
            <QcSlipText
              value={data.test_alcohol_name || '• Alcohol :'}
              onChange={(v) => update('test_alcohol_name', v)}
              style={{ fontWeight: 700, width: '100%' }}
            />
          </div>
          <div className="tablet-br-test-obs-wrap">
            <QcSlipInput
              value={data.test_alcohol_obs || ''}
              onChange={(v) => update('test_alcohol_obs', v)}
              style={{ width: '90%' }}
            />
          </div>
          <div className="tablet-br-test-limit-wrap">
            <QcSlipText
              value={data.test_alcohol_limit_lbl || '(Limit:'}
              onChange={(v) => update('test_alcohol_limit_lbl', v)}
              style={{ fontWeight: 700, width: '50px' }}
            />
            <QcSlipInput
              value={data.test_alcohol_low || ''}
              onChange={(v) => update('test_alcohol_low', v)}
              style={{ width: 55, textAlign: 'center', marginLeft: 4 }}
            />
            <QcSlipText
              value={data.test_alcohol_to || 'to'}
              onChange={(v) => update('test_alcohol_to', v)}
              style={{ width: 25, textAlign: 'center', margin: '0 4px', fontWeight: 700 }}
            />
            <QcSlipInput
              value={data.test_alcohol_high || ''}
              onChange={(v) => update('test_alcohol_high', v)}
              style={{ width: 55, textAlign: 'center' }}
            />
            <QcSlipText
              value={data.test_alcohol_unit || '%'}
              onChange={(v) => update('test_alcohol_unit', v)}
              style={{ width: 25, marginLeft: 6, fontWeight: 700 }}
            />
            <span style={{ fontWeight: 700, marginLeft: 4 }}>)</span>
          </div>
        </div>
      </div>

      {/* 11. Sign By / Date (QC) : | Recieved By / Date (QA) : */}
      <div className="tablet-br-sign-row">
        <div style={{ width: '52%', display: 'flex', alignItems: 'center' }}>
          <QcSlipText
            value={data.sign_qc_label || 'Sign By / Date (QC)   :'}
            onChange={(v) => update('sign_qc_label', v)}
            style={{ fontWeight: 700, minWidth: '160px' }}
          />
          <QcSlipInput
            value={data.sign_qc || ''}
            onChange={(v) => update('sign_qc', v)}
            style={{ flex: 1, marginRight: 16 }}
          />
        </div>
        <div style={{ width: '48%', display: 'flex', alignItems: 'center' }}>
          <QcSlipText
            value={data.received_qa_label || 'Recieved By / Date (QA)         :'}
            onChange={(v) => update('received_qa_label', v)}
            style={{ fontWeight: 700, minWidth: '190px' }}
          />
          <QcSlipInput
            value={data.received_qa || ''}
            onChange={(v) => update('received_qa', v)}
            style={{ flex: 1 }}
          />
        </div>
      </div>

      {/* 12. STATUS LINE */}
      <div className="tablet-br-status-row">
        <QcSlipText
          value={data.status_line || 'Status : The above batch of Bulk sample is released for filling / compression.'}
          onChange={(v) => update('status_line', v)}
          style={{ fontWeight: 700, width: '100%' }}
        />
      </div>

      {/* 13. Sign By./ Date (QA) : | Received By / Date ( Production) */}
      <div className="tablet-br-sign-row-bottom">
        <div style={{ width: '52%', display: 'flex', alignItems: 'center' }}>
          <QcSlipText
            value={data.sign_qa_label || 'Sign By./ Date (QA) :'}
            onChange={(v) => update('sign_qa_label', v)}
            style={{ fontWeight: 700, minWidth: '160px' }}
          />
          <QcSlipInput
            value={data.sign_qa || ''}
            onChange={(v) => update('sign_qa', v)}
            style={{ flex: 1, marginRight: 16 }}
          />
        </div>
        <div style={{ width: '48%', display: 'flex', alignItems: 'center' }}>
          <QcSlipText
            value={data.received_production_label || 'Received By / Date ( Production)'}
            onChange={(v) => update('received_production_label', v)}
            style={{ fontWeight: 700, minWidth: '190px' }}
          />
          <QcSlipInput
            value={data.received_production || ''}
            onChange={(v) => update('received_production', v)}
            style={{ flex: 1 }}
          />
        </div>
      </div>

    </div>
  )
}
