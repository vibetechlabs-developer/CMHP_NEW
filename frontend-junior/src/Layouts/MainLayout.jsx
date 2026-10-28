import { useState, useEffect } from 'react'

import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom'

import useAuth from '../hooks/useAuth'
import useWorkspace from '../hooks/useWorkspace'
import { demoNoticeText, demoStatusFor } from './demoStatus'

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
  getCurrentWorkspace,
  getSelectedWorkspace,
  requiresWorkspaceSelection,
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
    title: 'Inventory',

    items: [

      {
        label: 'Dashboard',
        path: '/inventory',
        icon: InventoryIcon,
        accent: '#8b7cf6',
        commonInventoryOnly: true,
      },

      {
        label: 'Products',
        path: '/inventory/products',
        icon: FlaskIcon,
        accent: '#8b7cf6',
        commonInventoryOnly: true,
      },

      {
        label: 'Material Master',
        path: '/inventory/materials',
        icon: InventoryIcon,
        accent: '#8b7cf6',
        commonInventoryOnly: true,
      },

      {
        label: 'Suppliers',
        path: '/inventory/suppliers',
        icon: ClipboardIcon,
        accent: '#8b7cf6',
        commonInventoryOnly: true,
      },

      {
        label: 'Purchasing',
        path: '/inventory/orders',
        icon: ClipboardIcon,
        accent: '#8b7cf6',
        commonInventoryOnly: true,
      },

      {
        label: 'Stock & Lots',
        path: '/inventory/stock',
        icon: InventoryIcon,
        accent: '#8b7cf6',
        commonInventoryOnly: true,
      },

      {
        label: 'Issue / Return',
        path: '/inventory/issue-return',
        icon: InventoryIcon,
        accent: '#8b7cf6',
        commonInventoryOnly: true,
      },


      {
        label: 'Batch Planning',
        path: '/inventory/batch-planning',
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
      },

      {
        label: 'Designations',
        path: '/hrms/designations',
        icon: ClipboardIcon,
        accent: '#f472b6',
        companyOnly: true,
        requiresHrmsMasters: true,
      },


      /* =====================================================
         PAYROLL

         Admin / Super Admin only
         ===================================================== */

      {
        label: 'Payroll',
        path: '/hrms/payroll',
        icon: WalletIcon,
        accent: '#f472b6',
        companyOnly: true,
        adminOnly: true,
      },


      /* =====================================================
         AUDIT LOGS

         Management / HR Admin / HR Manager / Super Admin
         ===================================================== */

      {
        label: 'Audit Logs',
        path: '/hrms/audit-log',
        icon: ClipboardIcon,
        accent: '#f472b6',
        companyOnly: true,
        requiresHrmsManage: true,
      },


      /* =====================================================
         MY SALARY

         Normal employees / users
         ===================================================== */

      {
        label: 'My Salary',
        path: '/hrms/my-salary',
        icon: WalletIcon,
        accent: '#f472b6',
        companyOnly: true,
        nonAdminOnly: true,
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
    user?.profile?.role ||
    user?.role ||
    ''


  const commonInventory =
    activeWorkspace ===
    WORKSPACES.COMMON


  const companyWorkspace =
    activeWorkspace ===
    WORKSPACES.COMPANY_A ||
    activeWorkspace ===
    WORKSPACES.COMPANY_B ||
    (!commonInventory && Boolean(activeWorkspace))


  /*
   * ADMIN CHECK
   */

  const isAdmin =
    Boolean(
      user?.is_superuser
    ) ||
    role === 'SUPER_ADMIN'


  /*
   * COMPANY ACCESS
   */

  const companyAccess =
    isAdmin ||
    role === 'MANAGEMENT' ||
    role === 'HR_ADMINISTRATOR' ||
    role === 'HR_MANAGER'


  /*
   * HR MANAGEMENT ACCESS
   */

  const hrmsManageAccess =
    isAdmin ||
    role === 'HR_ADMINISTRATOR' ||
    role === 'HR_MANAGER' ||
    role === 'MANAGEMENT'


  /*
   * HR MASTER ACCESS
   */

  const hrmsMastersAccess =
    isAdmin ||
    role === 'HR_ADMINISTRATOR'


  return NAV_SECTIONS

    .map(
      (section) => ({

        ...section,

        items:
          section.items.filter(
            (item) => {

              /*
               * COMMON INVENTORY
               */

              if (
                commonInventory
              ) {

                return Boolean(
                  item.commonInventoryOnly
                )

              }


              /*
               * COMPANY WORKSPACE
               */

              if (
                companyWorkspace &&
                item.commonInventoryOnly
              ) {

                return false

              }


              /*
               * COMPANY ONLY
               */

              if (
                item.companyOnly &&
                !companyWorkspace
              ) {

                return false

              }


              /*
               * COMPANY MANAGEMENT
               */

              if (
                item.requiresCompanyAccess &&
                !companyAccess
              ) {

                return false

              }


              /*
               * HR MANAGEMENT
               */

              if (
                item.requiresHrmsManage &&
                !hrmsManageAccess
              ) {

                return false

              }


              /*
               * HR MASTER
               */

              if (
                item.requiresHrmsMasters &&
                !hrmsMastersAccess
              ) {

                return false

              }


              /*
               * ADMIN ONLY
               */

              if (
                item.adminOnly &&
                !isAdmin
              ) {

                return false

              }


              /*
               * NON ADMIN ONLY
               */

              if (
                item.nonAdminOnly &&
                isAdmin
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
   NAV ACTIVE HELPER
   ========================================================= */

function isNavActive(itemPath, currentPath) {
  const normCurrent = currentPath.replace(/\/+$/, '') || '/'
  const normItem = itemPath.replace(/\/+$/, '') || '/'

  // 1. Exact match
  if (normCurrent === normItem) {
    return true
  }

  // 2. Dashboards / section root links must ONLY match exact (or their dashboard aliases)
  if (normItem === '/inventory') {
    return normCurrent === '/inventory' || normCurrent === '/inventory/overview' || normCurrent === '/inventory/dashboard'
  }
  if (normItem === '/hrms') {
    return normCurrent === '/hrms' || normCurrent === '/hrms/dashboard'
  }
  if (normItem === '/dashboard') {
    return normCurrent === '/dashboard'
  }

  // 3. Known aliases
  if (normItem === '/hrms/designations' && normCurrent.startsWith('/hrms/designation')) {
    return true
  }
  if (normItem === '/hrms/payroll' && normCurrent.startsWith('/hrms/salary-history')) {
    return true
  }

  // 4. Nested sub-routes match (e.g. /products/2/15/formulas -> /products,
  // /inventory/materials/42 -> /inventory/materials,
  // /inventory/products/2/15/formulas -> /inventory/products)
  if (normCurrent.startsWith(normItem + '/')) {
    return true
  }

  return false
}


/* =========================================================
   NAV ITEM
   ========================================================= */

function NavItem({
  item,
  onNavigate,
  collapsed,
}) {

  const location = useLocation()

  const Icon =
    item.icon

  const demoStatus = demoStatusFor(item.path)

  const active = isNavActive(item.path, location.pathname)

  const iconStyle = {
    '--nav-accent':
      item.accent,
  }


  return (

    <NavLink
      to={item.path}
      onClick={onNavigate}
      data-label={item.label}
      title={
        collapsed
          ? item.label
          : undefined
      }
      aria-current={active ? 'page' : undefined}
      className={() => (active ? 'nav-link active' : 'nav-link')}
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

  const {
    user,
    logout,
  } = useAuth()


  const {
    activeWorkspace,
    activeOption,
    setActiveWorkspace,
  } = useWorkspace()


  const navigate =
    useNavigate()

  const location =
    useLocation()

  const pageStatus = demoStatusFor(location.pathname)
  const pageDemoNotice = pageStatus === 'partial' ? demoNoticeText(pageStatus) : null


  const [
    menuOpen,
    setMenuOpen,
  ] = useState(false)

  const [
    collapsed,
    setCollapsed,
  ] = useState(() => {
    try {
      return localStorage.getItem('cmhp_sidebar_collapsed') === 'true'
    } catch {
      return false
    }
  })

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('cmhp_sidebar_collapsed', String(next))
      } catch {}
      return next
    })
  }


  const effectiveWorkspace =
    activeWorkspace ||
    getCurrentWorkspace(user) ||
    getSelectedWorkspace() ||
    WORKSPACES.COMPANY_A


  useEffect(() => {
    if (user && effectiveWorkspace && effectiveWorkspace !== activeWorkspace && setActiveWorkspace) {
      setActiveWorkspace(effectiveWorkspace)
    }
  }, [user, effectiveWorkspace, activeWorkspace, setActiveWorkspace])


  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true })
      return
    }
    if (!effectiveWorkspace && requiresWorkspaceSelection(user)) {
      navigate('/workspace-select', { replace: true })
    }
  }, [user, effectiveWorkspace, navigate])


  const displayName =
    user?.first_name ||
    user?.username ||
    'Admin'


  const initial =
    displayName
      .charAt(0)
      .toUpperCase()


  const sections =
    visibleSections(
      user,
      effectiveWorkspace
    )


  const companyLogo =
    getCompanyLogo(
      effectiveWorkspace
    )


  const currentCompanyName =
    activeOption?.name ||
    (effectiveWorkspace === WORKSPACES.COMPANY_B
      ? 'Tej Biocare'
      : effectiveWorkspace === WORKSPACES.COMMON
      ? 'Common Inventory'
      : 'CMHP Pharma')


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

      {/* =====================================================
          SIDEBAR
          ===================================================== */}

      <aside
        className={sidebarClass}
      >

        <div className="sidebar-brand">
          <span
            className="sidebar-mark"
            aria-hidden={!collapsed}
            onClick={collapsed ? toggleCollapsed : undefined}
            title={collapsed ? 'Click to expand sidebar' : undefined}
            role={collapsed ? 'button' : undefined}
            tabIndex={collapsed ? 0 : undefined}
            onKeyDown={collapsed ? (e) => (e.key === 'Enter' || e.key === ' ') && toggleCollapsed() : undefined}
          >
            {companyLogo ? (
              <img
                src={companyLogo}
                alt={currentCompanyName}
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
              <BuildingIcon size={20} />
            )}
          </span>

          {!collapsed && (
            <div className="sidebar-brand-text">
              <div className="sidebar-name-row">
                <span className="sidebar-name">
                  {currentCompanyName}
                </span>
              </div>
              <span className="sidebar-tag">
                Pharmaceutical ERP
              </span>
            </div>
          )}

          <button
            type="button"
            className="sidebar-collapse-toggle"
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {collapsed ? (
                <path d="m9 18 6-6-6-6" />
              ) : (
                <path d="m15 18-6-6 6-6" />
              )}
            </svg>
          </button>
        </div>

        <nav
          className="sidebar-nav"
          aria-label="Main navigation"
        >
          {sections.map(
            (section) => (
              <div key={section.title}>
                {!collapsed && (
                  <p className="nav-section-title">
                    <span className="nav-section-text">
                      {section.title}
                    </span>
                  </p>
                )}

                <div className="nav-list">
                  {section.items.map(
                    (item) => (
                      <NavItem
                        key={item.label}
                        item={item}
                        collapsed={collapsed}
                        onNavigate={() => setMenuOpen(false)}
                      />
                    )
                  )}
                </div>
              </div>
            )
          )}
        </nav>

        {!collapsed && (
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
                  <path d="M12 13c-4 0-6-2.5-6-6 4 0 6 2.5 6 6Z" />
                  <path d="M12 15c0-3.5 2-6 6-6 0 3.5-2 6-6 6Z" />
                </svg>
              </span>
              <p>
                <strong>Better Health</strong>
                <span>Brighter Tomorrow</span>
              </p>
            </div>
            <SidebarScene />
          </div>
        )}
      </aside>


      {menuOpen && (

        <div
          className="layout-overlay"
          onClick={() =>
            setMenuOpen(false)
          }
        />

      )}


      {/* =====================================================
          MAIN
          ===================================================== */}

      <div className="layout-main">

        <header className="layout-header">

          <button
            type="button"
            className="menu-toggle"
            onClick={() => {
              if (window.innerWidth < 768) {
                setMenuOpen(true)
              } else {
                toggleCollapsed()
              }
            }}
            title={collapsed ? 'Expand sidebar' : 'Toggle sidebar / menu'}
            aria-label={collapsed ? 'Expand sidebar' : 'Open menu'}
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

          <Outlet />

        </main>

      </div>

    </div>

  )

}