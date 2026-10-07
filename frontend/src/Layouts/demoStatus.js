// Which navigation areas are still demo data. Used to label them in the
// menu and on the page. Anything not listed here is connected to the backend
// (or is a company-setup area that is partly connected, see PARTIAL_PATHS).
//
// A demo area's edits happen only in the browser. They are NOT saved to the
// server, so the page must never say "saved" for them.
const DEMO_PATHS = ['/dashboard', '/quality', '/invoices', '/supply-chain', '/hrms']

// Areas where some tabs are real (users, roles) and others are still demo.
const PARTIAL_PATHS = ['/companies']

const matches = (paths, pathname) =>
  paths.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

export function demoStatusFor(pathname) {
  if (matches(DEMO_PATHS, pathname)) return 'demo'
  if (matches(PARTIAL_PATHS, pathname)) return 'partial'
  return null
}

export function demoNoticeText(status) {
  if (status === 'demo') {
    return 'Demo data — not connected. Records on this screen are sample data. Saving here does not write to the server.'
  }
  if (status === 'partial') {
    return 'Partly demo data. Some tabs on this screen are not connected to the server, and their saves are not stored.'
  }
  return null
}
