import { Link } from 'react-router-dom'

// Shown in place of an area whose screens still use demo data. The original
// screen remains in the source and comes back when its backend is connected.
export default function ModuleNotConnected({ name }) {
  return (
    <section className="module-not-connected">
      <h2>{name}</h2>
      <p>This module is not connected yet.</p>
      <p>Use these areas, which are connected to the server:</p>
      <ul>
        <li>
          <Link to="/orders">Orders</Link>
        </li>
        <li>
          <Link to="/customer-management">Customers</Link>
        </li>
        <li>
          <Link to="/products">Products</Link>
        </li>
        <li>
          <Link to="/companies">User Management</Link>
        </li>
      </ul>
    </section>
  )
}
