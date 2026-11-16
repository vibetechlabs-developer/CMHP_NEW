/**
 * Shared Pharmaceutical Document Print Utility
 * Provides robust, isolated printing for all QC/QA documents (Requisition Slips,
 * Inspection Reports, QA Release Certificates, Batch Traceability Reports).
 *
 * Uses an isolated hidden iframe to guarantee:
 *  - No interference from modals, scrollbars, sidebars, or backdrop filters.
 *  - Full preservation of borders, backgrounds, approval stamps, and fonts.
 *  - Proper A4 pagination with no horizontal or vertical clipping.
 *  - Seamless execution across all modern Chromium & WebKit browsers.
 */

import { isTejBiocare } from './companyBranding.js'

export function printElement(elementOrId, options = {}) {
  const isTej = isTejBiocare()
  const {
    title = isTej ? 'Tej Biocare ERP - Document' : 'CMHP Pharma ERP - Document',
    pageOrientation = 'portrait',
    margin = '10mm 8mm',
  } = options

  let targetEl = null
  if (typeof elementOrId === 'string') {
    targetEl = document.getElementById(elementOrId)
  } else if (elementOrId instanceof HTMLElement) {
    targetEl = elementOrId
  }

  if (!targetEl) {
    console.warn(`[printElement] Target element "${elementOrId}" not found. Falling back to window.print().`)
    window.print()
    return
  }

  // Gather all style elements and rules from the current page
  let stylesHtml = ''
  try {
    const styleElements = document.querySelectorAll('style, link[rel="stylesheet"]')
    styleElements.forEach((el) => {
      if (el.tagName.toLowerCase() === 'style') {
        stylesHtml += `<style>${el.innerHTML}</style>\n`
      } else if (el.tagName.toLowerCase() === 'link') {
        stylesHtml += el.outerHTML + '\n'
      }
    })
  } catch (err) {
    console.warn('[printElement] Could not gather stylesheets:', err)
  }

  // Create isolated iframe
  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', 'Print Preview Frame')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.style.visibility = 'hidden'
  iframe.style.pointerEvents = 'none'
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) {
    document.body.removeChild(iframe)
    window.print()
    return
  }

  doc.open()
  doc.write(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>${title}</title>
      ${stylesHtml}
      <style>
        @page {
          size: A4 ${pageOrientation};
          margin: ${margin};
        }
        *, *::before, *::after {
          box-sizing: border-box !important;
        }
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          color: #111827 !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
          overflow: visible !important;
          height: auto !important;
          width: 100% !important;
        }
        .bmr-document-container {
          position: static !important;
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          box-shadow: none !important;
        }
        .bmr-document-sheet {
          box-shadow: none !important;
          border: 2px solid #000000 !important;
          background: #ffffff !important;
          page-break-inside: avoid;
        }
        .bmr-table-wrap {
          overflow: visible !important;
          width: 100% !important;
        }
        .bmr-requisition-table {
          width: 100% !important;
          table-layout: auto !important;
        }
        tr {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
        .bmr-signoff-box {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
        .bmr-notes-box, .bmr-approval-endorsement, .bmr-decline-endorsement {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
        .official-stamp-badge {
          display: block !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .stamp-circle {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .no-print, button, .inv-modal-footer, .inv-modal-header {
          display: none !important;
        }
      </style>
    </head>
    <body>
      ${targetEl.outerHTML}
    </body>
    </html>
  `)
  doc.close()

  // Allow fonts, images, and stylesheets to finalize rendering
  setTimeout(() => {
    try {
      iframe.contentWindow.focus()
      iframe.contentWindow.print()
    } catch (err) {
      console.error('[printElement] Execution error:', err)
      window.print()
    } finally {
      setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe)
        }
      }, 1500)
    }
  }, 300)
}
