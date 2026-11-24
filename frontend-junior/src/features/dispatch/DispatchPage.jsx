import React from 'react'
import RecordsPage from '../records/RecordsPage'

/**
 * DispatchPage
 * Dispatched orders and shipments management module.
 * Reuses the unified order-wise records table, read-only viewer modal,
 * and compliance documentation dossiers.
 */
export default function DispatchPage() {
  return <RecordsPage mode="dispatch" />
}
