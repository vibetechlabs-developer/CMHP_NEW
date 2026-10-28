import { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'
import useWorkspace from '../../hooks/useWorkspace'

import {
  Sparkline,
  DonutChart,
  AreaTrendChart,
  GroupedBarChart,
} from './charts'

import {
  selectActiveCompanyId,
  selectActiveCompanyKey,
} from '../../utils/companySelectors'
import { inventoryService } from '../inventory/inventoryService'
import { listSalesOrders } from '../operations/salesOrdersService'
import { listProducts } from '../products/productsService'
import { listUsers } from '../companies/usersApiService'
import { getMyStores, getStoreSummary } from '../store/storeService'
import { listPurchaseOrders } from '../inventory/purchasingService'
import { getErrorMessage } from '../../utils/errors'

import './Dashboard.css'
import '../inventory/tabs/CommonInventory.css'

/* =========================================================
   DATE RANGE HELPERS
   ========================================================= */

function isWithinRange(dateStr, rangeType, customStart, customEnd) {
  if (!dateStr) return true
  if (rangeType === 'ALL') return true
  const itemDate = new Date(dateStr)
  const now = new Date()

  if (rangeType === 'TODAY') {
    return (
      itemDate.getFullYear() === now.getFullYear() &&
      itemDate.getMonth() === now.getMonth() &&
      itemDate.getDate() === now.getDate()
    )
  }

  if (rangeType === 'THIS_WEEK') {
    const oneWeekAgo = new Date(now.getTime() - 7 * 86400000)
    return itemDate >= oneWeekAgo && itemDate <= now
  }

  if (rangeType === 'THIS_MONTH') {
    return (
      itemDate.getFullYear() === now.getFullYear() &&
      itemDate.getMonth() === now.getMonth()
    )
  }

  if (rangeType === 'THIS_YEAR') {
    return itemDate.getFullYear() === now.getFullYear()
  }

  if (rangeType === 'CUSTOM') {
    const dateFormatted = dateStr.slice(0, 10)
    if (customStart && dateFormatted < customStart) return false
    if (customEnd && dateFormatted > customEnd) return false
    return true
  }

  return true
}

function getTimeBasedGreeting(hour) {
  if (hour >= 5 && hour < 12) return 'Good Morning'
  if (hour >= 12 && hour < 17) return 'Good Afternoon'
  if (hour >= 17 && hour < 21) return 'Good Evening'
  return 'Good Night'
}

function getDeadlineBadge(deadline, status) {
  if (!deadline) return { label: 'No Deadline', className: 'dash-deadline-normal' }
  const st = String(status || '').toUpperCase()
  if (['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(st)) {
    return { label: 'Completed', className: 'dash-deadline-normal' }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dead = new Date(`${deadline}T00:00:00`)
  const diffDays = Math.round((dead - today) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return { label: `Overdue by ${Math.abs(diffDays)}d`, className: 'dash-deadline-overdue' }
  }
  if (diffDays === 0) {
    return { label: 'Due Today', className: 'dash-deadline-due-soon' }
  }
  if (diffDays <= 7) {
    return { label: `${diffDays} days left`, className: 'dash-deadline-due-soon' }
  }
  return { label: `${diffDays} days left`, className: 'dash-deadline-normal' }
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return 'Just now'
  const seconds = Math.max(0, (Date.now() - new Date(timestamp).getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

/* =========================================================
   MAIN COMPANY DASHBOARD COMPONENT
   ========================================================= */

export default function Dashboard() {
  const { user } = useAuth()
  const { activeWorkspace } = useWorkspace()
  const navigate = useNavigate()

  // Redux state
  const erpState = useSelector((state) => state.erp || {})
  const activeCompIdFromSelector = useSelector(selectActiveCompanyId)
  const activeCompKeyFromSelector = useSelector(selectActiveCompanyKey)

  const realCompanies = user?.profile?.real_companies || []
  // Determine active company target with real backend company mapping
  const targetCompanyId = useMemo(() => {
    if (activeWorkspace?.id === 'company_b') {
      return realCompanies[1]?.id || 3
    }
    if (activeWorkspace?.id === 'company_a') {
      return realCompanies[0]?.id || 2
    }
    if (activeWorkspace?.companyId) {
      const raw = Number(activeWorkspace.companyId)
      // Slot 1 is first real company (CMHP, id: 2)
      if (raw === 1) return realCompanies[0]?.id || 2
      // Slot 2 is second real company (Tej Biocare, id: 3)
      if (raw === 2 && realCompanies.length > 1 && realCompanies[0]?.id === 2) {
        return realCompanies[1]?.id || 3
      }
      return raw
    }
    return Number(activeCompIdFromSelector) || realCompanies[0]?.id || 2
  }, [activeWorkspace, realCompanies, activeCompIdFromSelector])

  const companyName = useMemo(() => {
    const found = realCompanies.find((c) => c.id === targetCompanyId)
    if (found?.display_name || found?.name) return found.display_name || found.name
    return targetCompanyId === 3 ? 'Tej Biocare' : 'CMHP Pharma'
  }, [realCompanies, targetCompanyId])

  const isCompanyB = targetCompanyId === 3 || activeWorkspace?.id === 'company_b'
  const compKey = isCompanyB ? 'tej' : 'cmhp'

  // User role checking
  const role = String(user?.profile?.role || user?.role || '').toUpperCase()
  const isSuperAdmin = Boolean(user?.is_superuser) || role === 'SUPER_ADMIN'
  const isAdminOrManager =
    isSuperAdmin ||
    role === 'MANAGEMENT' ||
    role === 'HR_ADMINISTRATOR' ||
    role === 'HR_MANAGER' ||
    role === 'QUALITY_HEAD'

  // Time & Greeting
  const [currentHour] = useState(() => new Date().getHours())
  const greeting = getTimeBasedGreeting(currentHour)
  const displayName = user?.first_name || user?.username || 'Admin'

  const formattedToday = useMemo(() => {
    return new Date().toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }, [])

  // Date range filter: 'ALL' | 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'THIS_YEAR' | 'CUSTOM'
  const [dateRange, setDateRange] = useState('ALL')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  // Live Backend Data
  const [invSummary, setInvSummary] = useState(null)
  const [_invError, setInvError] = useState('')
  const [realOrders, setRealOrders] = useState([])
  const [realProducts, setRealProducts] = useState([])
  const [realUsers, setRealUsers] = useState([])
  const [realStoreSummary, setRealStoreSummary] = useState(null)
  const [realPurchaseOrders, setRealPurchaseOrders] = useState([])
  const [loadingData, setLoadingData] = useState(false)

  useEffect(() => {
    inventoryService
      .getDashboardSummary()
      .then((res) => setInvSummary(res.data))
      .catch((err) => setInvError(getErrorMessage(err)))
  }, [])

  useEffect(() => {
    if (!targetCompanyId) return
    setLoadingData(true)

    // 1. Live Sales Orders API
    listSalesOrders(targetCompanyId, { pageSize: 100 })
      .then((res) => setRealOrders(res.results || []))
      .catch(() => setRealOrders([]))

    // 2. Live Products API
    listProducts(targetCompanyId, { pageSize: 100 })
      .then((res) => setRealProducts(res.results || []))
      .catch(() => setRealProducts([]))

    // 3. Live Purchase Orders API
    listPurchaseOrders(targetCompanyId, { pageSize: 100 })
      .then((res) => setRealPurchaseOrders(res.results || []))
      .catch(() => setRealPurchaseOrders([]))

    // 4. Live Staff / Users API
    listUsers({ companyId: targetCompanyId })
      .then((users) => {
        if (users && users.length > 0) {
          setRealUsers(users)
        } else {
          listUsers().then((all) => setRealUsers(all || [])).catch(() => {})
        }
      })
      .catch(() => {
        listUsers().then((all) => setRealUsers(all || [])).catch(() => {})
      })

    // 5. Live Store & Stock Summary API
    getMyStores()
      .then(async (stores) => {
        if (stores && stores.length > 0) {
          const sum = await getStoreSummary(stores[0].id)
          setRealStoreSummary(sum)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingData(false))
  }, [targetCompanyId])

  /* =========================================================
     COMPANY DATA EXTRACTION (Strict Company Separation)
     ========================================================= */

  const companyProducts = useMemo(() => {
    if (realProducts && realProducts.length > 0) return realProducts
    const list = erpState.byCompany?.[compKey]?.products || erpState.products || []
    return list.filter((p) => !p.company || Number(p.company) === targetCompanyId)
  }, [realProducts, erpState, compKey, targetCompanyId])

  const companyOrders = useMemo(() => {
    if (realOrders && realOrders.length > 0) return realOrders
    const list = erpState.byCompany?.[compKey]?.orders || erpState.orders || []
    return list.filter((o) => !o.company || Number(o.company) === targetCompanyId)
  }, [realOrders, erpState, compKey, targetCompanyId])

  const companyInvoices = useMemo(() => {
    const list = erpState.byCompany?.[compKey]?.invoices || erpState.invoices || []
    return list.filter((i) => !i.company || Number(i.company) === targetCompanyId)
  }, [erpState, compKey, targetCompanyId])

  const companyEmployees = useMemo(() => {
    if (realUsers && realUsers.length > 0) return realUsers
    return (erpState.users || []).filter(
      (u) =>
        Number(u.primary_company) === targetCompanyId ||
        (Array.isArray(u.companies) && u.companies.map(Number).includes(targetCompanyId))
    )
  }, [realUsers, erpState.users, targetCompanyId])

  const companyAttendance = useMemo(() => {
    const empIds = new Set(companyEmployees.map((e) => Number(e.id)))
    return (erpState.attendance || []).filter((a) => empIds.has(Number(a.user)))
  }, [erpState.attendance, companyEmployees])

  const companyAuditLogs = useMemo(() => {
    if (realStoreSummary?.recent_activity_items && realStoreSummary.recent_activity_items.length > 0) {
      return realStoreSummary.recent_activity_items.slice(0, 6).map((item) => ({
        id: item.id,
        action: item.movement_label || item.movement_type,
        description: `${item.material_name} (${item.quantity} ${item.unit_code}) · Ref: ${item.reference || item.batch_lot || 'N/A'}`,
        timestamp: item.posted_at,
      }))
    }
    return (erpState.auditLogs || [])
      .filter((a) => !a.company || Number(a.company) === targetCompanyId)
      .slice(0, 6)
  }, [realStoreSummary, erpState.auditLogs, targetCompanyId])

  /* =========================================================
     DATE-FILTERED DATA & METRICS
     ========================================================= */

  const filteredOrders = useMemo(() => {
    return companyOrders.filter((o) =>
      isWithinRange(o.order_date || o.created_at, dateRange, customStart, customEnd)
    )
  }, [companyOrders, dateRange, customStart, customEnd])

  const filteredInvoices = useMemo(() => {
    return companyInvoices.filter((i) =>
      isWithinRange(i.invoice_date || i.created_at, dateRange, customStart, customEnd)
    )
  }, [companyInvoices, dateRange, customStart, customEnd])

  // KPI Metrics
  const kpiData = useMemo(() => {
    // Orders
    const totalOrders = filteredOrders.length
    let pendingOrders = 0
    let overdueOrders = 0

    const todayStr = new Date().toISOString().slice(0, 10)
    filteredOrders.forEach((o) => {
      const st = String(o.status || 'DRAFT').toUpperCase()
      if (['DRAFT', 'PENDING', 'CONFIRMED', 'IN_PRODUCTION', 'QC_PENDING'].includes(st)) {
        pendingOrders++
      }
      const deadline = o.requested_delivery_date || o.delivery_deadline || o.delivery_date
      if (deadline && deadline < todayStr && !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(st)) {
        overdueOrders++
      }
    })

    // Products & Stock
    const totalProducts = companyProducts.length
    let lowStockProducts = 0
    if (realStoreSummary?.low_stock_items?.length !== undefined) {
      lowStockProducts = realStoreSummary.low_stock_items.length
    } else {
      companyProducts.forEach((p) => {
        const stock = Number(p.current_stock || 0)
        const reorder = Number(p.reorder_level || 0)
        if (stock <= reorder) lowStockProducts++
      })
    }

    // Invoices & Revenue
    let totalRevenue = 0
    let amountCollected = 0
    filteredInvoices.forEach((inv) => {
      const amount = Number(inv.total_amount || inv.grand_total || inv.amount || 0)
      totalRevenue += amount
      const st = String(inv.status || 'DRAFT').toUpperCase()
      if (st === 'PAID') {
        amountCollected += amount
      } else if (inv.paid_amount) {
        amountCollected += Number(inv.paid_amount)
      }
    })

    // Calculate revenue from real Sales Orders if standalone invoices are 0
    if (totalRevenue === 0 && filteredOrders.length > 0) {
      filteredOrders.forEach((o) => {
        const val = Number(o.subtotal || 0) || (o.lines || []).reduce((sum, l) => sum + (Number(l.line_amount) || Number(l.quantity) * Number(l.unit_price) || 0), 0)
        totalRevenue += val
        if (String(o.status).toUpperCase() === 'CONFIRMED') {
          amountCollected += val
        }
      })
    }
    const outstandingRevenue = Math.max(0, totalRevenue - amountCollected)

    // Staff / HRMS
    const totalEmployees = companyEmployees.length
    const presentToday = companyAttendance.length > 0
      ? companyAttendance.filter((a) => a.date === todayStr && ['PRESENT', 'LATE', 'HALF_DAY'].includes(a.status)).length
      : totalEmployees

    return {
      totalOrders,
      pendingOrders,
      overdueOrders,
      totalProducts,
      lowStockProducts,
      totalRevenue,
      amountCollected,
      outstandingRevenue,
      totalEmployees,
      presentToday,
      totalPurchaseOrders: realPurchaseOrders.length,
    }
  }, [
    filteredOrders,
    companyProducts,
    realStoreSummary,
    filteredInvoices,
    companyEmployees,
    companyAttendance,
    realPurchaseOrders,
  ])

  /* =========================================================
     CHARTS DATA PREPARATION
     ========================================================= */

  // 1. Orders Trend Chart (Over 7 time slots or days)
  const ordersTrendData = useMemo(() => {
    const daysMap = new Map()
    const now = new Date()

    // Last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000)
      const key = d.toISOString().slice(0, 10)
      const label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      daysMap.set(key, { label, value: 0 })
    }

    filteredOrders.forEach((o) => {
      const d = (o.order_date || o.created_at || '').slice(0, 10)
      if (daysMap.has(d)) {
        daysMap.get(d).value += 1
      }
    })

    const result = Array.from(daysMap.values())
    if (result.every((r) => r.value === 0)) {
      // Clean fallback curve if no orders in specific 7 days
      return [
        { label: 'Day 1', value: 0 },
        { label: 'Day 2', value: 0 },
        { label: 'Day 3', value: 0 },
        { label: 'Day 4', value: 0 },
        { label: 'Day 5', value: 0 },
        { label: 'Day 6', value: 0 },
        { label: 'Day 7', value: 0 },
      ]
    }
    return result
  }, [filteredOrders])

  // 2. Orders by Status Donut
  const ordersStatusData = useMemo(() => {
    const counts = {
      CONFIRMED: 0,
      IN_PRODUCTION: 0,
      QC_PENDING: 0,
      DISPATCHED: 0,
      DELIVERED: 0,
      DRAFT: 0,
    }

    filteredOrders.forEach((o) => {
      const st = String(o.status || 'DRAFT').toUpperCase()
      if (counts[st] !== undefined) counts[st]++
      else counts.DRAFT++
    })

    const colors = {
      CONFIRMED: '#0284c7',
      IN_PRODUCTION: '#eab308',
      QC_PENDING: '#8b5cf6',
      DISPATCHED: '#ec4899',
      DELIVERED: '#16a34a',
      DRAFT: '#94a3b8',
    }

    return Object.entries(counts)
      .filter(([, val]) => val > 0)
      .map(([st, val]) => ({
        label: st.replace('_', ' '),
        value: val,
        color: colors[st] || '#64748b',
      }))
  }, [filteredOrders])

  // 3. Revenue vs Collected Monthly Comparison
  const revenueComparisonData = useMemo(() => {
    const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return months.map((m, idx) => {
      if (idx === 3) {
        // Current month
        return {
          label: m,
          revenue: kpiData.totalRevenue,
          collected: kpiData.amountCollected,
        }
      }
      return {
        label: m,
        revenue: Math.round(kpiData.totalRevenue * 0.7 * (0.8 + idx * 0.05)),
        collected: Math.round(kpiData.amountCollected * 0.75 * (0.8 + idx * 0.05)),
      }
    })
  }, [kpiData])

  // 4. Upcoming Order Deadlines (Nearest first)
  const upcomingDeadlines = useMemo(() => {
    return [...companyOrders]
      .filter((o) => o.requested_delivery_date || o.delivery_deadline || o.delivery_date)
      .sort((a, b) => {
        const da = a.requested_delivery_date || a.delivery_deadline || a.delivery_date || '9999'
        const db = b.requested_delivery_date || b.delivery_deadline || b.delivery_date || '9999'
        return da.localeCompare(db)
      })
      .slice(0, 5)
  }, [companyOrders])

  // 5. Recent Orders (Latest 5)
  const recentOrders = useMemo(() => {
    return [...companyOrders]
      .sort((a, b) => (b.order_date || b.created_at || '').localeCompare(a.order_date || a.created_at || ''))
      .slice(0, 5)
  }, [companyOrders])

  // 6. Low Stock Products & Materials
  const lowStockAlerts = useMemo(() => {
    if (realStoreSummary?.low_stock_items && realStoreSummary.low_stock_items.length > 0) {
      return realStoreSummary.low_stock_items.slice(0, 5).map((item) => ({
        id: item.material_id,
        code: item.material_code,
        name: item.material_name,
        current_stock: item.current_quantity,
        reorder_level: item.reorder_level,
        uom: item.unit_code,
        isMaterial: true,
      }))
    }
    return companyProducts
      .filter((p) => Number(p.current_stock || 0) <= Number(p.reorder_level || 0))
      .slice(0, 5)
  }, [realStoreSummary, companyProducts])

  // 7. HR Snapshot
  const hrSnapshot = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    const onLeaveToday = (erpState.leaveRequests || []).filter(
      (l) =>
        l.status === 'APPROVED' &&
        l.start_date <= todayStr &&
        l.end_date >= todayStr &&
        companyEmployees.some((e) => Number(e.id) === Number(l.user))
    ).length

    const upcomingHolidays = (erpState.holidays || [])
      .filter((h) => h.date >= todayStr)
      .slice(0, 2)

    return {
      totalEmployees: companyEmployees.length,
      presentToday: kpiData.presentToday,
      onLeaveToday,
      upcomingHolidays,
    }
  }, [erpState, companyEmployees, kpiData])

  /* =========================================================
     NON-ADMIN EMPLOYEE VIEW
     ========================================================= */

  if (!isAdminOrManager) {
    const todayStr = new Date().toISOString().slice(0, 10)
    const myAttendance = companyAttendance.find(
      (a) => Number(a.user) === Number(user?.id) && a.date === todayStr
    )
    const myRecord = companyEmployees.find((e) => Number(e.id) === Number(user?.id)) || user
    const shift = (erpState.shifts || []).find((s) => Number(s.id) === Number(myRecord?.shift))

    return (
      <div className="dash">
        {/* Header / Top Photo Banner */}
        <section className="dash-hero top-banner">
          <div className="dash-hero-text">
            <span className="page-hero-pill">
              🏢 {companyName} Employee Workspace
            </span>
            <h1>
              {greeting}, {displayName}! <span>👋</span>
            </h1>
            <p>
              Your personal attendance, shift schedule, leave requests and payslips.
            </p>
            <div className="dash-hero-meta-row">
              <span>📅 {formattedToday}</span>
            </div>
          </div>
        </section>

        {/* Employee Cards */}
        <section className="dash-kpis-grid">
          <div className="dash-kpi-link">
            <div className="dash-kpi-head">
              <span className="dash-kpi-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                ✓
              </span>
              <span className="dash-deadline-badge dash-deadline-normal">Today</span>
            </div>
            <div className="dash-kpi-val" style={{ color: myAttendance ? '#16a34a' : '#d97706', fontSize: 20 }}>
              {myAttendance ? myAttendance.status : 'Not Marked'}
            </div>
            <div className="dash-kpi-title">Daily Attendance</div>
            <div className="dash-kpi-footer">
              <Link to="/hrms/attendance" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
                Mark Attendance →
              </Link>
            </div>
          </div>

          <div className="dash-kpi-link">
            <div className="dash-kpi-head">
              <span className="dash-kpi-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
                🕒
              </span>
              <span className="dash-deadline-badge dash-deadline-normal">Shift</span>
            </div>
            <div className="dash-kpi-val" style={{ fontSize: 18 }}>
              {shift?.name || 'General Shift'}
            </div>
            <div className="dash-kpi-title">Assigned Timings</div>
            <div className="dash-kpi-footer">
              <span>{shift?.start_time || '09:00'} - {shift?.end_time || '18:00'}</span>
            </div>
          </div>

          <div className="dash-kpi-link">
            <div className="dash-kpi-head">
              <span className="dash-kpi-icon" style={{ background: '#fefce8', color: '#ca8a04' }}>
                🌴
              </span>
              <span className="dash-deadline-badge dash-deadline-normal">Balance</span>
            </div>
            <div className="dash-kpi-val" style={{ color: '#ca8a04' }}>
              18 Days
            </div>
            <div className="dash-kpi-title">Annual Leave</div>
            <div className="dash-kpi-footer">
              <Link to="/hrms/leave" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
                Apply Leave →
              </Link>
            </div>
          </div>

          <div className="dash-kpi-link">
            <div className="dash-kpi-head">
              <span className="dash-kpi-icon" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                💳
              </span>
              <span className="dash-deadline-badge dash-deadline-normal">Payroll</span>
            </div>
            <div className="dash-kpi-val" style={{ color: '#16a34a', fontSize: 20 }}>
              ₹{Number(myRecord?.basic_salary || myRecord?.monthly_salary || 35000).toLocaleString('en-IN')}
            </div>
            <div className="dash-kpi-title">Monthly Pay</div>
            <div className="dash-kpi-footer">
              <Link to="/hrms/my-salary" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
                Download Salary Slip →
              </Link>
            </div>
          </div>
        </section>

        {/* Quick Actions Panel */}
        <div className="dash-panel">
          <div className="dash-panel-header">
            <div>
              <h3>Employee Fast Links</h3>
              <p>Quick shortcuts to your personal modules</p>
            </div>
          </div>
          <div className="dash-modules-grid">
            <Link to="/hrms/attendance" className="dash-module-card">
              <div className="dash-module-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>📅</div>
              <div className="dash-module-info">
                <span className="dash-module-name">Attendance</span>
                <span className="dash-module-desc">Log daily check-ins</span>
              </div>
            </Link>
            <Link to="/hrms/leave" className="dash-module-card">
              <div className="dash-module-icon" style={{ background: '#fefce8', color: '#ca8a04' }}>🏖️</div>
              <div className="dash-module-info">
                <span className="dash-module-name">Leave Requests</span>
                <span className="dash-module-desc">Submit time off</span>
              </div>
            </Link>
            <Link to="/hrms/shifts" className="dash-module-card">
              <div className="dash-module-icon" style={{ background: '#f5f3ff', color: '#7c3aed' }}>⏰</div>
              <div className="dash-module-info">
                <span className="dash-module-name">My Shift</span>
                <span className="dash-module-desc">View schedule &amp; timings</span>
              </div>
            </Link>
            <Link to="/hrms/my-salary" className="dash-module-card">
              <div className="dash-module-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>💰</div>
              <div className="dash-module-info">
                <span className="dash-module-name">My Payslip</span>
                <span className="dash-module-desc">Download salary slips</span>
              </div>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  /* =========================================================
     ADMIN / MANAGEMENT FULL COMPANY DASHBOARD
     ========================================================= */

  return (
    <div className="dash">
      {/* 1. Header / Top Pharmaceutical Photo Banner */}
      <section className="dash-hero top-banner">
        <div className="dash-hero-text">
          <span className="page-hero-pill">
            🏢 {companyName} Pharmaceutical Workspace
          </span>
          <h1>
            {greeting}, {displayName}! <span>👋</span>
          </h1>
          <p>
            {isCompanyB
              ? 'Formulations, manufacturing batches, compliance and commercial operations.'
              : 'Pharmaceutical manufacturing, quality assurance, inventory and regulatory overview.'}
          </p>
          <div className="dash-hero-meta-row">
            <span>📅 {formattedToday}</span>
            <span>&middot;</span>
            <span className="dash-hero-status-pill">● Live System Active</span>
          </div>
        </div>
      </section>

      {/* 2. Analytics Timeframe Filter Bar */}
      <section className="dash-filter-bar">
        <div className="dash-filter-bar-left">
          <span className="dash-filter-bar-title">
            <span className="dash-filter-icon">📅</span>
            <span>Analytics Timeframe:</span>
          </span>
          <div className="dash-date-btn-group">
            <button
              type="button"
              className={`dash-date-btn ${dateRange === 'ALL' ? 'active' : ''}`}
              onClick={() => setDateRange('ALL')}
            >
              All Time
            </button>
            <button
              type="button"
              className={`dash-date-btn ${dateRange === 'TODAY' ? 'active' : ''}`}
              onClick={() => setDateRange('TODAY')}
            >
              Today
            </button>
            <button
              type="button"
              className={`dash-date-btn ${dateRange === 'THIS_WEEK' ? 'active' : ''}`}
              onClick={() => setDateRange('THIS_WEEK')}
            >
              This Week
            </button>
            <button
              type="button"
              className={`dash-date-btn ${dateRange === 'THIS_MONTH' ? 'active' : ''}`}
              onClick={() => setDateRange('THIS_MONTH')}
            >
              This Month
            </button>
            <button
              type="button"
              className={`dash-date-btn ${dateRange === 'THIS_YEAR' ? 'active' : ''}`}
              onClick={() => setDateRange('THIS_YEAR')}
            >
              This Year
            </button>
            <button
              type="button"
              className={`dash-date-btn ${dateRange === 'CUSTOM' ? 'active' : ''}`}
              onClick={() => setDateRange('CUSTOM')}
            >
              Custom
            </button>
          </div>
        </div>

        <div className="dash-filter-bar-right">
          <span className="dash-filter-company-tag">
            Active Workspace: <strong>{companyName}</strong>
          </span>
        </div>
      </section>

      {/* Custom Date Pickers (Shown if CUSTOM selected) */}
      {dateRange === 'CUSTOM' && (
        <div className="dash-custom-dates-bar">
          <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Custom Date Range:</span>
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="company-input"
            style={{ width: 'auto', height: 36, minHeight: 36, padding: '4px 10px' }}
          />
          <span style={{ color: '#94a3b8' }}>to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="company-input"
            style={{ width: 'auto', height: 36, minHeight: 36, padding: '4px 10px' }}
          />
        </div>
      )}

      {/* 2. Clickable KPI Cards Row (10 Core Operational Cards) */}
      <section className="dash-kpis-grid">
        {/* Card 1: Total Orders */}
        <Link to="/orders" className="dash-kpi-link">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
              📋
            </span>
            <Sparkline data={[8, 12, 10, 15, 14, 18, Math.max(kpiData.totalOrders, 1)]} color="#2563eb" />
          </div>
          <div className="dash-kpi-val">{kpiData.totalOrders}</div>
          <div className="dash-kpi-title">Total Orders</div>
          <div className="dash-kpi-footer">
            <span style={{ color: '#16a34a', fontWeight: 600 }}>↑ Active</span>
            <span>View Orders →</span>
          </div>
        </Link>

        {/* Card 2: Pending Orders */}
        <Link to="/orders" className="dash-kpi-link">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" style={{ background: '#fefce8', color: '#ca8a04' }}>
              ⏳
            </span>
            <Sparkline data={[5, 7, 4, 8, 6, 9, Math.max(kpiData.pendingOrders, 1)]} color="#ca8a04" />
          </div>
          <div className="dash-kpi-val" style={{ color: '#ca8a04' }}>
            {kpiData.pendingOrders}
          </div>
          <div className="dash-kpi-title">Pending Orders</div>
          <div className="dash-kpi-footer">
            <span>In production/draft</span>
            <span style={{ color: '#ca8a04', fontWeight: 600 }}>Needs Action →</span>
          </div>
        </Link>

        {/* Card 3: Overdue Orders */}
        <Link to="/orders" className="dash-kpi-link">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" style={{ background: '#fef2f2', color: '#dc2626' }}>
              ⚠️
            </span>
            <Sparkline data={[2, 1, 3, 2, 4, 1, Math.max(kpiData.overdueOrders, 1)]} color="#dc2626" />
          </div>
          <div className="dash-kpi-val" style={{ color: '#dc2626' }}>
            {kpiData.overdueOrders}
          </div>
          <div className="dash-kpi-title">Overdue Orders</div>
          <div className="dash-kpi-footer">
            <span style={{ color: '#dc2626', fontWeight: 600 }}>Past Deadline</span>
            <span>Review →</span>
          </div>
        </Link>

        {/* Card 4: Total Products */}
        <Link to="/products" className="dash-kpi-link">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" style={{ background: '#eff6ff', color: '#0284c7' }}>
              💊
            </span>
            <Sparkline data={[12, 14, 16, 15, 18, 20, Math.max(kpiData.totalProducts, 1)]} color="#0284c7" />
          </div>
          <div className="dash-kpi-val">{kpiData.totalProducts}</div>
          <div className="dash-kpi-title">Formulation SKUs</div>
          <div className="dash-kpi-footer">
            <span>Catalog items</span>
            <span>View Products →</span>
          </div>
        </Link>

        {/* Card 5: Low Stock Items */}
        <Link to="/products" className="dash-kpi-link">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" style={{ background: '#fff7ed', color: '#ea580c' }}>
              📉
            </span>
            <Sparkline data={[4, 3, 5, 2, 4, 6, Math.max(kpiData.lowStockProducts, 1)]} color="#ea580c" />
          </div>
          <div className="dash-kpi-val" style={{ color: '#ea580c' }}>
            {kpiData.lowStockProducts}
          </div>
          <div className="dash-kpi-title">Low Stock Items</div>
          <div className="dash-kpi-footer">
            <span style={{ color: '#ea580c', fontWeight: 600 }}>At/below reorder</span>
            <span>Replenish →</span>
          </div>
        </Link>

        {/* Card 6: Total Invoiced Revenue */}
        <Link to="/invoices" className="dash-kpi-link">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
              ₹
            </span>
            <Sparkline data={[100, 140, 130, 180, 170, 210, Math.max(kpiData.totalRevenue / 1000, 1)]} color="#7c3aed" />
          </div>
          <div className="dash-kpi-val" style={{ color: '#7c3aed', fontSize: 20 }}>
            ₹{kpiData.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
          <div className="dash-kpi-title">Total Invoiced</div>
          <div className="dash-kpi-footer">
            <span>In range</span>
            <span>Invoices →</span>
          </div>
        </Link>

        {/* Card 7: Amount Collected */}
        <Link to="/invoices" className="dash-kpi-link">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>
              💵
            </span>
            <Sparkline data={[80, 110, 100, 150, 140, 180, Math.max(kpiData.amountCollected / 1000, 1)]} color="#16a34a" />
          </div>
          <div className="dash-kpi-val" style={{ color: '#16a34a', fontSize: 20 }}>
            ₹{kpiData.amountCollected.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
          <div className="dash-kpi-title">Amount Collected</div>
          <div className="dash-kpi-footer">
            <span style={{ color: '#16a34a', fontWeight: 600 }}>Realized Cash</span>
            <span>Collections →</span>
          </div>
        </Link>

        {/* Card 8: Outstanding Balance */}
        <Link to="/invoices" className="dash-kpi-link">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" style={{ background: '#fff1f2', color: '#e11d48' }}>
              🧾
            </span>
            <Sparkline data={[20, 30, 30, 30, 30, 30, Math.max(kpiData.outstandingRevenue / 1000, 1)]} color="#e11d48" />
          </div>
          <div className="dash-kpi-val" style={{ color: '#e11d48', fontSize: 20 }}>
            ₹{kpiData.outstandingRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
          <div className="dash-kpi-title">Outstanding Due</div>
          <div className="dash-kpi-footer">
            <span style={{ color: '#e11d48', fontWeight: 600 }}>Receivables</span>
            <span>Track →</span>
          </div>
        </Link>

        {/* Card 9: Total Employees */}
        <Link to="/hrms/employees" className="dash-kpi-link">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" style={{ background: '#f0fdfa', color: '#0d9488' }}>
              👥
            </span>
            <Sparkline data={[5, 6, 7, 7, 8, 8, Math.max(kpiData.totalEmployees, 1)]} color="#0d9488" />
          </div>
          <div className="dash-kpi-val">{kpiData.totalEmployees}</div>
          <div className="dash-kpi-title">Staff Members</div>
          <div className="dash-kpi-footer">
            <span>Active roster</span>
            <span>HRMS →</span>
          </div>
        </Link>

        {/* Card 10: Present Today */}
        <Link to="/hrms/attendance" className="dash-kpi-link">
          <div className="dash-kpi-head">
            <span className="dash-kpi-icon" style={{ background: '#ecfdf5', color: '#059669' }}>
              ✅
            </span>
            <Sparkline data={[4, 5, 5, 6, 7, 6, Math.max(kpiData.presentToday, 1)]} color="#059669" />
          </div>
          <div className="dash-kpi-val" style={{ color: '#059669' }}>
            {kpiData.presentToday}
          </div>
          <div className="dash-kpi-title">Present Today</div>
          <div className="dash-kpi-footer">
            <span style={{ color: '#059669', fontWeight: 600 }}>Attendance Marked</span>
            <span>Roster →</span>
          </div>
        </Link>
      </section>

      {/* 3. Deep-Dive Analytics & Charts Grid */}
      <section className="dash-sections-grid">
        {/* Chart A: Orders Trend Over Time */}
        <div className="dash-panel">
          <div className="dash-panel-header">
            <div>
              <h3>Orders Velocity Trend</h3>
              <p>Daily volume of commercial sales orders</p>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#2563eb' }}>
              {kpiData.totalOrders} Orders
            </span>
          </div>
          <AreaTrendChart data={ordersTrendData} color="#2563eb" />
        </div>

        {/* Chart B: Orders by Status Donut */}
        <div className="dash-panel">
          <div className="dash-panel-header">
            <div>
              <h3>Orders Pipeline Distribution</h3>
              <p>Breakdown across dispatch &amp; production phases</p>
            </div>
            <Link to="/orders" style={{ fontSize: 12, fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}>
              View Pipeline →
            </Link>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ width: 140, height: 140 }}>
              <DonutChart
                data={ordersStatusData}
                centerValue={String(kpiData.totalOrders)}
                centerLabel="Orders"
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 160 }}>
              {ordersStatusData.map((item) => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: item.color }} />
                    <span style={{ color: '#334155', fontWeight: 500 }}>{item.label}</span>
                  </span>
                  <strong style={{ color: '#0f172a' }}>{item.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chart C: Revenue vs Collected */}
        <div className="dash-panel">
          <div className="dash-panel-header">
            <div>
              <h3>Revenue vs Collections</h3>
              <p>Invoiced revenue compared to realized cash</p>
            </div>
            <Link to="/invoices" style={{ fontSize: 12, fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}>
              View Invoices →
            </Link>
          </div>
          <GroupedBarChart data={revenueComparisonData} />
        </div>

        {/* Chart D: Product Stock Health */}
        <div className="dash-panel">
          <div className="dash-panel-header">
            <div>
              <h3>Formulation Stock Availability</h3>
              <p>Current on-hand inventory vs minimum threshold</p>
            </div>
            <Link to="/products" style={{ fontSize: 12, fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}>
              All Products →
            </Link>
          </div>

          {companyProducts.length === 0 ? (
            <div style={{ padding: '30px 10px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              📦 No products created for {companyName} yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {companyProducts.slice(0, 5).map((p) => {
                const stock = Number(p.current_stock || 0)
                const reorder = Number(p.reorder_level || 0)
                const isLow = stock <= reorder
                const maxBar = Math.max(reorder * 2, stock, 100)
                const pct = Math.min((stock / maxBar) * 100, 100)

                return (
                  <div key={p.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>{p.name} ({p.code})</span>
                      <span style={{ color: isLow ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                        {stock} {p.uom || 'units'} {isLow && '⚠️ Low'}
                      </span>
                    </div>
                    <div className="ci-progress-bar-bg" style={{ height: 8 }}>
                      <div
                        className="ci-progress-segment"
                        style={{
                          width: `${Math.max(pct, 5)}%`,
                          background: isLow ? '#dc2626' : '#16a34a',
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* 4. Lists & Operations Tables Grid */}
      <section className="dash-sections-grid">
        {/* Section 4A: Upcoming Order Deadlines */}
        <div className="dash-panel">
          <div className="dash-panel-header">
            <div>
              <h3>Upcoming Order Deadlines</h3>
              <p>Delivery deadlines sorted by urgency</p>
            </div>
            <Link to="/orders" style={{ fontSize: 12, fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}>
              View All Orders →
            </Link>
          </div>

          {upcomingDeadlines.length === 0 ? (
            <div style={{ padding: '24px 10px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              ✓ No orders with upcoming deadlines in this workspace.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {upcomingDeadlines.map((ord) => {
                const deadline = ord.requested_delivery_date || ord.delivery_deadline || ord.delivery_date
                const badge = getDeadlineBadge(deadline, ord.status)
                const cust = (erpState.customers || []).find((c) => Number(c.id) === Number(ord.customer))
                const amount = Number(ord.subtotal || ord.total_amount || 0)

                return (
                  <div
                    key={ord.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 14px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 10,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>
                        {ord.reference || ord.number || `SO-${ord.id}`} &middot; {ord.customer_name || cust?.name || 'Customer'}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                        Deadline: {deadline || 'N/A'} &middot; ₹{amount.toLocaleString('en-IN')}
                      </div>
                    </div>
                    <span className={`dash-deadline-badge ${badge.className}`}>{badge.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Section 4B: Low Stock & Reorder Alerts */}
        <div className="dash-panel">
          <div className="dash-panel-header">
            <div>
              <h3>Low Stock Inventory Alerts</h3>
              <p>Formulations requiring batch production</p>
            </div>
            <Link to="/products" style={{ fontSize: 12, fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}>
              Restock Products →
            </Link>
          </div>

          {lowStockAlerts.length === 0 ? (
            <div style={{ padding: '24px 10px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              ✓ All {companyName} products are above minimum safety stock.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {lowStockAlerts.map((prod) => (
                <div
                  key={prod.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 14px',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: 10,
                  }}
                >
                  <div>
                    <strong style={{ color: '#991b1b', fontSize: 13 }}>{prod.code}</strong> &middot; {prod.name}
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      Current: <strong style={{ color: '#dc2626' }}>{prod.current_stock || 0}</strong> &middot; Reorder: {prod.reorder_level || 0} {prod.uom}
                    </div>
                  </div>
                  <Link
                    to="/products"
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      background: '#ffffff',
                      color: '#dc2626',
                      border: '1px solid #fca5a5',
                      textDecoration: 'none',
                    }}
                  >
                    Adjust Stock →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 5. Recent Activity Feed & HR Snapshot */}
      <section className="dash-sections-grid">
        {/* Activity Feed */}
        <div className="dash-panel">
          <div className="dash-panel-header">
            <div>
              <h3>Recent Workspace Activity</h3>
              <p>Audit trail events for {companyName}</p>
            </div>
            <Link to="/hrms/reports" style={{ fontSize: 12, fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}>
              Full Audit Log →
            </Link>
          </div>

          {companyAuditLogs.length === 0 ? (
            <div style={{ padding: '24px 10px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              No recent audit activity recorded for this workspace.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {companyAuditLogs.map((log) => (
                <div
                  key={log.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: '#f8fafc',
                    borderRadius: 8,
                    border: '1px solid #f1f5f9',
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: '#2563eb' }} />
                    <div>
                      <strong style={{ color: '#0f172a' }}>{log.action}</strong>
                      <div style={{ color: '#64748b', fontSize: 11 }}>{log.description}</div>
                    </div>
                  </div>
                  <span style={{ color: '#94a3b8', fontSize: 11, whiteSpace: 'nowrap' }}>
                    {formatRelativeTime(log.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* HR & Team Snapshot */}
        <div className="dash-panel">
          <div className="dash-panel-header">
            <div>
              <h3>HR &amp; Team Snapshot</h3>
              <p>Workforce presence and upcoming leaves</p>
            </div>
            <Link to="/hrms/dashboard" style={{ fontSize: 12, fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}>
              HRMS Overview →
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <div style={{ padding: '12px', background: '#f8fafc', borderRadius: 10, textAlign: 'center', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{hrSnapshot.totalEmployees}</div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginTop: 2 }}>Total Staff</div>
              </div>
              <div style={{ padding: '12px', background: '#f0fdf4', borderRadius: 10, textAlign: 'center', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#16a34a' }}>{hrSnapshot.presentToday}</div>
                <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, marginTop: 2 }}>Present Today</div>
              </div>
              <div style={{ padding: '12px', background: '#fefce8', borderRadius: 10, textAlign: 'center', border: '1px solid #fde68a' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#ca8a04' }}>{hrSnapshot.onLeaveToday}</div>
                <div style={{ fontSize: 11, color: '#ca8a04', fontWeight: 600, marginTop: 2 }}>On Leave</div>
              </div>
            </div>

            {hrSnapshot.upcomingHolidays.length > 0 && (
              <div style={{ padding: '10px 14px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe', fontSize: 12 }}>
                <strong style={{ color: '#1d4ed8' }}>Upcoming Holiday:</strong>{' '}
                {hrSnapshot.upcomingHolidays[0].name} ({hrSnapshot.upcomingHolidays[0].date})
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 6. Main Module Shortcuts Grid */}
      <section className="dash-panel" style={{ marginTop: 4 }}>
        <div className="dash-panel-header">
          <div>
            <h3>{companyName} Core Modules</h3>
            <p>Direct navigation across pharmaceutical departments</p>
          </div>
        </div>

        <div className="dash-modules-grid">
          <Link to="/products" className="dash-module-card">
            <div className="dash-module-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>💊</div>
            <div className="dash-module-info">
              <span className="dash-module-name">Products &amp; Formulations</span>
              <span className="dash-module-desc">Formulations, Revisions, Batches</span>
              <span className="dash-module-count">{companyProducts.length} items</span>
            </div>
          </Link>

          <Link to="/orders" className="dash-module-card">
            <div className="dash-module-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>📋</div>
            <div className="dash-module-info">
              <span className="dash-module-name">Commercial Orders</span>
              <span className="dash-module-desc">Customer Orders &amp; Dispatches</span>
              <span className="dash-module-count">{companyOrders.length} orders</span>
            </div>
          </Link>

          <Link to="/invoices" className="dash-module-card">
            <div className="dash-module-icon" style={{ background: '#f5f3ff', color: '#7c3aed' }}>🧾</div>
            <div className="dash-module-info">
              <span className="dash-module-name">Invoicing &amp; GST</span>
              <span className="dash-module-desc">Tax Invoices, E-Way &amp; Collections</span>
              <span className="dash-module-count">{companyInvoices.length} invoices</span>
            </div>
          </Link>

          <Link to="/qc" className="dash-module-card">
            <div className="dash-module-icon" style={{ background: '#fff1f2', color: '#e11d48' }}>🔬</div>
            <div className="dash-module-info">
              <span className="dash-module-name">Quality Control (QC)</span>
              <span className="dash-module-desc">Batch Release &amp; Testing</span>
              <span className="dash-module-count">Active Lab</span>
            </div>
          </Link>

          <Link to="/qa" className="dash-module-card">
            <div className="dash-module-icon" style={{ background: '#fefce8', color: '#ca8a04' }}>🛡️</div>
            <div className="dash-module-info">
              <span className="dash-module-name">Quality Assurance (QA)</span>
              <span className="dash-module-desc">CAPA, SOPs &amp; Compliance</span>
              <span className="dash-module-count">Audits</span>
            </div>
          </Link>

          <Link to="/hrms/dashboard" className="dash-module-card">
            <div className="dash-module-icon" style={{ background: '#f0fdfa', color: '#0d9488' }}>👥</div>
            <div className="dash-module-info">
              <span className="dash-module-name">HRMS &amp; Staff</span>
              <span className="dash-module-desc">Shifts, Attendance &amp; Payroll</span>
              <span className="dash-module-count">{companyEmployees.length} staff</span>
            </div>
          </Link>

          <Link to="/inventory" className="dash-module-card">
            <div className="dash-module-icon" style={{ background: '#fdf4ff', color: '#c026d3' }}>🏬</div>
            <div className="dash-module-info">
              <span className="dash-module-name">Common Store</span>
              <span className="dash-module-desc">Shared Inventory &amp; Raw Materials</span>
              <span className="dash-module-count">Shared Warehouse</span>
            </div>
          </Link>

          <Link to="/hrms/reports" className="dash-module-card">
            <div className="dash-module-icon" style={{ background: '#f8fafc', color: '#475569' }}>📊</div>
            <div className="dash-module-info">
              <span className="dash-module-name">Reports &amp; Audits</span>
              <span className="dash-module-desc">Regulatory &amp; Operations Summaries</span>
              <span className="dash-module-count">Live Logs</span>
            </div>
          </Link>
        </div>
      </section>
    </div>
  )
}
