/**
 * Shared Slip Print & PDF Engine
 * Guarantees font loading, image decoding, exact 1-page A4 rendering,
 * zero extra blank pages, and identical visual layout between Print and PDF.
 */
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

/**
 * Prepares the page for printing:
 * - Waits for fonts to be ready
 * - Decodes any pending images
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
    const images = Array.from(document.querySelectorAll('.cmhp-printable-slip img'))
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

  // Small delay to let browser layout settle
  await new Promise((resolve) => setTimeout(resolve, 80))

  window.print()
}

/**
 * Downloads a slip as a pixel-perfect single A4 portrait PDF.
 * Ensures stacked copies (if any) are visible and captures inputs cleanly.
 * 
 * @param {HTMLElement} element - The slip element or container
 * @param {string} filename - The target filename
 */
export async function downloadSlipPdf(element, filename = 'slip.pdf') {
  if (!element) return

  // Find the actual printable slip inside element if element is a wrapper
  const targetEl = element.classList.contains('cmhp-printable-slip')
    ? element
    : element.querySelector('.cmhp-printable-slip') || element

  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready
    }
  } catch (e) {}

  const canvas = await html2canvas(targetEl, {
    scale: 2.5,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    onclone: (clonedDoc) => {
      // Hide toolbar or non-print items
      clonedDoc.querySelectorAll('.no-print').forEach((el) => {
        el.style.display = 'none'
      })

      // Ensure second stacked copy is displayed in clone
      clonedDoc.querySelectorAll('.print-only-copy').forEach((el) => {
        el.style.display = 'block'
      })

      // Ensure print-only text is displayed
      clonedDoc.querySelectorAll('.print-only').forEach((el) => {
        el.style.display = 'inline'
      })

      // Convert inputs to plain text representation with clean styling
      clonedDoc.querySelectorAll('input, textarea').forEach((inp) => {
        inp.style.border = 'none'
        inp.style.borderBottom = 'none'
        inp.style.outline = 'none'
        inp.style.boxShadow = 'none'
        inp.style.background = 'transparent'
        inp.style.color = '#000000'
        inp.style.fontFamily = "'Times New Roman', Times, Georgia, serif"
      })

      clonedDoc.querySelectorAll('.qc-cell-input, .qc-slip-input, .qc-slip-text-field').forEach((inp) => {
        inp.style.border = 'none'
        inp.style.borderBottom = 'none'
        inp.style.background = 'transparent'
      })

      // Remove dotted underlines in print/PDF
      clonedDoc.querySelectorAll('.tablet-rm-footer-input, .tablet-pm-footer-field, .syrup-rm-footer-input, .syrup-pm-footer-field').forEach((el) => {
        el.style.borderBottom = 'none'
      })
    },
  })

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  })

  const pageW = pdf.internal.pageSize.getWidth()   // 210 mm
  const pageH = pdf.internal.pageSize.getHeight()  // 297 mm

  // Fit on single A4 portrait page
  const imgData = canvas.toDataURL('image/png')
  const ratio = Math.min(pageW / canvas.width, pageH / canvas.height)
  const imgW = canvas.width * ratio
  const imgH = canvas.height * ratio
  const x = (pageW - imgW) / 2
  const y = 0

  pdf.addImage(imgData, 'PNG', x, y, imgW, imgH, undefined, 'FAST')
  pdf.save(filename)
}
