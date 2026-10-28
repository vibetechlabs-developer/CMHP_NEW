const EVENT_NAME =
  'cmhp:notification'

const STORAGE_PREFIX =
  'cmhp_custom_notifications_v2'


function getStorageKey(
  userId,
  workspace
) {
  return `${STORAGE_PREFIX}_${userId || 'guest'}_${workspace || 'none'}`
}


function safeRead(
  userId,
  workspace
) {

  try {

    const raw =
      localStorage.getItem(
        getStorageKey(
          userId,
          workspace
        )
      )

    const parsed =
      raw
        ? JSON.parse(raw)
        : []

    return Array.isArray(parsed)
      ? parsed
      : []

  } catch {

    return []

  }

}


function safeWrite(
  userId,
  workspace,
  rows
) {

  try {

    localStorage.setItem(
      getStorageKey(
        userId,
        workspace
      ),
      JSON.stringify(
        rows.slice(0, 200)
      )
    )

  } catch {
    // Ignore storage errors.
  }

}


/*
 * Create a custom persistent notification.
 *
 * This is API-ready.
 *
 * Later your senior can call this after
 * receiving a notification from backend.
 */
export function addNotification(
  notification = {}
) {

  const row = {

    id:
      notification.id ||
      `custom-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,

    type:
      notification.type ||
      'system',

    title:
      notification.title ||
      'Notification',

    message:
      notification.message ||
      '',

    path:
      notification.path ||
      null,

    created_at:
      notification.created_at ||
      new Date().toISOString(),

    userId:
      notification.userId ||
      null,

    companyId:
      notification.companyId ||
      null,

    workspace:
      notification.workspace ||
      null,

    read:
      false,

  }


  const rows =
    safeRead(
      row.userId,
      row.workspace
    )


  const next = [

    row,

    ...rows.filter(
      (item) =>
        item.id !== row.id
    ),

  ]


  safeWrite(
    row.userId,
    row.workspace,
    next
  )


  window.dispatchEvent(
    new CustomEvent(
      EVENT_NAME,
      {
        detail: row,
      }
    )
  )


  return row

}


/*
 * Simple notification helpers.
 *
 * Existing code can continue using these.
 */

export function notify(
  message,
  type = 'success'
) {

  window.dispatchEvent(
    new CustomEvent(
      EVENT_NAME,
      {
        detail: {
          message,
          type,
          title:
            type === 'error'
              ? 'Alert'
              : type === 'warning'
                ? 'Warning'
                : 'Update',
        },
      }
    )
  )

}


export function notifySuccess(
  message
) {

  notify(
    message,
    'success'
  )

}


export function notifyError(
  message
) {

  notify(
    message,
    'error'
  )

}


export function notifyWarning(
  message
) {

  notify(
    message,
    'warning'
  )

}


/*
 * Get custom notifications.
 */

export function getCustomNotifications(
  userId,
  workspace
) {

  return safeRead(
    userId,
    workspace
  )

}


/*
 * Delete one custom notification.
 */

export function removeNotification(
  id,
  userId,
  workspace
) {

  const rows =
    safeRead(
      userId,
      workspace
    )


  safeWrite(
    userId,
    workspace,
    rows.filter(
      (item) =>
        item.id !== id
    )
  )


  window.dispatchEvent(
    new CustomEvent(
      EVENT_NAME,
      {
        detail: {
          action: 'remove',
          id,
        },
      }
    )
  )

}


/*
 * Clear custom notifications.
 */

export function clearNotifications(
  userId,
  workspace
) {

  try {

    localStorage.removeItem(
      getStorageKey(
        userId,
        workspace
      )
    )

  } catch {
    // Ignore storage errors.
  }


  window.dispatchEvent(
    new CustomEvent(
      EVENT_NAME,
      {
        detail: {
          action: 'clear',
        },
      }
    )
  )

}


/*
 * Listen for notification updates.
 */

export function subscribeNotifications(
  callback
) {

  const handler =
    (event) => {

      callback(
        event.detail
      )

    }


  window.addEventListener(
    EVENT_NAME,
    handler
  )


  return () => {

    window.removeEventListener(
      EVENT_NAME,
      handler
    )

  }

}