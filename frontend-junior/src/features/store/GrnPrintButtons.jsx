import { useState } from 'react'
import Button from '../../components/Button'
import { getErrorMessage } from '../../utils/errors'
import { getGoodsReceipt } from './receivingService'
import {
  GRN_KIND_PACKING,
  GRN_KIND_RAW,
  downloadGoodsReceiptNotePdf,
  printGoodsReceiptNote,
  receiptGrnKinds,
} from './grnNotePrint'

/**
 * Print / Download Warehouse GRN for a goods receipt.
 * Pass `receipt` when the full payload (with lines) is already loaded.
 * Or pass `storeId` + `receiptId` to fetch before printing (Materials inward rows).
 * Optional `preferKind` forces one copy when the material page already knows RM vs PM.
 */
export default function GrnPrintButtons({
  receipt = null,
  storeId = null,
  receiptId = null,
  preferKind = null,
  size = 'sm',
  className = '',
}) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const resolveReceipt = async () => {
    if (receipt && Array.isArray(receipt.lines)) return receipt
    if (!storeId || !receiptId) {
      throw new Error('Receipt details are not available to print.')
    }
    return getGoodsReceipt(storeId, receiptId)
  }

  const runAction = async (kind, mode) => {
    const key = `${mode}-${kind}`
    setBusy(key)
    setError('')
    try {
      const full = await resolveReceipt()
      if (mode === 'download') {
        await downloadGoodsReceiptNotePdf(full, kind)
      } else {
        printGoodsReceiptNote(full, kind)
      }
    } catch (err) {
      setError(getErrorMessage(err) || (mode === 'download' ? 'Could not download GRN.' : 'Could not print GRN.'))
    } finally {
      setBusy('')
    }
  }

  const kinds = receipt
    ? receiptGrnKinds(receipt)
    : {
        hasRaw: !preferKind || preferKind === GRN_KIND_RAW,
        hasPacking: !preferKind || preferKind === GRN_KIND_PACKING,
      }

  const showRaw = preferKind ? preferKind === GRN_KIND_RAW : kinds.hasRaw
  const showPacking = preferKind ? preferKind === GRN_KIND_PACKING : kinds.hasPacking
  const disabled = Boolean(busy)

  return (
    <span className={className} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {showRaw && (
        <>
          <Button size={size} variant="secondary" disabled={disabled} onClick={() => runAction(GRN_KIND_RAW, 'print')}>
            {busy === `print-${GRN_KIND_RAW}` ? 'Printing…' : '🖨 Print RM GRN'}
          </Button>
          <Button size={size} variant="secondary" disabled={disabled} onClick={() => runAction(GRN_KIND_RAW, 'download')}>
            {busy === `download-${GRN_KIND_RAW}` ? 'Downloading…' : '⬇️ Download RM GRN'}
          </Button>
        </>
      )}
      {showPacking && (
        <>
          <Button size={size} variant="secondary" disabled={disabled} onClick={() => runAction(GRN_KIND_PACKING, 'print')}>
            {busy === `print-${GRN_KIND_PACKING}` ? 'Printing…' : '🖨 Print PM GRN'}
          </Button>
          <Button size={size} variant="secondary" disabled={disabled} onClick={() => runAction(GRN_KIND_PACKING, 'download')}>
            {busy === `download-${GRN_KIND_PACKING}` ? 'Downloading…' : '⬇️ Download PM GRN'}
          </Button>
        </>
      )}
      {error && <span style={{ color: '#b91c1c', fontSize: 11 }}>{error}</span>}
    </span>
  )
}
