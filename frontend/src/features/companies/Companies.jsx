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

  const [activeTab, setActiveTab] = useState(
    'users'
  )


  const canAccess =
    canViewCompanies(user)

  const canAccessUsers =
    canManageAccess(user)

  const canAccessDepartments =
    canManageDepartments(user)


  if (!canAccess) {

    return (
      <div className="companies">

        <section className="company-panel company-no-access">

          <h1>
            User Management
          </h1>

          <p>
            Your current role does not have
            access to user and department
            administration. Ask a Super Admin
            to review your permissions.
          </p>

        </section>

      </div>
    )
  }


  return (
    <div className="companies">

      <header className="company-header">

        <div>

          <span className="company-eyebrow">
            Administration
          </span>

          <h1>
            User Management
          </h1>

          <p>
            Manage ERP user accounts and
            departments from one controlled
            administration area.
          </p>

        </div>


        <div
          className="company-header-mark"
          aria-hidden="true"
        >
          <span>
            +
          </span>
        </div>

      </header>


      <div className="company-tabs">

        {canAccessUsers && (

          <button
            type="button"
            className={
              activeTab === 'users'
                ? 'company-tab active'
                : 'company-tab'
            }
            onClick={() =>
              setActiveTab('users')
            }
          >
            Users
          </button>

        )}


        {canAccessDepartments && (

          <button
            type="button"
            className={
              activeTab === 'departments'
                ? 'company-tab active'
                : 'company-tab'
            }
            onClick={() =>
              setActiveTab('departments')
            }
          >
            Departments
          </button>

        )}

      </div>


      {activeTab === 'users' &&
        canAccessUsers && (
          <UserAccessTab />
        )}


      {activeTab === 'departments' &&
        canAccessDepartments && (
          <DepartmentsTab />
        )}

    </div>
  )
}