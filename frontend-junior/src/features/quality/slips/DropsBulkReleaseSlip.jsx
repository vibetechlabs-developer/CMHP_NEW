import React from 'react'
import cmhpLogo from '../../../assets/cmhp_invoice_logo.png'
import dropsLogo from '../../../assets/drops_logo.png'
import '../../formulas/slips/DropsSlip.css'

export function getInitialDropsBulkReleaseData(initial = {}) {
  return {
    to_department: initial.to_department || 'ORAL LIQUID',
    form_no: 'SOP/QC/03/F-02',
    product: initial.product || initial.product_name || '',
    tr_no: initial.tr_no || 'TRD/',
    batch_no: initial.batch_no || '',
    mfg_date: initial.mfg_date || '',
    exp_years: initial.exp_years || '05 Years',
    batch_size: initial.batch_size || '',
    batch_qty: initial.batch_qty || '',
    no_of_cont: initial.no_of_cont || '',

    // Test Results
    description_obs: initial.description_obs || '',
    description_limit: initial.description_limit || '',

    ph_obs: initial.ph_obs || '',
    ph_min: initial.ph_min || '',
    ph_max: initial.ph_max || '',

    wt_ml_obs: initial.wt_ml_obs || '',
    wt_ml_min: initial.wt_ml_min || '',
    wt_ml_max: initial.wt_ml_max || '',

    alcohol_obs: initial.alcohol_obs || '',
    alcohol_min: initial.alcohol_min || '',
    alcohol_max: initial.alcohol_max || '',

    // Signatures & Remarks
    sign_qc: initial.sign_qc || '',
    received_qa: initial.received_qa || '',
    sign_qa: initial.sign_qa || '',
    received_production: initial.received_production || '',
  }
}

export default function DropsBulkReleaseSlip({
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

  const logoSrc = branding?.isTej ? branding.logoSrc : (dropsLogo || cmhpLogo)
  const headerName = branding?.isTej ? branding.headerName : 'CMHP PRIVATE LIMITED'

  return (
    <div className="drops-slip-page drops-att3-page cmhp-printable-slip">
      <table className="drops-att3-table">
        <tbody>
          {/* Row 1: Logo + Company Name */}
          <tr>
            <td colSpan={2} style={{ padding: '6px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <img
                  src={logoSrc}
                  alt="CMHP Logo"
                  style={{ maxHeight: 38, maxWidth: 110, objectFit: 'contain', marginRight: 24 }}
                />
                <div style={{ flex: 1, textAlign: 'center', fontSize: '14pt', fontWeight: 700, letterSpacing: '0.5px' }}>
                  {headerName}
                </div>
              </div>
            </td>
          </tr>

          {/* Row 2: QUALITY CONTROL */}
          <tr>
            <td colSpan={2} style={{ textAlign: 'center', fontWeight: 700, fontSize: '11pt', padding: '4px' }}>
              QUALITY CONTROL
            </td>
          </tr>

          {/* Row 3: BULK RELEASE SLIP | Attachment-3 */}
          <tr>
            <td colSpan={2} style={{ padding: '4px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
                <span style={{ fontWeight: 700, fontSize: '11pt' }}>BULK RELEASE SLIP</span>
                <span style={{ position: 'absolute', right: 0, fontWeight: 700, fontSize: '10pt' }}>Attachment-3</span>
              </div>
            </td>
          </tr>

          {/* Row 4: TO DEPARTMENT : ORAL LIQUID | FORM NO.: SOP/QC/03/F-02 */}
          <tr>
            <td style={{ width: '60%', fontWeight: 700 }}>
              <span>TO DEPARTMENT&nbsp;&nbsp;:&nbsp;&nbsp;</span>
              <input
                className="drops-input drops-input-screen"
                style={{ width: '65%', fontWeight: 700 }}
                value={d.to_department ?? 'ORAL LIQUID'}
                disabled={readOnly}
                onChange={(e) => update('to_department', e.target.value)}
              />
            </td>
            <td style={{ width: '40%', fontWeight: 700 }}>
              <span>FORM NO.:&nbsp;</span>
              <span>{d.form_no || 'SOP/QC/03/F-02'}</span>
            </td>
          </tr>

          {/* Row 5: PRODUCT : | T.R. No.: TRD/ */}
          <tr>
            <td style={{ fontWeight: 700 }}>
              <span>PRODUCT&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:&nbsp;&nbsp;</span>
              <input
                className="drops-input drops-input-screen"
                style={{ width: '65%', fontWeight: 400 }}
                value={d.product || ''}
                disabled={readOnly}
                onChange={(e) => update('product', e.target.value)}
              />
            </td>
            <td style={{ fontWeight: 700 }}>
              <span>T.R. No.:&nbsp;&nbsp;</span>
              <input
                className="drops-input drops-input-screen"
                style={{ width: '65%', fontWeight: 400 }}
                value={d.tr_no ?? 'TRD/'}
                disabled={readOnly}
                onChange={(e) => update('tr_no', e.target.value)}
              />
            </td>
          </tr>

          {/* Row 6: BATCH NO. : */}
          <tr>
            <td colSpan={2} style={{ fontWeight: 700 }}>
              <span>BATCH NO.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:&nbsp;&nbsp;</span>
              <input
                className="drops-input drops-input-screen"
                style={{ width: '40%', fontWeight: 400 }}
                value={d.batch_no || ''}
                disabled={readOnly}
                onChange={(e) => update('batch_no', e.target.value)}
              />
            </td>
          </tr>

          {/* Row 7: MFG. DATE : | EXP. DATE/BEST BEFORE : 05 Years */}
          <tr>
            <td style={{ fontWeight: 700 }}>
              <span>MFG. DATE&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:&nbsp;&nbsp;</span>
              <input
                className="drops-input drops-input-screen"
                style={{ width: '60%', fontWeight: 400 }}
                value={d.mfg_date || ''}
                disabled={readOnly}
                onChange={(e) => update('mfg_date', e.target.value)}
              />
            </td>
            <td style={{ fontWeight: 700 }}>
              <span>EXP. DATE/BEST BEFORE :&nbsp;&nbsp;</span>
              <input
                className="drops-input drops-input-screen"
                style={{ width: '45%', fontWeight: 400 }}
                value={d.exp_years ?? '05 Years'}
                disabled={readOnly}
                onChange={(e) => update('exp_years', e.target.value)}
              />
            </td>
          </tr>

          {/* Row 8: BATCH SIZE : | BATCH QTY. : LTR */}
          <tr>
            <td style={{ fontWeight: 700 }}>
              <span>BATCH SIZE&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:&nbsp;&nbsp;</span>
              <input
                className="drops-input drops-input-screen"
                style={{ width: '60%', fontWeight: 400 }}
                value={d.batch_size || ''}
                disabled={readOnly}
                onChange={(e) => update('batch_size', e.target.value)}
              />
            </td>
            <td style={{ fontWeight: 700 }}>
              <span>BATCH QTY.&nbsp;&nbsp;:&nbsp;&nbsp;</span>
              <input
                className="drops-input drops-input-screen"
                style={{ width: '50%', fontWeight: 400 }}
                value={d.batch_qty || ''}
                disabled={readOnly}
                onChange={(e) => update('batch_qty', e.target.value)}
              />
              <span>&nbsp;LTR</span>
            </td>
          </tr>

          {/* Row 9: NO. OF CONT. : */}
          <tr>
            <td colSpan={2} style={{ fontWeight: 700 }}>
              <span>NO. OF CONT.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:&nbsp;&nbsp;</span>
              <input
                className="drops-input drops-input-screen"
                style={{ width: '40%', fontWeight: 400 }}
                value={d.no_of_cont || ''}
                disabled={readOnly}
                onChange={(e) => update('no_of_cont', e.target.value)}
              />
            </td>
          </tr>

          {/* Row 10: TEST RESULTS */}
          <tr>
            <td colSpan={2} style={{ padding: '8px 12px' }}>
              <div style={{ fontWeight: 700, textDecoration: 'underline', marginBottom: 6 }}>
                TEST RESULTS
              </div>

              {/* Bullet 1: Description */}
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontWeight: 700, width: 140 }}>• Description:</span>
                <input
                  className="drops-input drops-input-screen"
                  style={{ flex: 1, marginRight: 15 }}
                  value={d.description_obs || ''}
                  disabled={readOnly}
                  onChange={(e) => update('description_obs', e.target.value)}
                />
                <span style={{ whiteSpace: 'nowrap' }}>(Limit:&nbsp;</span>
                <input
                  className="drops-input drops-input-screen"
                  style={{ width: 120 }}
                  value={d.description_limit || ''}
                  disabled={readOnly}
                  onChange={(e) => update('description_limit', e.target.value)}
                />
                <span>)</span>
              </div>

              {/* Bullet 2: pH */}
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontWeight: 700, width: 140 }}>• pH:</span>
                <input
                  className="drops-input drops-input-screen"
                  style={{ flex: 1, marginRight: 15 }}
                  value={d.ph_obs || ''}
                  disabled={readOnly}
                  onChange={(e) => update('ph_obs', e.target.value)}
                />
                <span style={{ whiteSpace: 'nowrap' }}>(Limit:&nbsp;</span>
                <input
                  className="drops-input drops-input-screen"
                  style={{ width: 50, textAlign: 'center' }}
                  value={d.ph_min || ''}
                  disabled={readOnly}
                  onChange={(e) => update('ph_min', e.target.value)}
                />
                <span>&nbsp;to&nbsp;</span>
                <input
                  className="drops-input drops-input-screen"
                  style={{ width: 50, textAlign: 'center' }}
                  value={d.ph_max || ''}
                  disabled={readOnly}
                  onChange={(e) => update('ph_max', e.target.value)}
                />
                <span>)</span>
              </div>

              {/* Bullet 3: Wt/ml */}
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontWeight: 700, width: 140 }}>• Wt/ml :</span>
                <input
                  className="drops-input drops-input-screen"
                  style={{ flex: 1, marginRight: 15 }}
                  value={d.wt_ml_obs || ''}
                  disabled={readOnly}
                  onChange={(e) => update('wt_ml_obs', e.target.value)}
                />
                <span style={{ whiteSpace: 'nowrap' }}>(Limit:&nbsp;</span>
                <input
                  className="drops-input drops-input-screen"
                  style={{ width: 50, textAlign: 'center' }}
                  value={d.wt_ml_min || ''}
                  disabled={readOnly}
                  onChange={(e) => update('wt_ml_min', e.target.value)}
                />
                <span>&nbsp;to&nbsp;</span>
                <input
                  className="drops-input drops-input-screen"
                  style={{ width: 50, textAlign: 'center' }}
                  value={d.wt_ml_max || ''}
                  disabled={readOnly}
                  onChange={(e) => update('wt_ml_max', e.target.value)}
                />
                <span>&nbsp;gm/ml )</span>
              </div>

              {/* Bullet 4: Alcohol */}
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontWeight: 700, width: 140 }}>• Alcohol :</span>
                <input
                  className="drops-input drops-input-screen"
                  style={{ flex: 1, marginRight: 15 }}
                  value={d.alcohol_obs || ''}
                  disabled={readOnly}
                  onChange={(e) => update('alcohol_obs', e.target.value)}
                />
                <span style={{ whiteSpace: 'nowrap' }}>(Limit:&nbsp;</span>
                <input
                  className="drops-input drops-input-screen"
                  style={{ width: 50, textAlign: 'center' }}
                  value={d.alcohol_min || ''}
                  disabled={readOnly}
                  onChange={(e) => update('alcohol_min', e.target.value)}
                />
                <span>&nbsp;to&nbsp;</span>
                <input
                  className="drops-input drops-input-screen"
                  style={{ width: 50, textAlign: 'center' }}
                  value={d.alcohol_max || ''}
                  disabled={readOnly}
                  onChange={(e) => update('alcohol_max', e.target.value)}
                />
                <span>&nbsp;% )</span>
              </div>
            </td>
          </tr>

          {/* Row 11: Sign By / Date (QC) : | Recieved By / Date (QA) : */}
          <tr>
            <td style={{ width: '50%', padding: '6px 8px' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Sign By / Date (QC) :&nbsp;</span>
                <input
                  className="drops-input drops-input-screen"
                  style={{ flex: 1 }}
                  value={d.sign_qc || ''}
                  disabled={readOnly}
                  onChange={(e) => update('sign_qc', e.target.value)}
                />
              </div>
            </td>
            <td style={{ width: '50%', padding: '6px 8px' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Recieved By / Date (QA) :&nbsp;</span>
                <input
                  className="drops-input drops-input-screen"
                  style={{ flex: 1 }}
                  value={d.received_qa || ''}
                  disabled={readOnly}
                  onChange={(e) => update('received_qa', e.target.value)}
                />
              </div>
            </td>
          </tr>

          {/* Row 12: Status line + Sign By./ Date (QA) + Received By / Date ( Production) */}
          <tr>
            <td colSpan={2} style={{ padding: '8px' }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>
                Status : The above batch of Bulk sample is released for filling / compression.
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', width: '48%' }}>
                  <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Sign By./ Date (QA) :&nbsp;</span>
                  <input
                    className="drops-input drops-input-screen"
                    style={{ flex: 1 }}
                    value={d.sign_qa || ''}
                    disabled={readOnly}
                    onChange={(e) => update('sign_qa', e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', width: '48%' }}>
                  <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Received By / Date ( Production)&nbsp;</span>
                  <input
                    className="drops-input drops-input-screen"
                    style={{ flex: 1 }}
                    value={d.received_production || ''}
                    disabled={readOnly}
                    onChange={(e) => update('received_production', e.target.value)}
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
