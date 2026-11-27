import React from 'react'
import { QcAutoCell } from '../../qc/qcSharedComponents'
import { getCompanyBranding, isTejBiocare } from '../../../utils/companyBranding.js'
import dropsLogo from '../../../assets/drops_logo.png'

export default function DropsSlipHeader({
  headerData = {},
  onHeaderChange,
  company = {},
  department = 'PRODUCTION ( ORAL LIQUID DEPARTMENT)',
}) {
  const isTejActive = isTejBiocare(company) || isTejBiocare()
  const branding = getCompanyBranding(isTejActive ? 'tej' : 'cmhp')
  const rawCompanyName = company?.display_name || company?.name || ''
  const companyTitle = branding.isTej
    ? branding.headerName
    : (!rawCompanyName || rawCompanyName.toUpperCase() === 'CMHP' || rawCompanyName.toUpperCase().includes('CENTRAL')
        ? 'CMHP PRIVATE LIMITED'
        : rawCompanyName.toUpperCase())

  const handleChange = (field, value) => {
    if (onHeaderChange) {
      onHeaderChange(field, value)
    }
  }

  const logoSrc = branding.isTej ? branding.logoSrc : dropsLogo

  return (
    <div className="bmr-exact-header-box">
      <div className="bmr-exact-top-banner">
        <div className={`bmr-exact-logo-wrap ${branding.isTej ? 'bmr-exact-logo-wrap-tej' : ''}`}>
          <img
            src={logoSrc}
            alt={branding.headerName}
            className={`bmr-exact-logo-img ${branding.isTej ? 'bmr-exact-logo-img-tej' : ''}`}
            crossOrigin="anonymous"
          />
        </div>
        <div className="bmr-exact-company-title">
          {companyTitle}
        </div>
      </div>

      <div className="bmr-exact-dept-bar">
        {department}
      </div>

      <div className="bmr-exact-bmr-bar">
        BATCH MANUFACTURING RECORD (BMR)
      </div>

      <table className="bmr-exact-meta-grid">
        <tbody>
          <tr>
            <td style={{ width: '50%' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span className="bmr-field-lbl" style={{ whiteSpace: 'nowrap', marginRight: 4 }}>PRODUCT : </span>
                <QcAutoCell
                  value={headerData.product || ''}
                  onChange={(e) => handleChange('product', e.target.value)}
                  style={{ fontWeight: 'bold' }}
                />
              </div>
            </td>
            <td style={{ width: '50%' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span className="bmr-field-lbl" style={{ whiteSpace: 'nowrap', marginRight: 4 }}>BMR NO. : </span>
                <QcAutoCell
                  value={headerData.bmr_no || ''}
                  onChange={(e) => handleChange('bmr_no', e.target.value)}
                />
              </div>
            </td>
          </tr>
          <tr>
            <td>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span className="bmr-field-lbl" style={{ whiteSpace: 'nowrap', marginRight: 4 }}>PRODUCT CODE : </span>
                <QcAutoCell
                  value={headerData.product_code || ''}
                  onChange={(e) => handleChange('product_code', e.target.value)}
                />
              </div>
            </td>
            <td>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span className="bmr-field-lbl" style={{ whiteSpace: 'nowrap', marginRight: 4 }}>EFFECTIVE DATE : </span>
                <QcAutoCell
                  value={headerData.effective_date || '12-04-2024'}
                  onChange={(e) => handleChange('effective_date', e.target.value)}
                />
              </div>
            </td>
          </tr>
          <tr>
            <td>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span className="bmr-field-lbl" style={{ whiteSpace: 'nowrap', marginRight: 4 }}>COMPANY CODE : </span>
                <QcAutoCell
                  value={headerData.company_code || (branding.isTej ? branding.code : (company?.code || 'AAHP'))}
                  onChange={(e) => handleChange('company_code', e.target.value)}
                />
              </div>
            </td>
            <td>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span className="bmr-field-lbl" style={{ whiteSpace: 'nowrap', marginRight: 4 }}>SUPERSEDES NO : </span>
                <QcAutoCell
                  value={headerData.supersedes_no || '00'}
                  onChange={(e) => handleChange('supersedes_no', e.target.value)}
                />
              </div>
            </td>
          </tr>
          <tr>
            <td>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span className="bmr-field-lbl" style={{ whiteSpace: 'nowrap', marginRight: 4 }}>BATCH NO. : </span>
                <QcAutoCell
                  value={headerData.batch_no || ''}
                  onChange={(e) => handleChange('batch_no', e.target.value)}
                />
              </div>
            </td>
            <td>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span className="bmr-field-lbl" style={{ whiteSpace: 'nowrap', marginRight: 4 }}>VERSION NO  : </span>
                <QcAutoCell
                  value={headerData.version_no || '01'}
                  onChange={(e) => handleChange('version_no', e.target.value)}
                />
              </div>
            </td>
          </tr>
          <tr>
            <td>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span className="bmr-field-lbl" style={{ whiteSpace: 'nowrap', marginRight: 4 }}>MFG. FOR : </span>
                <QcAutoCell
                  value={headerData.mfg_for || ''}
                  onChange={(e) => handleChange('mfg_for', e.target.value)}
                />
              </div>
            </td>
            <td>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span className="bmr-field-lbl" style={{ whiteSpace: 'nowrap', marginRight: 4 }}>MASTER FORMULA NO. : </span>
                <QcAutoCell
                  value={headerData.master_formula_no || ''}
                  onChange={(e) => handleChange('master_formula_no', e.target.value)}
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
