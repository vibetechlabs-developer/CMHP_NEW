import React from 'react'
import cmhpLogo from '../../../assets/cmhp_invoice_logo.png'
import { QcSlipInput, QcSlipText } from './QcSlipEditable'
import './TabletQcSlip.css'

export function getInitialAttachment6Data(rec = {}, defaults = {}) {
  return {
    header_title: defaults.header_title || 'CMHP PRIVATE LIMITED',
    qa_heading: defaults.qa_heading || 'QUALITY ASSURANCE',
    attachment_label: defaults.attachment_label || 'ATTACHMENT – 6',
    slip_title: defaults.slip_title || 'FINISH PRODUCT TRANSFER SLIP',
    to_department_label: 'TO DEPARTMENT               :         PACKING',
    form_no_label: 'FORM NO.: SOP/QA/04/F-02/00',
    product_label: 'PRODUCT                              :',
    product: rec.product || rec.material_name || '',
    batch_no_label: 'BATCH NO.                            :',
    batch_no: rec.batch_no || '',
    ar_no_label: 'AR.No.  :',
    ar_no: rec.ar_no || rec.tr_no || '',
    mfg_date_label: 'MFG. DATE                            :',
    mfg_date: rec.mfg_date || '',
    exp_date_label: 'EXP. DATE/BEST BEFORE :',
    best_before: rec.best_before || rec.expiry_date || '5 Years',
    batch_qty_label: 'BATCH QUANTITY             :',
    batch_qty: rec.batch_qty ? String(rec.batch_qty) : (rec.quantity ? String(rec.quantity) : ''),
    shipper_label: 'NO. OF SHIPPER                  :',
    no_of_shipper: rec.no_of_shipper || '',
    status_text: 'Status : The above batch of FP transfer to warehouse for sale purpose.',
    sign_qa_label: 'Sign By./ Date (QA) :',
    sign_qa: rec.sign_qa || rec.qa_name || '',
    sign_wh_label: 'Received By / Date (Warehouse - FP) :',
    sign_wh: rec.sign_wh || rec.warehouse_name || '',
  }
}

function Att6Table({ data = {}, onChange, isEditable = true, branding = {}, isCopy2 = false }) {
  const update = (field, val) => {
    if (isEditable && onChange) {
      onChange({ ...data, [field]: val })
    }
  }

  const logoSrc = branding?.isTej ? branding.logoSrc : cmhpLogo
  const companyTitle = branding?.isTej ? branding.headerName : (data.header_title || 'CMHP PRIVATE LIMITED')

  return (
    <div className="tablet-tr-sheet" style={{ margin: '0 auto', border: '1.5px solid #000000', background: '#ffffff' }}>
      <table className="tablet-tr-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10pt', fontFamily: 'Times New Roman, serif' }}>
        <colgroup>
          <col style={{ width: '60%' }} />
          <col style={{ width: '40%' }} />
        </colgroup>
        <tbody>
          {/* ROW 0: Header with logo & company */}
          <tr>
            <td colSpan={2} style={{ border: '1px solid #000000', padding: '4px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <img src={logoSrc} alt="CMHP Logo" style={{ height: '34px', width: 'auto' }} />
                <div style={{ flex: 1, textAlign: 'center', fontSize: '16pt', fontWeight: 700, letterSpacing: '0.5px', marginLeft: '-50px' }}>
                  <QcSlipText
                    value={companyTitle}
                    onChange={(v) => update('header_title', v)}
                    readOnly={!isEditable}
                    style={{ textAlign: 'center', width: '90%', fontWeight: 700, fontSize: '16pt' }}
                  />
                </div>
              </div>
            </td>
          </tr>

          {/* ROW 1: QUALITY ASSURANCE */}
          <tr>
            <td colSpan={2} style={{ border: '1px solid #000000', textAlign: 'center', padding: '3px 6px', fontWeight: 700, fontSize: '11pt' }}>
              <QcSlipText
                value={data.qa_heading || 'QUALITY ASSURANCE'}
                onChange={(v) => update('qa_heading', v)}
                readOnly={!isEditable}
                style={{ textAlign: 'center', width: '100%', fontWeight: 700 }}
              />
            </td>
          </tr>

          {/* ROW 2: ATTACHMENT - 6 */}
          <tr>
            <td colSpan={2} style={{ border: '1px solid #000000', textAlign: 'center', padding: '3px 6px', fontWeight: 700, fontSize: '11pt' }}>
              <QcSlipText
                value={data.attachment_label || 'ATTACHMENT – 6'}
                onChange={(v) => update('attachment_label', v)}
                readOnly={!isEditable}
                style={{ textAlign: 'center', width: '100%', fontWeight: 700 }}
              />
            </td>
          </tr>

          {/* ROW 3: FINISH PRODUCT TRANSFER SLIP */}
          <tr>
            <td colSpan={2} style={{ border: '1px solid #000000', textAlign: 'center', padding: '3px 6px', fontWeight: 700, fontSize: '11.5pt' }}>
              <QcSlipText
                value={data.slip_title || 'FINISH PRODUCT TRANSFER SLIP'}
                onChange={(v) => update('slip_title', v)}
                readOnly={!isEditable}
                style={{ textAlign: 'center', width: '100%', fontWeight: 700 }}
              />
            </td>
          </tr>

          {/* ROW 4: TO DEPARTMENT : PACKING | FORM NO.: SOP/QA/04/F-02/00 */}
          <tr>
            <td style={{ border: '1px solid #000000', padding: '4px 8px', fontWeight: 700 }}>
              <QcSlipText
                value={data.to_department_label || 'TO DEPARTMENT               :         PACKING'}
                onChange={(v) => update('to_department_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, width: '100%' }}
              />
            </td>
            <td style={{ border: '1px solid #000000', padding: '4px 8px', fontWeight: 700, textAlign: 'right' }}>
              <QcSlipText
                value={data.form_no_label || 'FORM NO.: SOP/QA/04/F-02/00'}
                onChange={(v) => update('form_no_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, textAlign: 'right', width: '100%' }}
              />
            </td>
          </tr>

          {/* ROW 5: PRODUCT : */}
          <tr>
            <td colSpan={2} style={{ border: '1px solid #000000', padding: '4px 8px' }}>
              <span style={{ fontWeight: 700, marginRight: '8px' }}>PRODUCT :</span>
              <QcSlipInput
                value={data.product || ''}
                onChange={(v) => update('product', v)}
                readOnly={!isEditable}
                style={{ width: '75%', fontWeight: 600 }}
                placeholder="Product Name"
              />
            </td>
          </tr>

          {/* ROW 6: BATCH NO. : ... AR.No. : ... */}
          <tr>
            <td colSpan={2} style={{ border: '1px solid #000000', padding: '4px 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, marginRight: '8px' }}>BATCH NO. :</span>
                  <QcSlipInput
                    value={data.batch_no || ''}
                    onChange={(v) => update('batch_no', v)}
                    readOnly={!isEditable}
                    style={{ width: '180px', fontWeight: 600 }}
                    placeholder="Batch Number"
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, marginRight: '8px' }}>AR.No. :</span>
                  <QcSlipInput
                    value={data.ar_no || ''}
                    onChange={(v) => update('ar_no', v)}
                    readOnly={!isEditable}
                    style={{ width: '160px', fontWeight: 600 }}
                    placeholder="AR Number"
                  />
                </div>
              </div>
            </td>
          </tr>

          {/* ROW 7: MFG. DATE : ... EXP. DATE/BEST BEFORE : ... */}
          <tr>
            <td colSpan={2} style={{ border: '1px solid #000000', padding: '4px 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, marginRight: '8px' }}>MFG. DATE :</span>
                  <QcSlipInput
                    value={data.mfg_date || ''}
                    onChange={(v) => update('mfg_date', v)}
                    readOnly={!isEditable}
                    style={{ width: '180px' }}
                    placeholder="DD-MM-YYYY"
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, marginRight: '8px' }}>EXP. DATE/BEST BEFORE :</span>
                  <QcSlipInput
                    value={data.best_before || ''}
                    onChange={(v) => update('best_before', v)}
                    readOnly={!isEditable}
                    style={{ width: '140px' }}
                    placeholder="Years / Date"
                  />
                </div>
              </div>
            </td>
          </tr>

          {/* ROW 8: BATCH QUANTITY : */}
          <tr>
            <td colSpan={2} style={{ border: '1px solid #000000', padding: '4px 8px' }}>
              <span style={{ fontWeight: 700, marginRight: '8px' }}>BATCH QUANTITY :</span>
              <QcSlipInput
                value={data.batch_qty || ''}
                onChange={(v) => update('batch_qty', v)}
                readOnly={!isEditable}
                style={{ width: '220px' }}
                placeholder="Quantity"
              />
            </td>
          </tr>

          {/* ROW 9: NO. OF SHIPPER : */}
          <tr>
            <td colSpan={2} style={{ border: '1px solid #000000', padding: '4px 8px' }}>
              <span style={{ fontWeight: 700, marginRight: '8px' }}>NO. OF SHIPPER :</span>
              <QcSlipInput
                value={data.no_of_shipper || ''}
                onChange={(v) => update('no_of_shipper', v)}
                readOnly={!isEditable}
                style={{ width: '220px' }}
                placeholder="Shippers count"
              />
            </td>
          </tr>

          {/* ROW 10: Status & Signatures */}
          <tr>
            <td colSpan={2} style={{ border: '1px solid #000000', padding: '6px 8px' }}>
              <div style={{ fontWeight: 700, marginBottom: '14px' }}>
                <QcSlipText
                  value={data.status_text || 'Status : The above batch of FP transfer to warehouse for sale purpose.'}
                  onChange={(v) => update('status_text', v)}
                  readOnly={!isEditable}
                  style={{ fontWeight: 700, width: '100%' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                  <span style={{ fontWeight: 700, marginRight: '6px' }}>Sign By./ Date (QA) :</span>
                  <QcSlipInput
                    value={data.sign_qa || ''}
                    onChange={(v) => update('sign_qa', v)}
                    readOnly={!isEditable}
                    style={{ width: '160px' }}
                    placeholder="Signature / Date"
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
                  <span style={{ fontWeight: 700, marginRight: '6px' }}>Received By / Date (Warehouse - FP) :</span>
                  <QcSlipInput
                    value={data.sign_wh || ''}
                    onChange={(v) => update('sign_wh', v)}
                    readOnly={!isEditable}
                    style={{ width: '160px' }}
                    placeholder="Signature / Date"
                  />
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export default function Attachment6TransferSlip({
  data = {},
  onChange,
  readOnly = false,
  branding = {},
}) {
  return (
    <div className="att6-slip-sheet cmhp-printable-slip" style={{ width: '210mm', minHeight: '297mm', maxHeight: '297mm', boxSizing: 'border-box', padding: '8mm 12mm', background: '#ffffff', color: '#000000' }}>
      {/* Copy 1 (Top Half) */}
      <div className="att6-copy att6-copy-1">
        <Att6Table
          data={data}
          onChange={onChange}
          isEditable={!readOnly}
          branding={branding}
          isCopy2={false}
        />
      </div>

      {/* Dotted Cut Separator Line */}
      <div
        className="att6-cut-line"
        style={{
          margin: '6mm 0',
          borderTop: '1px dashed #475569',
          position: 'relative',
          textAlign: 'center',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '-9px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#ffffff',
            padding: '0 8px',
            fontSize: '9pt',
            color: '#64748b',
            letterSpacing: '1px',
          }}
        >
          ✂ CUT HERE
        </span>
      </div>

      {/* Copy 2 (Bottom Half - Mirrored on A4 Sheet) */}
      <div className="att6-copy att6-copy-2">
        <Att6Table
          data={data}
          onChange={onChange}
          isEditable={false}
          branding={branding}
          isCopy2={true}
        />
      </div>
    </div>
  )
}
