import { useState } from 'react'
import QcList from '../qc/QcList'
import QcViewPage from '../qc/QcViewPage'

/**
 * COA Documents Tab
 * Direct integration of Fenil's Certificate of Analysis Register and dedicated
 * dosage-form analytical sheets (Syrup, Drops, Mother Tincture, Tablet, Oil/Liquid).
 *
 * Provides:
 * 1. Certificate of Analysis Register table with BMR completed orders
 * 2. Dedicated interactive COA forms with Save Draft, Print CoA, and Download PDF (via html2pdf.js)
 * 3. Dynamic company branding for CMHP and Tej Biocare
 */
export default function CoaDocumentTab({ companyId }) {
  const [selectedOrderId, setSelectedOrderId] = useState(null)

  if (selectedOrderId) {
    return (
      <div className="coa-interactive-workspace" style={{ marginTop: 8 }}>
        <QcViewPage
          orderId={selectedOrderId}
          onBack={() => setSelectedOrderId(null)}
        />
      </div>
    )
  }

  return (
    <div className="coa-register-workspace" style={{ marginTop: 8 }}>
      <QcList
        companyId={companyId}
        onSelectOrder={(orderId) => setSelectedOrderId(orderId)}
      />
    </div>
  )
}
