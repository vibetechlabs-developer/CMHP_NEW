/**
 * BMR Template Registry
 * Central mapping from dosage form to BMR definition.
 * Dosage Form options: Liquid, Tablet, Capsule, Syrup, Drops, Oil, Kits, Pills.
 * - Drops -> Drops BMR (19 pages, form no. SOP/QA/04/F-02/00)
 * - Syrup -> Syrup BMR (19 pages, form no. SOP/QA/04/F-03/00)
 * - All other forms -> null (coming soon)
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

export const BMR_TEMPLATES = {
  Liquid: {
    dosageForm: 'Liquid',
    bmrType: 'drops',
    title: 'Oral Liquid Formulation BMR (19 Pages)',
    pagesCount: 19,
    department: 'PRODUCTION ( ORAL LIQUID DEPARTMENT)',
    formNo: 'FORM NO. SOP/QA/04/F-02/00',
    sections: DROPS_BMR_SECTIONS,
    getEmptyData: getEmptyDropsBmrData,
    normalizeData: normalizeDropsBmrData,
    getSectionStatus: getDropsSectionStatus,
    isAvailable: true,
  },
  Tablet: {
    dosageForm: 'Tablet',
    bmrType: 'drops',
    title: 'Solid Oral Formulation BMR (19 Pages)',
    pagesCount: 19,
    department: 'PRODUCTION ( SOLID ORAL DEPARTMENT)',
    formNo: 'FORM NO. SOP/QA/04/F-02/00',
    sections: DROPS_BMR_SECTIONS,
    getEmptyData: getEmptyDropsBmrData,
    normalizeData: normalizeDropsBmrData,
    getSectionStatus: getDropsSectionStatus,
    isAvailable: true,
  },
  Capsule: {
    dosageForm: 'Capsule',
    bmrType: 'drops',
    title: 'Capsule Formulation BMR (19 Pages)',
    pagesCount: 19,
    department: 'PRODUCTION ( SOLID ORAL DEPARTMENT)',
    formNo: 'FORM NO. SOP/QA/04/F-02/00',
    sections: DROPS_BMR_SECTIONS,
    getEmptyData: getEmptyDropsBmrData,
    normalizeData: normalizeDropsBmrData,
    getSectionStatus: getDropsSectionStatus,
    isAvailable: true,
  },
  Syrup: {
    dosageForm: 'Syrup',
    bmrType: 'syrup',
    title: 'Syrup Oral Dosage Form BMR (19 Pages)',
    pagesCount: 19,
    department: 'PRODUCTION ( ORAL LIQUID DEPARTMENT)',
    formNo: 'FORM NO. SOP/QA/04/F-03/00',
    sections: SYRUP_BMR_SECTIONS,
    getEmptyData: getEmptySyrupBmrData,
    normalizeData: normalizeSyrupBmrData,
    getSectionStatus: getSyrupSectionStatus,
    isAvailable: true,
  },
  Drops: {
    dosageForm: 'Drops',
    bmrType: 'drops',
    title: 'Drops Oral Dosage Form BMR (19 Pages)',
    pagesCount: 19,
    department: 'PRODUCTION ( ORAL LIQUID DEPARTMENT)',
    formNo: 'FORM NO. SOP/QA/04/F-02/00',
    sections: DROPS_BMR_SECTIONS,
    getEmptyData: getEmptyDropsBmrData,
    normalizeData: normalizeDropsBmrData,
    getSectionStatus: getDropsSectionStatus,
    isAvailable: true,
  },
  Oil: {
    dosageForm: 'Oil',
    bmrType: 'drops',
    title: 'Oral Liquid Formulation BMR (19 Pages)',
    pagesCount: 19,
    department: 'PRODUCTION ( ORAL LIQUID DEPARTMENT)',
    formNo: 'FORM NO. SOP/QA/04/F-02/00',
    sections: DROPS_BMR_SECTIONS,
    getEmptyData: getEmptyDropsBmrData,
    normalizeData: normalizeDropsBmrData,
    getSectionStatus: getDropsSectionStatus,
    isAvailable: true,
  },
  Kits: null,
  Pills: null,
}

/**
 * Returns the BMR template for a given dosage form.
 * Matches case-insensitively and falls back to standard Drops/Syrup Oral Liquid template so BMR is always functional.
 * @param {string} dosageForm
 * @returns {object}
 */
export function getBmrTemplate(dosageForm) {
  if (!dosageForm) return BMR_TEMPLATES.Drops
  const normalized = String(dosageForm).trim().toLowerCase()
  if (normalized.includes('syrup')) return BMR_TEMPLATES.Syrup
  if (normalized.includes('drop')) return BMR_TEMPLATES.Drops
  if (normalized.includes('liquid')) return BMR_TEMPLATES.Liquid

  const matchKey = Object.keys(BMR_TEMPLATES).find(
    (k) => k.toLowerCase() === normalized
  )
  if (matchKey && BMR_TEMPLATES[matchKey]) {
    return BMR_TEMPLATES[matchKey]
  }
  // Default to standard Oral Liquid (Drops) 19-page BMR template
  return BMR_TEMPLATES.Drops
}


/**
 * Check if a dosage form has an implemented BMR template.
 * @param {string} dosageForm
 * @returns {boolean}
 */
export function isBmrAvailable(dosageForm) {
  return getBmrTemplate(dosageForm) !== null
}
