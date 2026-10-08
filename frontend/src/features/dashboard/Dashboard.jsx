import { useEffect, useMemo, useState } from 'react'
import useAuth from '../../hooks/useAuth'

import {
  PillIcon,
  FlaskIcon,
  AlertIcon,
  TruckIcon,
  DashboardIcon,
  ClipboardIcon,
  ShieldCheckIcon,
  ReceiptIcon,
} from '../../components/icons'

import { DonutChart } from './charts'
import { inventoryService } from '../inventory/inventoryService'
import { getErrorMessage } from '../../utils/errors'
import { LoadingState } from '../../components/Spinner'

import './Dashboard.css'


/* =========================================================
   HELPERS
   ========================================================= */

const categories = {
  RAW_MATERIAL: ['Raw Materials', '#3287ee'],
  PACKAGING_MATERIAL: ['Packaging', '#7b61e8'],
  FINISHED_GOOD: ['Finished Goods', '#32c69a'],
}

const listData = (response) =>
  Array.isArray(response.data)
    ? response.data
    : response.data?.results || []


function relativeTime(value) {
  const seconds = Math.max(
    0,
    (Date.now() - new Date(value).getTime()) / 1000
  )

  if (seconds < 60) return 'Just now'

  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)} min ago`
  }

  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)} hr ago`
  }

  return `${Math.floor(seconds / 86400)} days ago`
}


function expiryStatus(date) {
  const days = Math.ceil(
    (new Date(`${date}T00:00:00`) - new Date()) / 86400000
  )

  if (days <= 15) {
    return ['red', `${Math.max(days, 0)} days left`]
  }

  return ['amber', `${days} days left`]
}


/* =========================================================
   SIMPLE SALES / ACTIVITY CHART
   Visual chart matching reference design.
   ========================================================= */

function TrendChart({ activityCount }) {
  const values = useMemo(() => {
    const base = Math.max(activityCount || 0, 1)

    return [
      Math.max(12, base * 0.55),
      Math.max(18, base * 0.72),
      Math.max(16, base * 0.68),
      Math.max(24, base * 0.9),
      Math.max(21, base * 0.82),
      Math.max(30, base * 1.04),
      Math.max(34, base * 1.18),
    ]
  }, [activityCount])

  const width = 720
  const height = 220

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const points = values
    .map((value, index) => {
      const x = 30 + (index * (width - 55)) / (values.length - 1)

      const y =
        height -
        35 -
        ((value - min) / range) * (height - 75)

      return `${x},${y}`
    })
    .join(' ')

  const areaPoints = `30,${height - 28} ${points} ${width - 25},${height - 28}`

  const labels = [
    '19 Sep',
    '20 Sep',
    '21 Sep',
    '22 Sep',
    '23 Sep',
    '24 Sep',
    '25 Sep',
  ]

  return (
    <div className="trend-chart-wrap">
      <svg
        className="trend-chart"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Inventory activity overview"
      >
        {/* horizontal grid */}
        {[40, 80, 120, 160].map((y) => (
          <line
            key={y}
            x1="30"
            y1={y}
            x2={width - 25}
            y2={y}
            className="chart-grid-line"
          />
        ))}

        {/* vertical grid */}
        {[0, 1, 2, 3, 4, 5, 6].map((index) => {
          const x =
            30 + (index * (width - 55)) / 6

          return (
            <line
              key={index}
              x1={x}
              y1="35"
              x2={x}
              y2={height - 28}
              className="chart-grid-line"
            />
          )
        })}

        {/* gradient area */}
        <polygon
          points={areaPoints}
          className="chart-area"
        />

        {/* secondary line */}
        <polyline
          points={points}
          className="chart-line-secondary"
        />

        {/* main line */}
        <polyline
          points={points}
          className="chart-line"
        />

        {/* points */}
        {values.map((value, index) => {
          const x =
            30 + (index * (width - 55)) / 6

          const y =
            height -
            35 -
            ((value - min) / range) * (height - 75)

          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r="4"
              className="chart-point"
            />
          )
        })}
      </svg>

      <div className="chart-x-labels">
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  )
}


/* =========================================================
   QUICK ACTION
   ========================================================= */

function QuickAction({ icon: Icon, label, color = 'blue' }) {
  return (
    <button
      type="button"
      className={`quick-action quick-action-${color}`}
    >
      <span className="quick-action-icon">
        <Icon size={17} />
      </span>

      <span className="quick-action-label">
        {label}
      </span>

      <span className="quick-action-arrow">
        →
      </span>
    </button>
  )
}


/* =========================================================
   DASHBOARD
   ========================================================= */

export default function Dashboard() {
  const { user } = useAuth()

  const [summary, setSummary] = useState(null)
  const [items, setItems] = useState([])
  const [lots, setLots] = useState([])
  const [activity, setActivity] = useState([])
  const [error, setError] = useState('')

  const displayName =
    user?.first_name ||
    user?.username ||
    'Admin'

  const role = user?.profile?.role

  const inventoryAccess =
    user?.is_superuser ||
    role === 'SUPER_ADMIN' ||
    user?.profile?.can_access_common_inventory


  /* =======================================================
     LOAD LIVE DATA
     ======================================================= */

  useEffect(() => {
    if (!inventoryAccess) {
      return
    }

    Promise.all([
      inventoryService.getDashboardSummary(),
      inventoryService.getItems(),
      inventoryService.getLots(),
      inventoryService.getTransactions({ limit: 8 }),
    ])
      .then(
        ([
          summaryResponse,
          itemsResponse,
          lotsResponse,
          transactionsResponse,
        ]) => {
          setSummary(summaryResponse.data)

          setItems(listData(itemsResponse))

          setLots(listData(lotsResponse))

          setActivity(
            listData(transactionsResponse).slice(0, 6)
          )
        }
      )
      .catch((err) => {
        setError(getErrorMessage(err))
      })
  }, [inventoryAccess])


  /* =======================================================
     CATEGORY DATA
     ======================================================= */

  const categoryData = Object.entries(categories)
    .map(([key, [label, color]]) => ({
      label,
      color,
      value: items.filter(
        (item) =>
          item.category === key &&
          item.is_active
      ).length,
    }))
    .filter((item) => item.value > 0)


  /* =======================================================
     EXPIRING LOTS
     ======================================================= */

  const expiring = lots
    .filter(
      (lot) =>
        lot.qc_status === 'APPROVED' &&
        lot.expiry_date &&
        new Date(`${lot.expiry_date}T23:59:59`) >=
          new Date()
    )
    .sort(
      (a, b) =>
        new Date(a.expiry_date) -
        new Date(b.expiry_date)
    )
    .slice(0, 6)


  /* =======================================================
     KPI CARDS
     ======================================================= */

  const cards = summary
    ? [
        {
          label: 'Active Materials',
          value: summary.total_items,
          Icon: PillIcon,
          tone: 'blue',
          note: 'Live inventory',
        },
        {
          label: 'Low Stock Materials',
          value: summary.low_stock_items,
          Icon: AlertIcon,
          tone: 'amber',
          note: 'Needs attention',
        },
        {
          label: 'Lots Pending QC',
          value: summary.lots_pending_qc,
          Icon: FlaskIcon,
          tone: 'purple',
          note: 'Quality review',
        },
        {
          label: 'Lots Expiring in 30 Days',
          value: summary.lots_expiring_30_days,
          Icon: TruckIcon,
          tone: 'mint',
          note: 'Upcoming expiry',
        },
      ]
    : []


  /* =======================================================
     RENDER
     ======================================================= */

  return (
    <div className="dash">

      {/* =================================================
          HERO
          ================================================= */}

      <section className="dash-hero">

        <div className="dash-hero-glow" />

        <div className="dash-hero-text">

          <span className="dash-pill">
            <span className="dash-pill-dot" />
            Local store data, not connected to the server
          </span>

          <h1>
            Good Morning, {displayName}! <span>👋</span>
          </h1>

          <h2>
            Your health. Our commitment.
          </h2>

          <p>
            Quality medicines for a healthier tomorrow.
          </p>

          <span className="hero-plus hero-plus-one">
            +
          </span>

          <span className="hero-plus hero-plus-two">
            +
          </span>

        </div>

        <div className="dash-hero-decoration">
          <div className="hero-circle hero-circle-large" />
          <div className="hero-circle hero-circle-small" />

          <div className="hero-pill hero-pill-one">
            <span />
            <span />
          </div>

          <div className="hero-pill hero-pill-two">
            <span />
            <span />
          </div>

          <div className="hero-bottle hero-bottle-one">
            <div className="bottle-cap" />
            <div className="bottle-body" />
          </div>

          <div className="hero-bottle hero-bottle-two">
            <div className="bottle-cap" />
            <div className="bottle-body" />
          </div>

          <div className="hero-flask">
            <div className="flask-neck" />
            <div className="flask-liquid" />
          </div>

          <div className="hero-molecule">
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>

      </section>


      {/* =================================================
          ACCESS WARNING
          ================================================= */}

      {!inventoryAccess && (
        <section className="dash-card dash-message-card">
          <div className="message-icon">
            <ShieldCheckIcon size={21} />
          </div>

          <div>
            <strong>Inventory access is not enabled</strong>

            <p>
              Ask an administrator to enable Common Store
              &amp; Inventory access for your account.
            </p>
          </div>
        </section>
      )}


      {/* =================================================
          ERROR
          ================================================= */}

      {inventoryAccess && error && (
        <section className="dash-card dash-message-card error-card">
          <div className="message-icon">
            <AlertIcon size={21} />
          </div>

          <div>
            <strong>Unable to load dashboard data</strong>

            <p>{error}</p>
          </div>
        </section>
      )}


      {/* =================================================
          LOADING
          ================================================= */}

      {inventoryAccess &&
        !summary &&
        !error && (
          <section className="dashboard-loading">

            <LoadingState label="Loading your live inventory dashboard..." />

          </section>
        )}


      {/* =================================================
          LIVE DASHBOARD
          ================================================= */}

      {inventoryAccess && summary && (
        <>

          {/* ===============================================
              KPI CARDS
              =============================================== */}

          <section className="dash-kpis">

            {cards.map(
              ({
                label,
                value,
                Icon,
                tone,
                note,
              }) => (
                <article
                  className={`kpi-card kpi-${tone}`}
                  key={label}
                >

                  <div className="kpi-top">

                    <span className="kpi-icon">
                      <Icon size={22} />
                    </span>

                    <span className="kpi-more">
                      •••
                    </span>

                  </div>

                  <div className="kpi-value">
                    {value}
                  </div>

                  <div className="kpi-label">
                    {label}
                  </div>

                  <div
                    className={`kpi-note kpi-note-${tone}`}
                  >
                    <span>
                      {tone === 'amber'
                        ? '!'
                        : '↑'}
                    </span>

                    {note}
                  </div>

                </article>
              )
            )}

          </section>


          {/* ===============================================
              MAIN ANALYTICS ROW
              =============================================== */}

          <section className="dashboard-main-grid">

            {/* -------------------------------------------
                TREND CHART
                ------------------------------------------- */}

            <article className="dash-card trend-card">

              <div className="dash-card-header">

                <div>
                  <h3 className="dash-card-title">
                    Inventory Overview
                  </h3>

                  <p className="dash-card-sub">
                    Recent inventory activity
                  </p>
                </div>

                <button
                  type="button"
                  className="period-select"
                >
                  Last 7 Days
                  <span>⌄</span>
                </button>

              </div>

              <TrendChart
                activityCount={activity.length}
              />

            </article>


            {/* -------------------------------------------
                CATEGORY DONUT
                ------------------------------------------- */}

            <article className="dash-card category-card">

              <div className="dash-card-header">

                <div>
                  <h3 className="dash-card-title">
                    Material Category
                  </h3>

                  <p className="dash-card-sub">
                    Active material distribution
                  </p>
                </div>

              </div>

              {categoryData.length ? (
                <div className="category-content">

                  <div className="donut-container">

                    <DonutChart
                      data={categoryData}
                      centerValue={String(
                        summary.total_items
                      )}
                      centerLabel="Materials"
                    />

                  </div>

                  <ul className="category-legend">

                    {categoryData.map((item) => (
                      <li key={item.label}>

                        <span
                          className="legend-dot"
                          style={{
                            background:
                              item.color,
                          }}
                        />

                        <span className="legend-label">
                          {item.label}
                        </span>

                        <strong>
                          {item.value}
                        </strong>

                      </li>
                    ))}

                  </ul>

                </div>
              ) : (
                <div className="dash-empty">
                  No active materials yet.
                </div>
              )}

            </article>


            {/* -------------------------------------------
                QUICK ACTIONS
                ------------------------------------------- */}

            <article className="dash-card quick-actions-card">

              <div className="dash-card-header">

                <div>
                  <h3 className="dash-card-title">
                    Quick Actions
                  </h3>

                  <p className="dash-card-sub">
                    Common operations
                  </p>
                </div>

                <span className="quick-header-arrow">
                  →
                </span>

              </div>

              <div className="quick-actions-list">

                <QuickAction
                  icon={PillIcon}
                  label="Add Product"
                  color="blue"
                />

                <QuickAction
                  icon={ClipboardIcon}
                  label="Create PO"
                  color="purple"
                />

                <QuickAction
                  icon={ReceiptIcon}
                  label="Record Sale"
                  color="mint"
                />

                <QuickAction
                  icon={ShieldCheckIcon}
                  label="Quality Check"
                  color="blue"
                />

              </div>

            </article>

          </section>


          {/* ===============================================
              BOTTOM INFORMATION ROW
              =============================================== */}

          <section className="dashboard-bottom-grid">

            {/* -------------------------------------------
                RECENT ACTIVITY
                ------------------------------------------- */}

            <article className="dash-card recent-card">

              <div className="dash-card-header">

                <div>
                  <h3 className="dash-card-title">
                    Recent Activities
                  </h3>

                  <p className="dash-card-sub">
                    Latest inventory events
                  </p>
                </div>

              </div>

              {activity.length ? (
                <ul className="modern-activity-list">

                  {activity.map(
                    (transaction, index) => (
                      <li key={transaction.id}>

                        <span
                          className={`activity-icon activity-icon-${[
                            'blue',
                            'mint',
                            'amber',
                            'purple',
                          ][index % 4]}`}
                        >
                          <ClipboardIcon size={14} />
                        </span>

                        <div className="activity-content">

                          <p>
                            {transaction.transaction_type}:{' '}
                            {transaction.item_code}
                            {' · '}
                            {transaction.lot_number}
                          </p>

                          <span>
                            {transaction.quantity}
                          </span>

                        </div>

                        <time>
                          {relativeTime(
                            transaction.created_at
                          )}
                        </time>

                      </li>
                    )
                  )}

                </ul>
              ) : (
                <div className="dash-empty">
                  No inventory transactions yet.
                </div>
              )}

            </article>


            {/* -------------------------------------------
                UPCOMING EXPIRY
                ------------------------------------------- */}

            <article className="dash-card expiry-card">

              <div className="dash-card-header">

                <div>
                  <h3 className="dash-card-title">
                    Upcoming Expiry
                  </h3>

                  <p className="dash-card-sub">
                    Approved lots requiring attention
                  </p>
                </div>

              </div>

              {expiring.length ? (
                <ul className="expiry-list">

                  {expiring.slice(0, 4).map(
                    (lot, index) => {
                      const [
                        tone,
                        label,
                      ] =
                        expiryStatus(
                          lot.expiry_date
                        )

                      return (
                        <li key={lot.id}>

                          <span
                            className={`expiry-icon expiry-${tone}`}
                          >
                            {index === 0
                              ? '!'
                              : '◷'}
                          </span>

                          <div>

                            <strong>
                              {lot.item_name ||
                                lot.item_code}
                            </strong>

                            <span>
                              {lot.expiry_date}
                            </span>

                          </div>

                          <b
                            className={`expiry-days expiry-text-${tone}`}
                          >
                            {label}
                          </b>

                        </li>
                      )
                    }
                  )}

                </ul>
              ) : (
                <div className="dash-empty">
                  No approved lots with a future
                  expiry date.
                </div>
              )}

            </article>


            {/* -------------------------------------------
                MINI QUICK ACTIONS
                ------------------------------------------- */}

            <article className="dash-card mini-actions-card">

              <div className="dash-card-header">

                <div>
                  <h3 className="dash-card-title">
                    Quick Actions
                  </h3>
                </div>

              </div>

              <div className="mini-actions">

                <button type="button">
                  <span>＋</span>
                  Add Product
                  <b>→</b>
                </button>

                <button type="button">
                  <span>▣</span>
                  Create PO
                  <b>→</b>
                </button>

                <button type="button">
                  <span>✓</span>
                  Quality Check
                  <b>→</b>
                </button>

              </div>

            </article>

          </section>


          {/* ===============================================
              EXPIRING TABLE
              =============================================== */}

          <section className="dash-card expiry-table-card">

            <div className="dash-card-header">

              <div>
                <h3 className="dash-card-title">
                  Approved Lots Expiring Soon
                </h3>

                <p className="dash-card-sub">
                  Earliest expiry dates first
                </p>
              </div>

              <span className="dash-chip">
                {expiring.length} shown
              </span>

            </div>

            <div className="table-scroll">

              <table className="dash-table">

                <thead>
                  <tr>
                    <th>Lot</th>
                    <th>Material</th>
                    <th>Location</th>
                    <th>Quantity</th>
                    <th>Expiry</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>

                  {expiring.map((lot) => {
                    const [tone, label] =
                      expiryStatus(
                        lot.expiry_date
                      )

                    return (
                      <tr key={lot.id}>

                        <td className="cell-strong">
                          {lot.lot_number}
                        </td>

                        <td>
                          {lot.item_code}
                          {' — '}
                          {lot.item_name}
                        </td>

                        <td>
                          {lot.location_name}
                        </td>

                        <td>
                          {lot.available_quantity}{' '}
                          {lot.uom_code}
                        </td>

                        <td>
                          {lot.expiry_date}
                        </td>

                        <td>
                          <span
                            className={`status-chip status-${tone}`}
                          >
                            {label}
                          </span>
                        </td>

                      </tr>
                    )
                  })}

                </tbody>

              </table>

              {!expiring.length && (
                <p className="dash-empty">
                  No approved lots with a future
                  expiry date.
                </p>
              )}

            </div>

          </section>

        </>
      )}

    </div>
  )
}