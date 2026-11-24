import React from 'react'
import cmhpLogo from '../../../assets/cmhp_invoice_logo.png'
import { QcSlipInput, QcSlipText } from './QcSlipEditable'
import './TabletQcSlip.css'

export function getInitialTabletBulkReleaseData(rec = {}, defaults = {}) {
  return {
    header_title: defaults.header_title || 'CMHP PRIVATE LIMITED',
    qc_heading: defaults.qc_heading || 'QUALITY CONTROL',
    slip_name: defaults.slip_name || 'BULK  RELEASE SLIP',
    attachment_label: defaults.attachment_label || 'ATTACHMENT - 3',
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
    exp_years: rec.exp_years || rec.expiry_date || '',
    exp_years_suffix: 'Years',
    batch_size_label: 'BATCH SIZE                          :',
    batch_size: rec.batch_size ? String(rec.batch_size) : '',
    no_of_bottles_label: 'NO. OF BOTTLES   :',
    no_of_bottles: rec.no_of_bottles || '',
    test_heading: 'TEST RESULTS',

    // 7 Tablet tests
    test_desc_name: '• Description:',
    test_desc_obs: rec.appearance_obs || rec.test_desc_obs || '',
    test_desc_limit_lbl: '(Limit:',
    test_desc_limit: rec.appearance_limit || rec.test_desc_limit || '',

    test_avg_wt_name: '• Avg. weight of Tablet:',
    test_avg_wt_obs: rec.test_avg_wt_obs || '',
    test_avg_wt_limit_lbl: '(Limit:',
    test_avg_wt_low: rec.test_avg_wt_low || '',
    test_avg_wt_to: 'to',
    test_avg_wt_high: rec.test_avg_wt_high || '',

    test_wt_20_name: '• Weight of 20 Tablets:',
    test_wt_20_obs: rec.test_wt_20_obs || '',
    test_wt_20_limit_lbl: '(Limit:',
    test_wt_20_low: rec.test_wt_20_low || '',
    test_wt_20_to: 'to',
    test_wt_20_high: rec.test_wt_20_high || '',

    test_diam_name: '• Diameter:',
    test_diam_obs: rec.test_diam_obs || '',
    test_diam_limit_lbl: '(Limit:',
    test_diam_low: rec.test_diam_low || '',
    test_diam_to: 'to',
    test_diam_high: rec.test_diam_high || '',

    test_thick_name: '• Thickness:',
    test_thick_obs: rec.test_thick_obs || '',
    test_thick_limit_lbl: '(Limit:',
    test_thick_low: rec.test_thick_low || '',
    test_thick_to: 'to',
    test_thick_high: rec.test_thick_high || '',

    test_lod_name: '• Loss on Drying:',
    test_lod_obs: rec.test_lod_obs || '',
    test_lod_limit_lbl: '(Limit:',
    test_lod_low: rec.test_lod_low || '',
    test_lod_to: 'to',
    test_lod_high: rec.test_lod_high || '',

    test_ash_name: '• Total Ash:',
    test_ash_obs: rec.test_ash_obs || '',
    test_ash_limit_lbl: '(Limit:',
    test_ash_low: rec.test_ash_low || '',
    test_ash_to: 'to',
    test_ash_high: rec.test_ash_high || '',

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

export default function TabletBulkReleaseSlip({
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

      {/* 3. BULK  RELEASE SLIP | ATTACHMENT - 3 */}
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
            value={data.attachment_label || 'ATTACHMENT - 3'}
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

      {/* 7. MFG. DATE : | EXP. DATE/BEST BEFORE : ___ Years */}
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
          style={{ width: 60, textAlign: 'center', marginLeft: 4 }}
        />
        <QcSlipText
          value={data.exp_years_suffix || 'Years'}
          onChange={(v) => update('exp_years_suffix', v)}
          style={{ width: 50, marginLeft: 6, fontWeight: 700 }}
        />
      </div>

      {/* 8. BATCH SIZE : | NO. OF BOTTLES : */}
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
          value={data.no_of_bottles_label || 'NO. OF BOTTLES   :'}
          onChange={(v) => update('no_of_bottles_label', v)}
          style={{ fontWeight: 700, width: '135px' }}
        />
        <QcSlipInput
          value={data.no_of_bottles || ''}
          onChange={(v) => update('no_of_bottles', v)}
          style={{ width: 140, marginLeft: 4 }}
        />
      </div>

      {/* 9. TEST RESULTS */}
      <div className="tablet-br-tests-box">
        <div className="tablet-br-tests-head">
          <QcSlipText
            value={data.test_heading || 'TEST RESULTS'}
            onChange={(v) => update('test_heading', v)}
            style={{ fontWeight: 700 }}
          />
        </div>

        {/* 1. Description */}
        <div className="tablet-br-test-item">
          <div className="tablet-br-test-name">
            <QcSlipText
              value={data.test_desc_name || '• Description:'}
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
              style={{ width: 55 }}
            />
            <QcSlipInput
              value={data.test_desc_limit || ''}
              onChange={(v) => update('test_desc_limit', v)}
              style={{ width: 220, textAlign: 'center' }}
            />
            <span style={{ marginLeft: 2 }}>)</span>
          </div>
        </div>

        {/* 2. Avg. weight of Tablet */}
        <div className="tablet-br-test-item">
          <div className="tablet-br-test-name">
            <QcSlipText
              value={data.test_avg_wt_name || '• Avg. weight of Tablet:'}
              onChange={(v) => update('test_avg_wt_name', v)}
              style={{ fontWeight: 700, width: '100%' }}
            />
          </div>
          <div className="tablet-br-test-obs-wrap">
            <QcSlipInput
              value={data.test_avg_wt_obs || ''}
              onChange={(v) => update('test_avg_wt_obs', v)}
              style={{ width: '90%' }}
            />
          </div>
          <div className="tablet-br-test-limit-wrap">
            <QcSlipText
              value={data.test_avg_wt_limit_lbl || '(Limit:'}
              onChange={(v) => update('test_avg_wt_limit_lbl', v)}
              style={{ width: 55 }}
            />
            <QcSlipInput
              value={data.test_avg_wt_low || ''}
              onChange={(v) => update('test_avg_wt_low', v)}
              style={{ width: 75, textAlign: 'center' }}
            />
            <QcSlipText
              value={data.test_avg_wt_to || 'to'}
              onChange={(v) => update('test_avg_wt_to', v)}
              style={{ width: 28, textAlign: 'center', margin: '0 4px', fontWeight: 700 }}
            />
            <QcSlipInput
              value={data.test_avg_wt_high || ''}
              onChange={(v) => update('test_avg_wt_high', v)}
              style={{ width: 75, textAlign: 'center' }}
            />
            <span style={{ marginLeft: 4 }}>)</span>
          </div>
        </div>

        {/* 3. Weight of 20 Tablets */}
        <div className="tablet-br-test-item">
          <div className="tablet-br-test-name">
            <QcSlipText
              value={data.test_wt_20_name || '• Weight of 20 Tablets:'}
              onChange={(v) => update('test_wt_20_name', v)}
              style={{ fontWeight: 700, width: '100%' }}
            />
          </div>
          <div className="tablet-br-test-obs-wrap">
            <QcSlipInput
              value={data.test_wt_20_obs || ''}
              onChange={(v) => update('test_wt_20_obs', v)}
              style={{ width: '90%' }}
            />
          </div>
          <div className="tablet-br-test-limit-wrap">
            <QcSlipText
              value={data.test_wt_20_limit_lbl || '(Limit:'}
              onChange={(v) => update('test_wt_20_limit_lbl', v)}
              style={{ width: 55 }}
            />
            <QcSlipInput
              value={data.test_wt_20_low || ''}
              onChange={(v) => update('test_wt_20_low', v)}
              style={{ width: 75, textAlign: 'center' }}
            />
            <QcSlipText
              value={data.test_wt_20_to || 'to'}
              onChange={(v) => update('test_wt_20_to', v)}
              style={{ width: 28, textAlign: 'center', margin: '0 4px', fontWeight: 700 }}
            />
            <QcSlipInput
              value={data.test_wt_20_high || ''}
              onChange={(v) => update('test_wt_20_high', v)}
              style={{ width: 75, textAlign: 'center' }}
            />
            <span style={{ marginLeft: 4 }}>)</span>
          </div>
        </div>

        {/* 4. Diameter */}
        <div className="tablet-br-test-item">
          <div className="tablet-br-test-name">
            <QcSlipText
              value={data.test_diam_name || '• Diameter:'}
              onChange={(v) => update('test_diam_name', v)}
              style={{ fontWeight: 700, width: '100%' }}
            />
          </div>
          <div className="tablet-br-test-obs-wrap">
            <QcSlipInput
              value={data.test_diam_obs || ''}
              onChange={(v) => update('test_diam_obs', v)}
              style={{ width: '90%' }}
            />
          </div>
          <div className="tablet-br-test-limit-wrap">
            <QcSlipText
              value={data.test_diam_limit_lbl || '(Limit:'}
              onChange={(v) => update('test_diam_limit_lbl', v)}
              style={{ width: 55 }}
            />
            <QcSlipInput
              value={data.test_diam_low || ''}
              onChange={(v) => update('test_diam_low', v)}
              style={{ width: 75, textAlign: 'center' }}
            />
            <QcSlipText
              value={data.test_diam_to || 'to'}
              onChange={(v) => update('test_diam_to', v)}
              style={{ width: 28, textAlign: 'center', margin: '0 4px', fontWeight: 700 }}
            />
            <QcSlipInput
              value={data.test_diam_high || ''}
              onChange={(v) => update('test_diam_high', v)}
              style={{ width: 75, textAlign: 'center' }}
            />
            <span style={{ marginLeft: 4 }}>)</span>
          </div>
        </div>

        {/* 5. Thickness */}
        <div className="tablet-br-test-item">
          <div className="tablet-br-test-name">
            <QcSlipText
              value={data.test_thick_name || '• Thickness:'}
              onChange={(v) => update('test_thick_name', v)}
              style={{ fontWeight: 700, width: '100%' }}
            />
          </div>
          <div className="tablet-br-test-obs-wrap">
            <QcSlipInput
              value={data.test_thick_obs || ''}
              onChange={(v) => update('test_thick_obs', v)}
              style={{ width: '90%' }}
            />
          </div>
          <div className="tablet-br-test-limit-wrap">
            <QcSlipText
              value={data.test_thick_limit_lbl || '(Limit:'}
              onChange={(v) => update('test_thick_limit_lbl', v)}
              style={{ width: 55 }}
            />
            <QcSlipInput
              value={data.test_thick_low || ''}
              onChange={(v) => update('test_thick_low', v)}
              style={{ width: 75, textAlign: 'center' }}
            />
            <QcSlipText
              value={data.test_thick_to || 'to'}
              onChange={(v) => update('test_thick_to', v)}
              style={{ width: 28, textAlign: 'center', margin: '0 4px', fontWeight: 700 }}
            />
            <QcSlipInput
              value={data.test_thick_high || ''}
              onChange={(v) => update('test_thick_high', v)}
              style={{ width: 75, textAlign: 'center' }}
            />
            <span style={{ marginLeft: 4 }}>)</span>
          </div>
        </div>

        {/* 6. Loss on Drying */}
        <div className="tablet-br-test-item">
          <div className="tablet-br-test-name">
            <QcSlipText
              value={data.test_lod_name || '• Loss on Drying:'}
              onChange={(v) => update('test_lod_name', v)}
              style={{ fontWeight: 700, width: '100%' }}
            />
          </div>
          <div className="tablet-br-test-obs-wrap">
            <QcSlipInput
              value={data.test_lod_obs || ''}
              onChange={(v) => update('test_lod_obs', v)}
              style={{ width: '90%' }}
            />
          </div>
          <div className="tablet-br-test-limit-wrap">
            <QcSlipText
              value={data.test_lod_limit_lbl || '(Limit:'}
              onChange={(v) => update('test_lod_limit_lbl', v)}
              style={{ width: 55 }}
            />
            <QcSlipInput
              value={data.test_lod_low || ''}
              onChange={(v) => update('test_lod_low', v)}
              style={{ width: 75, textAlign: 'center' }}
            />
            <QcSlipText
              value={data.test_lod_to || 'to'}
              onChange={(v) => update('test_lod_to', v)}
              style={{ width: 28, textAlign: 'center', margin: '0 4px', fontWeight: 700 }}
            />
            <QcSlipInput
              value={data.test_lod_high || ''}
              onChange={(v) => update('test_lod_high', v)}
              style={{ width: 75, textAlign: 'center' }}
            />
            <span style={{ marginLeft: 4 }}>)</span>
          </div>
        </div>

        {/* 7. Total Ash */}
        <div className="tablet-br-test-item">
          <div className="tablet-br-test-name">
            <QcSlipText
              value={data.test_ash_name || '• Total Ash:'}
              onChange={(v) => update('test_ash_name', v)}
              style={{ fontWeight: 700, width: '100%' }}
            />
          </div>
          <div className="tablet-br-test-obs-wrap">
            <QcSlipInput
              value={data.test_ash_obs || ''}
              onChange={(v) => update('test_ash_obs', v)}
              style={{ width: '90%' }}
            />
          </div>
          <div className="tablet-br-test-limit-wrap">
            <QcSlipText
              value={data.test_ash_limit_lbl || '(Limit:'}
              onChange={(v) => update('test_ash_limit_lbl', v)}
              style={{ width: 55 }}
            />
            <QcSlipInput
              value={data.test_ash_low || ''}
              onChange={(v) => update('test_ash_low', v)}
              style={{ width: 75, textAlign: 'center' }}
            />
            <QcSlipText
              value={data.test_ash_to || 'to'}
              onChange={(v) => update('test_ash_to', v)}
              style={{ width: 28, textAlign: 'center', margin: '0 4px', fontWeight: 700 }}
            />
            <QcSlipInput
              value={data.test_ash_high || ''}
              onChange={(v) => update('test_ash_high', v)}
              style={{ width: 75, textAlign: 'center' }}
            />
            <span style={{ marginLeft: 4 }}>)</span>
          </div>
        </div>

      </div>

      {/* 10. Sign By / Date (QC) : | Recieved By / Date (QA) : */}
      <div className="tablet-br-sign-row">
        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <QcSlipText
            value={data.sign_qc_label || 'Sign By / Date (QC)   :'}
            onChange={(v) => update('sign_qc_label', v)}
            style={{ fontWeight: 700, marginRight: 6 }}
          />
          <QcSlipInput
            value={data.sign_qc || ''}
            onChange={(v) => update('sign_qc', v)}
            style={{ flex: 1, marginRight: 20 }}
          />
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <QcSlipText
            value={data.received_qa_label || 'Recieved By / Date (QA)         :'}
            onChange={(v) => update('received_qa_label', v)}
            style={{ fontWeight: 700, marginRight: 6 }}
          />
          <QcSlipInput
            value={data.received_qa || ''}
            onChange={(v) => update('received_qa', v)}
            style={{ flex: 1 }}
          />
        </div>
      </div>

      {/* 11. Status : The above batch of Bulk sample is released for filling / compression. */}
      <div className="tablet-br-status-row">
        <QcSlipText
          value={data.status_line || 'Status : The above batch of Bulk sample is released for filling / compression.'}
          onChange={(v) => update('status_line', v)}
          style={{ width: '100%', fontWeight: 700 }}
        />
      </div>

      {/* 12. Sign By./ Date (QA) : | Received By / Date ( Production) */}
      <div className="tablet-br-sign-row-bottom">
        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <QcSlipText
            value={data.sign_qa_label || 'Sign By./ Date (QA) :'}
            onChange={(v) => update('sign_qa_label', v)}
            style={{ fontWeight: 700, marginRight: 6 }}
          />
          <QcSlipInput
            value={data.sign_qa || ''}
            onChange={(v) => update('sign_qa', v)}
            style={{ flex: 1, marginRight: 20 }}
          />
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <QcSlipText
            value={data.received_production_label || 'Received By / Date ( Production)'}
            onChange={(v) => update('received_production_label', v)}
            style={{ fontWeight: 700, marginRight: 6 }}
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
