// Real apps.receiving integration - draft goods receipt entry, review and
// explicit posting. Reuses the EXISTING, already-tested backend receiving
// service end to end (apps.receiving.services.create_goods_receipt/
// update_goods_receipt/post_goods_receipt/cancel_goods_receipt); nothing
// here introduces a second receipt path or duplicates StockMovement.
// Store-scoped: every call names the store the receipt belongs to.
import api from '../../api/axios'

const basePath = (storeId) => `/v1/stores/${storeId}/goods-receipts`

export async function listGoodsReceipts(storeId, { status, page, pageSize } = {}) {
  const params = {}
  if (status) params.status = status
  if (page) params.page = page
  if (pageSize) params.page_size = pageSize
  const response = await api.get(`${basePath(storeId)}/`, { params })
  return response.data // {count, next, previous, results}
}

export async function getGoodsReceipt(storeId, receiptId) {
  const response = await api.get(`${basePath(storeId)}/${receiptId}/`)
  return response.data
}

// `payload`: {source_purchase_order_id, arrived_at, delivery_note_reference,
// notes, idempotency_key, lines: [{source_po_line_id, received_quantity,
// lot_reference}]}. `lines` may be omitted/empty - an empty draft can be
// filled in afterwards via updateGoodsReceipt.
export async function createGoodsReceipt(storeId, payload) {
  const response = await api.post(`${basePath(storeId)}/`, payload)
  return response.data
}

// `payload` must include `expected_version`, plus any subset of
// arrived_at/delivery_note_reference/notes/lines. When `lines` is present
// it is the COMPLETE final list (full-replace, not a partial patch) - see
// apps.receiving.services.update_goods_receipt's own docstring. DRAFT only.
export async function updateGoodsReceipt(storeId, receiptId, payload) {
  const response = await api.patch(`${basePath(storeId)}/${receiptId}/`, payload)
  return response.data
}

export async function postGoodsReceipt(storeId, receiptId, expectedVersion) {
  const response = await api.post(`${basePath(storeId)}/${receiptId}/post/`, { expected_version: expectedVersion })
  return response.data
}

export async function cancelGoodsReceipt(storeId, receiptId, expectedVersion, cancellationReason) {
  const response = await api.post(`${basePath(storeId)}/${receiptId}/cancel/`, {
    expected_version: expectedVersion,
    cancellation_reason: cancellationReason,
  })
  return response.data
}

// Minimal eligible-PO lookup for creating a new receipt - ISSUED purchase
// orders the caller can see, with physical delivery progress per line
// (never price/amount). See apps.receiving.services.
// eligible_purchase_orders_for_receiving.
export async function listEligiblePurchaseOrders(storeId, { page, pageSize } = {}) {
  const params = {}
  if (page) params.page = page
  if (pageSize) params.page_size = pageSize
  const response = await api.get(`${basePath(storeId)}/eligible-purchase-orders/`, { params })
  return response.data
}
