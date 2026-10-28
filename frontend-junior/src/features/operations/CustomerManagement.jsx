import CustomersPanel from './CustomersPanel'
import './CustomerManagement.css'

export default function CustomerManagement() {
  return (
    <div className="cust-mgmt">
      {/* =====================================================
          HEADER / HERO — same pattern as Companies.jsx
          ===================================================== */}
      <header className="cust-mgmt-header">
        <div className="cust-mgmt-header-content">
          <span className="cust-mgmt-eyebrow">Sales &amp; CRM</span>
          <h1>Customer Management</h1>
          <p>
            Manage your pharmaceutical clients, distributors, and institutional
            buyers. Track contact details, statuses, and linked sales orders from
            one centralised console.
          </p>
        </div>

        <div className="cust-mgmt-header-mark" aria-hidden="true">
          <span>+</span>
        </div>
      </header>

      {/* =====================================================
          PANEL CONTENT
          ===================================================== */}
      <CustomersPanel />
    </div>
  )
}
