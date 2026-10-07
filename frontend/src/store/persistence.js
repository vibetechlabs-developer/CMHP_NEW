const ERP_STORAGE_KEY = 'cmhp_erp_state_v2'

function isBrowser() {
  return (
    typeof window !== 'undefined' &&
    typeof window.localStorage !== 'undefined'
  )
}

export function loadPersistedERPState() {
  if (!isBrowser()) {
    return null
  }

  try {
    const raw = localStorage.getItem(ERP_STORAGE_KEY)

    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw)

    if (!parsed || typeof parsed !== 'object') {
      return null
    }

    return parsed
  } catch (error) {
    console.error(
      'CMHP ERP: Failed to load saved ERP data:',
      error
    )

    return null
  }
}

export function savePersistedERPState(state) {
  if (!isBrowser()) {
    return
  }

  try {
    localStorage.setItem(
      ERP_STORAGE_KEY,
      JSON.stringify(state)
    )
  } catch (error) {
    console.error(
      'CMHP ERP: Failed to save ERP data:',
      error
    )
  }
}

export function clearPersistedERPState() {
  if (!isBrowser()) {
    return
  }

  localStorage.removeItem(ERP_STORAGE_KEY)
}

export { ERP_STORAGE_KEY }