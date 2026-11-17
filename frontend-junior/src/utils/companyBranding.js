/**
 * Company Branding Helper
 *
 * Central authority for document branding across CMHP Pharma and Tej Biocare.
 * Rules:
 *  - CMHP: returns existing legacy assets and values.
 *  - Tej Biocare returns /logo2.jpeg, TEJ BIOCARE uppercase header, and TEJ code.
 *  - Resolves company from record first, falling back to active workspace / storage.
 */

import { getSelectedWorkspace, WORKSPACES } from './workspace.js'

function getStoredActiveCompanyKey() {
  try {
    // 1. Inspect URL in browser environment (e.g. /products/3/..., /companies/3/..., companyId=3)
    if (typeof window !== 'undefined' && window.location) {
      const pathname = window.location.pathname || ''
      const search = window.location.search || ''
      if (
        pathname.match(/\/(?:products|companies|stores|orders|formulas|inventory|production)\/3(?:\/|$)/) ||
        pathname.includes('/company_b/') ||
        search.includes('companyId=3') ||
        search.includes('company=3')
      ) {
        return 'tej'
      }
      if (
        pathname.match(/\/(?:products|companies|stores|orders|formulas|inventory|production)\/2(?:\/|$)/) ||
        pathname.includes('/company_a/') ||
        search.includes('companyId=2') ||
        search.includes('company=2')
      ) {
        return 'cmhp'
      }
    }

    // 2. Active workspace selection in localStorage
    const ws = getSelectedWorkspace()
    if (ws === WORKSPACES.COMPANY_B || ws === 'company_b' || ws === '3' || ws === 3 || ws === 'tej') {
      return 'tej'
    }
    if (ws === WORKSPACES.COMPANY_A || ws === 'company_a' || ws === '2' || ws === 2 || ws === 'cmhp' || ws === '1' || ws === 1) {
      return 'cmhp'
    }

    // 3. User's selectedCompanyId in localStorage
    if (typeof localStorage !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith('cmhp.selectedCompanyId.')) {
          const val = localStorage.getItem(key)
          if (val === '3' || val === 'tej' || val === 'company_b') return 'tej'
          if (val === '2' || val === 'cmhp' || val === 'company_a' || val === '1') return 'cmhp'
        }
      }

      // 4. Inspect Redux persisted state in localStorage if present
      const raw = localStorage.getItem('cmhp_erp_state_v5')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.activeCompanyKey === 'tej' || parsed?.activeCompanyId === 3 || parsed?.activeCompanyId === '3') {
          return 'tej'
        }
        if (
          parsed?.activeCompanyKey === 'cmhp' ||
          parsed?.activeCompanyId === 2 ||
          parsed?.activeCompanyId === '2' ||
          parsed?.activeCompanyId === 1 ||
          parsed?.activeCompanyId === '1'
        ) {
          return 'cmhp'
        }
      }
    }
  } catch {
    // ignore storage errors
  }
  return null
}

export function isTejBiocare(target) {
  // If target is undefined or null or empty string, inspect active context
  if (target === undefined || target === null || target === '') {
    const active = getStoredActiveCompanyKey()
    return active === 'tej'
  }

  // If a number was passed
  if (typeof target === 'number') {
    if (target === 3) return true
    if (target === 2 || target === 1) return false
    const active = getStoredActiveCompanyKey()
    return active === 'tej'
  }

  // If a string was passed
  if (typeof target === 'string') {
    const s = target.trim().toLowerCase()
    if (s === '3' || s === 'company_b' || s === 'tej' || s.includes('tej') || s === 'tb') {
      return true
    }
    if (s === '2' || s === '1' || s === 'company_a' || s === 'cmhp' || s.includes('cmhp') || s.includes('central')) {
      return false
    }
    const active = getStoredActiveCompanyKey()
    return active === 'tej'
  }

  // If an object (company, order, invoice, batch, product, formula, etc.) was passed
  if (typeof target === 'object') {
    // 1. Explicit company ID (handles Company model { id: 3 }, records { company: 3 }, { company_id: 3 }, etc.)
    const rawId =
      target.companyId ??
      target.company_id ??
      target.company ??
      target.activeCompanyId ??
      target.realCompanyId ??
      (target.code || target.display_name ? target.id : undefined)
    const compId = typeof rawId === 'object' && rawId !== null ? (rawId.id ?? rawId.company_id) : rawId
    if (compId !== undefined && compId !== null && compId !== '') {
      const numId = Number(compId)
      if (numId === 3 || String(compId).toLowerCase() === 'tej' || String(compId) === 'company_b') {
        return true
      }
      if (numId === 2 || numId === 1 || String(compId).toLowerCase() === 'cmhp' || String(compId) === 'company_a') {
        return false
      }
    }

    // 2. Explicit company name (handles { name: 'Tej Biocare' }, { company_name: 'Tej Biocare' }, etc.)
    const compName =
      target.company_name ||
      target.companyName ||
      target.company_title ||
      target.companyTitle ||
      target.name ||
      target.display_name ||
      target.displayName ||
      target.legal_name ||
      ''
    if (typeof compName === 'string' && compName.trim()) {
      const lower = compName.toLowerCase()
      if (lower.includes('tej')) return true
      if (lower.includes('cmhp') || lower.includes('central')) return false
    }

    // 3. Explicit company code (handles { code: 'TEJ BIOCARE' }, { company_code: 'TB' }, etc.)
    const compCode =
      target.company_code ||
      target.companyCode ||
      target.code ||
      target.short_name ||
      target.shortName ||
      ''
    if (typeof compCode === 'string' && compCode.trim()) {
      const upper = compCode.toUpperCase().trim()
      if (upper.includes('TEJ') || upper === 'TB') return true
      if (upper.includes('CMHP')) return false
    }

    // 4. Nested company object if present
    if (target.company && typeof target.company === 'object') {
      const nested = isTejBiocare(target.company)
      if (nested !== null && nested !== undefined) return nested
    }

    // 5. Fall back to active workspace
    const active = getStoredActiveCompanyKey()
    return active === 'tej'
  }

  return false
}

export function getCompanyBranding(target) {
  const isTej = isTejBiocare(target)

  if (isTej) {
    return {
      isTej: true,
      isCMHP: false,
      logoSrc: '/logo2.jpeg',
      invoiceLogoSrc: '/logo2.jpeg',
      headerName: 'TEJ BIOCARE',
      normalName: 'Tej Biocare',
      legalName: 'Tej Biocare',
      code: 'TEJ',
      forCompany: 'For Tej Biocare',
      mfgFor: 'TEJ',
      companyNameUpper: 'TEJ BIOCARE',
      bmrPrefix: 'BMR/TEJ',
      tagline: 'Healthcare & Formulations',
      logoFitClass: 'tej-logo-fit',
      factoryAddress: 'Plot No. 42, GIDC Industrial Estate, Sanand, Ahmedabad - 382110',
      companyContacts: 'Tel: +91 79 2658 1122          Mob: +91 98250 44332',
      gstin: '24AAJCT4589P1Z3',
      dl: 'GH-20B/21B',
      pan: 'AAJCT4589P',
    }
  }

  return {
    isTej: false,
    isCMHP: true,
    logoSrc: '/logo.jpg',
    invoiceLogoSrc: '/cmhp_invoice_logo.png',
    headerName: 'CMHP PRIVATE LIMITED',
    normalName: 'CMHP Pharma',
    legalName: 'CMHP Pharmaceuticals Private Limited',
    code: 'CMHP',
    forCompany: 'For CMHP Private Limited',
    mfgFor: 'CMHP',
    companyNameUpper: 'CMHP PHARMACEUTICALS PVT. LTD.',
    bmrPrefix: 'BMR/CMHP',
    tagline: 'Better Health Brighter Tomorrow',
    logoFitClass: '',
    factoryAddress: 'Factory : 18, Shubh Laxmi, Viramgam Road,Sanand,Ahmedabad-382110. Regd.Off.: 701, Safal Prelude, Corporate Road, Ahmedabad-380015',
    companyContacts: 'Tel: +917947977198          Mob: +919327252466',
    gstin: '24AAICC9380N1Z2',
    dl: 'GH-7',
    pan: 'AAICC9380N',
  }
}
