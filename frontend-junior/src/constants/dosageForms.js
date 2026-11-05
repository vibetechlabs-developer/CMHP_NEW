export const DOSAGE_FORMS = [
  'Liquid',
  'Tablet',
  'Capsule',
  'Syrup',
  'Drops',
  'Oil',
  'Kits',
  'Pills',
]

export const DEFAULT_DOSAGE_FORM = 'Liquid'

export function isValidDosageForm(val) {
  return typeof val === 'string' && DOSAGE_FORMS.includes(val)
}
