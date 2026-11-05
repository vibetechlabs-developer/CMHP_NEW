// Which navigation areas are still demo data. Used to label them in the
// menu and on the page. Anything not listed here is connected to the
// backend (or is a session/auth area with nothing to connect).
//
// A demo area's edits happen only in the browser. They are NOT saved to
// the server, so the page must never say "saved" for them.
//
// Audit Status:
// - Connected real flows:
//   * Overview tab / Common Inventory Dashboard (/inventory) - real store summary, metrics, movements, and ledger
//   * Authentication & Workspace Switching (/login, /workspace-select)
//   * Raw Materials catalog & Add/Edit (/inventory/materials)
//   * Material Register, Inward & Outward (/inventory/materials/:id)
//   * Products catalog & Add/Edit/Import (/products, /inventory/products)
//   * Formula Revisions & Requirements (/inventory/products/:cId/:pId/formulas)
//   * Batch Planning, Allocation & Requisitions (/inventory/batch-planning)
//   * Common Material Purchasing (/inventory/orders) - real purchase orders, inward receipts, material requests
//   * Stock & Lots (/inventory/stock) - real stock balances, receipt sources, issue outward
//   * Material Issue to Production (/inventory/issue-return) - real material issues,
//     production custody, returns, QC disposition, defect classification and disposal
//   * Control Samples (/inventory/control-samples) - company-scoped GMP retention register
// - Remaining demo flows:
//   * Invoices, Supply Chain, HRMS (/invoices, /supply-chain, /hrms)
// - Partial:
//   * Profile (/profile) - real user identity, HR persona bridge

const REAL_PREFIXES = [
  '/inventory/materials',
  '/inventory/products',
  '/inventory/batch-planning',
  '/inventory/orders',
  '/inventory/stock',
  '/inventory/issue-return',
  '/inventory/control-samples',
  '/products',
  '/orders',
  '/customer-management',
  '/companies',
  '/dashboard',
  '/quality',
]

const REAL_EXACT = ['/inventory', '/dashboard']

const DEMO_EXACT = []

const DEMO_PREFIXES = [
  '/invoices',
  '/supply-chain',
  '/hrms',
]

const PARTIAL_PATHS = ['/profile']

const matches = (paths, pathname) =>
  paths.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

export function demoStatusFor(pathname) {
  if (REAL_EXACT.includes(pathname) || matches(REAL_PREFIXES, pathname)) return null
  if (DEMO_EXACT.includes(pathname)) return 'demo'
  if (matches(DEMO_PREFIXES, pathname)) return 'demo'
  if (matches(PARTIAL_PATHS, pathname)) return 'partial'
  return null
}

export function demoNoticeText(status) {
  if (status === 'demo') {
    return 'Demo data — not connected. Records on this screen are sample data. Saving here does not write to the server.'
  }
  if (status === 'partial') {
    return 'Partly demo data. Some fields on this screen are not connected to the server, and their saves are not stored.'
  }
  return null
}
