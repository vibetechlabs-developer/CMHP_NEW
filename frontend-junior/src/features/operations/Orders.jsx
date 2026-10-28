import SalesOrdersPanel from './SalesOrdersPanel'
import './Orders.css'

export default function Orders() {
  return (
    <div className="orders-page">
      {/* =====================================================
          HEADER / HERO
          ===================================================== */}
      <header className="orders-header">
        <div className="orders-header-content">
          <span className="orders-eyebrow">Order Processing</span>
          <h1>Sales Orders</h1>
          <p>
            Create and manage sales orders for your pharmaceutical products.
            Track order status, line items, and fulfilment from placement
            through to dispatch.
          </p>
        </div>

        <div className="orders-header-mark" aria-hidden="true">
          <span>+</span>
        </div>
      </header>

      {/* =====================================================
          PANEL CONTENT
          ===================================================== */}
      <SalesOrdersPanel />
    </div>
  )
}