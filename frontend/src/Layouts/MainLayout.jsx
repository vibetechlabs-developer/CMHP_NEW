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
    title: 'Setup',

    items: [

      {
        label: 'Organization Setup',
        path: '/organization-setup',
        icon: BuildingIcon,
        accent: '#6366f1',
        // Deliberately NOT companyOnly/requiresCompanyAccess - this must
        // stay visible (and the route itself stays reachable, see
        // ProtectedRoute.jsx) for an authorized administrator who has no
        // company or store membership at all, since setting those up is
        // this screen's own purpose.
        requiresOrgSetupAccess: true,
      },

    ],
  },


  {
    title: 'INVENTORY',

    items: [

      {
        label: 'Dashboard',
        path: '/inventory',
        icon: DashboardIcon,
        accent: '#2563eb',
        commonInventoryOnly: true,
      },

      {
        label: 'Products',
        path: '/products',
        icon: FlaskIcon,
        accent: '#22b8a6',
        commonInventoryOnly: true,
      },

      {
        label: 'Raw Materials',
        path: '/inventory/materials',
        icon: InventoryIcon,
        accent: '#8b7cf6',
        commonInventoryOnly: true,
      },

      {
        label: 'Orders',
        path: '/orders',
        icon: ClipboardIcon,
        accent: '#f2b84b',
        commonInventoryOnly: true,
      },

      {
        label: 'Stock & Lots',
        path: '/inventory/receipts',
        icon: InventoryIcon,
        accent: '#4f8cff',
        commonInventoryOnly: true,
      },

      {
        label: 'Issue / Return',
        path: '/inventory/receiving',
        icon: ReceiptIcon,
        accent: '#0b73df',
        commonInventoryOnly: true,
      },

      {
        label: 'Consumption Ledger',
        path: '/inventory/locations',
        icon: InventoryIcon,
        accent: '#34d399',
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


  // Real, server-derived capability - never the mock `role` label above.
  // This is deliberately independent of `companyWorkspace`/`commonInventory`
  // so it survives the two early-return branches below for a user with no
  // workspace selected at all.
  const orgSetupAccess =
    user?.capabilities?.can_manage_organization_setup === true


  if (commonInventory) {
    return NAV_SECTIONS
      .filter((section) => section.title === 'INVENTORY')
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => Boolean(item.commonInventoryOnly)),
      }))
  }

  return NAV_SECTIONS
    .map(
      (section) => ({
        ...section,
        items:
          section.items.filter(
            (item) => {
              if (
                item.requiresOrgSetupAccess
              ) {
                return orgSetupAccess
              }
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


  const location = useLocation()
  const isInventoryDashboard =
    item.path === '/inventory' &&
    (location.pathname === '/inventory' || location.pathname === '/inventory/dashboard' || location.pathname === '/inventory/')

  // The inventory section's own items (Raw Materials, Stock & Lots, ...)
  // need prefix matching so a detail route like /inventory/materials/4
  // still highlights its parent tab - but the section's "Dashboard" entry
  // (path '/inventory' itself) must stay exact-only, or that same prefix
  // match makes it "active" for every /inventory/* route, including every
  // other inventory tab's own detail pages (isInventoryDashboard above
  // already covers the few paths that really do mean "the dashboard").
  // Every item outside this section keeps its original exact-match
  // behaviour unchanged.
  const end = item.path === '/inventory' ? true : !item.commonInventoryOnly

  return (

    <NavLink
      to={item.path}
      end={end}
      onClick={onNavigate}
      data-label={item.label}
      title={
        collapsed
          ? item.label
          : undefined
      }
      className={({ isActive }) =>
        isActive || isInventoryDashboard
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

  const isCommonInventory =
    activeWorkspace === WORKSPACES.COMMON ||
    activeWorkspace === 'common_inventory' ||
    location.pathname.startsWith('/inventory')

  // Items that need a real company permission are shown only when it is held.
  const sections =
    visibleSections(
      user,
      isCommonInventory ? WORKSPACES.COMMON : activeWorkspace
    ).map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.permission || hasPermission(item.permission)),
    }))

  const companyLogo =
    isCommonInventory ? null : getCompanyLogo(activeWorkspace)

  const isCompanyWorkspace =
    !isCommonInventory &&
    (activeWorkspace === WORKSPACES.COMPANY_A || activeWorkspace === WORKSPACES.COMPANY_B)

  const sidebarBrandName =
    isCommonInventory
      ? 'Common Inventory'
      : isCompanyWorkspace && activeOption?.name
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