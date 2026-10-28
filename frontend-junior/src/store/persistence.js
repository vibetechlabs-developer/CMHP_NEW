const ERP_STORAGE_KEY =
  'cmhp_erp_state_v5'

const STORAGE_VERSION =
  5


function isBrowser() {
  return (
    typeof window !== 'undefined' &&
    typeof window.localStorage !== 'undefined'
  )
}


function safeParse(
  value
) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}


export function loadPersistedERPState() {
  if (!isBrowser()) {
    return null
  }

  try {
    let raw = localStorage.getItem(ERP_STORAGE_KEY)
    let isLegacy = false

    if (!raw) {
      // Check legacy storage keys for migration
      raw = localStorage.getItem('cmhp_erp_state_v4') || localStorage.getItem('cmhp_erp_state_v3')
      if (raw) {
        isLegacy = true
      }
    }

    if (!raw) {
      return null
    }

    const parsed = safeParse(raw)

    if (
      !parsed ||
      typeof parsed !== 'object'
    ) {
      return null
    }

    let data = null
    const version = parsed.version || (isLegacy ? 4 : STORAGE_VERSION)

    if (
      parsed.version &&
      parsed.data
    ) {
      if (
        parsed.version >
        STORAGE_VERSION
      ) {
        console.warn(
          'CMHP ERP: Stored data is newer than this application.'
        )

        return null
      }

      data = parsed.data
    } else {
      data = parsed
    }

    if (data && typeof data === 'object') {
      // If migrating from an older version (< 5), guarantee products and formulas start completely empty
      if (version < 5 || isLegacy) {
        data.products = []
        data.formulas = []
        if (data.byCompany?.cmhp) {
          data.byCompany.cmhp.products = []
          data.byCompany.cmhp.formulas = []
        }
        if (data.byCompany?.tej) {
          data.byCompany.tej.products = []
          data.byCompany.tej.formulas = []
        }
        // Persist clean version 5 state
        savePersistedERPState(data)
      }

      delete data.locations
      if (!Array.isArray(data.commonProducts)) data.commonProducts = []
      if (!Array.isArray(data.commonRawMaterials)) data.commonRawMaterials = []
      if (!Array.isArray(data.stockLedgerEntries)) data.stockLedgerEntries = []

      return data
    }

    return null
  } catch (error) {
    console.error(
      'CMHP ERP: Failed to load saved data:',
      error
    )

    return null
  }
}


export function savePersistedERPState(
  state
) {
  if (!isBrowser()) {
    return
  }

  try {
    localStorage.setItem(
      ERP_STORAGE_KEY,
      JSON.stringify({
        version:
          STORAGE_VERSION,

        savedAt:
          new Date().toISOString(),

        data:
          state,
      })
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

  localStorage.removeItem(
    ERP_STORAGE_KEY
  )
}


export function exportERPState(
  state
) {
  return JSON.stringify(
    {
      application:
        'CMHP ERP',

      version:
        STORAGE_VERSION,

      exportedAt:
        new Date().toISOString(),

      data:
        state,
    },
    null,
    2
  )
}


export function importERPState(
  raw
) {
  const parsed =
    typeof raw === 'string'
      ? safeParse(raw)
      : raw

  if (
    !parsed ||
    typeof parsed !== 'object'
  ) {
    throw new Error(
      'Invalid ERP backup file.'
    )
  }

  if (
    parsed.data &&
    typeof parsed.data === 'object'
  ) {
    return parsed.data
  }

  return parsed
}


export {
  ERP_STORAGE_KEY,
  STORAGE_VERSION,
}