import QcDropsView from './QcDropsView'
import QcMotherTinctureView from './QcMotherTinctureView'
import QcSyrupView from './QcSyrupView'
import QcTabletView from './QcTabletView'
import QcOilView from './QcOilView'
import ComingSoonCoA from './ComingSoonCoA'

/**
 * Normalizes any dosage form string to canonical project constants:
 * ['Liquid', 'Tablet', 'Capsule', 'Syrup', 'Drops', 'Oil', 'Kits', 'Pills', 'Mother Tincture']
 */
export function normalizeCoaDosageForm(raw) {
  if (!raw) return null
  const s = String(raw).trim().toLowerCase()

  if (s.startsWith('drop')) return 'Drops'
  if (s.includes('mother') || s.includes('tincture') || s === 'mt') return 'Mother Tincture'
  if (s.startsWith('syrup') || s === 'syp') return 'Syrup'
  if (s.startsWith('tablet') || s === 'tab') return 'Tablet'
  if (s.startsWith('oil')) return 'Oil'
  if (s.startsWith('capsule') || s === 'cap') return 'Capsule'
  if (s.startsWith('kit')) return 'Kits'
  if (s.startsWith('pill')) return 'Pills'
  if (s.startsWith('liquid') || s.includes('solution') || s.includes('suspension')) return 'Liquid'

  return null
}

/**
 * SINGLE DOSAGE FORM -> COA COMPONENT REGISTRY
 * To add a new dosage form's CoA later, add one line here:
 * e.g. Liquid: QcLiquidView
 */
export const COA_REGISTRY = {
  Drops: QcDropsView,
  'Mother Tincture': QcMotherTinctureView,
  Syrup: QcSyrupView,
  Tablet: QcTabletView,
  Oil: QcOilView,
}

export const PENDING_COA_DOSAGE_FORMS = ['Capsule', 'Kits', 'Pills', 'Liquid']

/**
 * Returns the exact CoA component for the given dosage form,
 * or ComingSoonCoA if not implemented or pending.
 * NEVER returns another dosage form's CoA.
 */
export function getCoaComponent(dosageForm) {
  const norm = normalizeCoaDosageForm(dosageForm)
  if (norm && COA_REGISTRY[norm]) {
    return COA_REGISTRY[norm]
  }
  return ComingSoonCoA
}

/**
 * Checks whether a given dosage form has an implemented CoA format.
 */
export function isCoaImplemented(dosageForm) {
  const norm = normalizeCoaDosageForm(dosageForm)
  return Boolean(norm && COA_REGISTRY[norm])
}

export {
  QcDropsView,
  QcMotherTinctureView,
  QcSyrupView,
  QcTabletView,
  QcOilView,
  ComingSoonCoA,
}
