import React from 'react'
import cmhpLogo from '../../../assets/cmhp_invoice_logo.png'
import { getCompanyBranding, isTejBiocare } from '../../../utils/companyBranding.js'
import { QcSlipInput, QcSlipText } from '../../quality/slips/QcSlipEditable'
import './MotherTinctureSlip.css'

export function getInitialMotherTinctureRmData(product = {}, formula = {}, revision = {}, activeLines = null, company = {}) {
  // Auto-fill: do not auto-fill from Bill of Materials lines. If the product or its
  // formula clearly gives the herb name or the herb quantity, you may fill
  // "HERB" / "QUANTITY OF HERB"; if it is not clear, leave them empty.
  const herbName = product?.herb_name || product?.generic_name || product?.name || ''
  const qtyHerb = formula?.herb_quantity || (revision?.base_output_quantity ? `${revision.base_output_quantity} ${revision.output_uom_code || ''}`.trim() : '')

  return {
    header_title: 'CMHP PRIVATE LIMITED',
    prod_attachment_label: 'PRODUCTION  (ATTACHMENT 1)',
    slip_title: 'RM REQUEST FOR  MOTHER  TINCTURE',
    date_tr_no_label: 'DATE/ TR NO :',
    date_tr_no: '',
    department_label: 'DEPARTMENT :  MOTHER TINCTURE',
    form_no_label: 'FORME NO. SOP/MT/01/F01-00',
    herb_label: 'HERB :',
    herb: herbName,
    batch_no_label: 'BATCH NO. :',
    batch_no: '',
    mfg_date_label: 'MFG DATE :',
    mfg_date: '',
    qty_herb_label: 'QUANTITY OF HERB :',
    qty_herb: qtyHerb,
    requested_by_label: 'REQUESTED BY /DATE(PROD.) :',
    requested_by: '',
    issued_by_label: 'ISSUED BY/DATE(WH) :',
    issued_by: '',
    checked_by_label: 'CHEKED BY/DATE (QA):',
    checked_by: '',

    // Small two-column table below the forms
    table2_rows: [
      { label: 'DATE & FOR', value: '' },
      { label: 'NAME', value: '' },
      { label: 'DRUG QTY', value: '' },
      { label: 'ALC Qty', value: '' },
      { label: 'WATER QTY', value: '' },
      { label: 'MAKE UP', value: '' },
    ],
  }
}

function MtRmFormTable({ data = {}, onChange, isEditable = true, branding = {} }) {
  const update = (field, val) => {
    if (isEditable && onChange) {
      onChange({ ...data, [field]: val })
    }
  }

  const logoSrc = branding?.isTej ? branding.logoSrc : cmhpLogo
  const companyTitle = branding?.isTej ? branding.headerName : (data.header_title || 'CMHP PRIVATE LIMITED')

  return (
    <table className="mt-rm-table">
      <colgroup>
        <col style={{ width: '54.4%' }} />
        <col style={{ width: '45.6%' }} />
      </colgroup>
      <tbody>
        {/* ROW 0: Header with CMHP logo & Company Name */}
        <tr>
          <td colSpan={2} style={{ padding: '4px 8px' }}>
            <div className="mt-rm-header-inner">
              <div className="mt-rm-logo-wrap">
                <img src={logoSrc} alt="CMHP Logo" className="mt-rm-logo-img" />
              </div>
              <div className="mt-rm-company-title">
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

        {/* ROW 1: PRODUCTION  (ATTACHMENT 1) */}
        <tr>
          <td colSpan={2} style={{ textAlign: 'center', padding: '6px' }}>
            <QcSlipText
              value={data.prod_attachment_label || 'PRODUCTION  (ATTACHMENT 1)'}
              onChange={(v) => update('prod_attachment_label', v)}
              readOnly={!isEditable}
              style={{ fontSize: '12pt', fontWeight: 700, textAlign: 'center', width: '100%' }}
            />
          </td>
        </tr>

        {/* ROW 2: RM REQUEST FOR  MOTHER  TINCTURE | DATE/ TR NO : */}
        <tr>
          <td style={{ textAlign: 'center' }}>
            <QcSlipText
              value={data.slip_title || 'RM REQUEST FOR  MOTHER  TINCTURE'}
              onChange={(v) => update('slip_title', v)}
              readOnly={!isEditable}
              style={{ fontWeight: 700, textAlign: 'center', width: '100%' }}
            />
          </td>
          <td>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <QcSlipText
                value={data.date_tr_no_label || 'DATE/ TR NO :'}
                onChange={(v) => update('date_tr_no_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, marginRight: 6, whiteSpace: 'nowrap' }}
              />
              <QcSlipInput
                value={data.date_tr_no || ''}
                onChange={(v) => update('date_tr_no', v)}
                readOnly={!isEditable}
                style={{ flex: 1 }}
              />
            </div>
          </td>
        </tr>

        {/* ROW 3: DEPARTMENT :  MOTHER TINCTURE | FORME NO. SOP/MT/01/F01-00 */}
        <tr>
          <td>
            <QcSlipText
              value={data.department_label || 'DEPARTMENT :  MOTHER TINCTURE'}
              onChange={(v) => update('department_label', v)}
              readOnly={!isEditable}
              style={{ fontWeight: 700, width: '100%' }}
            />
          </td>
          <td>
            <QcSlipText
              value={data.form_no_label || 'FORME NO. SOP/MT/01/F01-00'}
              onChange={(v) => update('form_no_label', v)}
              readOnly={!isEditable}
              style={{ fontWeight: 700, width: '100%' }}
            />
          </td>
        </tr>

        {/* ROW 4: HERB : */}
        <tr>
          <td colSpan={2}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <QcSlipText
                value={data.herb_label || 'HERB :'}
                onChange={(v) => update('herb_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, marginRight: 6, whiteSpace: 'nowrap' }}
              />
              <QcSlipInput
                value={data.herb || ''}
                onChange={(v) => update('herb', v)}
                readOnly={!isEditable}
                style={{ flex: 1, fontWeight: 700 }}
              />
            </div>
          </td>
        </tr>

        {/* ROW 5: BATCH NO. : | MFG DATE : */}
        <tr>
          <td colSpan={2}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', flex: 1, marginRight: 24 }}>
                <QcSlipText
                  value={data.batch_no_label || 'BATCH NO. :'}
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
              <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <QcSlipText
                  value={data.mfg_date_label || 'MFG DATE :'}
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
            </div>
          </td>
        </tr>

        {/* ROW 6: QUANTITY OF HERB : */}
        <tr>
          <td colSpan={2}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <QcSlipText
                value={data.qty_herb_label || 'QUANTITY OF HERB :'}
                onChange={(v) => update('qty_herb_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, marginRight: 6, whiteSpace: 'nowrap' }}
              />
              <QcSlipInput
                value={data.qty_herb || ''}
                onChange={(v) => update('qty_herb', v)}
                readOnly={!isEditable}
                style={{ flex: 1 }}
              />
            </div>
          </td>
        </tr>

        {/* ROW 7: REQUESTED BY /DATE(PROD.) : | ISSUED BY/DATE(WH) : | CHEKED BY/DATE (QA): */}
        <tr>
          <td colSpan={2} style={{ padding: '6px 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', flex: 1, marginRight: 16 }}>
                <QcSlipText
                  value={data.requested_by_label || 'REQUESTED BY /DATE(PROD.) :'}
                  onChange={(v) => update('requested_by_label', v)}
                  readOnly={!isEditable}
                  style={{ fontWeight: 700, marginRight: 4, whiteSpace: 'nowrap' }}
                />
                <QcSlipInput
                  value={data.requested_by || ''}
                  onChange={(v) => update('requested_by', v)}
                  readOnly={!isEditable}
                  style={{ flex: 1 }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <QcSlipText
                  value={data.issued_by_label || 'ISSUED BY/DATE(WH) :'}
                  onChange={(v) => update('issued_by_label', v)}
                  readOnly={!isEditable}
                  style={{ fontWeight: 700, marginRight: 4, whiteSpace: 'nowrap' }}
                />
                <QcSlipInput
                  value={data.issued_by || ''}
                  onChange={(v) => update('issued_by', v)}
                  readOnly={!isEditable}
                  style={{ flex: 1 }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
              <QcSlipText
                value={data.checked_by_label || 'CHEKED BY/DATE (QA):'}
                onChange={(v) => update('checked_by_label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, marginRight: 6, whiteSpace: 'nowrap' }}
              />
              <QcSlipInput
                value={data.checked_by || ''}
                onChange={(v) => update('checked_by', v)}
                readOnly={!isEditable}
                style={{ width: 170 }}
              />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

function MtRmSmallTable({ data = {}, onChange, isEditable = true }) {
  const defaultTable2Rows = [
    { label: 'DATE & FOR', value: '' },
    { label: 'NAME', value: '' },
    { label: 'DRUG QTY', value: '' },
    { label: 'ALC Qty', value: '' },
    { label: 'WATER QTY', value: '' },
    { label: 'MAKE UP', value: '' },
  ]
  const rows = data.table2_rows && data.table2_rows.length > 0 ? data.table2_rows : defaultTable2Rows

  const updateRow = (idx, field, val) => {
    if (!isEditable || !onChange) return
    const nextRows = [...rows]
    nextRows[idx] = {
      ...nextRows[idx],
      [field]: val,
    }
    onChange({ ...data, table2_rows: nextRows })
  }

  return (
    <table className="mt-rm-table2">
      <colgroup>
        <col style={{ width: '105pt' }} />
        <col style={{ width: '321pt' }} />
      </colgroup>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={idx}>
            <td className="mt-rm-table2-lbl">
              <QcSlipText
                value={row.label}
                onChange={(v) => updateRow(idx, 'label', v)}
                readOnly={!isEditable}
                style={{ fontWeight: 700, textAlign: 'center', width: '100%' }}
              />
            </td>
            <td className="mt-rm-table2-val">
              <QcSlipInput
                value={row.value || ''}
                onChange={(v) => updateRow(idx, 'value', v)}
                readOnly={!isEditable}
                style={{ width: '100%' }}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function MotherTinctureRmSlip({
  data = {},
  onChange,
  company = {},
  product = {},
  formula = {},
  revision = {},
}) {
  const isTej = isTejBiocare(company) || isTejBiocare()
  const branding = getCompanyBranding(isTej ? 'tej' : 'cmhp')

  return (
    <div className="mt-rm-page cmhp-printable-slip">
      {/* Copy 1: Shown on screen (Editable) & in print / PDF */}
      <div className="mt-rm-sheet">
        <MtRmFormTable
          data={data}
          onChange={onChange}
          isEditable={true}
          branding={branding}
        />
      </div>

      {/* Copy 2: Hidden on screen, shown in print / PDF stacked below Copy 1 */}
      <div className="mt-rm-copy-gap print-only-copy" />
      <div className="mt-rm-sheet print-only-copy">
        <MtRmFormTable
          data={data}
          onChange={onChange}
          isEditable={false}
          branding={branding}
        />
      </div>

      {/* Small Two-Column Table below both forms */}
      <div className="mt-rm-table2-wrap">
        <MtRmSmallTable
          data={data}
          onChange={onChange}
          isEditable={true}
        />
      </div>
    </div>
  )
}
