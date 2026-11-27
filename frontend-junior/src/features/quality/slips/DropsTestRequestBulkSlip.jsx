import React from 'react'
import cmhpLogo from '../../../assets/cmhp_invoice_logo.png'
import dropsLogo from '../../../assets/drops_logo.png'
import '../../formulas/slips/DropsSlip.css'

export function getInitialDropsTestRequestBulkData(initial = {}) {
  const today = new Date().toISOString().slice(0, 10)
  return {
    tr_no: initial.tr_no || '',
    date: initial.date || today,
    department: initial.department || 'ORAL LIQUID',
    form_no: 'SOP/QA/04/F-03/00',
    product: initial.product || initial.product_name || '',
    product_code: initial.product_code || '',
    batch_no: initial.batch_no || '',
    batch_size: initial.batch_size || '',
    batch_qty: initial.batch_qty || 'N.A',
    mfg_date: initial.mfg_date || '',
    sampled_qty: initial.sampled_qty || '',
    exp_best_before: initial.exp_best_before || '',
    no_of_cont: initial.no_of_cont || '',

    // Signatures
    sign_production: initial.sign_production || '',
    received_sampled_qty_top: initial.received_sampled_qty_top || '', // Quirk top
    received_qa_bottom: initial.received_qa_bottom || '',             // Bottom
    sampled_qa: initial.sampled_qa || '',
    received_qc: initial.received_qc || '',
  }
}

function SingleSlipCopy({
  data = {},
  update = () => {},
  readOnly = false,
  isTop = true,
  branding = {},
}) {
  const logoSrc = branding?.isTej ? branding.logoSrc : (dropsLogo || cmhpLogo)
  const headerName = branding?.isTej ? branding.headerName : 'CMHP PRIVATE LIMITED'

  return (
    <div className="drops-att2-copy">
      <table className="drops-att2-table">
        <colgroup>
          <col style={{ width: '28%' }} />
          <col style={{ width: '30%' }} />
          <col style={{ width: '24%' }} />
          <col style={{ width: '18%' }} />
        </colgroup>
        <tbody>
          {/* Row 1: Header Logo + Company */}
          <tr>
            <td colSpan={4} style={{ padding: '2px 8px' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <img
                  src={logoSrc}
                  alt="Logo"
                  style={{ maxHeight: 22, maxWidth: 75, objectFit: 'contain', marginRight: 12 }}
                />
                <div style={{ flex: 1, textAlign: 'center', fontSize: '10.5pt', fontWeight: 700, letterSpacing: '0.5px' }}>
                  {headerName}
                </div>
              </div>
            </td>
          </tr>

          {/* Row 2: PRODUCTION */}
          <tr>
            <td colSpan={4} style={{ textAlign: 'center', fontWeight: 700, fontSize: '10pt', padding: '1px' }}>
              PRODUCTION
            </td>
          </tr>

          {/* Row 3: TEST REQUEST (BULK ) | TR NO / DATE */}
          <tr>
            <td colSpan={2} style={{ textAlign: 'center', fontWeight: 700, fontSize: '9.5pt' }}>
              TEST REQUEST (BULK&nbsp;&nbsp;)
            </td>
            <td colSpan={2} style={{ padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ border: 'none', borderBottom: '1px solid #000', padding: '1px 4px', fontWeight: 700, fontSize: '8pt' }}>
                      <span>TR NO :&nbsp;</span>
                      <input
                        className="drops-input drops-input-screen"
                        style={{ width: '60%' }}
                        value={data.tr_no || ''}
                        disabled={readOnly}
                        onChange={(e) => update('tr_no', e.target.value)}
                      />
                    </td>
                  </tr>
                  <tr>
                    <td style={{ border: 'none', padding: '1px 4px', fontWeight: 700, fontSize: '8pt' }}>
                      <span>DATE:&nbsp;&nbsp;&nbsp;</span>
                      <input
                        className="drops-input drops-input-screen"
                        style={{ width: '60%' }}
                        value={data.date || ''}
                        disabled={readOnly}
                        onChange={(e) => update('date', e.target.value)}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>

          {/* Row 4: DEPARTMENT : ORAL LIQUID | FORM NO.: SOP/QA/04/F-03/00 */}
          <tr>
            <td colSpan={2} style={{ fontWeight: 700 }}>
              <span>DEPARTMENT :&nbsp;</span>
              <input
                className="drops-input drops-input-screen"
                style={{ width: '55%', fontWeight: 700 }}
                value={data.department ?? 'ORAL LIQUID'}
                disabled={readOnly}
                onChange={(e) => update('department', e.target.value)}
              />
            </td>
            <td colSpan={2} style={{ fontWeight: 700, fontSize: '7.5pt' }}>
              FORM NO.: SOP/QA/04/F-03/00
            </td>
          </tr>

          {/* Row 5: PRODUCT full width */}
          <tr>
            <td colSpan={4} style={{ background: '#f8fafc', padding: '2px 6px' }}>
              <span style={{ fontWeight: 700 }}>PRODUCT :&nbsp;&nbsp;</span>
              <input
                className="drops-input drops-input-screen"
                style={{ width: '80%', fontWeight: 700 }}
                value={data.product || ''}
                disabled={readOnly}
                onChange={(e) => update('product', e.target.value)}
              />
            </td>
          </tr>

          {/* Row 6: PRODUCD CODE : | BATCH NO. : */}
          <tr>
            <td colSpan={2} style={{ fontWeight: 700 }}>
              <span>PRODUCD CODE :&nbsp;</span>
              <input
                className="drops-input drops-input-screen"
                style={{ width: '50%', fontWeight: 400 }}
                value={data.product_code || ''}
                disabled={readOnly}
                onChange={(e) => update('product_code', e.target.value)}
              />
            </td>
            <td colSpan={2} style={{ fontWeight: 700 }}>
              <span>BATCH NO. :&nbsp;</span>
              <input
                className="drops-input drops-input-screen"
                style={{ width: '50%', fontWeight: 400 }}
                value={data.batch_no || ''}
                disabled={readOnly}
                onChange={(e) => update('batch_no', e.target.value)}
              />
            </td>
          </tr>

          {/* Row 7: BATCH SIZE : | BATCH QTY */}
          <tr>
            <td colSpan={2} style={{ fontWeight: 700 }}>
              <span>BATCH SIZE :&nbsp;</span>
              <input
                className="drops-input drops-input-screen"
                style={{ width: '55%', fontWeight: 400 }}
                value={data.batch_size || ''}
                disabled={readOnly}
                onChange={(e) => update('batch_size', e.target.value)}
              />
            </td>
            <td colSpan={2} style={{ fontWeight: 700 }}>
              <span>BATCH QTY&nbsp;&nbsp;</span>
              <input
                className="drops-input drops-input-screen"
                style={{ width: '50%', fontWeight: 400 }}
                value={data.batch_qty ?? 'N.A'}
                disabled={readOnly}
                onChange={(e) => update('batch_qty', e.target.value)}
              />
            </td>
          </tr>

          {/* Row 8: MFG. DATE : | SAMPLED QTY. : */}
          <tr>
            <td colSpan={2} style={{ fontWeight: 700 }}>
              <span>MFG. DATE :&nbsp;</span>
              <input
                className="drops-input drops-input-screen"
                style={{ width: '55%', fontWeight: 400 }}
                value={data.mfg_date || ''}
                disabled={readOnly}
                onChange={(e) => update('mfg_date', e.target.value)}
              />
            </td>
            <td colSpan={2} style={{ fontWeight: 700 }}>
              <span>SAMPLED QTY. :&nbsp;</span>
              <input
                className="drops-input drops-input-screen"
                style={{ width: '45%', fontWeight: 400 }}
                value={data.sampled_qty || ''}
                disabled={readOnly}
                onChange={(e) => update('sampled_qty', e.target.value)}
              />
            </td>
          </tr>

          {/* Row 9: EXP. DATE/BEST BEFORE : | NO. OF CONT. : */}
          <tr>
            <td colSpan={2} style={{ fontWeight: 700 }}>
              <span>EXP. DATE/BEST BEFORE :&nbsp;</span>
              <input
                className="drops-input drops-input-screen"
                style={{ width: '40%', fontWeight: 400 }}
                value={data.exp_best_before || ''}
                disabled={readOnly}
                onChange={(e) => update('exp_best_before', e.target.value)}
              />
            </td>
            <td colSpan={2} style={{ fontWeight: 700 }}>
              <span>NO. OF CONT. :&nbsp;</span>
              <input
                className="drops-input drops-input-screen"
                style={{ width: '45%', fontWeight: 400 }}
                value={data.no_of_cont || ''}
                disabled={readOnly}
                onChange={(e) => update('no_of_cont', e.target.value)}
              />
            </td>
          </tr>

          {/* Row 10: TEST TO BE PERFORMED */}
          <tr>
            <td colSpan={4} style={{ textAlign: 'center', fontWeight: 700, fontSize: '8pt', padding: '1px' }}>
              TEST TO BE PERFORMED :
            </td>
          </tr>

          {/* Row 11: 1) BULK / MT & 2) FP */}
          <tr>
            <td colSpan={3} style={{ fontSize: '7.5pt', lineHeight: 1.25, padding: '2px 4px' }}>
              <div><b>1)BULK / MT :</b> Description / pH / Wt.per ml / Alcohol Content/ Viscocity /Total Solids/ Lambda Max</div>
              <div><b>2) FP</b></div>
            </td>
            <td style={{ verticalAlign: 'middle', textAlign: 'center', fontWeight: 700, fontSize: '7.5pt' }}>
              Complete Analysis
            </td>
          </tr>

          {/* Row 12: Production Sign | Received By (Quirk!) */}
          <tr>
            <td colSpan={2} style={{ fontSize: '7.5pt', fontWeight: 700 }}>
              <span>Sign By / Date : (Production)&nbsp;</span>
              <input
                className="drops-input drops-input-screen"
                style={{ width: '35%' }}
                value={data.sign_production || ''}
                disabled={readOnly}
                onChange={(e) => update('sign_production', e.target.value)}
              />
            </td>
            <td colSpan={2} style={{ fontSize: '7.5pt', fontWeight: 700 }}>
              {isTop ? (
                <>
                  <span>Received By / SAMPLED QTY. :&nbsp;</span>
                  <input
                    className="drops-input drops-input-screen"
                    style={{ width: '30%' }}
                    value={data.received_sampled_qty_top || ''}
                    disabled={readOnly}
                    onChange={(e) => update('received_sampled_qty_top', e.target.value)}
                  />
                </>
              ) : (
                <>
                  <span>Received By / Date (QA)&nbsp;</span>
                  <input
                    className="drops-input drops-input-screen"
                    style={{ width: '35%' }}
                    value={data.received_qa_bottom || ''}
                    disabled={readOnly}
                    onChange={(e) => update('received_qa_bottom', e.target.value)}
                  />
                </>
              )}
            </td>
          </tr>

          {/* Row 13: Sampleds By / Date : ( QA) | Received By / Date (QC) */}
          <tr>
            <td colSpan={2} style={{ fontSize: '7.5pt', fontWeight: 700 }}>
              <span>Sampleds By / Date : ( QA)&nbsp;</span>
              <input
                className="drops-input drops-input-screen"
                style={{ width: '35%' }}
                value={data.sampled_qa || ''}
                disabled={readOnly}
                onChange={(e) => update('sampled_qa', e.target.value)}
              />
            </td>
            <td colSpan={2} style={{ fontSize: '7.5pt', fontWeight: 700 }}>
              <span>Received By / Date (QC)&nbsp;</span>
              <input
                className="drops-input drops-input-screen"
                style={{ width: '35%' }}
                value={data.received_qc || ''}
                disabled={readOnly}
                onChange={(e) => update('received_qc', e.target.value)}
              />
            </td>
          </tr>

          {/* Row 14: BULK */}
          <tr>
            <td colSpan={4} style={{ textAlign: 'center', fontWeight: 700, fontSize: '9pt', letterSpacing: '1px', padding: '1px' }}>
              BULK
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export default function DropsTestRequestBulkSlip({
  data = {},
  onChange = () => {},
  readOnly = false,
  branding = {},
}) {
  const d = data || {}

  const update = (field, val) => {
    if (readOnly) return
    onChange({
      ...d,
      [field]: val,
    })
  }

  return (
    <div className="drops-slip-page drops-att2-page cmhp-printable-slip">
      {/* ── TOP COPY (Copy 1) ── */}
      <SingleSlipCopy
        data={d}
        update={update}
        readOnly={readOnly}
        isTop={true}
        branding={branding}
      />

      {/* ── THIN BEIGE GAP SEPARATOR ── */}
      <div className="drops-att2-gap" />

      {/* ── BOTTOM COPY (Copy 2) ── */}
      <SingleSlipCopy
        data={d}
        update={update}
        readOnly={readOnly}
        isTop={false}
        branding={branding}
      />
    </div>
  )
}
