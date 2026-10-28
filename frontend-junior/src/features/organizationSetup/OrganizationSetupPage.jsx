import { useState } from 'react'

import Alert from '../../components/Alert'
import useAuth from '../../hooks/useAuth'
import OrgCompaniesTab from './tabs/OrgCompaniesTab'
import OrgStoresTab from './tabs/OrgStoresTab'
import OrgCompanyAccessTab from './tabs/OrgCompanyAccessTab'
import OrgStoreAccessTab from './tabs/OrgStoreAccessTab'
import OrgUnitsTab from './tabs/OrgUnitsTab'
import OrgConfirmationPolicyTab from './tabs/OrgConfirmationPolicyTab'
import './OrganizationSetupPage.css'

const TABS = [
  { key: 'companies', label: 'Companies', Component: OrgCompaniesTab },
  { key: 'stores', label: 'Shared stores', Component: OrgStoresTab },
  { key: 'company-access', label: 'Company roles & memberships', Component: OrgCompanyAccessTab },
  { key: 'store-access', label: 'Store roles & memberships', Component: OrgStoreAccessTab },
  { key: 'units', label: 'Units of measure', Component: OrgUnitsTab },
  { key: 'confirmation-policy', label: 'Sales order confirmation policy', Component: OrgConfirmationPolicyTab },
]

// Reachable with zero company/store membership by design (see
// ProtectedRoute.jsx - it already falls through to this route's content
// for a user with no workspace). Authorization here is purely the real
// server-derived `capabilities.can_manage_organization_setup` flag, never
// `user.profile.role`/`user.is_superuser`/a mock-persona match - the exact
// pattern features/store/MaterialsTab.jsx already established for
// `can_manage_material_catalog`.
export default function OrganizationSetupPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState(TABS[0].key)

  const authorized = user?.capabilities?.can_manage_organization_setup === true

  if (!authorized) {
    return (
      <div className="org-page">
        <h2>Organization Setup</h2>
        <Alert type="error">
          Access unavailable. Setting up companies, shared stores, roles, units of measure and the sales-order
          confirmation policy requires active superuser access. Ask an administrator for access.
        </Alert>
      </div>
    )
  }

  const Active = TABS.find((t) => t.key === activeTab)?.Component || TABS[0].Component

  return (
    <div className="org-page">
      <h2>Organization Setup</h2>
      <p className="field-muted">
        Set up the ERP: companies, shared stores, access roles and who holds them, units of measure, and the
        sales-order confirmation policy. Every change here takes effect immediately and is enforced by the server.
      </p>

      <div className="org-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`org-tab-button ${activeTab === tab.key ? 'is-active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="org-tab-panel">
        <Active />
      </div>
    </div>
  )
}
