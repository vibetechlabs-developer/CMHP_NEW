import { useState } from 'react'
import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom'

import { demoNoticeText, demoStatusFor } from './demoStatus'
import ScreenErrorBoundary from '../components/ScreenErrorBoundary'
import usePermissions from '../hooks/usePermissions'

import useAuth from '../hooks/useAuth'
import useWorkspace from '../hooks/useWorkspace'

import {
  DashboardIcon,
  InventoryIcon,
  FlaskIcon,
  TruckIcon,
  ShieldCheckIcon,
  UsersIcon,
  MenuIcon,
  LogoutIcon,
  ReceiptIcon,
  ClockIcon,
  CalendarIcon,
  WalletIcon,
  ClipboardIcon,
  BuildingIcon,
} from '../components/icons'

import {
  SidebarScene,
} from '../components/PharmaArt'

import WorkspaceSwitcher
  from '../components/WorkspaceSwitcher'

import {
  WORKSPACES,
} from '../utils/workspace'

import './MainLayout.css'


/* =========================================================
   NAVIGATION
   ========================================================= */

const NAV_SECTIONS = [

  {
    title: 'Main menu',

    items: [

      {
        label: 'Dashboard',
        path: '/dashboard',
        icon: DashboardIcon,
        accent: '#4f8cff',
        companyOnly: true,
      },

      {
        label: 'Products',
        path: '/products',
        icon: FlaskIcon,
        accent: '#22b8a6',
        companyOnly: true,
      },

      {
        label: 'Orders',
        path: '/orders',
        icon: ClipboardIcon,
        accent: '#f2b84b',
        companyOnly: true,
      },

      {
        label: 'Operations',
        path: '/operations',
        icon: FlaskIcon,
        accent: '#22b8a6',
        companyOnly: true,
      },

      {
        label: 'Quality Control',
        path: '/quality',
        icon: ShieldCheckIcon,
        accent: '#34d399',
        companyOnly: true,
      },

      {
        label: 'Invoicing',
        path: '/invoices',
        icon: ReceiptIcon,
        accent: '#0b73df',
        companyOnly: true,
      },

      {
        label: 'Supply Chain',
        path: '/supply-chain',
        icon: TruckIcon,
        accent: '#f5a623',
        companyOnly: true,
      },

      {
        label: 'Customer Management',
        path: '/customer-management',
        icon: UsersIcon,
        accent: '#34d399',
        companyOnly: true,
      },

      {
        label: 'User Management',
        path: '/companies',
        icon: UsersIcon,
        accent: '#34d399',
        companyOnly: true,
        requiresCompanyAccess: true,
      },

    ],
  },


  {
    title: 'Store & Materials',

    items: [

      {
        label: 'Materials',
        path: '/inventory/materials',
        icon: InventoryIcon,
        accent: '#8b7cf6',
        commonInventoryOnly: true,
      },

      {
        label: 'Locations',
        path: '/inventory/locations',
        icon: InventoryIcon,
        accent: '#8b7cf6',
        commonInventoryOnly: true,
      },

      {
        label: 'Recorded Receipts',
        path: '/inventory/receipts',
        icon: InventoryIcon,
        accent: '#8b7cf6',
        commonInventoryOnly: true,
      },

    ],
  },


  {
    title: 'HRMS',

    items: [

      {
        label: 'HR Dashboard',
        path: '/hrms',
        icon: BuildingIcon,
        accent: '#f472b6',
        companyOnly: true,
      },

      {
        label: 'Employees',
        path: '/hrms/employees',
        icon: UsersIcon,
        accent: '#f472b6',
        companyOnly: true,
        requiresHrmsManage: true,
      },

      {
        label: 'Attendance',
        path: '/hrms/attendance',
        icon: ClockIcon,
        accent: '#f472b6',
        companyOnly: true,
      },

      {
        label: 'Leave',
        path: '/hrms/leave',
        icon: CalendarIcon,
        accent: '#f472b6',
        companyOnly: true,
      },

      {
        label: 'Holidays',
        path: '/hrms/holidays',
        icon: CalendarIcon,
        accent: '#f472b6',
        companyOnly: true,
      },

      {
        label: 'Shifts',
        path: '/hrms/shifts',
        icon: ClockIcon,
        accent: '#f472b6',
        companyOnly: true,
        requiresHrmsMasters: true,
      },

      {
        label: 'Designations',
        path: '/hrms/designations',
        icon: ClipboardIcon,
        accent: '#f472b6',
        companyOnly: true,
        requiresHrmsMasters: true,
      },

      {
        label: 'Payroll',
        path: '/hrms/payroll',
        icon: WalletIcon,
        accent: '#f472b6',
        companyOnly: true,
        requiresHrmsMasters: true,
      },

      {
        label: 'HR Reports',
        path: '/hrms/reports',
        icon: ClipboardIcon,
        accent: '#f472b6',
        companyOnly: true,
        requiresHrmsManage: true,
      },

    ],
  },

]


/* =========================================================
   SIDEBAR PERMISSIONS
   ========================================================= */

function visibleSections(
  user,
  activeWorkspace
) {

  const role =
    user?.profile?.role


  const commonInventory =
    activeWorkspace ===
    WORKSPACES.COMMON


  const companyWorkspace =
    activeWorkspace ===
    WORKSPACES.COMPANY_A ||
    activeWorkspace ===
    WORKSPACES.COMPANY_B


  const companyAccess =
    user?.is_superuser ||
    role === 'SUPER_ADMIN' ||
    role === 'MANAGEMENT' ||
    role === 'HR_ADMINISTRATOR' ||
    role === 'HR_MANAGER'


  const hrmsManageAccess =
    user?.is_superuser ||
    role === 'SUPER_ADMIN' ||
    role === 'HR_ADMINISTRATOR' ||
    role === 'HR_MANAGER' ||
    role === 'MANAGEMENT'


  const hrmsMastersAccess =
    user?.is_superuser ||
    role === 'SUPER_ADMIN' ||
    role === 'HR_ADMINISTRATOR'


  return NAV_SECTIONS

    .map(
      (section) => ({

        ...section,

        items:
          section.items.filter(
            (item) => {

              /*
               * Common Inventory:
               * ONLY inventory items.
               */

              if (
                commonInventory
              ) {

                return Boolean(
                  item.commonInventoryOnly
                )

              }


              /*
               * Company A / Company B:
               * Inventory items are hidden.
               */

              if (
                companyWorkspace &&
                item.commonInventoryOnly
              ) {

                return false

              }


              if (
                item.companyOnly &&
                !companyWorkspace
              ) {

                return false

              }


              if (
                item.requiresCompanyAccess &&
                !companyAccess
              ) {

                return false

              }


              if (
                item.requiresHrmsManage &&
                !hrmsManageAccess
              ) {

                return false

              }


              if (
                item.requiresHrmsMasters &&
                !hrmsMastersAccess
              ) {

                return false

              }


              return true

            }
          ),

      })
    )

    .filter(
      (section) =>
        section.items.length > 0
    )

}


/* =========================================================
   NAV ITEM
   ========================================================= */

function NavItem({
  item,
  onNavigate,
  collapsed,
}) {

  const Icon =
    item.icon

  const demoStatus = demoStatusFor(item.path)

  const iconStyle = {
    '--nav-accent':
      item.accent,
  }


  return (

    <NavLink
      to={item.path}
      end
      onClick={onNavigate}
      data-label={item.label}
      title={
        collapsed
          ? item.label
          : undefined
      }
      className={({ isActive }) =>
        isActive
          ? 'nav-link active'
          : 'nav-link'
      }
    >

      <span
        className="nav-icon"
        style={iconStyle}
      >
        <Icon size={18} />
      </span>


      <span className="nav-label">
        {item.label}
      </span>

      {demoStatus && (
        <span className="nav-demo-tag" title={demoNoticeText(demoStatus)}>
          {demoStatus === 'demo' ? 'Coming soon' : 'Partly demo'}
        </span>
      )}

    </NavLink>

  )

}


/* =========================================================
   COMPANY LOGO
   ========================================================= */

function getCompanyLogo(
  workspaceId
) {

  if (
    workspaceId ===
    WORKSPACES.COMPANY_A
  ) {

    return '/logo.jpg'

  }


  if (
    workspaceId ===
    WORKSPACES.COMPANY_B
  ) {

    return '/logo2.jpeg'

  }


  return null

}


/* =========================================================
   MAIN LAYOUT
   ========================================================= */

export default function MainLayout() {

  const location = useLocation()
  // Unconnected areas render a "not connected" page instead, so only the
  // partly connected area gets a page-level notice.
  const pageStatus = demoStatusFor(location.pathname)
  const pageDemoNotice = pageStatus === 'partial' ? demoNoticeText(pageStatus) : null

  const {
    user,
    logout,
  } = useAuth()


  const {
    activeWorkspace,
    activeOption,
  } = useWorkspace()


  const navigate =
    useNavigate()


  const [
    menuOpen,
    setMenuOpen,
  ] = useState(false)


  const [
    collapsed,
  ] = useState(false)


  const displayName =
    user?.first_name ||
    user?.username ||
    'Admin'


  const initial =
    displayName
      .charAt(0)
      .toUpperCase()


  const { hasPermission } = usePermissions()

  // Items that need a real company permission are shown only when it is held.
  const sections =
    visibleSections(
      user,
      activeWorkspace
    ).map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.permission || hasPermission(item.permission)),
    }))


  const companyLogo =
    getCompanyLogo(
      activeWorkspace
    )

  // This used to always read "CMHP Pharma" here, no matter which company
  // workspace was actually active - the logo image next to it already
  // switched correctly (getCompanyLogo above), but the NAME never did.
  // That mismatch is exactly what made a genuine, correctly-scoped Tej
  // Biocare order look like a bug: the sidebar kept saying "CMHP Pharma"
  // the whole time, so there was no way to tell from this header alone
  // which company's workspace was actually open. Show the real active
  // company's name (already resolved onto activeOption by workspace.js)
  // while in a company workspace, and a neutral, company-agnostic label
  // the rest of the time (Common Inventory, or before any workspace is
  // chosen yet).
  const isCompanyWorkspace =
    activeWorkspace === WORKSPACES.COMPANY_A ||
    activeWorkspace === WORKSPACES.COMPANY_B

  const sidebarBrandName =
    isCompanyWorkspace && activeOption?.name
      ? activeOption.name
      : 'CMHP Platform'


  const sidebarClass = [
    'layout-sidebar',
    menuOpen
      ? 'open'
      : '',
    collapsed
      ? 'collapsed'
      : '',
  ]
    .filter(Boolean)
    .join(' ')


  return (

    <div className="layout">

      {/* SIDEBAR */}

      <aside
        className={sidebarClass}
      >

        <div className="sidebar-brand">

          <span
            className="sidebar-mark"
            aria-hidden="true"
          >

            {companyLogo ? (

              <img
                src={companyLogo}
                alt={
                  activeOption?.name ||
                  ''
                }
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  borderRadius: '12px',
                  display: 'block',
                  padding: '3px',
                  boxSizing: 'border-box',
                }}
              />

            ) : (

              <BuildingIcon
                size={20}
              />

            )}

          </span>


          <div className="sidebar-brand-text">

            <div className="sidebar-name-row">

              <span className="sidebar-name">
                {sidebarBrandName}
              </span>

            </div>


            <span className="sidebar-tag">
              Pharmaceutical ERP
            </span>

          </div>

        </div>


        <nav
          className="sidebar-nav"
          aria-label="Main navigation"
        >

          {sections.map(
            (section) => (

              <div
                key={section.title}
              >

                <p className="nav-section-title">

                  <span className="nav-section-text">
                    {section.title}
                  </span>

                </p>


                <div className="nav-list">

                  {section.items.map(
                    (item) => (

                      <NavItem
                        key={item.label}
                        item={item}
                        collapsed={
                          collapsed
                        }
                        onNavigate={() =>
                          setMenuOpen(
                            false
                          )
                        }
                      />

                    )
                  )}

                </div>

              </div>

            )
          )}

        </nav>


        <div
          className="sidebar-art"
          aria-hidden="true"
        >

          <div className="sidebar-art-text">

            <span className="sidebar-art-logo">

              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >

                <path d="M12 21v-8" />

                <path
                  d="M12 13c-4 0-6-2.5-6-6 4 0 6 2.5 6 6Z"
                />

                <path
                  d="M12 15c0-3.5 2-6 6-6 0 3.5-2 6-6 6Z"
                />

              </svg>

            </span>


            <p>

              <strong>
                Better Health
              </strong>

              <span>
                Brighter Tomorrow
              </span>

            </p>

          </div>


          <SidebarScene />

        </div>

      </aside>


      {menuOpen && (

        <div
          className="layout-overlay"
          onClick={() =>
            setMenuOpen(false)
          }
        />

      )}


      {/* MAIN */}

      <div className="layout-main">

        <header className="layout-header">

          <button
            type="button"
            className="menu-toggle"
            onClick={() =>
              setMenuOpen(true)
            }
            aria-label="Open menu"
          >

            <MenuIcon size={17} />

          </button>


          <div className="header-search">

            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >

              <circle
                cx="11"
                cy="11"
                r="7"
              />

              <path d="m20 20-4-4" />

            </svg>


            <input
              type="search"
              placeholder="Search companies, products, batches..."
              aria-label="Search"
            />

          </div>


          <div className="header-right">

            <WorkspaceSwitcher />


            <button
              type="button"
              className="header-icon-btn"
              aria-label="Notifications"
            >

              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >

                <path
                  d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"
                />

                <path d="M10 21h4" />

              </svg>

              <span
                className="header-notification-dot"
              />

            </button>


            {/* PROFILE */}

            <button
              type="button"
              className="user-chip user-chip-button"
              onClick={() =>
                navigate('/profile')
              }
              title="Open my profile"
              aria-label="Open my profile"
            >

              <span className="user-avatar">
                {initial}
              </span>


              <span className="user-meta">

                <span className="user-name">
                  {displayName}
                </span>


                {user?.email && (

                  <span className="user-email">
                    {user.email}
                  </span>

                )}

              </span>

            </button>


            <button
              type="button"
              className="logout-btn"
              onClick={logout}
              title="Logout"
              aria-label="Logout"
            >

              <LogoutIcon size={15} />

              <span>
                Logout
              </span>

            </button>

          </div>

        </header>


        <main className="layout-content">

          {pageDemoNotice && (
            <p className="demo-notice" role="note">
              {pageDemoNotice}
            </p>
          )}

          <ScreenErrorBoundary resetKey={location.key}>
            <Outlet />
          </ScreenErrorBoundary>

        </main>

      </div>

    </div>

  )

}