import React from 'react'
import cmhpLogo from '../../../assets/cmhp_invoice_logo.png'
import { QcSlipInput, QcSlipText } from './QcSlipEditable'
import '../../formulas/slips/MotherTinctureSlip.css'

export function getInitialMotherTinctureTrAfterFilterData(rec = {}, defaults = {}) {
  return {
    header_title: defaults.header_title || 'CMHP PRIVATE LIMITED',
    prod_heading: defaults.prod_heading || 'PRODUCTION  (ATTACHMENT 4)',
    slip_title: defaults.slip_title || 'TEST REQUEST FOR  BULK  AFTER FILTER',
    date_tr_no_label: 'DATE/ TR NO  :',
    date_tr_no: rec.date_tr_no || rec.tr_no || (rec.order_date ? `${rec.order_date} / ${rec.tr_no || ''}`.trim() : '') || '',
    department_label: 'DEPARTMEN  : MOTHER TINCTURE',
    form_no_label: 'FORM NO :  SOP/MT/01/F01-00',
    product_label: 'PRODUCT        :',
    product: rec.product || rec.product_name || rec.material_name || '',
    mfg_date_label: 'MFG DATE :',
    mfg_date: rec.mfg_date || '',
    batch_no_label: 'BATCH NO.     :',
    batch_no: rec.batch_no || '',
    best_before_label: 'BEST BEFORE : 5YEAR',
    best_before: rec.best_before || '5YEAR',
    batch_size_label: 'BATCH SIZE   :',
    batch_size: rec.batch_size ? String(rec.batch_size) : '',
    batch_qty_label: 'BATCH QTY :',
    batch_qty: rec.batch_qty ? String(rec.batch_qty) : (rec.quantity != null ? String(rec.quantity) : ''),
    sampled_qty_label: 'SAMPLED QTY :  50ML',
    sampled_qty: rec.sampled_qty || '50ML',
    test_1_label: '1) TEST TO BE PERFORMED :',
    test_2_label: '2) BULK / MT : Description / pH / Wt.per ml / Alcohol Content /Total Solids',
    sign_prod_label: 'Sign By / Date (Production) :',
    sign_production: rec.sign_production || rec.chemist_name || '',
    received_qa_label: 'Received By / Date (QA) :',
    received_qa: rec.received_qa || rec.qc_head_name || '',
    sampled_qa_label: 'Sampled By / Date (QA) :',
    sampled_qa: rec.sampled_qa || '',
    received_qc_label: 'Received By / Date ( QC) :',
    received_qc: rec.received_qc || '',
  }
}

function MtTrAfterFilterTable({ data = {}, onChange, isEditable = true, branding = {} }) {
  const update = (field, val) => {
    if (onChange) {
      onChange({ ...data, [field]: val })
    }
  }

  const logoSrc = branding?.isTej ? branding.logoSrc : cmhpLogo
  const companyTitle = branding?.isTej ? branding.headerName : (data.header_title || 'CMHP PRIVATE LIMITED')

  return (
    <table className="mt-tr-after-table">
      <colgroup>
        <col style={{ width: '55.7mm' }} />
        <col style={{ width: '26.7mm' }} />
        <col style={{ width: '24.4mm' }} />
        <col style={{ width: '52.3mm' }} />
      </colgroup>
      <tbody>
        {/* ROW 1 (12.6mm): [logo] | CMHP PRIVATE LIMITED (full width) */}
        <tr className="mt-tr-after-r1">
          <td colSpan={4} style={{ padding: '0.8mm 2mm', verticalAlign: 'middle' }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%' }}>
              <div style={{ width: '22.3mm', height: '9.8mm', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <img
                  src={logoSrc}
                  alt="CMHP Logo"
                  style={{ width: '22.3mm', height: '9.8mm', objectFit: 'contain' }}
                />
              </div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <QcSlipText
                  value={companyTitle}
                  onChange={(v) => update('header_title', v)}
                  readOnly={!isEditable}
                  className="mt-tr-header-title"
                  style={{ fontSize: '18pt', fontWeight: 400, textAlign: 'center', width: '90%', fontFamily: "'Times New Roman', 'Liberation Serif', serif" }}
                />
              </div>
            </div>
          </td>
        </tr>

        {/* ROW 2 (5.8mm): PRODUCTION  (ATTACHMENT 4) (full width, centered) */}
        <tr className="mt-tr-after-r2">
          <td colSpan={4} style={{ textAlign: 'center', padding: '0.5mm 2mm', verticalAlign: 'middle' }}>
            <QcSlipText
              value={data.prod_heading || 'PRODUCTION  (ATTACHMENT 4)'}
              onChange={(v) => update('prod_heading', v)}
              readOnly={!isEditable}
              style={{ fontSize: '12pt', fontWeight: 700, textAlign: 'center', width: '100%' }}
            />
          </td>
        </tr>

        {/* ROW 3 (9.1mm): left half (82.4mm): "TEST REQUEST FOR  BULK  AFTER FILTER" (left aligned, wraps to 2 lines) | right half (76.7mm): "DATE/ TR NO  :" */}
        <tr className="mt-tr-after-r3">
          <td colSpan={2} style={{ verticalAlign: 'top', padding: '0.8mm 1.5mm', width: '82.4mm' }}>
            <QcSlipText
              value={data.slip_title || 'TEST REQUEST FOR  BULK  AFTER FILTER'}
              onChange={(v) => update('slip_title', v)}
              readOnly={!isEditable}
              as="textarea"
              rows={2}
              style={{ fontWeight: 700, fontSize: '12pt', width: '100%', lineHeight: 1.15, resize: 'none' }}
            />
          </td>
          <td colSpan={2} style={{ verticalAlign: 'top', width: '76.7mm' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              <QcSlipText
                value={data.date_tr_no_label || 'DATE/ TR NO  :'}
                onChange={(v) => update('date_tr_no_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, fontSize: '12pt', marginRight: 6, whiteSpace: 'nowrap' }}
              />
              <QcSlipInput
                value={data.date_tr_no || ''}
                onChange={(v) => update('date_tr_no', v)}
                readOnly={!isEditable}
                style={{ flex: 1, fontSize: '12pt' }}
              />
            </div>
          </td>
        </tr>

        {/* ROW 4 (7.3mm): "DEPARTMEN  : MOTHER TINCTURE" | "FORM NO :  SOP/MT/01/F01-00" */}
        <tr className="mt-tr-after-r4">
          <td colSpan={2} style={{ verticalAlign: 'middle' }}>
            <QcSlipText
              value={data.department_label || 'DEPARTMEN  : MOTHER TINCTURE'}
              onChange={(v) => update('department_label', v)}
              readOnly={!isEditable}
              style={{ fontWeight: 700, fontSize: '12pt', width: '100%' }}
            />
          </td>
          <td colSpan={2} style={{ verticalAlign: 'middle' }}>
            <QcSlipText
              value={data.form_no_label || 'FORM NO :  SOP/MT/01/F01-00'}
              onChange={(v) => update('form_no_label', v)}
              readOnly={!isEditable}
              style={{ fontWeight: 700, fontSize: '12pt', width: '100%' }}
            />
          </td>
        </tr>

        {/* ROW 5 (9.5mm): "PRODUCT        :" | "MFG DATE :" */}
        <tr className="mt-tr-after-r5">
          <td colSpan={2} style={{ verticalAlign: 'top' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <QcSlipText
                value={data.product_label || 'PRODUCT        :'}
                onChange={(v) => update('product_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, fontSize: '12pt', marginRight: 6, whiteSpace: 'pre' }}
              />
              <QcSlipInput
                value={data.product || ''}
                onChange={(v) => update('product', v)}
                readOnly={!isEditable}
                style={{ flex: 1, fontWeight: 700, fontSize: '12pt' }}
              />
            </div>
          </td>
          <td colSpan={2} style={{ verticalAlign: 'top' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <QcSlipText
                value={data.mfg_date_label || 'MFG DATE :'}
                onChange={(v) => update('mfg_date_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, fontSize: '12pt', marginRight: 6, whiteSpace: 'nowrap' }}
              />
              <QcSlipInput
                value={data.mfg_date || ''}
                onChange={(v) => update('mfg_date', v)}
                readOnly={!isEditable}
                style={{ flex: 1, fontSize: '12pt' }}
              />
            </div>
          </td>
        </tr>

        {/* ROW 6 (9.4mm): "BATCH NO.     :" | "BEST BEFORE : 5YEAR" */}
        <tr className="mt-tr-after-r6">
          <td colSpan={2} style={{ verticalAlign: 'top' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <QcSlipText
                value={data.batch_no_label || 'BATCH NO.     :'}
                onChange={(v) => update('batch_no_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, fontSize: '12pt', marginRight: 6, whiteSpace: 'pre' }}
              />
              <QcSlipInput
                value={data.batch_no || ''}
                onChange={(v) => update('batch_no', v)}
                readOnly={!isEditable}
                style={{ flex: 1, fontSize: '12pt' }}
              />
            </div>
          </td>
          <td colSpan={2} style={{ verticalAlign: 'top' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <QcSlipText
                value={data.best_before_label || 'BEST BEFORE : 5YEAR'}
                onChange={(v) => update('best_before_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, fontSize: '12pt', width: '100%', whiteSpace: 'pre' }}
              />
            </div>
          </td>
        </tr>

        {/* ROW 7 (9.1mm): three cells (55.7 / 51.1 / 52.3 mm): "BATCH SIZE   :" | "BATCH QTY :" | "SAMPLED QTY :  50ML" */}
        <tr className="mt-tr-after-r7">
          <td style={{ verticalAlign: 'top', width: '55.7mm' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <QcSlipText
                value={data.batch_size_label || 'BATCH SIZE   :'}
                onChange={(v) => update('batch_size_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, fontSize: '12pt', marginRight: 4, whiteSpace: 'pre' }}
              />
              <QcSlipInput
                value={data.batch_size || ''}
                onChange={(v) => update('batch_size', v)}
                readOnly={!isEditable}
                style={{ flex: 1, fontSize: '12pt' }}
              />
            </div>
          </td>
          <td colSpan={2} style={{ verticalAlign: 'top', width: '51.1mm' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <QcSlipText
                value={data.batch_qty_label || 'BATCH QTY :'}
                onChange={(v) => update('batch_qty_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, fontSize: '12pt', marginRight: 4, whiteSpace: 'pre' }}
              />
              <QcSlipInput
                value={data.batch_qty || ''}
                onChange={(v) => update('batch_qty', v)}
                readOnly={!isEditable}
                style={{ flex: 1, fontSize: '12pt' }}
              />
            </div>
          </td>
          <td style={{ verticalAlign: 'top', width: '52.3mm' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <QcSlipText
                value={data.sampled_qty_label || 'SAMPLED QTY :  50ML'}
                onChange={(v) => update('sampled_qty_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, fontSize: '12pt', width: '100%' }}
              />
            </div>
          </td>
        </tr>

        {/* ROW 8 (14.7mm): full width, two bold numbered lines indented about 10 mm */}
        <tr className="mt-tr-after-r8">
          <td colSpan={4} style={{ padding: '1mm 2mm 1mm 10mm', verticalAlign: 'middle' }}>
            <div style={{ fontWeight: 700, lineHeight: 1.25 }}>
              <div>
                <QcSlipText
                  value={data.test_1_label || '1) TEST TO BE PERFORMED :'}
                  onChange={(v) => update('test_1_label', v)}
                  readOnly={!isEditable}
                  style={{ fontWeight: 700, fontSize: '12pt', width: '100%' }}
                />
              </div>
              <div style={{ marginTop: 2 }}>
                <QcSlipText
                  value={data.test_2_label || '2) BULK / MT : Description / pH / Wt.per ml / Alcohol Content /Total Solids'}
                  onChange={(v) => update('test_2_label', v)}
                  readOnly={!isEditable}
                  style={{ fontWeight: 700, fontSize: '12pt', width: '100%' }}
                />
              </div>
            </div>
          </td>
        </tr>

        {/* ROW 9 (9.4mm): "Sign By / Date (Production) :" | "Received By / Date (QA) :" */}
        <tr className="mt-tr-after-r9">
          <td colSpan={2} style={{ verticalAlign: 'top', width: '82.4mm' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <QcSlipText
                value={data.sign_prod_label || 'Sign By / Date (Production) :'}
                onChange={(v) => update('sign_prod_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, fontSize: '12pt', marginRight: 6, whiteSpace: 'nowrap' }}
              />
              <QcSlipInput
                value={data.sign_production || ''}
                onChange={(v) => update('sign_production', v)}
                readOnly={!isEditable}
                style={{ flex: 1, fontSize: '12pt' }}
              />
            </div>
          </td>
          <td colSpan={2} style={{ verticalAlign: 'top', width: '76.7mm' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <QcSlipText
                value={data.received_qa_label || 'Received By / Date (QA) :'}
                onChange={(v) => update('received_qa_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, fontSize: '12pt', marginRight: 6, whiteSpace: 'nowrap' }}
              />
              <QcSlipInput
                value={data.received_qa || ''}
                onChange={(v) => update('received_qa', v)}
                readOnly={!isEditable}
                style={{ flex: 1, fontSize: '12pt' }}
              />
            </div>
          </td>
        </tr>

        {/* ROW 10 (9.4mm): "Sampled By / Date (QA) :" | "Received By / Date ( QC) :" */}
        <tr className="mt-tr-after-r10">
          <td colSpan={2} style={{ verticalAlign: 'top', width: '82.4mm' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <QcSlipText
                value={data.sampled_qa_label || 'Sampled By / Date (QA) :'}
                onChange={(v) => update('sampled_qa_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, fontSize: '12pt', marginRight: 6, whiteSpace: 'nowrap' }}
              />
              <QcSlipInput
                value={data.sampled_qa || ''}
                onChange={(v) => update('sampled_qa', v)}
                readOnly={!isEditable}
                style={{ flex: 1, fontSize: '12pt' }}
              />
            </div>
          </td>
          <td colSpan={2} style={{ verticalAlign: 'top', width: '76.7mm' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <QcSlipText
                value={data.received_qc_label || 'Received By / Date ( QC) :'}
                onChange={(v) => update('received_qc_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, fontSize: '12pt', marginRight: 6, whiteSpace: 'nowrap' }}
              />
              <QcSlipInput
                value={data.received_qc || ''}
                onChange={(v) => update('received_qc', v)}
                readOnly={!isEditable}
                style={{ flex: 1, fontSize: '12pt' }}
              />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

export default function MotherTinctureTestRequestAfterFilterSlip({
  data = {},
  onChange,
  branding = {},
}) {
  return (
    <div className="mt-tr-page mt-tr-after-page cmhp-printable-slip">
      {/* Copy 1: Shown on screen (Editable) & in print / PDF */}
      <div className="mt-tr-sheet">
        <MtTrAfterFilterTable
          data={data}
          onChange={onChange}
          isEditable={true}
          branding={branding}
        />
      </div>

      {/* Copy 2: Shown in print / PDF stacked below Copy 1 (Mirror with identical values, typing in either copy mirrors) */}
      <div className="mt-tr-after-gap print-only-copy" />
      <div className="mt-tr-sheet print-only-copy">
        <MtTrAfterFilterTable
          data={data}
          onChange={onChange}
          isEditable={true}
          branding={branding}
        />
      </div>
    </div>
  )
}
