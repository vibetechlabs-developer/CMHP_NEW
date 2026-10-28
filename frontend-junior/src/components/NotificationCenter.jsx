import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  createPortal,
} from 'react-dom'

import {
  useNavigate,
} from 'react-router-dom'

import useAuth
  from '../hooks/useAuth'

import useWorkspace
  from '../hooks/useWorkspace'

import {
  store,
} from '../store/store'

import {
  WORKSPACES,
} from '../utils/workspace'

import {
  normalizeRole,
} from '../utils/roles'

import {
  getPayrollPayments,
} from '../features/hrms/payrollPayments'

import {
  getCustomNotifications,
  subscribeNotifications,
  removeNotification,
  clearNotifications,
} from '../utils/notifications'

import './NotificationCenter.css'


const READ_PREFIX =
  'cmhp_read_notifications_v3'


const FILTERS = [

  {
    key: 'all',
    label: 'All',
  },

  {
    key: 'leave',
    label: 'Leave',
  },

  {
    key: 'inventory',
    label: 'Inventory',
  },

  {
    key: 'supply',
    label: 'Supply',
  },

  {
    key: 'operations',
    label: 'Orders',
  },

  {
    key: 'invoice',
    label: 'Invoices',
  },

  {
    key: 'quality',
    label: 'Quality',
  },

  {
    key: 'payroll',
    label: 'Payroll',
  },

]


/*
 * ============================================================
 * STORAGE
 * ============================================================
 */

function getReadKey(
  user,
  workspace
) {

  return `${READ_PREFIX}_${user?.id || 'guest'}_${workspace || 'none'}`

}


function readIds(
  user,
  workspace
) {

  try {

    const raw =
      localStorage.getItem(
        getReadKey(
          user,
          workspace
        )
      )

    const parsed =
      raw
        ? JSON.parse(raw)
        : []

    return new Set(
      Array.isArray(parsed)
        ? parsed
        : []
    )

  } catch {

    return new Set()

  }

}


function saveIds(
  user,
  workspace,
  ids
) {

  try {

    localStorage.setItem(
      getReadKey(
        user,
        workspace
      ),
      JSON.stringify(
        [...ids].slice(-500)
      )
    )

  } catch {
    // Ignore storage errors.
  }

}


/*
 * ============================================================
 * ROLE HELPERS
 * ============================================================
 */

const ROLE_ACCESS = {

  SUPER_ADMIN: [
    'leave',
    'inventory',
    'supply',
    'operations',
    'invoice',
    'quality',
    'payroll',
  ],

  MANAGEMENT: [
    'leave',
    'supply',
    'operations',
    'invoice',
    'quality',
    'payroll',
  ],

  HR_ADMINISTRATOR: [
    'leave',
    'operations',
    'payroll',
  ],

  HR_MANAGER: [
    'leave',
    'operations',
    'payroll',
  ],

  DEPARTMENT_MANAGER: [
    'leave',
    'operations',
  ],

  STORES_MANAGER: [
    'inventory',
    'supply',
    'operations',
    'quality',
  ],

  STORES_USER: [
    'inventory',
    'supply',
    'quality',
  ],

  EMPLOYEE: [
    'leave',
    'payroll',
  ],

  VIEWER: [
    'leave',
    'payroll',
  ],

}


function allowedTypes(
  user,
  workspace
) {

  /*
   * Common Inventory workspace:
   *
   * Only inventory notifications.
   *
   * This matches your existing workspace
   * behavior and does not change roles.
   */

  if (
    workspace ===
    WORKSPACES.COMMON
  ) {

    return [
      'inventory',
    ]

  }


  const role =
    normalizeRole(user)


  return (
    ROLE_ACCESS[role] ||
    [
      'leave',
      'payroll',
    ]
  )

}


/*
 * ============================================================
 * COMPANY
 * ============================================================
 */

function getWorkspaceCompanyId(
  workspace
) {

  if (
    workspace ===
    WORKSPACES.COMPANY_A
  ) {

    return 1

  }


  if (
    workspace ===
    WORKSPACES.COMPANY_B
  ) {

    return 2

  }


  return null

}


function belongsToCompany(
  row,
  companyId
) {

  if (!companyId) {
    return true
  }


  return (
    Number(
      row?.company
    ) ===
    Number(
      companyId
    )
  )

}


/*
 * ============================================================
 * USER DISPLAY
 * ============================================================
 */

function displayEmployee(
  user
) {

  if (!user) {
    return 'Employee'
  }


  return (

    user.display_name ||

    `${user.first_name || ''} ${
      user.last_name || ''
    }`.trim() ||

    user.username ||

    'Employee'

  )

}


/*
 * ============================================================
 * DATE
 * ============================================================
 */

function getDateValue(
  row
) {

  return (
    row?.updated_at ||
    row?.created_at ||
    row?.approved_at ||
    row?.date ||
    row?.received_at ||
    row?.dispatch_date ||
    row?.invoice_date ||
    row?.due_date ||
    row?.from_date ||
    ''
  )

}


function dateScore(
  row
) {

  const value =
    getDateValue(row)

  if (!value) {
    return 0
  }


  const time =
    new Date(value).getTime()

  return Number.isFinite(time)
    ? time
    : 0

}


/*
 * ============================================================
 * RECENT
 * ============================================================
 */

function isRecent(
  row,
  days = 30
) {

  const score =
    dateScore(row)

  if (!score) {
    return true
  }


  return (
    Date.now() -
      score <=
    days *
      24 *
      60 *
      60 *
      1000
  )

}


/*
 * ============================================================
 * BUILD NOTIFICATIONS
 * ============================================================
 */

function buildNotifications(
  user,
  workspace
) {

  const state =
    store.getState().erp


  const notifications = []


  const companyId =
    getWorkspaceCompanyId(
      workspace
    )


  const types =
    allowedTypes(
      user,
      workspace
    )


  const canSee =
    (type) =>
      types.includes(type)


  /*
   * ==========================================================
   * COMMON INVENTORY
   * ==========================================================
   */

  if (
    canSee('inventory')
  ) {

    /*
     * LOW STOCK / SHORTAGE
     *
     * NOT generated here anymore - this used to compare the old mock
     * Redux catalog's fake `item.reorder_level` against fake
     * `lot.available_quantity`, both from permanently-seeded demo data
     * (src/store/seedData.js), so it fired fabricated shortage alerts
     * regardless of real backend state. Common Inventory's materials and
     * stock are real now (see demoStatus.js). The real, backend-computed
     * alert - an admin-set apps.catalog.MaterialReorderSetting compared
     * against the authoritative receipt/issue balance, surfaced by
     * apps.stores.StoreSummaryView - is pushed directly via
     * addNotification(...) from OverviewTab's own summary load instead,
     * so it only ever reflects a real store's real materials.
     */

    const lots =
      Array.isArray(
        state.lots
      )
        ? state.lots
        : []


    /*
     * EXPIRING LOTS
     */

    lots
      .filter(
        (lot) => {

          if (
            !lot.expiry_date
          ) {
            return false
          }


          const expiry =
            new Date(
              `${lot.expiry_date}T00:00:00`
            )


          const days =
            (
              expiry.getTime() -
              Date.now()
            ) /
            86400000


          return (
            days >= 0 &&
            days <= 30
          )

        }
      )
      .slice(0, 10)
      .forEach(
        (lot) => {

          notifications.push({

            id:
              `expiry-${lot.id}`,

            type:
              'inventory',

            title:
              'Lot expiring soon',

            message:
              `Lot ${lot.lot_number || lot.id} expires on ${lot.expiry_date}.`,

            time:
              lot.expiry_date,

            path:
              '/inventory/stock',

          })

        }
      )


    /*
     * RECENT STOCK RECEIVED
     */

    ;(
      Array.isArray(
        state.goodsReceipts
      )
        ? state.goodsReceipts
        : []
    )
      .filter(
        (receipt) =>
          isRecent(
            receipt,
            14
          )
      )
      .slice(-8)
      .forEach(
        (receipt) => {

          const number =
            receipt.number ||
            receipt.grn_number ||
            receipt.code ||
            receipt.id


          notifications.push({

            id:
              `goods-receipt-${receipt.id}`,

            type:
              'inventory',

            title:
              'Stock received',

            message:
              `Goods receipt ${number} has been recorded in inventory.`,

            time:
              getDateValue(
                receipt
              ),

            path:
              '/inventory',

          })

        }
      )

  }


  /*
   * ==========================================================
   * LEAVE
   * ==========================================================
   */

  if (
    canSee('leave')
  ) {

    const leaves =
      Array.isArray(
        state.leaveRequests
      )
        ? state.leaveRequests
        : []


    const role =
      normalizeRole(user)


    /*
     * Managers / HR / Admin:
     * pending approvals.
     */

    const canApproveLeave =
      [
        'SUPER_ADMIN',
        'MANAGEMENT',
        'HR_ADMINISTRATOR',
        'HR_MANAGER',
        'DEPARTMENT_MANAGER',
      ].includes(
        role
      )


    if (
      canApproveLeave
    ) {

      leaves
        .filter(
          (leave) =>
            String(
              leave.status ||
              ''
            ).toUpperCase() ===
              'PENDING' &&
            belongsToCompany(
              leave,
              companyId
            )
        )
        .slice(0, 10)
        .forEach(
          (leave) => {

            const employee =
              state.users.find(
                (item) =>
                  Number(
                    item.id
                  ) ===
                  Number(
                    leave.user
                  )
              )


            notifications.push({

              id:
                `leave-pending-${leave.id}`,

              type:
                'leave',

              title:
                'Leave approval required',

              message:
                `${displayEmployee(employee)} submitted a leave request awaiting approval.`,

              time:
                getDateValue(
                  leave
                ),

              path:
                '/hrms/leave',

            })

          }
        )

    }


    /*
     * Employee:
     * own approved/rejected/pending leave.
     */

    if (
      user?.id
    ) {

      leaves
        .filter(
          (leave) => {

            if (
              Number(
                leave.user
              ) !==
              Number(
                user.id
              )
            ) {
              return false
            }


            if (
              !belongsToCompany(
                leave,
                companyId
              )
            ) {
              return false
            }


            return (
              [
                'APPROVED',
                'REJECTED',
                'PENDING',
              ].includes(
                String(
                  leave.status ||
                  ''
                ).toUpperCase()
              )
            )

          }
        )
        .slice(-10)
        .forEach(
          (leave) => {

            const status =
              String(
                leave.status ||
                ''
              ).toUpperCase()


            if (
              role !==
                'EMPLOYEE' &&
              ![
                'VIEWER',
              ].includes(
                role
              )
            ) {
              return
            }


            const title =
              status ===
                'APPROVED'
                ? 'Leave approved'
                : status ===
                    'REJECTED'
                  ? 'Leave rejected'
                  : 'Leave request pending'


            notifications.push({

              id:
                `my-leave-${leave.id}-${status}`,

              type:
                'leave',

              title,

              message:
                status === 'APPROVED'
                  ? 'Your leave request has been approved.'
                  : status === 'REJECTED'
                    ? 'Your leave request has been rejected.'
                    : 'Your leave request is still awaiting approval.',

              time:
                getDateValue(
                  leave
                ),

              path:
                '/hrms/leave',

            })

          }
        )

    }

  }


  /*
   * ==========================================================
   * SUPPLY CHAIN
   * ==========================================================
   */

  if (
    canSee('supply')
  ) {

    /*
     * PURCHASE / STOCK COMING
     */

    ;(
      Array.isArray(
        state.purchaseOrders
      )
        ? state.purchaseOrders
        : []
    )
      .filter(
        (po) =>
          belongsToCompany(
            po,
            companyId
          )
      )
      .filter(
        (po) =>
          [
            'APPROVED',
            'CONFIRMED',
            'ORDERED',
            'PARTIAL',
            'PARTIALLY_RECEIVED',
          ].includes(
            String(
              po.status ||
              ''
            ).toUpperCase()
          )
      )
      .slice(-10)
      .forEach(
        (po) => {

          const number =
            po.number ||
            po.po_number ||
            po.code ||
            po.id


          notifications.push({

            id:
              `po-${po.id}-${po.status}`,

            type:
              'supply',

            title:
              'Incoming stock',

            message:
              `Purchase order ${number} has stock coming from the supplier.`,

            time:
              getDateValue(
                po
              ),

            path:
              '/supply-chain',

          })

        }
      )


    /*
     * DISPATCH
     */

    ;(
      Array.isArray(
        state.dispatches
      )
        ? state.dispatches
        : []
    )
      .filter(
        (dispatch) =>
          belongsToCompany(
            dispatch,
            companyId
          )
      )
      .filter(
        (dispatch) =>
          isRecent(
            dispatch,
            14
          )
      )
      .slice(-10)
      .forEach(
        (dispatch) => {

          const number =
            dispatch.number ||
            dispatch.dispatch_number ||
            dispatch.code ||
            dispatch.id


          notifications.push({

            id:
              `dispatch-${dispatch.id}-${dispatch.status || ''}`,

            type:
              'supply',

            title:
              'Dispatch update',

            message:
              `Dispatch ${number} has a recent status update.`,

            time:
              getDateValue(
                dispatch
              ),

            path:
              '/supply-chain',

          })

        }
      )

  }


  /*
   * ==========================================================
   * ORDERS
   * ==========================================================
   */

  if (
    canSee('operations')
  ) {

    ;(
      Array.isArray(
        state.orders
      )
        ? state.orders
        : []
    )
      .filter(
        (order) =>
          belongsToCompany(
            order,
            companyId
          )
      )
      .filter(
        (order) =>
          isRecent(
            order,
            14
          )
      )
      .slice(-10)
      .forEach(
        (order) => {

          const number =
            order.code ||
            order.order_number ||
            order.number ||
            order.id


          const status =
            order.status
              ? ` Status: ${order.status}.`
              : ''


          notifications.push({

            id:
              `order-${order.id}-${order.updated_at || order.created_at || order.status || ''}`,

            type:
              'operations',

            title:
              'Order update',

            message:
              `Order ${number} has a recent update.${status}`,

            time:
              getDateValue(
                order
              ),

            path:
              '/orders',

          })

        }
      )

  }


  /*
   * ==========================================================
   * INVOICES
   * ==========================================================
   */

  if (
    canSee('invoice')
  ) {

    ;(
      Array.isArray(
        state.invoices
      )
        ? state.invoices
        : []
    )
      .filter(
        (invoice) =>
          belongsToCompany(
            invoice,
            companyId
          )
      )
      .forEach(
        (invoice) => {

          const status =
            String(
              invoice.status ||
              ''
            ).toUpperCase()


          const dueDate =
            invoice.due_date ||
            invoice.payment_due_date


          if (
            dueDate
          ) {

            const due =
              new Date(
                `${dueDate}T23:59:59`
              )


            const overdue =
              due.getTime() <
              Date.now()


            const unpaid =
              ![
                'PAID',
                'CANCELLED',
              ].includes(
                status
              )


            if (
              overdue &&
              unpaid
            ) {

              notifications.push({

                id:
                  `invoice-overdue-${invoice.id}-${dueDate}`,

                type:
                  'invoice',

                title:
                  'Invoice overdue',

                message:
                  `Invoice ${invoice.number || invoice.invoice_number || invoice.id} is overdue for payment.`,

                time:
                  dueDate,

                path:
                  '/invoices',

              })

              return

            }

          }


          if (
            isRecent(
              invoice,
              14
            )
          ) {

            notifications.push({

              id:
                `invoice-${invoice.id}-${invoice.updated_at || invoice.created_at || invoice.status || ''}`,

              type:
                'invoice',

              title:
                'Invoice update',

              message:
                `Invoice ${invoice.number || invoice.invoice_number || invoice.id} has a recent update.`,

              time:
                getDateValue(
                  invoice
                ),

              path:
                '/invoices',

            })

          }

        }
      )

  }


  /*
   * ==========================================================
   * QUALITY
   * ==========================================================
   */

  if (
    canSee('quality')
  ) {

    ;(
      Array.isArray(
        state.lots
      )
        ? state.lots
        : []
    )
      .filter(
        (lot) =>
          String(
            lot.qc_status ||
            ''
          ).toUpperCase() ===
          'PENDING'
      )
      .slice(0, 10)
      .forEach(
        (lot) => {

          notifications.push({

            id:
              `qc-${lot.id}`,

            type:
              'quality',

            title:
              'Quality check pending',

            message:
              `Lot ${lot.lot_number || lot.id} is waiting for quality review.`,

            time:
              getDateValue(
                lot
              ),

            path:
              '/quality',

          })

        }
      )

  }


  /*
   * ==========================================================
   * PAYROLL
   * ==========================================================
   */

  if (
    canSee('payroll') &&
    user?.id
  ) {

    const payments =
      getPayrollPayments()


    const now =
      new Date()


    const currentMonth =
      `${now.getFullYear()}-${String(
        now.getMonth() + 1
      ).padStart(2, '0')}`


    const ownPayment =
      Object.values(
        payments || {}
      ).find(
        (payment) =>
          Number(
            payment.userId
          ) ===
          Number(
            user.id
          ) &&
          payment.month ===
            currentMonth &&
          String(
            payment.status ||
            ''
          ).toUpperCase() ===
            'PAID'
      )


    if (
      ownPayment
    ) {

      notifications.push({

        id:
          `salary-${currentMonth}-${user.id}`,

        type:
          'payroll',

        title:
          'Salary paid',

        message:
          'Your salary has been marked as paid. Your salary slip is available.',

        time:
          ownPayment.paidAt ||
          ownPayment.updatedAt ||
          '',

        path:
          '/hrms/my-salary',

      })

    }

  }


  /*
   * ==========================================================
   * SORT
   * ==========================================================
   */

  notifications.sort(
    (a, b) =>
      dateScore(b) -
      dateScore(a)
  )


  return notifications.slice(
    0,
    60
  )

}


/*
 * ============================================================
 * ICON
 * ============================================================
 */

function getIcon(
  type
) {

  if (
    type === 'leave'
  ) {
    return '✓'
  }


  if (
    type === 'inventory'
  ) {
    return '!'
  }


  if (
    type === 'supply'
  ) {
    return '↗'
  }


  if (
    type === 'operations'
  ) {
    return 'O'
  }


  if (
    type === 'invoice'
  ) {
    return '₹'
  }


  if (
    type === 'quality'
  ) {
    return 'Q'
  }


  if (
    type === 'payroll'
  ) {
    return '₹'
  }


  return '•'

}


/*
 * ============================================================
 * TIME
 * ============================================================
 */

function formatTime(
  value
) {

  if (!value) {
    return ''
  }


  const date =
    new Date(value)


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return ''

  }


  const seconds =
    Math.floor(
      (
        Date.now() -
        date.getTime()
      ) /
      1000
    )


  if (
    seconds < 60
  ) {
    return 'Just now'
  }


  if (
    seconds < 3600
  ) {

    return `${Math.floor(
      seconds / 60
    )} min ago`

  }


  if (
    seconds < 86400
  ) {

    return `${Math.floor(
      seconds / 3600
    )} hr ago`

  }


  if (
    seconds < 604800
  ) {

    return `${Math.floor(
      seconds / 86400
    )} day ago`

  }


  return date.toLocaleDateString(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }
  )

}


/*
 * ============================================================
 * COMPONENT
 * ============================================================
 */

export default function NotificationCenter() {

  const {
    user,
  } = useAuth()


  const {
    activeWorkspace,
  } = useWorkspace()


  const navigate =
    useNavigate()


  const [
    headerHost,
    setHeaderHost,
  ] = useState(null)


  const [
    open,
    setOpen,
  ] = useState(false)


  const [
    filter,
    setFilter,
  ] = useState('all')


  const [
    version,
    setVersion,
  ] = useState(0)


  const [
    read,
    setRead,
  ] = useState(
    () =>
      readIds(
        user,
        activeWorkspace
      )
  )


  /*
   * ==========================================================
   * CONNECT TO EXISTING MAINLAYOUT HEADER
   * ==========================================================
   *
   * MainLayout already contains the bell button.
   *
   * We hide that static button and insert the real
   * notification component in the exact same location.
   */

  useEffect(
    () => {

      let observer = null


      const connect =
        () => {

          const header =
            document.querySelector(
              '.header-right'
            )


          if (
            !header
          ) {

            return

          }


          /*
           * Hide the old static bell.
           */

          const oldButton =
            header.querySelector(
              'button[aria-label="Notifications"]'
            )


          if (
            oldButton
          ) {

            oldButton.style.display =
              'none'

          }


          let host =
            header.querySelector(
              '.cmhp-notification-host'
            )


          if (
            !host
          ) {

            host =
              document.createElement(
                'div'
              )

            host.className =
              'cmhp-notification-host'


            /*
             * Put the real notification bell
             * immediately after WorkspaceSwitcher.
             */

            const workspaceElement =
              header.querySelector(
                '.workspace-switcher'
              )


            if (
              workspaceElement
            ) {

              workspaceElement.after(
                host
              )

            } else {

              header.prepend(
                host
              )

            }

          }


          setHeaderHost(
            host
          )

        }


      connect()


      observer =
        new MutationObserver(
          connect
        )


      observer.observe(
        document.body,
        {
          childList: true,
          subtree: true,
        }
      )


      return () => {

        observer?.disconnect()

      }

    },
    []
  )


  /*
   * ==========================================================
   * RESET READ STATE WHEN USER / WORKSPACE CHANGES
   * ==========================================================
   */

  useEffect(
    () => {

      setRead(
        readIds(
          user,
          activeWorkspace
        )
      )

      setOpen(false)

    },
    [
      user?.id,
      activeWorkspace,
    ]
  )


  /*
   * ==========================================================
   * ERP STORE LISTENER
   * ==========================================================
   */

  useEffect(
    () => {

      const unsubscribe =
        store.subscribe(
          () => {

            setVersion(
              (value) =>
                value + 1
            )

          }
        )


      return unsubscribe

    },
    []
  )


  /*
   * ==========================================================
   * CUSTOM NOTIFICATION LISTENER
   * ==========================================================
   */

  useEffect(
    () => {

      const unsubscribe =
        subscribeNotifications(
          () => {

            setVersion(
              (value) =>
                value + 1
            )

          }
        )


      return unsubscribe

    },
    []
  )


  /*
   * ==========================================================
   * NOTIFICATIONS
   * ==========================================================
   */

  const notifications =
    useMemo(
      () => {

        const generated =
          buildNotifications(
            user,
            activeWorkspace
          )


        const custom =
          getCustomNotifications(
            user?.id,
            activeWorkspace
          )


        const allowed =
          new Set(
            allowedTypes(
              user,
              activeWorkspace
            )
          )


        const visibleCustom =
          custom.filter(
            (item) =>
              allowed.has(
                item.type
              ) &&
              (
                !item.companyId ||
                !getWorkspaceCompanyId(
                  activeWorkspace
                ) ||
                Number(
                  item.companyId
                ) ===
                Number(
                  getWorkspaceCompanyId(
                    activeWorkspace
                  )
                )
              )
          )


        const merged = [
          ...generated,
          ...visibleCustom,
        ]


        const unique =
          new Map()


        merged.forEach(
          (item) => {

            if (
              !unique.has(
                item.id
              )
            ) {

              unique.set(
                item.id,
                item
              )

            }

          }
        )


        return [
          ...unique.values(),
        ]
          .sort(
            (a, b) =>
              dateScore(b) -
              dateScore(a)
          )
          .slice(
            0,
            60
          )

      },
      [
        user,
        activeWorkspace,
        version,
      ]
    )


  /*
   * ==========================================================
   * FILTER
   * ==========================================================
   */

  const filtered =
    filter === 'all'
      ? notifications
      : notifications.filter(
          (item) =>
            item.type ===
            filter
        )


  const unread =
    notifications.filter(
      (item) =>
        !read.has(
          item.id
        )
    )


  /*
   * ==========================================================
   * ACTIONS
   * ==========================================================
   */

  function markRead(
    id
  ) {

    const next =
      new Set(read)


    next.add(id)


    setRead(next)


    saveIds(
      user,
      activeWorkspace,
      next
    )

  }


  function markAllRead() {

    const next =
      new Set(read)


    notifications.forEach(
      (item) =>
        next.add(
          item.id
        )
    )


    setRead(next)


    saveIds(
      user,
      activeWorkspace,
      next
    )

  }


  function handleOpen(
    notification
  ) {

    markRead(
      notification.id
    )


    setOpen(false)


    if (
      notification.path
    ) {

      navigate(
        notification.path
      )

    }

  }


  function handleRemove(
    event,
    notification
  ) {

    event.stopPropagation()


    /*
     * Generated notifications cannot be
     * deleted because they come from ERP state.
     *
     * Custom notifications can be removed.
     */

    removeNotification(
      notification.id,
      user?.id,
      activeWorkspace
    )


    setVersion(
      (value) =>
        value + 1
    )

  }


  function handleClearAll() {

    clearNotifications(
      user?.id,
      activeWorkspace
    )


    setVersion(
      (value) =>
        value + 1
    )

  }


  /*
   * ==========================================================
   * PORTAL
   * ==========================================================
   */

  if (
    !headerHost
  ) {

    return null

  }


  return createPortal(

    <div
      className="notification-wrap"
    >

      <button
        type="button"
        className="header-icon-btn notification-trigger"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() =>
          setOpen(
            (value) =>
              !value
          )
        }
      >

        <svg
          width="18"
          height="18"
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

          <path
            d="M10 21h4"
          />

        </svg>


        {unread.length > 0 && (

          <span
            className="notification-count"
          >

            {unread.length > 99
              ? '99+'
              : unread.length}

          </span>

        )}

      </button>


      {open && (

        <>

          <button
            type="button"
            className="notification-backdrop"
            aria-label="Close notifications"
            onClick={() =>
              setOpen(false)
            }
          />


          <div
            className="notification-panel"
          >

            <div
              className="notification-panel-head"
            >

              <div>

                <strong>
                  Notifications
                </strong>

                <span>
                  {unread.length > 0
                    ? `${unread.length} unread`
                    : 'All caught up'}
                </span>

              </div>


              <div className="notification-head-actions">

                {notifications.length > 0 && (

                  <button
                    type="button"
                    onClick={
                      markAllRead
                    }
                  >
                    Mark all read
                  </button>

                )}

                {notifications.length > 0 && (

                  <button
                    type="button"
                    onClick={
                      handleClearAll
                    }
                  >
                    Clear
                  </button>

                )}

              </div>

            </div>


            {/* FILTERS */}

            <div
              className="notification-filters"
            >

              {FILTERS
                .filter(
                  (item) => {

                    if (
                      item.key ===
                      'all'
                    ) {
                      return true
                    }


                    return allowedTypes(
                      user,
                      activeWorkspace
                    ).includes(
                      item.key
                    )

                  }
                )
                .map(
                  (item) => (

                    <button
                      type="button"
                      key={
                        item.key
                      }
                      className={
                        filter ===
                        item.key
                          ? 'active'
                          : ''
                      }
                      onClick={() =>
                        setFilter(
                          item.key
                        )
                      }
                    >

                      {item.label}

                    </button>

                  )
                )}

            </div>


            {/* LIST */}

            <div
              className="notification-list"
            >

              {filtered.length === 0 && (

                <div
                  className="notification-empty"
                >

                  <div
                    className="notification-empty-icon"
                  >
                    🔔
                  </div>

                  <strong>
                    No new notifications
                  </strong>

                  <span>
                    Important updates for your role will appear here.
                  </span>

                </div>

              )}


              {filtered.map(
                (notification) => {

                  const isRead =
                    read.has(
                      notification.id
                    )


                  return (

                    <button
                      type="button"
                      key={
                        notification.id
                      }
                      className={
                        `notification-item ${
                          isRead
                            ? 'read'
                            : 'unread'
                        }`
                      }
                      onClick={() =>
                        handleOpen(
                          notification
                        )
                      }
                    >

                      <span
                        className={
                          `notification-item-icon notification-${notification.type}`
                        }
                      >

                        {getIcon(
                          notification.type
                        )}

                      </span>


                      <span
                        className="notification-item-copy"
                      >

                        <span
                          className="notification-title-row"
                        >

                          <strong>
                            {
                              notification.title
                            }
                          </strong>

                          {!isRead && (

                            <span
                              className="notification-unread-dot"
                            />

                          )}

                        </span>


                        <span>
                          {
                            notification.message
                          }
                        </span>


                        {notification.time && (

                          <small>
                            {
                              formatTime(
                                notification.time
                              )
                            }
                          </small>

                        )}

                      </span>


                      {!isRead && (

                        <span
                          className="notification-unread-side"
                        />

                      )}

                    </button>

                  )

                }
              )}

            </div>

          </div>

        </>

      )}

    </div>,

    headerHost

  )

}