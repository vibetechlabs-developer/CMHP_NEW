export function isQaDemoRecord({ productName = '', productCode = '', orderReference = '' }) {
  const name = String(productName || '').trim()
  const code = String(productCode || '').trim().toUpperCase()
  const reference = String(orderReference || '').trim()
  return /^demo\b/i.test(name) || /^SO-DEMO-/i.test(reference) || (code === 'HJ' && /^test$/i.test(name))
}
