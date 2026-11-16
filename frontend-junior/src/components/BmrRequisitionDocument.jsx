import React from 'react'
import { formatDateIN } from '../utils/formatters'
import './BmrRequisitionDocument.css'
import { getCompanyBranding, isTejBiocare } from '../utils/companyBranding.js'

/**
 * BmrRequisitionDocument
 *
 * Authentic Pharmaceutical BMR Raw Material Requisition Slip (Attachment - 1)
 * Faithfully matches the GMP standard physical document layout from CMHP SOP/QA/04/F-02/00.
 */
export default function BmrRequisitionDocument({
  product = {},
  formula = {},
  revision = {},
  materials = [],
  batchQty = 1,
  batchUnit = 'L',
  scaleFactor = 1,
  approval = null,
  company = null,
  companyName = 'CMHP PHARMACEUTICALS PVT. LTD.',
  companyCode = 'CMHP',
  department = 'PRODUCTION ( ORAL LIQUID DEPARTMENT )',
  showWatermark = true,
  isPrintView = false,
}) {
  const isTej = isTejBiocare(company) || (companyName && isTejBiocare(companyName)) || (companyCode && isTejBiocare(companyCode)) || isTejBiocare()
  const branding = getCompanyBranding(isTej ? 'tej' : 'cmhp')
  const effectiveCompanyName = branding.isTej ? branding.headerName : (companyName && !companyName.toUpperCase().includes('TEJ') ? companyName : 'CMHP PHARMACEUTICALS PVT. LTD.')
  const effectiveCompanyCode = branding.isTej ? branding.code : 'CMHP'

  const status = approval?.status || (product?.formula_approval_status) || 'NOT_SUBMITTED'
  const isApproved = status === 'APPROVED'
  const isPending = status === 'PENDING'
  const isDeclined = status === 'DECLINED'

  const todayFormatted = formatDateIN(new Date())
  const submittedDate = approval?.submittedAt ? formatDateIN(approval.submittedAt) : todayFormatted
  const decidedDate = approval?.decidedAt ? formatDateIN(approval.decidedAt) : ''

  const submitterName = approval?.submittedBy || 'Production Chemist'
  const approverName = isApproved ? (approval?.decidedBy || 'Dr. R. K. Mehta') : ''
  const approverSig = isApproved && approverName
    ? `/${approverName.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.)\s*/i, '').trim().split(/\s+/)[0]}/`
    : ''

  // Format numbers cleanly
  const formatNum = (val) => {
    if (val === null || val === undefined || isNaN(val)) return '—'
    const num = Number(val)
    if (Number.isInteger(num)) return num.toString()
    return num.toFixed(3).replace(/\.?0+$/, '')
  }

  // Active / Excipient partitioning if available
  const activeMaterials = materials.filter(
    (m) => m.category === 'Active API' || !m.isExcipient
  )
  const excipientMaterials = materials.filter(
    (m) => m.category === 'Excipient' || m.isExcipient
  )

  const hasExcipientSplit = excipientMaterials.length > 0 && activeMaterials.length > 0

  return (
    <div id="bmr-requisition-print-doc" className={`bmr-document-container ${isPrintView ? 'is-print-mode' : ''}`}>
      {/* Visual Watermark for Draft / Pending / Declined */}
      {showWatermark && !isApproved && (
        <div className={`bmr-watermark ${isPending ? 'watermark-pending' : isDeclined ? 'watermark-declined' : 'watermark-draft'}`}>
          {isPending
            ? 'PENDING QC APPROVAL'
            : isDeclined
            ? 'DECLINED BY QC'
            : 'DRAFT - NOT APPROVED'}
        </div>
      )}

      {/* Main Document Box */}
      <div className="bmr-document-sheet">
        {/* =========================================================
            HEADER GRID
            ========================================================= */}
        <div className="bmr-header-box">
          <div className="bmr-header-top">
            <div className={`bmr-logo-cell ${branding.isTej ? 'bmr-logo-cell-tej' : ''}`}>
              <img
                src={branding.logoSrc}
                alt={branding.headerName}
                className={`bmr-logo-img ${branding.isTej ? 'bmr-logo-img-tej' : ''}`}
                loading="eager"
                onError={(e) => {
                  e.target.style.display = 'none'
                  if (e.target.nextSibling) e.target.nextSibling.style.display = 'block'
                }}
              />
              <div className="bmr-logo-fallback" style={{ display: 'none' }}>
                <span className="logo-initials">{effectiveCompanyCode}</span>
                <span className="logo-sub">{branding.isTej ? 'BIOCARE' : 'PHARMA'}</span>
              </div>
            </div>

            <div className="bmr-title-cell">
              <h1 className="bmr-company-name">{effectiveCompanyName}</h1>
              <div className="bmr-dept-name">{department}</div>
              <h2 className="bmr-doc-title">BATCH MANUFACTURING RECORD (BMR)</h2>
            </div>
          </div>

          {/* Meta Grid (2 bordered columns) */}
          <div className="bmr-meta-grid">
            <div className="bmr-meta-col left-col">
              <div className="bmr-meta-row">
                <span className="meta-label">PRODUCT :</span>
                <span className="meta-value bold-caps">{product.name || 'Cough Relief Syrup 100ml'}</span>
              </div>
              <div className="bmr-meta-row">
                <span className="meta-label">PRODUCT CODE :</span>
                <span className="meta-value">{product.code || 'PRD-1005'}</span>
              </div>
              <div className="bmr-meta-row">
                <span className="meta-label">COMPANY CODE :</span>
                <span className="meta-value">{effectiveCompanyCode}</span>
              </div>
              <div className="bmr-meta-row">
                <span className="meta-label">BATCH NO. :</span>
                <span className="meta-value">
                  {approval?.id ? `BMR-${approval.id.replace('FA-', '')}` : `BATCH-${Date.now().toString().slice(-5)}`}
                </span>
              </div>
              <div className="bmr-meta-row">
                <span className="meta-label">BATCH SIZE / QTY :</span>
                <span className="meta-value bold-caps">
                  {batchQty} {batchUnit}
                </span>
              </div>
            </div>

            <div className="bmr-meta-col right-col">
              <div className="bmr-meta-row">
                <span className="meta-label">BMR NO. :</span>
                <span className="meta-value">BMR/{effectiveCompanyCode}/PRD/04</span>
              </div>
              <div className="bmr-meta-row">
                <span className="meta-label">EFFECTIVE DATE :</span>
                <span className="meta-value">{submittedDate}</span>
              </div>
              <div className="bmr-meta-row">
                <span className="meta-label">SUPERSEDES NO. :</span>
                <span className="meta-value">00</span>
              </div>
              <div className="bmr-meta-row">
                <span className="meta-label">VERSION NO. :</span>
                <span className="meta-value">{revision.name || 'Rev 00'}</span>
              </div>
              <div className="bmr-meta-row">
                <span className="meta-label">MASTER FORMULA NO. :</span>
                <span className="meta-value">
                  MFN-{product.code ? product.code.replace('PRD-', '') : '001'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================
            SECTION BANNERS
            ========================================================= */}
        <div className="bmr-attachment-banner">
          <div className="attachment-title">ATTACHMENT - 1</div>
          <div className="attachment-subtitle">RAW MATERIAL REQUISITION SLIP</div>
        </div>

        <div className="bmr-formula-info-bar">
          <div className="formula-info-left">
            <strong>BATCH FORMULA:</strong> {formula.name || 'Commercial Master Formulation'}
          </div>
          <div className="formula-info-right">
            Formula Base: <strong>{formula.base_quantity || 100} {formula.base_unit || 'L'}</strong>
            {' • '}Scale Factor: <strong>{formatNum(scaleFactor)}×</strong>
          </div>
        </div>

        {/* =========================================================
            REQUISITION MATERIALS TABLE
            ========================================================= */}
        <div className="bmr-table-wrap">
          <table className="bmr-requisition-table">
            <thead>
              <tr>
                <th style={{ width: '45px' }}>Sr. No.</th>
                <th style={{ width: '90px' }}>RM Code</th>
                <th>RAW MATERIAL NAME</th>
                <th style={{ width: '130px' }}>Label Claim / Spec</th>
                <th style={{ width: '85px' }}>Qty. Req</th>
                <th style={{ width: '55px' }}>Unit</th>
                <th style={{ width: '120px' }}>AR.No. / Lot</th>
              </tr>
            </thead>
            <tbody>
              {materials.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: '#666' }}>
                    No materials specified in formulation.
                  </td>
                </tr>
              ) : hasExcipientSplit ? (
                <>
                  <tr className="bmr-group-header-row">
                    <td colSpan="7"><strong>ACTIVE PHARMACEUTICAL INGREDIENTS (API)</strong></td>
                  </tr>
                  {activeMaterials.map((mat, idx) => {
                    const scaledQtyNum = mat.scaledQuantity ?? mat.requiredQuantity ?? (Number(mat.baseQuantity || mat.base_quantity || 0) * (scaleFactor || 1))
                    return (
                      <tr key={mat.id || idx}>
                        <td className="text-center">{idx + 1}</td>
                        <td className="text-center bold-mono">{mat.rmCode || mat.rm_code || `RM-${String(idx + 1).padStart(3, '0')}`}</td>
                        <td className="mat-name-cell">{mat.name}</td>
                        <td>{mat.labelClaim || mat.label_claim || `${mat.baseQuantity || mat.base_quantity} ${mat.baseUnit || mat.unit || 'g'}`}</td>
                        <td className="text-right bold-mono">{formatNum(scaledQtyNum)}</td>
                        <td className="text-center">{mat.scaledUnit || mat.unit || 'kg'}</td>
                        <td className="text-center text-muted">{mat.arNo || mat.ar_no || '—'}</td>
                      </tr>
                    )
                  })}
                  <tr className="bmr-group-header-row">
                    <td colSpan="7"><strong>EXCIPIENTS &amp; VEHICLES</strong></td>
                  </tr>
                  {excipientMaterials.map((mat, idx) => {
                    const scaledQtyNum = mat.scaledQuantity ?? mat.requiredQuantity ?? (Number(mat.baseQuantity || mat.base_quantity || 0) * (scaleFactor || 1))
                    return (
                      <tr key={mat.id || idx}>
                        <td className="text-center">{activeMaterials.length + idx + 1}</td>
                        <td className="text-center bold-mono">{mat.rmCode || mat.rm_code || `RM-${String(activeMaterials.length + idx + 1).padStart(3, '0')}`}</td>
                        <td className="mat-name-cell">{mat.name}</td>
                        <td>{mat.labelClaim || mat.label_claim || 'q.s.'}</td>
                        <td className="text-right bold-mono">{formatNum(scaledQtyNum)}</td>
                        <td className="text-center">{mat.scaledUnit || mat.unit || 'kg'}</td>
                        <td className="text-center text-muted">{mat.arNo || mat.ar_no || '—'}</td>
                      </tr>
                    )
                  })}
                </>
              ) : (
                materials.map((mat, idx) => {
                  const scaledQtyNum = mat.scaledQuantity ?? mat.requiredQuantity ?? (Number(mat.baseQuantity || mat.base_quantity || 0) * (scaleFactor || 1))
                  return (
                    <tr key={mat.id || idx}>
                      <td className="text-center">{idx + 1}</td>
                      <td className="text-center bold-mono">{mat.rmCode || mat.rm_code || `RM-${String(idx + 1).padStart(3, '0')}`}</td>
                      <td className="mat-name-cell">{mat.name}</td>
                      <td>{mat.labelClaim || mat.label_claim || `${mat.baseQuantity || mat.base_quantity} ${mat.baseUnit || mat.unit || 'g'}`}</td>
                      <td className="text-right bold-mono">{formatNum(scaledQtyNum)}</td>
                      <td className="text-center">{mat.scaledUnit || mat.unit || 'kg'}</td>
                      <td className="text-center text-muted">{mat.arNo || mat.ar_no || '—'}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Formula Remarks or QC Feedback Notice */}
        {approval?.remarks && (
          <div className="bmr-notes-box">
            <strong>Production Notes / Remarks:</strong> {approval.remarks}
          </div>
        )}

        {isApproved && approval?.decisionRemarks && (
          <div className="bmr-approval-endorsement">
            <div className="endorsement-icon">✓</div>
            <div>
              <strong>QC / QA Release Endorsement:</strong> {approval.decisionRemarks}
              <div style={{ fontSize: '11px', marginTop: '2px', color: '#15803d' }}>
                Certified by <strong>{approverName}</strong> ({approval?.decidedByRole || 'QA / QC Manager'}) on {decidedDate}.
              </div>
            </div>
          </div>
        )}

        {isDeclined && approval?.declineReason && (
          <div className="bmr-decline-endorsement">
            <div className="endorsement-icon">✕</div>
            <div>
              <strong>QC Formulation Decline Notice [{approval.declineCategory || 'General'}]:</strong>{' '}
              {approval.declineReason}
              <div style={{ fontSize: '11px', marginTop: '2px', color: '#b91c1c' }}>
                Returned by <strong>{approval?.decidedBy || 'QC In-Charge'}</strong> ({approval?.decidedByRole || 'QC Reviewer'}) on {decidedDate}. Formula adjustment required before re-submission.
              </div>
            </div>
          </div>
        )}

        {/* =========================================================
            3-COLUMN SIGNOFF BOX
            ========================================================= */}
        <div className="bmr-signoff-box">
          {/* Box 1: Prepared By */}
          <div className="signoff-col">
            <div className="signoff-title">
              <strong>Prepared By</strong>
              <div className="signoff-designation">Production Chemist</div>
            </div>
            <div className="signoff-fields">
              <div className="signoff-line">
                <span className="sign-lbl">Name:</span>
                <span className="sign-val">{submitterName}</span>
              </div>
              <div className="signoff-line">
                <span className="sign-lbl">Signature:</span>
                <span className="sign-val sign-cursive">{submitterName ? `/${submitterName.split(' ')[0]}/` : ''}</span>
              </div>
              <div className="signoff-line">
                <span className="sign-lbl">Date:</span>
                <span className="sign-val">{submittedDate}</span>
              </div>
            </div>
          </div>

          {/* Box 2: Reviewed By */}
          <div className="signoff-col">
            <div className="signoff-title">
              <strong>Reviewed By</strong>
              <div className="signoff-designation">Production In-Charge</div>
            </div>
            <div className="signoff-fields">
              <div className="signoff-line">
                <span className="sign-lbl">Name:</span>
                <span className="sign-val">{isApproved ? 'S. K. Joshi' : '________________'}</span>
              </div>
              <div className="signoff-line">
                <span className="sign-lbl">Signature:</span>
                <span className="sign-val sign-cursive">{isApproved ? '/SKJoshi/' : ''}</span>
              </div>
              <div className="signoff-line">
                <span className="sign-lbl">Date:</span>
                <span className="sign-val">{isApproved ? submittedDate : '________________'}</span>
              </div>
            </div>
          </div>

          {/* Box 3: Approved / Declined By */}
          {isDeclined ? (
            <div className="signoff-col signoff-declined">
              <div className="signoff-title">
                <strong>Audit Outcome</strong>
                <div className="signoff-designation" style={{ color: '#dc2626', fontWeight: 700 }}>DECLINED BY QC</div>
              </div>
              <div className="signoff-fields">
                <div className="signoff-line">
                  <span className="sign-lbl">Name:</span>
                  <span className="sign-val">{approval?.decidedBy || 'QC In-Charge'}</span>
                </div>
                <div className="signoff-line">
                  <span className="sign-lbl">Role:</span>
                  <span className="sign-val">{approval?.decidedByRole || 'QC Reviewer'}</span>
                </div>
                <div className="signoff-line">
                  <span className="sign-lbl">Date:</span>
                  <span className="sign-val">{decidedDate || '—'}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className={`signoff-col ${isApproved ? 'signoff-approved' : ''}`}>
              <div className="signoff-title">
                <strong>Approved By</strong>
                <div className="signoff-designation">QA / QC Manager</div>
              </div>
              <div className="signoff-fields">
                <div className="signoff-line">
                  <span className="sign-lbl">Name:</span>
                  <span className="sign-val">{isApproved ? approverName : '________________'}</span>
                </div>
                <div className="signoff-line">
                  <span className="sign-lbl">Signature:</span>
                  <span className="sign-val sign-cursive">{isApproved ? approverSig : ''}</span>
                </div>
                <div className="signoff-line">
                  <span className="sign-lbl">Date:</span>
                  <span className="sign-val">{isApproved ? decidedDate : '________________'}</span>
                </div>
              </div>
              {isApproved && (
                <div className="official-stamp-badge">
                  <span className="stamp-circle">APPROVED<br /><small>QA/QC</small></span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* =========================================================
            DOCUMENT FOOTER CODE
            ========================================================= */}
        <div className="bmr-doc-footer">
          <div className="doc-form-code">FORM NO. SOP/QA/04/F-02/00</div>
          <div className="doc-pagination">Page 1 of 1</div>
        </div>
      </div>
    </div>
  )
}
