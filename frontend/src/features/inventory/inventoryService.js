import { store } from '../../store/store'
import { delay } from '../../store/mockApi'
import {
  addLocation, editLocation, setLocationStatus,
  addItem, editItem, setItemStatus,
  receiveStock, setLotQcStatus,
  issueStock as issueStockAction,
  returnStock as returnStockAction,
  adjustStock as adjustStockAction,
} from '../../store/erpSlice'

function hydrateItem(item, state) {
  const uom = state.uoms.find((u) => u.id === Number(item.uom))
  const available_quantity = state.lots
    .filter((l) => l.item === item.id)
    .reduce((sum, l) => sum + Number(l.available_quantity || 0), 0)
  return { ...item, uom_code: uom?.code || '', available_quantity }
}

function hydrateLot(lot, state) {
  const item = state.items.find((i) => i.id === Number(lot.item))
  const uom = item ? state.uoms.find((u) => u.id === Number(item.uom)) : null
  const location = state.locations.find((l) => l.id === Number(lot.location))
  return {
    ...lot,
    item_code: item?.code || '',
    item_name: item?.name || '',
    uom_code: uom?.code || '',
    location_name: location?.name || '',
  }
}

function hydrateTransaction(t, state) {
  const item = state.items.find((i) => i.id === Number(t.item))
  const lot = state.lots.find((l) => l.id === Number(t.lot))
  const company = state.companies.find((c) => c.id === Number(t.company))
  return {
    ...t,
    item_code: item?.code || '',
    lot_number: lot?.lot_number || '',
    company_name: company?.name || '',
    created_by_name: t.created_by === 'system' ? 'Demo User' : t.created_by,
  }
}

export const inventoryService = {
  getCompanies: () => delay(store.getState().erp.companies),

  getUoms: () => delay(store.getState().erp.uoms),

  getLocations: () => delay(store.getState().erp.locations),
  createLocation: (payload) => {
    store.dispatch(addLocation(payload))
    return delay(null)
  },
  updateLocation: (id, payload) => {
    store.dispatch(editLocation({ id, payload }))
    return delay(null)
  },
  deactivateLocation: (id) => {
    store.dispatch(setLocationStatus({ id, is_active: false }))
    return delay(null)
  },
  reactivateLocation: (id) => {
    store.dispatch(setLocationStatus({ id, is_active: true }))
    return delay(null)
  },

  getItems: () => {
    const state = store.getState().erp
    return delay(state.items.map((i) => hydrateItem(i, state)))
  },
  createItem: (payload) => {
    store.dispatch(addItem(payload))
    return delay(null)
  },
  updateItem: (id, payload) => {
    store.dispatch(editItem({ id, payload }))
    return delay(null)
  },
  deactivateItem: (id) => {
    store.dispatch(setItemStatus({ id, is_active: false }))
    return delay(null)
  },
  reactivateItem: (id) => {
    store.dispatch(setItemStatus({ id, is_active: true }))
    return delay(null)
  },

  getLots: (params) => {
    const state = store.getState().erp
    let lots = state.lots.map((l) => hydrateLot(l, state))
    if (params?.qc_status) lots = lots.filter((l) => l.qc_status === params.qc_status)
    return delay(lots)
  },
  createReceipt: (payload) => {
    store.dispatch(receiveStock(payload))
    return delay(null)
  },
  qcAction: (lotId, payload) => {
    store.dispatch(setLotQcStatus({ lotId, to_status: payload.to_status, reason: payload.reason }))
    return delay(null)
  },

  getTransactions: (params) => {
    const state = store.getState().erp
    let txns = state.transactions.map((t) => hydrateTransaction(t, state))
    if (params?.limit) txns = txns.slice(0, params.limit)
    return delay(txns)
  },
  issueStock: (payload) => {
    store.dispatch(issueStockAction(payload))
    return delay(null)
  },
  returnStock: (payload) => {
    store.dispatch(returnStockAction(payload))
    return delay(null)
  },
  adjustStock: (payload) => {
    store.dispatch(adjustStockAction(payload))
    return delay(null)
  },

  getStockSummary: () => {
    const state = store.getState().erp
    return delay(state.items.map((i) => hydrateItem(i, state)))
  },

  getConsumptionLedger: () => {
    const state = store.getState().erp
    const rows = state.items
      .map((item) => {
        const uom = state.uoms.find((u) => u.id === Number(item.uom))
        const itemLots = state.lots.filter((l) => l.item === item.id)
        const opening_quantity = itemLots.reduce((sum, l) => sum + Number(l.received_quantity || 0), 0)
        const itemTxns = state.transactions.filter((t) => t.item === item.id)

        const companiesMap = {}
        state.companies.forEach((c) => {
          companiesMap[c.id] = { company_id: c.id, company_name: c.name, issued: 0, returned: 0 }
        })

        let adjustments = 0
        itemTxns.forEach((t) => {
          if (t.transaction_type === 'ISSUE' && t.company && companiesMap[t.company]) {
            companiesMap[t.company].issued += Number(t.quantity)
          }
          if (t.transaction_type === 'RETURN' && t.company && companiesMap[t.company]) {
            companiesMap[t.company].returned += Number(t.quantity)
          }
          if (t.transaction_type === 'ADJUSTMENT') {
            adjustments += Number(t.quantity)
          }
        })

        const companiesArr = Object.values(companiesMap)
        const total_consumption = companiesArr.reduce((sum, c) => sum + c.issued - c.returned, 0)
        const remaining_common_stock = itemLots.reduce((sum, l) => sum + Number(l.available_quantity || 0), 0)

        return {
          item_id: item.id,
          item_code: item.code,
          item_name: item.name,
          opening_quantity,
          uom: uom?.code || '',
          companies: companiesArr,
          total_consumption,
          adjustments,
          remaining_common_stock,
        }
      })
      .filter((row) => row.opening_quantity > 0)

    return delay(rows)
  },

  getDashboardSummary: () => {
    const state = store.getState().erp
    const activeItems = state.items.filter((i) => i.is_active)
    const hydrated = activeItems.map((i) => hydrateItem(i, state))
    const low_stock_items = hydrated.filter((i) => i.available_quantity <= Number(i.reorder_level)).length
    const lots_pending_qc = state.lots.filter((l) => l.qc_status === 'PENDING').length
    const lots_rejected_or_quarantine = state.lots.filter(
      (l) => l.qc_status === 'REJECTED' || l.qc_status === 'QUARANTINE'
    ).length
    const lots_expiring_30_days = state.lots.filter((l) => {
      if (!l.expiry_date) return false
      const days = (new Date(`${l.expiry_date}T00:00:00`) - new Date()) / 86400000
      return days >= 0 && days <= 30
    }).length

    return delay({
      total_items: activeItems.length,
      low_stock_items,
      lots_pending_qc,
      lots_rejected_or_quarantine,
      lots_expiring_30_days,
    })
  },
}