import React, { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { selectActiveCompanyKey } from '../../utils/companySelectors'
import { resolveOrderDosageForm } from '../production/productionService'
import { VERIFIED_QC_ORDERS } from './qcTemplates'
import {
  normalizeCoaDosageForm,
  getCoaComponent,
  ComingSoonCoA,
} from './qcRegistry'
import './QcViewPage.css'

export default function QcViewPage({ orderId: orderIdProp, onBack }) {
  const params = useParams()
  const orderId = orderIdProp || params.orderId
  const navigate = useNavigate()

  const compKey = useSelector(selectActiveCompanyKey)
  const reduxOrders = useSelector((state) => [
    ...(state.erp.byCompany?.[compKey]?.orders || []),
    ...(state.erp.orders || []),
    ...(state.erp.byCompany?.cmhp?.orders || []),
    ...(state.erp.byCompany?.tej?.orders || []),
  ])
  const reduxProducts = useSelector((state) => [
    ...(state.erp.products || []),
    ...(state.erp.commonProducts || []),
    ...(state.erp.byCompany?.[compKey]?.products || []),
    ...(state.erp.byCompany?.cmhp?.products || []),
    ...(state.erp.byCompany?.tej?.products || []),
  ])
  const reduxBmrs = useSelector((state) => state.erp.bmrs || {})

  // Find order
  const baseOrder = useMemo(() => {
    return (
      reduxOrders.find(
        (o) => String(o.id) === String(orderId) || String(o.number) === String(orderId)
      ) ||
      VERIFIED_QC_ORDERS.find(
        (o) => String(o.id) === String(orderId) || String(o.number) === String(orderId)
      )
    )
  }, [reduxOrders, orderId])

  // Multi-product line support
  const [activeLineIdx, setActiveLineIdx] = useState(0)
  const orderLines = useMemo(() => {
    if (Array.isArray(baseOrder?.lines) && baseOrder.lines.length > 0) {
      return baseOrder.lines
    }
    return null
  }, [baseOrder])

  // Derive active line order
  const currentOrder = useMemo(() => {
    if (!baseOrder) return null
    if (!orderLines || orderLines.length <= 1) return baseOrder

    const line = orderLines[activeLineIdx] || orderLines[0]
    return {
      ...baseOrder,
      product_id: line.product_id || baseOrder.product_id,
      product_name: line.product_name || line.name || baseOrder.product_name,
      product_code: line.product_code || line.code || baseOrder.product_code,
      dosage_form: line.dosage_form || line.type || line.dosageForm || baseOrder.dosage_form,
      dosageForm: line.dosage_form || line.type || line.dosageForm || baseOrder.dosageForm,
      batch_no: line.batch_no || baseOrder.batch_no,
      batch_size: line.batch_size || (line.quantity ? `${line.quantity} ${line.unit || 'Units'}` : baseOrder.batch_size),
      quantity: line.quantity ?? baseOrder.quantity,
      activeLineId: line.id || activeLineIdx,
    }
  }, [baseOrder, orderLines, activeLineIdx])

  // Storage key: if multi-line, separate per line; line 0 defaults to orderId for backwards compatibility
  const storageKey = useMemo(() => {
    if (!orderLines || orderLines.length <= 1) return String(orderId)
    const lineId = orderLines[activeLineIdx]?.id || activeLineIdx
    return `${orderId}__line_${lineId}`
  }, [orderId, orderLines, activeLineIdx])

  // Find corresponding product
  const currentProduct = useMemo(() => {
    if (!currentOrder) return null
    return reduxProducts.find(
      (p) =>
        (currentOrder.product_id && String(p.id) === String(currentOrder.product_id)) ||
        (currentOrder.product_code && p.code === currentOrder.product_code) ||
        (currentOrder.product_name && (p.name === currentOrder.product_name || p.product_name === currentOrder.product_name))
    )
  }, [reduxProducts, currentOrder])

  // Corresponding BMR
  const currentBmr = useMemo(() => {
    if (!orderId) return null
    return (
      reduxBmrs[String(orderId)] ||
      (currentOrder?.batch_no ? reduxBmrs[currentOrder.batch_no] : null) ||
      {}
    )
  }, [reduxBmrs, orderId, currentOrder])

  // Resolve dosage form:
  // Source of truth: Order's Type (dosage form); fall back to product's dosage form only if order has none.
  const rawDosage = useMemo(() => {
    if (currentOrder) {
      const fromOrder =
        currentOrder.dosage_form ||
        currentOrder.dosageForm ||
        currentOrder.product_type ||
        currentOrder.type
      if (fromOrder) return fromOrder
    }
    if (currentProduct) {
      return currentProduct.dosage_form || currentProduct.dosageForm || currentProduct.category || ''
    }
    return ''
  }, [currentOrder, currentProduct])

  // Normalise dosage form strictly
  const normalizedDosage = normalizeCoaDosageForm(rawDosage)

  // Look up component in registry
  const TargetCoaComponent = getCoaComponent(normalizedDosage)

  const handleBack = () => {
    if (onBack) onBack()
    else navigate('/qc')
  }

  // If order is completely not found
  if (!baseOrder && !orderId) {
    return (
      <ComingSoonCoA
        orderId={orderId}
        currentOrder={null}
        dosageForm="Unknown"
        onBack={handleBack}
      />
    )
  }

  return (
    <div className="qc-view-page-wrapper">
      {/* If multi-product order, show product line selector */}
      {orderLines && orderLines.length > 1 && (
        <div
          className="qc-multi-line-tabs no-print"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 24px',
            background: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            overflowX: 'auto',
          }}
        >
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
            Product Lines ({orderLines.length}):
          </span>
          {orderLines.map((line, idx) => {
            const isActive = idx === activeLineIdx
            const lineDosage = line.dosage_form || line.type || ''
            return (
              <button
                key={line.id || idx}
                type="button"
                onClick={() => setActiveLineIdx(idx)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: isActive ? '1px solid #0284c7' : '1px solid #cbd5e1',
                  background: isActive ? '#f0f9ff' : '#ffffff',
                  color: isActive ? '#0369a1' : '#334155',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>Line {idx + 1}: {line.product_name || line.name || `Item ${idx + 1}`}</span>
                {lineDosage && (
                  <span
                    style={{
                      fontSize: '11px',
                      background: isActive ? '#bae6fd' : '#f1f5f9',
                      padding: '1px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    {lineDosage}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Render the Exact Dosage Form CoA Component */}
      <TargetCoaComponent
        orderId={orderId}
        currentOrder={currentOrder}
        currentProduct={currentProduct}
        currentBmr={currentBmr}
        dosageForm={normalizedDosage || rawDosage}
        storageKey={storageKey}
        onBack={handleBack}
      />
    </div>
  )
}
