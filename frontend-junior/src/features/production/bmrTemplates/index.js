/**
 * BMR Template Registry
 * Central mapping from product type / dosage form to BMR definition.
 * 
 * Rules:
 * - syrup -> F-03, 19 pages, dept "PRODUCTION ( ORAL LIQUID DEPARTMENT)"
 * - drops -> F-02, 19 pages, dept "PRODUCTION ( ORAL LIQUID DEPARTMENT)"
 * - mother-tincture -> F-01, 6 pages, dept "PRODUCTION ( MOTHER TINCTURE DEPARTMENT)"
 * - tablet -> F-05, 19 pages, dept "PRODUCTION ( TABLET DEPARTMENT)"
 * - oil -> F-04, 19 pages, dept "PRODUCTION ( EXTERNAL PREPERATION DEPARTMENT)"
 * - kits, pills, liquid, capsule -> null (NO BMR)
 */

import {
  BMR_SECTIONS as DROPS_BMR_SECTIONS,
  getEmptyBmrData as getEmptyDropsBmrData,
  normalizeBmrData as normalizeDropsBmrData,
  getSectionStatus as getDropsSectionStatus,
} from '../bmrInitialData.js'

import {
  SYRUP_BMR_SECTIONS,
  getEmptySyrupBmrData,
  normalizeSyrupBmrData,
  getSyrupSectionStatus,
} from '../syrupInitialData.js'

import {
  TABLET_BMR_SECTIONS,
  getEmptyTabletBmrData,
  normalizeTabletBmrData,
  getTabletSectionStatus,
} from '../tabletInitialData.js'

import {
  MOTHER_TINCTURE_BMR_SECTIONS,
  getEmptyMotherTinctureBmrData,
  normalizeMotherTinctureBmrData,
  getMotherTinctureSectionStatus,
} from '../motherTinctureInitialData.js'

import {
  OIL_BMR_SECTIONS,
  getEmptyOilBmrData,
  normalizeOilBmrData,
  getOilSectionStatus,
} from '../oilInitialData.js'

import { getDropsPageRenderers } from '../DropsBmrPages.jsx'
import { getSyrupPageRenderers } from '../SyrupBmrPages.jsx'
import { getTabletPageRenderers } from '../TabletBmrPages.jsx'
import { getMotherTincturePageRenderers } from '../MotherTinctureBmrPages.jsx'
import { getOilPageRenderers } from '../OilBmrPages.jsx'

// Primary templates definition
const SYRUP_TEMPLATE = {
  key: 'syrup',
  dosageForm: 'Syrup',
  bmrType: 'syrup',
  title: 'Syrup Oral Dosage Form BMR (19 Pages)',
  pagesCount: 19,
  department: 'PRODUCTION ( ORAL LIQUID DEPARTMENT)',
  formNo: 'FORM NO. SOP/QA/04/F-03/00',
  showMasterTag: true,
  masterTagType: 'master_copy',
  masterTagText: 'MASTER COPY',
  formulaLabel: 'MASTER FOMULA NO.', // Exact PDF typo preserved
  sections: SYRUP_BMR_SECTIONS,
  getEmptyData: getEmptySyrupBmrData,
  normalizeData: normalizeSyrupBmrData,
  getSectionStatus: getSyrupSectionStatus,
  getPageRenderers: getSyrupPageRenderers,
  isAvailable: true,
}

const DROPS_TEMPLATE = {
  key: 'drops',
  dosageForm: 'Drops',
  bmrType: 'drops',
  title: 'Drops Oral Dosage Form BMR (19 Pages)',
  pagesCount: 19,
  department: 'PRODUCTION ( ORAL LIQUID DEPARTMENT)',
  formNo: 'FORM NO. SOP/QA/04/F-02/00',
  showMasterTag: true,
  masterTagType: 'master_copy',
  masterTagText: 'MASTER COPY',
  formulaLabel: 'MASTER FORMULA NO.',
  sections: DROPS_BMR_SECTIONS,
  getEmptyData: getEmptyDropsBmrData,
  normalizeData: normalizeDropsBmrData,
  getSectionStatus: getDropsSectionStatus,
  getPageRenderers: getDropsPageRenderers,
  isAvailable: true,
}

const MOTHER_TINCTURE_TEMPLATE = {
  key: 'mother-tincture',
  dosageForm: 'Mother Tincture',
  bmrType: 'mother_tincture',
  title: 'Mother Tincture Department BMR (6 Pages)',
  pagesCount: 6,
  department: 'PRODUCTION ( MOTHER TINCTURE DEPARTMENT)',
  formNo: 'SOP/QA/04/F-01/00', // No "FORM NO." prefix in PDF
  showMasterTag: false,
  sections: MOTHER_TINCTURE_BMR_SECTIONS,
  getEmptyData: getEmptyMotherTinctureBmrData,
  normalizeData: normalizeMotherTinctureBmrData,
  getSectionStatus: getMotherTinctureSectionStatus,
  getPageRenderers: getMotherTincturePageRenderers,
  isAvailable: true,
}

const TABLET_TEMPLATE = {
  key: 'tablet',
  dosageForm: 'Tablet',
  bmrType: 'tablet',
  title: 'Tablet Dosage Form BMR (19 Pages)',
  pagesCount: 19,
  department: 'PRODUCTION ( TABLET DEPARTMENT)',
  formNo: 'FORM NO. SOP/QA/04/F-05/00',
  showMasterTag: false,
  formulaLabel: 'MASTER FORMULA NO.',
  supersedesPrefill: '00',
  versionPrefill: '01',
  sections: TABLET_BMR_SECTIONS,
  getEmptyData: getEmptyTabletBmrData,
  normalizeData: normalizeTabletBmrData,
  getSectionStatus: getTabletSectionStatus,
  getPageRenderers: getTabletPageRenderers,
  isAvailable: true,
}

const OIL_TEMPLATE = {
  key: 'oil',
  dosageForm: 'Oil',
  bmrType: 'oil',
  title: 'Oil External Preparation BMR (19 Pages)',
  pagesCount: 19,
  department: 'PRODUCTION ( EXTERNAL PREPERATION DEPARTMENT)', // Exact PDF typo preserved
  formNo: 'FORM NO. SOP/QA/04/F-04/00',
  showMasterTag: true,
  masterTagType: 'master_oil',
  masterTagText: 'MASTER',
  formulaLabel: 'MASTER FORMULA NO.',
  sections: OIL_BMR_SECTIONS,
  getEmptyData: getEmptyOilBmrData,
  normalizeData: normalizeOilBmrData,
  getSectionStatus: getOilSectionStatus,
  getPageRenderers: getOilPageRenderers,
  isAvailable: true,
}

/**
 * Registry mapping product type / slug to BMR template or null.
 * Adding a future BMR is a one-line entry here.
 */
export const BMR_REGISTRY = {
  // 5 Active BMRs
  'syrup': SYRUP_TEMPLATE,
  'drops': DROPS_TEMPLATE,
  'mother-tincture': MOTHER_TINCTURE_TEMPLATE,
  'tablet': TABLET_TEMPLATE,
  'oil': OIL_TEMPLATE,

  // 4 Explicit No-BMR types mapped to null
  'kits': null,
  'pills': null,
  'liquid': null,
  'capsule': null,
}

// Canonical display names for product types
export const PRODUCT_TYPE_LABELS = {
  'syrup': 'Syrup',
  'drops': 'Drops',
  'mother-tincture': 'Mother Tincture',
  'tablet': 'Tablet',
  'oil': 'Oil',
  'kits': 'Kits',
  'pills': 'Pills',
  'liquid': 'Liquid',
  'capsule': 'Capsule',
}

/**
 * Normalizes any slug, dosage form string, or user input to canonical registry key.
 * @param {string} input
 * @returns {string}
 */
export function normalizeProductTypeKey(input) {
  if (!input) return ''
  const str = String(input).trim().toLowerCase().replace(/_/g, '-')
  if (str === 'mt' || str.includes('mother') || str.includes('tincture')) return 'mother-tincture'
  if (str.includes('syrup')) return 'syrup'
  if (str.includes('drop')) return 'drops'
  if (str.includes('tab')) return 'tablet'
  if (str.includes('oil')) return 'oil'
  if (str.includes('kit')) return 'kits'
  if (str.includes('pill')) return 'pills'
  if (str.includes('liquid') || str.includes('suspension')) return 'liquid'
  if (str.includes('cap')) return 'capsule'
  return str
}

/**
 * Returns the human-readable product type label from an input string.
 * @param {string} input
 * @returns {string}
 */
export function getProductTypeDisplayName(input) {
  if (!input) return 'this Product Type'
  const key = normalizeProductTypeKey(input)
  if (PRODUCT_TYPE_LABELS[key]) return PRODUCT_TYPE_LABELS[key]
  // Fallback: capitalize input
  const raw = String(input).trim()
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

/**
 * Resolves the BMR template for a dosage form or slug.
 * Returns the template object for valid BMR types, or null for no-BMR / unknown types.
 * @param {string} typeOrSlug
 * @returns {object|null}
 */
export function getBmrTemplate(typeOrSlug) {
  if (!typeOrSlug) return null
  const key = normalizeProductTypeKey(typeOrSlug)
  return BMR_REGISTRY[key] || null
}

/**
 * Check if a product type has an active BMR template.
 * @param {string} typeOrSlug
 * @returns {boolean}
 */
export function isBmrAvailable(typeOrSlug) {
  const tmpl = getBmrTemplate(typeOrSlug)
  return Boolean(tmpl && tmpl.isAvailable)
}

// Backward-compatible dictionary for existing components that iterate BMR_TEMPLATES
export const BMR_TEMPLATES = {
  Syrup: SYRUP_TEMPLATE,
  Drops: DROPS_TEMPLATE,
  'Mother Tincture': MOTHER_TINCTURE_TEMPLATE,
  Tablet: TABLET_TEMPLATE,
  Oil: OIL_TEMPLATE,
  // Alias mappings
  'mother-tincture': MOTHER_TINCTURE_TEMPLATE,
  syrup: SYRUP_TEMPLATE,
  drops: DROPS_TEMPLATE,
  tablet: TABLET_TEMPLATE,
  oil: OIL_TEMPLATE,
}
