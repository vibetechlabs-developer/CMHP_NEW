import React from 'react'
import cmhpLogo from '../../../assets/cmhp_invoice_logo.png'
import { QcSlipInput, QcSlipText } from './QcSlipEditable'
import './TabletQcSlip.css'

export function getInitialOilBulkReleaseData(rec = {}, defaults = {}) {
  return {
    header_title: defaults.header_title || 'CMHP PRIVATE LIMITED',
    qc_heading: defaults.qc_heading || 'QUALITY CONTROL',
    slip_name: defaults.slip_name || 'BULK  RELEASE SLIP',
    attachment_label: defaults.attachment_label || 'Attachment-3',
    to_department_label: 'TO DEPARTMENT               :',
    to_department: rec.to_department || 'PRODUCTION',
    form_no: defaults.form_no || 'FORM NO.: SOP/QC/03 /F- 02 /00',
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

    // 8 Oil tests from ATTACHMENT_3__1_.docx
    test_app_name: '• Appearance :',
    test_app_obs: rec.appearance_obs || rec.test_app_obs || '',
    test_app_limit_lbl: '( Limit:',
    test_app_limit: rec.appearance_limit || rec.test_app_limit || '',

    test_odor_name: '• Odor',
    test_odor_obs: rec.odor_obs || rec.test_odor_obs || '',
    test_odor_limit_lbl: '( Limit:',
    test_odor_limit: rec.odor_limit || rec.test_odor_limit || '',

    test_wt_ml_name: '• Wt/ml :',
    test_wt_ml_obs: rec.wt_ml_obs || rec.test_wt_ml_obs || '',
    test_wt_ml_limit_lbl: '(Limit:',
    test_wt_ml_low: rec.wt_ml_low || rec.test_wt_ml_low || '',
    test_wt_ml_to: 'to',
    test_wt_ml_high: rec.wt_ml_high || rec.test_wt_ml_high || '',
    test_wt_ml_unit: 'gm/ml )',

    test_visc_name: '• Viscosity :',
    test_visc_obs: rec.viscosity_obs || rec.test_visc_obs || '',
    test_visc_limit_lbl: '(Limit:',
    test_visc_low: rec.viscosity_low || rec.test_visc_low || '',
    test_visc_to: 'to',
    test_visc_high: rec.viscosity_high || rec.test_visc_high || '',
    test_visc_unit: 'mPa.S )',

    test_acid_name: '• Acid Value :',
    test_acid_obs: rec.acid_value_obs || rec.test_acid_obs || '',
    test_acid_limit_lbl: '(Limit:',
    test_acid_low: rec.acid_value_low || rec.test_acid_low || '',
    test_acid_to: 'to',
    test_acid_high: rec.acid_value_high || rec.test_acid_high || '',

    test_peroxide_name: '• Peroxide Value :',
    test_peroxide_obs: rec.peroxide_value_obs || rec.test_peroxide_obs || '',
    test_peroxide_limit_lbl: '(Limit:',
    test_peroxide_low: rec.peroxide_value_low || rec.test_peroxide_low || '',
    test_peroxide_to: 'to',
    test_peroxide_high: rec.peroxide_value_high || rec.test_peroxide_high || '',

    test_iodine_name: '• Iodine Value :',
    test_iodine_obs: rec.iodine_value_obs || rec.test_iodine_obs || '',
    test_iodine_limit_lbl: '(Limit:',
    test_iodine_low: rec.iodine_value_low || rec.test_iodine_low || '',
    test_iodine_to: 'to',
    test_iodine_high: rec.iodine_value_high || rec.test_iodine_high || '',

    test_sapon_name: '• Saponification Value :',
    test_sapon_obs: rec.saponification_obs || rec.test_sapon_obs || '',
    test_sapon_limit_lbl: '(Limit:',
    test_sapon_low: rec.saponification_low || rec.test_sapon_low || '',
    test_sapon_to: 'to',
    test_sapon_high: rec.saponification_high || rec.test_sapon_high || '',

    sign_qc_label: 'Sign By / Da te (QC )    :',
    sign_qc: rec.sign_qc || rec.chemist_name || '',
    received_qa_label: 'Recieved By / Date (QA ) :',
    received_qa: rec.received_qa || rec.qc_head_name || '',

    status_line: 'Status : The above batch of  Bulk  sample is released for filling / compression.',

    sign_qa_label: 'Sign By./ Date (QA) :',
    sign_qa: rec.sign_qa || rec.qa_name || '',
    received_production_label: 'Received By / Date ( Production)',
    received_production: rec.received_production || '',
  }
}

export default function OilBulkReleaseSlip({
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
            style={{ fontWeight: 700, fontSize: '11.5pt' }}
          />
        </div>
        <div className="tablet-br-title-right">
          <QcSlipText
            value={data.attachment_label || 'Attachment-3'}
            onChange={(v) => update('attachment_label', v)}
            style={{ fontWeight: 700, fontSize: '11pt', textAlign: 'right' }}
          />
        </div>
      </div>

      {/* 4. META TABLE */}
      <table className="tablet-br-meta-table">
        <colgroup>
          <col style={{ width: '56%' }} />
          <col style={{ width: '44%' }} />
        </colgroup>
        <tbody>
          <tr>
            <td>
              <div className="tablet-br-field">
                <QcSlipText
                  value={data.to_department_label || 'TO DEPARTMENT               :'}
                  onChange={(v) => update('to_department_label', v)}
                  style={{ width: '165px', fontWeight: 700 }}
                />
                <QcSlipInput
                  value={data.to_department || ''}
                  onChange={(v) => update('to_department', v)}
                  style={{ flex: 1 }}
                />
              </div>
            </td>
            <td>
              <div className="tablet-br-field">
                <QcSlipText
                  value={data.form_no || 'FORM NO.:  SOP/QC/03 /F- 02 /00'}
                  onChange={(v) => update('form_no', v)}
                  style={{ width: '100%', fontWeight: 700 }}
                />
              </div>
            </td>
          </tr>
          <tr>
            <td>
              <div className="tablet-br-field">
                <QcSlipText
                  value={data.product_label || 'PRODUCT                               :'}
                  onChange={(v) => update('product_label', v)}
                  style={{ width: '165px', fontWeight: 700 }}
                />
                <QcSlipInput
                  value={data.product || ''}
                  onChange={(v) => update('product', v)}
                  style={{ flex: 1, fontWeight: 700 }}
                />
              </div>
            </td>
            <td>
              <div className="tablet-br-field">
                <QcSlipText
                  value={data.tr_no_label || 'T.R.  No.:'}
                  onChange={(v) => update('tr_no_label', v)}
                  style={{ width: '65px', fontWeight: 700 }}
                />
                <QcSlipInput
                  value={data.tr_no || ''}
                  onChange={(v) => update('tr_no', v)}
                  style={{ flex: 1 }}
                />
              </div>
            </td>
          </tr>
          <tr>
            <td colSpan={2}>
              <div className="tablet-br-field">
                <QcSlipText
                  value={data.batch_no_label || 'BATCH NO.                             :'}
                  onChange={(v) => update('batch_no_label', v)}
                  style={{ width: '165px', fontWeight: 700 }}
                />
                <QcSlipInput
                  value={data.batch_no || ''}
                  onChange={(v) => update('batch_no', v)}
                  style={{ flex: 1, fontWeight: 700 }}
                />
              </div>
            </td>
          </tr>
          <tr>
            <td>
              <div className="tablet-br-field">
                <QcSlipText
                  value={data.mfg_date_label || 'MFG. DATE                            :'}
                  onChange={(v) => update('mfg_date_label', v)}
                  style={{ width: '165px', fontWeight: 700 }}
                />
                <QcSlipInput
                  value={data.mfg_date || ''}
                  onChange={(v) => update('mfg_date', v)}
                  style={{ flex: 1 }}
                />
              </div>
            </td>
            <td>
              <div className="tablet-br-field">
                <QcSlipText
                  value={data.exp_date_label || 'EXP. DATE/BEST BEFORE :'}
                  onChange={(v) => update('exp_date_label', v)}
                  style={{ fontWeight: 700, marginRight: 4, whiteSpace: 'nowrap' }}
                />
                <QcSlipInput
                  value={data.exp_years || ''}
                  onChange={(v) => update('exp_years', v)}
                  style={{ width: '50px' }}
                />
                <span style={{ fontWeight: 700, marginLeft: 4 }}>
                  {data.exp_years_suffix || 'Years'}
                </span>
              </div>
            </td>
          </tr>
          <tr>
            <td>
              <div className="tablet-br-field">
                <QcSlipText
                  value={data.batch_size_label || 'BATCH SIZE                          :'}
                  onChange={(v) => update('batch_size_label', v)}
                  style={{ width: '165px', fontWeight: 700 }}
                />
                <QcSlipInput
                  value={data.batch_size || ''}
                  onChange={(v) => update('batch_size', v)}
                  style={{ flex: 1 }}
                />
              </div>
            </td>
            <td>
              <div className="tablet-br-field">
                <QcSlipText
                  value={data.no_of_bottles_label || 'NO. OF BOTTLES   :'}
                  onChange={(v) => update('no_of_bottles_label', v)}
                  style={{ width: '120px', fontWeight: 700 }}
                />
                <QcSlipInput
                  value={data.no_of_bottles || ''}
                  onChange={(v) => update('no_of_bottles', v)}
                  style={{ flex: 1 }}
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* 5. TEST RESULTS (8 Oil Tests) */}
      <div className="tablet-br-tests-section">
        <div className="tablet-br-test-hdr">
          <QcSlipText
            value={data.test_heading || 'TEST RESULTS'}
            onChange={(v) => update('test_heading', v)}
            style={{ fontWeight: 700 }}
          />
        </div>

        {/* 1) Appearance */}
        <div className="tablet-br-test-row">
          <span className="tablet-br-bullet">
            <QcSlipText
              value={data.test_app_name || '• Appearance :'}
              onChange={(v) => update('test_app_name', v)}
              style={{ fontWeight: 700 }}
            />
          </span>
          <div className="tablet-br-test-obs-wrap">
            <QcSlipInput
              value={data.test_app_obs || ''}
              onChange={(v) => update('test_app_obs', v)}
              style={{ width: '100%' }}
            />
          </div>
          <div className="tablet-br-test-limit-wrap">
            <span className="tablet-br-limit-label">{data.test_app_limit_lbl || '( Limit:'}</span>
            <QcSlipInput
              value={data.test_app_limit || ''}
              onChange={(v) => update('test_app_limit', v)}
              style={{ flex: 1 }}
            />
            <span style={{ fontWeight: 700 }}>)</span>
          </div>
        </div>

        {/* 2) Odor */}
        <div className="tablet-br-test-row">
          <span className="tablet-br-bullet">
            <QcSlipText
              value={data.test_odor_name || '• Odor'}
              onChange={(v) => update('test_odor_name', v)}
              style={{ fontWeight: 700 }}
            />
          </span>
          <div className="tablet-br-test-obs-wrap">
            <QcSlipInput
              value={data.test_odor_obs || ''}
              onChange={(v) => update('test_odor_obs', v)}
              style={{ width: '100%' }}
            />
          </div>
          <div className="tablet-br-test-limit-wrap">
            <span className="tablet-br-limit-label">{data.test_odor_limit_lbl || '( Limit:'}</span>
            <QcSlipInput
              value={data.test_odor_limit || ''}
              onChange={(v) => update('test_odor_limit', v)}
              style={{ flex: 1 }}
            />
            <span style={{ fontWeight: 700 }}>)</span>
          </div>
        </div>

        {/* 3) Wt/ml */}
        <div className="tablet-br-test-row">
          <span className="tablet-br-bullet">
            <QcSlipText
              value={data.test_wt_ml_name || '• Wt/ml :'}
              onChange={(v) => update('test_wt_ml_name', v)}
              style={{ fontWeight: 700 }}
            />
          </span>
          <div className="tablet-br-test-obs-wrap">
            <QcSlipInput
              value={data.test_wt_ml_obs || ''}
              onChange={(v) => update('test_wt_ml_obs', v)}
              style={{ width: '100%' }}
            />
          </div>
          <div className="tablet-br-test-limit-wrap">
            <span className="tablet-br-limit-label">{data.test_wt_ml_limit_lbl || '(Limit:'}</span>
            <QcSlipInput
              value={data.test_wt_ml_low || ''}
              onChange={(v) => update('test_wt_ml_low', v)}
              style={{ width: '45px' }}
            />
            <span style={{ margin: '0 4px', fontWeight: 700 }}>to</span>
            <QcSlipInput
              value={data.test_wt_ml_high || ''}
              onChange={(v) => update('test_wt_ml_high', v)}
              style={{ width: '45px' }}
            />
            <span style={{ fontWeight: 700, marginLeft: 4 }}>{data.test_wt_ml_unit || 'gm/ml )'}</span>
          </div>
        </div>

        {/* 4) Viscosity */}
        <div className="tablet-br-test-row">
          <span className="tablet-br-bullet">
            <QcSlipText
              value={data.test_visc_name || '• Viscosity :'}
              onChange={(v) => update('test_visc_name', v)}
              style={{ fontWeight: 700 }}
            />
          </span>
          <div className="tablet-br-test-obs-wrap">
            <QcSlipInput
              value={data.test_visc_obs || ''}
              onChange={(v) => update('test_visc_obs', v)}
              style={{ width: '100%' }}
            />
          </div>
          <div className="tablet-br-test-limit-wrap">
            <span className="tablet-br-limit-label">{data.test_visc_limit_lbl || '(Limit:'}</span>
            <QcSlipInput
              value={data.test_visc_low || ''}
              onChange={(v) => update('test_visc_low', v)}
              style={{ width: '45px' }}
            />
            <span style={{ margin: '0 4px', fontWeight: 700 }}>to</span>
            <QcSlipInput
              value={data.test_visc_high || ''}
              onChange={(v) => update('test_visc_high', v)}
              style={{ width: '45px' }}
            />
            <span style={{ fontWeight: 700, marginLeft: 4 }}>{data.test_visc_unit || 'mPa.S )'}</span>
          </div>
        </div>

        {/* 5) Acid Value */}
        <div className="tablet-br-test-row">
          <span className="tablet-br-bullet">
            <QcSlipText
              value={data.test_acid_name || '• Acid Value :'}
              onChange={(v) => update('test_acid_name', v)}
              style={{ fontWeight: 700 }}
            />
          </span>
          <div className="tablet-br-test-obs-wrap">
            <QcSlipInput
              value={data.test_acid_obs || ''}
              onChange={(v) => update('test_acid_obs', v)}
              style={{ width: '100%' }}
            />
          </div>
          <div className="tablet-br-test-limit-wrap">
            <span className="tablet-br-limit-label">{data.test_acid_limit_lbl || '(Limit:'}</span>
            <QcSlipInput
              value={data.test_acid_low || ''}
              onChange={(v) => update('test_acid_low', v)}
              style={{ width: '45px' }}
            />
            <span style={{ margin: '0 4px', fontWeight: 700 }}>to</span>
            <QcSlipInput
              value={data.test_acid_high || ''}
              onChange={(v) => update('test_acid_high', v)}
              style={{ width: '45px' }}
            />
            <span style={{ fontWeight: 700 }}>)</span>
          </div>
        </div>

        {/* 6) Peroxide Value */}
        <div className="tablet-br-test-row">
          <span className="tablet-br-bullet">
            <QcSlipText
              value={data.test_peroxide_name || '• Peroxide Value :'}
              onChange={(v) => update('test_peroxide_name', v)}
              style={{ fontWeight: 700 }}
            />
          </span>
          <div className="tablet-br-test-obs-wrap">
            <QcSlipInput
              value={data.test_peroxide_obs || ''}
              onChange={(v) => update('test_peroxide_obs', v)}
              style={{ width: '100%' }}
            />
          </div>
          <div className="tablet-br-test-limit-wrap">
            <span className="tablet-br-limit-label">{data.test_peroxide_limit_lbl || '(Limit:'}</span>
            <QcSlipInput
              value={data.test_peroxide_low || ''}
              onChange={(v) => update('test_peroxide_low', v)}
              style={{ width: '45px' }}
            />
            <span style={{ margin: '0 4px', fontWeight: 700 }}>to</span>
            <QcSlipInput
              value={data.test_peroxide_high || ''}
              onChange={(v) => update('test_peroxide_high', v)}
              style={{ width: '45px' }}
            />
            <span style={{ fontWeight: 700 }}>)</span>
          </div>
        </div>

        {/* 7) Iodine Value */}
        <div className="tablet-br-test-row">
          <span className="tablet-br-bullet">
            <QcSlipText
              value={data.test_iodine_name || '• Iodine Value :'}
              onChange={(v) => update('test_iodine_name', v)}
              style={{ fontWeight: 700 }}
            />
          </span>
          <div className="tablet-br-test-obs-wrap">
            <QcSlipInput
              value={data.test_iodine_obs || ''}
              onChange={(v) => update('test_iodine_obs', v)}
              style={{ width: '100%' }}
            />
          </div>
          <div className="tablet-br-test-limit-wrap">
            <span className="tablet-br-limit-label">{data.test_iodine_limit_lbl || '(Limit:'}</span>
            <QcSlipInput
              value={data.test_iodine_low || ''}
              onChange={(v) => update('test_iodine_low', v)}
              style={{ width: '45px' }}
            />
            <span style={{ margin: '0 4px', fontWeight: 700 }}>to</span>
            <QcSlipInput
              value={data.test_iodine_high || ''}
              onChange={(v) => update('test_iodine_high', v)}
              style={{ width: '45px' }}
            />
            <span style={{ fontWeight: 700 }}>)</span>
          </div>
        </div>

        {/* 8) Saponification Value */}
        <div className="tablet-br-test-row">
          <span className="tablet-br-bullet">
            <QcSlipText
              value={data.test_sapon_name || '• Saponification Value :'}
              onChange={(v) => update('test_sapon_name', v)}
              style={{ fontWeight: 700 }}
            />
          </span>
          <div className="tablet-br-test-obs-wrap">
            <QcSlipInput
              value={data.test_sapon_obs || ''}
              onChange={(v) => update('test_sapon_obs', v)}
              style={{ width: '100%' }}
            />
          </div>
          <div className="tablet-br-test-limit-wrap">
            <span className="tablet-br-limit-label">{data.test_sapon_limit_lbl || '(Limit:'}</span>
            <QcSlipInput
              value={data.test_sapon_low || ''}
              onChange={(v) => update('test_sapon_low', v)}
              style={{ width: '45px' }}
            />
            <span style={{ margin: '0 4px', fontWeight: 700 }}>to</span>
            <QcSlipInput
              value={data.test_sapon_high || ''}
              onChange={(v) => update('test_sapon_high', v)}
              style={{ width: '45px' }}
            />
            <span style={{ fontWeight: 700 }}>)</span>
          </div>
        </div>
      </div>

      {/* 6. SIGNATURE ROW 1 */}
      <div className="tablet-br-sign-row-1">
        <div className="tablet-br-sign-col">
          <QcSlipText
            value={data.sign_qc_label || 'Sign By / Da te (QC )    :'}
            onChange={(v) => update('sign_qc_label', v)}
            style={{ fontWeight: 700, marginRight: 4, whiteSpace: 'nowrap' }}
          />
          <QcSlipInput
            value={data.sign_qc || ''}
            onChange={(v) => update('sign_qc', v)}
            style={{ flex: 1 }}
          />
        </div>
        <div className="tablet-br-sign-col">
          <QcSlipText
            value={data.received_qa_label || 'Recieved By / Date (QA ) :'}
            onChange={(v) => update('received_qa_label', v)}
            style={{ fontWeight: 700, marginRight: 4, whiteSpace: 'nowrap' }}
          />
          <QcSlipInput
            value={data.received_qa || ''}
            onChange={(v) => update('received_qa', v)}
            style={{ flex: 1 }}
          />
        </div>
      </div>

      {/* 7. STATUS LINE */}
      <div className="tablet-br-status-box">
        <QcSlipText
          value={data.status_line || 'Status : The above batch of  Bulk  sample is released for filling / compression.'}
          onChange={(v) => update('status_line', v)}
          style={{ width: '100%', fontWeight: 700 }}
        />
      </div>

      {/* 8. SIGNATURE ROW 2 */}
      <div className="tablet-br-sign-row-2">
        <div className="tablet-br-sign-col">
          <QcSlipText
            value={data.sign_qa_label || 'Sign By./ Date (QA) :'}
            onChange={(v) => update('sign_qa_label', v)}
            style={{ fontWeight: 700, marginRight: 4, whiteSpace: 'nowrap' }}
          />
          <QcSlipInput
            value={data.sign_qa || ''}
            onChange={(v) => update('sign_qa', v)}
            style={{ flex: 1 }}
          />
        </div>
        <div className="tablet-br-sign-col">
          <QcSlipText
            value={data.received_production_label || 'Received By / Date ( Production)'}
            onChange={(v) => update('received_production_label', v)}
            style={{ fontWeight: 700, marginRight: 4, whiteSpace: 'nowrap' }}
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
