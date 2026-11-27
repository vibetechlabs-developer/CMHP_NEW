/**
 * Shared Slip Print Engine
 * Guarantees font loading, image decoding, exact 1-page A4 rendering,
 * zero extra blank pages, and native browser print dialog (Print / Save as PDF).
 */

/**
 * Prepares the page for printing:
 * - Waits for fonts to be ready
 * - Decodes any pending images
 * - Sets isolation class on body
 * - Triggers window.print()
 */
export async function triggerSlipPrint() {
  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready
    }
  } catch (e) {
    console.warn('Font loading check failed:', e)
  }

  try {
    const images = Array.from(document.querySelectorAll('.cmhp-printable-slip img, .cmhp-printable-sheet img'))
    await Promise.all(
      images.map((img) => {
        if (img.complete) return Promise.resolve()
        if (typeof img.decode === 'function') {
          return img.decode().catch(() => {})
        }
        return new Promise((resolve) => {
          img.onload = resolve
          img.onerror = resolve
        })
      })
    )
  } catch (e) {
    console.warn('Image decoding check failed:', e)
  }

  document.body.classList.add('cmhp-printing-slip')

  const cleanup = () => {
    document.body.classList.remove('cmhp-printing-slip')
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)

  // Small delay to let browser layout settle
  await new Promise((resolve) => setTimeout(resolve, 80))

  window.print()
}

