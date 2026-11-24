import React from 'react'
import cmhpLogo from '../../../assets/cmhp_invoice_logo.png'
import { QcSlipInput, QcSlipText } from './QcSlipEditable'
import '../../formulas/slips/MotherTinctureSlip.css'

export function getInitialMotherTinctureBulkReleaseData(rec = {}, defaults = {}) {
  return {
    header_title: defaults.header_title || 'CMHP PRIVATE LIMITED',
    qc_heading: defaults.qc_heading || 'QUALITY CONTROL(ATTACHMENT 3)',
    slip_name: defaults.slip_name || 'BULK RELEASE SLIP (MT)',
    department_label: 'DEPARTMENT   :   MOTHER TINCTURE',
    form_no_label: 'FORM NO.: SOP/QC/04/F-01',
    product_label: 'PRODUCT            :',
    product: rec.product || rec.material_name || '',
    mfg_date_label: 'MFG. DATE :',
    mfg_date: rec.mfg_date || '',
    batch_no_label: 'BATCH NO.          :',
    batch_no: rec.batch_no || '',
    best_before_label: 'BEST BEFORE :',
    best_before: rec.best_before || '5YEAR',
    batch_size_label: 'BATCH SIZE :',
    batch_size: rec.batch_size ? String(rec.batch_size) : '',
    batch_qty_label: 'BATCH QTY :',
    batch_qty: rec.batch_qty ? String(rec.batch_qty) : (rec.quantity ? String(rec.quantity) : ''),
    sample_qty_label: 'SAMPLE QTY :',
    sample_qty: rec.sample_qty || '10ML',
    test_results_label: 'TEST RESULTS  : PEAK VALUE ( λ ):',
    peak_value: rec.peak_value || '',
    hpi_label: 'HPI:',
    hpi: rec.hpi || '',
    sign_qc_label: 'Sign By / Date (QC)   :',
    sign_qc: rec.sign_qc || rec.chemist_name || '',
    received_qa_label: 'Recieved By / Date (QA)    :',
    received_qa: rec.received_qa || rec.qc_head_name || '',
    status_label: 'Status: The above batch of MT sample is released for filter',
    sign_qa_label: 'Sign By/Date (QA) :',
    sign_qa: rec.sign_qa || rec.qa_name || '',
    received_prod_label: 'Received By/Date (Production):',
    received_prod: rec.received_production || rec.received_prod || '',
    caption: defaults.caption || 'MT – Mother Tincture samples',
  }
}

function MtBrTable({ data = {}, onChange, isEditable = true, branding = {} }) {
  const update = (field, val) => {
    if (isEditable && onChange) {
      onChange({ ...data, [field]: val })
    }
  }

  const logoSrc = branding?.isTej ? branding.logoSrc : cmhpLogo
  const companyTitle = branding?.isTej ? branding.headerName : (data.header_title || 'CMHP PRIVATE LIMITED')

  return (
    <table className="mt-br-table">
      <colgroup>
        <col style={{ width: '32%' }} />
        <col style={{ width: '30%' }} />
        <col style={{ width: '3%' }} />
        <col style={{ width: '35%' }} />
      </colgroup>
      <tbody>
        {/* ROW 0: Header with CMHP logo & Company Name */}
        <tr>
          <td colSpan={4} style={{ padding: '4px 8px' }}>
            <div className="mt-br-header-inner">
              <div className="mt-br-logo-wrap">
                <img src={logoSrc} alt="CMHP Logo" className="mt-br-logo-img" />
              </div>
              <div className="mt-br-company-title">
                <QcSlipText
                  value={companyTitle}
                  onChange={(v) => update('header_title', v)}
                  readOnly={!isEditable}
                  style={{ fontSize: '18pt', fontWeight: 700, textAlign: 'center', width: '90%' }}
                />
              </div>
            </div>
          </td>
        </tr>

        {/* ROW 1: QUALITY CONTROL(ATTACHMENT 3) */}
        <tr>
          <td colSpan={4} style={{ textAlign: 'center', padding: '5px' }}>
            <QcSlipText
              value={data.qc_heading || 'QUALITY CONTROL(ATTACHMENT 3)'}
              onChange={(v) => update('qc_heading', v)}
              readOnly={!isEditable}
              style={{ fontSize: '12pt', fontWeight: 700, textAlign: 'center', width: '100%' }}
            />
          </td>
        </tr>

        {/* ROW 2: BULK RELEASE SLIP (MT) */}
        <tr>
          <td colSpan={4} style={{ textAlign: 'center', padding: '5px' }}>
            <QcSlipText
              value={data.slip_name || 'BULK RELEASE SLIP (MT)'}
              onChange={(v) => update('slip_name', v)}
              readOnly={!isEditable}
              style={{ fontWeight: 700, textAlign: 'center', width: '100%' }}
            />
          </td>
        </tr>

        {/* ROW 3: DEPARTMENT   :   MOTHER TINCTURE | FORM NO.: SOP/QC/04/F-01 */}
        <tr>
          <td colSpan={2}>
            <QcSlipText
              value={data.department_label || 'DEPARTMENT   :   MOTHER TINCTURE'}
              onChange={(v) => update('department_label', v)}
              readOnly={!isEditable}
              style={{ fontWeight: 700, width: '100%' }}
            />
          </td>
          <td colSpan={2}>
            <QcSlipText
              value={data.form_no_label || 'FORM NO.: SOP/QC/04/F-01'}
              onChange={(v) => update('form_no_label', v)}
              readOnly={!isEditable}
              style={{ fontWeight: 700, width: '100%' }}
            />
          </td>
        </tr>

        {/* ROW 4: PRODUCT            : | MFG. DATE : */}
        <tr>
          <td colSpan={2}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <QcSlipText
                value={data.product_label || 'PRODUCT            :'}
                onChange={(v) => update('product_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, marginRight: 6, whiteSpace: 'nowrap' }}
              />
              <QcSlipInput
                value={data.product || ''}
                onChange={(v) => update('product', v)}
                readOnly={!isEditable}
                style={{ flex: 1, fontWeight: 700 }}
              />
            </div>
          </td>
          <td colSpan={2}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <QcSlipText
                value={data.mfg_date_label || 'MFG. DATE :'}
                onChange={(v) => update('mfg_date_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, marginRight: 6, whiteSpace: 'nowrap' }}
              />
              <QcSlipInput
                value={data.mfg_date || ''}
                onChange={(v) => update('mfg_date', v)}
                readOnly={!isEditable}
                style={{ flex: 1 }}
              />
            </div>
          </td>
        </tr>

        {/* ROW 5: BATCH NO.          : | BEST BEFORE :5YEAR */}
        <tr>
          <td colSpan={2}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <QcSlipText
                value={data.batch_no_label || 'BATCH NO.          :'}
                onChange={(v) => update('batch_no_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, marginRight: 6, whiteSpace: 'nowrap' }}
              />
              <QcSlipInput
                value={data.batch_no || ''}
                onChange={(v) => update('batch_no', v)}
                readOnly={!isEditable}
                style={{ flex: 1 }}
              />
            </div>
          </td>
          <td colSpan={2}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <QcSlipText
                value={data.best_before_label || 'BEST BEFORE :'}
                onChange={(v) => update('best_before_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, marginRight: 4, whiteSpace: 'nowrap' }}
              />
              <QcSlipInput
                value={data.best_before ?? '5YEAR'}
                onChange={(v) => update('best_before', v)}
                readOnly={!isEditable}
                style={{ flex: 1 }}
              />
            </div>
          </td>
        </tr>

        {/* ROW 6: BATCH SIZE : | BATCH QTY : | SAMPLE QTY : 10ML */}
        <tr>
          <td>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <QcSlipText
                value={data.batch_size_label || 'BATCH SIZE :'}
                onChange={(v) => update('batch_size_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, marginRight: 4, whiteSpace: 'nowrap' }}
              />
              <QcSlipInput
                value={data.batch_size || ''}
                onChange={(v) => update('batch_size', v)}
                readOnly={!isEditable}
                style={{ flex: 1 }}
              />
            </div>
          </td>
          <td colSpan={2}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <QcSlipText
                value={data.batch_qty_label || 'BATCH QTY :'}
                onChange={(v) => update('batch_qty_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, marginRight: 4, whiteSpace: 'nowrap' }}
              />
              <QcSlipInput
                value={data.batch_qty || ''}
                onChange={(v) => update('batch_qty', v)}
                readOnly={!isEditable}
                style={{ flex: 1 }}
              />
            </div>
          </td>
          <td>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <QcSlipText
                value={data.sample_qty_label || 'SAMPLE QTY :'}
                onChange={(v) => update('sample_qty_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, marginRight: 4, whiteSpace: 'nowrap' }}
              />
              <QcSlipInput
                value={data.sample_qty ?? '10ML'}
                onChange={(v) => update('sample_qty', v)}
                readOnly={!isEditable}
                style={{ flex: 1 }}
              />
            </div>
          </td>
        </tr>

        {/* ROW 7: TEST RESULTS  : PEAK VALUE ( λ ): ____ nm | HPI: ____ nm */}
        <tr>
          <td colSpan={3}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <QcSlipText
                value={data.test_results_label || 'TEST RESULTS  : PEAK VALUE ( λ ):'}
                onChange={(v) => update('test_results_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, marginRight: 6, whiteSpace: 'nowrap' }}
              />
              <QcSlipInput
                value={data.peak_value || ''}
                onChange={(v) => update('peak_value', v)}
                readOnly={!isEditable}
                style={{ width: 85, textAlign: 'center' }}
              />
              <span style={{ fontWeight: 700, marginLeft: 4 }}>nm</span>
            </div>
          </td>
          <td>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <QcSlipText
                value={data.hpi_label || 'HPI:'}
                onChange={(v) => update('hpi_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, marginRight: 6, whiteSpace: 'nowrap' }}
              />
              <QcSlipInput
                value={data.hpi || ''}
                onChange={(v) => update('hpi', v)}
                readOnly={!isEditable}
                style={{ width: 85, textAlign: 'center' }}
              />
              <span style={{ fontWeight: 700, marginLeft: 4 }}>nm</span>
            </div>
          </td>
        </tr>

        {/* ROW 8: Sign By / Date (QC)   : | Recieved By / Date (QA)    : */}
        <tr>
          <td colSpan={4} style={{ padding: '6px 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', flex: 1, marginRight: 16 }}>
                <QcSlipText
                  value={data.sign_qc_label || 'Sign By / Date (QC)   :'}
                  onChange={(v) => update('sign_qc_label', v)}
                  readOnly={!isEditable}
                  style={{ fontWeight: 700, marginRight: 6, whiteSpace: 'nowrap' }}
                />
                <QcSlipInput
                  value={data.sign_qc || ''}
                  onChange={(v) => update('sign_qc', v)}
                  readOnly={!isEditable}
                  style={{ flex: 1 }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <QcSlipText
                  value={data.received_qa_label || 'Recieved By / Date (QA)    :'}
                  onChange={(v) => update('received_qa_label', v)}
                  readOnly={!isEditable}
                  style={{ fontWeight: 700, marginRight: 6, whiteSpace: 'nowrap' }}
                />
                <QcSlipInput
                  value={data.received_qa || ''}
                  onChange={(v) => update('received_qa', v)}
                  readOnly={!isEditable}
                  style={{ flex: 1 }}
                />
              </div>
            </div>
          </td>
        </tr>

        {/* ROW 9: Status: The above batch of MT sample is released for filter | Sign By/Date (QA) : | Received By/Date (Production): */}
        <tr>
          <td colSpan={4} style={{ padding: '6px 8px' }}>
            <QcSlipText
              value={data.status_label || 'Status: The above batch of MT sample is released for filter'}
              onChange={(v) => update('status_label', v)}
              readOnly={!isEditable}
              style={{ fontWeight: 700, width: '100%', marginBottom: 12, display: 'block' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', flex: 1, marginRight: 16 }}>
                <QcSlipText
                  value={data.sign_qa_label || 'Sign By/Date (QA) :'}
                  onChange={(v) => update('sign_qa_label', v)}
                  readOnly={!isEditable}
                  style={{ fontWeight: 700, marginRight: 6, whiteSpace: 'nowrap' }}
                />
                <QcSlipInput
                  value={data.sign_qa || ''}
                  onChange={(v) => update('sign_qa', v)}
                  readOnly={!isEditable}
                  style={{ flex: 1 }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <QcSlipText
                  value={data.received_prod_label || 'Received By/Date (Production):'}
                  onChange={(v) => update('received_prod_label', v)}
                  readOnly={!isEditable}
                  style={{ fontWeight: 700, marginRight: 6, whiteSpace: 'nowrap' }}
                />
                <QcSlipInput
                  value={data.received_prod || ''}
                  onChange={(v) => update('received_prod', v)}
                  readOnly={!isEditable}
                  style={{ flex: 1 }}
                />
              </div>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

export default function MotherTinctureBulkReleaseSlip({
  data = {},
  onChange,
  branding = {},
}) {
  return (
    <div className="mt-br-page cmhp-printable-slip">
      {/* Copy 1: Shown on screen (Editable) & in print / PDF */}
      <div className="mt-br-sheet">
        <MtBrTable
          data={data}
          onChange={onChange}
          isEditable={true}
          branding={branding}
        />
        <div className="mt-br-caption">
          <QcSlipText
            value={data.caption || 'MT – Mother Tincture samples'}
            onChange={(v) => onChange && onChange({ ...data, caption: v })}
            style={{ fontStyle: 'italic', fontWeight: 700, fontSize: '10.5pt' }}
          />
        </div>
      </div>

      {/* Copy 2: Hidden on screen, shown in print / PDF stacked below Copy 1 */}
      <div className="mt-br-copy-gap print-only-copy" />
      <div className="mt-br-sheet print-only-copy">
        <MtBrTable
          data={data}
          onChange={onChange}
          isEditable={false}
          branding={branding}
        />
        <div className="mt-br-caption">
          <span style={{ fontStyle: 'italic', fontWeight: 700, fontSize: '10.5pt' }}>
            {data.caption || 'MT – Mother Tincture samples'}
          </span>
        </div>
      </div>
    </div>
  )
}
