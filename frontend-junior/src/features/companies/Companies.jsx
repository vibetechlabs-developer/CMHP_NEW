import { useState } from 'react'
import useAuth from '../../hooks/useAuth'

import {
  canManageAccess,
  canManageDepartments,
  canViewCompanies,
} from './permissions'

import DepartmentsTab from './tabs/DepartmentsTab'
import UserAccessTab from './tabs/UserAccessTab'

import './Companies.css'

export default function Companies() {
  const { user } = useAuth()

  const [activeTab, setActiveTab] = useState('users')

  const canAccessUsers = canManageAccess(user)
  const canAccessDepartments = canManageDepartments(user)
  const canAccess = canAccessUsers || canAccessDepartments || canViewCompanies(user)

  /*
   * If the user does not have access to
   * User Management, show the access-denied state.
   */
  if (!canAccess) {
    return (
      <div className="companies">
        <section className="company-panel company-no-access">
          <h1>Administration</h1>
          <p className="company-text">
            Your current role does not have access to department or user administration.
            Contact your Super Administrator to review permissions.
          </p>
        </section>
      </div>
    )
  }

  /*
   * Resolve default tab if selected tab is not permitted
   */
  const resolvedTab =
    activeTab === 'users' && !canAccessUsers
      ? canAccessDepartments
        ? 'departments'
        : 'users'
      : activeTab === 'departments' && !canAccessDepartments
        ? canAccessUsers
          ? 'users'
          : 'departments'
        : activeTab

  return (
    <div className="companies">
      {/* =====================================================
          HEADER
          ===================================================== */}
      <header className="company-header">
        <div className="company-header-content">
          <span className="company-eyebrow">Enterprise Administration</span>
          <h1>User Management &amp; Access Control</h1>
          <p>
            Manage corporate user accounts, department assignments, and granular access permissions from one centralized console.
          </p>
        </div>

        <div className="company-header-mark" aria-hidden="true">
          <span>+</span>
        </div>
      </header>

      {/* =====================================================
          TABS
          ===================================================== */}
      <div className="company-tabs">
        {canAccessUsers && (
          <button
            type="button"
            className={
              resolvedTab === 'users'
                ? 'company-tab active'
                : 'company-tab'
            }
            onClick={() => setActiveTab('users')}
          >
            User Accounts &amp; Access
          </button>
        )}

        {canAccessDepartments && (
          <button
            type="button"
            className={
              resolvedTab === 'departments'
                ? 'company-tab active'
                : 'company-tab'
            }
            onClick={() => setActiveTab('departments')}
          >
            Departments
          </button>
        )}
      </div>

      {/* =====================================================
          TAB CONTENT
          ===================================================== */}
      {resolvedTab === 'users' && <UserAccessTab />}
      {resolvedTab === 'departments' && <DepartmentsTab />}
    </div>
  )
}